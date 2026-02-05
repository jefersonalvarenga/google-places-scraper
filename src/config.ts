import { log } from 'apify';
import type {
  ActorInput,
  GeoJsonGeometry,
  ProxyInputConfig,
  SearchJob,
  SocialProfileType,
} from './types.js';

export interface NormalizedInput {
  searchTerms: string[];
  categories: string[];
  location?: string;
  customGeolocation?: GeoJsonGeometry;
  maxCrawledPlacesPerSearch: number;
  language: string;
  extractReviews: boolean;
  maxReviews: number;
  extractImages: boolean;
  enrichContacts: boolean;
  enrichLeads: boolean;
  enrichSocialProfiles: SocialProfileType[];
  proxy?: ProxyInputConfig;
  searchJobs: SearchJob[];
}

const DEFAULT_MAX_CRAWLED_PLACES_PER_SEARCH = 500;
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_MAX_REVIEWS = 5000;

export function normalizeInput(rawInput: ActorInput | null | undefined): NormalizedInput {
  const input: ActorInput = rawInput ?? {};

  const searchTerms = Array.isArray(input.searchTerms)
    ? input.searchTerms.filter((s) => typeof s === 'string' && s.trim().length > 0)
    : [];

  const categories = Array.isArray(input.categories)
    ? input.categories.filter((s) => typeof s === 'string' && s.trim().length > 0)
    : [];

  const location = typeof input.location === 'string' && input.location.trim().length > 0
    ? input.location.trim()
    : undefined;

  const maxCrawledPlacesPerSearch =
    typeof input.maxCrawledPlacesPerSearch === 'number' && input.maxCrawledPlacesPerSearch > 0
      ? Math.floor(input.maxCrawledPlacesPerSearch)
      : DEFAULT_MAX_CRAWLED_PLACES_PER_SEARCH;

  const language =
    typeof input.language === 'string' && input.language.trim().length > 0
      ? input.language.trim()
      : DEFAULT_LANGUAGE;

  const extractReviews = input.extractReviews !== false;

  const maxReviews =
    typeof input.maxReviews === 'number' && input.maxReviews >= 0
      ? Math.floor(input.maxReviews)
      : DEFAULT_MAX_REVIEWS;

  const extractImages = input.extractImages !== false;
  const enrichContacts = input.enrichContacts === true;
  const enrichLeads = input.enrichLeads === true;

  const validSocialTypes: SocialProfileType[] = [
    'facebook',
    'instagram',
    'tiktok',
    'youtube',
    'twitter',
  ];

  const enrichSocialProfiles = Array.isArray(input.enrichSocialProfiles)
    ? input.enrichSocialProfiles.filter((t): t is SocialProfileType =>
        typeof t === 'string' && validSocialTypes.includes(t as SocialProfileType),
      )
    : [];

  const proxy: ProxyInputConfig | undefined =
    input.proxy && typeof input.proxy === 'object' ? input.proxy : undefined;

  const customGeolocation = input.customGeolocation ?? undefined;

  const searchJobs = buildSearchJobs({
    searchTerms,
    categories,
    location,
    customGeolocation,
    maxCrawledPlacesPerSearch,
    language,
  });

  log.info('Normalized input', {
    searchTerms,
    categories,
    location,
    maxCrawledPlacesPerSearch,
    language,
    extractReviews,
    maxReviews,
    extractImages,
    enrichContacts,
    enrichLeads,
    enrichSocialProfiles,
    hasCustomGeolocation: Boolean(customGeolocation),
    proxyConfigured: Boolean(proxy),
    searchJobCount: searchJobs.length,
  });

  return {
    searchTerms,
    categories,
    location,
    customGeolocation,
    maxCrawledPlacesPerSearch,
    language,
    extractReviews,
    maxReviews,
    extractImages,
    enrichContacts,
    enrichLeads,
    enrichSocialProfiles,
    proxy,
    searchJobs,
  };
}

interface SearchJobBuildConfig {
  searchTerms: string[];
  categories: string[];
  location?: string;
  customGeolocation?: GeoJsonGeometry;
  maxCrawledPlacesPerSearch: number;
  language: string;
}

function buildSearchJobs(config: SearchJobBuildConfig): SearchJob[] {
  const jobs: SearchJob[] = [];

  const terms = config.searchTerms.length > 0 ? config.searchTerms : [''];
  const categories = config.categories.length > 0 ? config.categories : [''];

  let counter = 0;

  for (const term of terms) {
    for (const category of categories) {
      counter += 1;

      jobs.push({
        id: `job-${counter}`,
        searchTerm: term || undefined,
        category: category || undefined,
        locationText: config.location,
        language: config.language,
        maxCrawledPlacesPerSearch: config.maxCrawledPlacesPerSearch,
        customGeolocation: config.customGeolocation,
      });
    }
  }

  return jobs;
}
