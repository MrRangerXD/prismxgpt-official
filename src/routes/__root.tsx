import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

const LazyErrorComponent = lazy(() => Promise.resolve({ default: ErrorComponent }));

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => {
    const gsc = import.meta.env.VITE_GSC_VERIFICATION as string | undefined;
    const bing = import.meta.env.VITE_BING_VERIFICATION as string | undefined;
    const verificationMeta = [
      gsc ? { name: "google-site-verification", content: gsc } : null,
      bing ? { name: "msvalidate.01", content: bing } : null,
    ].filter(Boolean) as Array<{ name: string; content: string }>;
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "theme-color", content: "#0f2a1f" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "apple-mobile-web-app-title", content: "PrismXGPT" },
        { title: "PrismXGPT — Premium ChatGPT-style AI Assistant" },
        {
          name: "description",
          content:
            "PrismXGPT is a modern AI assistant for chat, writing, code and research. Free forever with an optional premium plan.",
        },
        { property: "og:title", content: "PrismXGPT — Premium ChatGPT-style AI Assistant" },
        {
          property: "og:description",
          content:
            "PrismXGPT is a modern AI assistant for chat, writing, code and research. Free forever with an optional premium plan.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "PrismXGPT — Premium ChatGPT-style AI Assistant" },
        {
          name: "twitter:description",
          content:
            "PrismXGPT is a modern AI assistant for chat, writing, code and research. Free forever with an optional premium plan.",
        },
        { property: "og:image", content: "https://prismxgpt.lovable.app/og-image.png" },
        { name: "twitter:image", content: "https://prismxgpt.lovable.app/og-image.png" },
        ...verificationMeta,
      ],

      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "icon", type: "image/png", href: "/favicon.png" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap",
        },
        {
          rel: "stylesheet",
          href: "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css",
          integrity: "sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+",
          crossOrigin: "anonymous",
        },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                name: "PrismXGPT",
                url: "https://prismxgpt.lovable.app",
                logo: "https://prismxgpt.lovable.app/icon-512.png",
              },
              {
                "@type": "WebSite",
                name: "PrismXGPT",
                url: "https://prismxgpt.lovable.app",
                potentialAction: {
                  "@type": "SearchAction",
                  target: "https://prismxgpt.lovable.app/chat?q={search_term_string}",
                  "query-input": "required name=search_term_string",
                },
              },
            ],
          }),
        },
      ],
    };
  },

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: LazyErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    void import("../lib/theme").then((m) => m.initTheme());
    void import("../lib/register-sw").then((m) => m.registerPWA());
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster theme="dark" position="top-center" richColors />
    </QueryClientProvider>
  );
}
