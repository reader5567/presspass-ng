const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', '..', 'presspass-ng.user.js'), 'utf8');
const F = require('../fixtures.js');
function run(fx, label) {
  const html = `<!doctype html><html><head><link rel="canonical" href="${fx.canonical}">${fx.ld.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('')}</head><body><p>page</p></body></html>`;
  const dom = new JSDOM(html, { url: fx.canonical + '?foo=1', runScripts: 'outside-only' });
  const w = dom.window;
  const store = {}; let clip = null;
  w.GM_info = { script: {} };
  w.GM = { getValue: async (k, d) => store[k] ?? d, setValue: async (k, v) => { store[k] = v; }, setClipboard: async t => { clip = t; } };
  w.eval(src);
  return new Promise(res => setTimeout(async () => {
    const host = w.document.getElementById('presspass-ng-host');
    const root = host.shadowRoot;
    const out = root.querySelector('#out').value;
    const msgs = [...root.querySelectorAll('.msgs div')].map(d => d.textContent);
    // simulate typing a title and changing date format
    const t = root.querySelector('#t'); t.value = 'Typed Headline'; t.dispatchEvent(new w.Event('input'));
    const df = root.querySelector('#df'); df.value = 'mdy'; df.dispatchEvent(new w.Event('change'));
    await root.querySelector('#copy').onclick();
    console.log(`--- ${label}\nfirst:  ${out}\nmsgs:   ${JSON.stringify(msgs)}\npanelOpen: ${!root.querySelector('.panel').hidden}\nbutton: ${root.querySelector('.btn').textContent}\nedited: ${root.querySelector('#out').value}\nclip==edited: ${clip === root.querySelector('#out').value}\nstored: ${store['ppng-settings']}`);
    w.close(); res();
  }, 300));
}
(async () => { await run(F.titled, 'titled'); await run(F.untitled, 'untitled'); })();
