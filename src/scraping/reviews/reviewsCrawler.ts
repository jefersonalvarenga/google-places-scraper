import { Actor } from 'apify';
import type { PlaywrightCrawlingContext } from 'crawlee';

import type { CrawlerRequestUserData, Review, ReviewsRequestUserData } from '../../types.js';
import { detectSoftBlock, extractPlaceIdFromUrl, normalizePlaceUrl } from '../../utils/googleMaps.js';
import { ReviewDeduper } from '../../utils/dedup.js';
import { incrementReviewsScraped } from '../../state.js';
import { parseVisibleReviews, type ParsedReview } from './reviewsParser.js';

const DEFAULT_MAX_REVIEWS = 5000;
const MAX_REVIEWS_PER_REQUEST = 5000;

const REVIEWS_CONTAINER_SELECTOR =
  'div[aria-label*="reviews" i], div[aria-label*="google reviews" i], div[role="main"]';

let reviewDeduperPromise: Promise<ReviewDeduper> | null = null;

async function getReviewDeduper(): Promise<ReviewDeduper> {
  if (!reviewDeduperPromise) {
    reviewDeduperPromise = ReviewDeduper.create();
  }
  return reviewDeduperPromise;
}

function buildReviewHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    const chr = input.charCodeAt(i);
    hash = (hash * 31 + chr) | 0;
  }
  return Math.abs(hash).toString(16);
}

function buildReviewUniqueKey(placeKey: string, review: ParsedReview): string {
  if (review.reviewId && review.reviewId.trim()) {
    return `place:${placeKey}::reviewId:${review.reviewId.trim()}`;
  }

  const base = `${placeKey}::${review.reviewerName || ''}::${review.text || ''}::${review.publishedAt || ''}`;
  const hash = buildReviewHash(base);
  return `place:${placeKey}::hash:${hash}`;
}

async function openReviewsPanel(page: any, crawlerLog: any): Promise<void> {
  const alreadyHasReviews = await page.$('div[data-review-id]');
  if (alreadyHasReviews) return;

  const selectors = [
    'button[aria-label*="reviews" i]',
    'button[jsaction*="pane.reviewChart.moreReviews"]',
    'a[href*="reviews"]',
  ];

  for (const selector of selectors) {
    const button = await page.$(selector);
    if (button) {
      await button.click();
      await page.waitForTimeout(1000);
      const hasList = await page.$('div[data-review-id]');
      if (hasList) {
        crawlerLog.info('Opened reviews panel using selector.', { selector });
        return;
      }
    }
  }

  crawlerLog.warning('Unable to reliably open reviews panel; proceeding with visible content only.');
}

async function scrollReviewsOnce(page: any): Promise<void> {
  await page.evaluate((selector: string) => {
    const container = document.querySelector(selector) as HTMLElement | null;
    if (container) {
      container.scrollBy(0, container.clientHeight || 400);
    } else {
      window.scrollBy(0, window.innerHeight || 400);
    }
  }, REVIEWS_CONTAINER_SELECTOR);
}

