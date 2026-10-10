import type {
  Customer,
  Designer,
  Collection,
  Dress,
  PreviousCreation,
  FashionRequest,
  Proposal,
  Project,
  ProgressUpdate,
  ProjectStage,
  Conversation,
  Message,
  DesignerRequestInteraction,
  DesignerVerification,
  DesignerOnboardingProfile,
  PortfolioItem,
  AdminReviewLogEntry,
  IdentityStatus,
  CustomerSavedItem,
  SavedItemType,
  DiaryEntry,
  SubscriptionPlan,
  UserSubscription,
  PaymentRecord,
  PaymentSettings,
  SubscriberRole,
  Dispute,
  DisputeStatus,
  AdminNotification,
  NotificationAudience,
} from "@/types";
import {
  seedCustomers,
  seedDesigners,
  seedCollections,
  seedDresses,
  seedPreviousCreations,
  seedRequests,
  seedProposals,
  seedProjects,
  seedConversations,
  seedDesignerVerifications,
  seedDesignerOnboarding,
  seedSubscriptionPlans,
  seedPaymentSettings,
  seedUserSubscriptions,
  seedPayments,
  seedDisputes,
  seedAdminNotifications,
  seedDiaryEntries,
} from "./seed-data";

export const DEFAULT_PROJECT_STAGES: ProjectStage[] = [
  "Request Accepted",
  "Design Confirmed",
  "Fabric Selected",
  "Cutting",
  "Stitching",
  "Fitting",
  "Final Alterations",
  "Completed",
];

interface AppState {
  customers: Customer[];
  designers: Designer[];
  collections: Collection[];
  dresses: Dress[];
  previousCreations: PreviousCreation[];
  requests: FashionRequest[];
  proposals: Proposal[];
  projects: Project[];
  conversations: Conversation[];
  interactions: DesignerRequestInteraction[];
  designerVerifications: DesignerVerification[];
  designerOnboarding: DesignerOnboardingProfile[];
  adminReviewLog: AdminReviewLogEntry[];
  customerSavedItems: CustomerSavedItem[];
  diaryEntries: DiaryEntry[];
  subscriptionPlans: SubscriptionPlan[];
  userSubscriptions: UserSubscription[];
  payments: PaymentRecord[];
  paymentSettings: PaymentSettings;
  disputes: Dispute[];
  adminNotifications: AdminNotification[];
}

