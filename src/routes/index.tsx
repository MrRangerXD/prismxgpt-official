import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useProfile, initials } from "@/hooks/use-profile";
import { usePlans } from "@/hooks/use-plans";
import { PrismXLogo } from "@/components/prismx-logo";
import { AnnouncementBanner } from "@/components/announcement-banner";
import {
  Sparkles,
  MessageSquare,
  Code2,
  FileText,
  Zap,
  Shield,
  Globe,
  Check,
  ArrowRight,
  Menu,
  X,
  Brain,
  Image as ImageIcon,
} from "lucide-react";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PrismXGPT — Premium ChatGPT-style AI Assistant" },
      { name: "description", content: "PrismXGPT is a modern AI assistant for chat, writing, code and research. Free forever with an optional premium plan." },
      { property: "og:title", content: "PrismXGPT — Premium ChatGPT-style AI Assistant" },
      { property: "og:description", content: "PrismXGPT is a modern AI assistant for chat, writing, code and research. Free forever with an optional premium plan." },
      { property: "og:url", content: "https://prismxgpt.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://prismxgpt.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "PrismXGPT",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description: "Modern AI assistant for chat, writing, code, research and image generation.",
          url: "https://prismxgpt.lovable.app/",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { userId, profile, email, loading } = useProfile();
  const { plans, loading: plansLoading } = usePlans();
  const loggedIn = !!userId;
  const avatarInitials = initials(profile?.display_name, email);
  void loading;

  // Homepage always shows the landing experience. Logged-in users can jump
  // into chat via the "Chat" button — we never force-redirect them.






  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <AnnouncementBanner settingKey="homepage_announcement" />
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[800px]"
        style={{ background: "var(--gradient-hero)" }}
      />

      {/* Nav */}
      <header className="relative z-20">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2" aria-label="PrismXGPT home">
            <PrismXLogo size="md" />
            <span className="text-lg font-semibold tracking-tight">PrismXGPT</span>
          </Link>



          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-muted-foreground transition hover:text-foreground">Features</a>
            <a href="#pricing" className="text-sm text-muted-foreground transition hover:text-foreground">Pricing</a>
            <a href="#faq" className="text-sm text-muted-foreground transition hover:text-foreground">FAQ</a>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {loggedIn ? (
              <>
                <Link
                  to="/chat"
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground transition hover:opacity-90"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  Chat
                </Link>
                <Link
                  to="/chat"
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-xs font-semibold"
                  aria-label="Profile"
                  title={profile?.display_name ?? email ?? "Profile"}
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    avatarInitials
                  )}
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground transition hover:opacity-90"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  Sign up
                </Link>
              </>
            )}
          </div>



          <button
            className="rounded-lg p-2 md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {menuOpen && (
          <div className="mx-6 mb-4 rounded-2xl border border-border bg-card p-4 md:hidden">
            <div className="flex flex-col gap-3">
              <a href="#features" className="text-sm text-muted-foreground">Features</a>
              <a href="#pricing" className="text-sm text-muted-foreground">Pricing</a>
              <a href="#faq" className="text-sm text-muted-foreground">FAQ</a>
              <div className="my-2 h-px bg-border" />
              <Link to="/login" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-center">Log in</Link>
              <Link
                to="/signup"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground text-center"
                style={{ background: "var(--gradient-brand)" }}
              >
                Sign up free
              </Link>

            </div>
          </div>
        )}
      </header>

      <main id="main">
      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-16 pb-24 text-center md:pt-24">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          Now powered by next-gen reasoning models
        </div>

        <h1 className="mx-auto max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
          The AI assistant that
          <span className="font-display italic text-brand"> thinks with you</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
          Chat, write, code, analyze, and create — all in one beautifully simple workspace.
          Built for professionals. Free for everyone.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/chat"
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-brand-foreground shadow-glow transition hover:opacity-90"
            style={{ background: "var(--gradient-brand)" }}
          >
            Start chatting free <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/60 px-6 py-3.5 text-base font-medium backdrop-blur transition hover:bg-accent"
          >
            View pricing
          </a>
        </div>


        <p className="mt-4 text-xs text-muted-foreground">No credit card required · Free forever plan</p>

        {/* Chat preview */}
        <div className="relative mx-auto mt-16 max-w-3xl">
          <div
            className="rounded-3xl border border-border bg-card p-2 shadow-elevated"
          >
            <div className="rounded-2xl bg-background p-6 text-left">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                  <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                  <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                </div>
                <div className="ml-2 text-xs text-muted-foreground">PrismXGPT · New chat</div>
              </div>

              <div className="space-y-5">
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-sm">
                    Draft a launch email for our new AI product.
                  </div>
                </div>
                <div className="flex gap-3">
                  <div
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-lg"
                    style={{ background: "var(--gradient-brand)" }}
                  >
                    <Sparkles className="h-4 w-4 text-brand-foreground" />
                  </div>
                  <div className="flex-1 text-sm leading-relaxed text-foreground/90">
                    <p className="mb-2 font-medium">Subject: Meet PrismXGPT — your new AI teammate ✨</p>
                    <p className="text-muted-foreground">
                      Hi there, we're thrilled to introduce PrismXGPT — a beautifully simple assistant that helps you write, code, and think faster. Try it free today…
                    </p>
                    <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                      PrismXGPT is typing
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Everything you need,
            <span className="font-display italic text-brand"> nothing you don't</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            A focused set of powerful capabilities designed for daily use.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border bg-card p-6 transition hover:border-brand/40"
            >
              <div
                className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-brand"
              >
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-1 text-lg font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Simple, honest <span className="font-display italic text-brand">pricing</span>
          </h2>
          <p className="mt-4 text-muted-foreground">Free forever. Upgrade when you're ready.</p>
        </div>

        {plansLoading && plans.length === 0 ? (
          <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-3xl border border-border bg-card/60" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="mx-auto mt-14 max-w-2xl rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
            No pricing plans are available right now. Please check back soon.
          </div>
        ) : (
          <div
            className={`mx-auto mt-14 grid max-w-7xl grid-cols-1 gap-6 sm:grid-cols-2 ${
              plans.length >= 4 ? "lg:grid-cols-4" : plans.length === 3 ? "lg:grid-cols-3" : ""
            }`}
          >
            {plans.map((p) => {
              const highlight = p.id === "premium";
              const badge = p.badge?.trim() || null;
              return (
                <div
                  key={p.id}
                  className={`relative flex flex-col rounded-3xl border p-8 ${
                    highlight ? "border-brand/40 bg-card shadow-glow" : "border-border bg-card"
                  }`}
                >
                  {badge && (
                    <div
                      className={`absolute -top-3 right-6 rounded-full px-3 py-1 text-xs font-semibold ${
                        highlight
                          ? "bg-brand text-brand-foreground"
                          : "border border-border bg-secondary text-foreground"
                      }`}
                    >
                      {badge}
                    </div>
                  )}
                  <div className="mb-6">
                    <div className={`text-sm font-medium ${highlight ? "text-brand" : "text-muted-foreground"}`}>
                      {p.name}
                    </div>
                    <div className="mt-2 flex flex-wrap items-baseline gap-2">
                      {p.strike_price && (
                        <span className="text-xl text-muted-foreground line-through">{p.strike_price}</span>
                      )}
                      <span className="text-5xl font-semibold">{p.price}</span>
                      {p.note && <span className="text-sm text-muted-foreground">{p.note}</span>}
                    </div>
                  </div>
                  <Link
                    to={loggedIn ? "/chat" : "/signup"}
                    className={`mb-8 block w-full rounded-xl py-3 text-center text-sm font-semibold transition ${
                      highlight
                        ? "text-brand-foreground hover:opacity-90"
                        : "border border-border bg-secondary hover:bg-accent"
                    }`}
                    style={highlight ? { background: "var(--gradient-brand)" } : undefined}
                  >
                    {p.cta_label || (p.id === "free" ? "Get started free" : `Upgrade to ${p.name}`)}
                  </Link>
                  <ul className="mt-auto space-y-3 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 flex-none text-brand" />
                        <span className="text-foreground/90">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 mx-auto max-w-3xl px-6 py-24">
        <h2 className="text-center text-4xl font-semibold tracking-tight md:text-5xl">
          Common <span className="font-display italic text-brand">questions</span>
        </h2>
        <div className="mt-12 space-y-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl border border-border bg-card p-5 open:border-brand/30"
            >
              <summary className="flex cursor-pointer items-center justify-between text-sm font-medium">
                {f.q}
                <span className="ml-4 text-brand transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        <div
          className="relative overflow-hidden rounded-3xl border border-border bg-card p-12 text-center md:p-20"
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-40"
            style={{ background: "var(--gradient-hero)" }}
          />
          <div className="relative">
            <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
              Ready to think <span className="font-display italic text-brand">faster?</span>
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Join thousands of professionals using PrismXGPT every day.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-brand-foreground shadow-glow transition hover:opacity-90"
                style={{ background: "var(--gradient-brand)" }}
              >
                Sign up free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="rounded-xl border border-border bg-background/40 px-6 py-3.5 text-base font-medium backdrop-blur transition hover:bg-accent"
              >
                Log in
              </Link>

            </div>
          </div>
        </div>
      </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <PrismXLogo size="sm" />
            <span>© 2026 PrismXGPT. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <a href="mailto:contact@prismxgpt.com" className="hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const features = [
  { icon: MessageSquare, title: "Natural conversation", desc: "Chat naturally with an assistant that remembers context and adapts to your style." },
  { icon: Code2, title: "Code with confidence", desc: "Write, debug and explain code in 40+ languages with instant, accurate suggestions." },
  { icon: FileText, title: "Long-form writing", desc: "Draft essays, emails and reports with a tone that actually sounds like you." },
  { icon: Brain, title: "Advanced reasoning", desc: "Solve complex problems step by step with deep, transparent reasoning." },
  { icon: ImageIcon, title: "Image generation", desc: "Create stunning visuals from a simple prompt — no design skills required." },
  { icon: Globe, title: "Real-time web", desc: "Get up-to-date answers with live search across the internet." },
  { icon: Zap, title: "Blazing fast", desc: "Responses stream in real time so you never wait on your ideas." },
  { icon: Shield, title: "Private by default", desc: "Your chats are encrypted and never used to train the model." },
  { icon: Sparkles, title: "Custom personas", desc: "Create AI companions tuned for work, learning or creativity." },
];


const faqs = [
  { q: "Is PrismXGPT really free?", a: "Yes — the Free plan is free forever, no credit card required. Premium unlocks advanced models and higher limits." },
  { q: "Which AI models power PrismXGPT?", a: "PrismXGPT runs on a curated set of top-tier reasoning models, chosen automatically for each task to deliver the best answer." },
  { q: "Is my data private?", a: "Absolutely. Conversations are end-to-end encrypted in transit and never used to train models by default." },
  { q: "Can I cancel Premium anytime?", a: "Yes, cancel with one click. You'll keep Premium access until the end of your billing period." },
];
