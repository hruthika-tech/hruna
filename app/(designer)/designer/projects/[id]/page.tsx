"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { Mail, Phone, MapPin, MessageCircle, Plus, Pencil, Trash2, Check, CheckCircle2, Hourglass, Loader2, Lock } from "lucide-react";
import { SafeImage } from "@/components/ui/SafeImage";
import { Badge } from "@/components/ui/Badge";
import { Timeline, ProgressBar } from "@/components/ui/Progress";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ImageLightbox, LightboxTrigger } from "@/components/ui/ImageLightbox";
import { Field, Select, Textarea } from "@/components/ui/Input";
import { UploadingImageGrid } from "@/components/ui/UploadingImageGrid";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { UploadedImage } from "@/lib/customer/upload-client";
import type { CustomerSummary } from "@/lib/designer/data";
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
  customer?: CustomerSummary;
}

interface ProgressUpdateItem {
  id: string;
  stage: string;
  note: string;
  images: string[];
  imageFiles?: UploadedImage[];
  date: string;
}

export default function DesignerProjectWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [updates, setUpdates] = useState<ProgressUpdateItem[]>([]);
  const [opening, setOpening] = useState(false);
  const [completing, setCompleting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ stage: string; note: string; images: UploadedImage[] }>({
    stage: "Request Accepted",
    note: "",
    images: [],
  });
  const [saving, setSaving] = useState(false);
  const [stagePicker, setStagePicker] = useState<string | null>(null);

  const load = async () => {
    try {
      const [projRes, updatesRes] = await Promise.all([
        fetch(`/api/projects/${params.id}`),
        fetch(`/api/projects/${params.id}/updates`),
      ]);
      const projData = await projRes.json();
      if (!projRes.ok) throw new Error(projData.message ?? "Couldn't load this project.");
      const updatesData = await updatesRes.json();

      setProject(projData.project);
      setUpdates(updatesData.updates ?? []);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this project.");
      setStatus("error");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const openNew = () => {
    if (isProgressLocked(project?.status)) return; // final once the customer approved completion
    setEditingId(null);
    setDraft({ stage: project?.stage ?? "Request Accepted", note: "", images: [] });
    setModalOpen(true);
  };

  const openEdit = (u: ProgressUpdateItem) => {
    if (isProgressLocked(project?.status)) return; // final once the customer approved completion
    setEditingId(u.id);
    setDraft({
      stage: u.stage,
      note: u.note,
      images: u.images.map((url, i) => ({ fileId: u.imageFiles?.[i]?.fileId ?? "", url })),
    });
    setModalOpen(true);
  };

  const saveDraft = async () => {
    if (!draft.note.trim() || isProgressLocked(project?.status)) return;
    setSaving(true);
    try {
      const body = { stage: draft.stage, note: draft.note, imageFileIds: draft.images.map((i) => i.fileId).filter(Boolean) };
      const res = editingId
        ? await fetch(`/api/projects/${params.id}/updates/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/projects/${params.id}/updates`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't save this update.");

      if (editingId) {
        setUpdates((prev) => prev.map((u) => (u.id === editingId ? data.update : u)));
        push("Progress update saved.");
      } else {
        setUpdates((prev) => [...prev, data.update]);
        push("Progress update posted to the customer.");
        await load(); // project stage/progress may have advanced
      }
      setModalOpen(false);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save this update.", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteUpdate = async (id: string) => {
    if (isProgressLocked(project?.status)) return; // final once the customer approved completion
    try {
      const res = await fetch(`/api/projects/${params.id}/updates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Couldn't remove this update.");
      }
      setUpdates((prev) => prev.filter((u) => u.id !== id));
      push("Update removed.", "info");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't remove this update.", "error");
    }
  };

  const handleMarkCompleted = async () => {
    setCompleting(true);
    try {
      const res = await fetch(`/api/designer/projects/${params.id}/complete`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't mark this project as completed.");
      push("Marked as completed — waiting for the customer to confirm.", "success");
      await load();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't mark this project as completed.", "error");
    } finally {
      setCompleting(false);
    }
  };

  const handleOpenChat = async () => {
    if (!project?.customer) return;
    setOpening(true);
    try {
      const res = await fetch("/api/designer/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: project.customer.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't open this conversation.");
      router.push(`/designer/messages?conversationId=${data.conversationId}`);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't open this conversation.", "error");
      setOpening(false);
    }
  };

  const saveStage = async (newStage: string) => {
    if (isProgressLocked(project?.status)) return; // final once the customer approved completion
    try {
      const res = await fetch(`/api/projects/${params.id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage, note: `Stage updated to ${newStage}.` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't update the stage.");
      setUpdates((prev) => [...prev, data.update]);
      push("Stage updated.");
      setStagePicker(null);
      await load();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't update the stage.", "error");
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

  const customer = project.customer;
  // Customer-approved completion makes the progress history final: no add / edit / delete / stage
  // change (the API and database refuse these too — this only keeps the controls out of view).
  const progressLocked = isProgressLocked(project.status);

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <p className="text-label-md text-outline mb-2">PROJECT WORKSPACE</p>
          <h1 className="text-headline-md break-words">{project.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="primary">{project.stage}</Badge>
          {project.status === "active" && (
            <Button size="sm" onClick={handleMarkCompleted} disabled={completing}>
              <CheckCircle2 size={14} /> {completing ? "Marking…" : "Mark as Completed"}
            </Button>
          )}
        </div>
      </div>

      {project.status === "awaiting_confirmation" && (
        <div className="mb-8 p-4 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2">
          <Hourglass size={16} className="shrink-0" />
          You've marked this project as completed. Waiting for the customer to confirm before it's officially done.
        </div>
      )}
      {project.status === "completed" && (
        <div className="mb-8 p-4 rounded-md bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0" />
          Completed on HRUNA — confirmed by the customer{project.completedAt ? ` on ${formatDate(project.completedAt)}` : ""}.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 flex flex-col gap-12">
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
              <div><p className="text-outline text-xs mb-1">FABRIC PREFERENCE</p><p>{project.fabricPreference || "Not provided"}</p></div>
              <div><p className="text-outline text-xs mb-1">AGREED BUDGET</p><p>{formatCurrency(project.confirmedPrice)}</p></div>
              <div><p className="text-outline text-xs mb-1">ORIGINAL BUDGET RANGE</p><p>{formatCurrency(project.budgetMin)} – {formatCurrency(project.budgetMax)}</p></div>
              <div><p className="text-outline text-xs mb-1">LOCATION</p><p>{project.location || "Not provided"}</p></div>
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
            <p className="text-xs text-outline mt-4">Payment is arranged directly with the customer — HRUNA doesn't process payments.</p>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-label-md text-outline">PROGRESS UPDATES</p>
              {!progressLocked && <Button size="sm" onClick={openNew}><Plus size={14} /> Add Update</Button>}
            </div>
            <ProgressBar percent={project.progressPercent} className={progressLocked ? "mb-4" : "mb-8"} />
            {progressLocked && (
              <p data-testid="progress-locked-note" className="flex items-start gap-2 text-xs text-ink-variant bg-surface-low rounded-md px-3 py-2.5 mb-6">
                <Lock size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
                The customer approved this project's completion, so its progress history is final — updates can no longer be added, edited or deleted.
              </p>
            )}
            <div className="flex flex-col gap-6">
              {[...updates].reverse().map((u) => (
                <div key={u.id} className="flex gap-4 border-b border-outline-variant pb-6 last:border-none group">
                  {u.images[0] && (
                    <LightboxTrigger
                      onOpen={() => setViewer({ images: u.images, index: 0 })}
                      label={u.images.length > 1 ? `View ${u.images.length} progress photos` : "View progress photo"}
                      className="relative w-20 h-20 rounded-sm overflow-hidden shrink-0"
                    >
                      <Image src={u.images[0]} alt="" fill sizes="80px" className="object-cover" />
                    </LightboxTrigger>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone="primary">{u.stage}</Badge>
                      <span className="text-xs text-outline">{formatDate(u.date)}</span>
                    </div>
                    <p className="text-sm text-ink-variant">{u.note}</p>
                  </div>
                  {!progressLocked && (
                    <div className="flex flex-col gap-1 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(u)} aria-label="Edit update" className="p-2.5 lg:p-1.5 text-outline hover:text-primary"><Pencil size={14} /></button>
                      <button onClick={() => deleteUpdate(u.id)} aria-label="Delete update" className="p-2.5 lg:p-1.5 text-outline hover:text-error"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              ))}
              {updates.length === 0 && <p className="text-sm text-outline">{progressLocked ? "No progress updates were posted for this project." : "No progress updates yet — add the first one."}</p>}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-8">
          <div className="p-6 rounded-md bg-surface-low">
            <p className="text-label-md text-outline mb-4">CUSTOMER</p>
            {customer && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-full overflow-hidden relative"><SafeImage src={customer.avatar} alt={customer.name} sizes="44px" className="object-cover" fallbackIconSize={16} /></div>
                  <div><p className="font-medium text-sm">{customer.name}</p><p className="text-xs text-outline">{customer.city}</p></div>
                </div>
                <Button onClick={handleOpenChat} size="sm" variant="secondary" className="w-full justify-center" disabled={opening}>
                  <MessageCircle size={14} /> {opening ? "Opening…" : "Open Chat"}
                </Button>
              </>
            )}
          </div>

          <div className="p-6 rounded-md bg-surface-low">
            <div className="flex items-center justify-between mb-4">
              <p className="text-label-md text-outline">TIMELINE</p>
              {stagePicker === null && !progressLocked ? (
                <button onClick={() => setStagePicker(project.stage)} className="text-xs text-primary hover:underline">Update stage</button>
              ) : null}
            </div>
            <Timeline stages={project.stages} currentStage={project.stage} />
            <p className="text-xs text-outline mt-2 mb-4">Due {formatDate(project.dueDate)}</p>

            {stagePicker !== null && !progressLocked && (
              <div className="flex flex-col gap-2 pt-4 border-t border-outline-variant">
                <Select value={stagePicker} onChange={(e) => setStagePicker(e.target.value)}>
                  {project.stages.map((s) => <option key={s}>{s}</option>)}
                </Select>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => saveStage(stagePicker)}>
                    <Check size={13} /> Save
                  </Button>
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => setStagePicker(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      <ImageLightbox
        images={viewer?.images ?? []}
        index={viewer?.index ?? null}
        onClose={() => setViewer(null)}
        onIndexChange={(index) => setViewer((v) => (v ? { ...v, index } : v))}
      />

      <Modal open={modalOpen} onClose={() => (saving ? null : setModalOpen(false))} title={editingId ? "Edit progress update" : "Add progress update"}>
        <div className="flex flex-col gap-5">
          <Field label="Stage" htmlFor="stage">
            <Select id="stage" value={draft.stage} onChange={(e) => setDraft((d) => ({ ...d, stage: e.target.value }))}>
              {project.stages.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Update note" htmlFor="note" required hint='e.g. "Fabric cutting completed", "Initial stitching completed"'>
            <Textarea id="note" value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
          </Field>
          <Field label="Progress images" htmlFor="images">
            <UploadingImageGrid
              images={draft.images}
              onChange={(images) => setDraft((d) => ({ ...d, images }))}
              bucket="projectUpdates"
              entityType="project_update_image"
              max={4}
            />
          </Field>
          <Button onClick={saveDraft} className="w-full" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Save Changes" : "Post Update"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
