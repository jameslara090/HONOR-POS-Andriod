/**
 * The only wired print path this phase: build an HTML receipt (mirroring
 * Receipt.tsx's layout) and hand it to expo-print + expo-sharing. Bluetooth
 * ESC/POS transport is deferred to Phase 5 — see escpos.ts for the
 * already-built, transport-agnostic command encoder it will hand bytes to.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { EodReport, ReceiptData } from '../types';
import { formatCurrency } from '../utils/currency';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildReceiptHtml(data: ReceiptData): string {
  const itemsHtml = data.items
    .map(
      (item) => `
        <div class="row"><span>${item.quantity} ${escapeHtml(item.name)}</span><span>${formatCurrency(item.lineTotal)}</span></div>
        ${item.serialNumbers
          .filter(Boolean)
          .map((s) => `<div class="serial">SN: ${escapeHtml(s)}</div>`)
          .join('')}
      `
    )
    .join('');

  const paymentsHtml =
    !data.isRefund && data.payments && data.payments.length > 0
      ? data.payments
          .map(
            (p, i) => `
              <div class="row"><span>${i + 1}/ ${escapeHtml(p.label)}</span><span>${formatCurrency(p.amount)}</span></div>
              ${p.referenceNumber ? `<div class="serial">Ref: ${escapeHtml(p.referenceNumber)}</div>` : ''}
            `
          )
          .join('')
      : '';

  const totalsHtml = !data.isRefund
    ? `
        ${
          data.discountAmount && data.discountAmount > 0
            ? `<div class="row"><span>Discount${data.discountLabel ? ` (${escapeHtml(data.discountLabel)})` : ''}</span><span>-${formatCurrency(data.discountAmount)}</span></div>`
            : ''
        }
        <div class="row bold"><span>TOTAL DUE</span><span>${formatCurrency(data.total)}</span></div>
        ${paymentsHtml}
        ${data.change && data.change > 0 ? `<div class="row bold"><span>Change</span><span>${formatCurrency(data.change)}</span></div>` : ''}
        ${
          data.vatableSales != null && data.vatAmount != null
            ? `
              <div class="row"><span>VATable (V)</span><span>${formatCurrency(data.vatableSales)}</span></div>
              <div class="row"><span>VAT-Exempt (E)</span><span>${formatCurrency(0)}</span></div>
              <div class="row"><span>VAT Zero-Rated (Z)</span><span>${formatCurrency(0)}</span></div>
              <div class="row"><span>VAT</span><span>${formatCurrency(data.vatAmount)}</span></div>
            `
            : ''
        }
      `
    : `<div class="row bold"><span>Refund Amount</span><span>${formatCurrency(data.total)}</span></div>`;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: 'Courier New', monospace; font-size: 11pt; width: 280px; margin: 0 auto; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .row { display: flex; justify-content: space-between; }
          .serial { padding-left: 12px; color: #444; font-size: 9pt; }
          hr { border: none; border-top: 1px dashed #999; margin: 6px 0; }
        </style>
      </head>
      <body>
        <div class="center bold">${escapeHtml(data.storeName)}</div>
        <div class="center">${escapeHtml(data.storeLocation)}</div>
        ${data.storeTin ? `<div class="center">TIN: ${escapeHtml(data.storeTin)}</div>` : ''}
        ${data.storeBirAccreditation ? `<div class="center">BIR Accreditation No.: ${escapeHtml(data.storeBirAccreditation)}</div>` : ''}
        ${data.terminalId ? `<div class="center">Terminal ${escapeHtml(data.terminalId)}</div>` : ''}
        ${data.isRefund ? '<div class="center bold">*** REFUND / RETURN ***</div>' : ''}
        ${data.receiptHeader ? `<div class="center bold">*** ${escapeHtml(data.receiptHeader)} ***</div>` : ''}
        <hr />
        <div>${data.isRefund ? 'Ref No.' : 'Invoice(s)'}: ${escapeHtml(data.receiptNumber)}</div>
        ${data.transactionRef ? `<div>Trans#: ${escapeHtml(data.transactionRef)}</div>` : ''}
        ${data.isRefund && data.originalReceiptNumber ? `<div>Orig. OR No.: ${escapeHtml(data.originalReceiptNumber)}</div>` : ''}
        <div>${escapeHtml(data.date)} ${escapeHtml(data.time)}</div>
        <div>Sold By: ${escapeHtml(data.cashierName)}</div>
        ${data.customerName ? `<div>Customer: ${escapeHtml(data.customerName)}</div>` : ''}
        ${data.promoterName ? `<div>Promoter: ${escapeHtml(data.promoterName)}</div>` : ''}
        <hr />
        ${itemsHtml}
        <hr />
        ${totalsHtml}
        <hr />
        <div class="center" style="color:#666">${data.isRefund ? 'Return processed — thank you' : 'Thank you for your purchase'}</div>
      </body>
    </html>
  `;
}

/** Renders the receipt to PDF and opens the share sheet — the only wired print path this phase. */
export async function printReceipt(data: ReceiptData): Promise<void> {
  const html = buildReceiptHtml(data);
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri);
  }
}

function buildZReportHtml(report: EodReport): string {
  const row = (label: string, value: string, bold = false) =>
    `<div class="row${bold ? ' bold' : ''}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
  const tenders = report.tenders_breakdown ?? Object.entries(report.payment_breakdown ?? {}).map(([method, total]) => ({ method, total }));

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: 'Courier New', monospace; font-size: 11pt; width: 280px; margin: 0 auto; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .row { display: flex; justify-content: space-between; }
          hr { border: none; border-top: 1px dashed #999; margin: 6px 0; }
        </style>
      </head>
      <body>
        ${report.company_name ? `<div class="center bold">${escapeHtml(report.company_name)}</div>` : ''}
        <div class="center bold">${escapeHtml(report.store_name)}</div>
        ${report.store_location ? `<div class="center">${escapeHtml(report.store_location)}</div>` : ''}
        <div class="center bold">Z - R E A D I N G</div>
        <hr />
        ${row('Register', report.register)}
        ${row('Sold By', report.cashier_name)}
        ${row('Date', report.date)}
        ${row('Z-Number', report.z_number)}
        <hr />
        ${row(`Gross Sales (${report.gross_count})`, formatCurrency(report.gross_total))}
        ${report.void_total > 0 ? row(`Voids (${report.void_count})`, `-${formatCurrency(report.void_total)}`) : ''}
        ${report.refund_total > 0 ? row(`Refunds (${report.refund_count})`, `-${formatCurrency(report.refund_total)}`) : ''}
        ${row('Net Sales', formatCurrency(report.net_sales), true)}
        <hr />
        ${tenders.map((t) => row(t.method, formatCurrency(t.total))).join('')}
        <hr />
        ${row('Opening Cash', formatCurrency(report.opening_cash))}
        ${row('Expected Cash', formatCurrency(report.expected_cash))}
        ${report.closing_cash != null ? row('Declared Cash', formatCurrency(report.closing_cash)) : ''}
        <hr />
        ${row('VATable Sales', formatCurrency(report.vatable_sales))}
        ${row('VAT', formatCurrency(report.vat_amount))}
      </body>
    </html>
  `;
}

/** Renders the Z-report to PDF and opens the share sheet. */
export async function printZReport(report: EodReport): Promise<void> {
  const html = buildZReportHtml(report);
  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri);
  }
}
