import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { getSupabaseClient } from "@/lib/supabase/client";
import { CURRENT_STAFF_QUERY_KEY } from "@/lib/supabase/auth";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

/** Backward-compatible hook name; identity and logout are owned by Supabase Auth. */
export function useAuth(options?: UseAuthOptions) {
  const state = useStaffAccess();
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const queryClient = useQueryClient();

  const logout = useCallback(async () => {
    const { error } = await getSupabaseClient().auth.signOut({ scope: "local" });
    if (error) throw new Error(error.message);
    await queryClient.invalidateQueries({ queryKey: CURRENT_STAFF_QUERY_KEY });
  }, [queryClient]);

  useEffect(() => {
    if (!redirectOnUnauthenticated || state.isLoading || state.user) return;
    if (typeof window === "undefined") return;
    const destination = redirectPath || "/auth";
    if (window.location.pathname !== destination) window.location.assign(destination);
  }, [redirectOnUnauthenticated, redirectPath, state.isLoading, state.user]);

  return {
    user: state.user,
    loading: state.isLoading,
    error: state.error,
    isAuthenticated: state.isAuthenticated,
    refresh: state.refresh,
    logout,
  };
}
