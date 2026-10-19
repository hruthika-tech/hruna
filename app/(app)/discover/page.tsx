"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, Loader2, SearchX } from "lucide-react";
import { DesignerCard } from "@/components/designer/DesignerCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ProfessionalType, Specialization, Designer } from "@/types";

const SPECIALIZATIONS: Specialization[] = [
  "Bridal Couture",
  "Bespoke Tailoring",
  "Occasion Wear",
  "Contemporary Ready-to-Wear",
  "Sustainable Fashion",
  "Menswear",
];
const TYPES: ProfessionalType[] = ["Designer", "Boutique", "Tailor"];

export default function DiscoverPage() {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [query, setQuery] = useState("");
  const [specialization, setSpecialization] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/designers");
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Couldn't load designers.");
        setDesigners(data.designers);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();
  }, []);

  const results = useMemo(() => {
    return designers.filter((d) => {
      const matchesQuery =
        !query ||
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        d.studioName.toLowerCase().includes(query.toLowerCase()) ||
        d.city.toLowerCase().includes(query.toLowerCase());
      const matchesSpec = !specialization || d.specializations.includes(specialization as Specialization);
      const matchesType = !type || d.type === type;
      const matchesAvailable = !availableOnly || d.available;
      return matchesQuery && matchesSpec && matchesType && matchesAvailable;
    });
  }, [designers, query, specialization, type, availableOnly]);

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <p className="text-label-md text-outline mb-2">DISCOVER</p>
      <h1 className="text-headline-md mb-8">Find your designer, boutique or tailor</h1>

      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={18} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, studio or city..."
            className="pl-12"
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowFilters((s) => !s)}
          className="justify-center md:w-auto"
        >
          <SlidersHorizontal size={16} /> Filters
        </Button>
      </div>

      {showFilters && (
        <div className="flex flex-col gap-5 mb-10 p-6 rounded-md bg-surface-low border border-outline-variant">
          <div>
            <p className="text-label-md text-outline mb-2">SPECIALIZATION</p>
            <div className="flex flex-wrap gap-2">
              {SPECIALIZATIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpecialization(specialization === s ? null : s)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm border transition-colors",
                    specialization === s ? "bg-primary text-white border-primary" : "border-outline-variant text-ink-variant"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-label-md text-outline mb-2">TYPE</p>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(type === t ? null : t)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm border transition-colors",
                    type === t ? "bg-primary text-white border-primary" : "border-outline-variant text-ink-variant"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-variant">
            <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
            Available for new requests only
          </label>
        </div>
      )}

      {status === "loading" ? (
        <div className="flex items-center justify-center gap-2 text-outline py-24">
          <Loader2 className="animate-spin" size={18} /> Loading designers…
        </div>
      ) : status === "error" ? (
        <div className="text-center py-24">
          <p className="text-headline-sm mb-2">Couldn't load designers</p>
          <p className="text-ink-variant text-sm">Please try again in a moment.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-outline mb-6">{results.length} designer{results.length !== 1 && "s"} found</p>
          {results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((d) => (
                <DesignerCard key={d.id} designer={d} />
              ))}
            </div>
          ) : (
            <div className="text-center py-24">
              <SearchX className="mx-auto text-outline mb-4" size={32} />
              <p className="text-headline-sm mb-2">No designers match your filters</p>
              <p className="text-ink-variant text-sm">Try adjusting your search or clearing filters.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
