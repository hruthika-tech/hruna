import Link from "next/link";
import { PolicyPage, type PolicySection } from "@/components/layout/PolicyPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Acceptable Use Policy",
  description: "Rules for technical and platform-level use of HRUNA — what is and isn't allowed when using the platform.",
  path: "/acceptable-use",
});

const sections: PolicySection[] = [
  {
    id: "overview",
    heading: "Overview",
    body: (
      <p>
        This policy covers technical and platform-level conduct — separate from the content/
        behavior conduct covered in{" "}
        <Link href="/community-guidelines" className="text-primary hover:underline">
          Community Guidelines
        </Link>
        . HRUNA is built on Supabase, with authentication and Row Level Security enforcing that
        every user can only access their own data (or data explicitly shared with them, like a
        conversation or a public studio page). Attempting to work around these protections is a
        violation of this policy.
      </p>
    ),
  },
  {
    id: "prohibited",
    heading: "You must not",
    body: (
      <ul className="list-disc pl-5 flex flex-col gap-1.5">
        <li>Attempt to gain unauthorized access to another account or to data that isn&apos;t yours.</li>
        <li>Attempt to bypass authentication or authorization controls.</li>
        <li>Abuse HRUNA&apos;s APIs — excessive automated requests, scraping the platform beyond normal use, or probing for vulnerabilities.</li>
        <li>Send spam or automate abusive activity (fake accounts, fake requests, fake messages).</li>
        <li>Distribute malware or malicious files through uploads or messages.</li>
        <li>Attempt to steal or harvest another user&apos;s credentials.</li>
        <li>Impersonate another user, designer, or studio.</li>
        <li>Submit fraudulent fashion requests or proposals.</li>
        <li>Manipulate reviews or ratings.</li>
        <li>Abuse the messaging system (harassment, spam, unsolicited solicitation).</li>
        <li>Upload malicious or disguised files.</li>
        <li>Exploit or attempt to exploit a security vulnerability in the platform.</li>
        <li>Interfere with the platform&apos;s availability for other users.</li>
        <li>Attempt to access another user&apos;s private data — messages, diary entries, verification documents, or anything not intended for you.</li>
      </ul>
    ),
  },
  {
    id: "security-reports",
    heading: "Reporting a security issue",
    body: (
      <p>
        If you believe you&apos;ve found a security vulnerability, please report it responsibly
        rather than exploiting it — see{" "}
        <Link href="/reporting-and-disputes" className="text-primary hover:underline">
          Reporting, Complaints &amp; Disputes
        </Link>{" "}
        for how to reach us.
      </p>
    ),
  },
  {
    id: "enforcement",
    heading: "Enforcement",
    body: (
      <p>
        Violations of this policy may result in content removal, feature restriction, temporary
        suspension, or permanent termination, consistent with the{" "}
        <Link href="/account-policy" className="text-primary hover:underline">
          Account Suspension &amp; Termination Policy
        </Link>
        .
      </p>
    ),
  },
];

export default function AcceptableUsePolicyPage() {
  return (
    <PolicyPage
      eyebrow="LEGAL"
      title="Acceptable Use Policy"
      lastUpdated="September 10, 2026"
      intro={<p>Rules for technical and platform-level use of HRUNA.</p>}
      sections={sections}
    />
  );
}
