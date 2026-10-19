"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, ShieldCheck, Plus, Pencil, Trash2, CheckCircle2, Hourglass, XCircle, Loader2 } from "lucide-react";
import { Stepper } from "@/components/ui/Progress";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { UploadingImageGrid } from "@/components/ui/UploadingImageGrid";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/hooks/use-toast";
import { uploadImage, type UploadedImage } from "@/lib/customer/upload-client";
import { cn } from "@/lib/utils";

const STEPS = ["Account", "Professional Profile", "Experience", "Portfolio", "Identity", "Studio", "Review"];

const ROLES = [
  "Fashion Designer", "Tailor / Stitching Specialist", "Embroidery Artist", "Handwork Specialist",
  "Aari Work Specialist", "Zardozi Specialist", "Pattern Maker", "Boutique Owner", "Studio Owner",
  "Bridal Wear Specialist", "Menswear Specialist", "Womenswear Specialist", "Kidswear Specialist",
  "Textile Artist", "Fashion Stylist", "Custom Clothing Maker", "Accessories Designer", "Other",
];

const SPEC_CATEGORIES = [
  "Bridal", "Ethnic", "Indo-Western", "Western", "Menswear", "Womenswear", "Kidswear",
  "Couture", "Casual", "Occasion Wear", "Saree Blouses", "Lehengas", "Gowns", "Suits", "Shirts", "Trousers", "Accessories",
];

const SPEC_CRAFTS = [
  "Embroidery", "Aari", "Zardozi", "Hand Embroidery", "Machine Embroidery", "Appliqué",
  "Beading", "Handwork", "Draping", "Stitching", "Pattern Making", "Customization",
];

const EXPERIENCE_LEVELS = ["Just starting", "1–2 years", "3–5 years", "6–10 years", "10+ years"];
const LEARNING_BACKGROUNDS = [
  "Fashion degree", "Fashion diploma", "Professional certification", "Apprenticeship",
  "Learned through family/business", "Self-taught", "Professional experience", "Other",
];
const WORKING_MODELS = ["Home Studio", "Boutique", "Professional Studio", "Independent", "Workshop", "Other"];

