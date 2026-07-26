# Phase 3A — Developer Platform Excellence

Ship a premium, fully-functional Developer Portal on top of the existing Phase 3 foundation. Reuse existing auth, admin, plans, subscription, and DB. No `.env` changes, no new Supabase project, no Lovable Cloud migration. All schema changes are appended idempotently to the existing `bootstrap.sql`.

## Scope check (what already exists → reused, not rebuilt)

- `api_keys`, `api_key_usage`, `api_key_stats` RPC, RLS policies, GRANTs.
- Dual auth (`pk_prism_*` + Supabase JWT) in `src/lib/api-auth.server.ts`.
- Public endpoints: `/api/v1/chat/completions`, `/api/v1/images/generations`, `/api/v1/models`.
- Server fns in `src/lib/api-keys.functions.ts` (list/create/rename/status/delete/stats/usage/series + admin).
- Current developer route `src/routes/developer.tsx` (single-page prototype) — REPLACED with a nested layout.
- Admin route `src/routes/admin.tsx` — extended, not rewritten.
- `src/lib/api-models.ts` static registry — kept as fallback, superseded at runtime by DB catalog.

## Database (append-only edits to `bootstrap.sql`)

New tables (idempotent, RLS on, GRANTs to `authenticated`+`service_role`):

- `public.model_providers(id text pk, name, website, logo_url, status, sort_order, created_at)`
- `public.model_catalog(id text pk, provider_id fk, name, family, context_window int, capabilities jsonb, pricing jsonb, status enum('stable','preview','beta','deprecated','maintenance'), enabled bool, hidden bool, default_model bool, fallback_model_id text, priority int, created_at, updated_at)`
- `public.model_plan_access(model_id fk, plan_id text, allowed bool, PRIMARY KEY(model_id, plan_id))` — plan_id matches `plan_settings.id` (`free|premium|plus|pro`).
- Extend `public.api_keys`: `environment text default 'production'`, `tags text[] default '{}'`, `notes text`, `rotated_from uuid`.
- `public.api_key_ip_history(id bigserial, api_key_id fk, ip inet, first_seen, last_seen, request_count int)`.
- `public.webhooks(id uuid pk, user_id fk, url text, secret_hash text, events text[], status enum('active','disabled'), created_at)`.
- `public.webhook_deliveries(id bigserial, webhook_id fk, event text, status_code int, attempt int, response_ms int, error text, created_at)`.
- RPC `public.user_model_access(_user_id uuid) returns setof text` — resolves allowed model IDs from plan + admin bypass via `private.has_role(_user_id,'admin')`.
- RPC `public.rotate_api_key(_id uuid) returns table(new_id uuid)` — copies name/scopes/tags into a new key, sets old key `status='revoked'`, writes `rotated_from`.
- Seed the model catalog with all providers/models listed in the spec (OpenAI, Anthropic, Google, xAI, DeepSeek, OpenRouter passthrough) via `ON CONFLICT DO NOTHING`.
- Seed default `model_plan_access` rows (free → flash/haiku/mini tier; premium → adds standard; plus → adds pro/opus; pro → all).

## New/updated server functions (`src/lib/`)

- `developer-catalog.functions.ts` — `listProviders`, `listModels` (respects `user_model_access` for non-admins; admins get everything), `adminListAllModels`, `adminUpsertProvider`, `adminUpsertModel`, `adminDeleteModel`, `adminSetPlanAccess`.
- `api-keys.functions.ts` — add `rotateKey`, `updateKeyMeta` (tags/notes/environment/expiry), `listIpHistory`.
- `webhooks.functions.ts` — CRUD, rotate secret, list deliveries, replay.
- `dashboard.functions.ts` — `overview()` returning KPIs (requests today/month, tokens, images, active keys, avg latency, storage estimate, est. cost, top models, top providers, recent activity, 7-day series).
- Update `src/routes/api/chat.ts` + `src/routes/api/image.ts` + `src/routes/api/v1/**` to enforce `user_model_access` before dispatch and record `provider_id`/`cost_usd` on `api_key_usage` (add nullable columns).

## Route architecture

Convert `src/routes/developer.tsx` into an `_authenticated` nested layout:

