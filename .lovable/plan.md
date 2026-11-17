# Crypto + UPI Checkout

## Goal
Add the uploaded payment flow to PrismXGPT without changing chat, artifact, coding, provider, or pricing-page design. Use the existing Supabase connection and existing plan records; do not edit `.env`.

## Build
- Add an idempotent migration for payment orders, unique transaction references, owner-only reads, and the required Data API grants. Writes stay server-side with the existing service-role client.
- Add server-only asset configuration and pricing helpers. Use configured watch-only receive addresses, existing plan pricing, live rates, frozen atomic amounts, and a 30-minute order expiry. Since current plan prices are INR, preserve price parity when pricing crypto by converting INR to USD before applying the live coin rate. Missing wallet configuration returns a clear unavailable error.
- Add authenticated create, status, and payment-submission endpoints with Zod validation, a three-open-order limit, owner checks, and payment-state transitions. On-chain checks use the configured Solana/Tron endpoints and a public Litecoin explorer; confirmed crypto payments activate the matching existing plan role.
- Add the six-asset payment modal to the existing upgrade choice. It shows exact amounts, QR/copy details, a countdown, network warnings, transaction-reference submission, and status polling. Refresh the existing profile after payment is confirmed.
- Add the minimum administrator review surface for UPI UTRs: list pending reports, approve or reject, and activate the corresponding existing plan role only after approval. Do not grant plans from a user-submitted “paid” click alone.
- Add the requested keys to `.env.example` only. Add focused tests for the order cap, frozen amount calculation, expiry, and plan-role mapping.

## Technical details
- New API routes live under `src/routes/api/payments/`; authenticate with the existing `requireApiAuth` flow and validate every request body/query.
- All payment-table writes and role activation use the existing server-only `supabaseAdmin`, loaded inside handlers. Admin review separately verifies the caller's own admin role.
- Asset environment values are read at request time, not module initialization. No wallet private keys are stored or used.
- The uploaded brief does not include automatic UPI verification, so UPI stays pending until an administrator reviews its UTR. Crypto confirmations are checked against the relevant network before plan activation.
