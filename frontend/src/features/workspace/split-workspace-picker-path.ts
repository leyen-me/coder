export type WorkspacePathSegment = {
  label: string;
  path: string;
};

export type WorkspaceBreadcrumbItem =
  | { kind: "segment"; label: string; path: string }
  | { kind: "ellipsis" };

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

/** Collapses long breadcrumb trails to first + ellipsis + last segments. */
export function collapseWorkspacePickerBreadcrumb(
  segments: WorkspacePathSegment[],
  maxVisible = 4
): WorkspaceBreadcrumbItem[] {
  if (segments.length <= maxVisible) {
    return segments.map((segment) => ({ kind: "segment", ...segment }));
  }

  const [first, ...rest] = segments;
  const tail = rest.slice(-2);

  return [
    { kind: "segment", label: first.label, path: first.path },
    { kind: "ellipsis" },
    ...tail.map((segment) => ({ kind: "segment", ...segment })),
  ];
}
