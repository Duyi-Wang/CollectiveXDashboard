import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { importFiles, parseDocuments } from "../src/importers";

// Contract fixture from run 34432070017, artifact 10135329362. These hand-picked
// values deliberately distinguish roundtrip, chained period, and percentile sums.
function native(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    record_type: "case-attempt",
    generated_at: "2026-09-10T03:29:13Z",
    identity: {
      case_id:
        "h100-dgxc-nccl-ep-deepseek-v4-pro-normal-decode-ep16-uniform-bf16",
      attempt_ordinal: 1,
      allocation_factors: {
        run_id: "34432070017",
        run_attempt: "1",
        source_sha: "fed9aed93157d3ae689cd34b5997f0a9029fd961",
      },
      case_factors: {
        sku: "h100-dgxc",
        case: {
          backend: "nccl-ep",
          ep: 16,
          nodes: 2,
          gpus_per_node: 8,
          scale_up_domain: 8,
          scale_up_transport: "nvlink",
          scale_out_transport: "rdma",
          topology_class: "h100-nvlink-rdma",
          workload: "deepseek-v4-pro",
          mode: "normal",
          phase: "decode",
          precision: "bf16",
          suite: "ep-core",
          ladder: "1 2 4",
        },
      },
    },
    measurement: {
      rows: [
        {
          tokens_per_rank: 1,
          global_tokens: 16,
          components: {
            dispatch: {
              availability: "measured",
              percentiles_us: {
                p50: 224.12799298763275,
                p99: 246.97600305080414,
              },
              sample_count: 2048,
            },
            combine: {
              availability: "measured",
              percentiles_us: { p50: 86.59200370311737 },
              sample_count: 2048,
            },
            roundtrip: {
              availability: "measured",
              percentiles_us: {
                p50: 289.95200991630554,
                p99: 318.08000802993774,
              },
              sample_count: 2048,
            },
            pair_period: {
              availability: "measured",
              origin: "chained-median",
              percentiles_us: { p50: 269.27998661994934 },
              sample_count: 448,
            },
            isolated_sum: {
              availability: "derived",
              percentiles_us: { p50: 310.7199966907501 },
              sample_count: 0,
            },
            stage: {
              availability: "unavailable",
              percentiles_us: null,
              sample_count: 0,
            },
          },
          byte_provenance: {
            roundtrip: { total_logical_bytes: 111, activation_data_bytes: 100 },
          },
          wire_byte_provenance: {
            roundtrip: {
              total_logical_bytes: 2351104,
              activation_data_bytes: 2351104,
            },
          },
          correctness: { passed: true },
        },
      ],
    },
    implementation: {
      name: "nccl-ep",
      kernel_generation: "nccl-ep-v02-ht-routed",
    },
    runtime: { vendor: "nvidia" },
    outcome: { status: "success", reasons: [] },
    ...overrides,
  };
}
function matrix(doc = native()) {
  return {
    version: 1,
    requested_cases: [
      {
        sku: "h100-dgxc",
        disposition: "runnable",
        case: {
          ...doc.identity.case_factors.case,
          case_id: doc.identity.case_id,
        },
      },
    ],
  };
}
function first(raw = native()) {
  return parseDocuments([raw]).datasets[0].series[0].points[0];
}

