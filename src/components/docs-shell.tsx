/**
 * DocsShell — premium standalone layout for /docs.
 *
 * A ground-up redesign: glass top nav, resizable icon sidebar, sticky reading
 * progress bar, quick-jump command palette, and a rich multi-column footer.
 *
 * Public API preserved so consumers (routes/docs.$slug.tsx) keep working:
 *   - useDocsTree()
 *   - DocsShell({ activeSlug, children, tree, loading })
 *   - Breadcrumbs, openDocsPalette, type DocCategory, DocPage, DocsTree
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
  Search,
  Menu,
  X,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Command,
  CornerDownLeft,
  Clock,
  Sparkles,
  Github,
  Twitter,
  MessageCircle,
  ArrowUpRight,
  Circle,
  FolderTree,
  Hash,
  PanelLeftClose,
  PanelLeftOpen,
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
const SIDEBAR_OPEN_KEY = "prismx:docs:sidebar-open";
const RECENT_SEARCH_KEY = "prismx:docs:recent-searches";

/* ============================== Data ============================== */

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

/* ============================== Reading progress ============================== */

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
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] bg-transparent print:hidden">
      <div
        className="h-full transition-[width] duration-100 ease-out"
        style={{ width: `${progress * 100}%`, background: "var(--gradient-brand)" }}
      />
    </div>
  );
}

/* ============================== Command palette ============================== */

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
    const next = [term, ...cur.filter((x) => x !== term)].slice(0, 6);
    localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
  } catch { /* noop */ }
}

