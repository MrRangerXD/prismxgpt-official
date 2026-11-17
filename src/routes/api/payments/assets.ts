import { createFileRoute } from "@tanstack/react-router";
import { ASSETS } from "@/lib/payments/assets";

export const Route = createFileRoute("/api/payments/assets")({
  server: {
    handlers: {
      GET: async () => {
        const assets = Object.entries(ASSETS)
          .filter(([key, cfg]) => (key === "upi" ? Boolean(process.env.UPI_VPA) : Boolean(cfg.address)))
          .map(([key, cfg]) => ({
            id: key,
            label: cfg.label,
            symbol: cfg.symbol,
            network: cfg.network,
            confirmations: cfg.confirmations,
          }));
        return Response.json({ assets });
      },
    },
  },
});
