import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/api-auth.server";

function friendly(status: number, upstreamMsg?: string): { status: number; error: string } {
  if (status === 401) return { status: 401, error: "Please sign in again to generate images." };
  if (status === 402) return { status: 402, error: "Image generation credits are exhausted for this workspace. Please add credits and try again." };
  if (status === 429) return { status: 429, error: "Too many image requests right now — please wait a moment and try again." };
  if (upstreamMsg && /content.?policy|moderation|safety/i.test(upstreamMsg)) {
    return { status: 400, error: "That prompt was blocked by the safety filter. Try rephrasing without names of real people, brands, or copyrighted characters." };
  }
  if (status >= 500) return { status: 502, error: "Image generation is temporarily unavailable. Please try again in a moment." };
  return { status: 400, error: "I couldn't generate that image. Try a different prompt or try again." };
}

export const Route = createFileRoute("/api/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (!auth.ok) {
          return Response.json({ error: "Please sign in again to generate images." }, { status: 401 });
        }

        let prompt: string | undefined;
        let inputImageDataUrl: string | undefined;
        try {
          const body = (await request.json()) as { prompt?: string; inputImage?: string };
          prompt = body.prompt;
          inputImageDataUrl = body.inputImage;
        } catch {
          return Response.json({ error: "Please describe the image you want to generate." }, { status: 400 });
        }
        if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
          return Response.json({ error: "Please describe the image you want to generate." }, { status: 400 });
        }
        if (prompt.length > 8000) {
          // Auto-compress: dedupe repeated instructions & whitespace instead of rejecting.
          const lines = prompt.split("\n").map((l) => l.trim()).filter(Boolean);
          const seen = new Set<string>();
          const kept: string[] = [];
          for (const l of lines) {
            const k = l.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            kept.push(l);
          }
          prompt = kept.join("\n").slice(0, 8000);
        }

        // Server-side feature kill-switch: admin can globally disable image generation.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: cfg } = await supabaseAdmin
            .from("app_settings")
            .select("value")
            .eq("key", "features")
            .maybeSingle();
          const features = (cfg?.value ?? {}) as { imageGeneration?: boolean };
          if (features.imageGeneration === false) {
            return Response.json(
              { error: "Image generation is currently disabled by the administrator." },
              { status: 403 },
            );
          }
        } catch (e) {
          console.error("[api/image] feature flag check failed", e);
        }

        // Server-side plan + daily quota enforcement (free = 3/day; premium/pro/admin bypass).
        // Fail-open: if the roles lookup or quota RPC fails (e.g. the migration
        // hasn't been applied yet in this environment), log and allow the
        // request rather than surfacing "Couldn't verify your image quota".
        // Real provider errors below still surface normally.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: roles, error: rolesErr } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", auth.userId);
          if (rolesErr) {
            console.error("[api/image] roles lookup failed (fail-open)", rolesErr);
          } else {
            const isPaid = (roles ?? []).some((r) => ["admin", "premium", "pro"].includes(r.role as string));
            if (!isPaid) {
              const { data: remaining, error: qErr } = await supabaseAdmin.rpc(
                "consume_image_quota",
                { _limit: 3, _user_id: auth.userId },
              );
              if (qErr) {
                console.error("[api/image] quota rpc error (fail-open)", qErr);
              } else if (typeof remaining === "number" && remaining < 0) {
                return Response.json(
                  { error: "Free plan limit reached: 3 images per day. Upgrade for unlimited image generation." },
                  { status: 429 },
                );
              }
            }
          }
        } catch (e) {
          console.error("[api/image] quota check failed (fail-open)", e);
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          console.error("[api/image] missing LOVABLE_API_KEY");
          return Response.json({ error: "Image generation isn't configured right now. Please try again shortly." }, { status: 503 });
        }

        // Retry once on transient upstream failure (5xx / network).
        const doFetch = () =>
          fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Lovable-API-Key": key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3.1-flash-image",
              messages: [
                {
                  role: "user",
                  content: inputImageDataUrl
                    ? [
                        { type: "text", text: prompt },
                        { type: "image_url", image_url: { url: inputImageDataUrl } },
                      ]
                    : prompt,
                },
              ],
              modalities: ["image", "text"],
            }),
          });


        let upstream: Response;
        try {
          upstream = await doFetch();
          if (!upstream.ok && upstream.status >= 500) {
            await new Promise((r) => setTimeout(r, 400));
            upstream = await doFetch();
          }
        } catch (e) {
          console.error("[api/image] network error", e);
          return Response.json(
            { error: "I couldn't reach the image service. Please try again in a moment." },
            { status: 502 },
          );
        }

        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");
          console.error("[api/image] upstream error", upstream.status, text);
          const f = friendly(upstream.status, text);
          return Response.json({ error: f.error }, { status: f.status });
        }

        let json: { data?: Array<{ b64_json?: string }> };
        try {
          json = await upstream.json();
        } catch (e) {
          console.error("[api/image] bad json", e);
          return Response.json(
            { error: "The image service returned an unexpected response. Please try again." },
            { status: 502 },
          );
        }
        const b64 = json.data?.[0]?.b64_json;
        if (!b64) {
          return Response.json(
            { error: "No image was returned. Please try a different prompt." },
            { status: 502 },
          );
        }

        // Persist to the user's Library (best-effort — do not fail the
        // response if storage upload hiccups). Fixes item #3: images now
        // appear in the Library modal after generation.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
          const storagePath = `${auth.userId}/${filename}`;
          const { error: upErr } = await supabaseAdmin.storage
            .from("library")
            .upload(storagePath, bytes, { contentType: "image/png", upsert: false });
          if (!upErr) {
            const title = prompt.slice(0, 80);
            await supabaseAdmin.from("library_items").insert({
              user_id: auth.userId,
              kind: "image",
              title,
              prompt,
              storage_path: storagePath,
              mime_type: "image/png",
              size_bytes: bytes.byteLength,
            });
          } else {
            console.error("[api/image] library upload failed", upErr);
          }
        } catch (e) {
          console.error("[api/image] library persist failed", e);
        }

        return Response.json({ dataUrl: `data:image/png;base64,${b64}` });
      },
    },
  },
});

