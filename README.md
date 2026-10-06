# CleanScout

Finds businesses showing signs they may need a commercial cleaning provider, using public records. Covers every Texas city plus Los Angeles, Chicago, San Francisco and Seattle. Visitors start in the city nearest to them and can search for any other covered city.

## How it fits together

| File | What it does |
| --- | --- |
| `index.html`, `styles.css`, `data.js`, `app.js` | The site. Plain files, no build step. |
| `config.js` | Site settings: the Stripe Payment Links. |
| `data/index.json` | Every covered city, its location and which tiles hold its records. Generated. |
| `data/tiles/*.json` | The records, split into half-degree map tiles so a visitor only downloads their area. Generated. |
| `scripts/fetch-data.mjs` | Pulls the public records, filters them and writes `data/`. |
| `scripts/build-single-file.mjs` | Packs the page into `dist/cleanscout.html` for single-page hosts. |
| `.github/workflows/refresh-data.yml` | Re-runs the fetch every morning once the repo is on GitHub. |

## Data sources

All free, official open-data APIs. Records from the last 90 days are kept.

| Source | Covers | Signal |
| --- | --- | --- |
| Texas Comptroller, Active Sales Tax Permit Holders | Every Texas city | New business, new location |
| City of Austin, Issued Construction Permits | Austin | New facility, renovation, expansion |
| City of Seattle, Building Permits | Seattle | New facility, renovation |
| City of Chicago, Business Licenses | Chicago | New business, new location |
| City of San Francisco, Registered Business Locations | San Francisco | New business |
| City of Los Angeles, Listing of Active Businesses | Los Angeles | New business, new location |

The U.S. Census geocoder turns addresses into coordinates. Sole proprietors, online sellers, trades and home addresses are filtered out where the source allows. Nothing is verified beyond what the record states, and no contact details are invented.

### Adding a city

Add a fetch function in `scripts/fetch-data.mjs` that returns records in the same shape as the others, list it in `main()`, and add a row to `PROVIDERS` in `data.js`. The city then appears in search on its own.

## Plans

Every plan can browse any covered city at any distance. Plans differ by how many opportunities can be claimed each month (Solo 20, Growth 50, Pro 100) and by features such as filters and CSV export.

When `styles.css`, `config.js`, `data.js` or `app.js` change, bump the `?v=` number in `index.html` so returning visitors load the new files together.

## Run it

```bash
node scripts/fetch-data.mjs        # refresh data/ (Node 18+, about 90 seconds)
python3 -m http.server 4173        # then open http://localhost:4173
```

## Stripe

Stripe has no monthly fee; it takes a cut of each payment (2.9% + 30 cents per US card charge at the time of writing). The site uses Stripe Payment Links, which need no server.

1. Create a Stripe account at stripe.com.
2. In **Product catalog**, add three products with monthly recurring prices: Solo $19, Growth $39, Pro $79.
3. For each, create a **Payment Link**. Under the link's options, turn on **Include a free trial** and set it to 7 days. Under **After payment**, choose "Don't show confirmation page" and redirect to `https://YOUR-SITE/?checkout=success`.
4. In **Settings > Billing > Customer portal**, turn on the portal login link.
5. Paste the three `https://buy.stripe.com/...` links and the portal link into `config.js`.

Use Stripe's test mode links first to try the flow without real cards.

## Not real yet

Accounts are stored in the visitor's browser (`localStorage`). With Stripe connected, real cards are charged, but the site cannot check with Stripe whether someone has paid, so access is on the honor system until there is a real sign-in and a small server that listens for Stripe's payment events.
