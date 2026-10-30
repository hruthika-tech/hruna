"use client";

import { useState } from "react";
import { LogOut, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Textarea } from "@/components/ui/Input";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { WITHDRAWAL_REASON_MAX, validateWithdrawalReason, withdrawalViewState, type WithdrawalItem, type WithdrawalRole } from "@/lib/projects/withdrawal";

// Mutual project withdrawal, shown on both the customer's and the designer's project page. One
// participant requests it with a reason; the OTHER approves (→ project withdrawn) or rejects (→ the
// project continues). The rules are enforced by the API/database (request_project_withdrawal /
// respond_project_withdrawal); this panel only shows each side what it can do.
export function ProjectWithdrawalPanel({
  projectId,
  projectStatus,
  viewerRole,
  withdrawals,
  otherPartyName,
  onChanged,
}: {
  projectId: string;
  projectStatus: string;
  viewerRole: WithdrawalRole | null;
  withdrawals: WithdrawalItem[];
  otherPartyName: string;
  onChanged: () => Promise<void> | void;
}) {
  const { push } = useToast();
  const view = withdrawalViewState(withdrawals, viewerRole, projectStatus);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [responseReason, setResponseReason] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const roleLabel = (role: WithdrawalRole) => (role === viewerRole ? "You" : otherPartyName);
  const history = withdrawals.filter((w) => w.status === "rejected" || w.status === "closed");

  const submitRequest = async () => {
    const valid = validateWithdrawalReason(reason);
    if (!valid.ok) {
      setReasonError(valid.message);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/withdrawals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: valid.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Couldn't send the withdrawal request.");
      push(`Withdrawal requested — ${otherPartyName} has been asked to respond.`, "info");
      setRequestOpen(false);
      setReason("");
      await onChanged();
    } catch (err) {
      setReasonError(err instanceof Error ? err.message : "Couldn't send the withdrawal request.");
    } finally {
      setBusy(false);
    }
  };

  const respond = async (decision: "approve" | "reject") => {
    if (!view.pending) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/withdrawals/${view.pending.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: responseReason.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Couldn't record your response.");
      push(decision === "approve" ? "Withdrawal approved — the project is now withdrawn." : "Withdrawal rejected — the project continues.", "info");
      setConfirmApprove(false);
      setResponseReason("");
      await onChanged();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't record your response.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="withdrawal-panel">
      {projectStatus === "withdrawn" && (
        <div className="p-5 rounded-md bg-surface-low border border-outline-variant text-sm" data-testid="project-withdrawn">
          <p className="flex items-center gap-2 font-medium text-ink mb-1">
            <LogOut size={16} className="shrink-0" /> This project was withdrawn
            {view.approved?.respondedAt ? ` on ${formatDate(view.approved.respondedAt)}` : ""}.
          </p>
          {view.approved && (
            <p className="text-ink-variant">
              {roleLabel(view.approved.requestedByRole)} asked to withdraw (&ldquo;{view.approved.reason}&rdquo;) and{" "}
              {view.approved.requestedByRole === viewerRole ? otherPartyName : "you"} agreed.
              {view.approved.responseReason ? ` Note: “${view.approved.responseReason}”` : ""} Messages and progress history are kept.
            </p>
          )}
        </div>
      )}

      {view.pending && view.mineIsPending && (
        <div className="p-5 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-900" data-testid="withdrawal-pending-mine">
          <p className="flex items-center gap-2 font-medium mb-1">
            <Hourglass size={16} className="shrink-0" /> Withdrawal requested on {formatDate(view.pending.createdAt)}
          </p>
          <p>
            Your reason: &ldquo;{view.pending.reason}&rdquo;. Waiting for {otherPartyName} to approve or reject it — the project stays as it is
            until then.
          </p>
        </div>
      )}

      {view.pending && view.canRespond && (
        <div className="p-5 rounded-md bg-amber-50 border border-amber-200 text-sm" data-testid="withdrawal-pending-theirs">
          <p className="font-medium text-amber-900 mb-1">{otherPartyName} asked to withdraw from this project</p>
          <p className="text-amber-900 mb-4">Reason: &ldquo;{view.pending.reason}&rdquo;</p>
          <Field label="Your note (optional)" htmlFor="withdrawalResponse">
            <Textarea id="withdrawalResponse" value={responseReason} maxLength={WITHDRAWAL_REASON_MAX} onChange={(e) => setResponseReason(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-3 mt-4">
            <Button size="sm" onClick={() => setConfirmApprove(true)} disabled={busy} data-testid="approve-withdrawal">Approve Withdrawal</Button>
            <Button size="sm" variant="secondary" onClick={() => respond("reject")} disabled={busy} data-testid="reject-withdrawal">
              {busy ? "Saving…" : "Reject Withdrawal"}
            </Button>
          </div>
        </div>
      )}

      {view.canRequest && (
        <div>
          <Button size="sm" variant="secondary" onClick={() => setRequestOpen(true)} data-testid="request-withdrawal">
            <LogOut size={14} /> Request Withdrawal
          </Button>
        </div>
      )}

      {history.length > 0 && (
        <div className="text-xs text-outline flex flex-col gap-1" data-testid="withdrawal-history">
          {history.map((w) => (
            <p key={w.id}>
              {formatDate(w.createdAt)}: {roleLabel(w.requestedByRole)} asked to withdraw (&ldquo;{w.reason}&rdquo;) —{" "}
              {w.status === "closed" ? "closed when the project was completed" : `rejected${w.responseReason ? ` (“${w.responseReason}”)` : ""}`}.
            </p>
          ))}
        </div>
      )}

      <Modal open={requestOpen} onClose={() => (busy ? null : setRequestOpen(false))} title="Request withdrawal">
        <div className="flex flex-col gap-5">
          <p className="text-sm text-ink-variant">
            {otherPartyName} will be asked to approve or reject this. The project is withdrawn only if they agree — until then it carries on
            as usual. Messages and progress history are always kept.
          </p>
          <Field label="Reason" htmlFor="withdrawalReason" required error={reasonError || undefined}>
            <Textarea
              id="withdrawalReason"
              value={reason}
              maxLength={WITHDRAWAL_REASON_MAX}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError("");
              }}
            />
          </Field>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setRequestOpen(false)} disabled={busy}>Cancel</Button>
            <Button className="flex-1" onClick={submitRequest} disabled={busy} data-testid="submit-withdrawal">
              {busy ? "Sending…" : "Send Request"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmApprove} onClose={() => (busy ? null : setConfirmApprove(false))} title="Approve withdrawal?">
        <div className="flex flex-col gap-5">
          <p className="text-sm text-ink-variant">
            The project will end as <span className="text-ink font-medium">withdrawn</span> for both of you. This can&apos;t be undone; messages and
            progress history stay visible.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmApprove(false)} disabled={busy}>Cancel</Button>
            <Button className="flex-1" onClick={() => respond("approve")} disabled={busy} data-testid="confirm-approve-withdrawal">
              {busy ? "Saving…" : "Approve Withdrawal"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
