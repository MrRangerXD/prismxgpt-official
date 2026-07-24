import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/snapshot/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id;
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Not found", { status: 404 });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("public_chat_snapshots")
            .select("id, title, messages, created_at")
            .eq("id", id)
            .maybeSingle();
          if (error || !data) {
            if (error) console.error("[snapshot-api] db error", error);
            return new Response("Not found", { status: 404 });
          }
          return Response.json(data);
        } catch (e) {
          console.error("[snapshot-api] error", e);
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
