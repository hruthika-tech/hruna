"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MapPin, MessageCircle, Loader2 } from "lucide-react";
import { SaveToggleButton } from "@/components/ui/SaveToggleButton";
import { Avatar } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import type { Dress, Designer } from "@/types";
import { dressAvailability } from "@/lib/dresses/availability";

// Real data (Phase 7 fix) — this page used to read lib/mock-data.ts entirely, which meant it
// broke for any real designer's dress (the mock ids don't exist in the real `dresses` table).
export default function DressDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();
  const [status, setStatus] = useState<"loading" | "notFound" | "error" | "ready">("loading");
  const [dress, setDress] = useState<Dress | null>(null);
  const [designer, setDesigner] = useState<Designer | null>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [contacting, setContacting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/dresses/${params.id}`);
        const data = await res.json();
        if (res.status === 404) return setStatus("notFound");
        if (!res.ok) throw new Error(data.message ?? "Couldn't load this dress.");
        setDress(data.dress);
        setDesigner(data.designer);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();
  }, [params.id]);

  const contactDesigner = async () => {
    if (!designer) return;
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

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-outline py-24">
        <Loader2 className="animate-spin" size={18} /> Loading…
      </div>
    );
  }
  if (status === "notFound") {
    return (
      <div className="text-center py-24">
        <p className="text-headline-sm mb-2">Dress not found</p>
        <p className="text-ink-variant text-sm">It may have been removed by the designer.</p>
      </div>
    );
  }
  if (status === "error" || !dress) {
    return (
      <div className="text-center py-24">
        <p className="text-headline-sm mb-2">Couldn't load this dress</p>
        <p className="text-ink-variant text-sm">Please try again in a moment.</p>
      </div>
    );
  }

  // "Available for purchase" + the designer's stock status, combined by the one shared rule.
  const availability = dressAvailability(dress);

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <div className="grid md:grid-cols-2 gap-12">
        <div>
          <div className="relative h-[480px] rounded-md overflow-hidden mb-4 bg-surface-low">
            {dress.images[activeImg] && (
              <Image src={dress.images[activeImg]} alt={dress.name} fill className="object-cover" />
            )}
            {availability.badge && (
              <span className="absolute top-4 left-4 bg-ink/70 text-white text-xs px-3 py-1.5 rounded-full">{availability.badge}</span>
            )}
          </div>
          {dress.images.length > 1 && (
            <div className="flex gap-3">
              {dress.images.map((img, i) => (
                <button
                  key={img}
                  onClick={() => setActiveImg(i)}
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

          {designer && (
            <div className="flex items-center gap-3 p-4 rounded-md bg-surface-low mb-8">
              <Avatar src={designer.avatar} alt={designer.name} size={44} verified={designer.verified} />
              <div className="flex-1">
                <p className="font-medium text-sm">{designer.studioName}</p>
                <p className="text-xs text-outline flex items-center gap-1"><MapPin size={12} />{designer.city}</p>
              </div>
              <LinkButton href={`/studio/${designer.id}`} variant="secondary" size="sm">View Studio</LinkButton>
            </div>
          )}

          <div className="flex gap-3">
            {/* Only an orderable dress (available for purchase AND not currently unavailable) can be ordered. */}
            {availability.orderable ? (
              <Button onClick={contactDesigner} size="lg" className="flex-1" disabled={contacting || !designer}>
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
