"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DiaryEntryModal, type DiaryEntryDraft } from "@/components/diary/DiaryEntryModal";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

interface DiaryEntrySummary {
  id: string;
  title: string;
  note: string;
  mood: string;
  images: string[];
  date: string;
}

export default function FashionDiaryPage() {
  const { push } = useToast();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<DiaryEntrySummary[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/diary");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't load your Fashion Diary.");
      setEntries(data.entries);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your Fashion Diary.");
      setStatus("error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (draft: DiaryEntryDraft) => {
    setSaving(true);
    try {
      const res = await fetch("/api/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          note: draft.note,
          mood: draft.mood,
          imageFileIds: draft.images.map((i) => i.fileId),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't save this entry.");
      setEntries((prev) => [data.entry, ...prev]);
      setOpen(false);
      push("Diary entry saved.", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save this entry.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <div className="flex items-center justify-between mb-10">
        <div>
          <p className="text-label-md text-outline mb-2">FASHION DIARY</p>
          <h1 className="text-headline-md">Your journal of style</h1>
        </div>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> New Entry</Button>
      </div>

      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
          <Loader2 className="animate-spin" size={18} /> Loading your diary…
        </div>
      )}
      {status === "error" && (
        <div className="text-center py-24">
          <p className="text-headline-sm mb-2">Couldn't load your Fashion Diary</p>
          <p className="text-ink-variant text-sm">{error}</p>
        </div>
      )}

      {status === "ready" && (
        entries.length === 0 ? (
          <div className="text-center py-24">
            <BookOpen className="mx-auto text-outline mb-4" size={32} />
            <p className="text-headline-sm mb-2">Your diary is empty</p>
            <p className="text-ink-variant text-sm mb-8">Capture the story behind every fitting, fabric, and idea.</p>
            <Button onClick={() => setOpen(true)}>Write Your First Entry</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {entries.map((e) => (
              <Link key={e.id} href={`/diary/${e.id}`} className="group">
                <article className="border border-outline-variant rounded-md overflow-hidden h-full transition-shadow duration-300 group-hover:shadow-soft">
                  {e.images[0] && (
                    <div className="relative h-64">
                      <Image src={e.images[0]} alt={e.title} fill sizes="50vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                      {e.images.length > 1 && (
                        <span className="absolute top-3 right-3 bg-ink/60 text-white text-xs px-2.5 py-1 rounded-full">
                          +{e.images.length - 1} more
                        </span>
                      )}
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs uppercase tracking-wide text-primary">{e.mood}</span>
                      <span className="text-xs text-outline">{formatDate(e.date)}</span>
                    </div>
                    <h2 className="font-display text-xl mb-2">{e.title}</h2>
                    <p className="text-ink-variant text-sm leading-relaxed line-clamp-2">{e.note}</p>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )
      )}

      <DiaryEntryModal open={open} mode="add" saving={saving} onClose={() => (saving ? null : setOpen(false))} onSubmit={handleAdd} />
    </div>
  );
}
