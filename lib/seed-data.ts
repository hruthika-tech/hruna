import type {
  Customer,
  Designer,
  Collection,
  Dress,
  PreviousCreation,
  FashionRequest,
  Proposal,
  Project,
  Conversation,
  DesignerVerification,
  DesignerOnboardingProfile,
  SubscriptionPlan,
  PaymentSettings,
  UserSubscription,
  PaymentRecord,
  Dispute,
  AdminNotification,
  DiaryEntry,
} from "@/types";

// Single demo customer account — matches currentCustomer in lib/mock-data.ts
// (the "who's logged in" id/name anchor), the same way seedDesigners' des-1
// matches currentDesigner there. This is the one place the customer's
// editable profile fields (including avatar) actually live.
export const seedCustomers: Customer[] = [
  {
    id: "cust-1",
    name: "Aanya Reddy",
    email: "aanya.reddy@example.com",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&q=80",
    city: "Hyderabad, India",
    phone: "+91 98765 43210",
    joinedAt: "2026-05-12T00:00:00.000Z",
    status: "active",
  },
];

// Fashion Diary is cust-1's private journal — same demo customer as above.
export const seedDiaryEntries: DiaryEntry[] = [
  {
    id: "diary-1",
    customerId: "cust-1",
    title: "First fitting for the reception lehenga",
    note: "The dusty rose came out even softer than I imagined. Meera's team suggested a cape instead of a dupatta — obsessed with the idea.",
    mood: "Romantic",
    images: ["https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=700&q=80"],
    date: "2026-08-14T00:00:00.000Z",
  },
  {
    id: "diary-2",
    customerId: "cust-1",
    title: "Moodboard for the sangeet outfit",
    note: "Pulling together ivory and gold tones for my brother's sangeet look — thinking bandhgala with subtle thread work.",
    mood: "Elegant",
    images: ["https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=700&q=80"],
    date: "2026-08-02T00:00:00.000Z",
  },
];

