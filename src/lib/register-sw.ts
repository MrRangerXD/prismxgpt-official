// Guarded PWA service worker registration. Registers only in production
// browsers on the real deployment; unregisters any stale SW in dev/preview.
// Exposes install + update prompts via sonner toasts (no new UI surface).
import { toast } from "sonner";

function shouldRefuse(): boolean {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return true;
  const host = window.location.hostname;
  const insideIframe = window.self !== window.top;
  const swOff = new URLSearchParams(window.location.search).get("sw") === "off";
  const isPreviewHost =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev");
  return !import.meta.env.PROD || insideIframe || isPreviewHost || swOff;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function setupInstallPrompt() {
  if (typeof window === "undefined") return;
  if (isStandalone()) return;
  if (sessionStorage.getItem("pwa-install-dismissed")) return;

  type BIPEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  let deferred: BIPEvent | null = null;

  const onBeforeInstall = (e: Event) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    // Delay slightly so it doesn't fight first paint
    setTimeout(() => {
      if (!deferred || isStandalone()) return;
      toast("Install PrismXGPT", {
        description: "Add PrismXGPT to your home screen for a faster, app-like experience.",
        duration: 12000,
        action: {
          label: "Install",
          onClick: async () => {
            if (!deferred) return;
            try {
              await deferred.prompt();
              await deferred.userChoice;
            } catch {
              /* noop */
            } finally {
              deferred = null;
            }
          },
        },
        onDismiss: () => sessionStorage.setItem("pwa-install-dismissed", "1"),
      });
    }, 2500);
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", () => {
    deferred = null;
    toast.success("PrismXGPT installed");
  });
}

export function registerPWA() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  if (shouldRefuse()) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        regs.forEach((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          if (url.endsWith("/sw.js")) r.unregister();
        });
      })
      .catch(() => {});
    return;
  }

  setupInstallPrompt();

  import("workbox-window")
    .then(({ Workbox }) => {
      const wb = new Workbox("/sw.js");
      let reloading = false;

      wb.addEventListener("waiting", () => {
        toast("Update available", {
          description: "A new version of PrismXGPT is ready.",
          duration: Infinity,
          action: {
            label: "Reload",
            onClick: () => wb.messageSkipWaiting(),
          },
        });
      });

      wb.addEventListener("controlling", () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });

      wb.register().catch(() => {});
    })
    .catch(() => {});
}
