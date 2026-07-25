/**
 * PrismXGPT Documentation Page
 * ----------------------------------------------------------------------------
 * A world-class docs experience inspired by Stripe/Vercel with an Emerald
 * Prestige aesthetic: deep emerald surfaces, warm gold accents, glassmorphic
 * panels, and a Cinzel display face for headings.
 *
 * Layout:
 *   ┌──────────────┬──────────────────────────────┬────────────────┐
 *   │  Sidebar Nav │  Main content (sections)     │  On-this-page  │
 *   │  (sticky)    │                              │  (sticky ToC)  │
 *   └──────────────┴──────────────────────────────┴────────────────┘
 *
 * The nav + ToC use smooth-scroll to hash targets, with an IntersectionObserver
 * highlighting the active section. All colors are read from CSS variables in
 * `src/styles.css` so retheming stays trivial.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Search,
  Rocket,
  Sparkles,
  Database,
  CreditCard,
  Check,
  Info,
  AlertTriangle,
  Copy,
  ChevronRight,
  Code2,
  ImageIcon,
  FolderKanban,
  BookOpen,
} from "lucide-react";
import { PrismXLogo } from "@/components/prismx-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Route definition with SEO metadata + Cinzel font for headings
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation — PrismXGPT" },
      {
        name: "description",
        content:
          "Official PrismXGPT documentation: installation, core features, API & schema, and pricing plans.",
      },
      { property: "og:title", content: "Documentation — PrismXGPT" },
      {
        property: "og:description",
        content:
          "Everything you need to build with PrismXGPT — a premium ChatGPT-style AI assistant.",
      },
      { property: "og:url", content: "https://prismxgpt.lovable.app/docs" },
      { property: "og:type", content: "article" },
    ],
    links: [
      { rel: "canonical", href: "https://prismxgpt.lovable.app/docs" },
      // Load Cinzel only on the docs route — it powers the luxury headings.
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&display=swap",
      },
    ],
  }),
  component: DocsPage,
});

// ---------------------------------------------------------------------------
// Navigation model — the sidebar, on-this-page ToC and scroll spy all derive
// from this single source of truth.
// ---------------------------------------------------------------------------
type DocSection = { id: string; title: string; icon: React.ElementType };
type DocGroup = { label: string; sections: DocSection[] };

const NAV: DocGroup[] = [
  {
    label: "Introduction",
    sections: [{ id: "getting-started", title: "Getting Started", icon: Rocket }],
  },
  {
    label: "Core Features",
    sections: [
      { id: "ai-coding", title: "AI Coding", icon: Code2 },
      { id: "project-management", title: "Project Management", icon: FolderKanban },
      { id: "image-generation", title: "Image Generation", icon: ImageIcon },
    ],
  },
  {
    label: "Platform",
    sections: [
      { id: "api-schema", title: "API & Schema", icon: Database },
      { id: "pricing-plans", title: "Pricing Plans", icon: CreditCard },
    ],
  },
];

// Flat list used by the on-this-page ToC + IntersectionObserver.
const FLAT_SECTIONS: DocSection[] = NAV.flatMap((g) => g.sections);

// ===========================================================================
// Page
// ===========================================================================
function DocsPage() {
  const [query, setQuery] = useState("");
  const activeId = useScrollSpy(FLAT_SECTIONS.map((s) => s.id));

  // Filter sidebar items on the search query (client-side, mockup behavior).
  const filteredNav = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NAV;
    return NAV.map((g) => ({
      ...g,
      sections: g.sections.filter((s) => s.title.toLowerCase().includes(q)),
    })).filter((g) => g.sections.length > 0);
  }, [query]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative min-h-screen bg-background text-foreground">
        {/* Ambient emerald glow — a purely decorative backdrop for prestige feel */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10"
          style={{ background: "var(--gradient-hero)" }}
        />

        <DocsHeader query={query} onQueryChange={setQuery} />

        <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-4 pt-6 pb-24 lg:grid-cols-[260px_minmax(0,1fr)_220px] lg:px-8">
          <DocsSidebar nav={filteredNav} activeId={activeId} />

          <main id="docs-content" className="min-w-0">
            <GettingStarted />
            <AICoding />
            <ProjectManagement />
            <ImageGenerationSection />
            <ApiSchema />
            <PricingPlans />
          </main>

          <OnThisPage sections={FLAT_SECTIONS} activeId={activeId} />
        </div>
      </div>
    </TooltipProvider>
  );
}

