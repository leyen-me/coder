import type { AgentToolDefinition } from "./types";

export const LIST_DIR_TOOL_NAME = "list_dir";

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

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [LIST_DIR_TOOL];
