# Deployment Guide - Google Places Scraper Custom

## 📋 Pre-requisites

1. ✅ **Google Ads Transparency Actor** deployed (from previous step)
2. ✅ Apify account with API token
3. ✅ GitHub repository (optional, for CI/CD)

---

## 🚀 Option 1: Deploy via Apify Console

### Step 1: Create New Actor
1. Go to https://console.apify.com/
2. Click **"Actors"** → **"Create new"**
3. Select **"Start from scratch"**
4. Name: `google-places-scraper-custom`

### Step 2: Upload Files
Copy each file content to the Apify Console:

#### Main Files
1. **main.js** → Main editor
2. **package.json** → Source files → Add new file
3. **Dockerfile** → Source files → Add new file

#### Configuration
1. **.actor/actor.json** → Source files → Create folder `.actor` → Add file
2. **.actor/INPUT_SCHEMA.json** → Same `.actor` folder

### Step 3: Configure Settings
1. **Memory**: 2048 MB (recommended for scraping)
2. **Timeout**: 600 seconds (10 minutes)
3. **Build tag**: latest

### Step 4: Build
1. Click **"Build"** (top right)
2. Wait ~2-3 minutes for build to complete
3. Check for errors in build log

### Step 5: Test Run
Use this test input:

```json
{
  "searchMode": "domains",
  "domains": ["eclatclinica.com.br"],
  "maxCrawledPlacesPerSearch": 5,
  "enrichWebsiteData": true,
  "getGoogleAdsCount": false
}
```

Click **"Start"** and monitor the run!

---

## 🔗 Option 2: Deploy via GitHub

### Step 1: Push to GitHub

```bash
cd google-places-scraper
git init
git add .
git commit -m "Initial commit - Google Places Scraper Custom"
git remote add origin https://github.com/YOUR_USERNAME/google-places-scraper.git
git push -u origin main
```

### Step 2: Connect Repository in Apify
1. Apify Console → **"Actors"** → **"Create new"**
2. Select **"From GitHub"**
3. Connect your GitHub account
4. Select repository: `YOUR_USERNAME/google-places-scraper`
5. Branch: `main`
6. Click **"Create"**

### Step 3: Auto-Deploy
Every time you push to `main`, Apify will automatically rebuild! 🎉

---

## 🔧 Configuration

### Get Your Google Ads Actor ID

1. Go to your **Google Ads Transparency Actor**
2. Copy the actor ID from URL:
   - Format: `username/actor-name`
   - Example: `jefersonalvarenga/google-ads-scraper`

3. Use it in input:
```json
{
  "getGoogleAdsCount": true,
  "googleAdsActorId": "jefersonalvarenga/google-ads-scraper"
}
```

---

## 🧪 Testing Strategy

### Test 1: Basic Scraping (No Enrichment)
```json
{
  "searchTerms": ["clínica dermatológica"],
  "location": "Campinas, SP",
  "maxCrawledPlacesPerSearch": 5,
  "enrichWebsiteData": false,
  "getGoogleAdsCount": false
}
```

**Expected:** ~30-60 seconds, 5 places

### Test 2: With Website Enrichment
```json
{
  "searchTerms": ["clínica dermatológica"],
  "location": "Campinas, SP",
  "maxCrawledPlacesPerSearch": 5,
  "enrichWebsiteData": true,
  "getGoogleAdsCount": false
}
```

**Expected:** ~60-120 seconds, 5 places with emails/social

### Test 3: Full Pipeline (All Features)
```json
{
  "searchTerms": ["clínica dermatológica"],
  "location": "Campinas, SP",
  "maxCrawledPlacesPerSearch": 10,
  "enrichWebsiteData": true,
  "getGoogleAdsCount": true,
  "googleAdsActorId": "jefersonalvarenga/google-ads-scraper"
}
```

**Expected:** ~2-4 minutes, 10 fully enriched places

### Test 4: Domain Search
```json
{
  "searchMode": "domains",
  "domains": ["eclatclinica.com.br", "masterhealth.com.br"],
  "enrichWebsiteData": true,
  "getGoogleAdsCount": true
}
```

**Expected:** ~1-2 minutes, 2 places

---

## 💰 Cost Monitoring

### Per-Feature Costs
| Feature | Time Added | Cost Impact |
|---------|-----------|-------------|
| Base scraping | 5-10s | $0.002 |
| Website enrichment | +3-5s | +$0.001 |
| Google Ads count | +1s (batch) | +$0.0002 |

### Optimization Tips
1. **Disable enrichment** for initial discovery
2. **Enable enrichment** only for qualified leads
3. **Process in 2 stages:**
   - Stage 1: Scrape all (no enrichment)
   - Stage 2: Enrich top leads (completenessScore > 70%)

---

## 🔗 Integration with n8n

