import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Key,
  BarChart3,
  Play,
  Boxes,
  Code2,
  BookOpen,
  Gauge,
  ListChecks,
  CreditCard,
  Rocket,
  Copy,
  Plus,
  Trash2,
  Power,
  RefreshCw,
  ArrowLeft,
  Eye,
  EyeOff,
  Server,
  Webhook,
  Settings as SettingsIcon,
  LineChart,
  Search,
  Lock,
  Sparkles,
  Zap,
  Image as ImageIcon,
} from "lucide-react";
import {
  listApiKeys,
  createApiKey,
  renameApiKey,
  setApiKeyStatus,
  deleteApiKey,
  usageSeries,
  listUsage,
  rotateApiKey,
  updateKeyMeta,
  listIpHistory,
} from "@/lib/api-keys.functions";
import { listProviders, listModels } from "@/lib/developer-catalog.functions";
import {
  listWebhooks,
  createWebhook,
  rotateWebhookSecret,
  setWebhookStatus,
  deleteWebhook,
  listDeliveries,
  testDeliverWebhook,
} from "@/lib/webhooks.functions";
import { dashboardOverview, type DashboardOverview } from "@/lib/dashboard.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/developer")({
  head: () => ({
    meta: [
      { title: "Developer Platform — PrismXGPT" },
      {
        name: "description",
        content:
          "API keys, playground, model catalog, webhooks, SDKs, and usage analytics for the PrismXGPT API.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DeveloperPortal,
});

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  status: "active" | "disabled" | "revoked";
  scopes: string[];
  last_used_at: string | null;
  last_used_ip: string | null;
  expires_at: string | null;
  created_at: string;
  environment?: string;
  tags?: string[];
  notes?: string | null;
};

type UsageRow = {
  id: number;
  api_key_id: string | null;
  endpoint: string;
  model: string | null;
  status_code: number;
  input_tokens: number;
  output_tokens: number;
  images: number;
  latency_ms: number;
  error: string | null;
  created_at: string;
};

type ModelRow = {
  id: string;
  provider_id: string;
  name: string;
  family: string | null;
  context_window: number;
  capabilities: Record<string, boolean>;
  pricing: Record<string, number>;
  status: string;
  enabled: boolean;
  hidden: boolean;
  allowed: boolean;
  priority: number;
};

type ProviderRow = {
  id: string;
  name: string;
  website: string | null;
  status: string;
  sort_order: number;
};

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "keys", label: "API Keys", icon: Key },
  { id: "playground", label: "Playground", icon: Play },
  { id: "models", label: "Models", icon: Boxes },
  { id: "providers", label: "Providers", icon: Server },
  { id: "usage", label: "Usage", icon: Gauge },
  { id: "analytics", label: "Analytics", icon: LineChart },
  { id: "logs", label: "Logs", icon: ListChecks },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "sdks", label: "SDKs", icon: Code2 },
  { id: "examples", label: "Examples", icon: BookOpen },
  { id: "limits", label: "Rate Limits", icon: ListChecks },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "quickstart", label: "Quick Start", icon: Rocket },
  { id: "settings", label: "Settings", icon: SettingsIcon },
] as const;
type TabId = (typeof TABS)[number]["id"];

function DeveloperPortal() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return "dashboard";
    const h = window.location.hash.replace("#", "") as TabId;
    return TABS.some((t) => t.id === h) ? h : "dashboard";
  });

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      if (!data.user) navigate({ to: "/login" });
      else setAuthed(true);
    });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (typeof window !== "undefined") window.location.hash = tab;
  }, [tab]);

  if (!authed) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            to="/chat"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to chat
          </Link>
          <span className="text-sm font-semibold tracking-tight">Developer Platform</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Base URL <code className="rounded bg-muted px-1.5 py-0.5">/api/v1</code>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 md:px-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-20 flex flex-col gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  tab === t.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="md:hidden mb-2 overflow-x-auto">
          <div className="flex gap-1 pb-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                  tab === t.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <main className="min-w-0 flex-1">
          {tab === "dashboard" && <Dashboard />}
          {tab === "keys" && <KeysPanel />}
          {tab === "playground" && <Playground />}
          {tab === "models" && <ModelsPanel />}
          {tab === "providers" && <ProvidersPanel />}
          {tab === "usage" && <UsagePanel />}
          {tab === "analytics" && <AnalyticsPanel />}
          {tab === "logs" && <LogsPanel />}
          {tab === "webhooks" && <WebhooksPanel />}
          {tab === "sdks" && <SDKsPanel />}
          {tab === "examples" && <ExamplesPanel />}
          {tab === "limits" && <RateLimitsPanel />}
          {tab === "billing" && <BillingPanel />}
          {tab === "quickstart" && <QuickStartPanel />}
          {tab === "settings" && <SettingsPanel />}
        </main>
      </div>
    </div>
  );
}

