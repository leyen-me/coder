import type { SystemSkillDefinition } from "../types";

const TOOLS_CONTENT = `# Tools

You can call tools when you need local filesystem, shell, or web information.
Use glob to find files by name pattern and grep to search file contents.
Use shell to run CLI commands (builds, tests, git). Commands run non-interactively.
For long-running commands (dev servers, watch mode), use shell with block_until_ms=0, then await with the returned shell_id.
Use web_search for real-time information outside training data, such as news, version numbers, or current events.
Use browse_page to read the full content of a specific URL, especially after web_search returns promising links.
browse_page does not render JavaScript-heavy pages. Prefer quoting tool output instead of inventing details.
Use list_skills to browse user-enabled skills (slug, name, description).
Use read_skill with a slug to load full skill instructions before following them.
Use create_skill when the user asks you to save reusable instructions as a custom skill.
Paths are resolved relative to workspaceDir unless noted otherwise.
When a tool fails, read the error code and message, then adjust your approach.
Prefer tools over guessing file, directory, or web page contents.
`;

const CODE_REVIEW_CONTENT = `# Code Review

When reviewing code:

1. Check correctness and edge cases
2. Verify security (injection, XSS, secrets in code)
3. Assess readability and maintainability
4. Ensure error handling is appropriate
5. Confirm tests cover meaningful behavior

Format feedback as:
- **Critical**: Must fix before merge
- **Suggestion**: Consider improving
- **Nice to have**: Optional enhancement
`;

const COMMIT_HELPER_CONTENT = `# Commit Message Helper

Generate commit messages from staged changes:

1. Run \`git diff\` and \`git status\` to understand changes
2. Focus on **why**, not just what changed
3. Use conventional format:

\`\`\`
type(scope): short summary

Optional body explaining motivation and impact
\`\`\`

Types: feat, fix, refactor, docs, test, chore, perf, ci

Keep the subject line under 72 characters.
`;

export const SYSTEM_SKILLS: SystemSkillDefinition[] = [
  {
    id: "tools",
    slug: "tools",
    name: "Tools",
    description:
      "How to use filesystem, shell, web, and skill tools available to the agent.",
    content: TOOLS_CONTENT,
    defaultEnabled: true,
    category: "core",
  },
  {
    id: "code-review",
    slug: "code-review",
    name: "Code Review",
    description:
      "Review code for quality, security, and maintainability following structured feedback format.",
    content: CODE_REVIEW_CONTENT,
    defaultEnabled: true,
    category: "development",
  },
  {
    id: "commit-helper",
    slug: "commit-helper",
    name: "Commit Helper",
    description:
      "Generate conventional commit messages by analyzing git diffs and staged changes.",
    content: COMMIT_HELPER_CONTENT,
    defaultEnabled: true,
    category: "development",
  },
];

const slugSet = new Set<string>();

for (const skill of SYSTEM_SKILLS) {
  if (slugSet.has(skill.slug)) {
    throw new Error(`Duplicate system skill slug: ${skill.slug}`);
  }
  slugSet.add(skill.slug);
}

export function getSystemSkillBySlug(
  slug: string
): SystemSkillDefinition | null {
  return SYSTEM_SKILLS.find((skill) => skill.slug === slug) ?? null;
}

export function getSystemSkillById(id: string): SystemSkillDefinition | null {
  return SYSTEM_SKILLS.find((skill) => skill.id === id) ?? null;
}

export function getAllSystemSkillSlugs(): Set<string> {
  return new Set(SYSTEM_SKILLS.map((skill) => skill.slug));
}
