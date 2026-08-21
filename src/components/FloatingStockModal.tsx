/** Punch serials out to / back in from the display floor — ported from the desktop's FloatingStockModal.tsx. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { punchOutFloatingStock, punchInFloatingStock, listFloatingStock, getStorePromoters, validatePromoter } from '../api/pos';
import type { FloatingStockItem, PromoterOption } from '../types';
import { PromoterComboBox } from './PromoterComboBox';
import { Button } from './Button';

interface FloatingStockModalProps {
  isOpen: boolean;
  storeId: number | null;
  onClose: () => void;
}

type Mode = 'out' | 'in';
type PromoterStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'offline';

export function FloatingStockModal({ isOpen, storeId, onClose }: FloatingStockModalProps) {
  const [mode, setMode] = useState<Mode>('out');
  const [serial, setSerial] = useState('');
  const [promoterId, setPromoterId] = useState('');
  const [promoterStatus, setPromoterStatus] = useState<PromoterStatus>('idle');
  const [promoterMessage, setPromoterMessage] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<FloatingStockItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [promoterRoster, setPromoterRoster] = useState<PromoterOption[]>([]);
  const promoterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadList = useCallback(() => {
    if (storeId == null) return;
    setLoadingList(true);
    listFloatingStock(storeId, 'OUT')
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoadingList(false));
  }, [storeId]);

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setMode('out');
      setSerial('');
      setPromoterId('');
      setPromoterStatus('idle');
      setPromoterMessage(null);
      setReason('');
      setError(null);
      setSuccess(null);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    void (() => loadList())();
  }, [isOpen, loadList]);

  useEffect(() => {
    void (async () => {
      if (!isOpen || storeId == null) {
        setPromoterRoster([]);
        return;
      }
      try {
        setPromoterRoster(await getStorePromoters(storeId));
      } catch {
        setPromoterRoster([]);
      }
    })();
  }, [isOpen, storeId]);

  // Debounced promoter validation — 600ms after the user stops typing, same pattern as CheckoutModal.
  useEffect(() => {
    if (promoterDebounceRef.current) clearTimeout(promoterDebounceRef.current);
    const id = promoterId.trim();
    if (!id || storeId == null) {
      void (() => {
        setPromoterStatus('idle');
        setPromoterMessage(null);
      })();
      return;
    }
    void (() => {
      setPromoterStatus('checking');
      setPromoterMessage(null);
    })();
    promoterDebounceRef.current = setTimeout(async () => {
      try {
        const result = await validatePromoter(id, storeId);
        if (result.valid) {
          setPromoterStatus('valid');
          setPromoterMessage(result.name ?? null);
        } else if (result.offline) {
          setPromoterStatus('offline');
          setPromoterMessage('Offline — accepted as entered, will verify once back online.');
        } else {
          setPromoterStatus('invalid');
          setPromoterMessage(result.message ?? 'Promoter is not assigned to this store.');
        }
      } catch {
        setPromoterStatus('invalid');
        setPromoterMessage('Could not validate promoter.');
      }
    }, 600);
    return () => {
      if (promoterDebounceRef.current) clearTimeout(promoterDebounceRef.current);
    };
  }, [promoterId, storeId]);

  const handleSubmit = async () => {
    if (submitting || storeId == null) return;
    const sn = serial.trim();
    if (!sn) {
      setError('Enter a serial number.');
      return;
    }
    const reasonTrimmed = reason.trim();
    if (!reasonTrimmed) {
      setError('Enter a reason.');
      return;
    }
    if (mode === 'out' && !promoterId.trim()) {
      setError('Enter the promoter ID.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (mode === 'out') {
        const { queued } = await punchOutFloatingStock({ serialNumber: sn, storeId, promoterId: promoterId.trim(), notes: reasonTrimmed });
        setSuccess(queued ? `Serial ${sn} punched out (offline — will sync once back online).` : `Serial ${sn} punched out.`);
      } else {
        const { queued } = await punchInFloatingStock({ serialNumber: sn, storeId, reason: reasonTrimmed });
        setSuccess(queued ? `Serial ${sn} punched back in (offline — will sync once back online).` : `Serial ${sn} punched back in.`);
      }
      setSerial('');
      setReason('');
      loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const promoterBorderClass =
    promoterStatus === 'invalid' ? 'border-red-400' : promoterStatus === 'valid' ? 'border-green-400' : promoterStatus === 'offline' ? 'border-amber-400' : 'border-gray-300';

  return (
    <Modal visible={isOpen} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-gray-50 p-4 pt-10">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-gray-900">Floating Stock</Text>
          <Pressable onPress={onClose}>
            <Text className="text-sm text-gray-500">Close</Text>
          </Pressable>
        </View>

        <View className="mb-3 flex-row gap-1">
          <Pressable
            onPress={() => {
              setMode('out');
              setReason('');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 items-center rounded-lg py-2 ${mode === 'out' ? 'bg-black' : 'bg-gray-100'}`}
          >
            <Text className={`text-xs font-semibold ${mode === 'out' ? 'text-white' : 'text-gray-600'}`}>Punch Out</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMode('in');
              setReason('');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 items-center rounded-lg py-2 ${mode === 'in' ? 'bg-black' : 'bg-gray-100'}`}
          >
            <Text className={`text-xs font-semibold ${mode === 'in' ? 'text-white' : 'text-gray-600'}`}>Punch In</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <Text className="mb-3 text-xs text-gray-500">
            {mode === 'out'
              ? 'Scan the serial being taken out to the display/selling floor. Item stays counted as store stock — this only tracks who has it.'
              : 'Scan the serial being brought back to the stockroom, unsold.'}
          </Text>

          <View className="mb-3">
            <Text className="mb-1 text-sm font-medium text-gray-700">Serial Number</Text>
            <TextInput
              value={serial}
              onChangeText={setSerial}
              placeholder="Scan or type serial number"
              editable={!submitting}
              autoCapitalize="characters"
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            />
          </View>

          {mode === 'out' && (
            <View className="z-10 mb-3">
              <Text className="mb-1 text-sm font-medium text-gray-700">Promoter ID</Text>
              <PromoterComboBox
                value={promoterId}
                onChange={(v) => setPromoterId(v.toUpperCase())}
                roster={promoterRoster}
                placeholder="Search promoter ID or name"
                editable={!submitting}
                inputClassName={`rounded-lg border px-3 py-2.5 text-sm ${promoterBorderClass}`}
              />
              {promoterStatus === 'checking' && <ActivityIndicator size="small" className="mt-1 self-start" />}
              {promoterStatus === 'valid' && promoterMessage && <Text className="mt-1 text-xs font-medium text-green-600">✓ {promoterMessage}</Text>}
              {promoterStatus === 'invalid' && promoterMessage && <Text className="mt-1 text-xs text-red-600">{promoterMessage}</Text>}
              {promoterStatus === 'offline' && promoterMessage && <Text className="mt-1 text-xs font-medium text-amber-600">{promoterMessage}</Text>}
            </View>
          )}

          <View className="mb-3">
            <Text className="mb-1 text-sm font-medium text-gray-700">Reason</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder={mode === 'out' ? 'Why is this item going out?' : 'Why is this item coming back?'}
              editable={!submitting}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            />
          </View>

          {error && (
            <View className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <Text className="text-xs text-red-700">{error}</Text>
            </View>
          )}
          {success && (
            <View className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <Text className="text-xs text-green-700">{success}</Text>
            </View>
          )}

          <Button onPress={handleSubmit} loading={submitting} disabled={submitting || storeId == null}>
            {mode === 'out' ? 'Punch Out' : 'Punch In'}
          </Button>

          <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500">Currently out ({items.length})</Text>
          {loadingList ? (
            <Text className="py-4 text-center text-sm text-gray-400">Loading…</Text>
          ) : items.length === 0 ? (
            <Text className="py-4 text-center text-sm text-gray-400">Nothing currently floating.</Text>
          ) : (
            <View className="gap-2 pb-8">
              {items.map((item) => {
                const stale = (item.hours_out ?? 0) > 24;
                return (
                  <View key={item.serial_number} className="flex-row items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-mono text-sm font-semibold text-gray-800" numberOfLines={1}>
                        {item.serial_number}
                        {item.pendingSync && <Text className="text-[10px] font-semibold text-amber-600"> (syncing…)</Text>}
                      </Text>
                      <Text className="text-xs text-gray-500" numberOfLines={1}>
                        {item.product_desc ?? '—'}
                      </Text>
                      {item.promoter_id && <Text className="text-[11px] text-gray-400">Promoter: {item.promoter_id}</Text>}
                    </View>
                    <Text className={`shrink-0 text-xs font-bold ${stale ? 'text-red-600' : 'text-gray-500'}`}>{item.hours_out}h</Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
