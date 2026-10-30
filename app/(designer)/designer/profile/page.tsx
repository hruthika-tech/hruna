"use client";

import { useEffect, useState } from "react";
import { BlockedUsersPanel } from "@/components/profile/BlockedUsersPanel";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  Award,
  Loader2,
  ChevronRight,
  ShieldQuestion,
  FileText,
  Users,
  ShieldAlert,
  Copyright,
  Handshake,
  Star,
  Flag,
  UserX,
} from "lucide-react";
import { Avatar } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Field, Input } from "@/components/ui/Input";
import { Button, LinkButton } from "@/components/ui/Button";
import { UploadingProfilePhotoSection } from "@/components/profile/UploadingProfilePhotoSection";
import { useToast } from "@/hooks/use-toast";

const TABS = [
  { label: "Personal Details", value: "personal" },
  { label: "Verification", value: "verification" },
  { label: "Security", value: "security" },
  { label: "Notifications", value: "notifications" },
  { label: "Blocked users", value: "blocked" },
];

// Same 9 canonical policy routes the customer Settings page links to (app/(app)/profile/page.tsx)
// — one canonical page per policy, never duplicated per role. Designers don't see customer-only
// items (Favourites, etc.) here, per scope — only Legal & Policies.
const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy", icon: ShieldQuestion },
  { href: "/terms", label: "Terms of Use", icon: FileText },
  { href: "/community-guidelines", label: "Community Guidelines", icon: Users },
  { href: "/acceptable-use", label: "Acceptable Use", icon: ShieldAlert },
  { href: "/content-policy", label: "Content & Intellectual Property", icon: Copyright },
  { href: "/collaboration-policy", label: "Designer–Customer Collaboration", icon: Handshake },
  { href: "/reviews-policy", label: "Reviews & Ratings", icon: Star },
  { href: "/reporting-and-disputes", label: "Reporting & Disputes", icon: Flag },
  { href: "/account-policy", label: "Account Suspension & Termination", icon: UserX },
];

interface Verification {
  identityStatus: string;
  portfolioStatus: string;
  overallStatus: string;
}

