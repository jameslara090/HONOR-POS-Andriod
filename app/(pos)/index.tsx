import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../../src/contexts/AuthContext';
import { useCatalogContext } from '../../src/contexts/CatalogContext';
import { Button } from '../../src/components/Button';
import { ProductFilter, type ViewMode } from '../../src/components/ProductFilter';
import { ProductTile } from '../../src/components/ProductTile';
import { Pagination } from '../../src/components/Pagination';
import { ShiftModal } from '../../src/components/ShiftModal';
import type { Product } from '../../src/types';

export default function PosHomeScreen() {
  const { currentUser, loggedInOffline, handleLogout } = useAuthContext();
  const catalog = useCatalogContext();
  const { width } = useWindowDimensions();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [scanValue, setScanValue] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);

  const handleAddToCart = (product: Product, quantity: number) => {
    // Stubbed — Phase 3 adds real cart state and fills this in.
    Alert.alert('Coming soon', `Cart lands in Phase 3 — would add ${quantity} × ${product.name}.`);
  };

  const handleScanSubmit = (value: string) => {
    const query = value.trim();
    if (!query) return;
    const match = catalog.products.find((p) => p.sku.toLowerCase() === query.toLowerCase());
    if (!match) {
      setScanError(`No product found for "${query}"`);
      return;
    }
    setScanError(null);
    setScanValue('');
    handleAddToCart(match, 1);
  };

  const shiftModal = (
    <ShiftModal
      visible={showShiftModal}
      currentShift={catalog.currentShift}
      loading={catalog.shiftLoading}
      onOpen={(cash) => catalog.openShift(cash)}
      onClose={(cash) => catalog.closeShift(cash)}
      onDismiss={() => setShowShiftModal(false)}
    />
  );

  if (catalog.shiftLoading && !catalog.currentShift) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#111827" />
      </SafeAreaView>
    );
  }

  if (!catalog.currentShift) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-1 items-center justify-center gap-4 p-6">
          <Text className="text-xl font-bold text-gray-900">Open a shift to start selling</Text>
          <Text className="text-center text-gray-500">
            Every sale on this register needs an open shift. Open one to load the product catalog.
          </Text>
          <Button onPress={() => setShowShiftModal(true)}>Open Shift</Button>
          <Button variant="outline" onPress={() => void handleLogout()}>
            Sign Out
          </Button>
        </View>
        {shiftModal}
      </SafeAreaView>
    );
  }

  const numColumns = viewMode === 'grid' ? Math.max(2, Math.floor(width / 220)) : 1;

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 px-4 pt-4">
        <View className="mb-3 flex-row items-center justify-between">
          <View>
            <Text className="text-lg font-bold text-gray-900">Welcome, {currentUser?.name}</Text>
            {loggedInOffline && <Text className="text-xs font-medium text-amber-600">Signed in offline</Text>}
          </View>
          <View className="flex-row items-center gap-3">
            <Button variant="outline" onPress={() => setShowShiftModal(true)}>
              Shift
            </Button>
            <Button variant="outline" onPress={() => void handleLogout()}>
              Sign Out
            </Button>
          </View>
        </View>

        {catalog.productsLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#111827" />
            <Text className="mt-2 text-gray-500">Loading products...</Text>
          </View>
        ) : catalog.productsError && catalog.products.length === 0 ? (
          <View className="items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-6">
            <Text className="font-medium text-amber-800">Could not load products</Text>
            <Text className="text-center text-sm text-amber-700">{catalog.productsError}</Text>
            <Button variant="outline" onPress={catalog.retryProducts}>
              Retry
            </Button>
          </View>
        ) : (
          <FlatList
            key={`${viewMode}-${numColumns}`}
            data={catalog.pagedProducts}
            keyExtractor={(item) => item.id}
            numColumns={numColumns}
            columnWrapperStyle={numColumns > 1 ? { gap: 12 } : undefined}
            contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
            ListHeaderComponent={
              <ProductFilter
                searchQuery={catalog.searchQuery}
                onSearchChange={catalog.setSearchQuery}
                selectedCategory={catalog.selectedCategory}
                onCategoryChange={catalog.setSelectedCategory}
                categories={catalog.categories}
                sortKey={catalog.sortKey}
                onSortChange={catalog.setSortKey}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                scanValue={scanValue}
                onScanChange={(v) => {
                  setScanValue(v);
                  if (scanError) setScanError(null);
                }}
                onScanSubmit={handleScanSubmit}
                scanError={scanError}
              />
            }
            ListEmptyComponent={
              <View className="items-center py-12">
                <Text className="text-gray-500">No products found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View className={numColumns > 1 ? 'flex-1' : 'w-full'}>
                <ProductTile product={item} variant={viewMode} onAddToCart={handleAddToCart} />
              </View>
            )}
            ListFooterComponent={
              catalog.filteredProducts.length > 0 && catalog.totalPages > 1 ? (
                <Pagination
                  page={catalog.page}
                  totalPages={catalog.totalPages}
                  onPrev={() => catalog.setPage((p) => Math.max(1, p - 1))}
                  onNext={() => catalog.setPage((p) => Math.min(catalog.totalPages, p + 1))}
                />
              ) : null
            }
          />
        )}
      </View>

      {shiftModal}
    </SafeAreaView>
  );
}
