import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ASSETS } from "@/lib/payments/assets";
import { qrPayload } from "@/lib/payments/pricing.server";

export const Route = createFileRoute("/api/payments/open")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (!auth.ok) return new Response("Sign in again.", { status: 401 });

        const { data } = await supabaseAdmin
          .from("payment_orders")
          .select("id, asset, expected_atomic, address, status, expires_at")
          .eq("user_id", auth.userId)
          .in("status", ["pending", "seen", "confirming", "review"])
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!data) return Response.json({ order: null });
        const cfg = ASSETS[data.asset];
        if (!cfg) return Response.json({ order: null });

        return Response.json({
          order: {
            orderId: data.id,
            asset: data.asset,
            address: cfg.address ?? null,
            contract: cfg.contract ?? null,
            expectedAtomic: data.expected_atomic,
            decimals: cfg.decimals,
            symbol: cfg.symbol,
            network: cfg.network,
            confirmations: cfg.confirmations,
            expiresAt: data.expires_at,
            status: data.status,
            qrPayload: qrPayload(data.id, cfg, data.expected_atomic),
          },
        });
      },
    },
  },
});
