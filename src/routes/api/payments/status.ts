import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ASSETS } from "@/lib/payments/assets";

export const Route = createFileRoute("/api/payments/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (!auth.ok) return new Response("Sign in again.", { status: 401 });

        const id = new URL(request.url).searchParams.get("id");
        if (!id) return new Response("Missing id.", { status: 400 });

        const { data } = await supabaseAdmin
          .from("payment_orders")
          .select("id, status, confirmations, asset, plan_id, expires_at")
          .eq("id", id)
          .eq("user_id", auth.userId)
          .maybeSingle();

        if (!data) return new Response("Not found.", { status: 404 });
        const cfg = ASSETS[data.asset as string];

        return Response.json({
          status: data.status,
          confirmations: data.confirmations,
          required: cfg?.confirmations ?? 0,
          planId: data.plan_id,
          expiresAt: data.expires_at,
        });
      },
    },
  },
});
