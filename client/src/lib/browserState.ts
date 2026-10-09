const state = new Map<string, string>();

/** Ephemeral UI state only. Business data must be read from Supabase-backed queries. */
export const browserState = {
  get(key: string): string | null {
    return state.has(key) ? state.get(key)! : null;
  },
  set(key: string, value: string): void {
    state.set(key, value);
  },
  remove(key: string): void {
    state.delete(key);
  },
};
