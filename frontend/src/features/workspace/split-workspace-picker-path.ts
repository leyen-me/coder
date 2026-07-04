export type WorkspacePathSegment = {
  label: string;
  path: string;
};

/** Splits an absolute path into breadcrumb segments. */
export function splitWorkspacePickerPath(path: string): WorkspacePathSegment[] {
  const trimmed = path.trim();
  if (!trimmed) {
    return [];
  }

  const normalized = trimmed.replace(/\\/g, "/");

  if (/^[A-Za-z]:\/.*/.test(normalized)) {
    const parts = normalized.split("/").filter(Boolean);
    const drive = parts[0] ?? normalized;
    const segments: WorkspacePathSegment[] = [
      {
        label: drive,
        path: drive.endsWith(":") ? `${drive}/` : drive,
      },
    ];

    let current = `${drive}/`;
    for (const part of parts.slice(1)) {
      current = `${current}${part}/`;
      segments.push({
        label: part,
        path: current.slice(0, -1),
      });
    }

    return segments;
  }

  if (normalized === "/") {
    return [{ label: "/", path: "/" }];
  }

  const parts = normalized.split("/").filter(Boolean);
  const segments: WorkspacePathSegment[] = [];
  let current = "";

  for (const part of parts) {
    current = `${current}/${part}`;
    segments.push({
      label: part,
      path: current,
    });
  }

  return segments;
}
