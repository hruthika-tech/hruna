"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { MapPin, Calendar, Wallet, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ImageLightbox, LightboxTrigger } from "@/components/ui/ImageLightbox";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { DesignerSummary } from "@/lib/customer/data";

interface RequestDetail {
  id: string;
  customerId: string;
  title: string;
  description: string;
  inspirationImages: string[];
  measurements: Record<string, string>;
  fabricPreference: string;
  additionalPreferences: string;
  location: string;
  dueDate: string;
  budgetMin: number;
  budgetMax: number;
  createdAt: string;
  status: string;
}

interface ProposalWithDesigner {
  id: string;
  requestId: string;
  designerId: string;
  price: number;
  estimatedDays: number;
  description: string;
  notes: string;
  status: string;
  designer?: DesignerSummary;
}

export default function RequestDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<number | null>(null);
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [proposals, setProposals] = useState<ProposalWithDesigner[]>([]);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [messagingId, setMessagingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [reqRes, propRes] = await Promise.all([
        fetch(`/api/requests/${params.id}`),
        fetch(`/api/requests/${params.id}/proposals`),
      ]);
      const reqData = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqData.message ?? "Couldn't load this request.");
      const propData = await propRes.json();
      if (!propRes.ok) throw new Error(propData.message ?? "Couldn't load proposals for this request.");

      setRequest(reqData.request);
      setProposals(propData.proposals);
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

  const handleAccept = async (proposalId: string) => {
    setAcceptingId(proposalId);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/accept`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't accept this proposal.");
      push("Proposal accepted — your project has begun!", "success");
      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't accept this proposal.", "error");
      setAcceptingId(null);
    }
  };

  const handleMessage = async (designerId: string) => {
    setMessagingId(designerId);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't open this conversation.");
      router.push(`/messages?conversationId=${data.conversationId}`);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't open this conversation.", "error");
      setMessagingId(null);
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

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-label-md text-outline mb-2">FASHION REQUEST</p>
          <h1 className="text-headline-md">{request.title}</h1>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 flex flex-col gap-10">
          <div>
            <p className="text-label-md text-outline mb-3">DESCRIPTION</p>
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
              <p className="text-label-md text-outline mb-2">MEASUREMENTS</p>
              <ul className="text-sm text-ink-variant flex flex-col gap-1">
                {Object.entries(request.measurements).map(([k, v]) => (
                  <li key={k} className="flex justify-between max-w-[220px]"><span className="capitalize">{k}</span><span>{v}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-label-md text-outline mb-2">FABRIC PREFERENCE</p>
              <p className="text-sm text-ink-variant">{request.fabricPreference || "No preference specified"}</p>
            </div>
          </div>

          {request.additionalPreferences && (
            <div>
              <p className="text-label-md text-outline mb-2">ADDITIONAL PREFERENCES</p>
              <p className="text-sm text-ink-variant">{request.additionalPreferences}</p>
            </div>
          )}

          {/* Proposals */}
          <div>
            <p className="text-label-md text-outline mb-4">
              {proposals.length > 0 ? "PROPOSAL RECEIVED" : "AWAITING PROPOSALS"}
            </p>
            {proposals.length === 0 && (
              <p className="text-sm text-ink-variant">
                Designers matching your request will send proposals here. We'll notify you the moment one arrives.
              </p>
            )}
            {proposals.map((p) => {
              const designer = p.designer;
              if (!designer) return null;
              return (
                <div key={p.id} className="border border-outline-variant rounded-md p-6 flex flex-col gap-5 mb-5">
                  <div className="flex items-center gap-3">
                    <Avatar src={designer.avatar} alt={designer.name} size={48} verified={designer.verified} />
                    <div>
                      <p className="font-medium">{designer.studioName}</p>
                      <p className="text-xs text-outline">{designer.name}</p>
                    </div>
                  </div>
                  <p className="text-ink-variant text-sm leading-relaxed">{p.description}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2"><Wallet size={16} className="text-outline" /><span>{formatCurrency(p.price)} (proposed)</span></div>
                    <div className="flex items-center gap-2"><Calendar size={16} className="text-outline" /><span>{p.estimatedDays} days</span></div>
                  </div>
                  {p.notes && <p className="text-xs text-outline">{p.notes}</p>}
                  <p className="text-xs text-outline">Payment and delivery are arranged directly with the designer — HRUNA doesn't process payments.</p>
                  {p.status !== "pending" ? (
                    <div className="pt-2 border-t border-outline-variant">
                      <StatusBadge status={p.status} />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-3 pt-2 border-t border-outline-variant">
                      <Button
                        className="flex-1 justify-center"
                        disabled={acceptingId === p.id}
                        onClick={() => handleAccept(p.id)}
                      >
                        {acceptingId === p.id ? "Accepting…" : "Accept Proposal"}
                      </Button>
                      <Button variant="secondary" className="flex-1" onClick={() => setDecliningId(p.id)}>Decline</Button>
                      <Button
                        variant="ghost"
                        disabled={messagingId === designer.id}
                        onClick={() => handleMessage(designer.id)}
                      >
                        Message
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="flex flex-col gap-4 h-fit p-6 rounded-md bg-surface-low">
          <p className="text-label-md text-outline">REQUEST DETAILS</p>
          <div className="flex items-center gap-2 text-sm"><MapPin size={15} className="text-outline" /><span>{request.location || "Not specified"}</span></div>
          <div className="flex items-center gap-2 text-sm"><Calendar size={15} className="text-outline" /><span>Due {formatDate(request.dueDate)}</span></div>
          <div className="flex items-center gap-2 text-sm"><Wallet size={15} className="text-outline" /><span>{formatCurrency(request.budgetMin)} – {formatCurrency(request.budgetMax)}</span></div>
          <div className="pt-3 border-t border-outline-variant text-xs text-outline">Submitted {formatDate(request.createdAt)}</div>
        </aside>
      </div>

      <Modal open={!!decliningId} onClose={() => setDecliningId(null)} title="Decline this proposal?">
        <p className="text-sm text-ink-variant mb-6">
          Declining an individual proposal isn't connected yet — you can still message the designer,
          or simply accept a different proposal instead.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDecliningId(null)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}
