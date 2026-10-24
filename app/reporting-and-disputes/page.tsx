import Link from "next/link";
import { PolicyPage, type PolicySection } from "@/components/layout/PolicyPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Reporting, Complaints & Disputes",
  description: "How to raise a concern, complaint or dispute with HRUNA, and how it's handled today.",
  path: "/reporting-and-disputes",
});

const sections: PolicySection[] = [
  {
    id: "what-you-can-report",
    heading: "What you can raise with us",
    body: (
      <ul className="list-disc pl-5 flex flex-col gap-1.5">
        <li>Harassment or abuse.</li>
        <li>Fraud.</li>
        <li>Inappropriate content.</li>
        <li>Impersonation.</li>
        <li>Copyright or intellectual property violations.</li>
        <li>Review abuse or manipulation.</li>
        <li>A disagreement about a project.</li>
        <li>A violation of any HRUNA policy.</li>
        <li>Privacy violations.</li>
      </ul>
    ),
  },
  {
    id: "how-it-works-today",
    heading: "How this works today",
    body: (
      <>
        <p>
          Being transparent about where this stands: HRUNA doesn&apos;t yet have a self-service
          &ldquo;Report&rdquo; button on reviews, messages, or profiles, and there isn&apos;t
          currently a page where you can file or track a dispute yourself. Disputes today are
          handled internally — a HRUNA administrator reviews the situation, tracks it through a
          fixed process (open → under review → resolved → closed), and can add notes as it&apos;s
          worked through.
        </p>
        <p>
          To raise any of the issues above, use the{" "}
          <Link href="/help" className="text-primary hover:underline">Help Center</Link> or{" "}
          <Link href="/support" className="text-primary hover:underline">Contact Support</Link>{" "}
          for now. We&apos;ll route it internally. As HRUNA grows, we intend to build a proper
          self-service reporting and dispute-tracking experience.
        </p>
      </>
    ),
  },
  {
    id: "project-disagreements",
    heading: "Project disagreements",
    body: (
      <p>
        For a disagreement specifically about an ongoing project, we recommend first trying to
        resolve it directly with the other party through messaging — most issues can be sorted out
        that way. If that doesn&apos;t work, reach out as described above.
      </p>
    ),
  },
  {
    id: "what-happens-next",
    heading: "What happens after you report something",
    body: (
      <p>
        A HRUNA administrator reviews what&apos;s reported and may take any of the actions
        described in the{" "}
        <Link href="/account-policy" className="text-primary hover:underline">
          Account Suspension &amp; Termination Policy
        </Link>{" "}
        or{" "}
        <Link href="/community-guidelines" className="text-primary hover:underline">
          Community Guidelines
        </Link>
        , depending on what&apos;s appropriate — from a warning to permanent account termination.
      </p>
    ),
  },
];

export default function ReportingAndDisputesPage() {
  return (
    <PolicyPage
      eyebrow="LEGAL"
      title="Reporting, Complaints & Disputes"
      lastUpdated="September 10, 2026"
      intro={<p>How to raise a concern with HRUNA, and how it&apos;s handled today.</p>}
      sections={sections}
    />
  );
}
