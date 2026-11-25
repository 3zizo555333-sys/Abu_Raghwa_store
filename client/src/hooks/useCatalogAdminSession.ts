import { useEffect, useState } from "react";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { trpc } from "@/lib/trpc";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  clearCatalogAdminSessionToken,
  readCatalogAdminSessionToken,
  saveCatalogAdminSessionToken,
  type CatalogAdminScope,
} from "@/lib/catalogAdminSession";

export function useCatalogAdminSession(scope: CatalogAdminScope) {
  const { user, shopId, isLoading: staffLoading } = useStaffAccess();
  const issueSession = trpc.catalog.issueLocalAdminSession.useMutation();
  const renewSession = trpc.catalog.renewLocalAdminSession.useMutation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setReady(false);
    setError(null);
    if (staffLoading || !user || !shopId) return () => { active = false; };

    const ensureSession = async () => {
      try {
        const { data, error: authError } = await getSupabaseClient().auth.getSession();
        if (authError || !data.session?.access_token) throw new Error("انتهت جلسة المتجر السحابية؛ سجّل دخول الموظف المحلي ثم أعد المحاولة.");

        const existingToken = readCatalogAdminSessionToken();
        if (existingToken) {
          try {
            const renewed = await renewSession.mutateAsync({ shopId, scope });
            saveCatalogAdminSessionToken(renewed.token);
            if (active) setReady(true);
            return;
          } catch {
            clearCatalogAdminSessionToken();
          }
        }

        const issued = await issueSession.mutateAsync({ shopId, scope, accessToken: data.session.access_token });
        saveCatalogAdminSessionToken(issued.token);
        if (active) setReady(true);
      } catch (sessionError) {
        if (!active) return;
        setError(sessionError instanceof Error ? sessionError.message : "تعذر تجهيز جلسة الإدارة المحلية.");
      }
    };

    void ensureSession();
    return () => { active = false; };
  }, [issueSession.mutateAsync, renewSession.mutateAsync, scope, shopId, staffLoading, user?.id]);

  return { ready, error, shopId, authUserId: user?.id ?? null };
}