let state: AppState = {
  customers: seedCustomers.map((c) => ({ ...c })),
  designers: seedDesigners.map((d) => ({ ...d })),
  collections: seedCollections.map((c) => ({ ...c })),
  dresses: seedDresses.map((d) => ({ ...d })),
  previousCreations: seedPreviousCreations.map((c) => ({ ...c })),
  requests: seedRequests.map((r) => ({ ...r })),
  proposals: seedProposals.map((p) => ({ ...p })),
  projects: seedProjects.map((p) => ({ ...p, updates: [...p.updates] })),
  conversations: seedConversations.map((c) => ({ ...c, messages: [...c.messages] })),
  interactions: [],
  designerVerifications: seedDesignerVerifications.map((v) => ({ ...v })),
  designerOnboarding: seedDesignerOnboarding.map((o) => ({ ...o, portfolioItems: [...o.portfolioItems], credentials: [...o.credentials] })),
  adminReviewLog: [],
  customerSavedItems: [],
  diaryEntries: seedDiaryEntries.map((e) => ({ ...e, images: [...e.images] })),
  subscriptionPlans: seedSubscriptionPlans.map((p) => ({ ...p, features: [...p.features] })),
  userSubscriptions: seedUserSubscriptions.map((s) => ({ ...s })),
  payments: seedPayments.map((p) => ({ ...p })),
  paymentSettings: { ...seedPaymentSettings },
  disputes: seedDisputes.map((d) => ({ ...d, notes: [...d.notes] })),
  adminNotifications: seedAdminNotifications.map((n) => ({ ...n })),
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function set(updater: (s: AppState) => AppState) {
  state = updater(state);
  emit();
}

// Exposed so the client-only hooks module (lib/store-hooks.ts) can subscribe
// to changes without this file importing React — that import is what makes a
// module unsafe to reach from a Server Component.
export function subscribeToStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getStoreSnapshot() {
  return state;
}

/* ------------------------------------------------------------------ */
/* Plain snapshot getters — safe to call from Server Components too.  */
/* Same names as the old mock-data helpers so most pages need only an */
/* import-path change. Reactive hooks for live-updating pages live in */
/* lib/store-hooks.ts (a separate, client-only module).               */
/* ------------------------------------------------------------------ */

export const getCustomers = () => state.customers;
export const getCustomerById = (id: string) => state.customers.find((c) => c.id === id);
export const getDesigners = () => state.designers;
export const getDesignerById = (id: string) => state.designers.find((d) => d.id === id);
export const getCollections = () => state.collections;
export const getCollectionsByDesigner = (designerId: string) => state.collections.filter((c) => c.designerId === designerId);
export const getCollectionById = (id: string) => state.collections.find((c) => c.id === id);
export const getDresses = () => state.dresses;
export const getDressesByDesigner = (designerId: string) => state.dresses.filter((d) => d.designerId === designerId);
export const getDressById = (id: string) => state.dresses.find((d) => d.id === id);
export const getPreviousCreationsByDesigner = (designerId: string) => state.previousCreations.filter((c) => c.designerId === designerId);
export const getRequestById = (id: string) => state.requests.find((r) => r.id === id);
export const getProposalsForRequest = (requestId: string) => state.proposals.filter((p) => p.requestId === requestId);
export const getProposalById = (id: string) => state.proposals.find((p) => p.id === id);
export const getProjectById = (id: string) => state.projects.find((p) => p.id === id);
export const getProjectsByDesigner = (designerId: string) => state.projects.filter((p) => p.designerId === designerId);
export const getProjectsByCustomer = (customerId: string) => state.projects.filter((p) => p.customerId === customerId);
export const getConversationBetween = (customerId: string, designerId: string) =>
  state.conversations.find((c) => c.customerId === customerId && c.designerId === designerId);

// A request belongs in a designer's inbox/feed if it wasn't addressed to
// someone else specifically.
export const incomingRequestsForDesigner = (designerId: string) =>
  state.requests.filter((r) => !r.preferredDesignerId || r.preferredDesignerId === designerId);

/* ------------------------------------------------------------------ */
/* Actions — every mutation in the app goes through one of these, so  */
/* there is exactly one place that creates/updates each entity.       */
/* ------------------------------------------------------------------ */

// ---- Fashion requests ----

export function addRequest(input: Omit<FashionRequest, "id" | "status" | "createdAt">): FashionRequest {
  const request: FashionRequest = {
    ...input,
    id: `req-${Date.now()}`,
    status: "submitted",
    createdAt: new Date().toISOString(),
  };
  set((s) => ({ ...s, requests: [request, ...s.requests] }));
  return request;
}

export function markRequestReviewed(requestId: string) {
  set((s) => ({
    ...s,
    requests: s.requests.map((r) => (r.id === requestId && r.status === "submitted" ? { ...r, status: "reviewed" } : r)),
  }));
}

export function declineRequest(requestId: string) {
  set((s) => ({ ...s, requests: s.requests.map((r) => (r.id === requestId ? { ...r, status: "declined" } : r)) }));
}

// ---- Per-designer request interactions (public Feed swipe / save) ----
//
// A public request (no preferredDesignerId) can be seen and swiped by many
// designers, so "interested" / "declined" / "saved" can't live on the shared
// FashionRequest — each designer gets their own interaction record instead.

export const getInteraction = (designerId: string, requestId: string) =>
  state.interactions.find((i) => i.designerId === designerId && i.requestId === requestId);

export const getInteractionsForDesigner = (designerId: string) => state.interactions.filter((i) => i.designerId === designerId);

function upsertInteraction(designerId: string, requestId: string, patch: Partial<Omit<DesignerRequestInteraction, "designerId" | "requestId">>) {
  set((s) => {
    const existing = s.interactions.find((i) => i.designerId === designerId && i.requestId === requestId);
    if (existing) {
      return { ...s, interactions: s.interactions.map((i) => (i === existing ? { ...i, ...patch } : i)) };
    }
    return { ...s, interactions: [...s.interactions, { designerId, requestId, saved: false, ...patch }] };
  });
}

export function setSwipeStatus(designerId: string, requestId: string, swipeStatus: "interested" | "declined") {
  upsertInteraction(designerId, requestId, { swipeStatus });
}

export function setSaved(designerId: string, requestId: string, saved: boolean) {
  upsertInteraction(designerId, requestId, { saved });
}

export function toggleSaved(designerId: string, requestId: string) {
  const current = getInteraction(designerId, requestId);
  setSaved(designerId, requestId, !current?.saved);
}

// ---- Proposals ----

export function addProposal(input: Omit<Proposal, "id" | "createdAt" | "status">): Proposal {
  const proposal: Proposal = { ...input, id: `prop-${Date.now()}`, createdAt: new Date().toISOString(), status: "pending" };
  set((s) => ({
    ...s,
    proposals: [...s.proposals, proposal],
    requests: s.requests.map((r) => (r.id === input.requestId ? { ...r, status: "proposal_received" } : r)),
  }));
  return proposal;
}

export function declineProposal(proposalId: string) {
  set((s) => ({ ...s, proposals: s.proposals.map((p) => (p.id === proposalId ? { ...p, status: "declined" } : p)) }));
}

// Accepting a proposal creates a Project sourced directly from the request +
// proposal that already exist — never a second, hand-typed copy of the data.
export function acceptProposal(proposalId: string): Project | null {
  const proposal = state.proposals.find((p) => p.id === proposalId);
  if (!proposal) return null;
  const request = state.requests.find((r) => r.id === proposal.requestId);
  if (!request) return null;

  const initialStage = DEFAULT_PROJECT_STAGES[0];
  const project: Project = {
    id: `proj-${Date.now()}`,
    requestId: request.id,
    customerId: request.customerId,
    designerId: proposal.designerId,
    title: request.title,
    category: request.category,
    occasion: request.occasion,
    gender: request.gender,
    referenceImages: request.inspirationImages,
    description: request.description,
    fabricPreference: request.fabricPreference,
    measurements: request.measurements,
    additionalPreferences: request.additionalPreferences,
    budgetMin: request.budgetMin,
    budgetMax: request.budgetMax,
    location: request.location,
    confirmedPrice: proposal.price,
    stage: initialStage,
    stages: [...DEFAULT_PROJECT_STAGES],
    dueDate: request.dueDate,
    progressPercent: Math.round((1 / DEFAULT_PROJECT_STAGES.length) * 100),
    updates: [
      {
        id: `upd-${Date.now()}`,
        stage: initialStage,
        note: "Proposal accepted — your project has officially begun!",
        images: [],
        date: new Date().toISOString(),
      },
    ],
    status: "active",
  };

  set((s) => ({
    ...s,
    proposals: s.proposals.map((p) => (p.id === proposalId ? { ...p, status: "accepted" } : p)),
    requests: s.requests.map((r) => (r.id === request.id ? { ...r, status: "accepted" } : r)),
    projects: [...s.projects, project],
  }));

  return project;
}

// ---- Projects ----

export function addProjectUpdate(projectId: string, update: { stage: ProjectStage; note: string; images: string[] }) {
  set((s) => ({
    ...s,
    projects: s.projects.map((p) => {
      if (p.id !== projectId) return p;
      const newUpdate: ProgressUpdate = { id: `upd-${Date.now()}`, ...update, date: new Date().toISOString() };
      const stageIndex = p.stages.indexOf(update.stage);
      const progressPercent = stageIndex >= 0 ? Math.round(((stageIndex + 1) / p.stages.length) * 100) : p.progressPercent;
      return {
        ...p,
        updates: [...p.updates, newUpdate],
        stage: update.stage,
        progressPercent,
        status: update.stage === "Completed" ? "awaiting_confirmation" : p.status,
      };
    }),
  }));
}

export function editProjectUpdate(projectId: string, updateId: string, patch: Partial<Pick<ProgressUpdate, "stage" | "note" | "images">>) {
  set((s) => ({
    ...s,
    projects: s.projects.map((p) =>
      p.id !== projectId ? p : { ...p, updates: p.updates.map((u) => (u.id === updateId ? { ...u, ...patch } : u)) }
    ),
  }));
}

export function deleteProjectUpdate(projectId: string, updateId: string) {
  set((s) => ({
    ...s,
    projects: s.projects.map((p) => (p.id !== projectId ? p : { ...p, updates: p.updates.filter((u) => u.id !== updateId) })),
  }));
}

export function setProjectStage(projectId: string, stage: ProjectStage) {
  set((s) => ({
    ...s,
    projects: s.projects.map((p) => {
      if (p.id !== projectId) return p;
      const stageIndex = p.stages.indexOf(stage);
      const progressPercent = stageIndex >= 0 ? Math.round(((stageIndex + 1) / p.stages.length) * 100) : p.progressPercent;
      return { ...p, stage, progressPercent, status: stage === "Completed" ? "awaiting_confirmation" : p.status };
    }),
  }));
}

// ---- Two-sided project completion ----
//
// A designer can never unilaterally complete a project. Marking it done only
// moves it to "awaiting_confirmation" — only the customer's confirmation can
// set it to "completed", which is what unlocks the designer's completion
// count/badge.

export function markProjectCompleted(projectId: string) {
  set((s) => ({
    ...s,
    projects: s.projects.map((p) =>
      p.id === projectId ? { ...p, stage: "Completed" as ProjectStage, progressPercent: 100, status: "awaiting_confirmation" } : p
    ),
  }));
}

export function confirmProjectCompletion(projectId: string) {
  set((s) => ({
    ...s,
    projects: s.projects.map((p) => (p.id === projectId ? { ...p, status: "completed", completedAt: new Date().toISOString() } : p)),
  }));
}

export function requestProjectChanges(projectId: string) {
  set((s) => ({
    ...s,
    projects: s.projects.map((p) => {
      if (p.id !== projectId) return p;
      const revertStage = (p.stages.includes("Final Alterations" as ProjectStage) ? "Final Alterations" : p.stage) as ProjectStage;
      const stageIndex = p.stages.indexOf(revertStage);
      const progressPercent = stageIndex >= 0 ? Math.round(((stageIndex + 1) / p.stages.length) * 100) : p.progressPercent;
      return { ...p, stage: revertStage, progressPercent, status: "active", changesRequestedAt: new Date().toISOString() };
    }),
  }));
}

export function getCompletedProjectCountForDesigner(designerId: string) {
  return state.projects.filter((p) => p.designerId === designerId && p.status === "completed").length;
}

// ---- Conversations / messages ----

export function sendMessage(conversationId: string, senderId: string, text: string) {
  set((s) => ({
    ...s,
    conversations: s.conversations.map((c) => {
      if (c.id !== conversationId) return c;
      const message: Message = { id: `m-${Date.now()}`, senderId, text, timestamp: new Date().toISOString() };
      return { ...c, messages: [...c.messages, message], lastMessage: text, lastTimestamp: message.timestamp, unread: 0 };
    }),
  }));
}

export function getOrCreateConversation(customerId: string, designerId: string): Conversation {
  const existing = state.conversations.find((c) => c.customerId === customerId && c.designerId === designerId);
  if (existing) return existing;
  const conversation: Conversation = {
    id: `conv-${Date.now()}`,
    customerId,
    designerId,
    lastMessage: "",
    lastTimestamp: new Date().toISOString(),
    unread: 0,
    messages: [],
  };
  set((s) => ({ ...s, conversations: [...s.conversations, conversation] }));
  return conversation;
}

// ---- Customer profile (self-service editable fields, e.g. from Settings) ----
//
// A customer can only ever patch their OWN record — every call site in the
// UI is hardcoded to currentCustomer.id from lib/mock-data.ts (there's no
// multi-account switching in this prototype), so there is no path by which
// one customer's Settings page could edit another customer's profile photo.

export function updateCustomerInfo(customerId: string, patch: Partial<Pick<Customer, "name" | "email" | "phone" | "city" | "avatar">>) {
  set((s) => ({ ...s, customers: s.customers.map((c) => (c.id === customerId ? { ...c, ...patch } : c)) }));
}

// ---- Admin: customer account status. Same suspend/reactivate shape as the
// designer verification actions below, kept separate because a customer's
// account status is a simple on/off — customers don't go through the
// three-track verification workflow designers do. ----

export function adminSuspendCustomer(customerId: string, reason: string, adminName: string) {
  set((s) => ({
    ...s,
    customers: s.customers.map((c) => (c.id === customerId ? { ...c, status: "suspended" } : c)),
    adminReviewLog: [...s.adminReviewLog, logAdminAction(customerId, adminName, "Suspended customer account", reason)],
  }));
}

export function adminReactivateCustomer(customerId: string, adminName: string) {
  set((s) => ({
    ...s,
    customers: s.customers.map((c) => (c.id === customerId ? { ...c, status: "active" } : c)),
    adminReviewLog: [...s.adminReviewLog, logAdminAction(customerId, adminName, "Reactivated customer account")],
  }));
}

// ---- Studio management (all designer-editable studio content) ----
//
// Same self-service guarantee as updateCustomerInfo above: every call site
// is hardcoded to currentDesigner.id, so a designer can only ever patch
// their own record (including avatar) — never another designer's.

export function updateDesignerInfo(designerId: string, patch: Partial<Pick<Designer, "name" | "avatar" | "banner" | "story" | "contactEmail" | "openingHours" | "atelierLocation">>) {
  set((s) => ({ ...s, designers: s.designers.map((d) => (d.id === designerId ? { ...d, ...patch } : d)) }));
}

export function addHighlight(designerId: string, highlight: { image: string; caption: string }) {
  set((s) => ({ ...s, designers: s.designers.map((d) => (d.id === designerId ? { ...d, highlights: [...d.highlights, highlight] } : d)) }));
}
export function updateHighlight(designerId: string, index: number, highlight: { image: string; caption: string }) {
  set((s) => ({
    ...s,
    designers: s.designers.map((d) => (d.id === designerId ? { ...d, highlights: d.highlights.map((h, i) => (i === index ? highlight : h)) } : d)),
  }));
}
export function deleteHighlight(designerId: string, index: number) {
  set((s) => ({ ...s, designers: s.designers.map((d) => (d.id === designerId ? { ...d, highlights: d.highlights.filter((_, i) => i !== index) } : d)) }));
}

export function addMeetEntry(designerId: string, entry: { image: string; description: string }) {
  set((s) => ({ ...s, designers: s.designers.map((d) => (d.id === designerId ? { ...d, meetTheDesigner: [...d.meetTheDesigner, entry] } : d)) }));
}
export function updateMeetEntry(designerId: string, index: number, entry: { image: string; description: string }) {
  set((s) => ({
    ...s,
    designers: s.designers.map((d) => (d.id === designerId ? { ...d, meetTheDesigner: d.meetTheDesigner.map((m, i) => (i === index ? entry : m)) } : d)),
  }));
}
export function deleteMeetEntry(designerId: string, index: number) {
  set((s) => ({ ...s, designers: s.designers.map((d) => (d.id === designerId ? { ...d, meetTheDesigner: d.meetTheDesigner.filter((_, i) => i !== index) } : d)) }));
}

export function addCollection(collection: Omit<Collection, "id" | "dressIds">): Collection {
  const c: Collection = { ...collection, id: `col-${Date.now()}`, dressIds: [] };
  set((s) => ({ ...s, collections: [...s.collections, c] }));
  return c;
}
export function updateCollection(id: string, patch: Partial<Collection>) {
  set((s) => ({ ...s, collections: s.collections.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}
export function deleteCollection(id: string) {
  set((s) => ({ ...s, collections: s.collections.filter((c) => c.id !== id), dresses: s.dresses.filter((d) => d.collectionId !== id) }));
}

export function addDress(dress: Omit<Dress, "id">): Dress {
  const d: Dress = { ...dress, id: `dr-${Date.now()}` };
  set((s) => ({ ...s, dresses: [...s.dresses, d] }));
  return d;
}
export function updateDress(id: string, patch: Partial<Dress>) {
  set((s) => ({ ...s, dresses: s.dresses.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
}
export function deleteDress(id: string) {
  set((s) => ({ ...s, dresses: s.dresses.filter((d) => d.id !== id) }));
}

export function addPreviousCreation(creation: Omit<PreviousCreation, "id">): PreviousCreation {
  const c: PreviousCreation = { ...creation, id: `cr-${Date.now()}` };
  set((s) => ({ ...s, previousCreations: [...s.previousCreations, c] }));
  return c;
}
export function updatePreviousCreation(id: string, patch: Partial<PreviousCreation>) {
  set((s) => ({ ...s, previousCreations: s.previousCreations.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}
export function deletePreviousCreation(id: string) {
  set((s) => ({ ...s, previousCreations: s.previousCreations.filter((c) => c.id !== id) }));
}

/* ==================================================================== */
/* DESIGNER VERIFICATION + ONBOARDING                                   */
/*                                                                       */
/* Three independent tracks — identity, portfolio, overall profile —    */
/* rather than one isVerified boolean, because those are genuinely      */
/* different facts that can each be true/false/pending on their own.    */
/*                                                                       */
/* SECURITY NOTE: this is a frontend-only prototype with an in-memory   */
/* store, so there is no real server-side authorization here. Every     */
/* function below prefixed `admin` is the ONLY place that can move a    */
/* status to an approved/verified/rejected state. No designer-facing    */
/* page in this app calls an `admin`-prefixed function — only the       */
/* /admin pages do. In a real deployment, these functions correspond    */
/* exactly to backend endpoints that MUST additionally enforce          */
/* role-based access control, authentication, and audit logging         */
/* server-side; a frontend-only convention cannot substitute for that.  */
/* ==================================================================== */

const TRUSTED_PROFESSIONAL_CRITERIA = {
  minCompletedProjects: 3,
  minAverageRating: 4.5,
};

export const getDesignerVerification = (designerId: string) => state.designerVerifications.find((v) => v.designerId === designerId);
export const getAllDesignerVerifications = () => state.designerVerifications;
export const getDesignerOnboarding = (designerId: string) => state.designerOnboarding.find((o) => o.designerId === designerId);
export const getAdminReviewLogForDesigner = (designerId: string) => state.adminReviewLog.filter((l) => l.designerId === designerId);
// adminReviewLog's "designerId" field is really a generic subject id (also
// used for "platform"-level settings changes below) — this just reads it
// back for a customer id instead of a designer id.
export const getAdminReviewLogForCustomer = (customerId: string) => state.adminReviewLog.filter((l) => l.designerId === customerId);

function logAdminAction(designerId: string, adminName: string, action: string, reason?: string) {
  const entry: AdminReviewLogEntry = { id: `log-${Date.now()}`, designerId, adminName, action, reason, timestamp: new Date().toISOString() };
  return entry;
}

// Ensures a fresh designer (e.g. one who just finished /choose-role) has a
// draft onboarding record and a not-yet-started verification record to work
// with — called once when the designer onboarding flow first mounts.
// This prototype has no real multi-account auth, so there's only one
// "logged in" designer session (currentDesigner, already fully verified) used
// throughout the rest of the app. A fresh onboarding walkthrough needs its
// own identity that starts from nothing — this fixed id represents "whoever
// just chose the designer path in this browser session."
export const PENDING_DESIGNER_ID = "des-pending";

export function ensurePendingDesignerRecord(name: string) {
  set((s) => {
    if (s.designers.some((d) => d.id === PENDING_DESIGNER_ID)) return s;
    const blankDesigner: Designer = {
      id: PENDING_DESIGNER_ID,
      name: name || "New Designer",
      studioName: "",
      type: "Designer",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&h=300&fit=crop&q=80",
      banner: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200&h=500&fit=crop&q=80",
      specializations: [],
      city: "",
      country: "India",
      experienceYears: 0,
      rating: 0,
      reviewCount: 0,
      startingPrice: 0,
      verified: false,
      available: false,
      bio: "",
      story: "",
      highlights: [],
      meetTheDesigner: [],
      openingHours: "",
      atelierLocation: "",
      contactEmail: "",
    };
    return { ...s, designers: [...s.designers, blankDesigner] };
  });
  ensureDesignerOnboarding(PENDING_DESIGNER_ID, true);
}

export function ensureDesignerOnboarding(designerId: string, seedEmailVerified: boolean) {
  set((s) => {
    const hasOnboarding = s.designerOnboarding.some((o) => o.designerId === designerId);
    const hasVerification = s.designerVerifications.some((v) => v.designerId === designerId);
    if (hasOnboarding && hasVerification) return s;
    const blankOnboarding: DesignerOnboardingProfile = {
      designerId,
      phone: "",
      emailVerified: seedEmailVerified,
      roles: [],
      specializationCategories: [],
      specializationCrafts: [],
      experienceLevel: "",
      learningBackground: "",
      credentials: [],
      experienceDescription: "",
      portfolioItems: [],
      portfolioOwnershipAccepted: false,
      dateOfBirth: "",
      studioName: "",
      city: "",
      area: "",
      serviceLocations: [],
      aboutStudio: "",
      workingModel: "",
      updatedAt: new Date().toISOString(),
    };
    const blankVerification: DesignerVerification = {
      designerId,
      identityStatus: "not_started",
      portfolioStatus: "not_submitted",
      overallStatus: "draft",
    };
    return {
      ...s,
      designerOnboarding: hasOnboarding ? s.designerOnboarding : [...s.designerOnboarding, blankOnboarding],
      designerVerifications: hasVerification ? s.designerVerifications : [...s.designerVerifications, blankVerification],
    };
  });
}

// ---- Designer-facing onboarding actions (draft data only — never touch
// identity/portfolio/overall status directly) ----

export function saveOnboardingDraft(designerId: string, patch: Partial<Omit<DesignerOnboardingProfile, "designerId">>) {
  set((s) => ({
    ...s,
    designerOnboarding: s.designerOnboarding.map((o) =>
      o.designerId === designerId ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o
    ),
  }));
}

export function addPortfolioItem(designerId: string, item: Omit<PortfolioItem, "id">) {
  const onboarding = getDesignerOnboarding(designerId);
  const newItem: PortfolioItem = { ...item, id: `pf-${Date.now()}` };
  saveOnboardingDraft(designerId, { portfolioItems: [...(onboarding?.portfolioItems ?? []), newItem] });
}

export function updatePortfolioItem(designerId: string, itemId: string, patch: Partial<PortfolioItem>) {
  const onboarding = getDesignerOnboarding(designerId);
  if (!onboarding) return;
  saveOnboardingDraft(designerId, {
    portfolioItems: onboarding.portfolioItems.map((p) => (p.id === itemId ? { ...p, ...patch } : p)),
  });
}

export function deletePortfolioItem(designerId: string, itemId: string) {
  const onboarding = getDesignerOnboarding(designerId);
  if (!onboarding) return;
  saveOnboardingDraft(designerId, { portfolioItems: onboarding.portfolioItems.filter((p) => p.id !== itemId) });
}

// Requires >= 3 portfolio items and an explicit ownership declaration.
// Moves portfolio status to "submitted" — only an admin action can move it
// further, to under_review / approved / rejected / revision_required.
export function submitPortfolioForReview(designerId: string): boolean {
  const onboarding = getDesignerOnboarding(designerId);
  if (!onboarding || onboarding.portfolioItems.length < 3 || !onboarding.portfolioOwnershipAccepted) return false;
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) =>
      v.designerId === designerId ? { ...v, portfolioStatus: "submitted", portfolioReviewNote: undefined } : v
    ),
  }));
  return true;
}

// Simulates handing the person off to an identity/KYC provider. This only
// ever results in "pending" — never "verified" — from the designer side.
export function startIdentityVerification(designerId: string): boolean {
  const onboarding = getDesignerOnboarding(designerId);
  if (!onboarding || !onboarding.dateOfBirth) return false;
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) =>
      v.designerId === designerId ? { ...v, identityStatus: "pending" as IdentityStatus, identityFailureReason: undefined } : v
    ),
  }));
  return true;
}

