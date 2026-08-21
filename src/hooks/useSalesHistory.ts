/**
 * Sales history browsing — combined state+handlers per this repo's
 * convention (the desktop spreads the equivalent across App.tsx). Owns the
 * fetched sales list, date range, and the offline-void-qualification data
 * SalesHistoryModal/VoidConfirmModal need — reusing Phase 2's
 * qualifiesForOfflineVoid and offline store reads directly.
 */
import { useCallback, useState } from 'react';
import { getPosSales } from '../api/pos';
import { qualifiesForOfflineVoid } from '../api/posOfflineShift';
import { offlineListPendingSales, offlineLoadShiftState } from '../services/offlineStore';
import type { PosSaleSummary } from '../types';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useSalesHistory(params: { storeId: number; register: string }) {
  const [sales, setSales] = useState<PosSaleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [pendingLocalSaleIds, setPendingLocalSaleIds] = useState<string[]>([]);
  const [syncedSaleIdsThisShift, setSyncedSaleIdsThisShift] = useState<number[]>([]);

  const reload = useCallback(
    async (from: string = dateFrom, to: string = dateTo) => {
      setLoading(true);
      setError(null);
      try {
        const [result, pending, shiftState] = await Promise.all([
          getPosSales({ storeId: params.storeId, dateFrom: from, dateTo: to }),
          offlineListPendingSales(),
          offlineLoadShiftState(params.storeId, params.register),
        ]);
        setSales(result);
        setPendingLocalSaleIds(
          pending
            .filter((p) => p.payload.store_id === params.storeId && (p.payload.register ?? '') === params.register)
            .map((p) => p.id)
        );
        setSyncedSaleIdsThisShift(shiftState?.syncedSales?.map((s) => s.saleId) ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load sales history.');
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo, params.storeId, params.register]
  );

  const isOfflineVoidQualified = useCallback(
    (saleId: number) => qualifiesForOfflineVoid({ saleId, isLocalUnsynced: false, syncedSaleIdsThisShift }),
    [syncedSaleIdsThisShift]
  );

  return {
    sales,
    loading,
    error,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    reload,
    pendingLocalSaleIds,
    isOfflineVoidQualified,
  };
}
