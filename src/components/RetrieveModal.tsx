/**
 * Held-cart retrieval — ported from the desktop's RetrieveModal.tsx,
 * replacing Phase 3's non-ported HeldCartsModal stand-in. Retrieving is
 * one-tap (matches upstream); deleting one held cart or all of them is
 * gated behind its own confirmation step. The desktop's keyboard shortcuts
 * (arrow-nav, Delete, Ctrl+Delete, Esc) aren't meaningful on a touch device
 * — the equivalent actions are just always-visible buttons instead.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { HeldCart } from '../types';
import { formatCurrency } from '../utils/currency';
import { Button } from './Button';

interface RetrieveModalProps {
  isOpen: boolean;
  heldCarts: HeldCart[];
  onRetrieve: (held: HeldCart) => void;
  onRemove: (held: HeldCart) => void;
  onClose: () => void;
}

export function RetrieveModal({ isOpen, heldCarts, onRetrieve, onRemove, onClose }: RetrieveModalProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setConfirmDeleteId(null);
      setConfirmRemoveAll(false);
    }
  }

  const confirmTarget = heldCarts.find((h) => h.id === confirmDeleteId) ?? null;

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="max-h-[70%] w-full max-w-sm gap-3 rounded-2xl bg-white p-6">
          {confirmTarget ? (
            <>
              <Text className="text-lg font-bold text-gray-900">Delete held sale?</Text>
              <Text className="text-sm text-gray-600">
                {confirmTarget.heldAtLabel} · {confirmTarget.itemCount} item(s) · {formatCurrency(confirmTarget.total)}
              </Text>
              <Button
                variant="danger"
                onPress={() => {
                  onRemove(confirmTarget);
                  setConfirmDeleteId(null);
                }}
              >
                Delete
              </Button>
              <Button variant="outline" onPress={() => setConfirmDeleteId(null)}>
                Cancel
              </Button>
            </>
          ) : confirmRemoveAll ? (
            <>
              <Text className="text-lg font-bold text-gray-900">Delete all held sales?</Text>
              <Text className="text-sm text-gray-600">This removes all {heldCarts.length} held sale(s). This cannot be undone.</Text>
              <Button
                variant="danger"
                onPress={() => {
                  heldCarts.forEach((h) => onRemove(h));
                  setConfirmRemoveAll(false);
                }}
              >
                Delete All
              </Button>
              <Button variant="outline" onPress={() => setConfirmRemoveAll(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-gray-900">Held Sales</Text>
                {heldCarts.length > 1 && (
                  <Pressable onPress={() => setConfirmRemoveAll(true)}>
                    <Text className="text-sm text-red-600">Remove All</Text>
                  </Pressable>
                )}
              </View>

              {heldCarts.length === 0 ? (
                <Text className="py-8 text-center text-gray-400">No held sales</Text>
              ) : (
                <ScrollView>
                  {heldCarts.map((held) => (
                    <View key={held.id} className="flex-row items-center justify-between border-b border-gray-100 py-3">
                      <Pressable onPress={() => onRetrieve(held)} className="flex-1">
                        <Text className="text-sm font-semibold text-gray-900">{held.heldAtLabel}</Text>
                        <Text className="text-xs text-gray-500">
                          {held.itemCount} item(s) · {formatCurrency(held.total)}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => onRetrieve(held)} className="mr-2 rounded-md bg-black px-3 py-2">
                        <Text className="text-xs font-semibold text-white">Retrieve</Text>
                      </Pressable>
                      <Pressable onPress={() => setConfirmDeleteId(held.id)} className="px-2 py-2">
                        <Text className="text-sm text-red-600">Delete</Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}

              <Pressable onPress={onClose} className="items-center py-1">
                <Text className="text-sm text-gray-500">Close</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
