/**
 * Void reason collection — ported from the desktop's VoidConfirmModal.tsx.
 * Pure reason-collection UI; it calls no API itself. The screen opens a
 * separate DiscountManagerModal (void's prop combination) for approval
 * after confirm, then calls voidPosSale.
 */
import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Button } from './Button';

interface VoidConfirmModalProps {
  isOpen: boolean;
  receiptNumber: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  voiding?: boolean;
  error?: string | null;
}

const VOID_REASONS: { value: string; label: string }[] = [
  { value: 'customer_request', label: 'Customer request' },
  { value: 'duplicate_transaction', label: 'Duplicate transaction' },
  { value: 'incorrect_items', label: 'Incorrect items' },
  { value: 'incorrect_amount', label: 'Incorrect amount' },
  { value: 'other', label: 'Other' },
];

export function VoidConfirmModal({ isOpen, receiptNumber, onConfirm, onClose, voiding, error }: VoidConfirmModalProps) {
  const [voidReason, setVoidReason] = useState(VOID_REASONS[0].value);
  const [otherDetail, setOtherDetail] = useState('');

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setVoidReason(VOID_REASONS[0].value);
      setOtherDetail('');
    }
  }

  const isOther = voidReason === 'other';
  const canSubmit = !isOther || otherDetail.trim() !== '';

  const handleConfirm = () => {
    if (!canSubmit) return;
    const label = VOID_REASONS.find((r) => r.value === voidReason)?.label ?? voidReason;
    onConfirm(isOther ? `Other: ${otherDetail.trim()}` : label);
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={() => !voiding && onClose()}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="w-full max-w-sm gap-3 rounded-2xl bg-white p-6">
          <Text className="text-lg font-bold text-gray-900">Void Sale #{receiptNumber}</Text>
          <Text className="text-sm text-gray-600">This requires manager authorization and cannot be undone.</Text>

          <View className="gap-2">
            {VOID_REASONS.map((r) => (
              <Pressable
                key={r.value}
                onPress={() => setVoidReason(r.value)}
                className={`rounded-lg border px-3 py-2.5 ${voidReason === r.value ? 'border-black bg-gray-50' : 'border-gray-300'}`}
              >
                <Text className="text-sm text-gray-800">{r.label}</Text>
              </Pressable>
            ))}
          </View>

          {isOther && (
            <TextInput
              value={otherDetail}
              onChangeText={setOtherDetail}
              placeholder="Describe the reason"
              autoFocus
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            />
          )}

          {error && <Text className="text-sm text-red-600">{error}</Text>}

          <Button onPress={handleConfirm} disabled={!canSubmit} loading={!!voiding}>
            Void Sale
          </Button>
          <Pressable onPress={onClose} disabled={!!voiding} className="items-center py-1">
            <Text className="text-sm text-gray-500">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
