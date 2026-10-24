import { utilityPageMetadata } from "@/lib/seo";

// Metadata only: a password-reset utility page, kept out of search results.
export const metadata = utilityPageMetadata("Forgot your password");

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
