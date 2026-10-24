import Link from "next/link";
import { ContentPage } from "@/components/layout/ContentPage";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Help Center",
  description: "Answers to common questions about using HRUNA — your account, finding designers, requests, projects, messaging, your profile and saved favourites.",
  path: "/help",
});

const TOPICS = [
  {
    title: "Account",
    items: [
      {
        q: "How do I sign in?",
        a: "Use the email and password you set when you created your account. If you've forgotten your password, use “Forgot password?” on the sign-in page to reset it.",
      },
      {
        q: "How do I change my password?",
        a: "Go to Profile → Security → Change Password. You'll need your current password to set a new one.",
      },
      {
        q: "How do I delete my account?",
        a: "Go to Profile → Security → Delete Account. Accounts with existing requests, projects, or other activity can't be deleted automatically — contact support instead so your data can be handled correctly.",
      },
    ],
  },
  {
    title: "Finding Designers",
    items: [
      {
        q: "How do I find a designer?",
        a: "Use Discover to browse verified designers, tailors, and boutiques by specialization. Each studio page shows their portfolio, reviews, and verification status.",
      },
      {
        q: "What does “verified” mean?",
        a: "A verified designer has completed HRUNA's identity and portfolio review. Only approved designers appear in search and can be sent private requests.",
      },
    ],
  },
  {
    title: "Requests",
    items: [
      {
        q: "How do I start a fashion request?",
        a: "Go to My Requests → Start a Fashion Request, describe what you're looking for (category, budget, measurements, timeline), and submit it. Designers can then send you proposals.",
      },
      {
        q: "Can I send a request to one specific designer?",
        a: "Yes — from a designer's studio page you can send a private request directly to them instead of opening it to all designers.",
      },
    ],
  },
  {
    title: "Projects",
    items: [
      {
        q: "What happens after I accept a proposal?",
        a: "Accepting a proposal creates a Project. You and the designer track progress together through updates until the piece is complete and you confirm completion.",
      },
    ],
  },
  {
    title: "Messaging",
    items: [
      {
        q: "How do I message a designer?",
        a: "Once you have a request or project with a designer, use Messages to chat with them directly, or start a conversation from their studio page.",
      },
    ],
  },
  {
    title: "Profile",
    items: [
      {
        q: "How do I update my profile photo?",
        a: "Go to Profile → Personal Details → Change Photo. Your photo updates everywhere it's shown, including the navigation avatar, once you save.",
      },
    ],
  },
  {
    title: "Favourites",
    items: [
      {
        q: "How do I save a designer, dress, or collection?",
        a: "Tap the heart icon on any designer, dress, collection, or project. Everything you save is collected under Saved Items in the navigation.",
      },
    ],
  },
];

export default function HelpCenterPage() {
  return (
    <ContentPage eyebrow="SUPPORT" title="Help Center">
      <p>
        Answers to common questions about using HRUNA. Can&apos;t find what you need?{" "}
        <Link href="/support" className="text-primary font-medium hover:underline">
          Contact Support
        </Link>
        .
      </p>
      {TOPICS.map((topic) => (
        <div key={topic.title}>
          <h2 className="text-headline-sm text-ink mb-3">{topic.title}</h2>
          <div className="flex flex-col gap-4">
            {topic.items.map((item) => (
              <div key={item.q}>
                <p className="text-ink font-medium text-sm mb-1">{item.q}</p>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </ContentPage>
  );
}
