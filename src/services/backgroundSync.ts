/**
 * Background offline-sync task. Uses expo-background-task, not the plan
 * doc's expo-background-fetch — that package is deprecated in this SDK (its
 * own type defs point here). Complements the in-app exponential-backoff loop
 * in useCatalog.ts: that loop gives fast recovery while the app is
 * foregrounded, this task covers backgrounded/killed-app recovery on
 * Android's 15-minute WorkManager floor. Both call the same idempotent sync
 * functions.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { syncOfflinePendingFloatingStockEvents, syncOfflinePendingSales } from '../api/pos';

export const SYNC_TASK_NAME = 'pos-offline-sync';

TaskManager.defineTask(SYNC_TASK_NAME, async () => {
  try {
    await syncOfflinePendingSales();
    await syncOfflinePendingFloatingStockEvents();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

let registered = false;

/** Call once at app startup (see app/_layout.tsx). Safe to call more than once. */
export async function registerBackgroundSync(): Promise<void> {
  if (registered) return;
  registered = true;
  await BackgroundTask.registerTaskAsync(SYNC_TASK_NAME, { minimumInterval: 15 });
}
