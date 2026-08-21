/**
 * Drives the reprint "Request Receipt" gate — ported from the desktop's
 * useReprintApprovalPolling.ts verbatim. Send a reprint request, poll it
 * until an is_approver user acts (or it expires). Once approved, onApproved
 * fires with the request id — pass it to logReprint() to spend the
 * one-time grant.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelReprintRequest, createReprintRequest, getReprintRequest, ReprintGateUnavailableError } from '../api/pos';
import type { ReprintTargetType } from '../types';

export type ReprintApprovalState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'waiting'; requestId: number; expiresAt: string }
  | { phase: 'approved'; reprintRequestId: number }
  | { phase: 'error'; message: string };

const POLL_INTERVAL_MS = 4000;

export function useReprintApprovalPolling(onApproved: (reprintRequestId: number) => void) {
  const [state, setState] = useState<ReprintApprovalState>({ phase: 'idle' });
  const requestIdRef = useRef<number | null>(null);

  const send = useCallback(async (type: ReprintTargetType, targetId: number) => {
    setState({ phase: 'sending' });
    try {
      const result = await createReprintRequest(type, targetId);
      requestIdRef.current = result.id;
      setState({ phase: 'waiting', requestId: result.id, expiresAt: result.expires_at });
    } catch (err) {
      setState({
        phase: 'error',
        message:
          err instanceof ReprintGateUnavailableError
            ? 'Cannot reach the server — try again once connected.'
            : err instanceof Error
              ? err.message
              : 'Failed to send request.',
      });
    }
  }, []);

  const cancel = useCallback(() => {
    if (requestIdRef.current != null) void cancelReprintRequest(requestIdRef.current);
    requestIdRef.current = null;
    setState({ phase: 'idle' });
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current = null;
    setState({ phase: 'idle' });
  }, []);

  /** Seeds 'waiting' from a pending request found via getReprintEligibility — e.g. the modal was closed and reopened while a request was still outstanding. */
  const resumeWaiting = useCallback((requestId: number, expiresAt: string) => {
    requestIdRef.current = requestId;
    setState({ phase: 'waiting', requestId, expiresAt });
  }, []);

  useEffect(() => {
    if (state.phase !== 'waiting') return;
    let cancelled = false;

    const poll = async () => {
      try {
        const result = await getReprintRequest(state.requestId);
        if (cancelled) return;
        if (result.status === 'approved') {
          setState({ phase: 'approved', reprintRequestId: result.id });
          onApproved(result.id);
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

  return { state, send, cancel, reset, resumeWaiting };
}
