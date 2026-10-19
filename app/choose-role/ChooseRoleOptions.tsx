"use client";

import { useRouter } from "next/navigation";
import { ShoppingBag, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

// The two separate role choices. Neither creates anything by itself — each opens its own onboarding,
// whose API routes create the matching profile for the signed-in user (one per role, UNIQUE user_id).
export function ChooseRoleOptions() {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
      <button
        onClick={() => router.push("/onboarding")}
        data-testid="choose-customer"
        className={cn(
          "flex flex-col items-start gap-4 p-8 rounded-md border border-outline-variant text-left hover:border-primary hover:shadow-soft transition-all"
        )}
      >
        <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center text-primary">
          <ShoppingBag size={20} />
        </div>
        <div>
          <p className="font-display text-xl mb-1">Commission Fashion</p>
          <p className="text-sm text-ink-variant">Discover designers, request custom pieces, and track your projects.</p>
        </div>
      </button>

      <button
        onClick={() => router.push("/designer-onboarding")}
        data-testid="choose-designer"
        className={cn(
          "flex flex-col items-start gap-4 p-8 rounded-md border border-outline-variant text-left hover:border-primary hover:shadow-soft transition-all"
        )}
      >
        <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center text-primary">
          <Scissors size={20} />
        </div>
        <div>
          <p className="font-display text-xl mb-1">Showcase My Craft</p>
          <p className="text-sm text-ink-variant">Set up your studio as a designer, boutique or tailor and receive requests.</p>
        </div>
      </button>
    </div>
  );
}
