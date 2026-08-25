/**
 * Cart panel — same props and totals contract as before (everything is computed
 * by useCart and passed in). Restyled to Modernist and made denser: ruled line
 * items with the IMEI on the line, the PH VAT breakdown above a 2px rule, the
 * total at display size, and the accent reserved for CHECKOUT alone.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { CartItem, CheckoutTenderHint, TransactionDiscount } from '../types';
import { formatCurrency } from '../utils/currency';
import { Button } from './Button';

const VAT_RATE = 0.12;

interface CartProps {
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onCheckout: (preselectedHint?: CheckoutTenderHint) => void;
  onHold: () => void;
  onRetrieveClick: () => void;
  onDiscountClick: () => void;
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
    <View className="border-b border-mod-neutral-300 px-4 py-3">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text className="flex-1 font-a-bold text-[14px] leading-[18px] text-mod-ink" numberOfLines={2}>
          {item.product.name}
        </Text>
        <Text className="font-a-display text-[15px] text-mod-ink">
          {item.product.price === 0 ? 'FREE' : formatCurrency(lineTotal)}
        </Text>
      </View>

      <Text className="mt-0.5 font-a-med text-[11px] tracking-label text-mod-neutral-600">
        {item.product.sku} · {formatCurrency(item.product.price)} EA
      </Text>

      {item.product.isSerialized &&
        Array.from({ length: item.quantity }).map((_, i) => {
          const serial = item.serialNumbers[i];
          return (
            <View key={i} className="mt-1 flex-row items-center gap-1.5">
              <View className={`h-px w-3.5 ${serial ? 'bg-mod-neutral-600' : 'bg-mod-accent'}`} />
              <Text className={`font-a-med text-[11px] tracking-label ${serial ? 'text-mod-neutral-700' : 'text-mod-accent-700'}`}>
                IMEI {serial || 'PENDING SCAN'}
              </Text>
            </View>
          );
        })}

      <View className="mt-2 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Pressable
            onPress={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
            className="h-9 w-9 items-center justify-center border border-mod-ink active:bg-mod-accent-100"
          >
            <Text className="font-a-bold text-[16px] text-mod-ink">−</Text>
          </Pressable>
          <View className="h-9 w-11 items-center justify-center border-y border-mod-ink">
            <Text className="font-a-bold text-[15px] text-mod-ink">{item.quantity}</Text>
          </View>
          <Pressable
            onPress={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
            className="h-9 w-9 items-center justify-center border border-mod-ink active:bg-mod-accent-100"
          >
            <Text className="font-a-bold text-[16px] text-mod-ink">+</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => onRemoveItem(item.product.id)} className="px-2 py-2 active:bg-mod-accent-100">
          <Text className="font-a-semi text-[11px] tracking-label text-mod-accent-700">REMOVE</Text>
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
  onDiscountClick,
  heldCount,
  maxHeldCarts,
  subtotal,
  discountAmount,
  discount,
  total,
}: CartProps) {
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const vatableSales = total > 0 ? total / (1 + VAT_RATE) : 0;
  const vatAmount = total - vatableSales;

  const header = (
    <View className="flex-row items-center justify-between border-b-2 border-mod-divider px-4 py-3">
      <Text className="font-a-display text-[13px] tracking-label text-mod-ink">CURRENT SALE</Text>
      <Text className="font-a-semi text-[11px] tracking-label text-mod-neutral-700">
        {itemCount} {itemCount === 1 ? 'ITEM' : 'ITEMS'}
      </Text>
    </View>
  );

  if (items.length === 0) {
    return (
      <View className="flex-1 bg-white">
        {header}
        <View className="gap-4 p-6">
          <Text className="font-a text-[13px] leading-5 text-mod-neutral-700">
            No items yet. Scan an IMEI or barcode, or tap a product in the catalog.
          </Text>
          {heldCount > 0 && (
            <Button variant="outline" onPress={onRetrieveClick}>
              {`Retrieve ${heldCount} held sale${heldCount === 1 ? '' : 's'}`}
            </Button>
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      {header}

      <ScrollView className="flex-1">
        {items.map((item) => (
          <CartItemRow key={item.product.id} item={item} onUpdateQuantity={onUpdateQuantity} onRemoveItem={onRemoveItem} />
        ))}
      </ScrollView>

      <View className="gap-1.5 border-t-2 border-mod-divider px-4 py-3">
        <View className="flex-row justify-between">
          <Text className="font-a text-[13px] text-mod-neutral-700">VATable sale</Text>
          <Text className="font-a text-[13px] text-mod-neutral-700">{formatCurrency(vatableSales)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="font-a text-[13px] text-mod-neutral-700">VAT 12%</Text>
          <Text className="font-a text-[13px] text-mod-neutral-700">{formatCurrency(vatAmount)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="font-a text-[13px] text-mod-neutral-700">Subtotal</Text>
          <Text className="font-a text-[13px] text-mod-neutral-700">{formatCurrency(subtotal)}</Text>
        </View>

        {discount != null && discountAmount > 0 && (
          <View className="-mx-2 flex-row justify-between bg-mod-accent-100 px-2 py-1">
            <Text className="font-a-semi text-[13px] text-mod-accent-800">
              Discount{discount.type === 'percent' ? ` (${discount.value}%)` : ` (${formatCurrency(discount.value)})`}
            </Text>
            <Text className="font-a-semi text-[13px] text-mod-accent-800">−{formatCurrency(discountAmount)}</Text>
          </View>
        )}

        <View className="mt-2 flex-row items-baseline justify-between border-t-2 border-mod-divider pt-2">
          <Text className="font-a-display text-[13px] tracking-label text-mod-ink">TOTAL</Text>
          <Text className="font-a-display text-[30px] text-mod-ink">{formatCurrency(total)}</Text>
        </View>
      </View>

      <View className="gap-2 px-4 pb-4">
        <Button onPress={() => onCheckout()} trailing={<Feather name="arrow-right" size={20} color="#fff" />}>
          Checkout
        </Button>

        <View className="flex-row gap-2">
          <Pressable
            onPress={() => onCheckout('cash')}
            className="h-11 flex-1 justify-center border-2 border-mod-ink px-3 active:bg-mod-accent-100"
          >
            <Text className="font-a-semi text-[11px] tracking-label text-mod-ink">CASH</Text>
          </Pressable>
          <Pressable
            onPress={() => onCheckout('gcash')}
            className="h-11 flex-1 justify-center border-2 border-mod-ink px-3 active:bg-mod-accent-100"
          >
            <Text className="font-a-semi text-[11px] tracking-label text-mod-ink">GCASH</Text>
          </Pressable>
          <Pressable
            onPress={() => onCheckout('credit_card')}
            className="h-11 flex-1 justify-center border-2 border-mod-ink px-3 active:bg-mod-accent-100"
          >
            <Text className="font-a-semi text-[11px] tracking-label text-mod-ink">CARD</Text>
          </Pressable>
        </View>

        <View className="flex-row gap-2">
          <Pressable onPress={onDiscountClick} className="h-11 flex-1 justify-center border-2 border-mod-ink px-3 active:bg-mod-accent-100">
            <Text className="font-a-semi text-[11px] tracking-label text-mod-ink">
              {discount != null ? 'CHANGE DISCOUNT' : 'ADD DISCOUNT'}
            </Text>
          </Pressable>
          <Pressable
            onPress={onHold}
            disabled={heldCount >= maxHeldCarts}
            className={`h-11 flex-1 justify-center border-2 border-mod-ink px-3 ${heldCount >= maxHeldCarts ? 'opacity-45' : 'active:bg-mod-accent-100'}`}
          >
            <Text className="font-a-semi text-[11px] tracking-label text-mod-ink">HOLD</Text>
          </Pressable>
          {heldCount > 0 && (
            <Pressable onPress={onRetrieveClick} className="h-11 flex-1 justify-center border-2 border-mod-ink px-3 active:bg-mod-accent-100">
              <Text className="font-a-semi text-[11px] tracking-label text-mod-ink">RETRIEVE {heldCount}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
