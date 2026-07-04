export type WorkspacePickerRequest = {
  defaultPath: string;
  resolve: (result: string | null) => void;
};

let pendingRequest: WorkspacePickerRequest | null = null;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeWorkspacePicker(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWorkspacePickerSnapshot(): WorkspacePickerRequest | null {
  return pendingRequest;
}

export function openWorkspacePicker(defaultPath: string): Promise<string | null> {
  if (pendingRequest) {
    pendingRequest.resolve(null);
  }

  return new Promise((resolve) => {
    pendingRequest = { defaultPath, resolve };
    emitChange();
  });
}

export function settleWorkspacePicker(result: string | null): void {
  const pending = pendingRequest;
  pendingRequest = null;
  emitChange();
  pending?.resolve(result);
}
