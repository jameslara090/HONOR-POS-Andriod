/**
 * Pure ESC/POS command builder — no native module, no I/O. Takes ReceiptData
 * in, returns a byte sequence out, so it's testable now and ready for
 * whichever Bluetooth transport library Phase 5 picks to hand these bytes
 * to a printer. Mirrors Receipt.tsx's layout (header/meta/items/totals/footer).
 */
import type { ReceiptData } from '../types';
import { formatCurrency } from '../utils/currency';

const ESC = 0x1b;
const GS = 0x1d;

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if (code > 0xffff) i++; // consume the second half of a surrogate pair
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

type Align = 'left' | 'center' | 'right';

class EscPosBuilder {
  private bytes: number[] = [ESC, 0x40]; // initialize

  align(a: Align): this {
    this.bytes.push(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0);
    return this;
  }

  bold(on: boolean): this {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  private text(line: string): this {
    this.bytes.push(...utf8Bytes(line));
    return this;
  }

  line(line: string = ''): this {
    this.text(line);
    this.bytes.push(0x0a);
    return this;
  }

  feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) this.bytes.push(0x0a);
    return this;
  }

  /** Two-column line — label left, value right, padded to `width` characters. */
  row(label: string, value: string, width: number = 32): this {
    const padding = Math.max(1, width - label.length - value.length);
    return this.line(`${label}${' '.repeat(padding)}${value}`);
  }

  divider(width: number = 32): this {
    return this.line('-'.repeat(width));
  }

  cut(): this {
    this.bytes.push(GS, 0x56, 0x00);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/** Builds a full ESC/POS byte sequence for a per-sale receipt. `width` is the printer's character width (32 for 58mm paper, 42–48 for 80mm). */
export function buildReceiptEscPos(data: ReceiptData, width: number = 32): Uint8Array {
  const b = new EscPosBuilder();

  b.align('center').bold(true).line(data.storeName).bold(false);
  b.line(data.storeLocation);
  if (data.storeTin) b.line(`TIN: ${data.storeTin}`);
  if (data.storeBirAccreditation) b.line(`BIR Accreditation No.: ${data.storeBirAccreditation}`);
  if (data.terminalId) b.line(`Terminal ${data.terminalId}`);
  if (data.isRefund) b.bold(true).line('*** REFUND / RETURN ***').bold(false);
  if (data.receiptHeader) b.bold(true).line(`*** ${data.receiptHeader} ***`).bold(false);
  b.divider(width);

  b.align('left');
  b.line(`${data.isRefund ? 'Ref No.' : 'Invoice(s)'}: ${data.receiptNumber}`);
  if (data.transactionRef) b.line(`Trans#: ${data.transactionRef}`);
  if (data.isRefund && data.originalReceiptNumber) b.line(`Orig. OR No.: ${data.originalReceiptNumber}`);
  b.line(`${data.date} ${data.time}`);
  b.line(`Sold By: ${data.cashierName}`);
  if (data.customerName) b.line(`Customer: ${data.customerName}`);
  if (data.promoterName) b.line(`Promoter: ${data.promoterName}`);
  b.divider(width);

  for (const item of data.items) {
    b.line(`${item.quantity} ${item.name}`);
    b.row('', formatCurrency(item.lineTotal), width);
    for (const serial of item.serialNumbers) {
      if (serial) b.line(`  SN: ${serial}`);
    }
  }
  b.divider(width);

  if (!data.isRefund) {
    if (data.discountAmount && data.discountAmount > 0) {
      b.row(data.discountLabel ? `Discount (${data.discountLabel})` : 'Discount', `-${formatCurrency(data.discountAmount)}`, width);
    }
    b.bold(true).row('TOTAL DUE', formatCurrency(data.total), width).bold(false);

    if (data.payments && data.payments.length > 0) {
      data.payments.forEach((p, i) => {
        b.row(`${i + 1}/ ${p.label}`, formatCurrency(p.amount), width);
        if (p.referenceNumber) b.line(`  Ref: ${p.referenceNumber}`);
      });
    }
    if (data.change && data.change > 0) {
      b.bold(true).row('Change', formatCurrency(data.change), width).bold(false);
    }
    if (data.vatableSales != null && data.vatAmount != null) {
      b.row('VATable (V)', formatCurrency(data.vatableSales), width);
      b.row('VAT-Exempt (E)', formatCurrency(0), width);
      b.row('VAT Zero-Rated (Z)', formatCurrency(0), width);
      b.row('VAT', formatCurrency(data.vatAmount), width);
    }
  } else {
    b.bold(true).row('Refund Amount', formatCurrency(data.total), width).bold(false);
  }

  b.divider(width);
  b.align('center').line(data.isRefund ? 'Return processed — thank you' : 'Thank you for your purchase');
  b.feed(3);
  b.cut();

  return b.build();
}