function MultiSelectChips({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onToggle(opt)}
          className={cn(
            "rounded-full px-4 py-2 text-sm border transition-colors",
            selected.includes(opt) ? "bg-primary text-white border-primary" : "border-outline-variant text-ink-variant hover:border-primary"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

interface PortfolioItem { id: string; image: string; title: string; category: string; description: string; year?: string }
interface OnboardingDraft {
  phone: string; emailVerified: boolean; roles: string[]; otherRoleDescription?: string;
  specializationCategories: string[]; specializationCrafts: string[]; experienceLevel: string;
  learningBackground: string; experienceDescription: string; portfolioOwnershipAccepted: boolean;
  dateOfBirth: string; studioName: string; city: string; area: string; serviceLocations: string[];
  address?: string; aboutStudio: string; instagramUrl?: string; websiteUrl?: string; workingModel: string;
  portfolioItems: PortfolioItem[];
}
interface Verification {
  identityStatus: string; identityFailureReason?: string; portfolioStatus: string;
  portfolioReviewNote?: string; overallStatus: string;
}

export default function DesignerOnboardingPage() {
  const router = useRouter();
  const { push } = useToast();
  const [step, setStep] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState("");

  const [onboarding, setOnboarding] = useState<OnboardingDraft | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);

  // Account step local fields (the person's name lives on public.users.display_name via
  // /api/designer/profile, separate from the onboarding draft table)
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<UploadedImage | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [phone, setPhone] = useState("");

  const [roles, setRoles] = useState<string[]>([]);
  const [otherRoleDescription, setOtherRoleDescription] = useState("");
  const [specCategories, setSpecCategories] = useState<string[]>([]);
  const [specCrafts, setSpecCrafts] = useState<string[]>([]);

  const [experienceLevel, setExperienceLevel] = useState("");
  const [learningBackground, setLearningBackground] = useState("");
  const [experienceDescription, setExperienceDescription] = useState("");

  const [portfolioModal, setPortfolioModal] = useState<{ id: string | null; image: UploadedImage | null; title: string; category: string; description: string; year: string } | null>(null);
  const [ownershipAccepted, setOwnershipAccepted] = useState(false);
  const [portfolioSubmitting, setPortfolioSubmitting] = useState(false);

  const [dateOfBirth, setDateOfBirth] = useState("");
  const [identitySubmitting, setIdentitySubmitting] = useState(false);

  const [studioName, setStudioName] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [serviceLocationInput, setServiceLocationInput] = useState("");
  const [serviceLocations, setServiceLocations] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [aboutStudio, setAboutStudio] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [workingModel, setWorkingModel] = useState("");

  const [saving, setSaving] = useState(false);
  const [finalSubmitting, setFinalSubmitting] = useState(false);

  const applyBundle = (bundle: { onboarding: OnboardingDraft; verification: Verification }) => {
    setOnboarding(bundle.onboarding);
    setVerification(bundle.verification);
    setPhone(bundle.onboarding.phone);
    setRoles(bundle.onboarding.roles);
    setOtherRoleDescription(bundle.onboarding.otherRoleDescription ?? "");
    setSpecCategories(bundle.onboarding.specializationCategories);
    setSpecCrafts(bundle.onboarding.specializationCrafts);
    setExperienceLevel(bundle.onboarding.experienceLevel);
    setLearningBackground(bundle.onboarding.learningBackground);
    setExperienceDescription(bundle.onboarding.experienceDescription);
    setOwnershipAccepted(bundle.onboarding.portfolioOwnershipAccepted);
    setDateOfBirth(bundle.onboarding.dateOfBirth);
    setStudioName(bundle.onboarding.studioName);
    setCity(bundle.onboarding.city);
    setArea(bundle.onboarding.area);
    setServiceLocations(bundle.onboarding.serviceLocations);
    setAddress(bundle.onboarding.address ?? "");
    setAboutStudio(bundle.onboarding.aboutStudio);
    setInstagramUrl(bundle.onboarding.instagramUrl ?? "");
    setWebsiteUrl(bundle.onboarding.websiteUrl ?? "");
    setWorkingModel(bundle.onboarding.workingModel);
  };

  // Ensure a real designer_profiles row exists (this is what auto-provisions designer_onboarding
  // + designer_verifications, Phase 1's on_designer_profile_created trigger), then load the draft.
  useEffect(() => {
    (async () => {
      try {
        const [sessionRes, profileRes] = await Promise.all([fetch("/api/auth/session"), fetch("/api/designer/profile").catch(() => null)]);
        const sessionData = await sessionRes.json();
        if (!sessionData.hasDesignerProfile) {
          await fetch("/api/profile/designer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
        }
        if (profileRes?.ok) {
          const profileData = await profileRes.json();
          setName(profileData.profile.displayName ?? "");
          if (profileData.profile.avatar) setAvatar({ fileId: "", url: profileData.profile.avatar });
        }

        const res = await fetch("/api/designer/onboarding");
        const data = await res.json();
        if (!res.ok || !data.onboarding || !data.verification) throw new Error(data.message ?? "Couldn't load onboarding.");
        applyBundle(data);
        setLoadState("ready");
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Couldn't load onboarding.");
        setLoadState("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-variant text-sm gap-2">
        <Loader2 className="animate-spin" size={18} /> Loading…
      </div>
    );
  }
  if (loadState === "error" || !onboarding || !verification) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <p className="text-headline-sm mb-2">Couldn't load onboarding</p>
        <p className="text-ink-variant text-sm">{loadError}</p>
      </div>
    );
  }

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const patchOnboarding = async (patch: Record<string, unknown>) => {
    const res = await fetch("/api/designer/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Couldn't save your changes.");
    applyBundle(data);
  };

  const persistCurrentStep = async () => {
    setSaving(true);
    try {
      if (step === 0) {
        const patch: Record<string, unknown> = {};
        if (name.trim()) patch.displayName = name.trim();
        if (avatar?.fileId) patch.avatarFileId = avatar.fileId;
        if (Object.keys(patch).length > 0) {
          await fetch("/api/designer/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        }
        if (phone.trim() !== onboarding.phone) await patchOnboarding({ phone: phone.trim() });
      } else if (step === 1) {
        await patchOnboarding({
          roles, otherRoleDescription: roles.includes("Other") ? otherRoleDescription : undefined,
          specializationCategories: specCategories, specializationCrafts: specCrafts,
        });
      } else if (step === 2) {
        await patchOnboarding({ experienceLevel, learningBackground, experienceDescription });
      } else if (step === 4) {
        await patchOnboarding({ dateOfBirth });
      } else if (step === 5) {
        await patchOnboarding({ studioName, city, area, serviceLocations, address, aboutStudio, instagramUrl, websiteUrl, workingModel });
      }
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save your changes.", "error");
    } finally {
      setSaving(false);
    }
  };

  const canContinue = (): boolean => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return roles.length > 0 && (!roles.includes("Other") || otherRoleDescription.trim().length > 0) && (specCategories.length > 0 || specCrafts.length > 0);
    if (step === 2) return experienceLevel !== "" && learningBackground !== "" && experienceDescription.trim().length >= 20;
    if (step === 3) return onboarding.portfolioItems.length >= 3 && ownershipAccepted;
    if (step === 4) return verification.identityStatus !== "not_started";
    if (step === 5) return studioName.trim().length > 0 && city.trim().length > 0 && workingModel !== "";
    return true;
  };

  const next = async () => {
    await persistCurrentStep();
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleAvatarChange = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const uploaded = await uploadImage(file, "avatars", "designer_avatar");
      setAvatar(uploaded);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't upload that photo.", "error");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAddOrEditPortfolio = async () => {
    if (!portfolioModal || (!portfolioModal.image && !portfolioModal.id) || !portfolioModal.title.trim()) return;
    setSaving(true);
    try {
      const body = { fileId: portfolioModal.image?.fileId, title: portfolioModal.title, category: portfolioModal.category, description: portfolioModal.description, year: portfolioModal.year };
      const res = portfolioModal.id
        ? await fetch(`/api/designer/onboarding/portfolio-items/${portfolioModal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/designer/onboarding/portfolio-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't save this item.");
      setOnboarding((o) =>
        o
          ? {
              ...o,
              portfolioItems: portfolioModal.id
                ? o.portfolioItems.map((p) => (p.id === portfolioModal.id ? data.item : p))
                : [...o.portfolioItems, data.item],
            }
          : o
      );
      setPortfolioModal(null);
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save this item.", "error");
    } finally {
      setSaving(false);
    }
  };

  const deletePortfolioItem = async (id: string) => {
    try {
      const res = await fetch(`/api/designer/onboarding/portfolio-items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Couldn't remove this item.");
      }
      setOnboarding((o) => (o ? { ...o, portfolioItems: o.portfolioItems.filter((p) => p.id !== id) } : o));
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't remove this item.", "error");
    }
  };

  const handleSubmitPortfolio = async () => {
    setPortfolioSubmitting(true);
    try {
      await patchOnboarding({ portfolioOwnershipAccepted: ownershipAccepted });
      const res = await fetch("/api/designer/onboarding/submit-portfolio", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't submit your portfolio.");
      push("Portfolio submitted for review.", "success");
      const bundleRes = await fetch("/api/designer/onboarding");
      applyBundle(await bundleRes.json());
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't submit your portfolio.", "error");
    } finally {
      setPortfolioSubmitting(false);
    }
  };

  const handleStartIdentity = async () => {
    setIdentitySubmitting(true);
    try {
      await patchOnboarding({ dateOfBirth });
      const res = await fetch("/api/designer/onboarding/start-identity", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Please enter your date of birth first.");
      push("Identity verification started.", "success");
      const bundleRes = await fetch("/api/designer/onboarding");
      applyBundle(await bundleRes.json());
    } catch (err) {
      push(err instanceof Error ? err.message : "Please enter your date of birth first.", "error");
    } finally {
      setIdentitySubmitting(false);
    }
  };

  const handleFinalSubmit = async () => {
    setFinalSubmitting(true);
    try {
      await persistCurrentStep();
      const res = await fetch("/api/designer/onboarding/submit-profile", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Please complete all required sections before submitting.");
      push("Submitted for verification!", "success");
      router.push("/verification-pending");
    } catch (err) {
      push(err instanceof Error ? err.message : "Please complete all required sections before submitting.", "error");
    } finally {
      setFinalSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-16 px-6">
      <div className="w-full max-w-2xl">
        <p className="font-display text-2xl text-center mb-2">HRUNA</p>
        <p className="text-center text-sm text-ink-variant mb-2">Your craft matters — you don't need a fashion degree to join HRUNA.</p>
        <p className="text-center text-xs text-outline mb-10">Show us what you create. Help customers discover your expertise.</p>
        <Stepper steps={STEPS} currentIndex={step} />

        <div className="mt-12">
          {step === 0 && (
            <div className="flex flex-col gap-6">
              <h1 className="text-headline-md mb-1">Let's get your account ready</h1>
              <div className="flex justify-center">
                <label className="relative w-28 h-28 rounded-full bg-surface-container flex items-center justify-center cursor-pointer overflow-hidden border border-outline-variant">
                  {avatarUploading ? (
                    <Loader2 className="animate-spin text-outline" size={22} />
                  ) : avatar ? (
                    <Image src={avatar.url} alt="Profile" fill className="object-cover" />
                  ) : (
                    <Camera className="text-outline" size={22} />
                  )}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handleAvatarChange(e.target.files)} />
                </label>
              </div>
              <Field label="Full name" htmlFor="name" required>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              {onboarding.emailVerified ? (
                <p className="text-sm text-emerald-700 flex items-center gap-1.5 -mt-3"><CheckCircle2 size={16} /> Email verified</p>
              ) : (
                <p className="text-xs text-error -mt-3">Your email isn&apos;t verified yet. Please click the link we sent to your inbox before submitting.</p>
              )}

              <Field label="Phone number (optional)" htmlFor="phone" hint="So the HRUNA team can reach you if needed. Never shown on your public profile.">
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 90000 00000" autoComplete="tel" />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-8">
              <div>
                <h1 className="text-headline-md mb-2">Tell us about your work</h1>
                <p className="text-ink-variant text-sm">Choose what best describes what you create. You don't need a formal fashion degree to join HRUNA.</p>
              </div>
              <div>
                <p className="text-label-md text-outline mb-3">WHAT DO YOU DO?</p>
                <MultiSelectChips options={ROLES} selected={roles} onToggle={(v) => toggle(roles, setRoles, v)} />
                {roles.includes("Other") && (
                  <div className="mt-4">
                    <Field label="Tell us what you do" htmlFor="otherRole" required>
                      <Input id="otherRole" value={otherRoleDescription} onChange={(e) => setOtherRoleDescription(e.target.value)} />
                    </Field>
                  </div>
                )}
              </div>
              <div>
                <p className="text-label-md text-outline mb-3">CATEGORY SPECIALIZATIONS</p>
                <MultiSelectChips options={SPEC_CATEGORIES} selected={specCategories} onToggle={(v) => toggle(specCategories, setSpecCategories, v)} />
              </div>
              <div>
                <p className="text-label-md text-outline mb-3">CRAFT SPECIALIZATIONS</p>
                <MultiSelectChips options={SPEC_CRAFTS} selected={specCrafts} onToggle={(v) => toggle(specCrafts, setSpecCrafts, v)} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-6">
              <h1 className="text-headline-md mb-1">Your experience</h1>
              <Field label="How long have you been working in fashion?" htmlFor="experienceLevel" required>
                <Select id="experienceLevel" value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)}>
                  <option value="" disabled>Select one</option>
                  {EXPERIENCE_LEVELS.map((l) => <option key={l}>{l}</option>)}
                </Select>
              </Field>
              <Field label="How did you learn your craft?" htmlFor="learningBackground" required hint="A degree is one path among many — none of these determine approval.">
                <Select id="learningBackground" value={learningBackground} onChange={(e) => setLearningBackground(e.target.value)}>
                  <option value="" disabled>Select one</option>
                  {LEARNING_BACKGROUNDS.map((l) => <option key={l}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Describe your work" htmlFor="experienceDescription" required hint="This can appear on your public profile.">
                <Textarea
                  id="experienceDescription"
                  value={experienceDescription}
                  onChange={(e) => e.target.value.length <= 500 && setExperienceDescription(e.target.value)}
                  placeholder="I specialize in bridal embroidery and custom lehenga work. I have been working with hand embroidery for 8 years."
                />
              </Field>
              <p className="text-xs text-outline -mt-4 text-right">{experienceDescription.length}/500</p>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-headline-md mb-2">Show us your work</h1>
                <p className="text-ink-variant text-sm">Your portfolio helps customers understand your craft and helps HRUNA verify your professional profile. Add at least 3 examples.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {onboarding.portfolioItems.map((item) => (
                  <div key={item.id} className="border border-outline-variant rounded-md overflow-hidden">
                    <div className="relative h-36">{item.image && <Image src={item.image} alt={item.title} fill sizes="33vw" className="object-cover" />}</div>
                    <div className="p-3">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-outline">{item.category}{item.year ? ` · ${item.year}` : ""}</p>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => setPortfolioModal({ id: item.id, image: null, title: item.title, category: item.category, description: item.description, year: item.year ?? "" })} className="text-xs text-primary flex items-center gap-1"><Pencil size={11} />Edit</button>
                        <button onClick={() => deletePortfolioItem(item.id)} className="text-xs text-error flex items-center gap-1"><Trash2 size={11} />Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setPortfolioModal({ id: null, image: null, title: "", category: "", description: "", year: "" })}
                  className="border-2 border-dashed border-outline-variant rounded-md flex flex-col items-center justify-center gap-1 text-outline hover:border-primary hover:text-primary transition-colors min-h-[140px]"
                >
                  <Plus size={20} /> <span className="text-xs">Add portfolio item</span>
                </button>
              </div>
              <p className="text-xs text-outline">{onboarding.portfolioItems.length}/3 minimum required</p>

              <label className="flex items-start gap-2 text-sm text-ink-variant p-4 rounded-md bg-surface-low">
                <input type="checkbox" checked={ownershipAccepted} onChange={(e) => setOwnershipAccepted(e.target.checked)} className="mt-1" />
                I confirm that the work submitted in this portfolio is my own work or work completed by my studio/team, and that I have the right to represent it on HRUNA.
              </label>

              <div>
                {verification.portfolioStatus === "not_submitted" && (
                  <Button onClick={handleSubmitPortfolio} disabled={onboarding.portfolioItems.length < 3 || !ownershipAccepted || portfolioSubmitting}>
                    {portfolioSubmitting ? "Submitting…" : "Submit Portfolio for Review"}
                  </Button>
                )}
                {verification.portfolioStatus === "submitted" && (
                  <p className="text-sm text-amber-700 bg-amber-50 rounded px-4 py-3 flex items-center gap-2"><Hourglass size={16} /> Portfolio submitted — currently under review.</p>
                )}
                {verification.portfolioStatus === "under_review" && (
                  <p className="text-sm text-amber-700 bg-amber-50 rounded px-4 py-3 flex items-center gap-2"><Hourglass size={16} /> Your portfolio is currently under review.</p>
                )}
                {verification.portfolioStatus === "approved" && (
                  <p className="text-sm text-emerald-700 bg-emerald-50 rounded px-4 py-3 flex items-center gap-2"><CheckCircle2 size={16} /> Portfolio approved.</p>
                )}
                {verification.portfolioStatus === "revision_required" && (
                  <div className="p-4 rounded-md bg-amber-50 border border-amber-200">
                    <p className="text-sm font-medium text-amber-800 mb-1">Revision Required</p>
                    <p className="text-sm text-amber-800 mb-3">{verification.portfolioReviewNote}</p>
                    <Button size="sm" onClick={handleSubmitPortfolio} disabled={portfolioSubmitting}>Update Portfolio</Button>
                  </div>
                )}
                {verification.portfolioStatus === "rejected" && (
                  <div className="p-4 rounded-md bg-error-container">
                    <p className="text-sm font-medium text-error mb-1">Portfolio Rejected</p>
                    <p className="text-sm text-error">{verification.portfolioReviewNote}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-3 p-4 rounded-md bg-primary-container/40">
                <ShieldCheck className="text-primary shrink-0" size={22} />
                <p className="text-sm text-ink-variant">HRUNA verifies who you are — this is separate from your professional work and never asks for a fashion degree.</p>
              </div>
              <h1 className="text-headline-md mb-1">Identity verification</h1>
              <Field label="Date of birth" htmlFor="dob" required hint="Used only to confirm you meet the minimum age requirement — never shown publicly.">
                <Input id="dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} disabled={verification.identityStatus !== "not_started"} />
              </Field>

              {verification.identityStatus === "not_started" && (
                <Button onClick={handleStartIdentity} className="w-fit" disabled={identitySubmitting}>{identitySubmitting ? "Starting…" : "Start Identity Verification"}</Button>
              )}
              {verification.identityStatus === "pending" && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded px-4 py-3 flex items-center gap-2"><Hourglass size={16} /> Identity verification is pending.</p>
              )}
              {verification.identityStatus === "verified" && (
                <p className="text-sm text-emerald-700 bg-emerald-50 rounded px-4 py-3 flex items-center gap-2"><CheckCircle2 size={16} /> Identity Verified</p>
              )}
              {verification.identityStatus === "failed" && (
                <div className="p-4 rounded-md bg-error-container">
                  <p className="text-sm font-medium text-error mb-1">Identity verification failed</p>
                  <p className="text-sm text-error">{verification.identityFailureReason}</p>
                </div>
              )}
              {verification.identityStatus === "requires_action" && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded px-4 py-3 flex items-center gap-2"><XCircle size={16} /> Additional action required — we'll be in touch.</p>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-6">
              <h1 className="text-headline-md mb-1">Your studio / work information</h1>
              <p className="text-sm text-ink-variant -mt-4">A local tailor working from home is just as welcome as a boutique — no physical shop required.</p>
              <Field label="Studio / boutique name" htmlFor="studioName" required><Input id="studioName" value={studioName} onChange={(e) => setStudioName(e.target.value)} /></Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field label="City" htmlFor="city" required><Input id="city" value={city} onChange={(e) => setCity(e.target.value)} /></Field>
                <Field label="Area / locality" htmlFor="area"><Input id="area" value={area} onChange={(e) => setArea(e.target.value)} /></Field>
              </div>
              <Field label="Service area" htmlFor="serviceLocations" hint="Add the localities you serve, e.g. Gachibowli, Madhapur.">
                <div className="flex gap-2 mb-2">
                  <Input id="serviceLocations" value={serviceLocationInput} onChange={(e) => setServiceLocationInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && serviceLocationInput.trim()) { e.preventDefault(); setServiceLocations((p) => [...p, serviceLocationInput.trim()]); setServiceLocationInput(""); } }} />
                  <Button type="button" variant="secondary" onClick={() => { if (serviceLocationInput.trim()) { setServiceLocations((p) => [...p, serviceLocationInput.trim()]); setServiceLocationInput(""); } }}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {serviceLocations.map((loc, i) => (
                    <Badge key={i} tone="neutral">{loc} <button onClick={() => setServiceLocations((p) => p.filter((_, idx) => idx !== i))} className="ml-1">×</button></Badge>
                  ))}
                </div>
              </Field>
              <Field label="Address (optional)" htmlFor="address" hint="Only published publicly if you choose to.">
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
              <Field label="About your studio" htmlFor="aboutStudio"><Textarea id="aboutStudio" value={aboutStudio} onChange={(e) => setAboutStudio(e.target.value)} /></Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field label="Instagram (optional)" htmlFor="instagram"><Input id="instagram" value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} /></Field>
                <Field label="Website (optional)" htmlFor="website"><Input id="website" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} /></Field>
              </div>
              <Field label="Working model" htmlFor="workingModel" required>
                <Select id="workingModel" value={workingModel} onChange={(e) => setWorkingModel(e.target.value)}>
                  <option value="" disabled>Select one</option>
                  {WORKING_MODELS.map((w) => <option key={w}>{w}</option>)}
                </Select>
              </Field>
            </div>
          )}

          {step === 6 && (
            <div className="flex flex-col gap-8">
              <h1 className="text-headline-md mb-1">Review before you submit</h1>

              <ReviewSection title="ACCOUNT" onEdit={() => setStep(0)}>
                <ReviewRow label="Name" value={name} />
                <ReviewRow label="Email" value={onboarding.emailVerified ? "Verified ✓" : "Not verified"} />
                <ReviewRow label="Phone" value={phone.trim() || "—"} />
              </ReviewSection>

              <ReviewSection title="PROFESSIONAL" onEdit={() => setStep(1)}>
                <ReviewRow label="Roles" value={roles.join(", ") || "—"} />
                <ReviewRow label="Specializations" value={[...specCategories, ...specCrafts].join(", ") || "—"} />
                <ReviewRow label="Experience" value={`${experienceLevel} · learned via ${learningBackground}`} />
              </ReviewSection>

              <ReviewSection title="PORTFOLIO" onEdit={() => setStep(3)}>
                <ReviewRow label="Items submitted" value={String(onboarding.portfolioItems.length)} />
                <div className="flex gap-2 mt-2">
                  {onboarding.portfolioItems.slice(0, 4).map((p) => (
                    <div key={p.id} className="relative w-14 h-14 rounded-sm overflow-hidden">{p.image && <Image src={p.image} alt={p.title} fill sizes="56px" className="object-cover" />}</div>
                  ))}
                </div>
              </ReviewSection>

              <ReviewSection title="IDENTITY" onEdit={() => setStep(4)}>
                <ReviewRow label="Status" value={verification.identityStatus.replace(/_/g, " ")} />
              </ReviewSection>

              <ReviewSection title="STUDIO" onEdit={() => setStep(5)}>
                <ReviewRow label="Studio name" value={studioName || "—"} />
                <ReviewRow label="Location" value={[area, city].filter(Boolean).join(", ") || "—"} />
                <ReviewRow label="Service area" value={serviceLocations.join(", ") || "—"} />
              </ReviewSection>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-12">
          {step > 0 ? <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button> : <span />}
          {step === STEPS.length - 1 ? (
            <Button onClick={handleFinalSubmit} disabled={finalSubmitting}>{finalSubmitting ? "Submitting…" : "Submit for Verification"}</Button>
          ) : (
            <Button onClick={next} disabled={!canContinue() || saving}>{saving ? "Saving…" : "Continue"}</Button>
          )}
        </div>
      </div>

      <Modal open={!!portfolioModal} onClose={() => setPortfolioModal(null)} title={portfolioModal?.id ? "Edit portfolio item" : "Add portfolio item"}>
        {portfolioModal && (
          <div className="flex flex-col gap-5">
            <Field label="Image" htmlFor="pfImage" required={!portfolioModal.id}>
              <UploadingImageGrid
                images={portfolioModal.image ? [portfolioModal.image] : []}
                onChange={(imgs) => setPortfolioModal((m) => m && { ...m, image: imgs[0] ?? null })}
                bucket="verificationDocuments"
                entityType="portfolio_item"
                max={1}
              />
            </Field>
            <Field label="Title" htmlFor="pfTitle" required><Input id="pfTitle" value={portfolioModal.title} onChange={(e) => setPortfolioModal((m) => m && { ...m, title: e.target.value })} placeholder="Red Bridal Lehenga" /></Field>
            <Field label="Category" htmlFor="pfCategory"><Input id="pfCategory" value={portfolioModal.category} onChange={(e) => setPortfolioModal((m) => m && { ...m, category: e.target.value })} placeholder="Bridal Wear" /></Field>
            <Field label="Description" htmlFor="pfDesc"><Textarea id="pfDesc" value={portfolioModal.description} onChange={(e) => setPortfolioModal((m) => m && { ...m, description: e.target.value })} placeholder="Hand embroidered zardozi work" /></Field>
            <Field label="Year (optional)" htmlFor="pfYear"><Input id="pfYear" value={portfolioModal.year} onChange={(e) => setPortfolioModal((m) => m && { ...m, year: e.target.value })} /></Field>
            <Button onClick={handleAddOrEditPortfolio} className="w-full" disabled={saving}>{saving ? "Saving…" : "Save Portfolio Item"}</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="border border-outline-variant rounded-md p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-label-md text-outline">{title}</p>
        <button onClick={onEdit} className="text-xs text-primary hover:underline">Edit</button>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm gap-4">
      <span className="text-outline shrink-0">{label}</span>
      <span className="text-ink text-right">{value}</span>
    </div>
  );
}
