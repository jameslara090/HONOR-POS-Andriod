/**
 * Cart panel — ported from the desktop's Cart.tsx. Pure presentational: all
 * totals (subtotal/discountAmount/total) are computed by useCart and passed
 * in as props, matching the desktop's design exactly.
 *
 * Discount entry is Phase 4 scope (see the Phase 3 plan's finding 5) — the
 * discount button renders disabled with a "Coming in Phase 4" note instead
 * of the desktop's toggle-to-edit behavior.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { CartItem, CheckoutTenderHint, TransactionDiscount } from '../types';
import { formatCurrency } from '../utils/currency';
import { Button } from './Button';

interface CartProps {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onCheckout: (preselectedHint?: CheckoutTenderHint) => void;
  onHold: () => void;
  onRetrieveClick: () => void;
  heldCount: number;
  maxHeldCarts: number;
  subtotal: number;
  discountAmount: number;
  discount: TransactionDiscount;
  total: number;
}

function CartItemRow({
  item,
  onUpdateQuantity,
  onRemoveItem,
}: {
  item: CartItem;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
}) {
  const lineTotal = item.product.price * item.quantity;
  return (
    <View className="gap-1 border-b border-gray-100 py-3">
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-2 text-sm font-semibold text-gray-900" numberOfLines={1}>
          {item.product.name}
        </Text>
        <Text className="text-sm font-bold text-gray-900">{item.product.price === 0 ? 'FREE' : formatCurrency(lineTotal)}</Text>
      </View>
      {item.product.isSerialized &&
        Array.from({ length: item.quantity }).map((_, i) => {
          const serial = item.serialNumbers[i];
          return (
            <Text key={i} className={`text-xs ${serial ? 'text-gray-500' : 'text-amber-600'}`}>
              SN: {serial || '(pending scan)'}
            </Text>
          );
        })}
      <View className="flex-row items-center justify-between pt-1">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
            className="h-7 w-7 items-center justify-center rounded-md border border-gray-300"
          >
            <Text className="text-sm font-bold text-gray-700">−</Text>
          </Pressable>
          <Text className="w-6 text-center text-sm font-semibold text-gray-900">{item.quantity}</Text>
          <Pressable
            onPress={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
            className="h-7 w-7 items-center justify-center rounded-md border border-gray-300"
          >
            <Text className="text-sm font-bold text-gray-700">+</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => onRemoveItem(item.product.id)} className="px-2 py-1">
          <Text className="text-sm font-medium text-red-600">Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Cart({
  items,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
  onHold,
  onRetrieveClick,
  heldCount,
  maxHeldCarts,
  subtotal,
  discountAmount,
  discount,
  total,
}: CartProps) {
  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white p-6">
        <Text className="text-gray-400">Your cart is empty</Text>
        {heldCount > 0 && (
          <Button variant="outline" onPress={onRetrieveClick}>
            {`Retrieve (${heldCount}) held sale${heldCount === 1 ? '' : 's'}`}
          </Button>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1 gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <ScrollView className="flex-1">
        {items.map((item) => (
          <CartItemRow key={item.product.id} item={item} onUpdateQuantity={onUpdateQuantity} onRemoveItem={onRemoveItem} />
        ))}
      </ScrollView>

      <View className="gap-1 border-t border-gray-200 pt-3">
        <View className="flex-row justify-between">
          <Text className="text-sm text-gray-600">Subtotal</Text>
          <Text className="text-sm text-gray-900">{formatCurrency(subtotal)}</Text>
        </View>
        {discount != null && discountAmount > 0 && (
          <View className="flex-row justify-between rounded-md bg-green-50 px-2 py-1">
            <Text className="text-sm text-green-700">
              Discount{discount.type === 'percent' ? ` (${discount.value}%)` : ` (${formatCurrency(discount.value)})`}
            </Text>
            <Text className="text-sm text-green-700">-{formatCurrency(discountAmount)}</Text>
          </View>
        )}
        <View className="flex-row justify-between pt-1">
          <Text className="text-base font-bold text-gray-900">Total</Text>
          <Text className="text-base font-bold text-gray-900">{formatCurrency(total)}</Text>
        </View>
      </View>

      <Pressable disabled className="items-center rounded-md bg-gray-100 px-3 py-2 opacity-60">
        <Text className="text-xs font-medium text-gray-500">Discounts — coming in Phase 4</Text>
      </Pressable>

      <Button onPress={() => onCheckout()}>Checkout</Button>

      <View className="flex-row gap-2">
        <Pressable onPress={() => onCheckout('cash')} className="flex-1 items-center rounded-md border border-gray-300 py-2">
          <Text className="text-xs font-semibold text-gray-700">Cash</Text>
        </Pressable>
        <Pressable onPress={() => onCheckout('gcash')} className="flex-1 items-center rounded-md border border-gray-300 py-2">
          <Text className="text-xs font-semibold text-gray-700">GCash</Text>
        </Pressable>
        <Pressable onPress={() => onCheckout('credit_card')} className="flex-1 items-center rounded-md border border-gray-300 py-2">
          <Text className="text-xs font-semibold text-gray-700">Card</Text>
        </Pressable>
      </View>

      <View className="flex-row gap-2">
        <Button variant="outline" onPress={onHold} disabled={heldCount >= maxHeldCarts}>
          Hold
        </Button>
        {heldCount > 0 && (
          <Button variant="outline" onPress={onRetrieveClick}>
            {`Retrieve (${heldCount})`}
          </Button>
        )}
      </View>
    </View>
  );
}