const POPULAR_TERMS = ["Getting started", "Chat API", "Image generation", "Authentication", "Projects"];

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

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = !needle
      ? tree.allPages.slice(0, 20)
      : tree.allPages
          .map((p) => {
            const hay = `${p.title}\n${p.slug}\n${p.description ?? ""}\n${(p.tags ?? []).join(" ")}`.toLowerCase();
            const idx = hay.indexOf(needle);
            return { p, score: idx < 0 ? Infinity : idx };
          })
          .filter((r) => r.score !== Infinity)
          .sort((a, b) => a.score - b.score)
          .slice(0, 24)
          .map((r) => r.p);
    const byCat = new Map<string, DocPage[]>();
    for (const p of matched) {
      const cat = tree.categories.find((c) => c.id === p.category_id);
      const label = cat?.title ?? "Uncategorized";
      const arr = byCat.get(label) ?? [];
      arr.push(p);
      byCat.set(label, arr);
    }
    return { matched, byCat };
  }, [q, tree]);

  const flat = grouped.matched;

  const go = useCallback((slug: string, term: string) => {
    if (term.trim()) saveRecent(term.trim());
    onClose();
    navigate({ to: "/docs/$slug", params: { slug } });
  }, [navigate, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); const p = flat[active]; if (p) go(p.slug, q); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, active, q, go, onClose]);

  if (!open) return null;

  // build a running index so keyboard highlight matches grouped display
  let cursor = -1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-background/60 p-4 pt-[10vh] backdrop-blur-md animate-[fadeIn_0.15s_ease-out]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Search documentation"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-2xl ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border/80 px-5">
          <Search className="h-4 w-4 text-brand" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            placeholder="Search guides, APIs, tutorials, changelog…"
            className="w-full bg-transparent py-4 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="Search"
          />
          <kbd className="hidden rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>

        {!q && (
          <div className="grid gap-4 border-b border-border/80 px-5 py-4 sm:grid-cols-2">
            {recent.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Clock className="h-3 w-3" /> Recent
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recent.map((r) => (
                    <button
                      key={r}
                      onClick={() => { setQ(r); setActive(0); }}
                      className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] text-foreground/80 transition hover:border-brand/40 hover:text-brand"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3 w-3" /> Popular
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_TERMS.map((r) => (
                  <button
                    key={r}
                    onClick={() => { setQ(r); setActive(0); }}
                    className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-[11px] text-foreground/80 transition hover:border-brand/40 hover:text-brand"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {flat.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No results for “{q}”. Try a different keyword.
            </div>
          ) : (
            Array.from(grouped.byCat.entries()).map(([label, items]) => (
              <div key={label} className="mb-2">
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </div>
                {items.map((p) => {
                  cursor += 1;
                  const i = cursor;
                  return (
                    <button
                      key={p.id}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(p.slug, q)}
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                        i === active ? "bg-brand/10 text-foreground" : "text-foreground/85 hover:bg-accent"
                      }`}
                    >
                      <Hash className="mt-0.5 h-4 w-4 flex-none text-brand/70" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{highlight(p.title, q)}</div>
                        {p.description && <div className="truncate text-xs text-muted-foreground">{highlight(p.description, q)}</div>}
                      </div>
                      {i === active && <CornerDownLeft className="mt-1 h-3.5 w-3.5 flex-none text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border/80 bg-background/40 px-5 py-2.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-border bg-background px-1">↑</kbd><kbd className="rounded border border-border bg-background px-1">↓</kbd> navigate</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-border bg-background px-1">↵</kbd> open</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Command className="h-2.5 w-2.5" /> K to toggle
          </span>
        </div>
      </div>
    </div>
  );
}

/* ============================== Sidebar tree ============================== */

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
    <div className={depth > 0 ? "ml-3 space-y-0.5 border-l border-border/60 pl-2" : "space-y-0.5"}>
      {items.map((p) => (
        <PageTreeItem
          key={p.id}
          page={p}
          isActive={activeSlug === p.slug}
          hasChildren={(tree.pagesByParent.get(p.id) ?? []).length > 0}
          tree={tree}
          activeSlug={activeSlug}
          depth={depth}
          onNavigate={onNavigate}
        />
      ))}
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
  useEffect(() => { if (hasActiveDescendant) setOpen(true); }, [hasActiveDescendant]);
  useEffect(() => {
    if (isActive && activeRef.current) activeRef.current.scrollIntoView({ block: "nearest" });
  }, [isActive]);

  return (
    <div>
      <div className="group/row flex items-center">
        {hasChildren ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="mr-0.5 rounded p-0.5 text-muted-foreground transition hover:text-foreground"
            aria-label={open ? "Collapse" : "Expand"}
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="mr-0.5 grid h-4 w-4 place-items-center">
            <Circle className="h-1 w-1 fill-muted-foreground/40 text-muted-foreground/40" />
          </span>
        )}
        <Link
          ref={isActive ? activeRef : undefined}
          to="/docs/$slug"
          params={{ slug: page.slug }}
          preload="intent"
          onClick={onNavigate}
          className={`relative block flex-1 truncate rounded-lg px-2.5 py-1.5 text-sm transition ${
            isActive
              ? "bg-brand/12 font-medium text-brand shadow-[inset_2px_0_0_var(--color-brand)]"
              : "text-foreground/75 hover:bg-accent hover:text-foreground"
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
  const topLevel = (tree.pagesByCategory.get(cat.id) ?? []).filter((p) => !p.parent_id);
  const count = (tree.pagesByCategory.get(cat.id) ?? []).length;
  if (topLevel.length === 0) return null;
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 transition hover:text-foreground"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        <span className="flex-1 text-left">{cat.title}</span>
        <span className="rounded-full bg-accent/50 px-1.5 py-0.5 font-mono text-[9px] font-normal tracking-normal text-muted-foreground">{count}</span>
      </button>
      {!collapsed && (
        <div className="space-y-0.5">
          {topLevel.map((p) => (
            <PageTreeItem
              key={p.id}
              page={p}
              isActive={activeSlug === p.slug}
              hasChildren={(tree.pagesByParent.get(p.id) ?? []).length > 0}
              tree={tree}
              activeSlug={activeSlug}
              depth={0}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================== Shell ============================== */

const paletteBus: { open: () => void } = { open: () => {} };
export function openDocsPalette() { paletteBus.open(); }

/**
 * Top navigation — each item must resolve to a real, published page.
 * Home is `/docs`; every other tab targets a seeded landing slug that
 * exists in `documentation_pages`.
 */
const TOP_NAV: Array<{ label: string; slug: string | null }> = [
  { label: "Docs", slug: null },
  { label: "API", slug: "api-overview" },
  { label: "Guides", slug: "guides-overview" },
  { label: "Examples", slug: "examples-overview" },
  { label: "SDKs", slug: "sdks-overview" },
  { label: "Changelog", slug: "changelog" },
];

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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const resizing = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(JSON.parse(raw));
      const w = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
      if (w && w >= 220 && w <= 480) setSidebarWidth(w);
      const openRaw = localStorage.getItem(SIDEBAR_OPEN_KEY);
      if (openRaw != null) setSidebarOpen(openRaw === "1");
    } catch { /* noop */ }
  }, []);

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

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((v) => {
      const next = !v;
      try { localStorage.setItem(SIDEBAR_OPEN_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      // account for the max-w-7xl container's left margin — approximate to viewport left
      const w = Math.min(480, Math.max(220, e.clientX - 24));
      setSidebarWidth(w);
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)); } catch { /* noop */ }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [sidebarWidth]);

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

  useEffect(() => {
    paletteBus.open = () => setPaletteOpen(true);
    return () => { paletteBus.open = () => {}; };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient background glow — only for the docs surface */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px]"
        style={{ background: "var(--gradient-hero)" }}
      />

      <ReadingProgress />

      {/* Top navigation */}
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/70 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <button
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground lg:hidden"
            onClick={() => setMobileNav((v) => !v)}
            aria-label="Toggle docs navigation"
          >
            {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link to="/" className="group flex items-center gap-2.5">
            <PrismXLogo size="sm" />
            <span className="text-[15px] font-semibold tracking-tight">
              PrismXGPT
              <span className="ml-1.5 rounded-md border border-border/80 bg-card/60 px-1.5 py-0.5 align-middle font-mono text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                Docs
              </span>
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {TOP_NAV.map((n) => {
              const isActive = n.slug === null ? activeSlug === null : activeSlug === n.slug;
              const className = `rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
                isActive
                  ? "text-foreground bg-accent/60"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`;
              return n.slug === null ? (
                <Link key={n.label} to="/docs" className={className}>{n.label}</Link>
              ) : (
                <Link
                  key={n.label}
                  to="/docs/$slug"
                  params={{ slug: n.slug }}
                  preload="intent"
                  className={className}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="group flex items-center gap-2 rounded-lg border border-border/80 bg-card/60 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm transition hover:border-brand/40 hover:bg-card hover:text-foreground sm:min-w-[260px]"
              aria-label="Search documentation (Ctrl+K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden flex-1 text-left sm:inline">Search documentation…</span>
              <span className="sm:hidden">Search</span>
              <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </button>

            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer noopener"
              className="hidden rounded-md p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground sm:inline-flex"
              aria-label="GitHub"
            >
              <Github className="h-4 w-4" />
            </a>

            <Link
              to="/chat"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-foreground shadow-sm transition hover:opacity-90 sm:inline-flex"
              style={{ background: "var(--gradient-brand)" }}
            >
              Open chat
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </header>

      {/* Layout */}
      <div className="mx-auto flex max-w-7xl gap-0 px-4 sm:px-6">
        {/* Sidebar */}
        <aside
          style={{ width: !mobileNav && sidebarOpen ? sidebarWidth : undefined }}
          className={`fixed inset-y-0 left-0 z-40 w-80 max-w-[85vw] overflow-y-auto border-r border-border/80 bg-card/95 backdrop-blur-xl transition-transform lg:sticky lg:top-14 lg:z-auto lg:h-[calc(100vh-3.5rem)] lg:max-w-none lg:translate-x-0 lg:border-0 lg:bg-transparent lg:backdrop-blur-none print:hidden ${
            mobileNav ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          } ${!sidebarOpen ? "lg:hidden" : ""}`}
        >
          <div className="flex h-full flex-col py-6 pl-1 pr-4 lg:py-8 lg:pr-6">
            {/* Sidebar header row */}
            <div className="mb-4 flex items-center justify-between px-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <FolderTree className="h-3 w-3" /> Reference
              </div>
              <button
                onClick={toggleSidebar}
                className="hidden rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground lg:inline-flex"
                aria-label="Hide sidebar"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </div>

            {loading ? (
              <div className="space-y-2 px-2" aria-hidden>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-6 animate-pulse rounded-md bg-accent/40"
                    style={{ width: `${55 + ((i * 11) % 45)}%` }}
                  />
                ))}
              </div>
            ) : (
              <nav className="flex-1 space-y-1 overflow-y-auto pr-1" aria-label="Documentation navigation">
                <Link
                  to="/docs"
                  onClick={() => setMobileNav(false)}
                  className={`mb-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition ${
                    !activeSlug
                      ? "bg-brand/12 font-medium text-brand"
                      : "text-foreground/85 hover:bg-accent hover:text-foreground"
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
                {(tree.pagesByCategory.get(null) ?? []).filter((p) => !p.parent_id).length > 0 && (
                  <div>
                    <div className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                      Other
                    </div>
                    <PageTree
                      parentId={null}
                      tree={{
                        ...tree,
                        pagesByParent: new Map([
                          [null, (tree.pagesByCategory.get(null) ?? []).filter((p) => !p.parent_id)],
                        ]),
                      }}
                      activeSlug={activeSlug}
                      depth={0}
                      onNavigate={() => setMobileNav(false)}
                    />
                  </div>
                )}
                {tree.categories.length === 0 && tree.allPages.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                    No documentation has been published yet.
                  </div>
                )}
              </nav>
            )}

            <div className="mt-6 rounded-xl border border-border/70 bg-background/40 p-3 text-xs">
              <div className="mb-1.5 flex items-center gap-1.5 text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-brand" /> Need help?
              </div>
              <p className="mb-2 leading-relaxed text-muted-foreground">
                Ask our AI or the community — get an answer in minutes.
              </p>
              <div className="flex gap-1.5">
                <Link
                  to="/chat"
                  className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-center text-[11px] font-medium text-foreground/85 transition hover:border-brand/40 hover:text-brand"
                >
                  Ask AI
                </Link>
                <Link
                  to="/help"
                  className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-center text-[11px] font-medium text-foreground/85 transition hover:border-brand/40 hover:text-brand"
                >
                  Support
                </Link>
              </div>
            </div>
          </div>
        </aside>

        {/* Resize handle */}
        {sidebarOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={() => {
              resizing.current = true;
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
            className="hidden w-1 shrink-0 cursor-col-resize bg-transparent transition hover:bg-brand/30 lg:block print:hidden"
          />
        )}

        {mobileNav && (
          <div
            className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileNav(false)}
          />
        )}

        {/* Collapsed-sidebar reopen button */}
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            className="fixed left-4 top-20 z-30 hidden items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground lg:inline-flex"
            aria-label="Show sidebar"
          >
            <PanelLeftOpen className="h-3.5 w-3.5" /> Sidebar
          </button>
        )}

        {/* Main */}
        <main className="min-w-0 flex-1 py-8 lg:pl-8 lg:py-12">{children}</main>
      </div>

      <DocsFooter />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} tree={tree} />
    </div>
  );
}

/* ============================== Footer ============================== */

function DocsFooter() {
  return (
    <footer className="relative mt-20 border-t border-border/70 bg-card/40 print:hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--color-brand), transparent)", opacity: 0.4 }}
      />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-6">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <PrismXLogo size="sm" />
            <span className="text-sm font-semibold tracking-tight">PrismXGPT</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            The developer platform for chat, image generation, and multimodal agents. Everything you need to ship intelligent products.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <a href="https://github.com" target="_blank" rel="noreferrer noopener" aria-label="GitHub"
               className="rounded-md border border-border bg-background/50 p-2 text-muted-foreground transition hover:border-brand/40 hover:text-brand">
              <Github className="h-4 w-4" />
            </a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer noopener" aria-label="Twitter"
               className="rounded-md border border-border bg-background/50 p-2 text-muted-foreground transition hover:border-brand/40 hover:text-brand">
              <Twitter className="h-4 w-4" />
            </a>
            <a href="/help" aria-label="Community"
               className="rounded-md border border-border bg-background/50 p-2 text-muted-foreground transition hover:border-brand/40 hover:text-brand">
              <MessageCircle className="h-4 w-4" />
            </a>
          </div>
        </div>

        <FooterCol title="Documentation" links={[
          { label: "Overview", to: "/docs" },
          { label: "Quick start", to: "/docs" },
          { label: "API reference", to: "/docs" },
          { label: "SDKs", to: "/docs" },
        ]} />
        <FooterCol title="Product" links={[
          { label: "Chat", to: "/chat" },
          { label: "Projects", to: "/chat" },
          { label: "Pricing", to: "/" },
        ]} />
        <FooterCol title="Resources" links={[
          { label: "Help center", to: "/help" },
          { label: "Changelog", to: "/docs" },
          { label: "Community", to: "/help" },
        ]} />
        <FooterCol title="Company" links={[
          { label: "Home", to: "/" },
          { label: "Privacy", to: "/privacy" },
          { label: "Terms", to: "/terms" },
        ]} />
      </div>
      <div className="border-t border-border/70">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} PrismXGPT. Built for developers.</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> All systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<{ label: string; to: string }> }) {
  return (
    <div>
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">{title}</div>
      <ul className="space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.label}>
            <Link to={l.to} className="text-foreground/80 transition hover:text-brand">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================== Breadcrumbs ============================== */

export function Breadcrumbs({
  items,
}: {
  items: Array<{ label: string; to?: string; params?: Record<string, string> }>;
}) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 opacity-60" />}
          {it.to ? (
            <Link to={it.to as never} params={it.params as never} className="transition hover:text-foreground">
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
