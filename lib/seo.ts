import type { Metadata } from "next";

// Shared SEO settings for the Next.js Metadata API. The canonical host is www.hruna.in (Vercel's
// primary domain — hruna.in redirects there), so every canonical/Open Graph URL is built from it,
// whatever host the page was served from (local dev, previews).
//
// Next merges metadata shallowly per key: a page that sets `openGraph` replaces the root's whole
// openGraph object, so pageMetadata() always returns complete openGraph/twitter objects.

export const SITE_URL = "https://www.hruna.in";
export const SITE_NAME = "HRUNA";
export const DEFAULT_TITLE = "HRUNA — Where Vision Meets Craft";
export const DEFAULT_DESCRIPTION =
  "HRUNA connects you with verified fashion designers, tailors and boutiques to bring your dream garment to life — from private commission to final fitting.";

/** Default share image (public/brand/hruna-og.png, 1200x630): the HRUNA emblem + wordmark. Pages
 *  with an image of their own (a studio's banner) use theirs instead. Browser/app icons come from
 *  the app/favicon.ico, app/icon.png and app/apple-icon.png file conventions, not from here.
 *  Absolute on purpose: for a relative social image, Next swaps metadataBase for localhost in dev and
 *  for the preview URL on Vercel previews — this always names the canonical host. */
export const DEFAULT_OG_IMAGE = {
  url: `${SITE_URL}/brand/hruna-og.png`,
  width: 1200,
  height: 630,
  alt: "HRUNA — Where Vision Meets Craft",
  type: "image/png",
};

/** Indexing off, link-following on — for pages that may be visited but shouldn't appear in search. */
export const NOINDEX_FOLLOW: NonNullable<Metadata["robots"]> = { index: false, follow: true };

/** Sign-in, password and email-link pages: a clear title, kept out of search results. */
export function utilityPageMetadata(title: string): Metadata {
  return { title, robots: NOINDEX_FOLLOW };
}

/** Absolute URL on the canonical host for a site path ("/about" → "https://www.hruna.in/about").
 *  The homepage is the bare origin, matching how Next renders its canonical. */
export function absoluteUrl(path: string): string {
  return path === "/" ? SITE_URL : new URL(path, SITE_URL).toString();
}

/** Trims text to at most `max` characters on a word boundary, for meta descriptions. */
export function truncateDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/, "")}…`;
}

/**
 * Metadata for one indexable public page: unique title + description, a canonical URL, and
 * matching Open Graph / X card fields. `title` goes through the root template ("%s | HRUNA")
 * unless `absoluteTitle` is set (the homepage uses the full brand title).
 */
export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  images,
  robots,
}: {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
  images?: string[];
  robots?: Metadata["robots"];
}): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  const shareImages = images?.length ? images : [DEFAULT_OG_IMAGE];
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_IN",
      url: path,
      title: fullTitle,
      description,
      images: shareImages,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: shareImages,
    },
    ...(robots ? { robots } : {}),
  };
}
