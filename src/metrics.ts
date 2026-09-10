import { translate, type Language } from "./i18n";
import type {
  ChartPoint,
  ChartSeries,
  KvRow,
  LoadedDataset,
  Metric,
  Operation,
  Percentile,
  Point,
  Series,
  Topology,
} from "./model";

/** A measured zero is valid on a linear axis. Negative / missing / non-finite values are not observations. */
function measurement(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function metricValue(
  point: Point,
  operation: Operation,
  percentile: Percentile,
  metric: Metric,
): number | null {
  if (point.correctness === false) return null;
  const component = point.components[operation];
  if (!component) return null;
  if (metric === "latency")
    return measurement(component.latency_us[percentile]);
  // Rates belong to the selected latency quantile. Never synthesize one from another quantile or operation.
  const selectedLatency = measurement(component.latency_us[percentile]);
  if (selectedLatency === null || selectedLatency <= 0) return null;
  if (metric === "payload")
    return measurement(
      component.payload_data_rate_gbps_at_latency_percentile?.[percentile],
    );
  if (metric === "activation")
    return measurement(
      component.activation_data_rate_gbps_at_latency_percentile?.[percentile],
    );
  if (operation !== "roundtrip" && operation !== "pair_period") return null;
  const latency = measurement(component.latency_us[percentile]);
  const tokens = measurement(point.global_tokens);
  return latency !== null && latency > 0 && tokens !== null
    ? measurement((tokens / latency) * 1e6)
    : null;
}

export interface AlphaBetaFit {
  alphaUs: number;
  betaGbps: number;
  pointCount: number;
  rSquared: number;
  transferShare: number;
  betaReliable: boolean;
  alphaExtrapolated: boolean;
}

/** Fit latency_us = alpha_us + bytes_per_GPU / (beta_GBps * 1000). No pooling across runs or configurations. */
export function fitAlphaBeta(
  series: Series,
  operation: Operation,
  percentile: Percentile,
): AlphaBetaFit | null {
  const ep = series.system.ep_size;
  if (!Number.isFinite(ep) || ep <= 0 || operation === "isolated_sum")
    return null;
  const observations = series.points.flatMap((point) => {
    if (point.correctness === false) return [];
    const component = point.components[operation];
    const latency = measurement(component?.latency_us[percentile]);
    const bytes = measurement(component?.payload_bytes);
    return latency !== null && latency > 0 && bytes !== null && bytes > 0
      ? [{ x: bytes / ep, y: latency }]
      : [];
  });
  if (observations.length < 3) return null;
  const n = observations.length;
  const meanX = observations.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = observations.reduce((sum, point) => sum + point.y, 0) / n;
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const { x, y } of observations) {
    xx += (x - meanX) ** 2;
    xy += (x - meanX) * (y - meanY);
    yy += (y - meanY) ** 2;
  }
  if (!(xx > 0)) return null;
  const slope = xy / xx;
  if (!(slope > 0) || !Number.isFinite(slope)) return null;
  const alphaUs = meanY - slope * meanX;
  const betaGbps = 1e-3 / slope;
  const rSquared = yy > 0 ? Math.min(1, Math.max(0, xy ** 2 / (xx * yy))) : 0;
  const largest = observations.reduce((best, point) =>
    point.x > best.x ? point : best,
  );
  const smallest = Math.min(...observations.map(({ x }) => x));
  const transferShare = (slope * largest.x) / largest.y;
  if (![alphaUs, betaGbps, rSquared, transferShare].every(Number.isFinite))
    return null;
  return {
    alphaUs,
    betaGbps,
    pointCount: n,
    rSquared,
    transferShare,
    betaReliable: rSquared >= 0.9 && transferShare >= 0.25,
    alphaExtrapolated: smallest > largest.x * 0.1,
  };
}

function topologyKey(topology: Topology): unknown[] {
  return [
    topology.ep_size,
    topology.nodes,
    topology.gpus_per_node,
    topology.scale_up_domain,
    topology.scale_up_transport,
    topology.scale_out_transport,
    topology.topology_class,
  ];
}

export function seriesColorKey(series: Series): string {
  return JSON.stringify([
    series.system.sku,
    series.system.vendor,
    series.backend,
    series.mode,
    series.phase,
    series.precision,
    ...topologyKey(series.system),
    series.workload ?? "",
    series.measurement_semantics ?? "",
  ]);
}

export interface KvSelection {
  view: "bandwidth" | "latency" | "frontier" | "overlap";
  op: "pull" | "push";
  pageTokens: number;
  isl?: number;
}

