// ==UserScript==
// @name         PressPass NG
// @namespace    https://github.com/reader5567/presspass-ng
// @version      0.2.2
// @description  Wikipedia {{cite news}} citations from Newspapers.com clippings, read from the page's structured data.
// @homepageURL  https://github.com/reader5567/presspass-ng
// @supportURL   https://github.com/reader5567/presspass-ng/issues
// @updateURL    https://raw.githubusercontent.com/reader5567/presspass-ng/main/presspass-ng.user.js
// @downloadURL  https://raw.githubusercontent.com/reader5567/presspass-ng/main/presspass-ng.user.js
// @license      GPL-3.0-or-later
// @match        https://*.newspapers.com/*
// @match        https://newspapers.com/*
// @match        https://www-newspapers-com.wikipedialibrary.idm.oclc.org/*
// @grant        GM.setClipboard
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @connect      newspapers.com
// @connect      wikipedialibrary.idm.oclc.org
// @run-at       document-idle
// ==/UserScript==

/*
 * Phase 1: clipping (/article/) pages. Phase 3: viewer (/image/, /newspage/) pages via the clipping API.
 * Data comes from the page's JSON-LD (NewsArticle block), with the BreadcrumbList
 * block as a fallback. No site CSS class names are used anywhere.
 */

const PPCore = (() => {
  'use strict';

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function decodeEntities(s) {
    return String(s ?? '')
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');
  }

  const clean = s => decodeEntities(s).replace(/\s+/g, ' ').trim();

  function normalizePage(p) {
    return clean(p).replace(/^page\s*/i, '').trim();
  }

  // Remove punctuation left dangling at the end ("Jr.," -> "Jr."), keep periods.
  function trimTitle(t) {
    return clean(t).replace(/[\s,;:]+$/, '');
  }

  function cleanUrl(u) {
    try {
      const url = new URL(u);
      if (url.hostname.endsWith('wikipedialibrary.idm.oclc.org')) url.hostname = 'www.newspapers.com';
      url.search = '';
      url.hash = '';
      if (!url.pathname.endsWith('/')) url.pathname += '/';
      return url.toString();
    } catch (e) {
      return '';
    }
  }

  function typeOf(j) {
    const t = j && j['@type'];
    return Array.isArray(t) ? t : [t];
  }

  // Flatten JSON-LD blocks (some sites use arrays or @graph).
  function flattenLd(blocks) {
    const out = [];
    for (const b of blocks) {
      if (Array.isArray(b)) out.push(...flattenLd(b));
      else if (b && Array.isArray(b['@graph'])) out.push(...flattenLd(b['@graph']));
      else if (b && typeof b === 'object') out.push(b);
    }
    return out;
  }

  /**
   * Shared final step for every data source: split "Headline / Author; Author",
   * normalise fields, and attach warnings (blocking problems) and notes (things to check).
   * Returns { title, newspaper, place, date, page, url, authors, warnings, notes }.
   */
  function finalize(raw) {
    const warnings = [];
    const notes = [];
    let title = trimTitle(raw.title);
    let authors = [];
    const slash = title.lastIndexOf(' / ');
    if (slash > 0) {
      authors = title.slice(slash + 3).split(/\s*;\s*/).map(clean).filter(Boolean);
      title = title.slice(0, slash).trim();
    }
    const newspaper = clean(raw.newspaper);
    const place = clean(raw.place);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') ? raw.date : '';
    const page = normalizePage(raw.page);
    const url = raw.url ? cleanUrl(raw.url) : '';

    if (!title) warnings.push('No title: this clipping is untitled. Type the printed headline.');
    if (!newspaper) warnings.push('No newspaper name found.');
    if (!date) warnings.push('No publication date found.');
    if (!page) warnings.push('No page number found.');
    if (!url) warnings.push('No clean URL found.');
    if (raw.isPublic === false) warnings.push('This clipping is private, so readers cannot open the link. Make it public on Newspapers.com first.');
    if (/^obituary for /i.test(title)) notes.push('Title is the site\'s automatic obituary label, not the printed headline.');
    if (/\b[A-Z]{4,}\b/.test(title) && title !== title.toUpperCase()) notes.push('Title contains an ALL-CAPS word; check capitalisation.');
    if (date && date < '1752-09-14') notes.push('Pre-1752 date: check Julian/Gregorian calendar before citing.');

    return { title, newspaper, place, date, page, url, authors, warnings, notes };
  }

  /** Build one citation record from parsed JSON-LD blocks (clipping /article/ pages). */
  function extractFromLd(blocks, canonical, href) {
    const lds = flattenLd(blocks);
    const art = lds.find(j => typeOf(j).some(t => /Article$/.test(t || ''))) || {};
    const crumbs = (lds.find(j => typeOf(j).includes('BreadcrumbList')) || {}).itemListElement || [];
    const crumb = i => clean((crumbs.find(c => c.position === i) || {}).name);

    let title = clean(art.about || art.headline || art.name || '');
    if (!title) {
      const last = crumb(crumbs.length - 1);
      if (last && !/^article clipped from/i.test(last)) title = last;
    }

    const newspaper = clean(art.publisher && (art.publisher.legalName || art.publisher.name)) || crumb(3);

    let place = clean(art.locationCreated);
    if (!place && crumb(2) && crumb(1)) place = `${crumb(2)}, ${crumb(1)}`;

    let date = /^\d{4}-\d{2}-\d{2}$/.test(art.datePublished || '') ? art.datePublished : '';
    if (!date) {
      const y = crumb(4), m = MONTHS.findIndex(n => n.slice(0, 3) === crumb(5).slice(0, 3)), d = crumb(6);
      if (/^\d{4}$/.test(y) && m >= 0 && /^\d{1,2}$/.test(d)) {
        date = `${y}-${String(m + 1).padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }

    const page = art.pageStart || crumb(7);
    return finalize({ title, newspaper, place, date, page, url: canonical || href });
  }

  const SITE = 'https://www.newspapers.com';

  /** One clipping from /api/clipping/page (viewer pages). */
  function fromClippingApi(c) {
    const pub = c.publication || {};
    return Object.assign(finalize({
      title: c.title || '',
      newspaper: pub.name,
      place: pub.location,
      date: c.page_date,
      page: c.page_title,
      url: c.url ? new URL(c.url, SITE).toString() : '',
      isPublic: c.is_public,
    }), { clippingId: c.clipping_id, created: c.created || '' });
  }

  /** The whole /api/clipping/page response -> records, newest clipping first. */
  function listFromClippingApi(json) {
    const list = ((json && json.clippings) || []).map(fromClippingApi);
    return list.sort((a, b) => (b.created > a.created ? 1 : b.created < a.created ? -1 : 0));
  }

  function weekday(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso < '1752-09-14') return '';
    const [y, m, d] = iso.split('-').map(Number);
    return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }

  function formatDate(iso, style) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    const [y, m, d] = iso.split('-').map(Number);
    if (style === 'dmy') return `${d} ${MONTHS[m - 1]} ${y}`;
    if (style === 'mdy') return `${MONTHS[m - 1]} ${d}, ${y}`;
    return iso;
  }

  function refName(rec, style) {
    if (style === 'none') return '';
    let paper = rec.newspaper.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/^the\s+/i, '');
    const iso = rec.date || '0000-00-00';
    const page = rec.page.replace(/[^A-Za-z0-9]/g, '');
    if (style === 'long') {
      paper = paper.replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    } else {
      paper = paper.replace(/[^A-Za-z0-9]/g, '');
    }
    if (/^\d/.test(paper)) paper = 'n' + paper;
    if (style === 'short') return paper.slice(0, 4) + iso.replace(/-/g, '').slice(2);
    if (style === 'long') return `${paper} ${iso}${page ? ' p' + page : ''}`;
    return `${paper.slice(0, 10)} ${iso}${page ? ' p' + page : ''}`; // medium (default)
  }

  // Values inside a template: pipes would split the parameter.
  const esc = v => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/\|/g, '{{!}}');

  const DEFAULTS = {
    dateFormat: 'iso',    // iso | dmy | mdy
    refName: 'medium',    // short | medium | long | none
    via: true,
    accessDate: true,
    weekday: true,
    multiline: false,
  };

  /** rec: a record from extractFromLd (fields may be edited by the user). today: 'YYYY-MM-DD'. */
  // 'en-CA' formats as YYYY-MM-DD in the user's local time zone (toISOString would use UTC).
  function formatCiteNews(rec, options = {}, today = new Date().toLocaleDateString('en-CA')) {
    const o = Object.assign({}, DEFAULTS, options);
    const params = [
      ['url', rec.url],
      ['title', rec.title],
      ['newspaper', rec.newspaper],
      ['location', rec.place],
      ['date', formatDate(rec.date, o.dateFormat)],
      ['page', rec.page],
    ];
    if (rec.authors && rec.authors.length === 1) params.push(['author', rec.authors[0]]);
    else if (rec.authors) rec.authors.forEach((a, i) => params.push([`author${i + 1}`, a]));
    if (o.via) params.push(['via', 'Newspapers.com']);
    if (o.accessDate) params.push(['access-date', formatDate(today, o.dateFormat)]);

    const kept = params.filter(([k, v]) => v || k === 'title');
    const sep = o.multiline ? '\n' : '';
    const body = kept.map(([k, v]) => `${sep}|${k}=${esc(v)}`).join('');
    const name = refName(rec, o.refName);
    const open = name ? `<ref name="${name.replace(/"/g, '')}">` : '<ref>';
    const wd = o.weekday ? weekday(rec.date) : '';
    return `${open}{{Cite news${body}${sep}}}</ref>${wd ? `<!-- ${wd} -->` : ''}`;
  }

  function parseLdFromDocument(doc) {
    return [...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => {
      try { return JSON.parse(s.textContent); } catch (e) { return null; }
    }).filter(Boolean);
  }

  return {
    decodeEntities, normalizePage, trimTitle, cleanUrl, extractFromLd, fromClippingApi, listFromClippingApi,
    weekday, formatDate, refName, formatCiteNews, parseLdFromDocument, DEFAULTS,
  };
})();

