/**
 * Printer preferences — adapted from the desktop's PrinterConfigModal.tsx.
 * The desktop lists OS-registered printers via Electron and prints silently
 * to one; Android has no such registry and no Bluetooth/USB thermal-printer
 * library wired up yet (see printerConfig.ts), so this is config-only: a
 * free-text device identifier for whichever transport lands later, paper
 * width (used by the ESC/POS layout in escpos.ts), and auto-print.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { getPrinterPreferences, savePrinterPreferences, PAPER_WIDTH_OPTIONS } from '../services/printerConfig';
import { Button } from './Button';

interface PrinterConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrinterConfigModal({ isOpen, onClose }: PrinterConfigModalProps) {
  const [printerName, setPrinterName] = useState('');
  const [autoPrint, setAutoPrint] = useState(false);
  const [paperWidthMm, setPaperWidthMm] = useState('80');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      setLoading(true);
      const prefs = await getPrinterPreferences();
      setPrinterName(prefs.printerName);
      setAutoPrint(prefs.autoPrint);
      setPaperWidthMm(prefs.paperWidthMm);
      setLoading(false);
    })();
  }, [isOpen]);

  const handleSave = async () => {
    await savePrinterPreferences({ printerName: printerName.trim(), autoPrint, paperWidthMm });
    onClose();
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="w-full max-w-sm gap-4 rounded-2xl bg-white p-6">
          <View>
            <Text className="text-lg font-bold text-gray-900">Printer Settings</Text>
            <Text className="mt-1 text-xs text-gray-500">Receipts print/share as PDF today — these settings prepare for a direct thermal-printer connection.</Text>
          </View>

          {!loading && (
            <>
              <View>
                <Text className="mb-1 text-sm font-medium text-gray-700">Printer identifier (optional)</Text>
                <TextInput
                  value={printerName}
                  onChangeText={setPrinterName}
                  placeholder="e.g. device name or MAC address"
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                />
              </View>

              <View>
                <Text className="mb-1 text-sm font-medium text-gray-700">Paper width</Text>
                <View className="flex-row gap-2">
                  {PAPER_WIDTH_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() => setPaperWidthMm(opt.value)}
                      className={`flex-1 items-center rounded-lg border py-2 ${paperWidthMm === opt.value ? 'border-black bg-gray-900' : 'border-gray-300 bg-white'}`}
                    >
                      <Text className={`text-xs font-semibold ${paperWidthMm === opt.value ? 'text-white' : 'text-gray-700'}`}>{opt.value}mm</Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="mt-1 text-[11px] text-gray-500">Applies to the customer receipt and Z-report printouts.</Text>
              </View>

              <Pressable onPress={() => setAutoPrint((v) => !v)} className="flex-row items-start gap-2">
                <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded border-2 ${autoPrint ? 'border-black bg-black' : 'border-gray-300'}`}>
                  {autoPrint && <Text className="text-xs font-bold text-white">✓</Text>}
                </View>
                <View className="flex-1">
                  <Text className="text-sm text-gray-700">Auto-print after checkout</Text>
                  <Text className="text-xs text-gray-500">Open the share sheet automatically when the receipt appears.</Text>
                </View>
              </Pressable>
            </>
          )}

          <View className="flex-row gap-2 pt-1">
            <View className="flex-1">
              <Button variant="outline" onPress={onClose}>
                Cancel
              </Button>
            </View>
            <View className="flex-1">
              <Button onPress={handleSave}>Save</Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
