import { pageMetadata } from "@/lib/seo";

// Metadata only — the Discover page itself is a client component (which can't export metadata), so
// this pass-through layout carries it without changing the page.
export const metadata = pageMetadata({
  title: "Discover Designers, Boutiques & Tailors",
  description: "Find your designer, boutique or tailor on HRUNA. Browse approved studios and explore their collections, previous work and customer reviews.",
  path: "/discover",
});

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
