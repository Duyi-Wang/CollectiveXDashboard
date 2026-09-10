import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearGitHubToken,
  GITHUB_TOKEN_STORAGE_KEY,
  readGitHubToken,
  saveGitHubToken,
} from "../src/tokenStorage";

afterEach(() => vi.unstubAllGlobals());
function storage() {
  const values = new Map<string, string>([
    ["workspace-marker", "keep"],
    ["collectivex-dashboard:language", "zh"],
  ]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}
describe("opt-in GitHub token storage", () => {
  it("only reads on initialization and restores an existing token", () => {
    const values = storage();
    expect(readGitHubToken()).toEqual({ token: "", available: true });
    expect(values.size).toBe(2);
    values.set(GITHUB_TOKEN_STORAGE_KEY, "  fake-saved-token  ");
    expect(readGitHubToken()).toEqual({
      token: "fake-saved-token",
      available: true,
    });
  });
  it("saves and replaces only the dedicated credential key", () => {
    const values = storage();
    expect(saveGitHubToken(" fake-token-one ")).toBe(true);
    expect(values.get(GITHUB_TOKEN_STORAGE_KEY)).toBe("fake-token-one");
    expect(saveGitHubToken("fake-token-two")).toBe(true);
    expect(values.get(GITHUB_TOKEN_STORAGE_KEY)).toBe("fake-token-two");
    expect(values.get("workspace-marker")).toBe("keep");
    expect(values.get("collectivex-dashboard:language")).toBe("zh");
  });
  it("removes an empty or explicitly cleared token without clearing unrelated data", () => {
    const values = storage();
    saveGitHubToken("fake-token");
    expect(saveGitHubToken("   ")).toBe(true);
    expect(values.has(GITHUB_TOKEN_STORAGE_KEY)).toBe(false);
    saveGitHubToken("fake-token");
    expect(clearGitHubToken()).toBe(true);
    expect([...values]).toEqual([
      ["workspace-marker", "keep"],
      ["collectivex-dashboard:language", "zh"],
    ]);
  });
  it("reports storage failures without leaking error details or claiming success", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("read denied");
      },
      setItem: () => {
        throw new Error("rejected fake-secret-token");
      },
      removeItem: () => {
        throw new Error("remove denied");
      },
    });
    expect(readGitHubToken()).toEqual({ token: "", available: false });
    expect(saveGitHubToken("fake-secret-token")).toBe(false);
    expect(clearGitHubToken()).toBe(false);
  });
});
