// JSON-LD captured from live Newspapers.com clipping pages on 2026-11-12 (Phase 0).
const crumbs = (country, state, city, paper, y, m, d, page, last) =>
  ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement:
    [country, state, city, paper, y, m, d, page, last].map((name, position) => ({ '@type': 'ListItem', position, name })) });

module.exports = {
  titled: {
    canonical: 'https://www.newspapers.com/article/hawaii-tribune-herald-incumbents-fall-in/210186122/',
    ld: [
      { '@context': 'https://schema.org', '@type': 'NewsArticle', datePublished: '1966-11-09',
        publisher: { '@type': 'Organization', legalName: 'Hawaii Tribune-Herald' },
        about: 'Incumbents Fall In Board Race', locationCreated: 'Hilo, Hawaii', pageStart: '1' },
      crumbs('United States', 'Hawaii', 'Hilo', 'Hawaii Tribune-Herald', '1966', 'Nov', '09', 'Page 1', 'Incumbents Fall In Board Race'),
    ],
  },
  untitled: {
    canonical: 'https://www.newspapers.com/article/west-hawaii-today/210188457/',
    ld: [
      { '@context': 'https://schema.org', '@type': 'NewsArticle', datePublished: '2012-05-13',
        publisher: { '@type': 'Organization', legalName: 'West Hawaii Today' },
        about: '', locationCreated: 'Kailua-Kona, Hawaii', pageStart: 'A9' },
      crumbs('United States', 'Hawaii', 'Kailua-Kona', 'West Hawaii Today', '2012', 'May', '13', 'Page A9', 'Article clipped from West Hawaii Today'),
    ],
  },
  obituary: {
    canonical: 'https://www.newspapers.com/article/the-pittsburgh-press-obituary-for-willia/210188450/',
    ld: [
      { '@context': 'https://schema.org', '@type': 'NewsArticle', datePublished: '1973-11-12',
        publisher: { '@type': 'Organization', legalName: 'The Pittsburgh Press' },
        about: 'Obituary for William C. LONG Jr.,', locationCreated: 'Pittsburgh, Pennsylvania', pageStart: 'Page 24' },
      crumbs('United States', 'Pennsylvania', 'Pittsburgh', 'The Pittsburgh Press', '1973', 'Nov', '12', 'Page  24', 'Obituary for William C. LONG Jr.,'),
    ],
  },
  imagePageArticle: {
    // Fetched from /article/210184878/ while on /image/259227729/?clipping_id=210184878&fcfToken=...
    href: 'https://www.newspapers.com/image/259227729/?clipping_id=210184878&fcfToken=abc',
    canonical: 'https://www.newspapers.com/article/honolulu-star-advertiser-chong-will-seek/210184878/',
    ld: [
      { '@context': 'https://schema.org', '@type': 'NewsArticle', datePublished: '1960-07-25',
        publisher: { '@type': 'Organization', legalName: 'Honolulu Star-Advertiser' },
        about: 'Chong Will Seek Supervisor Post', locationCreated: 'Honolulu, Hawaii', pageStart: '6' },
      crumbs('United States', 'Hawaii', 'Honolulu', 'Honolulu Star-Advertiser', '1960', 'Jul', '25', 'Page 6', 'Chong Will Seek Supervisor Post'),
    ],
  },
  // /api/clipping/page?page_id=259227729 response captured 2026-11-12 (Phase 0), user fields trimmed.
  clippingApi: {
    clippings: [{
      clipping_id: 210184878, article_id: null, page_id: 259227729,
      title: 'Chong Will Seek Supervisor Post', body: null, tags: null,
      is_public: true, page_publication_id: 5998, page_date: '1960-07-25', page_title: '6',
      created: '2026-11-12T21:51:24.000Z', modified: '2026-11-12T21:51:24.000Z',
      publication: { id: 5554, name: 'Honolulu Star-Advertiser', location: 'Honolulu, Hawaii', url: '/paper/honolulu-star-advertiser/5554/' },
      url: '/article/honolulu-star-advertiser-chong-will-seek/210184878/',
      associated_clippings: [],
    }],
    total_count: 1,
    more_clippings: false,
  },
  crumbs,
};
