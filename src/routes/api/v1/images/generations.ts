// POST /api/v1/images/generations  { prompt, model?, input_image? (data URL or https URL) }
import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth, logApiUsage } from "@/lib/api-auth.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

type Body = { prompt?: string; model?: string; input_image?: string };

export const Route = createFileRoute("/api/v1/images/generations")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const started = Date.now();
        const auth = await requireApiAuth(request);
        if (!auth.ok) return withCors(auth.response);

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return j({ error: { message: "Invalid JSON body" } }, 400);
        }
        const prompt = String(body.prompt ?? "").trim();
        if (!prompt) return j({ error: { message: "prompt is required" } }, 400);
        const model = body.model || "google/gemini-2.5-flash-image";
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return j({ error: { message: "Server not configured" } }, 500);

        const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
        if (body.input_image) content.push({ type: "image_url", image_url: { url: body.input_image } });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "prismxgpt-api-v1",
          },
          body: JSON.stringify({
            model,
            modalities: ["image", "text"],
            messages: [{ role: "user", content }],
          }),
        });

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => "");
          await logApiUsage({
            apiKeyId: auth.apiKeyId,
            userId: auth.userId,
            endpoint: "/api/v1/images/generations",
            model,
            statusCode: upstream.status,
            latencyMs: Date.now() - started,
            error: errText.slice(0, 500),
          });
          return withCors(new Response(errText || "Upstream error", { status: upstream.status }));
        }
        const data = (await upstream.json()) as {
          choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
        };
        const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        await logApiUsage({
          apiKeyId: auth.apiKeyId,
          userId: auth.userId,
          endpoint: "/api/v1/images/generations",
          model,
          statusCode: 200,
          images: url ? 1 : 0,
          latencyMs: Date.now() - started,
        });
        if (!url) return j({ error: { message: "No image returned" } }, 502);
        return j({ created: Math.floor(Date.now() / 1000), data: [{ url }] }, 200);
      },
    },
  },
});

function j(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors } });
}
function withCors(r: Response): Response {
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}
