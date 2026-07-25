import { createFileRoute } from "@tanstack/react-router";
import { requireApiAuth } from "@/lib/api-auth.server";

// The generated Supabase Database types don't yet include image_generations
// (it's added by bootstrap.sql on the live project); use a loose alias so
// the fluent query builder typechecks without regenerating types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = { from(name: string): any; rpc(name: string, args?: unknown): any };

// ---------------------------------------------------------------------------
// Image generation lifecycle
//
// Every generation (including every edit) is its own immutable row in
// `public.image_generations`. The client picks the id up-front so it can
// persist a `⟪imggen:pending:<id>⟫` marker BEFORE the POST returns —
// meaning a refresh mid-flight can call GET /api/image?id=<id> and resume
// exactly where it left off. Edits pass `parentId` so history preserves
// provenance and the previous image is never mutated.
//
//   POST /api/image                       → start (or resume) a generation
//     body: { generationId, prompt, inputImage?, parentId? }
//     resp: { generationId, status, imageUrl?, error? }
//
//   GET  /api/image?id=<generationId>     → poll status; auto-fails rows
//                                           stuck in 'processing' > 2 min
//     resp: { status, imageUrl?, error? }
// ---------------------------------------------------------------------------

const STUCK_MS = 2 * 60 * 1000;
const FINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function runGeneration(params: {
  generationId: string;
  userId: string;
  messageId?: string;
  prompt: string;
  inputImageUrl?: string;
  parentId?: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { generationId, userId, messageId, prompt, inputImageUrl, parentId } = params;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const readExisting = async () => (supabaseAdmin as unknown as SupabaseAny)
    .from("image_generations")
    .select("id,status,image_url,error,storage_path")
    .eq("id", generationId)
    .eq("user_id", userId)
    .maybeSingle();
  const existingRes = await readExisting();
  const existing = existingRes?.data as { status?: string; image_url?: string | null; error?: string | null; storage_path?: string | null } | null | undefined;
  if (existing?.status && FINAL_STATUSES.has(existing.status)) {
    return {
      status: existing.status === "completed" ? 200 : 400,
      body: {
        generationId,
        status: existing.status,
        imageUrl: existing.image_url ?? undefined,
        storagePath: existing.storage_path ?? undefined,
        error: existing.error ?? undefined,
      },
    };
  }
  if (existing?.status === "queued" || existing?.status === "processing") {
    return { status: 202, body: { generationId, status: existing.status } };
  }

  // Reserve the lifecycle row exactly once. A duplicate POST for the same
  // client-owned id returns the existing processing/completed state and never
  // calls the provider twice.
  const baseRow = {
    id: generationId,
    user_id: userId,
    message_id: messageId ?? null,
    prompt,
    input_url: inputImageUrl ?? null,
    status: "processing",
    progress: 10,
    provider_request_id: generationId,
    error: null,
  };
  // Try with parent_id first; if the referenced parent generation doesn't
  // exist (older image predates the lifecycle table, or the row was cleaned
  // up), the FK check fails — retry without it so edits still succeed.
  const reserve = async (withParent: boolean) => (supabaseAdmin as unknown as SupabaseAny)
    .from("image_generations")
    .insert({ ...baseRow, parent_id: withParent ? parentId ?? null : null });
  let reserveRes = await reserve(true);
  if (reserveRes?.error) {
    const code = reserveRes.error?.code;
    if (code === "23503" && parentId) {
      console.warn("[api/image] parent_id missing, retrying edit without FK", reserveRes.error?.message);
      reserveRes = await reserve(false);
    }
    if (reserveRes?.error?.code === "23505") {
      const reread = await readExisting();
      const row = reread?.data as { status?: string; image_url?: string | null; error?: string | null; storage_path?: string | null } | null | undefined;
      return {
        status: row?.status === "completed" ? 200 : row?.status === "failed" || row?.status === "cancelled" ? 400 : 202,
        body: {
          generationId,
          status: row?.status ?? "processing",
          imageUrl: row?.image_url ?? undefined,
          storagePath: row?.storage_path ?? undefined,
          error: row?.error ?? undefined,
        },
      };
    }
    if (reserveRes?.error) {
      console.error("[api/image] lifecycle reservation failed", reserveRes.error);
      return { status: 500, body: { generationId, status: "failed", error: "Could not start image generation. Please retry." } };
    }
  }


  const finalize = async (patch: Record<string, unknown>) => {
    await (supabaseAdmin as unknown as SupabaseAny)
      .from("image_generations")
      .update(patch)
      .eq("id", generationId)
      .eq("user_id", userId);
  };

  // Quota is consumed only after this generation id has been reserved. A
  // duplicate POST for the same generation short-circuits above before this
  // point, so network retries cannot burn multiple quota units.
  try {
    const { data: roles } = await (supabaseAdmin as unknown as SupabaseAny)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isPaid = ((roles ?? []) as Array<{ role: string }>).some((r) =>
      ["admin", "premium", "pro"].includes(r.role),
    );
    if (!isPaid) {
      const { data: remaining, error: qErr } = await (supabaseAdmin as unknown as SupabaseAny).rpc(
        "consume_image_quota",
        { _limit: 3, _user_id: userId },
      );
      if (!qErr && typeof remaining === "number" && remaining < 0) {
        const msg = "Free plan limit reached: 3 images per day. Upgrade for unlimited image generation.";
        await finalize({ status: "failed", progress: 100, error: msg });
        return { status: 429, body: { generationId, status: "failed", error: msg } };
      }
    }
  } catch (e) {
    console.error("[api/image] quota check failed (fail-open)", e);
  }

  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    await finalize({ status: "failed", progress: 100, error: "Image generation isn't configured." });
    return { status: 503, body: { generationId, status: "failed", error: "Image generation isn't configured right now. Please try again shortly." } };
  }

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
            content: inputImageUrl
              ? [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: inputImageUrl } },
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
    const msg = "I couldn't reach the image service. Please try again in a moment.";
    await finalize({ status: "failed", progress: 100, error: msg });
    return { status: 502, body: { generationId, status: "failed", error: msg } };
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    console.error("[api/image] upstream error", upstream.status, text);
    const f = friendly(upstream.status, text);
    await finalize({ status: "failed", progress: 100, provider_job_id: upstream.headers.get("x-request-id") ?? null, error: f.error });
    return { status: f.status, body: { generationId, status: "failed", error: f.error } };
  }

  let json: { data?: Array<{ b64_json?: string }> };
  try {
    json = await upstream.json();
  } catch (e) {
    console.error("[api/image] bad json", e);
    const msg = "The image service returned an unexpected response. Please try again.";
    await finalize({ status: "failed", progress: 100, provider_job_id: upstream.headers.get("x-request-id") ?? null, error: msg });
    return { status: 502, body: { generationId, status: "failed", error: msg } };
  }

  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    const msg = "No image was returned. Please try a different prompt.";
    await finalize({ status: "failed", progress: 100, provider_job_id: upstream.headers.get("x-request-id") ?? null, error: msg });
    return { status: 502, body: { generationId, status: "failed", error: msg } };
  }

  const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
  const storagePath = `${userId}/${filename}`;
  let publicImageUrl: string | null = null;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const chatUp = await supabaseAdmin.storage
      .from("chat-images")
      .upload(storagePath, bytes, { contentType: "image/png", upsert: false });
    if (!chatUp.error) {
      const base = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
      publicImageUrl = `${base}/storage/v1/object/public/chat-images/${storagePath}`;
    } else {
      console.error("[api/image] chat-images upload failed", chatUp.error);
    }
    const { error: upErr } = await supabaseAdmin.storage
      .from("library")
      .upload(storagePath, bytes, { contentType: "image/png", upsert: false });
    if (!upErr) {
      await supabaseAdmin.from("library_items").insert({
        user_id: userId,
        kind: "image",
        title: prompt.slice(0, 80),
        prompt,
        storage_path: storagePath,
        mime_type: "image/png",
        size_bytes: bytes.byteLength,
      });
    } else {
      console.error("[api/image] library upload failed", upErr);
    }
  } catch (e) {
    console.error("[api/image] persist failed", e);
  }

  const finalUrl = publicImageUrl ?? `data:image/png;base64,${b64}`;
  await finalize({ status: "completed", progress: 100, image_url: finalUrl, thumbnail: finalUrl, storage_path: storagePath, provider_job_id: upstream.headers.get("x-request-id") ?? null });
  return {
    status: 200,
    body: { generationId, status: "completed", imageUrl: finalUrl, storagePath },
  };
}

