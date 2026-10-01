const values = new Map<string, string>();
export const secureStorage = {
  async getItem(key: string) {
    return values.get(key) ?? null;
  },
  async setItem(key: string, value: string) {
    values.set(key, value);
  },
  async removeItem(key: string) {
    values.delete(key);
  },
};
