"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Plus, Pencil, Trash2, Loader2, Camera } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { UploadingImageGrid } from "@/components/ui/UploadingImageGrid";
import { SafeImage } from "@/components/ui/SafeImage";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { STOCK_STATUS_OPTIONS, dressAvailability, type StockStatus } from "@/lib/dresses/availability";
import { CollectionCoverUpload, type CoverValue } from "@/components/designer/CollectionCoverUpload";
import { deleteUnusedImage, type UploadedImage } from "@/lib/customer/upload-client";

const TABS = [
  { label: "Highlights", value: "highlights" },
  { label: "Meet the Designer", value: "meet" },
  { label: "Collections", value: "collections" },
  { label: "Previous Creations", value: "creations" },
  { label: "Studio Info", value: "info" },
];

interface Highlight { id: string; image: string; caption: string }
interface MeetEntry { id: string; image: string; description: string }
interface Collection { id: string; name: string; category: string; coverImage: string; dressIds: string[] }
interface Dress { id: string; collectionId: string; name: string; images: string[]; imageFiles?: UploadedImage[]; description: string; price: number; available: boolean; stockStatus?: StockStatus }
interface PreviousCreation { id: string; image: string; description: string; year: string }
interface DesignerBundle {
  id: string;
  studioName: string;
  story: string;
  experienceYears: number;
  banner: string;
  contactEmail: string;
  openingHours: string;
  atelierLocation: string;
  highlights: Highlight[];
  meetTheDesigner: MeetEntry[];
}

