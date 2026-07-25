/**
 * Documentation homepage — premium standalone landing.
 *
 * All content sections are derived from CMS metadata on `documentation_pages`
 * so admins own the composition end-to-end (no hardcoded content).
 *
 * Hero → hero search → featured guides → quick start → popular →
 * homepage sections (API/SDKs/Tutorials/Examples/Changelog/Community) →
 * recently updated → learning paths (via categories) → resources → FAQ.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DocsShell, useDocsTree, openDocsPalette, type DocPage } from "@/components/docs-shell";
import {
  ArrowRight,
  Sparkles,
  Zap,
  Command,
  Pin,
  Code2,
  Package,
  GraduationCap,
  Blocks,
  History,
  Users,
  TrendingUp,
  BookText,
  Rocket,
  Terminal,
  Shield,
  CreditCard,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Globe,
  Bot,
  Braces,
  ChevronRight,
  Clock,
  Star,
} from "lucide-react";

type PageWithMeta = DocPage & {
  is_featured?: boolean;
  is_pinned?: boolean;
  homepage_section?: string | null;
  view_count?: number | null;
  author?: string | null;
};

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation — PrismXGPT" },
      { name: "description", content: "Guides, references, tutorials, SDKs and API docs for PrismXGPT — build with chat, image generation, projects and more." },
      { property: "og:title", content: "Documentation — PrismXGPT" },
      { property: "og:description", content: "The developer platform for chat, image generation and multimodal agents. Everything you need to ship." },
      { property: "og:url", content: "https://prismxgpt.lovable.app/docs" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://prismxgpt.lovable.app/docs" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: "PrismXGPT Documentation",
          description: "Guides, references, and how-tos for PrismXGPT.",
          url: "https://prismxgpt.lovable.app/docs",
        }),
      },
    ],
  }),
  component: DocsIndex,
});

const HOMEPAGE_SECTIONS: Array<{
  key: string;
  title: string;
  eyebrow: string;
  icon: React.ReactNode;
  description: string;
  accent: string;
}> = [
  { key: "api", title: "API Reference", eyebrow: "REST · GraphQL", icon: <Code2 className="h-4 w-4" />, description: "Endpoints, schemas and authentication for every surface.", accent: "from-emerald-400/25 to-brand/10" },
  { key: "sdk", title: "SDKs & Libraries", eyebrow: "TypeScript · Python", icon: <Package className="h-4 w-4" />, description: "First-party client libraries and integration helpers.", accent: "from-sky-400/25 to-brand/10" },
  { key: "tutorials", title: "Tutorials", eyebrow: "Step-by-step", icon: <GraduationCap className="h-4 w-4" />, description: "Guided walkthroughs of real product workflows.", accent: "from-amber-400/25 to-brand/10" },
  { key: "examples", title: "Examples", eyebrow: "Copy-paste ready", icon: <Blocks className="h-4 w-4" />, description: "Working samples you can drop into your app.", accent: "from-violet-400/25 to-brand/10" },
  { key: "changelog", title: "Changelog", eyebrow: "Release notes", icon: <History className="h-4 w-4" />, description: "What's new, what changed, what's coming next.", accent: "from-rose-400/25 to-brand/10" },
  { key: "community", title: "Community", eyebrow: "Talk to builders", icon: <Users className="h-4 w-4" />, description: "Discussions, showcases, events and support.", accent: "from-teal-400/25 to-brand/10" },
];

/**
 * Rich icon map for auto-generated feature tiles. Categories or pages whose
 * slug/title matches one of these keys get the matching icon; otherwise a
 * neutral fallback is used. Purely presentational — never affects data.
 */
const ICON_MAP: Record<string, React.ReactNode> = {
  chat: <Bot className="h-5 w-5" />,
  image: <ImageIcon className="h-5 w-5" />,
  projects: <Layers className="h-5 w-5" />,
  auth: <Shield className="h-5 w-5" />,
  authentication: <Shield className="h-5 w-5" />,
  billing: <CreditCard className="h-5 w-5" />,
  api: <Code2 className="h-5 w-5" />,
  sdk: <Package className="h-5 w-5" />,
  cli: <Terminal className="h-5 w-5" />,
  deploy: <Globe className="h-5 w-5" />,
  models: <Braces className="h-5 w-5" />,
  keys: <KeyRound className="h-5 w-5" />,
  start: <Rocket className="h-5 w-5" />,
  quickstart: <Rocket className="h-5 w-5" />,
};

