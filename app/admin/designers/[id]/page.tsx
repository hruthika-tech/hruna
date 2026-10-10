"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { CheckCircle2, XCircle, AlertTriangle, Ban, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Textarea } from "@/components/ui/Input";
import { useToast } from "@/hooks/use-toast";
import { formatDate, cn } from "@/lib/utils";

type ReasonAction = "portfolio_revision" | "portfolio_reject" | "identity_fail" | "profile_reject" | "profile_suspend";

const ACTION_ENDPOINT: Record<ReasonAction, string> = {
  portfolio_revision: "request-portfolio-revision",
  portfolio_reject: "reject-portfolio",
  identity_fail: "fail-identity",
  profile_reject: "reject-profile",
  profile_suspend: "suspend",
};

interface Bundle {
  designer: { id: string; name: string; avatar: string; city: string };
  onboarding: {
    emailVerified: boolean; phone: string; roles: string[];
    specializationCategories: string[]; specializationCrafts: string[];
    experienceDescription: string; experienceLevel: string; learningBackground: string;
    credentials: { id: string; type: string; institution?: string; qualification?: string; year?: string }[];
    portfolioItems: { id: string; image: string; title: string; category: string; description: string; year?: string }[];
    studioName: string; city: string; area: string; serviceLocations: string[]; workingModel: string;
  };
  verification: {
    identityStatus: string; identityFailureReason?: string; portfolioStatus: string; portfolioReviewNote?: string;
    overallStatus: string; profileReviewNote?: string;
  };
  auditLog: { id: string; action: string; reason?: string; adminName: string; timestamp: string }[];
}

