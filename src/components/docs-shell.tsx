/**
 * DocsShell — shared layout for the public `/docs` surface.
 *
 * Provides:
 *  - Sticky top bar with Cmd/Ctrl+K search (recent searches persisted)
 *  - Reading progress bar
 *  - Sticky sidebar with unlimited nested pages, collapsible categories,
 *    persisted collapse state, active auto-scroll, resize handle, mobile drawer
 *  - Keyboard navigation (Cmd/Ctrl+K, "/", Arrow keys inside the palette)
 *  - Prefetch of adjacent pages via TanStack Router `preload="intent"`
 */
import { Link, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { PrismXLogo } from "@/components/prismx-logo";
import {
  ArrowLeft,
  Search,
  Menu,
  X,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Command,
  Hash,
  CornerDownLeft,
  Clock,
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
  pagesByParent: Map<string | null, DocPage[]>;
  allPages: DocPage[];
};

const COLLAPSE_KEY = "prismx:docs:collapsed-categories";
const SIDEBAR_WIDTH_KEY = "prismx:docs:sidebar-width";
const RECENT_SEARCH_KEY = "prismx:docs:recent-searches";

export function useDocsTree() {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    tree: DocsTree;
  }>({
    loading: true,
    error: null,
    tree: { categories: [], pagesByCategory: new Map(), pagesByParent: new Map(), allPages: [] },
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
            "id, category_id, parent_id, slug, title, description, sort_order, tags, updated_at, reading_minutes, is_featured, is_pinned, homepage_section, author, related_slugs, view_count",
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
          tree: { categories: [], pagesByCategory: new Map(), pagesByParent: new Map(), allPages: [] },
        });
        return;
      }
      const categories = (cats ?? []) as DocCategory[];
      const allPages = (pages ?? []) as DocPage[];
      const pagesByCategory = new Map<string | null, DocPage[]>();
      const pagesByParent = new Map<string | null, DocPage[]>();
      allPages.forEach((p) => {
        const cKey = p.category_id ?? null;
        (pagesByCategory.get(cKey) ?? pagesByCategory.set(cKey, []).get(cKey)!).push(p);
        const pKey = p.parent_id ?? null;
        (pagesByParent.get(pKey) ?? pagesByParent.set(pKey, []).get(pKey)!).push(p);
      });
      setState({ loading: false, error: null, tree: { categories, pagesByCategory, pagesByParent, allPages } });
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}

/* --------------------------- Reading progress --------------------------- */

function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const total = doc.scrollHeight - doc.clientHeight;
      const p = total <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / total));
      setProgress(p);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent print:hidden">
      <div className="h-full transition-[width] duration-100 ease-out" style={{ width: `${progress * 100}%`, background: "var(--gradient-brand)" }} />
    </div>
  );
}

/* --------------------------- Command palette --------------------------- */

function highlight(text: string, needle: string): ReactNode {
  if (!needle) return text;
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-brand/25 px-0.5 text-brand">{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  );
}

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) ?? "[]"); } catch { return []; }
}
function saveRecent(term: string) {
  try {
    const cur = loadRecent();
    const next = [term, ...cur.filter((x) => x !== term)].slice(0, 5);
    localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
  } catch { /* noop */ }
}

