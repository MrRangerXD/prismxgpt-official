import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, AlertCircle } from "lucide-react";

import { PrismXLogo } from "@/components/prismx-logo";

export const Route = createFileRoute("/share/$id")({
  head: () => ({
    meta: [
      { title: "Shared conversation — PrismXGPT" },
      { name: "description", content: "A read-only PrismXGPT conversation." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharePage,
});

type ShareMessage = { role: "user" | "assistant"; content: string };
type Snapshot = {
  id: string;
  title: string;
  messages: ShareMessage[];
  created_at: string;
};

function SharePage() {
  const { id } = Route.useParams();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/snapshot/${encodeURIComponent(id)}`);
        if (cancelled) return;
        if (!res.ok) {
          setError("This shared link is invalid or has been removed.");
          return;
        }
        const row = (await res.json()) as { id: string; title: string; messages: unknown; created_at: string };
        // Normalize legacy snapshots: some rows stored raw AI SDK v5 UIMessages
        // (with `parts` and no `content`), which rendered as blank bubbles.
        // Flatten `parts` -> plain text (including inline data-URL images) and
        // filter to visible user/assistant turns only.
        const raw = Array.isArray(row.messages) ? (row.messages as unknown[]) : [];
        const normalized: ShareMessage[] = raw
          .map((m) => {
            const mm = m as {
              role?: string;
              content?: unknown;
              parts?: Array<Record<string, unknown>>;
            };
            let content = "";
            if (typeof mm.content === "string" && mm.content.trim().length > 0) {
              content = mm.content;
            } else if (Array.isArray(mm.parts)) {
              content = mm.parts
                .map((p) => {
                  if (!p || typeof p !== "object") return "";
                  if (typeof (p as { text?: unknown }).text === "string") return (p as { text: string }).text;
                  if ((p as { type?: string }).type === "file" && typeof (p as { url?: string }).url === "string") {
                    const url = (p as { url: string }).url;
                    return url.startsWith("data:image/") || /^https?:\/\//.test(url)
                      ? `![attached image](${url})`
                      : "";
                  }
                  return "";
                })
                .filter(Boolean)
                .join("\n\n");
            }
            return { role: mm.role as ShareMessage["role"], content };
          })
          .filter(
            (m) =>
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string" &&
              m.content.trim().length > 0,
          );
        setSnap({
          id: row.id,
          title: row.title,
          created_at: row.created_at,
          messages: normalized,
        });
      } catch {
        if (!cancelled) setError("This shared link is invalid or has been removed.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div className="max-w-md rounded-2xl border border-border bg-card p-8">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <h1 className="text-lg font-semibold">Link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm text-brand hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to PrismXGPT
          </Link>
        </div>
      </div>
    );
  }

  if (!snap) {
    return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <PrismXLogo size="sm" />
            <span className="text-sm font-semibold tracking-tight">PrismXGPT</span>
          </Link>
          <span className="ml-auto rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            Read-only share
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">{snap.title}</h1>
        <p className="mb-6 text-xs text-muted-foreground">
          Shared on {new Date(snap.created_at).toLocaleDateString()}
        </p>
        <div className="space-y-6">
          {snap.messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-sm [overflow-wrap:anywhere]">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <PrismXLogo size="sm" />
                <div
                  className="min-w-0 flex-1 text-[15px] leading-7 text-foreground/90
                    [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
                    [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-[#0a0d14] [&_pre]:p-4 [&_pre]:text-[13px]
                    [&_code]:font-mono
                    [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6
                    [&_a]:text-brand [&_a]:underline"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              </div>
            ),
          )}
        </div>
        <div className="mt-10 rounded-2xl border border-border bg-card px-4 py-4 text-center text-sm text-muted-foreground">
          Want to chat with PrismXGPT yourself?{" "}
          <Link to="/" className="font-medium text-brand hover:underline">
            Try it free
          </Link>
        </div>
      </div>
    </div>
  );
}
