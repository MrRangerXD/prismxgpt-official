/**
 * =============================================================================
 * src/routes/chat.tsx — Main chat surface (ChatGPT-style)
 * =============================================================================
 *
 * This file owns the entire client-side chat experience: message list,
 * composer, sidebar wiring, and — critically — the image-generation
 * lifecycle. It is intentionally a single route file because most of the
 * state is cross-cutting (threads, active generation, streaming status)
 * and splitting it further would just move prop-drilling around.
 *
 * ARCHITECTURE OVERVIEW
 * ---------------------
 *
 * 1. THREAD STORAGE
 *    - Local:   `@/lib/chat-store` — localStorage, source of truth for the
 *               current tab. Also survives offline.
 *    - Cloud:   `@/lib/chat-sync`  — debounced upsert into `user_chat_state`
 *               so history follows the user across devices.
 *    - Writes are throttled while streaming to avoid re-rendering the
 *      sidebar on every token.
 *
 * 2. MESSAGE STREAMING
 *    - Powered by `@ai-sdk/react`'s `useChat` hitting `POST /api/chat`.
 *    - `sanitizeMessageForWire` strips inline `data:` URLs from history
 *      before sending so long image-heavy chats don't blow the payload cap.
 *
 * 3. IMAGE INTENT ROUTING  (the ONLY place chat can branch into images)
 *    - `detectImageIntent(text)`       → NEW image generation
 *    - `isExplicitImageEdit(text)` + a prior completed image →  EDIT
 *    - Anything else → normal chat. NEVER reuses a prior image, NEVER
 *      triggers polling, NEVER shows a progress card.
 *    - The classifier looks ONLY at the current user message. History,
 *      active-generation state, and previous images cannot influence it.
 *
 * 4. IMAGE LIFECYCLE (immutable, refresh-safe)
 *    a. `generateImageInline` mints a client-side `generationId` (UUID) and
 *       IMMEDIATELY inserts a placeholder assistant message whose text is
 *       a machine-readable marker:
 *         `⟪imggen:pending:<uuid>⟫`   for fresh generations
 *         `⟪imgedit:pending:<uuid>⟫`  for edits
 *       The marker is persisted synchronously (force-flush to storage +
 *       cloud) so a refresh at any moment can resume.
 *    b. `POST /api/image` upserts a row keyed by `generationId` (status
 *       = processing) and calls the image provider. On success it uploads
 *       the PNG to the public `chat-images` bucket and returns the URL.
 *    c. The recovery poller (see #5) OR the POST completion swaps the
 *       marker for standard markdown `![generated image](<url>)` and
 *       force-persists again. The row is then read-only history.
 *    d. Edits pass `parentId` (parsed from the previous assistant message
 *       id `a_<uuid>`) so `image_generations.parent_id` preserves
 *       provenance and the previous image is never mutated.
 *
 * 5. RECOVERY POLLER
 *    - Effect scans the current thread for `⟪(imggen|imgedit):pending:…⟫`
 *      markers and polls `GET /api/image?id=<uuid>` until each row is
 *      completed or failed.
 *    - Depends on `pendingKey` (a fingerprint) NOT on `messages`, so it
 *      does not tear down on every streaming token.
 *    - Handles a POST/GET race by tolerating 404 for ~16s (8 retries).
 *    - Auto-fail: if a row is stuck in `processing` > 2 minutes the API
 *      itself flips it to `failed` on the next GET so the UI can show
 *      a retry action instead of a hanging card.
 *
 * 6. MODALS (settings, projects, image editor, etc.)
 *    - All lazy-loaded via `React.lazy` + `<Suspense>` and only mounted
 *      while their `open` flag is true, keeping the initial chat bundle
 *      lean.
 *
 * INVARIANTS
 * ----------
 * - Placeholder markers are the ONLY transient chat state. They are always
 *   either finalized (into an image URL / error text) or recoverable via
 *   the poller. They never leak across threads.
 * - `active_generation` and other in-memory scratch state are cleared on
 *   finalization to prevent context leaks between messages.
 * - The `bootstrap.sql` file is the schema source of truth (see the
 *   `image_generations` table + `chat-images` bucket).
 *
 * If you're modifying image behavior, also review:
 *   - src/lib/image-intent.ts   (intent classifier + typo tolerance)
 *   - src/routes/api/image.ts   (server lifecycle + auto-recovery)
 *   - src/lib/chat-sync.ts      (debounced cloud persistence)
 * =============================================================================
 */
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUp, PanelLeft, Menu, Square, Plus, ImageIcon, Globe, Telescope, Paperclip, X, Copy, Check, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, UploadCloud, Mic } from "lucide-react";
import { toast } from "sonner";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { PrismSidebar } from "@/components/prism-sidebar";
import { PrismXLogo } from "@/components/prismx-logo";
import { AnnouncementBanner } from "@/components/announcement-banner";

// Modals are code-split — none are visible on first paint, and several pull
// heavy dependencies (image editor, project pickers, settings forms). Lazy
// loading trims the initial chat bundle and defers their JS until opened.
const PlusModal = lazy(() => import("@/components/plus-modal").then((m) => ({ default: m.PlusModal })));
const ProfileEditModal = lazy(() => import("@/components/profile-edit-modal").then((m) => ({ default: m.ProfileEditModal })));
const SearchModal = lazy(() => import("@/components/search-modal").then((m) => ({ default: m.SearchModal })));
const LibraryModal = lazy(() => import("@/components/library-modal").then((m) => ({ default: m.LibraryModal })));
const ProjectsModal = lazy(() => import("@/components/projects-modal").then((m) => ({ default: m.ProjectsModal })));
const ImageModal = lazy(() => import("@/components/image-modal").then((m) => ({ default: m.ImageModal })));
const SettingsModal = lazy(() => import("@/components/settings-modal").then((m) => ({ default: m.SettingsModal })));
const MoveToProjectModal = lazy(() => import("@/components/move-to-project-modal").then((m) => ({ default: m.MoveToProjectModal })));
const RenameChatModal = lazy(() => import("@/components/rename-chat-modal").then((m) => ({ default: m.RenameChatModal })));
const CreateChatModal = lazy(() => import("@/components/create-chat-modal").then((m) => ({ default: m.CreateChatModal })));


import { useProfile } from "@/hooks/use-profile";
import {
  loadThreads,
  saveThreads,
  newThreadId,
  type ChatThread,
} from "@/lib/chat-store";
import { loadThreadsFromCloud, saveThreadsToCloud } from "@/lib/chat-sync";
import { supabase } from "@/integrations/supabase/client";
import { detectImageIntent, isExplicitImageEdit } from "@/lib/image-intent";

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/**
 * Replace inline `data:` URLs (typically large base64 images from image
 * generation) with a short placeholder before sending message history to
 * the AI. Local rendering keeps the full data URL — the wire copy stays
 * small so long-running conversations don't hit the payload cap.
 */
function sanitizeMessageForWire<T>(m: T): T {
  const msg = m as unknown as {
    parts?: Array<Record<string, unknown>>;
    content?: unknown;
  };
  const replaceInText = (s: string) =>
    s.replace(/data:[a-z0-9.+/-]+;base64,[A-Za-z0-9+/=]+/gi, "[attached image]");
  if (Array.isArray(msg.parts)) {
    msg.parts = msg.parts.map((p) => {
      const part = { ...p } as Record<string, unknown>;
      if (typeof part.text === "string") part.text = replaceInText(part.text as string);
      // AI SDK v5 file parts carry a `url` on file/image parts.
      if (typeof part.url === "string" && (part.url as string).startsWith("data:")) {
        // Keep file attachments the user just sent (they're in the last user
        // message and are needed for the model). We only truncate previously
        // inlined images that appear inside assistant text.
      }
      return part;
    });
  }
  if (typeof msg.content === "string") msg.content = replaceInText(msg.content);
  return m;
}

