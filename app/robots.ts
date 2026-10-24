import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

// Crawl rules, mirroring the route classes in lib/auth/routes.ts. Disallow only keeps crawlers out;
// it isn't what keeps these pages private or unindexed — middleware redirects signed-out visitors
// away from every private area, and public utility pages (sign-in, password reset, email-link
// results) carry their own noindex instead. Those utility pages are deliberately NOT disallowed
// here, so crawlers can actually read that noindex. /_next/ and public assets stay crawlable.
const PRIVATE_PATHS = [
  "/api/",
  "/auth/",
  "/admin",
  "/designer", // also covers /designer-onboarding and /designer-subscription (both private)
  // Customer account area (the "customer" rule in lib/auth/routes.ts).
  "/home",
  "/messages",
  "/notifications",
  "/profile",
  "/projects",
  "/requests",
  "/saved",
  "/diary",
  // Signed-in setup and status pages (the "authenticated" rule).
  "/choose-role",
  "/onboarding",
  "/verification-pending",
  "/verification-rejected",
  "/subscription",
  "/setup-password",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
