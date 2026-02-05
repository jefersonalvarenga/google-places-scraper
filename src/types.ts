export type RequestType = 'SEARCH' | 'PLACE_DETAIL' | 'REVIEWS';

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
  // Optional radius (in kilometers) interpreted by the Actor when tiling a circular area
  radiusKm?: number;
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  // GeoJSON polygon: array of linear rings, where each ring is an array of [lon, lat]
  coordinates: Array<Array<[number, number]>>;
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  // Array of polygons; each polygon is an array of linear rings
  coordinates: Array<Array<Array<[number, number]>>>;
}

export type GeoJsonGeometry = GeoJsonPoint | GeoJsonPolygon | GeoJsonMultiPolygon;

export interface SearchJob {
  id: string;
  searchTerm?: string;
  category?: string;
  locationText?: string;
  language: string;
  maxCrawledPlacesPerSearch: number;
  customGeolocation?: GeoJsonGeometry;
}

export type SocialProfileType = 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'twitter';

export interface SocialProfile {
  type: SocialProfileType;
  url: string;
  username?: string | null;
  displayName?: string | null;
  followersCount?: number | null;
  extra?: Record<string, unknown>;
}

export interface Lead {
  id: string;
  placeId: string;
  fullName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  linkedinUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  companySize?: string | null;
  industry?: string | null;
  sourceUrl?: string | null;
}

export interface PlaceImage {
  url: string;
  authorName?: string;
  authorUrl?: string;
  uploadDate?: string;
}

export interface HotelData {
  stars?: number;
  priceRange?: string;
  checkInTime?: string;
  checkOutTime?: string;
  amenities?: string[];
}

export interface ContactEnrichment {
  emails: string[];
  phones: string[];
  socialProfiles: SocialProfile[];
}

export interface Place {
  id: string; // Typically Google Place ID
  searchJobId?: string;
  title: string | null;
  primaryCategory?: string | null;
  categories: string[];
  description?: string | null;
  address?: {
    fullAddress?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  };
  location?: {
    lat: number | null;
    lng: number | null;
  };
  plusCode?: string | null;
  googleMapsUrl?: string | null;
  placeId?: string | null;
  cid?: string | null;
  fid?: string | null;
  phone?: {
    formatted?: string | null;
    e164?: string | null;
  };
  website?: string | null;
  openingHours?: Record<string, string[]>; // e.g. { Monday: ['09:00-17:00'] }
  popularTimesHistogram?: unknown; // Will be typed later
  priceLevel?: string | null; // e.g. '$$'
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  images?: PlaceImage[];
  amenities?: string[];
  additionalInfo?: Record<string, unknown>;
  peopleAlsoSearch?: string[];
  menuUrl?: string | null;
  reservationLinks?: string[];
  bookingLinks?: string[];
  hotelData?: HotelData | null;
  reviewStats?: {
    totalReviews?: number;
    averageRating?: number;
  };
  enrichment?: {
    contacts?: ContactEnrichment | null;
    leads?: Lead[] | null;
    socialProfiles?: SocialProfile[] | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id?: string;
  placeId: string;
  searchJobId?: string;
  reviewerName?: string | null;
  reviewerProfileUrl?: string | null;
  reviewerPhotoUrl?: string | null;
  text?: string | null;
  rating?: number | null;
  likesCount?: number | null;
  isLocalGuide?: boolean;
  reviewImages?: string[];
  ownerResponse?: {
    text: string;
    respondedAt?: string;
  } | null;
  publishedAt?: string; // ISO string when available
  scrapedAt: string; // ISO string when scraped
}

export interface EnrichmentStats {
  contactsEnrichedCount: number;
  leadsEnrichedCount: number;
  socialProfilesEnrichedCount: number;
}

export interface ProxyInputConfig {
  useApifyProxy?: boolean;
  apifyProxyGroups?: string[];
  apifyProxyCountry?: string;
  proxyUrls?: string[];
}

export interface ActorInput {
  searchTerms?: string[];
  categories?: string[];
  location?: string;
  customGeolocation?: GeoJsonGeometry | null;
  maxCrawledPlacesPerSearch?: number;
  language?: string;
  extractReviews?: boolean;
  maxReviews?: number;
  extractImages?: boolean;
  enrichContacts?: boolean;
  enrichLeads?: boolean;
  enrichSocialProfiles?: SocialProfileType[];
  proxy?: ProxyInputConfig;
}

export interface BaseUserData {
  requestType: RequestType;
  searchJobId?: string;
}

export interface SearchRequestUserData extends BaseUserData {
  requestType: 'SEARCH';
  searchJob: SearchJob;
}

export interface PlaceDetailUserData extends BaseUserData {
  requestType: 'PLACE_DETAIL';
  placeId?: string;
  placeUrl?: string;
}

export interface ReviewsRequestUserData extends BaseUserData {
  requestType: 'REVIEWS';
  placeId: string;
  placeUrl?: string;
  offset?: number;
  accumulatedCount?: number;
  maxReviews?: number;
}

export type CrawlerRequestUserData =
  | SearchRequestUserData
  | PlaceDetailUserData
  | ReviewsRequestUserData;
