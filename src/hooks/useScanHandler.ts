/**
 * Ported from the desktop's useScanHandler.ts exactly: try a local SKU match
 * against the loaded catalog first; if none, treat the input as a
 * serial/IMEI and validate it against the backend. Fed by either a manual
 * TextInput (ProductFilter's scan field) or BarcodeScannerModal's camera
 * result — both call handleScan with the same raw string.
 */
import { useCallback } from 'react';
import { lookupSerial } from '../api/pos';
import { mapApiProductToProduct, type ApiProduct } from '../api/products';
import type { Product } from '../types';

interface UseScanHandlerOptions {
  products: Product[];
  storeId: number | null;
  onNonSerializedFound: (product: Product, quantity: number) => void;
  onSerializedFound: (product: Product, quantity: number) => void;
  onSerialNumberFound: (product: Product, serial: string) => void;
  setScanError: (err: string | null) => void;
  setScanInputValue: (v: string) => void;
}

export function useScanHandler({
  products,
  storeId,
  onNonSerializedFound,
  onSerializedFound,
  onSerialNumberFound,
  setScanError,
  setScanInputValue,
}: UseScanHandlerOptions) {
  const clearInputWithError = useCallback(
    (msg: string) => {
      setScanError(msg);
      setScanInputValue('');
      setTimeout(() => setScanError(null), 3000);
    },
    [setScanError, setScanInputValue]
  );

  const handleScan = useCallback(
    async (value: string) => {
      const input = value.trim();
      if (!input) return;

      // 1. Try SKU / barcode match against the loaded catalog
      const bySkuProduct = products.find((p) => p.sku.toLowerCase() === input.toLowerCase());
      if (bySkuProduct) {
        setScanError(null);
        setScanInputValue('');
        if (bySkuProduct.stock <= 0) {
          clearInputWithError('Out of stock');
          return;
        }
        if (bySkuProduct.isSerialized) onSerializedFound(bySkuProduct, 1);
        else onNonSerializedFound(bySkuProduct, 1);
        return;
      }

      // 2. No SKU match — try serial number lookup via API
      setScanError(null);
      try {
        const result = await lookupSerial({ serial_number: input, store_id: storeId });
        const product = mapApiProductToProduct(result.product as unknown as ApiProduct);
        setScanInputValue('');
        if (product.stock <= 0) {
          clearInputWithError(`${product.name}: out of stock`);
          return;
        }
        if (result.imei_warning) {
          setScanError(result.imei_warning);
          setTimeout(() => setScanError(null), 4000);
        }
        onSerialNumberFound(product, result.serial_number);
      } catch (err) {
        clearInputWithError(err instanceof Error ? err.message : 'Product not found');
      }
    },
    [products, storeId, onNonSerializedFound, onSerializedFound, onSerialNumberFound, setScanError, setScanInputValue, clearInputWithError]
  );

  return { handleScan };
}
