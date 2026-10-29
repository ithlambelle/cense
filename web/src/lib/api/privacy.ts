import { z } from "zod";

// The Analytics switch on Security and privacy. The profile keeps when it was
// turned off (profiles.analytics_opted_out_at), so it follows the student to
// every device; null means analytics is on.
export const privacySettingsSchema = z.strictObject({ analyticsOn: z.boolean() });
export const updatePrivacySettingsSchema = z.strictObject({ analyticsOn: z.boolean() });

export const PRIVACY_FIELDS = "analytics_opted_out_at";
export type PrivacyRow = { analytics_opted_out_at: string | null };

export function privacyFromRow(row: PrivacyRow): z.infer<typeof privacySettingsSchema> {
  return { analyticsOn: row.analytics_opted_out_at === null };
}
