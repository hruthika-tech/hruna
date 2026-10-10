export type UserRole = "customer" | "designer" | "admin";

export type AccountStatus = "active" | "suspended";

export interface Customer {
  id: string;
  name: string;
  email: string;
  avatar: string;
  city: string;
  phone: string;
  // Optional so every existing Customer object (seed data, blank records)
  // stays valid without a migration. Absent = "active" everywhere it's read.
  joinedAt?: string;
  status?: AccountStatus;
}

export type Specialization =
  | "Bridal Couture"
  | "Bespoke Tailoring"
  | "Occasion Wear"
  | "Contemporary Ready-to-Wear"
  | "Sustainable Fashion"
  | "Menswear";

export type ProfessionalType = "Designer" | "Boutique" | "Tailor";

export interface Designer {
  id: string;
  name: string;
  studioName: string;
  type: ProfessionalType;
  avatar: string;
  banner: string;
  specializations: Specialization[];
  city: string;
  country: string;
  experienceYears: number;
  rating: number;
  reviewCount: number;
  startingPrice: number;
  // Derived display flag — kept in sync with DesignerVerification.overallStatus
  // by store actions only. Never set directly from a designer-facing action;
  // see DesignerVerification for the actual three-track verification state.
  verified: boolean;
  available: boolean;
  bio: string;
  story: string;
  highlights: { image: string; caption: string }[];
  meetTheDesigner: { image: string; description: string }[];
  openingHours: string;
  atelierLocation: string;
  contactEmail: string;
  // Optional for the same reason as Customer.joinedAt above.
  joinedAt?: string;
}

export interface Collection {
  id: string;
  designerId: string;
  name: string;
  category: string;
  coverImage: string;
  description: string;
  dressIds: string[];
}

export interface Dress {
  id: string;
  designerId: string;
  collectionId: string;
  name: string;
  images: string[];
  description: string;
  price: number;
  available: boolean;
  fabric: string;
}

export type RequestStatus =
  | "draft"
  | "submitted"
  | "reviewed"
  | "proposal_received"
  | "accepted"
  | "declined"
  | "expired";

export interface FashionRequest {
  id: string;
  customerId: string;
  title: string;
  category: string;
  occasion: string;
  gender: string;
  size: string;
  measurements: Record<string, string>;
  inspirationImages: string[];
  description: string;
  fabricPreference: string;
  budgetMin: number;
  budgetMax: number;
  location: string;
  dueDate: string;
  preferredDesignerId?: string;
  additionalPreferences: string;
  status: RequestStatus;
  createdAt: string;
}

// A public request (no preferredDesignerId) can be swiped/saved differently
// by every designer who sees it in the Feed, so that state can't live on the
// shared FashionRequest record — it's tracked per (designerId, requestId).
export type SwipeStatus = "interested" | "declined";

export interface DesignerRequestInteraction {
  requestId: string;
  designerId: string;
  swipeStatus?: SwipeStatus;
  saved: boolean;
}

export interface Proposal {
  id: string;
  requestId: string;
  designerId: string;
  price: number;
  estimatedDays: number;
  description: string;
  notes: string;
  createdAt: string;
  status: "pending" | "accepted" | "declined";
}

export type ProjectStage =
  | "Request Accepted"
  | "Design Confirmed"
  | "Fabric Selected"
  | "Cutting"
  | "Stitching"
  | "Fitting"
  | "Final Alterations"
  | "Completed";

export interface PreviousCreation {
  id: string;
  designerId: string;
  image: string;
  description: string;
  year: string;
}

export interface ProgressUpdate {
  id: string;
  stage: ProjectStage;
  note: string;
  images: string[];
  date: string;
}