// ===========================================================================
// Header — brand, back link, and the (mockup) search input
// ===========================================================================
function DocsHeader({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (v: string) => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 backdrop-blur-xl bg-background/70">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 lg:px-8">
        <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="Home">
          <PrismXLogo size="sm" />
          <span className="font-display text-lg" style={{ fontFamily: "Cinzel, serif" }}>
            PrismXGPT
          </span>
          <Badge
            variant="outline"
            className="ml-1 border-[color:var(--brand)]/40 text-[color:var(--brand)]"
          >
            Docs
          </Badge>
        </Link>

        <div className="flex-1" />

        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search docs…"
            aria-label="Search documentation"
            className="pl-9 w-[240px] md:w-[320px] bg-card/60 backdrop-blur border-border/60"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            /
          </kbd>
        </div>

        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        </Link>
      </div>
    </header>
  );
}

// ===========================================================================
// Sidebar — grouped, collapsible sections with an active-state indicator
// ===========================================================================
function DocsSidebar({ nav, activeId }: { nav: DocGroup[]; activeId: string }) {
  return (
    <aside className="hidden lg:block">
      <nav
        aria-label="Documentation"
        className="sticky top-[76px] max-h-[calc(100vh-96px)] overflow-y-auto pr-2"
      >
        {nav.map((group) => (
          <SidebarGroup key={group.label} group={group} activeId={activeId} />
        ))}

        <div className="mt-6 rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BookOpen className="h-4 w-4 text-[color:var(--brand)]" />
            Need more help?
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Visit the Help Center for FAQs and support.
          </p>
          <Link to="/help">
            <Button size="sm" variant="outline" className="mt-3 w-full">
              Open Help Center
            </Button>
          </Link>
        </div>
      </nav>
    </aside>
  );
}

