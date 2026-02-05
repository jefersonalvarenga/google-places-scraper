import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput();
const {
    searchTerms = [],
    location = '',
    searchByDomain = false,
    domains = [],
    maxCrawledPlacesPerSearch = 100,
    language = 'pt-BR',
    enrichWebsiteData = true,
    getGoogleAdsCount = false,
    googleAdsActorId = '', // ID do actor Google Ads Transparency que criamos
    maxConcurrency = 3,
} = input;

// Validate input
if (!searchByDomain && (!searchTerms || searchTerms.length === 0)) {
    throw new Error('Input must contain searchTerms (unless searchByDomain is true)');
}

if (searchByDomain && (!domains || domains.length === 0)) {
    throw new Error('When searchByDomain is true, domains array is required');
}

console.log('='.repeat(60));
console.log('🗺️  GOOGLE PLACES SCRAPER - CUSTOM VERSION');
console.log('='.repeat(60));
console.log(`Search mode: ${searchByDomain ? 'By Domain' : 'By Search Terms'}`);
console.log(`Max places per search: ${maxCrawledPlacesPerSearch}`);
console.log(`Language: ${language}`);
console.log(`Enrich website data: ${enrichWebsiteData}`);
console.log(`Get Google Ads count: ${getGoogleAdsCount}`);
console.log('='.repeat(60));

const results = [];
const processedPlaceIds = new Set();

// Helper function to calculate data completeness score
function calculateCompletenessScore(place) {
    const fields = [
        place.title,
        place.phone,
        place.website,
        place.address,
        place.totalScore,
        place.reviewsCount > 0,
        place.openingHours && place.openingHours.length > 0,
        place.categories && place.categories.length > 0,
    ];

    const filledFields = fields.filter(field => field).length;
    return Math.round((filledFields / fields.length) * 100);
}

// Helper function to extract domain from URL
function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

// Helper function to enrich with website data
async function enrichWithWebsiteData(place, page, log) {
    if (!place.website) return place;

    try {
        log.info(`Enriching website data for ${place.title}...`);

        // Navigate to website
        await page.goto(place.website, {
            timeout: 30000,
            waitUntil: 'domcontentloaded'
        });

        // Extract website metadata
        const websiteData = await page.evaluate(() => {
            // Get meta tags
            const getMeta = (name) => {
                const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
                return meta ? meta.content : null;
            };

            // Extract emails from page
            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const pageText = document.body.innerText;
            const emails = [...new Set(pageText.match(emailRegex) || [])];

            // Extract social media links
            const socialLinks = {};
            const links = Array.from(document.querySelectorAll('a[href]'));

            links.forEach(link => {
                const href = link.href.toLowerCase();
                if (href.includes('facebook.com')) socialLinks.facebook = link.href;
                if (href.includes('instagram.com')) socialLinks.instagram = link.href;
                if (href.includes('linkedin.com')) socialLinks.linkedin = link.href;
                if (href.includes('twitter.com') || href.includes('x.com')) socialLinks.twitter = link.href;
                if (href.includes('youtube.com')) socialLinks.youtube = link.href;
                if (href.includes('tiktok.com')) socialLinks.tiktok = link.href;
            });

            return {
                title: document.title,
                description: getMeta('description') || getMeta('og:description'),
                keywords: getMeta('keywords'),
                emails: emails.slice(0, 5), // Max 5 emails
                socialLinks,
                hasWhatsApp: pageText.toLowerCase().includes('whatsapp'),
            };
        });

        place.websiteEnrichment = {
            ...websiteData,
            status: 'success',
            extractedAt: new Date().toISOString(),
        };

        log.info(`✅ Website enrichment successful for ${place.title}`);

    } catch (error) {
        log.warning(`Failed to enrich website data for ${place.title}: ${error.message}`);
        place.websiteEnrichment = {
            status: 'failed',
            error: error.message,
        };
    }

    return place;
}