// The final "Submit for Verification" action on the review step. Requires
// the professional profile, portfolio, and studio sections to be complete.
// Only ever results in "submitted" — never "verified".
export function submitProfileForVerification(designerId: string): boolean {
  const onboarding = getDesignerOnboarding(designerId);
  const verification = getDesignerVerification(designerId);
  if (!onboarding || !verification) return false;
  const ready =
    onboarding.roles.length > 0 &&
    onboarding.portfolioItems.length >= 3 &&
    onboarding.portfolioOwnershipAccepted &&
    onboarding.studioName.trim().length > 0 &&
    verification.identityStatus !== "not_started";
  if (!ready) return false;
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) =>
      v.designerId === designerId ? { ...v, overallStatus: "submitted", submittedAt: new Date().toISOString() } : v
    ),
  }));
  // Also connect the studio-identity fields the designer just entered into
  // the SAME Designer record Manage Studio already edits — no duplicate
  // studio object, per the existing architecture.
  set((s) => ({
    ...s,
    designers: s.designers.map((d) =>
      d.id === designerId
        ? {
            ...d,
            studioName: onboarding.studioName || d.studioName,
            city: onboarding.city || d.city,
            atelierLocation: onboarding.area || d.atelierLocation,
            story: onboarding.aboutStudio || d.story,
            bio: onboarding.experienceDescription || d.bio,
          }
        : d
    ),
  }));
  return true;
}

