import { useCallback, useState } from 'react';
import { ActivityIndicator, BackHandler, DevSettings, FlatList, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../../src/contexts/AuthContext';
import { useCatalogContext } from '../../src/contexts/CatalogContext';
import { useCartContext } from '../../src/contexts/CartContext';
import { useScanHandler } from '../../src/hooks/useScanHandler';
import { useSalesHistory } from '../../src/hooks/useSalesHistory';
import { getSaleById, voidPosSale, recordCashMovement, getSalesSummary } from '../../src/api/pos';
import { getDefaultStoreId, getDefaultStoreInfo } from '../../src/services/terminalConfig';
import { Button } from '../../src/components/Button';
import { PosHeader } from '../../src/components/PosHeader';
import { ProductFilter, type ViewMode } from '../../src/components/ProductFilter';
import { ProductTile } from '../../src/components/ProductTile';
import { Pagination } from '../../src/components/Pagination';
import { ShiftModal } from '../../src/components/ShiftModal';
import { Cart } from '../../src/components/Cart';
import { CheckoutModal } from '../../src/components/CheckoutModal';
import { SerialScanModal } from '../../src/components/SerialScanModal';
import { BarcodeScannerModal } from '../../src/components/BarcodeScannerModal';
import { RetrieveModal } from '../../src/components/RetrieveModal';
import { DiscountModal } from '../../src/components/DiscountModal';
import { DiscountManagerModal } from '../../src/components/DiscountManagerModal';
import { SalesHistoryModal } from '../../src/components/SalesHistoryModal';
import { VoidConfirmModal } from '../../src/components/VoidConfirmModal';
import { RefundModal } from '../../src/components/RefundModal';
import { Receipt } from '../../src/components/Receipt';
import { UserMenu } from '../../src/components/UserMenu';
import { SettingsModal } from '../../src/components/SettingsModal';
import { CashMovementModal } from '../../src/components/CashMovementModal';
import { FloatingStockModal } from '../../src/components/FloatingStockModal';
import { SalesSummaryModal } from '../../src/components/SalesSummaryModal';
import { WarrantyLookupModal } from '../../src/components/WarrantyLookupModal';
import { HelpModal } from '../../src/components/HelpModal';
import { PowerActionModal, type PowerAction } from '../../src/components/PowerActionModal';
import type { CheckoutTenderHint, PosSaleDetail, Product, ReceiptData, TransactionDiscount } from '../../src/types';
import { INK } from '../../src/theme';

const STORE_ID = getDefaultStoreId();
const WIDE_LAYOUT_MIN_WIDTH = 700;
const MANAGER_ROLES = ['Manager', 'OIC', 'Admin', 'Super Admin'];

/** Shared by reprint-from-history and the post-void auto-receipt. */
function buildReprintReceiptData(sale: PosSaleDetail, terminalId: string): ReceiptData {
  const payments =
    sale.payments && sale.payments.length > 0
      ? sale.payments.map((p) => ({ method: p.method, label: p.method, amount: p.amount, referenceNumber: p.reference_number ?? undefined }))
      : undefined;
  const vatableSales = sale.amount > 0 ? sale.amount / 1.12 : 0;
  const vatAmount = sale.amount > 0 ? sale.amount - vatableSales : 0;
  return {
    id: sale.transac,
    receiptNumber: sale.receipt,
    date: sale.trandate ?? '',
    time: '',
    storeName: sale.store_name ?? '',
    storeLocation: sale.store_location ?? '',
    storeTin: sale.store_tin ?? undefined,
    storeBirAccreditation: sale.store_bir ?? undefined,
    cashierName: sale.cashier_name ?? 'Cashier',
    terminalId,
    receiptHeader: sale.voided_at ? '*** VOIDED — REPRINT ***' : '*** REPRINT ***',
    items: sale.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.price, lineTotal: item.price * item.quantity, serialNumbers: item.serials })),
    subtotal: sale.amount - sale.discamt,
    discountAmount: sale.discamt > 0 ? sale.discamt : undefined,
    paymentMethod: payments && payments.length > 1 ? 'split' : sale.tender_type ?? 'cash',
    amountTendered: payments && payments.length === 1 ? payments[0].amount : undefined,
    payments,
    vatableSales,
    vatAmount,
    total: sale.amount,
  };
}

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

  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showDiscountManager, setShowDiscountManager] = useState(false);
  const [discountManagerId, setDiscountManagerId] = useState<string | null>(null);

  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [voidTarget, setVoidTarget] = useState<{ id: number; receipt: string } | null>(null);
  const [voidReason, setVoidReason] = useState<string | null>(null);
  const [showVoidAuth, setShowVoidAuth] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundPreselectedSaleId, setRefundPreselectedSaleId] = useState<number | null>(null);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCashMovement, setShowCashMovement] = useState(false);
  const [showFloatingStock, setShowFloatingStock] = useState(false);
  const [showSalesSummary, setShowSalesSummary] = useState(false);
  const [showWarrantyLookup, setShowWarrantyLookup] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [powerAction, setPowerAction] = useState<PowerAction | null>(null);
  const [powerActionBusy, setPowerActionBusy] = useState(false);

  const isCurrentUserManagerOrOIC = !!currentUser?.roles?.some((r) => MANAGER_ROLES.includes(r));

  const salesHistory = useSalesHistory({ storeId: STORE_ID, register: catalog.currentShift?.register ?? '' });

  const handleScanSerial = useCallback(
    (product: Product, quantity: number = 1) => {
      if (!product.isSerialized) {
        cart.addNonSerializedToCart(product, quantity);
        return;
      }
      const existing = cart.items.find((i) => i.product.id === product.id);
      setSerialProduct(product);
      setSerialQuantity(Math.min(Math.max(1, quantity), product.stock));
      setExistingSerials(existing?.serialNumbers ?? []);
      setShowSerialModal(true);
    },
    // `cart` itself is a fresh object every render (useCart returns a plain
    // literal, not memoized); depending on it here would recreate this callback
    // every render and defeat the ProductTile React.memo it's passed into.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart.addNonSerializedToCart, cart.items]
  );

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
    setDiscountManagerId(null);
    setShowCheckout(false);
    setReceiptData(receipt);
  };

  const handleDiscountClick = () => {
    if (cart.discount) setShowDiscountModal(true);
    else setShowDiscountManager(true);
  };

  const handleDiscountApply = (discount: TransactionDiscount) => {
    setShowDiscountModal(false);
    if (discount === null) {
      cart.setDiscount(null);
      setDiscountManagerId(null);
      return;
    }
    setShowDiscountManager(true);
  };

  const handleDiscountApproved = (_managerToken?: string, managerId?: string, discount?: TransactionDiscount) => {
    setDiscountManagerId(managerId ?? null);
    if (discount) cart.setDiscount(discount);
    setShowDiscountManager(false);
  };

  const handleReprintSale = async (saleId: number) => {
    try {
      const sale = await getSaleById(saleId);
      setReceiptData(buildReprintReceiptData(sale, catalog.currentShift?.register ?? ''));
    } catch (e) {
      setVoidError(e instanceof Error ? e.message : 'Failed to load sale for reprint.');
    }
  };

  const handleVoidSaleRequest = (saleId: number, receiptNumber: string) => {
    setVoidTarget({ id: saleId, receipt: receiptNumber });
    setVoidError(null);
  };

  const handleConfirmVoid = (reason: string) => {
    setVoidReason(reason);
    setShowVoidAuth(true);
  };

  // No live token-swap for the approving manager — approvedByManagerId rides
  // along as a trusted data field on the void request (matching how
  // discount_manager_id is trusted on the sale payload), avoiding a risky
  // temporary swap of the cashier's own session token in this UI layer.
  const handleVoidApproved = async (_managerToken?: string, managerId?: string) => {
    setShowVoidAuth(false);
    if (!voidTarget || !catalog.currentShift || !currentUser) return;
    setVoiding(true);
    setVoidError(null);
    try {
      const result = await voidPosSale(voidTarget.id, voidReason, {
        storeId: STORE_ID,
        register: catalog.currentShift.register,
        cashierId: currentUser.id,
        approvedByManagerId: managerId,
      });
      setVoidTarget(null);
      setVoidReason(null);
      await salesHistory.reload();
      catalog.retryProducts();
      if (!result.queued) {
        await handleReprintSale(voidTarget.id);
      }
    } catch (e) {
      setVoidError(e instanceof Error ? e.message : 'Failed to void sale.');
    } finally {
      setVoiding(false);
    }
  };

  const handleRefundSaleRequest = (saleId: number) => {
    setShowSalesHistory(false);
    setRefundPreselectedSaleId(saleId);
    setShowRefundModal(true);
  };

  const handlePowerActionConfirm = () => {
    if (!powerAction) return;
    setPowerActionBusy(true);
    if (powerAction === 'restart') {
      // No expo-updates configured yet (that's an EAS Update / Phase 6 concern) —
      // DevSettings.reload() is RN's own bridge-level "reload the JS bundle"
      // call, which works without it in both Expo Go and a built app.
      DevSettings.reload();
    } else {
      BackHandler.exitApp();
    }
  };

  const shiftModal = (
    <ShiftModal
      visible={showShiftModal}
      currentShift={catalog.currentShift}
      loading={catalog.shiftLoading}
      lastEodReport={catalog.lastEodReport}
      lastEodShiftId={catalog.lastEodShiftId}
      onOpen={(cash) => catalog.openShift(cash)}
      onClose={(cash) => catalog.closeShift(cash)}
      onDismiss={() => setShowShiftModal(false)}
    />
  );

  if (catalog.shiftLoading && !catalog.currentShift) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-mod-bg">
        <ActivityIndicator size="large" color={INK} />
      </SafeAreaView>
    );
  }

  if (!catalog.currentShift) {
    return (
      <SafeAreaView className="flex-1 bg-mod-bg">
        <View className="flex-1 items-center justify-center p-6">
          <View className="w-full max-w-sm gap-4 border-2 border-mod-ink bg-white p-6">
            <Text className="font-a-display text-[17px] tracking-display text-mod-ink">Open a shift to start selling</Text>
            <Text className="font-a text-[14px] text-mod-neutral-700">
              Every sale on this register needs an open shift. Open one to load the product catalog.
            </Text>
            <Button onPress={() => setShowShiftModal(true)}>Open Shift</Button>
            <Button variant="outline" onPress={() => void handleLogout()}>
              Sign Out
            </Button>
          </View>
        </View>
        {shiftModal}
      </SafeAreaView>
    );
  }

  const isWide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const numColumns = viewMode === 'grid' ? Math.max(2, Math.floor((isWide ? width - 440 : width) / 260)) : 1;

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
      onDiscountClick={handleDiscountClick}
      heldCount={cart.heldCarts.length}
      maxHeldCarts={cart.maxHeldCarts}
      subtotal={cart.subtotal}
      discountAmount={cart.discountAmount}
      discount={cart.discount}
      total={cart.total}
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-mod-bg">
      <PosHeader
        userName={currentUser?.name ?? ''}
        offline={loggedInOffline}
        register={catalog.currentShift.register}
        storeName={getDefaultStoreInfo().name}
        businessDate={catalog.currentShift.opened_at.slice(0, 10)}
        isWide={isWide}
        cartCount={cart.items.length}
        onCart={() => setShowMobileCart(true)}
        onHistory={() => {
          setShowSalesHistory(true);
          void salesHistory.reload();
        }}
        onShift={() => setShowShiftModal(true)}
        onMenu={() => setShowUserMenu(true)}
      />
      <View className="flex-1 flex-row">
        <View className="flex-1 px-4 pt-4">
          {catalog.productsLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={INK} />
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

        {isWide && <View className="w-[440px] border-l-2 border-mod-divider">{cartPanel}</View>}
      </View>

      {!isWide && (
        <Modal visible={showMobileCart} animationType="slide" onRequestClose={() => setShowMobileCart(false)}>
          <SafeAreaView className="flex-1 bg-mod-bg p-4">
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
        discountManagerId={discountManagerId}
        total={cart.total}
        storeId={STORE_ID}
        register={catalog.currentShift.register}
        cashierName={currentUser?.name ?? 'Cashier'}
        onClose={() => setShowCheckout(false)}
        onSuccess={handleCheckoutSuccess}
      />

      <DiscountModal
        isOpen={showDiscountModal}
        subtotal={cart.subtotal}
        currentDiscount={cart.discount}
        onApply={handleDiscountApply}
        onClose={() => setShowDiscountModal(false)}
      />

      <DiscountManagerModal
        isOpen={showDiscountManager}
        withDiscountSelection
        allowOfflineApproval
        enableRemoteApproval
        bypassApproval={isCurrentUserManagerOrOIC}
        bypassUserId={currentUser?.id}
        storeId={STORE_ID}
        subtotal={cart.subtotal}
        onApprove={handleDiscountApproved}
        onCancel={() => setShowDiscountManager(false)}
      />

      <VoidConfirmModal
        isOpen={voidTarget !== null && !showVoidAuth && !voiding}
        receiptNumber={voidTarget?.receipt ?? ''}
        voiding={voiding}
        error={voidError}
        onConfirm={handleConfirmVoid}
        onClose={() => {
          if (!voiding) {
            setVoidError(null);
            setVoidTarget(null);
          }
        }}
      />

      {/* Void approval — no bypassUserId: the void endpoint doesn't need or accept one for its own-role bypass. */}
      <DiscountManagerModal
        isOpen={showVoidAuth}
        allowOfflineApproval
        bypassApproval={isCurrentUserManagerOrOIC}
        onApprove={handleVoidApproved}
        onCancel={() => {
          setShowVoidAuth(false);
          setVoidTarget(null);
        }}
      />

      <SalesHistoryModal
        isOpen={showSalesHistory}
        sales={salesHistory.sales}
        loading={salesHistory.loading}
        error={salesHistory.error}
        dateFrom={salesHistory.dateFrom}
        dateTo={salesHistory.dateTo}
        onDateFromChange={salesHistory.setDateFrom}
        onDateToChange={salesHistory.setDateTo}
        onReload={() => void salesHistory.reload()}
        onClose={() => setShowSalesHistory(false)}
        onVoidSale={handleVoidSaleRequest}
        onReprintSale={(saleId) => void handleReprintSale(saleId)}
        onRefundSale={handleRefundSaleRequest}
        isOfflineVoidQualified={salesHistory.isOfflineVoidQualified}
        isOnline={catalog.isOnline}
        currentShiftOpenedAt={catalog.currentShift?.opened_at}
        pendingLocalSaleIds={salesHistory.pendingLocalSaleIds}
      />

      <RefundModal
        isOpen={showRefundModal}
        storeId={STORE_ID}
        register={catalog.currentShift.register}
        preSelectedSaleId={refundPreselectedSaleId}
        cashierName={currentUser?.name ?? 'Cashier'}
        isCurrentUserManagerOrOIC={isCurrentUserManagerOrOIC}
        onClose={() => {
          setShowRefundModal(false);
          setRefundPreselectedSaleId(null);
        }}
        onSuccess={(receipt) => {
          setShowRefundModal(false);
          setRefundPreselectedSaleId(null);
          setReceiptData(receipt);
        }}
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

      <RetrieveModal
        isOpen={showHeldCarts}
        heldCarts={cart.heldCarts}
        onRetrieve={(held) => {
          cart.retrieveCart(held.id);
          setShowHeldCarts(false);
        }}
        onRemove={(held) => cart.removeHeldCart(held.id)}
        onClose={() => setShowHeldCarts(false)}
      />

      {receiptData && <Receipt data={receiptData} onDone={() => setReceiptData(null)} />}

      {currentUser && (
        <UserMenu
          isOpen={showUserMenu}
          currentUser={currentUser}
          hasOpenShift={!!catalog.currentShift}
          onClose={() => setShowUserMenu(false)}
          onSalesHistory={() => {
            setShowSalesHistory(true);
            void salesHistory.reload();
          }}
          onSettings={() => setShowSettings(true)}
          onShift={() => setShowShiftModal(true)}
          onFloatingStock={() => setShowFloatingStock(true)}
          onCashMovement={() => setShowCashMovement(true)}
          onSalesSummary={() => setShowSalesSummary(true)}
          onWarrantyLookup={() => setShowWarrantyLookup(true)}
          onHelp={() => setShowHelp(true)}
          onLogout={() => void handleLogout()}
          onRestartApp={() => setPowerAction('restart')}
          onExitApp={() => setPowerAction('exit')}
        />
      )}

      <SettingsModal isOpen={showSettings} currentUser={currentUser} onClose={() => setShowSettings(false)} onApiBaseUrlChanged={() => void handleLogout()} />

      <CashMovementModal
        isOpen={showCashMovement}
        storeId={STORE_ID}
        register={catalog.currentShift?.register ?? ''}
        onClose={() => setShowCashMovement(false)}
        onRecord={async (params) => {
          if (!currentUser) throw new Error('No authenticated user');
          const result = await recordCashMovement({ ...params, cashierId: currentUser.id });
          return { queued: !!result.queued };
        }}
      />

      <FloatingStockModal isOpen={showFloatingStock} storeId={STORE_ID} onClose={() => setShowFloatingStock(false)} />

      <SalesSummaryModal isOpen={showSalesSummary} storeId={STORE_ID} onClose={() => setShowSalesSummary(false)} onLoad={(params) => getSalesSummary(params)} />

      <WarrantyLookupModal isOpen={showWarrantyLookup} onClose={() => setShowWarrantyLookup(false)} />

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} currentUser={currentUser} />

      <PowerActionModal
        action={powerAction}
        hasOpenShift={!!catalog.currentShift}
        busy={powerActionBusy}
        onConfirm={handlePowerActionConfirm}
        onClose={() => {
          setPowerActionBusy(false);
          setPowerAction(null);
        }}
      />
    </SafeAreaView>
  );
}
