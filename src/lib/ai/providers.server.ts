/**
 * Provider abstraction for PrismXGPT.
 *
 * The rest of the app never talks to a model vendor directly. It resolves a
 * canonical model id via the registry and calls into these helpers. Every
 * request is served through the Lovable AI Gateway using LOVABLE_API_KEY.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import {
  MODEL_REGISTRY,
  DEFAULT_CHAT_MODEL_ID,
  type ModelEntry,
  type ProviderName,
} from "./registry";

const GATEWAY_BASE = "https://ai.gateway.lovable.dev/v1";

export function hasProviderKey(_provider: ProviderName = "lovable"): boolean {
  return !!process.env.LOVABLE_API_KEY;
}

function readKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

/** Returns a Vercel-AI-SDK LanguageModel for the given registry entry. */
export function resolveLanguageModel(entry: ModelEntry): LanguageModel {
  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: GATEWAY_BASE,
    headers: {
      "Lovable-API-Key": readKey(),
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
  return provider(entry.upstreamId);
}

/**
 * Resolve a chat model with automatic fallback to the default entry, then to
 * any available non-image registry entry.
 */
export function resolveChatModelWithFallback(preferred?: ModelEntry): {
  entry: ModelEntry;
  model: LanguageModel;
} {
  const candidates: Array<ModelEntry | undefined> = [
    preferred,
    MODEL_REGISTRY.find((m) => m.id === DEFAULT_CHAT_MODEL_ID),
    ...MODEL_REGISTRY.filter((m) => !m.capabilities.images && m.availability === "available"),
  ];
  for (const entry of candidates) {
    if (!entry) continue;
    if (entry.capabilities.images) continue;
    if (!hasProviderKey(entry.provider)) continue;
    return { entry, model: resolveLanguageModel(entry) };
  }
  throw new Error("No AI provider is configured.");
}

// ---------------------------------------------------------------------------
// Image generation (Lovable AI Gateway /images/generations)
// ---------------------------------------------------------------------------

export type ImageGenResult =
  | { ok: true; dataUrl: string; mimeType: string }
  | { ok: false; status: number; message: string };

export async function generateImage(params: {
  entry: ModelEntry;
  prompt: string;
  inputImageUrl?: string;
  signal?: AbortSignal;
}): Promise<ImageGenResult> {
  const { entry, prompt, inputImageUrl, signal } = params;

  let key: string;
  try {
    key = readKey();
  } catch {
    return { ok: false, status: 503, message: "Image generation isn't configured right now." };
  }

  const payload: Record<string, unknown> = {
    model: entry.upstreamId,
    prompt,
  };
  // Image editing: the gateway accepts reference images alongside the prompt.
  if (inputImageUrl) {
    payload.image = [inputImageUrl];
  }

  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}/images/generations`, {
      method: "POST",
      signal,
      headers: {
        "Lovable-API-Key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("[ai/providers] image network error", e);
    return {
      ok: false,
      status: 502,
      message: "Couldn't reach the image service. Please try again in a moment.",
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[ai/providers] image upstream error", res.status, text);
    return { ok: false, status: res.status, message: friendlyImageError(res.status, text) };
  }

  let json: {
    data?: Array<{ b64_json?: string; url?: string; mime_type?: string }>;
  };
  try {
    json = (await res.json()) as typeof json;
  } catch (e) {
    console.error("[ai/providers] image bad json", e);
    return {
      ok: false,
      status: 502,
      message: "The image service returned an unexpected response.",
    };
  }

  const first = json.data?.[0];
  const mimeType = first?.mime_type ?? "image/png";
  let dataUrl: string | undefined;
  if (first?.b64_json) {
    dataUrl = first.b64_json.startsWith("data:")
      ? first.b64_json
      : `data:${mimeType};base64,${first.b64_json}`;
  } else if (first?.url?.startsWith("data:")) {
    dataUrl = first.url;
  }

  if (!dataUrl) {
    console.error("[ai/providers] image response had no payload");
    return {
      ok: false,
      status: 502,
      message: "No image was returned. Please try a different prompt.",
    };
  }
  const mimeMatch = /^data:([^;]+);base64,/.exec(dataUrl);
  return { ok: true, dataUrl, mimeType: mimeMatch?.[1] ?? mimeType };
}

function friendlyImageError(status: number, upstream: string): string {
  if (status === 401 || status === 403)
    return "Image provider rejected the request. Please try again.";
  if (status === 402) return "Image generation credits are exhausted. Please try again later.";
  if (status === 429)
    return "Too many image requests right now — please wait a moment and try again.";
  if (/content.?policy|moderation|safety/i.test(upstream)) {
    return "That prompt was blocked by the safety filter. Try rephrasing without names of real people, brands, or copyrighted characters.";
  }
  if (status >= 500) return "The image service is having trouble. Please try again shortly.";
  return "Image generation failed. Please try again.";
}
