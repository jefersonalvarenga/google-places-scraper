import { Actor } from 'apify';
import type { PlaywrightCrawlingContext } from 'crawlee';

import type { CrawlerRequestUserData, Lead, Place, PlaceDetailUserData, ReviewsRequestUserData } from '../../types.js';
import { normalizePlaceUrl, detectSoftBlock, extractPlaceIdFromUrl } from '../../utils/googleMaps.js';
import { parsePlaceDetail } from './placeParser.js';
import {
  getGlobalInput,
  incrementPlacesScraped,
  incrementContactsEnriched,
  incrementSocialProfilesEnriched,
  incrementLeadsEnriched,
} from '../../state.js';
import { runContactsEnrichment } from '../../enrichment/contactsEnrichment.js';
import { enrichSocialProfiles } from '../../enrichment/socialEnrichment.js';
import { runLeadsEnrichment } from '../../enrichment/leadsEnrichment.js';

export async function handlePlaceDetailRequest(
  context: PlaywrightCrawlingContext<CrawlerRequestUserData>,
): Promise<void> {
  const { request, page, log: crawlerLog, session, requestQueue } = context;

  const userData = request.userData as PlaceDetailUserData | undefined;
  if (!userData || userData.requestType !== 'PLACE_DETAIL') {
    crawlerLog.warning('handlePlaceDetailRequest called with non-PLACE_DETAIL userData; skipping.', {
      url: request.url,
      userData,
    });
    return;
  }

  const targetUrl = request.url;

  try {
    const currentUrl = page.url();
    if (!currentUrl || currentUrl === 'about:blank') {
      await page.goto(targetUrl, { waitUntil: 'networkidle' });
    }
  } catch (error) {
    crawlerLog.warning('Error while ensuring navigation to place detail URL.', {
      url: targetUrl,
      errorMessage: (error as Error).message,
    });
  }

  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await page.waitForTimeout(1000);
  } catch (error) {
    crawlerLog.warning('Timeout while waiting for place detail panel to load.', {
      url: targetUrl,
      errorMessage: (error as Error).message,
    });
  }

  const softBlocked = await detectSoftBlock(page);
  if (softBlocked) {
    crawlerLog.warning('Soft block or captcha detected on place detail page; will retry with a new session.', {
      url: targetUrl,
    });
    if (session) {
      session.markBad();
    }
    throw new Error('Soft block detected on place detail page.');
  }

  let place: Place;

  try {
    place = await parsePlaceDetail(page);
  } catch (error) {
    crawlerLog.error('Failed to parse place detail; skipping this place.', {
      url: targetUrl,
      errorMessage: (error as Error).message,
    });
    return;
  }

  const pageUrl = page.url();
  const canonicalUrl = normalizePlaceUrl(pageUrl);

  let placeId = userData.placeId ?? place.placeId ?? null;
  let cid = place.cid ?? null;

  try {
    const parsed = new URL(pageUrl);
    const placeIdParam = parsed.searchParams.get('placeid');
    const cidParam = parsed.searchParams.get('cid');
    if (placeIdParam) placeId = placeIdParam;
    if (cidParam) cid = cidParam;
  } catch {
    // ignore URL parsing issues
  }

  const scrapedAt = new Date().toISOString();

  const finalPlace: Place = {
    ...place,
    id: placeId || cid || place.id || canonicalUrl || 'unknown',
    searchJobId: userData.searchJobId,
    googleMapsUrl: canonicalUrl,
    placeId: placeId ?? null,
    cid: cid ?? null,
    updatedAt: scrapedAt,
  };

  const input = getGlobalInput();

  if (input.enrichContacts && finalPlace.website) {
    try {
      const contactsResult = await runContactsEnrichment(finalPlace.website, { timeoutMs: 15000 });
      if (contactsResult) {
        finalPlace.enrichment = {
          ...(finalPlace.enrichment ?? {}),
          contacts: contactsResult.contacts,
        };

        finalPlace.additionalInfo = {
          ...(finalPlace.additionalInfo ?? {}),
          contactPageUrls: contactsResult.contactPageUrls,
        };

        incrementContactsEnriched(1);
      }
    } catch (error) {
      crawlerLog.warning('Contacts enrichment failed for place.', {
        url: finalPlace.googleMapsUrl,
        errorMessage: (error as Error).message,
      });
    }
  }

  if (input.enrichLeads && finalPlace.website) {
    try {
      const leadsResult = await runLeadsEnrichment(finalPlace.website, finalPlace.placeId || finalPlace.id, {
        timeoutMs: 15000,
        maxPages: 3,
      });

      if (leadsResult && leadsResult.leads.length) {
        const leadsDataset = await Actor.openDataset<Lead>('leads');
        await leadsDataset.pushData(leadsResult.leads);

        const existingLeads = finalPlace.enrichment?.leads ?? [];
        const mergedLeads = [...existingLeads, ...leadsResult.leads];

        finalPlace.enrichment = {
          ...(finalPlace.enrichment ?? {}),
          leads: mergedLeads,
        };

        incrementLeadsEnriched(leadsResult.leads.length);
      }
    } catch (error) {
      crawlerLog.warning('Leads enrichment failed for place.', {
        url: finalPlace.googleMapsUrl,
        errorMessage: (error as Error).message,
      });
    }
  }

  if (input.enrichSocialProfiles.length && finalPlace.website) {
    try {
      const profiles = await enrichSocialProfiles(
        finalPlace.website,
        input.enrichSocialProfiles,
        { timeoutMs: 15000 },
      );

      if (profiles.length) {
        const existing = finalPlace.enrichment?.socialProfiles ?? [];
        const merged = [...existing, ...profiles];

        finalPlace.enrichment = {
          ...(finalPlace.enrichment ?? {}),
          socialProfiles: merged,
        };

        incrementSocialProfilesEnriched(merged.length);
      }
    } catch (error) {
      crawlerLog.warning('Social enrichment failed for place.', {
        url: finalPlace.googleMapsUrl,
        errorMessage: (error as Error).message,
      });
    }
  }

  if (!finalPlace.title || !finalPlace.location?.lat || !finalPlace.location?.lng) {
    crawlerLog.warning('Place detail is missing some critical fields.', {
      url: canonicalUrl,
      title: finalPlace.title,
      hasLocation: Boolean(finalPlace.location && finalPlace.location.lat && finalPlace.location.lng),
    });
  }

  const dataset = await Actor.openDataset<Place>('places');
  await dataset.pushData(finalPlace);

  incrementPlacesScraped(1);

  crawlerLog.info('Saved place detail.', {
    placeId: finalPlace.placeId,
    cid: finalPlace.cid,
    title: finalPlace.title,
    url: finalPlace.googleMapsUrl,
  });

  if (input.extractReviews && input.maxReviews > 0) {
    const placeKeyFromUrl = extractPlaceIdFromUrl(finalPlace.googleMapsUrl || request.url);
    const placeIdForReviews = finalPlace.placeId || placeKeyFromUrl || finalPlace.id;

    const reviewsUserData: ReviewsRequestUserData = {
      requestType: 'REVIEWS',
      placeId: placeIdForReviews,
      placeUrl: finalPlace.googleMapsUrl || request.url,
      offset: 0,
      accumulatedCount: 0,
      maxReviews: input.maxReviews,
      searchJobId: userData.searchJobId,
    };

    await (requestQueue as any).addRequest({
      url: finalPlace.googleMapsUrl || request.url,
      uniqueKey: `${finalPlace.googleMapsUrl || request.url}::reviews::0`,
      userData: reviewsUserData,
    });

    crawlerLog.info('Enqueued REVIEWS request for place.', {
      placeId: placeIdForReviews,
      maxReviews: input.maxReviews,
    });
  }
}
