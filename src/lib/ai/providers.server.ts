/**
 * Provider abstraction for PrismXGPT (server-only).
 *
 * The rest of the app never talks to a model vendor directly: it resolves a
 * canonical model id via the registry and calls into these helpers.
 *
 * Every canonical model carries an ordered list of upstream candidates. A
 * single custom `fetch` walks that list at request time: the first candidate
 * whose provider key exists AND whose upstream returns a non-error response
 * serves the request. That makes a credit-exhausted or rate-limited provider a
 * transparent failover instead of a user-visible error.
 *
 * Keys are read from `process.env` inside request handlers only — they are
 * never bundled into client code.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import {
  MODEL_REGISTRY,
  DEFAULT_CHAT_MODEL_ID,
  VISION_CHAIN,
  type ModelCandidate,
  type ModelEntry,
  type ProviderName,
} from "./registry";

type ProviderConfig = {
  baseUrl: string;
  envVar: string;
  authHeader: (key: string) => Record<string, string>;
};

const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  venice: {
    baseUrl: "https://api.venice.ai/api/v1",
    envVar: "VENICE_API_KEY",
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    envVar: "GROQ_API_KEY",
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    envVar: "OPENROUTER_API_KEY",
    authHeader: (key) => ({
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://prismxgpt.lovable.app",
      "X-Title": "PrismXGPT",
    }),
  },
  lovable: {
    baseUrl: "https://ai.gateway.lovable.dev/v1",
    envVar: "LOVABLE_API_KEY",
    authHeader: (key) => ({ "Lovable-API-Key": key }),
  },
};

function keyFor(provider: ProviderName): string | undefined {
  const name = PROVIDERS[provider].envVar;
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function hasProviderKey(provider?: ProviderName): boolean {
  if (provider) return !!keyFor(provider);
  return (Object.keys(PROVIDERS) as ProviderName[]).some((p) => !!keyFor(p));
}

/** Candidates whose provider key is actually configured. */
function usable(candidates: ModelCandidate[]): ModelCandidate[] {
  return candidates.filter((c) => !!keyFor(c.provider));
}

/** True when the payload contains image parts (needs a vision-capable model). */
function payloadHasImage(body: unknown): boolean {
  try {
    const messages = (body as { messages?: unknown })?.messages;
    if (!Array.isArray(messages)) return false;
    return messages.some((m) => {
      const content = (m as { content?: unknown }).content;
      return (
        Array.isArray(content) &&
        content.some((p) => (p as { type?: string })?.type === "image_url")
      );
    });
  } catch {
    return false;
  }
}

/**
 * Builds a fetch that rewrites the outgoing request for each candidate in turn
 * and returns the first successful upstream response.
 */
function failoverFetch(candidates: ModelCandidate[]): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawBody = typeof init?.body === "string" ? init.body : undefined;
    let parsed: Record<string, unknown> | undefined;
    if (rawBody) {
      try {
        parsed = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        parsed = undefined;
      }
    }

    // Route image-bearing turns to a vision chain when the selected chain's
    // primary is text-only.
    let chain = usable(candidates);
    if (parsed && payloadHasImage(parsed)) {
      const vision = usable(VISION_CHAIN);
      if (vision.length > 0) chain = vision;
    }
    if (chain.length === 0) {
      return new Response(
        JSON.stringify({ error: { message: "No AI provider key is configured." } }),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    }

    // Preserve the original path (…/chat/completions) across base URLs.
    const originalUrl = new URL(typeof input === "string" ? input : input.toString());
    const suffix = originalUrl.pathname.replace(/^.*\/v1/, "");

    let lastResponse: Response | undefined;
    let lastError: unknown;

    for (const candidate of chain) {
      const cfg = PROVIDERS[candidate.provider];
      const key = keyFor(candidate.provider)!;
      const headers = new Headers(init?.headers);
      headers.delete("authorization");
      headers.delete("Lovable-API-Key");
      for (const [k, v] of Object.entries(cfg.authHeader(key))) headers.set(k, v);
      headers.set("content-type", "application/json");

      let body: string | undefined;
      if (parsed) {
        const next: Record<string, unknown> = { ...parsed, model: candidate.model };
        // Venice ships its own assistant preamble by default, which is what
        // adds "As an AI…" back in. Our own system prompt is enough.
        if (candidate.provider === "venice") {
          next.venice_parameters = { include_venice_system_prompt: false };
        }
        body = JSON.stringify(next);
      } else {
        body = rawBody;
      }

      try {
        const res = await fetch(`${cfg.baseUrl}${suffix}`, {
          ...init,
          headers,
          body,
        });
        if (res.ok) return res;
        // 4xx/5xx from this candidate: log and try the next one.
        const text = await res.clone().text().catch(() => "");
        console.error(
          `[ai/providers] ${candidate.provider}:${candidate.model} -> ${res.status} ${text.slice(0, 200)}`,
        );
        lastResponse = res;
      } catch (e) {
        console.error(`[ai/providers] ${candidate.provider}:${candidate.model} network error`, e);
        lastError = e;
      }
    }

    if (lastResponse) return lastResponse;
    throw lastError instanceof Error ? lastError : new Error("All AI providers failed.");
  };
}

