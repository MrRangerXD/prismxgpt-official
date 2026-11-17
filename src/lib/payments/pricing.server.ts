import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ASSETS, type AssetCfg } from "./assets";

// ADJUST: column names must match your `plans` table.
async function planPrice(planId: string): Promise<{ usd: number; inr: number }> {
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("price_usd, price_inr")
    .eq("id", planId)
    .maybeSingle();
  if (error || !data) throw new Error("Unknown plan");
  return { usd: Number(data.price_usd ?? 0), inr: Number(data.price_inr ?? 0) };
}

async function cryptoRate(symbol: string): Promise<number> {
  if (symbol === "USDT") return 1;
  const id = { LTC: "litecoin", SOL: "solana", TRX: "tron" }[symbol];
  if (!id) throw new Error(`No rate for ${symbol}`);
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error("Rate lookup failed");
  const json = (await res.json()) as Record<string, { usd?: number }>;
  const rate = Number(json?.[id]?.usd ?? 0);
  if (!rate) throw new Error("Rate unavailable");
  return rate;
}

/** Exact atomic amount for one order. Computed server-side, frozen at creation. */
export async function expectedAtomic(planId: string, cfg: AssetCfg): Promise<string> {
  const price = await planPrice(planId);

  if (cfg.chain === "upi") {
    if (!price.inr) throw new Error("Plan has no INR price");
    return String(Math.round(price.inr * 100));
  }

  if (!price.usd) throw new Error("Plan has no USD price");
  const rate = await cryptoRate(cfg.symbol);
  const base = Math.round((price.usd * 10 ** cfg.decimals) / rate);
  return String(base + Math.floor(Math.random() * cfg.jitter));
}

export function qrPayload(orderId: string, cfg: AssetCfg, atomic: string): string {
  if (cfg.chain === "upi") {
    const amount = (Number(atomic) / 100).toFixed(2);
    return `upi://pay?pa=${process.env.UPI_VPA}&pn=PrismXGPT&am=${amount}&cu=INR&tn=${orderId}`;
  }
  if (cfg.chain === "utxo") {
    return `litecoin:${cfg.address}?amount=${(Number(atomic) / 1e8).toFixed(8)}`;
  }
  if (cfg.contract) {
    return `${cfg.address}?amount=${(Number(atomic) / 10 ** cfg.decimals).toFixed(cfg.decimals)}&spl-token=${cfg.contract}`;
  }
  return `${cfg.address}?amount=${(Number(atomic) / 10 ** cfg.decimals).toFixed(cfg.decimals)}`;
}
