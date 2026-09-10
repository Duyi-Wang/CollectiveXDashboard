/** Public API compatible fields; extensions preserve newer harness measurements. */
export type Percentile = "p50" | "p90" | "p95" | "p99";
export type Percentiles = Partial<Record<Percentile, number>>;
export type Operation =
  | "dispatch"
  | "stage"
  | "combine"
  | "roundtrip"
  | "pair_period"
  | "isolated_sum";
export type Metric = "latency" | "payload" | "activation" | "tokens";
export interface Component {
  latency_us: Percentiles;
  activation_data_rate_gbps_at_latency_percentile?: Percentiles | null;
  payload_data_rate_gbps_at_latency_percentile?: Percentiles | null;
  payload_bytes?: number | null;
  activation_bytes?: number | null;
  provenance?: string;
}
export interface Point {
  correctness?: boolean;
  tokens_per_rank: number;
  global_tokens: number;
  components: Partial<Record<Operation, Component | null>>;
  roundtrip_token_rate_at_latency_percentile?: Percentiles;
}
export interface Topology {
  ep_size: number;
  nodes: number;
  gpus_per_node: number;
  scale_up_domain: number;
  scale_up_transport: string;
  scale_out_transport: string | null;
  topology_class: string;
}
export interface Series {
  series_id: string;
  phase: string;
  mode: string;
  precision: string;
  backend: string;
  system: Topology & { sku: string; vendor: string };
  points: Point[];
  workload?: string;
  measurement_semantics?: string;
  source_run_attempt?: number;
}
export interface Coverage {
  case_id: string;
  label: string;
  disposition: string;
  sku: string;
  backend: string;
  phase: string;
  mode: string;
  precision: string;
  topology: Topology;
  points: {
    tokens_per_rank: number;
    global_tokens: number;
    terminal_status: string;
    reason: string | null;
  }[];
  outcome: string;
  reason: string | null;
  detail: string | null;
}
export interface KvLatency {
  p50?: number;
  p95?: number;
  min?: number;
  max?: number;
  n?: number;
}
export interface KvRow {
  kind: "paged" | "bulk";
  isl: number;
  page_tokens: number | null;
  batch: number;
  op: "pull" | "push";
  descs: number;
  req_bytes: number;
  prep_ms: number;
  latency_ms: KvLatency;
  request_ms?: KvLatency;
  gbps_p50: number | null;
  gbps_p50_incl_prep?: number;
  verify_passed: boolean;
}
export interface KvCase {
  source_run_attempt?: number;
  case_id: string;
  label: string;
  disposition: string;
  sku: string;
  vendor: string | null;
  backend: string;
  fabric: string;
  workload: string;
  precision: string;
  topology: Topology;
  outcome: string;
  reason: string | null;
  detail: string | null;
  rows: KvRow[];
}
export interface Run {
  run_id: string;
  run_attempt: number;
  generated_at: string;
  conclusion: string | null;
  source_sha: string;
  requested_cases: number;
  terminal_cases: number;
  measured_cases: number;
  unsupported_cases: number;
  failed_cases: number;
  requested_points: number;
  terminal_points: number;
  measured_points: number;
  covered_skus: string[];
  kv_requested_cases?: number;
  kv_measured_cases?: number;
  run_url?: string;
}
export interface Dataset {
  version: number;
  run: Run;
  coverage: Coverage[];
  series: Series[];
  kv?: KvCase[];
}
export interface InputFile {
  name: string;
  bytes: Uint8Array;
}
export interface ImportResult {
  datasets: Dataset[];
  warnings: string[];
}
export interface LoadedDataset {
  id: string;
  label: string;
  origin: "snapshot" | "official" | "github" | "local";
  loadedAt: string;
  visible: boolean;
  dataset: Dataset;
}
export interface ChartPoint {
  x: number;
  y: number | null;
  detail: string;
  low?: number;
  high?: number;
}
export interface ChartSeries {
  id: string;
  label: string;
  colorKey: string;
  runIndex: number;
  points: ChartPoint[];
}
export const OPERATIONS: Record<Operation, string> = {
  roundtrip: "Roundtrip",
  pair_period: "Pair period",
  dispatch: "Dispatch",
  combine: "Combine",
  stage: "Stage",
  isolated_sum: "Isolated sum",
};
export const METRICS: Record<
  Metric,
  { label: string; unit: string; hint: string }
> = {
  latency: {
    label: "延迟",
    unit: "µs",
    hint: "越低越好 · 读取所选操作的实测延迟分位数",
  },
  payload: {
    label: "Payload 带宽 / GPU",
    unit: "GB/s/GPU",
    hint: "越高越好 · 完整逻辑 payload（含 scale bytes）÷ EP ÷ 延迟",
  },
  activation: {
    label: "Activation 聚合带宽",
    unit: "GB/s",
    hint: "越高越好 · 全部 rank 的 activation bytes ÷ 延迟，不含 FP8 scale bytes",
  },
  tokens: {
    label: "Token 吞吐量",
    unit: "tokens/s",
    hint: "越高越好 · global tokens ÷ 所选 roundtrip 或 pair period 延迟",
  },
};
