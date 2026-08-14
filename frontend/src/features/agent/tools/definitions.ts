import type { AgentToolDefinition } from "./types";

export const LIST_DIR_TOOL_NAME = "list_dir";
export const READ_FILE_TOOL_NAME = "read_file";
export const CREATE_FILE_TOOL_NAME = "create_file";
/** Legacy tool name kept for historical message display and replay. */
export const LEGACY_WRITE_FILE_TOOL_NAME = "write_file";

export function isCreateFileToolName(toolName: string): boolean {
  return (
    toolName === CREATE_FILE_TOOL_NAME ||
    toolName === LEGACY_WRITE_FILE_TOOL_NAME
  );
}
export const REPLACE_FILE_TOOL_NAME = "replace_file";
export const EDIT_FILE_TOOL_NAME = "edit_file";
export const REPLACE_LINES_TOOL_NAME = "replace_lines";
export const GLOB_TOOL_NAME = "glob";
export const GREP_TOOL_NAME = "grep";
export const SHELL_TOOL_NAME = "shell";
export const REMOTE_SHELL_TOOL_NAME = "remote_shell";
export const AWAIT_TOOL_NAME = "await";
export const LIST_SHELLS_TOOL_NAME = "list_shells";
export const KILL_SHELL_TOOL_NAME = "kill_shell";
export const READ_SHELL_LOGS_TOOL_NAME = "read_shell_logs";
export const WEB_SEARCH_TOOL_NAME = "web_search";
export const BROWSE_PAGE_TOOL_NAME = "browse_page";
export const LIST_SKILLS_TOOL_NAME = "list_skills";
export const READ_SKILL_TOOL_NAME = "read_skill";
export const CREATE_SKILL_TOOL_NAME = "create_skill";
export const UPDATE_SKILL_TOOL_NAME = "update_skill";
export const TODO_READ_TOOL_NAME = "todo_read";
export const TODO_WRITE_TOOL_NAME = "todo_write";
export const PLAN_CREATE_TOOL_NAME = "plan_create";
export const PLAN_READ_TOOL_NAME = "plan_read";
export const PLAN_UPDATE_TOOL_NAME = "plan_update";
export const PLAN_EDIT_TOOL_NAME = "plan_edit";
export const PLAN_DELETE_TOOL_NAME = "plan_delete";
export const PLAN_LIST_TOOL_NAME = "plan_list";
export const ASK_QUESTION_TOOL_NAME = "ask_question";

export const SEND_EMAIL_TOOL_NAME = "send_email";

export const LIST_AUTOMATIONS_TOOL_NAME = "list_automations";
export const LIST_MCP_SERVERS_TOOL_NAME = "list_mcp_servers";
export const CREATE_AUTOMATION_TOOL_NAME = "create_automation";
export const UPDATE_AUTOMATION_TOOL_NAME = "update_automation";
export const DELETE_AUTOMATION_TOOL_NAME = "delete_automation";

export const GET_WORKSPACE_TREE_TOOL_NAME = "get_workspace_tree";

export const SPAWN_SUBAGENT_TOOL_NAME = "spawn_subagent";

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
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
};