/** A single collapsible group in the sidebar. Defaults to open. */
function SidebarGroup({ group, activeId }: { group: DocGroup; activeId: string }) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-3">
      <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        {group.label}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open && "rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-0.5">
        {group.sections.map((s) => {
          const active = activeId === s.id;
          const Icon = s.icon;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => smoothScroll(e, s.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                active
                  ? "bg-[color:var(--brand)]/10 text-foreground shadow-[inset_2px_0_0_var(--brand)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-current={active ? "location" : undefined}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active ? "text-[color:var(--brand)]" : "text-muted-foreground",
                )}
              />
              {s.title}
            </a>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ===========================================================================
// On-this-page (right rail) — mirrors active section from scroll spy
// ===========================================================================
function OnThisPage({
  sections,
  activeId,
}: {
  sections: DocSection[];
  activeId: string;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-[76px] max-h-[calc(100vh-96px)] overflow-y-auto">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <ul className="space-y-1 border-l border-border/60">
          {sections.map((s) => {
            const active = activeId === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={(e) => smoothScroll(e, s.id)}
                  className={cn(
                    "-ml-px block border-l-2 pl-3 py-1 text-sm transition-colors",
                    active
                      ? "border-[color:var(--brand)] text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.title}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

// ===========================================================================
// Reusable section shell — enforces consistent spacing + luxury heading style
// ===========================================================================
function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-10 first:pt-4">
      {eyebrow && (
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--brand)]">
          {eyebrow}
        </div>
      )}
      <h2
        className="text-3xl md:text-4xl font-semibold tracking-tight"
        style={{ fontFamily: "Cinzel, serif" }}
      >
        {title}
      </h2>
      {description && (
        <p className="mt-3 max-w-2xl text-muted-foreground">{description}</p>
      )}
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}

// ===========================================================================
// Callout — Info / Warning / Success variants using semantic tokens
// ===========================================================================
type CalloutTone = "info" | "warning" | "success";
function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: CalloutTone;
  title: string;
  children: React.ReactNode;
}) {
  const styles: Record<
    CalloutTone,
    { border: string; bg: string; icon: React.ElementType; iconColor: string }
  > = {
    info: {
      border: "border-[color:var(--brand)]/40",
      bg: "bg-[color:var(--brand)]/5",
      icon: Info,
      iconColor: "text-[color:var(--brand)]",
    },
    warning: {
      border: "border-amber-500/40",
      bg: "bg-amber-500/5",
      icon: AlertTriangle,
      iconColor: "text-amber-500",
    },
    success: {
      border: "border-emerald-500/40",
      bg: "bg-emerald-500/5",
      icon: Check,
      iconColor: "text-emerald-500",
    },
  };
  const s = styles[tone];
  const Icon = s.icon;
  return (
    <div
      className={cn(
        "rounded-xl border p-4 backdrop-blur",
        s.border,
        s.bg,
      )}
      role="note"
    >
      <div className="flex gap-3">
        <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", s.iconColor)} />
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <div className="mt-1 text-sm text-muted-foreground">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// CodeBlock — emerald glowing border + copy-to-clipboard + naive highlighter
// ===========================================================================
function CodeBlock({
  code,
  language = "bash",
  filename,
}: {
  code: string;
  language?: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — swallow silently */
    }
  };

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-[color:var(--brand)]/30 bg-[oklch(0.14_0.014_170)]"
      style={{ boxShadow: "0 0 0 1px color-mix(in oklab, var(--brand) 15%, transparent), 0 24px 60px -30px color-mix(in oklab, var(--brand) 45%, transparent)" }}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-mono">{filename ?? language}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onCopy}
              aria-label="Copy code"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{copied ? "Copied!" : "Copy"}</TooltipContent>
        </Tooltip>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code
          className="font-mono text-[oklch(0.94_0.02_150)]"
          // Very light "syntax highlighting" — enough to read comfortably
          // without pulling in a full parser library.
          dangerouslySetInnerHTML={{ __html: highlight(code, language) }}
        />
      </pre>
    </div>
  );
}

// ===========================================================================
// Content sections
// ===========================================================================

function GettingStarted() {
  return (
    <Section
      id="getting-started"
      eyebrow="Introduction"
      title="Getting Started"
      description="Install PrismXGPT, sign in, and send your first prompt in under a minute."
    >
      <Callout tone="info" title="Prerequisites">
        A modern browser (Chrome, Safari, Firefox, Edge) and a free PrismXGPT
        account. No CLI or local install is required for end users.
      </Callout>

      <div>
        <h3 className="text-lg font-semibold">1. Create your account</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign up with email or continue with Google. Your workspace is provisioned instantly.
        </p>
      </div>

      <CodeBlock
        filename="terminal"
        language="bash"
        code={`# Open the app in your browser
open https://prismxgpt.lovable.app

# or clone locally for self-hosting
git clone https://github.com/your-org/prismxgpt.git
cd prismxgpt && bun install && bun run dev`}
      />

      <div>
        <h3 className="text-lg font-semibold">2. Configure environment</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Self-hosters must provide Supabase credentials in a local <code>.env</code>.
        </p>
      </div>

      <CodeBlock
        filename=".env"
        language="ini"
        code={`VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="sb_publishable_xxxxxxxxxxxxxxxx"
LOVABLE_API_KEY="sk_live_xxxxxxxxxxxxxxxx"`}
      />

      <Callout tone="warning" title="Never commit secrets">
        Keep <code>.env</code> out of version control. Use your platform's
        secrets manager for production deployments.
      </Callout>
    </Section>
  );
}

function AICoding() {
  return (
    <Section
      id="ai-coding"
      eyebrow="Core Features"
      title="AI Coding"
      description="Pair-program with a context-aware assistant that writes, refactors, and reviews code across your entire project."
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {[
          "Streaming responses with markdown + syntax highlighting",
          "Multi-file context understanding",
          "Framework-aware code suggestions",
          "Inline diffs and one-click apply",
        ].map((f) => (
          <li
            key={f}
            className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/60 p-3 backdrop-blur"
          >
            <Check className="mt-0.5 h-4 w-4 text-[color:var(--brand)]" />
            <span className="text-sm">{f}</span>
          </li>
        ))}
      </ul>

      <CodeBlock
        filename="example.ts"
        language="ts"
        code={`// Ask PrismXGPT to generate a typed fetch wrapper
import { z } from "zod";

const User = z.object({ id: z.string(), name: z.string() });

export async function getUser(id: string) {
  const res = await fetch(\`/api/users/\${id}\`);
  if (!res.ok) throw new Error("Failed to load user");
  return User.parse(await res.json());
}`}
      />
    </Section>
  );
}

function ProjectManagement() {
  return (
    <Section
      id="project-management"
      eyebrow="Core Features"
      title="Project Management"
      description="Organize chats into projects, invite teammates, and share read-only snapshots."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { t: "Projects", d: "Group related chats and files under a single workspace." },
          { t: "Invites", d: "Share access via magic links with role-based permissions." },
          { t: "Snapshots", d: "Publish a read-only version of any chat for stakeholders." },
        ].map((c) => (
          <div
            key={c.t}
            className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur transition hover:border-[color:var(--brand)]/40"
          >
            <p className="font-medium">{c.t}</p>
            <p className="mt-1 text-sm text-muted-foreground">{c.d}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ImageGenerationSection() {
  return (
    <Section
      id="image-generation"
      eyebrow="Core Features"
      title="Image Generation"
      description="Generate and edit images inline. Every generation is durable — refresh-safe and recoverable."
    >
      <Callout tone="success" title="Durable lifecycle">
        Each generation is tracked as queued → processing → completed / failed.
        Refresh mid-flight is safe — polling resumes automatically.
      </Callout>

      <CodeBlock
        filename="prompt"
        language="text"
        code={`> draw a minimalist emerald prism on a black background
> make it more glassy and add gold refractions   # edits the previous image`}
      />
    </Section>
  );
}

function ApiSchema() {
  return (
    <Section
      id="api-schema"
      eyebrow="Platform"
      title="API & Schema"
      description="PrismXGPT is powered by Supabase. Here's how the core tables fit together."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            name: "profiles",
            desc: "One row per user. Display name, avatar, preferences.",
          },
          {
            name: "user_roles",
            desc: "Separate role table (app_role enum) — never store roles on profiles.",
          },
          {
            name: "projects",
            desc: "Owned workspaces containing chats, files, and member invites.",
          },
        ].map((t) => (
          <div
            key={t.name}
            className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur"
          >
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[color:var(--brand)]" />
              <code className="font-mono text-sm">{t.name}</code>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t.desc}</p>
          </div>
        ))}
      </div>

      <CodeBlock
        filename="schema.sql"
        language="sql"
        code={`-- Role check helper (SECURITY DEFINER, avoids RLS recursion)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;`}
      />

      <Callout tone="warning" title="Row Level Security is mandatory">
        Every table in the <code>public</code> schema must enable RLS and
        expose only the minimum grants required by its policies.
      </Callout>
    </Section>
  );
}

function PricingPlans() {
  const plans = [
    { name: "Free", price: "$0", features: [true, true, false, false, false] },
    { name: "Premium", price: "$9", features: [true, true, true, false, false] },
    { name: "Plus", price: "$19", features: [true, true, true, true, false], highlight: true },
    { name: "Pro", price: "$49", features: [true, true, true, true, true] },
  ];
  const rows = [
    "Unlimited chat messages",
    "Standard AI models",
    "Advanced AI models",
    "Image generation & editing",
    "Priority support & SLA",
  ];

  return (
    <Section
      id="pricing-plans"
      eyebrow="Platform"
      title="Pricing Plans"
      description="Choose the tier that matches your workflow. Upgrade or downgrade anytime."
    >
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/60 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[40%]">Feature</TableHead>
              {plans.map((p) => (
                <TableHead key={p.name} className="text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={cn(
                        "font-semibold",
                        p.highlight && "text-[color:var(--brand)]",
                      )}
                    >
                      {p.name}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {p.price}/mo
                    </span>
                    {p.highlight && (
                      <Badge className="bg-[color:var(--brand)]/15 text-[color:var(--brand)] border-[color:var(--brand)]/30">
                        Popular
                      </Badge>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={row}>
                <TableCell className="font-medium">{row}</TableCell>
                {plans.map((p) => (
                  <TableCell key={p.name} className="text-center">
                    {p.features[i] ? (
                      <Check className="mx-auto h-4 w-4 text-[color:var(--brand)]" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/">
          <Button className="bg-[color:var(--brand)] text-[color:var(--brand-foreground)] hover:opacity-90">
            <Sparkles className="mr-2 h-4 w-4" />
            Start free
          </Button>
        </Link>
        <Link to="/help">
          <Button variant="outline">Talk to support</Button>
        </Link>
      </div>
    </Section>
  );
}

// ===========================================================================
// Utilities
// ===========================================================================

/**
 * Smooth-scroll to a hash target and update the URL without triggering a
 * full router navigation. Respects prefers-reduced-motion via CSS in base.
 */
function smoothScroll(
  e: React.MouseEvent<HTMLAnchorElement>,
  id: string,
) {
  e.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

/**
 * Track which section is currently in view using IntersectionObserver.
 * Returns the id of the topmost intersecting section, so the sidebar and
 * ToC highlight stays in sync with the reader's position.
 */
function useScrollSpy(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    const observed: HTMLElement[] = [];
    const visible = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) visible.set(id, entry.intersectionRatio);
          else visible.delete(id);
        }
        if (visible.size === 0) return;
        // Pick the section closest to the top of the viewport that is visible.
        const best = idsRef.current.find((id) => visible.has(id));
        if (best) setActive(best);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] },
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
        observed.push(el);
      }
    }
    return () => observer.disconnect();
    // ids is a stable derived list; re-run when its identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|")]);

  return active;
}

/**
 * Extremely small syntax highlighter — highlights comments, strings,
 * numbers, and a handful of keywords. This intentionally avoids a heavy
 * dependency; for richer highlighting swap in Shiki or Prism later.
 */
function highlight(code: string, lang: string): string {
  // Escape HTML first — the output is injected via dangerouslySetInnerHTML.
  const esc = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const keywords =
    /\b(import|from|export|const|let|var|function|return|if|else|await|async|class|new|type|interface|select|create|or|replace|as|language|stable|security|definer|set|search_path|exists|where|and|true|false)\b/g;

  return esc
    .replace(/(#|--).*$/gm, (m) => `<span style="color:oklch(0.62 0.02 150)">${m}</span>`)
    .replace(/(\/\/.*$)/gm, (m) => `<span style="color:oklch(0.62 0.02 150)">${m}</span>`)
    .replace(/("[^"\n]*"|'[^'\n]*'|`[^`\n]*`)/g, (m) => `<span style="color:oklch(0.82 0.13 95)">${m}</span>`)
    .replace(/\b(\d+)\b/g, (m) => `<span style="color:oklch(0.78 0.14 60)">${m}</span>`)
    .replace(keywords, (m) => `<span style="color:oklch(0.78 0.14 158)">${m}</span>`)
    // language token is unused visually but keeps signature stable for future
    // per-language rules (e.g. sql vs ts).
    + (lang ? "" : "");
}
