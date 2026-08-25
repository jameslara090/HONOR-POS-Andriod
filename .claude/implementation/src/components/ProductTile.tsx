import { memo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { Product } from '../types';
import { formatCurrency } from '../utils/currency';
import { getOnHandBadge } from '../utils/stockBadge';

interface ProductTileProps {
  product: Product;
  /** 'grid' for the ruled cell grid, 'row' for the list view. */
  variant: 'grid' | 'row';
  onAddToCart: (product: Product, quantity: number) => void;
}

/**
 * Modernist product cell. The grid variant drops the card and the image block
 * entirely: a ruled cell, the name at heading weight, SKU, price at display
 * size, and the on-hand tag — denser, and the whole cell is the add target.
 * The row variant keeps the thumbnail, since a list has room for it.
 */
export const ProductTile = memo(function ProductTile({ product, variant, onAddToCart }: ProductTileProps) {
  const [quantity, setQuantity] = useState(1);
  const [imgError, setImgError] = useState(false);

  const isOutOfStock = product.stock === 0;
  const maxQty = Math.max(1, product.stock);
  const badge = getOnHandBadge(product);
  const effectiveQty = Math.min(Math.max(1, quantity), maxQty);

  const handleAdd = () => {
    onAddToCart(product, effectiveQty);
  };

  const priceLabel = product.price === 0 ? 'FREE' : formatCurrency(product.price);

  const stepper = (
    <View className="flex-row items-center">
      <Pressable
        disabled={effectiveQty <= 1}
        onPress={() => setQuantity(Math.max(1, effectiveQty - 1))}
        className={`h-9 w-9 items-center justify-center border border-mod-ink ${effectiveQty <= 1 ? 'opacity-45' : 'active:bg-mod-accent-100'}`}
      >
        <Text className="font-a-bold text-[16px] text-mod-ink">−</Text>
      </Pressable>
      <View className="h-9 w-10 items-center justify-center border-y border-mod-ink">
        <Text className="font-a-bold text-[15px] text-mod-ink">{effectiveQty}</Text>
      </View>
      <Pressable
        disabled={effectiveQty >= maxQty}
        onPress={() => setQuantity(Math.min(maxQty, effectiveQty + 1))}
        className={`h-9 w-9 items-center justify-center border border-mod-ink ${effectiveQty >= maxQty ? 'opacity-45' : 'active:bg-mod-accent-100'}`}
      >
        <Text className="font-a-bold text-[16px] text-mod-ink">+</Text>
      </Pressable>
    </View>
  );

  if (variant === 'row') {
    const image =
      product.image && !imgError ? (
        <Image source={{ uri: product.image }} onError={() => setImgError(true)} className="h-14 w-14 bg-mod-neutral-200" resizeMode="cover" />
      ) : (
        <View className="h-14 w-14 items-center justify-center bg-mod-neutral-200">
          <Text className="font-a-display text-[20px] text-mod-neutral-500">{product.name.charAt(0).toUpperCase()}</Text>
        </View>
      );

    return (
      <Pressable
        disabled={isOutOfStock}
        onPress={handleAdd}
        className={`flex-row items-center gap-3 border-b border-mod-neutral-300 bg-white p-3 ${isOutOfStock ? 'opacity-45' : 'active:bg-mod-accent-100'}`}
      >
        {image}
        <View className="flex-1 gap-1">
          <Text className="font-a-bold text-[15px] text-mod-ink" numberOfLines={1}>
            {product.name}
          </Text>
          <Text className="font-a-med text-[11px] tracking-label text-mod-neutral-600" numberOfLines={1}>
            {product.sku} · {product.category}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-2">
            <Text className="font-a-display text-[17px] text-mod-ink">{priceLabel}</Text>
            <View className={`px-1.5 py-0.5 ${badge.className}`}>
              <Text className="font-a-semi text-[9px] tracking-label">{badge.label}</Text>
            </View>
            {product.isSerialized ? (
              <Text className="font-a-semi text-[9px] tracking-label text-mod-accent-700">IMEI REQUIRED</Text>
            ) : null}
          </View>
        </View>
        {stepper}
      </Pressable>
    );
  }

  return (
    <Pressable
      disabled={isOutOfStock}
      onPress={handleAdd}
      className={`min-h-[124px] flex-1 border-b border-r border-mod-neutral-300 bg-mod-bg p-4 ${isOutOfStock ? 'opacity-45' : 'active:bg-mod-accent-100'}`}
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text className="flex-1 font-a-bold text-[15px] leading-[19px] text-mod-ink" numberOfLines={2}>
          {product.name}
        </Text>
        <View className={`px-1.5 py-1 ${badge.className}`}>
          <Text className="font-a-semi text-[9px] tracking-label">{badge.label}</Text>
        </View>
      </View>

      <Text className="mt-1.5 font-a-med text-[11px] tracking-label text-mod-neutral-600" numberOfLines={1}>
        {product.sku}
      </Text>

      <View className="flex-1" />

      <View className="mt-3 flex-row items-end justify-between">
        <Text className="font-a-display text-[20px] text-mod-ink">{priceLabel}</Text>
        {product.isSerialized ? (
          <Text className="font-a-semi text-[9px] tracking-label text-mod-accent-700">IMEI REQUIRED</Text>
        ) : (
          stepper
        )}
      </View>
    </Pressable>
  );
});