export const CREATE_FILE_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: CREATE_FILE_TOOL_NAME,
    description:
      "Create a new text file. Fails if the file already exists. Use edit_file to modify existing files.",
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
      "Replace an existing text file with new content. Use as a last resort — prefer edit_file first.",
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
        // Pre-write .coder/history backup; off until rollback UX ships (see text_file::create_backup).
        create_backup: {
          type: "boolean",
          description: "Whether to save a backup copy under .coder/history before writing.",
          default: false,
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
      "Apply a search-and-replace edit to an existing text file. The primary file editing tool — use this first.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative or absolute path to the file within the workspace.",
        },
        old_string: {
          type: "string",
          description:
            "Exact text to replace. Must match uniquely unless replace_all is true. " +
            "JSON escaping: use \\\" for a literal double quote. " +
            "Do NOT double-escape — the value is parsed once before matching.",
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
        // Pre-write .coder/history backup; off until rollback UX ships (see text_file::create_backup).
        create_backup: {
          type: "boolean",
          description: "Whether to save a backup copy under .coder/history before writing.",
          default: false,
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

export const REPLACE_LINES_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: REPLACE_LINES_TOOL_NAME,
    description:
      "Replace a range of lines in an existing text file by line number. " +
      "Read the file with read_file first for accurate line numbers. " +
      "Use this when edit_file cannot handle the replacement content due to JSON escaping issues (special characters, quotes, backslashes). " +
      "No JSON escaping needed — pass the replacement text as-is.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative or absolute path to the file within the workspace.",
        },
        start_line: {
          type: "integer",
          description: "First line to replace (1-based). Must be <= end_line.",
        },
        end_line: {
          type: "integer",
          description:
            "Last line to replace (inclusive, 1-based). Must be >= start_line. " +
            "Example: to replace lines 3 through 5, set start_line=3, end_line=5. " +
            "Note: end_line is INCLUSIVE, not exclusive.",
        },
        content: {
          type: "string",
          description:
            "Replacement content for the specified line range. " +
            "Use an empty string to delete the lines. " +
            "No JSON escaping needed — pass the text directly.",
        },
        expected_sha256: {
          type: "string",
          description: "SHA256 hash from read_file. Rejects the edit if the file changed.",
        },
        create_backup: {
          type: "boolean",
          description: "Whether to save a backup copy under .coder/history before writing.",
          default: false,
        },
        respect_gitignore: {
          type: "boolean",
          description: "Whether to refuse editing paths ignored by .gitignore.",
          default: true,
        },
      },
      required: ["path", "start_line", "end_line", "content"],
      additionalProperties: false,
    },
  },
};
export const GLOB_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: GLOB_TOOL_NAME,
    description:
      "Find files by glob pattern under a directory. Relative paths are resolved against the workspace root.",
    parameters: {
      type: "object",
      properties: {
        glob_pattern: {
          type: "string",
          description: "Glob pattern such as **/*.tsx or src/**/*.rs.",
        },
        target_directory: {
          type: "string",
          description: "Directory to search from. Defaults to the workspace root.",
        },
        head_limit: {
          type: "integer",
          description: "Maximum number of matching paths to return.",
          default: 100,
        },
        respect_gitignore: {
          type: "boolean",
          description: "Whether to skip paths ignored by .gitignore.",
          default: true,
        },
      },
      required: ["glob_pattern"],
      additionalProperties: false,
    },
  },
};

export const GREP_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: GREP_TOOL_NAME,
    description:
      "Search file contents with a regex pattern. Relative paths are resolved against the workspace root.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regular expression pattern to search for.",
        },
        path: {
          type: "string",
          description: "File or directory to search. Defaults to the workspace root.",
        },
        glob: {
          type: "string",
          description: "Optional glob filter to limit searched files, such as *.{ts,tsx}.",
        },
        output_mode: {
          type: "string",
          description: "One of content, files_with_matches, or count.",
          enum: ["content", "files_with_matches", "count"],
          default: "content",
        },
        case_insensitive: {
          type: "boolean",
          description: "Whether to ignore letter case while matching.",
          default: false,
        },
        context_before: {
          type: "integer",
          description: "Number of lines to include before each match.",
        },
        context_after: {
          type: "integer",
          description: "Number of lines to include after each match.",
        },
        context: {
          type: "integer",
          description: "Number of lines to include before and after each match.",
        },
        head_limit: {
          type: "integer",
          description: "Maximum number of results to return.",
          default: 200,
        },
        offset: {
          type: "integer",
          description: "Number of results to skip in content mode.",
          default: 0,
        },
        multiline: {
          type: "boolean",
          description: "Whether . should match newlines.",
          default: false,
        },
        respect_gitignore: {
          type: "boolean",
          description: "Whether to skip paths ignored by .gitignore.",
          default: true,
        },
      },
      required: ["pattern"],
      additionalProperties: false,
    },
  },
};

