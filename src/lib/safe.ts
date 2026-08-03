/**
 * Small error-safety helpers used across the app.
 *
 * The goal is consistency: instead of scattering ad-hoc `try/catch` no-op
 * blocks, callers can express intent — "parse this if you can, otherwise
 * fall back" — in one line and share the same behavior everywhere.
 *
 * These helpers NEVER throw. They swallow the underlying error and, where
 * useful, log it under a caller-supplied tag so real failures still show up
 * in the console during development without breaking the user flow.
 */

/**
 * Normalize any thrown value to a stable, user-safe message.
 *
 * `throw` accepts anything in JS (strings, plain objects, `undefined`), so
 * touching `.message` blindly is unsafe. Use this at UI boundaries where
 * we render a fallback string.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

/**
 * `JSON.parse` that returns `undefined` on any failure (including non-string
 * input). Use this for untrusted payloads — network responses, storage
 * blobs, URL params — where the caller already has a sane default.
 */
export function safeJsonParse<T = unknown>(raw: unknown): T | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * Run a synchronous function and swallow any thrown error.
 *
 * Useful around `localStorage` / `sessionStorage` calls, which throw in
 * private-browsing or when quota is exceeded, and around browser APIs that
 * are missing during SSR.
 */
export function safeRun<T>(fn: () => T, fallback?: T, tag?: string): T | undefined {
  try {
    return fn();
  } catch (e) {
    if (tag) console.warn(`[${tag}]`, e);
    return fallback;
  }
}

/**
 * Await a promise and never reject. Returns `undefined` on failure so
 * callers can `?? fallback` without wrapping every call in try/catch.
 *
 * Prefer this only for genuinely best-effort background work
 * (analytics, cache warms). For user-triggered actions, catch the
 * error explicitly and surface a message via `toast.error`.
 */
export async function safeAwait<T>(promise: Promise<T>, tag?: string): Promise<T | undefined> {
  try {
    return await promise;
  } catch (e) {
    if (tag) console.warn(`[${tag}]`, e);
    return undefined;
  }
}

/**
 * Parse `res.json()` without ever throwing. Returns `undefined` when the
 * response body isn't valid JSON — common with 5xx HTML error pages from
 * proxies/CDNs.
 */
export async function safeResponseJson<T = unknown>(res: Response): Promise<T | undefined> {
  try {
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}