### Workflow 1: Search → Filter → Enrich

```
┌─────────────┐
│   Trigger   │  (Manual/Schedule/Webhook)
└──────┬──────┘
       │
       v
┌─────────────┐
│ Start Actor │  (Search mode, no enrichment)
└──────┬──────┘
       │
       v
┌─────────────┐
│   Filter    │  (completenessScore >= 70%)
└──────┬──────┘
       │
       v
┌─────────────┐
│Start Actor 2│  (Domain mode + enrichment)
└──────┬──────┘
       │
       v
┌─────────────┐
│   Save CRM  │
└─────────────┘
```

### Workflow 2: Market Analysis

```
┌─────────────┐
│   Schedule  │  (Daily 9am)
└──────┬──────┘
       │
       v
┌─────────────┐
│ Start Actor │  (10 search terms)
└──────┬──────┘
       │
       v
┌─────────────┐
│  Aggregate  │  (Count by category, location)
└──────┬──────┘
       │
       v
┌─────────────┐
│Send Report  │  (Email/Slack)
└─────────────┘
```

### n8n HTTP Request Node

**Start Actor:**
```javascript
Method: POST
URL: https://api.apify.com/v2/acts/YOUR_USER~google-places-scraper-custom/runs
Headers:
  Authorization: Bearer {{$credentials.apifyApi.token}}
  Content-Type: application/json

Body:
{
  "searchTerms": ["{{$json.keyword}}"],
  "location": "{{$json.location}}",
  "maxCrawledPlacesPerSearch": 100,
  "enrichWebsiteData": true
}
```

**Wait for Results:**
```javascript
Method: GET
URL: https://api.apify.com/v2/acts/YOUR_USER~google-places-scraper-custom/runs/{{$json.id}}/dataset/items
Headers:
  Authorization: Bearer {{$credentials.apifyApi.token}}
```

---

## 🐛 Troubleshooting

### Build Fails

**Error:** `npm install failed`
- ✅ Check `package.json` syntax
- ✅ Try `npm install --legacy-peer-deps`

**Error:** `File not found: .actor/INPUT_SCHEMA.json`
- ✅ Verify folder structure
- ✅ INPUT_SCHEMA.json must be inside `.actor/` folder

### Runtime Errors

**Error:** `Timeout 60000ms exceeded`
- ✅ Increase timeout in code (line 31)
- ✅ Reduce maxCrawledPlacesPerSearch
- ✅ Check Google Maps is accessible

**Error:** `Could not find ads count`
- ✅ Verify Google Ads actor ID is correct
- ✅ Check actor has run permissions
- ✅ Test Google Ads actor separately

### No Results

**Empty dataset**
- ✅ Check search term is valid
- ✅ Verify location exists in Google Maps
- ✅ Try domain search instead

**Low completenessScore**
- ✅ Many places have incomplete data on Google
- ✅ Use filters: `completenessScore >= 70%`

---

## 📊 Performance Optimization

### For Speed (Discovery Phase)
```json
{
  "maxCrawledPlacesPerSearch": 500,
  "enrichWebsiteData": false,
  "getGoogleAdsCount": false,
  "maxConcurrency": 5
}
```

**Result:** ~2-3 min for 500 places, ~$1-2

### For Quality (Enrichment Phase)
```json
{
  "searchMode": "domains",
  "domains": ["top100domains..."],
  "enrichWebsiteData": true,
  "getGoogleAdsCount": true,
  "maxConcurrency": 3
}
```

**Result:** ~5-10 min for 100 places, ~$0.30-0.50

---

## 🎯 Best Practices

1. **Start Small** - Test with 5-10 places first
2. **Monitor Costs** - Check Apify dashboard regularly
3. **Use Filters** - Process only high-quality leads
4. **Batch Processing** - Don't scrape 10k places at once
5. **Rate Limiting** - Keep maxConcurrency at 3-5
6. **Error Handling** - Always check logs for issues

---

## 📈 Scaling Strategy

### Stage 1: Market Discovery (Cheap & Fast)
- Scrape 1000s of places
- No enrichment
- Filter by completenessScore

### Stage 2: Lead Qualification (Targeted)
- Scrape only top domains
- Full enrichment
- Check Google Ads activity

### Stage 3: Prioritization (Automated)
- Sort by: hasActiveAds + completenessScore
- Top 20% → High priority
- Next 30% → Medium priority
- Bottom 50% → Low priority

---

## 🚀 Ready to Deploy!

**Checklist:**
- ✅ All files created
- ✅ Google Ads actor deployed
- ✅ Apify account ready
- ✅ Test input prepared

**Next steps:**
1. Deploy to Apify
2. Run first test
3. Verify results
4. Integrate with n8n
5. Scale up! 🎉

---

**Questions? Check the logs or contact support!** 💬