export const SHELL_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: SHELL_TOOL_NAME,
    description:
      "Execute a shell command in the workspace. Use for builds, tests, git, and other CLI tasks. Not for interactive programs (no -i flags). Set block_until_ms to 0 to run in background and use await to poll.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
        description: {
          type: "string",
          description: "Short human-readable description for UI display only.",
        },
        working_directory: {
          type: "string",
          description:
            "Directory to run the command in, relative to workspace root. Defaults to workspace root.",
        },
        block_until_ms: {
          type: "integer",
          description:
            "Max wait time in ms. Default 30000. Use 0 for background mode (returns shell_id). Max 600000.",
          default: 30000,
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
};

export const REMOTE_SHELL_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: REMOTE_SHELL_TOOL_NAME,
    description:
      "Execute a command on a remote machine via SSH. Use for builds, tests, docker, git, and other CLI tasks on remote machines. " +
      "Set block_until_ms to 0 to run in background and use await to poll, or omit for default 30s timeout. " +
      "Supports read_shell_logs and kill_shell for background shells.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description:
            "Target remote machine alias (configured in Settings > Remote Connections). Required.",
        },
        command: {
          type: "string",
          description: "The shell command to execute on the remote machine.",
        },
        description: {
          type: "string",
          description: "Short human-readable description for UI display only.",
        },
        block_until_ms: {
          type: "integer",
          description:
            "Max wait time in ms. Default 30000. Use 0 for background mode (returns shell_id). Max 600000.",
          default: 30000,
        },
      },
      required: ["target", "command"],
      additionalProperties: false,
    },
  },
};

export const AWAIT_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: AWAIT_TOOL_NAME,
    description:
      "Poll a background shell started with shell(block_until_ms=0) until it completes or times out.",
    parameters: {
      type: "object",
      properties: {
        shell_id: {
          type: "string",
          description: "The shell_id returned from a background shell invocation.",
        },
        block_until_ms: {
          type: "integer",
          description:
            "Max wait time in ms before returning current output. Default 30000. Max 600000.",
          default: 30000,
        },
      },
      required: ["shell_id"],
      additionalProperties: false,
    },
  },
};

export const LIST_SHELLS_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: LIST_SHELLS_TOOL_NAME,
    description:
      "List background shell processes started by the agent. Returns running shells by default; use status_filter to inspect other states when needed.",
    parameters: {
      type: "object",
      properties: {
        status_filter: {
          type: "string",
          description:
            'Filter by status. Default "running". Use "all" to include completed and failed shells.',
          enum: ["running", "completed", "failed", "timeout", "cancelled", "all"],
          default: "running",
        },
        task_id_filter: {
          type: "string",
          description: "Optional task ID to list only shells from a specific agent run.",
        },
      },
      additionalProperties: false,
    },
  },
};

export const KILL_SHELL_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: KILL_SHELL_TOOL_NAME,
    description:
      "Kill a running background shell process by shell_id. Use list_shells first to find the target shell_id.",
    parameters: {
      type: "object",
      properties: {
        shell_id: {
          type: "string",
          description: "The shell_id to terminate.",
        },
      },
      required: ["shell_id"],
      additionalProperties: false,
    },
  },
};

