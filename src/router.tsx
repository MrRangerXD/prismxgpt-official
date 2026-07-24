import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload route code + data on link hover/focus for instant navigation.
    defaultPreload: "intent",
    defaultPreloadDelay: 40,
    // Router owns nav caching; keep data fresh via TanStack Query on read.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
