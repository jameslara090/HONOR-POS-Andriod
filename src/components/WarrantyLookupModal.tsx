/** Warranty status lookup by serial/IMEI or customer — ported from the desktop's WarrantyLookupModal.tsx. */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { searchWarranties } from '../api/pos';
import type { WarrantyRecord } from '../types';
import { Button } from './Button';

interface WarrantyLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function StatusBadge({ status, expiresAt, now }: { status: WarrantyRecord['status']; expiresAt: string; now: number }) {
  const daysLeft = Math.ceil((new Date(expiresAt).getTime() - now) / 86400000);
  if (status === 'voided') return <Text className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Voided</Text>;
  if (status === 'expired') return <Text className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Expired</Text>;
  if (daysLeft <= 30) return <Text className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Expiring in {daysLeft}d</Text>;
  return <Text className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active · {daysLeft}d left</Text>;
}

export function WarrantyLookupModal({ isOpen, onClose }: WarrantyLookupModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WarrantyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [now] = useState(() => Date.now());

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      setResults(await searchWarranties(query.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
    setError(null);
    onClose();
  };

  return (
    <Modal visible={isOpen} animationType="slide" onRequestClose={handleClose}>
      <View className="flex-1 bg-gray-50 p-4 pt-10">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-gray-900">Warranty Lookup</Text>
          <Pressable onPress={handleClose}>
            <Text className="text-sm text-gray-500">Close</Text>
          </Pressable>
        </View>

        <View className="mb-1 flex-row gap-2">
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void handleSearch()}
            placeholder="IMEI / serial number, or customer name / phone…"
            autoFocus
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
          />
          <Button onPress={handleSearch} loading={loading} disabled={loading || !query.trim()}>
            {loading ? '...' : 'Search'}
          </Button>
        </View>
        <Text className="mb-3 text-xs text-gray-400">Tip: search by product IMEI/serial number, or the customer&rsquo;s name or phone number.</Text>

        {error && (
          <View className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}

        <ScrollView className="flex-1">
          {searched && !loading && results.length === 0 && <Text className="py-8 text-center text-sm text-gray-500">No warranty records found.</Text>}
          {results.map((w) => (
            <View key={w.id} className="mb-3 rounded-xl border border-gray-200 bg-white p-4">
              <View className="mb-2 flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900">{w.product_name ?? 'Unknown Product'}</Text>
                  {w.product_sku && <Text className="text-xs text-gray-400">{w.product_sku}</Text>}
                </View>
                <StatusBadge status={w.status} expiresAt={w.expires_at} now={now} />
              </View>
              <View className="gap-1">
                <Text className="text-xs text-gray-600">
                  Serial / IMEI: <Text className="font-mono font-semibold text-gray-800">{w.serial_number}</Text>
                </Text>
                <Text className="text-xs text-gray-600">
                  Warranty: <Text className="font-semibold">{w.warranty_months} month{w.warranty_months !== 1 ? 's' : ''}</Text>
                </Text>
                <Text className="text-xs text-gray-600">
                  Date Sold: <Text className="font-semibold">{new Date(w.sold_at).toLocaleDateString('en-PH')}</Text>
                </Text>
                <Text className="text-xs text-gray-600">
                  Expires: <Text className="font-semibold">{new Date(w.expires_at).toLocaleDateString('en-PH')}</Text>
                </Text>
                {w.customer_name && (
                  <Text className="text-xs text-gray-600">
                    Customer: <Text className="font-semibold">{w.customer_name}</Text>
                  </Text>
                )}
                {w.customer_phone && (
                  <Text className="text-xs text-gray-600">
                    Phone: <Text className="font-semibold">{w.customer_phone}</Text>
                  </Text>
                )}
                {w.store_name && (
                  <Text className="text-xs text-gray-600">
                    Sold at: <Text className="font-semibold">{w.store_name}</Text>
                  </Text>
                )}
                {w.receipt && (
                  <Text className="text-xs text-gray-600">
                    Receipt: <Text className="font-mono font-semibold">{w.receipt}</Text>
                  </Text>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
