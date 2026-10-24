import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { listApprovedCatalogSitemapEntries, listApprovedStudioSitemapEntries } from "@/lib/customer/discovery";
import { absoluteUrl } from "@/lib/seo";

// Only public, indexable pages. Sign-in/account/utility pages and every private area (see
// robots.ts) are never listed. Studios, dresses and collections are listed only for approved
// designers — exactly the pages that aren't marked noindex — via the public catalog's own rule.
export const dynamic = "force-dynamic";

const STATIC_PATHS: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/discover", priority: 0.9, changeFrequency: "daily" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/become-a-designer", priority: 0.6, changeFrequency: "monthly" },
  { path: "/help", priority: 0.5, changeFrequency: "monthly" },
  { path: "/support", priority: 0.3, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/acceptable-use", priority: 0.2, changeFrequency: "yearly" },
  { path: "/account-policy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/collaboration-policy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/community-guidelines", priority: 0.2, changeFrequency: "yearly" },
  { path: "/content-policy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/reporting-and-disputes", priority: 0.2, changeFrequency: "yearly" },
  { path: "/reviews-policy", priority: 0.2, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = STATIC_PATHS.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    changeFrequency,
    priority,
  }));

  // If a lookup fails, still serve everything else rather than an error.
  const supabase = createClient();
  try {
    const studios = await listApprovedStudioSitemapEntries(supabase);
    for (const s of studios) {
      pages.push({ url: absoluteUrl(`/studio/${s.id}`), lastModified: new Date(s.updatedAt), changeFrequency: "weekly", priority: 0.7 });
    }
  } catch (err) {
    console.error("[sitemap] approved studio lookup failed", err instanceof Error ? err.message : err);
  }
  try {
    const { collections, dresses } = await listApprovedCatalogSitemapEntries(supabase);
    for (const c of collections) {
      pages.push({ url: absoluteUrl(`/collections/${c.id}`), lastModified: new Date(c.updatedAt), changeFrequency: "weekly", priority: 0.6 });
    }
    for (const d of dresses) {
      pages.push({ url: absoluteUrl(`/dresses/${d.id}`), lastModified: new Date(d.updatedAt), changeFrequency: "weekly", priority: 0.6 });
    }
  } catch (err) {
    console.error("[sitemap] approved dress/collection lookup failed", err instanceof Error ? err.message : err);
  }

  return pages;
}
