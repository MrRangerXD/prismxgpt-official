import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  email: string | null;
};

export type UserContext = {
  loading: boolean;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  isAdmin: boolean;
  isPremium: boolean;
  isPro: boolean;
  planExpiresAt: string | null;
  refresh: () => Promise<void>;
};

// Module-level cache so navigating between routes (which remounts the
// component tree) doesn't flash a logged-out state or re-run the network
// round-trip. First mount hydrates from cache synchronously.
type CachedProfile = Omit<UserContext, "refresh">;

const emptyProfile: CachedProfile = {
  loading: true,
  userId: null,
  email: null,
  profile: null,
  isAdmin: false,
  isPremium: false,
  isPro: false,
  planExpiresAt: null,
};

let cachedProfile: CachedProfile | null = null;
const listeners = new Set<(v: CachedProfile) => void>();
function publish(v: CachedProfile) {
  cachedProfile = v;
  listeners.forEach((l) => l(v));
}

// `useProfile()` is called from many components that can mount at the same
// time (e.g. the chat page plus several modals). Previously each mounted
// instance registered its own `onAuthStateChange` subscription and fired its
// own `profiles` + `user_roles` fetch, so a single sign-in event caused N
// duplicate subscriptions and N duplicate pairs of DB queries. `doLoad` and
// the auth subscription below are module-level singletons shared by every
// instance, regardless of how many components use the hook.
let inflightLoad: Promise<void> | null = null;

function load(): Promise<void> {
  if (inflightLoad) return inflightLoad;
  inflightLoad = doLoad().finally(() => {
    inflightLoad = null;
  });
  return inflightLoad;
}

async function doLoad(): Promise<void> {
  // Don't flash "loading" on a background refresh if we already have data.
  if (!cachedProfile) publish({ ...emptyProfile, loading: true });

  // Fast path: read the persisted session from localStorage without a
  // server round-trip. `getUser()` validates with the auth server and can
  // transiently return null on network hiccups, which manifests as
  // "logged out on refresh". Trust getSession() for identity and only fall
  // back to getUser() when there is no session at all.
  const { data: sessionData } = await supabase.auth.getSession();
  let user = sessionData.session?.user ?? null;
  if (!user) {
    const { data: userData } = await supabase.auth.getUser();
    user = userData.user ?? null;
  }
  if (!user) {
    publish({
      loading: false, userId: null, email: null, profile: null,
      isAdmin: false, isPremium: false, isPro: false, planExpiresAt: null,
    });
    return;
  }

  const [{ data: prof }, { data: roles }] = await Promise.all([
    supabase.from("profiles" as never).select("*").eq("id" as never, user.id as never).maybeSingle(),
    supabase.from("user_roles" as never).select("role, expires_at").eq("user_id" as never, user.id as never),
  ]);

  const p = prof as Profile | null;
  let nextProfile: Profile;
  if (p) {
    nextProfile = p;
  } else {
    const meta = user.user_metadata as { full_name?: string; name?: string; username?: string };
    nextProfile = {
      id: user.id,
      display_name: meta?.full_name ?? meta?.name ?? user.email?.split("@")[0] ?? null,
      username: meta?.username ?? user.email?.split("@")[0] ?? null,
      avatar_url: null,
      email: user.email ?? null,
    };
  }

  const now = Date.now();
  const active = ((roles ?? []) as Array<{ role: string; expires_at: string | null }>).filter(
    (r) => !r.expires_at || new Date(r.expires_at).getTime() > now,
  );
  const admin = active.some((x) => x.role === "admin");
  const pro = active.some((x) => x.role === "pro");
  const premium = active.some((x) => x.role === "premium");

  const paid = active.filter((x) => x.role === "premium" || x.role === "pro");
  const withExpiry = paid.filter((x) => x.expires_at).map((x) => x.expires_at as string);
  withExpiry.sort();
  const expiresAt = withExpiry[0] ?? null;

  publish({
    loading: false,
    userId: user.id,
    email: user.email ?? null,
    profile: nextProfile,
    isAdmin: admin,
    isPro: pro || admin,
    isPremium: premium || pro || admin,
    planExpiresAt: expiresAt,
  });
}

// Singleton auth subscription: created once, when the first component using
// useProfile() mounts, and torn down once the last one unmounts. This is
// what used to be duplicated per-instance (see comment above).
let authSub: { unsubscribe: () => void } | null = null;
function ensureAuthSubscribed() {
  if (authSub) return;
  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    // INITIAL_SESSION fires once on page load after the client rehydrates
    // from localStorage. TOKEN_REFRESHED fires when the refresh token is
    // rotated. Both must repopulate the profile cache, otherwise the app
    // renders "signed out" on refresh even though the session is valid.
    if (event === "INITIAL_SESSION") {
      if (session?.user) load();
      else publish({
        loading: false, userId: null, email: null, profile: null,
        isAdmin: false, isPremium: false, isPro: false, planExpiresAt: null,
      });
      return;
    }
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") load();
  });
  authSub = sub.subscription;
}
function releaseAuthSubscriptionIfUnused() {
  if (listeners.size === 0 && authSub) {
    authSub.unsubscribe();
    authSub = null;
  }
}

export function useProfile(): UserContext {
  const initial = cachedProfile ?? emptyProfile;
  const [state, setState] = useState<CachedProfile>(initial);

  useEffect(() => {
    listeners.add(setState);
    ensureAuthSubscribed();
    // Only fetch if nothing has loaded yet in this session. Every other
    // mount just subscribes to the shared cache — no extra network calls.
    if (!cachedProfile) load();
    return () => {
      listeners.delete(setState);
      releaseAuthSubscriptionIfUnused();
    };
  }, []);

  return { ...state, refresh: load };
}

export function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
