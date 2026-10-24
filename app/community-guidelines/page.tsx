import Link from "next/link";
import { PolicyPage, type PolicySection } from "@/components/layout/PolicyPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Community Guidelines",
  description: "Guidelines for everywhere people share or see each other's content on HRUNA — designer studio pages, portfolios, reviews and direct messages.",
  path: "/community-guidelines",
});

const sections: PolicySection[] = [
  {
    id: "scope",
    heading: "What this covers",
    body: (
      <p>
        HRUNA doesn&apos;t currently have a public community feed or community-posting feature.
        These guidelines instead govern the places where people share or see each other&apos;s
        content today: designer studio profiles, portfolio and collection images, reviews, and
        direct messages between a customer and a designer. Your Fashion Diary is private and never
        shown to anyone else, so it isn&apos;t covered here.
      </p>
    ),
  },
  {
    id: "prohibited",
    heading: "Prohibited content & conduct",
    body: (
      <>
        <p>Across every surface listed above, the following is never allowed:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>Harassment, threats, or targeted abuse of another user.</li>
          <li>Hateful or discriminatory conduct.</li>
          <li>Sexual exploitation of any kind, including any child sexual abuse material — reported to appropriate authorities where legally required.</li>
          <li>Non-consensual intimate imagery.</li>
          <li>Graphic violent content.</li>
          <li>Illegal content or activity of any kind.</li>
          <li>Fraud or scams.</li>
          <li>Impersonating another person, designer, or studio.</li>
          <li>Spam or unsolicited promotional content.</li>
          <li>Malicious links or files.</li>
          <li>Doxxing or sharing another person&apos;s private information without consent.</li>
          <li>Privacy violations.</li>
          <li>Copyright or trademark infringement.</li>
          <li>Fake reviews or coordinated review manipulation.</li>
        </ul>
      </>
    ),
  },
  {
    id: "enforcement",
    heading: "Enforcement",
    body: (
      <>
        <p>Depending on severity, violations may result in:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>Content removal.</li>
          <li>A warning.</li>
          <li>Restriction of specific features.</li>
          <li>Temporary account suspension.</li>
          <li>Permanent account termination.</li>
          <li>Reporting to appropriate authorities, where legally required or appropriate.</li>
        </ul>
        <p>
          These actions are currently taken by HRUNA administrators reviewing reported issues —
          see{" "}
          <Link href="/reporting-and-disputes" className="text-primary hover:underline">
            Reporting, Complaints &amp; Disputes
          </Link>{" "}
          for how that works today. We don&apos;t claim automated content moderation beyond what&apos;s
          described there.
        </p>
      </>
    ),
  },
  {
    id: "related",
    heading: "Related policies",
    body: (
      <p>
        See also the{" "}
        <Link href="/acceptable-use" className="text-primary hover:underline">Acceptable Use Policy</Link>,{" "}
        <Link href="/reviews-policy" className="text-primary hover:underline">Reviews &amp; Ratings Policy</Link>,
        and{" "}
        <Link href="/content-policy" className="text-primary hover:underline">Content &amp; Intellectual Property Policy</Link>.
      </p>
    ),
  },
];

export default function CommunityGuidelinesPage() {
  return (
    <PolicyPage
      eyebrow="LEGAL"
      title="Community Guidelines"
      lastUpdated="September 10, 2026"
      intro={
        <p>
          These guidelines apply wherever people share or see each other&apos;s content on
          HRUNA — designer studio pages, portfolios, reviews, and direct messages.
        </p>
      }
      sections={sections}
    />
  );
}
