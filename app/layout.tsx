import type { Metadata, Viewport } from "next";
import { Playfair_Display, DM_Sans, Caveat } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/hooks/use-toast";

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

export const metadata: Metadata = {
  title: "HRUNA — Where Vision Meets Craft",
  description:
    "HRUNA connects you with verified fashion designers, tailors and boutiques to bring your dream garment to life — from private commission to final fitting.",
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
