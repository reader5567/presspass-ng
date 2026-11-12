const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', '..', 'presspass-ng.user.js'), 'utf8');
const F = require('../fixtures.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const articleHtml = fx => `<!doctype html><html><head><link rel="canonical" href="${fx.canonical}">${fx.ld.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('')}</head><body></body></html>`;

function setup(url, { fetchFails = false, apiJson = F.clippingApi } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="viewer"></div></body></html>', { url, runScripts: 'outside-only' });
  const w = dom.window, log = [];
  const respond = u => u.includes('/api/clipping/page') ? JSON.stringify(apiJson)
    : u.includes('/article/') ? articleHtml(F.titled) : '';
  w.GM_info = { script: {} };
  w.GM = { getValue: async (k, d) => d, setValue: async () => {}, setClipboard: async () => {},
    xmlHttpRequest: o => { log.push('gm ' + o.url); setTimeout(() => o.onload({ status: 200, responseText: respond(o.url) }), 5); } };
  w.fetch = async u => { log.push('fetch ' + u); if (fetchFails) throw new TypeError('NetworkError when attempting to fetch resource.');
    return { ok: true, status: 200, text: async () => respond(String(u)) }; };
  w.console = { ...console, info: () => {}, warn: () => {} };
  w.eval(src);
  return { w, log, root: () => w.document.getElementById('presspass-ng-host')?.shadowRoot };
}
const view = r => ({
  heading: r.querySelector('.heading').textContent,
  items: [...r.querySelectorAll('.item')].map(b => b.textContent + (b.classList.contains('sel') ? ' [selected]' : '')),
  panelOpen: !r.querySelector('.panel').hidden,
  out: r.querySelector('#out').value,
  msgs: [...r.querySelectorAll('.msgs div, .pagemsgs div')].map(d => d.textContent),
  route: r.querySelector('.route').textContent,
  button: r.querySelector('.btn').textContent,
});

(async () => {
  let s = setup('https://www.newspapers.com/image/259227729/?clipping_id=210184878&fcfToken=xyz');
  await sleep(200); console.log('1 viewer with clipping_id (fetch works):', JSON.stringify(view(s.root()), null, 1), s.log);

  s = setup('https://www.newspapers.com/image/259227729/?clipping_id=210184878', { fetchFails: true });
  await sleep(200); const v2 = view(s.root()); console.log('\n2 fetch fails -> GM fallback:', v2.route, '| items', v2.items.length, '|', s.log);

  const base = F.clippingApi.clippings[0];
  s = setup('https://www.newspapers.com/image/259227729/', { apiJson: { clippings: [
    { ...base, clipping_id: 1, title: 'Older one', created: '2026-11-01T00:00:00.000Z' },
    { ...base, clipping_id: 2, title: null, created: '2026-11-12T23:00:00.000Z' }], more_clippings: false } });
  await sleep(200); const v3 = view(s.root()); console.log('\n3 viewer without clipping_id:', JSON.stringify({ items: v3.items, panelOpen: v3.panelOpen, msgs: v3.msgs }));
  // click the older clipping
  s.root().querySelectorAll('.item')[1].click(); console.log('  after click:', view(s.root()).out.slice(0, 80));

  s = setup('https://www.newspapers.com/image/111/', { apiJson: { clippings: [], more_clippings: false } });
  await sleep(200); console.log('\n4 empty page:', JSON.stringify(view(s.root()).msgs));

  // In-app navigation from viewer to a clipping page
  s = setup('https://www.newspapers.com/image/259227729/?clipping_id=210184878');
  await sleep(200);
  s.w.history.pushState({}, '', '/article/hawaii-tribune-herald-incumbents-fall-in/210186122/');
  await sleep(1400); const v5 = view(s.root()); console.log('\n5 SPA nav to clipping:', v5.heading, '|', v5.out.slice(0, 60), '|', v5.route);
  s.w.history.pushState({}, '', '/search/results/?keyword=x');
  await sleep(1200); console.log('6 SPA nav away: host removed =', !s.w.document.getElementById('presspass-ng-host'));
  process.exit(0);
})();
