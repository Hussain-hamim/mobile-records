import type { Vault } from "./vault";

/** One keyed connection/operation queue per file, with independent caller leases. */
export function createVaultPool() {
  type Entry = {
    opening: Promise<Vault>;
    users: number;
    closing?: Promise<void>;
  };
  const entries = new Map<string, Entry>();
  return async function acquire(
    name: string,
    open: () => Promise<Vault>,
  ): Promise<Vault> {
    let entry = entries.get(name);
    if (entry?.closing) {
      await entry.closing;
      return acquire(name, open);
    }
    if (!entry) {
      entry = { opening: Promise.resolve().then(open), users: 0 };
      entries.set(name, entry);
    }
    entry.users++;
    let vault: Vault;
    try {
      vault = await entry.opening;
    } catch (error) {
      if (entries.get(name) === entry) entries.delete(name);
      throw error;
    }
    const active = entry;
    let closed = false;
    let closing: Promise<void> | undefined;
    const check = <T>(work: () => Promise<T>) =>
      closed ? Promise.reject(new Error("Local database is closed")) : work();
    return {
      storage: vault.storage,
      get: <T>(key: string) => check(() => vault.get<T>(key)),
      list: <T>(prefix: string) => check(() => vault.list<T>(prefix)),
      batch: (changes) => check(() => vault.batch(changes)),
      close() {
        if (closing) return closing;
        closed = true;
        active.users--;
        if (active.users === 0) {
          active.closing = vault.close().then(() => {
            if (entries.get(name) === active) entries.delete(name);
          });
          // A failed close stays in the pool: never race it with another open.
          closing = active.closing;
        } else closing = Promise.resolve();
        return closing;
      },
    };
  };
}
