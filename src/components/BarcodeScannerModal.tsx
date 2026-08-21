/**
 * Camera barcode/serial scanner — no desktop equivalent (the desktop relies
 * on a USB HID gun typing into a text field). Feeds the scanned string
 * through the same lookup logic as manual entry (see useScanHandler.ts).
 */
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Button } from './Button';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onScanned: (value: string) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({ isOpen, onScanned, onClose }: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (locked) return;
    setLocked(true);
    onScanned(result.data);
  };

  const handleClose = () => {
    setLocked(false);
    onClose();
  };

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      onRequestClose={handleClose}
      onShow={() => setLocked(false)}
    >
      <View className="flex-1 bg-black">
        {!permission?.granted ? (
          <View className="flex-1 items-center justify-center gap-4 p-6">
            <Text className="text-center text-white">Camera access is needed to scan barcodes.</Text>
            <Button onPress={() => void requestPermission()}>Grant Camera Access</Button>
            <Pressable onPress={handleClose} className="py-2">
              <Text className="text-sm text-gray-300">Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar', 'qr'],
              }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View className="absolute bottom-10 w-full items-center">
              <Pressable onPress={handleClose} className="rounded-full bg-white/90 px-6 py-3">
                <Text className="text-sm font-semibold text-gray-900">Cancel</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
