"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ImageLightbox, LightboxTrigger } from "@/components/ui/ImageLightbox";
import { DiaryEntryModal, type DiaryEntryDraft } from "@/components/diary/DiaryEntryModal";
import { useToast } from "@/hooks/use-toast";
import { formatDate, cn } from "@/lib/utils";
import type { ResolvedImage } from "@/lib/customer/data";

interface DiaryEntryDetail {
  id: string;
  title: string;
  note: string;
  mood: string;
  images: string[];
  imageFiles: ResolvedImage[];
  date: string;
  updatedAt?: string;
}

export default function DiaryEntryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { push } = useToast();

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [entry, setEntry] = useState<DiaryEntryDetail | null>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`/api/diary/${params.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "This diary entry isn't available.");
      setEntry(data.entry);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "This diary entry isn't available.");
      setStatus("error");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const handleSave = async (draft: DiaryEntryDraft) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/diary/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          note: draft.note,
          mood: draft.mood,
          imageFileIds: draft.images.map((i) => i.fileId),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't save your changes.");
      setEntry(data.entry);
      setEditOpen(false);
      push("Diary entry updated.", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save your changes.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/diary/${params.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Couldn't delete this entry.");
      }
      router.push("/diary");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't delete this entry.", "error");
      setDeleting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
        <Loader2 className="animate-spin" size={18} /> Loading entry…
      </div>
    );
  }

  // Fashion Diary is private: a missing entry or one owned by someone else (the API's own
  // ownership-scoped query returns 404 for both, indistinguishably) renders the same "not found"
  // state — never a different message that would leak whether the id belongs to someone else.
  if (status === "error" || !entry) {
    return (
      <div className="text-center py-24">
        <p className="text-headline-sm mb-2">This diary entry isn't available</p>
        <p className="text-ink-variant text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <Link href="/diary" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-8">
        <ArrowLeft size={15} /> Back to Fashion Diary
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          {entry.images[activeImg] && (
            <LightboxTrigger onOpen={() => setViewer(activeImg)} label={`Enlarge image of ${entry.title}`} className="relative w-full h-[480px] rounded-md overflow-hidden mb-4">
              <Image src={entry.images[activeImg]} alt={entry.title} fill className="object-cover" />
            </LightboxTrigger>
          )}
          {entry.images.length > 1 && (
            <div className="flex gap-3 flex-wrap">
              {entry.images.map((img, i) => (
                <button
                  key={img + i}
                  onClick={() => setActiveImg(i)}
                  aria-label={`View image ${i + 1}`}
                  className={cn(
                    "relative w-20 h-20 rounded-sm overflow-hidden border-2",
                    activeImg === i ? "border-primary" : "border-transparent"
                  )}
                >
                  <Image src={img} alt="" fill sizes="80px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
          <ImageLightbox images={entry.images} index={viewer} onClose={() => setViewer(null)} onIndexChange={(i) => { setViewer(i); setActiveImg(i); }} />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs uppercase tracking-wide text-primary">{entry.mood}</span>
            <span className="text-xs text-outline">{formatDate(entry.date)}</span>
          </div>
          <h1 className="text-headline-md mb-6">{entry.title}</h1>
          <p className="text-ink-variant leading-relaxed whitespace-pre-line mb-2">
            {entry.note || "No notes added for this entry."}
          </p>
          {entry.updatedAt && (
            <p className="text-xs text-outline mb-8">Last updated {formatDate(entry.updatedAt)}</p>
          )}

          <div className="flex gap-3 mt-8">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil size={14} /> Edit
            </Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={14} /> Delete Entry
            </Button>
          </div>
        </div>
      </div>

      <DiaryEntryModal
        open={editOpen}
        mode="edit"
        initial={{ title: entry.title, note: entry.note, mood: entry.mood, images: entry.imageFiles }}
        saving={saving}
        onClose={() => (saving ? null : setEditOpen(false))}
        onSubmit={handleSave}
      />

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete diary entry">
        <div className="flex flex-col gap-5">
          <p className="text-sm text-ink-variant">Are you sure you want to delete this diary entry? This can't be undone.</p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete Entry"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
