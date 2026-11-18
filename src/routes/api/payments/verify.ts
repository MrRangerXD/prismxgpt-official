import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ASSETS } from "@/lib/payments/assets";
import { creditPlan } from "@/lib/payments/credit.server";
import { scanOrder } from "@/lib/payments/verify.server";
import { asPaymentClient } from "@/lib/payments/database-types";

const paymentsAdmin = asPaymentClient(supabaseAdmin);

const TOLERANCE = 0.02;

export const Route = createFileRoute("/api/payments/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const viaCron = request.headers.get("x-cron-secret") === process.env.CRON_SECRET;
        if (!viaCron) {
          const auth = await requireApiAuth(request);
          if (!auth.ok) return new Response("Forbidden.", { status: 403 });
        }

        const { data: orders } = await paymentsAdmin
          .from("payment_orders")
          .select("id, user_id, plan_id, asset, expected_atomic, created_at, expires_at")
          .in("status", ["pending", "seen", "confirming"])
          .gt("expires_at", new Date().toISOString())
          .limit(50);

        let matched = 0;
        let credited = 0;

        for (const order of orders ?? []) {
          const cfg = ASSETS[order.asset];
          if (!cfg) continue;

          let hits;
          try {
            hits = await scanOrder(order as never);
          } catch (e) {
            console.error("[payments/verify] scan failed", order.id, order.asset, e);
            continue;
          }

          const want = Number(order.expected_atomic);
          if (!want) continue;
          const hit = hits.find((h) => Math.abs(Number(h.atomic) - want) / want <= TOLERANCE);
          if (!hit) continue;
          matched++;

          if (hit.confirmations < cfg.confirmations) {
            await paymentsAdmin
              .from("payment_orders")
              .update({
                status: "confirming",
                tx_hash: hit.txHash,
                confirmations: hit.confirmations,
              })
              .eq("id", order.id)
              .neq("status", "paid");
            continue;
          }

          const { data: claimed } = await paymentsAdmin
            .from("payment_orders")
            .update({
              status: "paid",
              tx_hash: hit.txHash,
              confirmations: hit.confirmations,
              credited_at: new Date().toISOString(),
            })
            .eq("id", order.id)
            .neq("status", "paid")
            .select("id");

          if (claimed?.length) {
            await creditPlan(order.user_id, order.plan_id);
            credited++;
          }
        }

        return Response.json({ scanned: orders?.length ?? 0, matched, credited });
      },
    },
  },
});
