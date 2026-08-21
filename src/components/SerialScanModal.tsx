/**
 * Serial/IMEI entry for a fresh quantity of a serialized product — ported
 * from the desktop's SerialScanModal.tsx. Local format check (imei.ts) +
 * duplicate-in-batch/duplicate-in-cart checks run first; backend
 * validateSerial runs per-field (the "Scan" button, for fast successive
 * scanning) and again as a full sequential pass on Confirm.
 */
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { validateSerial } from '../api/pos';
import { validateImei } from '../utils/imei';
import type { Product } from '../types';
import { Button } from './Button';

const OFFLINE_SERIAL_NOTICE = 'Offline — accepted as entered, will verify once back online.';

export interface SerialScanModalProps {
  isOpen: boolean;
  product: Product | null;
  quantity: number;
  storeId?: number | null;
  existingSerials?: string[];
  onConfirm: (serialNumbers: string[]) => void;
  onClose: () => void;
}

export function SerialScanModal({ isOpen, product, quantity, storeId, existingSerials = [], onConfirm, onClose }: SerialScanModalProps) {
  const [serialNumbers, setSerialNumbers] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [offlineNotices, setOfflineNotices] = useState<string[]>([]);
  const [ackWarnings, setAckWarnings] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validatingIndex, setValidatingIndex] = useState<number | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && product) {
      setSerialNumbers(Array(quantity).fill(''));
      setErrors([]);
      setWarnings([]);
      setOfflineNotices([]);
      setAckWarnings(false);
      setApiError(null);
    }
  }

  if (!isOpen || !product) return null;

  const handleSerialChange = (index: number, value: string) => {
    const updated = [...serialNumbers];
    updated[index] = value.toUpperCase().trim();
    setSerialNumbers(updated);
    if (errors[index]) setErrors((prev) => prev.map((e, i) => (i === index ? '' : e)));
    if (offlineNotices[index]) setOfflineNotices((prev) => prev.map((n, i) => (i === index ? '' : n)));
  };

  const advanceFocus = (index: number) => {
    if (index < quantity - 1) inputRefs.current[index + 1]?.focus();
  };

  const validateOne = async (index: number) => {
    const serial = (serialNumbers[index] ?? '').toUpperCase().trim();
    if (!serial) {
      inputRefs.current[index]?.focus();
      return;
    }

    const result = validateImei(serial);
    if (!result.valid) {
      setErrors((prev) => prev.map((e, i) => (i === index ? (result.error ?? 'Invalid serial') : e)));
      return;
    }
    const nextWarnings = warnings.map((w, i) => (i === index ? (result.warning ?? '') : w));
    setWarnings(nextWarnings);

    const duplicateIndex = serialNumbers.findIndex((s, i) => i !== index && s === serial);
    if (duplicateIndex !== -1) {
      setErrors((prev) => prev.map((e, i) => (i === index ? 'Duplicate serial' : e)));
      return;
    }
    if (existingSerials.includes(serial)) {
      setErrors((prev) => prev.map((e, i) => (i === index ? 'Serial already in cart' : e)));
      return;
    }

    setValidatingIndex(index);
    setApiError(null);
    try {
      const outcome = await validateSerial({ serial_number: serial, product_id: Number(product.id), store_id: storeId ?? undefined });
      if (!outcome.valid) {
        setErrors((prev) => prev.map((e, i) => (i === index ? (outcome.message ?? 'Serial not found in inventory for this store.') : e)));
        setOfflineNotices((prev) => prev.map((n, i) => (i === index ? '' : n)));
        inputRefs.current[index]?.focus();
        return;
      }
      setErrors((prev) => prev.map((e, i) => (i === index ? '' : e)));
      setOfflineNotices((prev) => prev.map((n, i) => (i === index ? (outcome.offline ? OFFLINE_SERIAL_NOTICE : '') : n)));
      advanceFocus(index);
    } catch (err) {
      setErrors((prev) => prev.map((e, i) => (i === index ? (err instanceof Error ? err.message : 'Serial not found in inventory for this store.') : e)));
      inputRefs.current[index]?.focus();
    } finally {
      setValidatingIndex(null);
    }
  };

  const handleConfirm = async () => {
    const newErrors: string[] = [];
    const newWarnings: string[] = [];
    let isValid = true;

    serialNumbers.forEach((serial, index) => {
      const result = validateImei(serial);
      if (!result.valid) {
        newErrors[index] = result.error ?? 'Invalid serial';
        isValid = false;
        return;
      }
      if (result.warning) newWarnings[index] = result.warning;
      const duplicateIndex = serialNumbers.findIndex((s, i) => i !== index && s === serial);
      if (duplicateIndex !== -1) {
        newErrors[index] = 'Duplicate serial';
        isValid = false;
      } else if (existingSerials.includes(serial)) {
        newErrors[index] = 'Serial already in cart';
        isValid = false;
      }
    });

    if (!isValid) {
      setErrors(newErrors);
      setWarnings(newWarnings);
      setAckWarnings(false);
      const firstErrorIndex = newErrors.findIndex((e) => e);
      if (firstErrorIndex !== -1) inputRefs.current[firstErrorIndex]?.focus();
      return;
    }

    setWarnings(newWarnings);
    const hasWarnings = newWarnings.some(Boolean);
    if (hasWarnings && !ackWarnings) {
      setApiError('Some serial numbers have an IMEI warning. Please confirm to continue.');
      return;
    }

    const totalRequested = existingSerials.length + serialNumbers.length;
    if (totalRequested > product.stock) {
      setApiError(
        `Cannot add more than ${product.stock} serials for this item (currently have ${existingSerials.length}, trying to add ${serialNumbers.length}).`
      );
      return;
    }

    setApiError(null);
    setValidating(true);
    try {
      const productId = Number(product.id);
      for (let i = 0; i < serialNumbers.length; i++) {
        const outcome = await validateSerial({ serial_number: serialNumbers[i], product_id: productId, store_id: storeId ?? undefined });
        if (!outcome.valid) {
          const message = outcome.message ?? 'Serial not found in inventory for this store.';
          setApiError(message);
          setErrors(serialNumbers.map((_, idx) => (idx === i ? message : '')));
          inputRefs.current[i]?.focus();
          return;
        }
      }
      onConfirm(serialNumbers);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Serial not found in inventory for this store.');
    } finally {
      setValidating(false);
    }
  };

  const hasUnacknowledgedWarnings = warnings.some(Boolean) && !ackWarnings;

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="max-h-[85%] w-full max-w-md gap-3 rounded-2xl bg-white p-6">
          <Text className="text-lg font-bold text-gray-900">Scan Serial Numbers</Text>
          <Text className="text-sm text-gray-600">
            {product.name} × {quantity}
          </Text>
          <Text className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
            Scan or enter a serial number for each unit. Use the camera scanner or type manually.
          </Text>
          {apiError && <Text className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{apiError}</Text>}

          <ScrollView className="max-h-72">
            {Array.from({ length: quantity }).map((_, index) => (
              <View key={index} className="mb-3">
                <Text className="mb-1 text-xs font-medium text-gray-700">Unit {index + 1}</Text>
                <View className="flex-row gap-2">
                  <TextInput
                    ref={(r) => {
                      inputRefs.current[index] = r;
                    }}
                    value={serialNumbers[index] ?? ''}
                    onChangeText={(v) => handleSerialChange(index, v)}
                    onSubmitEditing={() => (index < quantity - 1 ? advanceFocus(index) : handleConfirm())}
                    autoCapitalize="characters"
                    autoFocus={index === 0}
                    returnKeyType={index < quantity - 1 ? 'next' : 'done'}
                    className={`flex-1 rounded-lg border px-3 py-2.5 text-sm ${errors[index] ? 'border-red-400' : 'border-gray-300'}`}
                  />
                  <Pressable
                    onPress={() => validateOne(index)}
                    disabled={validatingIndex === index}
                    className="items-center justify-center rounded-lg border border-gray-300 px-3"
                  >
                    {validatingIndex === index ? <ActivityIndicator size="small" /> : <Text className="text-xs font-semibold text-gray-700">Scan</Text>}
                  </Pressable>
                </View>
                {errors[index] && <Text className="mt-1 text-xs text-red-600">{errors[index]}</Text>}
                {!errors[index] && warnings[index] && <Text className="mt-1 text-xs text-amber-600">{warnings[index]}</Text>}
                {!errors[index] && offlineNotices[index] && <Text className="mt-1 text-xs text-amber-600">{offlineNotices[index]}</Text>}
              </View>
            ))}
          </ScrollView>

          {warnings.some(Boolean) && (
            <Pressable onPress={() => setAckWarnings((v) => !v)} className="flex-row items-center gap-2">
              <View className={`h-5 w-5 items-center justify-center rounded border ${ackWarnings ? 'border-black bg-black' : 'border-gray-400'}`}>
                {ackWarnings && <Text className="text-xs text-white">✓</Text>}
              </View>
              <Text className="flex-1 text-xs text-gray-700">I confirm these serial/IMEI numbers are correct.</Text>
            </Pressable>
          )}

          <Button onPress={handleConfirm} loading={validating} disabled={hasUnacknowledgedWarnings && !validating}>
            Add to Cart
          </Button>
          <Pressable onPress={onClose} className="items-center py-2">
            <Text className="text-sm text-gray-500">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
