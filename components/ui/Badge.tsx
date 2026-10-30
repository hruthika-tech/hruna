"use client";

import { cn } from "@/lib/utils";
import { BadgeCheck, UserRound } from "lucide-react";
import { SafeImage } from "./SafeImage";

export function Avatar({
  src,
  alt,
  size = 44,
  verified = false,
  className,
}: {
  src?: string;
  alt: string;
  size?: number;
  verified?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <SafeImage
        src={src}
        alt={alt}
        sizes={`${size}px`}
        className="rounded-full object-cover border border-primary/10"
        fallbackIconSize={Math.max(12, size * 0.42)}
        // No photo (or one that fails to load) shows a default person avatar, never a broken image.
        fallbackIcon={UserRound}
      />
      {verified && (
        <BadgeCheck
          className="absolute -bottom-0.5 -right-0.5 text-primary bg-white rounded-full"
          size={Math.max(14, size * 0.32)}
          fill="#F5E0DB"
        />
      )}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "primary" | "secondary" | "success" | "warning" | "error";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-container text-ink-variant",
    primary: "bg-primary-container text-primary-on-container",
    secondary: "bg-secondary-container text-secondary-on-container",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    error: "bg-error-container text-error-on-container",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-label-md",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

const statusTone: Record<string, { tone: any; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  submitted: { tone: "secondary", label: "Submitted" },
  reviewed: { tone: "secondary", label: "In Review" },
  proposal_received: { tone: "primary", label: "Proposal Received" },
  accepted: { tone: "success", label: "Accepted" },
  declined: { tone: "error", label: "Declined" },
  expired: { tone: "neutral", label: "Expired" },
  active: { tone: "primary", label: "Active" },
  awaiting_confirmation: { tone: "warning", label: "Awaiting Confirmation" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  none: { tone: "neutral", label: "No Subscription" },
  completed: { tone: "success", label: "Completed" },
  withdrawn: { tone: "neutral", label: "Withdrawn" },
  // Payment transaction statuses (PaymentRecordStatus)
  succeeded: { tone: "success", label: "Successful" },
  pending: { tone: "warning", label: "Pending" },
  failed: { tone: "error", label: "Failed" },
  refunded: { tone: "secondary", label: "Refunded" },
  // Dispute statuses (DisputeStatus)
  open: { tone: "warning", label: "Open" },
  under_review: { tone: "secondary", label: "Under Review" },
  resolved: { tone: "success", label: "Resolved" },
  closed: { tone: "neutral", label: "Closed" },
  // Account status (AccountStatus)
  suspended: { tone: "error", label: "Suspended" },
};

export function StatusBadge({ status }: { status: string }) {
  const entry = statusTone[status] ?? { tone: "neutral", label: status };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
