import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PaymentMethod = {
  id: string;
  label: string;
  type: "url" | "qr" | "upi" | "crypto" | "text";
  value: string;
  instructions?: string;
};

export type PlanRow = {
  id: string;
  name: string;
  price: string;
  strike_price: string | null;
  note: string | null;
  badge: string | null;
  cta_label: string | null;
  features: string[];
  sort_order: number;
  payment_methods: PaymentMethod[];
};

type State = { plans: PlanRow[]; loading: boolean; error: string | null };

// Module-level cache so Homepage + PlusModal + Admin share a single fetch and
// admin edits show up everywhere on the next refresh() without duplicate requests.
let cache: State = { plans: [], loading: true, error: null };
let inflight: Promise<void> | null = null;
const listeners = new Set<(s: State) => void>();

function emit() {
  for (const l of listeners) l(cache);
}

function normalize(rows: unknown[]): PlanRow[] {
  return (
    rows as Array<
      Omit<PlanRow, "features" | "payment_methods"> & {
        features: unknown;
        payment_methods: unknown;
      }
    >
  ).map((p) => ({
    ...p,
    features: Array.isArray(p.features) ? (p.features as string[]) : [],
    payment_methods: Array.isArray(p.payment_methods) ? (p.payment_methods as PaymentMethod[]) : [],
  }));
}

async function fetchPlans(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && !cache.loading && cache.plans.length > 0) return;
  cache = { ...cache, loading: true, error: null };
  emit();
  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("plan_settings" as never)
        .select("*")
        .order("sort_order" as never, { ascending: true } as never);
      if (error) throw error;
      cache = { plans: normalize(data ?? []), loading: false, error: null };
    } catch (e) {
      cache = {
        plans: cache.plans,
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load plans",
      };
    } finally {
      inflight = null;
      emit();
    }
  })();
  return inflight;
}

export function usePlans(): State & { refresh: () => Promise<void> } {
  const [state, setState] = useState<State>(cache);
  useEffect(() => {
    listeners.add(setState);
    // Trigger initial fetch (deduped by inflight guard)
    void fetchPlans(false);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return { ...state, refresh: () => fetchPlans(true) };
}

export function invalidatePlans() {
  cache = { plans: [], loading: true, error: null };
  void fetchPlans(true);
}
