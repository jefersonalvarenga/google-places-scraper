import type { Lead } from '../types.js';

interface LeadsEnrichmentOptions {
  timeoutMs?: number;
  maxPages?: number;
}

interface LeadsEnrichmentResult {
  leads: Lead[];
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok || res.status >= 400) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    const chr = input.charCodeAt(i);
    hash = (hash * 31 + chr) | 0;
  }
  return Math.abs(hash).toString(16);
}

function extractLinkedInLeads(html: string, pageUrl: string, placeId: string): Lead[] {
  const leads: Lead[] = [];
  const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = anchorRegex.exec(html))) {
    const href = match[1];
    const textRaw = match[2] || '';

    let absolute: URL;
    try {
      absolute = new URL(href, pageUrl);
    } catch {
      continue;
    }

    const host = absolute.hostname.toLowerCase();
    if (!host.includes('linkedin.com')) continue;

    const urlStr = absolute.toString();

    const text = textRaw.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
    if (!text) continue;

    let fullName: string | null = null;
    let jobTitle: string | null = null;

    const parts = text.split(/[|•\-–—:,]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 1) {
      fullName = parts[0];
    } else if (parts.length >= 2) {
      [fullName, jobTitle] = parts;
    }

    const idBase = `${placeId}::${urlStr}::${text}`;
    const id = `lead:${buildHash(idBase)}`;

    const lead: Lead = {
      id,
      placeId,
      fullName: fullName || null,
      jobTitle: jobTitle || null,
      department: null,
      linkedinUrl: urlStr,
      email: null,
      phone: null,
      companySize: null,
      industry: null,
      sourceUrl: pageUrl,
    };

    leads.push(lead);
  }

  return leads;
}

export async function runLeadsEnrichment(
  websiteUrl: string,
  placeId: string,
  options?: LeadsEnrichmentOptions,
): Promise<LeadsEnrichmentResult | null> {
  if (!websiteUrl) return null;

  let base: URL;
  try {
    base = new URL(websiteUrl);
  } catch {
    return null;
  }

  const timeoutMs = options?.timeoutMs ?? 15000;
  const maxPages = options?.maxPages ?? 3;

  const origin = `${base.protocol}//${base.host}`;

  const candidateUrls = new Set<string>();
  candidateUrls.add(base.toString());

  const teamPaths = ['/team', '/our-team', '/about', '/about-us', '/leadership', '/staff'];
  for (const path of teamPaths) {
    candidateUrls.add(origin + path);
  }

  const allLeadsMap = new Map<string, Lead>();

  let fetchedPages = 0;

  for (const url of candidateUrls) {
    if (fetchedPages >= maxPages) break;

    const html = await fetchWithTimeout(url, timeoutMs);
    if (!html) continue;

    fetchedPages += 1;

    const leads = extractLinkedInLeads(html, url, placeId);
    for (const lead of leads) {
      if (!allLeadsMap.has(lead.id)) {
        allLeadsMap.set(lead.id, lead);
      }
    }

    if (allLeadsMap.size >= 100) {
      break;
    }
  }

  if (!allLeadsMap.size) return null;

  return {
    leads: Array.from(allLeadsMap.values()),
  };
}
