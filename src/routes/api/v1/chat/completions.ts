// OpenAI-compatible chat completions on /api/v1/chat/completions
// Auth: Bearer <supabase-jwt> OR Bearer pk_prism_*
import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth, logApiUsage } from "@/lib/api-auth.server";
import { findModel } from "@/lib/api-models";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type Body = { model?: string; messages?: ChatMessage[]; stream?: boolean; temperature?: number; max_tokens?: number };

export const Route = createFileRoute("/api/v1/chat/completions")({
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
          return json({ error: { message: "Invalid JSON body" } }, 400);
        }
        const model = body.model || "google/gemini-2.5-flash";
        if (!findModel(model)) return json({ error: { message: `Unknown model: ${model}` } }, 400);
        if (!Array.isArray(body.messages) || body.messages.length === 0)
          return json({ error: { message: "messages is required" } }, 400);

        // Plan gating: admin bypass + user_can_use_model(uuid,text)
        const { userCanUseModel } = await import("@/lib/model-access.server");
        const allowed = await userCanUseModel(auth.userId, model);
        if (!allowed) {
          await logApiUsage({
            apiKeyId: auth.apiKeyId,
            userId: auth.userId,
            endpoint: "/api/v1/chat/completions",
            model,
            statusCode: 403,
            latencyMs: Date.now() - started,
            error: "model_not_allowed",
          });
          return json({ error: { code: "model_not_allowed", message: `Your plan does not include ${model}.` } }, 403);
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return json({ error: { message: "Server not configured" } }, 500);

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "prismxgpt-api-v1",
          },
          body: JSON.stringify({
            model,
            messages: body.messages,
            stream: !!body.stream,
            temperature: body.temperature,
            max_tokens: body.max_tokens,
          }),
        });

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => "");
          await logApiUsage({
            apiKeyId: auth.apiKeyId,
            userId: auth.userId,
            endpoint: "/api/v1/chat/completions",
            model,
            statusCode: upstream.status,
            latencyMs: Date.now() - started,
            error: errText.slice(0, 500),
          });
          return withCors(new Response(errText || "Upstream error", { status: upstream.status }));
        }

        if (body.stream) {
          // Pass-through SSE. Estimate input tokens from prompt; approximate output from bytes.
          const inputTokens = Math.ceil(
            (body.messages ?? []).reduce((n, m) => n + (m?.content?.length ?? 0), 0) / 4,
          );
          let outputChars = 0;
          const reader = upstream.body!.getReader();
          const stream = new ReadableStream({
            async pull(controller) {
              const { value, done } = await reader.read();
              if (done) {
                controller.close();
                await logApiUsage({
                  apiKeyId: auth.apiKeyId,
                  userId: auth.userId,
                  endpoint: "/api/v1/chat/completions",
                  model,
                  statusCode: 200,
                  inputTokens,
                  outputTokens: Math.ceil(outputChars / 4),
                  latencyMs: Date.now() - started,
                });
                return;
              }
              outputChars += value?.byteLength ?? 0;
              controller.enqueue(value);
            },
          });
          return new Response(stream, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              ...cors,
            },
          });
        }

        const data = (await upstream.json()) as {
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        await logApiUsage({
          apiKeyId: auth.apiKeyId,
          userId: auth.userId,
          endpoint: "/api/v1/chat/completions",
          model,
          statusCode: 200,
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          latencyMs: Date.now() - started,
        });
        return json(data, 200);
      },
    },
  },
});

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
function withCors(r: Response): Response {
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}
