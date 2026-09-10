import Papa from "papaparse";
import type { Dataset, Operation, Point, Topology } from "./model";

/** Wide, typed records preserve datasets; chart CSV is a separate view export. */
export const DATASET_CSV_SCHEMA = "collectivex-dataset-v1";
export const DATASET_RUN_COUNT_FIELDS = [
  "requested_cases",
  "terminal_cases",
  "measured_cases",
  "unsupported_cases",
  "failed_cases",
  "requested_points",
  "terminal_points",
  "measured_points",
  "kv_requested_cases",
  "kv_measured_cases",
] as const;
const operations: Operation[] = [
  "dispatch",
  "combine",
  "roundtrip",
  "pair_period",
  "stage",
  "isolated_sum",
];
const percentiles = ["p50", "p90", "p95", "p99"] as const;
type Cell = string | number | boolean | null | undefined;
type Row = Record<string, Cell>;
const topologyColumns = [
  "ep",
  "nodes",
  "gpus_per_node",
  "scale_up_domain",
  "scale_up_transport",
  "scale_out_transport",
  "topology_class",
];
const fields = [
  "schema",
  "record_type",
  "dataset_index",
  "version",
  "run_id",
  "run_attempt",
  "generated_at",
  "source_sha",
  "conclusion",
  "run_url",
  ...DATASET_RUN_COUNT_FIELDS,
  "covered_skus_json",
  "series_id",
  "case_id",
  "label",
  "sku",
  "vendor",
  "backend",
  "phase",
  "mode",
  "precision",
  "workload",
  "measurement_semantics",
  "source_run_attempt",
  ...topologyColumns,
  "disposition",
  "outcome",
  "reason",
  "detail",
  "tokens_per_rank",
  "global_tokens",
  "correctness_passed",
  "terminal_status",
  ...operations.flatMap((op) => [
    `${op}_present`,
    `${op}_provenance`,
    `${op}_payload_bytes`,
    `${op}_activation_bytes`,
    ...percentiles.map((p) => `${op}_${p}_us`),
    ...percentiles.map((p) => `${op}_payload_rate_${p}`),
    ...percentiles.map((p) => `${op}_activation_rate_${p}`),
  ]),
  ...percentiles.map((p) => `token_rate_${p}`),
  "fabric",
  "kind",
  "isl",
  "page_tokens",
  "batch",
  "op",
  "descs",
  "req_bytes",
  "prep_ms",
  ...["p50", "p95", "min", "max", "n"].map((p) => `latency_ms_${p}`),
  ...["p50", "p95", "min", "max", "n"].map((p) => `request_ms_${p}`),
  "gbps_p50",
  "gbps_p50_incl_prep",
  "verify_passed",
];
function topology(t: Topology): Row {
  return {
    ep: t.ep_size,
    nodes: t.nodes,
    gpus_per_node: t.gpus_per_node,
    scale_up_domain: t.scale_up_domain,
    scale_up_transport: t.scale_up_transport,
    scale_out_transport: t.scale_out_transport,
    topology_class: t.topology_class,
  };
}
function point(p: Point): Row {
  const row: Row = {
    tokens_per_rank: p.tokens_per_rank,
    global_tokens: p.global_tokens,
    correctness_passed: p.correctness,
  };
  for (const op of operations) {
    const c = p.components[op];
    // Blank: absent; false: explicitly unavailable; true: component object.
    if (c === undefined) continue;
    row[`${op}_present`] = c !== null;
    if (!c) continue;
    row[`${op}_provenance`] = c.provenance;
    row[`${op}_payload_bytes`] = c.payload_bytes;
    row[`${op}_activation_bytes`] = c.activation_bytes;
    for (const pct of percentiles) {
      row[`${op}_${pct}_us`] = c.latency_us[pct];
      row[`${op}_payload_rate_${pct}`] =
        c.payload_data_rate_gbps_at_latency_percentile?.[pct];
      row[`${op}_activation_rate_${pct}`] =
        c.activation_data_rate_gbps_at_latency_percentile?.[pct];
    }
  }
  for (const pct of percentiles)
    row[`token_rate_${pct}`] =
      p.roundtrip_token_rate_at_latency_percentile?.[pct];
  return row;
}

/** Export all datasets, including missing coverage and KV; values retain their original units. */
export function exportDatasetCsv(datasets: Dataset[]): string {
  const rows: Row[] = [];
  for (const [index, dataset] of datasets.entries()) {
    const base: Row = {
      schema: DATASET_CSV_SCHEMA,
      dataset_index: index,
      version: dataset.version,
    };
    const add = (record_type: string, value: Row) =>
      rows.push({ ...base, record_type, ...value });
    const run = dataset.run;
    add("run", {
      run_id: run.run_id,
      run_attempt: run.run_attempt,
      generated_at: run.generated_at,
      source_sha: run.source_sha,
      conclusion: run.conclusion,
      run_url: run.run_url,
      covered_skus_json: JSON.stringify(run.covered_skus),
      ...Object.fromEntries(
        DATASET_RUN_COUNT_FIELDS.map((field) => [field, run[field]]),
      ),
    });
    for (const s of dataset.series) {
      add("ep-series", {
        series_id: s.series_id,
        sku: s.system.sku,
        vendor: s.system.vendor,
        backend: s.backend,
        phase: s.phase,
        mode: s.mode,
        precision: s.precision,
        workload: s.workload,
        source_run_attempt: s.source_run_attempt,
        measurement_semantics: s.measurement_semantics,
        ...topology(s.system),
      });
      for (const p of s.points)
        add("ep-point", { series_id: s.series_id, ...point(p) });
    }
    for (const c of dataset.coverage) {
      add("coverage-case", {
        case_id: c.case_id,
        label: c.label,
        sku: c.sku,
        backend: c.backend,
        phase: c.phase,
        mode: c.mode,
        precision: c.precision,
        disposition: c.disposition,
        outcome: c.outcome,
        reason: c.reason,
        detail: c.detail,
        ...topology(c.topology),
      });
      for (const p of c.points)
        add("coverage-point", { case_id: c.case_id, ...p });
    }
    for (const c of dataset.kv ?? []) {
      add("kv-case", {
        source_run_attempt: c.source_run_attempt,
        case_id: c.case_id,
        label: c.label,
        sku: c.sku,
        vendor: c.vendor,
        backend: c.backend,
        precision: c.precision,
        disposition: c.disposition,
        workload: c.workload,
        fabric: c.fabric,
        outcome: c.outcome,
        reason: c.reason,
        detail: c.detail,
        ...topology(c.topology),
      });
      for (const p of c.rows) {
        const row: Row = {
          case_id: c.case_id,
          kind: p.kind,
          isl: p.isl,
          page_tokens: p.page_tokens,
          batch: p.batch,
          op: p.op,
          descs: p.descs,
          req_bytes: p.req_bytes,
          prep_ms: p.prep_ms,
          gbps_p50: p.gbps_p50,
          gbps_p50_incl_prep: p.gbps_p50_incl_prep,
          verify_passed: p.verify_passed,
        };
        for (const q of ["p50", "p95", "min", "max", "n"] as const) {
          row[`latency_ms_${q}`] = p.latency_ms[q];
          row[`request_ms_${q}`] = p.request_ms?.[q];
        }
        add("kv-point", row);
      }
    }
  }
  return Papa.unparse({ fields, data: rows }, { newline: "\r\n" });
}
