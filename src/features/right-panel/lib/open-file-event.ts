/**
 * Custom event dispatched when the user wants to open a file in the
 * right-panel file preview from outside the file tree (e.g., from a
 * file-diff tool output card).
 *
 * Payload: { path: string, name: string }
 */
export const OPEN_FILE_IN_PREVIEW_EVENT = "open-file-in-preview";
