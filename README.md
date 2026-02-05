# Google Maps Business Scraper (Places, Reviews & Enrichment)

This Actor scrapes **Google Maps business listings** and optionally enriches each place with:

- **Contacts** (emails, phones, contact/about URLs)
- **Social profiles** (Facebook, Instagram, TikTok, YouTube, Twitter)
- **Leads** (potential people of interest inferred from LinkedIn links on company/team pages)

It is built with:

- [Apify SDK v3](https://docs.apify.com/sdk/js) (`Actor.main`)
- [Crawlee](https://crawlee.dev/) `PlaywrightCrawler`
- [Playwright](https://playwright.dev/) (headless Chromium)
- **TypeScript** in strict mode

The Actor is designed for **Apify Store** monetization, with clear enrichment counters and robust soft‑block handling.

---

## Features

### Search & discovery

- Uses Google Maps search UI (tiling + sidebar scrolling).
- Deduplicates places using a persistent key‑value store (`PLACE_DEDUP`).
- Respects `maxCrawledPlacesPerSearch` per search job.

### Place details

For every discovered place, the Actor opens the **place detail pane** and extracts:

- Title, categories, description
- Full structured address (street, city, state, postal code, country)
- Coordinates (`lat`, `lng`) derived from URL where possible
- Identifiers: `placeId`, `cid`, `googleMapsUrl`
- Phone, website
- Opening hours and a coarse **price level** (`$`, `$$`, ...)
- Flags for `permanentlyClosed` and `temporarilyClosed`

### Reviews (optional, core revenue feature)

If enabled, the Actor opens the **Reviews tab/modal** and scrolls through reviews until:

- No new reviews appear, or
- The configured `maxReviews` per place is reached.

For each review it extracts:

- Review ID (from DOM or deterministic hash fallback)
- Reviewer name, profile URL, profile photo URL
- Rating
- Text
- Like / helpful count
- Local Guide status
- Owner response (if any)
- Images (if any)
- Timestamp (as displayed in the UI)

Reviews are deduplicated using a persistent `REVIEW_DEDUP` store and pushed to a dedicated **`reviews` dataset**, one review per row.

### Contacts enrichment (optional, billable)

If `enrichContacts` is `true` and a place has a website:

- The Actor fetches the homepage and a small set of likely contact/about URLs
  (`/contact`, `/contact-us`, `/about`, etc.).
- It respects `robots.txt` per origin and uses per‑request timeouts.
- It extracts:
  - Emails
  - Phone numbers
  - Contact/about page URLs

The results are stored under:

- `place.enrichment.contacts` (emails, phones)
- `place.additionalInfo.contactPageUrls`

### Social profiles enrichment (optional, billable)

If `enrichSocialProfiles` contains any networks and a place has a website:

- The Actor scans the HTML for links to supported networks:
  - `facebook`
  - `instagram`
  - `tiktok`
  - `youtube`
  - `twitter` (X)
- For each enabled network it stores a `SocialProfile` object with:
  - `type` (network)
  - `url` (absolute URL)
  - `username` (derived from URL path where possible)

Profiles are stored under `place.enrichment.socialProfiles`.

### Leads enrichment (optional, billable)

If `enrichLeads` is `true` and a place has a website:

- The Actor fetches a limited set of pages (homepage + likely team/leadership URLs).
- It scans for **LinkedIn** links and tries to infer:
  - Full name
  - Job title
  - LinkedIn URL

Every inferred lead is pushed to a separate **`leads` dataset** row, and an array of leads is also stored under `place.enrichment.leads`.

### Reliability & soft‑block handling

- Uses `PlaywrightCrawler` with **session pool** and `maxRequestRetries`.
- Detects soft blocks / captchas on search, place detail, and reviews pages.
- When blocked, marks the session as bad (`session.markBad()`) and throws to trigger Crawlee retries.
- Adds small **random delays** between scrolls to reduce detection.
- Uses bounded in‑memory maps for deduplication to avoid memory blow‑ups.

### Summary counters (for monetization)

At the end of each run the Actor logs an aggregate summary:

- `placesScraped`
- `reviewsScraped`
- `enrichmentStats`:
  - `contactsEnrichedCount`
  - `leadsEnrichedCount`
  - `socialProfilesEnrichedCount`

These are ideal for usage‑based pricing or billing in the Apify Store.

---

## Input configuration

The Actor reads input according to `input-schema.json`.

### Search parameters

| Field | Type | Default | Description |
|------|------|---------|-------------|
| `searchTerms` | `string[]` | `[]` | List of free‑text search terms (e.g. `["restaurants", "dentist"]`). |
| `categories` | `string[]` | `[]` | Optional categories to combine with each search term (e.g. `["hotel", "coffee shop"]`). |
| `location` | `string` | `""` | Free‑text location such as `"Berlin, Germany"`. Used if `customGeolocation` is not provided. |
| `customGeolocation` | GeoJSON object | `{}` | Optional custom geometry: `Point`, `Polygon`, or `MultiPolygon`. |

### Crawling & language

| Field | Type | Default | Description |
|------|------|---------|-------------|
| `maxCrawledPlacesPerSearch` | `integer` | `500` | Maximum places to crawl per search job. |
| `language` | `string` | `"en"` | Google Maps UI language code (e.g. `"en"`, `"de"`, `"fr"`). |

### Reviews

| Field | Type | Default | Description |
|------|------|---------|-------------|
| `extractReviews` | `boolean` | `true` | If `true`, enqueue review scraping for each place. |
| `maxReviews` | `integer` | `5000` | Maximum number of reviews per place. `0` disables review scraping. |

### Enrichment (billable)

| Field | Type | Default | Description |
|------|------|---------|-------------|
| `extractImages` | `boolean` | `true` | Placeholder for future image metadata extraction. |
| `enrichContacts` | `boolean` | `false` | If `true`, crawl websites for emails, phones, and contact URLs. |
| `enrichLeads` | `boolean` | `false` | If `true`, discover potential leads via LinkedIn links. |
| `enrichSocialProfiles` | array of `"facebook" \| "instagram" \| "tiktok" \| "youtube" \| "twitter"` | `[]` | Which networks to enrich on each place website. |

### Proxy configuration

| Field | Type | Default | Description |
|------|------|---------|-------------|
| `proxy.useApifyProxy` | `boolean` | `true` | Use Apify Proxy. Recommended for production. |
| `proxy.apifyProxyGroups` | `string[]` | `[]` | e.g. `["RESIDENTIAL"]` for residential proxies. |
| `proxy.apifyProxyCountry` | `string` | `undefined` | Country code such as `"US"`, `"DE"`. |
| `proxy.proxyUrls` | `string[]` | `[]` | Custom proxy URLs instead of Apify Proxy. |

---

## Output datasets

### `places`

One item per place, conforming to the internal `Place` type. Important fields:

- **Core identity**
  - `id` (stable place key)
  - `searchJobId`
  - `googleMapsUrl`
  - `placeId`, `cid`, `fid`
- **Business info**
  - `title`
  - `primaryCategory`, `categories[]`
  - `description`
  - `priceLevel`
- **Address & location**
  - `address.fullAddress`, `address.street`, `city`, `state`, `postalCode`, `country`
  - `location.lat`, `location.lng`
  - `plusCode`
- **Contact**
  - `phone.formatted`, `phone.e164`
  - `website`
- **Hours & status**
  - `openingHours`
  - `permanentlyClosed`, `temporarilyClosed`
- **Enrichment** (optional)
  - `enrichment.contacts`
  - `enrichment.socialProfiles[]`
  - `enrichment.leads[]`
  - `additionalInfo.contactPageUrls`
- **Timestamps**
  - `createdAt`, `updatedAt`

### `reviews`

One item per review, conforming to `Review` type:

- `id` (Maps ID or deterministic hash)
- `placeId`
- `searchJobId`
- `reviewerName`, `reviewerProfileUrl`, `reviewerPhotoUrl`
- `rating`
- `text`
- `likesCount`
- `isLocalGuide`
- `reviewImages[]`
- `ownerResponse`
- `publishedAt`
- `scrapedAt`

### `leads`

One item per potential lead, conforming to `Lead` type:

- `id` (hash: `"lead:..."`)
- `placeId`
- `fullName`
- `jobTitle`
- `department`
- `linkedinUrl`
- `email`
- `phone`
- `companySize`
- `industry`
- `sourceUrl` (page where the LinkedIn link was found)

---

## Running the Actor

### On Apify Platform

1. Go to the Actor page.
2. Click **Try actor**.
3. Fill the input using the schema above.
4. Run the Actor.
5. Inspect your run:
   - `places`, `reviews`, and `leads` datasets in the **Storage** tab.
   - Final summary log showing `placesScraped`, `reviewsScraped`, and `enrichmentStats`.

### Locally with Node.js

#### 1. Install dependencies

```bash
npm install
```

#### 2. Build the TypeScript sources

```bash
npm run build
```

#### 3. Install Playwright browsers (required for local runs)

Playwright needs browser binaries. On your machine, run **once**:

```bash
npx playwright install --with-deps
```

> On Apify platform, the official Playwright images already include browsers, so you usually do **not** need this step there.

#### 4. Run with `APIFY_INPUT`

```bash
APIFY_LOCAL_STORAGE_DIR=./apify_storage_dev \
APIFY_INPUT='{
  "searchTerms": ["coffee shop"],
  "categories": [],
  "location": "Berlin, Germany",
  "maxCrawledPlacesPerSearch": 5,
  "language": "en",
  "extractReviews": true,
  "maxReviews": 20,
  "extractImages": false,
  "enrichContacts": true,
  "enrichLeads": true,
  "enrichSocialProfiles": ["facebook", "instagram"],
  "proxy": { "useApifyProxy": false }
}' \
node dist/main.js
```

Outputs will be saved under `./apify_storage_dev/datasets/places`, `reviews`, and `leads`.

---

## Programmatic usage (Node.js / TypeScript)

### Calling the Actor on Apify

```ts
import { ApifyClient } from 'apify-client';

async function main() {
  const client = new ApifyClient({ token: process.env.APIFY_TOKEN! });

  const input = {
    searchTerms: ['coffee shop'],
    location: 'Berlin, Germany',
    maxCrawledPlacesPerSearch: 5,
    extractReviews: true,
    maxReviews: 20,
    enrichContacts: true,
    enrichLeads: true,
    enrichSocialProfiles: ['facebook', 'instagram'],
  };

  const run = await client.actor('USERNAME/google-maps-scraper-actor-ts').call({ input });

  console.log('Run finished with status:', run.status);
}

void main();
```

---

## Monetization & billing

You can base billing on the final summary counters:

- **Core scraping**: number of `placesScraped` and `reviewsScraped`.
- **Enrichment events**:
  - `contactsEnrichedCount` – how many places had contacts enriched.
  - `leadsEnrichedCount` – how many leads were discovered.
  - `socialProfilesEnrichedCount` – total number of social profiles enriched.

Examples of pricing models:

- Tiered plans by maximum `placesScraped` per run.
- Add‑on fees for enabling `enrichContacts`, `enrichLeads`, or `enrichSocialProfiles`.
- Per‑lead or per‑profile pricing for enterprise users.

---

## Reliability & best practices

- **Proxies**
  - For production‑scale scraping, use Apify residential proxies:
    - `proxy.useApifyProxy: true`
    - `proxy.apifyProxyGroups: ["RESIDENTIAL"]`
- **Concurrency**
  - Increase concurrency carefully on Apify Platform and monitor for soft‑block logs.
- **Soft blocks / captchas**
  - The Actor detects them and marks sessions bad to trigger retries.
  - If you see many soft‑block warnings, reduce concurrency and ensure proxies are configured.
- **Limits**
  - Tune `maxCrawledPlacesPerSearch` and `maxReviews` to balance cost vs. coverage.
  - Leads enrichment is internally capped to a small number of pages and leads per place to avoid runaway usage.

---

## Troubleshooting

- **0 places scraped**
  - Check that your `searchTerms` and `location` actually return results in Google Maps.
  - Verify that you did not set `maxCrawledPlacesPerSearch` to `0`.

- **Lots of soft‑block / captcha warnings**
  - Enable Apify residential proxy groups.
  - Lower concurrency.
  - Narrow the geographic area.

- **No reviews dataset**
  - Ensure `extractReviews` is `true` and `maxReviews` is `> 0`.

- **No enrichment fields**
  - Ensure `enrichContacts`, `enrichLeads`, or `enrichSocialProfiles` are enabled.
  - Check that the places actually have a `website` field.

- **Local run: "Failed to launch browser"**
  - Make sure you executed:
    ```bash
    npx playwright install --with-deps
    ```
  - If you still have issues, check Playwright docs for your OS.

This Actor is ready for Apify Store publishing and long‑term maintenance, with clean separation of scraping and enrichment layers and clear billing counters.
