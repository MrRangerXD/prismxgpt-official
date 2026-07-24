export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type ChatThread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  pinned?: boolean;
  projectId?: string | null;
  
};

const LEGACY_KEY = "prismxgpt.threads.v1";
const KEY_PREFIX = "prismxgpt.threads.v2:";

function keyFor(userId: string | null | undefined) {
  return userId ? `${KEY_PREFIX}${userId}` : null;
}

export function loadThreads(userId: string | null | undefined): ChatThread[] {
  if (typeof window === "undefined") return [];
  const key = keyFor(userId);
  if (!key) return [];
  try {
    // Remove the legacy shared key so old cross-user history can't leak in.
    if (window.localStorage.getItem(LEGACY_KEY)) {
      window.localStorage.removeItem(LEGACY_KEY);
    }
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatThread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveThreads(userId: string | null | undefined, threads: ChatThread[]) {
  if (typeof window === "undefined") return;
  const key = keyFor(userId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(threads));
  } catch {
    /* ignore quota */
  }
}

export function newThreadId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function titleFromMessage(text: string) {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > 40 ? clean.slice(0, 40) + "…" : clean || "New chat";
}
