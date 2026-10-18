"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ImageOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SafeImage({
  src,
  alt,
  sizes,
  className,
  fallbackIconSize = 20,
  fallbackIcon: FallbackIcon = ImageOff,
}: {
  src?: string;
  alt: string;
  sizes?: string;
  className?: string;
  fallbackIconSize?: number;
  /** Shown when there's no src or it fails to load. ImageOff suits content images; avatars pass a
   *  person icon so "no photo yet" never looks like a broken image. */
  fallbackIcon?: LucideIcon;
}) {
  const [errored, setErrored] = useState(false);

  // Reset the error state if a new src comes in (e.g. after a banner/avatar edit).
  useEffect(() => setErrored(false), [src]);

  if (!src || errored) {
    return (
      <div className={cn("w-full h-full bg-surface-container flex items-center justify-center text-outline", className)}>
        <FallbackIcon size={fallbackIconSize} aria-hidden="true" />
      </div>
    );
  }

  return <Image src={src} alt={alt} fill sizes={sizes} className={className} onError={() => setErrored(true)} />;
}