export async function handleReviewsRequest(
  context: PlaywrightCrawlingContext<CrawlerRequestUserData>,
): Promise<void> {
  const { request, page, log: crawlerLog, session, requestQueue } = context;

  const userData = request.userData as ReviewsRequestUserData | undefined;
  if (!userData || userData.requestType !== 'REVIEWS') {
    crawlerLog.warning('handleReviewsRequest called with non-REVIEWS userData; skipping.', {
      url: request.url,
      userData,
    });
    return;
  }

  const deduper = await getReviewDeduper();

  const maxReviews =
    typeof userData.maxReviews === 'number' && userData.maxReviews >= 0
      ? userData.maxReviews
      : DEFAULT_MAX_REVIEWS;

  const accumulatedCount = userData.accumulatedCount ?? 0;
  const targetForThisRequest = Math.min(maxReviews - accumulatedCount, MAX_REVIEWS_PER_REQUEST);

  if (targetForThisRequest <= 0) {
    crawlerLog.info('Max reviews for this place already reached before this request.', {
      placeId: userData.placeId,
      accumulatedCount,
      maxReviews,
    });
    return;
  }

  const rawUrl = userData.placeUrl || request.url;

  try {
    const currentUrl = page.url();
    if (!currentUrl || normalizePlaceUrl(currentUrl) !== normalizePlaceUrl(rawUrl)) {
      await page.goto(rawUrl, { waitUntil: 'networkidle' });
    }
  } catch (error) {
    crawlerLog.warning('Error while navigating to place page for reviews.', {
      url: rawUrl,
      errorMessage: (error as Error).message,
    });
  }

  const blockedBefore = await detectSoftBlock(page);
  if (blockedBefore) {
    crawlerLog.warning('Soft block detected before opening reviews; will retry with new session.', {
      url: rawUrl,
    });
    if (session) session.markBad();
    throw new Error('Soft block detected on place page before reviews.');
  }

  await openReviewsPanel(page, crawlerLog);

  try {
    await page.waitForSelector('div[data-review-id]', { timeout: 30000 });
  } catch (error) {
    crawlerLog.warning('No review cards found after opening reviews panel.', {
      url: rawUrl,
      errorMessage: (error as Error).message,
    });
    return;
  }

  const placeKeyFromUrl = extractPlaceIdFromUrl(rawUrl) || normalizePlaceUrl(rawUrl);
  const placeIdForRecord = userData.placeId || placeKeyFromUrl || rawUrl;

  const dataset = await Actor.openDataset<Review>('reviews');

  let scrapedThisRequest = 0;
  let stagnantIterations = 0;
  let previousTotalNew = 0;

  const buffer: Review[] = [];

  const flushBuffer = async (): Promise<void> => {
    if (buffer.length === 0) return;
    await dataset.pushData(buffer.splice(0, buffer.length));
  };

  for (let i = 0; i < 100; i += 1) {
    const parsed = await parseVisibleReviews(page);

    let newInThisIteration = 0;
    const nowIso = new Date().toISOString();

    for (const parsedReview of parsed) {
      const uniqueKey = buildReviewUniqueKey(placeIdForRecord, parsedReview);
      const isDup = await deduper.isDuplicate(uniqueKey);
      if (isDup) continue;

      if (scrapedThisRequest >= targetForThisRequest) {
        break;
      }

      const review: Review = {
        id: parsedReview.reviewId ?? uniqueKey,
        placeId: placeIdForRecord,
        searchJobId: userData.searchJobId,
        reviewerName: parsedReview.reviewerName ?? null,
        reviewerProfileUrl: parsedReview.reviewerProfileUrl ?? null,
        reviewerPhotoUrl: parsedReview.reviewerPhotoUrl ?? null,
        text: parsedReview.text ?? null,
        rating: parsedReview.rating ?? null,
        likesCount: parsedReview.likesCount ?? null,
        isLocalGuide: parsedReview.isLocalGuide ?? false,
        reviewImages: parsedReview.reviewImages ?? [],
        ownerResponse: parsedReview.ownerResponse ?? null,
        publishedAt: parsedReview.publishedAt ?? undefined,
        scrapedAt: nowIso,
      };

      buffer.push(review);
      scrapedThisRequest += 1;
      newInThisIteration += 1;

      if (buffer.length >= 100) {
        await flushBuffer();
      }

      if (scrapedThisRequest >= targetForThisRequest) {
        break;
      }
    }

    if (scrapedThisRequest >= targetForThisRequest) {
      crawlerLog.info('Reached per-request review limit for this place.', {
        placeId: placeIdForRecord,
        scrapedThisRequest,
        accumulatedCount,
        maxReviews,
      });
      break;
    }

    if (newInThisIteration === 0) {
      stagnantIterations += 1;
    } else {
      stagnantIterations = 0;
    }

    if (stagnantIterations >= 3) {
      crawlerLog.info('No new reviews loaded after multiple scrolls; assuming end of list.', {
        placeId: placeIdForRecord,
        scrapedThisRequest,
      });
      break;
    }

    await scrollReviewsOnce(page);

    const delay = 500 + Math.floor(Math.random() * 500);
    await page.waitForTimeout(delay);

    const blockedDuring = await detectSoftBlock(page);
    if (blockedDuring) {
      crawlerLog.warning('Soft block detected while scrolling reviews; will retry with new session.', {
        url: rawUrl,
      });
      if (session) session.markBad();
      throw new Error('Soft block detected while scrolling reviews.');
    }

    previousTotalNew += newInThisIteration;
  }

  await flushBuffer();

  const totalAfter = accumulatedCount + scrapedThisRequest;

  if (scrapedThisRequest > 0) {
    incrementReviewsScraped(scrapedThisRequest);
  }

  crawlerLog.info('Finished REVIEWS request for place.', {
    placeId: placeIdForRecord,
    scrapedThisRequest,
    totalAfter,
    maxReviews,
  });

  if (scrapedThisRequest >= targetForThisRequest && totalAfter < maxReviews) {
    const nextOffset = (userData.offset ?? 0) + scrapedThisRequest;

    await (requestQueue as any).addRequest({
      url: rawUrl,
      uniqueKey: `${rawUrl}::reviews::${nextOffset}`,
      userData: {
        requestType: 'REVIEWS',
        placeId: userData.placeId ?? placeIdForRecord,
        placeUrl: rawUrl,
        offset: nextOffset,
        accumulatedCount: totalAfter,
        maxReviews,
        searchJobId: userData.searchJobId,
      } satisfies ReviewsRequestUserData,
    });

    crawlerLog.info('Enqueued follow-up REVIEWS request for place.', {
      placeId: placeIdForRecord,
      nextOffset,
      totalAfter,
      maxReviews,
    });
  }
}