export interface Project {
  id: string;
  requestId: string;
  customerId: string;
  designerId: string;
  title: string;
  category: string;
  occasion: string;
  gender: string;
  referenceImages: string[];
  description: string;
  fabricPreference: string;
  measurements: Record<string, string>;
  additionalPreferences: string;
  budgetMin: number;
  budgetMax: number;
  location: string;
  // Informational only — the agreed price between customer and designer.
  // LILIRVE does not process payment; this is never a "pay now" action.
  confirmedPrice: number;
  stage: ProjectStage;
  stages: ProjectStage[];
  dueDate: string;
  progressPercent: number;
  updates: ProgressUpdate[];
  // Two-sided completion: a designer marking work done moves the project to
  // "awaiting_confirmation", not "completed" — only the customer confirming
  // it (confirmProjectCompletion) can set it to "completed".
  status: "active" | "awaiting_confirmation" | "completed";
  completedAt?: string;
  changesRequestedAt?: string;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  image?: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  customerId: string;
  designerId: string;
  lastMessage: string;
  lastTimestamp: string;
  unread: number;
  messages: Message[];
}

export interface CurrentDesigner {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
}

// ---------------------------------------------------------------------------
// DESIGNER VERIFICATION — a three-track state machine, not one boolean.
//
// "isVerified = true" can't represent whether a person's identity is real,
// whether their portfolio has actually been reviewed, or whether the overall
// profile has cleared admin review — those are genuinely different things
// that can each be true/false/pending independently. Every status here is
// only ever changed by an admin-prefixed action in lib/store.ts; no
// designer-facing code path can set these to an approved/verified state.
// ---------------------------------------------------------------------------

export type IdentityStatus = "not_started" | "pending" | "verified" | "failed" | "requires_action";

export type PortfolioStatus =
  | "not_submitted"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "revision_required";

export type OverallProfileStatus = "draft" | "submitted" | "under_review" | "verified" | "rejected" | "suspended";

export interface DesignerVerification {
  designerId: string;
  identityStatus: IdentityStatus;
  identityFailureReason?: string;
  portfolioStatus: PortfolioStatus;
  portfolioReviewNote?: string; // admin's reason for revision_required / rejected
  overallStatus: OverallProfileStatus;
  profileReviewNote?: string; // admin's reason for rejected / suspended
  submittedAt?: string;
  reviewedAt?: string;
}

export interface AdminReviewLogEntry {
  id: string;
  designerId: string;
  adminName: string;
  action: string;
  reason?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// DESIGNER ONBOARDING — everything collected during sign-up. No fashion
// degree is ever required; formal education is just one optional credential
// among several equally-valid ways to demonstrate craft.
// ---------------------------------------------------------------------------

export type ExperienceLevel = "Just starting" | "1–2 years" | "3–5 years" | "6–10 years" | "10+ years";

export type LearningBackground =
  | "Fashion degree"
  | "Fashion diploma"
  | "Professional certification"
  | "Apprenticeship"
  | "Learned through family/business"
  | "Self-taught"
  | "Professional experience"
  | "Other";

export type WorkingModel = "Home Studio" | "Boutique" | "Professional Studio" | "Independent" | "Workshop" | "Other";

export interface PortfolioItem {
  id: string;
  image: string;
  title: string;
  category: string;
  description: string;
  year?: string;
}

export interface ProfessionalCredential {
  id: string;
  type: string; // e.g. "Fashion degree", "Business registration"
  institution?: string;
  qualification?: string;
  year?: string;
}

export interface DesignerOnboardingProfile {
  designerId: string;

  // Step 1 — Account
  phone: string;
  emailVerified: boolean;

  // Step 2 — Professional profile + specializations
  roles: string[];
  otherRoleDescription?: string;
  specializationCategories: string[];
  specializationCrafts: string[];

  // Step 3 — Experience
  experienceLevel: ExperienceLevel | "";
  learningBackground: LearningBackground | "";
  credentials: ProfessionalCredential[];
  experienceDescription: string;

  // Step 4 — Portfolio
  portfolioItems: PortfolioItem[];
  portfolioOwnershipAccepted: boolean;

  // Step 5 — Identity (DOB is private — never shown on the public profile)
  dateOfBirth: string;

