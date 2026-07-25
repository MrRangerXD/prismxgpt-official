import { createFileRoute, Link } from "@tanstack/react-router";
import { DocsShell, useDocsTree } from "@/components/docs-shell";
import { BookOpen, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation — PrismXGPT" },
      {
        name: "description",
        content:
          "Guides, references, and how-tos for PrismXGPT — chat, image generation, projects, and more.",
      },
      { property: "og:title", content: "Documentation — PrismXGPT" },
      {
        property: "og:description",
        content: "Guides, references, and how-tos for PrismXGPT.",
      },
      { property: "og:url", content: "https://prismxgpt.lovable.app/docs" },
    ],
    links: [{ rel: "canonical", href: "https://prismxgpt.lovable.app/docs" }],
  }),
  component: DocsIndex,
});

function DocsIndex() {
  const { tree, loading } = useDocsTree();

  return (
    <DocsShell activeSlug={null} tree={tree} loading={loading}>
      <div className="mb-10 border-b border-border pb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5 text-brand" /> Documentation
        </div>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          PrismXGPT <span className="font-display italic text-brand">Docs</span>
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Everything you need to build, ship, and explore with PrismXGPT — from your first chat to
          advanced API usage.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading documentation…</div>
      ) : tree.categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No documentation has been published yet.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {tree.categories.map((cat) => {
            const pages = tree.pagesByCategory.get(cat.id) ?? [];
            return (
              <div
                key={cat.id}
                className="rounded-2xl border border-border bg-card p-6 transition hover:border-brand/40"
              >
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand">
                  {cat.title}
                </div>
                {cat.description && (
                  <p className="mb-4 text-sm text-muted-foreground">{cat.description}</p>
                )}
                <ul className="space-y-1.5">
                  {pages.slice(0, 6).map((p) => (
                    <li key={p.id}>
                      <Link
                        to="/docs/$slug"
                        params={{ slug: p.slug }}
                        className="inline-flex items-center gap-1.5 text-sm text-foreground/85 transition hover:text-brand"
                      >
                        <ArrowRight className="h-3.5 w-3.5 opacity-60" /> {p.title}
                      </Link>
                    </li>
                  ))}
                  {pages.length === 0 && (
                    <li className="text-xs text-muted-foreground">No pages yet.</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </DocsShell>
  );
}
