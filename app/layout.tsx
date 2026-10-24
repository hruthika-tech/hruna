import type { Metadata, Viewport } from "next";
import { Playfair_Display, DM_Sans, Caveat } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/hooks/use-toast";
import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, DEFAULT_TITLE, SITE_NAME, SITE_URL } from "@/lib/seo";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "700"],
});

// Landing-page annotation accents only (scrapbook captions/doodled labels) — see font-hand.
const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  weight: ["500", "600", "700"],
});

// Site-wide defaults (lib/seo.ts). No canonical here on purpose: Next would inherit it into every
// page that doesn't set its own, pointing them all at the homepage — public pages set theirs via
// pageMetadata(). Icons come from the app/favicon.ico, app/icon.png and app/apple-icon.png file
// conventions; the default share image is public/brand/hruna-og.png.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: { default: DEFAULT_TITLE, template: `%s | ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
};

// The phone keyboard resizes the page (not just overlays it), so fixed/full-height layouts such as
// the chat keep their composer visible above the keyboard (Android Chrome; iOS scrolls it into view).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${dmSans.variable} ${caveat.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
