"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { MapPin, Calendar, Wallet, Heart, Bookmark, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ImageLightbox, LightboxTrigger } from "@/components/ui/ImageLightbox";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { CustomerSummary } from "@/lib/designer/data";
import { isRequestDeleted, isRequestOpenForProposals } from "@/lib/requests/lifecycle";

interface RequestDetail {
  id: string;
  customerId: string;
  title: string;
  description: string;
  inspirationImages: string[];
  measurements: Record<string, string>;
  category: string;
  occasion: string;
  gender: string;
  size: string;
  fabricPreference: string;
  additionalPreferences: string;
  location: string;
  dueDate: string;
  budgetMin: number;
  budgetMax: number;
  preferredDesignerId?: string;
  status: string;
  customer?: CustomerSummary;
}

export default function DesignerRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<number | null>(null);
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [myProposal, setMyProposal] = useState<{ id: string; status: string } | null>(null);
  const [interaction, setInteraction] = useState<{ swipeStatus?: string; saved: boolean } | null>(null);

  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposal, setProposal] = useState({ price: "", days: "", description: "", notes: "" });
  const [proposalErrors, setProposalErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [messaging, setMessaging] = useState(false);

  const load = async () => {
    try {
      const [reqRes, propRes, interactionRes] = await Promise.all([
        fetch(`/api/requests/${params.id}`),
        fetch(`/api/requests/${params.id}/proposals`),
        fetch(`/api/designer/requests/${params.id}/interaction`),
      ]);
      const reqData = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqData.message ?? "Couldn't load this request.");
      const propData = await propRes.json();
      const interactionData = await interactionRes.json();

      setRequest(reqData.request);
      setMyProposal(propData.proposals?.[0] ?? null);
      setInteraction(interactionData.interaction ?? { saved: false });
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this request.");
      setStatus("error");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const interact = async (body: { swipeStatus?: string; saved?: boolean }) => {
    setInteraction((prev) => ({ saved: prev?.saved ?? false, swipeStatus: prev?.swipeStatus, ...body }));
    try {
      const res = await fetch(`/api/designer/requests/${params.id}/interaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Something went wrong.");
      }
    } catch (err) {
      push(err instanceof Error ? err.message : "Something went wrong.", "error");
    }
  };

  const submitProposal = async () => {
    const nextErrors: Record<string, string> = {};
    if (!proposal.price) nextErrors.price = "Enter your proposed price.";
    if (!proposal.days) nextErrors.days = "Enter an estimated number of days.";
    if (!proposal.description.trim()) nextErrors.description = "Describe your approach to this piece.";
    setProposalErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/designer/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: params.id,
          price: Number(proposal.price),
          estimatedDays: proposal.days ? Number(proposal.days) : undefined,
          description: proposal.description,
          notes: proposal.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't send this proposal.");
      setMyProposal(data.proposal);
      setProposalOpen(false);
      push("Proposal sent to the customer.", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't send this proposal.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMessage = async () => {
    if (!request) return;
    setMessaging(true);
    try {
      const res = await fetch("/api/designer/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: request.customerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't open this conversation.");
      router.push(`/designer/messages?conversationId=${data.conversationId}`);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't open this conversation.", "error");
      setMessaging(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
        <Loader2 className="animate-spin" size={18} /> Loading request…
      </div>
    );
  }

  if (status === "error" || !request) {
    return (
      <div className="text-center py-24">
        <p className="text-headline-sm mb-2">Couldn't load this request</p>
        <p className="text-ink-variant text-sm">{error}</p>
      </div>
    );
  }

  const liked = interaction?.swipeStatus === "interested";
  const saved = !!interaction?.saved;
  const customer = request.customer;

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-label-md text-outline mb-2">FASHION REQUEST</p>
          <h1 className="text-headline-md">{request.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => interact({ swipeStatus: liked ? "declined" : "interested" })}
            aria-label="Like request"
            className={cn("p-2.5 rounded-full border border-outline-variant", liked && "text-error border-error/40")}
          >
            <Heart size={18} className={liked ? "fill-error" : ""} />
          </button>
          <button
            onClick={() => interact({ saved: !saved })}
            aria-label="Save request"
            className={cn("p-2.5 rounded-full border border-outline-variant", saved && "text-primary border-primary/40")}
          >
            <Bookmark size={18} className={saved ? "fill-primary" : ""} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 flex flex-col gap-10">
          {customer && (
            <div className="flex items-center gap-3 p-4 rounded-md bg-surface-low">
              <Avatar src={customer.avatar} alt={customer.name} size={44} />
              <div>
                <p className="font-medium text-sm">{customer.name}</p>
                <p className="text-xs text-outline">{customer.city}</p>
              </div>
            </div>
          )}

          <div>
            <p className="text-label-md text-outline mb-3">REQUIREMENTS</p>
            <p className="text-ink-variant leading-relaxed">{request.description}</p>
          </div>

          {request.inspirationImages.length > 0 && (
            <div>
              <p className="text-label-md text-outline mb-3">INSPIRATION</p>
              <div className="flex gap-4 flex-wrap">
                {request.inspirationImages.map((img, i) => (
                  <LightboxTrigger
                    key={i}
                    onOpen={() => setViewer(i)}
                    label={`View reference image ${i + 1} of ${request.inspirationImages.length}`}
                    className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-sm overflow-hidden"
                  >
                    <Image src={img} alt="" fill sizes="128px" className="object-cover" />
                  </LightboxTrigger>
                ))}
              </div>
              <ImageLightbox images={request.inspirationImages} index={viewer} onClose={() => setViewer(null)} onIndexChange={setViewer} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-label-md text-outline mb-2">CATEGORY & OCCASION</p>
              <p className="text-sm text-ink-variant">{request.category} · {request.occasion} · {request.gender}</p>
            </div>
            <div>
              <p className="text-label-md text-outline mb-2">SIZE</p>
              <p className="text-sm text-ink-variant">{request.size}</p>
            </div>
          </div>

          <div>
            <p className="text-label-md text-outline mb-2">MEASUREMENTS</p>
            <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-ink-variant">
              {Object.entries(request.measurements).map(([k, v]) => (
                <span key={k}><span className="capitalize">{k}:</span> {v}</span>
              ))}
              {Object.keys(request.measurements).length === 0 && <span>Not provided</span>}
            </div>
          </div>

          <div>
            <p className="text-label-md text-outline mb-2">FABRIC PREFERENCE</p>
            <p className="text-sm text-ink-variant">{request.fabricPreference || "Not provided"}</p>
          </div>

          {request.additionalPreferences && (
            <div>
              <p className="text-label-md text-outline mb-2">CUSTOMER PREFERENCES</p>
              <p className="text-sm text-ink-variant">{request.additionalPreferences}</p>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4 h-fit p-6 rounded-md bg-surface-low">
          <p className="text-label-md text-outline">REQUEST SUMMARY</p>
          <div className="flex items-center gap-2 text-sm"><MapPin size={15} className="text-outline" />{request.location}</div>
          <div className="flex items-center gap-2 text-sm"><Calendar size={15} className="text-outline" />Due {formatDate(request.dueDate)}</div>
          <div className="flex items-center gap-2 text-sm"><Wallet size={15} className="text-outline" />{formatCurrency(request.budgetMin)} – {formatCurrency(request.budgetMax)}</div>

          <div className="flex flex-col gap-3 pt-4 mt-2 border-t border-outline-variant">
            {myProposal ? (
              <p className="text-sm text-emerald-700 bg-emerald-50 rounded px-3 py-2 text-center">
                Proposal sent{myProposal.status === "accepted" ? " — accepted ✓" : myProposal.status === "declined" ? " — declined" : " ✓"}
              </p>
            ) : isRequestOpenForProposals(request.status) ? (
              <Button onClick={() => setProposalOpen(true)}>Send Proposal</Button>
            ) : (
              <p className="text-sm text-ink-variant bg-surface-low rounded px-3 py-2 text-center" data-testid="request-closed">
                {isRequestDeleted(request.status)
                  ? "The customer deleted this request — it's no longer accepting proposals."
                  : "No longer accepting proposals — the customer has chosen a designer."}
              </p>
            )}
            <Button variant="secondary" onClick={handleMessage} disabled={messaging}>
              {messaging ? "Opening…" : "Message Customer"}
            </Button>
          </div>
        </aside>
      </div>

      <Modal open={proposalOpen} onClose={() => setProposalOpen(false)} title="Send a proposal">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Proposed price (₹)" htmlFor="price" required error={proposalErrors.price}>
              <Input id="price" type="number" value={proposal.price} onChange={(e) => setProposal((p) => ({ ...p, price: e.target.value }))} />
            </Field>
            <Field label="Estimated days" htmlFor="days" required error={proposalErrors.days}>
              <Input id="days" type="number" value={proposal.days} onChange={(e) => setProposal((p) => ({ ...p, days: e.target.value }))} />
            </Field>
          </div>
          <Field
            label="Proposal description"
            htmlFor="description"
            required
            error={proposalErrors.description}
            hint="Describe your approach to this piece."
          >
            <Textarea id="description" value={proposal.description} onChange={(e) => setProposal((p) => ({ ...p, description: e.target.value }))} />
          </Field>
          <Field label="Notes" htmlFor="notes" hint="Fitting schedule, delivery details, etc.">
            <Textarea id="notes" value={proposal.notes} onChange={(e) => setProposal((p) => ({ ...p, notes: e.target.value }))} />
          </Field>
          <Button onClick={submitProposal} className="w-full" disabled={submitting}>
            {submitting ? "Sending…" : "Send Proposal"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
