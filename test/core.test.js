const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const C = require(path.join(__dirname, '..', 'presspass-ng.user.js'));
const F = require('./fixtures.js');

const TODAY = '2026-11-12';
const rec = f => C.extractFromLd(f.ld, f.canonical, f.href || f.canonical);

test('titled clipping: full record and default citation', () => {
  const r = rec(F.titled);
  assert.deepEqual(
    { title: r.title, newspaper: r.newspaper, place: r.place, date: r.date, page: r.page, url: r.url },
    { title: 'Incumbents Fall In Board Race', newspaper: 'Hawaii Tribune-Herald', place: 'Hilo, Hawaii',
      date: '1966-11-09', page: '1', url: 'https://www.newspapers.com/article/hawaii-tribune-herald-incumbents-fall-in/210186122/' });
  assert.deepEqual(r.warnings, []);
  assert.equal(C.formatCiteNews(r, {}, TODAY),
    '<ref name="HawaiiTrib 1966-11-09 p1">{{Cite news|url=https://www.newspapers.com/article/hawaii-tribune-herald-incumbents-fall-in/210186122/|title=Incumbents Fall In Board Race|newspaper=Hawaii Tribune-Herald|location=Hilo, Hawaii|date=1966-11-09|page=1|via=Newspapers.com|access-date=2026-11-12}}</ref><!-- Wed -->');
});

test('titled clipping: PressPass-style short ref name and dmy dates', () => {
  const out = C.formatCiteNews(rec(F.titled), { refName: 'short', dateFormat: 'dmy' }, TODAY);
  assert.match(out, /^<ref name="Hawa661109">/);
  assert.match(out, /\|date=9 November 1966\|/);
  assert.match(out, /\|access-date=12 November 2026\}\}/);
});

test('untitled clipping: no placeholder title, warning raised, alphanumeric page', () => {
  const r = rec(F.untitled);
  assert.equal(r.title, '');
  assert.equal(r.page, 'A9');
  assert.ok(r.warnings.some(w => /untitled/i.test(w)));
  const out = C.formatCiteNews(r, {}, TODAY);
  assert.match(out, /\|title=\|newspaper=West Hawaii Today\|/);
  assert.match(out, /<ref name="WestHawaii 2012-05-13 pA9">/);
  assert.match(out, /<!-- Sun -->$/);
});

test('obituary: "Page 24" normalised, trailing comma trimmed, notes raised', () => {
  const r = rec(F.obituary);
  assert.equal(r.page, '24');
  assert.equal(r.title, 'Obituary for William C. LONG Jr.');
  assert.ok(r.notes.some(n => /obituary label/.test(n)));
  assert.ok(r.notes.some(n => /ALL-CAPS/.test(n)));
  assert.match(C.formatCiteNews(r, {}, TODAY), /^<ref name="Pittsburgh 1973-11-12 p24">.*<!-- Mon -->$/);
});

test('image-page clipping: canonical wins over a token-laden address', () => {
  const r = rec(F.imagePageArticle);
  assert.equal(r.url, 'https://www.newspapers.com/article/honolulu-star-advertiser-chong-will-seek/210184878/');
  assert.doesNotMatch(C.formatCiteNews(r, {}, TODAY), /fcfToken/);
});

test('without canonical, the address is cleaned of query strings', () => {
  const r = C.extractFromLd(F.imagePageArticle.ld, null, F.imagePageArticle.href);
  assert.equal(r.url, 'https://www.newspapers.com/image/259227729/');
});

test('breadcrumb fallback fills every field when the article block is missing', () => {
  const r = C.extractFromLd([F.titled.ld[1]], F.titled.canonical);
  assert.deepEqual(
    { title: r.title, newspaper: r.newspaper, place: r.place, date: r.date, page: r.page },
    { title: 'Incumbents Fall In Board Race', newspaper: 'Hawaii Tribune-Herald', place: 'Hilo, Hawaii', date: '1966-11-09', page: '1' });
  const u = C.extractFromLd([F.untitled.ld[1]], F.untitled.canonical);
  assert.equal(u.title, '', 'breadcrumb placeholder must not become a title');
});