// In Tampermonkey GM_info always exists; in Node it doesn't, so export the core for tests.
if (typeof GM_info === 'undefined' && typeof module !== 'undefined' && module.exports) {
  module.exports = PPCore;
} else {
  (function ui() {
    'use strict';
    const ARTICLE_PATH = /^\/article\//;
    const VIEWER_PATH = /^\/(?:image|newspage)\/(\d+)/;
    const SETTINGS_KEY = 'ppng-settings';
    const TAG = '[PressPass NG]';
    let settings = Object.assign({}, PPCore.DEFAULTS);
    let host = null;
    let lastHref = '';
    let loadToken = 0;
    let lastRoute = '';

    async function loadSettings() {
      try {
        const raw = await GM.getValue(SETTINGS_KEY, '{}');
        settings = Object.assign({}, PPCore.DEFAULTS, JSON.parse(raw));
      } catch (e) { console.warn(TAG, 'settings load failed', e); }
    }
    function saveSettings() {
      try { GM.setValue(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
    }

    // Same-origin GET. Tries fetch first; Firefox's userscript sandbox can make that fail,
    // so falls back to GM.xmlHttpRequest. Logs which route worked (PPNG-R1 / PPNG-R2).
    async function getText(url) {
      const abs = new URL(url, location.origin).toString();
      try {
        const r = await fetch(abs, { credentials: 'include' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const t = await r.text();
        lastRoute = 'fetch';
        console.info(TAG, 'PPNG-R1 fetch OK', abs);
        return t;
      } catch (e) {
        console.warn(TAG, 'fetch failed, trying GM.xmlHttpRequest:', e && e.message);
      }
      return new Promise((resolve, reject) => {
        GM.xmlHttpRequest({
          method: 'GET', url: abs, anonymous: false, timeout: 15000,
          onload: r => {
            if (r.status >= 200 && r.status < 300) {
              lastRoute = 'GM.xmlHttpRequest';
              console.info(TAG, 'PPNG-R2 GM.xmlHttpRequest OK', abs);
              resolve(r.responseText);
            } else reject(new Error('HTTP ' + r.status));
          },
          onerror: () => reject(new Error('network error')),
          ontimeout: () => reject(new Error('timeout')),
        });
      });
    }

    // ---------- data loading ----------

    // Clipping page. On first load the document is current; after in-app navigation the
    // head may be stale, so fetch the page fresh and read its JSON-LD.
    async function readArticle(isFirstLoad) {
      const href = location.href;
      if (!isFirstLoad) {
        try {
          const doc = new DOMParser().parseFromString(await getText(href), 'text/html');
          const canonical = doc.querySelector('link[rel="canonical"]')?.href;
          const lds = PPCore.parseLdFromDocument(doc);
          if (lds.length) return PPCore.extractFromLd(lds, canonical, href);
        } catch (e) {
          console.warn(TAG, 'fresh read failed, using live page', e);
        }
      }
      for (let i = 0; i < 20; i++) {
        const lds = PPCore.parseLdFromDocument(document);
        if (lds.length) {
          const canonical = document.querySelector('link[rel="canonical"]')?.href;
          const rec = PPCore.extractFromLd(lds, canonical, href);
          if (canonical && new URL(canonical).pathname !== location.pathname) {
            rec.warnings.push('Page data may be from the previous clipping. Reload the page to be sure.');
          }
          return rec;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      const rec = PPCore.extractFromLd([], null, href);
      rec.warnings.unshift('No structured data found on this page (JSON-LD missing). The site may have changed.');
      console.warn(TAG, 'PPNG-E1: no JSON-LD on', href);
      return rec;
    }

    // Viewer page: every clipping on this newspaper page, from the clipping API (paged).
    async function readViewer(pageId) {
      const all = [];
      let start = 0;
      for (let guard = 0; guard < 8; guard++) {
        const json = JSON.parse(await getText(`/api/clipping/page?page_id=${pageId}&start=${start}&count=25`));
        all.push(...(json.clippings || []));
        if (!json.more_clippings || !(json.clippings || []).length) break;
        start += json.clippings.length;
      }
      return PPCore.listFromClippingApi({ clippings: all });
    }

    // ---------- UI ----------

    const CSS = `
      :host { all: initial; }
      .btn { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; font: 600 13px system-ui, sans-serif;
        background: #1f4e79; color: #fff; border: 0; border-radius: 6px; padding: 8px 12px; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
      .btn.flag { background: #8a5a00; }
      .panel { position: fixed; right: 16px; bottom: 56px; z-index: 2147483647; width: 460px; max-width: calc(100vw - 32px);
        max-height: calc(100vh - 80px); overflow: auto;
        background: #fff; color: #111; border: 1px solid #999; border-radius: 8px; padding: 12px; font: 13px system-ui, sans-serif;
        box-shadow: 0 4px 16px rgba(0,0,0,.25); }
      .panel[hidden], .editor[hidden], .list[hidden] { display: none; }
      .head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 4px; }
      .head button { font: 12px system-ui, sans-serif; padding: 2px 8px; border: 1px solid #888; border-radius: 4px; background: #f4f4f4; cursor: pointer; }
      .list { border: 1px solid #ddd; border-radius: 6px; max-height: 180px; overflow: auto; margin-bottom: 8px; }
      .item { display: block; width: 100%; text-align: left; border: 0; border-bottom: 1px solid #eee; background: #fff;
        padding: 6px 8px; font: 12px system-ui, sans-serif; cursor: pointer; color: #111; }
      .item:last-child { border-bottom: 0; }
      .item:hover { background: #eef4fa; }
      .item.sel { background: #dbe8f5; font-weight: 600; }
      .item small { color: #666; font-weight: 400; }
      label { display: block; margin: 6px 0 2px; font-weight: 600; }
      input[type=text], textarea, select { width: 100%; box-sizing: border-box; font: 12px ui-monospace, monospace; padding: 4px; border: 1px solid #aaa; border-radius: 4px; }
      textarea { height: 110px; resize: vertical; }
      .row { display: flex; gap: 8px; align-items: end; margin-top: 6px; }
      .row > div { flex: 1; }
      .warn { color: #8a1c1c; margin: 4px 0; }
      .note { color: #6b4e00; margin: 4px 0; }
      .empty { color: #555; margin: 4px 0; }
      .actions { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
      .actions button { font: 600 12px system-ui, sans-serif; padding: 6px 10px; border-radius: 4px; border: 1px solid #1f4e79; background: #1f4e79; color: #fff; cursor: pointer; }
      .status { color: #555; }
      .route { color: #888; font-size: 11px; margin-top: 6px; }
      .checks { display: flex; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
      .checks label { display: inline; font-weight: 400; margin: 0; }
    `;

    function mount() {
      if (host) return host;
      host = document.createElement('div');
      host.id = 'presspass-ng-host';
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style>
        <button class="btn">Cite</button>
        <div class="panel" hidden>
          <div class="head"><span class="heading">PressPass NG</span><button class="refresh" hidden>Refresh list</button></div>
          <div class="list" hidden></div>
          <div class="pagemsgs"></div>
          <div class="editor" hidden>
            <div class="msgs"></div>
            <label for="t">Title</label><input type="text" id="t">
            <label for="n">Newspaper (check the masthead for the name at the time)</label><input type="text" id="n">
            <label for="out">Citation</label><textarea id="out" readonly></textarea>
            <div class="row">
              <div><label for="df">Date format</label>
                <select id="df"><option value="iso">1966-11-09</option><option value="dmy">9 November 1966</option><option value="mdy">November 9, 1966</option></select></div>
              <div><label for="rn">Ref name</label>
                <select id="rn"><option value="short">Hawa661109</option><option value="medium">HawaiiTrib 1966-11-09 p1</option><option value="long">Hawaii Tribune Herald 1966-11-09 p1</option><option value="none">(none)</option></select></div>
            </div>
            <div class="checks">
              <label><input type="checkbox" id="via"> via</label>
              <label><input type="checkbox" id="acc"> access-date</label>
              <label><input type="checkbox" id="wd"> weekday comment</label>
              <label><input type="checkbox" id="ml"> multi-line</label>
            </div>
            <div class="actions"><button id="copy">Copy</button><span class="status"></span></div>
          </div>
          <div class="route"></div>
        </div>`;
      document.body.appendChild(host);
      const $ = s => root.querySelector(s);
      $('.btn').addEventListener('click', () => { $('.panel').hidden = !$('.panel').hidden; });
      $('.refresh').addEventListener('click', () => onLocation(false));
      return host;
    }

    function unmount() {
      if (host) { host.remove(); host = null; }
    }

    const q = s => mount().shadowRoot.querySelector(s);

    function showRoute() {
      q('.route').textContent = lastRoute ? `Data loaded via ${lastRoute}.` : '';
    }

    // The panel only ever opens when the user clicks Cite. Problems are flagged on the button instead.
    function setFlag(on) {
      const b = q('.btn');
      b.textContent = on ? 'Cite ⚠' : 'Cite';
      b.title = on ? 'PressPass NG: this citation needs a check (click to see why)' : 'PressPass NG';
      b.classList.toggle('flag', on);
    }

    function message(container, cls, text) {
      const p = document.createElement('div');
      p.className = cls;
      p.textContent = text;
      container.appendChild(p);
    }

    // The citation editor for one record.
    function renderEditor(rec) {
      const state = Object.assign({}, rec);
      q('.editor').hidden = false;
      const msgs = q('.msgs');
      msgs.innerHTML = '';
      for (const w of rec.warnings) message(msgs, 'warn', '⚠ ' + w);
      for (const n of rec.notes) message(msgs, 'note', 'ℹ ' + n);

      q('#t').value = state.title;
      q('#n').value = state.newspaper;
      q('#df').value = settings.dateFormat;
      q('#rn').value = settings.refName;
      q('#via').checked = settings.via;
      q('#acc').checked = settings.accessDate;
      q('#wd').checked = settings.weekday;
      q('#ml').checked = settings.multiline;

      const update = () => {
        state.title = q('#t').value;
        state.newspaper = q('#n').value;
        q('#out').value = PPCore.formatCiteNews(state, settings);
      };
      const onSetting = () => {
        settings.dateFormat = q('#df').value;
        settings.refName = q('#rn').value;
        settings.via = q('#via').checked;
        settings.accessDate = q('#acc').checked;
        settings.weekday = q('#wd').checked;
        settings.multiline = q('#ml').checked;
        saveSettings();
        update();
      };
      q('#t').oninput = update;
      q('#n').oninput = update;
      for (const id of ['#df', '#rn', '#via', '#acc', '#wd', '#ml']) q(id).onchange = onSetting;
      q('#copy').onclick = async () => {
        const text = q('#out').value;
        try {
          if (typeof GM !== 'undefined' && GM.setClipboard) await GM.setClipboard(text, 'text');
          else await navigator.clipboard.writeText(text);
          q('.status').textContent = 'Copied.';
        } catch (e) {
          q('#out').select();
          q('.status').textContent = 'Copy failed: press Ctrl+C.';
        }
        setTimeout(() => { if (host) q('.status').textContent = ''; }, 2000);
      };
      setFlag(rec.warnings.length > 0);
      update();
    }

    function renderArticle(rec) {
      q('.heading').textContent = 'PressPass NG · clipping';
      q('.list').hidden = true;
      q('.refresh').hidden = true;
      q('.pagemsgs').innerHTML = '';
      renderEditor(rec);
      showRoute();
    }

    // Viewer page: a list of the page's clippings; picking one opens the editor.
    function renderViewer(list, preferId) {
      q('.heading').textContent = `PressPass NG · ${list.length} clipping${list.length === 1 ? '' : 's'} on this page`;
      q('.refresh').hidden = false;
      const box = q('.list');
      const pm = q('.pagemsgs');
      box.innerHTML = '';
      pm.innerHTML = '';
      if (!list.length) {
        box.hidden = true;
        q('.editor').hidden = true;
        setFlag(false);
        message(pm, 'empty', 'No clippings on this page yet. Make a clipping, then click "Refresh list" if it does not appear.');
        showRoute();
        return;
      }
      box.hidden = false;
      const items = list.map((rec, i) => {
        const b = document.createElement('button');
        b.className = 'item';
        b.textContent = rec.title || '(untitled)';
        const small = document.createElement('small');
        small.textContent = `  ·  p. ${rec.page || '?'}${rec.warnings.length ? '  ·  ⚠' : ''}`;
        b.appendChild(small);
        b.onclick = () => select(i);
        box.appendChild(b);
        return b;
      });
      function select(i) {
        items.forEach((b, j) => b.classList.toggle('sel', j === i));
        renderEditor(list[i]);
      }
      // Preselect the clipping named in the address, else the newest one.
      const idx = Math.max(0, list.findIndex(r => String(r.clippingId) === String(preferId)));
      select(idx);
      showRoute();
    }

    async function onLocation(isFirstLoad) {
      const token = ++loadToken;
      const path = location.pathname;
      try {
        if (ARTICLE_PATH.test(path)) {
          const rec = await readArticle(isFirstLoad);
          if (token !== loadToken) return;
          renderArticle(rec);
          return;
        }
        const m = path.match(VIEWER_PATH);
        if (m) {
          const preferId = new URL(location.href).searchParams.get('clipping_id');
          const list = await readViewer(m[1]);
          if (token !== loadToken) return;
          renderViewer(list, preferId);
          return;
        }
        unmount();
      } catch (e) {
        if (token !== loadToken) return;
        console.warn(TAG, 'PPNG-E2: load failed', e);
        q('.editor').hidden = true;
        q('.list').hidden = true;
        const pm = q('.pagemsgs');
        pm.innerHTML = '';
        message(pm, 'warn', '⚠ Could not load clipping data: ' + (e && e.message ? e.message : e) + '. Try "Refresh list" or reload the page.');
        q('.refresh').hidden = !VIEWER_PATH.test(path);
        setFlag(true);
      }
    }

    (async () => {
      await loadSettings();
      lastHref = location.href;
      onLocation(true);
      setInterval(() => {
        if (location.href !== lastHref) {
          lastHref = location.href;
          onLocation(false);
        }
      }, 1000);
    })();
  })();
}
