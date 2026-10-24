import { PolicyPage, RoleList, type PolicySection } from "@/components/layout/PolicyPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Designer–Customer Collaboration Policy",
  description: "How customers and designers are expected to work together on HRUNA, end to end.",
  path: "/collaboration-policy",
});

const sections: PolicySection[] = [
  {
    id: "lifecycle",
    heading: "The HRUNA collaboration lifecycle",
    body: (
      <>
        <p>Every collaboration on HRUNA follows the same path:</p>
        <div className="p-5 rounded-md border border-outline-variant bg-surface-low text-sm text-ink font-medium text-center leading-loose">
          DISCOVER → REQUEST → PROPOSAL → ACCEPTANCE → PROJECT → MESSAGING / UPDATES → CUSTOMER CONFIRMATION → COMPLETION
        </div>
        <p>
          A customer discovers a designer and submits a fashion request. A designer sends a
          proposal in response. Once the customer accepts a proposal, it becomes a project. The
          two collaborate through messaging and project updates until the work is ready, at which
          point the customer confirms completion.
        </p>
      </>
    ),
  },
  {
    id: "customer-conduct",
    heading: "Customer conduct",
    body: (
      <RoleList
        role="Customer"
        items={[
          "Provide accurate requirements in your fashion requests.",
          "Communicate respectfully and promptly.",
          "Don't submit fraudulent or malicious requests.",
          "Respect a designer's time and creative work.",
          "Don't impersonate someone else.",
          "Don't abuse the proposal or request systems (e.g. spamming requests).",
        ]}
      />
    ),
  },
  {
    id: "designer-conduct",
    heading: "Designer conduct",
    body: (
      <RoleList
        role="Designer"
        items={[
          "Provide accurate profile and studio information.",
          "Respond to requests and messages professionally.",
          "Provide accurate proposals — don't misrepresent what you can deliver.",
          "Communicate clearly throughout a project.",
          "Don't misrepresent your qualifications or experience.",
          "Don't impersonate another designer or studio.",
          "Respect customer information and privacy.",
          "Respect intellectual property — yours and others'.",
        ]}
      />
    ),
  },
  {
    id: "both",
    heading: "Expected of everyone",
    body: (
      <RoleList
        role="Platform-Wide"
        items={[
          "Communicate professionally.",
          "No harassment or threats.",
          "No scams or fraud.",
          "No review manipulation.",
          "No platform abuse.",
          "Follow applicable laws and every HRUNA policy.",
        ]}
      />
    ),
  },
  {
    id: "scope-note",
    heading: "What this doesn't cover",
    body: (
      <p>
        HRUNA facilitates the connection and collaboration between customers and designers. It
        does not currently process payment, shipping, delivery, or returns as part of the
        platform — any such arrangement for a commissioned piece is agreed directly between the
        customer and the designer, outside HRUNA&apos;s current feature set.
      </p>
    ),
  },
];

export default function CollaborationPolicyPage() {
  return (
    <PolicyPage
      eyebrow="LEGAL"
      title="Designer–Customer Collaboration Policy"
      lastUpdated="September 10, 2026"
      intro={<p>How customers and designers are expected to work together on HRUNA, end to end.</p>}
      sections={sections}
    />
  );
}
