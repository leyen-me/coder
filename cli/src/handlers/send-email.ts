import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

type SendEmailArgs = {
  to: string;
  subject: string;
  body: string;
};

export const sendEmailHandler: ToolHandler = async (rawArgs, _context) => {
  const args = rawArgs as SendEmailArgs;

  if (!args.to?.trim() || !args.subject?.trim() || !args.body?.trim()) {
    return toolFailure("send_email", "invalid_arguments", "to, subject, and body are required");
  }

  // For CLI, we log the email instead of actually sending (requires SMTP config)
  // In a real setup, you'd integrate with nodemailer or an API
  process.stderr.write(
    `\n\x1b[34m📧 Email would be sent:\x1b[0m\n` +
    `  To: ${args.to}\n` +
    `  Subject: ${args.subject}\n` +
    `  Body: ${args.body.slice(0, 200)}${args.body.length > 200 ? "..." : ""}\n\n`,
  );

  return toolSuccess("send_email", {
    to: args.to,
    subject: args.subject,
    sent: true,
    note: "Email logged to console. Configure SMTP to send actual emails.",
  });
};
