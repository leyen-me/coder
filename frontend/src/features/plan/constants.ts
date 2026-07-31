/** Directory under the workspace root where plan markdown files are stored. */
export const PLAN_DIRECTORY = ".coder/plan";

/** Suffix required on every plan filename. */
export const PLAN_FILENAME_SUFFIX = "-plan.md";

/** Validates plan filenames like `refactor-auth-plan.md`. */
export const PLAN_FILENAME_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*-plan\.md$/;

export function isValidPlanFilename(name: string): boolean {
  return PLAN_FILENAME_PATTERN.test(name.trim());
}

export function toPlanRelativePath(name: string): string {
  return `${PLAN_DIRECTORY}/${name.trim()}`;
}
