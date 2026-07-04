import { apiPost } from "@/lib/api/client";

export type EmailSettingsPayload = {
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  fromAddress: string;
  useTls: boolean;
};

export async function sendTestEmail(
  settings: EmailSettingsPayload,
  subject: string,
  body: string,
): Promise<string> {
  const to = settings.fromAddress.trim() || settings.username.trim();

  return apiPost<string>("/api/send_email", {
    settings: {
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort,
      username: settings.username,
      password: settings.password,
      fromAddress: settings.fromAddress || settings.username,
      useTls: settings.useTls,
    },
    to,
    subject,
    body,
  });
}
