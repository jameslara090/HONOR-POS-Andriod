/**
 * Shift open/close wizard — ported from the desktop's ShiftModal.tsx core
 * (info -> cash-count -> pending-close/summary). The desktop's
 * x-report/reading-report steps are still not built (not requested by any
 * phase's checklist so far). The just-closed shift's Z-report renders via
 * the real ZReport component (Phase 4) and prints ungated, matching the
 * desktop; reprinting the *previous* shift's report goes through
 * ReprintGateControl, also matching the desktop exactly.
 */
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import type { EodReport, PosShiftInfo } from '../types';
import { formatCurrency } from '../utils/currency';
import { printZReport } from '../services/printing';
import { Button } from './Button';
import { ReprintGateControl } from './ReprintGateControl';
import { ZReport } from './ZReport';

type Step = 'info' | 'cash-count' | 'pending-close' | 'summary';

interface ShiftModalProps {
  visible: boolean;
  currentShift: PosShiftInfo | null;
  loading: boolean;
  lastEodReport?: EodReport | null;
  /** Shift id backing lastEodReport — required to gate its reprint. Null if a report exists but its shift id wasn't captured, in which case reprint is unavailable rather than assumed free. */
  lastEodShiftId?: number | null;
  onOpen: (openingCash: number) => Promise<void>;
  onClose: (closingCash: number) => Promise<EodReport | null>;
  onDismiss: () => void;
}