  // Step 6 — Studio / work information
  studioName: string;
  city: string;
  area: string;
  serviceLocations: string[];
  address?: string;
  aboutStudio: string;
  instagramUrl?: string;
  websiteUrl?: string;
  workingModel: WorkingModel | "";

  updatedAt: string;
}

// ---------------------------------------------------------------------------
// SUBSCRIPTION / PAYMENT SYSTEM
//
// Off by default (PaymentSettings.paymentSystemEnabled = false). Everything
// here is modeled the way it would exist in a real database — separate
// tables/models for plans, a user's subscription, and payment records — so
// flipping the master switch on later is a data change, not a rewrite.
// A real deployment would move all of this server-side; see the security
// note in lib/payment-service.ts.
// ---------------------------------------------------------------------------

export type SubscriberRole = "customer" | "designer";

export type BillingInterval = "monthly";

export interface SubscriptionPlan {
  id: string;
  role: SubscriberRole;
  name: string;
  price: number;
  currency: string;
  billingInterval: BillingInterval;
  description: string;
  features: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UserSubscriptionStatus = "none" | "active" | "expired" | "cancelled";

export interface UserSubscription {
  id: string;
  userId: string;
  role: SubscriberRole;
  planId: string;
  status: UserSubscriptionStatus;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  cancelledAt?: string;
  paymentProviderSubscriptionId?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentRecordStatus = "succeeded" | "failed" | "refunded" | "pending";

export interface PaymentRecord {
  id: string;
  userId: string;
  subscriptionId: string;
  planId: string;
  amount: number;
  currency: string;
  status: PaymentRecordStatus;
  paymentProvider: string;
  transactionId?: string;
  paidAt?: string;
  createdAt: string;
}

export interface PaymentSettings {
  paymentSystemEnabled: boolean;
  customerSubscriptionsEnabled: boolean;
  designerSubscriptionsEnabled: boolean;
  currency: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// CUSTOMER SAVED ITEMS
// ---------------------------------------------------------------------------

export type SavedItemType = "designer" | "dress" | "collection" | "project";

export interface CustomerSavedItem {
  id: string;
  customerId: string;
  itemType: SavedItemType;
  itemId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// FASHION DIARY — the customer's private inspiration/reference journal.
// Never a public feed, portfolio, or moodboard: every entry belongs to
// exactly one customer, and only that customer can view/edit/delete it.
// ---------------------------------------------------------------------------

export interface DiaryEntry {
  id: string;
  customerId: string;
  title: string;
  note: string;
  mood: string;
  images: string[];
  date: string;
  updatedAt?: string;
}

export interface Review {
  id: string;
  projectId: string;
  designerId: string;
  customerId: string;
  rating: number;
  text: string;
  date: string;
}

// ---------------------------------------------------------------------------
// REPORTS & DISPUTES — admin-managed problems between a customer and a
// designer. Kept intentionally simple (no legal/case-management machinery):
// a status, the two parties, what it's about, and a running set of admin
// notes. A real deployment would let customers/designers file these from a
// support flow; for now they're admin-visible and admin-updatable only.
// ---------------------------------------------------------------------------

export type DisputeStatus = "open" | "under_review" | "resolved" | "closed";

export interface DisputeNote {
  id: string;
  text: string;
  adminName: string;
  timestamp: string;
}

export interface Dispute {
  id: string;
  customerId: string;
  designerId: string;
  projectId?: string;
  issue: string;
  details: string;
  status: DisputeStatus;
  createdAt: string;
  updatedAt: string;
  notes: DisputeNote[];
}

// ---------------------------------------------------------------------------
// ADMIN NOTIFICATIONS — platform-wide announcements admin publishes to a
// chosen audience. Distinct from the per-user activity notifications
// customers/designers already see (proposal received, message, etc.) —
// those stay exactly as they are; this is the admin authoring/history side.
// ---------------------------------------------------------------------------

export type NotificationAudience = "all" | "customer" | "designer";

export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  audience: NotificationAudience;
  createdAt: string;
  createdBy: string;
}
