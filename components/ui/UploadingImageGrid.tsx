"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadImage, deleteUnusedImage, type UploadedImage, type UploadBucket, type UploadEntityType } from "@/lib/customer/upload-client";

/**
 * A real-upload counterpart to components/ui/ImageUploader.tsx, used only where Phase 4 actually
 * connects to Supabase Storage (the customer request form, the Fashion Diary modal). Deliberately
 * a SEPARATE component rather than changing ImageUploader in place: that component is shared by
 * several designer-side pages (studio management, portfolio, designer onboarding) that are still
 * fully mock this phase (Designer Backend is Phase 5) — changing its contract there would have
 * broken pages this phase has no business touching. Same look/interaction as ImageUploader; the
 * only difference is each file actually uploads (via app/api/uploads) the moment it's selected,
 * and `images` tracks `{ fileId, url }` instead of a bare local blob: string, since a real fileId
 * is what request_images/diary_entry_images actually need to link the image in.
 */
export function UploadingImageGrid({
  images,
  onChange,
  bucket,
  entityType,
  max = 6,
  label = "Upload images",
}: {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  bucket: UploadBucket;
  entityType: UploadEntityType;
  max?: number;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = max - images.length;
    const toUpload = Array.from(files).slice(0, remaining);
    if (toUpload.length === 0) return;

    setError("");
    setUploading(true);
    try {
      const uploaded = await Promise.all(toUpload.map((f) => uploadImage(f, bucket, entityType)));
      onChange([...images, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong uploading that image.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = (index: number) => {
    const removed = images[index];
    onChange(images.filter((_, i) => i !== index));
    if (removed) void deleteUnusedImage(removed.fileId);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((img, i) => (
          <div key={img.fileId} className="relative w-24 h-24 rounded-sm overflow-hidden border border-outline-variant group">
            <Image src={img.url} alt={`Upload ${i + 1}`} fill sizes="96px" className="object-cover" />
            <button
              type="button"
              onClick={() => handleRemove(i)}
              aria-label="Remove image"
              className="absolute top-1 right-1 bg-ink/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {images.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "w-24 h-24 rounded-sm border-2 border-dashed border-outline-variant flex flex-col items-center justify-center gap-1 text-outline hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
            )}
          >
            {uploading ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
            <span className="text-[11px]">{uploading ? "Uploading…" : label}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-xs text-outline mt-2">
        {images.length}/{max} images added
      </p>
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}
