# SEO Plan for PrismX GPT

Site: https://prismgpt.lovable.app — an AI chat + image generation product. Currently missing sitemap, robots.txt, per-route metadata, and structured data. Below is a full creation-and-optimization plan scoped tightly to what this project actually needs.

## 1. Crawlability foundations (create)

**`public/robots.txt`** — allow all, disallow private surfaces, point to sitemap.
```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /chat
Disallow: /projects/
Disallow: /share/
Disallow: /api/

Sitemap: https://prismgpt.lovable.app/sitemap.xml
```

**`src/routes/sitemap[.]xml.ts`** — dynamic server route listing only public, indexable pages: `/`, `/login`, `/signup`, `/help`, `/privacy`, `/terms`. Exclude authenticated (`/chat`, `/admin`, `/projects/*`) and per-user share links.

## 2. Per-route head metadata (create)

Currently only `__root.tsx` defines metadata → every page shares one title/description. Add a dedicated `head()` to each public route with unique `title` (<60 chars, keyword-led), `description` (<160 chars), `og:title`, `og:description`, `og:url`, `og:type`, `twitter:card`, and a leaf-only `<link rel="canonical">`.

| Route | Title | Focus keyword |
|---|---|---|
| `/` | PrismX GPT — AI Chat & Image Generation in One Workspace | ai chat and image generation |
| `/login` | Sign in — PrismX GPT | prismx gpt login |
| `/signup` | Create your PrismX GPT account | prismx gpt signup |
| `/help` | Help & Support — PrismX GPT | prismx gpt help |
| `/privacy` | Privacy Policy — PrismX GPT | — (noindex optional) |
| `/terms` | Terms of Service — PrismX GPT | — (noindex optional) |

Authenticated routes (`/chat`, `/chat/$chatId`, `/admin`, `/projects/*`, `/share/*`) get `<meta name="robots" content="noindex,nofollow">` — they contain private user data and shouldn't appear in search.

## 3. Structured data (JSON-LD)

- **`__root.tsx`** — `Organization` + `WebSite` (with `SearchAction` pointing at `/chat`).
- **`/`** — `SoftwareApplication` (applicationCategory: "AI Assistant", offers, aggregateRating placeholder removed until real data exists).
- **`/help`** — `FAQPage` schema built from the on-page Q&A.

## 4. On-page optimization for `/` (landing)

- Single `<h1>` with primary keyword ("AI chat and image generation").
- Semantic sections: `<header>`, `<main>`, `<section>` per feature block, `<footer>`. Already partially in place from the recent UI pass.
- Descriptive `alt` on hero/logo (`alt="PrismX GPT logo"` not empty).
- Internal links from landing → `/help`, `/signup`, `/login` with descriptive anchor text.
- Preload the hero font (Sora) via `<link rel="preload" as="font">` in root head.

## 5. Social share previews

- Confirm `og:image` and `twitter:image` on `__root.tsx` point to the absolute URL `https://prismgpt.lovable.app/og-image.png` (currently likely a static path — must be absolute for crawlers).
- Add `og:image:width` / `og:image:height` (1200×630 recommended — regenerate `og-image.png` at that size if not already).
- `twitter:card` = `summary_large_image`.

## 6. Technical performance (SEO signals)

Already good from the recent perf pass (lazy modals, query throttling). Additional SEO-specific:
- Ensure landing `/` is fully SSR-rendered (TanStack Start default) so crawlers see content without JS.
- Add `<link rel="preconnect">` for `fonts.googleapis.com` and `fonts.gstatic.com` (fonts are the main render-blocker).
- Compress `og-image.png`, `icon-512.png` if >200KB.

## 7. Post-ship verification

- Run the built-in SEO scanner after deploy.
- Submit `https://prismgpt.lovable.app/sitemap.xml` in Google Search Console.
- Validate structured data at `search.google.com/test/rich-results`.
- Debug share previews via Facebook Sharing Debugger + Twitter Card Validator (they cache — force refresh after changes).

## Technical notes

- `head()` metadata goes in TanStack `createFileRoute({ head: () => ({ meta, links, scripts }) })`. Title is a `meta` entry, not top-level.
- Canonical `<link>` lives on leaf routes only (root-level canonical would duplicate on every page — TanStack `links` don't dedupe).
- Sitemap uses `src/routes/sitemap[.]xml.ts` server route pattern (not `public/sitemap.xml`) so it stays in sync with routes.
- Do NOT add `<lastmod>` to sitemap entries — no per-page authoritative timestamps exist; a build-time date is misleading.

## Out of scope (per your prior rules)

- No changes to `bootstrap.sql`, pricing, admin, projects, library, or settings logic.
- No content rewrites of legal pages.
- No new dependencies.
