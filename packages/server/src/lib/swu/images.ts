/**
 * SWU card art is served from an S3 bucket that refuses server-side clients:
 * cdn.starwarsunlimited.com answers 403 AccessDenied to node's fetch under every
 * header combination tried (browser User-Agent, Referer, full Chrome header set,
 * with and without the doubled slash), while a real browser loads the same URL.
 * Routing through the SWU site's own Next.js image endpoint returns the bytes.
 *
 * This matters for more than display: sync-job.ts fetches imageUrl to build the
 * embedding every scan is matched against, so without this the whole SWU catalog
 * vectorizes to nothing.
 */

// Next rejects any width or quality outside its configured lists with a 400.
// 384 is the smallest allowed size at or above SigLIP's 224px input.
const IMAGE_WIDTH = 384;
const IMAGE_QUALITY = 75;

const SWU_CDN_HOST = "cdn.starwarsunlimited.com";
export const SWU_IMAGE_HOST = "starwarsunlimited.com";

/**
 * The doubled slash in the CDN url the API hands out is load-bearing - the
 * endpoint validates against the exact registered url and 403s the tidied one.
 */
export function swuImageUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  if (!rawUrl.includes(SWU_CDN_HOST)) return rawUrl;
  return `https://${SWU_IMAGE_HOST}/_next/image?url=${encodeURIComponent(rawUrl)}&w=${IMAGE_WIDTH}&q=${IMAGE_QUALITY}`;
}