function CommandPalette({ open, onClose, tree }: { open: boolean; onClose: () => void; tree: DocsTree }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setRecent(loadRecent());
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return tree.allPages.slice(0, 12);
    return tree.allPages
      .map((p) => {
        const hay = `${p.title}\n${p.slug}\n${p.description ?? ""}\n${(p.tags ?? []).join(" ")}`.toLowerCase();
        const idx = hay.indexOf(needle);
        return { p, score: idx < 0 ? Infinity : idx };
      })
      .filter((r) => r.score !== Infinity)
      .sort((a, b) => a.score - b.score)
      .slice(0, 20)
      .map((r) => r.p);
  }, [q, tree.allPages]);

  const go = useCallback((slug: string, term: string) => {
    if (term.trim()) saveRecent(term.trim());
    onClose();
    navigate({ to: "/docs/$slug", params: { slug } });
  }, [navigate, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); const p = results[active]; if (p) go(p.slug, q); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, active, q, go]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-background/70 p-4 pt-24 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-label="Search documentation" className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            placeholder="Search title, slug, tags…"
            className="w-full bg-transparent py-4 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="Search"
          />
          <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">Esc</kbd>
        </div>
        {!q && recent.length > 0 && (
          <div className="border-b border-border px-3 py-2">
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</div>
            <div className="flex flex-wrap gap-1">
              {recent.map((r) => (
                <button key={r} onClick={() => { setQ(r); setActive(0); }} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                  <Clock className="h-3 w-3" /> {r}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No pages match “{q}”.</div>
          ) : (
            results.map((p, i) => (
              <button
                key={p.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(p.slug, q)}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition ${
                  i === active ? "bg-brand/10 text-foreground" : "text-foreground/80 hover:bg-accent"
                }`}
              >
                <Hash className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{highlight(p.title, q)}</div>
                  {p.description && <div className="truncate text-xs text-muted-foreground">{highlight(p.description, q)}</div>}
                </div>
                {i === active && <CornerDownLeft className="mt-1 h-3.5 w-3.5 flex-none text-muted-foreground" />}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <span><kbd className="rounded border border-border bg-background px-1">↑</kbd> <kbd className="rounded border border-border bg-background px-1">↓</kbd> navigate</span>
          <span><kbd className="rounded border border-border bg-background px-1">↵</kbd> open · <kbd className="rounded border border-border bg-background px-1">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Nested sidebar tree --------------------------- */

function PageTree({
  parentId,
  tree,
  activeSlug,
  depth,
  onNavigate,
}: {
  parentId: string | null;
  tree: DocsTree;
  activeSlug: string | null;
  depth: number;
  onNavigate: () => void;
}) {
  const items = tree.pagesByParent.get(parentId) ?? [];
  if (items.length === 0) return null;
  return (
    <div className={depth > 0 ? "ml-2 space-y-0.5 border-l border-border/60 pl-2" : "space-y-0.5"}>
      {items.map((p) => {
        const isActive = activeSlug === p.slug;
        const hasChildren = (tree.pagesByParent.get(p.id) ?? []).length > 0;
        return (
          <PageTreeItem
            key={p.id}
            page={p}
            isActive={isActive}
            hasChildren={hasChildren}
            tree={tree}
            activeSlug={activeSlug}
            depth={depth}
            onNavigate={onNavigate}
          />
        );
      })}
    </div>
  );
}

function PageTreeItem({
  page,
  isActive,
  hasChildren,
  tree,
  activeSlug,
  depth,
  onNavigate,
}: {
  page: DocPage;
  isActive: boolean;
  hasChildren: boolean;
  tree: DocsTree;
  activeSlug: string | null;
  depth: number;
  onNavigate: () => void;
}) {
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  // Detect if any descendant matches the active slug so we auto-expand ancestor branches.
  const hasActiveDescendant = useMemo(() => {
    if (!activeSlug) return false;
    const stack = [...(tree.pagesByParent.get(page.id) ?? [])];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.slug === activeSlug) return true;
      const kids = tree.pagesByParent.get(n.id);
      if (kids) stack.push(...kids);
    }
    return false;
  }, [activeSlug, page.id, tree.pagesByParent]);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (hasActiveDescendant) setOpen(true);
  }, [hasActiveDescendant]);
  useEffect(() => {
    if (isActive && activeRef.current) activeRef.current.scrollIntoView({ block: "nearest" });
  }, [isActive]);

  return (
    <div>
      <div className="flex items-center">
        {hasChildren && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="mr-0.5 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={open ? "Collapse" : "Expand"}
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        )}
        <Link
          ref={isActive ? activeRef : undefined}
          to="/docs/$slug"
          params={{ slug: page.slug }}
          preload="intent"
          onClick={onNavigate}
          className={`block flex-1 rounded-lg px-2 py-1.5 text-sm transition ${
            isActive ? "bg-brand/10 text-brand" : "text-foreground/80 hover:bg-accent hover:text-foreground"
          }`}
        >
          {page.title}
        </Link>
      </div>
      {hasChildren && open && (
        <PageTree parentId={page.id} tree={tree} activeSlug={activeSlug} depth={depth + 1} onNavigate={onNavigate} />
      )}
    </div>
  );
}

function CategorySection({
  cat,
  tree,
  activeSlug,
  collapsed,
  onToggle,
  onNavigate,
}: {
  cat: DocCategory;
  tree: DocsTree;
  activeSlug: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  // Only render top-level pages (parent_id === null) for this category
  const topLevel = (tree.pagesByCategory.get(cat.id) ?? []).filter((p) => !p.parent_id);
  if (topLevel.length === 0) return null;
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
      >
        <span>{cat.title}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
      </button>
      {!collapsed && (
        <div className="space-y-0.5">
          {topLevel.map((p) => {
            const isActive = activeSlug === p.slug;
            const hasChildren = (tree.pagesByParent.get(p.id) ?? []).length > 0;
            return (
              <PageTreeItem
                key={p.id}
                page={p}
                isActive={isActive}
                hasChildren={hasChildren}
                tree={tree}
                activeSlug={activeSlug}
                depth={0}
                onNavigate={onNavigate}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Shell --------------------------- */

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
  const [mobileNav, setMobileNav] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const resizing = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(JSON.parse(raw));
      const w = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
      if (w && w >= 200 && w <= 480) setSidebarWidth(w);
    } catch { /* noop */ }
  }, []);

  // Auto-expand category holding the active slug
  useEffect(() => {
    if (!activeSlug) return;
    const active = tree.allPages.find((p) => p.slug === activeSlug);
    if (!active?.category_id) return;
    setCollapsed((c) => (c[active.category_id!] ? { ...c, [active.category_id!]: false } : c));
  }, [activeSlug, tree.allPages]);

  const toggleCat = useCallback((id: string) => {
    setCollapsed((c) => {
      const next = { ...c, [id]: !c[id] };
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  // Sidebar resize (desktop only)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const w = Math.min(480, Math.max(200, e.clientX));
      setSidebarWidth(w);
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.cursor = "";
      try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)); } catch { /* noop */ }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [sidebarWidth]);

  // Cmd/Ctrl+K + "/" to open palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "/" && !paletteOpen) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ReadingProgress />

      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur print:hidden">
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
          <Link to="/docs" className="hidden text-xs text-muted-foreground transition hover:text-foreground sm:inline">/ Docs</Link>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="group flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:border-brand/40 hover:text-foreground"
              aria-label="Search documentation (Ctrl+K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search documentation…</span>
              <span className="sm:hidden">Search</span>
              <kbd className="ml-1 hidden items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </button>
            <Link to="/chat" className="hidden rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-foreground sm:inline-flex" style={{ background: "var(--gradient-brand)" }}>
              Open chat
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-8 sm:px-6">
        {/* Sidebar */}
        <aside
          style={{ width: mobileNav ? undefined : sidebarWidth }}
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] overflow-y-auto border-r border-border bg-card px-4 py-6 transition-transform md:sticky md:top-16 md:z-auto md:h-[calc(100vh-4rem)] md:max-w-none md:translate-x-0 md:border-0 md:bg-transparent md:px-0 md:py-0 print:hidden ${
            mobileNav ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
        >
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <nav className="space-y-5" aria-label="Documentation navigation">
              <Link
                to="/docs"
                onClick={() => setMobileNav(false)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium ${
                  !activeSlug ? "bg-brand/10 text-brand" : "text-foreground/80 hover:bg-accent"
                }`}
              >
                <BookOpen className="h-4 w-4" /> Overview
              </Link>
              {tree.categories.map((cat) => (
                <CategorySection
                  key={cat.id}
                  cat={cat}
                  tree={tree}
                  activeSlug={activeSlug}
                  collapsed={!!collapsed[cat.id]}
                  onToggle={() => toggleCat(cat.id)}
                  onNavigate={() => setMobileNav(false)}
                />
              ))}
              {/* Uncategorized top-level pages */}
              {(tree.pagesByCategory.get(null) ?? []).filter((p) => !p.parent_id).length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other</div>
                  <PageTree parentId={null} tree={{ ...tree, pagesByParent: new Map([[null, (tree.pagesByCategory.get(null) ?? []).filter((p) => !p.parent_id)]]) }} activeSlug={activeSlug} depth={0} onNavigate={() => setMobileNav(false)} />
                </div>
              )}
              {tree.categories.length === 0 && tree.allPages.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                  No documentation has been published yet.
                </div>
              )}
            </nav>
          )}

          <div className="mt-8 border-t border-border pt-4 text-xs">
            <Link to="/" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> Back to home
            </Link>
          </div>
        </aside>

        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onMouseDown={() => { resizing.current = true; document.body.style.cursor = "col-resize"; }}
          className="hidden w-1 cursor-col-resize bg-transparent hover:bg-brand/30 md:block print:hidden"
        />

        {mobileNav && (
          <div className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm md:hidden" onClick={() => setMobileNav(false)} />
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} tree={tree} />
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: Array<{ label: string; to?: string; params?: Record<string, string> }>;
}) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {it.to ? (
            <Link to={it.to as never} params={it.params as never} className="hover:text-foreground">{it.label}</Link>
          ) : (
            <span className="text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