export const READ_SHELL_LOGS_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: READ_SHELL_LOGS_TOOL_NAME,
    description:
      "Read logs from an AI background shell in batches. " +
      "Use list_shells first to find shell IDs. " +
      "Returns a chunk of stdout or stderr starting at the given offset.",
    parameters: {
      type: "object",
      properties: {
        shell_id: {
          type: "string",
          description: "The shell_id to read logs from.",
        },
        stream: {
          type: "string",
          description: 'Which stream to read: "stdout" or "stderr". Defaults to "stdout".',
          enum: ["stdout", "stderr"],
        },
        offset: {
          type: "integer",
          description:
            "Byte offset to start reading from. Default 0. Use the returned offset + data.length to paginate.",
        },
        limit: {
          type: "integer",
          description: "Maximum bytes to return (default 4096, max 65536).",
          default: 4096,
        },
      },
      required: ["shell_id"],
      additionalProperties: false,
    },
  },
};

export const WEB_SEARCH_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: WEB_SEARCH_TOOL_NAME,
    description:
      "Search the web for real-time information outside training data, such as news, version numbers, or current events. Include version numbers or dates in technical queries when relevant.",
    parameters: {
      type: "object",
      properties: {
        search_term: {
          type: "string",
          description:
            "The search term to look up on the web. Be specific and include relevant keywords.",
        },
        explanation: {
          type: "string",
          description:
            "One sentence explanation of why this search is being used.",
        },
        max_results: {
          type: "integer",
          description: "Maximum number of search results to return.",
          default: 5,
        },
      },
      required: ["search_term"],
      additionalProperties: false,
    },
  },
};

export const BROWSE_PAGE_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: BROWSE_PAGE_TOOL_NAME,
    description:
      "Fetch a public web page and return readable Markdown content. " +
      "Use after web_search when you need the full page text. " +
      "Results are paginated like read_file: use start_line (1-based) and max_lines to page through the content. " +
      "Does not render JavaScript-heavy pages. Do not call repeatedly for the same URL.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch. Must be http or https.",
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
        explanation: {
          type: "string",
          description:
            "One sentence explanation of why this page is being fetched.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
};

export const LIST_SKILLS_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: LIST_SKILLS_TOOL_NAME,
    description:
      "List enabled user skills (slug, name, description). User skills must be enabled by the user before they appear. Use before read_skill when you need specialized workflow instructions.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
};

export const READ_SKILL_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: READ_SKILL_TOOL_NAME,
    description:
      "Load the full instructions for an enabled skill by slug. Returns an error if the skill is missing or not enabled.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Skill slug from list_skills.",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
};

export const CREATE_SKILL_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: CREATE_SKILL_TOOL_NAME,
    description:
      "Create a custom user skill with instructions the agent can follow later. New skills are disabled until the user enables them on the Skills page. Slug must be lowercase letters, numbers, and hyphens.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description:
            'Unique identifier, e.g. "code-review". Lowercase letters, numbers, and hyphens only.',
        },
        name: {
          type: "string",
          description: "Short display name for the skill.",
        },
        description: {
          type: "string",
          description:
            "When to use this skill — shown in list_skills and used to decide relevance.",
        },
        content: {
          type: "string",
          description:
            "Full skill instructions (markdown). Same format as a SKILL.md body.",
        },
      },
      required: ["slug", "name", "description", "content"],
      additionalProperties: false,
    },
  },
};

export const TODO_WRITE_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: TODO_WRITE_TOOL_NAME,
    description:
      "Create and update a structured todo list for the current chat session. Use merge=false to replace the whole list (or pass an empty todos array to clear it). Use merge=true to update items by id, add new items, or remove items via remove_ids. A single-item update is supported. Only one todo may be in_progress at a time.",
    parameters: {
      type: "object",
      properties: {
        merge: {
          type: "boolean",
          description:
            "Whether to merge with existing todos by id. Use true for partial updates or deletions; false to replace the entire list.",
        },
        todos: {
          type: "array",
          description:
            "Todo items to create or update. On merge=true, content may be omitted to keep the existing text.",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Stable identifier for this todo item.",
              },
              content: {
                type: "string",
                description: "Short description of the task.",
              },
              status: {
                type: "string",
                description:
                  "One of pending, in_progress, completed, or cancelled.",
                enum: ["pending", "in_progress", "completed", "cancelled"],
              },
            },
            required: ["id", "status"],
            additionalProperties: false,
          },
        },
        remove_ids: {
          type: "array",
          description:
            "Todo ids to delete from the list. Only valid when merge=true.",
          items: {
            type: "string",
            description: "Todo id to remove.",
          },
        },
      },
      required: ["merge", "todos"],
      additionalProperties: false,
    },
  },
};

