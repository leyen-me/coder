import { describe, expect, it } from "vitest";

import { createTranslator } from "./create-translator";
import { zhMessages } from "./messages/zh";

describe("createTranslator", () => {
  const t = createTranslator(zhMessages);

  it("resolves nested message keys", () => {
    expect(t("settings.title")).toBe("设置");
    expect(t("sidebar.newChat")).toBe("新建聊天");
  });

  it("interpolates template parameters", () => {
    expect(t("chat.headline", { project: "coder" })).toBe(
      "想在 coder 里构建什么？"
    );
  });
});