/* ---------------- Shared UI helpers ---------------- */
function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "brand" | "danger" | "success";
}) {
  const toneCls =
    tone === "brand"
      ? "border-primary/40 bg-primary/5"
      : tone === "danger"
        ? "border-destructive/40 bg-destructive/5"
        : tone === "success"
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-border bg-card";
  return (
    <div className={`rounded-xl border ${toneCls} p-4`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "active" || status === "stable"
      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
      : status === "disabled" || status === "maintenance"
        ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
        : status === "preview" || status === "beta"
          ? "bg-sky-500/15 text-sky-500 border-sky-500/30"
          : "bg-destructive/10 text-destructive border-destructive/30";
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase ${cls}`}>
      {status}
    </span>
  );
}

function fmt(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function copy(text: string) {
  navigator.clipboard.writeText(text);
  toast.success("Copied");
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <span>{lang || "code"}</span>
        <button
          onClick={() => copy(code)}
          className="rounded-md border border-border px-2 py-0.5 hover:bg-accent"
        >
          <Copy className="mr-1 inline h-3 w-3" /> Copy
        </button>
      </div>
      <pre className="overflow-auto p-4 text-xs leading-relaxed font-mono">{code}</pre>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${100 - (v / max) * 100}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className="text-primary"
      />
    </svg>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard() {
  const fn = useServerFn(dashboardOverview);
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fn()
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [fn]);

  if (loading) return <SkeletonBlock rows={4} />;
  if (!data)
    return <EmptyState title="Dashboard unavailable" hint="Try refreshing the page." />;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live metrics across your PrismXGPT API keys
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Requests Today" value={data.requestsToday.toLocaleString()} />
        <StatCard label="Requests (30d)" value={data.requestsMonth.toLocaleString()} />
        <StatCard label="Tokens (30d)" value={data.tokensMonth.toLocaleString()} />
        <StatCard label="Images (30d)" value={data.imagesMonth.toLocaleString()} />
        <StatCard label="Active Keys" value={data.activeKeys} tone="brand" />
        <StatCard label="Avg Latency" value={`${data.avgLatency} ms`} />
        <StatCard label="Success Rate" value={`${data.successRate}%`} tone="success" />
        <StatCard
          label="Error Rate"
          value={`${data.errorRate}%`}
          tone={data.errorRate > 5 ? "danger" : "default"}
        />
        <StatCard label="Estimated Cost" value={`$${data.estimatedCostUsd.toFixed(2)}`} hint="30d" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Requests · last 7 days</div>
            <div className="text-xs text-muted-foreground">
              {data.series7d.reduce((a, b) => a + b.requests, 0)} total
            </div>
          </div>
          <div className="flex h-40 items-end gap-2">
            {data.series7d.map((s) => {
              const max = Math.max(1, ...data.series7d.map((x) => x.requests));
              return (
                <div key={s.day} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/70"
                    style={{ height: `${(s.requests / max) * 100}%`, minHeight: 2 }}
                    title={`${s.requests} requests`}
                  />
                  <div className="text-[10px] text-muted-foreground">{s.day.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-medium">Top models</div>
          {data.topModels.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No usage yet</div>
          ) : (
            <ul className="space-y-2">
              {data.topModels.map((m) => (
                <li key={m.model} className="flex items-center justify-between text-sm">
                  <span className="truncate font-mono text-xs">{m.model}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.requests} req · {m.tokens.toLocaleString()} tok
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-medium">Top endpoints</div>
          {data.topEndpoints.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No usage yet</div>
          ) : (
            <ul className="space-y-2">
              {data.topEndpoints.map((e) => (
                <li key={e.endpoint} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{e.endpoint}</span>
                  <span className="text-xs text-muted-foreground">{e.requests}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-medium">Recent activity</div>
          {data.recentActivity.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No activity yet</div>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-auto">
              {data.recentActivity.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between border-b border-border/40 py-1 text-xs last:border-0"
                >
                  <span className="font-mono">{r.endpoint}</span>
                  <span
                    className={`ml-2 ${r.status_code >= 400 ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {r.status_code} · {r.latency_ms}ms
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
function SkeletonBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-muted/30" />
      ))}
    </div>
  );
}

