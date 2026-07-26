# Phase 3 — Developer Platform & API Keys

Build a production Developer Portal on top of the existing Supabase project, without touching `.env`, auth, chat, images, projects, library, plans, or admin business logic. Only `bootstrap.sql` is extended (idempotent).

## Audit summary (what already exists, will be reused)

- Supabase auth + `profiles`, `user_roles` (`app_role` enum incl. `admin`), `private.has_role`.
- Plans in `plan_settings` (per-tier config) + `image_usage` + `consume_image_quota` RPC.
- Chat: `conversations`, `messages`, `user_chat_state`; Projects, Library, Sharing tables.
- API surface: `src/routes/api/chat.ts` (streaming), `src/routes/api/image.ts` (gen+edit lifecycle) — both use `requireApiAuth` (Supabase user JWT).
- Admin at `/admin` (single route file).

Reuse everything. No duplicated tables/policies/triggers.

## Database additions (appended to `bootstrap.sql`, idempotent)

```text
enum  public.api_key_status ('active','disabled','revoked')

table public.api_keys
  id uuid pk, user_id uuid fk auth.users, name text,
  prefix text (e.g. 'pk_prism_XXXX'), key_hash text (sha-256 hex, unique),
  status api_key_status default 'active',
  scopes text[] default '{chat,image,embeddings}',
  last_used_at timestamptz, last_used_ip inet,
  expires_at timestamptz, created_at, updated_at
  UNIQUE (user_id, name)

table public.api_key_usage        -- append-only, per request
  id bigserial pk, api_key_id uuid fk, user_id uuid,
  endpoint text, model text, status_code int,
  input_tokens int, output_tokens int,
  images int default 0, latency_ms int,
  created_at timestamptz default now()
  INDEX (api_key_id, created_at desc), (user_id, created_at desc)

view  public.api_key_usage_daily  -- rollup for graphs (24h/30d)
rpc   public.api_key_stats(_key_id uuid) → today/month/total/tokens/images/avg_latency
rpc   public.rotate_api_key_last_used(_key_id uuid, _ip inet)   -- SECURITY DEFINER
```

RLS: owner-only SELECT/UPDATE/DELETE on `api_keys`; INSERT with `auth.uid()=user_id`. `api_key_usage` owner SELECT; INSERTs happen via service-role from server routes. Admin SELECT via `private.has_role(auth.uid(),'admin')`. GRANTs to `authenticated` + `service_role` per project rules.

## Server functions & routes

- `src/lib/api-keys.functions.ts` — `createServerFn` (auth): `listKeys`, `createKey` (returns plaintext once), `renameKey`, `setKeyStatus`, `deleteKey`, `keyStats`, `usageSeries`.
- `src/lib/api-keys.server.ts` — hash helper (`sha256`), prefix generator (`pk_prism_` + 40 base62), verify.
- Update `src/lib/api-auth.server.ts` → accept EITHER Supabase user JWT (existing) OR `pk_prism_*` API key. On API-key auth: lookup by hash, check `status='active'` and not expired, return `userId`, `apiKeyId`. **Preserves current auth path.**
- `src/routes/api/chat.ts` & `src/routes/api/image.ts` — after existing logic, log a row into `api_key_usage` (only when the caller used an API key) via service-role admin client. No behavior change for the browser app.
- New public API surface (all under `/api/v1/*`, use dual auth, log usage):
  - `POST /api/v1/chat/completions` — OpenAI-compatible chat proxy over Lovable AI Gateway (streaming + non-stream).
  - `POST /api/v1/images/generations` and `POST /api/v1/images/edits` — wraps existing image pipeline.
  - `GET  /api/v1/models` — from `plan_settings`/static registry.
- Admin server fns: `admin_listAllKeys`, `admin_setKeyStatus`, `admin_deleteKey`, `admin_keyUsage` (guarded by `has_role admin`).

## Developer Portal UI (`/developer/*`, authenticated)

New layout `src/routes/_authenticated/developer.tsx` with left nav; leaves:

```
/developer                → Dashboard  (KPIs, 7-day chart, top keys, recent errors)
/developer/api-keys       → CRUD, create-modal reveals key once (copy + download)
/developer/usage          → Filters (key/model/endpoint), stacked chart, table
/developer/playground     → Model picker, prompt, stream toggle, request/response JSON
/developer/models         → Table from registry (context, vision, streaming)
/developer/sdks           → JS/TS, Python, Node, cURL tabs (copy)
/developer/examples       → Chat, streaming, image gen, image edit, embeddings
/developer/rate-limits    → Reads plan_settings for current tier
/developer/logs           → Last 500 requests for user's keys
/developer/quickstart     → 5-step onboarding
```

Reuses shadcn primitives + existing theme. Lazy-loaded via `React.lazy`. Nav entry added to `prism-sidebar.tsx` under "Developer".

## Admin extension (`/admin`)

Add "API Keys" tab: search by user/key, disable/revoke/delete, view per-key usage; wired to admin server fns.

## Security

- Plaintext key returned only from `createKey` response; DB stores `key_hash` (sha-256) + last 4 for display.
- Constant-time compare on lookup; `last_used_at`/IP updated via SECURITY DEFINER RPC.
- Rate limits enforced from `plan_settings` (per-minute + per-day) using `api_key_usage` counts; 429 with `Retry-After`.
- CORS on `/api/v1/*` (`Access-Control-Allow-Origin: *`, key in `Authorization: Bearer`).
- No secrets in client bundle; admin client only inside handlers.

## QA gates before returning

1. `tsgo --noEmit` clean; `eslint` clean on new/changed files.
2. Playwright: create key → copy → call `/api/v1/chat/completions` with it → row appears in `/developer/usage`; disable key → 401.
3. Regression sweep: sign-in, existing chat send, image generate+edit+refresh, projects, library, plans page, admin — all unaffected.
4. `bootstrap.sql` re-run on a fresh DB and on the current DB is a no-op / additive-only.

## Deliverables

- Modified: `src/lib/api-auth.server.ts`, `src/routes/api/chat.ts`, `src/routes/api/image.ts`, `src/components/prism-sidebar.tsx`, `src/routes/admin.tsx`, `bootstrap.sql`.
- New: `src/lib/api-keys.{server,functions}.ts`, `src/routes/_authenticated/developer.tsx` (+ 10 child routes), `src/routes/api/v1/*` (chat, images, models), `src/components/developer/*` (KeyTable, CreateKeyModal, UsageChart, Playground, CodeBlock, SDKTabs).
- No changes to `.env`, auth, or existing product code paths beyond the additive usage log.

## Scope confirmation

This is ~30–40 new files and one `bootstrap.sql` migration block. I will implement it end-to-end in the next turn if you approve. If you want it split (e.g. DB + API keys CRUD first, portal UI next, public `/api/v1` last), say which slice to ship first.
