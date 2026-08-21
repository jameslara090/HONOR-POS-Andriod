/**
 * Minimal held-cart picker — not a port of anything (the desktop's full
 * RetrieveModal, with its richer transaction-history-style UI, is Phase 4
 * scope per the plan doc). This exists only so retrieving with more than
 * one held cart doesn't silently grab the wrong customer's sale.
 */
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { HeldCart } from '../types';
import { formatCurrency } from '../utils/currency';

interface HeldCartsModalProps {
  isOpen: boolean;
  heldCarts: HeldCart[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function HeldCartsModal({ isOpen, heldCarts, onSelect, onClose }: HeldCartsModalProps) {
  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="max-h-[70%] w-full max-w-sm gap-3 rounded-2xl bg-white p-6">
          <Text className="text-lg font-bold text-gray-900">Held Sales</Text>
          <ScrollView>
            {heldCarts.map((held) => (
              <Pressable
                key={held.id}
                onPress={() => onSelect(held.id)}
                className="flex-row items-center justify-between border-b border-gray-100 py-3 active:bg-gray-50"
              >
                <View>
                  <Text className="text-sm font-semibold text-gray-900">{held.heldAtLabel}</Text>
                  <Text className="text-xs text-gray-500">{held.itemCount} item(s)</Text>
                </View>
                <Text className="text-sm font-bold text-gray-900">{formatCurrency(held.total)}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={onClose} className="items-center py-2">
            <Text className="text-sm text-gray-500">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