export const TODO_READ_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: TODO_READ_TOOL_NAME,
    description:
      "Read the current structured todo list for this chat session. Use when you need to inspect or re-sync task state before deciding what to update with todo_write.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
};

export const ASK_QUESTION_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: ASK_QUESTION_TOOL_NAME,
    description:
      "Ask the user one or more structured clarification questions and wait for their answers before continuing. Each question can be single-select or multi-select. The UI always provides an Other/custom-text option for every question. Set timeout_ms when the agent should continue after waiting for a limited time.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Optional short title shown above the question list, e.g. Clarify requirements.",
        },
        timeout_ms: {
          type: "integer",
          description:
            "Optional wait timeout in milliseconds. When it expires, the tool returns a timeout result to the model instead of failing.",
        },
        questions: {
          type: "array",
          description:
            "A non-empty list of questions to ask in one batch. Prefer batching related questions together instead of asking one at a time.",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Stable identifier for this question.",
              },
              prompt: {
                type: "string",
                description: "The question shown to the user.",
              },
              allow_multiple: {
                type: "boolean",
                description:
                  "Whether the user may select multiple options. Defaults to false.",
                default: false,
              },
              options: {
                type: "array",
                description:
                  "At least 2 predefined options. The UI will add a built-in Other/custom option automatically.",
                items: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      description: "Stable identifier for this option.",
                    },
                    label: {
                      type: "string",
                      description: "Option label shown to the user.",
                    },
                    recommended: {
                      type: "boolean",
                      description:
                        "Optional. Set to true on the option you recommend the user to pick, to help them decide. Only set it on one option per question.",
                    },
                  },
                  required: ["id", "label"],
                  additionalProperties: false,
                },
              },
            },
            required: ["id", "prompt", "options"],
            additionalProperties: false,
          },
        },
      },
      required: ["questions"],
      additionalProperties: false,
    },
  },
};

export const PLAN_CREATE_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: PLAN_CREATE_TOOL_NAME,
    description:
      "Create a new plan markdown file in the .coder/plan/ directory. Filename must be descriptive and end with -plan.md (e.g. refactor-auth-plan.md). Fails if the plan already exists — use plan_update instead.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            'Plan filename ending with -plan.md, e.g. "refactor-auth-plan.md". Use lowercase letters, numbers, and hyphens only.',
        },
        content: {
          type: "string",
          description: "Full plan content in Markdown.",
        },
      },
      required: ["name", "content"],
      additionalProperties: false,
    },
  },
};

export const PLAN_READ_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: PLAN_READ_TOOL_NAME,
    description: "Read a plan markdown file from the .coder/plan/ directory.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: 'Plan filename, e.g. "refactor-auth-plan.md".',
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
};

export const PLAN_UPDATE_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: PLAN_UPDATE_TOOL_NAME,
    description:
      "Replace the content of an existing plan file in the .coder/plan/ directory.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: 'Plan filename, e.g. "refactor-auth-plan.md".',
        },
        content: {
          type: "string",
          description: "Full updated plan content in Markdown.",
        },
      },
      required: ["name", "content"],
      additionalProperties: false,
    },
  },
};