// Create crawler for Google Maps search
const crawler = new PlaywrightCrawler({
    requestHandler: async ({ request, page, log }) => {
        const { searchString, searchMode } = request.userData;

        log.info(`Processing: ${searchString} (mode: ${searchMode})`);

        try {
            // Wait for results to load
            await page.waitForLoadState('networkidle', { timeout: 60000 });
            await page.waitForTimeout(3000);

            // Extract place data from the search results page
            const places = await page.evaluate(() => {
                const placeElements = document.querySelectorAll('[role="article"]');
                const results = [];

                placeElements.forEach((el, index) => {
                    try {
                        // Extract basic info
                        const titleEl = el.querySelector('[role="heading"]');
                        const title = titleEl ? titleEl.textContent.trim() : null;

                        // Extract rating
                        const ratingEl = el.querySelector('[role="img"][aria-label*="star"]');
                        const ratingMatch = ratingEl ? ratingEl.getAttribute('aria-label').match(/([0-9.]+)/) : null;
                        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

                        // Extract reviews count
                        const reviewsEl = el.querySelector('span[aria-label*="review"]');
                        const reviewsMatch = reviewsEl ? reviewsEl.textContent.match(/([0-9,]+)/) : null;
                        const reviewsCount = reviewsMatch ? parseInt(reviewsMatch[1].replace(/,/g, '')) : 0;

                        // Extract link to place details
                        const linkEl = el.querySelector('a[href*="place"]');
                        const placeUrl = linkEl ? linkEl.href : null;

                        if (title && placeUrl) {
                            results.push({
                                title,
                                totalScore: rating,
                                reviewsCount,
                                url: placeUrl,
                                rank: index + 1,
                            });
                        }
                    } catch (err) {
                        console.error('Error extracting place:', err);
                    }
                });

                return results;
            });

            log.info(`Found ${places.length} places in search results`);

            // Process each place (visit detail page)
            for (const basicPlace of places.slice(0, maxCrawledPlacesPerSearch)) {
                // Check if already processed
                if (processedPlaceIds.has(basicPlace.url)) {
                    log.info(`Skipping duplicate: ${basicPlace.title}`);
                    continue;
                }

                try {
                    log.info(`Extracting details for: ${basicPlace.title}`);

                    // Navigate to place details
                    await page.goto(basicPlace.url, {
                        timeout: 60000,
                        waitUntil: 'networkidle'
                    });
                    await page.waitForTimeout(2000);

                    // Extract detailed information
                    const placeDetails = await page.evaluate(() => {
                        const getText = (selector) => {
                            const el = document.querySelector(selector);
                            return el ? el.textContent.trim() : null;
                        };

                        const getAttribute = (selector, attr) => {
                            const el = document.querySelector(selector);
                            return el ? el.getAttribute(attr) : null;
                        };

                        // Extract address
                        const addressButton = document.querySelector('button[data-item-id^="address"]');
                        const address = addressButton ? addressButton.getAttribute('aria-label')?.replace('Endereço: ', '') : null;

                        // Extract phone
                        const phoneButton = document.querySelector('button[data-item-id^="phone"]');
                        const phone = phoneButton ? phoneButton.getAttribute('aria-label')?.replace(/^.*?: /, '') : null;

                        // Extract website
                        const websiteLink = document.querySelector('a[data-item-id^="authority"]');
                        const website = websiteLink ? websiteLink.href : null;

                        // Extract category
                        const categoryButton = document.querySelector('button[jsaction*="category"]');
                        const category = categoryButton ? categoryButton.textContent.trim() : null;

                        // Extract Place ID from URL
                        const urlMatch = window.location.href.match(/!1s([^!]+)/);
                        const placeId = urlMatch ? urlMatch[1] : null;

                        // Extract opening hours
                        const hoursTable = document.querySelector('[aria-label*="Horários"]');
                        const openingHours = [];
                        if (hoursTable) {
                            const rows = hoursTable.querySelectorAll('tr');
                            rows.forEach(row => {
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 2) {
                                    openingHours.push({
                                        day: cells[0].textContent.trim(),
                                        hours: cells[1].textContent.trim(),
                                    });
                                }
                            });
                        }

                        return {
                            address,
                            phone,
                            website,
                            categoryName: category,
                            placeId,
                            openingHours,
                        };
                    });

                    // Merge basic and detailed data
                    const fullPlace = {
                        ...basicPlace,
                        ...placeDetails,
                        searchString,
                        language,
                        scrapedAt: new Date().toISOString(),
                    };

                    // Calculate completeness score
                    fullPlace.completenessScore = calculateCompletenessScore(fullPlace);

                    // Extract domain from website
                    if (fullPlace.website) {
                        fullPlace.domain = extractDomain(fullPlace.website);
                    }

                    // Enrich with website data if enabled
                    if (enrichWebsiteData && fullPlace.website) {
                        await enrichWithWebsiteData(fullPlace, page, log);
                    }

                    // Mark as processed
                    processedPlaceIds.add(basicPlace.url);

                    // Save to results and dataset
                    results.push(fullPlace);
                    await Actor.pushData(fullPlace);

                    log.info(`✅ Extracted: ${fullPlace.title} (Score: ${fullPlace.completenessScore}%)`);

                } catch (error) {
                    log.error(`Error processing place ${basicPlace.title}: ${error.message}`);
                }
            }

        } catch (error) {
            log.error(`Error in search "${searchString}": ${error.message}`);
        }
    },

    maxRequestsPerCrawl: searchByDomain ? domains.length : searchTerms.length,
    maxConcurrency,
    requestHandlerTimeoutSecs: 180,
});

