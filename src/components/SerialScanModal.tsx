/**
 * Serial/IMEI entry — validation logic is unchanged (imei.ts format check,
 * duplicate-in-batch and duplicate-in-cart checks, per-field validateSerial on
 * the Scan button, full sequential pass on Confirm). Restyled to Modernist:
 * the dialog is square with 2px rules, each unit carries a VALID / DUPLICATE /
 * WAITING state label, and fields are 52px for gloved thumbs.
 */
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { validateSerial } from '../api/pos';
import { validateImei } from '../utils/imei';
import type { Product } from '../types';
import { Button } from './Button';
import { INK, PLACEHOLDER, SCRIM } from '../theme';

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

  const stateLabel = (index: number): { text: string; className: string } => {
    if (errors[index]) return { text: 'CHECK FAILED', className: 'text-mod-danger-700' };
    if (warnings[index]) return { text: 'WARNING', className: 'text-mod-danger-700' };
    if (serialNumbers[index]) return { text: 'VALID', className: 'text-mod-neutral-800' };
    return { text: 'WAITING', className: 'text-mod-neutral-600' };
  };

  return (
    <Modal visible={isOpen} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center p-4" style={{ backgroundColor: SCRIM }}>
        <View className="max-h-[88%] w-full max-w-[620px] border-2 border-mod-ink bg-white">
          <View className="flex-row items-start justify-between border-b-2 border-mod-divider p-4">
            <View className="flex-1 pr-3">
              <Text className="font-a-display text-[18px] text-mod-ink">Serial / IMEI capture</Text>
              <Text className="mt-1 font-a text-[13px] text-mod-neutral-700">
                {product.name} × {quantity} · on hand {product.stock}
              </Text>
            </View>
            <Pressable onPress={onClose} className="h-9 w-9 items-center justify-center border-2 border-mod-ink active:bg-mod-accent-100">
              <Feather name="x" size={18} color={INK} />
            </Pressable>
          </View>

          <View className="gap-3 p-4">
            <View className="flex-row items-center gap-2 bg-mod-neutral-200 px-3 py-2">
              <Feather name="align-justify" size={14} color={INK} />
              <Text className="flex-1 font-a text-[12px] leading-4 text-mod-neutral-800">
                Scanner fills the next empty field and advances. 15 digits, checked on entry.
              </Text>
            </View>
            {apiError ? (
              <View className="border-l-2 border-mod-danger bg-mod-danger-100 px-3 py-2">
                <Text className="font-a-med text-[13px] text-mod-danger-800">{apiError}</Text>
              </View>
            ) : null}
          </View>

          <ScrollView className="max-h-80 px-4">
            {Array.from({ length: quantity }).map((_, index) => {
              const state = stateLabel(index);
              return (
                <View key={index} className="mb-4">
                  <View className="mb-1.5 flex-row items-baseline justify-between">
                    <Text className="font-a-semi text-[10px] tracking-label text-mod-neutral-700">UNIT {index + 1}</Text>
                    <Text className={`font-a-semi text-[10px] tracking-label ${state.className}`}>{state.text}</Text>
                  </View>
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
                      placeholder="Scan or type 15-digit IMEI"
                      placeholderTextColor={PLACEHOLDER}
                      className={`h-[52px] flex-1 border-2 bg-white px-3 font-a-med text-[17px] text-mod-ink ${errors[index] ? 'border-mod-danger' : 'border-mod-ink'}`}
                    />
                    <Pressable
                      onPress={() => validateOne(index)}
                      disabled={validatingIndex === index}
                      className="h-[52px] w-[76px] items-center justify-center border-2 border-mod-ink active:bg-mod-accent-100"
                    >
                      {validatingIndex === index ? (
                        <ActivityIndicator size="small" color={INK} />
                      ) : (
                        <Text className="font-a-semi text-[11px] tracking-label text-mod-ink">SCAN</Text>
                      )}
                    </Pressable>
                  </View>
                  {errors[index] ? <Text className="mt-1.5 font-a text-[11px] text-mod-danger-700">{errors[index]}</Text> : null}
                  {!errors[index] && warnings[index] ? (
                    <Text className="mt-1.5 font-a text-[11px] text-mod-danger-700">{warnings[index]}</Text>
                  ) : null}
                  {!errors[index] && offlineNotices[index] ? (
                    <Text className="mt-1.5 font-a text-[11px] text-mod-neutral-700">{offlineNotices[index]}</Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>

          {warnings.some(Boolean) && (
            <Pressable onPress={() => setAckWarnings((v) => !v)} className="flex-row items-center gap-2 px-4 pb-3">
              <View className={`h-5 w-5 items-center justify-center border-2 ${ackWarnings ? 'border-mod-ink bg-mod-ink' : 'border-mod-ink'}`}>
                {ackWarnings && <Feather name="check" size={12} color="#fff" />}
              </View>
              <Text className="flex-1 font-a text-[12px] text-mod-neutral-800">I confirm these serial/IMEI numbers are correct.</Text>
            </Pressable>
          )}

          <View className="flex-row gap-2 border-t-2 border-mod-divider p-4">
            <View className="flex-1">
              <Button onPress={handleConfirm} loading={validating} disabled={hasUnacknowledgedWarnings && !validating}>
                Add to sale
              </Button>
            </View>
            <View className="w-[140px]">
              <Button variant="outline" onPress={onClose}>
                Cancel
              </Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