// ---- Admin-only actions. See the security note at the top of this section. ----

export function adminStartPortfolioReview(designerId: string, adminName: string) {
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) => (v.designerId === designerId ? { ...v, portfolioStatus: "under_review" } : v)),
    adminReviewLog: [...s.adminReviewLog, logAdminAction(designerId, adminName, "Started portfolio review")],
  }));
}

export function adminApprovePortfolio(designerId: string, adminName: string) {
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) =>
      v.designerId === designerId ? { ...v, portfolioStatus: "approved", portfolioReviewNote: undefined } : v
    ),
    adminReviewLog: [...s.adminReviewLog, logAdminAction(designerId, adminName, "Approved portfolio")],
  }));
}

export function adminRequestPortfolioRevision(designerId: string, reason: string, adminName: string) {
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) =>
      v.designerId === designerId ? { ...v, portfolioStatus: "revision_required", portfolioReviewNote: reason } : v
    ),
    adminReviewLog: [...s.adminReviewLog, logAdminAction(designerId, adminName, "Requested portfolio revision", reason)],
  }));
}

export function adminRejectPortfolio(designerId: string, reason: string, adminName: string) {
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) =>
      v.designerId === designerId ? { ...v, portfolioStatus: "rejected", portfolioReviewNote: reason } : v
    ),
    adminReviewLog: [...s.adminReviewLog, logAdminAction(designerId, adminName, "Rejected portfolio", reason)],
  }));
}

