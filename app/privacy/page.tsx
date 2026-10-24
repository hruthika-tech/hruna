import Link from "next/link";
import { PolicyPage, type PolicySection } from "@/components/layout/PolicyPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy Policy",
  description: "What information HRUNA collects, why, and how it's used — based on how the platform actually works today.",
  path: "/privacy",
});

// Reflects the actual data architecture as implemented — not a generic template. Every category
// below corresponds to a real table/column/bucket in the app; nothing is claimed that the codebase
// doesn't actually collect. See app/terms/page.tsx for the companion Terms of Use.
const sections: PolicySection[] = [
  {
    id: "who-we-are",
    heading: "Who this policy covers",
    body: (
      <>
        <p>
          This Privacy Policy explains how HRUNA collects, uses, and protects information when
          you use the platform as a customer or as a designer. HRUNA is operated by{" "}
          <strong>[LEGAL ENTITY NAME TO BE INSERTED]</strong>. For privacy questions or concerns,
          see &ldquo;How to reach us&rdquo; below.
        </p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    heading: "Information we collect",
    body: (
      <>
        <p>We collect only the information the platform actually needs to function:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li><strong>Account information</strong> — your name and email address, managed through Supabase Auth.</li>
          <li><strong>Customer profile information</strong> — display name, city, phone number, and profile photo.</li>
          <li><strong>Designer profile &amp; studio information</strong> — studio name, contact email, opening hours, atelier location, highlights, portfolio/collection content, and designer verification submissions (identity and portfolio review materials).</li>
          <li><strong>Requests, proposals &amp; projects</strong> — the fashion requests you submit, proposals you send or receive, and project details and updates exchanged during a collaboration.</li>
          <li><strong>Messages</strong> — text and images exchanged directly between a customer and a designer within a conversation.</li>
          <li><strong>Reviews</strong> — ratings and review text a customer writes about a completed project.</li>
          <li><strong>Saved items &amp; Fashion Diary</strong> — designers, dresses, collections, or projects you save, and any private Fashion Diary entries you create.</li>
          <li><strong>Uploaded images and files</strong> — avatars, studio images, request/project images, and verification documents, stored via our media storage provider.</li>
          <li><strong>Notification preferences</strong> — your choices about which notifications you want to receive.</li>
          <li><strong>Authentication &amp; security information</strong> — your password is managed entirely by Supabase Auth; HRUNA never stores or has direct access to your password.</li>
        </ul>
        <p>
          We do not currently run dedicated behavioral analytics or third-party advertising
          trackers. Standard technical information (such as IP address and request logs) may be
          processed by our hosting and infrastructure providers as part of operating and securing
          the service.
        </p>
      </>
    ),
  },
  {
    id: "why-we-use-it",
    heading: "Why we use this information",
    body: (
      <ul className="list-disc pl-5 flex flex-col gap-1.5">
        <li>To create and manage your account and authenticate you securely.</li>
        <li>To operate the core collaboration flow — Discover, Request, Proposal, Project, Messaging, Review.</li>
        <li>To display designer studios, portfolios, and reviews to prospective customers.</li>
        <li>To let you communicate directly with a designer or customer you&apos;re working with.</li>
        <li>To verify designer identity and portfolio submissions before approval.</li>
        <li>To send notifications you&apos;ve opted into.</li>
        <li>To maintain the security and integrity of the platform.</li>
      </ul>
    ),
  },
  {
    id: "what-is-public",
    heading: "What's public vs. private",
    body: (
      <>
        <p><strong>Generally visible to other users:</strong></p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>A designer&apos;s studio page — studio name, banner, highlights, collections, portfolio, contact email, and reviews.</li>
          <li>Profile photos (avatars), once uploaded.</li>
          <li>Reviews you write are shown publicly on the reviewed designer&apos;s studio page, attributed to you.</li>
        </ul>
        <p><strong>Private — never shown to other users:</strong></p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>Your email address and phone number.</li>
          <li>Fashion Diary entries — visible only to you, enforced at the database level.</li>
          <li>Saved items and notification preferences.</li>
          <li>Messages — visible only to the two participants of a conversation.</li>
          <li>Verification documents — accessible only to you and HRUNA administrators.</li>
        </ul>
      </>
    ),
  },
  {
    id: "how-uploads-work",
    heading: "How uploaded content is handled",
    body: (
      <p>
        Images and documents you upload (avatars, studio images, request/project images,
        verification documents) are stored in dedicated, access-controlled storage buckets. Some
        buckets (like avatars and studio images) are public by design, since they&apos;re meant to
        be seen by other users; others (like verification documents and Fashion Diary images) are
        private and access-restricted to you and, where relevant, HRUNA administrators. File
        size and type are restricted at the storage level.
      </p>
    ),
  },
  {
    id: "customer-designer-data-use",
    heading: "How customer and designer information is used between each other",
    body: (
      <p>
        When you submit a request or send a message, the relevant profile information (your name,
        photo, and the content of your request or message) is shared with the designer or
        customer you&apos;re interacting with, so the collaboration can actually happen. This
        sharing is limited to what&apos;s needed for that interaction — a designer you&apos;ve
        never contacted has no access to your private information.
      </p>
    ),
  },
  {
    id: "security",
    heading: "Authentication & security",
    body: (
      <p>
        Your password is managed entirely by Supabase Auth using industry-standard hashing; HRUNA
        application code never sees or stores it in plain text. Access to your data is additionally
        enforced at the database level through Row Level Security — meaning even a technical error
        elsewhere in the application cannot expose your private data to another user, because the
        database itself rejects unauthorized access.
      </p>
    ),
  },
  {
    id: "your-rights",
    heading: "Your choices & rights",
    body: (
      <>
        <p>You can, at any time:</p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>View and update your profile information from Settings.</li>
          <li>Change your password from Settings → Security.</li>
          <li>Update your notification preferences from Settings → Notifications.</li>
          <li>
            Request deletion of your account from Settings → Security → Delete Account. If your
            account has no existing requests, projects, reviews, or other recorded activity, it is
            deleted permanently and immediately. If it has such history, automatic deletion isn&apos;t
            available yet — see the{" "}
            <Link href="/account-policy" className="text-primary hover:underline">
              Account Suspension &amp; Termination Policy
            </Link>{" "}
            for why, and contact support to discuss your options.
          </li>
        </ul>
        <p>
          Depending on applicable law in your jurisdiction, you may have additional rights, such as
          requesting a copy of your data or objecting to certain uses of it.{" "}
          <strong>[JURISDICTION-SPECIFIC RIGHTS DETAIL TO BE INSERTED FOLLOWING LEGAL REVIEW]</strong>
        </p>
      </>
    ),
  },
  {
    id: "retention",
    heading: "Data retention",
    body: (
      <p>
        We retain your information for as long as your account is active. Some records —
        particularly those tied to a completed project, review, or dispute involving another
        person — may be retained even after an account-deletion request where deleting them would
        break the integrity of another user&apos;s records; see the{" "}
        <Link href="/account-policy" className="text-primary hover:underline">
          Account Policy
        </Link>{" "}
        for detail.{" "}
        <strong>[SPECIFIC RETENTION PERIODS TO BE INSERTED FOLLOWING LEGAL REVIEW]</strong>
      </p>
    ),
  },
  {
    id: "payments",
    heading: "Payments",
    body: (
      <p>
        HRUNA does not currently process payments on the customer side. Where
        subscription-related records exist in the system for designer accounts, they are not
        connected to live billing today.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: (
      <p>
        We may update this Privacy Policy as HRUNA evolves. Material changes will be reflected
        by updating the &ldquo;Last updated&rdquo; date above.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "How to reach us",
    body: (
      <p>
        For privacy questions, concerns, or to exercise a right described above, contact{" "}
        <strong>[OFFICIAL CONTACT DETAILS TO BE INSERTED]</strong>, or use the{" "}
        <Link href="/help" className="text-primary hover:underline">Help Center</Link> /{" "}
        <Link href="/support" className="text-primary hover:underline">Contact Support</Link> in the
        meantime.
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <PolicyPage
      eyebrow="LEGAL"
      title="Privacy Policy"
      lastUpdated="September 10, 2026"
      intro={
        <p>
          This policy explains what information HRUNA collects, why, and how it&apos;s used —
          based on how the platform actually works today, not generic boilerplate.
        </p>
      }
      sections={sections}
    />
  );
}
