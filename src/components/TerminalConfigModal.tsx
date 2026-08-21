/** Register / POS-serial / MIN# settings for this device — ported from the desktop's TerminalConfigModal.tsx. */
import { useEffect, useState } from 'react';
import { Modal, Text, TextInput, View } from 'react-native';
import { getRegisterId, setRegisterId, getPosSerialNumber, setPosSerialNumber, getMinNumber, setMinNumber } from '../services/terminalConfig';
import { Button } from './Button';

interface TerminalConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function TerminalConfigModal({ isOpen, onClose, onSaved }: TerminalConfigModalProps) {
  const [terminalId, setTerminalId] = useState('');
  const [posSerialNumber, setPosSerialNumberInput] = useState('');
  const [minNumber, setMinNumberInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      setLoading(true);
      const [register, serial, min] = await Promise.all([getRegisterId(), getPosSerialNumber(), getMinNumber()]);
      setTerminalId(register);
      setPosSerialNumberInput(serial);
      setMinNumberInput(min);
      setLoading(false);
    })();
  }, [isOpen]);

  const handleSave = async () => {
    const trimmed = terminalId.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await Promise.all([setRegisterId(trimmed), setPosSerialNumber(posSerialNumber.trim()), setMinNumber(minNumber.trim())]);
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="w-full max-w-sm gap-4 rounded-2xl bg-white p-6">
          <View>
            <Text className="text-lg font-bold text-gray-900">Terminal Settings</Text>
            <Text className="mt-1 text-xs text-gray-500">Set the register / terminal ID for this device.</Text>
          </View>

          {!loading && (
            <>
              <View>
                <Text className="mb-1 text-sm font-medium text-gray-700">Terminal ID</Text>
                <TextInput
                  value={terminalId}
                  onChangeText={setTerminalId}
                  placeholder="e.g. 1, MOA-01"
                  autoFocus
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                />
                <Text className="mt-1 text-[11px] text-gray-500">Printed on receipts and stored as the register on every sale.</Text>
              </View>

              <View>
                <Text className="mb-1 text-sm font-medium text-gray-700">POS Serial Number</Text>
                <TextInput
                  value={posSerialNumber}
                  onChangeText={setPosSerialNumberInput}
                  placeholder="e.g. 419"
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                />
              </View>

              <View>
                <Text className="mb-1 text-sm font-medium text-gray-700">MIN# (Machine Identification Number)</Text>
                <TextInput
                  value={minNumber}
                  onChangeText={setMinNumberInput}
                  placeholder="e.g. 123456789012345"
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                />
              </View>
            </>
          )}

          <View className="flex-row gap-2 pt-1">
            <View className="flex-1">
              <Button variant="outline" onPress={onClose} disabled={saving}>
                Cancel
              </Button>
            </View>
            <View className="flex-1">
              <Button onPress={handleSave} loading={saving} disabled={saving || !terminalId.trim()}>
                Save
              </Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
