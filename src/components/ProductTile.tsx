import { memo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { Product } from '../types';
import { formatCurrency } from '../utils/currency';
import { getOnHandBadge } from '../utils/stockBadge';

interface ProductTileProps {
  product: Product;
  /** 'grid' for the card grid, 'row' for the list view. */
  variant: 'grid' | 'row';
  /** Stubbed out until Phase 3 adds cart state. */
  onAddToCart: (product: Product, quantity: number) => void;
}

export const ProductTile = memo(function ProductTile({ product, variant, onAddToCart }: ProductTileProps) {
  // FlatList gives each product its own component instance (keyExtractor =
  // item.id), so quantity/imgError always start fresh per product — no need
  // to reset them via an effect when the `product` prop changes.
  const [quantity, setQuantity] = useState(1);
  const [imgError, setImgError] = useState(false);

  const isOutOfStock = product.stock === 0;
  const maxQty = Math.max(1, product.stock);
  const badge = getOnHandBadge(product);
  const effectiveQty = Math.min(Math.max(1, quantity), maxQty);

  const handleAdd = () => {
    onAddToCart(product, effectiveQty);
  };

  const image =
    product.image && !imgError ? (
      <Image
        source={{ uri: product.image }}
        onError={() => setImgError(true)}
        className={variant === 'grid' ? 'h-28 w-full rounded-lg bg-gray-100' : 'h-14 w-14 rounded-lg bg-gray-100'}
        resizeMode="cover"
      />
    ) : (
      <View
        className={
          (variant === 'grid' ? 'h-28 w-full' : 'h-14 w-14') + ' items-center justify-center rounded-lg bg-gray-200'
        }
      >
        <Text className="text-2xl font-bold text-gray-400">{product.name.charAt(0).toUpperCase()}</Text>
      </View>
    );

  const stepper = (
    <View className="flex-row items-center gap-2">
      <Pressable
        disabled={effectiveQty <= 1}
        onPress={() => setQuantity(Math.max(1, effectiveQty - 1))}
        className={`h-8 w-8 items-center justify-center rounded-md border border-gray-300 ${effectiveQty <= 1 ? 'opacity-40' : ''}`}
      >
        <Text className="text-base font-bold text-gray-700">−</Text>
      </Pressable>
      <Text className="w-6 text-center text-base font-semibold text-gray-900">{effectiveQty}</Text>
      <Pressable
        disabled={effectiveQty >= maxQty}
        onPress={() => setQuantity(Math.min(maxQty, effectiveQty + 1))}
        className={`h-8 w-8 items-center justify-center rounded-md border border-gray-300 ${effectiveQty >= maxQty ? 'opacity-40' : ''}`}
      >
        <Text className="text-base font-bold text-gray-700">+</Text>
      </Pressable>
    </View>
  );

  const addButton = (
    <Pressable
      disabled={isOutOfStock}
      onPress={handleAdd}
      className={`items-center justify-center rounded-md px-3 py-2 ${isOutOfStock ? 'bg-gray-200' : 'bg-black active:bg-gray-800'}`}
    >
      <Text className={`text-xs font-bold ${isOutOfStock ? 'text-gray-500' : 'text-white'}`}>
        {isOutOfStock ? 'OUT OF STOCK' : 'ADD TO CART'}
      </Text>
    </Pressable>
  );

  if (variant === 'row') {
    return (
      <View className="flex-row items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
        {image}
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
            {product.name}
          </Text>
          <Text className="text-xs text-gray-500" numberOfLines={1}>
            {product.category} • {product.sku}
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            <Text className="text-sm font-bold text-gray-900">{product.price === 0 ? 'FREE' : formatCurrency(product.price)}</Text>
            <View className={`rounded-full px-2 py-0.5 ${badge.className}`}>
              <Text className="text-xs font-medium">{badge.label}</Text>
            </View>
          </View>
        </View>
        {stepper}
        {addButton}
      </View>
    );
  }

  return (
    <View className="flex-1 gap-2 rounded-xl border border-gray-200 bg-white p-3">
      {image}
      <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
        {product.name}
      </Text>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-gray-900">{product.price === 0 ? 'FREE' : formatCurrency(product.price)}</Text>
        <View className={`rounded-full px-2 py-0.5 ${badge.className}`}>
          <Text className="text-xs font-medium">{badge.label}</Text>
        </View>
      </View>
      <Text className="text-xs text-gray-400" numberOfLines={1}>
        {product.sku}
      </Text>
      <View className="flex-row items-center justify-between">
        {stepper}
      </View>
      {addButton}
    </View>
  );
});
