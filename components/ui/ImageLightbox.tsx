"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Full-screen image viewer for design images (project workspaces, requests, studios, dresses,
// diary). Shows the image whole (object-contain — never cropped or stretched), with a close button,
// Escape / arrow keys, previous/next buttons and swipe for galleries, and a counter. While open the
// page underneath can't scroll. Pass the gallery's URLs and the index to open (null = closed).

export function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
  label = "Image viewer",
}: {
  images: string[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  label?: string;
}) {
  const open = index !== null && images.length > 0;
  const current = open ? Math.min(Math.max(index, 0), images.length - 1) : 0;
  const many = images.length > 1;
  const closeRef = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);

  const go = useCallback(
    (delta: number) => {
      if (!many) return;
      onIndexChange((current + delta + images.length) % images.length);
    },
    [many, current, images.length, onIndexChange]
  );

  // On open: move focus into the viewer and lock page scrolling; on close: restore both.
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const html = document.documentElement;
    const prev = { body: document.body.style.overflow, html: html.style.overflow };
    document.body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev.body;
      html.style.overflow = prev.html;
      previousFocus?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, go, onClose]);

  if (!open) return null;
  const src = images[current];

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur-sm animate-[fadeIn_0.2s_ease] overscroll-contain touch-none select-none"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="image-lightbox"
      onClick={onClose}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
        else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) onClose(); // swipe down to dismiss
      }}
    >
      <div className="flex items-center justify-between px-4 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-3 text-white/80 text-sm shrink-0">
        <span aria-live="polite" data-testid="lightbox-counter">
          {many ? `${current + 1} / ${images.length}` : ""}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close image viewer"
          className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 mx-2 sm:mx-16 mb-[max(1rem,env(safe-area-inset-bottom))]">
        {loaded !== src && <div className="absolute inset-0 m-auto w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" aria-hidden="true" />}
        {/* Tapping the picture itself keeps the viewer open; tapping the dark area around it closes.
            With object-contain the <img> box also covers the empty bars beside the picture, so the
            hit-test uses the picture's drawn rectangle, not the element's box. */}
        <div
          className="absolute inset-0"
          onClick={(e) => {
            e.stopPropagation();
            const img = e.currentTarget.querySelector("img");
            if (!img || !img.naturalWidth || !img.naturalHeight) return onClose();
            const r = img.getBoundingClientRect();
            const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
            const w = img.naturalWidth * scale;
            const h = img.naturalHeight * scale;
            const left = r.left + (r.width - w) / 2;
            const top = r.top + (r.height - h) / 2;
            const onPicture = e.clientX >= left && e.clientX <= left + w && e.clientY >= top && e.clientY <= top + h;
            if (!onPicture) onClose();
          }}
        >
          <Image
            key={src}
            src={src}
            alt={many ? `Image ${current + 1} of ${images.length}` : "Image"}
            fill
            sizes="100vw"
            className={cn("object-contain transition-opacity duration-200", loaded === src ? "opacity-100" : "opacity-0")}
            onLoad={() => setLoaded(src)}
            data-testid="lightbox-image"
          />
        </div>
      </div>

      {many && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Previous image"
            className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="Next image"
            className="absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}
    </div>
  );
}

// The clickable wrapper for a thumbnail that opens the viewer. Keeps the thumbnail's own sizing.
export function LightboxTrigger({
  onOpen,
  label,
  className,
  children,
}: {
  onOpen: () => void;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={cn("block cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2", className)}
    >
      {children}
    </button>
  );
}

// A gallery thumbnail that opens the viewer on the whole gallery by itself — for server-rendered
// pages that can't hold viewer state. `className` sizes the thumbnail; `children` render on top of
// the image (e.g. a caption overlay).
export function ZoomableImage({
  images,
  index,
  alt,
  sizes,
  label,
  className,
  imageClassName = "object-cover",
  children,
}: {
  images: string[];
  index: number;
  alt: string;
  sizes: string;
  label?: string;
  className?: string;
  imageClassName?: string;
  children?: React.ReactNode;
}) {
  const [viewer, setViewer] = useState<number | null>(null);
  return (
    <>
      <LightboxTrigger
        onOpen={() => setViewer(index)}
        label={label ?? (images.length > 1 ? `View image ${index + 1} of ${images.length}` : "View image")}
        className={cn("relative w-full overflow-hidden text-left", className)}
      >
        <Image src={images[index]} alt={alt} fill sizes={sizes} className={imageClassName} />
        {children}
      </LightboxTrigger>
      <ImageLightbox images={images} index={viewer} onClose={() => setViewer(null)} onIndexChange={setViewer} />
    </>
  );
}