export default function ManageStudioPage() {
  const { push } = useToast();

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [designer, setDesigner] = useState<DesignerBundle | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [previousCreations, setPreviousCreations] = useState<PreviousCreation[]>([]);

  const [tab, setTab] = useState("highlights");

  const [highlightModal, setHighlightModal] = useState<{ id: string | null; image: UploadedImage | null; caption: string } | null>(null);
  const [meetModal, setMeetModal] = useState<{ id: string | null; image: UploadedImage | null; description: string } | null>(null);
  const [collectionModal, setCollectionModal] = useState<{ id: string | null; name: string; category: string; cover: CoverValue | null; hadCover: boolean } | null>(null);
  const [collectionError, setCollectionError] = useState("");
  const [coverError, setCoverError] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [dressModal, setDressModal] = useState<{ collectionId: string; id: string | null; name: string; images: UploadedImage[]; description: string; price: string; available: boolean; stockStatus: StockStatus } | null>(null);
  const [dressError, setDressError] = useState("");
  const [creationModal, setCreationModal] = useState<{ id: string | null; image: UploadedImage | null; description: string; year: string } | null>(null);
  const [info, setInfo] = useState({ contactEmail: "", openingHours: "", atelierLocation: "", experienceYears: "" });
  const [experienceError, setExperienceError] = useState("");
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [bannerDraft, setBannerDraft] = useState<UploadedImage[]>([]);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerError, setBannerError] = useState("");
  const [aboutDraft, setAboutDraft] = useState<string | null>(null);
  const [aboutError, setAboutError] = useState("");
  const [aboutSaving, setAboutSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/designer/studio");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't load your Studio.");
      setDesigner(data.designer);
      setCollections(data.collections);
      setDresses(data.dresses);
      setPreviousCreations(data.previousCreations);
      setInfo({ contactEmail: data.designer.contactEmail, openingHours: data.designer.openingHours, atelierLocation: data.designer.atelierLocation, experienceYears: String(data.designer.experienceYears ?? 0) });
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your Studio.");
      setStatus("error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const call = async (path: string, options: RequestInit = {}) => {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Something went wrong.");
    return data;
  };

  const saveBanner = async () => {
    const image = bannerDraft[0];
    if (!image) {
      setBannerError("Please choose an image before saving.");
      return;
    }
    setBannerSaving(true);
    setBannerError("");
    try {
      await call("/api/designer/studio", { method: "PATCH", body: JSON.stringify({ bannerFileId: image.fileId }) });
      push("Studio banner updated.");
      setBannerModalOpen(false);
      await load();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "Something went wrong saving your banner. Please try again.");
    } finally {
      setBannerSaving(false);
    }
  };

  const saveHighlight = async () => {
    if (!highlightModal?.image && !highlightModal?.id) return;
    setSaving(true);
    try {
      if (highlightModal.id) {
        const body: Record<string, unknown> = { caption: highlightModal.caption };
        if (highlightModal.image) body.fileId = highlightModal.image.fileId;
        const data = await call(`/api/designer/studio/highlights/${highlightModal.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setDesigner((d) => (d ? { ...d, highlights: d.highlights.map((h) => (h.id === highlightModal.id ? data.highlight : h)) } : d));
      } else {
        if (!highlightModal.image) return;
        const data = await call("/api/designer/studio/highlights", {
          method: "POST",
          body: JSON.stringify({ fileId: highlightModal.image.fileId, caption: highlightModal.caption }),
        });
        setDesigner((d) => (d ? { ...d, highlights: [...d.highlights, data.highlight] } : d));
      }
      setHighlightModal(null);
      push("Highlight saved.");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save this highlight.", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteHighlight = async (id: string) => {
    try {
      await call(`/api/designer/studio/highlights/${id}`, { method: "DELETE" });
      setDesigner((d) => (d ? { ...d, highlights: d.highlights.filter((h) => h.id !== id) } : d));
      push("Highlight removed.", "info");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't remove this highlight.", "error");
    }
  };

  const saveMeetEntry = async () => {
    if (!meetModal) return;
    setSaving(true);
    try {
      if (meetModal.id) {
        const body: Record<string, unknown> = { description: meetModal.description };
        if (meetModal.image) body.fileId = meetModal.image.fileId;
        const data = await call(`/api/designer/studio/meet-entries/${meetModal.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setDesigner((d) => (d ? { ...d, meetTheDesigner: d.meetTheDesigner.map((m) => (m.id === meetModal.id ? data.entry : m)) } : d));
      } else {
        if (!meetModal.image) return;
        const data = await call("/api/designer/studio/meet-entries", {
          method: "POST",
          body: JSON.stringify({ fileId: meetModal.image.fileId, description: meetModal.description }),
        });
        setDesigner((d) => (d ? { ...d, meetTheDesigner: [...d.meetTheDesigner, data.entry] } : d));
      }
      setMeetModal(null);
      push("Saved.");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save this entry.", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteMeetEntry = async (id: string) => {
    try {
      await call(`/api/designer/studio/meet-entries/${id}`, { method: "DELETE" });
      setDesigner((d) => (d ? { ...d, meetTheDesigner: d.meetTheDesigner.filter((m) => m.id !== id) } : d));
      push("Entry removed.", "info");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't remove this entry.", "error");
    }
  };

  const openCollectionModal = (c?: Collection) => {
    setCollectionError("");
    setCoverError("");
    setCollectionModal(
      c
        ? { id: c.id, name: c.name, category: c.category, cover: c.coverImage ? { url: c.coverImage } : null, hadCover: !!c.coverImage }
        : { id: null, name: "", category: "", cover: null, hadCover: false }
    );
  };

  // Closing without saving discards a cover uploaded during this edit (never the saved one —
  // that has no fileId on the client; see CoverValue).
  const closeCollectionModal = () => {
    if (saving || coverUploading) return;
    if (collectionModal?.cover?.fileId) void deleteUnusedImage(collectionModal.cover.fileId);
    setCollectionModal(null);
  };

  const saveCollection = async () => {
    if (!collectionModal) return;
    const nameMissing = !collectionModal.name.trim();
    // Required for new collections, and can't be removed from one that has it. A collection made
    // before covers existed can still be renamed without one — it keeps its placeholder.
    const coverMissing = !collectionModal.cover && (!collectionModal.id || collectionModal.hadCover);
    setCollectionError(nameMissing ? "Enter a collection name." : "");
    setCoverError(coverMissing ? "Please upload a collection cover image." : "");
    if (nameMissing || coverMissing) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: collectionModal.name, category: collectionModal.category };
      if (collectionModal.cover?.fileId) body.coverImageFileId = collectionModal.cover.fileId;
      if (collectionModal.id) {
        const data = await call(`/api/designer/studio/collections/${collectionModal.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setCollections((prev) => prev.map((c) => (c.id === collectionModal.id ? data.collection : c)));
      } else {
        const data = await call("/api/designer/studio/collections", { method: "POST", body: JSON.stringify(body) });
        setCollections((prev) => [...prev, data.collection]);
      }
      setCollectionModal(null);
      push("Collection saved.");
    } catch (err) {
      setCollectionError(err instanceof Error ? err.message : "Couldn't save this collection.");
    } finally {
      setSaving(false);
    }
  };

  const deleteCollection = async (id: string) => {
    try {
      await call(`/api/designer/studio/collections/${id}`, { method: "DELETE" });
      setCollections((prev) => prev.filter((c) => c.id !== id));
      setDresses((prev) => prev.filter((d) => d.collectionId !== id));
      push("Collection removed.", "info");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't remove this collection.", "error");
    }
  };

  const saveDress = async () => {
    if (!dressModal?.name.trim()) {
      setDressError("Enter a dress name.");
      return;
    }
    if (!dressModal.price) {
      setDressError("Enter a price.");
      return;
    }
    setDressError("");
    setSaving(true);
    let stockStatusSaved = true;
    try {
      const imageFileIds = dressModal.images.map((i) => i.fileId);
      if (dressModal.id) {
        const data = await call(`/api/designer/studio/dresses/${dressModal.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: dressModal.name, description: dressModal.description, price: Number(dressModal.price), available: dressModal.available, stockStatus: dressModal.stockStatus, imageFileIds }),
        });
        setDresses((prev) => prev.map((d) => (d.id === dressModal.id ? data.dress : d)));
        stockStatusSaved = data.stockStatusSaved !== false;
      } else {
        const data = await call("/api/designer/studio/dresses", {
          method: "POST",
          body: JSON.stringify({ collectionId: dressModal.collectionId, name: dressModal.name, description: dressModal.description, price: Number(dressModal.price), available: dressModal.available, stockStatus: dressModal.stockStatus, imageFileIds }),
        });
        setDresses((prev) => [...prev, data.dress]);
        stockStatusSaved = data.stockStatusSaved !== false;
      }
      setDressModal(null);
      // Only when the database doesn't have stock statuses yet (migration 20261019000001 not applied).
      if (stockStatusSaved) push("Dress saved.");
      else push("Dress saved, but its availability couldn't be stored yet — it shows as in stock until the server is updated.", "error");
    } catch (err) {
      setDressError(err instanceof Error ? err.message : "Couldn't save this dress.");
    } finally {
      setSaving(false);
    }
  };

  const deleteDress = async (id: string) => {
    try {
      await call(`/api/designer/studio/dresses/${id}`, { method: "DELETE" });
      setDresses((prev) => prev.filter((d) => d.id !== id));
      push("Dress removed.", "info");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't remove this dress.", "error");
    }
  };

  const saveCreation = async () => {
    if (!creationModal) return;
    setSaving(true);
    try {
      if (creationModal.id) {
        const body: Record<string, unknown> = { description: creationModal.description, year: creationModal.year };
        if (creationModal.image) body.imageFileId = creationModal.image.fileId;
        const data = await call(`/api/designer/studio/previous-creations/${creationModal.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setPreviousCreations((prev) => prev.map((c) => (c.id === creationModal.id ? data.creation : c)));
      } else {
        if (!creationModal.image) return;
        const data = await call("/api/designer/studio/previous-creations", {
          method: "POST",
          body: JSON.stringify({ imageFileId: creationModal.image.fileId, description: creationModal.description, year: creationModal.year }),
        });
        setPreviousCreations((prev) => [...prev, data.creation]);
      }
      setCreationModal(null);
      push("Creation saved.");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save this creation.", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteCreation = async (id: string) => {
    try {
      await call(`/api/designer/studio/previous-creations/${id}`, { method: "DELETE" });
      setPreviousCreations((prev) => prev.filter((c) => c.id !== id));
      push("Creation removed.", "info");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't remove this creation.", "error");
    }
  };

  const saveAbout = async () => {
    if (aboutDraft === null) return;
    if (!aboutDraft.trim()) {
      setAboutError("Please describe your studio — this can't be empty.");
      return;
    }
    setAboutError("");
    setAboutSaving(true);
    try {
      await call("/api/designer/studio", { method: "PATCH", body: JSON.stringify({ story: aboutDraft }) });
      setDesigner((d) => (d ? { ...d, story: aboutDraft.trim() } : d));
      setAboutDraft(null);
      push("About Studio updated.");
    } catch (err) {
      setAboutError(err instanceof Error ? err.message : "Couldn't save your changes.");
    } finally {
      setAboutSaving(false);
    }
  };

  const saveInfo = async () => {
    if (!/^\d+$/.test(info.experienceYears) || Number(info.experienceYears) > 80) {
      setExperienceError("Enter a whole number of years from 0 to 80.");
      return;
    }
    setExperienceError("");
    setSaving(true);
    try {
      await call("/api/designer/studio", { method: "PATCH", body: JSON.stringify({ ...info, experienceYears: Number(info.experienceYears) }) });
      push("Studio information updated.");
      await load();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save your changes.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="container-editorial py-12 pb-section-gap">
        <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
          <Loader2 className="animate-spin" size={18} /> Loading your Studio…
        </div>
      </div>
    );
  }

  if (status === "error" || !designer) {
    return (
      <div className="container-editorial py-12 pb-section-gap text-center">
        <p className="text-headline-sm mb-2">Couldn't load your Studio</p>
        <p className="text-ink-variant text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <p className="text-label-md text-outline mb-2">MANAGE STUDIO</p>
      <h1 className="text-headline-md mb-8">{designer.studioName}</h1>

      <div className="relative h-48 md:h-64 rounded-md overflow-hidden mb-10 group">
        <SafeImage src={designer.banner} alt={`${designer.studioName} banner`} sizes="100vw" className="object-cover" fallbackIconSize={28} />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/50 to-transparent" />
        <div className="absolute bottom-4 right-4">
          <Button size="sm" onClick={() => { setBannerDraft([]); setBannerError(""); setBannerModalOpen(true); }} className="shadow-lift">
            <Pencil size={14} /> Edit Banner
          </Button>
        </div>
        <p className="absolute bottom-4 left-4 text-white text-xs bg-ink/40 rounded-full px-3 py-1">Studio banner</p>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* HIGHLIGHTS */}
      {tab === "highlights" && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-ink-variant">Showcase up to 3 images that represent your studio at its best.</p>
            {designer.highlights.length < 3 && (
              <Button size="sm" onClick={() => setHighlightModal({ id: null, image: null, caption: "" })}><Plus size={14} /> Add Highlight</Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {designer.highlights.map((h) => (
              <div key={h.id} className="relative rounded-md overflow-hidden group h-56">
                <Image src={h.image} alt={h.caption} fill sizes="33vw" className="object-cover" />
                <div className="absolute inset-0 bg-ink/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button onClick={() => setHighlightModal({ id: h.id, image: null, caption: h.caption })} className="p-2 bg-white rounded-full"><Pencil size={14} /></button>
                  <button onClick={() => deleteHighlight(h.id)} className="p-2 bg-white rounded-full text-error"><Trash2 size={14} /></button>
                </div>
                <p className="absolute bottom-2 left-2 right-2 text-white text-xs bg-ink/50 rounded px-2 py-1">{h.caption}</p>
              </div>
            ))}
            {designer.highlights.length === 0 && <p className="text-sm text-outline col-span-full">No highlights yet.</p>}
          </div>
        </div>
      )}

      {/* MEET THE DESIGNER */}
      {tab === "meet" && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-ink-variant">Two images with a short description each, introducing you to customers.</p>
            {designer.meetTheDesigner.length < 2 && (
              <Button size="sm" onClick={() => setMeetModal({ id: null, image: null, description: "" })}><Plus size={14} /> Add Entry</Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {designer.meetTheDesigner.map((m) => (
              <div key={m.id} className="flex gap-4 border border-outline-variant rounded-md p-4">
                <div className="relative w-24 h-28 rounded-sm overflow-hidden shrink-0"><Image src={m.image} alt="" fill sizes="96px" className="object-cover" /></div>
                <div className="flex-1">
                  <p className="text-sm text-ink-variant mb-3">{m.description}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setMeetModal({ id: m.id, image: null, description: m.description })}><Pencil size={12} /> Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => deleteMeetEntry(m.id)}><Trash2 size={12} /> Delete</Button>
                  </div>
                </div>
              </div>
            ))}
            {designer.meetTheDesigner.length === 0 && <p className="text-sm text-outline col-span-full">No entries yet.</p>}
          </div>
        </div>
      )}

      {/* COLLECTIONS */}
      {tab === "collections" && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-ink-variant">Organize your dresses into collections.</p>
            <Button size="sm" onClick={() => openCollectionModal()}><Plus size={14} /> Add Collection</Button>
          </div>
          <div className="flex flex-col gap-8">
            {collections.map((c) => {
              const collectionDresses = dresses.filter((d) => d.collectionId === c.id);
              return (
                <div key={c.id} className="border border-outline-variant rounded-md p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
                    <div className="relative w-full sm:w-40 aspect-[4/3] shrink-0 rounded-sm overflow-hidden bg-surface-container group">
                      {c.coverImage ? (
                        <Image src={c.coverImage} alt={`${c.name} cover`} fill sizes="(max-width: 640px) 100vw, 160px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => openCollectionModal(c)}
                          className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-outline border border-dashed border-outline-variant rounded-sm hover:border-primary hover:text-primary transition-colors"
                        >
                          <Camera size={18} strokeWidth={1.5} />
                          <span className="text-[11px]">Add cover</span>
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-xl truncate">{c.name}</p>
                      {c.category && <Badge tone="neutral">{c.category}</Badge>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" variant="secondary" onClick={() => openCollectionModal(c)}><Pencil size={13} /> Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => deleteCollection(c.id)}><Trash2 size={13} /> Delete</Button>
                      <Button size="sm" onClick={() => { setDressError(""); setDressModal({ collectionId: c.id, id: null, name: "", images: [], description: "", price: "", available: true, stockStatus: "in_stock" }); }}>
                        <Plus size={13} /> Add Dress
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {collectionDresses.map((d) => (
                      <div key={d.id} className="border border-outline-variant rounded-sm overflow-hidden relative">
                        <div className="relative h-40">
                          {d.images[0] && <Image src={d.images[0]} alt={d.name} fill sizes="25vw" className="object-cover" />}
                          {dressAvailability(d).badge && (
                            <span className="absolute top-2 left-2 bg-ink/70 text-white text-[10px] px-2 py-0.5 rounded-full" data-testid="dress-badge">{dressAvailability(d).badge}</span>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-medium truncate">{d.name}</p>
                          <p className="text-primary text-xs mt-0.5">{formatCurrency(d.price)}</p>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => { setDressError(""); setDressModal({ collectionId: c.id, id: d.id, name: d.name, images: d.imageFiles ?? [], description: d.description, price: String(d.price), available: d.available, stockStatus: d.stockStatus ?? "in_stock" }); }}
                              className="text-xs text-primary flex items-center gap-1"
                            >
                              <Pencil size={11} />Edit
                            </button>
                            <button onClick={() => deleteDress(d.id)} className="text-xs text-error flex items-center gap-1"><Trash2 size={11} />Delete</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {collectionDresses.length === 0 && <p className="text-xs text-outline col-span-full">No dresses yet in this collection.</p>}
                  </div>
                </div>
              );
            })}
            {collections.length === 0 && <p className="text-sm text-outline">No collections yet.</p>}
          </div>
        </div>
      )}

      {/* PREVIOUS CREATIONS */}
      {tab === "creations" && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-ink-variant">Show past work with the year completed.</p>
            <Button size="sm" onClick={() => setCreationModal({ id: null, image: null, description: "", year: "" })}><Plus size={14} /> Add Creation</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {previousCreations.map((cr) => (
              <div key={cr.id} className="border border-outline-variant rounded-md overflow-hidden">
                <div className="relative h-48">{cr.image && <Image src={cr.image} alt="" fill sizes="33vw" className="object-cover" />}</div>
                <div className="p-4">
                  <p className="text-xs text-outline mb-1">{cr.year}</p>
                  <p className="text-sm text-ink-variant mb-3">{cr.description}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setCreationModal({ id: cr.id, image: null, description: cr.description, year: cr.year })}><Pencil size={12} /> Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => deleteCreation(cr.id)}><Trash2 size={12} /> Delete</Button>
                  </div>
                </div>
              </div>
            ))}
            {previousCreations.length === 0 && <p className="text-sm text-outline col-span-full">No previous creations added yet.</p>}
          </div>
        </div>
      )}

      {/* STUDIO INFO */}
      {tab === "info" && (
        <div className="mt-8 max-w-md flex flex-col gap-5">
          <div className="border border-outline-variant rounded-md p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-label-md text-outline">ABOUT STUDIO</p>
              {aboutDraft === null && (
                <Button size="sm" variant="secondary" onClick={() => { setAboutError(""); setAboutDraft(designer.story); }}>
                  <Pencil size={13} /> Edit About Studio
                </Button>
              )}
            </div>
            {aboutDraft === null ? (
              designer.story ? (
                <p className="text-sm text-ink-variant leading-relaxed whitespace-pre-line">{designer.story}</p>
              ) : (
                <p className="text-sm text-outline">No description yet. Tell customers about your studio, your craft, and what makes your work special.</p>
              )
            ) : (
              <div className="flex flex-col gap-4">
                <Field label="About Studio" htmlFor="aboutStudio" required error={aboutError} hint="Shown in the About the Studio section of your public profile.">
                  <Textarea id="aboutStudio" value={aboutDraft} onChange={(e) => setAboutDraft(e.target.value)} />
                </Field>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveAbout} disabled={aboutSaving}>{aboutSaving ? "Saving…" : "Save Changes"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAboutDraft(null); setAboutError(""); }} disabled={aboutSaving}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
          <Field label="Contact email" htmlFor="contactEmail"><Input id="contactEmail" value={info.contactEmail} onChange={(e) => setInfo((i) => ({ ...i, contactEmail: e.target.value }))} /></Field>
          <Field label="Opening hours" htmlFor="hours"><Input id="hours" value={info.openingHours} onChange={(e) => setInfo((i) => ({ ...i, openingHours: e.target.value }))} /></Field>
          <Field label="Atelier location" htmlFor="location"><Input id="location" value={info.atelierLocation} onChange={(e) => setInfo((i) => ({ ...i, atelierLocation: e.target.value }))} /></Field>
          <Field label="Years of experience" htmlFor="experienceYears" error={experienceError}>
            <Input
              id="experienceYears"
              type="number"
              inputMode="numeric"
              min={0}
              max={80}
              step={1}
              value={info.experienceYears}
              onKeyDown={(e) => { if (["-", "+", "e", "E", ".", ","].includes(e.key)) e.preventDefault(); }}
              onChange={(e) => { setInfo((i) => ({ ...i, experienceYears: e.target.value.replace(/\D/g, "") })); setExperienceError(""); }}
            />
          </Field>
          <Button className="w-fit" onClick={saveInfo} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
        </div>
      )}

      {/* Modals */}
      <Modal open={!!highlightModal} onClose={() => setHighlightModal(null)} title={highlightModal?.id ? "Edit highlight" : "Add highlight"}>
        {highlightModal && (
          <div className="flex flex-col gap-5">
            <Field label="Image" htmlFor="hImage">
              <UploadingImageGrid
                images={highlightModal.image ? [highlightModal.image] : []}
                onChange={(imgs) => setHighlightModal((m) => m && { ...m, image: imgs[0] ?? null })}
                bucket="studioImages"
                entityType="studio_highlight"
                max={1}
              />
            </Field>
            <Field label="Caption" htmlFor="hCaption"><Input id="hCaption" value={highlightModal.caption} onChange={(e) => setHighlightModal((m) => m && { ...m, caption: e.target.value })} /></Field>
            <Button className="w-full" onClick={saveHighlight} disabled={saving}>{saving ? "Saving…" : "Save Highlight"}</Button>
          </div>
        )}
      </Modal>

      <Modal open={!!meetModal} onClose={() => setMeetModal(null)} title={meetModal?.id ? "Edit entry" : "Add entry"}>
        {meetModal && (
          <div className="flex flex-col gap-5">
            <Field label="Image" htmlFor="mImage">
              <UploadingImageGrid
                images={meetModal.image ? [meetModal.image] : []}
                onChange={(imgs) => setMeetModal((m) => m && { ...m, image: imgs[0] ?? null })}
                bucket="studioImages"
                entityType="meet_the_designer"
                max={1}
              />
            </Field>
            <Field label="Description" htmlFor="mDesc"><Textarea id="mDesc" value={meetModal.description} onChange={(e) => setMeetModal((m) => m && { ...m, description: e.target.value })} /></Field>
            <Button className="w-full" onClick={saveMeetEntry} disabled={saving}>{saving ? "Saving…" : "Save Entry"}</Button>
          </div>
        )}
      </Modal>

      <Modal open={!!collectionModal} onClose={closeCollectionModal} title={collectionModal?.id ? "Edit collection" : "Add collection"}>
        {collectionModal && (
          <div className="flex flex-col gap-5">
            <Field label="Collection name" htmlFor="cName" required error={collectionError}>
              <Input id="cName" value={collectionModal.name} onChange={(e) => setCollectionModal((c) => c && { ...c, name: e.target.value })} />
            </Field>
            <Field label="Category" htmlFor="cCategory" required><Input id="cCategory" value={collectionModal.category} onChange={(e) => setCollectionModal((c) => c && { ...c, category: e.target.value })} /></Field>
            <Field label="Collection cover image" htmlFor="cCover" required={!collectionModal.id || collectionModal.hadCover}>
              <CollectionCoverUpload
                value={collectionModal.cover}
                onChange={(cover) => { setCollectionModal((c) => c && { ...c, cover }); if (cover) setCoverError(""); }}
                onUploadingChange={setCoverUploading}
                error={coverError}
              />
            </Field>
            <Button className="w-full" onClick={saveCollection} disabled={saving || coverUploading}>{saving ? "Saving…" : coverUploading ? "Uploading cover…" : "Save Collection"}</Button>
          </div>
        )}
      </Modal>

      <Modal open={!!dressModal} onClose={() => (saving ? null : setDressModal(null))} title={dressModal?.id ? "Edit dress" : "Add dress"}>
        {dressModal && (
          <div className="flex flex-col gap-5">
            <Field label="Dress name" htmlFor="dName" required error={dressError}>
              <Input id="dName" value={dressModal.name} onChange={(e) => setDressModal((d) => d && { ...d, name: e.target.value })} />
            </Field>
            <Field label="Images" htmlFor="dImages">
              <UploadingImageGrid images={dressModal.images} onChange={(images) => setDressModal((d) => d && { ...d, images })} bucket="studioImages" entityType="dress_image" max={4} />
            </Field>
            <Field label="Description" htmlFor="dDesc"><Textarea id="dDesc" value={dressModal.description} onChange={(e) => setDressModal((d) => d && { ...d, description: e.target.value })} /></Field>
            <Field label="Price (₹)" htmlFor="dPrice" required><Input id="dPrice" type="number" value={dressModal.price} onChange={(e) => setDressModal((d) => d && { ...d, price: e.target.value })} /></Field>
            <Field label="Availability" htmlFor="dStock" hint="What customers see on this dress: whether it's ready now, made for them, or not available at the moment.">
              <Select id="dStock" value={dressModal.stockStatus} onChange={(e) => setDressModal((d) => d && { ...d, stockStatus: e.target.value as StockStatus })}>
                {STOCK_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dressModal.available} onChange={(e) => setDressModal((d) => d && { ...d, available: e.target.checked })} />
              Available for purchase
            </label>
            <Button className="w-full" onClick={saveDress} disabled={saving}>{saving ? "Saving…" : "Save Dress"}</Button>
          </div>
        )}
      </Modal>

      <Modal open={!!creationModal} onClose={() => setCreationModal(null)} title={creationModal?.id ? "Edit creation" : "Add creation"}>
        {creationModal && (
          <div className="flex flex-col gap-5">
            <Field label="Image" htmlFor="crImage">
              <UploadingImageGrid
                images={creationModal.image ? [creationModal.image] : []}
                onChange={(imgs) => setCreationModal((c) => c && { ...c, image: imgs[0] ?? null })}
                bucket="studioImages"
                entityType="previous_creation"
                max={1}
              />
            </Field>
            <Field label="Description" htmlFor="crDesc"><Textarea id="crDesc" value={creationModal.description} onChange={(e) => setCreationModal((c) => c && { ...c, description: e.target.value })} /></Field>
            <Field label="Year" htmlFor="crYear"><Input id="crYear" value={creationModal.year} onChange={(e) => setCreationModal((c) => c && { ...c, year: e.target.value })} /></Field>
            <Button className="w-full" onClick={saveCreation} disabled={saving}>{saving ? "Saving…" : "Save Creation"}</Button>
          </div>
        )}
      </Modal>

      <Modal open={bannerModalOpen} onClose={() => (bannerSaving ? null : setBannerModalOpen(false))} title="Edit studio banner">
        <div className="flex flex-col gap-5">
          <p className="text-sm text-ink-variant">This banner appears at the top of your studio for customers to see.</p>
          <Field label="Banner image" htmlFor="bannerImage" required hint="Upload a new image to replace your current banner.">
            <UploadingImageGrid images={bannerDraft} onChange={(imgs) => { setBannerDraft(imgs); setBannerError(""); }} bucket="studioImages" entityType="studio_banner" max={1} label="Upload banner" />
          </Field>
          {bannerError && <p className="text-xs text-error">{bannerError}</p>}
          <Button className="w-full" onClick={saveBanner} disabled={bannerSaving}>
            {bannerSaving ? "Saving…" : "Save Banner"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
