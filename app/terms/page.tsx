import Link from "next/link";
import { PolicyPage, type PolicySection } from "@/components/layout/PolicyPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Terms of Use",
  description: "The terms that govern your use of HRUNA, a platform that facilitates connection and collaboration between customers and independent fashion designers.",
  path: "/terms",
});

const sections: PolicySection[] = [
  {
    id: "acceptance",
    heading: "Acceptance of these terms",
    body: (
      <p>
        By creating an account or using HRUNA, you agree to these Terms of Use. If you don&apos;t
        agree, please don&apos;t use the platform. HRUNA is operated by{" "}
        <strong>[LEGAL ENTITY NAME TO BE INSERTED]</strong>.
      </p>
    ),
  },
  {
    id: "what-hruna-is",
    heading: "What HRUNA is",
    body: (
      <p>
        HRUNA connects customers with independent fashion designers, tailors, and boutiques,
        and facilitates the collaboration between them — from a customer&apos;s initial request
        through a designer&apos;s proposal, an active project, and completion. HRUNA provides the
        platform; the resulting creative work and any agreement about it is between the customer
        and the designer. See the{" "}
        <Link href="/collaboration-policy" className="text-primary hover:underline">
          Designer–Customer Collaboration Policy
        </Link>{" "}
        for the full lifecycle.
      </p>
    ),
  },
  {
    id: "eligibility",
    heading: "Eligibility",
    body: (
      <p>
        You must be able to form a legally binding agreement to use HRUNA. If you&apos;re using
        HRUNA on behalf of a studio or business, you confirm you&apos;re authorized to do so.
      </p>
    ),
  },
  {
    id: "accounts",
    heading: "Account creation & security",
    body: (
      <>
        <p>
          You create an account with your name, email, and a password managed by Supabase Auth.
          You&apos;re responsible for keeping your login credentials secure and for all activity
          under your account. Notify us promptly if you believe your account has been compromised.
        </p>
        <p>
          One identity can hold both a customer account and a designer account — HRUNA doesn&apos;t
          require duplicate registrations for each role.
        </p>
      </>
    ),
  },
  {
    id: "customer-accounts",
    heading: "Customer accounts",
    body: (
      <p>
        As a customer, you can browse designers, submit fashion requests, receive and accept
        proposals, collaborate on projects through messaging and updates, confirm project
        completion, save favourites, keep a private Fashion Diary, and leave a review once a
        project is completed.
      </p>
    ),
  },
  {
    id: "designer-accounts",
    heading: "Designer accounts & verification",
    body: (
      <p>
        As a designer, you maintain a studio profile, respond to and browse fashion requests, send
        proposals, deliver projects, and message with customers. Designer accounts go through a
        HRUNA verification review (identity and portfolio) before certain visibility/eligibility
        is granted — only HRUNA administrators can approve verification; it can&apos;t be
        self-certified.
      </p>
    ),
  },
  {
    id: "profile-studio-info",
    heading: "Profile & studio information",
    body: (
      <p>
        You agree to keep the information on your profile or studio page accurate — this includes
        your name, photo, and (for designers) studio details, contact information, and portfolio
        content. Misrepresenting your identity, qualifications, or work is prohibited — see{" "}
        <Link href="/acceptable-use" className="text-primary hover:underline">Acceptable Use</Link>.
      </p>
    ),
  },
  {
    id: "requests-proposals-projects",
    heading: "Requests, proposals & projects",
    body: (
      <p>
        A fashion request should describe a genuine need. A proposal should accurately represent
        what the designer can deliver. Once a proposal is accepted, it becomes a project, tracked
        through to completion. The customer confirms completion; a review can then be left. Full
        conduct expectations for this lifecycle are in the{" "}
        <Link href="/collaboration-policy" className="text-primary hover:underline">
          Collaboration Policy
        </Link>
        .
      </p>
    ),
  },
  {
    id: "messaging",
    heading: "Messaging",
    body: (
      <p>
        Messages between a customer and a designer are private to that conversation. Use messaging
        for genuine collaboration — not harassment, spam, or unsolicited solicitation.
      </p>
    ),
  },
  {
    id: "reviews",
    heading: "Reviews",
    body: (
      <p>
        Customers may leave one review per completed project. Reviews are permanent once
        submitted and reflect a genuine experience with that project — see the{" "}
        <Link href="/reviews-policy" className="text-primary hover:underline">
          Reviews &amp; Ratings Policy
        </Link>
        .
      </p>
    ),
  },
  {
    id: "saved-diary",
    heading: "Saved items & Fashion Diary",
    body: (
      <p>
        Saved items (favourites) and your Fashion Diary are personal features tied to your own
        account. Fashion Diary entries are private and never shown to any other user.
      </p>
    ),
  },
  {
    id: "uploads-ip",
    heading: "Uploads & intellectual property",
    body: (
      <p>
        You retain ownership of content you upload (photos, portfolio work, diary entries, etc.)
        and are responsible for having the right to share it. By uploading, you grant HRUNA a
        limited license to host, store, and display that content as needed to operate the
        platform. Full detail is in the{" "}
        <Link href="/content-policy" className="text-primary hover:underline">
          Content &amp; Intellectual Property Policy
        </Link>
        .
      </p>
    ),
  },
  {
    id: "prohibited-conduct",
    heading: "Prohibited conduct",
    body: (
      <>
        <p>You agree not to, on or through HRUNA:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>Harass, threaten, or abuse another user.</li>
          <li>Commit or attempt fraud.</li>
          <li>Impersonate another person, designer, or studio.</li>
          <li>Post or share spam or unsolicited promotional content.</li>
          <li>Engage in illegal activity.</li>
          <li>Attempt to gain unauthorized access to another account or private data.</li>
          <li>Manipulate reviews or ratings.</li>
        </ul>
        <p>
          Full detail across every surface of the platform is in the{" "}
          <Link href="/acceptable-use" className="text-primary hover:underline">Acceptable Use Policy</Link>{" "}
          and{" "}
          <Link href="/community-guidelines" className="text-primary hover:underline">Community Guidelines</Link>.
        </p>
      </>
    ),
  },
  {
    id: "moderation-reporting",
    heading: "Moderation & reporting",
    body: (
      <p>
        HRUNA administrators may review and act on reported or flagged issues, including content
        removal and account action. See the{" "}
        <Link href="/reporting-and-disputes" className="text-primary hover:underline">
          Reporting, Complaints &amp; Disputes Policy
        </Link>{" "}
        for how this works today.
      </p>
    ),
  },
  {
    id: "suspension-termination",
    heading: "Account suspension, termination & deletion",
    body: (
      <p>
        Accounts that violate these Terms may be restricted, suspended, or terminated. You may
        request deletion of your own account from Settings. Full detail — including what happens
        to historical records tied to other users — is in the{" "}
        <Link href="/account-policy" className="text-primary hover:underline">
          Account Suspension &amp; Termination Policy
        </Link>
        .
      </p>
    ),
  },
  {
    id: "disputes",
    heading: "Disputes",
    body: (
      <p>
        If a disagreement arises between a customer and a designer, first try resolving it directly
        through messaging. For issues that need HRUNA&apos;s involvement, see{" "}
        <Link href="/reporting-and-disputes" className="text-primary hover:underline">
          Reporting, Complaints &amp; Disputes
        </Link>
        .
      </p>
    ),
  },
  {
    id: "availability",
    heading: "Platform availability",
    body: (
      <p>
        We aim to keep HRUNA available and reliable, but don&apos;t guarantee uninterrupted
        access — the platform may be unavailable for maintenance, updates, or reasons outside our
        control.
      </p>
    ),
  },
  {
    id: "third-party-services",
    heading: "Third-party services",
    body: (
      <p>
        HRUNA relies on third-party infrastructure providers (such as Supabase for
        authentication, database, and storage) to operate. We aren&apos;t responsible for outages
        or issues originating from those providers, though we work to minimize their impact.
      </p>
    ),
  },
  {
    id: "no-order-shipping",
    heading: "What HRUNA does not currently do",
    body: (
      <p>
        HRUNA does not currently process customer payments, orders, checkout, shipping, delivery,
        or returns/refunds through the platform. Any commercial arrangement for a commissioned
        garment is between the customer and the designer directly, outside of HRUNA&apos;s current
        feature set.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    body: (
      <p>
        We may update these Terms as HRUNA evolves. Material changes will be reflected by
        updating the &ldquo;Last updated&rdquo; date above.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "How to reach us",
    body: (
      <p>
        For questions about these Terms, contact{" "}
        <strong>[OFFICIAL CONTACT DETAILS TO BE INSERTED]</strong>, or use the{" "}
        <Link href="/help" className="text-primary hover:underline">Help Center</Link> /{" "}
        <Link href="/support" className="text-primary hover:underline">Contact Support</Link> in the
        meantime.
      </p>
    ),
  },
];

export default function TermsOfUsePage() {
  return (
    <PolicyPage
      eyebrow="LEGAL"
      title="Terms of Use"
      lastUpdated="September 10, 2026"
      intro={
        <p>
          These Terms govern your use of HRUNA — a platform that facilitates connection and
          collaboration between customers and independent fashion designers.
        </p>
      }
      sections={sections}
    />
  );
}
