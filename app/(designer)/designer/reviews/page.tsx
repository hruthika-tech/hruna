"use client";

import { useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { RatingDisplay } from "@/components/ui/Rating";
import { Avatar } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import type { CustomerSummary } from "@/lib/designer/data";

interface ReviewRow {
  id: string;
  projectId: string;
  projectTitle: string;
  rating: number;
  text: string;
  date: string;
  customer?: CustomerSummary;
}

// VIEW only (§34) — no create/edit/delete UI exists here, matching the backend: there is no
// designer-facing write endpoint for reviews at all. rating/review_count are read straight from
// designer_profiles elsewhere (derived by the reviews_recompute_designer_rating trigger, Phase 1);
// this page's own average is just a display convenience computed from what's shown here.
export default function DesignerReviewsPage() {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [average, setAverage] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/designer/reviews");
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Couldn't load your reviews.");
        setReviews(data.reviews);
        setAverage(data.average);
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your reviews.");
        setStatus("error");
      }
    })();
  }, []);

  if (status === "loading") {
    return (
      <div className="container-editorial py-12 pb-section-gap">
        <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
          <Loader2 className="animate-spin" size={18} /> Loading reviews…
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="container-editorial py-12 pb-section-gap text-center">
        <p className="text-headline-sm mb-2">Couldn't load your reviews</p>
        <p className="text-ink-variant text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <p className="text-label-md text-outline mb-2">REVIEWS</p>
      <h1 className="text-headline-md mb-8">What customers are saying</h1>

      <div className="flex items-center gap-6 mb-12 p-6 rounded-md bg-surface-low w-fit">
        <p className="text-4xl font-display">{average.toFixed(1)}</p>
        <div>
          <RatingDisplay value={average} size={18} />
          <p className="text-xs text-outline mt-1">{reviews.length} review{reviews.length !== 1 && "s"}</p>
        </div>
      </div>

      {reviews.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reviews.map((r) => (
            <div key={r.id} className="border border-outline-variant rounded-md p-6">
              <div className="flex items-center gap-3 mb-3">
                {r.customer && <Avatar src={r.customer.avatar} alt={r.customer.name} size={36} />}
                <div>
                  <p className="text-sm font-medium">{r.customer?.name}</p>
                  {r.projectTitle && <p className="text-xs text-outline">{r.projectTitle}</p>}
                </div>
              </div>
              <RatingDisplay value={r.rating} />
              <p className="text-ink-variant text-sm mt-3 leading-relaxed">{r.text}</p>
              <p className="text-xs text-outline mt-3">{formatDate(r.date)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Star className="mx-auto text-outline mb-4" size={32} />
          <p className="text-sm text-outline">No reviews yet — they&apos;ll appear here once a project is completed.</p>
        </div>
      )}
    </div>
  );
}
