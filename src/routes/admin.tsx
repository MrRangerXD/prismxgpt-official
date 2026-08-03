import { createFileRoute, Link } from "@tanstack/react-router";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invalidatePlans } from "@/hooks/use-plans";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";
import {
  ArrowLeft,
  Shield,
  Crown,
  X,
  Search,
  DollarSign,
  Activity,
  Save,
  Megaphone,
  ToggleLeft,
  LogOut,
  Plus,
  Clock,
  LayoutDashboard,
  Users as UsersIcon,
  Menu,
  ChevronUp,
  ChevronDown,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Sparkles,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — PrismXGPT" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AdminPage,
});

type RoleGrant = { role: string; expires_at: string | null };
type Row = {
  id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
  created_at?: string | null;
  roles: RoleGrant[];
};

type LogEntry = {
  id: string;
  actor_id: string | null;
  target_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function AdminLoginGate({ onUnlock }: { onUnlock: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) {
      setError(signInErr.message);
      setBusy(false);
      return;
    }
    onUnlock();
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-elevated"
      >
        <div className="mb-6 text-center">
          <Shield className="mx-auto mb-3 h-10 w-10 text-brand" />
          <h1 className="text-2xl font-semibold">Admin login</h1>
          <p className="mt-1 text-xs text-muted-foreground">Restricted access</p>
        </div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
          required
        />
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
          required
        />
        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
          style={{ background: "var(--gradient-brand)" }}
        >
          {busy ? "Signing in…" : "Unlock admin"}
        </button>
        <Link
          to="/chat"
          className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Back to chat
        </Link>
      </form>
    </div>
  );
}

type Features = { imageGeneration: boolean; deepResearch: boolean; webSearch: boolean };
type Announcement = { message: string; enabled: boolean };
type PaymentMethod = {
  id: string;
  label: string;
  type: "url" | "qr" | "upi" | "crypto" | "text";
  value: string;
  instructions?: string;
};
type PlanSetting = {
  id: string;
  name: string;
  price: string;
  strike_price: string | null;
  note: string | null;
  cta_label: string | null;
  features: string[];
  sort_order: number;
  payment_methods: PaymentMethod[];
};

const DEFAULT_FEATURES: Features = { imageGeneration: true, deepResearch: false, webSearch: false };
const DEFAULT_ANNOUNCEMENT: Announcement = { message: "", enabled: false };

type TabId = "dashboard" | "users" | "pricing" | "features" | "announcement" | "activity";