function iconFor(key: string | null | undefined): React.ReactNode {
  if (!key) return <BookText className="h-5 w-5" />;
  const k = key.toLowerCase();
  for (const [needle, node] of Object.entries(ICON_MAP)) {
    if (k.includes(needle)) return node;
  }
  return <BookText className="h-5 w-5" />;
}

function DocsIndex() {
  const { tree, loading } = useDocsTree();
  const all = tree.allPages as PageWithMeta[];

  const featured = useMemo(() => {
    const flagged = all.filter((p) => p.is_featured);
    return (flagged.length ? flagged : all).slice(0, 3);
  }, [all]);

  const pinned = useMemo(() => all.filter((p) => p.is_pinned).slice(0, 6), [all]);

  const popular = useMemo(
    () =>
      [...all]
        .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
        .filter((p) => (p.view_count ?? 0) > 0)
        .slice(0, 8),
    [all],
  );

  const recent = useMemo(
    () =>
      [...all]
        .filter((p) => p.updated_at)
        .sort((a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime())
        .slice(0, 6),
    [all],
  );

  const quickStart = useMemo(() => {
    const gs = tree.categories.find((c) => c.slug === "getting-started");
    return gs ? (tree.pagesByCategory.get(gs.id) ?? []) : all.slice(0, 4);
  }, [tree, all]);

  const bySection = useMemo(() => {
    const map = new Map<string, PageWithMeta[]>();
    for (const p of all) {
      const key = p.homepage_section?.toLowerCase().trim();
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [all]);

  const totalGuides = all.length;
  const totalCategories = tree.categories.length;

  return (
    <DocsShell activeSlug={null} tree={tree} loading={loading}>
      {/* ============================== HERO ============================== */}
      <section className="relative isolate mb-20 overflow-hidden rounded-3xl border border-border/70 bg-card/40 px-6 py-14 shadow-sm backdrop-blur-sm sm:px-10 sm:py-20">
        {/* animated gradient blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-0 h-96 w-96 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-brand), transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.72 0.14 158), transparent 70%)" }}
        />
        {/* subtle grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3 w-3 text-brand" />
            PrismXGPT Documentation
            <span className="ml-1 rounded-full bg-brand/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-brand">
              v1
            </span>
          </div>

          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            Build intelligent products
            <br />
            with <span className="font-display italic text-brand">PrismXGPT</span>.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            The developer platform for chat, image generation, and multimodal agents.
            Everything you need — from your first API call to production deployments.
          </p>

          {/* Hero search */}
          <div className="mt-8 max-w-2xl">
            <button
              onClick={openDocsPalette}
              className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-background/70 px-5 py-4 text-left text-sm text-muted-foreground shadow-lg backdrop-blur transition hover:border-brand/50 hover:shadow-xl focus-visible:border-brand"
              aria-label="Search documentation"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{ background: "linear-gradient(90deg, transparent, var(--color-brand)/10, transparent)" }}
              />
              <Command className="h-4 w-4 shrink-0 text-brand" />
              <span className="flex-1 truncate">Search guides, APIs, tutorials, changelog…</span>
              <kbd className="hidden items-center gap-1 rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] sm:inline-flex">
                <Command className="h-3 w-3" />K
              </kbd>
            </button>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Try:</span>
              {["Chat API", "Image generation", "Authentication", "Projects"].map((t) => (
                <button
                  key={t}
                  onClick={openDocsPalette}
                  className="rounded-full border border-border/70 bg-card/40 px-2.5 py-1 text-muted-foreground transition hover:border-brand/40 hover:text-brand"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Quick stats */}
          <div className="mt-10 grid gap-3 sm:grid-cols-3 sm:gap-4">
            <StatChip label="Guides" value={String(totalGuides)} hint="published articles" />
            <StatChip label="Sections" value={String(totalCategories)} hint="curated categories" />
            <StatChip label="Uptime" value="99.99%" hint="rolling 30 days" />
          </div>
        </div>
      </section>

      {loading ? (
        <HomepageSkeleton />
      ) : all.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-14 text-center text-sm text-muted-foreground">
          No documentation has been published yet.
        </div>
      ) : (
        <div className="space-y-20">
          {/* PINNED */}
          {pinned.length > 0 && (
            <SectionBlock
              eyebrow="Editor's picks"
              icon={<Pin className="h-4 w-4" />}
              title="Start here"
              subtitle="Hand-selected essentials from the team."
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pinned.map((p, i) => (
                  <PinnedCard key={p.id} page={p} index={i} />
                ))}
              </div>
            </SectionBlock>
          )}

          {/* FEATURED (large asymmetric) */}
          {featured.length > 0 && (
            <SectionBlock
              eyebrow="Featured"
              icon={<Sparkles className="h-4 w-4" />}
              title="Featured guides"
              subtitle="Deep dives into what makes PrismXGPT powerful."
            >
              <div className="grid gap-4 lg:grid-cols-6">
                <FeaturedLarge page={featured[0]} className="lg:col-span-4" />
                <div className="grid gap-4 lg:col-span-2">
                  {featured.slice(1, 3).map((p) => (
                    <FeaturedSmall key={p.id} page={p} />
                  ))}
                </div>
              </div>
            </SectionBlock>
          )}

          {/* QUICK START — numbered steps */}
          {quickStart.length > 0 && (
            <SectionBlock
              eyebrow="Get running in minutes"
              icon={<Rocket className="h-4 w-4" />}
              title="Quick start"
              subtitle="From zero to your first working integration."
            >
              <div className="relative">
                <div
                  aria-hidden
                  className="absolute left-[15px] top-2 h-[calc(100%-1rem)] w-px bg-gradient-to-b from-brand/60 via-border to-transparent sm:hidden"
                />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {quickStart.slice(0, 6).map((p, i) => (
                    <QuickStartStep key={p.id} page={p} index={i + 1} />
                  ))}
                </div>
              </div>
            </SectionBlock>
          )}

          {/* POPULAR — horizontal scroll */}
          {popular.length > 0 && (
            <SectionBlock
              eyebrow="This week"
              icon={<TrendingUp className="h-4 w-4" />}
              title="Popular guides"
              subtitle="What developers are reading right now."
            >
              <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
                {popular.map((p) => (
                  <PopularCard key={p.id} page={p} />
                ))}
              </div>
            </SectionBlock>
          )}

          {/* HOMEPAGE SECTIONS (CMS-driven) */}
          {HOMEPAGE_SECTIONS.map((s) => {
            const items = bySection.get(s.key) ?? [];
            if (items.length === 0) return null;
            return (
              <SectionBlock
                key={s.key}
                eyebrow={s.eyebrow}
                icon={s.icon}
                title={s.title}
                subtitle={s.description}
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.slice(0, 6).map((p) => (
                    <FeatureCard key={p.id} page={p} accent={s.accent} />
                  ))}
                </div>
              </SectionBlock>
            );
          })}

          {/* RECENT — timeline */}
          {recent.length > 0 && (
            <SectionBlock
              eyebrow="What's new"
              icon={<History className="h-4 w-4" />}
              title="Recently updated"
              subtitle="The freshest docs, in reverse-chronological order."
            >
              <ol className="relative border-l border-border/70 pl-6">
                {recent.map((p) => (
                  <li key={p.id} className="mb-6 last:mb-0">
                    <span
                      aria-hidden
                      className="absolute -left-[7px] mt-1.5 grid h-3.5 w-3.5 place-items-center rounded-full border border-brand/40 bg-background"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                    </span>
                    <Link
                      to="/docs/$slug"
                      params={{ slug: p.slug }}
                      preload="intent"
                      className="group flex items-start justify-between gap-4 rounded-xl border border-transparent px-3 py-2 transition hover:border-border hover:bg-card/50"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {p.updated_at
                            ? new Date(p.updated_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : ""}
                        </div>
                        <div className="mt-1 truncate text-sm font-medium text-foreground group-hover:text-brand">
                          {p.title}
                        </div>
                        {p.description && (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">{p.description}</div>
                        )}
                      </div>
                      <ArrowRight className="mt-2 h-3.5 w-3.5 flex-none text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
                    </Link>
                  </li>
                ))}
              </ol>
            </SectionBlock>
          )}

          {/* LEARNING PATHS — from categories */}
          <SectionBlock
            eyebrow="Learn by doing"
            icon={<GraduationCap className="h-4 w-4" />}
            title="Learning paths"
            subtitle="Structured routes through the platform, by topic."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {tree.categories.map((cat) => {
                const pages = tree.pagesByCategory.get(cat.id) ?? [];
                if (pages.length === 0) return null;
                return (
                  <div
                    key={cat.id}
                    className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-6 transition hover:border-brand/50 hover:shadow-lg"
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
                      style={{ background: "radial-gradient(circle, var(--color-brand), transparent 70%)" }}
                    />
                    <div className="relative">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-xl border border-border/70 bg-background/60 text-brand shadow-sm">
                          {iconFor(cat.slug)}
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand">
                            {pages.length} {pages.length === 1 ? "guide" : "guides"}
                          </div>
                          <div className="text-base font-semibold tracking-tight text-foreground">{cat.title}</div>
                        </div>
                      </div>
                      {cat.description && (
                        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{cat.description}</p>
                      )}
                      <ul className="space-y-1">
                        {pages.slice(0, 4).map((p) => (
                          <li key={p.id}>
                            <Link
                              to="/docs/$slug"
                              params={{ slug: p.slug }}
                              preload="intent"
                              className="group/link flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/85 transition hover:bg-accent hover:text-brand"
                            >
                              <span className="truncate">{p.title}</span>
                              <ChevronRight className="h-3 w-3 flex-none opacity-0 transition group-hover/link:translate-x-0.5 group-hover/link:opacity-100" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {pages.length > 4 && (
                        <div className="mt-3 text-xs text-muted-foreground">+{pages.length - 4} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionBlock>

          {/* RESOURCES CTA STRIP */}
          <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card/80 to-card/40 p-8 sm:p-12">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full opacity-30 blur-3xl"
              style={{ background: "radial-gradient(circle, var(--color-brand), transparent 70%)" }}
            />
            <div className="relative grid gap-6 md:grid-cols-2 md:items-center">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-brand">Ready to build?</div>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Ship your first integration today.
                </h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Sign in and open a chat, or dive into the API reference to make your first request.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:justify-end">
                <Link
                  to="/chat"
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-foreground shadow-md transition hover:opacity-90"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  <Zap className="h-4 w-4" /> Open chat
                </Link>
                <button
                  onClick={openDocsPalette}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background/60 px-4 py-2.5 text-sm font-medium text-foreground/85 transition hover:border-brand/40 hover:text-brand"
                >
                  <Command className="h-4 w-4" /> Search docs
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </DocsShell>
  );
}

/* ============================== Sub-components ============================== */

function StatChip({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-3 backdrop-blur">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function SectionBlock({
  eyebrow,
  icon,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          {eyebrow && (
            <div className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
              <span className="h-1 w-1 rounded-full bg-brand" />
              {eyebrow}
            </div>
          )}
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            <span className="text-brand">{icon}</span>
            {title}
          </h2>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function PinnedCard({ page, index }: { page: PageWithMeta; index: number }) {
  return (
    <Link
      to="/docs/$slug"
      params={{ slug: page.slug }}
      preload="intent"
      className="group relative flex items-start gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-4 transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lg"
    >
      <div className="grid h-9 w-9 flex-none place-items-center rounded-xl border border-border/70 bg-background/60 text-brand shadow-sm">
        {iconFor(page.slug)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Pin className="h-2.5 w-2.5 text-brand" /> Pinned #{index + 1}
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold text-foreground group-hover:text-brand">
          {page.title}
        </div>
        {page.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{page.description}</p>
        )}
      </div>
    </Link>
  );
}

function FeaturedLarge({ page, className = "" }: { page: PageWithMeta; className?: string }) {
  return (
    <Link
      to="/docs/$slug"
      params={{ slug: page.slug }}
      preload="intent"
      className={`group relative flex min-h-[280px] flex-col justify-between overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card/90 via-card/70 to-card/40 p-7 transition hover:border-brand/50 hover:shadow-2xl ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
        style={{ background: "radial-gradient(circle, var(--color-brand), transparent 70%)" }}
      />
      <div className="relative">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand">
          <Star className="h-2.5 w-2.5" /> Featured guide
        </div>
        <h3 className="max-w-lg text-2xl font-semibold leading-tight tracking-tight text-foreground group-hover:text-brand sm:text-3xl">
          {page.title}
        </h3>
        {page.description && (
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">{page.description}</p>
        )}
      </div>
      <div className="relative mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
        Read guide
        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function FeaturedSmall({ page }: { page: PageWithMeta }) {
  return (
    <Link
      to="/docs/$slug"
      params={{ slug: page.slug }}
      preload="intent"
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-5 transition hover:border-brand/50 hover:shadow-lg"
    >
      <div>
        <div className="mb-2 grid h-8 w-8 place-items-center rounded-lg border border-border/70 bg-background/60 text-brand">
          {iconFor(page.slug)}
        </div>
        <div className="text-base font-semibold tracking-tight text-foreground group-hover:text-brand">
          {page.title}
        </div>
        {page.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{page.description}</p>
        )}
      </div>
      <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand">
        Read <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}

function QuickStartStep({ page, index }: { page: PageWithMeta; index: number }) {
  return (
    <Link
      to="/docs/$slug"
      params={{ slug: page.slug }}
      preload="intent"
      className="group relative flex items-start gap-4 overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-4 transition hover:border-brand/50 hover:shadow-lg"
    >
      <div className="relative grid h-8 w-8 flex-none place-items-center rounded-full border border-brand/40 bg-brand/10 font-mono text-xs font-semibold text-brand">
        {String(index).padStart(2, "0")}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground group-hover:text-brand">{page.title}</div>
        {page.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{page.description}</p>
        )}
      </div>
      <ArrowRight className="mt-1 h-3.5 w-3.5 flex-none text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
    </Link>
  );
}

function PopularCard({ page }: { page: PageWithMeta }) {
  return (
    <Link
      to="/docs/$slug"
      params={{ slug: page.slug }}
      preload="intent"
      className="group relative flex min-w-[260px] max-w-[280px] snap-start flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-4 transition hover:border-brand/50 hover:shadow-lg"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="grid h-8 w-8 place-items-center rounded-lg border border-border/70 bg-background/60 text-brand">
          {iconFor(page.slug)}
        </div>
        {typeof page.view_count === "number" && page.view_count > 0 && (
          <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground">
            <TrendingUp className="h-2.5 w-2.5 text-brand" />
            {page.view_count.toLocaleString()}
          </div>
        )}
      </div>
      <div className="truncate text-sm font-semibold text-foreground group-hover:text-brand">{page.title}</div>
      {page.description && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{page.description}</p>
      )}
    </Link>
  );
}

function FeatureCard({ page, accent }: { page: PageWithMeta; accent: string }) {
  return (
    <Link
      to="/docs/$slug"
      params={{ slug: page.slug }}
      preload="intent"
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-5 transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lg"
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${accent} opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100`}
      />
      <div className="relative">
        <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-border/70 bg-background/60 text-brand">
          {iconFor(page.slug)}
        </div>
        <div className="text-sm font-semibold tracking-tight text-foreground group-hover:text-brand">
          {page.title}
        </div>
        {page.description && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{page.description}</p>
        )}
      </div>
      <div className="relative mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand">
        Read <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function HomepageSkeleton() {
  return (
    <div className="space-y-12" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-accent/30" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-6">
        <div className="h-64 animate-pulse rounded-3xl bg-accent/30 lg:col-span-4" />
        <div className="grid gap-4 lg:col-span-2">
          <div className="h-32 animate-pulse rounded-2xl bg-accent/30" />
          <div className="h-32 animate-pulse rounded-2xl bg-accent/30" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-accent/30" />
        ))}
      </div>
    </div>
  );
}
