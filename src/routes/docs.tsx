/**
 * Documentation homepage. Fully data-driven — every section is derived from
 * `documentation_pages` fields (`is_featured`, `is_pinned`, `homepage_section`,
 * tags, view_count, updated_at) so admins control the layout from the CMS.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DocsShell, useDocsTree, type DocPage } from "@/components/docs-shell";
import {
  BookOpen,
  ArrowRight,
  Sparkles,
  Clock,
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
      { name: "description", content: "Guides, references, and how-tos for PrismXGPT — chat, image generation, projects, and more." },
      { property: "og:title", content: "Documentation — PrismXGPT" },
      { property: "og:description", content: "Guides, references, and how-tos for PrismXGPT." },
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

const SECTIONS: Array<{ key: string; title: string; icon: React.ReactNode; description: string }> = [
  { key: "api", title: "API Reference", icon: <Code2 className="h-4 w-4" />, description: "Endpoints, schemas, and authentication." },
  { key: "sdk", title: "SDKs", icon: <Package className="h-4 w-4" />, description: "Client libraries and integration helpers." },
  { key: "tutorials", title: "Tutorials", icon: <GraduationCap className="h-4 w-4" />, description: "Step-by-step guides for common workflows." },
  { key: "examples", title: "Examples", icon: <Blocks className="h-4 w-4" />, description: "Working samples you can copy and adapt." },
  { key: "changelog", title: "Changelog", icon: <History className="h-4 w-4" />, description: "What's new and what changed." },
  { key: "community", title: "Community", icon: <Users className="h-4 w-4" />, description: "Discussions, support, and events." },
];

function DocsIndex() {
  const { tree, loading } = useDocsTree();
  const all = tree.allPages as PageWithMeta[];

  const featured = useMemo(() => {
    const flagged = all.filter((p) => p.is_featured);
    return (flagged.length ? flagged : all).slice(0, 3);
  }, [all]);

  const pinned = useMemo(() => all.filter((p) => p.is_pinned).slice(0, 4), [all]);

  const popular = useMemo(
    () => [...all].sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0)).filter((p) => (p.view_count ?? 0) > 0).slice(0, 6),
    [all],
  );

  const recent = useMemo(
    () => [...all]
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

  return (
    <DocsShell activeSlug={null} tree={tree} loading={loading}>
      {/* Hero */}
      <section className="mb-14 border-b border-border pb-12">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5 text-brand" /> Documentation
        </div>
        <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
          Build with <span className="font-display italic text-brand">PrismXGPT</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Everything you need to ship — from your first chat and image generation to advanced workflows, projects, and API references.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <kbd className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px]">
            <Command className="h-3 w-3" />K
          </kbd>
          <span>to search the docs from anywhere</span>
        </div>
      </section>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading documentation…</div>
      ) : all.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No documentation has been published yet.
        </div>
      ) : (
        <div className="space-y-14">
          {/* Pinned */}
          {pinned.length > 0 && (
            <SectionBlock icon={<Pin className="h-4 w-4" />} title="Pinned">
              <div className="grid gap-2 sm:grid-cols-2">
                {pinned.map((p) => (
                  <PageRow key={p.id} page={p} />
                ))}
              </div>
            </SectionBlock>
          )}

          {/* Featured */}
          {featured.length > 0 && (
            <SectionBlock icon={<Sparkles className="h-4 w-4" />} title="Featured guides">
              <div className="grid gap-4 md:grid-cols-3">
                {featured.map((p) => (
                  <Link
                    key={p.id}
                    to="/docs/$slug"
                    params={{ slug: p.slug }}
                    preload="intent"
                    className="group flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lg"
                  >
                    <div>
                      <div className="text-base font-semibold text-foreground group-hover:text-brand">{p.title}</div>
                      {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                    </div>
                    <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand">
                      Read guide <ArrowRight className="h-3 w-3" />
                    </div>
                  </Link>
                ))}
              </div>
            </SectionBlock>
          )}

          {/* Popular */}
          {popular.length > 0 && (
            <SectionBlock icon={<TrendingUp className="h-4 w-4" />} title="Popular guides">
              <div className="grid gap-2 sm:grid-cols-2">
                {popular.map((p) => <PageRow key={p.id} page={p} />)}
              </div>
            </SectionBlock>
          )}

          {/* Quick start */}
          {quickStart.length > 0 && (
            <SectionBlock icon={<Zap className="h-4 w-4" />} title="Quick start">
              <div className="grid gap-2 sm:grid-cols-2">
                {quickStart.slice(0, 6).map((p, i) => (
                  <Link
                    key={p.id}
                    to="/docs/$slug"
                    params={{ slug: p.slug }}
                    preload="intent"
                    className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition hover:border-brand/40"
                  >
                    <span className="grid h-7 w-7 flex-none place-items-center rounded-full border border-border bg-background text-xs font-mono text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90 group-hover:text-brand">{p.title}</span>
                    <ArrowRight className="h-3.5 w-3.5 flex-none text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
                  </Link>
                ))}
              </div>
            </SectionBlock>
          )}

          {/* Recent updates */}
          {recent.length > 0 && (
            <SectionBlock icon={<Clock className="h-4 w-4" />} title="Recent updates">
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {recent.map((p) => (
                  <li key={p.id}>
                    <Link to="/docs/$slug" params={{ slug: p.slug }} preload="intent"
                      className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-accent/40">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{p.title}</div>
                        {p.description && <div className="truncate text-xs text-muted-foreground">{p.description}</div>}
                      </div>
                      <div className="flex-none text-xs text-muted-foreground">
                        {p.updated_at ? new Date(p.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

          {/* Homepage sections (API / SDKs / Tutorials / Examples / Changelog / Community) */}
          {SECTIONS.map((s) => {
            const items = bySection.get(s.key) ?? [];
            if (items.length === 0) return null;
            return (
              <SectionBlock key={s.key} icon={s.icon} title={s.title} subtitle={s.description}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.slice(0, 6).map((p) => <PageRow key={p.id} page={p} />)}
                </div>
              </SectionBlock>
            );
          })}

          {/* Categories */}
          <SectionBlock icon={<BookText className="h-4 w-4" />} title="Browse by category">
            <div className="grid gap-5 sm:grid-cols-2">
              {tree.categories.map((cat) => {
                const pages = tree.pagesByCategory.get(cat.id) ?? [];
                return (
                  <div key={cat.id} className="rounded-2xl border border-border bg-card p-6 transition hover:border-brand/40">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand">{cat.title}</div>
                    {cat.description && <p className="mb-4 text-sm text-muted-foreground">{cat.description}</p>}
                    <ul className="space-y-1.5">
                      {pages.slice(0, 6).map((p) => (
                        <li key={p.id}>
                          <Link to="/docs/$slug" params={{ slug: p.slug }} preload="intent"
                            className="inline-flex items-center gap-1.5 text-sm text-foreground/85 transition hover:text-brand">
                            <ArrowRight className="h-3.5 w-3.5 opacity-60" /> {p.title}
                          </Link>
                        </li>
                      ))}
                      {pages.length === 0 && <li className="text-xs text-muted-foreground">No pages yet.</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          </SectionBlock>

          <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>© {new Date().getFullYear()} PrismXGPT</span>
              <div className="flex items-center gap-4">
                <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
                <Link to="/terms" className="hover:text-foreground">Terms</Link>
                <Link to="/help" className="hover:text-foreground">Help</Link>
              </div>
            </div>
          </footer>
        </div>
      )}
    </DocsShell>
  );
}

function SectionBlock({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-baseline gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
          <span className="text-brand">{icon}</span>
          {title}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground">— {subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function PageRow({ page }: { page: PageWithMeta }) {
  return (
    <Link
      to="/docs/$slug"
      params={{ slug: page.slug }}
      preload="intent"
      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition hover:border-brand/40"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground group-hover:text-brand">{page.title}</div>
        {page.description && <div className="truncate text-xs text-muted-foreground">{page.description}</div>}
      </div>
      <ArrowRight className="h-3.5 w-3.5 flex-none text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
    </Link>
  );
}
