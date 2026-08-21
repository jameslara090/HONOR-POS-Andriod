/**
 * On-screen Z-Report — ported from the desktop's ZReport.tsx. The desktop
 * renders this identical component both on-screen and inside a hidden print
 * portal; here it's just the on-screen view (Receipt/printing.ts already
 * owns this port's one wired print path — see the Phase 3 plan). Only ever
 * receives a real closed-shift EodReport this phase (X-Report/Reading-Report
 * variants are not built, per the Phase 4 plan's scope cuts).
 */
import { Text, View } from 'react-native';
import type { EodReport } from '../types';
import { formatCurrency } from '../utils/currency';

interface ZReportProps {
  report: EodReport;
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View className="flex-row justify-between py-0.5">
      <Text className={`text-xs ${bold ? 'font-bold' : ''} ${color ?? 'text-gray-800'}`}>{label}</Text>
      <Text className={`text-xs ${bold ? 'font-bold' : ''} ${color ?? 'text-gray-800'}`}>{value}</Text>
    </View>
  );
}

export function ZReport({ report }: ZReportProps) {
  const tenders = report.tenders_breakdown ?? Object.entries(report.payment_breakdown ?? {}).map(([method, total]) => ({ method, count: 0, total }));

  return (
    <View className="gap-1 rounded-xl border border-gray-200 bg-white p-4">
      <View className="items-center border-b border-dashed border-gray-300 pb-2">
        {report.company_name && <Text className="text-sm font-bold text-gray-900">{report.company_name}</Text>}
        <Text className="text-sm font-bold text-gray-900">{report.store_name}</Text>
        {report.store_location && <Text className="text-xs text-gray-600">{report.store_location}</Text>}
        {report.store_tin && <Text className="text-xs text-gray-600">TIN: {report.store_tin}</Text>}
        {report.store_bir && <Text className="text-xs text-gray-600">BIR Accreditation No.: {report.store_bir}</Text>}
        <Text className="mt-1 text-sm font-bold tracking-widest text-gray-900">Z - R E A D I N G</Text>
      </View>

      <View className="gap-0.5 border-b border-dashed border-gray-300 py-2">
        <Row label="Register" value={report.register} />
        <Row label="Sold By" value={report.cashier_name} />
        {report.oic_name && <Row label="OIC" value={report.oic_name} />}
        <Row label="Date" value={report.date} />
        <Row label="Opened" value={report.opened_at} />
        <Row label="Closed" value={report.closed_at} />
        <Row label="Z-Number" value={report.z_number} />
      </View>

      <View className="gap-0.5 border-b border-dashed border-gray-300 py-2">
        <Row label={`Gross Sales (${report.gross_count})`} value={formatCurrency(report.gross_total)} />
        {report.discount_total > 0 && <Row label="Discounts" value={`-${formatCurrency(report.discount_total)}`} color="text-green-600" />}
        {report.void_total > 0 && <Row label={`Voids (${report.void_count})`} value={`-${formatCurrency(report.void_total)}`} color="text-red-600" />}
        {report.refund_total > 0 && <Row label={`Refunds (${report.refund_count})`} value={`-${formatCurrency(report.refund_total)}`} color="text-red-600" />}
        <Row label="Net Sales" value={formatCurrency(report.net_sales)} bold />
      </View>

      {tenders.length > 0 && (
        <View className="gap-0.5 border-b border-dashed border-gray-300 py-2">
          <Text className="text-xs font-bold text-gray-900">Tender Breakdown</Text>
          {tenders.map((t, i) => (
            <Row key={i} label={t.method} value={formatCurrency(t.total)} />
          ))}
        </View>
      )}

      <View className="gap-0.5 border-b border-dashed border-gray-300 py-2">
        <Row label="Opening Cash" value={formatCurrency(report.opening_cash)} />
        <Row label="Cash Sales" value={formatCurrency(report.cash_sales)} />
        {!!report.cash_in && <Row label="Cash In" value={formatCurrency(report.cash_in)} />}
        {!!report.cash_out && <Row label="Cash Out" value={`-${formatCurrency(report.cash_out)}`} />}
        <Row label="Expected Cash" value={formatCurrency(report.expected_cash)} bold />
        {report.closing_cash != null && <Row label="Declared Cash" value={formatCurrency(report.closing_cash)} bold />}
        {report.cash_difference != null && (
          <Row
            label={report.cash_difference >= 0 ? 'Overage' : 'Short'}
            value={formatCurrency(Math.abs(report.cash_difference))}
            bold
            color={report.cash_difference >= 0 ? 'text-green-600' : 'text-red-600'}
          />
        )}
      </View>

      <View className="gap-0.5 py-2">
        <Row label="VATable Sales" value={formatCurrency(report.vatable_sales)} />
        <Row label="VAT" value={formatCurrency(report.vat_amount)} />
      </View>

      {(report.invoice_from || report.invoice_to) && (
        <Text className="pt-1 text-center text-xs text-gray-400">
          SI# {report.invoice_from}–{report.invoice_to}
        </Text>
      )}
    </View>
  );
}
