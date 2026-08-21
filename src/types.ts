export type ProductCategory = string;

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  image?: string;
  description?: string;
  stock: number;
  hasStockData: boolean;
  sku: string;
  /** True when product is serialized in inventory (each unit has its own serial). */
  isSerialized?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  serialNumbers: string[]; // Array of serial numbers, one per quantity
}

export interface Cart {
  items: CartItem[];
  total: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  role: 'admin' | 'cashier' | 'user';
  is_sales_person?: boolean;
  totpSecret?: string; // TOTP secret for Google Authenticator (optional, set during setup)
}

/** Transaction-level discount (percent or fixed amount) */
export type TransactionDiscount =
  | { type: 'percent'; value: number; discountTypeId?: number }
  | { type: 'fixed'; value: number; discountTypeId?: number }
  | null;

/** Data for a completed sale receipt (no backend yet) */
export interface ReceiptData {
  id: string;
  receiptNumber: string; // human-readable receipt #
  /** External payment reference, if any. */
  transactionRef?: string;
  date: string;
  time: string;
  storeName: string;
  storeLocation: string;
  cashierName: string;
  customerName?: string;
  promoterName?: string;
  terminalId?: string; // optional register/terminal
  /** When true, renders as a refund/return slip instead of a sale receipt */
  isRefund?: boolean;
  /** Original sale receipt number (shown on refund slip) */
  originalReceiptNumber?: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    serialNumbers: string[];
  }[];
  subtotal: number;
  discountAmount?: number;
  discountLabel?: string; // e.g. "10% off" or "₱5 off"
  paymentMethod: string;
  amountTendered?: number;
  change?: number;
  /** Split payment: each method and amount (when present, receipt shows these instead of single paymentMethod) */
  payments?: { method: string; label: string; amount: number; referenceNumber?: string }[];
  // VAT breakdown (for BIR-style receipts, assuming VAT-inclusive pricing)
  vatableSales?: number;
  vatAmount?: number;
  /** BIR TIN of the store, e.g. 123-456-789-000 */
  storeTin?: string;
  /** BIR accreditation / CAS number of the store */
  storeBirAccreditation?: string;
  total: number;
  /** Optional header line (e.g. "LAYAWAY DEPOSIT") */
  receiptHeader?: string;
}

/**
 * A queued offline action (sale or void) the server permanently rejected at
 * sync time. The queue item is already gone — this exists purely so staff
 * see the rejection and can follow up manually; dismissing is acknowledgment.
 */
export interface SyncConflict {
  id: string;
  type: 'void' | 'sale' | 'customer';
  message: string;
  occurredAt: number;
}

/** A cart saved on hold (for Hold/Retrieve) */
export interface HeldCart {
  id: string;
  heldAt: string; // ISO date string
  heldAtLabel: string; // e.g. "2:30 PM"
  itemCount: number;
  total: number;
  items: CartItem[];
  discount?: TransactionDiscount | null;
}