// Designer can resubmit after revision_required — moves back to "submitted".
export function resubmitPortfolioAfterRevision(designerId: string): boolean {
  const onboarding = getDesignerOnboarding(designerId);
  if (!onboarding || onboarding.portfolioItems.length < 3) return false;
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) =>
      v.designerId === designerId ? { ...v, portfolioStatus: "submitted", portfolioReviewNote: undefined } : v
    ),
  }));
  return true;
}

export function adminVerifyIdentity(designerId: string, adminName: string) {
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) =>
      v.designerId === designerId ? { ...v, identityStatus: "verified", identityFailureReason: undefined } : v
    ),
    adminReviewLog: [...s.adminReviewLog, logAdminAction(designerId, adminName, "Verified identity")],
  }));
}

export function adminFailIdentity(designerId: string, reason: string, adminName: string) {
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) =>
      v.designerId === designerId ? { ...v, identityStatus: "failed", identityFailureReason: reason } : v
    ),
    adminReviewLog: [...s.adminReviewLog, logAdminAction(designerId, adminName, "Failed identity verification", reason)],
  }));
}

export function adminStartProfileReview(designerId: string, adminName: string) {
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) => (v.designerId === designerId ? { ...v, overallStatus: "under_review" } : v)),
    adminReviewLog: [...s.adminReviewLog, logAdminAction(designerId, adminName, "Started profile review")],
  }));
}

