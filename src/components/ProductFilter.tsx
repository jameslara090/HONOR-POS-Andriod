/**
 * Controlled product filter bar — ported from the desktop's ProductFilter.tsx
 * behavior (search, category, sort, view-mode, scan), but as native controls:
 * category dropdown → horizontal chip row, sort dropdown → a small inline
 * menu (no outside-click-detection machinery needed on native), and the scan
 * field is a plain TextInput this phase (camera scanning is Phase 3).
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { ProductCategory } from '../types';
import type { SortKey } from '../hooks/useCatalog';

export type ViewMode = 'grid' | 'row';

interface ProductFilterProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: ProductCategory | 'all';
  onCategoryChange: (cat: ProductCategory | 'all') => void;
  categories: (ProductCategory | 'all')[];
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  scanValue: string;
  onScanChange: (v: string) => void;
  onScanSubmit: (v: string) => void;
  scanError: string | null;
}

const SORT_OPTIONS: SortKey[] = ['name_asc', 'name_desc', 'price_asc', 'price_desc', 'stock_desc'];

function sortLabel(key: SortKey): string {
  switch (key) {
    case 'name_asc':
      return 'Name (A-Z)';
    case 'name_desc':
      return 'Name (Z-A)';
    case 'price_asc':
      return 'Price (Low-High)';
    case 'price_desc':
      return 'Price (High-Low)';
    case 'stock_desc':
      return 'Stock (High-Low)';
  }
}

export function ProductFilter(props: ProductFilterProps) {
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <View className="gap-3 pb-3">
      <TextInput
        value={props.searchQuery}
        onChangeText={props.onSearchChange}
        placeholder="Search products..."
        className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
      />

      <View>
        <TextInput
          value={props.scanValue}
          onChangeText={props.onScanChange}
          onSubmitEditing={(e) => props.onScanSubmit(e.nativeEvent.text)}
          placeholder="Scan or enter SKU / barcode"
          returnKeyType="search"
          autoCapitalize="none"
          className={`rounded-lg border px-3 py-2.5 text-sm ${props.scanError ? 'border-red-400' : 'border-gray-300'}`}
        />
        {props.scanError && <Text className="mt-1 text-xs text-red-600">{props.scanError}</Text>}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {props.categories.map((cat) => {
            const active = cat === props.selectedCategory;
            return (
              <Pressable
                key={cat}
                onPress={() => props.onCategoryChange(cat)}
                className={`rounded-full px-3 py-1.5 ${active ? 'bg-black' : 'bg-gray-100'}`}
              >
                <Text className={`text-xs font-medium ${active ? 'text-white' : 'text-gray-700'}`}>
                  {cat === 'all' ? 'All' : cat}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="flex-row items-center justify-between">
        <View className="relative">
          <Pressable
            onPress={() => setSortOpen((o) => !o)}
            className="flex-row items-center gap-1 rounded-md border border-gray-300 px-3 py-2"
          >
            <Text className="text-xs font-medium text-gray-700">{sortLabel(props.sortKey)}</Text>
          </Pressable>
          {sortOpen && (
            <View className="absolute top-10 z-10 w-44 rounded-md border border-gray-200 bg-white shadow-lg">
              {SORT_OPTIONS.map((key) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    props.onSortChange(key);
                    setSortOpen(false);
                  }}
                  className="px-3 py-2 active:bg-gray-100"
                >
                  <Text className="text-xs text-gray-700">{sortLabel(key)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View className="flex-row gap-1 rounded-md border border-gray-300 p-0.5">
          <Pressable
            onPress={() => props.onViewModeChange('grid')}
            className={`rounded px-3 py-1.5 ${props.viewMode === 'grid' ? 'bg-black' : ''}`}
          >
            <Text className={`text-xs font-medium ${props.viewMode === 'grid' ? 'text-white' : 'text-gray-700'}`}>Grid</Text>
          </Pressable>
          <Pressable
            onPress={() => props.onViewModeChange('row')}
            className={`rounded px-3 py-1.5 ${props.viewMode === 'row' ? 'bg-black' : ''}`}
          >
            <Text className={`text-xs font-medium ${props.viewMode === 'row' ? 'text-white' : 'text-gray-700'}`}>List</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
