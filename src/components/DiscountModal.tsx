/**
 * Manual discount entry — ported from the desktop's DiscountModal.tsx. Pure
 * "compose a discount" UI with no knowledge of manager approval; the parent
 * screen decides whether to close this and/or open DiscountManagerModal.
 */
import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import type { TransactionDiscount } from '../types';
import { formatCurrency } from '../utils/currency';
import { Button } from './Button';

interface DiscountModalProps {
  isOpen: boolean;
  subtotal: number;
  currentDiscount: TransactionDiscount;
  onApply: (discount: TransactionDiscount) => void;
  onClose: () => void;
}

export function DiscountModal({ isOpen, subtotal, currentDiscount, onApply, onClose }: DiscountModalProps) {
  const [type, setType] = useState<'percent' | 'fixed'>(currentDiscount?.type ?? 'percent');
  const [value, setValue] = useState(currentDiscount ? String(currentDiscount.value) : '');
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setType(currentDiscount?.type ?? 'percent');
      setValue(currentDiscount ? String(currentDiscount.value) : '');
      setError(null);
    }
  }

  const num = parseFloat(value) || 0;
  const canApply = subtotal > 0;
  const discountAmount = type === 'percent' ? Math.min((subtotal * num) / 100, subtotal) : Math.min(num, subtotal);
  const totalAfter = subtotal - discountAmount;

  const isValid = canApply && num > 0 && !(type === 'percent' && num > 100) && !(type === 'fixed' && num > subtotal);

  const handleApply = () => {
    if (!canApply) {
      setError('Add an item to the cart before applying a discount.');
      return;
    }
    if (!isValid) {
      setError('Enter a valid discount amount.');
      return;
    }
    setError(null);
    onApply({ type, value: num });
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="w-full max-w-sm gap-3 rounded-2xl bg-white p-6">
          <Text className="text-lg font-bold text-gray-900">Discount</Text>

          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setType('percent')}
              className={`flex-1 items-center rounded-md py-2 ${type === 'percent' ? 'bg-black' : 'bg-gray-100'}`}
            >
              <Text className={`text-sm font-semibold ${type === 'percent' ? 'text-white' : 'text-gray-700'}`}>Percent</Text>
            </Pressable>
            <Pressable
              onPress={() => setType('fixed')}
              className={`flex-1 items-center rounded-md py-2 ${type === 'fixed' ? 'bg-black' : 'bg-gray-100'}`}
            >
              <Text className={`text-sm font-semibold ${type === 'fixed' ? 'text-white' : 'text-gray-700'}`}>Fixed Amount</Text>
            </Pressable>
          </View>

          <TextInput
            value={value}
            onChangeText={(v) => {
              setValue(v);
              setError(null);
            }}
            keyboardType="decimal-pad"
            placeholder={type === 'percent' ? '0-100' : '0.00'}
            autoFocus
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-base"
          />

          {num > 0 && (
            <View className="gap-1 rounded-lg bg-gray-50 p-3">
              <View className="flex-row justify-between">
                <Text className="text-xs text-gray-600">Subtotal</Text>
                <Text className="text-xs text-gray-900">{formatCurrency(subtotal)}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs text-green-600">Discount</Text>
                <Text className="text-xs text-green-600">-{formatCurrency(discountAmount)}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-xs font-bold text-gray-900">Total After Discount</Text>
                <Text className="text-xs font-bold text-gray-900">{formatCurrency(totalAfter)}</Text>
              </View>
            </View>
          )}

          {error && <Text className="text-sm text-red-600">{error}</Text>}

          <Button onPress={handleApply} disabled={!isValid}>
            Apply
          </Button>
          {currentDiscount != null && (
            <Button variant="outline" onPress={() => onApply(null)}>
              Remove Discount
            </Button>
          )}
          <Pressable onPress={onClose} className="items-center py-1">
            <Text className="text-sm text-gray-500">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
