"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, MessageCircle } from "lucide-react";
import { SaveToggleButton } from "@/components/ui/SaveToggleButton";
import { Avatar } from "@/components/ui/Badge";
import { ImageLightbox, LightboxTrigger } from "@/components/ui/ImageLightbox";
import { Button, LinkButton } from "@/components/ui/Button";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import type { Dress } from "@/types";
import type { PublicDesignerSummary } from "@/lib/customer/discovery";
import { dressAvailability } from "@/lib/dresses/availability";

// The interactive dress detail (gallery, lightbox, save, contact). The data is loaded on the server
// by ./page.tsx — which also answers 404 for a missing dress — so it arrives here ready to render.
export function DressDetailsView({ dress, designer }: { dress: Dress; designer: PublicDesignerSummary }) {
  const router = useRouter();
  const { push } = useToast();
  const [activeImg, setActiveImg] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const [contacting, setContacting] = useState(false);

  const contactDesigner = async () => {
    setContacting(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designerId: designer.id }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't start a conversation.");
      router.push(`/messages?conversationId=${data.conversationId}`);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't start a conversation.", "error");
      setContacting(false);
    }
  };

  // "Available for purchase" + the designer's stock status, combined by the one shared rule.
  const availability = dressAvailability(dress);

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          <div className="relative h-[480px] rounded-md overflow-hidden mb-4 bg-surface-low">
            {dress.images[activeImg] && (
              <LightboxTrigger onOpen={() => setViewer(activeImg)} label={`Enlarge image of ${dress.name}`} className="absolute inset-0 w-full h-full">
                <Image src={dress.images[activeImg]} alt={dress.name} fill className="object-cover" />
              </LightboxTrigger>
            )}
            {availability.badge && (
              <span className="pointer-events-none absolute top-4 left-4 bg-ink/70 text-white text-xs px-3 py-1.5 rounded-full">{availability.badge}</span>
            )}
          </div>
          {dress.images.length > 1 && (
            <div className="flex flex-wrap gap-3">
              {dress.images.map((img, i) => (
                <button
                  key={img}
                  onClick={() => setActiveImg(i)}
                  aria-label={`Show image ${i + 1}`}
                  className={cn(
                    "relative w-20 h-20 rounded-sm overflow-hidden border-2",
                    activeImg === i ? "border-primary" : "border-transparent"
                  )}
                >
                  <Image src={img} alt="" fill sizes="80px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
          <ImageLightbox images={dress.images} index={viewer} onClose={() => setViewer(null)} onIndexChange={(i) => { setViewer(i); setActiveImg(i); }} />
        </div>

        <div>
          <div className="flex items-start justify-between gap-4 mb-3">
            <h1 className="text-headline-md">{dress.name}</h1>
            <SaveToggleButton itemType="dress" itemId={dress.id} />
          </div>
          <p className="text-2xl text-primary font-medium mb-6">{formatCurrency(dress.price)}</p>
          {dress.description && <p className="text-ink-variant leading-relaxed mb-6">{dress.description}</p>}
          <div className="flex flex-col gap-2 text-sm mb-8">
            {dress.fabric && <p><span className="text-outline">Fabric: </span>{dress.fabric}</p>}
            <p data-testid="dress-availability"><span className="text-outline">Availability: </span>{availability.label}</p>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-md bg-surface-low mb-8">
            <Avatar src={designer.avatar} alt={designer.name} size={44} verified={designer.verified} />
            <div className="flex-1">
              <p className="font-medium text-sm">{designer.studioName}</p>
              <p className="text-xs text-outline flex items-center gap-1"><MapPin size={12} />{designer.city}</p>
            </div>
            <LinkButton href={`/studio/${designer.id}`} variant="secondary" size="sm">View Studio</LinkButton>
          </div>

          <div className="flex gap-3">
            {/* Only an orderable dress (available for purchase AND not currently unavailable) can be ordered. */}
            {availability.orderable ? (
              <Button onClick={contactDesigner} size="lg" className="flex-1" disabled={contacting}>
                <MessageCircle size={16} /> {contacting ? "Starting conversation…" : "Contact Designer"}
              </Button>
            ) : (
              <LinkButton href={`/requests/new?designerId=${dress.designerId}`} size="lg" className="flex-1">
                Request a Similar Design
              </LinkButton>
            )}
          </div>
          <p className="text-xs text-outline mt-4">
            Pricing, alterations, and pickup or delivery are arranged directly with the designer.
          </p>
        </div>
      </div>
    </div>
  );
}
