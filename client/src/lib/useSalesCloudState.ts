import { useEffect, useRef } from "react";
import { useCloudState } from "./cloudSync";
import { filterActiveSales, parseArchivedSales, type ArchivedSale, type CleanupSale } from "./salesInventoryCleanup";
import { trpc } from "./trpc";

const LEGACY_SALES_KEY = "abu_raghwa_sales";
const ARCHIVED_SALES_KEY = "abu_raghwa_archived_sales";
const DELETED_SALES_KEY = "abu_raghwa_permanently_deleted_sales";

function readLocalSales<TSale extends CleanupSale>() {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LEGACY_SALES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is TSale => typeof item?.id === "string") : [];
  } catch {
    return [];
  }
}

function parseIdList(raw: string | null) {
  if (!raw) return [] as string[];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Shared sales sync with a one-time, ID-deduplicated migration of legacy local-only invoices. */
export function useSalesCloudState<TSale extends CleanupSale>(): [TSale[], (value: TSale[] | ((current: TSale[]) => TSale[])) => void] {
  const [sales, setSales] = useCloudState<TSale[]>(LEGACY_SALES_KEY, []);
  const [archivedSales] = useCloudState<ArchivedSale<TSale>[]>(ARCHIVED_SALES_KEY, []);
  const [deletedIds] = useCloudState<string[]>(DELETED_SALES_KEY, []);
  const legacyLocalSnapshot = useRef<TSale[]>(readLocalSales<TSale>());
  const didMigrate = useRef(false);
  const syncEnabled = Boolean(sessionStorage.getItem("abu_staff_sync_token"));
  const remoteSales = trpc.sync.get.useQuery({ key: LEGACY_SALES_KEY }, { enabled: syncEnabled, retry: false, refetchOnMount: "always", refetchInterval: false });
  const remoteArchived = trpc.sync.get.useQuery({ key: ARCHIVED_SALES_KEY }, { enabled: syncEnabled, retry: false, refetchOnMount: "always", refetchInterval: false });
  const remoteDeletedIds = trpc.sync.get.useQuery({ key: DELETED_SALES_KEY }, { enabled: syncEnabled, retry: false, refetchOnMount: "always", refetchInterval: false });

  useEffect(() => {
    if (didMigrate.current || remoteSales.data === undefined || remoteArchived.data === undefined || remoteDeletedIds.data === undefined) return;
    didMigrate.current = true;
    const remoteRows = remoteSales.data ? (() => { try { const parsed: unknown = JSON.parse(remoteSales.data); return Array.isArray(parsed) ? parsed as TSale[] : []; } catch { return []; } })() : [];
    const activeIds = new Set(remoteRows.map(item => item?.id).filter((id): id is string => typeof id === "string"));
    const archivedIds = new Set(parseArchivedSales<TSale>(remoteArchived.data).map(item => item.sale.id));
    const purgedIds = new Set([...parseIdList(remoteDeletedIds.data), ...deletedIds]);
    const legacyOnly = legacyLocalSnapshot.current.filter(item => !activeIds.has(item.id) && !archivedIds.has(item.id) && !purgedIds.has(item.id));
    setSales(current => {
      const base = remoteRows.length || remoteSales.data ? remoteRows : Array.isArray(current) ? current : [];
      const known = new Set(base.map(item => item.id));
      return filterActiveSales([...base, ...legacyOnly.filter(item => !known.has(item.id))], [...parseArchivedSales<TSale>(remoteArchived.data), ...(Array.isArray(archivedSales) ? archivedSales : [])], Array.from(purgedIds));
    });
  }, [archivedSales, deletedIds, remoteArchived.data, remoteDeletedIds.data, remoteSales.data, setSales]);

  useEffect(() => {
    const visible = filterActiveSales(Array.isArray(sales) ? sales : [], Array.isArray(archivedSales) ? archivedSales : [], Array.isArray(deletedIds) ? deletedIds : []);
    if (visible.length !== sales.length) setSales(visible);
  }, [archivedSales, deletedIds, sales, setSales]);

  const visibleSales = filterActiveSales(Array.isArray(sales) ? sales : [], Array.isArray(archivedSales) ? archivedSales : [], Array.isArray(deletedIds) ? deletedIds : []);
  return [visibleSales, setSales];
}
