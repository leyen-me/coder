import { createInterface } from "node:readline";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

export const askQuestionHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as { question: string };

  if (!args.question?.trim()) {
    return toolFailure("ask_question", "invalid_arguments", "question is required");
  }

  // In non-interactive mode, return a placeholder
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  const answer = await new Promise<string>((resolve) => {
    process.stderr.write(`\n\x1b[33m❓ ${args.question}\x1b[0m\n> `);
    rl.once("line", (line) => {
      resolve(line.trim());
    });
  });

  rl.close();

  if (!answer) {
    return toolFailure("ask_question", "no_answer", "User did not provide an answer");
  }

  return toolSuccess("ask_question", {
    question: args.question,
    answer,
  });
};
