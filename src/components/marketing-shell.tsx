/**
 * Reusable marketing shell used by feature landing pages and comparison
 * pages. Keeps nav/footer identical to the homepage so the pages feel
 * native and inherit brand chrome. Content-only pages pass children.
 */
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { PrismXLogo } from "@/components/prismx-logo";
import { useProfile, initials } from "@/hooks/use-profile";
import { ArrowRight, Menu, X, Check } from "lucide-react";

export function MarketingShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { userId, profile, email } = useProfile();
  const loggedIn = !!userId;
  const avatarInitials = initials(profile?.display_name, email);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
        style={{ background: "var(--gradient-hero)" }}
      />
      <header className="relative z-20">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2" aria-label="PrismXGPT home">
            <PrismXLogo size="md" />
            <span className="text-lg font-semibold tracking-tight">PrismXGPT</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <Link to="/features/ai-chat" className="text-sm text-muted-foreground transition hover:text-foreground">Chat</Link>
            <Link to="/features/image-generation" className="text-sm text-muted-foreground transition hover:text-foreground">Image gen</Link>
            <Link to="/features/image-editing" className="text-sm text-muted-foreground transition hover:text-foreground">Image edit</Link>
            
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {loggedIn ? (
              <Link
                to="/chat"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground transition hover:opacity-90"
                style={{ background: "var(--gradient-brand)" }}
              >
                Open chat
              </Link>
            ) : (
              <>
                <Link to="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition hover:bg-accent">
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground transition hover:opacity-90"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  Sign up free
                </Link>
              </>
            )}
            {loggedIn && (
              <span
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary text-xs font-semibold"
                aria-label={profile?.display_name ?? email ?? "Profile"}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  avatarInitials
                )}
              </span>
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
              <Link to="/features/ai-chat" className="text-sm text-muted-foreground">AI Chat</Link>
              <Link to="/features/image-generation" className="text-sm text-muted-foreground">Image generation</Link>
              <Link to="/features/image-editing" className="text-sm text-muted-foreground">Image editing</Link>
              
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

      <main id="main" className="relative z-10">{children}</main>

      <footer className="relative z-10 border-t border-border/60 mt-24">
        <div className="mx-auto max-w-7xl px-6 py-12 grid gap-8 md:grid-cols-4 text-sm">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <PrismXLogo size="sm" />
              <span className="font-semibold">PrismXGPT</span>
            </div>
            <p className="text-muted-foreground">Premium AI assistant for chat, code, writing and images.</p>
          </div>
          <div>
            <div className="mb-3 font-semibold">Product</div>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link to="/features/ai-chat" className="hover:text-foreground">AI Chat</Link></li>
              <li><Link to="/features/image-generation" className="hover:text-foreground">Image Generation</Link></li>
              <li><Link to="/features/image-editing" className="hover:text-foreground">Image Editing</Link></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 font-semibold">Compare</div>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link to="/compare/chatgpt-alternative" className="hover:text-foreground">ChatGPT alternative</Link></li>
              <li><Link to="/compare/midjourney-alternative" className="hover:text-foreground">Midjourney alternative</Link></li>
              <li><Link to="/compare/claude-alternative" className="hover:text-foreground">Claude alternative</Link></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 font-semibold">Resources</div>
            <ul className="space-y-2 text-muted-foreground">
              
              <li><Link to="/help" className="hover:text-foreground">Help Center</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground">Privacy</Link></li>
              <li><Link to="/terms" className="hover:text-foreground">Terms</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} PrismXGPT. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export interface Feature { title: string; desc: string }
export interface Faq { q: string; a: string }

export function MarketingPage({
  eyebrow,
  h1,
  intro,
  ctaLabel = "Start free — no credit card",
  features,
  howItWorks,
  faqs,
  bottomCta,
}: {
  eyebrow: string;
  h1: ReactNode;
  intro: string;
  ctaLabel?: string;
  features: Feature[];
  howItWorks: string[];
  faqs: Faq[];
  bottomCta: string;
}) {
  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-14 text-center md:pt-24">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          {eyebrow}
        </div>
        <h1 className="mx-auto max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
          {h1}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">{intro}</p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-brand-foreground shadow-glow transition hover:opacity-90"
            style={{ background: "var(--gradient-brand)" }}
          >
            {ctaLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl mb-10">Everything you need in one place</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15 text-brand">
                <Check className="h-4 w-4" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl mb-8">How it works</h2>
        <ol className="grid gap-4 md:grid-cols-3 counter-reset-none">
          {howItWorks.map((step, i) => (
            <li key={i} className="rounded-2xl border border-border bg-card/40 p-6">
              <div className="mb-3 text-xs font-semibold text-brand">STEP {i + 1}</div>
              <p className="text-base leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl mb-8 text-center">Frequently asked questions</h2>
        <div className="space-y-4">
          {faqs.map((f) => (
            <details key={f.q} className="group rounded-xl border border-border bg-card/60 p-5">
              <summary className="cursor-pointer list-none font-medium flex justify-between items-center">
                {f.q}
                <span className="ml-4 text-muted-foreground group-open:rotate-45 transition">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <div className="rounded-3xl border border-border p-10 md:p-14" style={{ background: "var(--gradient-brand-subtle, var(--gradient-hero))" }}>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{bottomCta}</h2>
          <p className="mt-4 text-muted-foreground">Free forever plan. Upgrade any time.</p>
          <Link
            to="/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-brand-foreground shadow-glow transition hover:opacity-90"
            style={{ background: "var(--gradient-brand)" }}
          >
            Get started free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

export function faqJsonLd(faqs: Faq[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  });
}
