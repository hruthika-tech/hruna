"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Stepper } from "@/components/ui/Progress";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { UploadingImageGrid } from "@/components/ui/UploadingImageGrid";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { UploadedImage } from "@/lib/customer/upload-client";

const STEPS = ["Basics", "Measurements", "Inspiration", "Fabric & Budget", "Review"];
const CATEGORIES = ["Bridal", "Occasion Wear", "Ready-to-Wear", "Menswear", "Sustainable Fashion"];
const OCCASIONS = ["Wedding", "Reception", "Sangeet", "Festive", "Work", "Casual", "Party"];

// useSearchParams() requires a Suspense boundary around any component that calls it, so the
// page can still be statically analyzed at build time (Next.js App Router requirement) — the
// actual page content moved into NewRequestPageContent, wrapped below.
export default function NewRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
          <Loader2 className="animate-spin" size={18} /> Loading…
        </div>
      }
    >
      <NewRequestPageContent />
    </Suspense>
  );
}

function NewRequestPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preferredDesignerId = searchParams.get("designerId") ?? "";
  const { push } = useToast();
  const [preferredDesignerName, setPreferredDesignerName] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // Set when the API says this account has no customer profile yet. Nothing was saved; the form keeps
  // everything typed and offers ONE explicit action that creates the profile from the details given
  // at registration (no re-entry) and then sends this same request.
  const [needsProfile, setNeedsProfile] = useState(false);
  const [settingUpProfile, setSettingUpProfile] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: CATEGORIES[0],
    occasion: OCCASIONS[0],
    gender: "Women",
    bust: "",
    waist: "",
    hip: "",
    length: "",
    description: "",
    fabricPreference: "",
    budgetMin: "",
    budgetMax: "",
    location: "",
    dueDate: "",
    additionalPreferences: "",
  });
  const [images, setImages] = useState<UploadedImage[]>([]);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  // Real data (Phase 7 fix) — this used to resolve the "Sending to: <studio>" label from
  // lib/mock-data.ts, which silently showed nothing for any real designerId (e.g. from a real
  // Studio/dress page's "Request a Similar Design" link). The public Studio bundle API already
  // has everything this badge needs.
  useEffect(() => {
    if (!preferredDesignerId) return;
    (async () => {
      const res = await fetch(`/api/studio/${preferredDesignerId}`);
      if (!res.ok) return;
      const data = await res.json();
      setPreferredDesignerName(data.designer?.studioName ?? null);
    })();
  }, [preferredDesignerId]);

  const canContinue = () => {
    if (step === 0) return form.title.trim().length > 0;
    if (step === 3) return form.budgetMin && form.budgetMax && form.dueDate;
    return true;
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const setUpProfileAndSend = async () => {
    setSettingUpProfile(true);
    setSubmitError("");
    try {
      // No fields sent: the server uses the registration name for a new profile (or keeps an
      // existing one), always linked to the signed-in user — never anyone else's.
      const res = await fetch("/api/profile/customer", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't set up your customer profile.");
      setNeedsProfile(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't set up your customer profile.");
      setSettingUpProfile(false);
      return;
    }
    setSettingUpProfile(false);
    await handleSubmit();
  };

  const handleSubmit = async () => {
    setSubmitError("");
    setSubmitting(true);

    const measurements: Record<string, string> = {};
    if (form.bust) measurements.bust = `${form.bust} in`;
    if (form.waist) measurements.waist = `${form.waist} in`;
    if (form.hip) measurements.hip = `${form.hip} in`;
    if (form.length) measurements.length = `${form.length} in`;

    const sizeLabel = [
      form.bust && `Bust ${form.bust}in`,
      form.waist && `Waist ${form.waist}in`,
      form.hip && `Hip ${form.hip}in`,
    ]
      .filter(Boolean)
      .join(" / ") || "Custom";

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          category: form.category,
          occasion: form.occasion,
          gender: form.gender,
          size: sizeLabel,
          measurements,
          description: form.description,
          fabricPreference: form.fabricPreference,
          budgetMin: Number(form.budgetMin) || 0,
          budgetMax: Number(form.budgetMax) || 0,
          location: form.location,
          dueDate: form.dueDate,
          preferredDesignerId: preferredDesignerId || undefined,
          additionalPreferences: form.additionalPreferences,
          imageFileIds: images.map((i) => i.fileId),
        }),
      });
      const data = await res.json();
      if (res.status === 403 && data.code === "customer_profile_required") {
        setNeedsProfile(true);
        return;
      }
      if (!res.ok) throw new Error(data.message ?? "Something went wrong. Please try again.");

      setNeedsProfile(false);
      setSubmitted(true);
      push("Your fashion request has been sent to designers.", "success");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="container-narrow py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-primary-container text-primary flex items-center justify-center mx-auto mb-6 text-2xl">
          ✓
        </div>
        <h1 className="text-headline-md mb-3">Your request is on its way</h1>
        <p className="text-ink-variant mb-10">
          {preferredDesignerName
            ? `${preferredDesignerName} has received your request and will respond with a proposal soon.`
            : "Matching designers have been notified and will send proposals shortly."}
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => router.push("/requests")}>View My Requests</Button>
          <Button variant="secondary" onClick={() => router.push("/home")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-narrow py-12 pb-section-gap">
      <p className="text-label-md text-outline mb-2">NEW FASHION REQUEST</p>
      <h1 className="text-headline-md mb-10">Tell us what you're dreaming of</h1>

      <Stepper steps={STEPS} currentIndex={step} />

      {preferredDesignerName && (
        <div className="flex items-center gap-2 mt-8 mb-2">
          <span className="text-sm text-ink-variant">Sending to:</span>
          <Badge tone="primary">{preferredDesignerName}</Badge>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-6">
        {step === 0 && (
          <>
            <Field label="Project title" htmlFor="title" required>
              <Input id="title" value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="e.g. Reception lehenga in dusty rose" />
            </Field>
            <div className="grid sm:grid-cols-2 gap-6">
              <Field label="Category" htmlFor="category" required>
                <Select id="category" value={form.category} onChange={(e) => update("category", e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Occasion" htmlFor="occasion" required>
                <Select id="occasion" value={form.occasion} onChange={(e) => update("occasion", e.target.value)}>
                  {OCCASIONS.map((o) => <option key={o}>{o}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Gender" htmlFor="gender" required>
              <Select id="gender" value={form.gender} onChange={(e) => update("gender", e.target.value)}>
                <option>Women</option>
                <option>Men</option>
                <option>Unisex</option>
              </Select>
            </Field>
            <Field label="Description" htmlFor="description" hint="Describe the dress, its details, and the feeling you want it to have.">
              <Textarea id="description" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="A dusty rose lehenga with subtle gold thread work, comfortable for a 4-hour reception..." />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-sm text-ink-variant -mt-2">Enter your measurements — this stays private between you and the designer.</p>
            <div className="grid grid-cols-2 gap-6">
              <Field label="Bust / Chest (in)" htmlFor="bust"><Input id="bust" value={form.bust} onChange={(e) => update("bust", e.target.value)} /></Field>
              <Field label="Waist (in)" htmlFor="waist"><Input id="waist" value={form.waist} onChange={(e) => update("waist", e.target.value)} /></Field>
              <Field label="Hip (in)" htmlFor="hip"><Input id="hip" value={form.hip} onChange={(e) => update("hip", e.target.value)} /></Field>
              <Field label="Length (in)" htmlFor="length"><Input id="length" value={form.length} onChange={(e) => update("length", e.target.value)} /></Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Inspiration & reference images" htmlFor="images" hint="Upload mood images, sketches, or references — up to 6.">
              <UploadingImageGrid images={images} onChange={setImages} bucket="requestImages" entityType="request_image" />
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Fabric preference" htmlFor="fabric">
              <Input id="fabric" value={form.fabricPreference} onChange={(e) => update("fabricPreference", e.target.value)} placeholder="e.g. Raw silk or silk organza, breathable" />
            </Field>
            <div className="grid grid-cols-2 gap-6">
              <Field label="Budget min (₹)" htmlFor="budgetMin" required>
                <Input id="budgetMin" type="number" value={form.budgetMin} onChange={(e) => update("budgetMin", e.target.value)} />
              </Field>
              <Field label="Budget max (₹)" htmlFor="budgetMax" required>
                <Input id="budgetMax" type="number" value={form.budgetMax} onChange={(e) => update("budgetMax", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <Field label="Location" htmlFor="location"><Input id="location" value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="City" /></Field>
              <Field label="Due date" htmlFor="dueDate" required><Input id="dueDate" type="date" value={form.dueDate} onChange={(e) => update("dueDate", e.target.value)} /></Field>
            </div>
            <Field label="Additional preferences" htmlFor="additionalPreferences" hint="Anything else the designer should know.">
              <Textarea id="additionalPreferences" value={form.additionalPreferences} onChange={(e) => update("additionalPreferences", e.target.value)} />
            </Field>
          </>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-6">
            <h2 className="text-headline-sm">Review your request</h2>
            <ReviewRow label="Title" value={form.title} />
            <ReviewRow label="Category" value={`${form.category} · ${form.occasion} · ${form.gender}`} />
            <ReviewRow label="Measurements" value={`Bust ${form.bust || "—"}, Waist ${form.waist || "—"}, Hip ${form.hip || "—"}, Length ${form.length || "—"}`} />
            <ReviewRow label="Description" value={form.description || "—"} />
            <ReviewRow label="Fabric preference" value={form.fabricPreference || "—"} />
            <ReviewRow label="Budget" value={form.budgetMin && form.budgetMax ? `${formatCurrency(Number(form.budgetMin))} – ${formatCurrency(Number(form.budgetMax))}` : "—"} />
            <ReviewRow label="Location" value={form.location || "—"} />
            <ReviewRow label="Due date" value={form.dueDate || "—"} />
            {images.length > 0 && (
              <div>
                <p className="text-label-md text-outline mb-2">INSPIRATION IMAGES</p>
                <div className="flex gap-3 flex-wrap">
                  {images.map((img) => (
                    <div key={img.fileId} className="relative w-20 h-20 rounded-sm overflow-hidden">
                      <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {needsProfile && (
              <div role="alert" className="flex flex-col gap-3 rounded-md border border-outline-variant bg-surface-low p-4">
                <p className="text-sm text-ink-variant">
                  Your request hasn&apos;t been sent yet — requests are made from a customer profile, and this account
                  doesn&apos;t have one. We&apos;ll create it using the name you registered with; everything you entered
                  here stays as it is.
                </p>
                <Button type="button" size="sm" className="w-fit" onClick={setUpProfileAndSend} disabled={settingUpProfile || submitting}>
                  {settingUpProfile || submitting ? "Sending…" : "Create my customer profile & send request"}
                </Button>
              </div>
            )}
            {submitError && <p className="text-sm text-error">{submitError}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-12">
        {step > 0 ? <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button> : <span />}
        {step < STEPS.length - 1 ? (
          <Button onClick={next} disabled={!canContinue()}>Continue</Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "Submitting…" : "Submit Request"}</Button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 pb-4 border-b border-outline-variant">
      <p className="text-label-md text-outline">{label.toUpperCase()}</p>
      <p className="text-sm text-ink">{value}</p>
    </div>
  );
}
