import { utilityPageMetadata } from "@/lib/seo";

// Metadata only: the post-signup "check your inbox" page, kept out of search results.
export const metadata = utilityPageMetadata("Verify your email");

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
