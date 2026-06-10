import type { AgentToolDefinition } from "./types";

export const LIST_DIR_TOOL_NAME = "list_dir";
export const READ_FILE_TOOL_NAME = "read_file";
export const WRITE_FILE_TOOL_NAME = "write_file";
export const REPLACE_FILE_TOOL_NAME = "replace_file";
export const EDIT_FILE_TOOL_NAME = "edit_file";
export const GLOB_TOOL_NAME = "glob";
export const GREP_TOOL_NAME = "grep";
export const SHELL_TOOL_NAME = "shell";
export const AWAIT_TOOL_NAME = "await";
export const LIST_SHELLS_TOOL_NAME = "list_shells";
export const KILL_SHELL_TOOL_NAME = "kill_shell";
export const WEB_SEARCH_TOOL_NAME = "web_search";
export const BROWSE_PAGE_TOOL_NAME = "browse_page";
export const LIST_SKILLS_TOOL_NAME = "list_skills";
export const READ_SKILL_TOOL_NAME = "read_skill";

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
        // Pre-write .history backup; off until rollback UX ships (see text_file::create_backup).
        create_backup: {
          type: "boolean",
          description: "Whether to save a backup copy under .history before writing.",
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
        // Pre-write .history backup; off until rollback UX ships (see text_file::create_backup).
        create_backup: {
          type: "boolean",
          description: "Whether to save a backup copy under .history before writing.",
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
      "Fetch a public web page and return readable Markdown content. Use after web_search when you need the full page text. Does not render JavaScript-heavy pages. Do not call repeatedly for the same URL.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch. Must be http or https.",
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
      "List enabled skills (slug, name, description). User skills must be enabled by the user before they appear. Use before read_skill when you need specialized workflow instructions.",
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          enum: ["all", "system", "user"],
          description: "Filter by skill source. Defaults to all enabled skills.",
        },
      },
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

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  LIST_DIR_TOOL,
  READ_FILE_TOOL,
  WRITE_FILE_TOOL,
  REPLACE_FILE_TOOL,
  EDIT_FILE_TOOL,
  GLOB_TOOL,
  GREP_TOOL,
  SHELL_TOOL,
  AWAIT_TOOL,
  LIST_SHELLS_TOOL,
  KILL_SHELL_TOOL,
  WEB_SEARCH_TOOL,
  BROWSE_PAGE_TOOL,
  LIST_SKILLS_TOOL,
  READ_SKILL_TOOL,
];
