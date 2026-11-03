import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import packageJson from "@/package.json";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "How HRUNA Works",
  description:
    "How custom clothing works on HRUNA: find a verified designer, describe your garment, compare proposals, follow progress and confirm your finished piece.",
  path: "/about",
});

// The "how it works" page. Every step describes an existing flow (Discover, fashion requests,
// proposals, projects with updates and messaging, completion and reviews) — the same facts the Help
// Center answers — so nothing here promises a feature the app doesn't have.
const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Discover designers",
    body: (
      <>
        Browse verified studios on{" "}
        <Link href="/discover" className="text-primary font-medium hover:underline">
          Discover
        </Link>{" "}
        and filter by specialization — bridal couture, occasion wear, bespoke tailoring and more. Each studio page shows
        the designer&apos;s collections, previous work and reviews. Only designers who have completed HRUNA&apos;s identity
        and portfolio review appear there.
      </>
    ),
  },
  {
    title: "2. Describe the garment you want",
    body: (
      <>
        Start a fashion request with what you have in mind: the category, your budget, measurements, timeline and
        inspiration images. Open it to all designers, or send it privately to one designer from their studio page.
      </>
    ),
  },
  {
    title: "3. Receive proposals",
    body: (
      <>
        Designers who can make your piece reply with proposals — their price, estimated time and how they would approach
        it. Compare them and accept the one that fits.
      </>
    ),
  },
  {
    title: "4. Stay in touch and follow the project",
    body: (
      <>
        Accepting a proposal starts a project. Message your designer directly and follow the progress updates they post
        while your piece is being made.
      </>
    ),
  },
  {
    title: "5. Complete your garment journey",
    body: (
      <>
        When the designer marks the piece complete, you confirm it — or request changes if it isn&apos;t quite right yet.
        Once it&apos;s complete, you can leave a review to help others find the right designer.
      </>
    ),
  },
];

export default function AboutPage() {
  return (
    <ContentPage eyebrow="ABOUT" title="How HRUNA Works">
      <p>
        HRUNA connects you with independent fashion designers, boutiques and tailors in India who make clothing to order.
        Here is how a custom piece comes together — from the first idea to the final fitting.
      </p>
      {STEPS.map((step) => (
        <section key={step.title}>
          <h2 className="text-headline-sm text-ink mb-3">{step.title}</h2>
          <p>{step.body}</p>
        </section>
      ))}
      <section>
        <h2 className="text-headline-sm text-ink mb-3">Free for customers</h2>
        <p>HRUNA is free for customers and takes no commission on the garments you commission.</p>
      </section>
      <section>
        <h2 className="text-headline-sm text-ink mb-3">Designers, boutiques and tailors</h2>
        <p>
          Make clothing to order? See how to{" "}
          <Link href="/become-a-designer" className="text-primary font-medium hover:underline">
            bring your atelier to HRUNA
          </Link>
          . Questions about any step are answered in the{" "}
          <Link href="/help" className="text-primary font-medium hover:underline">
            Help Center
          </Link>
          .
        </p>
      </section>
      <p className="text-xs text-outline pt-4 border-t border-outline-variant">HRUNA v{packageJson.version}</p>
    </ContentPage>
  );
}
