/**
 * Sales history browser — ported from the desktop's SalesHistoryModal.tsx.
 * Pure presentational: every API call and every piece of cross-cutting
 * state (pending local sales, offline-void qualification, current shift)
 * is owned by useSalesHistory / the screen, not this modal. Void/reprint
 * actions bubble up — this modal never renders VoidConfirmModal/RefundModal
 * itself.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ReprintGateControl } from './ReprintGateControl';
import { Button } from './Button';
import type { PosSaleSummary } from '../types';
import { formatCurrency } from '../utils/currency';

const PAGE_SIZE = 20;

type ModeFilter = 'all' | 'sale' | 'voided';
const TENDER_FILTERS = ['all', 'cash', 'gcash', 'card', 'bank', 'installment'];

interface SalesHistoryModalProps {
  isOpen: boolean;
  sales: PosSaleSummary[];
  loading: boolean;
  error?: string | null;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onReload: () => void;
  onClose: () => void;
  onVoidSale: (saleId: number, receiptNumber: string) => void;
  onReprintSale: (saleId: number) => void;
  onRefundSale: (saleId: number) => void;
  isOfflineVoidQualified: (saleId: number) => boolean;
  isOnline: boolean;
  currentShiftOpenedAt?: string;
  pendingLocalSaleIds: string[];
}

function TransactionRow({
  sale,
  expanded,
  onToggle,
  isSettled,
  onVoidSale,
  onReprintSale,
  onRefundSale,
  isOfflineVoidQualified,
  isOnline,
}: {
  sale: PosSaleSummary;
  expanded: boolean;
  onToggle: () => void;
  isSettled: boolean;
  onVoidSale: (saleId: number, receiptNumber: string) => void;
  onReprintSale: (saleId: number) => void;
  onRefundSale: (saleId: number) => void;
  isOfflineVoidQualified: (saleId: number) => boolean;
  isOnline: boolean;
}) {
  const isVoided = !!sale.voided_at;
  const canVoid = sale.mode === 'Sale' && !isVoided && !isSettled;
  const voidBlockedOffline = canVoid && !isOnline && !isOfflineVoidQualified(sale.id);

  return (
    <Pressable onPress={onToggle} className="border-b border-gray-100 py-3 active:bg-gray-50">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-900">
            {sale.receipt} {isVoided && <Text className="text-red-600">(VOIDED)</Text>}
          </Text>
          <Text className="text-xs text-gray-500">
            {sale.date} {sale.time} · {sale.cashier ?? 'Cashier'}
          </Text>
        </View>
        <Text className="text-sm font-bold text-gray-900">{formatCurrency(sale.amount)}</Text>
      </View>

      {expanded && (
        <View className="mt-2 gap-2">
          <Text className="text-xs text-gray-600">{sale.items}</Text>
          <Text className="text-xs text-gray-500">Tender: {sale.tender_type ?? '—'}</Text>
          {sale.discount > 0 && <Text className="text-xs text-green-600">Discount: -{formatCurrency(sale.discount)}</Text>}

          <View className="flex-row flex-wrap gap-2">
            {sale.mode === 'Sale' && <ReprintGateControl type="sale" targetId={sale.id} onDoPrint={() => onReprintSale(sale.id)} />}
            {canVoid && (
              <Pressable
                disabled={voidBlockedOffline}
                onPress={() => onVoidSale(sale.id, sale.receipt || sale.transaction)}
                className={`rounded-lg border border-red-200 bg-red-50 px-3 py-2 ${voidBlockedOffline ? 'opacity-40' : ''}`}
              >
                <Text className="text-sm font-semibold text-red-700">{voidBlockedOffline ? 'Void (offline — unavailable)' : 'Void Sale'}</Text>
              </Pressable>
            )}
            {isSettled && sale.mode === 'Sale' && !isVoided && (
              <Pressable onPress={() => onRefundSale(sale.id)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <Text className="text-sm font-semibold text-amber-700">Refund instead (settled)</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

export function SalesHistoryModal({
  isOpen,
  sales,
  loading,
  error,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onReload,
  onClose,
  onVoidSale,
  onReprintSale,
  onRefundSale,
  isOfflineVoidQualified,
  isOnline,
  currentShiftOpenedAt,
  pendingLocalSaleIds,
}: SalesHistoryModalProps) {
  const [mode, setMode] = useState<ModeFilter>('all');
  const [tenderFilter, setTenderFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const currentShiftDate = currentShiftOpenedAt ? currentShiftOpenedAt.slice(0, 10) : null;

  const filtered = useMemo(() => {
    let list = sales;
    if (mode === 'sale') list = list.filter((s) => !s.voided_at);
    else if (mode === 'voided') list = list.filter((s) => !!s.voided_at);
    if (tenderFilter !== 'all') list = list.filter((s) => (s.tender_type ?? '').toLowerCase().includes(tenderFilter));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.receipt.toLowerCase().includes(q) || s.transaction.toLowerCase().includes(q));
    }
    return list;
  }, [sales, mode, tenderFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((Math.min(page, totalPages) - 1) * PAGE_SIZE, Math.min(page, totalPages) * PAGE_SIZE);

  return (
    <Modal visible={isOpen} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-gray-50 p-4 pt-10">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-gray-900">Sales History</Text>
          <Pressable onPress={onClose}>
            <Text className="text-sm text-gray-500">Close</Text>
          </Pressable>
        </View>

        <View className="mb-2 flex-row gap-2">
          <TextInput
            value={dateFrom}
            onChangeText={onDateFromChange}
            placeholder="YYYY-MM-DD"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <TextInput
            value={dateTo}
            onChangeText={onDateToChange}
            placeholder="YYYY-MM-DD"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Pressable onPress={onReload} className="items-center justify-center rounded-lg bg-black px-4">
            <Text className="text-sm font-semibold text-white">Reload</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
          <View className="flex-row gap-2">
            {(['all', 'sale', 'voided'] as ModeFilter[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                className={`rounded-full px-3 py-1.5 ${mode === m ? 'bg-black' : 'bg-gray-100'}`}
              >
                <Text className={`text-xs font-medium ${mode === m ? 'text-white' : 'text-gray-700'}`}>{m === 'all' ? 'All' : m === 'sale' ? 'Sales' : 'Voided'}</Text>
              </Pressable>
            ))}
            {TENDER_FILTERS.map((t) => (
              <Pressable
                key={t}
                onPress={() => setTenderFilter(t)}
                className={`rounded-full px-3 py-1.5 ${tenderFilter === t ? 'bg-black' : 'bg-gray-100'}`}
              >
                <Text className={`text-xs font-medium ${tenderFilter === t ? 'text-white' : 'text-gray-700'}`}>{t === 'all' ? 'Any tender' : t}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search receipt #"
          className="mb-2 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />

        {loading ? (
          <ActivityIndicator size="large" className="mt-8" />
        ) : error ? (
          <View className="items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <Text className="text-sm text-amber-800">{error}</Text>
            {pendingLocalSaleIds.length > 0 && (
              <Text className="text-xs text-amber-700">{pendingLocalSaleIds.length} sale(s) from this shift are still queued offline.</Text>
            )}
          </View>
        ) : (
          <ScrollView className="flex-1">
            {paged.length === 0 ? (
              <Text className="mt-8 text-center text-gray-400">No transactions found</Text>
            ) : (
              paged.map((sale) => (
                <TransactionRow
                  key={sale.id}
                  sale={sale}
                  expanded={expandedId === sale.id}
                  onToggle={() => setExpandedId((id) => (id === sale.id ? null : sale.id))}
                  isSettled={!!currentShiftDate && sale.date < currentShiftDate}
                  onVoidSale={onVoidSale}
                  onReprintSale={onReprintSale}
                  onRefundSale={onRefundSale}
                  isOfflineVoidQualified={isOfflineVoidQualified}
                  isOnline={isOnline}
                />
              ))
            )}
          </ScrollView>
        )}

        {totalPages > 1 && (
          <View className="mt-2 flex-row items-center justify-between">
            <Button variant="outline" disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </Button>
            <Text className="text-sm text-gray-600">
              Page {Math.min(page, totalPages)} of {totalPages}
            </Text>
            <Button variant="outline" disabled={page >= totalPages} onPress={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </Button>
          </View>
        )}
      </View>
    </Modal>
  );
}
