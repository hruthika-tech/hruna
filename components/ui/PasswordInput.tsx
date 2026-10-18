"use client";

import { InputHTMLAttributes, forwardRef, useLayoutEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";

// Password field with a show/hide toggle inside it on the right. Only the input's `type` changes —
// it is the same <input> element, so the value, the form state and the caret/selection survive.
// The toggle is type="button" so it never submits the form.

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(({ className, ...props }, ref) => {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selection = useRef<{ start: number | null; end: number | null; focused: boolean } | null>(null);

  const setRefs = (el: HTMLInputElement | null) => {
    inputRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  const toggle = () => {
    const el = inputRef.current;
    if (el) selection.current = { start: el.selectionStart, end: el.selectionEnd, focused: document.activeElement === el };
    setVisible((v) => !v);
  };

  // Browsers reset the caret when an input's type changes (Chromium does it once more after
  // layout), so put it back right after the change and again on the next frame.
  useLayoutEffect(() => {
    const el = inputRef.current;
    const saved = selection.current;
    selection.current = null;
    if (!el || !saved || !saved.focused || saved.start === null || saved.end === null) return;
    const { start, end } = saved;
    const restore = () => {
      if (document.activeElement === el) el.setSelectionRange(start, end);
    };
    restore();
    const frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  const label = visible ? "Hide password" : "Show password";

  return (
    <div className="relative">
      <Input ref={setRefs} type={visible ? "text" : "password"} className={cn("pr-12", className)} {...props} />
      <button
        type="button"
        onClick={toggle}
        // Keep focus (and the caret) in the input when toggling with a mouse/touch.
        onMouseDown={(e) => e.preventDefault()}
        aria-label={label}
        aria-pressed={visible}
        aria-controls={props.id}
        title={label}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r text-ink/70 hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 transition-colors disabled:opacity-50"
      >
        {visible ? <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.75} aria-hidden="true" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
