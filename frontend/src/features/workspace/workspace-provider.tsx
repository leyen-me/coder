import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { pickWorkspaceDir } from "./pick-workspace-dir";
import {
  getWorkspaceDisplayName,
  readWorkspaceDir,
  writeWorkspaceDir,
} from "./storage";
import { WorkspacePickerHost } from "./workspace-picker-host";

type WorkspaceStoreValue = {
  workspaceDir: string | null;
  workspaceName: string | null;
  setWorkspaceDir: (path: string | null) => void;
  pickWorkspace: () => Promise<string | null>;
};

const WorkspaceStoreContext = createContext<WorkspaceStoreValue | null>(null);

let workspaceSnapshot: string | null = null;
let workspaceLoaded = false;
const listeners = new Set<() => void>();

function getWorkspaceSnapshot(): string | null {
  if (!workspaceLoaded) {
    workspaceSnapshot = readWorkspaceDir();
    workspaceLoaded = true;
  }
  return workspaceSnapshot;
}

function emitWorkspaceChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string | null {
  return getWorkspaceSnapshot();
}

function setWorkspaceSnapshot(path: string | null): void {
  workspaceSnapshot = path;
  writeWorkspaceDir(path);
  emitWorkspaceChange();
}

type WorkspaceProviderProps = {
  children: ReactNode;
};

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const workspaceDir = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setWorkspaceDir = useCallback((path: string | null) => {
    setWorkspaceSnapshot(path?.trim() || null);
  }, []);

  const pickWorkspace = useCallback(async () => {
    const selected = await pickWorkspaceDir();
    if (selected) {
      setWorkspaceSnapshot(selected);
    }
    return selected;
  }, []);

  const value = useMemo(
    () => ({
      workspaceDir,
      workspaceName: workspaceDir ? getWorkspaceDisplayName(workspaceDir) : null,
      setWorkspaceDir,
      pickWorkspace,
    }),
    [pickWorkspace, setWorkspaceDir, workspaceDir]
  );

  return (
    <WorkspaceStoreContext.Provider value={value}>
      {children}
      <WorkspacePickerHost />
    </WorkspaceStoreContext.Provider>
  );
}

export function useWorkspace(): WorkspaceStoreValue {
  const context = useContext(WorkspaceStoreContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return context;
}