test('no JSON-LD at all: warnings, no exception', () => {
  const r = C.extractFromLd([], null, 'https://www.newspapers.com/article/x/1/');
  assert.ok(r.warnings.length >= 3);
  assert.doesNotThrow(() => C.formatCiteNews(r, {}, TODAY));
});

test('pipes escaped, entities decoded, authors from "Headline / Author"', () => {
  const ld = [{ '@type': 'NewsArticle', about: 'Bock &amp; Glover | Robbed / Jane Doe; John Roe',
    publisher: { legalName: 'The Sunday Leader' }, datePublished: '1887-07-17', pageStart: '5', locationCreated: 'Wilkes-Barre, Pennsylvania' }];
  const r = C.extractFromLd(ld, 'https://www.newspapers.com/article/the-sunday-leader/18535448/');
  assert.equal(r.title, 'Bock & Glover | Robbed');
  assert.deepEqual(r.authors, ['Jane Doe', 'John Roe']);
  const out = C.formatCiteNews(r, {}, TODAY);
  assert.match(out, /\|title=Bock & Glover \{\{!\}\} Robbed\|/);
  assert.match(out, /\|author1=Jane Doe\|author2=John Roe\|/);
  assert.match(out, /<ref name="SundayLead 1887-07-17 p5">/);
});

test('ref names: only a leading "The" is dropped; leading digits prefixed', () => {
  const base = { date: '1950-01-02', page: '3' };
  assert.equal(C.refName({ ...base, newspaper: 'Theodore Times' }, 'short'), 'Theo500102');
  assert.equal(C.refName({ ...base, newspaper: '7 Days' }, 'medium'), 'n7Days 1950-01-02 p3');
  assert.equal(C.refName({ ...base, newspaper: 'The Pittsburgh Press' }, 'long'), 'Pittsburgh Press 1950-01-02 p3');
});

test('pre-1752 dates get no computed weekday', () => {
  assert.equal(C.weekday('1740-03-01'), '');
  assert.equal(C.weekday('1966-11-09'), 'Wed');
});

test('Wikipedia Library proxy host is rewritten', () => {
  assert.equal(C.cleanUrl('https://www-newspapers-com.wikipedialibrary.idm.oclc.org/article/x/123?foo=1'),
    'https://www.newspapers.com/article/x/123/');
});

test('multi-line layout', () => {
  const out = C.formatCiteNews(rec(F.titled), { multiline: true, weekday: false }, TODAY);
  assert.equal(out.split('\n').length, 10);
  assert.match(out, /\n\}\}<\/ref>$/);
});

// ---------- Phase 3: clipping API (viewer pages) ----------

test('clipping API record matches the JSON-LD record for the same clipping', () => {
  const api = C.fromClippingApi(F.clippingApi.clippings[0]);
  const ld = rec(F.imagePageArticle);
  for (const k of ['title', 'newspaper', 'place', 'date', 'page', 'url']) assert.equal(api[k], ld[k], k);
  assert.deepEqual(api.warnings, []);
  assert.equal(api.clippingId, 210184878);
  assert.equal(C.formatCiteNews(api, {}, TODAY), C.formatCiteNews(ld, {}, TODAY));
});

test('clipping API: untitled, private and "Page" prefixes handled', () => {
  const base = F.clippingApi.clippings[0];
  const r = C.fromClippingApi({ ...base, title: null, is_public: false, page_title: 'Page  A9' });
  assert.equal(r.title, '');
  assert.equal(r.page, 'A9');
  assert.ok(r.warnings.some(w => /untitled/.test(w)));
  assert.ok(r.warnings.some(w => /private/.test(w)));
});

test('clipping list sorted newest first, so a just-saved clip leads', () => {
  const base = F.clippingApi.clippings[0];
  const list = C.listFromClippingApi({ clippings: [
    { ...base, clipping_id: 1, title: 'Older', created: '2026-11-01T00:00:00.000Z' },
    { ...base, clipping_id: 2, title: 'Newest', created: '2026-11-12T23:00:00.000Z' },
    { ...base, clipping_id: 3, title: 'Middle', created: '2026-11-05T00:00:00.000Z' },
  ] });
  assert.deepEqual(list.map(r => r.title), ['Newest', 'Middle', 'Older']);
  assert.deepEqual(C.listFromClippingApi({}), []);
});
