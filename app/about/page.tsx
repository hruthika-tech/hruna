import { ContentPage } from "@/components/layout/ContentPage";
import packageJson from "@/package.json";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "About HRUNA",
  description: "Describe the garment you're dreaming of, receive proposals from verified designers, tailors and boutiques, and follow it from commission to final fitting.",
  path: "/about",
});

// Reuses the brand copy already established elsewhere (app/layout.tsx's metadata description,
// components/layout/Footer.tsx's tagline, and the landing page's hero/how-it-works section) rather
// than inventing new About-page copy from scratch.
export default function AboutPage() {
  return (
    <ContentPage eyebrow="ABOUT" title="Where Vision Meets Craft">
      <p>
        HRUNA connects you with verified fashion designers, tailors and boutiques to bring your
        dream garment to life — from private commission to final fitting.
      </p>
      <p>
        No browsing endless racks. Just your vision, in the hands of someone who can make it.
        Describe the garment you&apos;re dreaming of, receive proposals from designers who
        understand it, and watch it come to life — start to finish, in one place.
      </p>
      <p>Where vision meets craft — a private atelier for every fashion request.</p>
      <p className="text-xs text-outline pt-4 border-t border-outline-variant">HRUNA v{packageJson.version}</p>
    </ContentPage>
  );
}
