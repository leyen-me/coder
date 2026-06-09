import type { AgentToolDefinition } from "./types";

export const LIST_DIR_TOOL_NAME = "list_dir";
export const READ_FILE_TOOL_NAME = "read_file";

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

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  LIST_DIR_TOOL,
  READ_FILE_TOOL,
];
