import type { SystemSkillDefinition } from "../../types";
import { createSystemSkill } from "./helpers";

const CODE_NAVIGATION_CONTENT = `# Code Navigation

Prefer direct signals over dependency wandering.

### Default flow

\`\`\`text
search -> inspect -> modify
\`\`\`

Avoid manually tracing long chains from entry point to imports unless direct search is insufficient.

### Search signals

Search for the most unique signal the target code would contain:

- function or method names: \`calculateTotal\`, \`handleSubmit\`
- constants or variables: \`MAX_RETRY_COUNT\`, \`workspaceName\`
- route strings: \`"/api/users"\`, \`"/login"\`
- framework annotations: \`@RestController\`, \`@Service\`
- trait, interface, or class names: \`UserRepository\`, \`impl Iterator\`
- test descriptions: \`"should return 401"\`, \`testShould\`
- config keys: \`database.url\`, \`logging.level\`
- model, table, or schema names: \`users\`, \`class User\`
- exact error messages from logs, tests, or users

### Reading discipline

- Read only files needed to understand or modify the target behavior.
- Prefer narrow reads around relevant code when files are large.
- Expand outward only when the local context is insufficient.
`;

const CODE_MODIFICATION_CONTENT = `# Code Modification

Make changes as a maintainer, not as a patch generator.

### Before editing

1. Locate the relevant implementation.
2. Understand surrounding context.
3. Identify the smallest change that solves the requested problem.

### Editing rules

- Prefer minimal, targeted changes.
- Follow existing naming, architecture, formatting, testing, and error-handling patterns.
- Do not rewrite working code unnecessarily.
- Do not change unrelated behavior.
- Do not introduce style-only edits unless requested.
- Do not remove functionality without a clear reason.
- Do not overwrite user changes. If the working tree is dirty, work with existing changes instead of reverting them.
- Use structured APIs or parsers for structured data when available.

### High-risk areas

Be extra careful with authentication, authorization, persistence, migrations, production configuration, secrets, and destructive operations.
`;

export const DEVELOPMENT_SYSTEM_SKILLS: SystemSkillDefinition[] = [
  createSystemSkill({
    id: "code-navigation",
    slug: "code-navigation",
    name: "Code Navigation",
    description:
      "Search-first navigation rules for locating relevant code without wasting context.",
    content: CODE_NAVIGATION_CONTENT,
    defaultEnabled: true,
    category: "development",
  }),
  createSystemSkill({
    id: "code-modification",
    slug: "code-modification",
    name: "Code Modification",
    description:
      "Rules for making minimal, maintainable, and project-consistent code changes.",
    content: CODE_MODIFICATION_CONTENT,
    defaultEnabled: true,
    category: "development",
  }),
];