// Guarded: a profile can only become "verified" if identity is verified AND
// portfolio is approved — matches the recommended approval logic exactly.
export function adminApproveProfile(designerId: string, adminName: string): boolean {
  const verification = getDesignerVerification(designerId);
  if (!verification || verification.identityStatus !== "verified" || verification.portfolioStatus !== "approved") return false;
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) =>
      v.designerId === designerId ? { ...v, overallStatus: "verified", reviewedAt: new Date().toISOString(), profileReviewNote: undefined } : v
    ),
    designers: s.designers.map((d) => (d.id === designerId ? { ...d, verified: true, available: true } : d)),
    adminReviewLog: [...s.adminReviewLog, logAdminAction(designerId, adminName, "Approved profile — designer is now verified")],
  }));
  return true;
}

export function adminRejectProfile(designerId: string, reason: string, adminName: string) {
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) =>
      v.designerId === designerId ? { ...v, overallStatus: "rejected", profileReviewNote: reason, reviewedAt: new Date().toISOString() } : v
    ),
    designers: s.designers.map((d) => (d.id === designerId ? { ...d, verified: false } : d)),
    adminReviewLog: [...s.adminReviewLog, logAdminAction(designerId, adminName, "Rejected profile", reason)],
  }));
}

export function adminSuspendProfile(designerId: string, reason: string, adminName: string) {
  set((s) => ({
    ...s,
    designerVerifications: s.designerVerifications.map((v) =>
      v.designerId === designerId ? { ...v, overallStatus: "suspended", profileReviewNote: reason, reviewedAt: new Date().toISOString() } : v
    ),
    designers: s.designers.map((d) => (d.id === designerId ? { ...d, verified: false, available: false } : d)),
    adminReviewLog: [...s.adminReviewLog, logAdminAction(designerId, adminName, "Suspended profile", reason)],
  }));
}

