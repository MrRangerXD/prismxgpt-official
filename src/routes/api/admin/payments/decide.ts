import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isAdmin } from "@/lib/admin.server";
import { creditPlan } from "@/lib/payments/credit.server";

export const Route = createFileRoute("/api/admin/payments/decide")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (!auth.ok) return new Response("Sign in again.", { status: 401 });

        if (!(await isAdmin(auth.userId))) {
          return new Response("Admins only.", { status: 403 });
        }

        let body: { orderId?: string; approve?: boolean };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad request.", { status: 400 });
        }
        if (!body.orderId) return new Response("Missing order.", { status: 400 });

        const { data: order } = await supabaseAdmin
          .from("payment_orders")
          .select("id, user_id, plan_id, status")
          .eq("id", body.orderId)
          .maybeSingle();

        if (!order) return new Response("Not found.", { status: 404 });
        if (order.status !== "review") return new Response("Not awaiting review.", { status: 409 });

        if (!body.approve) {
          await supabaseAdmin
            .from("payment_orders")
            .update({ status: "failed" })
            .eq("id", order.id)
            .eq("status", "review");
          return Response.json({ ok: true, status: "failed" });
        }

        const { data: claimed } = await supabaseAdmin
          .from("payment_orders")
          .update({ status: "paid", credited_at: new Date().toISOString() })
          .eq("id", order.id)
          .eq("status", "review")
          .select("id");

        if (!claimed?.length) return new Response("Already decided.", { status: 409 });

        await creditPlan(order.user_id, order.plan_id);
        return Response.json({ ok: true, status: "paid" });
      },
    },
  },
});
