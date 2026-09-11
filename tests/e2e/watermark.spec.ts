import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("MORI Internal watermark is embedded in SVG and rasterized into PNG", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".chart-point").first()).toBeVisible();
  const mark = page.locator("#performance-chart .chart-watermark");
  await expect(mark).toHaveText("MORI Internal");
  await expect(mark).toHaveAttribute("pointer-events", "none");
  await page.locator(".chart-point").last().hover();
  await expect(page.locator(".chart-tooltip")).toBeVisible();
  await page.locator("h1").click();
  await expect(page.locator(".chart-tooltip")).toHaveCount(0);

  const svgEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  const svg = await readFile((await (await svgEvent).path())!, "utf8");
  expect(svg).toContain('class="chart-watermark"');
  const pngEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG", exact: false }).click();
  const png = (await readFile((await (await pngEvent).path())!)).toString(
    "base64",
  );

  // Compare actual PNG pixels with the exported SVG, then with the same SVG
  // minus its watermark. This detects an HTML-only overlay or a lost export mark.
  const pixels = await page.evaluate(
    async ({ svg, png }) => {
      async function load(url: string) {
        const image = new Image();
        image.src = url;
        await image.decode();
        return image;
      }
      const actual = await load(`data:image/png;base64,${png}`);
      const width = actual.naturalWidth,
        height = actual.naturalHeight;
      function raster(image: HTMLImageElement) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0, width, height);
        return ctx.getImageData(
          0,
          0,
          width,
          Math.min(height, Math.round((390 * width) / 1000)),
        ).data;
      }
      async function svgPixels(source: string) {
        const url = URL.createObjectURL(
          new Blob([source], { type: "image/svg+xml" }),
        );
        try {
          return raster(await load(url));
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      const svgDocument = new DOMParser().parseFromString(svg, "image/svg+xml");
      const watermark = svgDocument.querySelector(".chart-watermark");
      if (watermark?.textContent !== "MORI Internal")
        throw new Error("Export watermark is missing");
      const expected = await svgPixels(svg);
      watermark.remove();
      const unmarked = await svgPixels(
        new XMLSerializer().serializeToString(svgDocument),
      );
      const output = raster(actual);
      let withDifference = 0,
        withoutDifference = 0,
        changedPixels = 0;
      for (let i = 0; i < output.length; i += 4) {
        const differs = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
          a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2];
        // Only compare pixels changed by the watermark. Hover/focus styling
        // elsewhere in the plot is not part of this export contract.
        if (differs(expected, unmarked)) {
          changedPixels++;
          if (differs(output, expected)) withDifference++;
          if (differs(output, unmarked)) withoutDifference++;
        }
      }
      return { withDifference, withoutDifference, changedPixels };
    },
    { svg, png },
  );
  expect(pixels.changedPixels).toBeGreaterThan(1000);
  expect(pixels.withDifference).toBeLessThan(pixels.withoutDifference * 0.01);
});
