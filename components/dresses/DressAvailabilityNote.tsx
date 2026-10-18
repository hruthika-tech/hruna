import { dressAvailability } from "@/lib/dresses/availability";
import { cn } from "@/lib/utils";

// One quiet line under a dress card's price: "In stock", "Made to order", "Currently unavailable" or
// "Not available for purchase" — from the single rule in lib/dresses/availability.ts.
export function DressAvailabilityNote({ dress, className }: { dress: { available: boolean; stockStatus?: string | null }; className?: string }) {
  const { label, orderable } = dressAvailability(dress);
  return (
    <p data-testid="dress-availability" className={cn("text-xs mt-1", orderable ? "text-ink-variant" : "text-outline", className)}>
      {label}
    </p>
  );
}
