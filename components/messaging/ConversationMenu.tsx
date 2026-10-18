"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Ban, Flag } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/hooks/use-toast";
import { MAX_REPORT_DESCRIPTION, MAX_REPORT_EVIDENCE, REPORT_REASONS, type ChatBlockState, type ReportReason } from "@/lib/moderation/reports";
import { cn, timeAgo } from "@/lib/utils";

/**
 * The "⋮" menu in a conversation header (customer /messages and designer /designer/messages):
 * Block user (with confirmation) and Report user (reason, optional description, optional evidence the
 * reporter ticks themselves). The server decides who is blocked/reported — always the OTHER participant
 * of this conversation (app/api/blocks, app/api/reports) — so nothing here can target anyone else.
 */
export interface MenuMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
}

export function ConversationMenu({
  conversationId,
  otherName,
  messages,
  myUserId,
  blockState,
  settingsHref,
  onBlocked,
}: {
  conversationId: string;
  otherName: string;
  messages: MenuMessage[];
  myUserId: string | null;
  blockState: ChatBlockState;
  settingsHref: string;
  onBlocked: () => void;
}) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<Set<string>>(new Set());
  const [reportError, setReportError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const block = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Couldn't block this account.");
      setConfirmBlock(false);
      onBlocked();
      push(`You blocked ${otherName}.`, "info");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't block this account.", "error");
    } finally {
      setBusy(false);
    }
  };

  const openReport = () => {
    setReason("");
    setDescription("");
    setEvidence(new Set());
    setReportError("");
    setReporting(true);
  };

  const toggleEvidence = (id: string) =>
    setEvidence((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_REPORT_EVIDENCE) next.add(id);
      return next;
    });

  const submitReport = async () => {
    if (!reason) {
      setReportError("Choose a reason for the report.");
      return;
    }
    setReportError("");
    setBusy(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, reason, description: description.trim() || null, messageIds: [...evidence] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reportId) throw new Error(data.message ?? "Couldn't send this report.");
      setReporting(false);
      push("Report submitted. Our team will review it — the person you reported won't be told who reported them.", "success");
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Couldn't send this report.");
    } finally {
      setBusy(false);
    }
  };

  const recent = messages.slice(-30);

  return (
    <div className="relative ml-auto" ref={menuRef}>
      <button
        type="button"
        aria-label="Conversation options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-full text-ink-variant hover:bg-ink/5 transition-colors"
        data-testid="conversation-menu"
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-48 rounded-md border border-outline-variant bg-surface shadow-soft z-20 py-1">
          {blockState === "blocked_by_me" ? (
            <a role="menuitem" href={settingsHref} className="flex items-center gap-2 px-4 py-2.5 text-sm text-ink-variant hover:bg-ink/5">
              <Ban size={15} /> Blocked — manage
            </a>
          ) : (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmBlock(true);
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-ink/5"
            >
              <Ban size={15} /> Block user
            </button>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              openReport();
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left text-error hover:bg-ink/5"
          >
            <Flag size={15} /> Report user
          </button>
        </div>
      )}

      <Modal open={confirmBlock} onClose={() => (busy ? null : setConfirmBlock(false))} title={`Block ${otherName}?`}>
        <div className="flex flex-col gap-4 text-sm text-ink-variant">
          <p>Neither of you will be able to send messages to the other, and neither of you can start a new conversation.</p>
          <p>Your existing messages, requests, proposals and projects stay as they are. They won&apos;t be told that you blocked them. You can unblock them any time in Settings → Blocked users.</p>
          <div className="flex gap-3 mt-2">
            <Button variant="danger" className="flex-1" onClick={block} disabled={busy} data-testid="confirm-block">
              {busy ? "Blocking…" : "Block"}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmBlock(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={reporting} onClose={() => (busy ? null : setReporting(false))} title={`Report ${otherName}`}>
        <div className="flex flex-col gap-5">
          <p className="text-sm text-ink-variant">
            Reports go to the HRUNA team for review. {otherName} won&apos;t see your report or who sent it. Reporting doesn&apos;t block them — use Block user for that.
          </p>
          <Field label="Reason" htmlFor="reportReason" required error={reportError || undefined}>
            <Select id="reportReason" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              <option value="" disabled>
                Choose a reason
              </option>
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="What happened? (optional)" htmlFor="reportDescription" hint={`${description.length}/${MAX_REPORT_DESCRIPTION}`}>
            <Textarea id="reportDescription" value={description} maxLength={MAX_REPORT_DESCRIPTION} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {recent.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Include messages as evidence (optional)</p>
              <p className="text-xs text-outline">Only the messages you tick are shared with the HRUNA team. Up to {MAX_REPORT_EVIDENCE}.</p>
              <div className="max-h-56 overflow-y-auto border border-outline-variant rounded-md divide-y divide-outline-variant" data-testid="report-evidence">
                {recent.map((m) => {
                  const mine = !!myUserId && m.senderId === myUserId;
                  return (
                    <label key={m.id} className={cn("flex items-start gap-3 px-3 py-2 text-sm cursor-pointer", evidence.has(m.id) && "bg-primary-container/30")}>
                      <input type="checkbox" className="mt-1" checked={evidence.has(m.id)} onChange={() => toggleEvidence(m.id)} />
                      <span className="flex-1 min-w-0">
                        <span className="text-xs text-outline">
                          {mine ? "You" : otherName} · {timeAgo(m.timestamp)}
                        </span>
                        <span className="block text-ink break-words">{m.text}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <Button className="w-full" onClick={submitReport} disabled={busy} data-testid="submit-report">
            {busy ? "Sending…" : "Submit report"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/** Shown instead of the message box when messaging is blocked in this conversation. */
export function BlockedNotice({ state, settingsHref }: { state: ChatBlockState; settingsHref: string }) {
  if (state === "none") return null;
  return (
    <div className="p-4 border-t border-outline-variant text-sm text-ink-variant text-center" role="status" data-testid="blocked-notice">
      {state === "blocked_by_me" ? (
        <>
          You blocked this account, so neither of you can send messages here.{" "}
          <a href={settingsHref} className="text-primary hover:underline">
            Manage blocked users
          </a>
        </>
      ) : (
        "You can't send messages in this conversation."
      )}
    </div>
  );
}
