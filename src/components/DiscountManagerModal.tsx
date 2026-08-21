/**
 * Manager authorization — ported from the desktop's DiscountManagerModal.tsx.
 * Reused for two different authorizations via different prop combinations:
 * void approval (allowOfflineApproval + bypassApproval, no discount
 * selection, no remote approval) and discount approval (adds
 * withDiscountSelection + enableRemoteApproval + storeId/subtotal/
 * bypassUserId). verifyManagerCredentials (already built in authService.ts)
 * is called directly — no new auth work needed for the in-person/offline path.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNetworkState } from 'expo-network';
import { getPosDiscounts } from '../api/pos';
import { verifyManagerCredentials } from '../services/authService';
import { useDiscountApprovalPolling } from '../hooks/useDiscountApprovalPolling';
import type { PosDiscount, TransactionDiscount } from '../types';
import { formatCurrency } from '../utils/currency';
import { Button } from './Button';

const FIXED_TYPES = new Set(['fixed_percentage', 'fixed_amount']);
const IS_PERCENT = new Set(['fixed_percentage', 'variable_percentage']);

function typeLabel(rule: PosDiscount): string {
  const isPercent = IS_PERCENT.has(rule.discount_type ?? '');
  const isFixed = FIXED_TYPES.has(rule.discount_type ?? '');
  if (isFixed) return isPercent ? `${rule.discount_value}%` : formatCurrency(parseFloat(rule.discount_value ?? '0'));
  return isPercent ? 'Enter %' : 'Enter amount';
}

function computeDiscount(rule: PosDiscount, varValue: string): TransactionDiscount | null {
  const type = rule.discount_type ?? '';
  const isPercent = IS_PERCENT.has(type);
  if (FIXED_TYPES.has(type)) {
    const v = parseFloat(rule.discount_value ?? '');
    if (!isFinite(v) || v <= 0) return null;
    return { type: isPercent ? 'percent' : 'fixed', value: v, discountTypeId: rule.id };
  }
  const v = parseFloat(varValue);
  if (!isFinite(v) || v <= 0) return null;
  if (isPercent && v > 100) return null;
  return { type: isPercent ? 'percent' : 'fixed', value: v, discountTypeId: rule.id };
}

function discountPesoAmount(rule: PosDiscount, varValue: string, subtotal: number): number | null {
  const discount = computeDiscount(rule, varValue);
  if (!discount) return null;
  if (discount.type === 'fixed') return discount.value;
  return Math.round(subtotal * (discount.value / 100) * 100) / 100;
}

interface DiscountManagerModalProps {
  isOpen: boolean;
  onApprove: (managerToken?: string, managerId?: string, discount?: TransactionDiscount) => void;
  onCancel: () => void;
  /** When true: shows discount selection step before manager credentials. */
  withDiscountSelection?: boolean;
  /** When true: manager verification falls back to this device's cached credentials while offline. */
  allowOfflineApproval?: boolean;
  /** When true: adds a "Request approval remotely" option. Not used for void — void stays on role-based/offline-credential approval only. */
  enableRemoteApproval?: boolean;
  storeId?: number | null;
  subtotal?: number;
  /** When true: a manager/OIC is already logged in on this device — skips credentials entirely. Discount selection (if enabled) still happens first. */
  bypassApproval?: boolean;
  bypassUserId?: string;
}

type Step = 'select' | 'credentials';
type CredMode = 'credentials' | 'remote';