describe("native CollectiveX contracts", () => {
  it("keeps real chained and fresh-entry measurements separate and computes per-GPU wire bandwidth", () => {
    const p = first();
    expect(p.components.roundtrip?.latency_us.p50).toBe(289.95200991630554);
    expect(p.components.pair_period?.latency_us.p50).toBe(269.27998661994934);
    expect(p.components.pair_period?.provenance).toBe("chained-median");
    expect(
      p.components.roundtrip?.payload_data_rate_gbps_at_latency_percentile?.p50,
    ).toBeCloseTo(0.5067873129847084, 12);
    expect(
      p.components.roundtrip?.activation_data_rate_gbps_at_latency_percentile
        ?.p50,
    ).toBeCloseTo(8.108597007755334, 12);
    expect(p.components.roundtrip?.payload_bytes).toBe(2351104);
    expect(p.components.pair_period?.payload_bytes).toBe(2351104);
    expect(p.components.combine?.latency_us.p99).toBeUndefined();
    expect(p.components.stage).toBeNull();
    expect(
      p.components.isolated_sum?.payload_data_rate_gbps_at_latency_percentile,
    ).toBeNull();
  });

  it("reads pre-pair PR-era records without inventing precision or percentiles", () => {
    const old = native();
    const row = old.measurement.rows[0];
    delete (row.components as Record<string, unknown>).pair_period;
    delete (old.identity.case_factors.case as Record<string, unknown>)
      .precision;
    Object.assign(old.measurement, { dispatch_dtype: "bf16" });
    delete (row as Record<string, unknown>).wire_byte_provenance;
    row.byte_provenance.roundtrip = {
      total_logical_bytes: 1175552,
      activation_data_bytes: 1175552,
    };
    const result = parseDocuments([old]).datasets[0];
    expect(result.series[0].precision).toBe("bf16");
    expect(result.series[0].points[0].components.pair_period).toBeUndefined();
    expect(result.series[0].points[0].components.roundtrip?.payload_bytes).toBe(
      1175552,
    );
  });

  it("uses matrix coverage for unsupported, pending, explicit dropped, and invalid points", () => {
    const raw = native({ workload: { ladder_dropped: [4] } });
    const m = matrix(raw);
    m.requested_cases.push({
      sku: "mi355x",
      disposition: "unsupported",
      case: { ...raw.identity.case_factors.case, case_id: "unsupported" },
    });
    const result = parseDocuments([raw, m]).datasets[0];
    expect(result.coverage[0].points.map((p) => p.terminal_status)).toEqual([
      "measured",
      "pending",
      "unsupported",
    ]);
    expect(result.coverage[1].outcome).toBe("unsupported");
    expect(result.run.requested_cases).toBe(2);
    expect(result.run.measured_cases).toBe(1);
    expect(result.run.measured_points).toBe(1);
    expect(result.series).toHaveLength(1);

    raw.measurement.rows[0].correctness.passed = false;
    const invalid = parseDocuments([raw, m]);
    expect(invalid.datasets[0].series[0].points).toHaveLength(0);
    expect(invalid.datasets[0].coverage[0].points[0].terminal_status).toBe(
      "invalid",
    );
    expect(invalid.warnings.join(" ")).toContain("correctness");
  });

  it("does not plot failed attempts and prefers newest attempts without averaging", () => {
    const older = native();
    const newer = native({
      outcome: { status: "invalid", reasons: ["oracle failed"] },
    });
    newer.identity.attempt_ordinal = 2;
    const { datasets, warnings } = parseDocuments([newer, older]);
    expect(datasets[0].series).toHaveLength(0);
    expect(datasets[0].coverage[0].outcome).toBe("invalid");
    expect(datasets[0].coverage[0].reason).toBe("oracle failed");
    expect(warnings.join(" ")).toContain("最新 attempt");
  });

  it("keeps run attempts distinct and avoids applying an ambiguous matrix to both", () => {
    const a = native(),
      b = native();
    b.identity.allocation_factors.run_attempt = "2";
    const result = parseDocuments([matrix(), a, b]);
    expect(result.datasets.map((d) => d.run.run_attempt)).toEqual([1, 2]);
    expect(result.warnings.join(" ")).toContain("无法唯一对应");
  });

  it("retains a matrix-only pending run and explicit supplied GitHub provenance", () => {
    const result = parseDocuments([matrix()], {
      run: {
        run_id: "42",
        generated_at: "2026-09-10",
        source_sha: "sha",
        html_url: "https://github.com/o/r/actions/runs/42",
      },
    });
    expect(result.datasets[0].run.run_id).toBe("42");
    expect(result.datasets[0].run.source_sha).toBe("sha");
    expect(result.datasets[0].run.run_url).toContain("/42");
    expect(result.datasets[0].run.measured_cases).toBe(0);
    expect(result.datasets[0].coverage[0].outcome).toBe("pending");
  });
});

