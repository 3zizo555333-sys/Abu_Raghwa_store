/**
 * The former compatibility bridge has been intentionally retired. Business data
 * must be accessed through its Supabase row services; this component is inert.
 */
export const LEGACY_CLOUD_KEYS = [] as const;

export default function LegacyCloudBridge() {
  return null;
}
