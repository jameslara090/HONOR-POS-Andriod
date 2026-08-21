/**
 * Refund flow — the desktop's RefundModal.tsx is dead code (built but never
 * wired into the app, and with no manager-approval step at all). This port
 * follows its lookup → items → confirm flow but, per a deliberate decision
 * for this port, adds the same manager-approval gate VoidConfirmModal uses
 * before a refund can submit (see the Phase 4 plan's finding 9).
 *
 * The approval is a client-side checkpoint only — recordPosRefund's payload
 * has no approved-by-manager field in the confirmed API shape (unlike void's
 * endpoint), and guessing at an unconfirmed extra field risked a server-side
 * validation rejection, so nothing extra is sent; the gate just blocks the
 * "Process Refund" action from being reachable without it.
 */
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { getPosSales, getSaleById, recordPosRefund } from '../api/pos';
import { DiscountManagerModal } from './DiscountManagerModal';
import { Button } from './Button';
import { formatCurrency } from '../utils/currency';
import type { PosSaleDetail, PosSaleSummary, ReceiptData } from '../types';

interface RefundModalProps {
  isOpen: boolean;
  storeId: number;
  register: string;
  preSelectedSaleId?: number | null;
  cashierName: string;
  isCurrentUserManagerOrOIC: boolean;
  onClose: () => void;
  onSuccess: (receipt: ReceiptData) => void;
}

