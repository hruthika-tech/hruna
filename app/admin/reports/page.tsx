"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/hooks/use-toast";
import { formatDate, cn } from "@/lib/utils";
import { MAX_ADMIN_DECISION, REPORT_STATUSES, reasonLabel, statusLabel, type ReportStatus } from "@/lib/moderation/reports";

// Admin → User Reports (reports users file from a conversation's "Report user"). Same layout as
// Reports & Disputes. Reviewing records a status + decision only; restricting an account stays a
// separate, deliberate action on that account's own admin page (existing suspend actions).

interface Account {
  userId: string;
  email: string | null;
  name: string;
  isAdmin: boolean;
  customer: { id: string; name: string; status: string } | null;
  designer: { id: string; studioName: string; overallStatus: string | null } | null;
}
interface ReportRow {
  id: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  reviewedAt: string | null;
  evidenceCount: number;
  reporter: Account | null;
  reported: Account | null;
}
interface ReportDetail extends Omit<ReportRow, "evidenceCount"> {
  description: string | null;
  decision: string | null;
  updatedAt: string;
  reviewedBy: string | null;
  reportsAgainstAccount: number;
  evidence: { id: string; text: string; timestamp: string; from: "reported" | "reporter" | "other" }[];
}

const FILTERS = [{ value: "all", label: "All" }, ...REPORT_STATUSES];

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-400/15 text-amber-200",
  under_review: "bg-sky-400/15 text-sky-200",
  resolved: "bg-emerald-400/15 text-emerald-200",
  dismissed: "bg-white/10 text-white/60",
};

function AccountBlock({ label, account }: { label: string; account: Account | null }) {
  return (
    <div>
      <p className="text-outline uppercase mb-1">{label}</p>
      {account ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-ink font-medium">{account.name}</p>
          {account.email && <p className="text-ink-variant">{account.email}</p>}
          {account.customer && (
            <p className="text-ink-variant">
              Customer · {account.customer.status}{" "}
              <Link href={`/admin/customers/${account.customer.id}`} className="text-primary hover:underline">
                open account
              </Link>
            </p>
          )}
          {account.designer && (
            <p className="text-ink-variant">
              Designer · {account.designer.overallStatus ?? "unknown"}{" "}
              <Link href={`/admin/designers/${account.designer.id}`} className="text-primary hover:underline">
                open account
              </Link>
            </p>
          )}
        </div>
      ) : (
        <p className="text-ink">Account deleted</p>
      )}
    </div>
  );
}

