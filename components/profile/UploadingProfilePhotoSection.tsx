"use client";

import { useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { uploadImage } from "@/lib/customer/upload-client";

const ACCEPTED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const MAX_FILE_SIZE_MB = 5;

function validateImageFile(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extensionOk = ACCEPTED_EXTENSIONS.includes(extension);
  const typeOk = !file.type || ACCEPTED_MIME_TYPES.includes(file.type);
  if (!extensionOk || !typeOk) return "Please choose a JPG, JPEG, PNG, or WEBP image.";
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return `Image must be smaller than ${MAX_FILE_SIZE_MB}MB.`;
  return null;
}

/**
 * A real-upload counterpart to components/profile/ProfilePhotoSection.tsx, used only by the
 * customer Profile page this phase. Kept as a separate component for the same reason as
 * UploadingImageGrid vs. ImageUploader: ProfilePhotoSection is also used by the (still fully mock,
 * Phase 5) designer profile page, so changing its contract in place would have broken that page.
 * Same UI/interaction; the file actually uploads to the "avatars" bucket when the user hits Save
 * in the preview modal (not before — cancelling never leaves an unused upload behind), and
 * `onSave` receives the real { fileId, url } instead of a local blob: preview string.
 */
export function UploadingProfilePhotoSection({
  photoUrl,
  name,
  onSave,
  onRemove,
  entityType = "customer_avatar",
}: {
  photoUrl?: string;
  name: string;
  onSave: (result: { fileId: string; url: string }) => void;
  onRemove?: () => void;
  /** files.entity_type for the upload — the designer profile page passes "designer_avatar" so its
   *  photos aren't recorded as customer avatars (matching designer onboarding). */
  entityType?: "customer_avatar" | "designer_avatar";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      resetInput();
      return;
    }
    setError("");
    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setPreview("");
    setPendingFile(null);
    setError("");
    resetInput();
  };

  const save = async () => {
    if (!pendingFile) return;
    setSaving(true);
    setError("");
    try {
      const uploaded = await uploadImage(pendingFile, "avatars", entityType);
      onSave(uploaded);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong uploading that photo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 p-5 rounded-md border border-outline-variant flex-wrap">
      <div className="flex items-center gap-4">
        <Avatar src={photoUrl} alt={name} size={64} />
        <div>
          <p className="text-sm font-medium">Profile Photo</p>
          <p className="text-xs text-ink-variant mt-0.5">JPG, JPEG, PNG or WEBP · up to {MAX_FILE_SIZE_MB}MB</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
          <Pencil size={13} /> Change Photo
        </Button>
        {photoUrl && onRemove && (
          <Button type="button" size="sm" variant="danger" onClick={onRemove}>
            <Trash2 size={13} /> Remove Photo
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && !modalOpen && <p className="text-xs text-error w-full">{error}</p>}

      <Modal open={modalOpen} onClose={closeModal} title="Update Profile Photo">
        <div className="flex flex-col items-center gap-5">
          <Avatar src={preview} alt="New profile photo preview" size={140} />
          {error && <p className="text-xs text-error">{error}</p>}
          <p className="text-xs text-ink-variant text-center">
            This preview isn't saved yet — your profile photo updates everywhere only after you save.
          </p>
          <div className="flex gap-3 w-full">
            <Button type="button" variant="secondary" className="flex-1" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" className="flex-1" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
