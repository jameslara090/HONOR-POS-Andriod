/**
 * Zod schemas shared between services. Ported from the desktop's src/shared/ipc.ts —
 * only the offline-auth shapes needed so far; IPC channel names are dropped entirely
 * since there is no main/renderer process boundary on Android.
 */

import { z } from 'zod';

export const offlineAuthRoleSchema = z.enum(['admin', 'cashier', 'user']);

export const offlineAuthUserProfileSchema = z.object({
  email: z.string().email(),
  userId: z.string().min(1),
  name: z.string().min(1),
  roles: z.array(z.string()),
  role: offlineAuthRoleSchema,
  is_sales_person: z.boolean().optional(),
  savedAt: z.number().int(),
});

export const saveOfflineAuthCredentialsRequestSchema = z.object({
  email: z.string().email(),
  userId: z.string().min(1),
  name: z.string().min(1),
  roles: z.array(z.string()),
  role: offlineAuthRoleSchema,
  is_sales_person: z.boolean().optional(),
  password: z.string().min(1),
});

export const verifyOfflineAuthCredentialsRequestSchema = z.object({
  identifier: z.string().min(1), // email address or POS user_id
  password: z.string().min(1),
});

export const offlineVerifyResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), profile: offlineAuthUserProfileSchema }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['not_found', 'invalid', 'locked', 'expired']),
    retryAfterSeconds: z.number().int().optional(),
  }),
]);

export type OfflineAuthUserProfile = z.infer<typeof offlineAuthUserProfileSchema>;
export type SaveOfflineAuthCredentialsRequest = z.infer<typeof saveOfflineAuthCredentialsRequestSchema>;
export type VerifyOfflineAuthCredentialsRequest = z.infer<typeof verifyOfflineAuthCredentialsRequestSchema>;
export type OfflineVerifyResult = z.infer<typeof offlineVerifyResultSchema>;

export function parseSaveOfflineAuthCredentialsRequest(data: unknown): SaveOfflineAuthCredentialsRequest {
  return saveOfflineAuthCredentialsRequestSchema.parse(data);
}

export function parseVerifyOfflineAuthCredentialsRequest(data: unknown): VerifyOfflineAuthCredentialsRequest {
  return verifyOfflineAuthCredentialsRequestSchema.parse(data);
}

export function parseOfflineVerifyResult(data: unknown): OfflineVerifyResult {
  return offlineVerifyResultSchema.parse(data);
}

export function parseOfflineAuthUserProfile(data: unknown): OfflineAuthUserProfile {
  return offlineAuthUserProfileSchema.parse(data);
}
