"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { Mail, Phone, MapPin, MessageCircle, CheckCircle2, Hourglass, AlertCircle, Loader2, Star, Lock } from "lucide-react";
import { Avatar, Badge } from "@/components/ui/Badge";
import { SaveToggleButton } from "@/components/ui/SaveToggleButton";
import { Timeline, ProgressBar } from "@/components/ui/Progress";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ImageLightbox, LightboxTrigger } from "@/components/ui/ImageLightbox";
import { Field, Textarea } from "@/components/ui/Input";
import { RatingInput } from "@/components/ui/Rating";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { DesignerSummary } from "@/lib/customer/data";
import { isProgressLocked } from "@/lib/projects/progress-lock";

interface ProjectDetail {
  id: string;
  title: string;
  category: string;
  occasion: string;
  gender: string;
  referenceImages: string[];
  description: string;
  fabricPreference: string;
  measurements: Record<string, string>;
  additionalPreferences: string;
  budgetMin: number;
  budgetMax: number;
  location: string;
  confirmedPrice: number;
  stage: string;
  stages: string[];
  dueDate: string;
  progressPercent: number;
  status: string;
  completedAt?: string;
  designer?: DesignerSummary;
  hasReview: boolean;
}

interface ProgressUpdateItem {
  id: string;
  stage: string;
  note: string;
  images: string[];
  date: string;
}

