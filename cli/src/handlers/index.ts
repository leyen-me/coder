/**
 * Tool handler registry — maps tool names to their CLI-native handlers.
 */

import type { ToolHandler, ToolResultEnvelope, ToolExecutionContext } from "./types";
import { listDirHandler } from "./list-dir";
import { readFileHandler } from "./read-file";
import { writeFileHandler } from "./write-file";
import { replaceFileHandler } from "./replace-file";
import { editFileHandler } from "./edit-file";
import { replaceLinesHandler } from "./replace-lines";
import { globHandler } from "./glob";
import { grepHandler } from "./grep";
import { shellHandler } from "./shell";
import { remoteShellHandler } from "./remote-shell";
import { awaitShellHandler } from "./await-shell";
import { listShellsHandler } from "./list-shells";
import { killShellHandler } from "./kill-shell";
import { readShellLogsHandler } from "./read-shell-logs";
import { webSearchHandler } from "./web-search";
import { browsePageHandler } from "./browse-page";
import { listSkillsHandler, readSkillHandler, createSkillHandler, updateSkillHandler } from "./skills";
import { todoReadHandler, todoWriteHandler } from "./todos";
import { planCreateHandler, planReadHandler, planUpdateHandler, planEditHandler, planDeleteHandler, planListHandler } from "./plans";
import { getWorkspaceTreeHandler } from "./workspace-tree";
import { askQuestionHandler } from "./ask-question";
import { sendEmailHandler } from "./send-email";
import { spawnSubAgentHandler } from "./spawn-subagent";

