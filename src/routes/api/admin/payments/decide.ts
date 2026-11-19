import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isAdmin } from "@/lib/admin.server";
import { creditPlan } from "@/lib/payments/credit.server";
import { asPaymentClient } from "@/lib/payments/database-types";

const paymentsAdmin = asPaymentClient(supabaseAdmin);

export const Route = createFileRoute("/api/admin/payments/decide")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (!auth.ok) return new Response("Sign in again.", { status: 401 });
        if (!(await isAdmin(auth.userId))) return new Response("Admins only.", { status: 403 });

        const requestedStatus = new URL(request.url).searchParams.get("status");
        const statuses = [
          "pending",
          "seen",
          "confirming",
          "paid",
          "expired",
          "failed",
          "review",
        ] as const;
        const status = statuses.includes(requestedStatus as (typeof statuses)[number])
          ? (requestedStatus as (typeof statuses)[number])
          : "review";
        const { data, error } = await paymentsAdmin
          .from("payment_orders")
          .select("id, user_id, plan_id, asset, expected_atomic, utr, tx_hash, status, created_at")
          .eq("status", status)
          .order("created_at", { ascending: true })
          .limit(100);
        if (error) return new Response(error.message, { status: 500 });

        const ids = [...new Set((data ?? []).map((o) => o.user_id))];
        const { data: profiles } = ids.length
          ? await supabaseAdmin.from("profiles").select("id, email, display_name").in("id", ids)
          : {
              data: [] as Array<{ id: string; email: string | null; display_name: string | null }>,
            };
        const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

        return Response.json({
          orders: (data ?? []).map((o) => ({
            ...o,
            email: byId.get(o.user_id)?.email ?? null,
            display_name: byId.get(o.user_id)?.display_name ?? null,
          })),
        });
      },

      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (!auth.ok) return new Response("Sign in again.", { status: 401 });
        if (!(await isAdmin(auth.userId))) return new Response("Admins only.", { status: 403 });

        let body: { orderId?: string; approve?: boolean };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad request.", { status: 400 });
        }
        if (!body.orderId) return new Response("Missing order.", { status: 400 });

        const { data: order } = await paymentsAdmin
          .from("payment_orders")
          .select("id, user_id, plan_id, status")
          .eq("id", body.orderId)
          .maybeSingle();

        if (!order) return new Response("Not found.", { status: 404 });
        if (order.status !== "review") return new Response("Not awaiting review.", { status: 409 });

        if (!body.approve) {
          await paymentsAdmin
            .from("payment_orders")
            .update({ status: "failed" })
            .eq("id", order.id)
            .eq("status", "review");
          return Response.json({ ok: true, status: "failed" });
        }

        const { data: claimed } = await paymentsAdmin
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