// Build search URLs
const requests = [];

if (searchByDomain) {
    // Search by domain mode
    domains.forEach(domain => {
        const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(cleanDomain)}?hl=${language}`;

        requests.push({
            url: searchUrl,
            userData: {
                searchString: cleanDomain,
                searchMode: 'domain',
            },
        });
    });
} else {
    // Search by terms mode
    searchTerms.forEach(term => {
        const query = location ? `${term} ${location}` : term;
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=${language}`;

        requests.push({
            url: searchUrl,
            userData: {
                searchString: query,
                searchMode: 'search',
            },
        });
    });
}

// Run crawler
console.log(`\n📍 Starting crawl with ${requests.length} search(es)...\n`);
await crawler.run(requests);

// Get Google Ads count if enabled
if (getGoogleAdsCount && googleAdsActorId && results.length > 0) {
    console.log('\n🎯 Fetching Google Ads counts...\n');

    try {
        const domainsToCheck = results
            .filter(r => r.domain)
            .map(r => r.domain);

        if (domainsToCheck.length > 0) {
            // Call the Google Ads Transparency actor
            const run = await Actor.call(googleAdsActorId, {
                domains: domainsToCheck,
                daysRange: 90,
                collectAdsList: false,
            });

            // Get results from the actor
            const adsDataset = await Actor.openDataset(run.defaultDatasetId);
            const adsData = await adsDataset.getData();

            // Create a map of domain -> adsCount
            const adsCountMap = {};
            adsData.items.forEach(item => {
                adsCountMap[item.domain] = item.adsCount || 0;
            });

            // Enrich results with ads count
            results.forEach(place => {
                if (place.domain && adsCountMap[place.domain] !== undefined) {
                    place.googleAdsCount = adsCountMap[place.domain];
                    place.hasActiveAds = adsCountMap[place.domain] > 0;
                }
            });

            // Update dataset with enriched data
            for (const place of results) {
                await Actor.pushData(place);
            }

            console.log(`✅ Enriched ${Object.keys(adsCountMap).length} places with Google Ads data`);
        }
    } catch (error) {
        console.error(`Error fetching Google Ads data: ${error.message}`);
    }
}

// Final summary
console.log('\n' + '='.repeat(60));
console.log('📊 SCRAPING COMPLETED');
console.log('='.repeat(60));
console.log(`Total places extracted: ${results.length}`);
console.log(`Places with website: ${results.filter(r => r.website).length}`);
console.log(`Places with phone: ${results.filter(r => r.phone).length}`);
console.log(`Places with active ads: ${results.filter(r => r.hasActiveAds).length}`);
console.log(`Average completeness score: ${Math.round(results.reduce((sum, r) => sum + r.completenessScore, 0) / results.length)}%`);
console.log('='.repeat(60));

await Actor.setValue('SUMMARY', {
    totalPlaces: results.length,
    placesWithWebsite: results.filter(r => r.website).length,
    placesWithPhone: results.filter(r => r.phone).length,
    placesWithActiveAds: results.filter(r => r.hasActiveAds).length,
    averageCompletenessScore: Math.round(results.reduce((sum, r) => sum + r.completenessScore, 0) / results.length),
    scrapedAt: new Date().toISOString(),
});

await Actor.exit();
