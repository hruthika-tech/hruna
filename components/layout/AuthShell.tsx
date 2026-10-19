import Link from "next/link";
import { SafeImage } from "@/components/ui/SafeImage";

export function AuthShell({
  children,
  // Real local Stitch asset — not external stock. Previously an Unsplash photo ID; auth pages
  // should never depend on unverified third-party imagery (see the create-account fix for why).
  image = "/images/stitch/couture-gown-atelier-crop.png",
  imageAlt = "A hand-painted couture gown sketch on an atelier desk",
  quote = "“Every garment begins as a private conversation between vision and craft.”",
}: {
  children: React.ReactNode;
  image?: string;
  imageAlt?: string;
  quote?: string;
}) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 md:px-20 py-16">
        <Link href="/" className="font-display text-2xl tracking-[0.2em] mb-16">HRUNA</Link>
        <div className="w-full max-w-sm mx-auto lg:mx-0">{children}</div>
      </div>
      <div className="relative hidden lg:block">
        {/* SafeImage, not a bare next/image — a missing/broken auth-page image should degrade to
            the shared neutral placeholder, never a raw broken-image icon. */}
        <SafeImage src={image} alt={imageAlt} className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
        <p className="absolute bottom-16 left-16 right-16 text-white font-display text-2xl italic leading-snug">
          {quote}
        </p>
      </div>
    </div>
  );
}