export function DiscountManagerModal({
  isOpen,
  onApprove,
  onCancel,
  withDiscountSelection,
  allowOfflineApproval,
  enableRemoteApproval,
  storeId,
  subtotal,
  bypassApproval,
  bypassUserId,
}: DiscountManagerModalProps) {
  const [step, setStep] = useState<Step>(withDiscountSelection ? 'select' : 'credentials');
  const [credMode, setCredMode] = useState<CredMode>('credentials');

  const [discounts, setDiscounts] = useState<PosDiscount[]>([]);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<PosDiscount | null>(null);
  const [varValue, setVarValue] = useState('');
  const [selectError, setSelectError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const network = useNetworkState();
  const isOnline = network.isConnected !== false;

  const { state: remoteState, send: sendRemote, cancel: cancelRemote, reset: resetRemote } = useDiscountApprovalPolling(
    (approvedByUserId) => {
      onApprove(undefined, String(approvedByUserId), selectedRule ? computeDiscount(selectedRule, varValue) ?? undefined : undefined);
    }
  );

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setStep(withDiscountSelection ? 'select' : 'credentials');
      setCredMode('credentials');
      setDiscounts([]);
      setLoadError(null);
      setSelectedRule(null);
      setVarValue('');
      setSelectError(null);
      setEmail('');
      setPassword('');
      setError(null);
      setShowCancelConfirm(false);
      resetRemote();
    }
  }

  // Void's usage (bypassApproval, no discount selection): auto-approve and render nothing.
  useEffect(() => {
    if (isOpen && bypassApproval && !withDiscountSelection) {
      onApprove(undefined, undefined);
    }
  }, [isOpen, bypassApproval, withDiscountSelection, onApprove]);

  useEffect(() => {
    if (!isOpen || !withDiscountSelection) return;
    let cancelled = false;
    (async () => {
      setLoadingDiscounts(true);
      setLoadError(null);
      try {
        const list = await getPosDiscounts();
        if (!cancelled) setDiscounts(list);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load discounts.');
      } finally {
        if (!cancelled) setLoadingDiscounts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, withDiscountSelection]);

  if (bypassApproval && !withDiscountSelection) return null;

  const handleNext = () => {
    if (!selectedRule) {
      setSelectError('Select a discount.');
      return;
    }
    const isVariable = !FIXED_TYPES.has(selectedRule.discount_type ?? '');
    if (isVariable) {
      const v = parseFloat(varValue);
      if (!isFinite(v) || v <= 0) {
        setSelectError('Enter a valid amount.');
        return;
      }
      if (IS_PERCENT.has(selectedRule.discount_type ?? '') && v > 100) {
        setSelectError('Percent cannot exceed 100.');
        return;
      }
    }
    setSelectError(null);
    if (bypassApproval) {
      onApprove(undefined, bypassUserId, computeDiscount(selectedRule, varValue) ?? undefined);
      return;
    }
    setStep('credentials');
  };

  const handleSubmitCredentials = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyManagerCredentials(email.trim(), password, !!allowOfflineApproval);
      if (!result.ok) {
        setError(result.message || 'Invalid manager credentials.');
        return;
      }
      const managerId = result.userId ?? email.trim();
      if (withDiscountSelection && selectedRule) {
        onApprove(result.managerToken, managerId ?? undefined, computeDiscount(selectedRule, varValue) ?? undefined);
      } else {
        onApprove(result.managerToken, managerId ?? undefined);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendRemote = () => {
    if (!selectedRule) return;
    void sendRemote({
      storeId: storeId ?? 0,
      discountAmount: discountPesoAmount(selectedRule, varValue, subtotal ?? 0) ?? 0,
      discountReason: selectedRule.discount_name,
      saleSubtotal: subtotal,
    });
  };

  const handleClose = () => {
    if (submitting) return;
    setShowCancelConfirm(false);
    onCancel();
  };

  let body: ReactNode;

  if (showCancelConfirm) {
    body = (
      <>
        <Text className="text-lg font-bold text-gray-900">Cancel authorization?</Text>
        <Text className="text-sm text-gray-600">This will discard the pending approval.</Text>
        <Button variant="danger" onPress={handleClose}>
          Yes, Cancel
        </Button>
        <Button variant="outline" onPress={() => setShowCancelConfirm(false)}>
          Go Back
        </Button>
      </>
    );
  } else if (step === 'select') {
    const isVariable = selectedRule && !FIXED_TYPES.has(selectedRule.discount_type ?? '');
    body = (
      <>
        <Text className="text-lg font-bold text-gray-900">Select Discount</Text>
        {loadingDiscounts ? (
          <ActivityIndicator />
        ) : loadError ? (
          <Text className="text-sm text-red-600">{loadError}</Text>
        ) : (
          <ScrollView className="max-h-64">
            {discounts.map((rule) => {
              const active = selectedRule?.id === rule.id;
              return (
                <Pressable
                  key={rule.id}
                  onPress={() => {
                    setSelectedRule(rule);
                    setVarValue('');
                    setSelectError(null);
                  }}
                  className={`mb-2 rounded-lg border p-3 ${active ? 'border-black bg-gray-50' : 'border-gray-200'}`}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-gray-900">{rule.discount_name}</Text>
                    <Text className="text-xs text-gray-500">{typeLabel(rule)}</Text>
                  </View>
                  {active && isVariable && (
                    <TextInput
                      value={varValue}
                      onChangeText={setVarValue}
                      keyboardType="decimal-pad"
                      placeholder={IS_PERCENT.has(rule.discount_type ?? '') ? '0-100' : '0.00'}
                      autoFocus
                      className="mt-2 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        {selectError && <Text className="text-sm text-red-600">{selectError}</Text>}
        <Button onPress={handleNext}>Next</Button>
        <Pressable onPress={() => setShowCancelConfirm(true)} className="items-center py-1">
          <Text className="text-sm text-gray-500">Cancel</Text>
        </Pressable>
      </>
    );
  } else {
    // step === 'credentials'
    body = (
      <>
        <Text className="text-lg font-bold text-gray-900">Manager Authorization</Text>

        {enableRemoteApproval && (
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setCredMode('credentials')}
              className={`flex-1 items-center rounded-md py-2 ${credMode === 'credentials' ? 'bg-black' : 'bg-gray-100'}`}
            >
              <Text className={`text-sm font-semibold ${credMode === 'credentials' ? 'text-white' : 'text-gray-700'}`}>Manager is here</Text>
            </Pressable>
            <Pressable
              onPress={() => isOnline && setCredMode('remote')}
              disabled={!isOnline}
              className={`flex-1 items-center rounded-md py-2 ${credMode === 'remote' ? 'bg-black' : 'bg-gray-100'} ${!isOnline ? 'opacity-40' : ''}`}
            >
              <Text className={`text-sm font-semibold ${credMode === 'remote' ? 'text-white' : 'text-gray-700'}`}>Request remotely</Text>
            </Pressable>
          </View>
        )}

        {credMode === 'remote' ? (
          remoteState.phase === 'idle' ? (
            <>
              <Text className="text-sm text-gray-600">
                Sends a request to the notification bell of any approver, any store. Expires in 5 minutes if nobody
                responds. Checkout stays blocked until then.
              </Text>
              <Button onPress={handleSendRemote}>Send request</Button>
            </>
          ) : remoteState.phase === 'sending' || remoteState.phase === 'waiting' ? (
            <>
              <ActivityIndicator />
              <Text className="text-center text-sm text-gray-600">Waiting for an approver to respond…</Text>
              <Button variant="outline" onPress={cancelRemote}>
                Cancel request
              </Button>
            </>
          ) : (
            <>
              <Text className="text-sm text-red-600">{remoteState.phase === 'error' ? remoteState.message : ''}</Text>
              <Button onPress={resetRemote}>Try again</Button>
            </>
          )
        ) : (
          <>
            {allowOfflineApproval && !isOnline && (
              <Text className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                Offline — will verify against this device&rsquo;s cached manager credentials.
              </Text>
            )}
            <View>
              <Text className="mb-1 text-xs font-medium text-gray-700">Email or User ID</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoFocus
                className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
            </View>
            <View>
              <Text className="mb-1 text-xs font-medium text-gray-700">Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
            </View>
            {error && <Text className="text-sm text-red-600">{error}</Text>}
            <Button onPress={handleSubmitCredentials} loading={submitting} disabled={!email.trim() || !password}>
              Authorize
            </Button>
          </>
        )}

        {withDiscountSelection && (
          <Pressable onPress={() => setStep('select')} className="items-center py-1">
            <Text className="text-sm text-gray-500">‹ Back</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setShowCancelConfirm(true)} className="items-center py-1">
          <Text className="text-sm text-gray-500">Cancel</Text>
        </Pressable>
      </>
    );
  }

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={handleClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="w-full max-w-sm gap-3 rounded-2xl bg-white p-6">{body}</View>
      </View>
    </Modal>
  );
}
