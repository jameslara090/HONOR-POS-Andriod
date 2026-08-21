/**
 * Drives the discount "Request approval remotely" gate — ported from the
 * desktop's useDiscountApprovalPolling.ts verbatim (setInterval/setTimeout
 * behave identically on RN). Send a discount approval request, poll it
 * until an is_approver user acts or it expires.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelDiscountApprovalRequest,
  createDiscountApprovalRequest,
  DiscountApprovalUnavailableError,
  getDiscountApprovalRequest,
} from '../api/pos';
import type { CreateDiscountApprovalRequestParams } from '../types';

export type RemoteDiscountApprovalState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'waiting'; requestId: number; expiresAt: string }
  | { phase: 'approved'; approvedBy: number }
  | { phase: 'error'; message: string };

const POLL_INTERVAL_MS = 4000;

export function useDiscountApprovalPolling(onApproved: (approvedByUserId: number) => void) {
  const [state, setState] = useState<RemoteDiscountApprovalState>({ phase: 'idle' });
  const requestIdRef = useRef<number | null>(null);

  const send = useCallback(async (params: CreateDiscountApprovalRequestParams) => {
    setState({ phase: 'sending' });
    try {
      const result = await createDiscountApprovalRequest(params);
      requestIdRef.current = result.id;
      setState({ phase: 'waiting', requestId: result.id, expiresAt: result.expires_at });
    } catch (err) {
      setState({
        phase: 'error',
        message:
          err instanceof DiscountApprovalUnavailableError
            ? 'Cannot reach the server — try the in-person option instead.'
            : err instanceof Error
              ? err.message
              : 'Failed to send request.',
      });
    }
  }, []);

  const cancel = useCallback(() => {
    if (requestIdRef.current != null) void cancelDiscountApprovalRequest(requestIdRef.current);
    requestIdRef.current = null;
    setState({ phase: 'idle' });
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current = null;
    setState({ phase: 'idle' });
  }, []);

  useEffect(() => {
    if (state.phase !== 'waiting') return;
    let cancelled = false;

    const poll = async () => {
      try {
        const result = await getDiscountApprovalRequest(state.requestId);
        if (cancelled) return;
        if (result.status === 'approved' && result.approved_by != null) {
          setState({ phase: 'approved', approvedBy: result.approved_by });
          onApproved(result.approved_by);
        } else if (result.status === 'rejected') {
          setState({ phase: 'error', message: result.rejection_reason ? `Rejected — ${result.rejection_reason}` : 'Request rejected by approver.' });
        } else if (result.status === 'expired' || result.status === 'cancelled') {
          setState({ phase: 'error', message: 'Request expired — nobody responded in time.' });
        }
        // else still pending — keep polling
      } catch {
        // Transient network hiccup mid-poll — keep trying, don't flip to error on one miss.
      }
    };

    void poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state, onApproved]);

  return { state, send, cancel, reset };
}
