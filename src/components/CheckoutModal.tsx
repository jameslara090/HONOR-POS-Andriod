/**
 * Checkout wizard — ported from the desktop's CheckoutModal.tsx. Payment
 * methods are one generic, catalog-driven tender UI (not per-method
 * handlers): the backend's tender-type catalog buckets into a tender_class,
 * and the same amount+reference form renders for every non-cash,
 * non-installment class. The desktop's separate bank-name drill-down step
 * is flattened into one tender list per class (grouped by bank as a section
 * label) — simpler for touch, same resulting tenderCode.
 *
 * PayMongo is not ported — removed from the desktop source entirely (see
 * the Phase 3 plan's finding 1). Installment has no term/financing-partner
 * picker to port either — the desktop's own CheckoutModal never populates
 * PosSaleInstallment (finding 3): it's just a tender-catalog entry requiring
 * a linked customer.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { getPosTenderTypes, recordPosSale, validatePromoter } from '../api/pos';
import { getDefaultStoreInfo } from '../services/terminalConfig';
import { formatCurrency } from '../utils/currency';
import type {
  CartItem,
  CheckoutTenderHint,
  PosCustomer,
  PosSaleRequest,
  PosSaleResult,
  PosTenderType,
  ReceiptData,
  SplitPaymentEntry,
  TransactionDiscount,
} from '../types';
import { Button } from './Button';
import { CashDenominationModal } from './CashDenominationModal';
import { CustomerSelectModal } from './CustomerSelectModal';

const VAT_RATE = 0.12;

type TenderClassKey = 'cash' | 'ewallet' | 'credit_card' | 'check' | 'installment' | 'financing' | 'other';

const CLASS_ORDER: TenderClassKey[] = ['cash', 'ewallet', 'credit_card', 'check', 'installment', 'financing', 'other'];
const CLASS_LABELS: Record<TenderClassKey, string> = {
  cash: 'Cash',
  ewallet: 'E-Wallet',
  credit_card: 'Card',
  check: 'Bank Transfer / Check',
  installment: 'Installment',
  financing: 'Financing',
  other: 'Other',
};

function normalizeTenderClassKey(tenderClass: string | null | undefined): TenderClassKey {
  const tc = (tenderClass ?? 'other').toLowerCase();
  switch (tc) {
    case 'cash':
      return 'cash';
    case 'ewallet':
      return 'ewallet';
    case 'credit_card':
    case 'debit_card':
      return 'credit_card';
    case 'installment':
      return 'installment';
    case 'financing':
      return 'financing';
    case 'check':
    case 'bank_transfer':
      return 'check';
    default:
      return 'other';
  }
}

function isInstallmentLikeClass(tenderClass: string | null | undefined): boolean {
  const key = normalizeTenderClassKey(tenderClass);
  return key === 'installment' || key === 'financing';
}

function referenceLabelForClass(tenderClass: string): string {
  switch (normalizeTenderClassKey(tenderClass)) {
    case 'credit_card':
      return 'Approval Code';
    case 'ewallet':
      return 'Transaction ID';
    case 'check':
      return 'Check / Reference Number';
    default:
      return 'Reference Number';
  }
}

const FINANCING_REFERENCE_LABELS: Record<string, string> = { 'home credit': 'Home Credit', skyro: 'Skyro' };
function financingReferenceLabel(tenderName: string): string | null {
  return FINANCING_REFERENCE_LABELS[tenderName.trim().toLowerCase()] ?? null;
}

function metaBool(meta: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const v = meta?.[key];
  return typeof v === 'boolean' ? v : fallback;
}

function resolveInitialClassKey(hint: CheckoutTenderHint | undefined): TenderClassKey | null {
  switch (hint) {
    case 'cash':
      return 'cash';
    case 'gcash':
      return 'ewallet';
    case 'credit_card':
      return 'credit_card';
    case 'bank_transfer':
      return 'check';
    case 'installment':
      return 'installment';
    default:
      return null;
  }
}

function buildReceiptData(params: {
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  discount: TransactionDiscount;
  total: number;
  payments: SplitPaymentEntry[];
  cashierName: string;
  change?: number;
  terminalId: string;
  saleResult: PosSaleResult;
  customerName?: string;
  promoterName?: string;
}): ReceiptData {
  const now = new Date();
  const store = getDefaultStoreInfo();
  const paymentList = params.payments.map((p) => ({ method: p.tenderCode, label: p.label, amount: p.amount, referenceNumber: p.referenceNumber }));
  const singleMethod = params.payments.length === 1 ? (params.payments[0].tenderClass === 'cash' ? 'cash' : params.payments[0].tenderCode) : 'split';
  const amountTendered = paymentList.length === 1 ? params.payments[0].amount : undefined;
  const discountLabel =
    params.discount?.type === 'percent'
      ? `${params.discount.value}% off`
      : params.discount?.type === 'fixed'
        ? `${formatCurrency(params.discount.value)} off`
        : undefined;
  const vatableSales = params.total > 0 ? params.total / (1 + VAT_RATE) : 0;
  const vatAmount = params.total > 0 ? params.total - vatableSales : 0;

  return {
    id: params.saleResult.transac,
    receiptNumber: params.saleResult.receipt,
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    storeName: store.name,
    storeLocation: store.location,
    cashierName: params.cashierName,
    customerName: params.customerName,
    promoterName: params.promoterName,
    terminalId: params.terminalId,
    items: params.items.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      unitPrice: item.product.price,
      lineTotal: item.product.price * item.quantity,
      serialNumbers: item.serialNumbers,
    })),
    subtotal: params.subtotal,
    discountAmount: params.discountAmount > 0 ? params.discountAmount : undefined,
    discountLabel,
    paymentMethod: singleMethod,
    amountTendered,
    change: params.change,
    payments: paymentList.length > 0 ? paymentList : undefined,
    vatableSales,
    vatAmount,
    total: params.total,
  };
}

interface CheckoutModalProps {
  isOpen: boolean;
  initialTenderHint?: CheckoutTenderHint;
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  discount: TransactionDiscount;
  /** The manager/approver id that authorized the current `discount`, if any (see DiscountManagerModal). */
  discountManagerId?: string | null;
  total: number;
  storeId: number;
  register: string;
  cashierName: string;
  onClose: () => void;
  onSuccess: (receipt: ReceiptData) => void;
}

