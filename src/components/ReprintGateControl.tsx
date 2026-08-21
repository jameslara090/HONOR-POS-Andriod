/**
 * Reprint eligibility/approval gate — ported from the desktop's
 * ReprintGateControl.tsx. One free reprint per sale/Z-report within 24h;
 * after that (or on the very first attempt if >24h has passed), needs an
 * is_approver user's approval via useReprintApprovalPolling.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { getReprintEligibility, logReprint } from '../api/pos';
import { useReprintApprovalPolling } from '../hooks/useReprintApprovalPolling';
import type { ReprintTargetType } from '../types';

interface ReprintGateControlProps {
  type: ReprintTargetType;
  targetId: number;
  /** Performs the actual print/receipt display. Called only once eligibility/approval is confirmed. */
  onDoPrint: () => void;
  fullWidth?: boolean;
}

type EligibilityState =
  | { phase: 'loading' }
  | { phase: 'ready'; canReprint: boolean; reason: 'approved_grant' | 'free' | 'already_reprinted' | 'too_old'; reprintRequestId: number | null }
  | { phase: 'unavailable' };

export function ReprintGateControl({ type, targetId, onDoPrint, fullWidth }: ReprintGateControlProps) {
  const [eligibility, setEligibility] = useState<EligibilityState>({ phase: 'loading' });
  const onApproved = useCallback(() => {}, []);
  const { state: pollState, send, cancel, reset, resumeWaiting } = useReprintApprovalPolling(onApproved);

  const refreshEligibility = useCallback(async () => {
    setEligibility({ phase: 'loading' });
    try {
      const result = await getReprintEligibility(type, targetId);
      setEligibility({ phase: 'ready', canReprint: result.can_reprint, reason: result.reason, reprintRequestId: result.reprint_request_id });
      if (!result.can_reprint && result.pending_request && result.pending_request.status === 'pending') {
        resumeWaiting(result.pending_request.id, result.pending_request.expires_at);
      }
    } catch {
      setEligibility({ phase: 'unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, targetId]);

  useEffect(() => {
    void (async () => {
      await refreshEligibility();
    })();
  }, [refreshEligibility]);

  const handleReprintClick = async () => {
    if (eligibility.phase !== 'ready') return;
    const grantId = eligibility.reason === 'approved_grant' ? eligibility.reprintRequestId : null;
    onDoPrint();
    try {
      await logReprint(type, targetId, grantId ?? undefined);
    } catch {
      // best-effort — the print already happened; eligibility re-syncs next refresh
    }
    reset();
    void refreshEligibility();
  };

  const handlePrintApprovedGrant = async (reprintRequestId: number) => {
    onDoPrint();
    try {
      await logReprint(type, targetId, reprintRequestId);
    } catch {
      // best-effort
    }
    reset();
    void refreshEligibility();
  };

  const baseClass = `flex-row items-center gap-1.5 rounded-lg border px-3 py-2 ${fullWidth ? 'w-full justify-center' : ''}`;

  if (eligibility.phase === 'loading') {
    return (
      <View className={`${baseClass} border-gray-200 bg-gray-50`}>
        <ActivityIndicator size="small" />
        <Text className="text-sm font-semibold text-gray-400">Checking…</Text>
      </View>
    );
  }

  if (eligibility.phase === 'unavailable') {
    return (
      <Pressable onPress={() => void refreshEligibility()} className={`${baseClass} border-red-200 bg-red-50`}>
        <Text className="text-sm font-semibold text-red-600">Reprint unavailable — retry</Text>
      </Pressable>
    );
  }

  if (pollState.phase === 'approved') {
    return (
      <Pressable onPress={() => void handlePrintApprovedGrant(pollState.reprintRequestId)} className={`${baseClass} border-green-200 bg-green-50`}>
        <Text className="text-sm font-semibold text-green-700">Print Now (Approved)</Text>
      </Pressable>
    );
  }

  if (pollState.phase === 'waiting') {
    return (
      <View className="flex-row items-center gap-2">
        <View className={`${baseClass} border-amber-200 bg-amber-50`}>
          <Text className="text-sm font-semibold text-amber-700">Waiting for approval…</Text>
        </View>
        <Pressable onPress={cancel}>
          <Text className="text-xs font-medium text-gray-500 underline">Cancel</Text>
        </Pressable>
      </View>
    );
  }

  if (pollState.phase === 'sending') {
    return (
      <View className={`${baseClass} border-gray-200 bg-gray-50`}>
        <ActivityIndicator size="small" />
        <Text className="text-sm font-semibold text-gray-400">Sending request…</Text>
      </View>
    );
  }

  if (pollState.phase === 'error') {
    return (
      <View className="gap-1">
        <Text className="text-xs text-red-600">{pollState.message}</Text>
        <Pressable
          onPress={() => {
            reset();
            void send(type, targetId);
          }}
          className={`${baseClass} border-blue-200 bg-blue-50`}
        >
          <Text className="text-sm font-semibold text-blue-700">Request Receipt</Text>
        </Pressable>
      </View>
    );
  }

  if (eligibility.canReprint) {
    return (
      <Pressable onPress={() => void handleReprintClick()} className={`${baseClass} border-blue-200 bg-blue-50`}>
        <Text className="text-sm font-semibold text-blue-700">Reprint</Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={() => void send(type, targetId)} className={`${baseClass} border-blue-200 bg-blue-50`}>
      <Text className="text-sm font-semibold text-blue-700">Request Receipt</Text>
    </Pressable>
  );
}