export const seedDesigners: Designer[] = [
  {
    id: "des-1",
    name: "Meera Kapoor",
    studioName: "Atelier Meera",
    type: "Designer",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=300&h=300&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&h=500&fit=crop&q=80",
    specializations: ["Bridal Couture", "Occasion Wear"],
    city: "Jaipur",
    country: "India",
    experienceYears: 12,
    rating: 4.9,
    reviewCount: 128,
    startingPrice: 25000,
    verified: true,
    available: true,
    bio: "Bridal and occasion-wear couturier known for hand-finished silhouettes rooted in Rajasthani craft traditions.",
    story:
      "Atelier Meera began in a small Jaipur workshop in 2013, built on the belief that a bride's dress should carry her family's story in every stitch. Today the studio blends heritage handwork with modern, wearable silhouettes.",
    highlights: [
      { image: "/images/stitch/couture-gown-atelier.png", caption: "Hand-embroidered detailing" },
      { image: "https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=800&q=80", caption: "The Jaipur atelier floor" },
      { image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&q=80", caption: "Draping a reception gown" },
    ],
    meetTheDesigner: [
      { image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=600&q=80", description: "Meera trained under master karigars in Jaipur before founding her own atelier at 24." },
      { image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&q=80", description: "Every commission begins with a sketch session in the studio's reading room." },
    ],
    openingHours: "Tue–Sun, 11:00 AM – 7:00 PM",
    atelierLocation: "C-Scheme, Jaipur, Rajasthan",
    contactEmail: "hello@ateliermeera.com",
    joinedAt: "2025-11-03T00:00:00.000Z",
  },
  {
    id: "des-2",
    name: "Rohan Verma",
    studioName: "Studio Verma",
    type: "Designer",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&h=300&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1200&h=500&fit=crop&q=80",
    specializations: ["Bespoke Tailoring", "Menswear"],
    city: "Mumbai",
    country: "India",
    experienceYears: 9,
    rating: 4.7,
    reviewCount: 84,
    startingPrice: 18000,
    verified: true,
    available: true,
    bio: "Bespoke tailor crafting precision-cut sherwanis and suits with a modern, minimal hand.",
    story:
      "Studio Verma is a two-chair atelier in Bandra dedicated to a single idea: tailoring should disappear into how a garment moves. Rohan cuts every first pattern himself.",
    highlights: [
      { image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&q=80", caption: "Canvas basting on a bespoke jacket" },
      { image: "https://images.unsplash.com/photo-1617137968427-85924c800a22?w=800&q=80", caption: "Fabric library, Bandra studio" },
      { image: "https://images.unsplash.com/photo-1520367445093-50dc08a59d9d?w=800&q=80", caption: "Final fitting for a groom's sherwani" },
    ],
    meetTheDesigner: [
      { image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&q=80", description: "Rohan apprenticed on Savile Row before returning to Mumbai to open his own studio." },
      { image: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&q=80", description: "Each client gets a hand-drawn pattern kept on file for future pieces." },
    ],
    openingHours: "Mon–Sat, 10:00 AM – 6:30 PM",
    atelierLocation: "Bandra West, Mumbai",
    contactEmail: "studio@rohanverma.in",
    joinedAt: "2026-01-18T00:00:00.000Z",
  },
  {
    id: "des-3",
    name: "Ishita Sen",
    studioName: "Ishita Sen Studio",
    type: "Boutique",
    avatar: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=300&h=300&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200&h=500&fit=crop&q=80",
    specializations: ["Contemporary Ready-to-Wear", "Sustainable Fashion"],
    city: "Bengaluru",
    country: "India",
    experienceYears: 6,
    rating: 4.8,
    reviewCount: 61,
    startingPrice: 8500,
    verified: true,
    available: false,
    bio: "Slow-fashion boutique working in organic cottons, natural dyes, and zero-waste pattern cutting.",
    story:
      "Founded in 2018, the studio sources every textile within 200km of Bengaluru and works exclusively with natural dye houses, treating sustainability as a design constraint rather than a marketing line.",
    highlights: [
      { image: "https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?w=800&q=80", caption: "Natural indigo dye vats" },
      { image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&q=80", caption: "Zero-waste pattern layout" },
      { image: "https://images.unsplash.com/photo-1544441893-675973e31985?w=800&q=80", caption: "Handloom cotton in progress" },
    ],
    meetTheDesigner: [
      { image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&q=80", description: "Ishita studied textile design before committing the studio fully to natural fibers in 2020." },
      { image: "https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=600&q=80", description: "The studio publishes the full supply chain of every fabric it uses." },
    ],
    openingHours: "Wed–Mon, 11:00 AM – 7:00 PM",
    atelierLocation: "Indiranagar, Bengaluru",
    contactEmail: "studio@ishitasen.com",
    joinedAt: "2026-02-27T00:00:00.000Z",
  },
  {
    id: "des-4",
    name: "Farah Khan Textiles",
    studioName: "Farah Khan Textiles",
    type: "Tailor",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&h=300&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=1200&h=500&fit=crop&q=80",
    specializations: ["Occasion Wear", "Bespoke Tailoring"],
    city: "Hyderabad",
    country: "India",
    experienceYears: 15,
    rating: 4.6,
    reviewCount: 152,
    startingPrice: 12000,
    verified: true,
    available: true,
    bio: "Family-run tailoring house specialising in occasion wear for festive and reception events.",
    story:
      "Three generations of the Khan family have run this atelier out of the same Banjara Hills workshop since 1994, now led by Farah, who trained in Milan before returning home.",
    highlights: [
      { image: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=800&q=80", caption: "Hand-finished button work" },
      { image: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&q=80", caption: "The Banjara Hills workshop" },
      { image: "https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?w=800&q=80", caption: "Silk sourcing for reception wear" },
    ],
    meetTheDesigner: [
      { image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&q=80", description: "Farah took over the family workshop in 2015 after training in Milan." },
      { image: "https://images.unsplash.com/photo-1548624313-0396284f1414?w=600&q=80", description: "The studio still keeps every client's measurement card on paper, by hand." },
    ],
    openingHours: "Mon–Sat, 10:30 AM – 8:00 PM",
    atelierLocation: "Banjara Hills, Hyderabad",
    contactEmail: "contact@farahkhantextiles.com",
    joinedAt: "2026-04-09T00:00:00.000Z",
  },
  {
    id: "des-5",
    name: "Ramesh Naidu",
    studioName: "Naidu Tailoring Works",
    type: "Tailor",
    avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=300&h=300&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1521577352947-9bb58764b69a?w=1200&h=500&fit=crop&q=80",
    specializations: ["Bespoke Tailoring", "Menswear"],
    city: "Hyderabad",
    country: "India",
    experienceYears: 8,
    rating: 0,
    reviewCount: 0,
    startingPrice: 6000,
    verified: false,
    available: false,
    bio: "Self-taught tailor with 8 years of hands-on experience running a home-based stitching business — no formal fashion degree.",
    story: "Ramesh learned tailoring from his father and has run a home-based tailoring business in Hyderabad for eight years, taking on formalwear and everyday alterations for the neighborhood before joining HRUNA.",
    highlights: [],
    meetTheDesigner: [],
    openingHours: "Mon–Sat, 10:00 AM – 7:00 PM",
    atelierLocation: "Kukatpally, Hyderabad",
    contactEmail: "ramesh.naidu.tailoring@example.com",
    joinedAt: "2026-08-20T00:00:00.000Z",
  },
];

// The four established designers are fully verified under the three-track
// model. des-5 (Ramesh Naidu) is deliberately mid-review — a self-taught
// tailor with no formal degree — so the admin dashboard has a real
// application to review on first load, and to demonstrate that a missing
// credential never blocks submission.
export const seedDesignerVerifications: DesignerVerification[] = seedDesigners.map((d) =>
  d.id === "des-5"
    ? {
        designerId: d.id,
        identityStatus: "pending",
        portfolioStatus: "under_review",
        overallStatus: "under_review",
        submittedAt: "2026-08-20T09:00:00.000Z",
      }
    : {
        designerId: d.id,
        identityStatus: "verified",
        portfolioStatus: "approved",
        overallStatus: "verified",
        submittedAt: "2025-01-10T00:00:00.000Z",
        reviewedAt: "2025-01-12T00:00:00.000Z",
      }
);

export const seedDesignerOnboarding: DesignerOnboardingProfile[] = seedDesigners.map((d) => ({
  designerId: d.id,
  phone: d.id === "des-5" ? "+91 90000 12345" : "",
  emailVerified: true,
  roles: d.type === "Tailor" ? ["Tailor / Stitching Specialist"] : d.type === "Boutique" ? ["Boutique Owner"] : ["Fashion Designer"],
  specializationCategories: d.specializations,
  specializationCrafts: [],
  experienceLevel: d.experienceYears >= 10 ? "10+ years" : d.experienceYears >= 6 ? "6–10 years" : "3–5 years",
  learningBackground: d.id === "des-5" ? "Learned through family/business" : "Professional experience",
  credentials: [],
  experienceDescription: d.bio,
  portfolioItems:
    d.id === "des-5"
      ? [
          {
            id: "des-5-seed-portfolio-1",
            image: "https://images.unsplash.com/photo-1520367445093-50dc08a59d9d?w=800&q=80",
            title: "Groom's sherwani, final fitting",
            category: "Menswear",
            description: "Hand-finished sherwani stitched for a family friend's wedding.",
          },
          {
            id: "des-5-seed-portfolio-2",
            image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&q=80",
            title: "Formal shirt collection",
            category: "Menswear",
            description: "Batch of tailored formal shirts made for a local corporate client.",
          },
          {
            id: "des-5-seed-portfolio-3",
            image: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=800&q=80",
            title: "Hand-finished button work detail",
            category: "Bespoke Tailoring",
            description: "Close-up of hand-finished buttonholes on a recent bandhgala commission.",
          },
        ]
      : d.highlights.map((h, i) => ({
          id: `${d.id}-seed-portfolio-${i}`,
          image: h.image,
          title: h.caption,
          category: d.specializations[0] ?? "General",
          description: h.caption,
        })),
  portfolioOwnershipAccepted: true,
  dateOfBirth: d.id === "des-5" ? "1990-04-12" : "",
  studioName: d.studioName,
  city: d.city,
  area: d.atelierLocation,
  serviceLocations: [d.city],
  aboutStudio: d.story,
  workingModel: d.id === "des-5" ? "Home Studio" : "Professional Studio",
  updatedAt: d.id === "des-5" ? "2026-08-20T09:00:00.000Z" : "2025-01-10T00:00:00.000Z",
}));

export const seedCollections: Collection[] = [
  {
    id: "col-1",
    designerId: "des-1",
    name: "Nur — Winter Bridal",
    category: "Bridal",
    coverImage: "/images/stitch/couture-gown-atelier.png",
    description: "A capsule of ivory and gold lehengas inspired by Mughal-era miniature paintings.",
    dressIds: ["dr-1", "dr-2"],
  },
  {
    id: "col-2",
    designerId: "des-2",
    name: "The Bandra Groom",
    category: "Menswear",
    coverImage: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=900&q=80",
    description: "Precision-cut sherwanis and bandhgalas for the modern groom.",
    dressIds: ["dr-3"],
  },
  {
    id: "col-3",
    designerId: "des-3",
    name: "Indigo Fields",
    category: "Ready-to-Wear",
    coverImage: "https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?w=900&q=80",
    description: "Naturally dyed handloom separates for everyday wear.",
    dressIds: ["dr-4"],
  },
];

export const seedDresses: Dress[] = [
  {
    id: "dr-1",
    designerId: "des-1",
    collectionId: "col-1",
    name: "Nur Ivory Lehenga",
    images: ["/images/stitch/couture-gown-atelier.png", "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=900&q=80"],
    description: "Hand-embroidered ivory silk lehenga with gold zardozi and a dupatta trained for a cathedral train.",
    price: 185000,
    available: true,
    fabric: "Silk organza, zardozi embroidery",
  },
  {
    id: "dr-2",
    designerId: "des-1",
    collectionId: "col-1",
    name: "Anara Blush Set",
    images: ["https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=900&q=80"],
    description: "Blush pink bridal set with dabka and sequin work, designed for reception ceremonies.",
    price: 142000,
    available: true,
    fabric: "Raw silk, dabka embroidery",
  },
  {
    id: "dr-3",
    designerId: "des-2",
    collectionId: "col-2",
    name: "Bandra Bandhgala",
    images: ["https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=900&q=80"],
    description: "Charcoal wool bandhgala, fully canvassed and hand-finished, cut to order.",
    price: 32000,
    available: true,
    fabric: "Merino wool blend",
  },
  {
    id: "dr-4",
    designerId: "des-3",
    collectionId: "col-3",
    name: "Indigo Wrap Set",
    images: ["https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?w=900&q=80"],
    description: "Hand-dyed indigo cotton wrap top and trouser set, undyed lining.",
    price: 6800,
    available: false,
    fabric: "Organic handloom cotton",
  },
];

export const seedPreviousCreations: PreviousCreation[] = [
  {
    id: "cr-1",
    designerId: "des-1",
    image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&q=80",
    description: "Bridal set for a Udaipur destination wedding.",
    year: "2025",
  },
];

// ---------------------------------------------------------------------------
// THE CONSISTENCY DEMO
//
// req-1 → prop-1 → proj-1 all describe the exact same "Pastel Silk Reception
// Gown" commission, so the same title/budget/fabric/description/measurements
// can be verified end-to-end across the customer request, the designer's
// request inbox, the accepted proposal, and the project workspace.
// ---------------------------------------------------------------------------

export const seedRequests: FashionRequest[] = [
  {
    id: "req-1",
    customerId: "cust-1",
    title: "Pastel Silk Reception Gown",
    category: "Occasion Wear",
    occasion: "Wedding Reception",
    gender: "Women",
    size: "Bust 36in / Waist 30in / Hip 39in",
    measurements: { bust: "36 in", waist: "30 in", hip: "39 in", length: "44 in" },
    inspirationImages: [
      "https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=700&q=80",
      "/images/stitch/dress-form-draping.png",
    ],
    description:
      "Soft pastel gown with a structured waist, delicate embellishment along the neckline, and a flattering silhouette for an evening reception. Would love it to feel light and easy to dance in.",
    fabricPreference: "Silk",
    budgetMin: 25000,
    budgetMax: 30000,
    location: "Hyderabad",
    dueDate: "2026-09-15",
    preferredDesignerId: "des-1",
    additionalPreferences: "Open to a subtle cape or dupatta alternative if it suits the silhouette.",
    status: "accepted",
    createdAt: "2026-08-10",
  },
  {
    id: "req-2",
    customerId: "cust-1",
    title: "Ivory Sangeet Bandhgala",
    category: "Menswear",
    occasion: "Sangeet",
    gender: "Men",
    size: "Chest 40in / Waist 34in",
    measurements: { chest: "40 in", waist: "34 in", sleeve: "25 in" },
    inspirationImages: ["https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=700&q=80"],
    description:
      "Looking for an ivory bandhgala with subtle self-thread paisley work for my brother's sangeet performance — needs to allow easy movement for dancing.",
    fabricPreference: "Silk-cotton blend",
    budgetMin: 30000,
    budgetMax: 40000,
    location: "Hyderabad",
    dueDate: "2026-09-25",
    additionalPreferences: "",
    status: "submitted",
    createdAt: "2026-08-20",
  },
  {
    id: "req-3",
    customerId: "cust-1",
    title: "Everyday Indigo Separates",
    category: "Ready-to-Wear",
    occasion: "Casual",
    gender: "Women",
    size: "M",
    measurements: { bust: "36 in", waist: "30 in", hip: "39 in" },
    inspirationImages: ["https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?w=700&q=80"],
    description: "A capsule of 2–3 indigo pieces I can mix and match for work.",
    fabricPreference: "Organic cotton",
    budgetMin: 15000,
    budgetMax: 25000,
    location: "Hyderabad",
    dueDate: "2026-10-05",
    preferredDesignerId: "des-3",
    additionalPreferences: "",
    status: "submitted",
    createdAt: "2026-08-15",
  },
];

export const seedProposals: Proposal[] = [
  {
    id: "prop-1",
    requestId: "req-1",
    designerId: "des-1",
    price: 28000,
    estimatedDays: 30,
    description:
      "I'll create this in a soft blush silk with a structured bodice and delicate pearl embellishment at the neckline, keeping the skirt light so it moves easily on the dance floor.",
    notes: "40% deposit to begin, balance due at final fitting.",
    createdAt: "2026-08-11",
    status: "accepted",
  },
];

const PROJECT_STAGES = [
  "Request Accepted",
  "Design Confirmed",
  "Fabric Selected",
  "Cutting",
  "Stitching",
  "Fitting",
  "Final Alterations",
  "Completed",
] as const;

// proj-1 pulls its customer-submitted fields directly from req-1, and its
// confirmed price from prop-1, instead of retyping them — so the seed data
// itself can't drift out of sync with the request/proposal it came from.
const sourceRequestForProj1 = seedRequests[0];
const sourceProposalForProj1 = seedProposals[0];

export const seedProjects: Project[] = [
  {
    id: "proj-1",
    requestId: sourceRequestForProj1.id,
    customerId: sourceRequestForProj1.customerId,
    designerId: "des-1",
    title: sourceRequestForProj1.title,
    category: sourceRequestForProj1.category,
    occasion: sourceRequestForProj1.occasion,
    gender: sourceRequestForProj1.gender,
    referenceImages: sourceRequestForProj1.inspirationImages,
    description: sourceRequestForProj1.description,
    fabricPreference: sourceRequestForProj1.fabricPreference,
    measurements: sourceRequestForProj1.measurements,
    additionalPreferences: sourceRequestForProj1.additionalPreferences,
    budgetMin: sourceRequestForProj1.budgetMin,
    budgetMax: sourceRequestForProj1.budgetMax,
    location: sourceRequestForProj1.location,
    confirmedPrice: sourceProposalForProj1.price,
    stage: "Stitching",
    stages: [...PROJECT_STAGES],
    dueDate: sourceRequestForProj1.dueDate,
    progressPercent: 63,
    updates: [
      {
        id: "upd-1",
        stage: "Fabric Selected",
        note: "Fabric selection completed — a soft blush silk with a subtle sheen, approved over chat.",
        images: ["https://images.unsplash.com/photo-1445205170230-053b83016050?w=700&q=80"],
        date: "2026-09-01",
      },
      {
        id: "upd-2",
        stage: "Cutting",
        note: "Cutting completed based on your measurements.",
        images: ["https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=700&q=80"],
        date: "2026-09-04",
      },
      {
        id: "upd-3",
        stage: "Stitching",
        note: "Initial stitching completed on the bodice and skirt panels.",
        images: ["/images/stitch/dress-form-draping.png"],
        date: "2026-09-08",
      },
    ],
    status: "active",
  },
];

// Subscription plans exist and are fully configured from day one — only the
// master switch (seedPaymentSettings.paymentSystemEnabled) decides whether
// they're ever enforced. Admin can edit price/features/name freely later
// without touching this seed or any code.
export const seedSubscriptionPlans: SubscriptionPlan[] = [
  {
    id: "plan-customer-monthly",
    role: "customer",
    name: "Customer Monthly",
    price: 299,
    currency: "INR",
    billingInterval: "monthly",
    description: "Full access to designer discovery, custom requests, and your project workspace.",
    features: [
      "Discover verified designers",
      "Submit custom design requests",
      "Receive & compare proposals",
      "Messaging with designers",
      "Project workspace & progress tracking",
      "Fashion Diary",
    ],
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "plan-designer-monthly",
    role: "designer",
    name: "Designer Monthly",
    price: 499,
    currency: "INR",
    billingInterval: "monthly",
    description: "Full access to studio management, customer requests, and project tools.",
    features: [
      "Public designer profile & Studio",
      "Manage Studio (highlights, collections, dresses)",
      "Receive & respond to customer requests",
      "Send proposals",
      "Manage active projects",
      "Messages & reviews",
    ],
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

// Payments start OFF. Nothing in the app should charge anyone or block
// access until an admin explicitly flips this from /admin/subscriptions.
export const seedPaymentSettings: PaymentSettings = {
  paymentSystemEnabled: false,
  customerSubscriptionsEnabled: true,
  designerSubscriptionsEnabled: true,
  currency: "INR",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

// Historical subscription + payment records — these exist independently of
// whether paymentSystemEnabled is currently on (it's off by default; these
// represent activity that already happened, the same way real billing
// history persists even while new signups aren't being charged). This is
// what gives /admin/subscriptions' Payment Transactions section and the
// admin Dashboard's revenue cards something real to compute from.
export const seedUserSubscriptions: UserSubscription[] = [
  {
    id: "sub-1",
    userId: "cust-1",
    role: "customer",
    planId: "plan-customer-monthly",
    status: "expired",
    startDate: "2026-05-15T00:00:00.000Z",
    endDate: "2026-06-15T00:00:00.000Z",
    renewalDate: "2026-06-15T00:00:00.000Z",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
  },
  {
    id: "sub-2",
    userId: "des-1",
    role: "designer",
    planId: "plan-designer-monthly",
    status: "cancelled",
    startDate: "2025-11-10T00:00:00.000Z",
    endDate: "2026-01-10T00:00:00.000Z",
    cancelledAt: "2026-01-05T00:00:00.000Z",
    createdAt: "2025-11-10T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "sub-3",
    userId: "des-2",
    role: "designer",
    planId: "plan-designer-monthly",
    status: "active",
    startDate: "2026-01-20T00:00:00.000Z",
    renewalDate: "2026-09-20T00:00:00.000Z",
    createdAt: "2026-01-20T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
  },
  {
    id: "sub-4",
    userId: "des-3",
    role: "designer",
    planId: "plan-designer-monthly",
    status: "active",
    startDate: "2026-03-05T00:00:00.000Z",
    renewalDate: "2026-09-05T00:00:00.000Z",
    createdAt: "2026-03-05T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
  },
  {
    id: "sub-5",
    userId: "des-4",
    role: "designer",
    planId: "plan-designer-monthly",
    status: "expired",
    startDate: "2026-06-25T00:00:00.000Z",
    endDate: "2026-08-25T00:00:00.000Z",
    renewalDate: "2026-08-25T00:00:00.000Z",
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  },
];

export const seedPayments: PaymentRecord[] = [
  { id: "pay-1", userId: "cust-1", subscriptionId: "sub-1", planId: "plan-customer-monthly", amount: 299, currency: "INR", status: "succeeded", paymentProvider: "mock", transactionId: "txn-cust1-may", paidAt: "2026-05-15T00:00:00.000Z", createdAt: "2026-05-15T00:00:00.000Z" },
  { id: "pay-2", userId: "cust-1", subscriptionId: "sub-1", planId: "plan-customer-monthly", amount: 299, currency: "INR", status: "refunded", paymentProvider: "mock", transactionId: "txn-cust1-refund", paidAt: "2026-05-20T00:00:00.000Z", createdAt: "2026-05-20T00:00:00.000Z" },
  { id: "pay-3", userId: "des-1", subscriptionId: "sub-2", planId: "plan-designer-monthly", amount: 499, currency: "INR", status: "succeeded", paymentProvider: "mock", transactionId: "txn-des1-nov", paidAt: "2025-11-10T00:00:00.000Z", createdAt: "2025-11-10T00:00:00.000Z" },
  { id: "pay-4", userId: "des-1", subscriptionId: "sub-2", planId: "plan-designer-monthly", amount: 499, currency: "INR", status: "succeeded", paymentProvider: "mock", transactionId: "txn-des1-dec", paidAt: "2025-12-10T00:00:00.000Z", createdAt: "2025-12-10T00:00:00.000Z" },
  { id: "pay-5", userId: "des-2", subscriptionId: "sub-3", planId: "plan-designer-monthly", amount: 499, currency: "INR", status: "succeeded", paymentProvider: "mock", transactionId: "txn-des2-jul", paidAt: "2026-07-20T00:00:00.000Z", createdAt: "2026-07-20T00:00:00.000Z" },
  { id: "pay-6", userId: "des-2", subscriptionId: "sub-3", planId: "plan-designer-monthly", amount: 499, currency: "INR", status: "succeeded", paymentProvider: "mock", transactionId: "txn-des2-aug", paidAt: "2026-08-29T00:00:00.000Z", createdAt: "2026-08-29T00:00:00.000Z" },
  { id: "pay-7", userId: "des-3", subscriptionId: "sub-4", planId: "plan-designer-monthly", amount: 499, currency: "INR", status: "pending", paymentProvider: "mock", transactionId: "txn-des3-aug", createdAt: "2026-08-29T00:00:00.000Z" },
  { id: "pay-8", userId: "des-4", subscriptionId: "sub-5", planId: "plan-designer-monthly", amount: 499, currency: "INR", status: "failed", paymentProvider: "mock", transactionId: "txn-des4-aug", createdAt: "2026-08-25T00:00:00.000Z" },
];

// ---- Reports & disputes ----
export const seedDisputes: Dispute[] = [
  {
    id: "disp-1",
    customerId: "cust-1",
    designerId: "des-1",
    projectId: "proj-1",
    issue: "Delay in fitting schedule",
    details: "Meera's team rescheduled the second fitting twice with the due date approaching — I'd like confirmation the gown will still be ready in time.",
    status: "under_review",
    createdAt: "2026-08-22T10:15:00.000Z",
    updatedAt: "2026-08-23T09:00:00.000Z",
    notes: [
      { id: "note-1", text: "Reached out to Atelier Meera for a revised fitting date; awaiting response.", adminName: "HRUNA Admin", timestamp: "2026-08-23T09:00:00.000Z" },
    ],
  },
  {
    id: "disp-2",
    customerId: "cust-1",
    designerId: "des-2",
    issue: "Proposal price different from initial quote",
    details: "The formal proposal came in higher than the estimate discussed in chat before the request was submitted.",
    status: "open",
    createdAt: "2026-08-27T16:40:00.000Z",
    updatedAt: "2026-08-27T16:40:00.000Z",
    notes: [],
  },
  {
    id: "disp-3",
    customerId: "cust-1",
    designerId: "des-3",
    issue: "Refund request after cancelled commission",
    details: "Customer cancelled before work began and is asking for the deposit back.",
    status: "resolved",
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-08-02T11:20:00.000Z",
    notes: [
      { id: "note-2", text: "Confirmed no fabric had been purchased yet. Advised designer to process the refund.", adminName: "HRUNA Admin", timestamp: "2026-08-01T14:00:00.000Z" },
      { id: "note-3", text: "Refund confirmed by designer. Marking resolved.", adminName: "HRUNA Admin", timestamp: "2026-08-02T11:20:00.000Z" },
    ],
  },
  {
    id: "disp-4",
    customerId: "cust-1",
    designerId: "des-4",
    issue: "Miscommunication over fabric substitution",
    details: "A different fabric than requested was used for a sample swatch; resolved after the designer clarified it was only for reference.",
    status: "closed",
    createdAt: "2026-06-10T09:30:00.000Z",
    updatedAt: "2026-06-12T17:00:00.000Z",
    notes: [
      { id: "note-4", text: "Both sides confirmed the misunderstanding is cleared up. Closing.", adminName: "HRUNA Admin", timestamp: "2026-06-12T17:00:00.000Z" },
    ],
  },
];

// ---- Admin platform notifications/announcements ----
export const seedAdminNotifications: AdminNotification[] = [
  {
    id: "note-ann-1",
    title: "Scheduled maintenance — Sunday 2 AM–4 AM IST",
    message: "HRUNA will be briefly unavailable for scheduled maintenance. Any in-progress messages and project updates are saved automatically.",
    audience: "all",
    createdAt: "2026-08-20T09:00:00.000Z",
    createdBy: "HRUNA Admin",
  },
  {
    id: "note-ann-2",
    title: "Updated portfolio guidelines for designer verification",
    message: "Portfolio submissions now require at least one in-progress workshop photo alongside finished pieces. See the onboarding portfolio step for details.",
    audience: "designer",
    createdAt: "2026-08-11T13:30:00.000Z",
    createdBy: "HRUNA Admin",
  },
];

export const seedConversations: Conversation[] = [
  {
    id: "conv-1",
    customerId: "cust-1",
    designerId: "des-1",
    lastMessage: "Sounds perfect — I'll post the fabric photos here as soon as they're in.",
    lastTimestamp: "2026-08-11T10:32:00",
    unread: 1,
    messages: [
      { id: "m1", senderId: "cust-1", text: "Hi Meera, loved your proposal — could the cape be a touch lighter?", timestamp: "2026-08-11T09:00:00" },
      { id: "m2", senderId: "des-1", text: "Absolutely, I'll use a silk organza for the cape to keep it light for the reception.", timestamp: "2026-08-11T09:20:00" },
      { id: "m3", senderId: "des-1", text: "Sounds perfect — I'll post the fabric photos here as soon as they're in.", timestamp: "2026-08-11T10:32:00" },
    ],
  },
  {
    id: "conv-2",
    customerId: "cust-1",
    designerId: "des-2",
    lastMessage: "Thank you again for the beautiful bandhgala last year!",
    lastTimestamp: "2026-07-02T18:04:00",
    unread: 0,
    messages: [
      { id: "m4", senderId: "cust-1", text: "Thank you again for the beautiful bandhgala last year!", timestamp: "2026-07-02T18:04:00" },
    ],
  },
];
