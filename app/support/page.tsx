import Link from "next/link";
import { Mail } from "lucide-react";
import { ContentPage } from "@/components/layout/ContentPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Contact Support",
  description: "How to get help with HRUNA. A dedicated support channel is still being set up; most questions are answered in the HRUNA Help Center.",
  path: "/support",
});

// Honest, non-fake Contact Support state: there's no ticketing/email backend wired up yet, so this
// deliberately does NOT pretend to submit a form. It's a clearly-labeled temporary state with a
// real, working path (Help Center) rather than an invented support address or a form that silently
// goes nowhere.
export default function ContactSupportPage() {
  return (
    <ContentPage eyebrow="SUPPORT" title="Contact Support">
      <div className="flex flex-col items-start gap-4 p-5 rounded-md border border-outline-variant bg-surface-low">
        <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center text-primary">
          <Mail size={20} />
        </div>
        <div>
          <p className="text-ink font-medium mb-1">Support is still being set up</p>
          <p className="text-sm text-ink-variant">
            A dedicated support channel for HRUNA isn&apos;t live yet, so we don&apos;t want to promise a
            contact form or address that doesn&apos;t actually reach anyone. In the meantime, most
            questions about your account, requests, projects, and profile are answered in the{" "}
            <Link href="/help" className="text-primary font-medium hover:underline">
              Help Center
            </Link>
            .
          </p>
        </div>
      </div>
      <p className="text-xs text-outline">
        This page will be updated with a real support channel as soon as one is available.
      </p>
    </ContentPage>
  );
}
