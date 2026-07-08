import { getSession } from "@/lib/db";

import {
  buildToolArchiveFilePath,
  readToolArchiveIndex,
  readWorkspaceTextFile,
} from "../handoff-workspace";
import { READ_PRIOR_TOOL_OUTPUT_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { PriorToolOutputData, ToolHandler } from "./types";

type ReadPriorToolOutputArgs = {
  session_id: string;
  tool_name?: string;
  path_pattern?: string;
};

export const readPriorToolOutputHandler: ToolHandler = async (rawArgs) => {
  const args = parseArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(
      READ_PRIOR_TOOL_OUTPUT_TOOL_NAME,
      "invalid_arguments",
      args.message
    );
  }

  const session = await getSession(args.value.session_id);
  const workspaceDir = session?.workspaceDir?.trim() || null;
  if (!workspaceDir) {
    return toolFailure(
      READ_PRIOR_TOOL_OUTPUT_TOOL_NAME,
      "workspace_required",
      "The source session does not have a workspace directory."
    );
  }

  const index = await readToolArchiveIndex(workspaceDir, args.value.session_id);
  if (!index || index.entries.length === 0) {
    return toolFailure(
      READ_PRIOR_TOOL_OUTPUT_TOOL_NAME,
      "not_found",
      "No archived tool output was found for that session."
    );
  }

  const candidate = [...index.entries]
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((entry) => {
      if (args.value.tool_name && entry.toolName !== args.value.tool_name) {
        return false;
      }
      if (!args.value.path_pattern) {
        return true;
      }
      const haystacks = [entry.relativeTargetPath, entry.queryPattern, entry.archivePath]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.toLowerCase());
      return haystacks.some((value) =>
        value.includes(args.value.path_pattern!.toLowerCase())
      );
    });

  if (!candidate) {
    return toolFailure(
      READ_PRIOR_TOOL_OUTPUT_TOOL_NAME,
      "not_found",
      "No archived tool output matched the requested filters."
    );
  }

  const archivePath =
    candidate.outputPath ??
    buildToolArchiveFilePath(
      args.value.session_id,
      candidate.messageId,
      { id: candidate.invocationId, name: candidate.toolName }
    );
  const content = await readWorkspaceTextFile(workspaceDir, archivePath);
  if (!content) {
    return toolFailure(
      READ_PRIOR_TOOL_OUTPUT_TOOL_NAME,
      "not_found",
      "The archived tool output file could not be read."
    );
  }

  const data: PriorToolOutputData = {
    sessionId: args.value.session_id,
    toolName: candidate.toolName,
    archivePath: candidate.archivePath,
    outputPath: candidate.outputPath,
    content: content.content,
  };

  return toolSuccess(READ_PRIOR_TOOL_OUTPUT_TOOL_NAME, data);
};

function parseArgs(
  rawArgs: unknown
): { ok: true; value: ReadPriorToolOutputArgs } | { ok: false; message: string } {
  if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
    return { ok: false, message: "Arguments must be an object" };
  }

  const sessionId = (rawArgs as Record<string, unknown>).session_id;
  const toolName = (rawArgs as Record<string, unknown>).tool_name;
  const pathPattern = (rawArgs as Record<string, unknown>).path_pattern;

  if (typeof sessionId !== "string" || !sessionId.trim()) {
    return { ok: false, message: "session_id is required" };
  }
  if (toolName !== undefined && typeof toolName !== "string") {
    return { ok: false, message: "tool_name must be a string" };
  }
  if (pathPattern !== undefined && typeof pathPattern !== "string") {
    return { ok: false, message: "path_pattern must be a string" };
  }

  return {
    ok: true,
    value: {
      session_id: sessionId.trim(),
      tool_name: typeof toolName === "string" ? toolName.trim() : undefined,
      path_pattern:
        typeof pathPattern === "string" ? pathPattern.trim() : undefined,
    },
  };
}
