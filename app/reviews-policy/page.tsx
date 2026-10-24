import Link from "next/link";
import { PolicyPage, type PolicySection } from "@/components/layout/PolicyPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Reviews & Ratings Policy",
  description: "Rules for the customer-authored reviews and ratings shown on HRUNA designer studio pages.",
  path: "/reviews-policy",
});

const sections: PolicySection[] = [
  {
    id: "how-reviews-work",
    heading: "How reviews work on HRUNA",
    body: (
      <>
        <p>
          Reviews on HRUNA are written by customers about a specific completed project — a
          customer can leave one review per project, once that project is marked completed. A
          review includes a rating and written text, and is shown publicly on the reviewed
          designer&apos;s studio page.
        </p>
        <p>
          Reviews are permanent once submitted — there is currently no way to edit or delete a
          review after posting. There is no designer-to-customer review system.
        </p>
      </>
    ),
  },
  {
    id: "expectations",
    heading: "What we expect from a review",
    body: (
      <ul className="list-disc pl-5 flex flex-col gap-1.5">
        <li>Reviews should reflect your genuine experience with that specific project.</li>
        <li>Reviews must relate to an actual HRUNA project or interaction.</li>
        <li>No fake reviews.</li>
        <li>No review manipulation, including coordinated review campaigns.</li>
        <li>No incentivized dishonest reviews.</li>
        <li>No harassment directed at the designer or anyone else.</li>
        <li>No sharing of personal or private information in a review.</li>
        <li>No threats or retaliation.</li>
        <li>No impersonation.</li>
      </ul>
    ),
  },
  {
    id: "moderation",
    heading: "Moderation",
    body: (
      <p>
        Since reviews are currently immutable and there&apos;s no in-app &ldquo;report a
        review&rdquo; button, if a review violates this policy, contact{" "}
        <Link href="/support" className="text-primary hover:underline">Contact Support</Link> and a
        HRUNA administrator can review it — see{" "}
        <Link href="/reporting-and-disputes" className="text-primary hover:underline">
          Reporting, Complaints &amp; Disputes
        </Link>{" "}
        for the current process.
      </p>
    ),
  },
];

export default function ReviewsPolicyPage() {
  return (
    <PolicyPage
      eyebrow="LEGAL"
      title="Reviews & Ratings Policy"
      lastUpdated="September 10, 2026"
      intro={<p>Rules for the customer-authored reviews shown on designer studio pages.</p>}
      sections={sections}
    />
  );
}
