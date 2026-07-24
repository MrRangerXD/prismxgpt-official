import { useState } from "react";
import { X, Check, Sparkles, ExternalLink, Copy, QrCode, Smartphone, Bitcoin, FileText } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/use-profile";
import { usePlans, type PaymentMethod, type PlanRow } from "@/hooks/use-plans";

export function PlusModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isPremium, isPro, isAdmin, planExpiresAt } = useProfile();
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
      style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
                We don't have any active plans or promotions at the moment. Please check back later —
                new offers will appear here as soon as they're published.
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
                    highlight ? "border-brand bg-brand/5 shadow-glow" : "border-border bg-background/40"
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
                      <span className="text-lg text-muted-foreground line-through">{p.strike_price}</span>
                    )}
                    <span className="text-3xl font-bold">{p.price}</span>
                    {p.note && <span className="text-xs text-muted-foreground">{p.note}</span>}
                  </div>
                  <button
                    disabled={isCurrent}
                    onClick={() => {
                      if (isCurrent) return;
                      if (p.payment_methods.length === 0) {
                        toast.info("Payment methods not configured yet. Ask an admin to add one.");
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
                    style={highlight && !isCurrent ? { background: "var(--gradient-brand)" } : undefined}
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
        <PaymentPicker plan={activePlan} onClose={() => setActivePlan(null)} />
      )}
    </div>
  );
}

function PaymentPicker({ plan, onClose }: { plan: PlanRow; onClose: () => void }) {
  const [selected, setSelected] = useState<PaymentMethod | null>(null);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/80 p-4 backdrop-blur-sm sm:items-center"
      style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="my-auto w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-lg font-semibold">Pay for {plan.name}</h3>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!selected ? (
          <div className="p-6">
            <p className="mb-4 text-xs text-muted-foreground">Choose a payment method</p>
            <div className="space-y-2">
              {plan.payment_methods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    if (m.type === "url") {
                      window.open(m.value, "_blank", "noopener");
                      onClose();
                    } else {
                      setSelected(m);
                    }
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left transition hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15 text-brand">
                      {m.type === "url" ? (
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
                          : m.type === "qr"
                            ? "Scan QR code"
                            : m.type === "upi"
                              ? "Pay via UPI"
                              : m.type === "crypto"
                                ? "Pay with crypto"
                                : "Bank / manual instructions"}
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-6">
            <button
              onClick={() => setSelected(null)}
              className="mb-4 text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
            <h4 className="mb-1 text-base font-semibold">{selected.label}</h4>
            <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
              {selected.type === "qr"
                ? "Scan the QR code below"
                : selected.type === "upi"
                  ? "UPI ID"
                  : selected.type === "crypto"
                    ? "Crypto address"
                    : "Payment details"}
            </p>
            {selected.type === "qr" && (
              <div className="mb-4 flex justify-center rounded-xl border border-border bg-white p-4">
                <img src={selected.value} alt="Payment QR code" className="max-h-64 rounded-lg" />
              </div>
            )}
            {(selected.type === "upi" || selected.type === "crypto" || selected.type === "text") && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-background p-4">
                <pre className="flex-1 whitespace-pre-wrap break-all font-mono text-sm">{selected.value}</pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selected.value);
                    toast.success("Copied");
                  }}
                  className="rounded-lg bg-accent p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label="Copy"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {selected.type === "upi" && (
              <a
                href={`upi://pay?pa=${encodeURIComponent(selected.value)}&pn=${encodeURIComponent(plan.name)}&cu=INR`}
                className="mb-4 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-foreground"
                style={{ background: "var(--gradient-brand)" }}
              >
                <Smartphone className="h-4 w-4" /> Open in UPI app
              </a>
            )}
            {selected.instructions && (
              <p className="rounded-xl bg-background/50 p-3 text-xs text-muted-foreground">
                {selected.instructions}
              </p>
            )}
            <p className="mt-4 text-center text-xs text-muted-foreground">
              After payment, contact an admin with your email so they can activate {plan.name}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
