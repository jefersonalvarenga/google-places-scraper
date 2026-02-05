import { log } from 'apify';

import type { ContactEnrichment } from '../types.js';

interface RobotsRules {
  disallow: string[];
}

interface ContactsEnrichmentResult {
  contacts: ContactEnrichment;
  contactPageUrls: string[];
}

const robotsCache = new Map<string, RobotsRules | null>();

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function getRobotsRules(origin: string, timeoutMs: number): Promise<RobotsRules | null> {
  if (robotsCache.has(origin)) {
    return robotsCache.get(origin) ?? null;
  }

  const robotsUrl = `${origin}/robots.txt`;

  try {
    const res = await fetchWithTimeout(robotsUrl, timeoutMs);
    if (!res.ok || res.status >= 400) {
      robotsCache.set(origin, null);
      return null;
    }

    const text = await res.text();
    const lines = text.split(/\r?\n/);
    const disallow: string[] = [];

    let inGenericSection = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const uaMatch = line.match(/^User-agent:\s*(.+)$/i);
      if (uaMatch) {
        const ua = uaMatch[1].trim();
        inGenericSection = ua === '*' ;
        continue;
      }

      if (!inGenericSection) continue;

      const disallowMatch = line.match(/^Disallow:\s*(.*)$/i);
      if (disallowMatch) {
        const path = disallowMatch[1].trim();
        if (path) disallow.push(path);
      }
    }

    const rules: RobotsRules = { disallow };
    robotsCache.set(origin, rules);
    return rules;
  } catch (error) {
    log.debug('Failed to fetch or parse robots.txt; assuming no restrictions for this origin.', {
      origin,
      errorMessage: (error as Error).message,
    });
    robotsCache.set(origin, null);
    return null;
  }
}

function isPathAllowed(pathname: string, rules: RobotsRules | null): boolean {
  if (!rules) return true;
  for (const dis of rules.disallow) {
    if (!dis) continue;
    if (dis === '/' || pathname.startsWith(dis)) {
      return false;
    }
  }
  return true;
}

async function fetchPageIfAllowed(url: string, timeoutMs: number): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const origin = `${parsed.protocol}//${parsed.host}`;
  const rules = await getRobotsRules(origin, timeoutMs);

  if (!isPathAllowed(parsed.pathname, rules)) {
    log.info('Skipping enrichment fetch due to robots.txt disallow rule.', { url });
    return null;
  }

  try {
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok || res.status >= 400) return null;

    const text = await res.text();
    return text;
  } catch (error) {
    log.debug('Failed to fetch page for contacts enrichment.', {
      url,
      errorMessage: (error as Error).message,
    });
    return null;
  }
}

function extractEmails(content: string): string[] {
  const emails = new Set<string>();
  const regex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(content))) {
    emails.add(match[0]);
  }
  return Array.from(emails);
}

function extractPhones(content: string): string[] {
  const phones = new Set<string>();
  const regex = /\+?[0-9][0-9() .-]{6,}/g;
  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(content))) {
    const cleaned = match[0].trim();
    if (cleaned.length >= 8) phones.add(cleaned);
  }
  return Array.from(phones);
}

export async function runContactsEnrichment(
  websiteUrl: string,
  options?: { timeoutMs?: number },
): Promise<ContactsEnrichmentResult | null> {
  if (!websiteUrl) return null;

  let base: URL;
  try {
    base = new URL(websiteUrl);
  } catch {
    return null;
  }

  const timeoutMs = options?.timeoutMs ?? 15000;

  const candidateUrls = new Set<string>();
  candidateUrls.add(base.toString());

  const origin = `${base.protocol}//${base.host}`;

  const contactPaths = ['/contact', '/contact-us', '/kontakt', '/kontakty'];
  const aboutPaths = ['/about', '/about-us', '/o-nas'];

  for (const path of [...contactPaths, ...aboutPaths]) {
    candidateUrls.add(origin + path);
  }

  const emailSet = new Set<string>();
  const phoneSet = new Set<string>();
  const contactPageUrls: string[] = [];

  let pagesFetched = 0;
  const MAX_PAGES = 3;

  for (const url of candidateUrls) {
    if (pagesFetched >= MAX_PAGES) break;

    const html = await fetchPageIfAllowed(url, timeoutMs);
    if (!html) continue;

    pagesFetched += 1;

    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('contact') || lowerUrl.includes('about')) {
      contactPageUrls.push(url);
    }

    for (const email of extractEmails(html)) {
      emailSet.add(email);
    }

    for (const phone of extractPhones(html)) {
      phoneSet.add(phone);
    }
  }

  if (!emailSet.size && !phoneSet.size && !contactPageUrls.length) {
    return null;
  }

  const contacts: ContactEnrichment = {
    emails: Array.from(emailSet),
    phones: Array.from(phoneSet),
    socialProfiles: [],
  };

  return {
    contacts,
    contactPageUrls,
  };
}
