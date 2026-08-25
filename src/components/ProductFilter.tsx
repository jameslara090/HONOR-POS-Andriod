/**
 * Controlled product filter bar — same props and behaviour as before, restyled
 * to Modernist: the scan field is promoted above search (a handheld scanner is
 * attached, so it's the primary input), categories become flush-left underlined
 * tabs instead of pills, and the sort/view controls are squared off.
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { ProductCategory } from '../types';
import type { SortKey } from '../hooks/useCatalog';
import { INK, NEUTRAL, PLACEHOLDER } from '../theme';

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
  onOpenCamera?: () => void;
}

const SORT_OPTIONS: SortKey[] = ['name_asc', 'name_desc', 'price_asc', 'price_desc', 'stock_desc'];

function sortLabel(key: SortKey): string {
  switch (key) {
    case 'name_asc':
      return 'NAME (A-Z)';
    case 'name_desc':
      return 'NAME (Z-A)';
    case 'price_asc':
      return 'PRICE (LOW-HIGH)';
    case 'price_desc':
      return 'PRICE (HIGH-LOW)';
    case 'stock_desc':
      return 'STOCK (HIGH-LOW)';
  }
}

export function ProductFilter(props: ProductFilterProps) {
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <View>
      <View className="gap-2 pb-4">
        <View className="flex-row items-baseline justify-between">
          <Text className="font-a-semi text-[10px] tracking-label text-mod-neutral-700">SCAN OR TYPE SKU / BARCODE / IMEI</Text>
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 bg-mod-accent" />
            <Text className="font-a-semi text-[10px] tracking-label text-mod-accent-700">SCANNER READY</Text>
          </View>
        </View>

        <View className="flex-row gap-2">
          {props.onOpenCamera && (
            <Pressable
              onPress={props.onOpenCamera}
              className="h-[52px] w-[52px] items-center justify-center border-2 border-mod-ink bg-white active:bg-mod-accent-100"
            >
              <Feather name="camera" size={20} color={INK} />
            </Pressable>
          )}
          <TextInput
            value={props.scanValue}
            onChangeText={props.onScanChange}
            onSubmitEditing={(e) => props.onScanSubmit(e.nativeEvent.text)}
            placeholder="356938035643809"
            placeholderTextColor={PLACEHOLDER}
            returnKeyType="search"
            autoCapitalize="none"
            className={`h-[52px] flex-1 border-2 bg-white px-3 font-a-med text-[17px] text-mod-ink ${props.scanError ? 'border-mod-danger' : 'border-mod-ink'}`}
          />
          <TextInput
            value={props.searchQuery}
            onChangeText={props.onSearchChange}
            placeholder="Search product name or SKU"
            placeholderTextColor={PLACEHOLDER}
            className="h-[52px] flex-1 border border-mod-neutral-400 bg-white px-3 font-a text-[14px] text-mod-ink"
          />
        </View>
        {props.scanError ? <Text className="font-a text-[12px] text-mod-danger-700">{props.scanError}</Text> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="border-b-2 border-mod-divider">
        <View className="flex-row">
          {props.categories.map((cat) => {
            const active = cat === props.selectedCategory;
            return (
              <Pressable
                key={cat}
                onPress={() => props.onCategoryChange(cat)}
                className={`px-4 py-3 ${active ? 'border-b-[3px] border-mod-accent' : ''}`}
              >
                <Text className={`font-a-semi text-[12px] tracking-label ${active ? 'text-mod-ink' : 'text-mod-neutral-600'}`}>
                  {(cat === 'all' ? 'All' : cat).toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="flex-row items-center justify-between py-3">
        <View className="relative">
          <Pressable
            onPress={() => setSortOpen((o) => !o)}
            className="h-[40px] flex-row items-center gap-2 border-2 border-mod-ink px-3 active:bg-mod-accent-100"
          >
            <Text className="font-a-semi text-[11px] tracking-label text-mod-ink">{sortLabel(props.sortKey)}</Text>
            <Feather name="chevron-down" size={14} color={INK} />
          </Pressable>
          {sortOpen && (
            <View className="absolute top-[42px] z-10 w-52 border-2 border-mod-ink bg-white">
              {SORT_OPTIONS.map((key) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    props.onSortChange(key);
                    setSortOpen(false);
                  }}
                  className="border-b border-mod-neutral-300 px-3 py-3 active:bg-mod-accent-100"
                >
                  <Text className="font-a-semi text-[11px] tracking-label text-mod-ink">{sortLabel(key)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View className="flex-row border-2 border-mod-ink">
          <Pressable
            onPress={() => props.onViewModeChange('grid')}
            className={`h-[36px] w-[44px] items-center justify-center ${props.viewMode === 'grid' ? 'bg-mod-ink' : ''}`}
          >
            <Feather name="grid" size={16} color={props.viewMode === 'grid' ? '#fff' : NEUTRAL[700]} />
          </Pressable>
          <Pressable
            onPress={() => props.onViewModeChange('row')}
            className={`h-[36px] w-[44px] items-center justify-center ${props.viewMode === 'row' ? 'bg-mod-ink' : ''}`}
          >
            <Feather name="list" size={16} color={props.viewMode === 'row' ? '#fff' : NEUTRAL[700]} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
