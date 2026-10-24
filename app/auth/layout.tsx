import { utilityPageMetadata } from "@/lib/seo";

// Metadata only: email-link result pages under /auth (link errors, account switching) are kept out of search results.
export const metadata = utilityPageMetadata("Account");

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
