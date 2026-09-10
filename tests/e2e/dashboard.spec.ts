import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";

const snapshotFile = path.resolve("public/data/run-34432070017.json");
const snapshot = JSON.parse(await readFile(snapshotFile, "utf8"));
const api = "https://inferencex.semianalysis.com/api/v1/collectivex";
// Existing behavior checks exercise the Chinese locale; language.spec.ts covers
// a clean English default and switching without resetting the workspace.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("collectivex-dashboard:language", "zh"),
  );
});
async function start(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.locator(".run-table tbody tr")).toHaveCount(5);
  await expect(page.locator(".chart-point").first()).toBeVisible();
}

test("真实快照、指标值、筛选、图例和键盘 tooltip", async ({ page }) => {
  const errors: string[] = [];
  const remote: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4173"))
      remote.push(request.url());
  });
  await start(page);
  expect(remote).toEqual([]);
  await page.getByRole("button", { name: "取消全选", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "显示 官方快照 34432070017" })
    .check();
  await page.getByLabel("EP", { exact: true }).selectOption("16");
  await expect(page.locator(".chart-point")).toHaveCount(20);
  const point = snapshot.series.find(
    (s: { phase: string; system: { sku: string } }) =>
      s.phase === "decode" && s.system.sku === "h100-dgxc",
  ).points[0];
  await page.getByRole("button", { name: "图表数据", exact: false }).click();
  await expect(page.locator(".raw-panel tbody tr").first()).toContainText(
    point.components.roundtrip.latency_us.p50.toLocaleString("en-US", {
      maximumFractionDigits: 5,
    }),
  );
  await page.locator(".chart-point").first().focus();
  await expect(page.locator(".chart-tooltip")).toContainText("官方快照");
  await page.keyboard.press("Escape");
  await page
    .getByRole("combobox", { name: "操作", exact: true })
    .selectOption("pair_period");
  await expect(page.getByText("当前选择没有可绘制的测量值")).toBeVisible();
  await page
    .getByRole("combobox", { name: "操作", exact: true })
    .selectOption("roundtrip");
  await page
    .getByRole("button", { name: "Payload 带宽 / GPU", exact: true })
    .click();
  await expect(page.locator(".raw-panel tbody tr").first()).toContainText(
    point.components.roundtrip.payload_data_rate_gbps_at_latency_percentile.p50.toLocaleString(
      "en-US",
      { maximumFractionDigits: 5 },
    ),
  );
  await page.locator(".legend-item").first().click();
  await expect(page.locator(".chart-point")).toHaveCount(10);
  await page.getByRole("button", { name: "显示全部", exact: true }).click();
  await expect(page.locator(".chart-point")).toHaveCount(20);
  expect(errors).toEqual([]);
});

test("本地 ZIP、JSON / 数据 CSV 往返、持久化与无凭据导出", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "本地文件 JSON / CSV / ZIP" }).click();
  await page.getByLabel("选择本地数据文件").setInputFiles({
    name: "snapshot.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(
      zipSync({ "result.json": strToU8(JSON.stringify(snapshot)) }),
    ),
  });
  await expect(page.getByRole("status")).toContainText("已导入 1 组数据");
  await page.getByRole("button", { name: "关闭数据导入" }).click();
  await expect(page.locator(".run-table tbody tr")).toHaveCount(6);
  const jsonEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  const json = JSON.parse(
    await readFile((await (await jsonEvent).path())!, "utf8"),
  );
  expect(json.datasets).toHaveLength(6);
  expect(JSON.stringify(json)).not.toMatch(
    /Authorization|github_pat_|test-token-only/i,
  );
  const csvEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "数据 CSV", exact: true }).click();
  const csvPath = (await (await csvEvent).path())!;
  await page.getByRole("button", { name: "本地文件 JSON / CSV / ZIP" }).click();
  await page.getByLabel("选择本地数据文件").setInputFiles({
    name: "roundtrip.csv",
    mimeType: "text/csv",
    buffer: await readFile(csvPath),
  });
  await expect(page.getByRole("status")).toContainText("已导入 6 组数据");
  await page.getByRole("button", { name: "关闭数据导入" }).click();
  await expect(page.locator(".run-table tbody tr")).toHaveCount(12);
  const count = 12;
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          new Promise<number>((resolve) => {
            const r = indexedDB.open("collectivex-dashboard");
            r.onsuccess = () => {
              const q = r.result
                .transaction("workspace")
                .objectStore("workspace")
                .get("datasets");
              q.onsuccess = () => {
                resolve(q.result?.length ?? 0);
                r.result.close();
              };
            };
          }),
      ),
    )
    .toBe(count);
  await page.reload();
  await expect(page.locator(".run-table tbody tr")).toHaveCount(count);
});

