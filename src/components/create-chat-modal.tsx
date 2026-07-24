import { useEffect, useRef, useState } from "react";
import { X, MessageSquarePlus } from "lucide-react";

/**
 * In-app "Create New Chat" modal. Replaces the previous silent new-chat action
 * and the browser prompt. Three actions:
 *   - Continue: create with entered name
 *   - Skip:     create with default "<UserName> Chat N"
 *   - Cancel:   close without creating anything
 */
export function CreateChatModal({
  open,
  onClose,
  onContinue,
  onSkip,
}: {
  open: boolean;
  onClose: () => void;
  onContinue: (name: string) => void;
  onSkip: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue("");
      const id = requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = value.trim();
  const submit = () => {
    if (!trimmed) return;
    onContinue(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-chat-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-elevated animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <MessageSquarePlus className="h-4 w-4" />
            </span>
            <h2 id="create-chat-title" className="text-base font-semibold">
              Create New Chat
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Enter chat name..."
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Skip to auto-name this chat. You can rename it any time from the sidebar.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium transition hover:bg-accent"
          >
            Skip
          </button>
          <button
            type="button"
            disabled={!trimmed}
            onClick={submit}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-foreground transition disabled:opacity-50"
            style={{ background: "var(--gradient-brand)" }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
