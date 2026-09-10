import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { strToU8 } from "fflate";
import { exportDatasetCsv, DATASET_CSV_SCHEMA } from "../src/export";
import { importFiles, parseDocuments } from "../src/importers";
import type { Dataset } from "../src/model";

function fixture(): Dataset {
  return parseDocuments([
    {
      version: 1,
      run: {
        run_id: "34432070017",
        run_attempt: 2,
        generated_at: "2026-09-10T03:29:13Z",
        source_sha: "abcd",
        conclusion: "failure",
        run_url: "https://github.com/o/r/actions/runs/34432070017",
      },
      series: [
        {
          series_id: 'quoted,"case',
          backend: "nccl-ep",
          mode: "normal",
          phase: "decode",
          precision: "fp8",
          workload: "deepseek-v4-pro",
          measurement_semantics: "kernel=v2;stage_excluded=true",
          system: {
            ep_size: 8,
            nodes: 2,
            gpus_per_node: 4,
            scale_up_domain: 72,
            sku: "gb200",
            vendor: "nvidia",
            scale_up_transport: "mnnvl",
            scale_out_transport: null,
            topology_class: "gb200-mnnvl",
          },
          points: [
            {
              tokens_per_rank: 4,
              global_tokens: 32,
              components: {
                roundtrip: {
                  latency_us: { p50: 20, p99: 25 },
                  payload_bytes: 160000,
                  activation_bytes: 120000,
                  payload_data_rate_gbps_at_latency_percentile: {
                    p50: 1,
                    p99: 0.8,
                  },
                  activation_data_rate_gbps_at_latency_percentile: {
                    p50: 6,
                    p99: 4.8,
                  },
                  provenance: "wire",
                },
                pair_period: {
                  latency_us: { p50: 15 },
                  payload_bytes: 160000,
                  provenance: "chained-median",
                },
                stage: null,
              },
              roundtrip_token_rate_at_latency_percentile: { p50: 1600000 },
            },
          ],
        },
      ],
      coverage: [
        {
          case_id: 'quoted,"case',
          label: "measured case",
          sku: "gb200",
          backend: "nccl-ep",
          mode: "normal",
          phase: "decode",
          precision: "fp8",
          disposition: "runnable",
          outcome: "success",
          topology: {
            ep_size: 8,
            nodes: 2,
            gpus_per_node: 4,
            scale_up_domain: 72,
          },
          points: [
            {
              tokens_per_rank: 4,
              global_tokens: 32,
              terminal_status: "measured",
              reason: null,
            },
            {
              tokens_per_rank: 8,
              global_tokens: 64,
              terminal_status: "pending",
              reason: "not-measured",
            },
          ],
        },
        {
          case_id: "unsupported",
          label: "unsupported case",
          sku: "h100",
          backend: "flashinfer-ep",
          disposition: "unsupported",
          outcome: "unsupported",
          reason: "MNNVL only",
          detail: "Two lines\nwith a comma, preserved",
          topology: { ep_size: 16 },
          points: [],
        },
      ],
      kv: [
        {
          case_id: "kv",
          label: "KV transfer",
          sku: "b200",
          vendor: "nvidia",
          backend: "nixl",
          fabric: "rdma",
          workload: "deepseek-v3",
          precision: "bf16",
          disposition: "runnable",
          outcome: "success",
          topology: { ep_size: 2, nodes: 2, gpus_per_node: 1 },
          rows: [
            {
              kind: "paged",
              op: "pull",
              isl: 1024,
              page_tokens: 16,
              batch: 4,
              descs: 256,
              req_bytes: 1048576,
              prep_ms: 0.25,
              latency_ms: { p50: 2.5, p95: 4.2, n: 16 },
              request_ms: { p50: 1.75, p95: 3.5, n: 64 },
              gbps_p50: 1.6,
              gbps_p50_incl_prep: 1.45,
              verify_passed: true,
            },
          ],
        },
      ],
    },
  ]).datasets[0];
}

async function reload(csv: string) {
  return importFiles([{ name: "workspace.csv", bytes: strToU8(csv) }]);
}

