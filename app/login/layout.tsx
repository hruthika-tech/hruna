import { utilityPageMetadata } from "@/lib/seo";

// Metadata only: the sign-in page is kept out of search results (the page itself is a client component).
export const metadata = utilityPageMetadata("Sign in");

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
