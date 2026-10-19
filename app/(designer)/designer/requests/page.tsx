"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, Bookmark, Loader2, Inbox } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { formatCurrency, formatDate } from "@/lib/utils";

type TabValue = "all" | "new" | "interested" | "accepted" | "declined" | "received" | "saved";

const TABS: { label: string; value: TabValue }[] = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "Interested Designs", value: "interested" },
  { label: "Accepted Designs", value: "accepted" },
  { label: "Declined Designs", value: "declined" },
  { label: "Requests Received", value: "received" },
  { label: "Saved Designs", value: "saved" },
];

interface RequestRow {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate: string;
  location: string;
  budgetMin: number;
  budgetMax: number;
  preferredDesignerId?: string;
}

interface InteractionRow {
  requestId: string;
  swipeStatus?: "interested" | "declined";
  saved: boolean;
}

export default function DesignerRequestsPage() {
  const [active, setActive] = useState<TabValue>("all");
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [allRequests, setAllRequests] = useState<RequestRow[]>([]);
  const [interactions, setInteractions] = useState<InteractionRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/designer/requests");
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Couldn't load your requests.");
        setAllRequests(data.requests);
        setInteractions(data.interactions);
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your requests.");
        setStatus("error");
      }
    })();
  }, []);

  const interactionFor = (requestId: string) => interactions.find((i) => i.requestId === requestId);

  const direct = allRequests.filter((r) => !!r.preferredDesignerId);
  const publicInteracted = allRequests.filter((r) => !r.preferredDesignerId && interactionFor(r.id));
  const relevant = [...direct, ...publicInteracted];

  const buckets: Record<TabValue, RequestRow[]> = {
    all: relevant,
    new: direct.filter((r) => r.status === "submitted"),
    interested: publicInteracted.filter((r) => interactionFor(r.id)?.swipeStatus === "interested"),
    accepted: relevant.filter((r) => r.status === "accepted"),
    declined: relevant.filter((r) => r.status === "declined" || interactionFor(r.id)?.swipeStatus === "declined"),
    received: direct,
    saved: relevant.filter((r) => interactionFor(r.id)?.saved),
  };

  const filtered = buckets[active];

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <p className="text-label-md text-outline mb-2">MY REQUESTS</p>
      <h1 className="text-headline-md mb-8">Your fashion requests</h1>

      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
          <Loader2 className="animate-spin" size={18} /> Loading your requests…
        </div>
      )}
      {status === "error" && (
        <div className="text-center py-24">
          <p className="text-headline-sm mb-2">Couldn't load your requests</p>
          <p className="text-ink-variant text-sm">{error}</p>
        </div>
      )}

      {status === "ready" && (
        <>
          <Tabs
            tabs={TABS.map((t) => ({ ...t, count: buckets[t.value].length }))}
            active={active}
            onChange={(v) => setActive(v as TabValue)}
          />

          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              {filtered.map((r) => {
                const interaction = interactionFor(r.id);
                const isPublic = !r.preferredDesignerId;
                return (
                  <Link key={r.id} href={`/designer/requests/${r.id}`}>
                    <Card hover>
                      <CardBody className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-display text-lg">{r.title}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {interaction?.saved && (
                              <span className="text-primary" aria-label="Saved">
                                <Bookmark size={15} className="fill-primary" />
                              </span>
                            )}
                            <StatusBadge status={r.status} />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {isPublic ? <Badge tone="secondary">Public Request</Badge> : <Badge tone="primary">Sent to You</Badge>}
                          {interaction?.swipeStatus === "interested" && <Badge tone="success">Interested</Badge>}
                          {interaction?.swipeStatus === "declined" && <Badge tone="error">Declined</Badge>}
                        </div>
                        <p className="text-sm text-ink-variant line-clamp-2">{r.description}</p>
                        <div className="flex items-center justify-between pt-3 border-t border-outline-variant text-sm">
                          <span className="flex items-center gap-1.5 text-outline"><Calendar size={14} /> Due {formatDate(r.dueDate)}</span>
                          <span className="flex items-center gap-1.5 text-outline"><MapPin size={14} /> {r.location}</span>
                        </div>
                        <p className="text-primary text-sm font-medium">{formatCurrency(r.budgetMin)} – {formatCurrency(r.budgetMax)}</p>
                      </CardBody>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-24">
              <Inbox className="mx-auto text-outline mb-4" size={32} />
              <p className="text-headline-sm mb-2">No requests here</p>
              <p className="text-ink-variant text-sm">
                {active === "received"
                  ? "Requests customers send directly to you will appear here."
                  : active === "interested" || active === "declined" || active === "saved"
                  ? "Swipe or save requests from Discover Requests to see them here."
                  : "New customer requests will appear in this inbox."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
