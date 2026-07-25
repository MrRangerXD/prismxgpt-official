import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  KeyRound,
  MessageSquare,
  FolderClosed,
  CreditCard,
  HelpCircle,
  LifeBuoy,
  ChevronDown,
} from "lucide-react";
import { PrismXLogo } from "@/components/prismx-logo";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help Center — PrismXGPT" },
      { name: "description", content: "Guides, FAQs and support for PrismXGPT — get started, manage your account, learn about AI features, projects, invites, billing." },
      { property: "og:title", content: "Help Center — PrismXGPT" },
      { property: "og:description", content: "Guides, FAQs and support for PrismXGPT." },
      { property: "og:url", content: "https://prismgpt.lovable.app/help" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://prismgpt.lovable.app/help" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            { "@type": "Question", name: "What is PrismXGPT?", acceptedAnswer: { "@type": "Answer", text: "PrismXGPT is a premium AI assistant for chat, writing, code, and research." } },
            { "@type": "Question", name: "How do I start my first chat?", acceptedAnswer: { "@type": "Answer", text: "Sign in, click New chat in the sidebar, type your question and hit Send." } },
            { "@type": "Question", name: "Is PrismXGPT free?", acceptedAnswer: { "@type": "Answer", text: "Yes — PrismXGPT is free forever with an optional premium plan for higher limits." } },
          ],
        }),
      },
    ],
  }),
  component: HelpPage,
});

type Section = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: { q: string; a: string }[];
};

const sections: Section[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: BookOpen,
    items: [
      { q: "What is PrismXGPT?", a: "PrismXGPT is a premium AI assistant for chat, writing, code, and research. Sign up with an email and start a new chat right away." },
      { q: "How do I start my first chat?", a: "Sign in, click New chat in the sidebar, type your question and hit Send. The AI will stream a response immediately — markdown, code blocks and images are all supported." },
      { q: "Can I use PrismXGPT on mobile?", a: "Yes. Open the app in any modern browser on your phone; the sidebar collapses into a menu and the composer stays anchored to the bottom." },
    ],
  },
  {
    id: "account",
    title: "Account & Login",
    icon: KeyRound,
    items: [
      { q: "How do I sign up?", a: "Go to Sign up, enter your email and a password of at least 6 characters. You can also sign in with Google." },
      { q: "I forgot my password", a: "From the Login page, use the password-reset flow. You'll get an email with a secure link to set a new password." },
      { q: "How do I change my display name or username?", a: "Open Settings → Profile from the sidebar user menu. Update the fields and click Save profile." },
    ],
  },
  {
    id: "chat",
    title: "Chat & AI Features",
    icon: MessageSquare,
    items: [
      { q: "Does the AI stream responses?", a: "Yes — replies stream token by token so you see progress immediately. Formatting, code blocks and inline images render as they arrive." },
      { q: "Can I attach files or images?", a: "Yes. Use the paperclip icon in the composer, drag & drop, or paste from your clipboard. Each file can be up to 20MB." },
      { q: "How do I stop a response mid-stream?", a: "Click the Stop button (square icon) that appears in place of Send while the AI is replying." },
      { q: "How do I share a chat?", a: "Open a chat, click the ⋯ menu next to it in the sidebar, and pick Share to generate a read-only link." },
    ],
  },
  {
    id: "projects",
    title: "Projects",
    icon: FolderClosed,
    items: [
      { q: "What are projects?", a: "Projects group related chats together so you can keep your work organized." },
      { q: "How do I move a chat into a project?", a: "In the sidebar, open the ⋯ menu on the chat and pick Move to project. Choose an existing project or create a new one — the chat and its full history move immediately." },
    ],
  },
  {
    id: "billing",
    title: "Billing & Credits",
    icon: CreditCard,
    items: [
      { q: "Is there a free plan?", a: "Yes — PrismXGPT has a generous free tier. Upgrade any time from the Claim offer button in the sidebar." },
      { q: "How do I upgrade?", a: "Click Claim offer in the sidebar to see current plans. Pick one and follow the checkout flow." },
      { q: "Where can I see my usage?", a: "Open Settings → Account for usage details and manage your subscription." },
    ],
  },
  {
    id: "faq",
    title: "Frequently Asked Questions",
    icon: HelpCircle,
    items: [
      { q: "Is my data private?", a: "Your conversations are stored securely and only visible to you and people you explicitly share with." },
      { q: "Can I export my data?", a: "Yes — Settings → Privacy has data export options." },
      { q: "How do I delete my account?", a: "Settings → Account → Delete account. Or contact mrrangerplayz@gmail.com." },
    ],
  },
];

function HelpPage() {
  const [openId, setOpenId] = useState<string | null>("getting-started");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Link
            to="/chat"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <PrismXLogo size="sm" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">Help Center</h1>
            <p className="truncate text-xs text-muted-foreground">Guides, FAQs and support</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="grid gap-3">
          {sections.map((s) => (
            <section
              key={s.id}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <button
                onClick={() => setOpenId((cur) => (cur === s.id ? null : s.id))}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-accent/40"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/20 text-brand">
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{s.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {s.items.length} article{s.items.length === 1 ? "" : "s"}
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${openId === s.id ? "rotate-180" : ""}`}
                />
              </button>
              {openId === s.id && (
                <div className="space-y-3 border-t border-border px-4 py-4">
                  {s.items.map((item, i) => (
                    <details key={i} className="group rounded-lg border border-border bg-background/40 p-3">
                      <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
                        {item.q}
                      </summary>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                        {item.a}
                      </p>
                    </details>
                  ))}
                </div>
              )}
            </section>
          ))}

          <section className="mt-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/20 text-brand">
                <LifeBuoy className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">Contact Support</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Still stuck? Our team usually responds within a business day.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href="mailto:mrrangerplayz@gmail.com"
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-brand-foreground"
                    style={{ background: "var(--gradient-brand)" }}
                  >
                    Email mrrangerplayz@gmail.com
                  </a>
                  <Link
                    to="/chat"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent"
                  >
                    Back to chat
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
