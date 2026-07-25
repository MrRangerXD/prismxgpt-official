# Image Generation Lifecycle

This document is the single reference for how PrismXGPT routes chat vs.
image requests and how every image generation (including edits) is
tracked end-to-end. It complements the inline comments in the code —
if the two ever disagree, the code wins and this file should be updated.

## Files involved

| Layer            | File                              | Responsibility                                                    |
| ---------------- | --------------------------------- | ----------------------------------------------------------------- |
| Intent classifier| `src/lib/image-intent.ts`         | Decide CHAT vs. IMAGE_GENERATION vs. IMAGE_EDIT (current msg only)|
| Chat surface     | `src/routes/chat.tsx`             | Placeholder markers, recovery poller, message persistence         |
| Image API        | `src/routes/api/image.ts`         | Upsert lifecycle row, call provider, upload to `chat-images`      |
| Chat API         | `src/routes/api/chat.ts`          | Text streaming (never generates images itself)                    |
| Cloud sync       | `src/lib/chat-sync.ts`            | Debounced `user_chat_state` upsert                                |
| Schema           | `bootstrap.sql`                   | `image_generations` table + `chat-images` public bucket           |

## Intent rules

The **current user message** is the only input. History, prior images,
and active state must not influence the decision.

- Strong image verbs (`draw`, `sketch`, `illustrate`, …) → image.
- Weak verbs (`make`, `create`, `generate`, …) + explicit image noun
  (`logo`, `banner`, `icon`, …) → image.
- Image noun with `of|for|with|showing|featuring` phrasing → image.
- Explicit edit patterns AND a previous completed image in the thread →
  edit (reuses the previous image URL as input).
- Everything else → normal chat. No polling, no placeholder, no image
  API call.

## Lifecycle states

Rows in `public.image_generations` are append-only from the client's
point of view:

```
             POST /api/image
                    │
                    ▼
              ┌───────────┐   provider ok    ┌───────────┐
   queued ──▶ │processing │─────────────────▶│ completed │
              └─────┬─────┘                  └───────────┘
                    │  provider error / stuck > 2 min
                    ▼
                ┌────────┐
                │ failed │
                └────────┘
```

- `id` is picked by the client BEFORE the POST so the placeholder marker
  can be persisted first. This is what makes refresh-mid-flight safe.
- `parent_id` links an edit to the generation whose image was used as
  input. The parent row is never mutated.
- `image_url` is a stable public URL in the `chat-images` bucket. We do
  not store base64 in chat history anymore.

## Placeholder markers

While a generation is in flight, its assistant message body is:

```
⟪imggen:pending:<uuid>⟫     ← fresh generation
⟪imgedit:pending:<uuid>⟫    ← edit of a prior image
```

These are the only transient values allowed in persisted chat state.
They are always resolved by one of:

1. The originating POST returning `completed` → replace with
   `![generated image](<url>)`.
2. The recovery poller reading `completed`/`failed` from
   `GET /api/image?id=<uuid>`.
3. The server auto-fail after 2 minutes stuck in `processing`.

## Recovery poller

Located in `src/routes/chat.tsx`. Runs whenever the set of pending
markers changes (fingerprint dependency, NOT the messages array — this
keeps it out of the streaming hot path). For each pending marker:

- Polls with 1.5–4 s backoff, capped ~60 attempts (~3 min).
- Tolerates 404 for the first 8 attempts (~16 s) to absorb the
  POST-vs-GET race on first insert.
- On completion, force-persists the finalized message immediately so a
  subsequent refresh restores the image, not the placeholder.

## What is explicitly forbidden

- No image generation from history or `active_generation` state.
- No mutation of a previous generation row (edits create a new row).
- No storage of base64 image data in `user_chat_state` payloads.
- No polling triggered by normal chat messages.
