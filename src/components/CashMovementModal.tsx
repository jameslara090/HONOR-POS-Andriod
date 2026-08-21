/** Cash In / Cash Out during an open shift — ported from the desktop's CashMovementModal.tsx. */
import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { formatCurrency } from '../utils/currency';
import { Button } from './Button';

interface CashMovementModalProps {
  isOpen: boolean;
  storeId: number | null;
  register: string;
  onClose: () => void;
  onRecord: (params: { storeId: number; register: string; type: 'IN' | 'OUT'; amount: number; reason?: string }) => Promise<{ queued: boolean }>;
}

export function CashMovementModal({ isOpen, storeId, register, onClose, onRecord }: CashMovementModalProps) {
  const [type, setType] = useState<'IN' | 'OUT'>('IN');
  const [rawAmount, setRawAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isIn = type === 'IN';

  const handleSubmit = async () => {
    if (!storeId) return;
    const parsed = parseFloat(rawAmount);
    if (!parsed || parsed <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const { queued } = await onRecord({ storeId, register, type, amount: parsed, reason: reason.trim() || undefined });
      setSuccess(
        queued
          ? `Cash ${isIn ? 'In' : 'Out'} of ${formatCurrency(parsed)} queued — will sync when back online.`
          : `Cash ${isIn ? 'In' : 'Out'} of ${formatCurrency(parsed)} recorded.`
      );
      setRawAmount('');
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record cash movement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="w-full max-w-sm gap-4 rounded-2xl bg-white p-6">
          <Text className="text-lg font-bold text-gray-900">Cash Movement</Text>

          {error && (
            <View className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <Text className="text-sm font-medium text-red-700">{error}</Text>
            </View>
          )}
          {success && (
            <View className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <Text className="text-sm font-medium text-green-700">{success}</Text>
            </View>
          )}

          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setType('IN')}
              className={`flex-1 items-center rounded-xl border-2 py-3 ${isIn ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}
            >
              <Text className={`font-bold ${isIn ? 'text-green-700' : 'text-gray-600'}`}>Cash In</Text>
            </Pressable>
            <Pressable
              onPress={() => setType('OUT')}
              className={`flex-1 items-center rounded-xl border-2 py-3 ${!isIn ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}`}
            >
              <Text className={`font-bold ${!isIn ? 'text-red-700' : 'text-gray-600'}`}>Cash Out</Text>
            </Pressable>
          </View>
          <Text className="text-xs text-gray-400">
            {isIn ? 'Add cash to the drawer (e.g. float top-up, received reimbursement).' : 'Remove cash from the drawer (e.g. petty cash payout, bank deposit).'}
          </Text>

          <View>
            <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Amount (₱)</Text>
            <TextInput
              value={rawAmount}
              onChangeText={(v) => setRawAmount(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              autoFocus
              className="rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-xl font-bold text-gray-900"
            />
          </View>

          <View>
            <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Reason (optional)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Delivery courier, petty cash"
              className="rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900"
            />
          </View>

          <View className="flex-row gap-2">
            <Button variant={isIn ? 'primary' : 'danger'} onPress={handleSubmit} loading={submitting} disabled={submitting || !rawAmount}>
              {submitting ? 'Recording...' : `Record Cash ${isIn ? 'In' : 'Out'}`}
            </Button>
          </View>
          <Button variant="outline" onPress={onClose}>
            Done
          </Button>
        </View>
      </View>
    </Modal>
  );
}
