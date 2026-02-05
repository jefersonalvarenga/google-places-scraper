import type { Page } from 'playwright';

import type { Place } from '../../types.js';
import { normalizePlaceUrl } from '../../utils/googleMaps.js';

interface RawPlaceDomData {
  title: string | null;
  primaryCategory: string | null;
  categories: string[];
  description: string | null;
  fullAddress: string | null;
  plusCode: string | null;
  phone: string | null;
  website: string | null;
  openingHours: Record<string, string[]> | null;
  priceLevel: string | null;
  permanentlyClosed: boolean;
  temporarilyClosed: boolean;
}

function parseStructuredAddress(fullAddress: string | null): {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
} {
  if (!fullAddress) return {};

  const parts = fullAddress
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) return {};

  let street: string | null | undefined;
  let city: string | null | undefined;
  let state: string | null | undefined;
  let postalCode: string | null | undefined;
  let country: string | null | undefined;

  if (parts.length === 1) {
    street = parts[0];
  } else if (parts.length === 2) {
    street = parts[0];
    country = parts[1];
  } else if (parts.length === 3) {
    street = parts[0];
    city = parts[1];
    country = parts[2];
  } else {
    street = parts[0];
    city = parts[1];
    const statePostal = parts[parts.length - 2];
    country = parts[parts.length - 1];

    const match = statePostal.match(/^(.*?)(\s+([A-Z0-9-]+))?$/);
    if (match) {
      state = match[1]?.trim() || null;
      postalCode = match[3]?.trim() || null;
    } else {
      state = statePostal;
    }
  }

  return {
    street: street ?? null,
    city: city ?? null,
    state: state ?? null,
    postalCode: postalCode ?? null,
    country: country ?? null,
  };
}

