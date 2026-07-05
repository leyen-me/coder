import type { SystemSkillDefinition } from "../../types";
import { createSystemSkill } from "./helpers";

const TASK_PLANNING_CONTENT = `# Task Planning

Use the task-progress list to make meaningful multi-step work legible.
Do not create one for obvious single-path work just to look organized.
Default to no task list unless the work is long enough, risky enough, or multi-phase enough that the user would benefit from explicit tracking.

### Create a task list when

- implementing a feature across exploration, edits, and verification
- debugging with multiple hypotheses
- refactoring or migrating several files or layers
- finishing work with clear phases such as design, implement, test, polish
- running long work where the user may return later

### Skip a task list for

- short answers or explanations
- one-command requests
- a single obvious edit
- a short fix where the next safe step is clear
- pure exploration questions
- trivial follow-ups

When unsure, prefer no list over a noisy one.

### Task design

- Write outcome-oriented tasks: "Add OAuth callback validation", not "Read auth file".
- Keep tasks coarse enough for the user to follow, usually 3-5 items.
- Keep at most one task in progress.
- Mark tasks complete as soon as they are actually complete.
- Update the list when scope changes.
`;

const VERIFICATION_CONTENT = `# Verification

Do not claim success solely because code was changed.

### After changing code

1. Re-read the changed area when practical.
2. Review the diff to confirm only intended changes are included.
3. Before running any verification command, call list_shells first to check whether the user already has a running dev server or relevant process. If one exists, prefer telling the user to reload over starting a new instance. Only run a new verification command when no relevant process is already running.
4. Run the most relevant verification available.
5. Report what was verified and what was not.

### Prefer relevant checks

- TypeScript: \`tsc --noEmit\`, framework type checks, or project scripts.
- Tests: focused tests first, broader suites when risk is high.
- Builds: run when the change can affect packaging, routing, generated output, or runtime wiring.
- Linters: run or inspect diagnostics for changed files.

If verification fails, read the error, fix what is in scope, and rerun the relevant check. If verification cannot be run, state that clearly.
`;

const GIT_WORKFLOW_CONTENT = `# Git Workflow

Git operations must reflect actual repository state.

### Before committing

- Review \`git status\`.
- Review \`git diff\` and \`git diff --staged\` as appropriate.
- Do not assume staged content matches the current task.
- Do not commit secrets or credentials.

### Staging

- Stage only files related to the intended change.
- Avoid \`git add .\` and \`git add -A\` unless the user explicitly wants all changes included.
- Leave unrelated modifications unstaged.

### Commits

- Generate commit messages from staged changes only.
- Use Conventional Commits: \`type(scope): summary\`.
- Keep the subject under 72 characters.
- Keep commits logically coherent.

### Push behavior

- "commit" means commit only.
- "push" means push only.
- "commit and push" means both.
- Never push unless explicitly instructed.
`;

export const WORKFLOW_SYSTEM_SKILLS: SystemSkillDefinition[] = [
  createSystemSkill({
    id: "task-planning",
    slug: "task-planning",
    name: "Task Planning",
    description:
      "When and how to use the session task-progress list for multi-step work.",
    content: TASK_PLANNING_CONTENT,
    defaultEnabled: true,
    category: "workflow",
  }),
  createSystemSkill({
    id: "verification",
    slug: "verification",
    name: "Verification",
    description:
      "How to validate changes before claiming success and how to report unverified work.",
    content: VERIFICATION_CONTENT,
    defaultEnabled: true,
    category: "workflow",
  }),
  createSystemSkill({
    id: "git-workflow",
    slug: "git-workflow",
    name: "Git Workflow",
    description:
      "Safe staging, commit, and push boundaries based on actual git state.",
    content: GIT_WORKFLOW_CONTENT,
    defaultEnabled: true,
    category: "workflow",
  }),
];
