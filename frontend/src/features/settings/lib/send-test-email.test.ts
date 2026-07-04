import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { sendTestEmail } from "./send-test-email";

const settings = {
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  username: "user@example.com",
  password: "secret",
  fromAddress: "sender@example.com",
  useTls: true,
};

describe("sendTestEmail", () => {
  it("posts a flat payload to send_email with the configured recipient", async () => {
    vi.mocked(apiPost).mockResolvedValue("Email sent");

    await expect(
      sendTestEmail(settings, "Test subject", "Test body"),
    ).resolves.toBe("Email sent");

    expect(apiPost).toHaveBeenCalledWith("/api/send_email", {
      settings: {
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        username: settings.username,
        password: settings.password,
        fromAddress: settings.fromAddress,
        useTls: settings.useTls,
      },
      to: "sender@example.com",
      subject: "Test subject",
      body: "Test body",
    });
  });

  it("falls back to username when fromAddress is empty", async () => {
    vi.mocked(apiPost).mockResolvedValue("Email sent");

    await sendTestEmail(
      { ...settings, fromAddress: "" },
      "Test subject",
      "Test body",
    );

    expect(apiPost).toHaveBeenCalledWith(
      "/api/send_email",
      expect.objectContaining({
        to: "user@example.com",
        settings: expect.objectContaining({
          fromAddress: "user@example.com",
        }),
      }),
    );
  });
});
