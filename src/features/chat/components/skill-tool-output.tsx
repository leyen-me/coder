"use client";

import { useMemo } from "react";

import { CodeBlock } from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";

import {
  CREATE_SKILL_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  READ_SKILL_TOOL_NAME,
  UPDATE_SKILL_TOOL_NAME,
} from "@/features/agent/tools/definitions";
import {
  extractListSkillsData,
  extractSkillCreateData,
  extractSkillReadData,
  extractSkillUpdateData,
} from "@/features/agent/tools/skill-display";
import type { ToolUIPart } from "ai";
import {
  BookIcon,
  CheckCircle2Icon,
  CircleIcon,
  InfoIcon,
  LoaderCircleIcon,
  PenIcon,
  PlusCircleIcon,
  XCircleIcon,
} from "lucide-react";

type SkillToolOutputProps = {
  output: unknown;
  toolName: string;
  state: ToolUIPart["state"];
  errorText?: string;
  className?: string;
};

export function SkillToolOutput({
  output,
  toolName,
  state,
  errorText,
  className,
}: SkillToolOutputProps) {
  switch (toolName) {
    case LIST_SKILLS_TOOL_NAME:
      return (
        <ListSkillsView
          className={className}
          errorText={errorText}
          output={output}
          state={state}
        />
      );

    case READ_SKILL_TOOL_NAME:
      return (
        <ReadSkillView
          className={className}
          errorText={errorText}
          output={output}
          state={state}
        />
      );

    case CREATE_SKILL_TOOL_NAME:
      return (
        <CreateSkillView
          className={className}
          errorText={errorText}
          output={output}
          state={state}
        />
      );

    case UPDATE_SKILL_TOOL_NAME:
      return (
        <UpdateSkillView
          className={className}
          errorText={errorText}
          output={output}
          state={state}
        />
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// ListSkills
// ---------------------------------------------------------------------------

function ListSkillsView({
  className,
  output,
  state,
  errorText,
}: {
  className?: string;
  output: unknown;
  state: ToolUIPart["state"];
  errorText?: string;
}) {
  const data = useMemo(() => extractListSkillsData(output), [output]);

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs">
        <ToolStatusIcon state={state} />
        <span className="font-mono font-medium text-foreground">
          {LIST_SKILLS_TOOL_NAME}
        </span>
        {data ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground">
              {data.skills.length} skill{data.skills.length !== 1 ? "s" : ""}
            </span>
          </>
        ) : null}
      </div>

      {errorText ? (
        <div className="bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {errorText}
        </div>
      ) : null}

      {data && data.skills.length > 0 ? (
        <div className="divide-y">
          {data.skills.map((skill) => (
            <div
              key={skill.slug}
              className="flex items-start gap-3 px-3 py-2"
            >
              <BookIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium text-foreground">
                    {skill.name}
                  </span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {skill.slug}
                  </span>
                  <span className="rounded-full bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {skill.source}
                  </span>
                </div>
                {skill.description ? (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {skill.description}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : data && data.skills.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          No skills available.
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReadSkill
// ---------------------------------------------------------------------------

function ReadSkillView({
  className,
  output,
  state,
  errorText,
}: {
  className?: string;
  output: unknown;
  state: ToolUIPart["state"];
  errorText?: string;
}) {
  const data = useMemo(() => extractSkillReadData(output), [output]);

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs">
        <ToolStatusIcon state={state} />
        <span className="font-mono font-medium text-foreground">
          {READ_SKILL_TOOL_NAME}
        </span>
        {data ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground">{data.slug}</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {data.source}
            </span>
            <span className="ml-auto font-mono text-muted-foreground">
              {data.content.length.toLocaleString()} chars
            </span>
          </>
        ) : null}
      </div>

      {errorText ? (
        <div className="bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {errorText}
        </div>
      ) : null}

      {data ? (
        <div className="space-y-3 p-3">
          {data.description ? (
            <div>
              <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Description
              </h4>
              <p className="text-xs text-foreground">{data.description}</p>
            </div>
          ) : null}

          <div>
            <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Content
            </h4>
            <CodeBlock code={data.content} language="markdown" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateSkill
// ---------------------------------------------------------------------------

function CreateSkillView({
  className,
  output,
  state,
  errorText,
}: {
  className?: string;
  output: unknown;
  state: ToolUIPart["state"];
  errorText?: string;
}) {
  const data = useMemo(() => extractSkillCreateData(output), [output]);

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs">
        <ToolStatusIcon state={state} />
        <PlusCircleIcon className="size-3.5 shrink-0 text-green-600" />
        <span className="font-mono font-medium text-foreground">
          {CREATE_SKILL_TOOL_NAME}
        </span>
        {data ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono font-medium text-foreground">
              {data.name}
            </span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {data.slug}
            </span>
          </>
        ) : null}
      </div>

      {errorText ? (
        <div className="bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {errorText}
        </div>
      ) : null}

      {data ? (
        <div className="space-y-2 p-3">
          {data.description ? (
            <p className="text-xs text-muted-foreground">{data.description}</p>
          ) : null}

          {data.enabled === false ? (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {data.hint ??
                  "Skill was created disabled. Ask the user to enable it on the Skills page."}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UpdateSkill
// ---------------------------------------------------------------------------

function UpdateSkillView({
  className,
  output,
  state,
  errorText,
}: {
  className?: string;
  output: unknown;
  state: ToolUIPart["state"];
  errorText?: string;
}) {
  const data = useMemo(() => extractSkillUpdateData(output), [output]);

  return (
    <div className={cn("w-full overflow-hidden rounded-md border", className)}>
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs">
        <ToolStatusIcon state={state} />
        <PenIcon className="size-3.5 shrink-0 text-blue-600" />
        <span className="font-mono font-medium text-foreground">
          {UPDATE_SKILL_TOOL_NAME}
        </span>
        {data ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-foreground">{data.name}</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {data.slug}
            </span>
          </>
        ) : null}
      </div>

      {errorText ? (
        <div className="bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {errorText}
        </div>
      ) : null}

      {data ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          Skill updated successfully.
          {data.enabled ? " (enabled)" : " (disabled)"}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function ToolStatusIcon({ state }: { state: ToolUIPart["state"] }) {
  switch (state) {
    case "output-available":
      return <CheckCircle2Icon className="size-3.5 shrink-0 text-green-600" />;
    case "output-error":
      return <XCircleIcon className="size-3.5 shrink-0 text-destructive" />;
    case "input-streaming":
    case "input-available":
      return (
        <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      );
    default:
      return <CircleIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
}
