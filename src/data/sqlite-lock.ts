/** Retry only temporary lock contention, never corruption or wrong-key errors. */
export function isSqliteLocked(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /database (?:table )?is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(
    message,
  );
}
export async function retrySqliteLock<T>(
  work: () => Promise<T>,
  wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  const delays = [100, 250, 500];
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (!isSqliteLocked(error) || attempt >= delays.length) throw error;
      await wait(delays[attempt]);
    }
  }
}