export const PLAN_EDIT_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: PLAN_EDIT_TOOL_NAME,
    description:
      "Apply a targeted search-and-replace edit to an existing plan file in the .coder/plan/ directory. Prefer this over plan_update for small changes.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: 'Plan filename, e.g. "refactor-auth-plan.md".',
        },
        old_string: {
          type: "string",
          description: "Exact text to replace. Must match uniquely unless replace_all is true.",
        },
        new_string: {
          type: "string",
          description: "Replacement text.",
        },
        replace_all: {
          type: "boolean",
          description: "Whether to replace every occurrence of old_string.",
          default: false,
        },
      },
      required: ["name", "old_string", "new_string"],
      additionalProperties: false,
    },
  },
};

export const PLAN_DELETE_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: PLAN_DELETE_TOOL_NAME,
    description: "Delete a plan markdown file from the .coder/plan/ directory.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: 'Plan filename to delete, e.g. "refactor-auth-plan.md".',
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
};

export const PLAN_LIST_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: PLAN_LIST_TOOL_NAME,
    description:
      "List all plan markdown files in the .coder/plan/ directory, sorted by most recently modified.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
};

export const UPDATE_SKILL_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: UPDATE_SKILL_TOOL_NAME,
    description:
      "Update an existing user skill by slug. Any combination of name, description, or content can be provided — only the supplied fields will be changed. Slug must be lowercase letters, numbers, and hyphens.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description:
            'Slug of the existing user skill to update, e.g. "code-review".',
        },
        name: {
          type: "string",
          description: "New short display name for the skill.",
        },
        description: {
          type: "string",
          description:
            "New description — when to use this skill.",
        },
        content: {
          type: "string",
          description:
            "New full skill instructions (markdown). Same format as a SKILL.md body.",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
};

export const GET_WORKSPACE_TREE_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: GET_WORKSPACE_TREE_TOOL_NAME,
    description:
      "Display the workspace directory tree structure with depth recursion. " +
      "Respects .gitignore and automatically excludes large directories (node_modules, .git, dist, etc.). " +
      "Scans from the workspace root — no path required. " +
      "Results are paginated like read_file: use start_line (1-based) and max_lines to page through the tree.",
    parameters: {
      type: "object",
      properties: {
        start_line: {
          type: "integer",
          description: "First line to return (1-based).",
          default: 1,
        },
        max_lines: {
          type: "integer",
          description: "Maximum number of lines to return.",
          default: 500,
        },
      },
      additionalProperties: false,
    },
  },
};

export const SEND_EMAIL_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: SEND_EMAIL_TOOL_NAME,
    description:
      "Send an email to a recipient. Requires email settings to be configured in Settings > Email. The agent decides when to use this based on the user's instructions.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address.",
        },
        subject: {
          type: "string",
          description: "Email subject line.",
        },
        body: {
          type: "string",
          description: "Plain text email body content.",
        },
      },
      required: ["to", "subject", "body"],
      additionalProperties: false,
    },
  },
};

export const LIST_AUTOMATIONS_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: LIST_AUTOMATIONS_TOOL_NAME,
    description:
      "List all scheduled automations with full configuration except run history. Use before create, update, or delete to inspect existing jobs and avoid duplicates.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
};

export const CREATE_AUTOMATION_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: CREATE_AUTOMATION_TOOL_NAME,
    description:
      "Create a scheduled automation that starts a new agent session on each run. Cron times use the local system timezone at minute precision. New automations are created disabled; tell the user to review and enable them on the Automations page.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Short automation name.",
        },
        prompt: {
          type: "string",
          description: "Task prompt sent to the agent on each scheduled run.",
        },
        cron_expression: {
          type: "string",
          description:
            'Standard 5-field cron expression, e.g. "0 9 * * 1-5" for weekdays at 09:00 local time.',
        },
        description: {
          type: "string",
          description: "Optional description shown in the automations list.",
        },
        workspace_dir: {
          type: "string",
          description:
            "Workspace directory for scheduled runs. Defaults to the current session workspace.",
        },
        model: {
          type: "string",
          description:
            "Model id for scheduled runs. Defaults to the current session model.",
        },
        agent_mode: {
          type: "string",
          enum: ["agent", "ask"],
          description: "Agent mode for scheduled runs.",
          default: "agent",
        },
        thinking_enabled: {
          type: "boolean",
          description:
            "Whether thinking mode is enabled when the model supports it.",
          default: false,
        },
      },
      required: ["name", "prompt", "cron_expression"],
      additionalProperties: false,
    },
  },
};

