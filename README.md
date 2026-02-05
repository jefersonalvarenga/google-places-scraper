# Google Places Scraper - Custom SDR Version

🚀 Advanced Google Places scraper designed for SDR automation and lead generation. Enriches data with website information, Google Ads activity, and provides lead quality scoring.

---

## 🌟 Features

### Core Scraping
✅ **Complete Google Maps data** - Business name, category, address, phone, website, ratings, reviews, hours
✅ **Domain-based search** - Search by website domain (more precise than name+location)
✅ **Traditional search** - Search by keywords + location
✅ **Batch processing** - Process thousands of places efficiently

### Advanced Enrichment
✅ **Website data extraction** - Emails, social media links, meta tags, WhatsApp presence
✅ **Google Ads integration** - Automatically fetch active ads count for each business
✅ **Lead quality scoring** - 0-100% completeness score based on available data
✅ **Domain extraction** - Automatically extracts clean domain from website URL

### SDR Optimization
✅ **Structured output** - Ready for n8n/Zapier/Make integration
✅ **Deduplication** - Prevents processing the same place twice
✅ **Error handling** - Continues on failures, logs detailed errors
✅ **Parallel processing** - Fast execution with configurable concurrency

---

## 📥 Input

### Search Mode 1: By Search Terms (Traditional)

```json
{
  "searchMode": "searchTerms",
  "searchTerms": [
    "clínica dermatológica",
    "dermatologista"
  ],
  "location": "São Paulo, SP",
  "maxCrawledPlacesPerSearch": 100,
  "enrichWebsiteData": true,
  "getGoogleAdsCount": true,
  "googleAdsActorId": "jefersonalvarenga/google-ads-scraper"
}
```

### Search Mode 2: By Domains (More Precise!)

```json
{
  "searchMode": "domains",
  "domains": [
    "eclatclinica.com.br",
    "masterhealth.com.br"
  ],
  "maxCrawledPlacesPerSearch": 50,
  "enrichWebsiteData": true,
  "getGoogleAdsCount": true,
  "googleAdsActorId": "jefersonalvarenga/google-ads-scraper"
}
```

### Parameters Explained

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `searchMode` | enum | "searchTerms" | "searchTerms" or "domains" |
| `searchTerms` | array | [] | Keywords to search (when mode=searchTerms) |
| `location` | string | "" | Location filter (when mode=searchTerms) |
| `domains` | array | [] | Domains to search (when mode=domains) |
| `maxCrawledPlacesPerSearch` | number | 100 | Max results per search |
| `language` | string | "pt-BR" | Language code |
| `enrichWebsiteData` | boolean | true | Extract data from websites |
| `getGoogleAdsCount` | boolean | false | Fetch Google Ads count |
| `googleAdsActorId` | string | "" | Actor ID for ads scraper |
| `maxConcurrency` | number | 3 | Parallel requests |

---

## 📤 Output

### Standard Fields

```json
{
  "title": "Dra Luciane Faleiros Lombello",
  "categoryName": "Clínica de dermatologia",
  "address": "Av. José de Sousa Campos, 1073 - Cambuí, Campinas - SP",
  "phone": "+55 19 99219-4292",
  "website": "http://www.clinicareviva.com.br/",
  "domain": "clinicareviva.com.br",
  "totalScore": 4.9,
  "reviewsCount": 214,
  "openingHours": [
    { "day": "segunda-feira", "hours": "08:00 to 19:00" },
    { "day": "terça-feira", "hours": "08:00 to 19:00" }
  ],
  "placeId": "ChIJzdCgWBLPyJQRPeg8J6XJdMU",
  "url": "https://www.google.com/maps/...",
  "completenessScore": 95,
  "scrapedAt": "2026-02-05T00:00:00.000Z"
}
```

### Website Enrichment (when enabled)

```json
{
  "websiteEnrichment": {
    "status": "success",
    "title": "Clínica Reviva - Dermatologia",
    "description": "Clínica especializada em tratamentos dermatológicos...",
    "emails": [
      "contato@clinicareviva.com.br",
      "agendamento@clinicareviva.com.br"
    ],
    "socialLinks": {
      "instagram": "https://instagram.com/clinicareviva",
      "facebook": "https://facebook.com/clinicareviva"
    },
    "hasWhatsApp": true,
    "extractedAt": "2026-02-05T00:00:00.000Z"
  }
}
```

### Google Ads Data (when enabled)

```json
{
  "googleAdsCount": 91,
  "hasActiveAds": true
}
```

---

## 🎯 Use Cases

### 1. Lead Generation for Clinics
```json
{
  "searchTerms": ["clínica estética", "dermatologista"],
  "location": "São Paulo, SP",
  "enrichWebsiteData": true,
  "getGoogleAdsCount": true
}
```

**Result:** Find clinics with active ads (likely have budget) and complete contact info.

