"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadImage, deleteUnusedImage } from "@/lib/customer/upload-client";

// Mirrors app/api/uploads/route.ts's own limits, so a bad file is caught before any upload starts.
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * `fileId` is set only for an image uploaded in THIS editing session (not yet saved to the
 * collection). A collection's already-saved cover arrives as `{ url }` alone — so replace/remove
 * only ever cleans up unsaved uploads, never the file a saved collection still points at.
 */
export interface CoverValue {
  url: string;
  fileId?: string;
}

export function CollectionCoverUpload({
  value,
  onChange,
  onUploadingChange,
  error,
}: {
  value: CoverValue | null;
  onChange: (value: CoverValue | null) => void;
  onUploadingChange?: (uploading: boolean) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const setBusy = (busy: boolean) => {
    setUploading(busy);
    onUploadingChange?.(busy);
  };

  const handleFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLocalError("Please choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("Image must be smaller than 10MB.");
      return;
    }

    setLocalError("");
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const uploaded = await uploadImage(file, "studioImages", "collection_cover");
      if (value?.fileId) void deleteUnusedImage(value.fileId);
      onChange(uploaded);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Something went wrong uploading that image.");
    } finally {
      setPreview(null);
      setBusy(false);
    }
  };

  const handleRemove = () => {
    if (value?.fileId) void deleteUnusedImage(value.fileId);
    onChange(null);
  };

  const shown = preview ?? value?.url ?? null;
  const message = localError || error;

  return (
    <div>
      {shown ? (
        <div className="relative aspect-[4/3] w-full rounded-md overflow-hidden border border-outline-variant bg-surface-container">
          <Image src={shown} alt="Collection cover preview" fill sizes="(max-width: 640px) 100vw, 480px" className="object-cover" unoptimized={!!preview} />
          {uploading && (
            <div className="absolute inset-0 bg-ink/40 flex items-center justify-center gap-2 text-white text-sm">
              <Loader2 size={18} className="animate-spin" /> Uploading…
            </div>
          )}
          {!uploading && (
            <div className="absolute bottom-3 right-3 flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs text-ink shadow-soft hover:bg-white transition-colors"
              >
                <RefreshCw size={12} /> Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs text-error shadow-soft hover:bg-white transition-colors"
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void handleFile(e.dataTransfer.files?.[0]); }}
          className={cn(
            "aspect-[4/3] w-full rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-2 px-4 text-center transition-colors",
            message ? "border-error/60 text-error" : "border-outline-variant text-outline hover:border-primary hover:text-primary"
          )}
        >
          <Camera size={26} strokeWidth={1.5} />
          <span className="text-sm font-medium">Upload collection cover</span>
          <span className="text-xs text-outline">JPG, PNG or WEBP · up to 10MB</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {message && <p className="text-xs text-error mt-2">{message}</p>}
    </div>
  );
}
