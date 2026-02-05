import type { Page } from 'playwright';

import type { LatLng } from './geometry.js';

export interface SearchUrlBuildParams {
  searchTerm?: string;
  category?: string;
  tileCenter?: LatLng;
  zoom?: number;
  language: string;
}

export function buildSearchUrl(params: SearchUrlBuildParams): string {
  const { searchTerm, category, tileCenter, zoom, language } = params;

  const queryParts: string[] = [];
  if (searchTerm && searchTerm.trim()) queryParts.push(searchTerm.trim());
  if (category && category.trim()) queryParts.push(category.trim());

  const query = queryParts.join(' ').trim();
  const encodedQuery = encodeURIComponent(query);

  let url = 'https://www.google.com/maps/search/';
  if (encodedQuery) {
    url += `${encodedQuery}/`;
  }

  if (tileCenter && typeof zoom === 'number') {
    url += `@${tileCenter.lat},${tileCenter.lng},${zoom.toFixed(0)}z`;
  }

  const paramsObj = new URLSearchParams();
  if (language) paramsObj.set('hl', language);

  const queryString = paramsObj.toString();
  if (queryString) {
    url += `?${queryString}`;
  }

  return url;
}

export function normalizePlaceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

export function extractPlaceIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const placeIdFromQuery = parsed.searchParams.get('placeid');
    if (placeIdFromQuery) return placeIdFromQuery;
  } catch {
    // ignore
  }

  const match = url.match(/!1s([^!]+)!8m/);
  if (match && match[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  const cidMatch = url.match(/[?&]cid=(\d+)/);
  if (cidMatch && cidMatch[1]) {
    return cidMatch[1];
  }

  return null;
}

export function buildPlaceUniqueKey(params: {
  placeId?: string | null;
  placeUrl?: string | null;
}): string | null {
  const { placeId, placeUrl } = params;

  if (placeId && placeId.trim()) {
    const sanitizedId = placeId.replace(/:/g, '-');
    return `placeId-${sanitizedId}`;
  }

  if (placeUrl && placeUrl.trim()) {
    const normalized = normalizePlaceUrl(placeUrl);
    const urlKey = Buffer.from(normalized).toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 100);
    return `url-${urlKey}`;
  }

  return null;
}

export async function detectSoftBlock(page: Page): Promise<boolean> {
  const bodyText = (await page.evaluate(() => document.body?.innerText || '')) as string;
  const lower = bodyText.toLowerCase();

  if (lower.includes('unusual traffic') || lower.includes('our systems have detected unusual traffic')) {
    return true;
  }

  const captchaFrame = await page.$('iframe[src*="recaptcha"], iframe[title*="captcha" i]');
  if (captchaFrame) {
    return true;
  }

  const captchaText = await page.$('text=/captcha/i');
  if (captchaText) {
    return true;
  }

  return false;
}
