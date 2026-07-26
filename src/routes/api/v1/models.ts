import { createFileRoute } from "@tanstack/react-router";
import { API_MODELS } from "@/lib/api-models";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const Route = createFileRoute("/api/v1/models")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async () =>
        new Response(
          JSON.stringify({
            object: "list",
            data: API_MODELS.map((m) => ({
              id: m.id,
              object: "model",
              owned_by: m.provider.toLowerCase(),
              context_length: m.context,
              capabilities: m.capabilities,
            })),
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...cors } },
        ),
    },
  },
});
