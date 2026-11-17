export type AssetCfg = {
  chain: "upi" | "utxo" | "solana" | "tron";
  label: string;
  symbol: string;
  network: string;
  decimals: number;
  confirmations: number;
  jitter: number;
  address?: string;
  contract?: string;
};

export const ASSETS: Record<string, AssetCfg> = {
  upi: {
    chain: "upi", label: "UPI", symbol: "INR", network: "UPI",
    decimals: 2, confirmations: 0, jitter: 0,
  },
  usdt_trc20: {
    chain: "tron", label: "USDT (TRC20)", symbol: "USDT", network: "TRON",
    decimals: 6, confirmations: 3, jitter: 400000,
    address: process.env.TRX_ADDRESS, contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  },
  usdt_spl: {
    chain: "solana", label: "USDT (SPL)", symbol: "USDT", network: "Solana",
    decimals: 6, confirmations: 32, jitter: 90000,
    address: process.env.SOL_ADDRESS, contract: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  },
  ltc: {
    chain: "utxo", label: "Litecoin", symbol: "LTC", network: "Litecoin",
    decimals: 8, confirmations: 2, jitter: 5000, address: process.env.LTC_ADDRESS,
  },
  sol: {
    chain: "solana", label: "Solana", symbol: "SOL", network: "Solana",
    decimals: 9, confirmations: 32, jitter: 90000, address: process.env.SOL_ADDRESS,
  },
  trx: {
    chain: "tron", label: "TRON", symbol: "TRX", network: "TRON",
    decimals: 6, confirmations: 3, jitter: 400000, address: process.env.TRX_ADDRESS,
  },
};

/** Assets that are configured and safe to show in checkout. */
export function availableAssets(): AssetCfg[] {
  return Object.entries(ASSETS)
    .filter(([key, cfg]) => key === "upi" || Boolean(cfg.address))
    .map(([, cfg]) => cfg);
}
