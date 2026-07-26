import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type DashboardOverview = {
  requestsToday: number;
  requestsMonth: number;
  tokensMonth: number;
  imagesMonth: number;
  activeKeys: number;
  avgLatency: number;
  successRate: number;
  errorRate: number;
  estimatedCostUsd: number;
  topModels: Array<{ model: string; requests: number; tokens: number }>;
  topEndpoints: Array<{ endpoint: string; requests: number }>;
  recentActivity: Array<{
    id: number;
    endpoint: string;
    model: string | null;
    status_code: number;
    latency_ms: number;
    created_at: string;
  }>;
  series7d: Array<{ day: string; requests: number; tokens: number; images: number; errors: number }>;
};

// Rough $/1k tokens approximation for cost estimate.
const COST_PER_1K: Record<string, [number, number]> = {
  "openai/gpt-5": [0.005, 0.015],
  "openai/gpt-5-mini": [0.001, 0.003],
  "openai/gpt-4.1": [0.003, 0.012],
  "openai/gpt-4o": [0.0025, 0.01],
  "openai/gpt-4o-mini": [0.00015, 0.0006],
  "anthropic/claude-opus-4": [0.015, 0.075],
  "anthropic/claude-sonnet-4": [0.003, 0.015],
  "anthropic/claude-haiku-4": [0.0008, 0.004],
  "google/gemini-2.5-pro": [0.00125, 0.005],
  "google/gemini-2.5-flash": [0.00015, 0.0006],
  "google/gemini-2.5-flash-lite": [0.00005, 0.0002],
};

function estCost(model: string | null, inTok: number, outTok: number, images: number): number {
  const c = model ? COST_PER_1K[model] : undefined;
  const tokCost = c ? (inTok / 1000) * c[0] + (outTok / 1000) * c[1] : 0;
  return tokCost + images * 0.02;
}

export const dashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardOverview> => {
    const sb = context.supabase as unknown as Any;
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const since30d = new Date(now - 30 * 86400000).toISOString();

    const [{ data: monthRows }, { data: activeKeys }, { data: recent }] = await Promise.all([
      sb
        .from("api_key_usage")
        .select("endpoint,model,status_code,input_tokens,output_tokens,images,latency_ms,created_at")
        .eq("user_id", context.userId)
        .gte("created_at", since30d)
        .limit(5000),
      sb.from("api_keys").select("id", { count: "exact", head: true }).eq("user_id", context.userId).eq("status", "active"),
      sb
        .from("api_key_usage")
        .select("id,endpoint,model,status_code,latency_ms,created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const rows = (monthRows ?? []) as Array<{
      endpoint: string;
      model: string | null;
      status_code: number;
      input_tokens: number;
      output_tokens: number;
      images: number;
      latency_ms: number;
      created_at: string;
    }>;

    let requestsToday = 0;
    let requestsMonth = 0;
    let tokensMonth = 0;
    let imagesMonth = 0;
    let latencySum = 0;
    let latencyN = 0;
    let successes = 0;
    let errors = 0;
    let cost = 0;
    const modelAgg = new Map<string, { requests: number; tokens: number }>();
    const endpointAgg = new Map<string, number>();
    const dayAgg = new Map<string, { day: string; requests: number; tokens: number; images: number; errors: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      dayAgg.set(key, { day: key, requests: 0, tokens: 0, images: 0, errors: 0 });
    }

    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      if (t >= startOfMonth.getTime()) {
        requestsMonth += 1;
        tokensMonth += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
        imagesMonth += r.images ?? 0;
      }
      if (t >= startOfDay.getTime()) requestsToday += 1;
      if (r.latency_ms) {
        latencySum += r.latency_ms;
        latencyN += 1;
      }
      if ((r.status_code ?? 0) >= 400) errors += 1;
      else successes += 1;
      cost += estCost(r.model, r.input_tokens ?? 0, r.output_tokens ?? 0, r.images ?? 0);

      const mKey = r.model ?? "unknown";
      const m = modelAgg.get(mKey) ?? { requests: 0, tokens: 0 };
      m.requests += 1;
      m.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      modelAgg.set(mKey, m);
      endpointAgg.set(r.endpoint, (endpointAgg.get(r.endpoint) ?? 0) + 1);

      const dk = r.created_at.slice(0, 10);
      const d = dayAgg.get(dk);
      if (d) {
        d.requests += 1;
        d.tokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
        d.images += r.images ?? 0;
        if ((r.status_code ?? 0) >= 400) d.errors += 1;
      }
    }
    const total = successes + errors;
    const topModels = Array.from(modelAgg.entries())
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5);
    const topEndpoints = Array.from(endpointAgg.entries())
      .map(([endpoint, requests]) => ({ endpoint, requests }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5);

    return {
      requestsToday,
      requestsMonth,
      tokensMonth,
      imagesMonth,
      activeKeys: (activeKeys as unknown as { count?: number })?.count ?? 0,
      avgLatency: latencyN ? Math.round(latencySum / latencyN) : 0,
      successRate: total ? Math.round((successes / total) * 1000) / 10 : 100,
      errorRate: total ? Math.round((errors / total) * 1000) / 10 : 0,
      estimatedCostUsd: Math.round(cost * 100) / 100,
      topModels,
      topEndpoints,
      recentActivity: (recent ?? []) as DashboardOverview["recentActivity"],
      series7d: Array.from(dayAgg.values()),
    };
  });
