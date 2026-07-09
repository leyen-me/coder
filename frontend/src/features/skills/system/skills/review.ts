import type { SystemModuleDefinition } from "../../types";
import { createSystemModule } from "./helpers";

const CODE_REVIEW_CONTENT = `# Code Review Workflow

Use this workflow when reviewing code rather than implementing changes.

### Review focus

1. Correctness and edge cases.
2. Security issues such as injection, XSS, authorization gaps, and leaked secrets.
3. Behavioral regressions.
4. Error handling and failure modes.
5. Test coverage for meaningful behavior.
6. Readability and maintainability when it affects future correctness.

### Feedback format

- Lead with findings, ordered by severity.
- Cite the specific file or symbol involved.
- Explain the impact, not just the preference.
- Keep summaries brief and secondary.
- If there are no findings, say that clearly and list any verification gaps.
`;

export const REVIEW_SYSTEM_MODULES: SystemModuleDefinition[] = [
  createSystemModule({
    id: "code-review",
    slug: "code-review",
    name: "Code Review Workflow",
    description:
      "Specialized workflow for reviewing code for correctness, security, regressions, and tests.",
    content: CODE_REVIEW_CONTENT,
    category: "review",
  }),
];
