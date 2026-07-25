import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Save, Trash2 } from "lucide-react";
import { DocMarkdown } from "@/components/doc-markdown";

export const Route = createFileRoute("/admin/docs/$id")({
  head: () => ({
    meta: [
      { title: "Edit doc — PrismXGPT" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DocsEditorPage,
});

type Cat = { id: string; title: string; slug: string };

type EditablePage = {
  id: string;
  category_id: string | null;
  parent_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  content: string;
  excerpt: string | null;
  cover_image: string | null;
  icon: string | null;
  tags: string[];
  version: string | null;
  status: "draft" | "published";
  visibility: "public" | "private";
  seo_title: string | null;
  seo_description: string | null;
  sort_order: number;
  reading_minutes: number;
  is_featured: boolean;
  is_pinned: boolean;
  homepage_section: string | null;
  search_keywords: string[];
  author: string | null;
  related_slugs: string[];
};

function computeReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

function DocsEditorPage() {
  const { id } = Route.useParams();
  const { loading, isAdmin } = useProfile();
  const navigate = useNavigate();
  const [page, setPage] = useState<EditablePage | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview" | "split">("split");
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const skipHistory = useRef(false);

  const load = useCallback(async () => {
    const [{ data, error }, { data: c }] = await Promise.all([
      supabase
        .from("documentation_pages" as never)
        .select("*")
        .eq("id" as never, id as never)
        .maybeSingle(),
      supabase
        .from("documentation_categories" as never)
        .select("id, title, slug")
        .order("sort_order" as never, { ascending: true } as never),
    ]);
    if (error || !data) {
      toast.error(error?.message ?? "Page not found");
      navigate({ to: "/admin/docs" });
      return;
    }
    setPage(data as EditablePage);
    setCats((c ?? []) as Cat[]);
    setDirty(false);
  }, [id, navigate]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // History tracking on content
  useEffect(() => {
    if (!page) return;
    if (skipHistory.current) {
      skipHistory.current = false;
      return;
    }
    undoStack.current.push(page.content);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
  }, [page?.content]);

  const update = <K extends keyof EditablePage>(key: K, value: EditablePage[K]) => {
    setPage((p) => (p ? { ...p, [key]: value } : p));
    setDirty(true);
  };

  const save = useCallback(async () => {
    if (!page) return;
    setSaving(true);
    const payload = {
      ...page,
      reading_minutes: computeReadingMinutes(page.content),
      published_at:
        page.status === "published" ? new Date().toISOString() : null,
    };
    const { error } = await supabase
      .from("documentation_pages" as never)
      .update(payload as never)
      .eq("id" as never, page.id as never);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDirty(false);
    toast.success("Saved");
  }, [page]);

  // Autosave every 20s when dirty
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      save();
    }, 20000);
    return () => clearTimeout(t);
  }, [dirty, save]);

  // Cmd/Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (undoStack.current.length > 1) {
          const cur = undoStack.current.pop()!;
          redoStack.current.push(cur);
          const prev = undoStack.current[undoStack.current.length - 1];
          if (prev !== undefined && page) {
            skipHistory.current = true;
            setPage({ ...page, content: prev });
            setDirty(true);
          }
        }
      }
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        const next = redoStack.current.pop();
        if (next !== undefined && page) {
          undoStack.current.push(next);
          skipHistory.current = true;
          setPage({ ...page, content: next });
          setDirty(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, save]);

  const del = async () => {
    if (!page) return;
    if (!window.confirm("Delete this page permanently?")) return;
    const { error } = await supabase
      .from("documentation_pages" as never)
      .delete()
      .eq("id" as never, page.id as never);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      navigate({ to: "/admin/docs" });
    }
  };

  const togglePublish = async () => {
    if (!page) return;
    update("status", page.status === "published" ? "draft" : "published");
  };

  const tagsInput = useMemo(() => (page?.tags ?? []).join(", "), [page?.tags]);

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin)
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
        Admin access required.{" "}
        <Link to="/admin" className="ml-2 text-brand underline">
          Sign in
        </Link>
      </div>
    );
  if (!page) return <div className="p-10 text-sm text-muted-foreground">Loading page…</div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/admin/docs"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All docs
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-border text-xs">
              {(["edit", "split", "preview"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 capitalize ${
                    tab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              onClick={togglePublish}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              {page.status === "published" ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" /> Unpublish
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" /> Publish
                </>
              )}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-brand)" }}
            >
              <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : dirty ? "Save" : "Saved"}
            </button>
            <button
              onClick={del}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-red-400 hover:bg-accent"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-2">
          <Field label="Title">
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={page.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </Field>
          <Field label="Slug (URL)">
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={page.slug}
              onChange={(e) => update("slug", e.target.value)}
            />
          </Field>
          <Field label="Category">
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={page.category_id ?? ""}
              onChange={(e) => update("category_id", e.target.value || null)}
            >
              <option value="">— Uncategorized —</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sort order">
            <input
              type="number"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={page.sort_order}
              onChange={(e) => update("sort_order", Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Description">
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={page.description ?? ""}
              onChange={(e) => update("description", e.target.value)}
            />
          </Field>
          <Field label="Featured image URL">
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={page.cover_image ?? ""}
              onChange={(e) => update("cover_image", e.target.value || null)}
              placeholder="https://…"
            />
          </Field>
          <Field label="Tags (comma-separated)">
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={tagsInput}
              onChange={(e) =>
                update(
                  "tags",
                  e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                )
              }
            />
          </Field>
          <Field label="Version">
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={page.version ?? ""}
              onChange={(e) => update("version", e.target.value || null)}
              placeholder="1.0"
            />
          </Field>
          <Field label="SEO title">
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={page.seo_title ?? ""}
              onChange={(e) => update("seo_title", e.target.value || null)}
            />
          </Field>
          <Field label="SEO description">
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={page.seo_description ?? ""}
              onChange={(e) => update("seo_description", e.target.value || null)}
            />
          </Field>
          <Field label="Visibility">
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={page.visibility}
              onChange={(e) => update("visibility", e.target.value as "public" | "private")}
            >
              <option value="public">Public</option>
              <option value="private">Private (admins only)</option>
            </select>
          </Field>
          <Field label="Icon (lucide name or emoji)">
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={page.icon ?? ""}
              onChange={(e) => update("icon", e.target.value || null)}
            />
          </Field>
        </div>

        <div
          className={`grid gap-3 ${
            tab === "split" ? "md:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {tab !== "preview" && (
            <div className="rounded-2xl border border-border bg-card">
              <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Markdown
              </div>
              <textarea
                value={page.content}
                onChange={(e) => update("content", e.target.value)}
                spellCheck={false}
                className="h-[65vh] w-full resize-none bg-transparent p-4 font-mono text-sm outline-none"
                placeholder="# Heading&#10;&#10;Write markdown here…"
              />
            </div>
          )}
          {tab !== "edit" && (
            <div className="rounded-2xl border border-border bg-card">
              <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Preview
              </div>
              <div className="h-[65vh] overflow-y-auto p-6">
                <DocMarkdown content={page.content} />
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Autosave runs every 20 seconds while there are unsaved changes. Use ⌘/Ctrl+S to save now,
          ⌘/Ctrl+Z to undo, ⌘/Ctrl+Y to redo. Callouts: <code>&gt; [!NOTE] …</code>,{" "}
          <code>[!WARNING]</code>, <code>[!TIP]</code>, <code>[!SUCCESS]</code>.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
