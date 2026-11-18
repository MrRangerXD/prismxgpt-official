import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Check,
  Sparkles,
  ExternalLink,
  Copy,
  QrCode,
  Smartphone,
  Bitcoin,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/use-profile";
import { usePlans, type PaymentMethod, type PlanRow } from "@/hooks/use-plans";

export function PlusModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isPremium, isPro, isAdmin, planExpiresAt, refresh } = useProfile();
  const { plans, loading: loadingPlans } = usePlans();
  const [activePlan, setActivePlan] = useState<PlanRow | null>(null);

  if (!open) return null;

  const currentId = isAdmin || isPro ? "pro" : isPremium ? "plus" : "free";
  const expiresLabel = planExpiresAt
    ? ` · expires ${new Date(planExpiresAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : "";

  const rank = (id: string) => (id === "pro" ? 3 : id === "plus" ? 2 : 1);
  const currentRank = rank(currentId);

  const highlightId = plans.find((p) => p.id === "plus") ? "plus" : plans[1]?.id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative my-auto w-full max-w-5xl rounded-3xl border border-border bg-card shadow-elevated">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-card/80 text-muted-foreground backdrop-blur transition hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="px-6 pt-10 pb-8 sm:px-8">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            Try Plus free for 1 month
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Unlock advanced models, faster responses, and more.
          </p>

          {loadingPlans ? (
            <div className="mt-10 text-center text-sm text-muted-foreground">Loading plans…</div>
          ) : plans.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-dashed border-border bg-background/40 p-10 text-center">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-brand" />
              <div className="text-base font-semibold">No offers available right now</div>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                We don't have any active plans or promotions at the moment. Please check back later
                — new offers will appear here as soon as they're published.
              </p>
              <button
                onClick={onClose}
                className="mt-6 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {plans.map((p) => {
                const isCurrent = p.id === currentId;
                const highlight = p.id === highlightId && currentId !== "pro";
                const cta = isCurrent
                  ? `Your current plan${expiresLabel}`
                  : rank(p.id) < currentRank
                    ? "Included"
                    : p.cta_label || "Upgrade";
                return (
                  <div
                    key={p.id}
                    className={`relative rounded-2xl border p-6 ${
                      highlight
                        ? "border-brand bg-brand/5 shadow-glow"
                        : "border-border bg-background/40"
                    }`}
                  >
                    {highlight && (
                      <div className="absolute -top-3 left-6 flex items-center gap-1 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-foreground">
                        <Sparkles className="h-3 w-3" /> Limited time
                      </div>
                    )}
                    <div className="text-xl font-semibold">{p.name}</div>
                    <div className="mt-4 flex items-baseline gap-2">
                      {p.strike_price && (
                        <span className="text-lg text-muted-foreground line-through">
                          {p.strike_price}
                        </span>
                      )}
                      <span className="text-3xl font-bold">{p.price}</span>
                      {p.note && <span className="text-xs text-muted-foreground">{p.note}</span>}
                    </div>
                    <button
                      disabled={isCurrent}
                      onClick={() => {
                        if (isCurrent) return;
                        if (p.payment_methods.length === 0) {
                          toast.info(
                            "Payment methods not configured yet. Ask an admin to add one.",
                          );
                          return;
                        }
                        setActivePlan(p);
                      }}
                      className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                        isCurrent
                          ? "cursor-default border border-border bg-background/60 text-muted-foreground"
                          : highlight
                            ? "text-brand-foreground hover:opacity-90"
                            : "bg-foreground text-background hover:opacity-90"
                      }`}
                      style={
                        highlight && !isCurrent
                          ? { background: "var(--gradient-brand)" }
                          : undefined
                      }
                    >
                      {cta}
                    </button>
                    <ul className="mt-5 space-y-2 text-sm">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-foreground/90">
                          <Check className="h-4 w-4 text-brand" /> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {activePlan && (
        <PaymentPicker
          plan={activePlan}
          onClose={() => setActivePlan(null)}
          onPaid={() => {
            void refresh();
            setActivePlan(null);
            onClose();
          }}
        />
      )}
    </div>
  );
}

