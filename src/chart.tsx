import { useI18n } from "./i18n-react";
import { translate, type Language } from "./i18n";
import { useId, useMemo, useState } from "react";
import { area, format, hsl, line, scaleLinear, scaleLog } from "d3";
import { CHART_THEME } from "./theme";
import { INTERNAL_WATERMARK } from "./branding";
import type { ChartPoint, ChartSeries } from "./model";

/** Keep each configuration's color stable across filters and runs. Vendor fields
 * come from the normalized data contract, never inferred from hardware names. */
export function chartColor(key: string): string {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++)
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  const seed = hash >>> 0;
  let vendor = "unknown";
  try {
    const fields: unknown = JSON.parse(key);
    if (Array.isArray(fields)) {
      const candidate = fields[fields[0] === "kv" ? 2 : 1];
      if (typeof candidate === "string") vendor = candidate.toLowerCase();
    }
  } catch {
    /* Arbitrary or legacy keys use the neutral palette. */
  }
  const position = (seed % 997) / 996;
  const hue =
    vendor === "amd"
      ? 350 + position * 40
      : vendor === "nvidia"
        ? 105 + position * 70
        : 205 + position * 80;
  const saturation = vendor === "amd" ? 0.88 : 0.6;
  const lightness = 0.64 + ((seed >>> 12) % 5) * 0.035;
  return hsl(hue % 360, saturation, lightness).formatHex();
}

export function chartDash(runIndex: number): string {
  const i = Math.max(0, Math.trunc(runIndex));
  return i < 4
    ? ["", "8 4", "3 4", "12 4 3 4"][i]
    : `${5 + (i % 7)} 3 ${1 + Math.floor(i / 7)} ${4 + (i % 5)}`;
}

export interface PerformanceChartProps {
  series: ChartSeries[];
  xLabel: string;
  yLabel: string;
  logX: boolean;
  logY: boolean;
  showBand?: boolean;
  id?: string;
}

const WIDTH = 1000,
  HEIGHT = 390;
const MARGIN = { top: 26, right: 28, bottom: 60, left: 88 };
const RIGHT = WIDTH - MARGIN.right,
  BOTTOM = HEIGHT - MARGIN.bottom;
const numberLabel = (value: number) =>
  value === 0
    ? "0"
    : Math.abs(value) >= 1e4 || Math.abs(value) < 0.01
      ? format(".2~s")(value)
      : format(",.3~g")(value);

function domain(values: number[], logarithmic: boolean): [number, number] {
  if (!values.length) return logarithmic ? [1, 10] : [0, 1];
  const minimum = Math.min(...values),
    maximum = Math.max(...values);
  if (minimum === maximum)
    return logarithmic
      ? [minimum / 1.5, maximum * 1.5]
      : [Math.min(0, minimum), maximum > 0 ? maximum * 1.2 : 1];
  return logarithmic
    ? [minimum / 1.08, maximum * 1.08]
    : [Math.min(0, minimum), maximum + (maximum - minimum) * 0.08];
}