// ---------------------------------------------------------------------------
// Tool definitions (matching existing AgentToolDefinition format)
// ---------------------------------------------------------------------------

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const AGENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and directories under a path. Relative paths are resolved against the workspace root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative or absolute path within the workspace." },
          recursive: { type: "boolean", description: "Whether to list entries recursively.", default: false },
          max_depth: { type: "integer", description: "Maximum recursion depth when recursive is true.", default: 1 },
          show_hidden: { type: "boolean", description: "Whether to include dotfiles and dot-directories.", default: false },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file with line numbers and pagination. Relative paths are resolved against the workspace root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative or absolute path to the file within the workspace." },
          start_line: { type: "integer", description: "First line to read (1-based).", default: 1 },
          max_lines: { type: "integer", description: "Maximum number of lines to return.", default: 500 },
          respect_gitignore: { type: "boolean", description: "Whether to refuse reading paths ignored by .gitignore.", default: true },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create a new text file. Fails if the file already exists. Use replace_file or edit_file to modify existing files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative or absolute path to the new file within the workspace." },
          content: { type: "string", description: "Full file content to write." },
          create_parent_dirs: { type: "boolean", description: "Whether to create missing parent directories.", default: true },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_file",
      description: "Replace the entire contents of an existing text file. Use expected_sha256 from read_file to avoid overwriting concurrent changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative or absolute path to the file within the workspace." },
          content: { type: "string", description: "Full replacement file content." },
          expected_sha256: { type: "string", description: "SHA256 hash from read_file. Rejects the write if the file changed." },
          create_backup: { type: "boolean", description: "Whether to save a backup copy under .history before writing.", default: false },
          respect_gitignore: { type: "boolean", description: "Whether to refuse editing paths ignored by .gitignore.", default: true },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Apply a targeted search-and-replace edit to an existing text file. Prefer this over replace_file for small changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative or absolute path to the file within the workspace." },
          old_string: { type: "string", description: "Exact text to replace. Must match uniquely unless replace_all is true." },
          new_string: { type: "string", description: "Replacement text." },
          expected_sha256: { type: "string", description: "SHA256 hash from read_file. Rejects the edit if the file changed." },
          replace_all: { type: "boolean", description: "Whether to replace every occurrence of old_string.", default: false },
          create_backup: { type: "boolean", description: "Whether to save a backup copy under .history before writing.", default: false },
          respect_gitignore: { type: "boolean", description: "Whether to refuse editing paths ignored by .gitignore.", default: true },
        },
        required: ["path", "old_string", "new_string"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_lines",
      description: "Replace a range of lines in an existing text file by line number. Read the file with read_file first to see line numbers.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative or absolute path to the file within the workspace." },
          start_line: { type: "integer", description: "First line to replace (1-based)." },
          end_line: { type: "integer", description: "Last line to replace (inclusive, 1-based)." },
          content: { type: "string", description: "Replacement content for the specified line range." },
          expected_sha256: { type: "string", description: "SHA256 hash from read_file. Rejects the edit if the file changed." },
          create_backup: { type: "boolean", description: "Whether to save a backup copy under .history before writing.", default: false },
          respect_gitignore: { type: "boolean", description: "Whether to refuse editing paths ignored by .gitignore.", default: true },
        },
        required: ["path", "start_line", "end_line", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob",
      description: "Find files by glob pattern under a directory. Relative paths are resolved against the workspace root.",
      parameters: {
        type: "object",
        properties: {
          glob_pattern: { type: "string", description: "Glob pattern such as **/*.tsx or src/**/*.rs." },
          target_directory: { type: "string", description: "Directory to search from. Defaults to the workspace root." },
          head_limit: { type: "integer", description: "Maximum number of matching paths to return.", default: 100 },
          respect_gitignore: { type: "boolean", description: "Whether to skip paths ignored by .gitignore.", default: true },
        },
        required: ["glob_pattern"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search file contents with a regex pattern. Relative paths are resolved against the workspace root.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regular expression pattern to search for." },
          path: { type: "string", description: "File or directory to search. Defaults to the workspace root." },
          glob: { type: "string", description: "Optional glob filter to limit searched files." },
          output_mode: { type: "string", enum: ["content", "files_with_matches", "count"], default: "content" },
          case_insensitive: { type: "boolean", description: "Whether to ignore letter case while matching.", default: false },
          context_before: { type: "integer", description: "Number of lines to include before each match." },
          context_after: { type: "integer", description: "Number of lines to include after each match." },
          context: { type: "integer", description: "Number of lines to include before and after each match." },
          head_limit: { type: "integer", description: "Maximum number of results to return.", default: 200 },
          offset: { type: "integer", description: "Number of results to skip in content mode.", default: 0 },
          multiline: { type: "boolean", description: "Whether . should match newlines.", default: false },
          respect_gitignore: { type: "boolean", description: "Whether to skip paths ignored by .gitignore.", default: true },
        },
        required: ["pattern"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shell",
      description: "Execute a shell command in the workspace. Use for builds, tests, git, and other CLI tasks.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute." },
          description: { type: "string", description: "Short human-readable description for display only." },
          working_directory: { type: "string", description: "Directory to run the command in, relative to workspace root." },
          block_until_ms: { type: "integer", description: "Max wait time in ms. Default 30000. Use 0 for background mode.", default: 30000 },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remote_shell",
      description: "Execute a command on a remote machine via SSH.",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "Target remote machine alias (configured in coder config)." },
          command: { type: "string", description: "The shell command to execute on the remote machine." },
          description: { type: "string", description: "Short human-readable description." },
          block_until_ms: { type: "integer", description: "Max wait time in ms.", default: 30000 },
        },
        required: ["target", "command"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "await",
      description: "Poll a background shell started with shell(block_until_ms=0) until it completes or times out.",
      parameters: {
        type: "object",
        properties: {
          shell_id: { type: "string", description: "The shell_id returned from a background shell invocation." },
          block_until_ms: { type: "integer", description: "Max wait time in ms before returning current output.", default: 30000 },
        },
        required: ["shell_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_shells",
      description: "List background shell processes started by the agent.",
      parameters: {
        type: "object",
        properties: {
          status_filter: { type: "string", description: 'Filter by status. Default "running". Use "all" to include completed and failed shells.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "kill_shell",
      description: "Kill a running background shell process by shell_id.",
      parameters: {
        type: "object",
        properties: {
          shell_id: { type: "string", description: "The shell_id to terminate." },
        },
        required: ["shell_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_shell_logs",
      description: "Read logs from a shell process in batches.",
      parameters: {
        type: "object",
        properties: {
          shell_id: { type: "string", description: "The shell_id to read logs from." },
          stream: { type: "string", enum: ["stdout", "stderr"], default: "stdout" },
          offset: { type: "integer", description: "Byte offset to start reading from.", default: 0 },
          limit: { type: "integer", description: "Maximum bytes to return.", default: 4096 },
        },
        required: ["shell_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for real-time information outside training data.",
      parameters: {
        type: "object",
        properties: {
          search_term: { type: "string", description: "The search term to look up on the web." },
          max_results: { type: "integer", description: "Maximum number of search results to return.", default: 5 },
          explanation: { type: "string", description: "One sentence explanation of why this search is being used." },
        },
        required: ["search_term"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browse_page",
      description: "Fetch a public web page and return readable Markdown content.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to fetch. Must be http or https." },
          max_lines: { type: "integer", description: "Maximum number of lines to return.", default: 500 },
          start_line: { type: "integer", description: "First line to read (1-based).", default: 1 },
          explanation: { type: "string", description: "One sentence explanation of why this page is being fetched." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_skills",
      description: "List available user skills.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_skill",
      description: "Load the full instructions for an enabled skill by slug.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Skill slug from list_skills." },
        },
        required: ["slug"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_skill",
      description: "Create a custom user skill with instructions the agent can follow later.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Unique identifier. Lowercase letters, numbers, and hyphens only." },
          name: { type: "string", description: "Short display name." },
          description: { type: "string", description: "When to use this skill." },
          content: { type: "string", description: "Full skill instructions." },
        },
        required: ["slug", "name", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_skill",
      description: "Update an existing user skill by slug.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Slug of the existing user skill to update." },
          name: { type: "string", description: "New short display name." },
          description: { type: "string", description: "New description." },
          content: { type: "string", description: "New full skill instructions." },
        },
        required: ["slug"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todo_read",
      description: "Read the current structured todo list for the session.",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Optional session ID." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todo_write",
      description: "Create and update a structured todo list for the session.",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                content: { type: "string" },
                status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"] },
              },
              required: ["id", "content", "status"],
            },
          },
          session_id: { type: "string", description: "Optional session ID." },
        },
        required: ["todos"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_workspace_tree",
      description: "Display the workspace directory tree structure with depth recursion.",
      parameters: {
        type: "object",
        properties: {
          max_lines: { type: "integer", description: "Maximum number of lines to return.", default: 500 },
          start_line: { type: "integer", description: "First line to return (1-based).", default: 1 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email notification. Configure SMTP settings to enable actual delivery.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address." },
          subject: { type: "string", description: "Email subject." },
          body: { type: "string", description: "Email body content." },
        },
        required: ["to", "subject", "body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spawn_subagent",
      description: "Spawn a sub-agent to complete an independent sub-task.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The task description for the sub-agent." },
          context: { type: "string", description: "Optional additional context or constraints." },
          tools: { type: "array", items: { type: "string" }, description: "Optional whitelist of tool names." },
        },
        required: ["task"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_question",
      description: "Ask the user a question when you need additional information to proceed.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question to ask the user." },
        },
        required: ["question"],
        additionalProperties: false,
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Handler map
// ---------------------------------------------------------------------------

const HANDLER_MAP: Record<string, ToolHandler> = {
  list_dir: listDirHandler,
  read_file: readFileHandler,
  write_file: writeFileHandler,
  replace_file: replaceFileHandler,
  edit_file: editFileHandler,
  replace_lines: replaceLinesHandler,
  glob: globHandler,
  grep: grepHandler,
  shell: shellHandler,
  remote_shell: remoteShellHandler,
  await: awaitShellHandler,
  list_shells: listShellsHandler,
  kill_shell: killShellHandler,
  read_shell_logs: readShellLogsHandler,
  web_search: webSearchHandler,
  browse_page: browsePageHandler,
  list_skills: listSkillsHandler,
  read_skill: readSkillHandler,
  create_skill: createSkillHandler,
  update_skill: updateSkillHandler,
  todo_read: todoReadHandler,
  todo_write: todoWriteHandler,
  get_workspace_tree: getWorkspaceTreeHandler,
  send_email: sendEmailHandler,
  spawn_subagent: spawnSubAgentHandler,
  ask_question: askQuestionHandler,
  plan_create: planCreateHandler,
  plan_read: planReadHandler,
  plan_update: planUpdateHandler,
  plan_edit: planEditHandler,
  plan_delete: planDeleteHandler,
  plan_list: planListHandler,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getToolDefinitions(): ToolDefinition[] {
  return AGENT_TOOL_DEFINITIONS;
}

export function getToolHandler(name: string): ToolHandler | undefined {
  return HANDLER_MAP[name];
}

export async function executeToolCall(
  name: string,
  rawArguments: string,
  context: ToolExecutionContext,
): Promise<ToolResultEnvelope> {
  const handler = getToolHandler(name);
  if (!handler) {
    return {
      ok: false,
      tool: name,
      error: {
        code: "unknown_tool",
        message: `Unknown tool: ${name}`,
      },
    };
  }

  let parsedArgs: unknown;
  try {
    parsedArgs = rawArguments.trim() ? JSON.parse(rawArguments) : {};
  } catch {
    return {
      ok: false,
      tool: name,
      error: {
        code: "invalid_arguments",
        message: "Tool arguments must be valid JSON",
      },
    };
  }

  return handler(parsedArgs, context);
}
