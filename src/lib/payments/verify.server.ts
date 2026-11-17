import { ASSETS, type AssetCfg } from "./assets";

const TIMEOUT = 12_000;
const json = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) }).then((r) => r.json());

export type Hit = { txHash: string; atomic: string; confirmations: number };
type Order = { created_at: string };

async function scanTron(order: Order, cfg: AssetCfg): Promise<Hit[]> {
  const since = new Date(order.created_at).getTime();
  const headers = { "TRON-PRO-API-KEY": process.env.TRONGRID_KEY ?? "" };

  if (cfg.contract) {
    const j = await json(
      `https://api.trongrid.io/v1/accounts/${cfg.address}/transactions/trc20` +
        `?contract_address=${cfg.contract}&only_confirmed=false&min_timestamp=${since}&limit=200`,
      { headers },
    );
    return ((j.data ?? []) as any[]).map((t) => ({
      txHash: String(t.transaction_id),
      atomic: String(t.value ?? 0),
      confirmations: t.block ? 1 : 0,
    }));
  }

  const j = await json(
    `https://api.trongrid.io/v1/accounts/${cfg.address}/transactions` +
      `?only_confirmed=false&min_timestamp=${since}&limit=200`,
    { headers },
  );
  return ((j.data ?? []) as any[]).flatMap((t) =>
    ((t.raw_data?.contract ?? []) as any[])
      .filter((c) => c.type === "TransferContract")
      .map((c) => ({
        txHash: String(t.txID),
        atomic: String(c.parameter?.value?.amount ?? 0),
        confirmations: 1,
      })),
  );
}

async function scanSolana(order: Order, cfg: AssetCfg): Promise<Hit[]> {
  const rpc = (payload: unknown) =>
    json(process.env.SOLANA_RPC ?? "", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  const sigs = await rpc({
    jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
    params: [cfg.address, { limit: 15 }],
  });

  const out: Hit[] = [];
  for (const s of (sigs.result ?? []) as any[]) {
    const tx = await rpc({
      jsonrpc: "2.0", id: 1, method: "getTransaction",
      params: [s.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }],
    });
    const meta = tx.result?.meta;
    if (!meta || meta.err) continue;

    let delta = 0n;
    if (!cfg.contract) {
      const idx = (tx.result.transaction.message.accountKeys as any[]).findIndex(
        (k) => (k?.pubkey ?? k) === cfg.address,
      );
      if (idx < 0) continue;
      delta = BigInt(meta.postBalances[idx]) - BigInt(meta.preBalances[idx]);
    } else {
      const sum = (rows: any[]) =>
        (rows ?? [])
          .filter((b) => b.mint === cfg.contract && b.owner === cfg.address)
          .reduce((n: bigint, b) => n + BigInt(b.uiTokenAmount.amount), 0n);
      delta = sum(meta.postTokenBalances) - sum(meta.preTokenBalances);
    }
    if (delta > 0n) {
      out.push({
        txHash: String(s.signature),
        atomic: delta.toString(),
        confirmations: Number(s.confirmations ?? 0),
      });
    }
  }
  return out;
}

async function scanLitecoin(order: Order, cfg: AssetCfg): Promise<Hit[]> {
  const [txs, tip] = await Promise.all([
    json(`https://litecoinspace.org/api/address/${cfg.address}/txs`),
    json("https://litecoinspace.org/api/blocks/tip/height"),
  ]);
  const height = Number(tip);
  const out: Hit[] = [];

  for (const t of (txs ?? []) as any[]) {
    const atomic = ((t.vout ?? []) as any[])
      .filter((v) => v.scriptpubkey_address === cfg.address)
      .reduce((n, v) => n + Number(v.value ?? 0), 0);
    if (!atomic) continue;
    out.push({
      txHash: String(t.txid),
      atomic: String(atomic),
      confirmations:
        t.status?.confirmed && t.status.block_height ? height - t.status.block_height + 1 : 0,
    });
  }
  return out;
}

export function scanOrder(order: Order & { asset: string }): Promise<Hit[]> {
  const cfg = ASSETS[order.asset];
  if (!cfg || !cfg.address) return Promise.resolve([]);
  if (cfg.chain === "tron") return scanTron(order, cfg);
  if (cfg.chain === "solana") return scanSolana(order, cfg);
  if (cfg.chain === "utxo") return scanLitecoin(order, cfg);
  return Promise.resolve([]);
}
