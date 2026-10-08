import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { CURRENT_STAFF_QUERY_KEY, loadCurrentStaffSession } from "@/lib/supabase/auth";
import { resetActiveShopContextCache } from "@/lib/supabase/products";
import { hasSupervisorAccess, isManager } from "@/lib/accessControl";

function removeScopedQueries(queryClient: ReturnType<typeof useQueryClient>) {
  const isCurrentStaffQuery = (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[0] === CURRENT_STAFF_QUERY_KEY[0] && query.queryKey[1] === CURRENT_STAFF_QUERY_KEY[1];
  resetActiveShopContextCache();
  void queryClient.cancelQueries({ predicate: query => !isCurrentStaffQuery(query) });
  queryClient.removeQueries({ predicate: query => !isCurrentStaffQuery(query) });
}

export function useStaffAccess(options: { monitorMembership?: boolean } = {}) {
  const queryClient = useQueryClient();
  const monitorMembership = options.monitorMembership ?? false;
  const previousScope = useRef<string | null>(null);
  const query = useQuery({
    queryKey: CURRENT_STAFF_QUERY_KEY,
    queryFn: loadCurrentStaffSession,
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: monitorMembership ? 15_000 : false,
  });

  useEffect(() => {
    if (!monitorMembership || !isSupabaseConfigured) return;
    const supabase = getSupabaseClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        removeScopedQueries(queryClient);
      }
      queueMicrotask(() => { void queryClient.invalidateQueries({ queryKey: CURRENT_STAFF_QUERY_KEY }); });
    });
    return () => subscription.unsubscribe();
  }, [monitorMembership, queryClient]);

  const scope = query.isSuccess
    ? JSON.stringify([query.data?.user.id ?? null, query.data?.shopId ?? null, query.data?.user.role ?? null, query.data?.membershipState ?? "missing"])
    : null;
  useEffect(() => {
    if (!monitorMembership) return;
    if (query.isError) {
      removeScopedQueries(queryClient);
      previousScope.current = null;
      return;
    }
    if (scope === null) return;
    if (previousScope.current !== null && previousScope.current !== scope) removeScopedQueries(queryClient);
    previousScope.current = scope;
  }, [monitorMembership, query.isError, queryClient, scope]);

  const session = query.data;
  const verifiedSession = query.isError ? null : session;
  const user = verifiedSession?.user ?? null;
  return {
    user,
    shopId: verifiedSession?.shopId ?? null,
    membershipState: verifiedSession?.membershipState ?? "missing",
    isLoading: query.isLoading,
    error: query.error,
    refresh: query.refetch,
    isAuthenticated: Boolean(user),
    isSeller: user?.role === "seller",
    isManager: isManager(user),
    canViewSensitiveFinancials: hasSupervisorAccess(user),
  };
}
