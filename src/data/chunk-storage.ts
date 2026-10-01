interface SecureItems {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
type Manifest = { generation: string; count: number };
/** Publish a new chunk generation only after every chunk is durable. */
export function createChunkStorage(items: SecureItems, uuid: () => string) {
  let writes: Promise<unknown> = Promise.resolve();
  function serialized<T>(work: () => Promise<T>) {
    const task = writes.catch(() => {}).then(work);
    writes = task;
    return task;
  }
  async function manifest(key: string): Promise<Manifest | null> {
    const raw = await items.getItemAsync(key + ".manifest");
    return raw ? JSON.parse(raw) : null;
  }
  async function removeGeneration(key: string, entry: Manifest | null) {
    if (!entry) return;
    for (let i = 0; i < entry.count; i++)
      await items.deleteItemAsync(`${key}.${entry.generation}.${i}`);
  }
  return {
    getItem(key: string) {
      return serialized(async () => {
        const entry = await manifest(key);
        if (!entry) return null;
        const parts = await Promise.all(
          Array.from({ length: entry.count }, (_, i) =>
            items.getItemAsync(`${key}.${entry.generation}.${i}`),
          ),
        );
        return parts.some((p) => p === null) ? null : parts.join("");
      });
    },
    setItem(key: string, value: string) {
      return serialized(async () => {
        const old = await manifest(key);
        const characters = Array.from(value); // Avoid splitting surrogate pairs; <=1600 UTF-8 bytes per chunk.
        const next = {
          generation: uuid(),
          count: Math.max(1, Math.ceil(characters.length / 400)),
        };
        for (let i = 0; i < next.count; i++)
          await items.setItemAsync(
            `${key}.${next.generation}.${i}`,
            characters.slice(i * 400, (i + 1) * 400).join(""),
          );
        await items.setItemAsync(key + ".manifest", JSON.stringify(next));
        await removeGeneration(key, old);
      });
    },
    removeItem(key: string) {
      return serialized(async () => {
        const old = await manifest(key);
        await items.deleteItemAsync(key + ".manifest");
        await removeGeneration(key, old);
      });
    },
  };
}
