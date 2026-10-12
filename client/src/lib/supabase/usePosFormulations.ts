import { useEffect, useState } from "react";
import { getActiveShopContext, subscribeToShopChanges } from "./products";
import { getSupabaseClient, requireCloudResult } from "./client";

export type PosFormulation = {
  id: string;
  name: string;
  salePrice: number;
  productionUnit: string;
  loyaltyPoints: number;
  imageUrl: string | null;
};

/** Safe POS projection only; it does not expose formula costs, notes or password hashes. */
export function usePosFormulations() {
  const [formulations, setFormulations] = useState<PosFormulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => Promise<unknown>) | undefined;
    const load = async () => {
      try {
        const { shopId } = await getActiveShopContext();
        const result = await getSupabaseClient().from("pos_formulations")
          .select("id,shop_id,name,retail_price,production_unit,loyalty_points,image_url,updated_at")
          .eq("shop_id", shopId).order("name").limit(500);
        const rows = requireCloudResult(result) as Array<{id:string;name:string;retail_price:number;production_unit:string;loyalty_points:number;image_url:string|null}>;
        if (active) {
          setFormulations(rows.map(row => ({ id: row.id, name: row.name, salePrice: Number(row.retail_price) || 0, productionUnit: row.production_unit, loyaltyPoints: Number(row.loyalty_points) || 0, imageUrl: row.image_url })));
          setError(null);
          setLoading(false);
        }
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause : new Error("تعذر تحميل التركيبات."));
        setLoading(false);
      }
    };
    const scheduleLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 120);
    };
    void load().then(async () => {
      try {
        const { shopId } = await getActiveShopContext();
        if (active) unsubscribe = await subscribeToShopChanges(shopId, scheduleLoad);
        if (!active) await unsubscribe?.();
      } catch {
        // Initial fetch remains usable if realtime is unavailable; the page reload still refreshes.
      }
    });
    const refreshOnFocus = () => { if (document.visibilityState === "visible") scheduleLoad(); };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      void unsubscribe?.();
    };
  }, []);

  return { formulations, loading, error };
}