export const Route = createFileRoute("/api/image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (!auth.ok) {
          return Response.json({ error: "Please sign in again." }, { status: 401 });
        }
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id || !UUID_RE.test(id)) {
          return Response.json({ error: "Missing generation id." }, { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await (supabaseAdmin as unknown as SupabaseAny)
          .from("image_generations")
          .select("id,user_id,status,image_url,error,created_at,updated_at")
          .eq("id", id)
          .eq("user_id", auth.userId)
          .maybeSingle();
        if (error) {
          console.error("[api/image] status lookup failed", error);
          return Response.json({ error: "Status lookup failed." }, { status: 500 });
        }
        if (!row) return Response.json({ status: "not_found" }, { status: 404 });

        // Auto-recover: if a generation has been stuck in processing longer
        // than STUCK_MS, mark it failed so the client can render a Retry
        // action instead of a card that never resolves.
        if (row.status === "processing" && row.image_url) {
          await (supabaseAdmin as unknown as SupabaseAny)
            .from("image_generations")
            .update({ status: "completed", progress: 100 })
            .eq("id", id)
            .eq("user_id", auth.userId);
          return Response.json({ status: "completed", imageUrl: row.image_url });
        }

        if (
          row.status === "processing" &&
          Date.now() - new Date((row.updated_at as string) || (row.created_at as string)).getTime() > STUCK_MS
        ) {
          const msg = "Image generation timed out. Please try again.";
          await (supabaseAdmin as unknown as SupabaseAny)
            .from("image_generations")
            .update({ status: "failed", progress: 100, error: msg })
            .eq("id", id)
            .eq("user_id", auth.userId);
          return Response.json({ status: "failed", error: msg });
        }

        return Response.json({
          status: row.status,
          imageUrl: row.image_url ?? undefined,
          error: row.error ?? undefined,
        });
      },

      POST: async ({ request }) => {
        const auth = await requireApiAuth(request);
        if (!auth.ok) {
          return Response.json({ error: "Please sign in again to generate images." }, { status: 401 });
        }

        let body: {
          generationId?: string;
          messageId?: string;
          prompt?: string;
          inputImage?: string;
          parentId?: string;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Please describe the image you want to generate." }, { status: 400 });
        }

        const generationId = body.generationId;
        let prompt = body.prompt;
        if (!generationId || !UUID_RE.test(generationId)) {
          return Response.json({ error: "Missing generation id." }, { status: 400 });
        }
        if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
          return Response.json({ error: "Please describe the image you want to generate." }, { status: 400 });
        }
        if (prompt.length > 8000) {
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

        // Feature kill-switch — guarded so a missing settings table never
        // blocks generation. Quota is consumed inside runGeneration only
        // after the generation id has been reserved for idempotency.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: cfg } = await (supabaseAdmin as unknown as SupabaseAny)
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

        const result = await runGeneration({
          generationId,
          userId: auth.userId,
          messageId: body.messageId,
          prompt,
          inputImageUrl: body.inputImage,
          parentId: body.parentId,
        });
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