```text
_authenticated/developer.tsx                (layout: sidebar + header + Outlet)
_authenticated/developer/index.tsx          Dashboard
_authenticated/developer/api-keys.tsx       Key manager (+ create/rotate modals)
_authenticated/developer/playground.tsx     Playground
_authenticated/developer/models.tsx         Model catalog
_authenticated/developer/providers.tsx      Providers browser
_authenticated/developer/usage.tsx          Usage analytics
_authenticated/developer/analytics.tsx      Advanced analytics
_authenticated/developer/logs.tsx           Request logs (filter/search/retry)
_authenticated/developer/billing.tsx        Plan/usage/est-cost, upgrade CTA
_authenticated/developer/rate-limits.tsx    From plan_settings
_authenticated/developer/sdks.tsx           12-language snippet generator
_authenticated/developer/examples.tsx       Runnable examples
_authenticated/developer/documentation.tsx  In-portal reference
_authenticated/developer/webhooks.tsx       Webhook manager
_authenticated/developer/quickstart.tsx     5-step onboarding
_authenticated/developer/settings.tsx       Portal preferences
```

Delete the flat `src/routes/developer.tsx` in the same commit that creates the layout (to avoid duplicate route errors).

## Admin panel additions (extends existing `src/routes/admin.tsx`)

- New "Models" tab: full CRUD over `model_providers`, `model_catalog`, `model_plan_access`. Toggle enabled/hidden/beta/preview/maintenance/deprecated, set default & fallback, priority, capabilities, pricing.
- New "API Keys" tab (admin): search, disable/revoke/delete, per-key usage drill-down.
- New "Webhooks" tab (admin): global view + force-disable.

## UI system

- Design language: existing Emerald Prestige tokens. Add glass surface utility (`.glass`) + subtle grid backdrop for developer shell only. No hardcoded colors — all via semantic tokens in `src/styles.css`.
- Shared: `DevShell`, `DevSidebar` (collapsible, keyboard nav, ⌘K), `DevHeader` (env switcher, docs search, user menu), `KpiCard`, `SparklineChart`, `AreaChart` (recharts — already in deps if present; otherwise add via `bun add recharts`), `EmptyState`, `SkeletonCard`, `LockedModelCard` (with plan-aware upgrade CTA), `CodeBlock` (prism-react-renderer or existing highlighter).
- All lists: skeleton loaders, empty states, error states.
- Playground: streaming SSE via existing `/api/v1/chat/completions`, request/response inspectors, copy/export, vision upload, image gen, JSON mode toggle.

## Plan-aware model gating

- Client: `useAllowedModels()` hook backed by `listModels` server fn; locked models render `LockedModelCard` with a Plus/Pro upgrade CTA that opens the existing `PlusModal`.
- Server: every completion/image endpoint calls `user_model_access` before dispatch. Admins bypass. Failure → 403 with `code: "model_not_allowed"`.

## Performance & polish

- Route-level `React.lazy` for every developer leaf.
- TanStack Query `ensureQueryData` in loaders, `useSuspenseQuery` in components; 30s staleTime for catalogs, 10s for usage.
- Prefetch on sidebar hover.
- Framer-motion micro-animations (already in deps if present; else `bun add framer-motion`).
- All mutations optimistic where safe (rename key, toggle status).

## QA gates before returning

1. `tsgo --noEmit` clean.
2. `bootstrap.sql` re-runs cleanly on existing DB (idempotent) — spot-check by running against local Postgres.
3. Smoke: login → /developer → create key → run Playground call → row appears in Logs and Usage; toggle a model off in Admin → free user sees Lock; admin still sees all models.
4. No new console errors on any route; existing chat/image/projects/library/admin paths unaffected.

## Deliverables

- Modified: `bootstrap.sql`, `src/routes/admin.tsx`, `src/routes/api/chat.ts`, `src/routes/api/image.ts`, `src/routes/api/v1/**/*`, `src/lib/api-keys.functions.ts`, `src/lib/api-auth.server.ts`, `src/components/prism-sidebar.tsx`, `src/styles.css`.
- New: 16 developer route files, `src/lib/developer-catalog.functions.ts`, `src/lib/webhooks.functions.ts`, `src/lib/dashboard.functions.ts`, `src/components/developer/**` (~15 components), plus admin sub-panels under `src/components/admin/models/**`.
- Deleted: flat `src/routes/developer.tsx`.

## Scope confirmation

This is ~50 new files, ~10 modified files, and one appended block in `bootstrap.sql`. Because the surface is huge and touches admin/gating/model dispatch, I want your go-ahead before I start writing files. Two options:

- **A. Ship it all in one pass** (long turn; single review).
- **B. Ship in 3 slices**: (1) DB + model catalog + gating + admin Models tab; (2) developer shell + Dashboard + API Keys + Playground + Models/Providers/Usage/Logs; (3) Webhooks + SDKs + Examples + Documentation + Billing + Rate Limits + Quick Start + Settings.

Which do you want — A or B? (If B, I'll start with slice 1 immediately after you confirm.)
