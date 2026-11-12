# PressPass NG

A Tampermonkey userscript that turns [Newspapers.com](https://www.newspapers.com) clippings into ready-to-paste Wikipedia `{{Cite news}}` citations.

It was written as a replacement for [PressPass](https://github.com/jp-x-g/PressPass) by JPxG, which stopped working after Newspapers.com redesigned its pages. PressPass NG is a new script, not a fork: no PressPass code is reused. The difference is where the data comes from. PressPass read the visible page layout, which breaks every time the site is redesigned. PressPass NG reads the structured data that Newspapers.com publishes for search engines (JSON-LD) and the site's own clipping data, and draws its own panel instead of inserting into the site's layout.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Open **[presspass-ng.user.js](https://raw.githubusercontent.com/reader5567/presspass-ng/main/presspass-ng.user.js)**. Tampermonkey shows an install page; click **Install**.
3. If you still have the original PressPass installed, turn it off in Tampermonkey so the two don't run together.

Tampermonkey checks this repository for updates automatically.

Tested on Firefox with Tampermonkey. Other browsers and script managers should work but haven't been tested.

## Use

A **Cite** button appears in the bottom-right corner of Newspapers.com pages where there is something to cite. The panel opens only when you click it.

**Clipping pages** (`newspapers.com/article/…`): the panel shows the citation for that clipping.

**Newspaper viewer pages** (`newspapers.com/image/…`): the panel lists every clipping on that page, newest first, so a clip you just saved is at the top. Click one to get its citation. If a new clip doesn't appear, click **Refresh list**.

In the panel you can:

- edit the **title** and **newspaper** name before copying (the citation updates as you type);
- choose the date format (`1966-11-09`, `9 November 1966` or `November 9, 1966`) and ref-name style;
- turn `via`, `access-date`, the weekday comment and multi-line layout on or off;
- click **Copy**.

Settings are remembered between visits.

Example output:

```
<ref name="HawaiiTrib 1966-11-09 p1">{{Cite news|url=https://www.newspapers.com/article/hawaii-tribune-herald-incumbents-fall-in/210186122/|title=Incumbents Fall In Board Race|newspaper=Hawaii Tribune-Herald|location=Hilo, Hawaii|date=1966-11-09|page=1|via=Newspapers.com|access-date=2026-11-12}}</ref><!-- Wed -->
```

### Authors

Title a clipping `Headline / Author Name` when you save it, and the author is filled in. Separate multiple authors with semicolons: `Headline / First Author; Second Author`.

### Warnings

When a citation needs a check, the button turns amber and reads **Cite ⚠**. Open the panel to see why. Common cases:

- **Untitled clipping.** Type the printed headline into the title box.
- **Obituary label.** For indexed obituaries the site supplies a label like "Obituary for John SMITH". It is not the printed headline, and surnames are often in capitals.
- **Private clipping.** Readers can't open the link until you make the clipping public on Newspapers.com.
- **Dates before 14 September 1752.** Check the Julian/Gregorian calendar question before citing. No weekday is computed for these dates.

## Things to check yourself

- **Newspaper names can be anachronistic.** Newspapers.com files some archives under a paper's current name. For example, a 1960 page appears under *Honolulu Star-Advertiser*, a name the paper only took in 2010. Check the masthead on the scan and correct the name in the panel.
- **OCR and site metadata can be wrong.** The script copies what Newspapers.com provides; verify dates and page numbers against the scan.
- **Avoid refbombing.** See [WP:CITEKILL](https://en.wikipedia.org/wiki/Wikipedia:Citation_overkill).

## How it works

| Page | Data source |
| --- | --- |
| Clipping (`/article/`) | The page's JSON-LD `NewsArticle` block, with the `BreadcrumbList` block as a fallback for each field |
| Viewer (`/image/`, `/newspage/`) | The site's clipping endpoint, `/api/clipping/page?page_id=…` |

Citations always use the clipping's clean canonical URL, without tracking or session parameters. Links reached through the Wikipedia Library proxy are rewritten to `www.newspapers.com`.

If Newspapers.com changes its data, the panel says which field is missing instead of failing silently, and the browser console logs a short code (`PPNG-E1`: no structured data on a clipping page; `PPNG-E2`: clipping data failed to load). Please [open an issue](https://github.com/reader5567/presspass-ng/issues) with the code and the page URL.

## Development

The citation logic is plain functions at the top of `presspass-ng.user.js`, exported for Node when it is not running in Tampermonkey.

```
npm install        # only needed for the browser smoke tests (jsdom)
npm test           # unit tests against data captured from live pages
npm run smoke      # simulated-browser runs of the panel
```

Test data in `test/fixtures.js` was captured from live Newspapers.com pages in November 2026.

## License

[GPL-3.0](LICENSE). Inspired by [PressPass](https://github.com/jp-x-g/PressPass) by JPxG, also GPL-3.0.
