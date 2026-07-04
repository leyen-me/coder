import { useSyncExternalStore } from "react";

import { WorkspacePickerDialog } from "./workspace-picker-dialog";
import {
  getWorkspacePickerSnapshot,
  settleWorkspacePicker,
  subscribeWorkspacePicker,
} from "./workspace-picker-store";

export function WorkspacePickerHost() {
  const request = useSyncExternalStore(
    subscribeWorkspacePicker,
    getWorkspacePickerSnapshot,
    getWorkspacePickerSnapshot
  );

  if (!request) {
    return null;
  }

  return (
    <WorkspacePickerDialog
      open
      defaultPath={request.defaultPath}
      onConfirm={(path) => {
        settleWorkspacePicker(path);
      }}
      onCancel={() => {
        settleWorkspacePicker(null);
      }}
    />
  );
}