describe("official assembled datasets", () => {
  it("retains official per-GPU rates and never fabricates missing pair_period", () => {
    const input = {
      version: 1,
      run: { run_id: "34432070017", run_attempt: 1 },
      coverage: [],
      series: [
        {
          series_id: "official",
          phase: "decode",
          mode: "normal",
          precision: "bf16",
          backend: "nccl-ep",
          system: { ep_size: 16, sku: "h100-dgxc", vendor: "nvidia" },
          points: [
            {
              tokens_per_rank: 1,
              global_tokens: 16,
              components: {
                roundtrip: {
                  latency_us: { p50: 289.95200991630554 },
                  payload_bytes: 2351104,
                  payload_data_rate_gbps_at_latency_percentile: {
                    p50: 0.5067873129847084,
                  },
                  activation_data_rate_gbps_at_latency_percentile: {
                    p50: 8.108597007755334,
                  },
                },
                stage: null,
              },
            },
          ],
        },
      ],
    };
    const result = parseDocuments([input]).datasets[0];
    const p = result.series[0].points[0];
    expect(
      p.components.roundtrip?.payload_data_rate_gbps_at_latency_percentile?.p50,
    ).toBe(0.5067873129847084);
    expect(
      p.components.roundtrip?.activation_data_rate_gbps_at_latency_percentile
        ?.p50,
    ).toBe(8.108597007755334);
    expect(p.components.roundtrip?.latency_us.p99).toBeUndefined();
    expect(p.components.pair_period).toBeUndefined();
    expect(result.run.measured_cases).toBe(1);
  });

  it("rejects invalid numeric latency values instead of coercing nulls to zero", () => {
    const raw = native();
    Object.assign(raw.measurement.rows[0].components.roundtrip.percentiles_us, {
      p50: null,
      p90: Infinity,
      p95: -1,
      p99: "0",
    });
    expect(first(raw).components.roundtrip).toBeNull();
  });

  it("keeps KV data in its native milliseconds rather than interpreting it as EP latency", () => {
    const input = {
      version: 1,
      run: { run_id: "kv" },
      series: [],
      coverage: [],
      kv: [
        {
          case_id: "kv",
          sku: "b200",
          backend: "nixl",
          outcome: "success",
          rows: [
            {
              kind: "bulk",
              op: "pull",
              isl: 1024,
              batch: 4,
              req_bytes: 1048576,
              latency_ms: { p50: 2.5, p95: 4.2, n: 16 },
              gbps_p50: 1.6,
              verify_passed: true,
            },
          ],
        },
      ],
    };
    const result = parseDocuments([input]).datasets[0];
    expect(result.series).toHaveLength(0);
    expect(result.kv?.[0].rows[0].latency_ms.p50).toBe(2.5);
    expect(result.run.kv_measured_cases).toBe(1);
  });
});

describe("local file imports", () => {
  it("accepts a shard ZIP and matrix ZIP together, preserving matrix run identity", async () => {
    const result = await importFiles([
      {
        name: "cxshard-h100-dgxc-nccl-ep-bf16-n2-34432070017-1.zip",
        bytes: zipSync({ "case.json": strToU8(JSON.stringify(native())) }),
      },
      {
        name: "cxsweep-matrix-34432070017.zip",
        bytes: zipSync({
          "matrix_full.json": strToU8(JSON.stringify(matrix())),
        }),
      },
    ]);
    expect(result.datasets).toHaveLength(1);
    expect(result.datasets[0].coverage[0].points).toHaveLength(3);
    expect(result.warnings).toHaveLength(0);
  });

  it("accepts JSONL with recoverable broken lines and CSV quoting without filling missing tails", async () => {
    const csv =
      'case_id,sku,backend,mode,phase,ep,run_id,tokens_per_rank,global_tokens,roundtrip_p50_us,roundtrip_logical_bytes,correctness_passed\n"quoted,case",mi355x,mori,normal,decode,8,77,4,32,20,160000,True\n';
    const result = await importFiles([
      { name: "points.csv", bytes: strToU8(csv) },
      {
        name: "attempts.jsonl",
        bytes: strToU8(`${JSON.stringify(native())}\nnot JSON\n`),
      },
    ]);
    expect(result.datasets).toHaveLength(2);
    const p = result.datasets.find((d) => d.run.run_id === "77")!.series[0]
      .points[0];
    expect(p.components.roundtrip?.latency_us).toEqual({ p50: 20 });
    expect(
      p.components.roundtrip?.payload_data_rate_gbps_at_latency_percentile?.p50,
    ).toBe(1);
    expect(result.warnings.join(" ")).toContain("第 2 行");
  });

  it("reports corrupted ZIPs while preserving other readable files", async () => {
    const result = await importFiles([
      { name: "broken.zip", bytes: strToU8("broken") },
      { name: "good.json", bytes: strToU8(JSON.stringify(native())) },
    ]);
    expect(result.datasets).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("ZIP 读取失败");
  });

  it("round-trips dashboard dataset exports and ignores unrelated documents with a warning", () => {
    const initial = parseDocuments([native()]).datasets[0];
    const result = parseDocuments([
      { datasets: [{ id: "source-1", dataset: initial }] },
      { hello: "world" },
    ]);
    expect(
      result.datasets[0].series[0].points[0].components.pair_period?.latency_us
        .p50,
    ).toBe(269.27998661994934);
    expect(result.warnings.join(" ")).toContain("无法识别");
  });
});

