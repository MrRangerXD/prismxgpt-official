import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asPaymentClient } from "@/lib/payments/database-types";

const paymentsAdmin = asPaymentClient(supabaseAdmin);

export const Route = createFileRoute("/api/payments/submit-utr")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (!auth.ok) return new Response("Sign in again.", { status: 401 });

        let body: { orderId?: string; utr?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad request.", { status: 400 });
        }

        const utr = body.utr?.trim() ?? "";
        if (!body.orderId) return new Response("Missing order.", { status: 400 });
        if (!/^\d{12}$/.test(utr)) {
          return new Response("UTR must be exactly 12 digits.", { status: 400 });
        }

        const { data: order } = await paymentsAdmin
          .from("payment_orders")
          .select("id, asset, status, expires_at")
          .eq("id", body.orderId)
          .eq("user_id", auth.userId)
          .maybeSingle();

        if (!order) return new Response("Order not found.", { status: 404 });
        if (order.asset !== "upi") return new Response("Not a UPI order.", { status: 400 });
        if (order.status !== "pending") return new Response("Order is not pending.", { status: 409 });
        if (new Date(order.expires_at) < new Date()) {
          return new Response("Order expired.", { status: 410 });
        }

        const { error } = await paymentsAdmin
          .from("payment_orders")
          .update({ utr, status: "review" })
          .eq("id", order.id)
          .eq("status", "pending");

        if (error) {
          if (error.code === "23505") return new Response("That UTR was already used.", { status: 409 });
          console.error("[payments/submit-utr] update failed", error);
          return new Response("Couldn't submit the UTR.", { status: 500 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