export function CheckoutModal({
  isOpen,
  initialTenderHint,
  items,
  subtotal,
  discountAmount,
  discount,
  discountManagerId,
  total,
  storeId,
  register,
  cashierName,
  onClose,
  onSuccess,
}: CheckoutModalProps) {
  const [tenderTypes, setTenderTypes] = useState<PosTenderType[]>([]);
  const [activeClassKey, setActiveClassKey] = useState<TenderClassKey | null>(null);
  const [selection, setSelection] = useState<PosTenderType | null>(null);
  const [amountReceived, setAmountReceived] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [addedPayments, setAddedPayments] = useState<SplitPaymentEntry[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showCashCalculator, setShowCashCalculator] = useState(false);

  const [promoterId, setPromoterId] = useState('');
  const [promoterValidating, setPromoterValidating] = useState(false);
  const [promoterValid, setPromoterValid] = useState<boolean | null>(null);
  const [promoterOffline, setPromoterOffline] = useState(false);
  const [promoterError, setPromoterError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setActiveClassKey(resolveInitialClassKey(initialTenderHint));
      setSelection(null);
      setAmountReceived('');
      setReferenceNumber('');
      setAddedPayments([]);
      setSelectedCustomer(null);
      setPromoterId('');
      setPromoterValid(null);
      setPromoterOffline(false);
      setPromoterError(null);
      setSubmitError(null);
      void getPosTenderTypes().then(setTenderTypes);
    }
  }

  const tendersByClass = useMemo(() => {
    const map = new Map<TenderClassKey, PosTenderType[]>();
    for (const t of tenderTypes) {
      const key = normalizeTenderClassKey(t.tender_class);
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [tenderTypes]);

  const availableClasses = CLASS_ORDER.filter((key) => (tendersByClass.get(key) ?? []).length > 0);

  const isCash = selection?.tender_class === 'cash';
  const isInstallmentLike = selection ? isInstallmentLikeClass(selection.tender_class) : false;
  const tenderMeta = selection?.metadata;

  const totalAdded = addedPayments.reduce((sum, p) => sum + p.amount, 0);
  const remainingBalance = Math.max(0, total - totalAdded);

  const rawInput = parseFloat(amountReceived);
  const currentInputAmount = Number.isNaN(rawInput) ? 0 : rawInput;
  const hasTypedAmount = amountReceived.trim() !== '';
  const currentChargeAmount = !selection || isInstallmentLike ? 0 : isCash || hasTypedAmount ? currentInputAmount : remainingBalance;
  const totalTendered = totalAdded + currentChargeAmount;
  const change = isCash && totalTendered > total ? totalTendered - total : 0;
  const fullyPaidBySplits = remainingBalance === 0 && addedPayments.length > 0 && totalAdded >= total;

  const financingLabel = selection ? financingReferenceLabel(selection.name) : null;
  const requiresFinancingReference = isInstallmentLike && !!financingLabel;
  const requiresReference = selection != null && metaBool(tenderMeta, 'requires_reference', (!isCash && !isInstallmentLike) || requiresFinancingReference);
  const referenceMissing = requiresReference && referenceNumber.trim() === '';
  const tenderRequiresCustomer = selection != null && metaBool(tenderMeta, 'requires_customer', isInstallmentLike);
  const needsInstallmentCustomer = isInstallmentLike && !selectedCustomer;
  const needsTenderCustomer = tenderRequiresCustomer && !selectedCustomer;
  const discountBlocked = metaBool(tenderMeta, 'disallow_discount', false) && discountAmount > 0;
  const installmentReady = isInstallmentLike && !!selectedCustomer && remainingBalance > 0;
  const tenderDisallowsSplit = metaBool(tenderMeta, 'disallow_split', false);

  const isSplitEligible =
    !tenderDisallowsSplit && !isInstallmentLike && currentInputAmount > 0 && totalTendered < total && selection != null && !referenceMissing;

  const canComplete =
    !submitting &&
    promoterId.trim() !== '' &&
    (promoterValid === true || promoterOffline) &&
    (fullyPaidBySplits ||
      (selection != null && !needsInstallmentCustomer && !needsTenderCustomer && !discountBlocked && !referenceMissing && (installmentReady || totalTendered >= total)));

  const referenceLabel = selection ? (requiresFinancingReference ? `${financingLabel} #` : referenceLabelForClass(selection.tender_class)) : 'Reference Number';

  const makeEntry = (amount: number): SplitPaymentEntry => {
    if (!selection) throw new Error('No payment method selected');
    return {
      amount,
      label: selection.name,
      tenderCode: selection.code,
      tenderClass: selection.tender_class,
      referenceNumber: referenceNumber.trim() || undefined,
      metadata: selection.metadata ?? {},
    };
  };

  const handleAddSplit = () => {
    if (!isSplitEligible) return;
    setAddedPayments((prev) => [...prev, makeEntry(currentInputAmount)]);
    setAmountReceived('');
    setReferenceNumber('');
  };

  const handleRemoveSplit = (index: number) => {
    setAddedPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePromoterBlur = async () => {
    const id = promoterId.trim();
    if (!id) {
      setPromoterValid(null);
      setPromoterOffline(false);
      setPromoterError(null);
      return;
    }
    setPromoterValidating(true);
    try {
      const result = await validatePromoter(id, storeId);
      setPromoterValid(result.valid);
      setPromoterOffline(!!result.offline);
      setPromoterError(result.valid ? null : result.message ?? 'Promoter not recognized.');
    } catch (e) {
      setPromoterValid(false);
      setPromoterOffline(false);
      setPromoterError(e instanceof Error ? e.message : 'Failed to validate promoter.');
    } finally {
      setPromoterValidating(false);
    }
  };

  const handleComplete = async () => {
    if (!canComplete) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const finalPayments = fullyPaidBySplits ? addedPayments : [...addedPayments, makeEntry(isCash ? currentInputAmount : remainingBalance)];
      // No new cash is tendered in the fullyPaidBySplits branch — any overage
      // already happened when the splits were added, not now — so change is
      // explicitly undefined here, matching the desktop's onConfirm call.
      const finalChange = !fullyPaidBySplits && isCash && change > 0 ? change : undefined;
      const tenderType = finalPayments.length === 1 ? finalPayments[0].tenderCode : finalPayments.map((p) => p.tenderCode).join('/');
      const discountCode = discount?.type === 'percent' ? `${discount.value}%` : discount?.type === 'fixed' ? 'OPEN AMT' : undefined;

      const payload: PosSaleRequest = {
        store_id: storeId,
        register,
        customer_name: selectedCustomer?.name ?? null,
        customer_id: selectedCustomer && selectedCustomer.id > 0 ? selectedCustomer.id : null,
        promoter_id: promoterId.trim(),
        discount_code: discountCode ?? null,
        discount_amt: discountAmount,
        discount_type_id: discount?.discountTypeId ?? null,
        discount_manager_id: discountManagerId ?? null,
        tender_type: tenderType,
        trantype: 'Retail',
        change_amount: finalChange ?? 0,
        payments: finalPayments.map((p) => ({ method: p.tenderCode, amount: p.amount, reference_number: p.referenceNumber ?? null })),
        items: items.map((item) => ({
          product_id: parseInt(item.product.id, 10),
          name: item.product.name,
          sku: item.product.sku,
          price: item.product.price,
          quantity: item.quantity,
          is_serialized: !!item.product.isSerialized,
          serials: item.serialNumbers.filter(Boolean),
        })),
        installment: null,
      };

      const result = await recordPosSale(payload);
      const receipt = buildReceiptData({
        items,
        subtotal,
        discountAmount,
        discount,
        total,
        payments: finalPayments,
        cashierName,
        change: finalChange,
        terminalId: register,
        saleResult: result,
        customerName: selectedCustomer?.name,
        promoterName: promoterId.trim(),
      });
      onSuccess(receipt);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to record sale. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
      <View className="max-h-[90%] w-full max-w-lg gap-3 rounded-2xl bg-white p-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-gray-900">Checkout</Text>
          <Pressable onPress={onClose}>
            <Text className="text-2xl text-gray-400">×</Text>
          </Pressable>
        </View>

        <View className="flex-row justify-between rounded-lg bg-gray-50 p-3">
          <View>
            <Text className="text-xs text-gray-500">Subtotal</Text>
            <Text className="text-sm text-gray-900">{formatCurrency(subtotal)}</Text>
            {discountAmount > 0 && <Text className="text-xs text-green-600">-{formatCurrency(discountAmount)} discount</Text>}
          </View>
          <View className="items-end">
            <Text className="text-xs text-gray-500">Total</Text>
            <Text className="text-lg font-bold text-gray-900">{formatCurrency(total)}</Text>
          </View>
        </View>

        {addedPayments.length > 0 && (
          <View className="gap-1 rounded-lg bg-green-50 p-3">
            {addedPayments.map((p, i) => (
              <View key={i} className="flex-row items-center justify-between">
                <Text className="flex-1 text-xs text-green-800">
                  {p.label}
                  {p.referenceNumber ? ` · Ref: ${p.referenceNumber}` : ''}
                </Text>
                <Text className="text-xs font-semibold text-green-800">{formatCurrency(p.amount)}</Text>
                <Pressable onPress={() => handleRemoveSplit(i)} className="pl-2">
                  <Text className="text-xs text-red-600">Remove</Text>
                </Pressable>
              </View>
            ))}
            <Text className="text-xs font-medium text-green-900">Remaining balance: {formatCurrency(remainingBalance)}</Text>
          </View>
        )}

        <ScrollView className="max-h-64">
          {!selection ? (
            !activeClassKey ? (
              <View className="flex-row flex-wrap gap-2">
                {availableClasses.map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => setActiveClassKey(key)}
                    className="min-w-[45%] flex-1 items-center rounded-lg border border-gray-300 py-4"
                  >
                    <Text className="text-sm font-semibold text-gray-800">{CLASS_LABELS[key]}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View className="gap-2">
                <Pressable onPress={() => setActiveClassKey(null)} className="mb-1">
                  <Text className="text-sm text-gray-500">‹ Back</Text>
                </Pressable>
                {(tendersByClass.get(activeClassKey) ?? []).map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => setSelection(t)}
                    className="rounded-lg border border-gray-300 px-3 py-3 active:bg-gray-50"
                  >
                    <Text className="text-sm font-semibold text-gray-800">{t.name}</Text>
                    {t.bank_name && <Text className="text-xs text-gray-500">{t.bank_name}</Text>}
                  </Pressable>
                ))}
              </View>
            )
          ) : (
            <View className="gap-3">
              <Pressable
                onPress={() => {
                  setSelection(null);
                  setAmountReceived('');
                  setReferenceNumber('');
                }}
              >
                <Text className="text-sm text-gray-500">‹ Change payment method ({selection.name})</Text>
              </Pressable>

              {isInstallmentLike ? (
                <View className="items-center gap-2 rounded-lg border border-gray-200 p-4">
                  <Text className="text-center text-sm text-gray-700">
                    Installment for remaining <Text className="font-bold">{formatCurrency(remainingBalance)}</Text>.
                  </Text>
                  {!selectedCustomer ? (
                    <Text className="text-sm font-semibold text-red-500">Link a customer to proceed.</Text>
                  ) : (
                    <Text className="text-sm text-gray-600">Customer: {selectedCustomer.name}</Text>
                  )}
                  <Button variant="outline" onPress={() => setShowCustomerModal(true)}>
                    {selectedCustomer ? 'Change Customer' : 'Link Customer'}
                  </Button>
                  {requiresFinancingReference && (
                    <View className="w-full">
                      <Text className="mb-1 text-xs font-medium text-gray-700">{referenceLabel} *</Text>
                      <TextInput
                        value={referenceNumber}
                        onChangeText={setReferenceNumber}
                        className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                      />
                      {referenceMissing && <Text className="mt-1 text-xs text-red-600">{referenceLabel} is required for this payment.</Text>}
                    </View>
                  )}
                </View>
              ) : (
                <View className="gap-2">
                  <View>
                    <Text className="mb-1 text-xs font-medium text-gray-700">Amount to Charge</Text>
                    <View className="flex-row gap-2">
                      <TextInput
                        value={amountReceived}
                        onChangeText={setAmountReceived}
                        keyboardType="decimal-pad"
                        placeholder={remainingBalance.toFixed(2)}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                      />
                      {isCash && (
                        <Pressable onPress={() => setShowCashCalculator(true)} className="items-center justify-center rounded-lg border border-gray-300 px-3">
                          <Text className="text-xs font-semibold text-gray-700">Count Cash</Text>
                        </Pressable>
                      )}
                    </View>
                    {!isCash && <Text className="mt-1 text-xs text-gray-400">Leave blank to charge the remaining balance.</Text>}
                  </View>

                  <View>
                    <Text className="mb-1 text-xs font-medium text-gray-700">
                      {referenceLabel}
                      {requiresReference ? ' *' : ''}
                    </Text>
                    <TextInput
                      value={referenceNumber}
                      onChangeText={setReferenceNumber}
                      className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                    />
                    {referenceMissing && <Text className="mt-1 text-xs text-red-600">{referenceLabel} is required for this payment.</Text>}
                  </View>

                  {isCash && change > 0 && <Text className="text-sm font-bold text-green-600">Change: {formatCurrency(change)}</Text>}

                  {isSplitEligible && (
                    <Button variant="outline" onPress={handleAddSplit}>
                      Add as Split Payment
                    </Button>
                  )}
                </View>
              )}

              {tenderRequiresCustomer && !isInstallmentLike && (
                <Button variant="outline" onPress={() => setShowCustomerModal(true)}>
                  {selectedCustomer ? `Customer: ${selectedCustomer.name}` : 'Link Customer (required)'}
                </Button>
              )}
              {discountBlocked && (
                <Text className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                  Selected tender does not allow discounts. Remove the discount or choose another payment method.
                </Text>
              )}
            </View>
          )}
        </ScrollView>

        <View>
          <Text className="mb-1 text-xs font-medium text-gray-700">Promoter ID *</Text>
          <View className="flex-row items-center gap-2">
            <TextInput
              value={promoterId}
              onChangeText={(v) => {
                setPromoterId(v);
                setPromoterValid(null);
                setPromoterOffline(false);
                setPromoterError(null);
              }}
              onBlur={handlePromoterBlur}
              autoCapitalize="none"
              className={`flex-1 rounded-lg border px-3 py-2.5 text-sm ${promoterError ? 'border-red-400' : 'border-gray-300'}`}
            />
            {promoterValidating && <ActivityIndicator size="small" />}
          </View>
          {promoterOffline && <Text className="mt-1 text-xs text-amber-600">Offline — accepted as entered, will verify once back online.</Text>}
          {!promoterOffline && promoterError && <Text className="mt-1 text-xs text-red-600">{promoterError}</Text>}
        </View>

        {submitError && <Text className="text-sm text-red-600">{submitError}</Text>}

        <Button onPress={handleComplete} disabled={!canComplete} loading={submitting}>
          Complete Payment
        </Button>
        <Pressable onPress={onClose} className="items-center py-1">
          <Text className="text-sm text-gray-500">Cancel</Text>
        </Pressable>
      </View>

      <CashDenominationModal isOpen={showCashCalculator} onClose={() => setShowCashCalculator(false)} onApply={(t) => setAmountReceived(String(t))} />
      <CustomerSelectModal
        isOpen={showCustomerModal}
        required={tenderRequiresCustomer}
        selectedCustomer={selectedCustomer}
        onSelect={setSelectedCustomer}
        onClose={() => setShowCustomerModal(false)}
      />
      </View>
    </Modal>
  );
}