export default function AdminDesignerReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [busy, setBusy] = useState(false);

  const [reasonModal, setReasonModal] = useState<{ action: ReasonAction; title: string } | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    try {
      const res = await fetch(`/api/admin/designers/${params.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Designer not found.");
      setBundle(data);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Designer not found.");
      setStatus("error");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const call = async (endpoint: string, body?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/designers/${params.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "That action couldn't be completed.");
      await load();
      return true;
    } catch (err) {
      push(err instanceof Error ? err.message : "That action couldn't be completed.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const runReasonedAction = async () => {
    if (!reason.trim() || !reasonModal) return;
    const ok = await call(ACTION_ENDPOINT[reasonModal.action], { reason: reason.trim() });
    if (ok) push("Action recorded.");
    setReasonModal(null);
    setReason("");
  };

  const handleApproveProfile = async () => {
    const ok = await call("approve-profile");
    push(ok ? "Profile approved — designer is now verified." : "Identity must be verified and portfolio approved first.", ok ? "success" : "error");
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-white/50 py-24">
        <Loader2 className="animate-spin" size={18} /> Loading…
      </div>
    );
  }
  if (status === "error" || !bundle) {
    return <p className="text-white/50 text-sm">{error || "Designer not found."}</p>;
  }

  const { designer, onboarding, verification, auditLog } = bundle;

  return (
    <div>
      <button onClick={() => router.push("/admin/verification")} className="text-xs text-white/50 hover:underline mb-6">← Back to verification queue</button>

      <div className="flex items-center gap-4 mb-10">
        <div className="relative w-16 h-16 rounded-full overflow-hidden bg-white/10 shrink-0">
          {designer.avatar && <Image src={designer.avatar} alt={designer.name} fill sizes="64px" className="object-cover" />}
        </div>
        <div>
          <h1 className="text-2xl font-display">{designer.name}</h1>
          <p className="text-sm text-white/50">{onboarding.roles.join(" · ") || "No roles selected"} · {designer.city || "No city set"}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Badge tone="neutral">Overall: {verification.overallStatus.replace(/_/g, " ")}</Badge>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 flex flex-col gap-10">
          <section className="border border-white/10 rounded-md p-6">
            <p className="text-white/50 text-xs uppercase tracking-wide mb-4">Personal / Identity Status</p>
            <div className="grid sm:grid-cols-3 gap-4 text-sm mb-6">
              <div><p className="text-white/40 text-xs mb-1">Email</p><p>{onboarding.emailVerified ? "Verified ✓" : "Not verified"}</p></div>
              <div><p className="text-white/40 text-xs mb-1">Phone</p><p>{onboarding.phone || "Not provided"}</p></div>
              <div><p className="text-white/40 text-xs mb-1">Identity</p><p className="capitalize">{verification.identityStatus.replace(/_/g, " ")}</p></div>
            </div>
            {verification.identityFailureReason && (
              <p className="text-xs text-red-400 mb-4">Previous failure reason: {verification.identityFailureReason}</p>
            )}
            <div className="flex gap-3">
              <Button size="sm" onClick={() => call("verify-identity").then((ok) => ok && push("Identity verified."))} disabled={busy || verification.identityStatus === "verified"}>
                <CheckCircle2 size={14} /> Verify Identity
              </Button>
              <Button size="sm" variant="danger" onClick={() => setReasonModal({ action: "identity_fail", title: "Fail identity verification" })} disabled={busy}>
                <XCircle size={14} /> Fail Identity
              </Button>
            </div>
          </section>

          <section className="border border-white/10 rounded-md p-6">
            <p className="text-white/50 text-xs uppercase tracking-wide mb-4">Professional Profile</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {onboarding.roles.map((r) => <Badge key={r} tone="primary">{r}</Badge>)}
              {onboarding.roles.length === 0 && <p className="text-sm text-white/40">No roles selected.</p>}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {[...onboarding.specializationCategories, ...onboarding.specializationCrafts].map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
            </div>
            <p className="text-sm text-white/70 mb-3">{onboarding.experienceDescription || "No description provided."}</p>
            <p className="text-xs text-white/40">Experience: {onboarding.experienceLevel || "—"} · Learned via: {onboarding.learningBackground || "—"}</p>
            {onboarding.credentials.length > 0 && (
              <div className="mt-3 text-xs text-white/50">
                {onboarding.credentials.map((c) => (
                  <p key={c.id}>{c.type}{c.institution ? ` — ${c.institution}` : ""}{c.qualification ? `, ${c.qualification}` : ""}{c.year ? ` (${c.year})` : ""}</p>
                ))}
              </div>
            )}
          </section>

          <section className="border border-white/10 rounded-md p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-white/50 text-xs uppercase tracking-wide">Portfolio ({onboarding.portfolioItems.length} items)</p>
              <Badge tone="neutral">{verification.portfolioStatus.replace(/_/g, " ")}</Badge>
            </div>
            {verification.portfolioReviewNote && (
              <p className="text-xs text-amber-400 mb-4">Previous note: {verification.portfolioReviewNote}</p>
            )}
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              {onboarding.portfolioItems.map((item) => (
                <div key={item.id} className="border border-white/10 rounded-md overflow-hidden">
                  <div className="relative h-32">{item.image && <Image src={item.image} alt={item.title} fill sizes="33vw" className="object-cover" />}</div>
                  <div className="p-3">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-white/40">{item.category}{item.year ? ` · ${item.year}` : ""}</p>
                    <p className="text-xs text-white/50 mt-1 line-clamp-2">{item.description}</p>
                  </div>
                </div>
              ))}
              {onboarding.portfolioItems.length === 0 && <p className="text-sm text-white/40">No portfolio items submitted.</p>}
            </div>
            <div className="flex gap-3 flex-wrap">
              <Button size="sm" onClick={() => call("approve-portfolio").then((ok) => ok && push("Portfolio approved."))} disabled={busy}>
                <CheckCircle2 size={14} /> Approve Portfolio
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setReasonModal({ action: "portfolio_revision", title: "Request portfolio revision" })} disabled={busy}>
                <AlertTriangle size={14} /> Request Revision
              </Button>
              <Button size="sm" variant="danger" onClick={() => setReasonModal({ action: "portfolio_reject", title: "Reject portfolio" })} disabled={busy}>
                <XCircle size={14} /> Reject Portfolio
              </Button>
            </div>
          </section>

          <section className="border border-white/10 rounded-md p-6">
            <p className="text-white/50 text-xs uppercase tracking-wide mb-4">Studio</p>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div><p className="text-white/40 text-xs mb-1">Studio name</p><p>{onboarding.studioName || "—"}</p></div>
              <div><p className="text-white/40 text-xs mb-1">Location</p><p>{[onboarding.area, onboarding.city].filter(Boolean).join(", ") || "—"}</p></div>
              <div><p className="text-white/40 text-xs mb-1">Service area</p><p>{onboarding.serviceLocations.join(", ") || "—"}</p></div>
              <div><p className="text-white/40 text-xs mb-1">Working model</p><p>{onboarding.workingModel || "—"}</p></div>
            </div>
          </section>

          {auditLog.length > 0 && (
            <section className="border border-white/10 rounded-md p-6">
              <p className="text-white/50 text-xs uppercase tracking-wide mb-4">Review History</p>
              <div className="flex flex-col gap-3">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="text-xs text-white/60 flex justify-between gap-4">
                    <span>{entry.action}{entry.reason ? ` — "${entry.reason}"` : ""} <span className="text-white/30">by {entry.adminName}</span></span>
                    <span className="text-white/30 shrink-0">{formatDate(entry.timestamp)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="border border-white/10 rounded-md p-6 h-fit flex flex-col gap-4">
          <p className="text-white/50 text-xs uppercase tracking-wide">Overall Profile Decision</p>
          <p className="text-xs text-white/40">
            Approving requires identity verified <strong className={cn(verification.identityStatus === "verified" ? "text-emerald-400" : "text-white/40")}>({verification.identityStatus})</strong> and
            portfolio approved <strong className={cn(verification.portfolioStatus === "approved" ? "text-emerald-400" : "text-white/40")}>({verification.portfolioStatus})</strong>.
          </p>
          <Button onClick={handleApproveProfile} disabled={busy || verification.overallStatus === "approved"}>
            <CheckCircle2 size={14} /> Approve Profile
          </Button>
          <Button variant="danger" onClick={() => setReasonModal({ action: "profile_reject", title: "Reject profile" })} disabled={busy}>
            <XCircle size={14} /> Reject Profile
          </Button>
          <Button variant="secondary" onClick={() => setReasonModal({ action: "profile_suspend", title: "Suspend profile" })} disabled={busy}>
            <Ban size={14} /> Suspend Profile
          </Button>
          {verification.profileReviewNote && (
            <p className="text-xs text-white/40 pt-3 border-t border-white/10">Last note: {verification.profileReviewNote}</p>
          )}
        </aside>
      </div>

      <Modal open={!!reasonModal} onClose={() => setReasonModal(null)} title={reasonModal?.title ?? ""}>
        <div className="flex flex-col gap-5">
          <Field label="Reason" htmlFor="reason" required hint="The designer will see this exact text.">
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Please upload clearer examples of your original embroidery work." />
          </Field>
          <Button onClick={runReasonedAction} disabled={!reason.trim() || busy} className="w-full">Confirm</Button>
        </div>
      </Modal>
    </div>
  );
}
