/**
 * Cart state + handlers, combined in one hook — following this repo's
 * useAuth/useCatalog convention. Ported from the desktop's App.tsx cart
 * slice (addNonSerializedToCart, handleConfirmSerialScan, handleUpdateQuantity,
 * handleRemoveItem, handleHold/handleRetrieve, and the cartSubtotal/
 * discountAmount/totalAfterDiscount memos).
 *
 * Note on serialized-quantity increases: the desktop's handleUpdateQuantity
 * opens the serial-scan modal itself for the delta when increasing a
 * serialized line's quantity — that's UI-flow orchestration (which modal is
 * showing), so it stays out of this hook (matching how Phase 2 kept
 * ShiftModal's open/close out of useCatalog). Screens should check
 * `item.product.isSerialized && quantity > item.quantity` themselves and
 * open SerialScanModal for the difference instead of calling updateQuantity
 * — updateQuantity only ever handles the non-serialized case and the
 * serialized-decrease (trim) case.
 */
import { useEffect, useMemo, useState } from 'react';
import { offlineListHeldCarts, offlineRemoveHeldCart, offlineSaveHeldCart } from '../services/offlineStore';
import type { CartItem, HeldCart, Product, TransactionDiscount } from '../types';

const MAX_HELD_CARTS = 5;

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<TransactionDiscount>(null);
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);

  useEffect(() => {
    void offlineListHeldCarts().then(setHeldCarts);
  }, []);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0), [items]);

  const discountAmount = useMemo(() => {
    if (!discount) return 0;
    if (discount.type === 'percent') return Math.min((subtotal * discount.value) / 100, subtotal);
    return Math.min(discount.value, subtotal);
  }, [discount, subtotal]);

  const total = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);

  const addNonSerializedToCart = (product: Product, quantity: number = 1) => {
    const qty = Math.min(Math.max(1, quantity), product.stock);
    if (qty <= 0) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (!existing) return [...prev, { product, quantity: qty, serialNumbers: [] }];
      const newQty = Math.min(existing.quantity + qty, product.stock);
      return prev.map((i) => (i.product.id === product.id ? { ...i, quantity: newQty } : i));
    });
  };

  /** Called from SerialScanModal.onConfirm — merges/creates a line with the given serials (only ever called for serialized products). */
  const addSerializedItems = (product: Product, serialNumbers: string[]) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const merged = [...existing.serialNumbers, ...serialNumbers];
        const newQty = Math.min(merged.length, product.stock);
        return prev.map((i) => (i.product.id === product.id ? { ...i, quantity: newQty, serialNumbers: merged.slice(0, newQty) } : i));
      }
      return [...prev, { product, quantity: Math.min(serialNumbers.length, product.stock), serialNumbers }];
    });
  };

  /** Non-serialized: clamps to [1, stock]. Serialized: only handles decrease (trims serials); increases are the screen's job — see file header. */
  const updateQuantity = (productId: string, quantity: number, latestStock?: number) => {
    const item = items.find((i) => i.product.id === productId);
    if (!item) return;
    const maxQty = Math.max(1, latestStock ?? item.product.stock ?? 1);
    const targetQty = Math.max(1, Math.min(quantity, maxQty));

    if (item.product.isSerialized) {
      if (targetQty >= item.quantity) return; // increase — screen must open SerialScanModal instead
      setItems((prev) =>
        prev.map((i) => (i.product.id === productId ? { ...i, quantity: targetQty, serialNumbers: i.serialNumbers.slice(0, targetQty) } : i))
      );
      return;
    }

    setItems((prev) => prev.map((i) => (i.product.id === productId ? { ...i, quantity: targetQty } : i)));
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setItems([]);
    setDiscount(null);
  };

  const holdCart = () => {
    if (items.length === 0 || heldCarts.length >= MAX_HELD_CARTS) return;
    const now = new Date();
    const held: HeldCart = {
      id: `hold-${now.getTime()}`,
      heldAt: now.toISOString(),
      heldAtLabel: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      total,
      items: items.map((item) => ({ product: item.product, quantity: item.quantity, serialNumbers: [...item.serialNumbers] })),
      discount,
    };
    setHeldCarts((prev) => [...prev, held]);
    void offlineSaveHeldCart(held);
    setItems([]);
    setDiscount(null);
  };

  const retrieveCart = (heldId: string) => {
    const held = heldCarts.find((h) => h.id === heldId);
    if (!held) return;
    setItems(held.items.map((item) => ({ product: item.product, quantity: item.quantity, serialNumbers: [...item.serialNumbers] })));
    setDiscount(held.discount ?? null);
    setHeldCarts((prev) => prev.filter((h) => h.id !== heldId));
    void offlineRemoveHeldCart(heldId);
  };

  /** Discards a held cart without restoring it — RetrieveModal's per-item/"remove all" delete actions. */
  const removeHeldCart = (heldId: string) => {
    setHeldCarts((prev) => prev.filter((h) => h.id !== heldId));
    void offlineRemoveHeldCart(heldId);
  };

  return {
    items,
    discount,
    setDiscount,
    heldCarts,
    maxHeldCarts: MAX_HELD_CARTS,
    subtotal,
    discountAmount,
    total,
    addNonSerializedToCart,
    addSerializedItems,
    updateQuantity,
    removeItem,
    clearCart,
    holdCart,
    retrieveCart,
    removeHeldCart,
  };
}
