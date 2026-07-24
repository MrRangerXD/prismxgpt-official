// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VitePWA } from "vite-plugin-pwa";

function applyProjectSupabaseEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const localEnv: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!key.startsWith("SUPABASE_") && !key.startsWith("VITE_SUPABASE_")) continue;

    const rawValue = trimmed.slice(separator + 1).trim();
    localEnv[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  if (!localEnv.VITE_SUPABASE_ANON_KEY && localEnv.VITE_SUPABASE_PUBLISHABLE_KEY) {
    localEnv.VITE_SUPABASE_ANON_KEY = localEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
  }

  for (const [key, value] of Object.entries(localEnv)) {
    process.env[key] = value;
  }
}

applyProjectSupabaseEnv();

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        devOptions: { enabled: false },
        includeAssets: [
          "favicon.png",
          "apple-touch-icon.png",
          "icon-192.png",
          "icon-512.png",
          "icon-maskable-192.png",
          "icon-maskable-512.png",
        ],
        manifest: {
          name: "PrismXGPT",
          short_name: "PrismXGPT",
          description:
            "PrismXGPT is a modern AI assistant for chat, writing, code and research.",
          theme_color: "#0f172a",
          background_color: "#0f172a",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          scope: "/",
          lang: "en",
          categories: ["productivity", "utilities", "education"],
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
          shortcuts: [
            {
              name: "New chat",
              short_name: "New chat",
              description: "Start a new PrismXGPT conversation",
              url: "/chat",
              icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,ico,webp,woff,woff2}"],
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/api\//, /^\/__/, /^\/~oauth/],
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: false,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: { cacheName: "html-cache", networkTimeoutSeconds: 3 },
            },
            {
              urlPattern: ({ request }) =>
                ["style", "script", "worker"].includes(request.destination),
              handler: "StaleWhileRevalidate",
              options: { cacheName: "asset-cache" },
            },
            {
              urlPattern: ({ request }) =>
                ["image", "font"].includes(request.destination),
              handler: "CacheFirst",
              options: {
                cacheName: "media-cache",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
  },
});