test("官方 URL 直连导入与 CORS 失败提示", async ({ page }) => {
  await start(page);
  await page.route(`${api}/latest?version=1`, (route) => route.abort("failed"));
  await page.getByRole("button", { name: "添加数据", exact: true }).click();
  await page.getByRole("button", { name: "导入最新运行", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("CORS");
  await page.unroute(`${api}/latest?version=1`);
  await page.route(`${api}/latest?version=1`, (route) =>
    route.fulfill({
      json: snapshot,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.getByRole("button", { name: "导入最新运行", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已导入 1 组数据");
  await page.getByRole("button", { name: "关闭数据导入" }).click();
  await expect(
    page.getByRole("checkbox", { name: "显示 官方实时 34432070017" }),
  ).toBeChecked();
});

test("GitHub URL → artifact ZIP → 图表，未启用保存时 token 关闭即清除", async ({ page }) => {
  await start(page);
  const root = "https://api.github.com/repos/SemiAnalysisAI/InferenceX";
  const token = "test-token-only-do-not-persist";
  const requests: string[] = [];
  await page.route(`${root}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
        },
      });
      return;
    }
    requests.push(req.url());
    expect(req.headers().authorization).toBe(`Bearer ${token}`);
    if (req.url().includes("/artifacts?"))
      await route.fulfill({
        json: {
          total_count: 2,
          artifacts: [
            { id: 1, name: "cxsweep-matrix-34432070017", expired: false },
            { id: 2, name: "cxshard-fixture-34432070017-1", expired: false },
          ],
        },
      });
    else if (req.url().endsWith("/1/zip"))
      await route.fulfill({
        body: Buffer.from(
          zipSync({
            "matrix.json": strToU8(
              JSON.stringify({ version: 1, requested_cases: [] }),
            ),
          }),
        ),
      });
    else if (req.url().endsWith("/2/zip"))
      await route.fulfill({
        body: Buffer.from(
          zipSync({ "result.json": strToU8(JSON.stringify(snapshot)) }),
        ),
      });
    else
      await route.fulfill({
        json: {
          id: 34432070017,
          run_attempt: 1,
          status: "completed",
          conclusion: "success",
          head_sha: snapshot.run.source_sha,
          updated_at: snapshot.run.generated_at,
        },
      });
  });
  await page.getByRole("button", { name: "GitHub CI Actions run URL" }).click();
  await page
    .getByLabel("GitHub Actions run URL")
    .fill(
      "https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34432070017",
    );
  await page.getByLabel("GitHub token", { exact: false }).fill(token);
  await page.getByRole("button", { name: "读取 CI run 并导入" }).click();
  await expect(page.getByRole("status")).toContainText("已导入");
  await page.getByRole("button", { name: "关闭数据导入" }).click();
  expect(requests.some((url) => url.endsWith("/2/zip"))).toBe(true);
  await expect(
    page.getByRole("checkbox", { name: "显示 GitHub CI 34432070017" }).first(),
  ).toBeChecked();
  await page.getByRole("button", { name: "GitHub CI Actions run URL" }).click();
  await expect(page.getByLabel("GitHub token", { exact: false })).toHaveValue(
    "",
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    token,
  );
});

test("KV 多运行对比、coverage 搜索、SVG / PNG 自包含导出", async ({ page }) => {
  await start(page);
  await page
    .getByRole("checkbox", { name: "显示 官方快照 33412478973" })
    .check();
  await page.getByRole("tab", { name: "KV Transfer", exact: false }).click();
  await expect(page.locator(".chart-point").first()).toBeVisible();
  await page.getByLabel("图表", { exact: true }).selectOption("overlap");
  await expect(page.locator(".chart-line").first()).toBeVisible();
  const svgEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  const svg = await readFile((await (await svgEvent).path())!, "utf8");
  expect(svg).toContain("可见系列");
  expect(svg).toContain("33412478973");
  const pngEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG", exact: false }).click();
  expect(
    (await readFile((await (await pngEvent).path())!))
      .subarray(0, 8)
      .toString("hex"),
  ).toBe("89504e470d0a1a0a");
  await page.getByRole("tab", { name: "测试覆盖", exact: true }).click();
  await page.getByLabel("搜索测试覆盖").fill("unsupported");
  await expect(page.locator(".coverage-panel tbody tr").first()).toContainText(
    "unsupported",
  );
});

test("窄屏可操作且没有页面横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.getByRole("button", { name: "添加数据", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "关闭数据导入" }).click();
});
