import Link from "next/link";
import { PolicyPage, type PolicySection } from "@/components/layout/PolicyPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Content & Intellectual Property Policy",
  description: "Who owns the creative work shared on HRUNA, who is responsible for it, and how intellectual-property infringement is handled.",
  path: "/content-policy",
});

const sections: PolicySection[] = [
  {
    id: "ownership",
    heading: "You own your content",
    body: (
      <p>
        You retain ownership of the content you create and upload to HRUNA — designs,
        photographs, portfolio work, fashion concepts, diary entries, and any other creative work.
        HRUNA does not claim ownership of your designs, photographs, artwork, fashion concepts,
        or other creative work.
      </p>
    ),
  },
  {
    id: "responsibility",
    heading: "Your responsibility",
    body: (
      <p>
        You&apos;re responsible for ensuring you have the necessary rights to upload or share any
        content — including that it doesn&apos;t infringe someone else&apos;s copyright, trademark,
        or other rights, and doesn&apos;t use someone else&apos;s work without authorization.
      </p>
    ),
  },
  {
    id: "license",
    heading: "The limited license you grant HRUNA",
    body: (
      <p>
        To operate the platform, you grant HRUNA a limited, non-exclusive license to host,
        store, process, and display your uploaded content as needed — for example, showing your
        portfolio on your studio page, or displaying a review you&apos;ve written. This license
        exists only to let the platform function; it doesn&apos;t transfer ownership.
      </p>
    ),
  },
  {
    id: "impersonation",
    heading: "Impersonation & unauthorized use",
    body: (
      <p>
        Presenting someone else&apos;s work as your own, or impersonating another designer or
        their studio, is prohibited — see the{" "}
        <Link href="/acceptable-use" className="text-primary hover:underline">Acceptable Use Policy</Link>.
      </p>
    ),
  },
  {
    id: "infringement",
    heading: "Infringement & removal",
    body: (
      <p>
        If you believe content on HRUNA infringes your intellectual property rights, let us
        know and we&apos;ll review it. We may remove content that appears to infringe another
        person&apos;s rights.{" "}
        <strong>[FORMAL IP COMPLAINT CONTACT/PROCESS TO BE INSERTED]</strong> — in the meantime, use
        the{" "}
        <Link href="/help" className="text-primary hover:underline">Help Center</Link> or{" "}
        <Link href="/support" className="text-primary hover:underline">Contact Support</Link>.
      </p>
    ),
  },
];

export default function ContentPolicyPage() {
  return (
    <PolicyPage
      eyebrow="LEGAL"
      title="Content & Intellectual Property Policy"
      lastUpdated="September 10, 2026"
      intro={
        <p>
          HRUNA is built around designers&apos; and customers&apos; creative work — this policy
          explains ownership, responsibility, and how infringement is handled.
        </p>
      }
      sections={sections}
    />
  );
}
