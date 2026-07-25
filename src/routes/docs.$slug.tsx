import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DocsShell, Breadcrumbs, useDocsTree, type DocPage } from "@/components/docs-shell";
import { DocMarkdown, extractHeadings, type Heading } from "@/components/doc-markdown";
import { ArrowLeft, ArrowRight, Clock, Link as LinkIcon, Share2, Tag } from "lucide-react";
import { toast } from "sonner";

type FullPage = DocPage & {
  content: string;
  cover_image: string | null;
  version: string | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
};

export const Route = createFileRoute("/docs/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — PrismXGPT Docs` },
      { name: "description", content: `Documentation page: ${params.slug}` },
      {
        property: "og:url",
        content: `https://prismxgpt.lovable.app/docs/${params.slug}`,
      },
    ],
    links: [
      { rel: "canonical", href: `https://prismxgpt.lovable.app/docs/${params.slug}` },
    ],
  }),
  component: DocPageView,
});

function DocPageView() {
  const { slug } = Route.useParams();
  const { tree, loading: treeLoading } = useDocsTree();

  const [page, setPage] = useState<FullPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFoundState(false);
    (async () => {
      const { data, error } = await supabase
        .from("documentation_pages" as never)
        .select(
          "id, category_id, parent_id, slug, title, description, content, cover_image, tags, version, sort_order, reading_minutes, seo_title, seo_description, published_at, updated_at",
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
        setPage(data as FullPage);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const headings: Heading[] = useMemo(
    () => (page?.content ? extractHeadings(page.content) : []),
    [page?.content],
  );

  // Prev/next within the same category
  const { prev, next, categoryTitle } = useMemo(() => {
    if (!page)
      return { prev: null as DocPage | null, next: null as DocPage | null, categoryTitle: "" };
    const pages = tree.pagesByCategory.get(page.category_id ?? null) ?? [];
    const idx = pages.findIndex((p) => p.id === page.id);
    const cat = tree.categories.find((c) => c.id === page.category_id);
    return {
      prev: idx > 0 ? pages[idx - 1] : null,
      next: idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : null,
      categoryTitle: cat?.title ?? "",
    };
  }, [page, tree]);

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
    } catch {
      /* noop */
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied");
    } catch {
      /* noop */
    }
  };

  if (notFoundState && !loading) throw notFound();

  return (
    <DocsShell activeSlug={slug} tree={tree} loading={treeLoading}>
      {loading || !page ? (
        <div className="text-sm text-muted-foreground">Loading page…</div>
      ) : (
        <div className="flex gap-8">
          <article className="min-w-0 flex-1">
            <Breadcrumbs
              items={[
                { label: "Docs", to: "/docs" },
                ...(categoryTitle ? [{ label: categoryTitle }] : []),
                { label: page.title },
              ]}
            />
            <div className="mb-6">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {page.title}
              </h1>
              {page.description && (
                <p className="mt-2 text-muted-foreground">{page.description}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {page.reading_minutes ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {page.reading_minutes} min read
                  </span>
                ) : null}
                {page.updated_at && (
                  <span>Updated {new Date(page.updated_at).toLocaleDateString()}</span>
                )}
                {page.version && (
                  <span className="rounded-full border border-border bg-card px-2 py-0.5">
                    v{page.version}
                  </span>
                )}
                {(page.tags ?? []).slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5"
                  >
                    <Tag className="h-3 w-3" /> {t}
                  </span>
                ))}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={copyLink}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 hover:bg-accent"
                  >
                    <LinkIcon className="h-3 w-3" /> Copy link
                  </button>
                  <button
                    onClick={share}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 hover:bg-accent"
                  >
                    <Share2 className="h-3 w-3" /> Share
                  </button>
                </div>
              </div>
            </div>

            {page.cover_image && (
              <img
                src={page.cover_image}
                alt={page.title}
                className="mb-6 w-full rounded-2xl border border-border object-cover"
              />
            )}

            <DocMarkdown content={page.content} />

            {/* Prev / next */}
            <div className="mt-12 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
              {prev ? (
                <Link
                  to="/docs/$slug"
                  params={{ slug: prev.slug }}
                  className="group rounded-xl border border-border bg-card p-4 transition hover:border-brand/40"
                >
                  <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowLeft className="h-3 w-3" /> Previous
                  </div>
                  <div className="font-medium text-foreground group-hover:text-brand">
                    {prev.title}
                  </div>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link
                  to="/docs/$slug"
                  params={{ slug: next.slug }}
                  className="group rounded-xl border border-border bg-card p-4 text-right transition hover:border-brand/40"
                >
                  <div className="mb-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                    Next <ArrowRight className="h-3 w-3" />
                  </div>
                  <div className="font-medium text-foreground group-hover:text-brand">
                    {next.title}
                  </div>
                </Link>
              ) : (
                <span />
              )}
            </div>
          </article>

          {/* Table of contents */}
          {headings.length > 0 && (
            <aside className="hidden w-56 flex-none xl:block">
              <div className="sticky top-24">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  On this page
                </div>
                <nav className="space-y-1 text-sm">
                  {headings.map((h) => (
                    <a
                      key={h.id}
                      href={`#${h.id}`}
                      className={`block border-l-2 py-1 pl-3 transition ${
                        activeHeading === h.id
                          ? "border-brand text-brand"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      } ${h.depth === 3 ? "pl-6 text-xs" : ""}`}
                    >
                      {h.text}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>
          )}
        </div>
      )}
    </DocsShell>
  );
}
