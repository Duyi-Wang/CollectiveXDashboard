import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { GITHUB_TOKEN_STORAGE_KEY } from "../../src/tokenStorage";

const TOKEN = "test-only-remembered-credential";
async function openImport(page: Page) {
  await page.getByRole("button", { name: "GitHub CI Actions run URL" }).click();
}
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator(".chart-point").first()).toBeVisible();
  await openImport(page);
}
const stored = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), GITHUB_TOKEN_STORAGE_KEY);

test("Token 保存需主动勾选，支持恢复、更新、取消保存和清除", async ({
  page,
}) => {
  await ready(page);
  const field = page.getByLabel("GitHub token", { exact: true });
  const remember = page.getByRole("checkbox", {
    name: "Save token in this browser",
  });
  await expect(remember).not.toBeChecked();
  await field.fill(TOKEN);
  expect(await stored(page)).toBeNull();
  await remember.check();
  expect(await stored(page)).toBe(TOKEN);
  await expect(page.locator(".token-storage-status")).toContainText(
    "Saved in this browser",
  );
  await page.getByRole("button", { name: "Close data import" }).click();
  await openImport(page);
  await expect(field).toHaveValue(TOKEN);
  await expect(remember).toBeChecked();
  await page.reload();
  await expect(page.locator(".chart-point").first()).toBeVisible();
  await openImport(page);
  await expect(field).toHaveValue(TOKEN);
  await field.fill(`${TOKEN}-updated`);
  expect(await stored(page)).toBe(`${TOKEN}-updated`);
  await remember.uncheck();
  expect(await stored(page)).toBeNull();
  await expect(field).toHaveValue(`${TOKEN}-updated`);
  await page.getByRole("button", { name: "Close data import" }).click();
  await openImport(page);
  await expect(field).toHaveValue("");
  await expect(remember).not.toBeChecked();
  // Opting in before typing also saves the next entry automatically.
  await remember.check();
  await field.fill(TOKEN);
  expect(await stored(page)).toBe(TOKEN);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "中文", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "在此浏览器保存 Token" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "清除 Token", exact: true }).click();
  await expect(field).toHaveValue("");
  expect(await stored(page)).toBeNull();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("collectivex-dashboard:language"),
    ),
  ).toBe("zh");
  await page.getByRole("button", { name: "关闭数据导入" }).click();
  await page.getByRole("button", { name: "GitHub CI Actions run URL" }).click();
  await expect(field).toHaveValue("");
});

test("保存的 Token 与工作区及 JSON/CSV 导出隔离", async ({ page }) => {
  await ready(page);
  await page.getByLabel("GitHub token", { exact: true }).fill(TOKEN);
  await page
    .getByRole("checkbox", { name: "Save token in this browser" })
    .check();
  await page.getByRole("button", { name: "Close data import" }).click();
  for (const label of ["Export JSON", "Dataset CSV", "Chart CSV"]) {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const text = await readFile((await (await event).path())!, "utf8");
    expect(text.length).toBeGreaterThan(100);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(GITHUB_TOKEN_STORAGE_KEY);
  }
  const workspace = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open("collectivex-dashboard");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const query = request.result
            .transaction("workspace")
            .objectStore("workspace")
            .get("datasets");
          query.onsuccess = () => {
            resolve(JSON.stringify(query.result));
            request.result.close();
          };
          query.onerror = () => reject(query.error);
        };
      }),
  );
  expect(JSON.parse(workspace)).toHaveLength(5);
  expect(workspace).not.toContain(TOKEN);
  expect(workspace).not.toContain(GITHUB_TOKEN_STORAGE_KEY);
  expect(await stored(page)).toBe(TOKEN);
});

test("写入失败保留会话输入且不谎报保存成功", async ({ page }) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException(
          "blocked credential write",
          "QuotaExceededError",
        );
      original.call(this, name, value);
    };
  }, GITHUB_TOKEN_STORAGE_KEY);
  await ready(page);
  await page.getByLabel("GitHub token", { exact: true }).fill(TOKEN);
  await page
    .getByRole("checkbox", { name: "Save token in this browser" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Save token in this browser" }),
  ).not.toBeChecked();
  await expect(page.locator(".token-storage-error")).toContainText(
    "Could not save",
  );
  await expect(page.locator(".token-storage-error")).not.toContainText(TOKEN);
  await expect(page.getByLabel("GitHub token", { exact: true })).toHaveValue(
    TOKEN,
  );
  expect(await stored(page)).toBeNull();
  await page.getByRole("button", { name: "Close data import" }).click();
  await openImport(page);
  await expect(page.getByLabel("GitHub token", { exact: true })).toHaveValue(
    "",
  );
});

test("删除受阻时保留真实保存状态并提供明确提示", async ({ page }) => {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
      const original = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (name) {
        if (name === key)
          throw new DOMException("blocked credential removal", "SecurityError");
        original.call(this, name);
      };
    },
    { key: GITHUB_TOKEN_STORAGE_KEY, value: TOKEN },
  );
  await ready(page);
  const remember = page.getByRole("checkbox", {
    name: "Save token in this browser",
  });
  await expect(page.getByLabel("GitHub token", { exact: true })).toHaveValue(
    TOKEN,
  );
  await expect(remember).toBeChecked();
  await page.getByRole("button", { name: "Clear token", exact: true }).click();
  await expect(page.locator(".token-storage-error")).toContainText(
    "Could not remove",
  );
  await expect(page.locator(".token-storage-error")).not.toContainText(TOKEN);
  expect(await stored(page)).toBe(TOKEN);
  await expect(remember).toBeChecked();
  await remember.click();
  await expect(remember).toBeChecked();
  expect(await stored(page)).toBe(TOKEN);
});
