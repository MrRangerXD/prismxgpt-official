import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AssetCfg } from "./assets";

type ParsedPrice = { amount: number; currency: "INR" | "USD" };

const INR_MARK = /₹|inr|rs\.?/i;

/** Prices are stored as display strings ("₹499", "$9", "Free"). */
function parsePrice(raw: string): ParsedPrice | null {
  const text = raw.trim();
  if (!text) return null;
  const currency: ParsedPrice["currency"] = INR_MARK.test(text) ? "INR" : "USD";
  const digits = text.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
  const amount = Number(digits);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency };
}

async function planPrice(planId: string): Promise<ParsedPrice> {
  const { data, error } = await supabaseAdmin
    .from("plan_settings")
    .select("id, price")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw new Error(`Plan lookup failed: ${error.message}`);
  if (!data) throw new Error("Unknown plan");

  const parsed = parsePrice(String(data.price ?? ""));
  if (!parsed) throw new Error("Plan is not purchasable");
  return parsed;
}

// Fallback only used if the FX API is down; keeps checkout alive.
const INR_PER_USD_FALLBACK = 88;

async function usdFromInr(inr: number): Promise<number> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR", {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error("fx");
    const json = (await res.json()) as { rates?: { INR?: number } };
    const rate = Number(json?.rates?.INR ?? 0);
    if (!rate) throw new Error("fx");
    return inr / rate;
  } catch {
    return inr / INR_PER_USD_FALLBACK;
  }
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
    if (price.currency !== "INR") throw new Error("Plan has no INR price");
    return String(Math.round(price.amount * 100));
  }

  const usd = price.currency === "USD" ? price.amount : await usdFromInr(price.amount);
  const rate = await cryptoRate(cfg.symbol);
  const base = Math.round((usd * 10 ** cfg.decimals) / rate);
  if (base < 1) throw new Error("Plan is too cheap for this asset");

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
