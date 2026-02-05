import type { Page } from 'playwright';

export interface ParsedReview {
  reviewId: string | null;
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
  publishedAt?: string | null;
}

const REVIEW_CARD_SELECTOR = 'div[data-review-id]';

export async function parseVisibleReviews(page: Page): Promise<ParsedReview[]> {
  const reviews = await page.$$eval(
    REVIEW_CARD_SELECTOR,
    (elements: Element[]): ParsedReview[] => {
      const results: ParsedReview[] = [];

      for (const element of elements) {
        const card = element as HTMLElement;
        const reviewId = card.getAttribute('data-review-id') || null;

        const contributorLink = card.querySelector('a[href*="maps/contrib"], a[href*="google.com/maps/contrib"]') as
          | HTMLAnchorElement
          | null;
        const reviewerName = (contributorLink?.textContent || '').trim() || null;
        const reviewerProfileUrl = contributorLink?.href || null;

        const avatarImg = contributorLink?.querySelector('img') as HTMLImageElement | null;
        const reviewerPhotoUrl = avatarImg?.src || null;

        const ratingEl = card.querySelector(
          'span[aria-label*="star rating" i], span[aria-label*="stars" i]',
        ) as HTMLElement | null;
        let rating: number | null = null;
        if (ratingEl) {
          const label = ratingEl.getAttribute('aria-label') || ratingEl.textContent || '';
          const match = label.match(/([0-9]+(?:\.[0-9]+)?)/);
          if (match) rating = Number(match[1]);
        }

        const textEl = card.querySelector('span[lang]') as HTMLElement | null;
        const text = (textEl?.textContent || '').trim() || null;

        const likeButton = card.querySelector(
          'button[aria-label*="helpful" i], button[aria-label*="like this review" i]'
        ) as HTMLElement | null;
        let likesCount: number | null = null;
        if (likeButton) {
          const likeText = (likeButton.textContent || '').trim();
          const likeMatch = likeText.match(/([0-9][0-9,]*)/);
          if (likeMatch) {
            likesCount = Number(likeMatch[1].replace(/,/g, ''));
          }
        }

        const isLocalGuide = /local guide/i.test(card.innerText || '');

        const responseContainer = card.querySelector(
          'div[aria-label*="Response from the owner" i], div[aria-label*="Owner response" i]',
        ) as HTMLElement | null;
        let ownerResponse: { text: string; respondedAt?: string } | null = null;
        if (responseContainer) {
          const responseText = (responseContainer.textContent || '').trim();
          if (responseText) {
            ownerResponse = { text: responseText };
          }
        }

        const timeEl = card.querySelector(
          'span[class*="rsqaWe"], span[aria-label*="review" i], span[aria-label*="ago" i]',
        ) as HTMLElement | null;
        const publishedAt = (timeEl?.textContent || '').trim() || null;

        const imageEls = Array.from(card.querySelectorAll('img[src]')) as HTMLImageElement[];
        const reviewImages = imageEls
          .filter((img) => img !== avatarImg)
          .map((img) => img.src)
          .filter((src) => Boolean(src));

        results.push({
          reviewId,
          reviewerName,
          reviewerProfileUrl,
          reviewerPhotoUrl,
          text,
          rating,
          likesCount,
          isLocalGuide,
          reviewImages,
          ownerResponse,
          publishedAt,
        });
      }

      return results;
    },
  );

  return reviews;
}
