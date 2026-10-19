"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Ban, Mail, Phone, MapPin, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Textarea } from "@/components/ui/Input";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

interface Bundle {
  customer: { id: string; name: string; email: string; city: string; phone: string; status: string; createdAt: string };
  projects: { id: string; title: string; stage: string; status: string }[];
  subscription: { status: string; renewalDate?: string; planName: string } | null;
  diaryCount: number;
  savedCount: number;
  auditLog: { id: string; action: string; reason?: string; adminName: string; timestamp: string }[];
}

export default function AdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`/api/admin/customers/${params.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Customer not found.");
      setBundle(data);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Customer not found.");
      setStatus("error");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const confirmSuspend = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/customers/${params.id}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || "Suspended by admin from customer profile." }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't suspend this account.");
      push("Customer suspended.", "info");
      setConfirmOpen(false);
      setReason("");
      await load();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't suspend this account.", "error");
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/customers/${params.id}/reactivate`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Couldn't reactivate this account.");
      }
      push("Customer reactivated.");
      await load();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't reactivate this account.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-white/50 py-24">
        <Loader2 className="animate-spin" size={18} /> Loading…
      </div>
    );
  }
  if (status === "error" || !bundle) {
    return <p className="text-white/50 text-sm">{error || "Customer not found."}</p>;
  }

  const { customer, projects, subscription, diaryCount, savedCount, auditLog } = bundle;
  const activeProjects = projects.filter((p) => p.status !== "completed");
  const completedProjects = projects.filter((p) => p.status === "completed");

  return (
    <div>
      <button onClick={() => router.push("/admin/users")} className="text-xs text-white/50 hover:underline mb-6">← Back to Users</button>

      <div className="flex items-center gap-4 mb-10 flex-wrap">
        <div className="relative w-16 h-16 rounded-full overflow-hidden bg-white/10 shrink-0 flex items-center justify-center text-white/30 text-xl font-display">
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-[180px]">
          <h1 className="text-2xl font-display">{customer.name}</h1>
          <p className="text-sm text-white/50">Customer · Joined {formatDate(customer.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={customer.status} />
          {customer.status === "suspended" ? (
            <Button size="sm" variant="secondary" onClick={reactivate} disabled={busy}>
              <CheckCircle2 size={14} /> Reactivate
            </Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setConfirmOpen(true)} disabled={busy}>
              <Ban size={14} /> Suspend
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 flex flex-col gap-10">
          <section className="border border-white/10 rounded-md p-6">
            <p className="text-white/50 text-xs uppercase tracking-wide mb-4">Contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2"><Mail size={14} className="text-white/40" />{customer.email || "—"}</div>
              <div className="flex items-center gap-2"><Phone size={14} className="text-white/40" />{customer.phone || "—"}</div>
              <div className="flex items-center gap-2"><MapPin size={14} className="text-white/40" />{customer.city || "—"}</div>
            </div>
          </section>

          <section className="border border-white/10 rounded-md p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-white/50 text-xs uppercase tracking-wide">Projects ({projects.length})</p>
              <p className="text-xs text-white/40">{activeProjects.length} active · {completedProjects.length} completed</p>
            </div>
            {projects.length === 0 ? (
              <p className="text-sm text-white/40">No projects yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {projects.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-4 text-sm border-b border-white/5 pb-3 last:border-none">
                    <span className="text-white/80 truncate">{p.title}</span>
                    <StatusBadge status={p.status} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {auditLog.length > 0 && (
            <section className="border border-white/10 rounded-md p-6">
              <p className="text-white/50 text-xs uppercase tracking-wide mb-4">Admin history</p>
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

        <aside className="flex flex-col gap-6">
          <section className="border border-white/10 rounded-md p-6">
            <p className="text-white/50 text-xs uppercase tracking-wide mb-3">Subscription</p>
            {subscription ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm">{subscription.planName || "Subscription"}</p>
                  <StatusBadge status={subscription.status} />
                </div>
                {subscription.renewalDate && <p className="text-xs text-white/40">Renews/ended {formatDate(subscription.renewalDate)}</p>}
              </>
            ) : (
              <p className="text-sm text-white/40">No subscription on record.</p>
            )}
            <Link href="/admin/subscriptions" className="text-xs text-white/50 hover:text-white hover:underline mt-3 inline-block">
              View billing settings →
            </Link>
          </section>

          <section className="border border-white/10 rounded-md p-6">
            <p className="text-white/50 text-xs uppercase tracking-wide mb-3">Activity</p>
            <div className="flex flex-col gap-2 text-sm text-white/70">
              <p>{diaryCount} Fashion Diary entr{diaryCount === 1 ? "y" : "ies"}</p>
              <p>{savedCount} saved item{savedCount === 1 ? "" : "s"}</p>
            </div>
          </section>
        </aside>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Suspend customer">
        <div className="flex flex-col gap-5">
          <p className="text-sm text-ink-variant">
            Are you sure you want to suspend <strong>{customer.name}</strong>'s account? They will be flagged as suspended until reactivated.
          </p>
          <Field label="Reason (optional)" htmlFor="suspendReason">
            <Textarea id="suspendReason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="danger" className="flex-1" onClick={confirmSuspend} disabled={busy}>{busy ? "Suspending…" : "Suspend"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
