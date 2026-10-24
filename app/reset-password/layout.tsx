import { utilityPageMetadata } from "@/lib/seo";

// Metadata only: an email-link landing page, kept out of search results.
export const metadata = utilityPageMetadata("Reset your password");

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
