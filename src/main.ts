import { Actor, log } from 'apify';
import { PlaywrightCrawler, type PlaywrightCrawlingContext } from 'crawlee';

import { normalizeInput, type NormalizedInput } from './config.js';
import type {
  ActorInput,
  CrawlerRequestUserData,
  SearchRequestUserData,
} from './types.js';
import { createSearchHandlerContext, handleSearchRequest } from './scraping/search/searchRunner.js';
import { handlePlaceDetailRequest } from './scraping/places/placeCrawler.js';
import { handleReviewsRequest } from './scraping/reviews/reviewsCrawler.js';
import { setGlobalInput, getSummaryStats } from './state.js';

await Actor.main(async () => {
  const rawInput = await Actor.getInput<ActorInput>();
  const input: NormalizedInput = normalizeInput(rawInput);

  setGlobalInput(input);

  log.info('Google Maps Scraper skeleton starting', {
    searchJobCount: input.searchJobs.length,
    extractReviews: input.extractReviews,
    extractImages: input.extractImages,
    enrichContacts: input.enrichContacts,
    enrichLeads: input.enrichLeads,
    enrichSocialProfiles: input.enrichSocialProfiles,
  });

  const requestQueue = await Actor.openRequestQueue();

  if (input.searchJobs.length === 0) {
    log.warning('No search jobs could be created from the provided input. Actor will exit.');
    return;
  }

  // Enqueue one placeholder SEARCH request per search job.
  for (const job of input.searchJobs) {
    const url = 'https://www.google.com/maps';

    const userData: SearchRequestUserData = {
      requestType: 'SEARCH',
      searchJobId: job.id,
      searchJob: job,
    };

    await requestQueue.addRequest({
      url,
      uniqueKey: `${job.id}::${url}`,
      userData,
    });
  }

  const proxyConfiguration = await Actor.createProxyConfiguration(input.proxy);

  const searchHandlerContext = await createSearchHandlerContext(input);

  const crawler = new PlaywrightCrawler({
    requestQueue,
    proxyConfiguration,
    useSessionPool: true,
    maxRequestRetries: 2,
    launchContext: {
      launchOptions: {
        headless: true,
      },
    },
    requestHandler: async (
      context: PlaywrightCrawlingContext,
    ): Promise<void> => {
      const { request, log: crawlerLog } = context;

      const userData = request.userData as CrawlerRequestUserData | undefined;

      if (!userData || !userData.requestType) {
        crawlerLog.warning('Request is missing userData.requestType; skipping.', {
          url: request.url,
          userData,
        });
        return;
      }

      const { requestType } = userData;

      crawlerLog.info(`Processing ${requestType} request`, {
        url: request.url,
        searchJobId: userData.searchJobId,
      });

      switch (requestType) {
        case 'SEARCH': {
          await handleSearchRequest(
            context as PlaywrightCrawlingContext<CrawlerRequestUserData>,
            searchHandlerContext,
          );
          break;
        }
        case 'PLACE_DETAIL': {
          await handlePlaceDetailRequest(
            context as PlaywrightCrawlingContext<CrawlerRequestUserData>,
          );
          break;
        }
        case 'REVIEWS': {
          await handleReviewsRequest(
            context as PlaywrightCrawlingContext<CrawlerRequestUserData>,
          );
          break;
        }
        default: {
          // This should not happen if types are respected.
          crawlerLog.warning('Unknown request type encountered; request will be skipped.', {
            requestType,
            userData,
          });
        }
      }
    },
    failedRequestHandler: async (context: any) => {
      const { request, log: crawlerLog } = context;

      crawlerLog.error('Request failed too many times and will be dropped.', {
        url: request.url,
        userData: request.userData,
      });
    },
  });

  await crawler.run();

  const summary = getSummaryStats();

  log.info('Google Maps Scraper finished.', {
    placesScraped: summary.placesScraped,
    reviewsScraped: summary.reviewsScraped,
    enrichmentStats: summary.enrichmentStats,
  });
});
