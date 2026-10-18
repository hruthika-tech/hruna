"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, MapPin, Loader2 } from "lucide-react";
import { Stepper } from "@/components/ui/Progress";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/use-toast";
import { uploadImage } from "@/lib/customer/upload-client";
import { cn } from "@/lib/utils";

const STEPS = ["Profile", "Location", "Style"];
const CATEGORIES = ["Bridal", "Occasion Wear", "Ready-to-Wear", "Menswear", "Sustainable Fashion"];
const OCCASIONS = ["Wedding", "Reception", "Festive", "Work", "Casual", "Party"];

// Real data (Phase 9 fix) — "Finish & Explore HRUNA" used to just router.push("/home") with
// nothing ever saved: the name/city/avatar collected across this wizard was silently discarded,
// so a brand-new customer completing onboarding ended up with NO customer_profiles row at all
// (every other real feature that requires one — requests, diary, saved items — would then reject
// them). Now actually creates the real profile via POST /api/profile/customer on finish. The
// style-preference step (categories/occasions) has no matching column anywhere in the schema —
// left as a lightweight, honestly-non-persisted personalization touch rather than inventing new
// backend storage for it; nothing in its copy promises it's saved.
export default function OnboardingPage() {
  const router = useRouter();
  const { push } = useToast();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFileId, setAvatarFileId] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [occasions, setOccasions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  // Never ask for what we already have: load an EXISTING customer profile (so this page edits it),
  // otherwise prefill the name the user gave at registration. Read-only — nothing navigates here.
  useEffect(() => {
    (async () => {
      try {
        const profileRes = await fetch("/api/profile/customer");
        const profileData = profileRes.ok ? await profileRes.json() : null;
        if (profileData?.customerProfile) {
          setHasProfile(true);
          setName((n) => n || profileData.customerProfile.name || "");
          setCity((c) => c || profileData.customerProfile.city || "");
          return;
        }
        const session = await (await fetch("/api/auth/session")).json();
        if (session?.name) setName((n) => n || session.name);
      } catch {
        // Prefill is a convenience only — the fields stay editable and the server still falls
        // back to the registration name if none is sent.
      }
    })();
  }, []);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const handleAvatarChange = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarUploading(true);
    try {
      const uploaded = await uploadImage(file, "avatars", "customer_avatar");
      setAvatarFileId(uploaded.fileId);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't upload that photo.", "error");
      setAvatarPreview(null);
    } finally {
      setAvatarUploading(false);
    }
  };

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only send what's filled in: an empty name falls back (server-side) to the existing profile's
        // name or the registration name; an empty city never wipes one already saved.
        body: JSON.stringify({
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(city.trim() ? { city: city.trim() } : {}),
          ...(avatarFileId ? { avatarFileId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't finish setting up your profile.");
      router.push("/home");
    } catch (err) {
      // Log the real error for debugging (the backend's own message is already sanitized — never
      // raw schema/DB/secret detail — but a customer trying to finish onboarding doesn't need to
      // parse it either way); the toast stays generic and actionable.
      console.error("[onboarding:finish]", err);
      push("Something went wrong while completing your profile. Please try again.", "error");
      setSaving(false);
    }
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-16 px-6">
      <div className="w-full max-w-lg">
        <p className="font-display text-2xl text-center mb-10">HRUNA</p>
        <Stepper steps={STEPS} currentIndex={step} />

        <div className="mt-12">
          {step === 0 && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-headline-md mb-2">{hasProfile ? "Your profile" : "Let's set up your profile"}</h1>
                <p className="text-ink-variant text-sm">
                  {hasProfile
                    ? "Review your details — change anything you like."
                    : "We've filled in the name you registered with. This helps designers get to know you."}
                </p>
              </div>
              <div className="flex justify-center">
                <label className="relative w-28 h-28 rounded-full bg-surface-container flex items-center justify-center cursor-pointer overflow-hidden border border-outline-variant">
                  {avatarPreview ? (
                    <Image src={avatarPreview} alt="Profile" fill className="object-cover" />
                  ) : (
                    <Camera className="text-outline" size={22} />
                  )}
                  {avatarUploading && (
                    <div className="absolute inset-0 bg-ink/40 flex items-center justify-center">
                      <Loader2 className="animate-spin text-white" size={20} />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => handleAvatarChange(e.target.files)}
                  />
                </label>
              </div>
              <Field label="Full name" htmlFor="name" required>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-headline-md mb-2">Where are you based?</h1>
                <p className="text-ink-variant text-sm">We'll prioritise designers close to you.</p>
              </div>
              <Field label="City (optional)" htmlFor="city">
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={16} />
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Hyderabad" className="pl-11" />
                </div>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-8">
              <div>
                <h1 className="text-headline-md mb-2">What inspires your style?</h1>
                <p className="text-ink-variant text-sm">Pick a few — you can always change this later.</p>
              </div>
              <div>
                <p className="text-label-md text-outline mb-3">CATEGORIES</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggle(categories, setCategories, c)}
                      className={cn(
                        "rounded-full px-4 py-2 text-sm border transition-colors",
                        categories.includes(c)
                          ? "bg-primary text-white border-primary"
                          : "border-outline-variant text-ink-variant hover:border-primary"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-label-md text-outline mb-3">OCCASIONS</p>
                <div className="flex flex-wrap gap-2">
                  {OCCASIONS.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => toggle(occasions, setOccasions, o)}
                      className={cn(
                        "rounded-full px-4 py-2 text-sm border transition-colors",
                        occasions.includes(o)
                          ? "bg-primary text-white border-primary"
                          : "border-outline-variant text-ink-variant hover:border-primary"
                      )}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-12">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={saving}>Back</Button>
          ) : (
            <span />
          )}
          <Button onClick={next} disabled={saving || (step === 0 && !name.trim())}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Finishing…</> : step === STEPS.length - 1 ? "Finish & Explore HRUNA" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
