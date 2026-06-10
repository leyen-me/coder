import type { SystemSkillDefinition } from "../types";

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

const I18N_GUIDE_CONTENT = `# i18n Guide (Coder)

This project uses typed i18n in \`src/lib/i18n/\`:

1. Add keys to \`message-schema.ts\` first
2. Add English strings in \`messages/en.ts\`
3. Add Chinese strings in \`messages/zh.ts\`
4. Use \`useTranslation()\` or \`useLocale()\` in components
5. Never hardcode user-facing strings in UI code

Run typecheck after adding keys to catch missing translations.
`;

const TAURI_DEV_CONTENT = `# Tauri Development (Coder)

Desktop commands live in \`src-tauri/\`:

1. Add Rust command in \`src-tauri/src/\` and register in \`lib.rs\`
2. Invoke from frontend via \`@tauri-apps/api/core\` \`invoke()\`
3. Guard browser-only code with \`isTauri()\`
4. Run \`pnpm tauri dev\` for local development

Prefer existing tool patterns in \`src-tauri/src/tools/\` when adding agent capabilities.
`;

const SECURITY_REVIEW_CONTENT = `# Security Review

Review changes for:

1. **Secrets**: API keys, tokens, credentials in code or logs
2. **Input validation**: user content, file paths, shell commands
3. **XSS**: unsanitized HTML/markdown rendering
4. **Path traversal**: workspace-relative path resolution
5. **Command injection**: shell tool argument handling

Flag issues with severity and a concrete remediation step.
`;

export const SYSTEM_SKILLS: SystemSkillDefinition[] = [
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
  {
    id: "i18n-guide",
    slug: "i18n-guide",
    name: "i18n Guide",
    description:
      "Follow Coder i18n conventions when adding or updating user-facing strings.",
    content: I18N_GUIDE_CONTENT,
    defaultEnabled: false,
    category: "project",
  },
  {
    id: "tauri-dev",
    slug: "tauri-dev",
    name: "Tauri Development",
    description:
      "Guidance for adding Tauri commands and desktop-only features in Coder.",
    content: TAURI_DEV_CONTENT,
    defaultEnabled: false,
    category: "project",
  },
  {
    id: "security-review",
    slug: "security-review",
    name: "Security Review",
    description:
      "Review changes for secrets, injection, XSS, and path traversal risks.",
    content: SECURITY_REVIEW_CONTENT,
    defaultEnabled: false,
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