describe("dataset CSV export", () => {
  it("writes explicit units, per-GPU rates, and record identities usable by spreadsheet consumers", () => {
    const csv = exportDatasetCsv([fixture()]);
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true });
    expect(parsed.errors).toEqual([]);
    const row = parsed.data.find((r) => r.record_type === "ep-point")!;
    expect(row.schema).toBe(DATASET_CSV_SCHEMA);
    expect(row.roundtrip_p50_us).toBe("20");
    expect(row.roundtrip_payload_rate_p50).toBe("1");
    expect(row.pair_period_p50_us).toBe("15");
    expect(row.pair_period_p99_us).toBe("");
    expect(row.stage_present).toBe("false");
    expect(row.dispatch_present).toBe("");
    const system = parsed.data.find((r) => r.record_type === "ep-series")!;
    expect(system.ep).toBe("8");
    expect(system.scale_up_domain).toBe("72");
  });

  it("restores run, topology, all metric components, and missing-tail semantics", async () => {
    const { datasets, warnings } = await reload(exportDatasetCsv([fixture()]));
    expect(warnings).toEqual([]);
    const d = datasets[0],
      s = d.series[0],
      p = s.points[0];
    expect(d.run.run_id).toBe("34432070017");
    expect(d.run.run_attempt).toBe(2);
    expect(d.run.conclusion).toBe("failure");
    expect(d.run.source_sha).toBe("abcd");
    expect(s.series_id).toBe('quoted,"case');
    expect(s.system).toMatchObject({
      ep_size: 8,
      nodes: 2,
      gpus_per_node: 4,
      scale_up_domain: 72,
      scale_up_transport: "mnnvl",
    });
    expect(s.measurement_semantics).toBe("kernel=v2;stage_excluded=true");
    expect(p.components.roundtrip?.latency_us).toEqual({ p50: 20, p99: 25 });
    expect(
      p.components.roundtrip?.payload_data_rate_gbps_at_latency_percentile,
    ).toEqual({ p50: 1, p99: 0.8 });
    expect(
      p.components.roundtrip?.activation_data_rate_gbps_at_latency_percentile,
    ).toEqual({ p50: 6, p99: 4.8 });
    expect(p.components.pair_period?.latency_us).toEqual({ p50: 15 });
    expect(p.components.pair_period?.provenance).toBe("chained-median");
    expect(p.components.stage).toBeNull();
    expect(p.components.dispatch).toBeUndefined();
    expect(p.roundtrip_token_rate_at_latency_percentile?.p50).toBe(1600000);
  });

  it("keeps absent/unsupported coverage and KV millisecond quantities", async () => {
    const result = (await reload(exportDatasetCsv([fixture()]))).datasets[0];
    expect(result.coverage[0].points.map((p) => p.terminal_status)).toEqual([
      "measured",
      "pending",
    ]);
    expect(result.coverage[1].outcome).toBe("unsupported");
    expect(result.coverage[1].detail).toBe(
      "Two lines\nwith a comma, preserved",
    );
    expect(result.coverage[1].points).toEqual([]);
    expect(result.kv?.[0].rows[0]).toMatchObject({
      latency_ms: { p50: 2.5, p95: 4.2, n: 16 },
      request_ms: { p50: 1.75, p95: 3.5, n: 64 },
      gbps_p50: 1.6,
      gbps_p50_incl_prep: 1.45,
      verify_passed: true,
    });
    expect(result.run.requested_cases).toBe(3);
    expect(result.run.measured_cases).toBe(2);
  });

  it("preserves independent imported datasets even when run and series ids are identical", async () => {
    const a = fixture(),
      b = fixture();
    b.series[0].points[0].components.roundtrip!.latency_us.p50 = 50;
    const { datasets } = await reload(exportDatasetCsv([a, b]));
    expect(datasets).toHaveLength(2);
    expect(
      datasets.map(
        (d) => d.series[0].points[0].components.roundtrip!.latency_us.p50,
      ),
    ).toEqual([20, 50]);
  });

  it("reads reordered CSV records and rejects orphan or corrupted dataset records", async () => {
    const parsed = Papa.parse<Record<string, string>>(
      exportDatasetCsv([fixture()]),
      { header: true },
    );
    const reversed = Papa.unparse([...parsed.data].reverse());
    expect((await reload(reversed)).datasets[0].series[0].points).toHaveLength(
      1,
    );
    const noRun = Papa.unparse(
      parsed.data.filter((r) => r.record_type !== "run"),
    );
    const result = await reload(noRun);
    expect(result.datasets).toHaveLength(0);
    expect(result.warnings.join(" ")).toContain("恰好一条 run");
  });

  it("identifies chart CSV as a view export rather than silently pretending to import it", async () => {
    const result = await reload(
      "series_id,series_label,x,y,x_axis,y_axis,operation,percentile,detail\na,A,4,20,Tokens,Latency,roundtrip,p50,test\n",
    );
    expect(result.datasets).toHaveLength(0);
    expect(result.warnings.join(" ")).toContain("图表视图 CSV");
  });
});

describe("authoritative summaries and incomplete KV metrics", () => {
  it("keeps official aggregate counts through CSV even when returned rows cover a subset", async () => {
    const input = fixture();
    input.run.requested_cases = 99;
    input.run.requested_points = 1234;
    input.run.kv_requested_cases = 17;
    input.run.covered_skus = ["b200", "gb200", "h100", "unreturned-sku"];
    const d = (await reload(exportDatasetCsv([input]))).datasets[0];
    expect(d.run.requested_cases).toBe(99);
    expect(d.run.requested_points).toBe(1234);
    expect(d.run.kv_requested_cases).toBe(17);
    expect(d.run.covered_skus).toEqual([
      "b200",
      "gb200",
      "h100",
      "unreturned-sku",
    ]);
  });

  it("retains a KV latency observation with no measured bandwidth instead of exporting zero", async () => {
    const d = fixture();
    d.kv![0].rows[0].gbps_p50 = null;
    const csv = exportDatasetCsv([d]);
    const row = Papa.parse<Record<string, string>>(csv, {
      header: true,
    }).data.find((r) => r.record_type === "kv-point")!;
    expect(row.gbps_p50).toBe("");
    const result = (await reload(csv)).datasets[0].kv![0].rows[0];
    expect(result.gbps_p50).toBeNull();
    expect(result.latency_ms.p50).toBe(2.5);
  });
});