// ---- Derived trust signals — always computed, never stored/editable ----

export function isDesignerPubliclyVisible(designerId: string): boolean {
  return getDesignerVerification(designerId)?.overallStatus === "verified";
}

export function getVerifiedDesigners(): Designer[] {
  return state.designers.filter((d) => isDesignerPubliclyVisible(d.id));
}

// A designer earns "Trusted Professional" through platform history, never at
// registration. Criteria live in one place (TRUSTED_PROFESSIONAL_CRITERIA)
// so they can be tuned later without touching call sites.
export function evaluateTrustedProfessional(designerId: string): boolean {
  const verification = getDesignerVerification(designerId);
  if (!verification || verification.identityStatus !== "verified" || verification.portfolioStatus !== "approved") return false;
  const designer = state.designers.find((d) => d.id === designerId);
  if (!designer) return false;
  const completedCount = state.projects.filter((p) => p.designerId === designerId && p.status === "completed").length;
  return completedCount >= TRUSTED_PROFESSIONAL_CRITERIA.minCompletedProjects && designer.rating >= TRUSTED_PROFESSIONAL_CRITERIA.minAverageRating;
}

/* ==================================================================== */
/* CUSTOMER SAVED ITEMS                                                 */
/* ==================================================================== */

export const getSavedItemsForCustomer = (customerId: string) => state.customerSavedItems.filter((i) => i.customerId === customerId);

export const isItemSaved = (customerId: string, itemType: SavedItemType, itemId: string) =>
  state.customerSavedItems.some((i) => i.customerId === customerId && i.itemType === itemType && i.itemId === itemId);

export function toggleSavedItem(customerId: string, itemType: SavedItemType, itemId: string) {
  set((s) => {
    const existing = s.customerSavedItems.find((i) => i.customerId === customerId && i.itemType === itemType && i.itemId === itemId);
    if (existing) {
      return { ...s, customerSavedItems: s.customerSavedItems.filter((i) => i !== existing) };
    }
    const item: CustomerSavedItem = { id: `saved-${Date.now()}`, customerId, itemType, itemId, createdAt: new Date().toISOString() };
    return { ...s, customerSavedItems: [...s.customerSavedItems, item] };
  });
}

/* ==================================================================== */
/* FASHION DIARY — the customer's private inspiration/reference journal. */
/* Every read and write below is scoped to a customerId, and the two     */
/* mutations that touch an existing entry additionally verify the entry */
/* actually belongs to that customer before changing anything — a       */
/* customer can never edit or delete another customer's entry, and this */
/* data is never surfaced on any public/community/designer-facing page. */
/* ==================================================================== */

export const getDiaryEntriesForCustomer = (customerId: string) =>
  state.diaryEntries.filter((e) => e.customerId === customerId).sort((a, b) => (a.date < b.date ? 1 : -1));

export const getDiaryEntryById = (id: string) => state.diaryEntries.find((e) => e.id === id);

export function addDiaryEntry(customerId: string, entry: { title: string; note: string; mood: string; images: string[] }): DiaryEntry {
  const newEntry: DiaryEntry = { id: `diary-${Date.now()}`, customerId, ...entry, date: new Date().toISOString() };
  set((s) => ({ ...s, diaryEntries: [newEntry, ...s.diaryEntries] }));
  return newEntry;
}

// Returns false (and changes nothing) if the entry doesn't exist or belongs
// to a different customer than the one asking to edit it.
export function updateDiaryEntry(
  entryId: string,
  customerId: string,
  patch: Partial<Pick<DiaryEntry, "title" | "note" | "mood" | "images">>
): boolean {
  const entry = state.diaryEntries.find((e) => e.id === entryId);
  if (!entry || entry.customerId !== customerId) return false;
  set((s) => ({
    ...s,
    diaryEntries: s.diaryEntries.map((e) => (e.id === entryId ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e)),
  }));
  return true;
}

// Same ownership guard as updateDiaryEntry.
export function deleteDiaryEntry(entryId: string, customerId: string): boolean {
  const entry = state.diaryEntries.find((e) => e.id === entryId);
  if (!entry || entry.customerId !== customerId) return false;
  set((s) => ({ ...s, diaryEntries: s.diaryEntries.filter((e) => e.id !== entryId) }));
  return true;
}

/* ==================================================================== */
/* SUBSCRIPTION / PAYMENT SYSTEM                                        */
/*                                                                       */
/* Off by default. Every function here is written the way a real        */
/* server-side subscription/billing service would be structured, so     */
/* wiring in a real payment provider later means implementing the       */
/* payment-provider calls inside lib/payment-service.ts — nothing here   */
/* or in the UI needs to change shape. See the note at the top of        */
/* lib/payment-service.ts for what a real backend still needs to add.    */
/* ==================================================================== */

export const getPaymentSettings = () => state.paymentSettings;
export const getSubscriptionPlans = () => state.subscriptionPlans;
export const getSubscriptionPlanByRole = (role: SubscriberRole) => state.subscriptionPlans.find((p) => p.role === role);
export const getSubscriptionPlanById = (planId: string) => state.subscriptionPlans.find((p) => p.id === planId);
export const getUserSubscription = (userId: string) => state.userSubscriptions.find((s) => s.userId === userId);
export const getAllUserSubscriptions = () => state.userSubscriptions;
export const getPaymentsForUser = (userId: string) => state.payments.filter((p) => p.userId === userId);
export const getAllPayments = () => state.payments;

