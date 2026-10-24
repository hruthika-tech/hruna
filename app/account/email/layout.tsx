import { utilityPageMetadata } from "@/lib/seo";

// Metadata only: the email-change result page, kept out of search results.
export const metadata = utilityPageMetadata("Email address");

export default function AccountEmailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