function kvDetail(row: KvRow, runId: string, language: Language): string {
  const t = (key: string) => translate(key, language);
  return [
    `Run #${runId}`,
    `${row.kind} · ${row.op} · ISL ${row.isl.toLocaleString()} · batch ${row.batch}`,
    row.page_tokens === null
      ? t("连续单描述符基线")
      : `page ${row.page_tokens} tokens`,
    `p50 ${row.latency_ms.p50 ?? "—"} ms · p95 ${row.latency_ms.p95 ?? "—"} ms`,
    `GB/s ${row.gbps_p50} · prep ${row.prep_ms} ms · bytes/request ${row.req_bytes}`,
    row.verify_passed ? "verify passed" : t("verify failed · 不参与绘图"),
  ].join("\n");
}

export function buildKvSeries(
  loaded: LoadedDataset[],
  selection: KvSelection,
  language: Language = "en",
): ChartSeries[] {
  const t = (key: string) => translate(key, language);
  return loaded.flatMap((source, runIndex) =>
    !source.visible
      ? []
      : (source.dataset.kv ?? []).flatMap((kase) => {
          if (kase.outcome !== "success") return [];
          return (["paged", "bulk"] as const).flatMap((kind) => {
            // Bulk has no page size, and it is never a substitute for a missing paged observation.
            const matching = kase.rows.filter(
              (row) =>
                row.kind === kind &&
                row.op === selection.op &&
                (kind === "bulk" || row.page_tokens === selection.pageTokens) &&
                Number.isFinite(row.isl) &&
                row.isl > 0 &&
                Number.isFinite(row.batch) &&
                row.batch > 0,
            );
            if (!matching.length) return [];
            const isl =
              selection.isl ?? Math.max(...matching.map((row) => row.isl));
            const atIsl = matching.filter((row) => row.isl === isl);
            let points: ChartPoint[];
            if (selection.view === "frontier") {
              const byIsl = new Map<number, KvRow[]>();
              for (const row of matching)
                byIsl.set(row.isl, [...(byIsl.get(row.isl) ?? []), row]);
              points = [...byIsl].map(([x, rows]) => {
                const valid = rows.filter(
                  (row) =>
                    row.verify_passed && measurement(row.gbps_p50) !== null,
                );
                const best = valid.reduce<KvRow | undefined>(
                  (winner, row) =>
                    !winner || row.gbps_p50! > winner.gbps_p50! ? row : winner,
                  undefined,
                );
                return {
                  x,
                  y: best ? best.gbps_p50 : null,
                  detail: best
                    ? `${kvDetail(best, source.dataset.run.run_id, language)}\n${t("该 ISL 下实测最佳 batch")}`
                    : translate("ISL {isl}：无有效速率", language, { isl: x }),
                };
              });
            } else {
              const baseline = atIsl.find(
                (row) => row.batch === 1 && row.verify_passed,
              );
              const baselineRate = measurement(baseline?.gbps_p50);
              if (
                selection.view === "overlap" &&
                (baselineRate === null || baselineRate <= 0)
              )
                return [];
              points = atIsl.map((row) => {
                const bandwidth = measurement(row.gbps_p50);
                const y = !row.verify_passed
                  ? null
                  : selection.view === "latency"
                    ? measurement(row.latency_ms.p50)
                    : selection.view === "overlap"
                      ? bandwidth === null
                        ? null
                        : measurement(bandwidth / baselineRate!)
                      : bandwidth;
                return {
                  x: row.batch,
                  y,
                  detail: kvDetail(row, source.dataset.run.run_id, language),
                  ...(selection.view === "latency" &&
                  measurement(row.latency_ms.p95) !== null
                    ? {
                        low: measurement(row.latency_ms.p50) ?? undefined,
                        high: row.latency_ms.p95,
                      }
                    : {}),
                };
              });
            }
            if (!points.length) return [];
            const colorKey = JSON.stringify([
              "kv",
              kase.sku,
              kase.vendor,
              kase.backend,
              kase.fabric,
              kase.workload,
              kase.precision,
              ...topologyKey(kase.topology),
              kind,
              selection.op,
              kind === "paged" ? selection.pageTokens : null,
            ]);
            const sourceName = {
              snapshot: t("官方快照"),
              official: t("官方实时"),
              github: "GitHub CI",
              local: t("本地文件"),
            }[source.origin];
            const provenance = `${sourceName} · attempt ${source.dataset.run.run_attempt}${source.origin === "local" ? ` · ${source.label}` : ""}`;
            return [
              {
                id: `${source.id}:${kase.case_id}:${kind}`,
                label: `${kase.sku} · ${kase.backend} · ${kase.fabric} · ${kase.precision} · ${kind} · #${source.dataset.run.run_id} · ${provenance}`,
                colorKey,
                runIndex,
                points: points
                  .sort((a, b) => a.x - b.x)
                  .map((point) => ({
                    ...point,
                    detail: `${point.detail}\n${provenance}\nsource attempt ${kase.source_run_attempt ?? source.dataset.run.run_attempt} · workload ${kase.workload} · ${kase.topology.nodes}×${kase.topology.gpus_per_node} GPU · ${kase.topology.topology_class}`,
                  })),
              },
            ];
          });
        }),
  );
}