export default function DesignerProfilePage() {
  const router = useRouter();
  const { push } = useToast();
  const [tab, setTab] = useState("personal");
  // Settings → Blocked users can be linked to directly (?tab=blocked), e.g. from a blocked conversation.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "blocked") setTab("blocked");
  }, []);

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ displayName: string; avatar: string } | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [isTrustedProfessional, setIsTrustedProfessional] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [notifPrefs, setNotifPrefs] = useState({ requests: true, messages: true, projectUpdates: true, reviews: true });

  useEffect(() => {
    (async () => {
      try {
        const [sessionRes, profileRes, verificationRes] = await Promise.all([
          fetch("/api/auth/session"),
          fetch("/api/designer/profile"),
          fetch("/api/designer/verification"),
        ]);
        const sessionData = await sessionRes.json();
        const profileData = await profileRes.json();
        if (!profileRes.ok) throw new Error(profileData.message ?? "Couldn't load your profile.");
        const verificationData = await verificationRes.json();

        setEmail(sessionData.email ?? "");
        setPendingEmail(sessionData.pendingEmail ?? null);
        setProfile(profileData.profile);
        setName(profileData.profile.displayName);
        if (verificationRes.ok) {
          setVerification(verificationData.verification);
          setIsTrustedProfessional(verificationData.isTrustedProfessional);
          setCompletedCount(verificationData.completedProjectCount);
        }
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your profile.");
        setStatus("error");
      }
    })();
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/designer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't save your changes.");
      setProfile(data.profile);
      push("Profile updated.", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save your changes.", "error");
    } finally {
      setSaving(false);
    }
  };

  const savePhoto = async (result: { fileId: string; url: string }) => {
    try {
      const res = await fetch("/api/designer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarFileId: result.fileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't update your photo.");
      setProfile(data.profile);
      push("Profile photo updated.");
      // The top-right nav avatar comes from app/(designer)/layout.tsx — a Server Component that
      // resolves the avatar once and stays mounted across client-side navigation within this
      // route group, so it never sees this PATCH on its own. router.refresh() re-runs Server
      // Components (layout included) without a full reload — same fix as the customer profile page.
      router.refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't update your photo.", "error");
    }
  };

  const removePhoto = async () => {
    try {
      const res = await fetch("/api/designer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarFileId: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't remove your photo.");
      setProfile(data.profile);
      push("Profile photo removed.", "info");
      // Same reasoning as savePhoto() above — sync the nav back to the default avatar.
      router.refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't remove your photo.", "error");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    push("You've been logged out.", "info");
    router.push("/login");
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
        <Loader2 className="animate-spin" size={18} /> Loading your profile…
      </div>
    );
  }

  if (status === "error" || !profile) {
    return (
      <div className="text-center py-24">
        <p className="text-headline-sm mb-2">Couldn't load your profile</p>
        <p className="text-ink-variant text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <div className="flex flex-wrap items-center gap-4 mb-10">
        <Avatar src={profile.avatar} alt={profile.displayName} size={64} verified={verification?.overallStatus === "approved"} />
        <div className="flex-1 min-w-0">
          <h1 className="text-headline-md break-words">{profile.displayName || "Your name"}</h1>
          <p className="text-ink-variant text-sm break-all">{email}</p>
          <Link href="/designer-subscription" className="text-sm text-primary hover:underline" data-testid="profile-plan-link">
            Plan &amp; billing →
          </Link>
        </div>
        {completedCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary-container text-primary-on-container text-sm">
            <CheckCircle2 size={16} />
            <span>{completedCount} Completed on HRUNA</span>
          </div>
        )}
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="mt-8 max-w-lg">
        {tab === "personal" && (
          <div className="flex flex-col gap-5">
            <UploadingProfilePhotoSection photoUrl={profile.avatar} name={profile.displayName || "Designer"} onSave={savePhoto} onRemove={profile.avatar ? removePhoto : undefined} entityType="designer_avatar" />
            <Field label="Full name" htmlFor="name"><Input id="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <div>
              <Field label="Email" htmlFor="email"><Input id="email" value={email} disabled /></Field>
              {pendingEmail && <p className="text-sm text-ink-variant mt-2">Waiting for confirmation: {pendingEmail}</p>}
              <Link href="/account/email" className="text-sm text-primary hover:underline mt-2 inline-block">Change email →</Link>
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              <Button onClick={saveProfile} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
              <LinkButton href="/designer/studio/manage" variant="secondary">Manage Studio</LinkButton>
              <LinkButton href="/designer-subscription" variant="secondary">Manage Subscription</LinkButton>
            </div>
          </div>
        )}

        {tab === "verification" && verification && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-variant mb-1">
              HRUNA uses separate badges for separate facts — each one means something specific.
            </p>

            <VerificationRow
              icon={ShieldCheck}
              title="Identity Verified"
              description="HRUNA has verified this person's identity."
              status={verification.identityStatus}
              positive={verification.identityStatus === "verified"}
              pending={verification.identityStatus === "pending"}
            />
            <VerificationRow
              icon={CheckCircle2}
              title="Portfolio Reviewed"
              description="HRUNA has reviewed this designer's submitted portfolio."
              status={verification.portfolioStatus}
              positive={verification.portfolioStatus === "approved"}
              pending={verification.portfolioStatus === "submitted" || verification.portfolioStatus === "under_review"}
            />
            <VerificationRow
              icon={Award}
              title="Trusted Professional"
              description="Earned over time through completed projects and ratings — never awarded at registration."
              status={isTrustedProfessional ? "earned" : "not yet earned"}
              positive={isTrustedProfessional}
              pending={false}
            />

            <p className="text-xs text-outline mt-2">
              Only HRUNA administrators can review and approve verification submissions — this can't be changed from your account.
            </p>
          </div>
        )}

        {tab === "security" && (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3 p-4 rounded-md bg-surface-low border border-outline-variant">
              <ShieldCheck size={18} className="text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-ink-variant">
                You sign in to HRUNA with your email address and password. Emailed links are only used to confirm your
                email and to reset a forgotten password — use &ldquo;Forgot password?&rdquo; on the sign-in page to set a new one.
              </p>
            </div>
            <Button variant="danger" className="w-fit mt-4" onClick={handleLogout}>
              Log Out
            </Button>
          </div>
        )}

        {tab === "blocked" && <BlockedUsersPanel />}
        {tab === "notifications" && (
          <div className="flex flex-col gap-4">
            {Object.entries(notifPrefs).map(([key, value]) => (
              <label key={key} className="flex items-center justify-between py-3 border-b border-outline-variant">
                <span className="capitalize text-sm">{key}</span>
                <input type="checkbox" checked={value} onChange={(e) => setNotifPrefs((p) => ({ ...p, [key]: e.target.checked }))} />
              </label>
            ))}
            <p className="text-xs text-outline mt-2">Notification preferences aren't saved yet — this is still a preview.</p>
          </div>
        )}
      </div>

      <div className="mt-12 max-w-lg">
        <p className="text-label-md text-outline mb-3">LEGAL &amp; POLICIES</p>
        <div className="rounded-md border border-outline-variant divide-y divide-outline-variant overflow-hidden">
          {LEGAL_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-4 py-3.5 text-sm text-ink hover:bg-surface-low transition-colors"
            >
              <Icon size={16} className="text-ink-variant" />
              <span className="flex-1">{label}</span>
              <ChevronRight size={16} className="text-outline" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function VerificationRow({
  icon: Icon,
  title,
  description,
  status,
  positive,
  pending,
}: {
  icon: any;
  title: string;
  description: string;
  status: string;
  positive: boolean;
  pending: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-md bg-surface-low">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${positive ? "bg-emerald-100 text-emerald-700" : pending ? "bg-amber-100 text-amber-700" : "bg-surface-container text-outline"}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{title}</p>
          <span className={`text-xs px-2.5 py-0.5 rounded-full capitalize ${positive ? "bg-emerald-100 text-emerald-700" : pending ? "bg-amber-100 text-amber-700" : "bg-surface-container text-outline"}`}>
            {status.replace(/_/g, " ")}
          </span>
        </div>
        <p className="text-xs text-ink-variant mt-1">{description}</p>
      </div>
    </div>
  );
}
