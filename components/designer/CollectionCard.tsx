import Image from "next/image";
import { Images } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * A collection's card: cover image across the top (fixed 4:3 frame, object-cover, so any source
 * aspect ratio fills it without distortion), category + name below. Collections created before
 * cover images existed have no coverImage — they get a quiet placeholder instead of an empty box.
 * Server-component safe (no hooks), so both the designer's own Studio and the public Studio page
 * can render it.
 */
export function CollectionCard({
  name,
  category,
  coverImage,
  pieceCount,
  sizes = "(max-width: 768px) 100vw, 33vw",
}: {
  name: string;
  category: string;
  coverImage: string;
  /** Number of dresses in this collection; omitted or 0 shows nothing. */
  pieceCount?: number;
  sizes?: string;
}) {
  return (
    <Card hover className="group h-full">
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-container">
        {coverImage ? (
          <Image
            src={coverImage}
            alt={name}
            fill
            sizes={sizes}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-outline">
            <Images size={26} strokeWidth={1.25} />
            <span className="text-[11px] uppercase tracking-[0.2em]">No cover yet</span>
          </div>
        )}
      </div>
      <div className="p-5">
        {category && <p className="text-xs text-outline uppercase tracking-wide mb-1">{category}</p>}
        <p className="font-display text-lg">{name}</p>
        {!!pieceCount && <p className="text-xs text-ink-variant mt-1">{pieceCount} {pieceCount === 1 ? "piece" : "pieces"}</p>}
      </div>
    </Card>
  );
}