function AdminPage() {
  const { loading, isAdmin, userId, email, refresh } = useProfile();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("dashboard");
  const [plans, setPlans] = useState<PlanSetting[]>([]);
  const [features, setFeatures] = useState<Features>(DEFAULT_FEATURES);
  const [homepageAnnouncement, setHomepageAnnouncement] =
    useState<Announcement>(DEFAULT_ANNOUNCEMENT);
  const [chatAnnouncement, setChatAnnouncement] = useState<Announcement>(DEFAULT_ANNOUNCEMENT);
  const [activity, setActivity] = useState<LogEntry[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sortKey, setSortKey] = useState<"name" | "email" | "created">("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [planFilter, setPlanFilter] = useState<"all" | "free" | "premium" | "pro" | "admin">("all");

  const load = useCallback(async () => {
    setDataLoading(true);
    const { data: profiles, error } = await supabase
      .from("profiles" as never)
      .select("id, display_name, username, email, created_at")
      .order("created_at" as never, { ascending: false } as never);
    if (error) {
      toast.error(error.message);
      setDataLoading(false);
      return;
    }
    const { data: roles } = await supabase
      .from("user_roles" as never)
      .select("user_id, role, expires_at");
    const rmap = new Map<string, RoleGrant[]>();
    ((roles ?? []) as Array<{ user_id: string; role: string; expires_at: string | null }>).forEach(
      (r) => {
        if (r.expires_at && new Date(r.expires_at) <= new Date()) return;
        const list = rmap.get(r.user_id) ?? [];
        list.push({ role: r.role, expires_at: r.expires_at });
        rmap.set(r.user_id, list);
      },
    );
    setRows(
      ((profiles ?? []) as Array<Omit<Row, "roles">>).map((p) => ({
        ...p,
        roles: rmap.get(p.id) ?? [],
      })),
    );

    const { data: planRows } = await supabase
      .from("plan_settings" as never)
      .select("*")
      .order("sort_order" as never, { ascending: true } as never);
    setPlans(
      (
        (planRows ?? []) as Array<
          Omit<PlanSetting, "features" | "payment_methods"> & {
            features: unknown;
            payment_methods: unknown;
          }
        >
      ).map((p) => ({
        ...p,
        features: Array.isArray(p.features) ? (p.features as string[]) : [],
        payment_methods: Array.isArray(p.payment_methods)
          ? (p.payment_methods as PaymentMethod[])
          : [],
      })),
    );

    const { data: settings } = await supabase.from("app_settings" as never).select("key, value");
    ((settings ?? []) as Array<{ key: string; value: unknown }>).forEach((s) => {
      if (s.key === "features") setFeatures({ ...DEFAULT_FEATURES, ...(s.value as Features) });
      if (s.key === "homepage_announcement")
        setHomepageAnnouncement({ ...DEFAULT_ANNOUNCEMENT, ...(s.value as Announcement) });
      if (s.key === "chat_announcement")
        setChatAnnouncement({ ...DEFAULT_ANNOUNCEMENT, ...(s.value as Announcement) });
      if (s.key === "announcement") {
        const legacy = { ...DEFAULT_ANNOUNCEMENT, ...(s.value as Announcement) };
        setHomepageAnnouncement((prev) => (prev.message ? prev : legacy));
        setChatAnnouncement((prev) => (prev.message ? prev : legacy));
      }
    });

    const { data: log } = await supabase
      .from("activity_log" as never)
      .select("*")
      .order("created_at" as never, { ascending: false } as never)
      .limit(100 as never);
    setActivity((log ?? []) as LogEntry[]);
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (loading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;

  if (!isAdmin) {
    return (
      <AdminLoginGate
        onUnlock={async () => {
          await refresh();
        }}
      />
    );
  }

  const logActivity = async (
    action: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
  ) => {
    await supabase.from("activity_log" as never).insert({
      actor_id: userId,
      target_id: targetId ?? null,
      action,
      metadata: metadata ?? null,
    } as never);
  };

  const hasRole = (row: Row, role: string) => row.roles.some((r) => r.role === role);
  const roleGrant = (row: Row, role: string) => row.roles.find((r) => r.role === role);

  const grantPlan = async (
    row: Row,
    role: "premium" | "pro" | "admin",
    durationDays: number | null,
  ) => {
    setBusy(row.id);
    const expires_at =
      durationDays === null
        ? null
        : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("user_roles" as never)
      .delete()
      .eq("user_id" as never, row.id as never)
      .eq("role" as never, role as never);
    const { error } = await supabase
      .from("user_roles" as never)
      .insert({ user_id: row.id, role, expires_at } as never);
    if (error) toast.error(error.message);
    else {
      toast.success(
        `Granted ${role} to ${row.display_name ?? row.email}${
          expires_at ? ` (expires ${new Date(expires_at).toLocaleDateString()})` : " (permanent)"
        }`,
      );
      await logActivity("role.grant", row.id, { role, expires_at });
    }
    await load();
    setBusy(null);
  };

  const revokeRole = async (row: Row, role: string) => {
    setBusy(row.id);
    const { error } = await supabase
      .from("user_roles" as never)
      .delete()
      .eq("user_id" as never, row.id as never)
      .eq("role" as never, role as never);
    if (error) toast.error(error.message);
    else {
      toast.success(`Revoked ${role} from ${row.display_name ?? row.email}`);
      await logActivity("role.revoke", row.id, { role });
    }
    await load();
    setBusy(null);
  };

  const updatePlanField = <K extends keyof PlanSetting>(
    idx: number,
    key: K,
    value: PlanSetting[K],
  ) => {
    setPlans((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
  };

  const savePlan = async (plan: PlanSetting) => {
    setSavingKey(`plan:${plan.id}`);
    const { error } = await supabase
      .from("plan_settings" as never)
      .update({
        name: plan.name,
        price: plan.price,
        strike_price: plan.strike_price,
        note: plan.note,
        cta_label: plan.cta_label,
        features: plan.features,
        payment_methods: plan.payment_methods,
        sort_order: plan.sort_order,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id" as never, plan.id as never);
    if (error) toast.error(error.message);
    else {
      toast.success(`${plan.name} plan saved`);
      invalidatePlans();
      await logActivity("plan.update", undefined, { id: plan.id });
    }
    setSavingKey(null);
  };

  const saveSetting = async (key: string, value: unknown, label: string) => {
    setSavingKey(`setting:${key}`);
    const { error } = await supabase.from("app_settings" as never).upsert(
      { key, value, updated_at: new Date().toISOString() } as never,
      {
        onConflict: "key",
      } as never,
    );
    if (error) toast.error(error.message);
    else {
      toast.success(`${label} saved`);
      await logActivity("settings.update", undefined, { key, value });
    }
    setSavingKey(null);
  };

  const filtered = rows
    .filter((r) => {
      const s = q.toLowerCase();
      if (
        s &&
        !r.email?.toLowerCase().includes(s) &&
        !r.display_name?.toLowerCase().includes(s) &&
        !r.username?.toLowerCase().includes(s)
      )
        return false;
      if (planFilter === "all") return true;
      if (planFilter === "admin") return hasRole(r, "admin");
      if (planFilter === "pro") return hasRole(r, "pro");
      if (planFilter === "premium") return hasRole(r, "premium");
      if (planFilter === "free")
        return !hasRole(r, "admin") && !hasRole(r, "pro") && !hasRole(r, "premium");
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name")
        return (
          dir *
          (a.display_name ?? a.username ?? "").localeCompare(b.display_name ?? b.username ?? "")
        );
      if (sortKey === "email") return dir * (a.email ?? "").localeCompare(b.email ?? "");
      return dir * (new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
    });

  const totalUsers = rows.length;
  const premiumUsers = rows.filter((r) => hasRole(r, "premium") || hasRole(r, "pro")).length;
  const adminUsers = rows.filter((r) => hasRole(r, "admin")).length;
  const freeUsers =
    totalUsers -
    premiumUsers -
    rows.filter((r) => hasRole(r, "admin") && !hasRole(r, "premium") && !hasRole(r, "pro")).length;
  const newThisWeek = rows.filter((r) => {
    if (!r.created_at) return false;
    return Date.now() - new Date(r.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  const nav: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "users", label: "Users", icon: UsersIcon },
    { id: "pricing", label: "Pricing", icon: DollarSign },
    { id: "features", label: "Features", icon: ToggleLeft },
    { id: "announcement", label: "Announcements", icon: Megaphone },
    { id: "activity", label: "Activity", icon: Activity },
  ];

  const currentNav = nav.find((n) => n.id === tab)!;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card/80 backdrop-blur transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-foreground shadow-soft"
                style={{ background: "var(--gradient-brand)" }}
              >
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold tracking-tight">Admin</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  PrismXGPT
                </div>
              </div>
            </div>
            <button
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
            {nav.map((n) => {
              const active = tab === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    setTab(n.id);
                    setMobileNavOpen(false);
                  }}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-accent text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                >
                  <n.icon
                    className={`h-4 w-4 transition ${
                      active ? "text-brand" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                  <span className="flex-1 text-left">{n.label}</span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                </button>
              );
            })}
          </nav>

          <div className="border-t border-border p-4">
            <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-background/60 px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand">
                {(email ?? "A").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{email}</div>
                <div className="text-[10px] uppercase tracking-wider text-brand">Administrator</div>
              </div>
            </div>
            <Link
              to="/chat"
              className="mb-1.5 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to chat
            </Link>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                await refresh();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1">
          {/* Sticky header */}
          <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3.5 sm:px-6">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <currentNav.icon className="h-4 w-4 text-brand" />
                <h1 className="truncate text-base font-semibold sm:text-lg">{currentNav.label}</h1>
              </div>
              <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Systems operational
              </span>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
            {tab === "dashboard" && (
              <DashboardTab
                totalUsers={totalUsers}
                premiumUsers={premiumUsers}
                adminUsers={adminUsers}
                freeUsers={freeUsers}
                newThisWeek={newThisWeek}
                loading={dataLoading}
                activity={activity.slice(0, 6)}
                recentUsers={rows.slice(0, 5)}
                onGoto={setTab}
                homepageAnnouncement={homepageAnnouncement}
                chatAnnouncement={chatAnnouncement}
              />
            )}

            {tab === "users" && (
              <section className="space-y-4 animate-in fade-in-50 duration-200">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Users</h2>
                    <p className="text-sm text-muted-foreground">
                      Manage accounts, plans, and admin access.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm shadow-soft">
                      <Search className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search users…"
                        className="w-40 bg-transparent outline-none sm:w-56"
                      />
                    </div>
                    <select
                      value={planFilter}
                      onChange={(e) => setPlanFilter(e.target.value as typeof planFilter)}
                      className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm outline-none"
                    >
                      <option value="all">All plans</option>
                      <option value="free">Free</option>
                      <option value="premium">Plus</option>
                      <option value="pro">Pro</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="sticky top-0 border-b border-border bg-card/95 backdrop-blur text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <SortableHeader
                            label="User"
                            active={sortKey === "name"}
                            dir={sortDir}
                            onClick={() => {
                              if (sortKey === "name")
                                setSortDir(sortDir === "asc" ? "desc" : "asc");
                              else {
                                setSortKey("name");
                                setSortDir("asc");
                              }
                            }}
                          />
                          <SortableHeader
                            label="Email"
                            active={sortKey === "email"}
                            dir={sortDir}
                            onClick={() => {
                              if (sortKey === "email")
                                setSortDir(sortDir === "asc" ? "desc" : "asc");
                              else {
                                setSortKey("email");
                                setSortDir("asc");
                              }
                            }}
                          />
                          <th className="px-4 py-3 text-left font-medium">Plan</th>
                          <SortableHeader
                            label="Joined"
                            active={sortKey === "created"}
                            dir={sortDir}
                            onClick={() => {
                              if (sortKey === "created")
                                setSortDir(sortDir === "asc" ? "desc" : "asc");
                              else {
                                setSortKey("created");
                                setSortDir("desc");
                              }
                            }}
                          />
                          <th className="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dataLoading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td colSpan={5} className="px-4 py-4">
                                <div className="h-8 w-full animate-pulse rounded-lg bg-muted/60" />
                              </td>
                            </tr>
                          ))
                        ) : filtered.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-16 text-center">
                              <div className="mx-auto flex max-w-xs flex-col items-center gap-2 text-muted-foreground">
                                <UsersIcon className="h-8 w-8 opacity-50" />
                                <div className="text-sm font-medium text-foreground">
                                  No users found
                                </div>
                                <p className="text-xs">Try clearing filters or search terms.</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filtered.map((r) => (
                            <tr
                              key={r.id}
                              className="border-b border-border transition hover:bg-accent/40 last:border-0"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                                    {(r.display_name ?? r.email ?? "?").slice(0, 1).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">
                                      {r.display_name || r.username || "—"}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground">
                                      @{r.username ?? "user"}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {hasRole(r, "admin") && (
                                    <RoleBadge
                                      label="Admin"
                                      tone="danger"
                                      icon={Shield}
                                      expiresAt={roleGrant(r, "admin")?.expires_at ?? null}
                                      onRevoke={
                                        r.id !== userId ? () => revokeRole(r, "admin") : undefined
                                      }
                                    />
                                  )}
                                  {hasRole(r, "pro") && (
                                    <RoleBadge
                                      label="Pro"
                                      tone="gold"
                                      icon={Crown}
                                      expiresAt={roleGrant(r, "pro")?.expires_at ?? null}
                                      onRevoke={() => revokeRole(r, "pro")}
                                    />
                                  )}
                                  {hasRole(r, "premium") && (
                                    <RoleBadge
                                      label="Plus"
                                      tone="brand"
                                      icon={Crown}
                                      expiresAt={roleGrant(r, "premium")?.expires_at ?? null}
                                      onRevoke={() => revokeRole(r, "premium")}
                                    />
                                  )}
                                  {!hasRole(r, "admin") &&
                                    !hasRole(r, "pro") &&
                                    !hasRole(r, "premium") && (
                                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                        Free
                                      </span>
                                    )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex justify-end">
                                  <GrantMenu
                                    disabled={busy === r.id}
                                    canGrantAdmin={r.id !== userId}
                                    onGrant={(role, days) => grantPlan(r, role, days)}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t border-border bg-background/40 px-4 py-2.5 text-xs text-muted-foreground">
                    <span>
                      Showing <span className="text-foreground">{filtered.length}</span> of{" "}
                      <span className="text-foreground">{rows.length}</span> users
                    </span>
                  </div>
                </div>
              </section>
            )}

            {tab === "pricing" && (
              <section className="space-y-4 animate-in fade-in-50 duration-200">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Pricing</h2>
                  <p className="text-sm text-muted-foreground">
                    Edit prices, features, and payment methods shown on the upgrade modal. Changes
                    go live immediately.
                  </p>
                </div>
                {dataLoading && plans.length === 0 ? (
                  <SkeletonCard rows={4} />
                ) : (
                  plans.map((plan, idx) => (
                    <div
                      key={plan.id}
                      className="rounded-2xl border border-border bg-card p-6 shadow-soft"
                    >
                      <div className="mb-5 flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-semibold">{plan.name} plan</h3>
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            id: {plan.id}
                          </span>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Display name">
                          <input
                            value={plan.name}
                            onChange={(e) => updatePlanField(idx, "name", e.target.value)}
                            className="w-full bg-transparent text-sm outline-none"
                          />
                        </Field>
                        <Field label="Price (e.g. $0, $19, $99)">
                          <input
                            value={plan.price}
                            onChange={(e) => updatePlanField(idx, "price", e.target.value)}
                            className="w-full bg-transparent text-sm outline-none"
                          />
                        </Field>
                        <Field label="Strike-through price (optional)">
                          <input
                            value={plan.strike_price ?? ""}
                            onChange={(e) =>
                              updatePlanField(idx, "strike_price", e.target.value || null)
                            }
                            placeholder="$19"
                            className="w-full bg-transparent text-sm outline-none"
                          />
                        </Field>
                        <Field label="Note (e.g. per month)">
                          <input
                            value={plan.note ?? ""}
                            onChange={(e) => updatePlanField(idx, "note", e.target.value || null)}
                            className="w-full bg-transparent text-sm outline-none"
                          />
                        </Field>
                        <Field label="CTA button label">
                          <input
                            value={plan.cta_label ?? ""}
                            onChange={(e) =>
                              updatePlanField(idx, "cta_label", e.target.value || null)
                            }
                            className="w-full bg-transparent text-sm outline-none"
                          />
                        </Field>
                        <Field label="Sort order">
                          <input
                            type="number"
                            value={plan.sort_order}
                            onChange={(e) =>
                              updatePlanField(idx, "sort_order", parseInt(e.target.value, 10) || 0)
                            }
                            className="w-full bg-transparent text-sm outline-none"
                          />
                        </Field>
                      </div>
                      <div className="mt-4">
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                          Features (one per line)
                        </label>
                        <textarea
                          value={plan.features.join("\n")}
                          onChange={(e) =>
                            updatePlanField(
                              idx,
                              "features",
                              e.target.value
                                .split("\n")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            )
                          }
                          rows={5}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-brand"
                        />
                      </div>
                      <div className="mt-6">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Payment methods (Buy button)
                        </label>
                        <PaymentMethodsEditor
                          methods={plan.payment_methods}
                          onChange={(pm) => updatePlanField(idx, "payment_methods", pm)}
                        />
                      </div>
                      <SaveButton
                        onClick={() => savePlan(plan)}
                        busy={savingKey === `plan:${plan.id}`}
                        label={`Save ${plan.name}`}
                      />
                    </div>
                  ))
                )}
              </section>
            )}

            {tab === "features" && (
              <section className="animate-in fade-in-50 duration-200">
                <div className="mb-4">
                  <h2 className="text-xl font-semibold tracking-tight">Feature flags</h2>
                  <p className="text-sm text-muted-foreground">
                    Turn features on or off across the app in real time.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                  <div className="space-y-2.5">
                    {(
                      [
                        {
                          key: "imageGeneration",
                          label: "Image generation",
                          desc: "Enable AI image generation and editing.",
                        },
                        {
                          key: "deepResearch",
                          label: "Deep research",
                          desc: "Long-form research answers with citations.",
                        },
                        {
                          key: "webSearch",
                          label: "Web search",
                          desc: "Real-time web browsing in chat.",
                        },
                      ] as const
                    ).map((f) => (
                      <label
                        key={f.key}
                        className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-background/60 px-4 py-3 transition hover:bg-accent/40"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{f.label}</div>
                          <div className="truncate text-xs text-muted-foreground">{f.desc}</div>
                        </div>
                        <Toggle
                          checked={features[f.key]}
                          onChange={(v) => setFeatures({ ...features, [f.key]: v })}
                        />
                      </label>
                    ))}
                  </div>
                  <SaveButton
                    onClick={() => saveSetting("features", features, "Features")}
                    busy={savingKey === "setting:features"}
                    label="Save features"
                  />
                </div>
              </section>
            )}

            {tab === "announcement" && (
              <section className="space-y-4 animate-in fade-in-50 duration-200">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Announcements</h2>
                  <p className="text-sm text-muted-foreground">
                    Publish banners to visitors and signed-in users.
                  </p>
                </div>
                {(
                  [
                    {
                      key: "homepage_announcement",
                      label: "Homepage banner",
                      desc: "Shown at the top of the public landing page (/).",
                      value: homepageAnnouncement,
                      set: setHomepageAnnouncement,
                      placeholder: "e.g. 🎉 New pricing — Plus is 50% off this week!",
                    },
                    {
                      key: "chat_announcement",
                      label: "Chat area banner",
                      desc: "Shown at the top of the chat page for logged-in users.",
                      value: chatAnnouncement,
                      set: setChatAnnouncement,
                      placeholder: "e.g. Scheduled maintenance tonight 11pm–12am IST.",
                    },
                  ] as const
                ).map((a) => (
                  <div
                    key={a.key}
                    className="rounded-2xl border border-border bg-card p-6 shadow-soft"
                  >
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold">{a.label}</h3>
                        <p className="text-xs text-muted-foreground">{a.desc}</p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                          a.value.enabled
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            a.value.enabled ? "bg-emerald-500" : "bg-muted-foreground/50"
                          }`}
                        />
                        {a.value.enabled ? "Live" : "Off"}
                      </span>
                    </div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Message
                    </label>
                    <textarea
                      value={a.value.message}
                      onChange={(e) => a.set({ ...a.value, message: e.target.value })}
                      rows={3}
                      placeholder={a.placeholder}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-brand"
                    />
                    <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-4 py-3">
                      <span className="text-sm">Show this banner</span>
                      <Toggle
                        checked={a.value.enabled}
                        onChange={(v) => a.set({ ...a.value, enabled: v })}
                      />
                    </label>
                    <SaveButton
                      onClick={() => saveSetting(a.key, a.value, a.label)}
                      busy={savingKey === `setting:${a.key}`}
                      label={`Save ${a.label.toLowerCase()}`}
                    />
                  </div>
                ))}
              </section>
            )}

            {tab === "activity" && (
              <section className="animate-in fade-in-50 duration-200">
                <div className="mb-4">
                  <h2 className="text-xl font-semibold tracking-tight">Activity</h2>
                  <p className="text-sm text-muted-foreground">
                    Latest 100 events (signups, role changes, settings updates).
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-card shadow-soft">
                  {dataLoading ? (
                    <div className="p-6">
                      <SkeletonCard rows={5} />
                    </div>
                  ) : activity.length === 0 ? (
                    <EmptyState
                      icon={Activity}
                      title="No activity yet"
                      desc="Signups, role changes, and settings updates will appear here."
                    />
                  ) : (
                    <ul className="divide-y divide-border">
                      {activity.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-3 px-6 py-3.5 text-sm transition hover:bg-accent/40"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <ActionDot action={a.action} />
                            <div className="min-w-0">
                              <div className="font-medium">{prettyAction(a.action)}</div>
                              {a.metadata && (
                                <div className="truncate text-xs text-muted-foreground">
                                  {JSON.stringify(a.metadata)}
                                </div>
                              )}
                            </div>
                          </div>
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(a.created_at).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

/* ----------------------- Dashboard tab ----------------------- */

function DashboardTab({
  totalUsers,
  premiumUsers,
  adminUsers,
  freeUsers,
  newThisWeek,
  loading,
  activity,
  recentUsers,
  onGoto,
  homepageAnnouncement,
  chatAnnouncement,
}: {
  totalUsers: number;
  premiumUsers: number;
  adminUsers: number;
  freeUsers: number;
  newThisWeek: number;
  loading: boolean;
  activity: LogEntry[];
  recentUsers: Row[];
  onGoto: (t: TabId) => void;
  homepageAnnouncement: Announcement;
  chatAnnouncement: Announcement;
}) {
  const conversion = totalUsers === 0 ? 0 : Math.round((premiumUsers / totalUsers) * 100);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
        <p className="text-sm text-muted-foreground">A snapshot of activity across PrismXGPT.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total users"
          value={totalUsers}
          loading={loading}
          icon={UsersIcon}
          accent="brand"
        />
        <MetricCard
          label="Paid users"
          value={premiumUsers}
          loading={loading}
          icon={Crown}
          accent="gold"
          hint={`${conversion}% conversion`}
        />
        <MetricCard
          label="Admins"
          value={adminUsers}
          loading={loading}
          icon={Shield}
          accent="danger"
        />
        <MetricCard
          label="New this week"
          value={newThisWeek}
          loading={loading}
          icon={Sparkles}
          accent="emerald"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent activity */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div>
              <div className="text-sm font-semibold">Recent activity</div>
              <div className="text-xs text-muted-foreground">Latest events across the platform</div>
            </div>
            <button
              onClick={() => onGoto("activity")}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          {loading ? (
            <div className="p-5">
              <SkeletonCard rows={4} />
            </div>
          ) : activity.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Nothing yet"
              desc="Activity will appear here as users sign up."
            />
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ActionDot action={a.action} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{prettyAction(a.action)}</div>
                    </div>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* System health + quick actions */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-3 text-sm font-semibold">System health</div>
            <ul className="space-y-2">
              <HealthRow label="API" ok />
              <HealthRow label="Database" ok />
              <HealthRow label="Auth" ok />
              <HealthRow label="Storage" ok />
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-3 text-sm font-semibold">Quick actions</div>
            <div className="space-y-1.5">
              <QuickAction label="Manage users" icon={UsersIcon} onClick={() => onGoto("users")} />
              <QuickAction
                label="Edit pricing"
                icon={DollarSign}
                onClick={() => onGoto("pricing")}
              />
              <QuickAction
                label="Feature flags"
                icon={ToggleLeft}
                onClick={() => onGoto("features")}
              />
              <QuickAction
                label="Announcements"
                icon={Megaphone}
                onClick={() => onGoto("announcement")}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Subscription overview */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-4 text-sm font-semibold">Subscription mix</div>
          <PlanBar label="Free" value={freeUsers} total={totalUsers} tone="muted" />
          <PlanBar label="Plus / Pro" value={premiumUsers} total={totalUsers} tone="brand" />
          <PlanBar label="Admins" value={adminUsers} total={totalUsers} tone="danger" />
        </div>

        {/* Recent users */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="text-sm font-semibold">Recent users</div>
            <button
              onClick={() => onGoto("users")}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              Manage <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          {loading ? (
            <div className="p-5">
              <SkeletonCard rows={4} />
            </div>
          ) : recentUsers.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No users yet" desc="Signups will appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {recentUsers.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                    {(r.display_name ?? r.email ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {r.display_name || r.username || "—"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Live announcements */}
      <div className="grid gap-4 sm:grid-cols-2">
        <AnnouncementPreview
          title="Homepage banner"
          a={homepageAnnouncement}
          onGoto={() => onGoto("announcement")}
        />
        <AnnouncementPreview
          title="Chat banner"
          a={chatAnnouncement}
          onGoto={() => onGoto("announcement")}
        />
      </div>
    </div>
  );
}

/* ----------------------- Small UI primitives ----------------------- */

function MetricCard({
  label,
  value,
  icon: Icon,
  accent,
  loading,
  hint,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: "brand" | "gold" | "danger" | "emerald";
  loading?: boolean;
  hint?: string;
}) {
  const accentCls =
    accent === "brand"
      ? "text-brand bg-brand/15"
      : accent === "gold"
        ? "text-yellow-500 bg-yellow-500/15"
        : accent === "danger"
          ? "text-red-400 bg-red-500/15"
          : "text-emerald-500 bg-emerald-500/15";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft transition hover:shadow-elevated">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${accentCls}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">
        {loading ? (
          <span className="inline-block h-7 w-14 animate-pulse rounded bg-muted/60" />
        ) : (
          value
        )}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function HealthRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? "text-emerald-500" : "text-red-400"}`}
      >
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
        {ok ? "Operational" : "Down"}
      </span>
    </li>
  );
}

function QuickAction({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-sm text-foreground/90 transition hover:border-border hover:bg-accent/60"
    >
      <Icon className="h-4 w-4 text-muted-foreground group-hover:text-brand" />
      <span className="flex-1 text-left">{label}</span>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}

function PlanBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "muted" | "brand" | "danger";
}) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  const bar =
    tone === "brand" ? "bg-brand" : tone === "danger" ? "bg-red-400" : "bg-muted-foreground/60";
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {value} <span className="text-muted-foreground">· {pct}%</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AnnouncementPreview({
  title,
  a,
  onGoto,
}: {
  title: string;
  a: Announcement;
  onGoto: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            a.enabled ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${a.enabled ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
          />
          {a.enabled ? "Live" : "Off"}
        </span>
      </div>
      <div className="line-clamp-2 min-h-[2.5rem] rounded-lg border border-dashed border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
        {a.message || "No message set."}
      </div>
      <button
        onClick={onGoto}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
      >
        Edit <ArrowUpRight className="h-3 w-3" />
      </button>
    </div>
  );
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-3 text-left font-medium">
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </th>
  );
}

function EmptyState({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <Icon className="h-8 w-8 text-muted-foreground opacity-50" />
      <div className="text-sm font-medium">{title}</div>
      {desc && <p className="max-w-xs text-xs text-muted-foreground">{desc}</p>}
    </div>
  );
}

function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-4 w-full animate-pulse rounded bg-muted/60"
          style={{ width: `${80 - i * 8}%` }}
        />
      ))}
    </div>
  );
}

function ActionDot({ action }: { action: string }) {
  const tone = action.startsWith("role")
    ? "bg-brand"
    : action.startsWith("settings")
      ? "bg-yellow-500"
      : action.startsWith("plan")
        ? "bg-emerald-500"
        : "bg-muted-foreground";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} />;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
        checked ? "bg-brand" : "bg-muted"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-soft transition ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function SaveButton({
  onClick,
  busy,
  label,
}: {
  onClick: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground transition disabled:cursor-not-allowed disabled:opacity-60"
      style={{ background: "var(--gradient-brand)" }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {busy ? "Saving…" : label}
    </button>
  );
}

/* ----------------------- Preserved helpers ----------------------- */

function prettyAction(action: string) {
  switch (action) {
    case "user.signup":
      return "New signup";
    case "role.grant":
      return "Role granted";
    case "role.revoke":
      return "Role revoked";
    case "settings.update":
      return "Settings updated";
    case "plan.update":
      return "Plan updated";
    default:
      return action;
  }
}

type PlanRole = "premium" | "pro" | "admin";

function RoleBadge({
  label,
  tone,
  icon: Icon,
  expiresAt,
  onRevoke,
}: {
  label: string;
  tone: "brand" | "danger" | "gold";
  icon: React.ComponentType<{ className?: string }>;
  expiresAt: string | null;
  onRevoke?: () => void;
}) {
  const toneClass =
    tone === "brand"
      ? "bg-brand/20 text-brand"
      : tone === "danger"
        ? "bg-red-500/15 text-red-400"
        : "bg-yellow-500/15 text-yellow-500";
  const expiresLabel = expiresAt
    ? `Expires ${new Date(expiresAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : "Permanent";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass}`}
      title={expiresLabel}
    >
      <Icon className="h-3 w-3" /> {label}
      {expiresAt && (
        <span className="ml-0.5 inline-flex items-center gap-0.5 opacity-80">
          <Clock className="h-2.5 w-2.5" />
          {new Date(expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      )}
      {onRevoke && (
        <button
          onClick={onRevoke}
          className="ml-0.5 rounded-full opacity-70 transition hover:opacity-100"
          aria-label={`Revoke ${label}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

function GrantMenu({
  disabled,
  canGrantAdmin,
  onGrant,
}: {
  disabled?: boolean;
  canGrantAdmin: boolean;
  onGrant: (role: PlanRole, durationDays: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<PlanRole>("premium");
  const [duration, setDuration] = useState<string>("30");

  const submit = () => {
    const days = duration === "permanent" ? null : parseInt(duration, 10);
    onGrant(role, days);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent disabled:opacity-50"
      >
        {disabled ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Grant plan
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-64 rounded-xl border border-border bg-card p-3 shadow-elevated animate-in fade-in-50 zoom-in-95 duration-150">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Plan
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as PlanRole)}
              className="mb-3 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none"
            >
              <option value="premium">Plus</option>
              <option value="pro">Pro</option>
              {canGrantAdmin && <option value="admin">Admin</option>}
            </select>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="mb-3 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
              <option value="permanent">Permanent</option>
            </select>
            <button
              onClick={submit}
              className="w-full rounded-lg py-1.5 text-xs font-semibold text-brand-foreground transition hover:opacity-90"
              style={{ background: "var(--gradient-brand)" }}
            >
              Grant
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 transition focus-within:border-brand">
        {children}
      </div>
    </div>
  );
}

function PaymentMethodsEditor({
  methods,
  onChange,
}: {
  methods: PaymentMethod[];
  onChange: (m: PaymentMethod[]) => void;
}) {
  const add = () => {
    onChange([
      ...methods,
      { id: crypto.randomUUID(), label: "New method", type: "url", value: "", instructions: "" },
    ]);
  };
  const update = (idx: number, patch: Partial<PaymentMethod>) => {
    onChange(methods.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };
  const remove = (idx: number) => onChange(methods.filter((_, i) => i !== idx));
  return (
    <div className="space-y-3">
      {methods.map((m, idx) => (
        <div key={m.id} className="rounded-xl border border-border bg-background/50 p-3">
          <div className="mb-2 grid gap-2 md:grid-cols-3">
            <input
              value={m.label}
              onChange={(e) => update(idx, { label: e.target.value })}
              placeholder="Label (e.g. UPI, PayPal)"
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none transition focus:border-brand"
            />
            <select
              value={m.type}
              onChange={(e) => update(idx, { type: e.target.value as PaymentMethod["type"] })}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none"
            >
              <option value="url">Checkout URL</option>
              <option value="qr">QR code (image URL)</option>
              <option value="upi">UPI ID</option>
              <option value="crypto">Crypto address (BTC / LTC / USDT…)</option>
              <option value="text">Bank details / Instructions</option>
            </select>
            <button
              onClick={() => remove(idx)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10"
            >
              Remove
            </button>
          </div>
          <input
            value={m.value}
            onChange={(e) => update(idx, { value: e.target.value })}
            placeholder={
              m.type === "url"
                ? "https://buy.stripe.com/..."
                : m.type === "qr"
                  ? "https://.../qr.png"
                  : m.type === "upi"
                    ? "yourname@bank"
                    : m.type === "crypto"
                      ? "bc1q… or LTC / USDT address"
                      : "bank details / instructions"
            }
            className="mb-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none transition focus:border-brand"
          />
          <input
            value={m.instructions ?? ""}
            onChange={(e) => update(idx, { instructions: e.target.value })}
            placeholder="Extra instructions shown to buyer (optional)"
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none transition focus:border-brand"
          />
        </div>
      ))}
      <button
        onClick={add}
        className="w-full rounded-lg border border-dashed border-border bg-background/40 py-2 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
      >
        + Add payment method
      </button>
    </div>
  );
}
