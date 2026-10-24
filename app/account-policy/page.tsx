import Link from "next/link";
import { PolicyPage, type PolicySection } from "@/components/layout/PolicyPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Account Suspension & Termination Policy",
  description: "What can happen to a HRUNA account, including suspension and termination, and exactly how account deletion works today.",
  path: "/account-policy",
});

const sections: PolicySection[] = [
  {
    id: "your-responsibility",
    heading: "Your responsibility",
    body: (
      <p>
        You&apos;re responsible for your account and for keeping it secure. See{" "}
        <Link href="/acceptable-use" className="text-primary hover:underline">Acceptable Use</Link>{" "}
        for what&apos;s expected, and change your password from Settings → Security if you ever
        suspect it&apos;s been compromised.
      </p>
    ),
  },
  {
    id: "why-restricted",
    heading: "Reasons an account may be restricted",
    body: (
      <ul className="list-disc pl-5 flex flex-col gap-1.5">
        <li>Violating any HRUNA policy.</li>
        <li>Fraud.</li>
        <li>Abuse or harassment.</li>
        <li>Impersonation.</li>
        <li>Unauthorized access attempts.</li>
        <li>Repeated violations.</li>
        <li>Illegal activity.</li>
        <li>Other platform abuse.</li>
      </ul>
    ),
  },
  {
    id: "possible-actions",
    heading: "Possible actions",
    body: (
      <p>
        Depending on severity: a warning, content removal, restriction of specific features,
        temporary suspension, or permanent termination. These actions are currently taken by
        HRUNA administrators — there isn&apos;t yet a self-service way to suspend or restrict
        your own account short of deleting it (see below).
      </p>
    ),
  },
  {
    id: "deletion",
    heading: "Account deletion",
    body: (
      <>
        <p>
          You can request deletion of your own account from Settings → Security → Delete Account.
          What happens next depends on your account&apos;s history:
        </p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>
            <strong>No existing requests, projects, reviews, or other recorded activity:</strong>{" "}
            your account is deleted immediately and permanently.
          </li>
          <li>
            <strong>Existing requests, projects, reviews, or other activity on file:</strong>{" "}
            automatic deletion isn&apos;t available. This is a deliberate limit, not an oversight
            — see &ldquo;Why some records are retained&rdquo; below. Contact support to discuss
            your options.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "why-retained",
    heading: "Why some records are retained",
    body: (
      <p>
        HRUNA&apos;s database intentionally keeps certain records — like a completed project, a
        review, or an existing dispute — tied to the account, rather than letting them be silently
        deleted along with it. This exists to protect other people&apos;s records: for example, a
        designer&apos;s completed project and the review a customer left on it shouldn&apos;t
        disappear just because the customer&apos;s account is deleted, since that project and
        review are also part of the designer&apos;s history on the platform. Financial/subscription
        records are retained for the same reason — they&apos;re treated as records that
        shouldn&apos;t silently vanish. We do not promise that every historical record tied to your
        account is immediately and permanently deleted upon request when doing so would affect
        another user&apos;s data.
      </p>
    ),
  },
  {
    id: "after-deletion",
    heading: "After deletion",
    body: (
      <p>
        Once your account itself is deleted (the no-history case above), your login credentials,
        profile, saved items, Fashion Diary, uploaded files, and conversations tied only to you are
        removed along with it.
      </p>
    ),
  },
];

export default function AccountPolicyPage() {
  return (
    <PolicyPage
      eyebrow="LEGAL"
      title="Account Suspension & Termination Policy"
      lastUpdated="September 10, 2026"
      intro={<p>What can happen to your account, and exactly how account deletion works today.</p>}
      sections={sections}
    />
  );
}
