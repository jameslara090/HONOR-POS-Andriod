/**
 * Sales summary report — ported from the desktop's SalesSummaryModal.tsx.
 * CSV export uses expo-file-system + expo-sharing (no Blob/URL.createObjectURL
 * on RN) instead of the desktop's browser download; "Print" shares the same
 * PDF path as the receipt/Z-report (see printing.ts) instead of window.print().
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SalesSummaryBreakdownRow, SalesSummaryGroupBy, SalesSummaryReport } from '../types';
import { formatCurrency } from '../utils/currency';
import { Button } from './Button';

interface SalesSummaryModalProps {
  isOpen: boolean;
  storeId: number | null;
  onClose: () => void;
  onLoad: (params: { storeId: number; dateFrom: string; dateTo: string; groupBy: SalesSummaryGroupBy }) => Promise<SalesSummaryReport>;
}

const today = () => new Date().toISOString().slice(0, 10);

const GROUP_OPTIONS: { value: SalesSummaryGroupBy; label: string }[] = [
  { value: 'payment_method', label: 'Payment Method' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'day', label: 'By Day' },
];

async function exportCsv(report: SalesSummaryReport, groupLabel: string) {
  const header = `Sales Summary Report\n${report.period.from} to ${report.period.to}\n\n`;
  const totalsSection =
    `Gross Sales,${report.totals.gross}\n` +
    `Voided Sales,${report.totals.voids}\n` +
    `Discounts,${report.totals.discounts}\n` +
    `Net Sales,${report.totals.net}\n` +
    `Transactions,${report.totals.transactions}\n` +
    `Voided Transactions,${report.totals.voided_transactions}\n\n`;
  const breakdownHeader = `${groupLabel},Count,Gross,Discounts,Net\n`;
  const breakdownRows = report.breakdown.map((r) => `${r.label},${r.count},${r.gross},${r.discounts},${r.net}`).join('\n');
  const csv = header + totalsSection + breakdownHeader + breakdownRows;

  const file = new File(Paths.cache, `sales-summary-${report.period.from}-to-${report.period.to}.csv`);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export sales summary' });
  }
}

function SummaryCard({ label, value, color, large = false }: { label: string; value: string; color: string; large?: boolean }) {
  return (
    <View className={`rounded-lg border px-4 py-3 ${color} ${large ? 'basis-full' : 'basis-[48%]'}`}>
      <Text className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</Text>
      <Text className={`mt-0.5 font-bold ${large ? 'text-2xl' : 'text-xl'}`}>{value}</Text>
    </View>
  );
}

export function SalesSummaryModal({ isOpen, storeId, onClose, onLoad }: SalesSummaryModalProps) {
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [groupBy, setGroupBy] = useState<SalesSummaryGroupBy>('payment_method');
  const [report, setReport] = useState<SalesSummaryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupLabel = groupBy === 'payment_method' ? 'Payment Method' : groupBy === 'cashier' ? 'Cashier' : 'Date';

  const handleGenerate = async () => {
    if (!storeId) {
      setError('No store selected.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setReport(await onLoad({ storeId, dateFrom, dateTo, groupBy }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={isOpen} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-gray-50 p-4 pt-10">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-gray-900">Sales Summary Report</Text>
          <Pressable onPress={onClose}>
            <Text className="text-sm text-gray-500">Close</Text>
          </Pressable>
        </View>

        <View className="mb-3 flex-row flex-wrap gap-2">
          <TextInput value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <TextInput value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </View>

        <View className="mb-3 flex-row gap-2">
          {GROUP_OPTIONS.map((o) => (
            <Pressable key={o.value} onPress={() => setGroupBy(o.value)} className={`flex-1 items-center rounded-lg py-2 ${groupBy === o.value ? 'bg-black' : 'bg-gray-100'}`}>
              <Text className={`text-xs font-semibold ${groupBy === o.value ? 'text-white' : 'text-gray-700'}`}>{o.label}</Text>
            </Pressable>
          ))}
        </View>

        <Button onPress={handleGenerate} loading={loading} disabled={loading}>
          {loading ? 'Loading…' : 'Generate'}
        </Button>
        {error && <Text className="mt-2 text-sm text-red-600">{error}</Text>}

        <ScrollView className="mt-4 flex-1">
          {!report && !loading && <Text className="py-8 text-center text-sm text-gray-400">Set a date range and tap Generate to view the report.</Text>}

          {report && (
            <View className="gap-4">
              <View className="flex-row flex-wrap gap-2">
                <SummaryCard label="Gross Sales" value={formatCurrency(report.totals.gross)} color="border-blue-200 bg-blue-50 text-blue-700" />
                <SummaryCard label="Voided Sales" value={formatCurrency(report.totals.voids)} color="border-red-200 bg-red-50 text-red-700" />
                <SummaryCard label="Discounts" value={formatCurrency(report.totals.discounts)} color="border-yellow-200 bg-yellow-50 text-yellow-700" />
                <SummaryCard label="Net Sales" value={formatCurrency(report.totals.net)} color="border-green-200 bg-green-50 text-green-700" large />
                <SummaryCard label="Transactions" value={String(report.totals.transactions)} color="border-purple-200 bg-purple-50 text-purple-700" />
                <SummaryCard label="Voided Tx" value={String(report.totals.voided_transactions)} color="border-gray-200 bg-gray-50 text-gray-700" />
              </View>

              <View>
                <Text className="mb-2 text-sm font-semibold text-gray-700">Breakdown by {groupLabel}</Text>
                <View className="rounded-lg border border-gray-200 bg-white">
                  <View className="flex-row border-b border-gray-100 bg-gray-50 px-3 py-2">
                    <Text className="flex-1 text-xs font-medium text-gray-600">{groupLabel}</Text>
                    <Text className="w-14 text-right text-xs font-medium text-gray-600">Count</Text>
                    <Text className="w-20 text-right text-xs font-medium text-gray-600">Net</Text>
                  </View>
                  {report.breakdown.length === 0 ? (
                    <Text className="px-3 py-4 text-center text-sm text-gray-400">No sales in this period.</Text>
                  ) : (
                    report.breakdown.map((row: SalesSummaryBreakdownRow) => (
                      <View key={row.label} className="flex-row border-b border-gray-50 px-3 py-2">
                        <Text className="flex-1 text-sm font-medium text-gray-900" numberOfLines={1}>
                          {row.label}
                        </Text>
                        <Text className="w-14 text-right text-sm text-gray-600">{row.count}</Text>
                        <Text className="w-20 text-right text-sm font-semibold text-gray-900">{formatCurrency(row.net)}</Text>
                      </View>
                    ))
                  )}
                  <View className="flex-row bg-gray-50 px-3 py-2">
                    <Text className="flex-1 text-sm font-bold text-gray-900">TOTAL</Text>
                    <Text className="w-14 text-right text-sm font-bold text-gray-900">{report.totals.transactions}</Text>
                    <Text className="w-20 text-right text-sm font-bold text-green-700">{formatCurrency(report.totals.net)}</Text>
                  </View>
                </View>
              </View>

              <Button variant="outline" onPress={() => void exportCsv(report, groupLabel)}>
                Export CSV
              </Button>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
