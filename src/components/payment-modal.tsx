import { useCallback, useEffect, useRef, useState } from "react";

type AssetTile = {
  id: string;
  label: string;
  symbol: string;
  network: string;
  confirmations: number;
};

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
  qrPayload: string;
};

type Props = { planId: string; planLabel: string; onClose: () => void; onPaid: () => void };

const human = (atomic: string, decimals: number) =>
  (Number(atomic) / 10 ** decimals).toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");

function Countdown({ until }: { until: string }) {
  const [left, setLeft] = useState(() => Date.parse(until) - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(Date.parse(until) - Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (left <= 0) return <span className="text-destructive">expired</span>;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className="font-mono tabular-nums">
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

export function PaymentModal({ planId, planLabel, onClose, onPaid }: Props) {
  const [assets, setAssets] = useState<AssetTile[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("pending");
  const [confirmations, setConfirmations] = useState(0);
  const [required, setRequired] = useState(0);
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paidRef = useRef(false);

  const isUpi = order?.asset === "upi";

  const start = useCallback(async (asset: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, asset }),
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
      setBusy(false);
    }
  }, [planId]);

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
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    if (order) return;
    void fetch("/api/payments/assets")
      .then((r) => r.json())
      .then((d: { assets: AssetTile[] }) => setAssets(d.assets ?? []))
      .catch(() => setError("Couldn't load payment methods."));
  }, [order]);

  // QR
  useEffect(() => {
    if (!order?.qrPayload) return;
    let dead = false;
    void import("qrcode").then(async (QR) => {
      const url = await QR.toDataURL(order.qrPayload, { margin: 1, width: 320 });
      if (!dead) setQr(url);
    });
    return () => { dead = true; };
  }, [order?.qrPayload]);

  // Status + verify
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
        onPaid();
      }
    }, 5000);
    const nudge = setInterval(() => { void fetch("/api/payments/verify", { method: "POST" }); }, 60000);
    return () => { clearInterval(poll); clearInterval(nudge); };
  }, [order, onPaid]);

  const submitUtr = async () => {
    if (!order) return;
    setBusy(true);
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
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Pay for {planLabel}</h2>
            {order && (
              <p className="text-xs text-muted-foreground">
                Expires in <Countdown until={order.expiresAt} />
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Close
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {!order && (
          <div className="grid grid-cols-2 gap-2">
            {assets.map((a) => (
              <button
                key={a.id}
                disabled={busy}
                onClick={() => void start(a.id)}
                className="rounded-lg border border-border p-3 text-left hover:border-primary disabled:opacity-50"
              >
                <div className="text-sm font-medium">{a.label}</div>
                <div className="text-xs text-muted-foreground">
                  {a.id === "upi" ? "manual review" : `${a.network} · ${a.confirmations} conf`}
                </div>
              </button>
            ))}
          </div>
        )}

        {order && status !== "paid" && (
          <div className="space-y-3">
            {qr && <img src={qr} alt="Payment QR" className="mx-auto h-56 w-56 rounded-lg bg-white p-2" />}

            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">
                {isUpi ? "Pay this exact amount via UPI" : `Send only ${order.symbol} on ${order.network}`}
              </div>
              <div className="mt-1 font-mono text-lg">
                {isUpi
                  ? `₹${(Number(order.expectedAtomic) / 100).toFixed(2)}`
                  : `${human(order.expectedAtomic, order.decimals)} ${order.symbol}`}
              </div>
              {order.address && (
                <button
                  onClick={() => void navigator.clipboard.writeText(order.address!)}
                  className="mt-2 w-full break-all rounded bg-muted px-2 py-1 text-left font-mono text-xs hover:bg-muted/70"
                >
                  {order.address}
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
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                />
                <button
                  disabled={busy || utr.length !== 12 || status === "review"}
                  onClick={() => void submitUtr()}
                  className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
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
            <p className="text-xs text-muted-foreground">
              Amounts within ±2% are accepted.
            </p>
          </div>
        )}

        {status === "paid" && (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
            Payment confirmed. Your plan is active.
          </p>
        )}
      </div>
    </div>
  );
}