export const UPDATE_AUTOMATION_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: UPDATE_AUTOMATION_TOOL_NAME,
    description:
      "Update an existing automation by id. Only supplied fields are changed. enabled cannot be changed here; the user must enable or disable automations on the Automations page.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Automation id from list_automations.",
        },
        name: {
          type: "string",
          description: "Updated automation name.",
        },
        prompt: {
          type: "string",
          description: "Updated task prompt.",
        },
        cron_expression: {
          type: "string",
          description: "Updated 5-field cron expression in local time.",
        },
        description: {
          type: "string",
          description: "Updated description.",
        },
        workspace_dir: {
          type: "string",
          description: "Updated workspace directory.",
        },
        model: {
          type: "string",
          description: "Updated model id.",
        },
        agent_mode: {
          type: "string",
          enum: ["agent", "ask"],
          description: "Updated agent mode.",
        },
        thinking_enabled: {
          type: "boolean",
          description: "Updated thinking mode setting.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
};

export const DELETE_AUTOMATION_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: DELETE_AUTOMATION_TOOL_NAME,
    description:
      "Delete an automation by id. Use list_automations first to confirm the target id and name.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Automation id from list_automations.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
};

export const SPAWN_SUBAGENT_TOOL: AgentToolDefinition = {
  type: "function",
  function: {
    name: SPAWN_SUBAGENT_TOOL_NAME,
    description:
      "Spawn a sub-agent to complete an independent sub-task. The sub-agent runs with the same workspace tools and returns a structured report. Use this for delegating focused research, file exploration, or verification tasks. Maximum nesting depth: 3.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description:
            "The task description for the sub-agent. Be specific about what to do and what to report back.",
        },
        context: {
          type: "string",
          description:
            "Optional additional context or constraints for the sub-agent.",
        },
        tools: {
          type: "array",
          description:
            "Optional whitelist of tool names the sub-agent may use. Defaults to all available tools.",
          items: {
            type: "string",
          },
        },
      },
      required: ["task"],
      additionalProperties: false,
    },
  },
};

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  LIST_DIR_TOOL,
  READ_FILE_TOOL,
  // READ_PRIOR_TOOL_OUTPUT_TOOL — compact summary from prior session
  CREATE_FILE_TOOL,
  REPLACE_FILE_TOOL,
  EDIT_FILE_TOOL,
  // REPLACE_LINES_TOOL — temporarily disabled; see DISABLED_AGENT_TOOL_NAMES in backend.
  GLOB_TOOL,
  GREP_TOOL,
  SHELL_TOOL,
  REMOTE_SHELL_TOOL,
  AWAIT_TOOL,
  LIST_SHELLS_TOOL,
  KILL_SHELL_TOOL,
  READ_SHELL_LOGS_TOOL,
  WEB_SEARCH_TOOL,
  BROWSE_PAGE_TOOL,
  TODO_READ_TOOL,
  TODO_WRITE_TOOL,
  ASK_QUESTION_TOOL,
  GET_WORKSPACE_TREE_TOOL,
  PLAN_CREATE_TOOL,
  PLAN_READ_TOOL,
  PLAN_UPDATE_TOOL,
  PLAN_EDIT_TOOL,
  PLAN_DELETE_TOOL,
  PLAN_LIST_TOOL,
  LIST_AUTOMATIONS_TOOL,
  CREATE_AUTOMATION_TOOL,
  UPDATE_AUTOMATION_TOOL,
  DELETE_AUTOMATION_TOOL,
  SEND_EMAIL_TOOL,
  SPAWN_SUBAGENT_TOOL,
];
