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

export interface PosShiftInfo {
  id: number;
  branch: number;
  register: string;
  cashier?: number;
  opened_at: string;
  closed_at?: string | null;
  opening_cash: number;
  closing_cash?: number | null;
  sales_count: number;
  sales_total: number;
  discount_total: number;
  void_count?: number;
  void_total?: number;
  refund_count?: number;
  refund_total?: number;
  net_sales?: number;
  cash_sales?: number;
  expected_cash?: number | null;
  cash_difference?: number | null;
  z_number?: string | null;
  status: string;
}

/** Full EOD / Z-Report data returned by closeShift() and getEodReport(). */
export interface EodReport {
  z_number: string;
  company_name?: string | null;
  store_name: string;
  store_location?: string | null;
  store_tin?: string | null;
  store_bir?: string | null;
  cashier_name: string;
  register: string;
  opened_at: string;
  closed_at: string;
  date: string;
  gross_count: number;
  gross_total: number;
  void_count: number;
  void_total: number;
  refund_count: number;
  refund_total: number;
  net_sales: number;
  payment_breakdown: Record<string, number>;
  vatable_sales: number;
  vat_amount: number;
  discount_total: number;
  opening_cash: number;
  cash_sales: number;
  cash_in?: number;
  cash_out?: number;
  expected_cash: number;
  closing_cash: number | null;
  cash_difference: number | null;
  open_manager_name?: string;
  open_reading?: number;
  closing_reading?: number;
  trans_reading?: number;
  reset_counter?: number;
  eod_counter?: number;
  invoice_from?: string;
  invoice_to?: string;
  invoice_count?: number;
  transactions_breakdown?: { trantype: string; count: number; total: number }[];
  tenders_breakdown?: { method: string; count: number; total: number }[];
  cancel_orders_count?: number;
  cancel_orders_total?: number;
  deposit_total?: number;
  deposit_applied_total?: number;
  deposit_refunded_total?: number;
  terminal_total?: number;
  oic_name?: string;
}

export interface CloseShiftResult {
  shift: PosShiftInfo;
  eod_report: EodReport;
}

export type CloseShiftOutcome = { kind: 'closed'; result: CloseShiftResult } | { kind: 'pending'; closingCash: number };

/** Backend tender-type catalog row — drives the checkout UI's per-class rendering and rules. */
export interface PosTenderType {
  id: number;
  code: string;
  name: string;
  bank_name: string | null;
  tender_class: string;
  sort_order: number;
  metadata: Record<string, unknown>;
}

/** From Cart's quick-pay buttons — a hint, not a locked-in choice. */
export type CheckoutTenderHint = 'cash' | 'gcash' | 'credit_card' | 'bank_transfer' | 'installment';

/** One payment leg accumulated during checkout (before submission). */
export interface SplitPaymentEntry {
  amount: number;
  label: string;
  /** Backend sales_transactions.tender_type catalog code. */
  tenderCode: string;
  tenderClass: string;
  referenceNumber?: string;
  metadata?: Record<string, unknown>;
}

/** Present in the sale payload shape for parity with the desktop API, but nothing in this
 * port (or the desktop's own CheckoutModal) currently constructs one — installment sales
 * are recorded as a normal SplitPaymentEntry instead. */
export interface PosSaleInstallment {
  financing_company: string;
  reference_number?: string | null;
  down_payment: number;
  term_months: number;
  monthly_amount: number;
}

export interface PosSaleItem {
  product_id: number;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  is_serialized: boolean;
  serials: string[];
}

export interface PosSalePayment {
  method: string;
  amount: number;
  reference_number?: string | null;
}

export interface PosSaleRequest {
  store_id: number;
  /** Stable id for offline queue replay (server stores as client_sale_uuid). */
  client_sale_id?: string;
  register?: string;
  customer_name?: string | null;
  customer_id?: number | null;
  promoter_id?: string | null;
  discount_code?: string | null;
  discount_amt?: number;
  discount_type_id?: number | null;
  discount_manager_id?: string | null;
  tender_type?: string;
  trantype?: 'Retail' | 'Free';
  change_amount?: number;
  payments: PosSalePayment[];
  items: PosSaleItem[];
  installment?: PosSaleInstallment | null;
}

export interface PosSaleResult {
  sale_id: number;
  transac: string;
  receipt: string;
  trandate: string;
  amount: number;
  tender_amount?: number;
  change_amount?: number;
}

export interface PosCustomer {
  id: number;
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tin?: string | null;
}

// ---------------------------------------------------------------------------
// Phase 4 — discount catalog / approval, reprint gate, sales history, refund
// ---------------------------------------------------------------------------

