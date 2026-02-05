import type { Page } from 'playwright';

import type { TileDescriptor } from '../../utils/geometry.js';
import { detectSoftBlock } from '../../utils/googleMaps.js';

export interface SidebarPlaceSummary {
  title: string | null;
  category: string | null;
  placeUrl: string | null;
}

const SIDEBAR_CONTAINER_SELECTOR = 'div[role="feed"]';

async function waitForSidebar(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForSelector(SIDEBAR_CONTAINER_SELECTOR, { timeout: 30000 });
}

async function extractSidebarPlaces(page: Page): Promise<SidebarPlaceSummary[]> {
  const places = await page.$$eval(
    SIDEBAR_CONTAINER_SELECTOR,
    (containers: Element[]): SidebarPlaceSummary[] => {
      const items: SidebarPlaceSummary[] = [];

      for (const container of containers) {
        const itemNodes = container.querySelectorAll('div[role="article"], div[jsaction][data-result-id]');

        for (const node of Array.from(itemNodes)) {
          const item = node as HTMLElement;

          const titleEl =
            (item.querySelector('[role="heading"]') as HTMLElement | null) ||
            (item.querySelector('h3') as HTMLElement | null) ||
            (item.querySelector('div[aria-level="3"]') as HTMLElement | null);

          const rawTitle = (titleEl?.textContent || item.getAttribute('aria-label') || '').trim();
          const title = rawTitle || null;

          const categoryEl = item.querySelector('span[aria-hidden="true"], span[jsinstance]') as
            | HTMLElement
            | null;
          const category = (categoryEl?.textContent || '').trim() || null;

          const link = item.querySelector('a[href*="/maps/place"]') as HTMLAnchorElement | null;
          const placeUrl = link?.href || null;

          if (!placeUrl && !title) continue;

          items.push({
            title,
            category,
            placeUrl,
          });
        }
      }

      return items;
    },
  );

  return places;
}

async function scrollSidebarOnce(page: Page): Promise<void> {
  await page.evaluate((selector: string) => {
    const container = document.querySelector(selector) as HTMLElement | null;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
  }, SIDEBAR_CONTAINER_SELECTOR);
}

export async function collectSidebarPlacesWithScrolling(params: {
  page: Page;
  url: string;
  tile: TileDescriptor;
  maxPlacesPerSearch: number;
  crawlerLog: any;
}): Promise<SidebarPlaceSummary[]> {
  const { page, url, tile, maxPlacesPerSearch, crawlerLog } = params;

  await page.goto(url, { waitUntil: 'networkidle' });

  const blocked = await detectSoftBlock(page);
  if (blocked) {
    throw new Error('Soft block or captcha detected before sidebar load.');
  }

  await waitForSidebar(page);

  const allPlaces: SidebarPlaceSummary[] = [];
  const seenUrls = new Set<string>();

  let previousCount = 0;
  let stagnantIterations = 0;

  for (let i = 0; i < 50; i += 1) {
    const places = await extractSidebarPlaces(page);

    for (const place of places) {
      if (!place.placeUrl) continue;
      if (seenUrls.has(place.placeUrl)) continue;

      seenUrls.add(place.placeUrl);
      allPlaces.push(place);

      if (allPlaces.length >= maxPlacesPerSearch) {
        break;
      }
    }

    const currentCount = allPlaces.length;

    if (currentCount >= maxPlacesPerSearch) {
      break;
    }

    if (currentCount === previousCount) {
      stagnantIterations += 1;
    } else {
      stagnantIterations = 0;
    }

    if (stagnantIterations >= 3) {
      crawlerLog.info('No new sidebar items loaded after scrolling; stopping scroll.', {
        tileId: tile.id,
        currentCount,
      });
      break;
    }

    await scrollSidebarOnce(page);

    const delay = 500 + Math.floor(Math.random() * 500);
    await page.waitForTimeout(delay);

    const softBlocked = await detectSoftBlock(page);
    if (softBlocked) {
      throw new Error('Soft block or captcha detected during sidebar scrolling.');
    }

    previousCount = currentCount;
  }

  crawlerLog.info('Collected sidebar places from tile.', {
    tileId: tile.id,
    placeCount: allPlaces.length,
  });

  return allPlaces.slice(0, maxPlacesPerSearch);
}
