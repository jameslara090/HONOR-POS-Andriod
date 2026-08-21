/**
 * Confirms a restart/exit action — adapted from the desktop's PowerActionModal.tsx.
 * Desktop's third option, "shut down this computer", has no Android equivalent
 * (an app cannot power off a phone) and is dropped.
 */
import { Modal, Text, View } from 'react-native';
import { Button } from './Button';

export type PowerAction = 'restart' | 'exit';

interface PowerActionModalProps {
  action: PowerAction | null;
  hasOpenShift: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const COPY: Record<PowerAction, { title: string; body: string; confirmLabel: string }> = {
  restart: {
    title: 'Restart the app?',
    body: 'The app will reload. Any unsaved cart items will be lost.',
    confirmLabel: 'Restart',
  },
  exit: {
    title: 'Exit the app?',
    body: 'The app will close completely. Any unsaved cart items will be lost.',
    confirmLabel: 'Exit app',
  },
};

export function PowerActionModal({ action, hasOpenShift, busy = false, onConfirm, onClose }: PowerActionModalProps) {
  if (!action) return null;
  const copy = COPY[action];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 p-4">
        <View className="w-full max-w-sm gap-3 rounded-2xl bg-white p-6">
          <Text className="text-base font-bold text-gray-900">{copy.title}</Text>
          <Text className="text-sm text-gray-600">{copy.body}</Text>

          {hasOpenShift && (
            <View className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <Text className="text-xs text-amber-700">You have an active shift. Closing without ending your shift may cause discrepancies in your sales report and Z-reading.</Text>
            </View>
          )}

          <View className="flex-row gap-3 pt-1">
            <View className="flex-1">
              <Button variant="outline" onPress={onClose} disabled={busy}>
                Cancel
              </Button>
            </View>
            <View className="flex-1">
              <Button variant="danger" onPress={onConfirm} loading={busy} disabled={busy}>
                {busy ? 'Please wait…' : copy.confirmLabel}
              </Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
