import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — PrismXGPT" }] }),
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

function AdminPage() {
  const { loading, isAdmin, userId, email, refresh } = useProfile();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"users" | "pricing" | "features" | "announcement" | "activity">("users");
  const [plans, setPlans] = useState<PlanSetting[]>([]);
  const [features, setFeatures] = useState<Features>(DEFAULT_FEATURES);
  const [homepageAnnouncement, setHomepageAnnouncement] = useState<Announcement>(DEFAULT_ANNOUNCEMENT);
  const [chatAnnouncement, setChatAnnouncement] = useState<Announcement>(DEFAULT_ANNOUNCEMENT);
  const [activity, setActivity] = useState<LogEntry[]>([]);

  const load = useCallback(async () => {
    const { data: profiles, error } = await supabase
      .from("profiles" as never)
      .select("id, display_name, username, email, created_at")
      .order("created_at" as never, { ascending: false } as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data: roles } = await supabase
      .from("user_roles" as never)
      .select("user_id, role, expires_at");
    const rmap = new Map<string, RoleGrant[]>();
    ((roles ?? []) as Array<{ user_id: string; role: string; expires_at: string | null }>).forEach((r) => {
      // Skip expired grants
      if (r.expires_at && new Date(r.expires_at) <= new Date()) return;
      const list = rmap.get(r.user_id) ?? [];
      list.push({ role: r.role, expires_at: r.expires_at });
      rmap.set(r.user_id, list);
    });
    setRows(
      ((profiles ?? []) as Array<Omit<Row, "roles">>).map((p) => ({
        ...p,
        roles: rmap.get(p.id) ?? [],
      })),
    );

    // Plan settings
    const { data: planRows } = await supabase
      .from("plan_settings" as never)
      .select("*")
      .order("sort_order" as never, { ascending: true } as never);
    setPlans(
      ((planRows ?? []) as Array<Omit<PlanSetting, "features" | "payment_methods"> & { features: unknown; payment_methods: unknown }>).map((p) => ({
        ...p,
        features: Array.isArray(p.features) ? (p.features as string[]) : [],
        payment_methods: Array.isArray(p.payment_methods) ? (p.payment_methods as PaymentMethod[]) : [],
      })),
    );

    // Settings
    const { data: settings } = await supabase
      .from("app_settings" as never)
      .select("key, value");
    ((settings ?? []) as Array<{ key: string; value: unknown }>).forEach((s) => {
      if (s.key === "features") setFeatures({ ...DEFAULT_FEATURES, ...(s.value as Features) });
      if (s.key === "homepage_announcement")
        setHomepageAnnouncement({ ...DEFAULT_ANNOUNCEMENT, ...(s.value as Announcement) });
      if (s.key === "chat_announcement")
        setChatAnnouncement({ ...DEFAULT_ANNOUNCEMENT, ...(s.value as Announcement) });
      // Legacy fallback: migrate old single announcement to both slots
      if (s.key === "announcement") {
        const legacy = { ...DEFAULT_ANNOUNCEMENT, ...(s.value as Announcement) };
        setHomepageAnnouncement((prev) => (prev.message ? prev : legacy));
        setChatAnnouncement((prev) => (prev.message ? prev : legacy));
      }
    });

    // Activity
    const { data: log } = await supabase
      .from("activity_log" as never)
      .select("*")
      .order("created_at" as never, { ascending: false } as never)
      .limit(100 as never);
    setActivity((log ?? []) as LogEntry[]);
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

  const logActivity = async (action: string, targetId?: string, metadata?: Record<string, unknown>) => {
    await supabase
      .from("activity_log" as never)
      .insert({ actor_id: userId, target_id: targetId ?? null, action, metadata: metadata ?? null } as never);
  };

  const hasRole = (row: Row, role: string) => row.roles.some((r) => r.role === role);
  const roleGrant = (row: Row, role: string) => row.roles.find((r) => r.role === role);

  const grantPlan = async (row: Row, role: "premium" | "pro" | "admin", durationDays: number | null) => {
    setBusy(row.id);
    const expires_at =
      durationDays === null
        ? null
        : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    // Remove existing row for this role first so re-granting resets expiry cleanly
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

  const updatePlanField = <K extends keyof PlanSetting>(idx: number, key: K, value: PlanSetting[K]) => {
    setPlans((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
  };

  const savePlan = async (plan: PlanSetting) => {
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
  };

  const saveSetting = async (key: string, value: unknown, label: string) => {
    const { error } = await supabase
      .from("app_settings" as never)
      .upsert({ key, value, updated_at: new Date().toISOString() } as never, {
        onConflict: "key",
      } as never);
    if (error) toast.error(error.message);
    else {
      toast.success(`${label} saved`);
      await logActivity("settings.update", undefined, { key, value });
    }
  };

  const filtered = rows.filter((r) => {
    const s = q.toLowerCase();
    return (
      !s ||
      r.email?.toLowerCase().includes(s) ||
      r.display_name?.toLowerCase().includes(s) ||
      r.username?.toLowerCase().includes(s)
    );
  });

  const totalUsers = rows.length;
  const premiumUsers = rows.filter((r) => hasRole(r, "premium") || hasRole(r, "pro")).length;
  const adminUsers = rows.filter((r) => hasRole(r, "admin")).length;

  const tabs = [
    { id: "users", label: "Users", icon: Shield },
    { id: "pricing", label: "Pricing", icon: DollarSign },
    { id: "features", label: "Features", icon: ToggleLeft },
    { id: "announcement", label: "Announce", icon: Megaphone },
    { id: "activity", label: "Activity", icon: Activity },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          to="/chat"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to chat
        </Link>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Admin panel</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              Signed in as <span className="text-foreground">{email}</span>
            </p>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              await refresh();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard label="Total users" value={totalUsers} />
          <StatCard label="Premium" value={premiumUsers} tone="brand" />
          <StatCard label="Admins" value={adminUsers} tone="danger" />
        </div>

        <div className="mb-6 -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 sm:mx-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-medium transition sm:gap-2 sm:px-3 sm:text-sm ${
                tab === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "users" && (
          <>
            <div className="mb-4 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search users"
                className="flex-1 bg-transparent outline-none"
              />
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-border bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Plan</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.display_name || r.username || "—"}</div>
                        <div className="text-xs text-muted-foreground">@{r.username ?? "user"}</div>
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
                              onRevoke={r.id !== userId ? () => revokeRole(r, "admin") : undefined}
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
                          {!hasRole(r, "admin") && !hasRole(r, "pro") && !hasRole(r, "premium") && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              Free
                            </span>
                          )}
                        </div>
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
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "pricing" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-1 text-lg font-semibold">Plan pricing & content</h2>
              <p className="text-xs text-muted-foreground">
                Edit prices, labels, and features shown on the upgrade modal. Changes go live immediately.
              </p>
            </div>
            {plans.map((plan, idx) => (
              <div key={plan.id} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-base font-semibold">{plan.name} plan</h3>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    id: {plan.id}
                  </span>
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
                      onChange={(e) => updatePlanField(idx, "strike_price", e.target.value || null)}
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
                      onChange={(e) => updatePlanField(idx, "cta_label", e.target.value || null)}
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
                        e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                      )
                    }
                    rows={5}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
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
                <button
                  onClick={() => savePlan(plan)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  <Save className="h-4 w-4" /> Save {plan.name}
                </button>
              </div>
            ))}
          </div>
        )}


        {tab === "features" && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-1 text-lg font-semibold">Feature flags</h2>
            <p className="mb-6 text-xs text-muted-foreground">
              Turn features on or off across the app in real time.
            </p>
            <div className="space-y-3">
              {(
                [
                  { key: "imageGeneration", label: "Image generation" },
                  { key: "deepResearch", label: "Deep research" },
                  { key: "webSearch", label: "Web search" },
                ] as const
              ).map((f) => (
                <label
                  key={f.key}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-background px-4 py-3"
                >
                  <span className="text-sm">{f.label}</span>
                  <input
                    type="checkbox"
                    checked={features[f.key]}
                    onChange={(e) => setFeatures({ ...features, [f.key]: e.target.checked })}
                    className="h-5 w-5 accent-brand"
                  />
                </label>
              ))}
            </div>
            <button
              onClick={() => saveSetting("features", features, "Features")}
              className="mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground"
              style={{ background: "var(--gradient-brand)" }}
            >
              <Save className="h-4 w-4" /> Save features
            </button>
          </div>
        )}

        {tab === "announcement" && (
          <div className="space-y-4">
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
              <div key={a.key} className="rounded-2xl border border-border bg-card p-6">
                <h2 className="mb-1 text-lg font-semibold">{a.label}</h2>
                <p className="mb-4 text-xs text-muted-foreground">{a.desc}</p>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Message
                </label>
                <textarea
                  value={a.value.message}
                  onChange={(e) => a.set({ ...a.value, message: e.target.value })}
                  rows={3}
                  placeholder={a.placeholder}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={a.value.enabled}
                    onChange={(e) => a.set({ ...a.value, enabled: e.target.checked })}
                    className="h-4 w-4 accent-brand"
                  />
                  Show this banner
                </label>
                <button
                  onClick={() => saveSetting(a.key, a.value, a.label)}
                  className="mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  <Save className="h-4 w-4" /> Save {a.label.toLowerCase()}
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "activity" && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-1 text-lg font-semibold">Recent activity</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Latest 100 events (signups, role changes, settings updates).
            </p>
            <ul className="divide-y divide-border">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{prettyAction(a.action)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.metadata ? JSON.stringify(a.metadata) : ""}
                    </div>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
              {activity.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">No activity yet.</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "brand" | "danger" }) {
  const color = tone === "brand" ? "text-brand" : tone === "danger" ? "text-red-400" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

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
        : "bg-yellow-500/15 text-yellow-400";
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
          className="ml-0.5 rounded-full opacity-70 hover:opacity-100"
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
      >
        <Plus className="h-3 w-3" /> Grant plan
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-64 rounded-xl border border-border bg-card p-3 shadow-elevated">
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
              className="w-full rounded-lg py-1.5 text-xs font-semibold text-brand-foreground"
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
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
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
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none"
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
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
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
            className="mb-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none"
          />
          <input
            value={m.instructions ?? ""}
            onChange={(e) => update(idx, { instructions: e.target.value })}
            placeholder="Extra instructions shown to buyer (optional)"
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none"
          />
        </div>
      ))}
      <button
        onClick={add}
        className="w-full rounded-lg border border-dashed border-border bg-background/40 py-2 text-xs font-medium text-muted-foreground hover:bg-accent"
      >
        + Add payment method
      </button>
    </div>
  );
}
