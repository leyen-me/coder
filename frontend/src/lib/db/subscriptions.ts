type DbListener = () => void;

const listeners = new Set<DbListener>();

export function subscribeDb(listener: DbListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyDbChange(): void {
  for (const listener of listeners) {
    listener();
  }
}
