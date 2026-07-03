
import { apiPost } from "@/lib/api/client";
import { getKVStore } from "@/lib/storage";
import { SEND_EMAIL_TOOL_NAME } from "./definitions";
import { toolFailure, toolSuccess } from "./result";
import type { ToolHandler } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const EMAIL_SETTINGS_KEY = "coder:email-settings";

type EmailSettings = {
  provider: string;
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  fromAddress: string;
  useTls: boolean;
};

type SendEmailArgs = {
  to: string;
  subject: string;
  body: string;
};

function readEmailSettings(): EmailSettings | null {
  try {
    const raw = getKVStore().getItem(EMAIL_SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EmailSettings;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const sendEmailHandler: ToolHandler = async (rawArgs) => {


  const args = parseSendEmailArgs(rawArgs);
  if (!args.ok) {
    return toolFailure(SEND_EMAIL_TOOL_NAME, "invalid_arguments", args.message);
  }

  const settings = readEmailSettings();
  if (!settings) {
    return toolFailure(
      SEND_EMAIL_TOOL_NAME,
      "not_configured",
      "Email settings not configured. Go to Settings > Email to set up your email account."
    );
  }

  if (!settings.smtpHost || !settings.username || !settings.password) {
    return toolFailure(
      SEND_EMAIL_TOOL_NAME,
      "not_configured",
      "Email settings are incomplete. Please configure SMTP host, username, and authorization code in Settings > Email."
    );
  }

  try {
    const result = await apiPost<string>("/api/send_email", {
      request: {
        settings: {
          smtpHost: settings.smtpHost,
          smtpPort: settings.smtpPort,
          username: settings.username,
          password: settings.password,
          fromAddress: settings.fromAddress,
          useTls: settings.useTls,
        },
        to: args.value.to,
        subject: args.value.subject,
        body: args.value.body,
      },
    });

    return toolSuccess(SEND_EMAIL_TOOL_NAME, { message: result });
  } catch (err) {
    const message = typeof err === "string" ? err : String(err);
    return toolFailure(SEND_EMAIL_TOOL_NAME, "send_failed", `Failed to send email: ${message}`);
  }
};

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseSendEmailArgs(
  rawArgs: unknown
): { ok: true; value: SendEmailArgs } | { ok: false; message: string } {
  if (typeof rawArgs !== "object" || rawArgs === null) {
    return { ok: false, message: "Arguments must be an object" };
  }

  const args = rawArgs as Record<string, unknown>;

  if (typeof args.to !== "string" || args.to.trim() === "") {
    return { ok: false, message: '"to" must be a non-empty string (recipient email address)' };
  }

  if (typeof args.subject !== "string" || args.subject.trim() === "") {
    return { ok: false, message: '"subject" must be a non-empty string' };
  }

  if (typeof args.body !== "string") {
    return { ok: false, message: '"body" must be a string' };
  }

  return {
    ok: true,
    value: {
      to: args.to.trim(),
      subject: args.subject.trim(),
      body: args.body,
    },
  };
}
