import { describe, expect, it } from "vitest";
import {
  buildKvSeries,
  fitAlphaBeta,
  metricValue,
  seriesColorKey,
} from "../src/metrics";
import type {
  Dataset,
  KvCase,
  KvRow,
  LoadedDataset,
  Point,
  Series,
  Topology,
} from "../src/model";

const topology: Topology = {
  ep_size: 8,
  nodes: 1,
  gpus_per_node: 8,
  scale_up_domain: 8,
  scale_up_transport: "nvlink",
  scale_out_transport: null,
  topology_class: "single-node",
};
const point = (latency: number, bytes = 8000): Point => ({
  tokens_per_rank: 4,
  global_tokens: 32,
  components: {
    roundtrip: {
      latency_us: { p50: latency },
      payload_bytes: bytes,
      payload_data_rate_gbps_at_latency_percentile: { p50: 10 },
      activation_data_rate_gbps_at_latency_percentile: { p50: 80 },
    },
  },
});
const series = (points: Point[]): Series => ({
  series_id: "s1",
  mode: "normal",
  phase: "decode",
  precision: "fp8",
  backend: "nccl",
  system: { ...topology, sku: "h200-dgxc", vendor: "nvidia" },
  workload: "deepseek-v4",
  points,
});
const row = (
  batch: number,
  gbps: number,
  overrides: Partial<KvRow> = {},
): KvRow => ({
  kind: "paged",
  isl: 2048,
  page_tokens: 256,
  batch,
  op: "pull",
  descs: 12,
  req_bytes: 1e6,
  prep_ms: 0.1,
  latency_ms: { p50: 1, p95: 2 },
  gbps_p50: gbps,
  verify_passed: true,
  ...overrides,
});
const kvCase = (rows: KvRow[]): KvCase => ({
  case_id: "kv1",
  label: "KV",
  disposition: "runnable",
  sku: "h200-dgxc",
  vendor: "nvidia",
  backend: "mooncake",
  fabric: "rdma",
  workload: "kv-dsv4",
  precision: "fp8",
  topology,
  outcome: "success",
  reason: null,
  detail: null,
  rows,
});
const loaded = (kv: KvCase[], id = "one"): LoadedDataset => ({
  id,
  label: id,
  origin: "local",
  visible: true,
  loadedAt: "",
  dataset: {
    version: 1,
    run: {
      run_id: "123",
      run_attempt: 1,
      generated_at: "",
      conclusion: "success",
      source_sha: "abc",
      requested_cases: 0,
      terminal_cases: 0,
      measured_cases: 0,
      unsupported_cases: 0,
      failed_cases: 0,
      requested_points: 0,
      terminal_points: 0,
      measured_points: 0,
      covered_skus: [],
    },
    coverage: [],
    series: [],
    kv,
  } satisfies Dataset,
});

describe("metricValue preserves measurement semantics", () => {
  it("uses the existing per-GPU payload rate without dividing by EP again", () => {
    expect(metricValue(point(10), "roundtrip", "p50", "payload")).toBe(10);
    expect(metricValue(point(10), "roundtrip", "p50", "activation")).toBe(80);
    expect(metricValue(point(10), "roundtrip", "p50", "tokens")).toBe(3.2e6);
  });
  it("does not fill absent operations, quantiles or rate fields", () => {
    expect(metricValue(point(10), "pair_period", "p50", "latency")).toBeNull();
    expect(metricValue(point(10), "roundtrip", "p99", "latency")).toBeNull();
    expect(metricValue(point(10), "roundtrip", "p99", "payload")).toBeNull();
    const p = point(10);
    delete p.components.roundtrip!.payload_data_rate_gbps_at_latency_percentile;
    expect(metricValue(p, "roundtrip", "p50", "payload")).toBeNull();
  });
  it("rejects correctness-failed points without changing their position on the ladder", () => {
    const p = { ...point(10), correctness: false };
    for (const metric of [
      "latency",
      "payload",
      "activation",
      "tokens",
    ] as const) {
      expect(metricValue(p, "roundtrip", "p50", metric)).toBeNull();
    }
  });
  it("calculates pair-period token cadence separately and rejects derived component token rates", () => {
    const p = point(10);
    p.components.pair_period = { latency_us: { p50: 8 } };
    p.components.isolated_sum = { latency_us: { p50: 15 } };
    p.components.dispatch = { latency_us: { p50: 4 } };
    expect(metricValue(p, "pair_period", "p50", "tokens")).toBe(4e6);
    expect(metricValue(p, "isolated_sum", "p50", "tokens")).toBeNull();
    expect(metricValue(p, "dispatch", "p50", "tokens")).toBeNull();
  });
  it("rejects nonfinite/negative measurements and division by zero, retaining measured zero latency", () => {
    for (const value of [Infinity, NaN, -1]) {
      expect(
        metricValue(point(value), "roundtrip", "p50", "latency"),
      ).toBeNull();
      expect(
        metricValue(point(value), "roundtrip", "p50", "tokens"),
      ).toBeNull();
    }
    expect(metricValue(point(0), "roundtrip", "p50", "latency")).toBe(0);
    expect(metricValue(point(0), "roundtrip", "p50", "tokens")).toBeNull();
    expect(metricValue(point(0), "roundtrip", "p50", "payload")).toBeNull();
  });
});