### 2. Competitor Analysis
```json
{
  "domains": [
    "competitor1.com.br",
    "competitor2.com.br"
  ],
  "getGoogleAdsCount": true
}
```

**Result:** See which competitors are advertising and their online presence.

### 3. Market Research
```json
{
  "searchTerms": ["dermatologia", "estética facial"],
  "location": "Rio de Janeiro, RJ",
  "maxCrawledPlacesPerSearch": 500
}
```

**Result:** Map the entire market in a region.

---

## 💰 Cost Estimate

| Operation | Time | Cost per place |
|-----------|------|----------------|
| Basic scraping | ~5-10s | $0.002-0.003 |
| + Website enrichment | +3-5s | $0.001-0.002 |
| + Google Ads count | +1s (batch) | $0.0002 |
| **Total (all features)** | ~8-15s | **$0.003-0.005** |

**Example:**
- 1,000 places with all features = **$3-5**
- 10,000 places = **$30-50**

---

## 🔗 Integration with n8n

### Webhook Trigger

```javascript
// Start actor run via n8n HTTP Request node
POST https://api.apify.com/v2/acts/YOUR_USERNAME~google-places-scraper-custom/runs
Headers:
  Authorization: Bearer YOUR_TOKEN
  Content-Type: application/json

Body:
{
  "searchTerms": ["{{$node["Trigger"].json["keyword"]}}"],
  "location": "{{$node["Trigger"].json["location"]}}",
  "enrichWebsiteData": true,
  "getGoogleAdsCount": true,
  "webhooks": [{
    "eventTypes": ["ACTOR.RUN.SUCCEEDED"],
    "requestUrl": "https://your-n8n.com/webhook/places-results"
  }]
}
```

### Process Results

```javascript
// n8n Webhook node receives results
const results = $input.all();

// Filter high-quality leads
const qualityLeads = results.filter(place =>
  place.completenessScore >= 80 &&
  place.website &&
  place.phone &&
  place.hasActiveAds === true
);

// Send to CRM, email, etc.
```

---

## 🚀 Quick Start

### 1. Deploy to Apify

#### Option A: From Console
1. Create new Actor in Apify Console
2. Copy all files to the editor
3. Build & Run

#### Option B: From GitHub
1. Push code to GitHub repository
2. Connect repository in Apify
3. Auto-deploy on push

### 2. Configure Google Ads Integration

First deploy the **Google Ads Transparency actor**, then use its ID:

```json
{
  "getGoogleAdsCount": true,
  "googleAdsActorId": "jefersonalvarenga/google-ads-scraper"
}
```

### 3. Run First Test

```json
{
  "searchTerms": ["clínica dermatológica"],
  "location": "Campinas, SP",
  "maxCrawledPlacesPerSearch": 10,
  "enrichWebsiteData": true
}
```

---

## 📊 Lead Quality Score

The `completenessScore` (0-100%) is calculated based on:

- ✅ Has title (business name)
- ✅ Has phone number
- ✅ Has website
- ✅ Has address
- ✅ Has rating
- ✅ Has reviews (count > 0)
- ✅ Has opening hours
- ✅ Has categories

**Scoring:**
- 100% = All 8 fields present (perfect lead)
- 75-99% = High quality (missing 1-2 fields)
- 50-74% = Medium quality (missing 3-4 fields)
- <50% = Low quality (incomplete data)

---

## 🔧 Advanced Configuration

### Batch Processing Strategy

For processing thousands of places:

```json
{
  "searchTerms": ["dermato", "estética", "spa"],
  "location": "São Paulo, SP",
  "maxCrawledPlacesPerSearch": 200,
  "maxConcurrency": 5,
  "enrichWebsiteData": false  // Disable for speed
}
```

Then run a second actor to enrich high-scoring leads:

```json
{
  "domains": ["lead1.com", "lead2.com", ...],
  "enrichWebsiteData": true,
  "getGoogleAdsCount": true
}
```

---

## ⚠️ Important Notes

### Rate Limiting
- Google Maps may block if too many requests
- Use maxConcurrency: 3-5 for safety
- Add delays between batches

### Data Accuracy
- Website enrichment depends on site structure
- Some sites may block scraping
- Ads count requires separate actor

### Privacy
- Respect robots.txt
- Don't scrape personal data
- Use for B2B lead generation only

---

## 📝 Changelog

### v1.0.0 (Initial Release)
- ✅ Google Maps scraping (name, address, phone, etc.)
- ✅ Domain-based search
- ✅ Website data enrichment
- ✅ Google Ads integration
- ✅ Lead quality scoring
- ✅ n8n-ready output
- ✅ Batch processing support

---

## 🆘 Support

For issues or questions:
1. Check Apify logs for detailed error messages
2. Verify input parameters are correct
3. Test with small batch first (maxCrawledPlacesPerSearch: 10)
4. Check Google Ads actor is deployed (if using integration)

---

## 📄 License

ISC License - Free to use and modify

---

**Built for SDR automation by Jeferson Alvarenga 🚀**
