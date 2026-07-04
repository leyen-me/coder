import { getStoreBackend, resetStoreBackend } from "@/lib/storage";
import type { StoreBackend } from "@/lib/storage";

/**
 * Return the shared `StoreBackend` registered by initCoderStorageSync().
 */
export async function getDb(): Promise<StoreBackend> {
  const custom = getStoreBackend();
  if (custom) {
    return custom;
  }

  throw new Error(
    "No store backend configured. Call initCoderStorageSync() before getDb().",
  );
}

/** Reset the store backend between tests. */
export function resetDbForTests(): void {
  resetStoreBackend();
}