export default function ProjectWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [updates, setUpdates] = useState<ProgressUpdateItem[]>([]);
  const [customer, setCustomer] = useState<{ city: string; phone: string } | null>(null);
  const [email, setEmail] = useState("");
  const [opening, setOpening] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [projRes, updatesRes, sessionRes, profileRes] = await Promise.all([
          fetch(`/api/projects/${params.id}`),
          fetch(`/api/projects/${params.id}/updates`),
          fetch("/api/auth/session"),
          fetch("/api/profile/customer"),
        ]);
        const projData = await projRes.json();
        if (!projRes.ok) throw new Error(projData.message ?? "Couldn't load this project.");
        const updatesData = await updatesRes.json();
        const sessionData = await sessionRes.json();
        const profileData = await profileRes.json();

        if (!cancelled) {
          setProject(projData.project);
          setUpdates(updatesData.updates ?? []);
          setEmail(sessionData.email ?? "");
          setCustomer(profileData.customerProfile);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't load this project.");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const handleOpenChat = async () => {
    if (!project?.designer) return;
    setOpening(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designerId: project.designer.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't open this conversation.");
      router.push(`/messages?conversationId=${data.conversationId}`);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't open this conversation.", "error");
      setOpening(false);
    }
  };

  // Phase 5 completes the two-sided completion workflow Phase 4 deliberately left stubbed here —
  // now that the designer side (app/api/designer/projects/[id]/complete) can actually produce a
  // real "awaiting_confirmation" project, these two actions are real mutations.
  const handleConfirmCompletion = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/projects/${params.id}/confirm-completion`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't confirm completion.");
      push("Project confirmed as completed. Thank you!", "success");
      setProject((p) => (p ? { ...p, status: "completed" } : p));
      setConfirmModalOpen(false);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't confirm completion.", "error");
    } finally {
      setConfirming(false);
    }
  };

  const handleSubmitReview = async () => {
    if (reviewRating < 1) {
      setReviewError("Choose a star rating.");
      return;
    }
    if (!reviewText.trim()) {
      setReviewError("Write a few words about your experience.");
      return;
    }
    setReviewError("");
    setSubmittingReview(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: params.id, rating: reviewRating, reviewText: reviewText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't submit your review.");
      push("Thank you — your review has been posted.", "success");
      setProject((p) => (p ? { ...p, hasReview: true } : p));
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't submit your review.", "error");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleRequestChanges = async () => {
    setRequestingChanges(true);
    try {
      const res = await fetch(`/api/projects/${params.id}/request-changes`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't send that request.");
      push("Your designer has been notified that changes are needed.", "info");
      setProject((p) => (p ? { ...p, status: "active" } : p));
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't send that request.", "error");
    } finally {
      setRequestingChanges(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
        <Loader2 className="animate-spin" size={18} /> Loading project…
      </div>
    );
  }

  if (status === "error" || !project) {
    return (
      <div className="text-center py-24">
        <p className="text-headline-sm mb-2">Couldn't load this project</p>
        <p className="text-ink-variant text-sm">{error}</p>
      </div>
    );
  }

  const designer = project.designer;

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <p className="text-label-md text-outline mb-2">PROJECT WORKSPACE</p>
          <h1 className="text-headline-md break-words">{project.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SaveToggleButton itemType="project" itemId={project.id} size="sm" />
          <Badge tone="primary">{project.stage}</Badge>
        </div>
      </div>

      {project.status === "awaiting_confirmation" && (
        <div className="mb-8 p-5 rounded-md bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-2 mb-4">
            <Hourglass size={18} className="text-amber-800 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              {designer?.name ?? "Your designer"} has marked this project as completed. Please review and confirm whether it's ready.
            </p>
          </div>
          <div className="flex gap-3">
            <Button size="sm" onClick={() => setConfirmModalOpen(true)} disabled={confirming || requestingChanges}>
              <CheckCircle2 size={14} /> Confirm Completion
            </Button>
            <Button size="sm" variant="secondary" onClick={handleRequestChanges} disabled={confirming || requestingChanges}>
              <AlertCircle size={14} /> {requestingChanges ? "Sending…" : "Not Yet / Request Changes"}
            </Button>
          </div>
        </div>
      )}
      {project.status === "completed" && (
        <div className="mb-8 p-5 rounded-md bg-emerald-50 border border-emerald-200">
          <div className="flex items-center gap-2 text-sm text-emerald-800 mb-1">
            <CheckCircle2 size={16} className="shrink-0" />
            ✓ Project Completed{project.completedAt ? ` on ${formatDate(project.completedAt)}` : ""}.
          </div>

          {project.hasReview ? (
            <p className="text-sm text-emerald-800/80 mt-3">Thank you — you&apos;ve already left a review for this project.</p>
          ) : (
            <div className="mt-4 pt-4 border-t border-emerald-200">
              <p className="text-sm font-medium text-ink mb-3">
                <Star size={14} className="inline -mt-0.5 mr-1" /> Leave a review for {designer?.name ?? "your designer"}
              </p>
              <div className="flex flex-col gap-3 max-w-md">
                <RatingInput value={reviewRating} onChange={(v) => { setReviewRating(v); setReviewError(""); }} />
                <Field label="Your review" htmlFor="reviewText" error={reviewError}>
                  <Textarea
                    id="reviewText"
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="How was your experience working with this designer?"
                  />
                </Field>
                <Button size="sm" className="w-fit" onClick={handleSubmitReview} disabled={submittingReview}>
                  {submittingReview ? "Submitting…" : "Submit Review"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 flex flex-col gap-12">
          {/* Design details */}
          <section>
            <p className="text-label-md text-outline mb-4">DESIGN DETAILS</p>
            <div className="flex flex-wrap gap-3 sm:gap-5 mb-5">
              {project.referenceImages.map((img, i) => (
                <LightboxTrigger
                  key={i}
                  onOpen={() => setViewer({ images: project.referenceImages, index: i })}
                  label={`View design image ${i + 1} of ${project.referenceImages.length}`}
                  className="relative w-24 h-24 rounded-sm overflow-hidden"
                >
                  <Image src={img} alt="" fill sizes="96px" className="object-cover" />
                </LightboxTrigger>
              ))}
              {project.referenceImages.length === 0 && (
                <div className="w-24 h-24 rounded-sm bg-surface-container flex items-center justify-center text-xs text-outline">No image</div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              <Badge tone="primary">{project.category}</Badge>
              <Badge tone="neutral">{project.occasion}</Badge>
              <Badge tone="neutral">{project.gender}</Badge>
            </div>
            <p className="text-ink-variant text-sm leading-relaxed mb-4">{project.description}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm mb-4">
              <div>
                <p className="text-outline text-xs mb-1">FABRIC PREFERENCE</p>
                <p>{project.fabricPreference || "Not provided"}</p>
              </div>
              <div>
                <p className="text-outline text-xs mb-1">AGREED BUDGET</p>
                <p>{formatCurrency(project.confirmedPrice)}</p>
              </div>
              <div>
                <p className="text-outline text-xs mb-1">ORIGINAL BUDGET RANGE</p>
                <p>{formatCurrency(project.budgetMin)} – {formatCurrency(project.budgetMax)}</p>
              </div>
              <div>
                <p className="text-outline text-xs mb-1">LOCATION</p>
                <p>{project.location || "Not provided"}</p>
              </div>
            </div>
            <div className="mb-4">
              <p className="text-outline text-xs mb-2">MEASUREMENTS</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {Object.entries(project.measurements).map(([k, v]) => (
                  <span key={k}><span className="capitalize text-ink-variant">{k}:</span> {v}</span>
                ))}
                {Object.keys(project.measurements).length === 0 && <span className="text-outline text-sm">Not provided</span>}
              </div>
            </div>
            {project.additionalPreferences && (
              <div>
                <p className="text-outline text-xs mb-2">ADDITIONAL PREFERENCES</p>
                <p className="text-sm text-ink-variant">{project.additionalPreferences}</p>
              </div>
            )}
            <p className="text-xs text-outline mt-4">Payment is arranged directly with your designer — HRUNA doesn't process payments.</p>
          </section>

          {/* Progress updates */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-label-md text-outline">PROGRESS</p>
              <span className="text-sm text-ink-variant">{project.progressPercent}% complete</span>
            </div>
            <ProgressBar percent={project.progressPercent} className={isProgressLocked(project.status) ? "mb-4" : "mb-8"} />
            {isProgressLocked(project.status) && (
              <p data-testid="progress-locked-note" className="flex items-start gap-2 text-xs text-ink-variant bg-surface-low rounded-md px-3 py-2.5 mb-6">
                <Lock size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
                You approved this project's completion, so its progress history is final and can no longer be changed.
              </p>
            )}
            <div className="flex flex-col gap-6">
              {[...updates].reverse().map((u) => (
                <div key={u.id} className="flex gap-4 border-b border-outline-variant pb-6 last:border-none">
                  {u.images[0] && (
                    <LightboxTrigger
                      onOpen={() => setViewer({ images: u.images, index: 0 })}
                      label={u.images.length > 1 ? `View ${u.images.length} progress photos` : "View progress photo"}
                      className="relative w-20 h-20 rounded-sm overflow-hidden shrink-0"
                    >
                      <Image src={u.images[0]} alt="" fill sizes="80px" className="object-cover" />
                    </LightboxTrigger>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone="primary">{u.stage}</Badge>
                      <span className="text-xs text-outline">{formatDate(u.date)}</span>
                    </div>
                    <p className="text-sm text-ink-variant">{u.note}</p>
                  </div>
                </div>
              ))}
              {updates.length === 0 && (
                <p className="text-sm text-outline">No progress updates yet — your designer will post updates here as work begins.</p>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-8">
          {designer && (
            <div className="p-6 rounded-md bg-surface-low">
              <p className="text-label-md text-outline mb-4">YOUR DESIGNER</p>
              <div className="flex items-center gap-3 mb-4">
                <Avatar src={designer.avatar} alt={designer.name} size={44} verified={designer.verified} />
                <div>
                  <p className="font-medium text-sm">{designer.studioName}</p>
                  <p className="text-xs text-outline">{designer.name}</p>
                </div>
              </div>
              <Button onClick={handleOpenChat} className="w-full justify-center" variant="secondary" size="sm" disabled={opening}>
                <MessageCircle size={14} /> {opening ? "Opening…" : "Open Chat"}
              </Button>
            </div>
          )}

          <div className="p-6 rounded-md bg-surface-low">
            <p className="text-label-md text-outline mb-4">TIMELINE</p>
            <Timeline stages={project.stages} currentStage={project.stage} />
            <p className="text-xs text-outline mt-2">Due {formatDate(project.dueDate)}</p>
          </div>

          <div className="p-6 rounded-md bg-surface-low">
            <p className="text-label-md text-outline mb-4">YOUR DETAILS</p>
            <div className="flex flex-col gap-2 text-sm text-ink-variant">
              <span className="flex items-center gap-2"><MapPin size={14} className="text-outline" />{customer?.city || "Not provided"}</span>
              <span className="flex items-center gap-2"><Phone size={14} className="text-outline" />{customer?.phone || "Not provided"}</span>
              <span className="flex items-center gap-2"><Mail size={14} className="text-outline" />{email}</span>
            </div>
          </div>
        </aside>
      </div>

      <ImageLightbox
        images={viewer?.images ?? []}
        index={viewer?.index ?? null}
        onClose={() => setViewer(null)}
        onIndexChange={(index) => setViewer((v) => (v ? { ...v, index } : v))}
      />

      <Modal open={confirmModalOpen} onClose={() => (confirming ? null : setConfirmModalOpen(false))} title="Confirm completion?">
        <div className="flex flex-col gap-5">
          <p className="text-sm text-ink-variant">
            This confirms the project is finished as agreed. It&apos;s the final step — make sure you&apos;re happy
            with the result before confirming.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmModalOpen(false)} disabled={confirming}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleConfirmCompletion} disabled={confirming}>
              {confirming ? "Confirming…" : "Yes, Confirm Completion"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
