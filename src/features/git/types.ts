/** Git data types — mirrors Rust serde types. */

export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted"
  | "type_changed";

export type GitStatusEntry = {
  path: string;
  staged: boolean;
  status: GitFileStatus;
  originalPath?: string;
};

export type GitCommitEntry = {
  hash: string;
  authorName: string;
  authorEmail: string;
  message: string;
  timestamp: number;
};

export type GitBranchesResponse = {
  currentBranch: string | null;
  branches: string[];
};

export type GitStatusResponse = {
  entries: GitStatusEntry[];
  currentBranch: string | null;
};

export type GitAheadBehind = {
  ahead: number;
  behind: number;
};

/** Tab view within the Source Control panel. */
export type SourceControlTab = "changes" | "history";
