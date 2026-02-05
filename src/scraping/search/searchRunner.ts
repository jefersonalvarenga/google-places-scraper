import type { PlaywrightCrawlingContext } from 'crawlee';

import type { NormalizedInput } from '../../config.js';
import type {
  CrawlerRequestUserData,
  PlaceDetailUserData,
  SearchRequestUserData,
} from '../../types.js';
import { generateTilesForSearchJob } from './tileGenerator.js';
import { collectSidebarPlacesWithScrolling } from './sidebarParser.js';
import { buildSearchUrl, buildPlaceUniqueKey, extractPlaceIdFromUrl } from '../../utils/googleMaps.js';
import { PlaceDeduper } from '../../utils/dedup.js';

export interface SearchHandlerContext {
  input: NormalizedInput;
  deduper: PlaceDeduper;
}

export async function createSearchHandlerContext(input: NormalizedInput): Promise<SearchHandlerContext> {
  const deduper = await PlaceDeduper.create();
  return { input, deduper };
}

export async function handleSearchRequest(
  context: PlaywrightCrawlingContext<CrawlerRequestUserData>,
  searchContext: SearchHandlerContext,
): Promise<void> {
  const { request, page, log: crawlerLog, requestQueue, session } = context;

  const userData = request.userData as SearchRequestUserData | undefined;

  if (!userData || !userData.searchJob) {
    crawlerLog.warning('SEARCH request is missing searchJob in userData; skipping.', {
      url: request.url,
      userData,
    });
    return;
  }

  const searchJob = userData.searchJob;

  const tiles = generateTilesForSearchJob(searchJob);

  crawlerLog.info('Generated tiles for search job.', {
    searchJobId: searchJob.id,
    tileCount: tiles.length,
  });

  let enqueuedPlaces = 0;

  for (const tile of tiles) {
    if (enqueuedPlaces >= searchJob.maxCrawledPlacesPerSearch) {
      break;
    }

    const termParts: string[] = [];
    if (searchJob.searchTerm) termParts.push(searchJob.searchTerm);
    if (searchJob.locationText) termParts.push(searchJob.locationText);

    const effectiveSearchTerm = termParts.join(' ').trim() || undefined;

    const url = buildSearchUrl({
      searchTerm: effectiveSearchTerm,
      category: searchJob.category,
      tileCenter: tile.center,
      zoom: tile.zoom,
      language: searchJob.language,
    });

    crawlerLog.info('Processing tile for search job.', {
      searchJobId: searchJob.id,
      tileId: tile.id,
      url,
    });

    let sidebarPlaces;
    try {
      sidebarPlaces = await collectSidebarPlacesWithScrolling({
        page,
        url,
        tile,
        maxPlacesPerSearch: searchJob.maxCrawledPlacesPerSearch,
        crawlerLog,
      });
    } catch (error) {
      crawlerLog.warning('Tile processing failed, will mark session as bad and retry request.', {
        searchJobId: searchJob.id,
        tileId: tile.id,
        errorMessage: (error as Error).message,
      });

      if (session) {
        session.markBad();
      }

      throw error;
    }

    crawlerLog.info('Discovered places from tile.', {
      searchJobId: searchJob.id,
      tileId: tile.id,
      sidebarPlaceCount: sidebarPlaces.length,
    });

    for (const place of sidebarPlaces) {
      if (!place.placeUrl) continue;

      const placeUrl = place.placeUrl;
      const placeId = extractPlaceIdFromUrl(placeUrl);
      const uniqueKey = buildPlaceUniqueKey({ placeId, placeUrl });

      if (!uniqueKey) continue;

      const isDup = await searchContext.deduper.isDuplicate(uniqueKey);
      if (isDup) {
        continue;
      }

      const userDataForPlace: PlaceDetailUserData = {
        requestType: 'PLACE_DETAIL',
        searchJobId: searchJob.id,
        placeId: placeId ?? undefined,
        placeUrl,
      };

      await (requestQueue as any).addRequest({
        url: placeUrl,
        uniqueKey,
        userData: userDataForPlace,
      });

      enqueuedPlaces += 1;

      if (enqueuedPlaces >= searchJob.maxCrawledPlacesPerSearch) {
        crawlerLog.info('Reached maxCrawledPlacesPerSearch for search job; stopping.', {
          searchJobId: searchJob.id,
          enqueuedPlaces,
        });
        break;
      }
    }
  }

  crawlerLog.info('Finished SEARCH job.', {
    searchJobId: searchJob.id,
    tileCount: tiles.length,
    enqueuedPlaces,
  });
}
