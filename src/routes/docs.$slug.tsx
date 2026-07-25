/**
 * Public single-doc page. Renders a full documentation experience:
 * breadcrumbs, meta (author, updated, reading time, version, tags),
 * TOC scroll-spy, prev/next, related articles, recently viewed, and
 * reader actions (copy link, share, print, fullscreen, edit page for admins).
 */
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DocsShell, Breadcrumbs, useDocsTree, type DocPage } from "@/components/docs-shell";
import { DocMarkdown, extractHeadings, type Heading } from "@/components/doc-markdown";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Link as LinkIcon,
  Share2,
  Tag,
  Printer,
  Maximize2,
  Minimize2,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";


type FullPage = DocPage & {
  content: string;
  cover_image: string | null;
  version: string | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  author: string | null;
  related_slugs: string[] | null;
};

const RECENT_KEY = "prismx:docs:recent";
function pushRecent(slug: string, title: string) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr: Array<{ slug: string; title: string }> = raw ? JSON.parse(raw) : [];
    const next = [{ slug, title }, ...arr.filter((x) => x.slug !== slug)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* noop */ }
}

function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export const Route = createFileRoute("/docs/$slug")({
  head: ({ params }) => {
    const pretty = prettifySlug(params.slug);
    const title = `${pretty} — PrismXGPT Docs`;
    const description = `${pretty}: guide, reference and examples in the PrismXGPT documentation.`;
    const url = `https://prismxgpt.lovable.app/docs/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { property: "og:image", content: "https://prismxgpt.lovable.app/og-image.png" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: "https://prismxgpt.lovable.app/og-image.png" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: DocPageView,
});


function DocPageView() {
  const { slug } = Route.useParams();
  const { tree, loading: treeLoading } = useDocsTree();
  

  const [page, setPage] = useState<FullPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFoundState(false);
    (async () => {
      const { data, error } = await supabase
        .from("documentation_pages" as never)
        .select(
          "id, category_id, parent_id, slug, title, description, content, cover_image, tags, version, sort_order, reading_minutes, seo_title, seo_description, published_at, updated_at, author, related_slugs",
        )
        .eq("slug" as never, slug as never)
        .eq("status" as never, "published" as never)
        .eq("visibility" as never, "public" as never)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFoundState(true);
        setPage(null);
      } else {
        const p = data as FullPage;
        setPage(p);
        pushRecent(p.slug, p.title);
        // Fire-and-forget popularity ping
        supabase.rpc("increment_doc_view" as never, { _slug: p.slug } as never).then(() => {}, () => {});
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const headings: Heading[] = useMemo(
    () => (page?.content ? extractHeadings(page.content) : []),
    [page?.content],
  );

  const { prev, next, categoryTitle } = useMemo(() => {
    if (!page) return { prev: null as DocPage | null, next: null as DocPage | null, categoryTitle: "" };
    const pages = tree.pagesByCategory.get(page.category_id ?? null) ?? [];
    const idx = pages.findIndex((p) => p.id === page.id);
    const cat = tree.categories.find((c) => c.id === page.category_id);
    return {
      prev: idx > 0 ? pages[idx - 1] : null,
      next: idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : null,
      categoryTitle: cat?.title ?? "",
    };
  }, [page, tree]);

  // Prefetch prev/next route data so navigation feels instant.
  const router = useRouter();
  useEffect(() => {
    if (prev) router.preloadRoute({ to: "/docs/$slug", params: { slug: prev.slug } }).catch(() => {});
    if (next) router.preloadRoute({ to: "/docs/$slug", params: { slug: next.slug } }).catch(() => {});
  }, [prev, next, router]);


  // Related: explicit related_slugs first, else tag overlap.
  const related = useMemo(() => {
    if (!page) return [] as DocPage[];
    const explicit = (page.related_slugs ?? [])
      .map((s) => tree.allPages.find((p) => p.slug === s))
      .filter((p): p is DocPage => !!p && p.id !== page.id);
    if (explicit.length) return explicit.slice(0, 4);
    const myTags = new Set(page.tags ?? []);
    if (myTags.size === 0) return [];
    return tree.allPages
      .filter((p) => p.id !== page.id && (p.tags ?? []).some((t) => myTags.has(t)))
      .slice(0, 4);
  }, [page, tree.allPages]);

  const recentlyViewed = useMemo(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(RECENT_KEY) : null;
      const arr: Array<{ slug: string; title: string }> = raw ? JSON.parse(raw) : [];
      return arr.filter((r) => r.slug !== slug).slice(0, 5);
    } catch { return []; }
  }, [slug, page?.id]);

  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  useEffect(() => {
    if (headings.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target?.id) setActiveHeading(visible.target.id);
      },
      { rootMargin: "-100px 0px -70% 0px", threshold: [0, 1] },
    );
    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [headings]);

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title: page?.title ?? "Docs", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch { /* noop */ }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); }
    catch { /* noop */ }
  };
  const print = () => window.print();

  if (notFoundState && !loading) throw notFound();

  return (
    <DocsShell activeSlug={slug} tree={tree} loading={treeLoading}>
      {loading || !page ? (
        <div className="space-y-4">
          <div className="h-4 w-40 animate-pulse rounded-md bg-accent/40" />
          <div className="h-10 w-3/4 animate-pulse rounded-md bg-accent/40" />
          <div className="h-4 w-1/2 animate-pulse rounded-md bg-accent/40" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded-md bg-accent/30" style={{ width: `${55 + ((i * 11) % 45)}%` }} />
            ))}
          </div>
        </div>
      ) : (
        <div className={`flex gap-8 ${fullscreen ? "fixed inset-0 z-50 overflow-y-auto bg-background p-6 md:p-12" : ""}`}>
          <article className="min-w-0 flex-1">
            <Breadcrumbs
              items={[
                { label: "Docs", to: "/docs" },
                ...(categoryTitle ? [{ label: categoryTitle }] : []),
                { label: page.title },
              ]}
            />
            <div className="mb-6">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{page.title}</h1>
              {page.description && <p className="mt-2 text-muted-foreground">{page.description}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {page.author && (
                  <span className="inline-flex items-center gap-1">
                    <UserIcon className="h-3 w-3" /> {page.author}
                  </span>
                )}
                {page.reading_minutes ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {page.reading_minutes} min read
                  </span>
                ) : null}
                {page.updated_at && <span>Updated {new Date(page.updated_at).toLocaleDateString()}</span>}
                {page.version && (
                  <span className="rounded-full border border-border bg-card px-2 py-0.5">v{page.version}</span>
                )}
                {(page.tags ?? []).slice(0, 4).map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5">
                    <Tag className="h-3 w-3" /> {t}
                  </span>
                ))}
                <div className="ml-auto flex flex-wrap items-center gap-1 print:hidden">
                  <button onClick={copyLink} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 hover:bg-accent">
                    <LinkIcon className="h-3 w-3" /> Copy
                  </button>
                  <button onClick={share} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 hover:bg-accent">
                    <Share2 className="h-3 w-3" /> Share
                  </button>
                  <button onClick={print} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 hover:bg-accent">
                    <Printer className="h-3 w-3" /> Print
                  </button>
                  <button onClick={() => setFullscreen((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 hover:bg-accent" aria-label="Toggle fullscreen">
                    {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                    {fullscreen ? "Exit" : "Focus"}
                  </button>


                </div>
              </div>
            </div>

            {page.cover_image && (
              <img src={page.cover_image} alt={page.title} className="mb-6 w-full rounded-2xl border border-border object-cover" />
            )}

            <DocMarkdown content={page.content} />

            {/* Related */}
            {related.length > 0 && (
              <section className="mt-12 border-t border-border pt-6">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Related</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {related.map((r) => (
                    <Link key={r.id} to="/docs/$slug" params={{ slug: r.slug }} preload="intent"
                      className="group rounded-xl border border-border bg-card p-4 transition hover:border-brand/40">
                      <div className="text-sm font-medium text-foreground group-hover:text-brand">{r.title}</div>
                      {r.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Prev / next */}
            <div className="mt-12 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
              {prev ? (
                <Link to="/docs/$slug" params={{ slug: prev.slug }} preload="intent"
                  className="group rounded-xl border border-border bg-card p-4 transition hover:border-brand/40">
                  <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowLeft className="h-3 w-3" /> Previous
                  </div>
                  <div className="font-medium text-foreground group-hover:text-brand">{prev.title}</div>
                </Link>
              ) : <span />}
              {next ? (
                <Link to="/docs/$slug" params={{ slug: next.slug }} preload="intent"
                  className="group rounded-xl border border-border bg-card p-4 text-right transition hover:border-brand/40">
                  <div className="mb-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                    Next <ArrowRight className="h-3 w-3" />
                  </div>
                  <div className="font-medium text-foreground group-hover:text-brand">{next.title}</div>
                </Link>
              ) : <span />}
            </div>
          </article>

          {/* Table of contents + recently viewed */}
          <aside className="hidden w-56 flex-none xl:block print:hidden">
            <div className="sticky top-24 space-y-6">
              {headings.length > 0 && (
                <div>
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">On this page</div>
                  <nav className="space-y-1 text-sm">
                    {headings.map((h) => (
                      <a
                        key={h.id}
                        href={`#${h.id}`}
                        className={`block border-l-2 py-1 pl-3 transition ${
                          activeHeading === h.id ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"
                        } ${h.depth === 3 ? "pl-6 text-xs" : ""}`}
                      >
                        {h.text}
                      </a>
                    ))}
                  </nav>
                </div>
              )}
              {recentlyViewed.length > 0 && (
                <div>
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recently viewed</div>
                  <ul className="space-y-1 text-sm">
                    {recentlyViewed.map((r) => (
                      <li key={r.slug}>
                        <Link to="/docs/$slug" params={{ slug: r.slug }} preload="intent"
                          className="line-clamp-1 text-muted-foreground hover:text-foreground">
                          {r.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </DocsShell>
  );
}
