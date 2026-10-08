import { useEffect } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getActiveShopContext, listProductsPage, subscribeToShopChanges, type ProductCursor } from "./products";

export function useCloudProducts(input: { search?: string; categoryId?: string | null; pageSize?: number } = {}) {
  const queryClient = useQueryClient();
  const queryKey = ["supabase-products", input.search?.trim() ?? "", input.categoryId ?? null, input.pageSize ?? 50] as const;
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => listProductsPage({ cursor: pageParam as ProductCursor | null, search: input.search, categoryId: input.categoryId, limit: input.pageSize }),
    getNextPageParam: page => page.has_more ? page.next_cursor ?? undefined : undefined,
    staleTime: 10_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    let unsubscribe: (() => Promise<unknown>) | undefined;
    let active = true;
    let starting = false;
    const reconnect = () => {
      if (!active || starting || unsubscribe) return;
      starting = true;
      void getActiveShopContext(true).then(({ shopId }) => {
        if (!active) return undefined;
        return subscribeToShopChanges(shopId, () => {
          void queryClient.invalidateQueries({ queryKey: ["supabase-products"] });
        });
      }).then(cleanup => {
        if (!active) {
          if (cleanup) void cleanup();
          return;
        }
        unsubscribe = cleanup;
      }).catch(() => undefined).finally(() => { starting = false; });
    };
    window.addEventListener("online", reconnect);
    reconnect();
    return () => {
      active = false;
      window.removeEventListener("online", reconnect);
      if (unsubscribe) void unsubscribe();
    };
  }, [queryClient]);

  return {
    ...query,
    products: query.data?.pages.flatMap(page => page.items) ?? [],
    total: query.data?.pages[0]?.total ?? 0,
  };
}
