import { SEND_EMAIL_TOOL_NAME } from "./definitions";

// ---------------------------------------------------------------------------
// SendEmail display
// ---------------------------------------------------------------------------

export type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
};

export type SendEmailOutput = {
  message: string;
};

export function getSendEmailChipLabel(
  toolName: string,
  input: unknown,
  output: unknown,
): string | null {
  if (toolName !== SEND_EMAIL_TOOL_NAME) {
    return null;
  }

  const inputRecord = asRecord(input);
  const to =
    typeof inputRecord?.to === "string" ? inputRecord.to.trim() : "";

  const data = extractSendEmailData(output);
  const statusSuffix = data ? " ✓" : "";

  if (to) {
    const preview = to.length > 30 ? `${to.slice(0, 30)}…` : to;
    return `send_email: ${preview}${statusSuffix}`;
  }

  return `send_email${statusSuffix}`;
}

export function getSendEmailInputData(
  input: unknown,
): SendEmailInput | null {
  const record = asRecord(input);
  if (!record) {
    return null;
  }

  const to = record.to;
  const subject = record.subject;
  if (typeof to !== "string" || typeof subject !== "string") {
    return null;
  }

  return {
    to,
    subject,
    body: typeof record.body === "string" ? record.body : "",
  };
}

export function extractSendEmailData(output: unknown): SendEmailOutput | null {
  const envelope = asRecord(output);
  if (!envelope || envelope.ok !== true) {
    return null;
  }

  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.message !== "string") {
    return null;
  }

  return { message: record.message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
