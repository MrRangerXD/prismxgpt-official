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
} from "lucide-react";
import { API_MODELS } from "@/lib/api-models";
import {
  listApiKeys,
  createApiKey,
  renameApiKey,
  setApiKeyStatus,
  deleteApiKey,
  usageSeries,
  listUsage,
} from "@/lib/api-keys.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/developer")({
  head: () => ({
    meta: [
      { title: "Developer Platform — PrismXGPT" },
      { name: "description", content: "API keys, usage analytics, playground, SDKs, and examples for the PrismXGPT API." },
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

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "keys", label: "API Keys", icon: Key },
  { id: "usage", label: "Usage", icon: Gauge },
  { id: "playground", label: "Playground", icon: Play },
  { id: "models", label: "Models", icon: Boxes },
  { id: "sdks", label: "SDKs", icon: Code2 },
  { id: "examples", label: "Examples", icon: BookOpen },
  { id: "limits", label: "Rate Limits", icon: ListChecks },
  { id: "logs", label: "Logs", icon: ListChecks },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "quickstart", label: "Quick Start", icon: Rocket },
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
          <Link to="/chat" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to chat
          </Link>
          <span className="text-sm font-semibold tracking-tight">Developer Platform</span>
        </div>
        <div className="text-xs text-muted-foreground">Base URL <code className="rounded bg-muted px-1.5 py-0.5">/api/v1</code></div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 md:px-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-20 flex flex-col gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  tab === t.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
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
                  tab === t.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
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
          {tab === "usage" && <UsagePanel />}
          {tab === "playground" && <Playground />}
          {tab === "models" && <ModelsPanel />}
          {tab === "sdks" && <SDKsPanel />}
          {tab === "examples" && <ExamplesPanel />}
          {tab === "limits" && <RateLimitsPanel />}
          {tab === "logs" && <LogsPanel />}
          {tab === "billing" && <BillingPanel />}
          {tab === "quickstart" && <QuickStartPanel />}
        </main>
      </div>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard() {
  const getSeries = useServerFn(usageSeries);
  const [series, setSeries] = useState<{ day: string; requests: number; tokens: number; images: number; errors: number }[]>([]);
  useEffect(() => {
    getSeries({ data: { days: 7 } })
      .then((r) => setSeries(r.series))
      .catch(() => setSeries([]));
  }, [getSeries]);
  const totals = series.reduce(
    (a, b) => ({ req: a.req + b.requests, tok: a.tok + b.tokens, img: a.img + b.images, err: a.err + b.errors }),
    { req: 0, tok: 0, img: 0, err: 0 },
  );
  const max = Math.max(1, ...series.map((s) => s.requests));
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Requests (7d)" value={totals.req.toLocaleString()} />
        <Stat label="Tokens (7d)" value={totals.tok.toLocaleString()} />
        <Stat label="Images (7d)" value={totals.img.toLocaleString()} />
        <Stat label="Errors (7d)" value={totals.err.toLocaleString()} />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-medium">Requests · last 7 days</div>
        <div className="flex h-40 items-end gap-2">
          {series.map((s) => (
            <div key={s.day} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-primary/70"
                style={{ height: `${(s.requests / max) * 100}%`, minHeight: 2 }}
                title={`${s.requests} requests`}
              />
              <div className="text-[10px] text-muted-foreground">{s.day.slice(5)}</div>
            </div>
          ))}
          {series.length === 0 && <div className="text-sm text-muted-foreground">No usage yet.</div>}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
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
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<{ name: string; plaintext: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingName, setCreatingName] = useState("");
  const [reveal, setReveal] = useState(false);

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
    if (!creatingName.trim()) return;
    setCreating(true);
    try {
      const r = await create({ data: { name: creatingName.trim() } });
      setNewKey({ name: (r.key as { name: string }).name, plaintext: r.plaintext });
      setCreatingName("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
        <button onClick={refresh} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent">
          <RefreshCw className="mr-1 inline h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-medium">Create a new key</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={creatingName}
            onChange={(e) => setCreatingName(e.target.value)}
            placeholder="e.g. Production backend"
            maxLength={60}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !creatingName.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Create key
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
              {reveal ? newKey.plaintext : newKey.plaintext.slice(0, 13) + "…" + newKey.plaintext.slice(-4)}
            </code>
            <button
              onClick={() => setReveal((r) => !r)}
              className="rounded-md border border-border px-2 py-2 text-xs hover:bg-accent"
              title={reveal ? "Hide" : "Reveal"}
            >
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(newKey.plaintext);
                toast.success("Copied");
              }}
              className="rounded-md border border-border px-2 py-2 text-xs hover:bg-accent"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button onClick={() => setNewKey(null)} className="rounded-md border border-border px-3 py-2 text-xs hover:bg-accent">
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
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Last used</th>
              <th className="px-4 py-2 text-left">Created</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No API keys yet. Create one above.
                </td>
              </tr>
            ) : (
              keys.map((k) => (
                <tr key={k.id} className="border-b border-border/60 last:border-b-0">
                  <td className="px-4 py-3">
                    <button
                      onClick={async () => {
                        const name = prompt("Rename key", k.name);
                        if (!name || name === k.name) return;
                        try {
                          await rename({ data: { id: k.id, name } });
                          await refresh();
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                      className="text-left font-medium hover:underline"
                    >
                      {k.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {k.prefix}…{k.last4}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={k.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(k.last_used_at)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(k.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
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
                        title="Revoke"
                        onClick={async () => {
                          if (!confirm(`Revoke key "${k.name}"? This cannot be undone.`)) return;
                          try {
                            await setStatus({ data: { id: k.id, status: "revoked" } });
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
      : status === "disabled"
        ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
        : "bg-destructive/10 text-destructive border-destructive/30";
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${cls}`}>{status}</span>;
}

function fmt(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/* ---------------- Usage ---------------- */
function UsagePanel() {
  const getSeries = useServerFn(usageSeries);
  const [series, setSeries] = useState<{ day: string; requests: number; tokens: number; images: number; errors: number }[]>([]);
  const [days, setDays] = useState(7);
  useEffect(() => {
    getSeries({ data: { days } }).then((r) => setSeries(r.series));
  }, [getSeries, days]);
  const max = Math.max(1, ...series.map((s) => s.requests));
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
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex h-52 items-end gap-1">
          {series.map((s) => (
            <div key={s.day} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t bg-primary/70" style={{ height: `${(s.requests / max) * 100}%`, minHeight: 2 }} />
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

/* ---------------- Playground ---------------- */
function Playground() {
  const [model, setModel] = useState(API_MODELS[0].id);
  const [prompt, setPrompt] = useState("Write a haiku about prisms.");
  const [stream, setStream] = useState(false);
  const [output, setOutput] = useState("");
  const [json, setJson] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setOutput("");
    setJson("");
    setRunning(true);
    const started = Date.now();
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        toast.error("Please sign in first.");
        return;
      }
      const req = { model, messages: [{ role: "user", content: prompt }], stream };
      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(req),
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
            const body = s.slice(5).trim();
            if (body === "[DONE]") continue;
            try {
              const j = JSON.parse(body);
              const delta = j.choices?.[0]?.delta?.content ?? "";
              if (delta) setOutput((prev) => prev + delta);
            } catch {
              /* ignore */
            }
          }
        }
        setJson(acc);
      } else {
        const data = await res.json();
        setJson(JSON.stringify(data, null, 2));
        setOutput(String(data.choices?.[0]?.message?.content ?? ""));
      }
    } finally {
      setLatency(Date.now() - started);
      setRunning(false);
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <label className="text-xs text-muted-foreground">Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm">
              {API_MODELS.filter((m) => !m.image).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="mt-1 h-40 w-full rounded-lg border border-border bg-background p-3 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={stream} onChange={(e) => setStream(e.target.checked)} /> Stream response
          </label>
          <button
            onClick={run}
            disabled={running}
            className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {running ? "Running…" : "Run"}
          </button>
          {latency !== null && <div className="text-xs text-muted-foreground">Latency: {latency} ms</div>}
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-xs text-muted-foreground">Response</div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-sm">{output || "—"}</pre>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              Raw
              <button
                onClick={() => {
                  navigator.clipboard.writeText(json);
                  toast.success("Copied");
                }}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <pre className="max-h-64 overflow-auto text-xs font-mono">{json || "—"}</pre>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Models ---------------- */
function ModelsPanel() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Model</th>
              <th className="px-4 py-2 text-left">Provider</th>
              <th className="px-4 py-2 text-right">Context</th>
              <th className="px-4 py-2 text-left">Capabilities</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {API_MODELS.map((m) => (
              <tr key={m.id} className="border-b border-border/60 last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{m.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{m.id}</div>
                </td>
                <td className="px-4 py-3">{m.provider}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{m.context.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {m.capabilities.map((c) => (
                      <span key={c} className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs">
                        {c}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">{m.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- SDKs ---------------- */
function SDKsPanel() {
  const [lang, setLang] = useState<"js" | "ts" | "python" | "node" | "curl">("js");
  const origin = typeof window !== "undefined" ? window.location.origin : "https://prismxgpt.lovable.app";
  const snippets: Record<string, string> = {
    js: `// JavaScript (browser or Deno)
const res = await fetch("${origin}/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer pk_prism_YOUR_KEY",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash",
    messages: [{ role: "user", content: "Hello!" }],
  }),
});
const data = await res.json();
console.log(data.choices[0].message.content);`,
    ts: `// TypeScript
type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

async function chat(messages: ChatMessage[]) {
  const res = await fetch("${origin}/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${process.env.PRISM_API_KEY}\`,
    },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}`,
    node: `// Node.js (>= 18)
import fetch from "node-fetch";

const res = await fetch("${origin}/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${process.env.PRISM_API_KEY}\`,
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash",
    messages: [{ role: "user", content: "Hello!" }],
  }),
});
console.log((await res.json()).choices[0].message.content);`,
    python: `# Python
import os, requests

resp = requests.post(
    "${origin}/api/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {os.environ['PRISM_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "model": "google/gemini-2.5-flash",
        "messages": [{"role": "user", "content": "Hello!"}],
    },
    timeout=60,
)
resp.raise_for_status()
print(resp.json()["choices"][0]["message"]["content"])`,
    curl: `curl ${origin}/api/v1/chat/completions \\
  -H "Authorization: Bearer $PRISM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "google/gemini-2.5-flash",
    "messages": [{"role":"user","content":"Hello!"}]
  }'`,
  };
  const langs: Array<{ id: typeof lang; label: string }> = [
    { id: "js", label: "JavaScript" },
    { id: "ts", label: "TypeScript" },
    { id: "node", label: "Node.js" },
    { id: "python", label: "Python" },
    { id: "curl", label: "cURL" },
  ];
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">SDKs & Snippets</h1>
      <div className="flex flex-wrap gap-2">
        {langs.map((l) => (
          <button
            key={l.id}
            onClick={() => setLang(l.id)}
            className={`rounded-full border px-3 py-1 text-xs ${
              lang === l.id ? "border-primary bg-primary/10" : "border-border text-muted-foreground"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <CodeBlock code={snippets[lang]} />
    </section>
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <span>{lang || "code"}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            toast.success("Copied");
          }}
          className="rounded-md border border-border px-2 py-0.5 hover:bg-accent"
        >
          <Copy className="mr-1 inline h-3 w-3" /> Copy
        </button>
      </div>
      <pre className="overflow-auto p-4 text-xs leading-relaxed font-mono">{code}</pre>
    </div>
  );
}

/* ---------------- Examples ---------------- */
function ExamplesPanel() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">API Examples</h1>
      <Example title="Chat completion">
        <CodeBlock
          lang="bash"
          code={`curl ${origin}/api/v1/chat/completions \\
  -H "Authorization: Bearer $PRISM_API_KEY" -H "Content-Type: application/json" \\
  -d '{"model":"google/gemini-2.5-flash","messages":[{"role":"user","content":"Hi"}]}'`}
        />
      </Example>
      <Example title="Streaming">
        <CodeBlock
          lang="bash"
          code={`curl ${origin}/api/v1/chat/completions \\
  -H "Authorization: Bearer $PRISM_API_KEY" -H "Content-Type: application/json" \\
  -d '{"model":"google/gemini-2.5-flash","stream":true,"messages":[{"role":"user","content":"Stream this"}]}'`}
        />
      </Example>
      <Example title="Image generation">
        <CodeBlock
          lang="bash"
          code={`curl ${origin}/api/v1/images/generations \\
  -H "Authorization: Bearer $PRISM_API_KEY" -H "Content-Type: application/json" \\
  -d '{"prompt":"a prism refracting light on a dark background, cinematic"}'`}
        />
      </Example>
      <Example title="Image edit (send a URL or base64 data URL)">
        <CodeBlock
          lang="bash"
          code={`curl ${origin}/api/v1/images/generations \\
  -H "Authorization: Bearer $PRISM_API_KEY" -H "Content-Type: application/json" \\
  -d '{"prompt":"make the background emerald green","input_image":"https://example.com/photo.jpg"}'`}
        />
      </Example>
      <Example title="List models">
        <CodeBlock lang="bash" code={`curl ${origin}/api/v1/models`} />
      </Example>
    </section>
  );
}
function Example({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}

/* ---------------- Rate Limits ---------------- */
function RateLimitsPanel() {
  const [plans, setPlans] = useState<Array<{ tier: string; monthly_message_limit: number | null; monthly_image_limit: number | null; price_monthly_cents: number | null }>>([]);
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
        Limits are driven by your subscription plan. Upgrade to lift caps on chat messages and image generations.
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

/* ---------------- Logs ---------------- */
function LogsPanel() {
  const fn = useServerFn(listUsage);
  const [rows, setRows] = useState<UsageRow[]>([]);
  useEffect(() => {
    fn({ data: { limit: 200 } }).then((r) => setRows(r.rows as UsageRow[]));
  }, [fn]);
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No requests yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-b-0">
                  <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.endpoint}</td>
                  <td className="px-4 py-2 text-xs">{r.model ?? "—"}</td>
                  <td className={`px-4 py-2 text-right text-xs ${r.status_code >= 400 ? "text-destructive" : ""}`}>
                    {r.status_code}
                  </td>
                  <td className="px-4 py-2 text-right text-xs">{r.input_tokens + r.output_tokens}</td>
                  <td className="px-4 py-2 text-right text-xs">{r.latency_ms} ms</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Billing ---------------- */
function BillingPanel() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      <p className="text-sm text-muted-foreground">
        API usage is included with your PrismXGPT subscription. Manage your plan and payment method from your account.
      </p>
      <Link to="/" className="inline-flex rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">
        View plans →
      </Link>
    </section>
  );
}

/* ---------------- Quick Start ---------------- */
function QuickStartPanel() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const steps = useMemo(
    () => [
      { title: "Create an account", body: "Sign in to PrismXGPT with your email." },
      { title: "Create an API key", body: "Head to the API Keys tab and click Create key. Copy the plaintext value — it's shown only once." },
      { title: "Send your first request", body: "Use the snippet below to call chat completions." },
      { title: "Watch usage", body: "Every request you make is logged in the Usage and Logs tabs in real time." },
      { title: "Ship!", body: "You're ready. Read the Examples tab for streaming, images, and more." },
    ],
    [],
  );
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
