import { useEffect } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { getActiveShopContext, listProductsPage, searchProductsByBarcode, subscribeToShopChanges, type ProductCursor } from "./products";

export function useCloudProducts(input: { search?: string; barcode?: string; categoryId?: string | null; pageSize?: number; enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const shouldLoad = input.enabled !== false;
  const activeShop = useQuery({
    queryKey: ["supabase-active-shop-context"],
    queryFn: () => getActiveShopContext(true),
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const context = activeShop.data;
  const scope = [context?.userId ?? null, context?.shopId ?? null, context?.role ?? null] as const;
  const queryKey = ["supabase-products", ...scope, input.search?.trim() ?? "", input.barcode?.trim() ?? "", input.categoryId ?? null, input.pageSize ?? 50] as const;
  const query = useInfiniteQuery({
    queryKey,
    enabled: shouldLoad && Boolean(context) && !activeShop.isError,
    queryFn: ({ pageParam }) => input.barcode?.trim()
      ? searchProductsByBarcode(input.barcode)
      : listProductsPage({ cursor: pageParam as ProductCursor | null, search: input.search, categoryId: input.categoryId, limit: input.pageSize }),
    getNextPageParam: page => page.has_more ? page.next_cursor ?? undefined : undefined,
    staleTime: 0,
    retry: 1,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 50 * 60 * 1000,
  });

  useEffect(() => {
    if (!shouldLoad || !context) return;
    let unsubscribe: (() => Promise<unknown>) | undefined;
    let active = true;
    let starting = false;
    const reconnect = () => {
      if (!active || starting || unsubscribe) return;
      starting = true;
      void subscribeToShopChanges(context.shopId, () => {
          void queryClient.invalidateQueries({ queryKey: ["supabase-products"] });
      }).then(cleanup => {
        if (!active) {
          void cleanup();
          return;
        }
        unsubscribe = cleanup;
        void queryClient.invalidateQueries({ queryKey: ["supabase-products"] });
      }).catch(() => undefined).finally(() => { starting = false; });
    };
    const disconnect = () => {
      if (!unsubscribe) return;
      void unsubscribe();
      unsubscribe = undefined;
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    reconnect();
    return () => {
      active = false;
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnect);
      if (unsubscribe) void unsubscribe();
    };
  }, [context?.userId, context?.shopId, context?.role, queryClient, shouldLoad]);

  return {
    ...query,
    isLoading: shouldLoad && (activeShop.isLoading || query.isLoading),
    isError: shouldLoad && (activeShop.isError || query.isError),
    error: shouldLoad ? activeShop.error ?? query.error : query.error,
    products: activeShop.isError ? [] : query.data?.pages.flatMap(page => page.items) ?? [],
    total: activeShop.isError ? 0 : query.data?.pages[0]?.total ?? 0,
  };
}