// The master gate: is a subscription actually required for this role right
// now? False whenever the global switch is off, or the specific role's
// switch is off — so admin can enable payments generally but exempt one
// role, or vice versa, without touching any other logic.
export function isSubscriptionRequiredForRole(role: SubscriberRole): boolean {
  const settings = state.paymentSettings;
  if (!settings.paymentSystemEnabled) return false;
  return role === "customer" ? settings.customerSubscriptionsEnabled : settings.designerSubscriptionsEnabled;
}

// The actual access check a layout/page calls. When subscriptions aren't
// required, everyone has access — this is what keeps every existing
// workflow working unchanged while paymentSystemEnabled is false.
export function hasActiveSubscriptionAccess(userId: string, role: SubscriberRole): boolean {
  if (!isSubscriptionRequiredForRole(role)) return true;
  const sub = getUserSubscription(userId);
  if (!sub || sub.status !== "active") return false;
  if (sub.endDate && new Date(sub.endDate).getTime() < Date.now()) return false;
  return true;
}

// ---- Admin: master switch + plan editing ----

export function adminSetPaymentSystemEnabled(enabled: boolean, adminName: string) {
  set((s) => ({
    ...s,
    paymentSettings: { ...s.paymentSettings, paymentSystemEnabled: enabled, updatedAt: new Date().toISOString() },
    adminReviewLog: [...s.adminReviewLog, logAdminAction("platform", adminName, enabled ? "Enabled payment system" : "Disabled payment system")],
  }));
}

export function adminSetRoleSubscriptionsEnabled(role: SubscriberRole, enabled: boolean, adminName: string) {
  set((s) => ({
    ...s,
    paymentSettings: {
      ...s.paymentSettings,
      [role === "customer" ? "customerSubscriptionsEnabled" : "designerSubscriptionsEnabled"]: enabled,
      updatedAt: new Date().toISOString(),
    },
    adminReviewLog: [...s.adminReviewLog, logAdminAction("platform", adminName, `${enabled ? "Enabled" : "Disabled"} ${role} subscriptions`)],
  }));
}

export function adminSetPlatformCurrency(currency: string, adminName: string) {
  set((s) => ({
    ...s,
    paymentSettings: { ...s.paymentSettings, currency, updatedAt: new Date().toISOString() },
    adminReviewLog: [...s.adminReviewLog, logAdminAction("platform", adminName, `Changed platform currency to ${currency}`)],
  }));
}

export function adminUpdateSubscriptionPlan(
  planId: string,
  patch: Partial<Pick<SubscriptionPlan, "name" | "price" | "currency" | "description" | "features" | "isActive">>,
  adminName: string
) {
  set((s) => ({
    ...s,
    subscriptionPlans: s.subscriptionPlans.map((p) => (p.id === planId ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)),
    adminReviewLog: [...s.adminReviewLog, logAdminAction("platform", adminName, `Updated subscription plan ${planId}`)],
  }));
}

// ---- User-facing subscription actions (go through PaymentService, not called directly by pages) ----

export function createUserSubscription(userId: string, role: SubscriberRole, planId: string): UserSubscription {
  const now = new Date();
  const renewal = new Date(now);
  renewal.setMonth(renewal.getMonth() + 1);
  const sub: UserSubscription = {
    id: `sub-${Date.now()}`,
    userId,
    role,
    planId,
    status: "active",
    startDate: now.toISOString(),
    endDate: renewal.toISOString(),
    renewalDate: renewal.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  set((s) => ({
    ...s,
    userSubscriptions: [...s.userSubscriptions.filter((x) => x.userId !== userId), sub],
  }));
  return sub;
}

export function recordPayment(input: Omit<PaymentRecord, "id" | "createdAt">): PaymentRecord {
  const record: PaymentRecord = { ...input, id: `pay-${Date.now()}`, createdAt: new Date().toISOString() };
  set((s) => ({ ...s, payments: [...s.payments, record] }));
  return record;
}

export function cancelUserSubscription(userId: string) {
  set((s) => ({
    ...s,
    userSubscriptions: s.userSubscriptions.map((sub) =>
      sub.userId === userId ? { ...sub, status: "cancelled", cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : sub
    ),
  }));
}

/* ==================================================================== */
/* REPORTS & DISPUTES                                                   */
/*                                                                       */
/* Admin-managed only — see the note on the Dispute type in types/       */
/* index.ts for why there's no customer/designer-facing "file a          */
/* dispute" action yet. Status only ever moves through the four states   */
/* in DisputeStatus; notes accumulate, they're never edited or removed,  */
/* so the history stays honest.                                         */
/* ==================================================================== */

export const getDisputes = () => state.disputes;
export const getDisputeById = (id: string) => state.disputes.find((d) => d.id === id);

export function adminUpdateDisputeStatus(disputeId: string, status: DisputeStatus) {
  set((s) => ({
    ...s,
    disputes: s.disputes.map((d) => (d.id === disputeId ? { ...d, status, updatedAt: new Date().toISOString() } : d)),
  }));
}

export function addDisputeNote(disputeId: string, text: string, adminName: string) {
  set((s) => ({
    ...s,
    disputes: s.disputes.map((d) =>
      d.id === disputeId
        ? { ...d, notes: [...d.notes, { id: `dnote-${Date.now()}`, text, adminName, timestamp: new Date().toISOString() }], updatedAt: new Date().toISOString() }
        : d
    ),
  }));
}

/* ==================================================================== */
/* ADMIN NOTIFICATIONS — platform-wide announcements.                    */
/* ==================================================================== */

export const getAdminNotifications = () => [...state.adminNotifications].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

export function sendAdminNotification(input: { title: string; message: string; audience: NotificationAudience }, adminName: string): AdminNotification {
  const notification: AdminNotification = { ...input, id: `ann-${Date.now()}`, createdAt: new Date().toISOString(), createdBy: adminName };
  set((s) => ({ ...s, adminNotifications: [...s.adminNotifications, notification] }));
  return notification;
}
