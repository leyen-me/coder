/**
 * Syncs SYSTEM_SKILLS from the frontend registry into the Rust prompt asset.
 * Run: npx tsx scripts/export-system-skills.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SYSTEM_SKILLS } from "../frontend/src/features/skills/system/registry.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = join(
  scriptDir,
  "../backend/src/agent/prompt/assets/system_skills.json",
);

const payload = SYSTEM_SKILLS.map((skill) => ({
  id: skill.id,
  slug: skill.slug,
  name: skill.name,
  description: skill.description,
  content: skill.content,
  defaultEnabled: skill.defaultEnabled,
  category: skill.category,
}));

writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${payload.length} system skills to ${outputPath}`);
