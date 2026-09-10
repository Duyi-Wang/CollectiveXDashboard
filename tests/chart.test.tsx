import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { chartColor, chartDash, PerformanceChart } from "../src/chart";
import type { ChartSeries } from "../src/model";

const sample: ChartSeries = {
  id: "sample",
  label: "Measured run",
  colorKey: "h200:nccl:ep8",
  runIndex: 0,
  points: [
    { x: 1, y: 10, detail: "first" },
    { x: 2, y: null, detail: "missing" },
    { x: 4, y: 20, detail: "last" },
  ],
};

describe("PerformanceChart SVG contract", () => {
  it("leaves an explicit gap across null observations instead of connecting endpoints", () => {
    const svg = renderToStaticMarkup(
      <PerformanceChart
        series={[sample]}
        xLabel="Tokens/rank"
        yLabel="µs"
        logX
        logY
      />,
    );
    const curve = svg.match(/class="chart-line" d="([^"]+)"/)?.[1];
    expect(curve).toBeDefined();
    expect(curve?.match(/M/g)).toHaveLength(2);
    expect(svg.match(/class="chart-point"/g)).toHaveLength(2);
    expect(svg.match(/tabindex="0"/g)).toHaveLength(2);
    expect(svg).not.toContain("NaN");
  });
  it("shows measured zero on linear axes, excluding it on logarithmic axes", () => {
    const zero = { ...sample, points: [{ x: 0, y: 0, detail: "zero" }] };
    const linear = renderToStaticMarkup(
      <PerformanceChart
        series={[zero]}
        xLabel="x"
        yLabel="y"
        logX={false}
        logY={false}
      />,
    );
    const logarithmic = renderToStaticMarkup(
      <PerformanceChart series={[zero]} xLabel="x" yLabel="y" logX logY />,
    );
    expect(linear).toContain('class="chart-point"');
    expect(logarithmic).not.toContain('class="chart-point"');
    expect(logarithmic).toContain("No plottable data for the current selection");
  });
  it("renders only measured bands and uses run-specific line patterns", () => {
    const band = {
      ...sample,
      runIndex: 1,
      points: [
        { x: 1, y: 10, low: 9, high: 12, detail: "" },
        { x: 2, y: 20, low: 18, high: 24, detail: "" },
      ],
    };
    const svg = renderToStaticMarkup(
      <PerformanceChart
        series={[band]}
        xLabel="x"
        yLabel="y"
        logX
        logY
        showBand
      />,
    );
    expect(svg).toMatch(/class="chart-band" d="[^"]+"/);
    expect(svg).toContain('stroke-dasharray="8 4"');
    expect(chartColor(sample.colorKey)).toBe(chartColor(sample.colorKey));
    expect(chartColor(sample.colorKey)).toMatch(/^#[0-9a-f]{6}$/);
    expect(
      new Set(Array.from({ length: 100 }, (_, i) => chartDash(i))).size,
    ).toBe(100);
    expect(chartDash(2)).not.toBe(chartDash(1));
  });
});
