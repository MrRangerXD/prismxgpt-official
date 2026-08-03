/**
 * Route-level fallbacks used as the router defaults.
 *
 * `DefaultRouteError` renders whenever a route loader/component throws and
 * no closer `errorComponent` catches it. It surfaces a friendly message,
 * shows the underlying error text only in dev, and offers two recovery
 * actions:
 *
 *   1. "Try again" — invalidates loader caches and resets the boundary so
 *      the route re-runs its loader. This fixes transient network / auth
 *      failures without a full page reload.
 *   2. "Go home" — hard reset to `/`, used when the error is sticky.
 *
 * `DefaultRouteNotFound` renders for unmatched URLs when no route in the
 * matched tree defines its own `notFoundComponent`.
 */
import { Link, useRouter } from "@tanstack/react-router";
import { errorMessage } from "@/lib/safe";

export function DefaultRouteError({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  const isDev = import.meta.env.DEV;
  const message = errorMessage(error, "This page couldn't load.");
  return (
    <main className="grid min-h-[100dvh] place-items-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">This page didn't load</h1>
        <p className="text-muted-foreground">
          Something went wrong while loading this view. You can try again or head home.
        </p>
        {isDev ? (
          <pre className="max-h-40 overflow-auto rounded bg-muted p-3 text-left text-xs">
            {message}
          </pre>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            onClick={() => {
              // Invalidate first so loaders re-run; reset() alone only clears
              // the boundary UI without re-fetching data.
              void router.invalidate();
              reset();
            }}
          >
            Try again
          </button>
          <Link to="/" className="rounded-md border border-border bg-background px-4 py-2">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}

export function DefaultRouteNotFound() {
  return (
    <main className="grid min-h-[100dvh] place-items-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">
          The page you're looking for doesn't exist or was moved.
        </p>
        <Link
          to="/"
          className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