describe("alpha/beta fit", () => {
  it("fits per-GPU bytes with the correct microsecond/GB conversion", () => {
    const s = series([point(12, 8e5), point(22, 48e5), point(32, 88e5)]);
    const result = fitAlphaBeta(s, "roundtrip", "p50");
    expect(result?.alphaUs).toBeCloseTo(10);
    expect(result?.betaGbps).toBeCloseTo(50);
    expect(result?.pointCount).toBe(3);
    expect(result?.rSquared).toBeCloseTo(1);
    expect(result?.betaReliable).toBe(true);
    expect(result?.alphaExtrapolated).toBe(false);
  });
  it("requires at least three valid observations, varying byte sizes and a positive slope", () => {
    expect(
      fitAlphaBeta(series([point(10), point(20)]), "roundtrip", "p50"),
    ).toBeNull();
    expect(
      fitAlphaBeta(
        series([point(10), point(20), point(30)]),
        "roundtrip",
        "p50",
      ),
    ).toBeNull();
    expect(
      fitAlphaBeta(
        series([point(30, 100), point(20, 200), point(10, 300)]),
        "roundtrip",
        "p50",
      ),
    ).toBeNull();
    expect(
      fitAlphaBeta(
        series([point(10, 100), point(20, 200), point(NaN, 300)]),
        "roundtrip",
        "p50",
      ),
    ).toBeNull();
    expect(
      fitAlphaBeta(
        series([point(10, 100), point(20, 200), point(30, 300)]),
        "pair_period",
        "p50",
      ),
    ).toBeNull();
  });
  it("flags startup-dominated extrapolation instead of claiming a reliable link ceiling", () => {
    const result = fitAlphaBeta(
      series([point(1001, 8e6), point(1002, 16e6), point(1003, 24e6)]),
      "roundtrip",
      "p50",
    );
    expect(result?.rSquared).toBeCloseTo(1);
    expect(result?.betaReliable).toBe(false);
    expect(result?.alphaExtrapolated).toBe(true);
  });
  it("excludes correctness-failed points from the fit even when they contain finite values", () => {
    const s = series([
      point(12, 8e5),
      point(22, 48e5),
      { ...point(999, 68e5), correctness: false },
      point(32, 88e5),
    ]);
    const result = fitAlphaBeta(s, "roundtrip", "p50");
    expect(result?.alphaUs).toBeCloseTo(10);
    expect(result?.betaGbps).toBeCloseTo(50);
    expect(result?.pointCount).toBe(3);
  });
});

describe("configuration isolation", () => {
  it("keeps colors stable across run identities while distinguishing physical and workload settings", () => {
    const first = series([]);
    expect(seriesColorKey({ ...first, series_id: "another-run:s1" })).toBe(
      seriesColorKey(first),
    );
    const changed: Series[] = [
      { ...first, workload: "another-workload" },
      { ...first, mode: "low-latency" },
      { ...first, precision: "bf16" },
      { ...first, phase: "prefill" },
      { ...first, backend: "deepep" },
      { ...first, measurement_semantics: "chained-median" },
      { ...first, system: { ...first.system, sku: "h200-other-fabric" } },
      { ...first, system: { ...first.system, ep_size: 16 } },
      { ...first, system: { ...first.system, scale_out_transport: "rdma" } },
    ];
    for (const s of changed)
      expect(seriesColorKey(s)).not.toBe(seriesColorKey(first));
  });
});

