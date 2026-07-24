import { supabase } from "@/integrations/supabase/client";
import type { ChatThread } from "./chat-store";

// Debounced cloud sync so cross-device chat history stays consistent.
// Uses one row per user in `user_chat_state` with a jsonb `threads` payload.
let pending: { userId: string; threads: ChatThread[] } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const cache = new Map<string, ChatThread[]>();
const inflight = new Map<string, Promise<ChatThread[] | null>>();
const lastSaved = new Map<string, string>();

export async function loadThreadsFromCloud(userId: string): Promise<ChatThread[] | null> {
  const cached = cache.get(userId);
  if (cached) return cached;
  const existing = inflight.get(userId);
  if (existing) return existing;
  const promise = (async () => {
  try {
    const { data, error } = await supabase
      .from("user_chat_state" as never)
      .select("threads" as never)
      .eq("user_id" as never, userId as never)
      .maybeSingle();
    if (error) return null;
    const row = data as unknown as { threads?: ChatThread[] } | null;
    if (!row || !Array.isArray(row.threads)) return null;
    cache.set(userId, row.threads);
    lastSaved.set(userId, JSON.stringify(row.threads));
    return row.threads;
  } catch {
    return null;
  } finally {
    inflight.delete(userId);
  }
  })();
  inflight.set(userId, promise);
  return promise;
}

export function saveThreadsToCloud(userId: string, threads: ChatThread[]) {
  cache.set(userId, threads);
  const serialized = JSON.stringify(threads);
  if (lastSaved.get(userId) === serialized) return;
  pending = { userId, threads };
  if (timer) return;
  timer = setTimeout(async () => {
    const p = pending;
    timer = null;
    pending = null;
    if (!p) return;
    try {
      await supabase
        .from("user_chat_state" as never)
        .upsert(
          { user_id: p.userId, threads: p.threads, updated_at: new Date().toISOString() } as never,
          { onConflict: "user_id" } as never,
        );
      lastSaved.set(p.userId, JSON.stringify(p.threads));
    } catch {
      /* best-effort */
    }
  }, 800);
}