export async function parsePlaceDetail(page: Page): Promise<Place> {
  const url = page.url();
  const googleMapsUrl = normalizePlaceUrl(url);

  // Extract text content and simple structured data inside the page context.
  const raw = (await page.evaluate(() => {
    const getText = (selector: string): string | null => {
      const el = document.querySelector(selector);
      const text = el?.textContent?.trim();
      return text && text.length > 0 ? text : null;
    };

    const titleEl =
      document.querySelector('h1.DUwDvf') ||
      document.querySelector('h1[aria-level="1"]') ||
      document.querySelector('h1');
    const title = (titleEl?.textContent || '').trim() || null;

    // Categories: collect visible chips/buttons near the header.
    const categorySet = new Set<string>();

    const headerContainer = titleEl?.closest('div') ?? document.querySelector('div[role="main"]');
    if (headerContainer) {
      const possibleCategoryNodes = headerContainer.querySelectorAll(
        'button[aria-label*="category" i], button[jsaction*="pane.rating.category"], a[aria-label*="category" i]',
      );

      for (const node of Array.from(possibleCategoryNodes)) {
        const text = (node.textContent || '').trim();
        if (text) categorySet.add(text);
      }
    }

    // Fallback: small text line under the title often contains primary category and price range.
    const subtitleEl =
      headerContainer?.querySelector('button[aria-label*="reviews" i]') ||
      headerContainer?.querySelector('div[aria-label*="stars" i]') ||
      headerContainer?.querySelector('span');

    if (subtitleEl) {
      const subtitleText = (subtitleEl.textContent || '').trim();
      if (subtitleText && !categorySet.size) {
        const pieces = subtitleText.split('·').map((p) => p.trim());
        for (const piece of pieces) {
          if (piece.length > 0 && /[A-Za-z]/.test(piece)) {
            categorySet.add(piece);
          }
        }
      }
    }

    const categories = Array.from(categorySet);
    const primaryCategory = categories[0] ?? null;

    // Description: pick a short text block from the "About" style section if present.
    let description: string | null = null;
    const descriptionCandidates = document.querySelectorAll('div[aria-label*="About" i] div, section[aria-label*="About" i] div');
    for (const node of Array.from(descriptionCandidates)) {
      const text = (node.textContent || '').trim();
      if (text && text.length > 0 && text.length < 500) {
        description = text;
        break;
      }
    }

    // Use dedicated data-item-id attributes when present for address, phone, and website.
    const dataItemElements = Array.from(document.querySelectorAll('[data-item-id]')) as HTMLElement[];

    const getByDataItemId = (ids: string[]): HTMLElement | null => {
      for (const id of ids) {
        const found = dataItemElements.find((el) => el.getAttribute('data-item-id') === id);
        if (found) return found;
      }
      return null;
    };

    const addressEl =
      getByDataItemId(['address', 'address0', 'address1']) ||
      (document.querySelector('button[data-item-id="address"]') as HTMLElement | null);
    const fullAddress = (addressEl?.textContent || '').trim() || null;

    let plusCode: string | null = null;
    const plusCodeEl = getByDataItemId(['oloc', 'plus_code']);
    if (plusCodeEl) {
      const txt = plusCodeEl.textContent?.trim();
      if (txt && txt.length > 0) plusCode = txt;
    }

    const phoneEl =
      getByDataItemId(['phone:tel', 'phone']) ||
      (document.querySelector('button[aria-label^="Phone"]') as HTMLElement | null) ||
      (document.querySelector('a[href^="tel:"]') as HTMLElement | null);
    const phone = (phoneEl?.textContent || '').trim() || null;

    let website: string | null = null;
    const websiteContainer =
      getByDataItemId(['authority']) ||
      (document.querySelector('a[data-item-id="authority"]') as HTMLElement | null) ||
      (document.querySelector('a[aria-label*="website" i]') as HTMLElement | null);
    const websiteLink = websiteContainer?.querySelector('a[href^="http"]') as HTMLAnchorElement | null;
    if (websiteLink?.href) {
      website = websiteLink.href;
    }

    // Opening hours: attempt to read per-weekday rows from a table, fallback to a generic summary.
    const openingHours: Record<string, string[]> | null = {};
    let foundStructured = false;

    const hoursContainers = document.querySelectorAll(
      '[data-item-id*="hours"], div[aria-label*="Hours" i], section[aria-label*="Hours" i]',
    );

    for (const container of Array.from(hoursContainers)) {
      const table = container.querySelector('table');
      if (!table) continue;

      const rows = table.querySelectorAll('tr');
      for (const row of Array.from(rows)) {
        const cells = row.querySelectorAll('td, th');
        if (cells.length < 2) continue;
        const day = (cells[0].textContent || '').trim();
        const hoursText = (cells[1].textContent || '').trim();
        if (!day || !hoursText) continue;

        if (!openingHours[day]) openingHours[day] = [];
        openingHours[day].push(hoursText);
        foundStructured = true;
      }

      if (foundStructured) break;
    }

    if (!foundStructured) {
      const summaryEl =
        getByDataItemId(['hours']) ||
        (document.querySelector('button[aria-label*="Hours" i]') as HTMLElement | null);
      const summaryText = (summaryEl?.getAttribute('aria-label') || summaryEl?.textContent || '').trim();
      if (summaryText) {
        openingHours['general'] = [summaryText];
      }
    }

    if (!Object.keys(openingHours).length) {
      // Represent as null when nothing was found.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      return {
        title,
        primaryCategory,
        categories,
        description,
        fullAddress,
        plusCode,
        phone,
        website,
        openingHours: null,
        priceLevel: null,
        permanentlyClosed: false,
        temporarilyClosed: false,
      } as RawPlaceDomData;
    }

    // Price range: look for '$' symbols near the header / rating area.
    let priceLevel: string | null = null;
    const priceCandidates = headerContainer?.querySelectorAll('span, div');
    if (priceCandidates) {
      for (const node of Array.from(priceCandidates)) {
        const text = (node.textContent || '').trim();
        if (/^\${1,4}$/.test(text)) {
          priceLevel = text;
          break;
        }
      }
    }

    const bodyText = (document.body?.innerText || '').toLowerCase();
    const permanentlyClosed = bodyText.includes('permanently closed');
    const temporarilyClosed = bodyText.includes('temporarily closed');

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return {
      title,
      primaryCategory,
      categories,
      description,
      fullAddress,
      plusCode,
      phone,
      website,
      openingHours,
      priceLevel,
      permanentlyClosed,
      temporarilyClosed,
    } as RawPlaceDomData;
  })) as RawPlaceDomData;

  const addressParts = parseStructuredAddress(raw.fullAddress);

  // Derive coordinates and identifiers from URL when possible.
  let lat: number | null = null;
  let lng: number | null = null;
  let placeId: string | null = null;
  let cid: string | null = null;

  try {
    const parsed = new URL(url);
    const placeIdParam = parsed.searchParams.get('placeid');
    const cidParam = parsed.searchParams.get('cid');
    if (placeIdParam) placeId = placeIdParam;
    if (cidParam) cid = cidParam;

    const atMatch = parsed.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
    if (atMatch) {
      lat = Number(atMatch[1]);
      lng = Number(atMatch[2]);
    } else {
      const llMatch = parsed.pathname.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (llMatch) {
        lat = Number(llMatch[1]);
        lng = Number(llMatch[2]);
      }
    }
  } catch {
    // ignore URL parsing errors
  }

  const nowIso = new Date().toISOString();

  const place: Place = {
    id: placeId || cid || googleMapsUrl || 'unknown',
    searchJobId: undefined,
    title: raw.title,
    primaryCategory: raw.primaryCategory,
    categories: raw.categories,
    description: raw.description,
    address: {
      fullAddress: raw.fullAddress,
      street: addressParts.street,
      city: addressParts.city,
      state: addressParts.state,
      postalCode: addressParts.postalCode,
      country: addressParts.country,
    },
    location: {
      lat,
      lng,
    },
    plusCode: raw.plusCode,
    googleMapsUrl,
    placeId,
    cid,
    fid: null,
    phone: {
      formatted: raw.phone,
      e164: null,
    },
    website: raw.website,
    openingHours: raw.openingHours || undefined,
    popularTimesHistogram: undefined,
    priceLevel: raw.priceLevel,
    permanentlyClosed: raw.permanentlyClosed,
    temporarilyClosed: raw.temporarilyClosed,
    images: [],
    amenities: [],
    additionalInfo: {},
    peopleAlsoSearch: [],
    menuUrl: null,
    reservationLinks: [],
    bookingLinks: [],
    hotelData: null,
    reviewStats: undefined,
    enrichment: undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return place;
}