describe("partial and bounded imports", () => {
  it("reads pair-only measurements without synthesizing a roundtrip latency", () => {
    const raw = native();
    delete (raw.measurement.rows[0].components as Record<string, unknown>)
      .roundtrip;
    const p = first(raw);
    expect(p.components.roundtrip).toBeUndefined();
    expect(p.components.pair_period?.latency_us.p50).toBe(269.27998661994934);
    expect(p.components.pair_period?.latency_us.p99).toBeUndefined();
  });

  it("refuses oversized ZIP entries before allocating their declared expanded size", async () => {
    const bytes = zipSync({ "huge.json": strToU8("{}") });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < bytes.length - 28; i++) {
      if (view.getUint32(i, true) === 0x02014b50)
        view.setUint32(i + 24, 300 * 1024 * 1024, true);
    }
    const result = await importFiles([{ name: "huge.zip", bytes }]);
    expect(result.datasets).toEqual([]);
    expect(result.warnings.join(" ")).toContain("250 MiB");
  });

  it("reports the physical JSONL line number despite preceding blank lines", async () => {
    const result = await importFiles([
      {
        name: "rows.jsonl",
        bytes: strToU8(`\n\n${JSON.stringify(native())}\n\nbroken\n`),
      },
    ]);
    expect(result.datasets).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("第 5 行");
  });
});

it("preserves valid official run summary fields and derives missing counts only", () => {
  const input = parseDocuments([native()]).datasets[0];
  input.run.requested_cases = 100;
  input.run.measured_cases = 95;
  input.run.covered_skus = ["h100-dgxc", "h200-dgxc"];
  delete (input.run as unknown as Record<string, unknown>).requested_points;
  const result = parseDocuments([input]).datasets[0];
  expect(result.run.requested_cases).toBe(100);
  expect(result.run.measured_cases).toBe(95);
  expect(result.run.covered_skus).toEqual(["h100-dgxc", "h200-dgxc"]);
  expect(result.run.requested_points).toBe(3);
});

describe("selected GitHub attempt assembly", () => {
  it("combines unchanged cells from earlier attempts with a partial rerun and preserves provenance", () => {
    const a = native(),
      b = native();
    b.identity.case_id = "other-cell";
    b.identity.allocation_factors.run_attempt = "2";
    const m = matrix(a);
    m.requested_cases.push({
      sku: "h100-dgxc",
      disposition: "runnable",
      case: { ...b.identity.case_factors.case, case_id: "other-cell" },
    });
    const result = parseDocuments([m, a, b], {
      run: {
        run_id: "34432070017",
        run_attempt: 2,
        generated_at: "2026-09-11",
        conclusion: "success",
      },
    });
    expect(result.datasets).toHaveLength(1);
    expect(result.datasets[0].run.run_attempt).toBe(2);
    expect(result.datasets[0].series.map((s) => s.source_run_attempt)).toEqual([
      1, 2,
    ]);
    expect(result.datasets[0].series).toHaveLength(2);
    expect(result.warnings.join(" ")).toContain("未重跑");
  });
});
