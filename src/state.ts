import type { NormalizedInput } from './config.js';
import type { EnrichmentStats } from './types.js';

interface SummaryStats {
  placesScraped: number;
  reviewsScraped: number;
  enrichmentStats: EnrichmentStats;
}

let globalInput: NormalizedInput | null = null;

const enrichmentStats: EnrichmentStats = {
  contactsEnrichedCount: 0,
  leadsEnrichedCount: 0,
  socialProfilesEnrichedCount: 0,
};

let placesScraped = 0;
let reviewsScraped = 0;

export function setGlobalInput(input: NormalizedInput): void {
  globalInput = input;
}

export function getGlobalInput(): NormalizedInput {
  if (!globalInput) {
    throw new Error('Global input has not been initialized');
  }
  return globalInput;
}

export function incrementPlacesScraped(delta = 1): void {
  placesScraped += delta;
}

export function incrementReviewsScraped(delta = 1): void {
  reviewsScraped += delta;
}

export function incrementContactsEnriched(delta = 1): void {
  enrichmentStats.contactsEnrichedCount += delta;
}

export function incrementLeadsEnriched(delta = 1): void {
  enrichmentStats.leadsEnrichedCount += delta;
}

export function incrementSocialProfilesEnriched(delta = 1): void {
  enrichmentStats.socialProfilesEnrichedCount += delta;
}

export function getSummaryStats(): SummaryStats {
  return {
    placesScraped,
    reviewsScraped,
    enrichmentStats: { ...enrichmentStats },
  };
}
