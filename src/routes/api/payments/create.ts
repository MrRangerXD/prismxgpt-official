import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ASSETS } from "@/lib/payments/assets";
import { expectedAtomic, qrPayload } from "@/lib/payments/pricing.server";
import { asPaymentClient, type PaymentAsset } from "@/lib/payments/database-types";

const paymentsAdmin = asPaymentClient(supabaseAdmin);

const MAX_OPEN = 3;
const MAX_PER_HOUR = 20;

type Method = { type?: string; value?: string; label?: string };

const PAYMENT_ASSETS: PaymentAsset[] = ["upi", "ltc", "sol", "trx", "usdt_trc20", "usdt_spl"];

function isAssetKey(asset: string): asset is PaymentAsset {
  return PAYMENT_ASSETS.includes(asset as PaymentAsset) && Object.hasOwn(ASSETS, asset);
}

export const Route = createFileRoute("/api/payments/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (!auth.ok) return new Response("Sign in again.", { status: 401 });

        let body: { planId?: string; asset?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad request.", { status: 400 });
        }

        const asset = body.asset;
        if (!asset || !isAssetKey(asset) || !body.planId) {
          return new Response("Unknown asset or plan.", { status: 400 });
        }
        const cfg = ASSETS[asset];

        const open = await paymentsAdmin
          .from("payment_orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", auth.userId)
          .in("status", ["pending", "seen", "confirming"]);
        if ((open.count ?? 0) >= MAX_OPEN) {
          return new Response("You already have 3 open orders. Finish or let one expire.", {
            status: 429,
          });
        }

        const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
        const recent = await paymentsAdmin
          .from("payment_orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", auth.userId)
          .gte("created_at", hourAgo);
        if ((recent.count ?? 0) >= MAX_PER_HOUR) {
          return new Response("Too many orders this hour.", { status: 429 });
        }

        // Admin-authored payment methods win over env. A crypto method only
        // applies when its label or value names the asset's symbol, so an LTC
        // address is never handed out for a SOL order.
        const { data: planRow } = await supabaseAdmin
          .from("plan_settings")
          .select("payment_methods")
          .eq("id", body.planId)
          .maybeSingle();
        const methods = Array.isArray(planRow?.payment_methods)
          ? (planRow.payment_methods as Method[])
          : [];
        const qrImage = methods.find((m) => m.type === "qr" && m.value)?.value ?? null;

        let payTo: string | null = null;
        if (cfg.chain === "upi") {
          payTo =
            methods.find((m) => m.type === "upi" && m.value)?.value ?? process.env.UPI_VPA ?? null;
        } else {
          const sym = cfg.symbol.toLowerCase();
          payTo =
            methods.find(
              (m) =>
                m.type === "crypto" &&
                m.value &&
                `${m.label ?? ""} ${m.value}`.toLowerCase().includes(sym),
            )?.value ??
            cfg.address ??
            null;
        }
        if (!payTo) {
          return new Response(`${cfg.label} isn't configured for this plan.`, { status: 503 });
        }

        let atomic: string;
        try {
          atomic = await expectedAtomic(body.planId, cfg);
        } catch (e) {
          console.error("[payments/create] pricing failed", e);
          return new Response("Couldn't price that plan right now.", { status: 503 });
        }

        const { data, error } = await paymentsAdmin
          .from("payment_orders")
          .insert({
            user_id: auth.userId,
            plan_id: body.planId,
            asset,
            expected_atomic: atomic,
            address: payTo,
          })
          .select("id, expires_at")
          .single();

        if (error || !data) {
          console.error("[payments/create] insert failed", error);
          return new Response("Couldn't create the order.", { status: 500 });
        }

        return Response.json({
          orderId: data.id,
          asset: body.asset,
          address: payTo,
          contract: cfg.contract ?? null,
          expectedAtomic: atomic,
          decimals: cfg.decimals,
          symbol: cfg.symbol,
          network: cfg.network,
          confirmations: cfg.confirmations,
          expiresAt: data.expires_at,
          qrImage,
          qrPayload: qrPayload(data.id, { ...cfg, address: payTo }, atomic),
        });
      },
    },
  },
});
