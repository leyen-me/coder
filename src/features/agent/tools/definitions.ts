import type { AgentToolDefinition } from "./types";

export const LIST_DIR_TOOL_NAME = "list_dir";
export const READ_FILE_TOOL_NAME = "read_file";
export const WRITE_FILE_TOOL_NAME = "write_file";
export const REPLACE_FILE_TOOL_NAME = "replace_file";
export const EDIT_FILE_TOOL_NAME = "edit_file";

export const LIST_DIR_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: LIST_DIR_TOOL_NAME,
    description:
      "List files and directories under a path. Relative paths are resolved against the workspace root.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative or absolute path within the workspace.",
        },
        recursive: {
          type: "boolean",
          description: "Whether to list entries recursively.",
          default: false,
        },
        max_depth: {
          type: "integer",
          description: "Maximum recursion depth when recursive is true.",
          default: 1,
        },
        show_hidden: {
          type: "boolean",
          description: "Whether to include dotfiles and dot-directories.",
          default: false,
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
};

export const READ_FILE_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: READ_FILE_TOOL_NAME,
    description:
      "Read a text file with line numbers and pagination. Relative paths are resolved against the workspace root.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative or absolute path to the file within the workspace.",
        },
        start_line: {
          type: "integer",
          description: "First line to read (1-based).",
          default: 1,
        },
        max_lines: {
          type: "integer",
          description: "Maximum number of lines to return.",
          default: 500,
        },
        respect_gitignore: {
          type: "boolean",
          description: "Whether to refuse reading paths ignored by .gitignore.",
          default: true,
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
};

export const WRITE_FILE_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: WRITE_FILE_TOOL_NAME,
    description:
      "Create a new text file. Fails if the file already exists. Use replace_file or edit_file to modify existing files.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative or absolute path to the new file within the workspace.",
        },
        content: {
          type: "string",
          description: "Full file content to write.",
        },
        create_parent_dirs: {
          type: "boolean",
          description: "Whether to create missing parent directories.",
          default: true,
        },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
};

export const REPLACE_FILE_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: REPLACE_FILE_TOOL_NAME,
    description:
      "Replace the entire contents of an existing text file. Use expected_sha256 from read_file to avoid overwriting concurrent changes.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative or absolute path to the file within the workspace.",
        },
        content: {
          type: "string",
          description: "Full replacement file content.",
        },
        expected_sha256: {
          type: "string",
          description: "SHA256 hash from read_file. Rejects the write if the file changed.",
        },
        create_backup: {
          type: "boolean",
          description: "Whether to save a backup copy under .history before writing.",
          default: true,
        },
        respect_gitignore: {
          type: "boolean",
          description: "Whether to refuse editing paths ignored by .gitignore.",
          default: true,
        },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
};

export const EDIT_FILE_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: EDIT_FILE_TOOL_NAME,
    description:
      "Apply a targeted search-and-replace edit to an existing text file. Prefer this over replace_file for small changes.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative or absolute path to the file within the workspace.",
        },
        old_string: {
          type: "string",
          description: "Exact text to replace. Must match uniquely unless replace_all is true.",
        },
        new_string: {
          type: "string",
          description: "Replacement text.",
        },
        expected_sha256: {
          type: "string",
          description: "SHA256 hash from read_file. Rejects the edit if the file changed.",
        },
        replace_all: {
          type: "boolean",
          description: "Whether to replace every occurrence of old_string.",
          default: false,
        },
        create_backup: {
          type: "boolean",
          description: "Whether to save a backup copy under .history before writing.",
          default: true,
        },
        respect_gitignore: {
          type: "boolean",
          description: "Whether to refuse editing paths ignored by .gitignore.",
          default: true,
        },
      },
      required: ["path", "old_string", "new_string"],
      additionalProperties: false,
    },
  },
};

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  LIST_DIR_TOOL,
  READ_FILE_TOOL,
  WRITE_FILE_TOOL,
  REPLACE_FILE_TOOL,
  EDIT_FILE_TOOL,
];