function extractMessageContent(m: unknown): { role: "user" | "assistant"; content: string } | null {
  const mm = m as {
    role?: string;
    content?: unknown;
    parts?: Array<Record<string, unknown>>;
  };
  if (mm.role !== "user" && mm.role !== "assistant") return null;
  let content = "";
  if (Array.isArray(mm.parts)) {
    content = mm.parts
      .map((p) => {
        if (!p || typeof p !== "object") return "";
        if (typeof (p as { text?: unknown }).text === "string") return (p as { text: string }).text;
        if ((p as { type?: string }).type === "file" && typeof (p as { url?: string }).url === "string") {
          const url = (p as { url: string }).url;
          return url.startsWith("data:image/") ? `![attached image](${url})` : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  } else if (typeof mm.content === "string") {
    content = mm.content;
  }
  return content.trim() ? { role: mm.role, content } : null;
}

// Image attachments were previously rendered with
// `<img src={URL.createObjectURL(f)} />` directly in JSX — that allocates a
// brand-new blob URL on every render (e.g. every keystroke in the composer,
// since typing re-renders the whole page) and never revokes the old ones,
// leaking browser memory for the lifetime of the tab. This component creates
// the object URL once per File and revokes it when the file is removed or
// the component unmounts.
function AttachmentThumbnail({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt={file.name} className="h-10 w-10 rounded-lg object-cover" />;
}

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat — PrismXGPT" },
      { name: "description", content: "Talk with PrismXGPT — your AI assistant." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ChatPage,
});

export function ChatPage() {
  const urlParams = useParams({ strict: false }) as { chatId?: string };
  const urlChatId = urlParams.chatId ?? null;
  const user = useProfile();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Stable chat id — pre-generated so a "new chat" send doesn't remount useChat
  // (which would drop the just-sent message). Reused as the thread id on first send.
  const [chatId, setChatId] = useState<string>(() => newThreadId());
  const [input, setInput] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showPlus, setShowPlus] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [showComposerMenu, setShowComposerMenu] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<"default" | "web" | "research">("default");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renameModal, setRenameModal] = useState<null | { id: string; currentName: string }>(null);
  const [showCreateChat, setShowCreateChat] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    userIdRef.current = user.userId;
  }, [user.userId]);

  const syncActiveThreadMessages = useCallback((nextMessages: UIMessage[], persistNow = false) => {
    const threadId = activeIdRef.current;
    if (!threadId) return;
    setThreads((prev) => {
      const idx = prev.findIndex((t) => t.id === threadId);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], messages: nextMessages as unknown as ChatThread["messages"], updatedAt: Date.now() };
      if (persistNow) {
        saveThreads(userIdRef.current, next);
        if (userIdRef.current) saveThreadsToCloud(userIdRef.current, next);
      }
      return next;
    });
  }, []);

  const addFiles = (files: File[]) => {
    const isZip = (f: File) =>
      /\.(zip|rar|7z|tar|gz|tgz)$/i.test(f.name) ||
      /^application\/(zip|x-zip-compressed|x-rar-compressed|x-7z-compressed|x-tar|gzip)$/i.test(f.type);
    const archives = files.filter(isZip);
    const nonArchive = files.filter((f) => !isZip(f));
    if (archives.length) {
      toast.error(
        "Archive files (.zip / .rar / .7z) aren't supported yet. Please extract the files first and attach the individual source files you want me to look at.",
      );
    }
    const tooBig = nonArchive.filter((f) => f.size > 20 * 1024 * 1024);
    const valid = nonArchive.filter((f) => f.size <= 20 * 1024 * 1024);
    if (tooBig.length) {
      toast.error(
        tooBig.length === 1
          ? `"${tooBig[0].name}" is over 20MB and can't be attached.`
          : `${tooBig.length} files are over 20MB and were skipped.`,
      );
    }
    if (valid.length) setAttachments((a) => [...a, ...valid].slice(0, 10));
  };


  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      addFiles(files);
      toast.success(`Attached ${files.length} file${files.length > 1 ? "s" : ""}`);
    }
  };

  // Auto-grow textarea up to CSS max-height, then scroll internally.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 192) + "px";
  }, [input]);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!user.loading && !user.userId) navigate({ to: "/login" });
  }, [user.loading, user.userId, navigate]);
  // Load thread history ONCE per user. Also pull from cloud so chats sync
  // across devices signed in as the same account.
  useEffect(() => {
    if (!user.userId) {
      setThreads([]);
      setActiveId(null);
      setChatId(newThreadId());
      return;
    }
    const local = loadThreads(user.userId);
    setThreads(local);
    let cancelled = false;
    loadThreadsFromCloud(user.userId).then((cloud) => {
      if (cancelled || !cloud) return;
      // Merge: prefer whichever version has newer updatedAt per id.
      const byId = new Map<string, ChatThread>();
      for (const t of local) byId.set(t.id, t);
      for (const t of cloud) {
        const existing = byId.get(t.id);
        if (!existing || (t.updatedAt ?? 0) > (existing.updatedAt ?? 0)) byId.set(t.id, t);
      }
      const merged = Array.from(byId.values()).sort(
        (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
      );
      setThreads(merged);
      saveThreads(user.userId!, merged);
    });
    return () => { cancelled = true; };
  }, [user.userId]);

  // Sync active chat to the URL. `/chat` (no id) ALWAYS opens a fresh empty
  // chat — never auto-reopen the last conversation. History stays in sidebar.
  useEffect(() => {
    if (!user.userId) return;
    if (urlChatId) {
      setActiveId((prev) => (prev === urlChatId ? prev : urlChatId));
      setChatId((prev) => (prev === urlChatId ? prev : urlChatId));
    } else {
      setActiveId(null);
      setChatId((prev) => (prev && !threads.some((t) => t.id === prev) ? prev : newThreadId()));
    }
  }, [user.userId, urlChatId]);


  const active = useMemo(
    () => threads.find((t) => t.id === activeId) ?? null,
    [threads, activeId],
  );

  // Refs so the memoized transport reads the latest mode without recreating.
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Stable transport — recreating it on every render can drop the in-flight
  // stream (that's why the FIRST message sometimes never produced a reply).
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers = new Headers(init?.headers);
          if (token) headers.set("Authorization", `Bearer ${token}`);
          headers.set("Content-Type", "application/json");
          // Inject the current mode into the request body so the server can
          // steer the model (web search / deep research).
          let nextInit: RequestInit = { ...init, headers };
          if (init?.body && typeof init.body === "string") {
            try {
              const parsed = JSON.parse(init.body);
              parsed.mode = modeRef.current;
              try {
                const pRaw = window.localStorage.getItem("prismxgpt.personalization.v1");
                if (pRaw) parsed.personalization = JSON.parse(pRaw);
              } catch { /* ignore */ }
              // Strip base64 data-URL images from prior message history so
              // follow-ups after an inline-generated image (or any pasted
              // data URL) don't blow past the server's payload limit. We
              // keep them in local state for display; the model only needs
              // a short reference to know an image was produced.
              if (Array.isArray(parsed.messages)) {
                parsed.messages = parsed.messages.map(sanitizeMessageForWire);
              }
              nextInit.body = JSON.stringify(parsed);
            } catch {
              /* leave body untouched */
            }
          }
          return fetch(input, nextInit);
        }) as typeof fetch,
      }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: chatId,
    transport,
    // NOTE: do NOT pass `messages` here — that makes useChat controlled and
    // re-renders wipe streaming tokens (which is why responses only appeared
    // after switching chats). We hydrate via setMessages when active changes.
    onFinish: ({ messages: finishedMessages }) => {
      syncActiveThreadMessages(finishedMessages, true);
    },
    onError: (e) => {
      console.error("chat error", e);
      const raw = e instanceof Error && e.message ? e.message : "";
      // Auto-fallback: if Web Search / Deep Research fails, silently retry
      // the last user message with the normal chat model so simple questions
      // never surface a generic error.
      if (modeRef.current !== "default") {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant") {
            const hasText =
              Array.isArray(last.parts) && last.parts.some((p) => p.type === "text" && p.text);
            if (!hasText) return prev.slice(0, -1);
          }
          return prev;
        });
        const priorMode = modeRef.current;
        modeRef.current = "default";
        setMode("default");
        // Find last user message text to re-send.
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const text = lastUser ? getMessageText(lastUser) : "";
        if (text) {
          toast.message(
            priorMode === "web"
              ? "Web search was unavailable — answering in standard chat mode."
              : "Deep research was unavailable — answering in standard chat mode.",
          );
          void sendMessage({ text });
          return;
        }
      }
      let friendly = "I ran into a problem generating that reply. Please try again in a moment.";
      if (/401|unauthor/i.test(raw)) friendly = "Your session expired — please sign in again to continue chatting.";
      else if (/429|rate.?limit|too many/i.test(raw)) friendly = "I'm getting a lot of requests right now. Please wait a few seconds and try again.";
      else if (/402|credit|quota|billing/i.test(raw)) friendly = "The AI credits for this workspace have run out. Please add credits and try again.";
      else if (/413|too large/i.test(raw)) friendly = "That message is too long for me to process. Try shortening it or starting a new chat.";
      else if (/network|failed to fetch|load failed/i.test(raw)) friendly = "I couldn't reach the AI service. Check your connection and try again.";
      else if (raw && raw.length < 200 && !/^\{|<html/i.test(raw)) friendly = raw;
      // Append the friendly reply as an assistant message so history stays intact.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") {
          const hasText = Array.isArray(last.parts) && last.parts.some((p) => p.type === "text" && p.text);
          if (!hasText) {
            return prev.slice(0, -1).concat({
              ...last,
              parts: [{ type: "text", text: friendly }],
            } as unknown as UIMessage);
          }
        }
        return [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: "assistant",
            parts: [{ type: "text", text: friendly }],
          } as unknown as UIMessage,
        ];
      });
    },

  });

  // Hydrate useChat when the active thread changes (URL nav, sidebar select).
  const lastHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastHydratedRef.current === chatId) return;
    const t = threads.find((x) => x.id === chatId);
    // If the URL points at a saved chat but threads haven't finished loading,
    // wait so we don't wipe the pre-existing messages with an empty array.
    if (!t && urlChatId && threads.length === 0 && user.userId) return;
    lastHydratedRef.current = chatId;
    // Drop stale image-generation placeholders left over from a previous
    // session. Completed generations were already rewritten to a real image
    // part before persistence, so filtering marker-only bubbles never
    // removes a finished image — it just prevents the loading card from
    // being restored on refresh.
    const isImgGenPlaceholder = (m: UIMessage) => {
      const parts = (m as unknown as { parts?: Array<{ type: string; text?: string }> }).parts;
      if (!Array.isArray(parts) || parts.length === 0) return false;
      return parts.every((p) => {
        if (p.type !== "text" || typeof p.text !== "string") return false;
        const t = p.text.trim();
        if (!t) return true;
        // Legacy markers with no generation id can never be recovered — drop.
        if (t === "⟪imggen:generating⟫" || t === "⟪imggen:editing⟫") return true;
        // Pending markers WITH an id are the recoverable ones — KEEP them
        // so the polling effect below can resolve them from the DB.
        if (/^⟪(imggen|imgedit):pending:[0-9a-f-]{36}⟫$/i.test(t)) return false;
        // Defensive: strip any leftover "Generating your image…" strings.
        return /^(generating your image|creating image|editing image|interrupted|loading|generating\.\.\.|creating\.\.\.)[.…\s]*$/i.test(t);
      });
    };
    const sanitized = t
      ? (t.messages as unknown as UIMessage[]).filter((m) => !isImgGenPlaceholder(m))
      : [];
    setMessages(sanitized);
  }, [chatId, threads, urlChatId, user.userId, setMessages]);

  // Recovery poller: for every pending image-generation marker in the current
   // thread, poll GET /api/image?id=<id> until the row is completed/failed.
   // This is what makes "refresh mid-edit" resume without losing progress.
   //
   // Perf: the effect used to depend on `messages` directly, which caused it
   // to tear down/rebuild every streaming token (60+ times/sec). We now
   // derive a stable fingerprint of pending markers so the effect only
   // re-runs when the set of pending generations actually changes.
   const recoveryTrackedRef = useRef<Set<string>>(new Set());
   const pendingGenerations = useMemo(() => {
     const out: Array<{ msgId: string; genId: string }> = [];
     for (const m of messages) {
       if (m.role !== "assistant") continue;
       const parts = (m as unknown as { parts?: Array<{ type: string; text?: string }> }).parts ?? [];
       for (const p of parts) {
         if (p.type !== "text" || typeof p.text !== "string") continue;
         const match = p.text.trim().match(/^⟪(?:imggen|imgedit):pending:([0-9a-f-]{36})⟫$/i);
         if (match) out.push({ msgId: m.id, genId: match[1] });
       }
     }
     return out;
   }, [messages]);
   const pendingKey = pendingGenerations.map((p) => `${p.msgId}:${p.genId}`).join("|");
   useEffect(() => {
     if (pendingGenerations.length === 0) return;
     let cancelled = false;
     const timers: Array<ReturnType<typeof setTimeout>> = [];
     const seen = recoveryTrackedRef.current;

     const finalize = (msgId: string, text: string) => {
       setMessages((prev) => {
         const next = prev.map((m) =>
           m.id === msgId
             ? ({ ...m, parts: [{ type: "text", text }] } as unknown as UIMessage)
             : m,
         );
         queueMicrotask(() => syncActiveThreadMessages(next, true));
         return next;
       });
     };

     const pollOnce = async (msgId: string, genId: string, attempt: number) => {
       if (cancelled) return;
       try {
         const { data } = await supabase.auth.getSession();
         const token = data.session?.access_token;
         if (!token) return;
         const res = await fetch(`/api/image?id=${encodeURIComponent(genId)}`, {
           headers: { Authorization: `Bearer ${token}` },
         });
         if (cancelled) return;
         if (res.status === 404) {
           if (attempt < 8) {
             timers.push(setTimeout(() => pollOnce(msgId, genId, attempt + 1), 2000));
             return;
           }
           finalize(msgId, "Image generation was interrupted. Please try again.");
           return;
         }
         const payload = (await res.json().catch(() => null)) as {
           status?: string;
           imageUrl?: string;
           error?: string;
         } | null;
         if (!payload) return;
         if (payload.status === "completed" && payload.imageUrl) {
           finalize(msgId, `![generated image](${payload.imageUrl})`);
           return;
         }
         if (payload.status === "failed") {
           finalize(msgId, payload.error || "Image generation failed. Please try again.");
           return;
         }
         if (attempt > 60) {
           finalize(msgId, "Image generation timed out. Please try again.");
           return;
         }
         const delay = Math.min(4000, 1500 + attempt * 100);
         timers.push(setTimeout(() => pollOnce(msgId, genId, attempt + 1), delay));
       } catch (e) {
         if (cancelled) return;
         console.error("[image] recovery poll error", e);
         timers.push(setTimeout(() => pollOnce(msgId, genId, attempt + 1), 3000));
       }
     };

     for (const { msgId, genId } of pendingGenerations) {
       const key = `${msgId}:${genId}`;
       if (seen.has(key)) continue;
       seen.add(key);
       pollOnce(msgId, genId, 0);
     }

     return () => {
       cancelled = true;
       for (const t of timers) clearTimeout(t);
     };
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [pendingKey, setMessages, syncActiveThreadMessages]);




  // Persist messages back to storage. Streaming updates are throttled so the
  // sidebar and cloud sync don't re-render on every token.
  const latestMessagesRef = useRef<UIMessage[]>([]);
  const deferredMessageSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    latestMessagesRef.current = messages;
    const busy = status === "streaming" || status === "submitted";
    if (busy) {
      if (!deferredMessageSaveRef.current) {
        deferredMessageSaveRef.current = setTimeout(() => {
          deferredMessageSaveRef.current = null;
          syncActiveThreadMessages(latestMessagesRef.current, false);
        }, 1000);
      }
      return;
    }
    if (deferredMessageSaveRef.current) {
      clearTimeout(deferredMessageSaveRef.current);
      deferredMessageSaveRef.current = null;
    }
    syncActiveThreadMessages(messages, true);
  }, [messages, status, syncActiveThreadMessages]);

  useEffect(() => () => {
    if (deferredMessageSaveRef.current) clearTimeout(deferredMessageSaveRef.current);
  }, []);

  // rAF-throttle auto-scroll so streaming tokens don't flood scroll events.
  const scrollFrame = useRef<number | null>(null);
  useEffect(() => {
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const el = scrollRef.current;
      if (!el) return;
      // "auto" during streaming feels smoother than "smooth" (no queued animations).
      el.scrollTo({ top: el.scrollHeight, behavior: status === "streaming" ? "auto" : "smooth" });
    });
  }, [messages, status]);

  const persist = useCallback((next: ChatThread[]) => {
    setThreads(next);
    saveThreads(user.userId, next);
    if (user.userId) saveThreadsToCloud(user.userId, next);
  }, [user.userId]);

  const handleNewChat = () => {
    setShowCreateChat(true);
  };

  // Build a default title like "<Name> Chat 3" — unique across existing threads.
  const defaultChatName = useCallback(() => {
    const first =
      (user.profile?.display_name?.split(" ")[0] || user.profile?.email?.split("@")[0] || "New").trim();
    const re = new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} Chat (\\d+)$`);
    let max = 0;
    for (const t of threads) {
      const m = t.title.match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
    }
    return `${first} Chat ${max + 1}`;
  }, [threads, user.profile?.display_name, user.profile?.email]);

  // Create a fresh thread with the given title and open it immediately.
  const createChatWithTitle = useCallback(
    (title: string) => {
      const newId = newThreadId();
      const thread: ChatThread = {
        id: newId,
        title: title.trim() || defaultChatName(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      };
      activeIdRef.current = newId;
      setActiveId(newId);
      setChatId(newId);
      setInput("");
      persist([thread, ...threads]);
      lastHydratedRef.current = newId;
      setMessages([]);
      navigate({ to: "/chat/$chatId", params: { chatId: newId } });
      // Focus composer so the user can start typing right away.
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [defaultChatName, navigate, persist, threads, setMessages],
  );

  const handleCreateContinue = (name: string) => {
    setShowCreateChat(false);
    createChatWithTitle(name);
  };

  const handleCreateSkip = () => {
    setShowCreateChat(false);
    createChatWithTitle(defaultChatName());
  };

  const handleDelete = (id: string) => {
    const next = threads.filter((t) => t.id !== id);
    persist(next);
    if (activeId === id) {
      const nextActive = next[0]?.id ?? null;
      setActiveId(nextActive);
      setChatId(nextActive ?? newThreadId());
      if (nextActive) navigate({ to: "/chat/$chatId", params: { chatId: nextActive } });
      else navigate({ to: "/chat" });
    }
  };

  const handleSelect = (id: string) => {
    const t = threads.find((x) => x.id === id);
    if (!t) return;
    setActiveId(id);
    setChatId(id);
    navigate({ to: "/chat/$chatId", params: { chatId: id } });
  };

  const handleRename = (id: string) => {
    const t = threads.find((x) => x.id === id);
    if (!t) return;
    setRenameModal({ id, currentName: t.title });
  };

  const confirmRename = (name: string) => {
    if (!renameModal || !name.trim()) return;
    persist(threads.map((x) => (x.id === renameModal.id ? { ...x, title: name.trim(), updatedAt: Date.now() } : x)));
    setRenameModal(null);
  };


  const handlePin = (id: string) => {
    persist(threads.map((x) => (x.id === id ? { ...x, pinned: !x.pinned } : x)));
  };


  const handleShare = async (id: string) => {
    const t = threads.find((x) => x.id === id);
    if (!t) return;
    if (!user.userId) {
      toast.error("Please sign in to share");
      return;
    }
    try {
      // AI SDK v5 messages carry text inside `parts`. Older cached threads
      // may have a flat `content` string. Extract a plain-text snapshot so
      // the read-only share page renders the actual conversation.
      const payload = t.messages.map(extractMessageContent).filter((m): m is { role: "user" | "assistant"; content: string } => !!m);
      const { data, error } = await supabase
        .from("public_chat_snapshots" as never)
        .insert({ owner_id: user.userId, title: t.title || "Shared chat", messages: payload } as never)
        .select("id" as never)
        .single();
      if (error || !data) throw new Error(error?.message ?? "Failed to share");
      const shareId = (data as unknown as { id: string }).id;
      const url = `${window.location.origin}/share/${shareId}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Read-only share link copied to clipboard");
      } catch {
        toast.success("Share link created");
      }
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create share link");
    }
  };

  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const handleMoveToProject = (id: string) => {
    if (!user.userId) {
      toast.error("Please sign in to move chats");
      return;
    }
    setMoveTargetId(id);
  };

  const performMove = async (projectId: string, projectName: string) => {
    const id = moveTargetId;
    if (!id || !user.userId) return;
    const t = threads.find((x) => x.id === id);
    if (!t) return;
    try {
      // Create the project_chat with full message history preserved
      const { data: pc, error: pcErr } = await supabase
        .from("project_chats" as never)
        .insert({
          project_id: projectId,
          created_by: user.userId,
          title: t.title || "Untitled chat",
        } as never)
        .select("id" as never)
        .single();
      if (pcErr || !pc) throw new Error(pcErr?.message ?? "Could not create project chat");
      const chatId = (pc as unknown as { id: string }).id;
      // Use the same parts-aware extraction as handleShare — reading
      // `m.content` directly was always empty for AI SDK v5 messages
      // (their text lives in `m.parts`), so moved chats silently lost
      // all their message content while still showing a success toast.
      const rows = t.messages
        .map(extractMessageContent)
        .filter((m): m is { role: "user" | "assistant"; content: string } => !!m)
        .map((m) => ({
          chat_id: chatId,
          author_id: m.role === "user" ? user.userId : null,
          role: m.role,
          content: m.content.slice(0, 30000),
        }));
      if (rows.length) {
        await supabase.from("project_messages" as never).insert(rows as never);
      }
      // Tag the local thread so we know where it lives
      persist(
        threads.map((x) =>
          x.id === id ? { ...x, projectId, updatedAt: Date.now() } : x,
        ),
      );
      toast.success(`Moved to ${projectName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move chat");
    }
  };




  const toggleVoiceInput = () => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      isSecureContext?: boolean;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error("Voice input isn't supported in this browser. Try Chrome or Edge on desktop.");
      return;
    }
    if (window.isSecureContext === false) {
      toast.error("Voice input requires a secure (https) connection.");
      return;
    }

    if (listening) {
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = navigator.language || "en-US";
      rec.interimResults = true;
      // Keep listening until user presses stop or the browser cuts off.
      rec.continuous = true;
      const baseline = input;
      rec.onresult = (event: SpeechRecognitionEventLike) => {
        let transcript = "";
        // Aggregate ALL results so far — event.results grows across events.
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInput((baseline ? baseline.replace(/\s*$/, " ") : "") + transcript);
      };
      let retriedNetwork = false;
      rec.onerror = (event: unknown) => {
        const err = (event as { error?: string } | null)?.error;
        if (err === "not-allowed" || err === "service-not-allowed") {
          toast.error("Microphone permission denied. Enable it in your browser settings.");
        } else if (err === "no-speech") {
          // Silent — user just didn't say anything.
        } else if (err === "audio-capture") {
          toast.error("No microphone detected. Connect a mic and try again.");
        } else if (err === "network" && !retriedNetwork) {
          retriedNetwork = true;
          try { rec.stop(); } catch { /* ignore */ }
          setTimeout(() => { try { rec.start(); } catch { /* ignore */ } }, 400);
          return;
        } else if (err === "network") {
          toast.error("Voice recognition unavailable right now. Try again in a moment.");
        } else if (err && err !== "aborted") {
          toast.error(`Voice input error: ${err}`);
        }
        setListening(false);
        recognitionRef.current = null;
      };
      rec.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch {
      toast.error("Could not start voice input. Your browser may not support speech recognition.");
      setListening(false);
    }
  };



  // Image-intent detection lives in `@/lib/image-intent` (fuzzy + typo-tolerant).
  // Returns the URL of the most recently *completed* generated image so
  // explicit edit prompts can reuse it. We match http(s) URLs (public bucket)
  // and legacy data URLs (older messages). Placeholders and progress text
  // never match because they don't contain markdown image syntax.
  const extractLastGeneratedImage = (
    msgs: UIMessage[],
  ): { url: string; parentId?: string } | undefined => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role !== "assistant") continue;
      const parts = (m as unknown as { parts?: Array<{ type: string; text?: string }> }).parts ?? [];
      for (const p of parts) {
        if (p.type === "text" && typeof p.text === "string") {
          const match = p.text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+|data:image\/[^)]+)\)/);
          if (match) {
            // Assistant image messages created by generateImageInline use
            // id `a_<uuid>`; parse that back so we can persist provenance.
            const idMatch = /^a_([0-9a-f-]{36})$/i.exec(m.id);
            return { url: match[1], parentId: idMatch?.[1] };
          }
        }
      }
    }
    return undefined;
  };

  // Free plan: 3 image generations / 24h. Tracked in localStorage.
  const IMG_QUOTA_KEY = "prismxgpt.imgquota.v1";
  const readImgQuota = (): { count: number; resetAt: number } => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(IMG_QUOTA_KEY) : null;
      if (!raw) return { count: 0, resetAt: Date.now() + 86400000 };
      const p = JSON.parse(raw) as { count: number; resetAt: number };
      if (Date.now() > p.resetAt) return { count: 0, resetAt: Date.now() + 86400000 };
      return p;
    } catch { return { count: 0, resetAt: Date.now() + 86400000 }; }
  };
  const bumpImgQuota = () => {
    const q = readImgQuota();
    const next = { count: q.count + 1, resetAt: q.resetAt };
    try { window.localStorage.setItem(IMG_QUOTA_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const generateImageInline = async (prompt: string, inputImage?: string, parentId?: string) => {
    const isFree = !user.isPremium;
    if (isFree) {
      const q = readImgQuota();
      if (q.count >= 3) {
        toast.error("Free plan limit reached: 3 images/day. Upgrade for more.");
        return;
      }
    }
    // Client-owned generation id — persisted BEFORE the POST returns so a
    // refresh mid-flight can resume by polling GET /api/image?id=<id>.
    const generationId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-0000-0000-0000-000000000000`;
    const marker = inputImage
      ? `⟪imgedit:pending:${generationId}⟫`
      : `⟪imggen:pending:${generationId}⟫`;
    const userMsg = { id: `u_${Date.now()}`, role: "user" as const, parts: [{ type: "text" as const, text: prompt }] };
    const asstId = `a_${generationId}`;
    const asstPlaceholder = { id: asstId, role: "assistant" as const, parts: [{ type: "text" as const, text: marker }] };
    // Force-persist the placeholder immediately so refresh can recover it.
    setMessages((prev) => {
      const next = [...prev, userMsg as unknown as UIMessage, asstPlaceholder as unknown as UIMessage];
      queueMicrotask(() => syncActiveThreadMessages(next, true));
      return next;
    });

    const callImageApi = async (): Promise<Response> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      return fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ generationId, prompt, ...(inputImage ? { inputImage } : {}), ...(parentId ? { parentId } : {}) }),
      });
    };

    try {
      let res: Response;
      try {
        res = await callImageApi();
        if (!res.ok && (res.status >= 500 || res.status === 0)) {
          await new Promise((r) => setTimeout(r, 500));
          res = await callImageApi();
        }
      } catch (netErr) {
        console.error("[image] network", netErr);
        throw new Error("I couldn't reach the image service. Check your connection and try again.");
      }

      const payload = await res.json().catch(() => null) as {
        imageUrl?: string;
        dataUrl?: string;
        status?: string;
        error?: string;
      } | null;
      const finalUrl = payload?.imageUrl || payload?.dataUrl;
      if (!res.ok || !finalUrl) {
        const msg = payload?.error || "Image generation is temporarily unavailable. Please try again in a moment.";
        throw new Error(msg);
      }
      if (isFree) bumpImgQuota();
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === asstId
            ? ({ ...m, parts: [{ type: "text", text: `![generated image](${finalUrl})` }] } as unknown as UIMessage)
            : m,
        );
        queueMicrotask(() => syncActiveThreadMessages(next, true));
        return next;
      });
    } catch (e) {
      console.error("[image] failed", e);
      const msg = e instanceof Error ? e.message : "Image generation is temporarily unavailable. Please try again in a moment.";
      // Don't overwrite the pending marker with an error if the server row
      // might still be processing — the recovery poller will finalize it.
      // But if the fetch itself errored out, surface the error now.
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === asstId
            ? ({ ...m, parts: [{ type: "text", text: msg }] } as unknown as UIMessage)
            : m,
        );
        queueMicrotask(() => syncActiveThreadMessages(next, true));
        return next;
      });
    }
  };


  // Core send: create thread if none active (fallback for typing straight into
  // /chat), then dispatch AI SDK message. We NEVER auto-rename the chat from
  // the first prompt — titles come from the Create New Chat modal or default
  // "<Name> Chat N" naming, and stay stable until the user renames manually.
  const performSend = async (opts: { text: string; files: File[] }) => {
    const { text, files } = opts;
    const isFirst = !activeId;
    if (isFirst) {
      const thread: ChatThread = {
        id: chatId,
        title: defaultChatName(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      };
      activeIdRef.current = thread.id; // sync ref so streaming persistence works before re-render
      setActiveId(thread.id);
      persist([thread, ...threads]);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/chat/${thread.id}`);
      }
    }


    // Image intent short-circuit.
    //  1. Explicit edit ("edit it", "make it blue", "remove background", …)
    //     reuses the most recent completed image as input. This is the ONLY
    //     path that touches the previous generation.
    //  2. A fresh explicit image request ("generate a logo", "draw a cat",
    //     "anime girl") starts a brand-new generation with no input image.
    //  3. Everything else — greetings, follow-ups, questions, thanks — falls
    //     through to normal chat and NEVER reuses a completed image or
    //     triggers image generation.
    if (files.length === 0) {
      const lastImg = extractLastGeneratedImage(messages);
      if (lastImg && isExplicitImageEdit(text)) {
        await generateImageInline(text, lastImg.url, lastImg.parentId);
        return;
      }
      const intent = detectImageIntent(text);
      if (intent.isImage && intent.confidence >= 0.7) {
        await generateImageInline(text);
        return;
      }
    }



    const fileParts = files.length
      ? await Promise.all(
          files.map(
            (f) =>
              new Promise<{ type: "file"; mediaType: string; url: string; filename: string }>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve({
                    type: "file",
                    mediaType: f.type || "application/octet-stream",
                    url: reader.result as string,
                    filename: f.name,
                  });
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(f);
              }),
          ),
        )
      : undefined;
    await sendMessage({ text: text || " ", files: fileParts });
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || status === "streaming" || status === "submitted") return;
    const files = attachments.slice();
    setInput("");
    setAttachments([]);
    // Instant reply for trivial greetings/acks — skip round-trip and thinking UI.
    const instant = files.length === 0 ? getInstantReply(text) : null;
    if (instant) {
      const now = Date.now();
      setMessages((prev) => [
        ...prev,
        { id: `u-${now}`, role: "user", parts: [{ type: "text", text }] } as UIMessage,
        { id: `a-${now}`, role: "assistant", parts: [{ type: "text", text: instant }] } as UIMessage,
      ]);
      return;
    }
    await performSend({ text, files });
  };

  const isBusy = status === "streaming" || status === "submitted";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <PrismSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        threads={threads}
        activeId={activeId}
        onSelectThread={(id) => { setMobileNavOpen(false); handleSelect(id); }}
        onNewChat={() => { setMobileNavOpen(false); handleNewChat(); }}
        onDeleteThread={handleDelete}
        onRenameThread={handleRename}
        onPinThread={handlePin}
        onShareThread={handleShare}
        onMoveThread={handleMoveToProject}
        user={user}
        onOpenSearch={() => { setMobileNavOpen(false); setShowSearch(true); }}
        onOpenLibrary={() => { setMobileNavOpen(false); setShowLibrary(true); }}
        onOpenProjects={() => { setMobileNavOpen(false); setShowProjects(true); }}
        onOpenPlus={() => { setMobileNavOpen(false); setShowPlus(true); }}
        onOpenProfile={() => { setMobileNavOpen(false); setShowProfile(true); }}
        onOpenImage={() => { setMobileNavOpen(false); setShowImage(true); }}
        onOpenSettings={() => { setMobileNavOpen(false); setShowSettings(true); }}
      />

      <main
        className="relative flex min-w-0 flex-1 flex-col"
        onDragEnter={(e) => {
          if (!e.dataTransfer?.types?.includes("Files")) return;
          e.preventDefault();
          dragCounterRef.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (!e.dataTransfer?.types?.includes("Files")) return;
          dragCounterRef.current -= 1;
          if (dragCounterRef.current <= 0) {
            dragCounterRef.current = 0;
            setIsDragging(false);
          }
        }}
        onDrop={(e) => {
          if (!e.dataTransfer?.files?.length) return;
          e.preventDefault();
          dragCounterRef.current = 0;
          setIsDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-brand/60 bg-card/80 px-10 py-8 shadow-elevated">
              <UploadCloud className="h-10 w-10 text-brand" />
              <div className="text-base font-semibold">Drop files to attach</div>
              <div className="text-xs text-muted-foreground">Images, PDFs, docs — up to 20MB each</div>
            </div>
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[500px]"
          style={{ background: "var(--gradient-hero)" }}
        />

        <header className="relative z-10 flex items-center gap-2 border-b border-border px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">

          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Open sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1 truncate text-sm font-medium">{active?.title ?? "New chat"}</div>
        </header>
        <AnnouncementBanner settingKey="chat_announcement" />


        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-8">
            {messages.length === 0 ? (
              <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
                <div className="mb-4">
                  <PrismXLogo size="lg" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  How can I help you today
                  {user.profile?.display_name ? `, ${user.profile.display_name.split(" ")[0]}` : ""}?
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ask anything — writing, coding, research, ideas.
                </p>
                <NewChatHintBanner userId={user.userId} onNewChat={handleNewChat} />
              </div>

            ) : (
              <div className="space-y-6">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} text={getMessageText(m)} />
                ))}
                {isBusy && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex gap-3">
                    <PrismXLogo size="sm" />
                    <ThinkingStatus />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="relative z-10 border-t border-border bg-background/60 px-3 py-3 backdrop-blur sm:px-4 sm:py-4">
          <div className="mx-auto max-w-3xl">
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((f, i) => (
                  <div
                    key={i}
                    className="group relative flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 text-xs"
                  >
                    {f.type.startsWith("image/") ? (
                      <AttachmentThumbnail file={f} />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                        <Paperclip className="h-4 w-4" />
                      </div>
                    )}
                    <span className="max-w-[140px] truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((a) => a.filter((_, idx) => idx !== i))}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-muted-foreground hover:text-foreground"
                      aria-label="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <form
            className="relative mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-card p-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowComposerMenu((v) => !v)}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="More actions"
              >
                <Plus className="h-4 w-4" />
              </button>
              {showComposerMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowComposerMenu(false)} />
                  <div className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
                    <button
                      type="button"
                      onClick={() => {
                        setShowComposerMenu(false);
                        fileInputRef.current?.click();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm transition hover:bg-accent"
                    >
                      <Paperclip className="h-4 w-4 text-brand" />
                      <span className="font-medium">Add photos & files</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowComposerMenu(false);
                        setShowImage(true);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm transition hover:bg-accent"
                    >
                      <ImageIcon className="h-4 w-4 text-brand" />
                      <span className="font-medium">Create image</span>
                      <span className="text-xs text-muted-foreground">Visualize anything</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowComposerMenu(false);
                        setMode((m) => (m === "web" ? "default" : "web"));
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-sm transition hover:bg-accent ${mode === "web" ? "bg-accent" : ""}`}
                    >
                      <Globe className="h-4 w-4 text-brand" />
                      <span className="font-medium">Web search</span>
                      <span className="text-xs text-muted-foreground">
                        {mode === "web" ? "On" : "Real-time info"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowComposerMenu(false);
                        setMode((m) => (m === "research" ? "default" : "research"));
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-sm transition hover:bg-accent ${mode === "research" ? "bg-accent" : ""}`}
                    >
                      <Telescope className="h-4 w-4 text-brand" />
                      <span className="font-medium">Deep research</span>
                      <span className="text-xs text-muted-foreground">
                        {mode === "research" ? "On" : "Detailed report"}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) addFiles(files);
                if (e.target) e.target.value = "";
              }}
            />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onPaste={handlePaste}
              placeholder="Message PrismXGPT…"
              rows={1}
              wrap="soft"
              className="max-h-48 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground [overflow-wrap:anywhere] [word-break:break-word] sm:text-sm"
            />
            <button
              type="button"
              onClick={toggleVoiceInput}
              className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl transition hover:bg-accent ${listening ? "text-brand animate-pulse" : "text-muted-foreground hover:text-foreground"}`}
              aria-label={listening ? "Stop voice input" : "Voice input"}
              title={listening ? "Stop voice input" : "Voice input"}
            >
              <Mic className="h-4 w-4" />
            </button>
            {isBusy ? (
              <button
                type="button"
                onClick={() => stop()}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-foreground text-background"
                aria-label="Stop"
              >
                <Square className="h-3.5 w-3.5" fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-brand-foreground transition hover:opacity-90 disabled:opacity-40"
                style={{ background: "var(--gradient-brand)" }}
                aria-label="Send"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </form>
          {mode !== "default" && (
            <div className="mx-auto mt-2 flex max-w-3xl items-center justify-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-0.5 font-medium text-brand">
                {mode === "web" ? <Globe className="h-3 w-3" /> : <Telescope className="h-3 w-3" />}
                {mode === "web" ? "Web search on" : "Deep research on"}
                <button
                  type="button"
                  onClick={() => setMode("default")}
                  className="ml-1 rounded-full hover:opacity-70"
                  aria-label="Turn off mode"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          )}
          <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
            PrismXGPT can make mistakes. Check important info.
          </p>
        </div>
      </main>



      <Suspense fallback={null}>
        {showPlus && <PlusModal open={showPlus} onClose={() => setShowPlus(false)} />}
        {showProfile && (
          <ProfileEditModal
            open={showProfile}
            onClose={() => setShowProfile(false)}
            profile={user.profile}
            onSaved={() => user.refresh()}
          />
        )}
        {showSearch && (
          <SearchModal
            open={showSearch}
            onClose={() => setShowSearch(false)}
            threads={threads}
            onSelect={handleSelect}
            onNewChat={handleNewChat}
          />
        )}
        {showLibrary && <LibraryModal open={showLibrary} onClose={() => setShowLibrary(false)} />}
        {showProjects && <ProjectsModal open={showProjects} onClose={() => setShowProjects(false)} />}
        {showImage && <ImageModal open={showImage} onClose={() => setShowImage(false)} />}
        {showSettings && (
          <SettingsModal
            open={showSettings}
            onClose={() => setShowSettings(false)}
            profile={user.profile}
            onSaved={() => user.refresh()}
            onClearHistory={() => {
              if (!user.userId) return;
              persist([]);
              setActiveId(null);
              setChatId(newThreadId());
              setMessages([]);
              toast.success("Chat history cleared");
              navigate({ to: "/chat" });
            }}
          />
        )}
        {moveTargetId !== null && (
          <MoveToProjectModal
            open={moveTargetId !== null}
            onClose={() => setMoveTargetId(null)}
            chatTitle={threads.find((t) => t.id === moveTargetId)?.title ?? ""}
            onMove={performMove}
          />
        )}
        {renameModal && (
          <RenameChatModal
            open={!!renameModal}
            currentName={renameModal?.currentName ?? ""}
            onClose={() => setRenameModal(null)}
            onSave={confirmRename}
          />
        )}
        {showCreateChat && (
          <CreateChatModal
            open={showCreateChat}
            onClose={() => setShowCreateChat(false)}
            onContinue={handleCreateContinue}
            onSkip={handleCreateSkip}
          />
        )}
      </Suspense>
    </div>
  );
}

/**
 * Small dismissible hint shown on the empty New Chat screen. Dismissal is
 * remembered per-user in localStorage; it never blocks the interface and
 * disappears the moment any message exists.
 */
function NewChatHintBanner({ userId, onNewChat }: { userId: string | null; onNewChat: () => void }) {
  const key = `prismxgpt.newchat-hint-dismissed:${userId ?? "anon"}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(key) === "1"; } catch { return false; }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { setDismissed(window.localStorage.getItem(key) === "1"); } catch { /* ignore */ }
  }, [key]);
  if (dismissed) return null;
  return (
    <div className="mt-6 inline-flex max-w-md items-center gap-3 rounded-2xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-left text-sm">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
      <button
        type="button"
        onClick={onNewChat}
        className="flex-1 text-foreground hover:text-brand"
      >
        Click <span className="font-semibold">'New Chat'</span> to create a conversation.
      </button>
      <button
        type="button"
        onClick={() => {
          try { window.localStorage.setItem(key, "1"); } catch { /* ignore */ }
          setDismissed(true);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Dismiss hint"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };
  const label = (language || "code").toLowerCase();
  const pretty =
    label === "js" ? "JavaScript"
    : label === "ts" ? "TypeScript"
    : label === "tsx" ? "TSX"
    : label === "jsx" ? "JSX"
    : label === "py" ? "Python"
    : label === "sh" || label === "bash" ? "Bash"
    : label === "md" ? "Markdown"
    : label === "html" ? "HTML"
    : label === "css" ? "CSS"
    : label === "json" ? "JSON"
    : label === "sql" ? "SQL"
    : label.charAt(0).toUpperCase() + label.slice(1);

  return (
    <div className="group relative my-4 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0d14] shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_10px_30px_-15px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/70" />
          </span>
          <span className="ml-2 font-mono text-[11px] font-medium tracking-wide text-muted-foreground">
            {pretty}
          </span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-white/10 hover:bg-white/[0.06] hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 leading-[1.65]">
        <code className="font-mono text-[13px] text-[#e6edf3]">{code}</code>
      </pre>
    </div>
  );
}

// Strip accidental tool-call / ReAct scaffolding from assistant text so
// users never see JSON, action_input, or "Thought:" traces. Applied only
// to assistant messages — user text is rendered as-is.
function sanitizeAssistantText(raw: string): string {
  if (!raw) return raw;
  let s = raw;
  // Fenced ```json / ```tool blocks whose body mentions action/thought/tool
  s = s.replace(/```(?:json|tool[a-z_]*|function[a-z_]*)?\s*\n([\s\S]*?)```/gi, (m, body: string) => {
    return /"?(action|action_input|tool|tool_name|thought|function|arguments)"?\s*[:=]/i.test(body) ? "" : m;
  });
  // Bare JSON object containing action/action_input/tool/thought
  s = s.replace(/^\s*\{[\s\S]{0,2000}?"(?:action|action_input|tool|thought)"[\s\S]{0,2000}?\}\s*$/gim, "");
  // ReAct-style prefixes on their own line
  s = s.replace(/^\s*(?:Thought|Action|Action Input|Observation|Tool|Tool Input|Function Call)\s*:.*$/gim, "");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

const MessageBubble = memo(
  function MessageBubble({ message, text }: { message: UIMessage; text: string }) {
    if (message.role === "user") {
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-sm">
            <Collapsible maxHeight={280}>
              <div className="whitespace-pre-wrap [overflow-wrap:anywhere] [word-break:break-word]">{text}</div>
            </Collapsible>
          </div>
        </div>
      );
    }
    const t = text.trim();
    const pendingMatch = t.match(/^⟪(imggen|imgedit):pending:([0-9a-f-]{36})⟫$/i);
    if (pendingMatch || t === "⟪imggen:generating⟫" || t === "⟪imggen:editing⟫") {
      const mode: "editing" | "generating" =
        pendingMatch?.[1] === "imgedit" || t === "⟪imggen:editing⟫" ? "editing" : "generating";
      return (
        <div className="flex gap-3">
          <PrismXLogo size="sm" />
          <ImageGenProgress mode={mode} />
        </div>
      );
    }
    return <AssistantMessage text={sanitizeAssistantText(text)} />;
  },
  (prev, next) => {
    if (prev.message.id !== next.message.id) return false;
    if (prev.message.role !== next.message.role) return false;
    return prev.text === next.text;
  },
);

const INSTANT_REPLIES: Array<{ re: RegExp; reply: string }> = [
  { re: /^(hi|hey|hello|yo|hola|sup)[!.\s]*$/i, reply: "Hey! 👋 How can I help you today?" },
  { re: /^(good\s*(morning|afternoon|evening|night))[!.\s]*$/i, reply: "Hello! How can I help?" },
  { re: /^(thanks|thank\s*you|thx|ty)[!.\s]*$/i, reply: "You're welcome!" },
  { re: /^(ok|okay|k|kk|cool|great|nice|awesome|got\s*it)[!.\s]*$/i, reply: "👍" },
  { re: /^(yes|yep|yeah|sure)[!.\s]*$/i, reply: "Got it." },
  { re: /^(no|nope|nah)[!.\s]*$/i, reply: "Okay." },
  { re: /^(bye|goodbye|see\s*ya|cya)[!.\s]*$/i, reply: "See you later! 👋" },
  { re: /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]{1,4}$/u, reply: "👋" },
];

function getInstantReply(text: string): string | null {
  const t = text.trim();
  if (!t || t.length > 30) return null;
  for (const { re, reply } of INSTANT_REPLIES) if (re.test(t)) return reply;
  return null;
}

// Progressive thinking status: shows a single message initially, and only
// advances to the next stage after a delay. Each stage is shown at most once.
const THINKING_STAGES = [
  { at: 0, label: "PrismXGPT is thinking" },
  { at: 3000, label: "Analyzing your request" },
  { at: 6000, label: "Planning response" },
  { at: 10000, label: "Writing answer" },
  { at: 16000, label: "Finalizing" },
];

function ThinkingStatus() {
  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    // Delay the pill so instant/short assistant responses (<250ms first token)
    // never flash "Thinking…" for a frame.
    const showT = setTimeout(() => setVisible(true), 250);
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      let next = 0;
      for (let i = 0; i < THINKING_STAGES.length; i++) {
        if (elapsed >= THINKING_STAGES[i].at) next = i;
      }
      setStage((prev) => (next > prev ? next : prev));
    }, 400);
    return () => {
      clearTimeout(showT);
      clearInterval(id);
    };
  }, []);
  if (!visible) return null;
  return (
    <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
      </span>
      <span className="animate-pulse">{THINKING_STAGES[stage].label}…</span>
    </div>
  );
}

const IMAGE_STAGES = [
  "Preparing prompt",
  "Sending to provider",
  "Generating pixels",
  "Refining details",
  "Upscaling",
  "Saving to Library",
  "Finalizing",
];

function ImageGenProgress({ mode }: { mode: "generating" | "editing" }) {
  const [pct, setPct] = useState(4);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      // Asymptotic curve — creeps toward 95% but never reaches 100 until swap.
      const target = Math.min(95, 100 * (1 - Math.exp(-elapsed / 8)));
      setPct((p) => (target > p ? target : p + (95 - p) * 0.02));
      setStage(Math.min(IMAGE_STAGES.length - 1, Math.floor(elapsed / 2.2)));
    }, 220);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="min-w-0 flex-1">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/60 p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <span className="text-lg">🎨</span>
          <span>{mode === "editing" ? "Editing image" : "Creating image"}</span>
        </div>
        <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand via-brand to-brand/70 transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="animate-pulse">{IMAGE_STAGES[stage]}…</span>
          <span>{Math.round(pct)}%</span>
        </div>
      </div>
    </div>
  );
}

function getMessageText(message: UIMessage) {
  if (Array.isArray(message.parts)) {
    return message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  }
  return (message as unknown as { content?: string }).content ?? "";
}

export function AssistantMessage({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="group/msg flex gap-3">
      <PrismXLogo size="sm" />

      <div className="min-w-0 flex-1">
        <div
          className="max-w-none text-[15px] leading-7 text-foreground/90
            [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
            [&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold
            [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold
            [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold
            [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6
            [&_li]:my-1 [&_li_p]:my-0
            [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2
            [&_strong]:font-semibold [&_strong]:text-foreground
            [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-brand/60 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground
            [&_hr]:my-4 [&_hr]:border-border
            [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
            [&_th]:border [&_th]:border-border [&_th]:bg-white/[0.03] [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left
            [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5
            [&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:border [&_:not(pre)>code]:border-border
            [&_:not(pre)>code]:bg-white/[0.04] [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5
            [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.88em] [&_:not(pre)>code]:text-foreground"
        >
          <Collapsible maxHeight={/!\[[^\]]*\]\(data:image\//.test(text) ? 9999 : 340}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={(url) => (url.startsWith("data:image/") ? url : defaultUrlTransform(url))}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const isBlock = /\n/.test(String(children)) || Boolean(match);
                if (!isBlock) {
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }
                return (
                  <CodeBlock
                    language={match?.[1] ?? ""}
                    code={String(children).replace(/\n$/, "")}
                  />
                );
              },
              pre({ children }) {
                return <>{children}</>;
              },
              img({ src, alt }) {
                if (!src) return null;
                return (
                  <img
                    src={typeof src === "string" ? src : ""}
                    alt={alt ?? "generated image"}
                    className="my-3 max-h-[480px] w-auto max-w-full rounded-xl border border-border"
                    loading="lazy"
                  />
                );
              },
            }}
          >
            {text}
          </ReactMarkdown>
          </Collapsible>

        </div>

        <div
          className="mt-2 flex items-center gap-1 opacity-0 translate-y-1 transition-all duration-200 ease-out group-hover/msg:opacity-100 group-hover/msg:translate-y-0 focus-within:opacity-100 focus-within:translate-y-0"
          aria-label="Message actions"
        >
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Copy message"
            title={copied ? "Copied" : "Copy"}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setFeedback((f) => (f === "up" ? null : "up"))}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-accent hover:text-foreground ${
              feedback === "up" ? "text-brand" : "text-muted-foreground"
            }`}
            aria-label="Good response"
            title="Good response"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setFeedback((f) => (f === "down" ? null : "down"))}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-accent hover:text-foreground ${
              feedback === "down" ? "text-brand" : "text-muted-foreground"
            }`}
            aria-label="Bad response"
            title="Bad response"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Collapsible({ children, maxHeight = 320 }: { children: ReactNode; maxHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight > maxHeight + 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxHeight, children]);

  return (
    <div className="relative">
      <div
        ref={ref}
        style={!expanded && overflowing ? { maxHeight, overflow: "hidden" } : undefined}
        className={!expanded && overflowing ? "transition-[max-height] duration-300" : "transition-[max-height] duration-300"}
      >
        {children}
      </div>
      {!expanded && overflowing && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-8 h-16 bg-gradient-to-t from-background to-transparent"
        />
      )}
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          {expanded ? (<><ChevronUp className="h-3.5 w-3.5" /> Show less</>) : (<><ChevronDown className="h-3.5 w-3.5" /> Show more</>)}
        </button>
      )}
    </div>
  );
}

// Prevent lint unused
void supabase;

