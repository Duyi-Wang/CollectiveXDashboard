import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOfficialRun,
  fetchOfficialRuns,
  loadGitHubRunArtifacts,
  parseGitHubRunUrl,
  selectGitHubArtifacts,
  type GitHubArtifact,
} from "../src/sources";

afterEach(() => vi.unstubAllGlobals());
const artifact = (
  id: number,
  name: string,
  expired = false,
): GitHubArtifact => ({ id, name, expired });

describe("GitHub source identity and reruns", () => {
  it("retains exact run IDs and explicit attempts", () => {
    expect(
      parseGitHubRunUrl(
        "https://github.com/SemiAnalysisAI/InferenceX/actions/runs/999999999999999999/attempts/2?check_suite_focus=true",
      ),
    ).toEqual({
      owner: "SemiAnalysisAI",
      repo: "InferenceX",
      runId: "999999999999999999",
      attempt: 2,
    });
    expect(() =>
      parseGitHubRunUrl("https://github.com.evil.test/o/r/actions/runs/12"),
    ).toThrow();
    expect(() =>
      parseGitHubRunUrl("https://token@github.com/o/r/actions/runs/12"),
    ).toThrow();
  });

  it("keeps previous attempts for cells that were not rerun, superseding duplicate uploads", () => {
    const files = [
      artifact(1, "cxsweep-matrix-12"),
      artifact(2, "cxshard-a-12-1"),
      artifact(3, "cxshard-a-12-2"),
      artifact(4, "cxshard-a-12-2"),
      artifact(5, "cxshard-a-12-3"),
      artifact(6, "cxshard-b-12-1"),
      artifact(7, "cxshard-a-123-1"),
    ];
    expect(
      selectGitHubArtifacts(files, "12", 2).map((item) => item.id),
    ).toEqual([1, 4, 6]);
  });

  it("reports an expired selected artifact rather than reviving its older result", () => {
    expect(() =>
      selectGitHubArtifacts(
        [
          artifact(1, "cxsweep-matrix-12"),
          artifact(2, "cxshard-a-12-1"),
          artifact(3, "cxshard-a-12-2", true),
        ],
        "12",
        2,
      ),
    ).toThrow("已过期");
  });
});

describe("remote source requests", () => {
  it("requests the official contract directly and preserves incomplete discovery", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            version: 1,
            runs: [{ run_id: "12" }],
            discovery_complete: false,
          }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    expect((await fetchOfficialRuns()).discovery_complete).toBe(false);
    expect(fetcher.mock.calls[0]![0]).toBe(
      "https://inferencex.semianalysis.com/api/v1/collectivex/runs?version=1",
    );
  });

  it("explains CORS or network failures and never silently substitutes snapshots", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(fetchOfficialRun("12")).rejects.toThrow("CORS 浏览器插件");
  });

  it("does not make requests for missing tokens or malformed run IDs", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      loadGitHubRunArtifacts("https://github.com/o/r/actions/runs/12"),
    ).rejects.toThrow("token");
    await expect(fetchOfficialRun("../latest")).rejects.toThrow("run ID");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("downloads paginated artifact results using fixed GitHub URLs and selected attempts", async () => {
    const dummy = Array.from({ length: 98 }, (_, index) =>
      artifact(100 + index, `other-${index}`),
    );
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/actions/runs/12/attempts/2"))
        return Response.json({
          id: 12,
          run_attempt: 2,
          head_sha: "abc",
          status: "completed",
          conclusion: "success",
          updated_at: "2026-09-10T00:00:00Z",
        });
      if (url.endsWith("page=1"))
        return Response.json({
          total_count: 101,
          artifacts: [
            ...dummy,
            artifact(1, "cxsweep-matrix-12"),
            artifact(2, "cxshard-a-12-1"),
          ],
        });
      if (url.endsWith("page=2"))
        return Response.json({
          total_count: 101,
          artifacts: [artifact(3, "cxshard-a-12-2")],
        });
      if (/\/actions\/artifacts\/(1|3)\/zip$/u.test(url))
        return new Response(new Uint8Array([80, 75, 3, 4]));
      throw new Error(`Unexpected URL ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await loadGitHubRunArtifacts(
      "https://github.com/o/r/actions/runs/12/attempts/2",
      "test-token",
    );
    expect(result.run.run_attempt).toBe(2);
    expect(result.files.map((file) => file.name)).toEqual([
      "cxsweep-matrix-12.zip",
      "cxshard-a-12-2.zip",
    ]);
    expect(fetcher.mock.calls.map((args) => args[0])).not.toContain(
      "https://api.github.com/repos/o/r/actions/artifacts/2/zip",
    );
  });

  it("distinguishes a GitHub rate-limit failure from missing permissions", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
            status: 403,
            headers: { "x-ratelimit-remaining": "0" },
          }),
        ),
    );
    await expect(
      loadGitHubRunArtifacts(
        "https://github.com/o/r/actions/runs/12",
        "test-token",
      ),
    ).rejects.toThrow("额度已耗尽");
  });

  it("rejects official or GitHub responses for another run", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ run: { run_id: "13" } }))
        .mockResolvedValueOnce(Response.json({ id: 13, run_attempt: 1 })),
    );
    await expect(fetchOfficialRun("12")).rejects.toThrow("run ID 与请求不匹配");
    await expect(
      loadGitHubRunArtifacts(
        "https://github.com/o/r/actions/runs/12",
        "test-token",
      ),
    ).rejects.toThrow("run ID 与请求不匹配");
  });

  it("redacts a supplied token from reflected upstream error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: "Rejected Bearer secret-test-token" },
            { status: 401 },
          ),
        ),
    );
    const error = (await loadGitHubRunArtifacts(
      "https://github.com/o/r/actions/runs/12",
      "secret-test-token",
    ).catch((value: unknown) => value)) as Error;
    expect(error.message).toContain("[REDACTED]");
    expect(error.message).not.toContain("secret-test-token");
  });
});
