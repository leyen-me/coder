export const WORKSPACE_PATH_DRAG_MIME = "application/x-coder-workspace-path";
const WORKSPACE_PATH_TEXT_PREFIX = "coder-workspace-path:";

let activeWorkspaceDragPath: string | null = null;

export function beginWorkspacePathDrag(path: string): void {
  activeWorkspaceDragPath = path;
}

export function endWorkspacePathDrag(): void {
  activeWorkspaceDragPath = null;
}

export function getActiveWorkspaceDragPath(): string | null {
  return activeWorkspaceDragPath;
}

export function setWorkspacePathDragData(
  dataTransfer: DataTransfer,
  path: string
): void {
  dataTransfer.setData(WORKSPACE_PATH_DRAG_MIME, path);
  dataTransfer.setData(
    "text/plain",
    `${WORKSPACE_PATH_TEXT_PREFIX}${path}`
  );
  dataTransfer.effectAllowed = "copy";
}

function parseWorkspacePathFromPlainText(plain: string): string | null {
  const trimmed = plain.trim();
  if (!trimmed.startsWith(WORKSPACE_PATH_TEXT_PREFIX)) {
    return null;
  }

  const path = trimmed.slice(WORKSPACE_PATH_TEXT_PREFIX.length).trim();
  return path || null;
}

export function getWorkspacePathFromDrag(
  dataTransfer: DataTransfer
): string | null {
  const customPath = dataTransfer.getData(WORKSPACE_PATH_DRAG_MIME).trim();
  if (customPath) {
    return customPath;
  }

  const activePath = getActiveWorkspaceDragPath();
  if (activePath) {
    return activePath;
  }

  return parseWorkspacePathFromPlainText(dataTransfer.getData("text/plain"));
}

export function hasWorkspacePathDrag(dataTransfer: DataTransfer): boolean {
  return [...dataTransfer.types].includes(WORKSPACE_PATH_DRAG_MIME);
}

export function isWorkspacePathDragActive(
  dataTransfer: DataTransfer | null
): boolean {
  if (getActiveWorkspaceDragPath()) {
    return true;
  }

  if (!dataTransfer) {
    return false;
  }

  if (hasWorkspacePathDrag(dataTransfer)) {
    return true;
  }

  return (
    dataTransfer.types.includes("text/plain") &&
    getActiveWorkspaceDragPath() !== null
  );
}