describe("KV math", () => {
  it("normalizes overlap by batch 1 from the identical ISL, page size and direction", () => {
    const data = loaded([
      kvCase([
        row(1, 10),
        row(2, 15),
        row(1, 30, { isl: 4096 }),
        row(2, 60, { isl: 4096 }),
        row(1, 99, { page_tokens: 512 }),
        row(1, 99, { op: "push" }),
      ]),
    ]);
    const defaults = buildKvSeries([data], {
      view: "overlap",
      op: "pull",
      pageTokens: 256,
    });
    expect(defaults[0].points.map((p) => p.y)).toEqual([1, 2]);
    const selected = buildKvSeries([data], {
      view: "overlap",
      op: "pull",
      pageTokens: 256,
      isl: 2048,
    });
    expect(selected[0].points.map((p) => p.y)).toEqual([1, 1.5]);
  });
  it("requires a measured positive baseline and never borrows one from another ISL", () => {
    const data = loaded([kvCase([row(1, 10), row(2, 20, { isl: 4096 })])]);
    expect(
      buildKvSeries([data], { view: "overlap", op: "pull", pageTokens: 256 }),
    ).toEqual([]);
    expect(
      buildKvSeries([loaded([kvCase([row(1, 0), row(2, 20)])])], {
        view: "overlap",
        op: "pull",
        pageTokens: 256,
      }),
    ).toEqual([]);
  });
  it("selects the best batch at each ISL for the frontier and isolates bulk from paged", () => {
    const data = loaded([
      kvCase([
        row(1, 10),
        row(2, 15),
        row(1, 30, { isl: 4096 }),
        row(4, 90, { verify_passed: false }),
        row(1, 100, { kind: "bulk", page_tokens: null }),
      ]),
    ]);
    const result = buildKvSeries([data], {
      view: "frontier",
      op: "pull",
      pageTokens: 256,
    });
    expect(result).toHaveLength(2);
    expect(result[0].points.map(({ x, y }) => [x, y])).toEqual([
      [2048, 15],
      [4096, 30],
    ]);
    expect(result[1].points[0].y).toBe(100);
    expect(result[1].colorKey).not.toBe(result[0].colorKey);
  });
  it("retains failed rows as gaps and excludes unsuccessful cases and hidden datasets", () => {
    const data = loaded([
      kvCase([row(1, 10), row(2, 20, { verify_passed: false }), row(4, 30)]),
    ]);
    expect(
      buildKvSeries([data], {
        view: "bandwidth",
        op: "pull",
        pageTokens: 256,
      })[0].points.map((p) => p.y),
    ).toEqual([10, null, 30]);
    expect(
      buildKvSeries([{ ...data, visible: false }], {
        view: "bandwidth",
        op: "pull",
        pageTokens: 256,
      }),
    ).toEqual([]);
    expect(
      buildKvSeries(
        [loaded([{ ...kvCase([row(1, 10)]), outcome: "invalid" }])],
        { view: "bandwidth", op: "pull", pageTokens: 256 },
      ),
    ).toEqual([]);
  });
  it("uses burst latency, preserving missing p95 bands and separate run identities", () => {
    const data = loaded([
      kvCase([
        row(1, 10, { latency_ms: { p50: 2 }, request_ms: { p50: 0.5 } }),
      ]),
    ]);
    const result = buildKvSeries([data, { ...data, id: "two" }], {
      view: "latency",
      op: "pull",
      pageTokens: 256,
    });
    expect(result[0].points[0].y).toBe(2);
    expect(result[0].points[0].high).toBeUndefined();
    expect(result[0].id).not.toBe(result[1].id);
    expect(result[0].colorKey).toBe(result[1].colorKey);
  });
  it("distinguishes source and attempt labels when the same KV case is imported more than once", () => {
    const data = loaded([kvCase([row(1, 10)])]);
    const official = {
      ...data,
      id: "official:123",
      origin: "official" as const,
      dataset: {
        ...data.dataset,
        run: { ...data.dataset.run, run_attempt: 2 },
      },
    };
    const result = buildKvSeries([data, official], {
      view: "bandwidth",
      op: "pull",
      pageTokens: 256,
    });
    expect(result[0].id).not.toBe(result[1].id);
    expect(result[0].label).toContain("Local files");
    expect(result[1].label).toContain("Official live · attempt 2");
    expect(result[0].points[0].detail).toContain("Local files");
  });
});