export default function AdminReportsPage() {
  const { push } = useToast();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [available, setAvailable] = useState(true);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [nextStatus, setNextStatus] = useState<ReportStatus>("under_review");
  const [decision, setDecision] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const load = async (f: string) => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/admin/reports${f === "all" ? "" : `?status=${f}`}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setAvailable(data.available !== false);
      setReports(data.reports ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    void load(filter);
  }, [filter]);

  const openReport = async (id: string) => {
    setActiveId(id);
    setDetail(null);
    setFormError("");
    try {
      const res = await fetch(`/api/admin/reports/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't load this report.");
      setDetail(data.report);
      setNextStatus(data.report.status === "pending" ? "under_review" : data.report.status);
      setDecision(data.report.decision ?? "");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't load this report.", "error");
      setActiveId(null);
    }
  };

  const save = async () => {
    if (!activeId) return;
    setBusy(true);
    setFormError("");
    try {
      const res = await fetch(`/api/admin/reports/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, decision: decision.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't save the review.");
      push("Review saved.", "success");
      setActiveId(null);
      void load(filter);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save the review.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-display mb-2">User reports</h1>
      <p className="text-sm text-white/50 mb-8">
        Reports people filed from a conversation. Reviewing doesn&apos;t restrict anyone — to suspend an account, open it and use its own suspend action.
      </p>

      <div className="flex gap-2 mb-8 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn("text-xs px-3 py-1.5 rounded-full border border-white/10 transition-colors", filter === f.value ? "bg-white text-ink" : "text-white/60 hover:bg-white/5")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {status === "loading" ? (
        <div className="flex items-center gap-2 text-white/50 text-sm py-16 justify-center">
          <Loader2 className="animate-spin" size={16} /> Loading reports…
        </div>
      ) : status === "error" ? (
        <p className="text-sm text-error py-16 text-center">Couldn&apos;t load reports.</p>
      ) : !available ? (
        <p className="text-sm text-white/50 py-16 text-center">User reports aren&apos;t available on this server yet.</p>
      ) : (
        <div className="border border-white/10 rounded-md overflow-hidden" data-testid="reports-list">
          {reports.length === 0 ? (
            <div className="text-center py-16">
              <Flag className="mx-auto text-white/20 mb-3" size={26} />
              <p className="text-white/50 text-sm">No reports match this filter.</p>
            </div>
          ) : (
            reports.map((r) => (
              <button
                key={r.id}
                onClick={() => openReport(r.id)}
                className="w-full flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 border-b border-white/10 last:border-none hover:bg-white/5 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {reasonLabel(r.reason)} · {r.reported?.name ?? "Deleted account"}
                  </p>
                  <p className="text-xs text-white/40 truncate">
                    Reported by {r.reporter?.name ?? "a deleted account"} · {r.evidenceCount} message{r.evidenceCount === 1 ? "" : "s"} attached
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={cn("text-xs px-2.5 py-1 rounded-full", STATUS_TONE[r.status])}>{statusLabel(r.status)}</span>
                  <span className="text-xs text-white/30 w-20 text-right">{formatDate(r.createdAt)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      <Modal open={!!activeId} onClose={() => (busy ? null : setActiveId(null))} title="Report details">
        {!detail ? (
          <div className="flex items-center gap-2 text-sm text-ink-variant py-6">
            <Loader2 className="animate-spin" size={16} /> Loading…
          </div>
        ) : (
          <div className="flex flex-col gap-5" data-testid="report-detail">
            <div>
              <p className="font-medium text-ink">{reasonLabel(detail.reason)}</p>
              <p className="text-sm text-ink-variant leading-relaxed mt-1 whitespace-pre-wrap">{detail.description || "No description given."}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <AccountBlock label="Reported account" account={detail.reported} />
              <AccountBlock label="Reported by" account={detail.reporter} />
              <div>
                <p className="text-outline uppercase mb-1">Filed</p>
                <p className="text-ink">{formatDate(detail.createdAt)}</p>
              </div>
              <div>
                <p className="text-outline uppercase mb-1">Reports against this account</p>
                <p className="text-ink">{detail.reportsAgainstAccount}</p>
              </div>
              {detail.reviewedAt && (
                <div className="col-span-2">
                  <p className="text-outline uppercase mb-1">Last review</p>
                  <p className="text-ink">
                    {statusLabel(detail.status)} · {formatDate(detail.reviewedAt)}
                    {detail.reviewedBy ? ` · ${detail.reviewedBy}` : ""}
                  </p>
                </div>
              )}
            </div>
            <div>
              <p className="text-label-md text-outline mb-2">EVIDENCE CHOSEN BY THE REPORTER</p>
              {detail.evidence.length === 0 ? (
                <p className="text-xs text-outline">No messages were attached.</p>
              ) : (
                <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                  {detail.evidence.map((m) => (
                    <div key={m.id} className="text-xs bg-surface-low rounded-md p-3">
                      <p className="text-outline mb-1">
                        {m.from === "reported" ? "Reported account" : m.from === "reporter" ? "Reporter" : "Participant"} · {formatDate(m.timestamp)}
                      </p>
                      <p className="text-ink whitespace-pre-wrap break-words">{m.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Field label="Status" htmlFor="reportStatus">
              <Select id="reportStatus" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as ReportStatus)}>
                {REPORT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Moderation decision" htmlFor="reportDecision" error={formError || undefined} hint="Required to resolve or dismiss. Visible to admins only.">
              <Textarea id="reportDecision" value={decision} maxLength={MAX_ADMIN_DECISION} onChange={(e) => setDecision(e.target.value)} />
            </Field>
            <Button className="w-full" onClick={save} disabled={busy} data-testid="save-review">
              {busy ? "Saving…" : "Save review"}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
