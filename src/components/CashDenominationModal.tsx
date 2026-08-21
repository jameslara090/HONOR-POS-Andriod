/** Cash-counting helper — ported from the desktop's CashDenominationModal.tsx. */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button } from './Button';

interface CashDenominationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (total: number) => void;
}

// Bills and coins actually in PHP circulation. Centavo coins are omitted —
// this counts cash tendered by a cashier, who counts whole pesos in hand,
// not the item price's centavo remainder (that's handled by change due).
const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

export function CashDenominationModal({ isOpen, onClose, onApply }: CashDenominationModalProps) {
  const [counts, setCounts] = useState<Record<number, string>>({});

  const setCount = (denom: number, value: string) => {
    setCounts((prev) => ({ ...prev, [denom]: value.replace(/[^0-9]/g, '') }));
  };

  const total = DENOMINATIONS.reduce((sum, d) => {
    const n = parseInt(counts[d] ?? '', 10);
    return sum + (Number.isFinite(n) && n > 0 ? n * d : 0);
  }, 0);

  const handleClose = () => {
    setCounts({});
    onClose();
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={handleClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="w-full max-w-sm gap-3 rounded-2xl bg-white p-6">
          <Text className="text-lg font-bold text-gray-900">Count Cash</Text>
          <ScrollView className="max-h-80">
            {DENOMINATIONS.map((denom) => {
              const n = parseInt(counts[denom] ?? '', 10);
              const lineTotal = Number.isFinite(n) && n > 0 ? n * denom : 0;
              return (
                <View key={denom} className="flex-row items-center justify-between border-b border-gray-100 py-2">
                  <Text className="w-20 text-sm text-gray-700">₱{denom}</Text>
                  <Text className="text-gray-400">×</Text>
                  <TextInput
                    value={counts[denom] ?? ''}
                    onChangeText={(v) => setCount(denom, v)}
                    keyboardType="numeric"
                    placeholder="0"
                    className="w-16 rounded-md border border-gray-300 px-2 py-1 text-center"
                  />
                  <Text className="w-20 text-right text-sm text-gray-700">{lineTotal > 0 ? `₱${lineTotal.toLocaleString('en-PH')}` : '—'}</Text>
                </View>
              );
            })}
          </ScrollView>
          <View className="flex-row justify-between border-t border-gray-200 pt-3">
            <Text className="text-base font-bold text-gray-900">Total counted</Text>
            <Text className="text-base font-bold text-gray-900">
              ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
          <Button
            disabled={total <= 0}
            onPress={() => {
              onApply(total);
              handleClose();
            }}
          >
            Use this amount
          </Button>
          <Pressable onPress={handleClose} className="items-center py-2">
            <Text className="text-sm text-gray-500">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
