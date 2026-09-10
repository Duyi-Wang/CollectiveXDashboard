import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LANGUAGE_STORAGE_KEY,
  readLanguage,
  translate,
  translateMessage,
} from "../src/i18n";
import { OFFICIAL_CORS_HELP } from "../src/sources";

afterEach(() => vi.unstubAllGlobals());

describe("language preference and presentation", () => {
  it("defaults to English even with unavailable or invalid storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    expect(readLanguage()).toBe("en");
    vi.stubGlobal("localStorage", { getItem: () => "fr" });
    expect(readLanguage()).toBe("en");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readLanguage()).toBe("en");
  });
  it("restores an explicit Chinese preference from its own key", () => {
    const getItem = vi.fn(() => "zh");
    vi.stubGlobal("localStorage", { getItem });
    expect(readLanguage()).toBe("zh");
    expect(getItem).toHaveBeenCalledWith(LANGUAGE_STORAGE_KEY);
  });
  it("interpolates messages without translating source identifiers", () => {
    expect(
      translate("显示 {origin} {run}", "en", {
        origin: "Local files",
        run: "34432070017",
      }),
    ).toBe("Show Local files 34432070017");
    expect(
      translateMessage("训练.csv: 第 7 行不是有效 JSON，已跳过。", "en"),
    ).toBe("训练.csv: line 7 is not valid JSON; skipped.");
    expect(translateMessage("自定义 backend 原始说明", "en")).toBe(
      "自定义 backend 原始说明",
    );
  });
  it("can switch a stored progress message in either direction", () => {
    const zh = "已导入 6 组数据 · 2 条格式提示（已显示在主界面）";
    const en = "Imported 6 datasets · 2 format notes (shown in the workspace)";
    expect(translateMessage(zh, "en")).toBe(en);
    expect(translateMessage(en, "zh")).toBe(zh);
    expect(translateMessage("读取 artifact 2/3 · 训练.zip", "en")).toBe(
      "Reading artifact 2/3 · 训练.zip",
    );
  });
  it("localizes application errors while preserving upstream error detail", () => {
    expect(translateMessage(OFFICIAL_CORS_HELP, "en")).toContain(
      "Enable a CORS browser extension",
    );
    expect(
      translateMessage(
        "HTTP 401：认证失败，请检查 GitHub token。 服务器 detail",
        "en",
      ),
    ).toBe(
      "HTTP 401: Authentication failed. Check your GitHub token. 服务器 detail",
    );
    expect(
      translateMessage(
        "结果.zip: ZIP 读取失败：解压数据超过 250 MiB 限制",
        "en",
      ),
    ).toBe(
      "结果.zip: ZIP read failed: Decompressed data exceeds the 250 MiB limit",
    );
  });
});