export interface PosDiscount {
  id: number;
  discount_name: string;
  discount_type: string | null;
  discount_value: string | null;
  discount_rate: string | null;
  discount_amount: string | null;
  transaction_type_id: number | null;
  transaction_type?: { id: number; transaction_type: string } | null;
  is_active: boolean;
}

export type DiscountApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

export interface DiscountApprovalRequestResult {
  id: number;
  status: DiscountApprovalStatus;
  approved_by: number | null;
  approver_name: string | null;
  rejection_reason: string | null;
  expires_at: string;
}

export interface CreateDiscountApprovalRequestParams {
  storeId: number;
  discountAmount: number;
  discountReason?: string;
  saleSubtotal?: number;
}

export type ReprintTargetType = 'sale' | 'zreport';
export type ReprintRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

export interface ReprintRequestResult {
  id: number;
  status: ReprintRequestStatus;
  type: ReprintTargetType;
  target_id: number;
  approved_by: number | null;
  approver_name: string | null;
  rejection_reason: string | null;
  expires_at: string;
}

export type ReprintEligibilityReason = 'approved_grant' | 'free' | 'already_reprinted' | 'too_old';

export interface ReprintEligibility {
  can_reprint: boolean;
  reason: ReprintEligibilityReason;
  /** Present only when reason is 'approved_grant' — pass back to logReprint() to spend it. */
  reprint_request_id: number | null;
  pending_request: ReprintRequestResult | null;
}

export interface PosSaleSummary {
  id: number;
  receipt: string;
  transaction: string;
  date: string;
  time: string;
  mode: string;
  tran_type: string;
  amount: number;
  tender_amount?: number;
  change_amount?: number;
  discount: number;
  discount_code?: string | null;
  customer?: string | null;
  cashier?: string | null;
  tender_type?: string | null;
  items: string;
  voided_at?: string | null;
}

export interface PosSaleItemDetail {
  product_id: number;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  is_serialized: boolean;
  serials: string[];
}

export interface PosSalePaymentDetail {
  method: string;
  tender_class: string;
  amount: number;
  reference_number: string | null;
}

export interface PosSaleDetail {
  id: number;
  transac: string;
  receipt: string;
  trandate: string | null;
  mode: string;
  amount: number;
  tender_amount: number;
  change_amount: number;
  discamt: number;
  disccode?: string | null;
  chargeto: string | null;
  tender_type?: string | null;
  register?: string | null;
  voided_at?: string | null;
  cashier_name?: string | null;
  promoter_id?: string | null;
  store_name?: string | null;
  store_location?: string | null;
  store_tin?: string | null;
  store_bir?: string | null;
  items: PosSaleItemDetail[];
  payments: PosSalePaymentDetail[];
}

export interface PosRefundItem {
  product_id: number;
  quantity: number;
  is_serialized: boolean;
  serials: string[];
}

export interface PosRefundRequest {
  store_id: number;
  register?: string;
  original_sale_id: number;
  items: PosRefundItem[];
}

export interface PosRefundResult {
  refund_id: number;
  transac: string;
  receipt: string;
  trandate: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// Phase 5 — cash movement, sales summary, promoters, floating stock, warranty
// ---------------------------------------------------------------------------

export interface CashMovementResult {
  id: number;
  shift_id: number;
  type: 'IN' | 'OUT';
  amount: number;
  reason?: string | null;
  created_at: string;
  /** True when this was queued locally and has not reached the server yet. */
  queued?: boolean;
}

export type SalesSummaryGroupBy = 'payment_method' | 'cashier' | 'day';

export interface SalesSummaryBreakdownRow {
  label: string;
  count: number;
  gross: number;
  discounts: number;
  net: number;
}

export interface SalesSummaryReport {
  period: { from: string; to: string };
  group_by: SalesSummaryGroupBy;
  totals: {
    gross: number;
    voids: number;
    discounts: number;
    net: number;
    transactions: number;
    voided_transactions: number;
  };
  breakdown: SalesSummaryBreakdownRow[];
}

export interface PromoterOption {
  userId: string;
  name: string;
  email?: string | null;
}

export interface FloatingStockItem {
  id: number;
  serial_number: string;
  product_desc?: string;
  product_code?: string;
  promoter_id?: string | null;
  punched_out_by_name?: string;
  punched_out_at: string;
  notes?: string | null;
  return_reason?: string | null;
  status: 'OUT' | 'RETURNED' | 'SOLD';
  hours_out: number | null;
  /** True for a punch queued locally and not yet synced to the server. */
  pendingSync?: boolean;
}

export interface WarrantyRecord {
  id: number;
  serial_number: string;
  sold_at: string;
  warranty_months: number;
  expires_at: string;
  status: 'active' | 'expired' | 'voided';
  product_name?: string;
  product_sku?: string;
  customer_name?: string;
  customer_phone?: string;
  store_name?: string;
  receipt?: string;
}