type Step = 'lookup' | 'items';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RefundModal({ isOpen, storeId, register, preSelectedSaleId, cashierName, isCurrentUserManagerOrOIC, onClose, onSuccess }: RefundModalProps) {
  const [step, setStep] = useState<Step>(preSelectedSaleId ? 'items' : 'lookup');
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [search, setSearch] = useState('');
  const [lookupResults, setLookupResults] = useState<PosSaleSummary[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [saleDetail, setSaleDetail] = useState<PosSaleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [qtyByProduct, setQtyByProduct] = useState<Record<number, number>>({});
  const [selectedSerials, setSelectedSerials] = useState<Record<number, string[]>>({});

  const [showApproval, setShowApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setStep(preSelectedSaleId ? 'items' : 'lookup');
      setSearch('');
      setLookupResults([]);
      setLookupError(null);
      setSaleDetail(null);
      setDetailError(null);
      setQtyByProduct({});
      setSelectedSerials({});
      setShowApproval(false);
      setSubmitError(null);
      if (preSelectedSaleId) void loadSale(preSelectedSaleId);
    }
  }

  const loadSales = async () => {
    setLookupLoading(true);
    setLookupError(null);
    try {
      const result = await getPosSales({ storeId, dateFrom, dateTo });
      setLookupResults(result.filter((s) => s.mode === 'Sale' && !s.voided_at));
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Failed to load sales.');
    } finally {
      setLookupLoading(false);
    }
  };

  async function loadSale(saleId: number) {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const detail = await getSaleById(saleId);
      setSaleDetail(detail);
      setQtyByProduct({});
      setSelectedSerials({});
      setStep('items');
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Failed to load sale.');
    } finally {
      setDetailLoading(false);
    }
  }

  const filteredLookup = search.trim()
    ? lookupResults.filter((s) => s.receipt.toLowerCase().includes(search.trim().toLowerCase()))
    : lookupResults;

  const setQty = (productId: number, maxQty: number, value: number) => {
    const qty = Math.max(0, Math.min(value, maxQty));
    setQtyByProduct((prev) => ({ ...prev, [productId]: qty }));
    setSelectedSerials((prev) => ({ ...prev, [productId]: (prev[productId] ?? []).slice(0, qty) }));
  };

  const toggleSerial = (productId: number, maxQty: number, serial: string) => {
    setSelectedSerials((prev) => {
      const current = prev[productId] ?? [];
      if (current.includes(serial)) return { ...prev, [productId]: current.filter((s) => s !== serial) };
      if (current.length >= maxQty) return prev;
      return { ...prev, [productId]: [...current, serial] };
    });
  };

  const refundLines = (saleDetail?.items ?? [])
    .map((item) => ({ item, qty: qtyByProduct[item.product_id] ?? 0, serials: selectedSerials[item.product_id] ?? [] }))
    .filter((l) => l.qty > 0);

  const canProcess =
    refundLines.length > 0 && refundLines.every((l) => (!l.item.is_serialized || l.serials.length === l.qty));

  const refundTotal = refundLines.reduce((sum, l) => sum + l.item.price * l.qty, 0);

  const handleApproved = async () => {
    setShowApproval(false);
    if (!saleDetail || !canProcess) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await recordPosRefund({
        store_id: storeId,
        register,
        original_sale_id: saleDetail.id,
        items: refundLines.map((l) => ({ product_id: l.item.product_id, quantity: l.qty, is_serialized: l.item.is_serialized, serials: l.serials })),
      });
      const now = new Date();
      const receipt: ReceiptData = {
        id: result.transac,
        receiptNumber: result.receipt,
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        storeName: saleDetail.store_name ?? '',
        storeLocation: saleDetail.store_location ?? '',
        cashierName,
        terminalId: register,
        isRefund: true,
        originalReceiptNumber: saleDetail.receipt,
        items: refundLines.map((l) => ({ name: l.item.name, quantity: l.qty, unitPrice: l.item.price, lineTotal: l.item.price * l.qty, serialNumbers: l.serials })),
        subtotal: refundTotal,
        paymentMethod: 'refund',
        total: result.amount || refundTotal,
      };
      onSuccess(receipt);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to process refund.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="max-h-[85%] w-full max-w-md gap-3 rounded-2xl bg-white p-6">
          <Text className="text-lg font-bold text-gray-900">Refund</Text>

          {step === 'lookup' ? (
            <>
              <View className="flex-row gap-2">
                <TextInput value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <TextInput value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <Pressable onPress={loadSales} className="items-center justify-center rounded-lg bg-black px-4">
                  <Text className="text-sm font-semibold text-white">Search</Text>
                </Pressable>
              </View>
              <TextInput value={search} onChangeText={setSearch} placeholder="Filter by receipt #" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              {lookupError && <Text className="text-sm text-red-600">{lookupError}</Text>}
              <ScrollView className="max-h-64">
                {lookupLoading ? (
                  <ActivityIndicator className="py-4" />
                ) : filteredLookup.length === 0 ? (
                  <Text className="py-4 text-center text-sm text-gray-400">No sales found.</Text>
                ) : (
                  filteredLookup.map((s) => (
                    <Pressable key={s.id} onPress={() => void loadSale(s.id)} className="border-b border-gray-100 py-3 active:bg-gray-50">
                      <Text className="text-sm font-semibold text-gray-900">{s.receipt}</Text>
                      <Text className="text-xs text-gray-500">
                        {s.date} {s.time} · {formatCurrency(s.amount)}
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </>
          ) : detailLoading ? (
            <ActivityIndicator className="py-8" />
          ) : detailError ? (
            <Text className="text-sm text-red-600">{detailError}</Text>
          ) : saleDetail ? (
            <>
              <Text className="text-sm text-gray-600">Original receipt: {saleDetail.receipt}</Text>
              <ScrollView className="max-h-72">
                {saleDetail.items.map((item) => {
                  const qty = qtyByProduct[item.product_id] ?? 0;
                  const serials = selectedSerials[item.product_id] ?? [];
                  return (
                    <View key={item.product_id} className="mb-3 border-b border-gray-100 pb-3">
                      <View className="flex-row items-center justify-between">
                        <Text className="flex-1 text-sm font-semibold text-gray-900">{item.name}</Text>
                        <Text className="text-xs text-gray-500">of {item.quantity}</Text>
                      </View>
                      <View className="mt-1 flex-row items-center gap-2">
                        <Pressable onPress={() => setQty(item.product_id, item.quantity, qty - 1)} className="h-7 w-7 items-center justify-center rounded-md border border-gray-300">
                          <Text className="text-sm font-bold text-gray-700">−</Text>
                        </Pressable>
                        <Text className="w-8 text-center text-sm font-semibold text-gray-900">{qty}</Text>
                        <Pressable onPress={() => setQty(item.product_id, item.quantity, qty + 1)} className="h-7 w-7 items-center justify-center rounded-md border border-gray-300">
                          <Text className="text-sm font-bold text-gray-700">+</Text>
                        </Pressable>
                        <Text className="text-xs text-gray-500">to refund</Text>
                      </View>
                      {item.is_serialized && qty > 0 && (
                        <View className="mt-2 gap-1">
                          <Text className="text-xs text-gray-600">
                            Select {qty} serial(s) ({serials.length}/{qty} selected)
                          </Text>
                          <View className="flex-row flex-wrap gap-1">
                            {item.serials.map((sn) => {
                              const selected = serials.includes(sn);
                              return (
                                <Pressable
                                  key={sn}
                                  onPress={() => toggleSerial(item.product_id, qty, sn)}
                                  className={`rounded-md border px-2 py-1 ${selected ? 'border-black bg-black' : 'border-gray-300'}`}
                                >
                                  <Text className={`text-xs ${selected ? 'text-white' : 'text-gray-700'}`}>{sn}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              <View className="flex-row justify-between">
                <Text className="text-sm font-bold text-gray-900">Refund Total</Text>
                <Text className="text-sm font-bold text-gray-900">{formatCurrency(refundTotal)}</Text>
              </View>

              {submitError && <Text className="text-sm text-red-600">{submitError}</Text>}

              <Button onPress={() => setShowApproval(true)} disabled={!canProcess} loading={submitting}>
                Process Refund
              </Button>
              <Pressable onPress={() => setStep('lookup')} className="items-center py-1">
                <Text className="text-sm text-gray-500">‹ Back to search</Text>
              </Pressable>
            </>
          ) : null}

          <Pressable onPress={onClose} className="items-center py-1">
            <Text className="text-sm text-gray-500">Close</Text>
          </Pressable>
        </View>
      </View>

      <DiscountManagerModal
        isOpen={showApproval}
        allowOfflineApproval
        bypassApproval={isCurrentUserManagerOrOIC}
        onApprove={() => void handleApproved()}
        onCancel={() => setShowApproval(false)}
      />
    </Modal>
  );
}
