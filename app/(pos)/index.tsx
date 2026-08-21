import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../../src/contexts/AuthContext';
import { useCatalogContext } from '../../src/contexts/CatalogContext';
import { useCartContext } from '../../src/contexts/CartContext';
import { useScanHandler } from '../../src/hooks/useScanHandler';
import { getDefaultStoreId } from '../../src/services/terminalConfig';
import { Button } from '../../src/components/Button';
import { ProductFilter, type ViewMode } from '../../src/components/ProductFilter';
import { ProductTile } from '../../src/components/ProductTile';
import { Pagination } from '../../src/components/Pagination';
import { ShiftModal } from '../../src/components/ShiftModal';
import { Cart } from '../../src/components/Cart';
import { CheckoutModal } from '../../src/components/CheckoutModal';
import { SerialScanModal } from '../../src/components/SerialScanModal';
import { BarcodeScannerModal } from '../../src/components/BarcodeScannerModal';
import { HeldCartsModal } from '../../src/components/HeldCartsModal';
import { Receipt } from '../../src/components/Receipt';
import type { CheckoutTenderHint, Product, ReceiptData } from '../../src/types';

const STORE_ID = getDefaultStoreId();
const WIDE_LAYOUT_MIN_WIDTH = 700;

export default function PosHomeScreen() {
  const { currentUser, loggedInOffline, handleLogout } = useAuthContext();
  const catalog = useCatalogContext();
  const cart = useCartContext();
  const { width } = useWindowDimensions();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [scanValue, setScanValue] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showHeldCarts, setShowHeldCarts] = useState(false);

  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutHint, setCheckoutHint] = useState<CheckoutTenderHint | undefined>(undefined);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  const [showSerialModal, setShowSerialModal] = useState(false);
  const [serialProduct, setSerialProduct] = useState<Product | null>(null);
  const [serialQuantity, setSerialQuantity] = useState(1);
  const [existingSerials, setExistingSerials] = useState<string[]>([]);

  const handleScanSerial = (product: Product, quantity: number = 1) => {
    if (!product.isSerialized) {
      cart.addNonSerializedToCart(product, quantity);
      return;
    }
    const existing = cart.items.find((i) => i.product.id === product.id);
    setSerialProduct(product);
    setSerialQuantity(Math.min(Math.max(1, quantity), product.stock));
    setExistingSerials(existing?.serialNumbers ?? []);
    setShowSerialModal(true);
  };

  const { handleScan } = useScanHandler({
    products: catalog.products,
    storeId: STORE_ID,
    onNonSerializedFound: (product, qty) => cart.addNonSerializedToCart(product, qty),
    onSerializedFound: (product, qty) => handleScanSerial(product, qty),
    onSerialNumberFound: (product, serial) => cart.addSerializedItems(product, [serial]),
    setScanError,
    setScanInputValue: setScanValue,
  });

  const handleConfirmSerialScan = (serialNumbers: string[]) => {
    if (!serialProduct) return;
    cart.addSerializedItems(serialProduct, serialNumbers);
    setShowSerialModal(false);
    setSerialProduct(null);
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    const item = cart.items.find((i) => i.product.id === productId);
    if (!item) return;
    const latestProduct = catalog.products.find((p) => p.id === productId);
    const maxQty = Math.max(1, latestProduct?.stock ?? item.product.stock ?? 1);
    const targetQty = Math.max(1, Math.min(quantity, maxQty));
    if (item.product.isSerialized && targetQty > item.quantity) {
      handleScanSerial(item.product, targetQty - item.quantity);
      return;
    }
    cart.updateQuantity(productId, quantity, latestProduct?.stock);
  };

  const handleCheckout = (hint?: CheckoutTenderHint) => {
    setCheckoutHint(hint);
    setShowCheckout(true);
    setShowMobileCart(false);
  };

  const handleCheckoutSuccess = (receipt: ReceiptData) => {
    cart.clearCart();
    setShowCheckout(false);
    setReceiptData(receipt);
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

  const isWide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const numColumns = viewMode === 'grid' ? Math.max(2, Math.floor((isWide ? width * 0.65 : width) / 220)) : 1;

  const cartPanel = (
    <Cart
      items={cart.items}
      onUpdateQuantity={handleUpdateQuantity}
      onRemoveItem={cart.removeItem}
      onCheckout={handleCheckout}
      onHold={cart.holdCart}
      onRetrieveClick={() => {
        if (cart.heldCarts.length === 1) cart.retrieveCart(cart.heldCarts[0].id);
        else if (cart.heldCarts.length > 1) setShowHeldCarts(true);
      }}
      heldCount={cart.heldCarts.length}
      maxHeldCarts={cart.maxHeldCarts}
      subtotal={cart.subtotal}
      discountAmount={cart.discountAmount}
      discount={cart.discount}
      total={cart.total}
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 flex-row px-4 pt-4">
        <View className="flex-1">
          <View className="mb-3 flex-row items-center justify-between">
            <View>
              <Text className="text-lg font-bold text-gray-900">Welcome, {currentUser?.name}</Text>
              {loggedInOffline && <Text className="text-xs font-medium text-amber-600">Signed in offline</Text>}
            </View>
            <View className="flex-row items-center gap-3">
              {!isWide && (
                <Button variant="outline" onPress={() => setShowMobileCart(true)}>
                  {`Cart (${cart.items.length})`}
                </Button>
              )}
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
                  onScanSubmit={handleScan}
                  scanError={scanError}
                  onOpenCamera={() => setShowCamera(true)}
                />
              }
              ListEmptyComponent={
                <View className="items-center py-12">
                  <Text className="text-gray-500">No products found</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View className={numColumns > 1 ? 'flex-1' : 'w-full'}>
                  <ProductTile product={item} variant={viewMode} onAddToCart={handleScanSerial} />
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

        {isWide && <View className="ml-4 w-80">{cartPanel}</View>}
      </View>

      {!isWide && (
        <Modal visible={showMobileCart} animationType="slide" onRequestClose={() => setShowMobileCart(false)}>
          <SafeAreaView className="flex-1 bg-gray-50 p-4">
            <Pressable onPress={() => setShowMobileCart(false)} className="mb-2 self-end">
              <Text className="text-sm text-gray-500">Close</Text>
            </Pressable>
            {cartPanel}
          </SafeAreaView>
        </Modal>
      )}

      {shiftModal}

      <CheckoutModal
        isOpen={showCheckout}
        initialTenderHint={checkoutHint}
        items={cart.items}
        subtotal={cart.subtotal}
        discountAmount={cart.discountAmount}
        discount={cart.discount}
        total={cart.total}
        storeId={STORE_ID}
        register={catalog.currentShift.register}
        cashierName={currentUser?.name ?? 'Cashier'}
        onClose={() => setShowCheckout(false)}
        onSuccess={handleCheckoutSuccess}
      />

      <SerialScanModal
        isOpen={showSerialModal}
        product={serialProduct}
        quantity={serialQuantity}
        storeId={STORE_ID}
        existingSerials={existingSerials}
        onConfirm={handleConfirmSerialScan}
        onClose={() => setShowSerialModal(false)}
      />

      <BarcodeScannerModal
        isOpen={showCamera}
        onScanned={(value) => {
          setShowCamera(false);
          void handleScan(value);
        }}
        onClose={() => setShowCamera(false)}
      />

      <HeldCartsModal
        isOpen={showHeldCarts}
        heldCarts={cart.heldCarts}
        onSelect={(id) => {
          cart.retrieveCart(id);
          setShowHeldCarts(false);
        }}
        onClose={() => setShowHeldCarts(false)}
      />

      {receiptData && <Receipt data={receiptData} onDone={() => setReceiptData(null)} />}
    </SafeAreaView>
  );
}