/* ---------------- API Keys ---------------- */
function KeysPanel() {
  const list = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const rename = useServerFn(renameApiKey);
  const setStatus = useServerFn(setApiKeyStatus);
  const remove = useServerFn(deleteApiKey);
  const rotate = useServerFn(rotateApiKey);
  const updateMeta = useServerFn(updateKeyMeta);
  const ipHist = useServerFn(listIpHistory);

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<{ name: string; plaintext: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [env, setEnv] = useState("production");
  const [expiry, setExpiry] = useState("");
  const [reveal, setReveal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ipRows, setIpRows] = useState<
    Record<string, Array<{ ip: string; last_seen: string; request_count: number }>>
  >({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await list();
      setKeys(r.keys as ApiKeyRow[]);
    } finally {
      setLoading(false);
    }
  }, [list]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const r = await create({
        data: {
          name: name.trim(),
          expiresAt: expiry ? new Date(expiry).toISOString() : null,
        },
      });
      const created = r.key as { id: string; name: string };
      setNewKey({ name: created.name, plaintext: r.plaintext });
      // Persist environment via meta update
      if (env !== "production") {
        try {
          await updateMeta({ data: { id: created.id, environment: env } });
        } catch {
          /* ignore */
        }
      }
      setName("");
      setExpiry("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const openHistory = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!ipRows[id]) {
      try {
        const r = await ipHist({ data: { id } });
        setIpRows((prev) => ({ ...prev, [id]: r.rows as typeof prev[string] }));
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage credentials with rotation, scopes, and expiry
          </p>
        </div>
        <button
          onClick={refresh}
          className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
        >
          <RefreshCw className="mr-1 inline h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-medium">Create a new key</div>
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Production backend"
            maxLength={60}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <select
            value={env}
            onChange={(e) => setEnv(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            title="Optional expiry"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
      </div>

      {newKey && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="text-sm font-semibold">Your new key — copy it now</div>
          <div className="mt-1 text-xs text-muted-foreground">
            This is the only time we will show the full key. Store it in a secret manager.
          </div>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
              {reveal
                ? newKey.plaintext
                : newKey.plaintext.slice(0, 13) + "…" + newKey.plaintext.slice(-4)}
            </code>
            <button
              onClick={() => setReveal((r) => !r)}
              className="rounded-md border border-border px-2 py-2 text-xs hover:bg-accent"
              title={reveal ? "Hide" : "Reveal"}
            >
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              onClick={() => copy(newKey.plaintext)}
              className="rounded-md border border-border px-2 py-2 text-xs hover:bg-accent"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              onClick={() => setNewKey(null)}
              className="rounded-md border border-border px-3 py-2 text-xs hover:bg-accent"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Key</th>
              <th className="px-4 py-2 text-left">Env</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Last used</th>
              <th className="px-4 py-2 text-left">Expires</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No API keys yet. Create one above.
                </td>
              </tr>
            ) : (
              keys.map((k) => (
                <>
                  <tr key={k.id} className="border-b border-border/60 last:border-b-0">
                    <td className="px-4 py-3">
                      <button
                        onClick={async () => {
                          const newName = prompt("Rename key", k.name);
                          if (!newName || newName === k.name) return;
                          try {
                            await rename({ data: { id: k.id, name: newName } });
                            await refresh();
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                        className="text-left font-medium hover:underline"
                      >
                        {k.name}
                      </button>
                      {k.notes && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
                          {k.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => copy(`${k.prefix}…${k.last4}`)}
                        className="font-mono text-xs hover:underline"
                        title="Copy prefix"
                      >
                        {k.prefix}…{k.last4}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="rounded border border-border bg-muted px-1.5 py-0.5">
                        {k.environment ?? "production"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={k.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {fmt(k.last_used_at)}
                      {k.last_used_ip && (
                        <div className="text-[10px] font-mono">{k.last_used_ip}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(k.expires_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          title="IP history"
                          onClick={() => openHistory(k.id)}
                          className="rounded-md border border-border p-1.5 hover:bg-accent"
                        >
                          <Search className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Rotate key (issue new, revoke this)"
                          onClick={async () => {
                            if (!confirm("Rotate this key? The old key will be revoked.")) return;
                            try {
                              const r = await rotate({ data: { id: k.id } });
                              setNewKey({
                                name: (r.key as { name: string }).name,
                                plaintext: r.plaintext,
                              });
                              await refresh();
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                          className="rounded-md border border-border p-1.5 hover:bg-accent"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title={k.status === "active" ? "Disable" : "Enable"}
                          onClick={async () => {
                            const next = k.status === "active" ? "disabled" : "active";
                            try {
                              await setStatus({ data: { id: k.id, status: next } });
                              await refresh();
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                          className="rounded-md border border-border p-1.5 hover:bg-accent"
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Delete"
                          onClick={async () => {
                            if (!confirm(`Delete key "${k.name}"?`)) return;
                            try {
                              await remove({ data: { id: k.id } });
                              await refresh();
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                          className="rounded-md border border-border p-1.5 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === k.id && (
                    <tr>
                      <td colSpan={7} className="bg-muted/20 px-4 py-3">
                        <div className="text-xs font-medium">IP history</div>
                        {ipRows[k.id]?.length ? (
                          <table className="mt-2 w-full text-xs">
                            <thead className="text-[10px] uppercase text-muted-foreground">
                              <tr>
                                <th className="text-left">IP</th>
                                <th className="text-left">Last seen</th>
                                <th className="text-right">Requests</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ipRows[k.id].map((r) => (
                                <tr key={r.ip}>
                                  <td className="font-mono">{r.ip}</td>
                                  <td>{fmt(r.last_seen)}</td>
                                  <td className="text-right">{r.request_count}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="py-3 text-xs text-muted-foreground">
                            No IP data yet for this key.
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Playground ---------------- */
function Playground() {
  const fnModels = useServerFn(listModels);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [mode, setMode] = useState<"chat" | "image">("chat");
  const [model, setModel] = useState<string>("google/gemini-2.5-flash");
  const [system, setSystem] = useState("");
  const [prompt, setPrompt] = useState("Write a haiku about prisms.");
  const [stream, setStream] = useState(true);
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(1);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [jsonMode, setJsonMode] = useState(false);
  const [visionUrl, setVisionUrl] = useState("");
  const [output, setOutput] = useState("");
  const [raw, setRaw] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [usage, setUsage] = useState<{ input: number; output: number } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fnModels({ data: {} }).then((r) => {
      const list = (r.models as ModelRow[]).filter((m) => m.enabled && !m.hidden);
      setModels(list);
      if (!list.find((m) => m.id === model) && list[0]) setModel(list[0].id);
    });
  }, [fnModels]); // eslint-disable-line react-hooks/exhaustive-deps

  const chatModels = models.filter((m) => m.capabilities?.chat);
  const imageModels = models.filter(
    (m) => m.capabilities?.image_generation || m.capabilities?.image_edit,
  );
  const activeList = mode === "chat" ? chatModels : imageModels;

  useEffect(() => {
    if (activeList.length && !activeList.find((m) => m.id === model))
      setModel(activeList[0].id);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildChatBody = () => {
    const messages: Array<{ role: string; content: unknown }> = [];
    if (system.trim()) messages.push({ role: "system", content: system });
    if (visionUrl.trim()) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: visionUrl.trim() } },
        ],
      });
    } else {
      messages.push({ role: "user", content: prompt });
    }
    const body: Record<string, unknown> = {
      model,
      messages,
      stream,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
    };
    if (jsonMode) body.response_format = { type: "json_object" };
    return body;
  };

  const run = async () => {
    setOutput("");
    setRaw("");
    setImage(null);
    setUsage(null);
    setRunning(true);
    const started = Date.now();
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        toast.error("Please sign in first.");
        return;
      }
      if (mode === "chat") {
        const body = buildChatBody();
        setRaw(JSON.stringify({ request: body }, null, 2));
        const res = await fetch("/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const t = await res.text();
          setOutput(`Error ${res.status}: ${t}`);
          return;
        }
        if (stream) {
          const reader = res.body!.getReader();
          const dec = new TextDecoder();
          let acc = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = dec.decode(value);
            acc += chunk;
            for (const line of chunk.split("\n")) {
              const s = line.trim();
              if (!s.startsWith("data:")) continue;
              const bodyStr = s.slice(5).trim();
              if (bodyStr === "[DONE]") continue;
              try {
                const j = JSON.parse(bodyStr);
                const delta = j.choices?.[0]?.delta?.content ?? "";
                if (delta) setOutput((prev) => prev + delta);
                if (j.usage)
                  setUsage({
                    input: j.usage.prompt_tokens ?? 0,
                    output: j.usage.completion_tokens ?? 0,
                  });
              } catch {
                /* ignore */
              }
            }
          }
          setRaw(acc);
        } else {
          const data = await res.json();
          setRaw(JSON.stringify(data, null, 2));
          setOutput(String(data.choices?.[0]?.message?.content ?? ""));
          if (data.usage)
            setUsage({
              input: data.usage.prompt_tokens ?? 0,
              output: data.usage.completion_tokens ?? 0,
            });
        }
      } else {
        const body: Record<string, unknown> = { model, prompt };
        if (visionUrl.trim()) body.input_image = visionUrl.trim();
        setRaw(JSON.stringify({ request: body }, null, 2));
        const res = await fetch("/api/v1/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        setRaw(JSON.stringify(data, null, 2));
        if (!res.ok) {
          setOutput(`Error ${res.status}: ${JSON.stringify(data)}`);
          return;
        }
        const url = data.data?.[0]?.url ?? data.url ?? null;
        setImage(url);
        setOutput(url ? "Image generated" : "No image URL returned");
      }
    } catch (e) {
      setOutput(`Error: ${(e as Error).message}`);
    } finally {
      setLatency(Date.now() - started);
      setRunning(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1 text-xs">
          <button
            onClick={() => setMode("chat")}
            className={`rounded px-3 py-1 ${mode === "chat" ? "bg-primary text-primary-foreground" : ""}`}
          >
            <Zap className="mr-1 inline h-3 w-3" /> Chat
          </button>
          <button
            onClick={() => setMode("image")}
            className={`rounded px-3 py-1 ${mode === "image" ? "bg-primary text-primary-foreground" : ""}`}
          >
            <ImageIcon className="mr-1 inline h-3 w-3" /> Image
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <label className="text-xs text-muted-foreground">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"
            >
              {activeList.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.allowed}>
                  {m.name} {m.allowed ? "" : "🔒"} · {m.id}
                </option>
              ))}
              {activeList.length === 0 && <option>No {mode} models available</option>}
            </select>
          </div>
          {mode === "chat" && (
            <div>
              <label className="text-xs text-muted-foreground">System prompt (optional)</label>
              <textarea
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                className="mt-1 h-16 w-full rounded-lg border border-border bg-background p-2 text-sm"
                placeholder="You are a helpful assistant…"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">
              {mode === "chat" ? "Prompt" : "Image prompt"}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="mt-1 h-32 w-full rounded-lg border border-border bg-background p-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              {mode === "chat" ? "Vision image URL (optional)" : "Input image URL (for edit)"}
            </label>
            <input
              value={visionUrl}
              onChange={(e) => setVisionUrl(e.target.value)}
              placeholder="https://…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          {mode === "chat" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Temp</label>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Top P</label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={topP}
                    onChange={(e) => setTopP(Number(e.target.value))}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Max tokens</label>
                  <input
                    type="number"
                    min={1}
                    max={16384}
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={stream}
                    onChange={(e) => setStream(e.target.checked)}
                  />
                  Stream
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={jsonMode}
                    onChange={(e) => setJsonMode(e.target.checked)}
                  />
                  JSON mode
                </label>
              </div>
            </>
          )}
          <button
            onClick={run}
            disabled={running || !model}
            className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {running ? "Running…" : "Run"}
          </button>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{latency !== null ? `Latency: ${latency} ms` : "—"}</span>
            <span>{usage ? `${usage.input} in / ${usage.output} out` : "—"}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Response</span>
              <button
                onClick={() => copy(output)}
                className="rounded-md border border-border px-2 py-0.5 hover:bg-accent"
              >
                <Copy className="mr-1 inline h-3 w-3" /> Copy
              </button>
            </div>
            {image ? (
              <img
                src={image}
                alt="Generated"
                className="max-h-80 w-full rounded-lg border border-border object-contain"
              />
            ) : (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-sm">
                {output || "—"}
              </pre>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Raw</span>
              <button
                onClick={() => copy(raw)}
                className="rounded-md border border-border px-2 py-0.5 hover:bg-accent"
              >
                <Copy className="mr-1 inline h-3 w-3" /> Copy
              </button>
            </div>
            <pre className="max-h-80 overflow-auto text-xs font-mono">{raw || "—"}</pre>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Models ---------------- */
function ModelsPanel() {
  const fn = useServerFn(listModels);
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [prov, setProv] = useState("");
  const [cap, setCap] = useState("");
  const [onlyAllowed, setOnlyAllowed] = useState(false);
  useEffect(() => {
    fn({ data: {} })
      .then((r) => setRows(r.models as ModelRow[]))
      .finally(() => setLoading(false));
  }, [fn]);

  const providers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.provider_id))).sort(),
    [rows],
  );
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(
      (m) =>
        (!term || m.id.toLowerCase().includes(term) || m.name.toLowerCase().includes(term)) &&
        (!prov || m.provider_id === prov) &&
        (!cap || m.capabilities?.[cap]) &&
        (!onlyAllowed || m.allowed),
    );
  }, [rows, q, prov, cap, onlyAllowed]);

  const caps: Array<{ id: string; label: string }> = [
    { id: "chat", label: "Chat" },
    { id: "vision", label: "Vision" },
    { id: "reasoning", label: "Reasoning" },
    { id: "streaming", label: "Streaming" },
    { id: "function_calling", label: "Functions" },
    { id: "image_generation", label: "Image" },
    { id: "audio", label: "Audio" },
    { id: "video", label: "Video" },
  ];

  if (loading) return <SkeletonBlock rows={5} />;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="flex-1 min-w-[180px] rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        />
        <select
          value={prov}
          onChange={(e) => setProv(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        >
          <option value="">All providers</option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        >
          <option value="">Any capability</option>
          {caps.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={onlyAllowed}
            onChange={(e) => setOnlyAllowed(e.target.checked)}
          />
          Only accessible
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border p-4 ${
              m.allowed ? "border-border bg-card" : "border-border/60 bg-card/60"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-semibold">{m.name}</div>
                  {!m.allowed && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">{m.id}</div>
              </div>
              <StatusPill status={m.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {Object.entries(m.capabilities || {})
                .filter(([, v]) => v)
                .map(([k]) => (
                  <span
                    key={k}
                    className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] capitalize"
                  >
                    {k.replace(/_/g, " ")}
                  </span>
                ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
              <div>
                Context <span className="font-mono">{m.context_window.toLocaleString()}</span>
              </div>
              <div>
                Provider <span className="font-mono">{m.provider_id}</span>
              </div>
              {m.pricing?.input_per_1k !== undefined && (
                <div>
                  In <span className="font-mono">${m.pricing.input_per_1k}/1k</span>
                </div>
              )}
              {m.pricing?.output_per_1k !== undefined && (
                <div>
                  Out <span className="font-mono">${m.pricing.output_per_1k}/1k</span>
                </div>
              )}
              {m.pricing?.image_per_call !== undefined && (
                <div>
                  Image <span className="font-mono">${m.pricing.image_per_call}</span>
                </div>
              )}
            </div>
            {!m.allowed && (
              <Link
                to="/"
                className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-primary/50 bg-primary/5 px-2 py-1.5 text-xs font-medium text-primary"
              >
                <Sparkles className="h-3 w-3" /> Upgrade to unlock
              </Link>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full">
            <EmptyState title="No models match your filters" />
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------- Providers ---------------- */
function ProvidersPanel() {
  const fnProv = useServerFn(listProviders);
  const fnModels = useServerFn(listModels);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([fnProv(), fnModels({ data: {} })])
      .then(([p, m]) => {
        setProviders(p.providers as ProviderRow[]);
        setModels(m.models as ModelRow[]);
      })
      .finally(() => setLoading(false));
  }, [fnProv, fnModels]);

  if (loading) return <SkeletonBlock rows={4} />;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Providers</h1>
      <p className="text-sm text-muted-foreground">
        Upstream model providers powering the PrismXGPT gateway.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p) => {
          const provModels = models.filter((m) => m.provider_id === p.id);
          const enabled = provModels.filter((m) => m.enabled).length;
          return (
            <div key={p.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{p.id}</div>
                </div>
                <StatusPill status={p.status || "active"} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-border bg-background px-2 py-1">
                  <div className="text-[10px] text-muted-foreground">Models</div>
                  <div className="text-sm font-semibold">{provModels.length}</div>
                </div>
                <div className="rounded-md border border-border bg-background px-2 py-1">
                  <div className="text-[10px] text-muted-foreground">Enabled</div>
                  <div className="text-sm font-semibold">{enabled}</div>
                </div>
              </div>
              {p.website && (
                <a
                  href={p.website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block text-xs text-primary hover:underline"
                >
                  {p.website.replace(/^https?:\/\//, "")} ↗
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Usage ---------------- */
function UsagePanel() {
  const getSeries = useServerFn(usageSeries);
  const [series, setSeries] = useState<
    { day: string; requests: number; tokens: number; images: number; errors: number }[]
  >([]);
  const [days, setDays] = useState(7);
  useEffect(() => {
    getSeries({ data: { days } }).then((r) => setSeries(r.series));
  }, [getSeries, days]);
  const max = Math.max(1, ...series.map((s) => s.requests));
  const totals = series.reduce(
    (a, b) => ({
      req: a.req + b.requests,
      tok: a.tok + b.tokens,
      img: a.img + b.images,
      err: a.err + b.errors,
    }),
    { req: 0, tok: 0, img: 0, err: 0 },
  );
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Requests" value={totals.req.toLocaleString()} />
        <StatCard label="Tokens" value={totals.tok.toLocaleString()} />
        <StatCard label="Images" value={totals.img.toLocaleString()} />
        <StatCard label="Errors" value={totals.err.toLocaleString()} tone={totals.err > 0 ? "danger" : "default"} />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 text-sm font-medium">Requests</div>
        <div className="flex h-52 items-end gap-1">
          {series.map((s) => (
            <div key={s.day} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-primary/70"
                style={{ height: `${(s.requests / max) * 100}%`, minHeight: 2 }}
              />
              <div className="text-[10px] text-muted-foreground">{s.day.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Day</th>
              <th className="px-4 py-2 text-right">Requests</th>
              <th className="px-4 py-2 text-right">Tokens</th>
              <th className="px-4 py-2 text-right">Images</th>
              <th className="px-4 py-2 text-right">Errors</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.day} className="border-b border-border/60 last:border-b-0">
                <td className="px-4 py-2">{s.day}</td>
                <td className="px-4 py-2 text-right">{s.requests}</td>
                <td className="px-4 py-2 text-right">{s.tokens}</td>
                <td className="px-4 py-2 text-right">{s.images}</td>
                <td className="px-4 py-2 text-right">{s.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Analytics ---------------- */
function AnalyticsPanel() {
  const fn = useServerFn(listUsage);
  const [rows, setRows] = useState<UsageRow[]>([]);
  useEffect(() => {
    fn({ data: { limit: 500 } }).then((r) => setRows(r.rows as UsageRow[]));
  }, [fn]);
  const byModel = useMemo(() => {
    const map = new Map<string, { requests: number; tokens: number; latencies: number[] }>();
    for (const r of rows) {
      const k = r.model ?? "unknown";
      const v = map.get(k) ?? { requests: 0, tokens: 0, latencies: [] };
      v.requests += 1;
      v.tokens += r.input_tokens + r.output_tokens;
      if (r.latency_ms) v.latencies.push(r.latency_ms);
      map.set(k, v);
    }
    return Array.from(map.entries())
      .map(([model, v]) => ({
        model,
        requests: v.requests,
        tokens: v.tokens,
        avgLatency: v.latencies.length
          ? Math.round(v.latencies.reduce((a, b) => a + b, 0) / v.latencies.length)
          : 0,
      }))
      .sort((a, b) => b.requests - a.requests);
  }, [rows]);

  const byEndpoint = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.endpoint, (map.get(r.endpoint) ?? 0) + 1);
    return Array.from(map.entries())
      .map(([endpoint, requests]) => ({ endpoint, requests }))
      .sort((a, b) => b.requests - a.requests);
  }, [rows]);

  const perDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const d = r.created_at.slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([, v]) => v)
      .reverse();
  }, [rows]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Advanced Analytics</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Requests trend</div>
          <Sparkline values={perDay.length ? perDay : [0]} />
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Distinct models</div>
          <div className="mt-1 text-2xl font-semibold">{byModel.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Distinct endpoints</div>
          <div className="mt-1 text-2xl font-semibold">{byEndpoint.length}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-sm font-medium">Per model</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Model</th>
              <th className="px-4 py-2 text-right">Requests</th>
              <th className="px-4 py-2 text-right">Tokens</th>
              <th className="px-4 py-2 text-right">Avg latency</th>
            </tr>
          </thead>
          <tbody>
            {byModel.map((m) => (
              <tr key={m.model} className="border-b border-border/60 last:border-b-0">
                <td className="px-4 py-2 font-mono text-xs">{m.model}</td>
                <td className="px-4 py-2 text-right">{m.requests}</td>
                <td className="px-4 py-2 text-right">{m.tokens.toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{m.avgLatency} ms</td>
              </tr>
            ))}
            {byModel.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-sm font-medium">Per endpoint</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Endpoint</th>
              <th className="px-4 py-2 text-right">Requests</th>
            </tr>
          </thead>
          <tbody>
            {byEndpoint.map((e) => (
              <tr key={e.endpoint} className="border-b border-border/60 last:border-b-0">
                <td className="px-4 py-2 font-mono text-xs">{e.endpoint}</td>
                <td className="px-4 py-2 text-right">{e.requests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Logs ---------------- */
function LogsPanel() {
  const fn = useServerFn(listUsage);
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [filter, setFilter] = useState<"all" | "errors" | "chat" | "image">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    fn({ data: { limit: 500 } })
      .then((r) => setRows(r.rows as UsageRow[]))
      .finally(() => setLoading(false));
  }, [fn]);
  useEffect(() => refresh(), [refresh]);

  const filtered = rows.filter((r) => {
    if (filter === "errors" && r.status_code < 400) return false;
    if (filter === "chat" && !r.endpoint.includes("chat")) return false;
    if (filter === "image" && !r.endpoint.includes("image")) return false;
    if (q && !(r.model?.toLowerCase().includes(q.toLowerCase()) || r.endpoint.includes(q))) return false;
    return true;
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Request Logs</h1>
        <button
          onClick={refresh}
          className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
        >
          <RefreshCw className="mr-1 inline h-3 w-3" /> Refresh
        </button>
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3">
        {(["all", "errors", "chat", "image"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs capitalize ${
              filter === f ? "border-primary bg-primary/10" : "border-border"
            }`}
          >
            {f}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter model or endpoint…"
          className="ml-auto flex-1 min-w-[180px] rounded-md border border-border bg-background px-2 py-1 text-xs"
        />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Time</th>
              <th className="px-4 py-2 text-left">Endpoint</th>
              <th className="px-4 py-2 text-left">Model</th>
              <th className="px-4 py-2 text-right">Status</th>
              <th className="px-4 py-2 text-right">Tokens</th>
              <th className="px-4 py-2 text-right">Latency</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No requests match.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-b-0">
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.endpoint}</td>
                  <td className="px-4 py-2 text-xs">{r.model ?? "—"}</td>
                  <td
                    className={`px-4 py-2 text-right text-xs ${
                      r.status_code >= 400 ? "text-destructive" : ""
                    }`}
                  >
                    {r.status_code}
                  </td>
                  <td className="px-4 py-2 text-right text-xs">
                    {r.input_tokens + r.output_tokens}
                  </td>
                  <td className="px-4 py-2 text-right text-xs">{r.latency_ms} ms</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      title="Copy request id"
                      onClick={() => copy(String(r.id))}
                      className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-accent"
                    >
                      <Copy className="inline h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Webhooks ---------------- */
function WebhooksPanel() {
  const fnList = useServerFn(listWebhooks);
  const fnCreate = useServerFn(createWebhook);
  const fnRotate = useServerFn(rotateWebhookSecret);
  const fnStatus = useServerFn(setWebhookStatus);
  const fnDelete = useServerFn(deleteWebhook);
  const fnDeliv = useServerFn(listDeliveries);
  const fnTest = useServerFn(testDeliverWebhook);
  const [hooks, setHooks] = useState<
    Array<{
      id: string;
      url: string;
      events: string[];
      status: string;
      description: string | null;
      created_at: string;
    }>
  >([]);
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<
    Record<string, Array<{ id: number; event: string; status_code: number | null; response_ms: number | null; created_at: string; error: string | null }>>
  >({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    fnList()
      .then((r) => setHooks(r.hooks as typeof hooks))
      .finally(() => setLoading(false));
  }, [fnList]);
  useEffect(() => refresh(), [refresh]);

  const create = async () => {
    if (!/^https?:\/\//.test(url)) return toast.error("Enter a valid URL");
    try {
      const r = await fnCreate({ data: { url, description: desc } });
      setNewSecret(r.secret);
      setUrl("");
      setDesc("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const loadDeliv = async (id: string) => {
    if (openId === id) return setOpenId(null);
    setOpenId(id);
    if (!deliveries[id]) {
      try {
        const r = await fnDeliv({ data: { webhookId: id } });
        setDeliveries((p) => ({ ...p, [id]: r.deliveries as typeof p[string] }));
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 text-sm font-medium">Add endpoint</div>
        <div className="grid gap-2 sm:grid-cols-[2fr_2fr_auto]">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.com/webhook"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={create}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <Plus className="mr-1 inline h-4 w-4" /> Add
          </button>
        </div>
        {newSecret && (
          <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div className="text-xs font-medium">Webhook secret — shown only once</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
                {newSecret}
              </code>
              <button
                onClick={() => copy(newSecret)}
                className="rounded-md border border-border px-2 py-2 text-xs hover:bg-accent"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                onClick={() => setNewSecret(null)}
                className="rounded-md border border-border px-3 py-2 text-xs hover:bg-accent"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
      {loading ? (
        <SkeletonBlock rows={3} />
      ) : hooks.length === 0 ? (
        <EmptyState title="No webhooks yet" hint="Add an endpoint above to receive events." />
      ) : (
        <div className="space-y-2">
          {hooks.map((h) => (
            <div key={h.id} className="rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusPill status={h.status} />
                    <div className="truncate font-mono text-sm">{h.url}</div>
                  </div>
                  {h.description && (
                    <div className="mt-1 text-xs text-muted-foreground">{h.description}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={async () => {
                      try {
                        const r = await fnTest({ data: { id: h.id } });
                        toast.success(`Test delivered · ${r.status} · ${r.ms}ms`);
                        setDeliveries((p) => ({ ...p, [h.id]: [] }));
                        await loadDeliv(h.id);
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                    title="Send test"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => loadDeliv(h.id)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    {openId === h.id ? "Hide" : "Deliveries"}
                  </button>
                  <button
                    title="Rotate secret"
                    onClick={async () => {
                      if (!confirm("Rotate webhook secret?")) return;
                      try {
                        const r = await fnRotate({ data: { id: h.id } });
                        setNewSecret(r.secret);
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                    className="rounded-md border border-border p-1.5 hover:bg-accent"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title={h.status === "active" ? "Disable" : "Enable"}
                    onClick={async () => {
                      const next = h.status === "active" ? "disabled" : "active";
                      try {
                        await fnStatus({ data: { id: h.id, status: next } });
                        await refresh();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                    className="rounded-md border border-border p-1.5 hover:bg-accent"
                  >
                    <Power className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title="Delete"
                    onClick={async () => {
                      if (!confirm("Delete webhook?")) return;
                      try {
                        await fnDelete({ data: { id: h.id } });
                        await refresh();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                    className="rounded-md border border-border p-1.5 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {openId === h.id && (
                <div className="border-t border-border p-3">
                  <div className="mb-2 text-xs font-medium">Recent deliveries</div>
                  {deliveries[h.id]?.length ? (
                    <table className="w-full text-xs">
                      <thead className="text-[10px] uppercase text-muted-foreground">
                        <tr>
                          <th className="text-left">Time</th>
                          <th className="text-left">Event</th>
                          <th className="text-right">Status</th>
                          <th className="text-right">Latency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveries[h.id].map((d) => (
                          <tr key={d.id} className="border-t border-border/40">
                            <td>{fmt(d.created_at)}</td>
                            <td>{d.event}</td>
                            <td
                              className={`text-right ${
                                (d.status_code ?? 0) >= 400 ? "text-destructive" : ""
                              }`}
                            >
                              {d.status_code ?? "err"}
                            </td>
                            <td className="text-right">{d.response_ms ?? "—"} ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      No deliveries yet.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------- SDKs ---------------- */
function SDKsPanel() {
  const langs = [
    "curl",
    "javascript",
    "typescript",
    "node",
    "python",
    "go",
    "java",
    "php",
    "rust",
    "swift",
    "kotlin",
    "csharp",
  ] as const;
  type L = (typeof langs)[number];
  const labels: Record<L, string> = {
    curl: "cURL",
    javascript: "JavaScript",
    typescript: "TypeScript",
    node: "Node.js",
    python: "Python",
    go: "Go",
    java: "Java",
    php: "PHP",
    rust: "Rust",
    swift: "Swift",
    kotlin: "Kotlin",
    csharp: "C#",
  };
  const [lang, setLang] = useState<L>("curl");
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://prismxgpt.lovable.app";
  const url = `${origin}/api/v1/chat/completions`;
  const snip: Record<L, string> = {
    curl: `curl ${url} \\
  -H "Authorization: Bearer $PRISM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"google/gemini-2.5-flash","messages":[{"role":"user","content":"Hi"}]}'`,
    javascript: `const res = await fetch("${url}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${PRISM_API_KEY}\`,
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash",
    messages: [{ role: "user", content: "Hi" }],
  }),
});
console.log((await res.json()).choices[0].message.content);`,
    typescript: `type Msg = { role: "user" | "assistant" | "system"; content: string };
async function chat(messages: Msg[]) {
  const r = await fetch("${url}", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${process.env.PRISM_API_KEY}\`,
    },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}`,
    node: `import fetch from "node-fetch";
const r = await fetch("${url}", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: \`Bearer \${process.env.PRISM_API_KEY}\` },
  body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: "Hi" }] }),
});
console.log((await r.json()).choices[0].message.content);`,
    python: `import os, requests
r = requests.post(
    "${url}",
    headers={"Authorization": f"Bearer {os.environ['PRISM_API_KEY']}", "Content-Type": "application/json"},
    json={"model": "google/gemini-2.5-flash", "messages": [{"role": "user", "content": "Hi"}]},
    timeout=60,
)
r.raise_for_status()
print(r.json()["choices"][0]["message"]["content"])`,
    go: `package main

import (
  "bytes"; "encoding/json"; "fmt"; "io"; "net/http"; "os"
)

func main() {
  body, _ := json.Marshal(map[string]any{
    "model": "google/gemini-2.5-flash",
    "messages": []map[string]string{{"role": "user", "content": "Hi"}},
  })
  req, _ := http.NewRequest("POST", "${url}", bytes.NewReader(body))
  req.Header.Set("Content-Type", "application/json")
  req.Header.Set("Authorization", "Bearer "+os.Getenv("PRISM_API_KEY"))
  res, _ := http.DefaultClient.Do(req)
  defer res.Body.Close()
  b, _ := io.ReadAll(res.Body)
  fmt.Println(string(b))
}`,
    java: `import java.net.http.*;
import java.net.URI;
var client = HttpClient.newHttpClient();
var body = """
{ "model": "google/gemini-2.5-flash",
  "messages": [{ "role": "user", "content": "Hi" }] }
""";
var req = HttpRequest.newBuilder(URI.create("${url}"))
  .header("Content-Type", "application/json")
  .header("Authorization", "Bearer " + System.getenv("PRISM_API_KEY"))
  .POST(HttpRequest.BodyPublishers.ofString(body))
  .build();
System.out.println(client.send(req, HttpResponse.BodyHandlers.ofString()).body());`,
    php: `<?php
$ch = curl_init("${url}");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Content-Type: application/json",
    "Authorization: Bearer " . getenv("PRISM_API_KEY"),
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "model" => "google/gemini-2.5-flash",
    "messages" => [["role" => "user", "content" => "Hi"]],
  ]),
]);
echo curl_exec($ch);`,
    rust: `use reqwest::Client;
use serde_json::json;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
  let key = std::env::var("PRISM_API_KEY")?;
  let body = json!({
    "model": "google/gemini-2.5-flash",
    "messages": [{ "role": "user", "content": "Hi" }],
  });
  let r = Client::new().post("${url}")
    .bearer_auth(key).json(&body).send().await?.text().await?;
  println!("{}", r);
  Ok(())
}`,
    swift: `import Foundation

var req = URLRequest(url: URL(string: "${url}")!)
req.httpMethod = "POST"
req.setValue("application/json", forHTTPHeaderField: "Content-Type")
req.setValue("Bearer \\(ProcessInfo.processInfo.environment["PRISM_API_KEY"] ?? "")",
             forHTTPHeaderField: "Authorization")
req.httpBody = try JSONSerialization.data(withJSONObject: [
  "model": "google/gemini-2.5-flash",
  "messages": [["role": "user", "content": "Hi"]],
])
let (data, _) = try await URLSession.shared.data(for: req)
print(String(data: data, encoding: .utf8) ?? "")`,
    kotlin: `import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
val body = """
{ "model": "google/gemini-2.5-flash",
  "messages": [{ "role": "user", "content": "Hi" }] }
""".trimIndent().toRequestBody("application/json".toMediaType())
val req = Request.Builder()
  .url("${url}")
  .header("Authorization", "Bearer " + System.getenv("PRISM_API_KEY"))
  .post(body).build()
println(OkHttpClient().newCall(req).execute().body?.string())`,
    csharp: `using System.Net.Http.Headers;
using System.Text;

var http = new HttpClient();
http.DefaultRequestHeaders.Authorization =
  new AuthenticationHeaderValue("Bearer",
    Environment.GetEnvironmentVariable("PRISM_API_KEY"));
var body = new StringContent(
  """
  { "model": "google/gemini-2.5-flash",
    "messages": [{ "role": "user", "content": "Hi" }] }
  """,
  Encoding.UTF8, "application/json");
var res = await http.PostAsync("${url}", body);
Console.WriteLine(await res.Content.ReadAsStringAsync());`,
  };
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">SDKs & Snippets</h1>
      <div className="flex flex-wrap gap-2">
        {langs.map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`rounded-full border px-3 py-1 text-xs ${
              lang === l ? "border-primary bg-primary/10" : "border-border text-muted-foreground"
            }`}
          >
            {labels[l]}
          </button>
        ))}
      </div>
      <CodeBlock code={snip[lang]} lang={labels[lang]} />
    </section>
  );
}

/* ---------------- Examples ---------------- */
function ExamplesPanel() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const ex = (title: string, code: string, lang = "bash") => ({ title, code, lang });
  const items = [
    ex(
      "Chat completion",
      `curl ${origin}/api/v1/chat/completions \\
  -H "Authorization: Bearer $PRISM_API_KEY" -H "Content-Type: application/json" \\
  -d '{"model":"google/gemini-2.5-flash","messages":[{"role":"user","content":"Hi"}]}'`,
    ),
    ex(
      "Streaming SSE",
      `curl ${origin}/api/v1/chat/completions \\
  -H "Authorization: Bearer $PRISM_API_KEY" -H "Content-Type: application/json" \\
  -d '{"model":"google/gemini-2.5-flash","stream":true,"messages":[{"role":"user","content":"Stream this"}]}'`,
    ),
    ex(
      "Vision (image URL)",
      `curl ${origin}/api/v1/chat/completions \\
  -H "Authorization: Bearer $PRISM_API_KEY" -H "Content-Type: application/json" \\
  -d '{"model":"openai/gpt-4o","messages":[{"role":"user","content":[
    {"type":"text","text":"Describe this image"},
    {"type":"image_url","image_url":{"url":"https://example.com/cat.jpg"}}
  ]}]}'`,
    ),
    ex(
      "Image generation",
      `curl ${origin}/api/v1/images/generations \\
  -H "Authorization: Bearer $PRISM_API_KEY" -H "Content-Type: application/json" \\
  -d '{"prompt":"a prism refracting light, cinematic"}'`,
    ),
    ex(
      "Image editing",
      `curl ${origin}/api/v1/images/generations \\
  -H "Authorization: Bearer $PRISM_API_KEY" -H "Content-Type: application/json" \\
  -d '{"prompt":"make it emerald green","input_image":"https://example.com/photo.jpg"}'`,
    ),
    ex("List models", `curl ${origin}/api/v1/models -H "Authorization: Bearer $PRISM_API_KEY"`),
    ex(
      "Webhooks — verify signature",
      `// Node.js
import crypto from "node:crypto";
const sig = req.headers["x-prismx-signature"];
const expected = crypto
  .createHmac("sha256", process.env.PRISMX_WEBHOOK_SECRET)
  .update(rawBody)
  .digest("hex");
if (sig !== expected) return res.status(401).end();`,
      "javascript",
    ),
    ex(
      "Projects (list your chats)",
      `curl ${origin}/api/v1/chat/completions \\
  -H "Authorization: Bearer $PRISM_API_KEY" -H "Content-Type: application/json" \\
  -d '{"model":"google/gemini-2.5-flash","messages":[{"role":"user","content":"Summarize my day"}]}'`,
    ),
  ];
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">API Examples</h1>
      {items.map((i) => (
        <div key={i.title}>
          <div className="mb-2 text-sm font-medium">{i.title}</div>
          <CodeBlock code={i.code} lang={i.lang} />
        </div>
      ))}
    </section>
  );
}

/* ---------------- Rate Limits ---------------- */
function RateLimitsPanel() {
  const [plans, setPlans] = useState<
    Array<{
      tier: string;
      monthly_message_limit: number | null;
      monthly_image_limit: number | null;
      price_monthly_cents: number | null;
    }>
  >([]);
  useEffect(() => {
    supabase
      .from("plan_settings")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("tier,monthly_message_limit,monthly_image_limit,price_monthly_cents" as any)
      .then(({ data }) => setPlans(((data as unknown) as typeof plans) ?? []));
  }, []);
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Rate Limits</h1>
      <p className="text-sm text-muted-foreground">
        Limits are driven by your subscription plan. Upgrade to lift caps on chat messages and
        image generations.
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Plan</th>
              <th className="px-4 py-2 text-right">Chat / month</th>
              <th className="px-4 py-2 text-right">Images / month</th>
              <th className="px-4 py-2 text-right">Price / month</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.tier} className="border-b border-border/60 last:border-b-0">
                <td className="px-4 py-2 font-medium capitalize">{p.tier}</td>
                <td className="px-4 py-2 text-right">{p.monthly_message_limit ?? "Unlimited"}</td>
                <td className="px-4 py-2 text-right">{p.monthly_image_limit ?? "Unlimited"}</td>
                <td className="px-4 py-2 text-right">
                  {p.price_monthly_cents ? `$${(p.price_monthly_cents / 100).toFixed(2)}` : "Free"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Billing ---------------- */
function BillingPanel() {
  const [profile, setProfile] = useState<{ plan?: string; email?: string } | null>(null);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("plan,email" as any)
        .eq("id", u.user.id)
        .maybeSingle();
      setProfile(((data as unknown) as { plan?: string; email?: string }) ?? { email: u.user.email ?? "" });
    })();
  }, []);
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Current plan" value={profile?.plan ?? "free"} tone="brand" />
        <StatCard label="Email" value={profile?.email ?? "—"} />
        <StatCard label="Renewal" value="—" hint="Managed by your subscription" />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-medium">Invoices & payment history</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage your payment method and view invoices from your account. API usage is included with
          your PrismXGPT subscription.
        </p>
        <Link
          to="/"
          className="mt-3 inline-flex rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
        >
          View plans & upgrade →
        </Link>
      </div>
    </section>
  );
}

/* ---------------- Quick Start ---------------- */
function QuickStartPanel() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const steps = [
    { title: "Create an account", body: "Sign in to PrismXGPT with your email." },
    {
      title: "Create an API key",
      body: "Open the API Keys tab and click Create. Copy the plaintext value — it's shown only once.",
    },
    { title: "Send your first request", body: "Use the snippet below to call chat completions." },
    { title: "Watch usage", body: "Every request appears in Usage, Analytics, and Logs in real time." },
    { title: "Add webhooks", body: "Wire up webhooks to receive events in your app." },
    { title: "Ship!", body: "You're ready — see the Examples tab for streaming, vision, and images." },
  ];
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Quick Start</h1>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-mono text-muted-foreground">Step {i + 1}</div>
            <div className="mt-1 font-medium">{s.title}</div>
            <div className="text-sm text-muted-foreground">{s.body}</div>
          </li>
        ))}
      </ol>
      <CodeBlock
        lang="bash"
        code={`curl ${origin}/api/v1/chat/completions \\
  -H "Authorization: Bearer $PRISM_API_KEY" -H "Content-Type: application/json" \\
  -d '{"model":"google/gemini-2.5-flash","messages":[{"role":"user","content":"Say hi"}]}'`}
      />
    </section>
  );
}

/* ---------------- Settings ---------------- */
const SETTINGS_KEY = "prismx.developer.settings.v1";
type DevSettings = {
  defaultModel: string;
  stream: boolean;
  reasoning: boolean;
  temperature: number;
  notifyOnError: boolean;
  notifyOnWebhookFail: boolean;
};
const DEFAULT_SETTINGS: DevSettings = {
  defaultModel: "google/gemini-2.5-flash",
  stream: true,
  reasoning: false,
  temperature: 0.7,
  notifyOnError: true,
  notifyOnWebhookFail: true,
};
function SettingsPanel() {
  const [s, setS] = useState<DevSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setS({ ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as DevSettings) });
    } catch {
      /* ignore */
    }
  }, []);
  const save = (patch: Partial<DevSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    toast.success("Saved");
  };
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Developer Settings</h1>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Default model</label>
            <input
              value={s.defaultModel}
              onChange={(e) => save({ defaultModel: e.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Default temperature</label>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={s.temperature}
              onChange={(e) => save({ temperature: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={s.stream}
              onChange={(e) => save({ stream: e.target.checked })}
            />
            Stream responses by default
          </label>
          <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={s.reasoning}
              onChange={(e) => save({ reasoning: e.target.checked })}
            />
            Prefer reasoning models
          </label>
          <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={s.notifyOnError}
              onChange={(e) => save({ notifyOnError: e.target.checked })}
            />
            Notify on API errors
          </label>
          <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={s.notifyOnWebhookFail}
              onChange={(e) => save({ notifyOnWebhookFail: e.target.checked })}
            />
            Notify on webhook failures
          </label>
        </div>
        <div className="text-[10px] text-muted-foreground">
          Preferences are stored locally in your browser and used to prefill the Playground and SDK
          snippets.
        </div>
      </div>
    </section>
  );
}
