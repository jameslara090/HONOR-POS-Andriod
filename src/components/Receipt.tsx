/**
 * Per-sale receipt — ported from the desktop's Receipt.tsx (not
 * TransactionSummaryReceipt.tsx, the Z-report display, which is Phase 4
 * scope). The `isRefund` branch is ported for shape-completeness — the
 * desktop itself never sets it true either (dormant, unwired upstream).
 */
import { useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import type { ReceiptData } from '../types';
import { formatCurrency } from '../utils/currency';
import { printReceipt } from '../services/printing';
import { Button } from './Button';

interface ReceiptProps {
  data: ReceiptData;
  onDone: () => void;
}

export function Receipt({ data, onDone }: ReceiptProps) {
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const handlePrint = async () => {
    setPrinting(true);
    setPrintError(null);
    try {
      await printReceipt(data);
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : 'Print failed.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade">
    <View className="flex-1 items-center justify-center bg-black/40 p-4">
      <View className="max-h-[85%] w-full max-w-md gap-1 rounded-2xl bg-white p-6">
        <View className="items-center border-b border-dashed border-gray-300 pb-2">
          <Text className="text-base font-bold text-gray-900">{data.storeName}</Text>
          <Text className="text-xs text-gray-600">{data.storeLocation}</Text>
          {data.storeTin && <Text className="text-xs text-gray-600">TIN: {data.storeTin}</Text>}
          {data.storeBirAccreditation && <Text className="text-xs text-gray-600">BIR Accreditation No.: {data.storeBirAccreditation}</Text>}
          {data.terminalId && <Text className="text-xs text-gray-600">Terminal {data.terminalId}</Text>}
          {data.isRefund && <Text className="text-sm font-bold text-gray-900">*** REFUND / RETURN ***</Text>}
          {data.receiptHeader && <Text className="text-sm font-bold text-gray-900">*** {data.receiptHeader} ***</Text>}
        </View>

        <View className="gap-0.5 border-b border-dashed border-gray-300 py-2">
          <Text className="text-xs text-gray-700">
            {data.isRefund ? 'Ref No.' : 'Invoice(s)'}: {data.receiptNumber}
          </Text>
          {data.transactionRef && <Text className="text-xs text-gray-700">Trans#: {data.transactionRef}</Text>}
          {data.isRefund && data.originalReceiptNumber && (
            <Text className="text-xs text-gray-700">Orig. OR No.: {data.originalReceiptNumber}</Text>
          )}
          <Text className="text-xs text-gray-700">
            {data.date} {data.time}
          </Text>
          <Text className="text-xs text-gray-700">Sold By: {data.cashierName}</Text>
          {data.customerName && <Text className="text-xs text-gray-700">Customer: {data.customerName}</Text>}
          {data.promoterName && <Text className="text-xs text-gray-700">Promoter: {data.promoterName}</Text>}
        </View>

        <View className="max-h-56 border-b border-dashed border-gray-300 py-2">
          {data.items.map((item, i) => (
            <View key={i} className="mb-1">
              <View className="flex-row justify-between">
                <Text className="flex-1 pr-2 text-xs text-gray-800" numberOfLines={2}>
                  {item.quantity} {item.name}
                </Text>
                <Text className="text-xs text-gray-800">{formatCurrency(item.lineTotal)}</Text>
              </View>
              {item.serialNumbers.filter(Boolean).map((sn, j) => (
                <Text key={j} className="pl-3 text-xs text-gray-500">
                  SN: {sn}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View className="gap-0.5 py-2">
          {!data.isRefund ? (
            <>
              {!!data.discountAmount && data.discountAmount > 0 && (
                <View className="flex-row justify-between">
                  <Text className="text-xs text-green-600">Discount{data.discountLabel ? ` (${data.discountLabel})` : ''}</Text>
                  <Text className="text-xs text-green-600">-{formatCurrency(data.discountAmount)}</Text>
                </View>
              )}
              <View className="flex-row justify-between">
                <Text className="text-sm font-bold text-gray-900">TOTAL DUE</Text>
                <Text className="text-sm font-bold text-gray-900">{formatCurrency(data.total)}</Text>
              </View>
              {data.payments && data.payments.length > 0 && (
                <View className="mt-1 gap-0.5">
                  {data.payments.map((p, i) => (
                    <View key={i}>
                      <View className="flex-row justify-between">
                        <Text className="text-xs text-gray-700">
                          {i + 1}/ {p.label}
                        </Text>
                        <Text className="text-xs text-gray-700">{formatCurrency(p.amount)}</Text>
                      </View>
                      {p.referenceNumber && <Text className="pl-3 text-xs text-gray-500">Ref: {p.referenceNumber}</Text>}
                    </View>
                  ))}
                </View>
              )}
              {!!data.change && data.change > 0 && (
                <View className="flex-row justify-between">
                  <Text className="text-sm font-bold text-green-600">Change</Text>
                  <Text className="text-sm font-bold text-green-600">{formatCurrency(data.change)}</Text>
                </View>
              )}
              {data.vatableSales != null && data.vatAmount != null && (
                <View className="mt-1 gap-0.5 border-t border-gray-100 pt-1">
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500">VATable (V)</Text>
                    <Text className="text-xs text-gray-500">{formatCurrency(data.vatableSales)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500">VAT-Exempt (E)</Text>
                    <Text className="text-xs text-gray-500">{formatCurrency(0)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500">VAT Zero-Rated (Z)</Text>
                    <Text className="text-xs text-gray-500">{formatCurrency(0)}</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-500">VAT</Text>
                    <Text className="text-xs text-gray-500">{formatCurrency(data.vatAmount)}</Text>
                  </View>
                </View>
              )}
            </>
          ) : (
            <View className="flex-row justify-between">
              <Text className="text-sm font-bold text-gray-900">Refund Amount</Text>
              <Text className="text-sm font-bold text-gray-900">{formatCurrency(data.total)}</Text>
            </View>
          )}
        </View>

        <Text className="pb-2 text-center text-xs text-gray-400">
          {data.isRefund ? 'Return processed — thank you' : 'Thank you for your purchase'}
        </Text>

        {printError && <Text className="text-center text-xs text-red-600">{printError}</Text>}

        <View className="flex-row gap-2">
          <Button variant="outline" onPress={handlePrint} disabled={printing}>
            {printing ? 'Printing…' : 'Print'}
          </Button>
          <Button onPress={onDone}>Done</Button>
        </View>
        {printing && <ActivityIndicator className="mt-1" />}
      </View>
    </View>
    </Modal>
  );
}
