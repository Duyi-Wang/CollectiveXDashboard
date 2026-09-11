import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator(".chart-point").first()).toBeVisible();
}
async function workspaceExport(page: Page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /^(Export JSON|导出 JSON)$/ }).click();
  return JSON.parse(await readFile((await (await event).path())!, "utf8"));
}

test("默认英文，中英文切换保留筛选和数据，刷新后记住选择", async ({ page }) => {
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("CollectiveX · MORI Internal Fork");
  await expect(
    page.getByRole("button", { name: "English", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "CollectiveX · MORI Internal Fork",
  );
  await expect(page.locator("main")).not.toContainText(/[\u4e00-\u9fff]/);
  await page
    .getByRole("combobox", { name: "EP", exact: true })
    .selectOption("16");
  await page.locator(".legend-item").first().click();
  const curves = await page
    .locator(".chart-line")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("d")));
  const exported = await workspaceExport(page);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page).toHaveTitle("CollectiveX · MORI 内部 Fork");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "CollectiveX · MORI 内部 Fork",
  );
  await expect(
    page.getByRole("combobox", { name: "EP", exact: true }),
  ).toHaveValue("16");
  expect(
    await page
      .locator(".chart-line")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("d"))),
  ).toEqual(curves);
  expect(await workspaceExport(page)).toEqual(exported);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "CollectiveX · MORI 内部 Fork",
  );
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("button", { name: "Add data", exact: true }),
  ).toBeVisible();
});

test("英文导入错误和进度可即时切换，KV 与导出图例使用当前语言", async ({
  page,
}) => {
  await ready(page);
  await page.route(
    "https://inferencex.semianalysis.com/api/v1/collectivex/latest?version=1",
    (route) => route.abort("failed"),
  );
  await page.getByRole("button", { name: "Add data", exact: true }).click();
  await page
    .getByRole("button", { name: "Import latest run", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Enable a CORS browser extension",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "中文", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("请启用");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "English", exact: true })
    .click();
  await page.getByRole("tab", { name: "Local files", exact: true }).click();
  await page
    .getByLabel("Choose local data files")
    .setInputFiles("public/example.csv");
  await expect(page.getByRole("status")).toContainText("Imported 1 datasets");
  await page
    .getByRole("button", { name: "Close data import", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Show Official snapshot 33412478973" })
    .check();
  await page.getByRole("tab", { name: /KV Transfer/ }).click();
  await expect(page.locator(".legend-item").first()).toContainText(
    "Official snapshot",
  );
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.locator(".legend-item").first()).toContainText("官方快照");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("#performance-chart")).toContainText(
    "Bandwidth (GB/s)",
  );
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  const svg = await readFile((await (await event).path())!, "utf8");
  expect(svg).toContain("Visible series");
  expect(svg).toContain("Official snapshot");
  expect(svg).not.toMatch(/[\u4e00-\u9fff]/);
});

test("窄屏语言开关可用，存储受限时仍能切换", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await ready(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Add data", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
});
