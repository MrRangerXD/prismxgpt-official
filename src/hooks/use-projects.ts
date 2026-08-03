import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProjectSummary = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
};

type CacheEntry = { data: ProjectSummary[]; loadedAt: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ProjectSummary[]>>();
const listeners = new Map<string, Set<(p: ProjectSummary[]) => void>>();
// Cache is served instantly; considered fresh for 60s. After that we still
// serve stale data immediately and revalidate in the background.
const FRESH_MS = 60_000;

async function fetchProjects(userId: string): Promise<ProjectSummary[]> {
  const [ownRes, memsRes] = await Promise.all([
    supabase
      .from("projects" as never)
      .select("id, name, owner_id, created_at")
      .eq("owner_id" as never, userId as never)
      .order("created_at" as never, { ascending: false } as never),
    supabase
      .from("project_members" as never)
      .select("projects:project_id(id, name, owner_id, created_at)")
      .eq("user_id" as never, userId as never),
  ]);
  const own = (ownRes.data ?? []) as ProjectSummary[];
  const joined = ((memsRes.data ?? []) as Array<{ projects: ProjectSummary | null }>)
    .map((m) => m.projects)
    .filter((p): p is ProjectSummary => !!p && p.owner_id !== userId);
  const seen = new Set<string>();
  const all = [...own, ...joined].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  return all;
}

function notify(userId: string, data: ProjectSummary[]) {
  const set = listeners.get(userId);
  if (!set) return;
  set.forEach((cb) => cb(data));
}

function ensureLoad(userId: string): Promise<ProjectSummary[]> {
  const existing = inflight.get(userId);
  if (existing) return existing;
  const p = fetchProjects(userId)
    .then((data) => {
      cache.set(userId, { data, loadedAt: Date.now() });
      inflight.delete(userId);
      notify(userId, data);
      return data;
    })
    .catch((e) => {
      inflight.delete(userId);
      throw e;
    });
  inflight.set(userId, p);
  return p;
}

/** Optimistically inject a project (e.g. after inline create) into the cache. */
export function primeProject(userId: string | null | undefined, proj: ProjectSummary) {
  if (!userId) return;
  const entry = cache.get(userId);
  const next = entry ? [proj, ...entry.data.filter((p) => p.id !== proj.id)] : [proj];
  cache.set(userId, { data: next, loadedAt: Date.now() });
  notify(userId, next);
}

/** Invalidate the cache for the user (forces next read to refetch). */
export function invalidateProjects(userId: string | null | undefined) {
  if (!userId) return;
  cache.delete(userId);
}

/**
 * Returns the current user's projects (owned + joined). Serves cached data
 * synchronously when available, revalidates in the background when stale.
 */
export function useProjects(userId: string | null | undefined) {
  const cached = userId ? (cache.get(userId)?.data ?? null) : null;
  const [projects, setProjects] = useState<ProjectSummary[] | null>(cached);
  const [loading, setLoading] = useState<boolean>(!cached && !!userId);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      await ensureLoad(userId);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setProjects(null);
      return;
    }
    // Subscribe to cache updates so multiple consumers stay in sync.
    let set = listeners.get(userId);
    if (!set) {
      set = new Set();
      listeners.set(userId, set);
    }
    const cb = (data: ProjectSummary[]) => setProjects(data);
    set.add(cb);

    const entry = cache.get(userId);
    if (entry) {
      setProjects(entry.data);
      setLoading(false);
      if (Date.now() - entry.loadedAt > FRESH_MS) {
        // Background revalidate; don't flip loading.
        ensureLoad(userId).catch(() => {
          /* ignore */
        });
      }
    } else {
      setLoading(true);
      ensureLoad(userId).finally(() => setLoading(false));
    }

    return () => {
      set!.delete(cb);
    };
  }, [userId]);

  return { projects: projects ?? [], loading, refresh };
}