export function ShiftModal({ visible, currentShift, loading, lastEodReport, lastEodShiftId, onOpen, onClose, onDismiss }: ShiftModalProps) {
  const [step, setStep] = useState<Step>('info');
  const [openingCash, setOpeningCash] = useState('');
  const [openingCashError, setOpeningCashError] = useState<string | null>(null);
  const [declaredCash, setDeclaredCash] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eodReport, setEodReport] = useState<EodReport | null>(null);
  const [printing, setPrinting] = useState(false);

  // Reset all internal state whenever the modal transitions to visible —
  // done during render (React's recommended way to adjust state on a prop
  // change) rather than in an effect, so this doesn't cost an extra paint.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setStep('info');
      setOpeningCash('');
      setOpeningCashError(null);
      setDeclaredCash('');
      setError(null);
      setEodReport(null);
    }
  }

  const validateOpeningCash = (): number | null => {
    const raw = openingCash.trim();
    if (!raw) {
      setOpeningCashError('Opening cash is required.');
      return null;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      setOpeningCashError('Opening cash must be a valid number.');
      return null;
    }
    if (value < 0) {
      setOpeningCashError('Opening cash must be greater than or equal to 0.');
      return null;
    }
    setOpeningCashError(null);
    return value;
  };

  const handleOpenShift = async () => {
    const opening = validateOpeningCash();
    if (opening == null) return;
    setSubmitting(true);
    setError(null);
    try {
      await onOpen(opening);
      onDismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open shift');
    } finally {
      setSubmitting(false);
    }
  };

  const parsedDeclared = parseFloat(declaredCash) || 0;
  const expectedCash = currentShift?.expected_cash ?? null;
  const liveDiff = expectedCash != null && declaredCash !== '' ? parsedDeclared - expectedCash : null;

  const handleCloseShift = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const report = await onClose(parsedDeclared);
      if (report === null) {
        setStep('pending-close');
        return;
      }
      setEodReport(report);
      setStep('summary');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to close shift');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintZReport = async () => {
    if (!eodReport) return;
    setPrinting(true);
    try {
      await printZReport(eodReport);
    } catch {
      // best-effort — the report is still shown on screen either way
    } finally {
      setPrinting(false);
    }
  };

  let body: ReactNode;
  if (loading) {
    body = <ActivityIndicator size="large" color="#111827" />;
  } else if (step === 'summary' && eodReport) {
    body = (
      <>
        <Text className="text-lg font-bold text-gray-900">Shift Closed</Text>
        <ScrollView className="max-h-96">
          <ZReport report={eodReport} />
        </ScrollView>
        <Button variant="outline" onPress={handlePrintZReport} loading={printing}>
          Print / Share
        </Button>
        <Button onPress={onDismiss}>Done</Button>
      </>
    );
  } else if (step === 'pending-close') {
    body = (
      <>
        <Text className="text-lg font-bold text-gray-900">Close Queued</Text>
        <Text className="text-sm text-gray-600">
          No connection right now — this shift close was saved and will sync automatically once back online.
        </Text>
        <Button onPress={onDismiss}>Done</Button>
      </>
    );
  } else if (step === 'cash-count') {
    body = (
      <>
        <Text className="text-lg font-bold text-gray-900">Count Cash Drawer</Text>
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Declared cash</Text>
          <TextInput
            value={declaredCash}
            onChangeText={setDeclaredCash}
            keyboardType="numeric"
            placeholder="0.00"
            autoFocus
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-base"
          />
        </View>
        {liveDiff !== null && (
          <Text className={`text-sm font-medium ${liveDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {liveDiff >= 0 ? `▲ Overage: ${formatCurrency(liveDiff)}` : `▼ Short: ${formatCurrency(Math.abs(liveDiff))}`}
          </Text>
        )}
        {error && <Text className="text-sm text-red-600">{error}</Text>}
        <Button onPress={handleCloseShift} loading={submitting}>
          Confirm Close
        </Button>
        <Button variant="outline" onPress={() => setStep('info')}>
          Back
        </Button>
      </>
    );
  } else if (!currentShift) {
    body = (
      <>
        <Text className="text-lg font-bold text-gray-900">Open Shift</Text>
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Opening cash</Text>
          <TextInput
            value={openingCash}
            onChangeText={setOpeningCash}
            keyboardType="numeric"
            placeholder="0.00"
            autoFocus
            className={`rounded-lg border px-3 py-2.5 text-base ${openingCashError ? 'border-red-400' : 'border-gray-300'}`}
          />
          {openingCashError && <Text className="mt-1 text-xs text-red-600">{openingCashError}</Text>}
        </View>
        {error && <Text className="text-sm text-red-600">{error}</Text>}
        <Button onPress={handleOpenShift} loading={submitting}>
          Open Shift
        </Button>
        {lastEodReport && lastEodShiftId != null && (
          <ReprintGateControl type="zreport" targetId={lastEodShiftId} onDoPrint={() => void printZReport(lastEodReport)} fullWidth />
        )}
        <Button variant="outline" onPress={onDismiss}>
          Cancel
        </Button>
      </>
    );
  } else if (currentShift.status === 'PENDING_CLOSE') {
    body = (
      <>
        <Text className="text-lg font-bold text-gray-900">Register Locked</Text>
        <Text className="text-sm text-gray-600">
          This shift was closed while offline and is waiting to sync. No new shift can be opened on this register until
          it finishes syncing.
        </Text>
        <Button variant="outline" onPress={onDismiss}>
          Close
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <Text className="text-lg font-bold text-gray-900">Shift Open</Text>
        {currentShift.status === 'PENDING_OPEN' && (
          <View className="rounded-lg bg-amber-50 p-3">
            <Text className="text-sm font-medium text-amber-700">
              Opened offline — will sync automatically once back online.
            </Text>
          </View>
        )}
        <Text className="text-sm text-gray-600">Opened: {new Date(currentShift.opened_at).toLocaleString()}</Text>
        <Text className="text-sm text-gray-600">Opening cash: {formatCurrency(currentShift.opening_cash)}</Text>
        <Button onPress={() => setStep('cash-count')}>Close Shift</Button>
        {lastEodReport && lastEodShiftId != null && (
          <ReprintGateControl type="zreport" targetId={lastEodShiftId} onDoPrint={() => void printZReport(lastEodReport)} fullWidth />
        )}
        <Button variant="outline" onPress={onDismiss}>
          Cancel
        </Button>
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View className="flex-1 items-center justify-center bg-black/40 p-4">
        <View className="w-full max-w-md gap-4 rounded-2xl bg-white p-6">{body}</View>
      </View>
    </Modal>
  );
}
