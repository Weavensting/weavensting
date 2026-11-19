/**
 * Stand-in for AsyncStorage in Node-based unit tests. The real package needs a
 * native module; the config store only needs somewhere to put a string.
 */
const store = new Map<string, string>();

export default {
  async getItem(key: string): Promise<string | null> {
    return store.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },
  async clear(): Promise<void> {
    store.clear();
  },
};
