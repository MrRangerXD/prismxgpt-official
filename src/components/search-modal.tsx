import { useMemo, useState } from "react";
import { X, Search, SquarePen, MessageSquare } from "lucide-react";
import type { ChatThread } from "@/lib/chat-store";

export function SearchModal({
  open,
  onClose,
  threads,
  onSelect,
  onNewChat,
}: {
  open: boolean;
  onClose: () => void;
  threads: ChatThread[];
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return threads;
    const lower = q.toLowerCase();
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(lower) ||
        t.messages.some((m) => m.content.toLowerCase().includes(lower)),
    );
  }, [q, threads]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-24 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="mb-2 flex w-full items-center gap-3 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium"
          >
            <SquarePen className="h-4 w-4" /> New chat
          </button>

          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No chats found.</div>
          ) : (
            <div className="space-y-0.5">
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">Today</div>
              {filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onSelect(t.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent"
                >
                  <MessageSquare className="h-4 w-4 flex-none text-muted-foreground" />
                  <span className="truncate">{t.title || "New chat"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