/** Maps an admin-authored payment method to a checkout asset id. */
function assetFor(m: PaymentMethod): string | null {
  if (m.type === "upi") return "upi";
  if (m.type !== "crypto") return null;
  const hay = `${m.label} ${m.value}`.toLowerCase();
  if (hay.includes("usdt")) {
    return hay.includes("spl") || hay.includes("sol") ? "usdt_spl" : "usdt_trc20";
  }
  if (hay.includes("ltc") || hay.includes("litecoin")) return "ltc";
  if (hay.includes("trx") || hay.includes("tron")) return "trx";
  if (hay.includes("sol")) return "sol";
  return null;
}

const human = (atomic: string, decimals: number) =>
  (Number(atomic) / 10 ** decimals).toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");

type Order = {
  orderId: string;
  asset: string;
  address: string | null;
  contract: string | null;
  expectedAtomic: string;
  decimals: number;
  symbol: string;
  network: string;
  confirmations: number;
  expiresAt: string;
  status?: string;
  qrImage: string | null;
  qrPayload: string;
};

function Countdown({ until }: { until: string }) {
  const [left, setLeft] = useState(() => Date.parse(until) - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(Date.parse(until) - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (left <= 0) return <span className="text-destructive">expired</span>;
  return (
    <span className="font-mono tabular-nums">
      {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}
    </span>
  );
}

function PaymentPicker({
  plan,
  onClose,
  onPaid,
}: {
  plan: PlanRow;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("pending");
  const [confirmations, setConfirmations] = useState(0);
  const [required, setRequired] = useState(0);
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paidRef = useRef(false);

  const isUpi = order?.asset === "upi";

  const start = useCallback(
    async (asset: string) => {
      setBusy(asset);
      setError(null);
      try {
        const res = await fetch("/api/payments/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: plan.id, asset }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as Order;
        setOrder(data);
        setStatus("pending");
        setConfirmations(0);
        setRequired(data.confirmations);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start the payment.");
      } finally {
        setBusy(null);
      }
    },
    [plan.id],
  );

  // Restore an in-flight order after a reload.
  useEffect(() => {
    let dead = false;
    void (async () => {
      const res = await fetch("/api/payments/open");
      if (!res.ok) return;
      const { order: found } = (await res.json()) as { order: Order | null };
      if (dead || !found) return;
      setOrder(found);
      setStatus(found.status ?? "pending");
      setRequired(found.confirmations);
    })();
    return () => {
      dead = true;
    };
  }, []);

  // QR: admin's uploaded image wins, else generate from the payload.
  useEffect(() => {
    if (!order) return;
    if (order.qrImage) {
      setQr(order.qrImage);
      return;
    }
    let dead = false;
    void import("qrcode").then(async (QR) => {
      const url = await QR.toDataURL(order.qrPayload, { margin: 1, width: 320 });
      if (!dead) setQr(url);
    });
    return () => {
      dead = true;
    };
  }, [order]);

  useEffect(() => {
    if (!order) return;
    const poll = setInterval(async () => {
      const res = await fetch(`/api/payments/status?id=${order.orderId}`);
      if (!res.ok) return;
      const s = (await res.json()) as { status: string; confirmations: number; required: number };
      setStatus(s.status);
      setConfirmations(s.confirmations);
      setRequired(s.required);
      if (s.status === "paid" && !paidRef.current) {
        paidRef.current = true;
        toast.success("Payment confirmed");
        onPaid();
      }
    }, 5000);
    const nudge = setInterval(() => {
      void fetch("/api/payments/verify", { method: "POST" });
    }, 60000);
    return () => {
      clearInterval(poll);
      clearInterval(nudge);
    };
  }, [order, onPaid]);

  const submitUtr = async () => {
    if (!order) return;
    setBusy("utr");
    setError(null);
    try {
      const res = await fetch("/api/payments/submit-utr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.orderId, utr }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit the UTR.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/80 p-4 backdrop-blur-sm sm:items-center"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold">Pay for {plan.name}</h3>
            {order && (
              <p className="text-xs text-muted-foreground">
                Expires in <Countdown until={order.expiresAt} />
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="mx-6 mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {!order ? (
          <div className="p-6">
            <p className="mb-4 text-xs text-muted-foreground">Choose a payment method</p>
            <div className="space-y-2">
              {plan.payment_methods.map((m) => {
                const asset = assetFor(m);
                const external = m.type === "url" || m.type === "qr" || m.type === "text";
                return (
                  <button
                    key={m.id}
                    disabled={busy !== null || (!external && !asset)}
                    onClick={() => {
                      if (m.type === "url") {
                        window.open(m.value, "_blank", "noopener");
                        onClose();
                        return;
                      }
                      if (asset) void start(asset);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left transition hover:bg-accent disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15 text-brand">
                        {busy === asset ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : m.type === "url" ? (
                          <ExternalLink className="h-4 w-4" />
                        ) : m.type === "qr" ? (
                          <QrCode className="h-4 w-4" />
                        ) : m.type === "upi" ? (
                          <Smartphone className="h-4 w-4" />
                        ) : m.type === "crypto" ? (
                          <Bitcoin className="h-4 w-4" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{m.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.type === "url"
                            ? "Opens external checkout"
                            : m.type === "upi"
                              ? "Pay via UPI, then enter UTR"
                              : m.type === "crypto"
                                ? asset
                                  ? "Auto-verified on-chain"
                                  : "Add the coin symbol to the label"
                                : m.type === "qr"
                                  ? "QR image only — no auto-verify"
                                  : "Bank / manual instructions"}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : status !== "paid" ? (
          <div className="space-y-3 p-6">
            {qr && (
              <img
                src={qr}
                alt="Payment QR code"
                className="mx-auto max-h-56 rounded-xl bg-white p-3"
              />
            )}

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {isUpi
                  ? "Pay this exact amount via UPI"
                  : `Send only ${order.symbol} on ${order.network}`}
              </div>
              <div className="mt-1 font-mono text-lg">
                {isUpi
                  ? `₹${(Number(order.expectedAtomic) / 100).toFixed(2)}`
                  : `${human(order.expectedAtomic, order.decimals)} ${order.symbol}`}
              </div>
              {order.address && (
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(order.address!);
                    toast.success("Copied");
                  }}
                  className="mt-2 flex w-full items-center gap-2 break-all rounded-lg bg-accent/60 px-2 py-1 text-left font-mono text-xs hover:bg-accent"
                >
                  <span className="flex-1">{order.address}</span>
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                </button>
              )}
            </div>

            {isUpi ? (
              <div className="flex gap-2">
                <input
                  value={utr}
                  onChange={(e) => setUtr(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  inputMode="numeric"
                  placeholder="12-digit UTR"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-brand"
                />
                <button
                  disabled={busy !== null || utr.length !== 12 || status === "review"}
                  onClick={() => void submitUtr()}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  Submit
                </button>
              </div>
            ) : (
              <p className="text-sm">
                {status === "confirming"
                  ? `Confirming ${confirmations}/${required}…`
                  : "Waiting for your transaction…"}
              </p>
            )}

            {status === "review" && (
              <p className="text-sm text-amber-500">UTR submitted — waiting for approval.</p>
            )}
            <p className="text-center text-xs text-muted-foreground">
              Amounts within ±2% are accepted. This page keeps checking automatically.
            </p>
          </div>
        ) : (
          <p className="m-6 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
            Payment confirmed. Your plan is active.
          </p>
        )}
      </div>
    </div>
  );
}
