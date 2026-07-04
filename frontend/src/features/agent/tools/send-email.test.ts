import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({
  apiPost: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  getKVStore: vi.fn(),
}));

import { apiPost } from "@/lib/api/client";
import { getKVStore } from "@/lib/storage";
import { SEND_EMAIL_TOOL_NAME } from "./definitions";
import { sendEmailHandler } from "./send-email";
import { toolFailure, toolSuccess } from "./result";

const emailSettings = {
  provider: "custom",
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  username: "user@example.com",
  password: "secret",
  fromAddress: "user@example.com",
  useTls: true,
};

describe("sendEmailHandler", () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    vi.mocked(getKVStore).mockReturnValue({
      getItem: vi.fn(() => JSON.stringify(emailSettings)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      keys: vi.fn(() => []),
    });
  });

  it("posts a flat payload matching SendEmailParams", async () => {
    vi.mocked(apiPost).mockResolvedValue("Email sent");

    const result = await sendEmailHandler(
      {
        to: "recipient@example.com",
        subject: "Hello",
        body: "Test message",
      },
      { workspaceDir: "/workspace" },
    );

    expect(apiPost).toHaveBeenCalledWith("/api/send_email", {
      settings: {
        smtpHost: emailSettings.smtpHost,
        smtpPort: emailSettings.smtpPort,
        username: emailSettings.username,
        password: emailSettings.password,
        fromAddress: emailSettings.fromAddress,
        useTls: emailSettings.useTls,
      },
      to: "recipient@example.com",
      subject: "Hello",
      body: "Test message",
    });
    expect(result).toEqual(
      toolSuccess(SEND_EMAIL_TOOL_NAME, { message: "Email sent" }),
    );
  });

  it("returns not_configured when email settings are missing", async () => {
    vi.mocked(getKVStore).mockReturnValue({
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      keys: vi.fn(() => []),
    });

    const result = await sendEmailHandler(
      { to: "a@b.com", subject: "S", body: "B" },
      { workspaceDir: "/workspace" },
    );

    expect(result).toEqual(
      toolFailure(
        SEND_EMAIL_TOOL_NAME,
        "not_configured",
        "Email settings not configured. Go to Settings > Email to set up your email account.",
      ),
    );
    expect(apiPost).not.toHaveBeenCalled();
  });
});
