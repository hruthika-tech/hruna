import { utilityPageMetadata } from "@/lib/seo";

// Metadata only: the registration page is kept out of search results.
export const metadata = utilityPageMetadata("Create your account");

export default function CreateAccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