export function PerformanceChart({
  series,
  xLabel,
  yLabel,
  logX,
  logY,
  showBand = false,
  id,
}: PerformanceChartProps) {
  const { t } = useI18n();
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const [active, setActive] = useState<{
    point: ChartPoint;
    series: ChartSeries;
  } | null>(null);
  const geometry = useMemo(() => {
    const xValid = (point: ChartPoint) =>
      Number.isFinite(point.x) && (!logX || point.x > 0);
    const valid = (point: ChartPoint) =>
      xValid(point) &&
      point.y !== null &&
      Number.isFinite(point.y) &&
      (!logY || point.y > 0);
    const plotted = series.map((entry) => ({
      ...entry,
      points: [...entry.points].sort((a, b) => a.x - b.x),
    }));
    const allPoints = plotted.flatMap((entry) => entry.points);
    const validPoints = allPoints.filter(valid);
    const yValues = validPoints.flatMap((point) => [
      point.y!,
      ...(showBand
        ? [point.low, point.high].filter(
            (value): value is number =>
              value !== undefined &&
              Number.isFinite(value) &&
              (!logY || value > 0),
          )
        : []),
    ]);
    const x = (logX ? scaleLog() : scaleLinear())
      .domain(
        domain(
          allPoints.filter(xValid).map((point) => point.x),
          logX,
        ),
      )
      .range([MARGIN.left, RIGHT]);
    const y = (logY ? scaleLog() : scaleLinear())
      .domain(domain(yValues, logY))
      .range([BOTTOM, MARGIN.top]);
    const linePath = line<ChartPoint>()
      .defined(valid)
      .x((point) => x(point.x))
      .y((point) => y(point.y!));
    const bandPath = area<ChartPoint>()
      .defined(
        (point) =>
          valid(point) &&
          point.low !== undefined &&
          point.high !== undefined &&
          Number.isFinite(point.low) &&
          Number.isFinite(point.high) &&
          point.low <= point.high &&
          (!logY || point.low > 0),
      )
      .x((point) => x(point.x))
      .y0((point) => y(point.low!))
      .y1((point) => y(point.high!));
    // Prefer actual ladder rungs over arbitrary logarithmic ticks, so powers of two stay legible.
    const xRungs = [
      ...new Set(allPoints.filter(xValid).map((point) => point.x)),
    ].sort((a, b) => a - b);
    const xTicks =
      xRungs.length > 0 && xRungs.length <= 14
        ? xRungs
        : x
            .ticks(8)
            .filter(
              (_, index, ticks) =>
                ticks.length <= 12 ||
                index % Math.ceil(ticks.length / 12) === 0,
            );
    const allYTicks = y.ticks(7);
    const yTicks = allYTicks.filter(
      (value, index) =>
        !logY ||
        allYTicks.length <= 10 ||
        index === 0 ||
        index === allYTicks.length - 1 ||
        [1, 2, 5].includes(Number(value.toExponential().split("e")[0])),
    );
    return {
      x,
      y,
      valid,
      plotted,
      linePath,
      bandPath,
      xTicks,
      yTicks,
      count: validPoints.length,
    };
  }, [series, logX, logY, showBand]);
  const activeVisible =
    active &&
    series.some(
      (entry) =>
        entry.id === active.series.id && entry.points.includes(active.point),
    ) &&
    geometry.valid(active.point);
  return (
    <div className="chart-wrap" style={{ position: "relative" }}>
      <svg
        id={id}
        className="chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <title
          id={titleId}
        >{`${INTERNAL_WATERMARK} · ${yLabel} vs ${xLabel} · ${t("{count} 个有效数据点", { count: geometry.count })}`}</title>
        <rect width={WIDTH} height={HEIGHT} fill={CHART_THEME.background} />
        <g className="chart-grid" stroke={CHART_THEME.grid} strokeWidth="1">
          {geometry.xTicks.map((tick) => (
            <line
              key={`x-${tick}`}
              x1={geometry.x(tick)}
              x2={geometry.x(tick)}
              y1={MARGIN.top}
              y2={BOTTOM}
            />
          ))}
          {geometry.yTicks.map((tick) => (
            <line
              key={`y-${tick}`}
              x1={MARGIN.left}
              x2={RIGHT}
              y1={geometry.y(tick)}
              y2={geometry.y(tick)}
            />
          ))}
        </g>
        <text
          className="chart-watermark"
          x={(MARGIN.left + RIGHT) / 2}
          y={(MARGIN.top + BOTTOM) / 2}
          transform={`rotate(-10 ${(MARGIN.left + RIGHT) / 2} ${(MARGIN.top + BOTTOM) / 2})`}
          textAnchor="middle"
          dominantBaseline="central"
          fill={CHART_THEME.text}
          fillOpacity="0.16"
          fontFamily="Arial, sans-serif"
          fontSize="120"
          textLength={RIGHT - MARGIN.left - 40}
          lengthAdjust="spacingAndGlyphs"
          fontWeight="700"
          letterSpacing="3"
          pointerEvents="none"
          aria-hidden="true"
        >
          {INTERNAL_WATERMARK}
        </text>
        <g fill={CHART_THEME.text} fontSize="12">
          {geometry.xTicks.map((tick) => (
            <text
              key={`x-${tick}`}
              textAnchor="middle"
              x={geometry.x(tick)}
              y={BOTTOM + 23}
            >
              {numberLabel(tick)}
            </text>
          ))}
          {geometry.yTicks.map((tick) => (
            <text
              key={`y-${tick}`}
              textAnchor="end"
              x={MARGIN.left - 13}
              y={geometry.y(tick) + 4}
            >
              {numberLabel(tick)}
            </text>
          ))}
        </g>
        <path
          d={`M${MARGIN.left},${MARGIN.top}V${BOTTOM}H${RIGHT}`}
          fill="none"
          stroke={CHART_THEME.axis}
        />
        <g fill={CHART_THEME.text} fontSize="13" fontWeight="500">
          <text
            x={(MARGIN.left + RIGHT) / 2}
            y={HEIGHT - 12}
            textAnchor="middle"
          >
            {xLabel}
            {logX ? " · log" : ""}
          </text>
          <text
            transform={`translate(20 ${(MARGIN.top + BOTTOM) / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            {yLabel}
            {logY ? " · log" : ""}
          </text>
        </g>
        {geometry.plotted.map((entry) => (
          <g key={entry.id} data-series-id={entry.id}>
            {showBand && (
              <path
                className="chart-band"
                d={geometry.bandPath(entry.points) ?? undefined}
                fill={chartColor(entry.colorKey)}
                fillOpacity="0.11"
                stroke="none"
              />
            )}
            <path
              className="chart-line"
              d={geometry.linePath(entry.points) ?? undefined}
              fill="none"
              stroke={chartColor(entry.colorKey)}
              strokeWidth="2.5"
              strokeDasharray={chartDash(entry.runIndex)}
              strokeLinejoin="round"
            />
            {entry.points.map(
              (point, index) =>
                geometry.valid(point) && (
                  <circle
                    key={`${point.x}:${index}`}
                    className="chart-point"
                    cx={geometry.x(point.x)}
                    cy={geometry.y(point.y!)}
                    r={active?.point === point ? 6 : 4}
                    fill={CHART_THEME.background}
                    stroke={chartColor(entry.colorKey)}
                    strokeWidth="2"
                    tabIndex={0}
                    aria-label={`${entry.label}, ${xLabel} ${numberLabel(point.x)}, ${yLabel} ${numberLabel(point.y!)}. ${point.detail}`}
                    onMouseEnter={() => setActive({ point, series: entry })}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive({ point, series: entry })}
                    onBlur={() => setActive(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setActive(null);
                        event.currentTarget.blur();
                      }
                    }}
                  >
                    <title>{`${entry.label}\n${xLabel}: ${numberLabel(point.x)}\n${yLabel}: ${numberLabel(point.y!)}\n${point.detail}`}</title>
                  </circle>
                ),
            )}
          </g>
        ))}
        {geometry.count === 0 && (
          <g fill={CHART_THEME.muted} fontSize="15" textAnchor="middle">
            <text x={WIDTH / 2} y={HEIGHT / 2 - 10}>
              {t("当前筛选没有可绘制的数据")}
            </text>
            <text x={WIDTH / 2} y={HEIGHT / 2 + 16} fontSize="12">
              {t("缺失分位数不会补值；对数轴仅显示正数")}
            </text>
          </g>
        )}
      </svg>
      {activeVisible && (
        <div
          className="chart-tooltip"
          role="status"
          style={{
            position: "absolute",
            pointerEvents: "none",
            left: `${(geometry.x(active.point.x) / WIDTH) * 100}%`,
            top: `${(geometry.y(active.point.y!) / HEIGHT) * 100}%`,
            transform: `translate(${geometry.x(active.point.x) > WIDTH * 0.6 ? "-102%" : "12px"}, -105%)`,
            background: CHART_THEME.tooltip,
            border: `1px solid ${CHART_THEME.tooltipBorder}`,
            color: CHART_THEME.title,
            borderRadius: 8,
            padding: "10px 13px",
            fontSize: 12,
            maxWidth: 320,
            zIndex: 2,
            boxShadow: "0 8px 28px #00000060",
          }}
        >
          <strong>{active.series.label}</strong>
          <div>
            {xLabel}: {numberLabel(active.point.x)} · {yLabel}:{" "}
            {numberLabel(active.point.y!)}
          </div>
          <div style={{ whiteSpace: "pre-line", opacity: 0.8, marginTop: 5 }}>
            {active.point.detail}
          </div>
        </div>
      )}
    </div>
  );
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportElement(
  svg: SVGSVGElement,
  series: ChartSeries[] = [],
  language: Language = "en",
): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const width = svg.viewBox.baseVal.width || WIDTH;
  const originalHeight = svg.viewBox.baseVal.height || HEIGHT;
  let cursor = originalHeight + 14;
  const append = (
    tag: string,
    attrs: Record<string, string>,
    text?: string,
  ) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs))
      node.setAttribute(key, value);
    if (text) node.textContent = text;
    clone.appendChild(node);
  };
  if (series.length) {
    append(
      "text",
      {
        x: "30",
        y: String(cursor),
        fill: CHART_THEME.title,
        "font-size": "13",
        "font-weight": "600",
      },
      `CollectiveX · ${INTERNAL_WATERMARK} · ${translate("可见系列", language)}`,
    );
    cursor += 22;
    for (const entry of series) {
      const words = entry.label.match(/.{1,115}(?:\s|$)|.{1,115}/gu) ?? [
        entry.label,
      ];
      append("line", {
        x1: "30",
        x2: "62",
        y1: String(cursor - 4),
        y2: String(cursor - 4),
        stroke: chartColor(entry.colorKey),
        "stroke-width": "2.5",
        "stroke-dasharray": chartDash(entry.runIndex),
      });
      for (const row of words) {
        append(
          "text",
          {
            x: "75",
            y: String(cursor),
            fill: CHART_THEME.text,
            "font-size": "11",
          },
          row.trim(),
        );
        cursor += 16;
      }
      cursor += 6;
    }
  }
  const height = series.length ? cursor + 14 : originalHeight;
  clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  const background = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  background.setAttribute("width", String(width));
  background.setAttribute("height", String(height));
  background.setAttribute("fill", CHART_THEME.background);
  clone.prepend(background);
  clone
    .querySelectorAll("[tabindex]")
    .forEach((node) => node.removeAttribute("tabindex"));
  return clone;
}

export function exportSvg(
  svg: SVGSVGElement,
  fileName: string,
  series: ChartSeries[] = [],
  language: Language = "en",
): void {
  const source = new XMLSerializer().serializeToString(
    exportElement(svg, series, language),
  );
  saveBlob(
    new Blob([source], { type: "image/svg+xml;charset=utf-8" }),
    fileName.endsWith(".svg") ? fileName : `${fileName}.svg`,
  );
}

export async function exportPng(
  svg: SVGSVGElement,
  fileName: string,
  series: ChartSeries[] = [],
  language: Language = "en",
): Promise<void> {
  const clone = exportElement(svg, series, language);
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const bitmap = new Image();
    bitmap.src = url;
    await bitmap.decode();
    const canvas = document.createElement("canvas");
    // Bound bitmap area for large legends while preserving the whole chart.
    const width = Number(clone.getAttribute("width")),
      height = Number(clone.getAttribute("height"));
    const scale = Math.min(
      2,
      16000 / Math.max(width, height),
      Math.sqrt(32000000 / (width * height)),
    );
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable");
    context.fillStyle = CHART_THEME.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error("PNG export failed")),
        "image/png",
      ),
    );
    saveBlob(blob, fileName.endsWith(".png") ? fileName : `${fileName}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