/** Returns a Vercel-AI-SDK LanguageModel for the given registry entry. */
export function resolveLanguageModel(entry: ModelEntry): LanguageModel {
  const chain = usable(entry.candidates);
  if (chain.length === 0) throw new Error("No AI provider is configured.");
  const primary = chain[0];
  const provider = createOpenAICompatible({
    name: primary.provider,
    baseURL: PROVIDERS[primary.provider].baseUrl,
    // The key is injected per-candidate inside failoverFetch; this placeholder
    // only satisfies the SDK's header builder and is overwritten there.
    apiKey: "managed-by-failover-fetch",
    fetch: failoverFetch(entry.candidates),
  });
  return provider(primary.model);
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
    if (usable(entry.candidates).length === 0) continue;
    return { entry, model: resolveLanguageModel(entry) };
  }
  throw new Error("No AI provider is configured.");
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------

export type ImageGenResult =
  | { ok: true; dataUrl: string; mimeType: string }
  | { ok: false; status: number; message: string };

type ImageAttempt = { status: number; body: string } | { networkError: true };

async function callImageCandidate(
  candidate: ModelCandidate,
  key: string,
  prompt: string,
  inputImageUrl: string | undefined,
  signal: AbortSignal | undefined,
): Promise<{ ok: true; json: unknown } | { ok: false; attempt: ImageAttempt }> {
  const cfg = PROVIDERS[candidate.provider];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...cfg.authHeader(key),
  };

  // Venice: /image/generate (base64 array out).
  // Lovable gateway: dedicated images endpoint.
  // OpenRouter: image output rides on /chat/completions with `modalities`.
  const url =
    candidate.provider === "venice"
      ? `${cfg.baseUrl}/image/generate`
      : candidate.provider === "lovable"
        ? `${cfg.baseUrl}/images/generations`
        : `${cfg.baseUrl}/chat/completions`;

  let payload: Record<string, unknown>;
  if (candidate.provider === "venice") {
    payload = {
      model: candidate.model,
      prompt,
      width: 1024,
      height: 1024,
      steps: 30,
      hide_watermark: true,
      safe_mode: false, // <- asli uncensored switch
      ...(inputImageUrl
        ? { image: inputImageUrl.replace(/^data:[^;]+;base64,/, "") }
        : {}),
    };
  } else if (candidate.provider === "lovable") {
    payload = {
      model: candidate.model,
      prompt,
      ...(inputImageUrl ? { image: [inputImageUrl] } : {}),
    };
  } else {
    payload = {
      model: candidate.model,
      modalities: ["image", "text"],
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
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, attempt: { status: res.status, body } };
    }
    return { ok: true, json: await res.json() };
  } catch (e) {
    console.error(`[ai/providers] image ${candidate.provider} network error`, e);
    return { ok: false, attempt: { networkError: true } };
  }
}

function extractImage(json: unknown): { dataUrl: string; mimeType: string } | undefined {
  const j = json as {
    data?: Array<{ b64_json?: string; url?: string; mime_type?: string }>;
    images?: string[];
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
  };

  const first = j?.data?.[0];
  const mimeType = first?.mime_type ?? "image/png";
  let dataUrl: string | undefined;

  if (first?.b64_json) {
    dataUrl = first.b64_json.startsWith("data:")
      ? first.b64_json
      : `data:${mimeType};base64,${first.b64_json}`;
  } else if (first?.url?.startsWith("data:")) {
    dataUrl = first.url;
  } else if (typeof j?.images?.[0] === "string") {
    // Venice returns a bare base64 array.
    dataUrl = j.images[0].startsWith("data:")
      ? j.images[0]
      : `data:image/png;base64,${j.images[0]}`;
  } else {
    // OpenRouter chat-completions image output.
    const url = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (url?.startsWith("data:")) dataUrl = url;
  }

  if (!dataUrl) return undefined;
  const mimeMatch = /^data:([^;]+);base64,/.exec(dataUrl);
  return { dataUrl, mimeType: mimeMatch?.[1] ?? mimeType };
}

export async function generateImage(params: {
  entry: ModelEntry;
  prompt: string;
  inputImageUrl?: string;
  signal?: AbortSignal;
}): Promise<ImageGenResult> {
  const { entry, prompt, inputImageUrl, signal } = params;
  const chain = usable(entry.candidates);
  if (chain.length === 0) {
    return { ok: false, status: 503, message: "Image generation isn't configured right now." };
  }

  let lastStatus = 502;
  let lastBody = "";

  for (const candidate of chain) {
    const key = keyFor(candidate.provider)!;
    const result = await callImageCandidate(candidate, key, prompt, inputImageUrl, signal);
    if (!result.ok) {
      if ("networkError" in result.attempt) {
        lastStatus = 502;
        lastBody = "network error";
      } else {
        lastStatus = result.attempt.status;
        lastBody = result.attempt.body;
        console.error(
          `[ai/providers] image ${candidate.provider}:${candidate.model} -> ${lastStatus} ${lastBody.slice(0, 200)}`,
        );
      }
      continue;
    }
    const image = extractImage(result.json);
    if (image) return { ok: true, ...image };
    console.error(`[ai/providers] image ${candidate.provider}:${candidate.model} returned no image`);
    lastStatus = 502;
    lastBody = "empty image response";
  }

  return { ok: false, status: lastStatus, message: friendlyImageError(lastStatus, lastBody) };
}

function friendlyImageError(status: number, upstream: string): string {
  if (/content.?policy|moderation|safety/i.test(upstream)) {
    return "The model's filter blocked that prompt. Drop real names and brand words and it'll go through.";
  }
  if (status === 401 || status === 403)
    return "Image provider rejected the request. Please try again.";
  if (status === 402)
    return "Image generation is temporarily unavailable — the image provider is out of credits.";
  if (status === 429)
    return "Too many image requests right now — please wait a moment and try again.";
  if (status >= 500) return "The image service is having trouble. Please try again shortly.";
  return "Image generation failed. Please try again.";
}
