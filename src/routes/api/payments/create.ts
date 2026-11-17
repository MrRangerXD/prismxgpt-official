import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ASSETS } from "@/lib/payments/assets";
import { expectedAtomic, qrPayload } from "@/lib/payments/pricing.server";

const MAX_OPEN = 3;
const MAX_PER_HOUR = 20;

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

        const cfg = body.asset ? ASSETS[body.asset] : undefined;
        if (!cfg || !body.planId) return new Response("Unknown asset or plan.", { status: 400 });
        if (cfg.chain !== "upi" && !cfg.address) {
          return new Response("That asset isn't configured yet.", { status: 503 });
        }

        const open = await supabaseAdmin
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
        const recent = await supabaseAdmin
          .from("payment_orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", auth.userId)
          .gte("created_at", hourAgo);
        if ((recent.count ?? 0) >= MAX_PER_HOUR) {
          return new Response("Too many orders this hour.", { status: 429 });
        }

        let atomic: string;
        try {
          atomic = await expectedAtomic(body.planId, cfg);
        } catch (e) {
          console.error("[payments/create] pricing failed", e);
          return new Response("Couldn't price that plan right now.", { status: 503 });
        }

        const { data, error } = await supabaseAdmin
          .from("payment_orders")
          .insert({
            user_id: auth.userId,
            plan_id: body.planId,
            asset: body.asset,
            expected_atomic: atomic,
            address: cfg.address ?? null,
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
          address: cfg.address ?? null,
          contract: cfg.contract ?? null,
          expectedAtomic: atomic,
          decimals: cfg.decimals,
          symbol: cfg.symbol,
          network: cfg.network,
          confirmations: cfg.confirmations,
          expiresAt: data.expires_at,
          qrPayload: qrPayload(data.id, cfg, atomic),
        });
      },
    },
  },
});
