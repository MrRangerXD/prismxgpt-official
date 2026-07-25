/**
 * DocsShell — shared layout for the public `/docs` surface.
 *
 * Loads categories + published pages from Supabase, renders a sidebar with
 * search, breadcrumbs, and (on a page) prev/next + table of contents.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PrismXLogo } from "@/components/prismx-logo";
import {
  ArrowLeft,
  Search,
  Menu,
  X,
  BookOpen,
  ChevronRight,
} from "lucide-react";

export type DocCategory = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
};

export type DocPage = {
  id: string;
  category_id: string | null;
  parent_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  sort_order: number;
  status?: string;
  tags?: string[] | null;
  updated_at?: string | null;
  reading_minutes?: number | null;
};

export type DocsTree = {
  categories: DocCategory[];
  pagesByCategory: Map<string | null, DocPage[]>;
  allPages: DocPage[];
};

export function useDocsTree() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    tree: DocsTree;
  }>({
    loading: true,
    error: null,
    tree: { categories: [], pagesByCategory: new Map(), allPages: [] },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: cats, error: cErr }, { data: pages, error: pErr }] = await Promise.all([
        supabase
          .from("documentation_categories" as never)
          .select("id, slug, title, description, icon, sort_order")
          .order("sort_order" as never, { ascending: true } as never),
        supabase
          .from("documentation_pages" as never)
          .select(
            "id, category_id, parent_id, slug, title, description, sort_order, tags, updated_at, reading_minutes",
          )
          .eq("status" as never, "published" as never)
          .eq("visibility" as never, "public" as never)
          .order("sort_order" as never, { ascending: true } as never),
      ]);
      if (cancelled) return;
      if (cErr || pErr) {
        setState({
          loading: false,
          error: (cErr || pErr)?.message ?? "Failed to load docs",
          tree: { categories: [], pagesByCategory: new Map(), allPages: [] },
        });
        return;
      }
      const categories = (cats ?? []) as DocCategory[];
      const allPages = (pages ?? []) as DocPage[];
      const pagesByCategory = new Map<string | null, DocPage[]>();
      allPages.forEach((p) => {
        const key = p.category_id ?? null;
        const list = pagesByCategory.get(key) ?? [];
        list.push(p);
        pagesByCategory.set(key, list);
      });
      setState({
        loading: false,
        error: null,
        tree: { categories, pagesByCategory, allPages },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function DocsShell({
  activeSlug,
  children,
  tree,
  loading,
}: {
  activeSlug: string | null;
  children: ReactNode;
  tree: DocsTree;
  loading: boolean;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const filtered = useMemo(() => {
    if (!q.trim()) return tree.allPages;
    const needle = q.toLowerCase();
    return tree.allPages.filter(
      (p) =>
        p.title.toLowerCase().includes(needle) ||
        (p.description ?? "").toLowerCase().includes(needle) ||
        (p.tags ?? []).some((t) => t.toLowerCase().includes(needle)),
    );
  }, [q, tree.allPages]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent md:hidden"
            onClick={() => setMobileNav((v) => !v)}
            aria-label="Toggle docs navigation"
          >
            {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to="/" className="flex items-center gap-2">
            <PrismXLogo size="sm" />
            <span className="text-sm font-semibold tracking-tight">PrismXGPT</span>
          </Link>
          <span className="hidden text-xs text-muted-foreground sm:inline">/ Docs</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm md:flex">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search docs…"
                className="w-56 bg-transparent outline-none"
              />
            </div>
            <Link
              to="/chat"
              className="hidden rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-foreground sm:inline-flex"
              style={{ background: "var(--gradient-brand)" }}
            >
              Open chat
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-8 sm:px-6">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] overflow-y-auto border-r border-border bg-card px-4 py-6 transition-transform md:sticky md:top-16 md:z-auto md:h-[calc(100vh-4rem)] md:w-64 md:max-w-none md:translate-x-0 md:border-0 md:bg-transparent md:px-0 md:py-0 ${
            mobileNav ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
        >
          <div className="mb-4 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm md:hidden">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search docs…"
              className="flex-1 bg-transparent outline-none"
            />
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : q.trim() ? (
            <div className="space-y-1">
              <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Results ({filtered.length})
              </div>
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setMobileNav(false);
                    setQ("");
                    navigate({ to: "/docs/$slug", params: { slug: p.slug } });
                  }}
                  className={`w-full rounded-lg px-2 py-1.5 text-left text-sm transition ${
                    activeSlug === p.slug
                      ? "bg-brand/10 text-brand"
                      : "text-foreground/80 hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {p.title}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">No pages match.</div>
              )}
            </div>
          ) : (
            <nav className="space-y-5">
              <Link
                to="/docs"
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium ${
                  !activeSlug ? "bg-brand/10 text-brand" : "text-foreground/80 hover:bg-accent"
                }`}
              >
                <BookOpen className="h-4 w-4" /> Overview
              </Link>
              {tree.categories.map((cat) => {
                const pages = tree.pagesByCategory.get(cat.id) ?? [];
                if (pages.length === 0) return null;
                return (
                  <div key={cat.id}>
                    <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {cat.title}
                    </div>
                    <div className="space-y-0.5">
                      {pages.map((p) => (
                        <Link
                          key={p.id}
                          to="/docs/$slug"
                          params={{ slug: p.slug }}
                          onClick={() => setMobileNav(false)}
                          className={`block rounded-lg px-2 py-1.5 text-sm transition ${
                            activeSlug === p.slug
                              ? "bg-brand/10 text-brand"
                              : "text-foreground/80 hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          {p.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
              {tree.categories.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                  No documentation has been published yet.
                </div>
              )}
            </nav>
          )}

          <div className="mt-8 border-t border-border pt-4 text-xs">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to home
            </Link>
          </div>
        </aside>

        {mobileNav && (
          <div
            className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileNav(false)}
          />
        )}

        {/* Content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: Array<{ label: string; to?: string; params?: Record<string, string> }>;
}) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {it.to ? (
            <Link
              to={it.to as never}
              params={it.params as never}
              className="hover:text-foreground"
            >
              {it.label}
            </Link>
          ) : (
            <span className="text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
