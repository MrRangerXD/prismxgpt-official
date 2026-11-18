import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type PaymentAsset = "upi" | "ltc" | "sol" | "trx" | "usdt_trc20" | "usdt_spl";
type PaymentStatus = "pending" | "seen" | "confirming" | "paid" | "expired" | "failed" | "review";

type PaymentDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Enums"> & {
    Tables: Database["public"]["Tables"] & {
      payment_orders: {
        Row: {
          address: string | null;
          asset: PaymentAsset;
          confirmations: number;
          created_at: string;
          credited_at: string | null;
          expected_atomic: string;
          expires_at: string;
          id: string;
          plan_id: string;
          status: PaymentStatus;
          tx_hash: string | null;
          utr: string | null;
          user_id: string;
        };
        Insert: {
          address?: string | null;
          asset: PaymentAsset;
          confirmations?: number;
          created_at?: string;
          credited_at?: string | null;
          expected_atomic: string;
          expires_at?: string;
          id?: string;
          plan_id: string;
          status?: PaymentStatus;
          tx_hash?: string | null;
          utr?: string | null;
          user_id: string;
        };
        Update: {
          address?: string | null;
          asset?: PaymentAsset;
          confirmations?: number;
          created_at?: string;
          credited_at?: string | null;
          expected_atomic?: string;
          expires_at?: string;
          id?: string;
          plan_id?: string;
          status?: PaymentStatus;
          tx_hash?: string | null;
          utr?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Enums: Database["public"]["Enums"] & {
      payment_asset: PaymentAsset;
      payment_status: PaymentStatus;
    };
  };
};

/** Adds migration-defined payment types without editing generated schema types. */
export function asPaymentClient(client: SupabaseClient<Database>): SupabaseClient<PaymentDatabase> {
  return client as unknown as SupabaseClient<PaymentDatabase>;
}