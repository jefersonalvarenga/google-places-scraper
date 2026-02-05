import { log } from 'apify';

import type { SocialProfile, SocialProfileType } from '../types.js';

async function fetchHtml(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok || res.status >= 400) return null;
    return await res.text();
  } catch (error) {
    log.debug('Failed to fetch page for social enrichment.', {
      url,
      errorMessage: (error as Error).message,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();

  const hrefRegex = /href\s*=\s*(["'])(.*?)\1/gi;
  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = hrefRegex.exec(html))) {
    const raw = match[2];
    if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) continue;

    try {
      const absolute = new URL(raw, baseUrl).toString();
      links.add(absolute);
    } catch {
      // ignore invalid URLs
    }
  }

  return Array.from(links);
}

function classifySocialProfile(urlStr: string): { type: SocialProfileType; url: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  if (host.includes('facebook.com')) {
    return { type: 'facebook', url: parsed.toString() };
  }
  if (host.includes('instagram.com')) {
    return { type: 'instagram', url: parsed.toString() };
  }
  if (host.includes('tiktok.com')) {
    return { type: 'tiktok', url: parsed.toString() };
  }
  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    return { type: 'youtube', url: parsed.toString() };
  }
  if (host.includes('twitter.com') || host === 'x.com') {
    return { type: 'twitter', url: parsed.toString() };
  }

  return null;
}

function deriveUsername(parsed: URL): string | null {
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (!segments.length) return null;
  return segments[0];
}

export async function enrichSocialProfiles(
  websiteUrl: string,
  enabledNetworks: SocialProfileType[],
  options?: { timeoutMs?: number },
): Promise<SocialProfile[]> {
  if (!websiteUrl || !enabledNetworks.length) return [];

  let base: URL;
  try {
    base = new URL(websiteUrl);
  } catch {
    return [];
  }

  const timeoutMs = options?.timeoutMs ?? 15000;

  const html = await fetchHtml(base.toString(), timeoutMs);
  if (!html) return [];

  const links = extractLinks(html, base.toString());

  const enabledSet = new Set<SocialProfileType>(enabledNetworks);

  const profileMap = new Map<string, SocialProfile>();

  for (const link of links) {
    const classified = classifySocialProfile(link);
    if (!classified) continue;
    if (!enabledSet.has(classified.type)) continue;

    let parsed: URL;
    try {
      parsed = new URL(classified.url);
    } catch {
      continue;
    }

    const key = `${classified.type}:${parsed.toString()}`;
    if (profileMap.has(key)) continue;

    const username = deriveUsername(parsed);

    const profile: SocialProfile = {
      type: classified.type,
      url: parsed.toString(),
      username,
      displayName: null,
      followersCount: undefined,
      extra: { source: 'website' },
    };

    profileMap.set(key, profile);
  }

  return Array.from(profileMap.values());
}
