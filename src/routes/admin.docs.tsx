import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Trash2,
  FolderPlus,
  FileText,
  Pencil,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

export const Route = createFileRoute("/admin/docs")({
  head: () => ({
    meta: [
      { title: "Docs Admin — PrismXGPT" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DocsAdminPage,
});

type Cat = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  sort_order: number;
};

type Page = {
  id: string;
  category_id: string | null;
  slug: string;
  title: string;
  status: "draft" | "published";
  sort_order: number;
  updated_at: string;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function DocsAdminPage() {
  const { loading, isAdmin } = useProfile();
  const navigate = useNavigate();

  const [cats, setCats] = useState<Cat[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase
        .from("documentation_categories" as never)
        .select("id, slug, title, description, sort_order")
        .order("sort_order" as never, { ascending: true } as never),
      supabase
        .from("documentation_pages" as never)
        .select("id, category_id, slug, title, status, sort_order, updated_at")
        .order("sort_order" as never, { ascending: true } as never),
    ]);
    setCats((c ?? []) as Cat[]);
    setPages((p ?? []) as Page[]);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin)
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
        Admin access required. <Link to="/admin" className="ml-2 text-brand underline">Sign in</Link>
      </div>
    );

  const createCategory = async () => {
    const title = window.prompt("Category title?");
    if (!title) return;
    const slug = window.prompt("Slug?", slugify(title));
    if (!slug) return;
    setBusy(true);
    const { error } = await supabase.from("documentation_categories" as never).insert({
      title,
      slug: slugify(slug),
      sort_order: cats.length,
    } as never);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Category created");
      load();
    }
  };

  const deleteCategory = async (id: string) => {
    if (!window.confirm("Delete category? Pages inside will become uncategorized.")) return;
    const { error } = await supabase
      .from("documentation_categories" as never)
      .delete()
      .eq("id" as never, id as never);
    if (error) toast.error(error.message);
    else {
      toast.success("Category deleted");
      load();
    }
  };

  const createPage = async (categoryId: string | null) => {
    const title = window.prompt("Page title?");
    if (!title) return;
    const slug = window.prompt("URL slug?", slugify(title));
    if (!slug) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("documentation_pages" as never)
      .insert({
        title,
        slug: slugify(slug),
        category_id: categoryId,
        content: `# ${title}\n\nWrite your content here.`,
        status: "draft",
        sort_order: pages.filter((p) => p.category_id === categoryId).length,
      } as never)
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message ?? "Failed to create page");
      return;
    }
    const created = data as { id: string };
    navigate({ to: "/admin/docs/$id", params: { id: created.id } });
  };

  const deletePage = async (id: string) => {
    if (!window.confirm("Delete this page permanently?")) return;
    const { error } = await supabase
      .from("documentation_pages" as never)
      .delete()
      .eq("id" as never, id as never);
    if (error) toast.error(error.message);
    else {
      toast.success("Page deleted");
      load();
    }
  };

  const togglePublish = async (page: Page) => {
    const nextStatus = page.status === "published" ? "draft" : "published";
    const { error } = await supabase
      .from("documentation_pages" as never)
      .update({
        status: nextStatus,
        published_at: nextStatus === "published" ? new Date().toISOString() : null,
      } as never)
      .eq("id" as never, page.id as never);
    if (error) toast.error(error.message);
    else {
      toast.success(nextStatus === "published" ? "Published" : "Unpublished");
      load();
    }
  };

  const movePage = async (p: Page, dir: -1 | 1) => {
    const siblings = pages
      .filter((x) => x.category_id === p.category_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex((x) => x.id === p.id);
    const swap = siblings[idx + dir];
    if (!swap) return;
    const a = p.sort_order;
    const b = swap.sort_order;
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("documentation_pages" as never).update({ sort_order: b } as never).eq("id" as never, p.id as never),
      supabase.from("documentation_pages" as never).update({ sort_order: a } as never).eq("id" as never, swap.id as never),
    ]);
    if (e1 || e2) toast.error((e1 || e2)!.message);
    else load();
  };

  const groups: Array<{ cat: Cat | null; items: Page[] }> = [
    ...cats.map((c) => ({
      cat: c,
      items: pages.filter((p) => p.category_id === c.id).sort((a, b) => a.sort_order - b.sort_order),
    })),
    { cat: null, items: pages.filter((p) => !p.category_id).sort((a, b) => a.sort_order - b.sort_order) },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          to="/admin"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to admin
        </Link>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Documentation</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create, edit, and publish docs pages. Public users can only see published pages.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={createCategory}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <FolderPlus className="h-3.5 w-3.5" /> New category
            </button>
            <button
              onClick={() => createPage(cats[0]?.id ?? null)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-foreground"
              style={{ background: "var(--gradient-brand)" }}
            >
              <Plus className="h-3.5 w-3.5" /> New page
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {groups.map(({ cat, items }) => (
            <div key={cat?.id ?? "uncategorized"} className="rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">
                    {cat ? cat.title : "Uncategorized"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {cat ? `/${cat.slug}` : "no category"} · {items.length} pages
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => createPage(cat?.id ?? null)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    <Plus className="h-3 w-3" /> Page
                  </button>
                  {cat && (
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-red-400 hover:bg-accent"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  )}
                </div>
              </div>
              <ul className="divide-y divide-border">
                {items.length === 0 && (
                  <li className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No pages in this section yet.
                  </li>
                )}
                {items.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <FileText className="h-4 w-4 flex-none text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.title}</div>
                      <div className="truncate text-xs text-muted-foreground">/docs/{p.slug}</div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        p.status === "published"
                          ? "bg-brand/15 text-brand"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.status}
                    </span>
                    <button
                      onClick={() => togglePublish(p)}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title={p.status === "published" ? "Unpublish" : "Publish"}
                    >
                      {p.status === "published" ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => movePage(p, -1)}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => movePage(p, 1)}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <Link
                      to="/admin/docs/$id"
                      params={{ id: p.id }}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      onClick={() => deletePage(p.id)}
                      className="rounded-md border border-border p-1.5 text-red-400 hover:bg-accent"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
