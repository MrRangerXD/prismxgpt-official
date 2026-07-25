import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { DefaultRouteError, DefaultRouteNotFound } from "./components/route-error";

/**
 * Router factory.
 *
 * Configured with global error and not-found fallbacks so every route is
 * covered even when it doesn't declare its own `errorComponent` /
 * `notFoundComponent`. Individual routes can still override these to
 * provide tailored recovery UI.
 */
export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Do NOT retry client-triggered errors indefinitely — one retry
        // absorbs transient blips, more just delays surfacing real
        // failures to the UI.
        retry: 1,
        // Refetch on window focus is noisy for a chat app and can
        // interrupt streaming. Prefer explicit invalidation.
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload route code + data on link hover/focus for instant navigation.
    defaultPreload: "intent",
    defaultPreloadDelay: 40,
    // Router owns nav caching; keep data fresh via TanStack Query on read.
    defaultPreloadStaleTime: 0,
    // MANDATORY per tanstack-errors-notfound: any route that throws without
    // its own `errorComponent` falls back to this, and unmatched URLs land
    // on the not-found component below instead of a blank screen.
    defaultErrorComponent: DefaultRouteError,
    defaultNotFoundComponent: DefaultRouteNotFound,
  });

  return router;
};

