import { unzipSync, strFromU8 } from "fflate";
import Papa from "papaparse";
import { DATASET_CSV_SCHEMA, DATASET_RUN_COUNT_FIELDS } from "./export";
import type {
  Component,
  Coverage,
  Dataset,
  ImportResult,
  InputFile,
  KvCase,
  KvRow,
  Operation,
  Percentiles,
  Point,
  Run,
  Series,
  Topology,
} from "./model";

export interface ImportContext {
  run?: {
    id?: string | number;
    run_id?: string;
    run_attempt?: number;
    created_at?: string;
    updated_at?: string;
    generated_at?: string;
    head_sha?: string;
    source_sha?: string;
    conclusion?: string | null;
    html_url?: string;
  };
}
type Obj = Record<string, unknown>;
const operations: Operation[] = [
  "dispatch",
  "combine",
  "roundtrip",
  "pair_period",
  "stage",
  "isolated_sum",
];
const percentiles = ["p50", "p90", "p95", "p99"] as const;
const obj = (value: unknown): Obj =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : {};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const string = (value: unknown, fallback = ""): string =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
const num = (value: unknown): number | undefined => {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  )
    return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const positive = (value: unknown, fallback = 0): number => {
  const n = num(value);
  return n !== undefined && n > 0 ? n : fallback;
};
const nullable = (value: unknown): string | null =>
  value === undefined || value === null || value === "" ? null : string(value);
const bool = (value: unknown): boolean | undefined =>
  value === true || value === "True" || value === "true"
    ? true
    : value === false || value === "False" || value === "false"
      ? false
      : undefined;

function pcts(value: unknown, allowZero = true): Percentiles {
  const result: Percentiles = {};
  for (const p of percentiles) {
    const n = num(obj(value)[p]);
    if (n !== undefined && (allowZero ? n >= 0 : n > 0)) result[p] = n;
  }
  return result;
}
function rates(
  bytes: number | undefined,
  latency: Percentiles,
  ep = 1,
): Percentiles | null {
  if (bytes === undefined || bytes < 0 || ep <= 0) return null;
  return Object.fromEntries(
    Object.entries(latency)
      .filter(([, us]) => us > 0)
      .map(([p, us]) => [p, (bytes / ep / us) * 1e-3]),
  );
}
function topology(raw: Obj): Topology {
  return {
    ep_size: positive(raw.ep_size ?? raw.ep ?? raw.world_size),
    nodes: positive(raw.nodes),
    gpus_per_node: positive(raw.gpus_per_node),
    scale_up_domain: positive(raw.scale_up_domain),
    scale_up_transport: string(raw.scale_up_transport, "unknown"),
    scale_out_transport: nullable(raw.scale_out_transport),
    topology_class: string(raw.topology_class, "unknown"),
  };
}
function rawComponent(
  rawValue: unknown,
  byteValue: unknown,
  ep: number,
  basis: string,
): Component | null {
  const raw = obj(rawValue);
  if (!rawValue || raw.availability === "unavailable") return null;
  const latency = pcts(raw.percentiles_us ?? raw.latency_us, false);
  if (!Object.keys(latency).length) return null;
  const bytes = obj(byteValue);
  const payload = num(bytes.total_logical_bytes ?? raw.payload_bytes);
  const activation = num(bytes.activation_data_bytes ?? raw.activation_bytes);
  return {
    latency_us: latency,
    payload_bytes: payload ?? null,
    activation_bytes: activation ?? null,
    payload_data_rate_gbps_at_latency_percentile:
      raw.payload_data_rate_gbps_at_latency_percentile
        ? pcts(raw.payload_data_rate_gbps_at_latency_percentile)
        : rates(payload, latency, ep),
    activation_data_rate_gbps_at_latency_percentile:
      raw.activation_data_rate_gbps_at_latency_percentile
        ? pcts(raw.activation_data_rate_gbps_at_latency_percentile)
        : rates(activation, latency),
    provenance: string(raw.provenance ?? raw.origin, basis),
  };
}
function point(value: unknown, ep: number, native: boolean): Point | null {
  const row = obj(value);
  const tokens = positive(row.tokens_per_rank);
  if (!tokens || !Number.isSafeInteger(tokens)) return null;
  const components: Point["components"] = {};
  const wire = obj(row.wire_byte_provenance);
  const logical = obj(row.byte_provenance);
  for (const operation of operations) {
    const raw = obj(row.components)[operation];
    if (raw === undefined) continue;
    // pair_period carries the same transport payload, but keeps its OWN latency.
    const byteKey = operation === "pair_period" ? "roundtrip" : operation;
    const bytes = wire[byteKey] ?? logical[byteKey];
    components[operation] = rawComponent(
      raw,
      bytes,
      ep,
      wire[byteKey] ? "wire" : native ? "logical-fallback" : "official",
    );
    if (operation === "isolated_sum" && components[operation]) {
      components[operation]!.payload_bytes = null;
      components[operation]!.payload_data_rate_gbps_at_latency_percentile =
        null;
      components[operation]!.activation_data_rate_gbps_at_latency_percentile =
        null;
    }
  }
  const correctness = bool(
    typeof row.correctness === "boolean"
      ? row.correctness
      : (obj(row.correctness).passed ?? row.correctness_passed),
  );
  return {
    tokens_per_rank: tokens,
    global_tokens: positive(row.global_tokens, ep > 0 ? tokens * ep : 0),
    components,
    roundtrip_token_rate_at_latency_percentile: pcts(
      row.roundtrip_token_rate_at_latency_percentile ??
        row.token_rate_at_latency_percentile,
    ),
    ...(correctness !== undefined ? { correctness } : {}),
  };
}
function caseId(raw: Obj, fallback: Obj = {}): string {
  const id = string(raw.case_id ?? fallback.case_id);
  if (id) return id;
  return [
    fallback.sku ?? raw.sku ?? "unknown",
    raw.backend,
    raw.workload,
    raw.mode,
    raw.phase,
    raw.ep,
    raw.precision,
  ]
    .map((x) => string(x, "unknown"))
    .join(":");
}
function runMeta(raw: Obj, context: ImportContext, fallbackId = "local"): Run {
  const supplied = context.run ?? {};
  return {
    run_id: string(raw.run_id ?? supplied.run_id ?? supplied.id, fallbackId),
    run_attempt: positive(raw.run_attempt ?? supplied.run_attempt, 1),
    generated_at: string(
      raw.generated_at ??
        supplied.generated_at ??
        supplied.updated_at ??
        supplied.created_at,
    ),
    source_sha: string(
      raw.source_sha ?? supplied.source_sha ?? supplied.head_sha,
    ),
    conclusion: nullable(raw.conclusion ?? supplied.conclusion),
    requested_cases: 0,
    terminal_cases: 0,
    measured_cases: 0,
    unsupported_cases: 0,
    failed_cases: 0,
    requested_points: 0,
    terminal_points: 0,
    measured_points: 0,
    covered_skus: [],
    ...((raw.run_url ?? supplied.html_url)
      ? { run_url: string(raw.run_url ?? supplied.html_url) }
      : {}),
  };
}
function coverage(value: unknown): Coverage {
  const raw = obj(value);
  return {
    case_id: string(raw.case_id),
    label: string(raw.label ?? raw.case_id),
    disposition: string(raw.disposition, "runnable"),
    sku: string(raw.sku, "unknown"),
    backend: string(raw.backend, "unknown"),
    phase: string(raw.phase, "unknown"),
    mode: string(raw.mode, "unknown"),
    precision: string(raw.precision, "unknown"),
    topology: topology(obj(raw.topology)),
    outcome: string(raw.outcome, "pending"),
    reason: nullable(raw.reason),
    detail: nullable(raw.detail),
    points: array(raw.points)
      .map((v) => {
        const r = obj(v);
        return {
          tokens_per_rank: positive(r.tokens_per_rank),
          global_tokens: positive(r.global_tokens),
          terminal_status: string(r.terminal_status, "pending"),
          reason: nullable(r.reason),
        };
      })
      .filter((p) => p.tokens_per_rank > 0),
  };
}
function kvRow(value: unknown): KvRow | null {
  const r = obj(value);
  if (
    !["paged", "bulk"].includes(string(r.kind)) ||
    !["pull", "push"].includes(string(r.op))
  )
    return null;
  const latency = (v: unknown) =>
    Object.fromEntries(
      ["p50", "p95", "min", "max", "n"].flatMap((k) => {
        const n = num(obj(v)[k]);
        return n === undefined || n < 0 ? [] : [[k, n]];
      }),
    );
  return {
    kind: r.kind as KvRow["kind"],
    op: r.op as KvRow["op"],
    isl: positive(r.isl),
    page_tokens: num(r.page_tokens) ?? null,
    batch: positive(r.batch),
    descs: num(r.descs) ?? 0,
    req_bytes: num(r.req_bytes) ?? 0,
    prep_ms: num(r.prep_ms) ?? 0,
    latency_ms: latency(r.latency_ms),
    ...(r.request_ms ? { request_ms: latency(r.request_ms) } : {}),
    gbps_p50: num(r.gbps_p50) ?? null,
    ...(num(r.gbps_p50_incl_prep) !== undefined
      ? { gbps_p50_incl_prep: num(r.gbps_p50_incl_prep) }
      : {}),
    verify_passed: bool(r.verify_passed) === true,
  };
}
function kvCase(value: unknown): KvCase {
  const r = obj(value);
  return {
    source_run_attempt: num(r.source_run_attempt),
    case_id: string(r.case_id),
    label: string(r.label ?? r.case_id),
    disposition: string(r.disposition, "runnable"),
    sku: string(r.sku, "unknown"),
    vendor: nullable(r.vendor),
    backend: string(r.backend, "unknown"),
    fabric: string(r.fabric, "unknown"),
    workload: string(r.workload, "unknown"),
    precision: string(r.precision, "unknown"),
    topology: topology(obj(r.topology)),
    outcome: string(r.outcome, "pending"),
    reason: nullable(r.reason),
    detail: nullable(r.detail),
    rows: array(r.rows).flatMap((v) => {
      const row = kvRow(v);
      return row ? [row] : [];
    }),
  };
}
function counts(dataset: Dataset): Dataset {
  const c = dataset.coverage,
    kv = dataset.kv ?? [],
    all = [...c, ...kv];
  const points = c.flatMap((x) => x.points);
  Object.assign(dataset.run, {
    requested_cases: all.length,
    terminal_cases:
      c.filter((x) =>
        x.points.length
          ? x.points.every((p) => p.terminal_status !== "pending")
          : x.outcome !== "pending",
      ).length + kv.filter((x) => x.outcome !== "pending").length,
    measured_cases: all.filter((x) => x.outcome === "success").length,
    unsupported_cases: all.filter((x) => x.outcome === "unsupported").length,
    failed_cases: all.filter((x) =>
      ["failed", "invalid", "diagnostic"].includes(x.outcome),
    ).length,
    requested_points: points.length,
    terminal_points: points.filter((x) => x.terminal_status !== "pending")
      .length,
    measured_points: points.filter((x) => x.terminal_status === "measured")
      .length,
    covered_skus: [...new Set(all.map((x) => x.sku))].sort(),
    kv_requested_cases: kv.length,
    kv_measured_cases: kv.filter((x) => x.outcome === "success").length,
  });
  return dataset;
}
function official(
  raw: Obj,
  context: ImportContext,
  warnings: string[],
): Dataset {
  const result: Dataset = {
    version: positive(raw.version, 1),
    run: runMeta(obj(raw.run), context),
    coverage: array(raw.coverage).map(coverage),
    series: [],
    kv: array(raw.kv).map(kvCase),
  };
  for (const [i, v] of array(raw.series).entries()) {
    const s = obj(v),
      sys = obj(s.system),
      topo = topology(sys);
    const points = array(s.points).flatMap((v) => {
      const p = point(v, topo.ep_size, false);
      return p ? [p] : [];
    });
    const id = string(s.series_id, `series-${i}`);
    const cov = result.coverage.find((c) => c.case_id === id);
    if (cov && cov.outcome !== "success") {
      warnings.push(
        `${id} 的 coverage 为 ${cov.outcome}，未将其作为成功曲线。`,
      );
      continue;
    }
    result.series.push({
      series_id: id,
      phase: string(s.phase, "unknown"),
      mode: string(s.mode, "unknown"),
      precision: string(s.precision, "unknown"),
      backend: string(s.backend, "unknown"),
      system: {
        ...topo,
        sku: string(sys.sku, "unknown"),
        vendor: string(sys.vendor, "unknown"),
      },
      points: points
        .filter((p) => p.correctness !== false)
        .sort((a, b) => a.tokens_per_rank - b.tokens_per_rank),
      source_run_attempt: num(s.source_run_attempt),
      workload: nullable(s.workload) ?? undefined,
      measurement_semantics: nullable(s.measurement_semantics) ?? undefined,
    });
  }
  if (!result.coverage.length && result.series.length) {
    warnings.push(
      `Run ${result.run.run_id} 未附 coverage，仅统计已导入的曲线。`,
    );
    result.coverage = result.series.map((s) => ({
      case_id: s.series_id,
      label: s.series_id,
      disposition: "runnable",
      sku: s.system.sku,
      backend: s.backend,
      phase: s.phase,
      mode: s.mode,
      precision: s.precision,
      topology: s.system,
      outcome: "success",
      reason: null,
      detail: null,
      points: s.points.map((p) => ({
        tokens_per_rank: p.tokens_per_rank,
        global_tokens: p.global_tokens,
        terminal_status: "measured",
        reason: null,
      })),
    }));
  }
  counts(result);
  // Published run totals can have a wider scope than the selected/returned rows.
  // Keep valid authoritative summaries, deriving only fields absent in the source.
  const sourceRun = obj(raw.run);
  for (const field of DATASET_RUN_COUNT_FIELDS) {
    const value = num(sourceRun[field]);
    if (value !== undefined && Number.isSafeInteger(value) && value >= 0)
      result.run[field] = value;
  }
  if (
    Array.isArray(sourceRun.covered_skus) &&
    sourceRun.covered_skus.every((sku) => typeof sku === "string")
  ) {
    result.run.covered_skus = [...sourceRun.covered_skus];
  }
  return result;
}
interface RawCase {
  document: Obj;
  case: Obj;
  sku: string;
  id: string;
  run: Run;
  version: number;
  ordinal: number;
  sourceAttempt: number;
}
function rawCase(raw: Obj, context: ImportContext): RawCase {
  const identity = obj(raw.identity),
    factors = obj(identity.case_factors);
  const kase = Object.keys(obj(factors.case)).length
    ? obj(factors.case)
    : obj(raw.case);
  const sku = string(factors.sku ?? raw.sku ?? raw.runner, "unknown");
  const id = string(identity.case_id, caseId(kase, { sku }));
  const run = runMeta(
    { ...obj(identity.allocation_factors), generated_at: raw.generated_at },
    context,
  );
  if (!run.source_sha) run.source_sha = string(obj(raw.provenance).source_sha);
  return {
    document: raw,
    case: kase,
    sku,
    id,
    run,
    version: positive(raw.version, 1),
    ordinal: positive(identity.attempt_ordinal, 1),
    sourceAttempt: run.run_attempt,
  };
}
function outcomeStatus(raw: Obj): string {
  const status = string(obj(raw.outcome).status ?? raw.status, "pending");
  return status === "measured"
    ? "success"
    : status === "failure"
      ? "failed"
      : status;
}
function nativeDataset(
  cases: RawCase[],
  matrix: Obj | undefined,
  context: ImportContext,
  warnings: string[],
): Dataset {
  const run = cases.length ? { ...cases[0].run } : runMeta({}, context);
  const version = cases[0]?.version ?? positive(matrix?.version, 1);
  const chosen = new Map<string, RawCase>();
  for (const c of cases) {
    const previous = chosen.get(c.id);
    if (
      !previous ||
      c.sourceAttempt > previous.sourceAttempt ||
      (c.sourceAttempt === previous.sourceAttempt &&
        (c.ordinal > previous.ordinal ||
          (c.ordinal === previous.ordinal &&
            c.run.generated_at > previous.run.generated_at)))
    )
      chosen.set(c.id, c);
  }
  if (chosen.size < cases.length)
    warnings.push(
      `Run ${run.run_id} 有重复 case attempt；每个 case 采用最新 attempt，未平均分位数。`,
    );
  if (!matrix)
    warnings.push(
      `Run ${run.run_id} 未附可匹配的 matrix，coverage 仅包含已导入 case。`,
    );
  const requested = array(matrix?.requested_cases).map((v) => obj(v));
  const requestedIds = new Set(requested.map((r) => caseId(obj(r.case), r)));
  for (const c of chosen.values())
    if (!requestedIds.has(c.id))
      requested.push({
        sku: c.sku,
        case: { ...c.case, case_id: c.id },
        disposition: "runnable",
      });
  const dataset: Dataset = { version, run, coverage: [], series: [], kv: [] };
  for (const req of requested) {
    const kase = obj(req.case),
      id = caseId(kase, req),
      measured = chosen.get(id),
      d = measured?.document ?? {};
    const realCase = measured?.case ?? kase;
    const topo = topology({
      ...kase,
      ...realCase,
      ...obj(d.topology),
      ep: realCase.ep ?? kase.ep,
    });
    const sku = measured?.sku ?? string(req.sku, "unknown");
    const backend = string(
      obj(d.implementation).name ?? realCase.backend,
      "unknown",
    );
    const precision = string(
      realCase.precision ?? obj(d.measurement).dispatch_dtype,
      "unknown",
    );
    const phase = string(realCase.phase, "unknown"),
      mode = string(realCase.mode, "unknown");
    const disposition = string(req.disposition, "runnable");
    const status = measured
      ? outcomeStatus(d)
      : disposition === "unsupported"
        ? "unsupported"
        : "pending";
    const reasons = array(obj(d.outcome).reasons)
      .map((r) =>
        typeof r === "string" ? r : string(obj(r).detail ?? obj(r).code),
      )
      .filter(Boolean);
    const reason =
      status === "success"
        ? null
        : reasons.join("; ") ||
          nullable(req.reason) ||
          (status === "pending" ? "not-measured" : status);
    const label = `${sku} · ${backend} · ${mode} · ${phase} · EP${topo.ep_size} · ${precision}`;
    if (string(realCase.suite).startsWith("kv")) {
      dataset.kv!.push(
        kvCase({
          ...realCase,
          case_id: id,
          label,
          disposition,
          sku,
          vendor: obj(d.runtime).vendor,
          backend,
          precision,
          topology: topo,
          outcome: status,
          reason,
          detail: req.detail,
          source_run_attempt: measured?.sourceAttempt,
          rows: status === "success" ? obj(d.measurement).rows : [],
        }),
      );
      continue;
    }
    const rawRows = array(obj(d.measurement).rows);
    const points = rawRows.flatMap((v) => {
      const p = point(v, topo.ep_size, true);
      return p ? [p] : [];
    });
    const measuredByToken = new Map(points.map((p) => [p.tokens_per_rank, p]));
    const ladderValue = kase.ladder ?? realCase.ladder;
    const ladder =
      typeof ladderValue === "string"
        ? ladderValue
            .trim()
            .split(/[\s,]+/)
            .map(Number)
        : array(ladderValue).map(Number);
    const wanted = [
      ...new Set([
        ...ladder.filter((t) => Number.isSafeInteger(t) && t > 0),
        ...points.map((p) => p.tokens_per_rank),
      ]),
    ].sort((a, b) => a - b);
    const dropped = new Set(array(obj(d.workload).ladder_dropped).map(Number));
    const coveragePoints = wanted.map((t) => {
      const p = measuredByToken.get(t);
      const hasMeasurement =
        p &&
        Object.values(p.components).some(
          (c) => c && Object.keys(c.latency_us).length > 0,
        );
      const terminal =
        status !== "success"
          ? status
          : p?.correctness === false
            ? "invalid"
            : hasMeasurement
              ? "measured"
              : dropped.has(t)
                ? "unsupported"
                : "pending";
      return {
        tokens_per_rank: t,
        global_tokens: p?.global_tokens ?? t * topo.ep_size,
        terminal_status: terminal,
        reason:
          terminal === "measured"
            ? null
            : terminal === "invalid"
              ? "correctness-failed"
              : dropped.has(t)
                ? "backend-token-capacity"
                : (reason ?? "not-measured"),
      };
    });
    dataset.coverage.push({
      case_id: id,
      label,
      disposition,
      sku,
      backend,
      phase,
      mode,
      precision,
      topology: topo,
      outcome: status,
      reason,
      detail: nullable(req.detail),
      points: coveragePoints,
    });
    if (status === "success") {
      const implementation = obj(d.implementation);
      dataset.series.push({
        source_run_attempt: measured?.sourceAttempt,
        series_id: id,
        phase,
        mode,
        precision,
        backend,
        system: {
          ...topo,
          sku,
          vendor: string(obj(d.runtime).vendor, "unknown"),
        },
        points: points
          .filter((p) => p.correctness !== false)
          .sort((a, b) => a.tokens_per_rank - b.tokens_per_rank),
        workload: string(realCase.workload, "unknown"),
        measurement_semantics: `kernel=${string(implementation.kernel_generation, "unknown")};stage_excluded=${typeof implementation.stage_excluded_from_roundtrip === "boolean" ? String(implementation.stage_excluded_from_roundtrip) : "unknown"}`,
      });
      if (points.some((p) => p.correctness === false))
        warnings.push(
          `${id} 中 correctness 失败的 point 已保留在 coverage 并从曲线排除。`,
        );
    }
  }
  return counts(dataset);
}

/** Decode typed CSV records before the normal official-dataset validation pass. */
function canonicalCsvDocuments(
  rows: Obj[],
  name: string,
  warnings: string[],
): unknown[] {
  const groups = new Map<string, Obj[]>();
  for (const row of rows) {
    if (row.schema !== DATASET_CSV_SCHEMA) {
      warnings.push(`${name}: 未知 CSV schema ${string(row.schema)}，已跳过。`);
      continue;
    }
    const key = string(row.dataset_index);
    if (!key) {
      warnings.push(`${name}: canonical CSV 缺少 dataset_index。`);
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const documents: unknown[] = [];
  for (const [key, records] of groups) {
    const runRows = records.filter((r) => r.record_type === "run");
    if (runRows.length !== 1) {
      warnings.push(
        `${name}: dataset ${key} 必须包含恰好一条 run 记录，已跳过。`,
      );
      continue;
    }
    const r = runRows[0];
    const dataset: Obj = {
      version: positive(r.version, 1),
      run: {
        run_id: r.run_id,
        run_attempt: r.run_attempt,
        generated_at: r.generated_at,
        source_sha: r.source_sha,
        conclusion: r.conclusion,
        run_url: r.run_url,
        ...Object.fromEntries(
          DATASET_RUN_COUNT_FIELDS.map((field) => [field, r[field]]),
        ),
      },
      series: [],
      coverage: [],
      kv: [],
    };
    if (typeof r.covered_skus_json === "string" && r.covered_skus_json) {
      try {
        obj(dataset.run).covered_skus = JSON.parse(r.covered_skus_json);
      } catch {
        warnings.push(
          `${name}: covered_skus_json 不是有效 JSON，将从内容推导。`,
        );
      }
    }
    const series = new Map<string, Obj>(),
      cases = new Map<string, Obj>(),
      kv = new Map<string, Obj>();
    for (const row of records) {
      const type = string(row.record_type),
        id = string(type === "ep-series" ? row.series_id : row.case_id);
      if (type === "ep-series") {
        if (!id || series.has(id)) {
          warnings.push(
            `${name}: dataset ${key} 存在缺少身份或重复的 ep-series，已跳过。`,
          );
          continue;
        }
        const value = {
          series_id: id,
          phase: row.phase,
          mode: row.mode,
          precision: row.precision,
          backend: row.backend,
          source_run_attempt: num(row.source_run_attempt),
          workload: row.workload,
          measurement_semantics: row.measurement_semantics,
          system: { ...topology(row), sku: row.sku, vendor: row.vendor },
          points: [],
        };
        series.set(id, value);
        array(dataset.series).push(value);
      } else if (type === "coverage-case" || type === "kv-case") {
        const target = type === "coverage-case" ? cases : kv;
        if (!id || target.has(id)) {
          warnings.push(
            `${name}: dataset ${key} 存在缺少身份或重复的 ${type}，已跳过。`,
          );
          continue;
        }
        const value = {
          ...row,
          case_id: id,
          topology: topology(row),
          points: [],
          rows: [],
        };
        target.set(id, value);
        array(type === "coverage-case" ? dataset.coverage : dataset.kv).push(
          value,
        );
      }
    }
    const extractPercentiles = (row: Obj, column: (p: string) => string) =>
      Object.fromEntries(
        percentiles.flatMap((p) => {
          const n = num(row[column(p)]);
          return n === undefined ? [] : [[p, n]];
        }),
      );
    for (const row of records) {
      const type = string(row.record_type);
      if (type === "ep-point") {
        const s = series.get(string(row.series_id));
        if (!s) {
          warnings.push(
            `${name}: ep-point 找不到所属 series ${string(row.series_id)}，已跳过。`,
          );
          continue;
        }
        const components: Obj = {};
        for (const op of operations) {
          const present = bool(row[`${op}_present`]);
          if (present === undefined) continue;
          if (!present) {
            components[op] = null;
            continue;
          }
          components[op] = {
            latency_us: extractPercentiles(row, (p) => `${op}_${p}_us`),
            payload_bytes: num(row[`${op}_payload_bytes`]) ?? null,
            activation_bytes: num(row[`${op}_activation_bytes`]) ?? null,
            provenance: nullable(row[`${op}_provenance`]) ?? undefined,
            payload_data_rate_gbps_at_latency_percentile: extractPercentiles(
              row,
              (p) => `${op}_payload_rate_${p}`,
            ),
            activation_data_rate_gbps_at_latency_percentile: extractPercentiles(
              row,
              (p) => `${op}_activation_rate_${p}`,
            ),
          };
        }
        array(s.points).push({
          tokens_per_rank: row.tokens_per_rank,
          global_tokens: row.global_tokens,
          correctness_passed: row.correctness_passed,
          components,
          roundtrip_token_rate_at_latency_percentile: extractPercentiles(
            row,
            (p) => `token_rate_${p}`,
          ),
        });
      } else if (type === "coverage-point") {
        const c = cases.get(string(row.case_id));
        if (!c) {
          warnings.push(`${name}: coverage-point 找不到所属 case，已跳过。`);
          continue;
        }
        array(c.points).push({
          tokens_per_rank: row.tokens_per_rank,
          global_tokens: row.global_tokens,
          terminal_status: row.terminal_status,
          reason: row.reason,
        });
      } else if (type === "kv-point") {
        const c = kv.get(string(row.case_id));
        if (!c) {
          warnings.push(`${name}: kv-point 找不到所属 case，已跳过。`);
          continue;
        }
        const latency = (prefix: string) =>
          Object.fromEntries(
            ["p50", "p95", "min", "max", "n"].flatMap((q) => {
              const n = num(row[`${prefix}_${q}`]);
              return n === undefined ? [] : [[q, n]];
            }),
          );
        const request = latency("request_ms");
        array(c.rows).push({
          ...row,
          latency_ms: latency("latency_ms"),
          ...(Object.keys(request).length ? { request_ms: request } : {}),
        });
      } else if (
        !["run", "ep-series", "coverage-case", "kv-case"].includes(type)
      ) {
        warnings.push(`${name}: 未知 CSV record_type ${type}，已跳过。`);
      }
    }
    documents.push(dataset);
  }
  return documents;
}

/** CSV uses one ladder point per row; metrics are <operation>_<percentile>_us. */
function csvDocuments(
  text: string,
  name: string,
  warnings: string[],
): unknown[] {
  const parsed = Papa.parse<Obj>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length)
    warnings.push(
      `${name}: ${parsed.errors
        .slice(0, 3)
        .map((e) => e.message)
        .join("; ")}`,
    );
  if (
    parsed.meta.fields?.includes("schema") &&
    parsed.meta.fields?.includes("record_type")
  )
    return canonicalCsvDocuments(parsed.data, name, warnings);
  if (!parsed.meta.fields?.includes("tokens_per_rank")) {
    warnings.push(
      parsed.meta.fields?.includes("x") && parsed.meta.fields?.includes("y")
        ? `${name}: 这是图表视图 CSV，缺少恢复数据集所需的 token/operation 元数据；请导入“数据集 CSV”或 JSON 导出。`
        : `${name}: CSV 缺少 tokens_per_rank 列。`,
    );
    return [];
  }
  const groups = new Map<string, Obj>();
  for (const row of parsed.data) {
    const factorValues = Object.fromEntries(
      string(row.dedupe_key)
        .split("|")
        .filter((x) => x.includes("="))
        .map((x) => x.split(/=(.*)/s).slice(0, 2)),
    );
    const factors = {
      ...factorValues,
      ...Object.fromEntries(
        Object.entries(row).filter(([, value]) => value !== ""),
      ),
    };
    const id = string(factors.case_id, caseId(factors));
    const key = `${string(factors.run_id, "local")}@${string(factors.run_attempt, "1")}:${id}`;
    let d = groups.get(key);
    if (!d) {
      d = {
        version: positive(factors.version, 1),
        record_type: "case-attempt",
        generated_at: factors.generated_at,
        identity: {
          case_id: id,
          attempt_ordinal: positive(factors.attempt_ordinal, 1),
          allocation_factors: {
            run_id: factors.run_id,
            run_attempt: factors.run_attempt,
            source_sha: factors.source_sha ?? factors.head_sha,
          },
          case_factors: { sku: factors.sku, case: factors },
        },
        measurement: { rows: [] },
        implementation: { name: factors.backend },
        outcome: { status: string(factors.status, "success"), reasons: [] },
        runtime: { vendor: factors.vendor },
      };
      groups.set(key, d);
    }
    const components: Obj = {},
      bytes: Obj = {};
    for (const operation of operations) {
      const ps: Obj = {};
      for (const p of percentiles)
        if (num(row[`${operation}_${p}_us`]) !== undefined)
          ps[p] = num(row[`${operation}_${p}_us`]);
      if (Object.keys(ps).length)
        components[operation] = { percentiles_us: ps };
      const payload = num(
        row[`${operation}_payload_bytes`] ?? row[`${operation}_logical_bytes`],
      );
      const activation = num(row[`${operation}_activation_bytes`]);
      if (payload !== undefined || activation !== undefined)
        bytes[operation] = {
          total_logical_bytes: payload,
          activation_data_bytes: activation,
        };
    }
    const correctness = bool(row.correctness_passed);
    array(obj(d.measurement).rows).push({
      tokens_per_rank: row.tokens_per_rank,
      global_tokens: row.global_tokens,
      components,
      byte_provenance: bytes,
      ...(correctness !== undefined
        ? { correctness: { passed: correctness } }
        : {}),
    });
  }
  return [...groups.values()];
}
interface DocumentEntry {
  value: unknown;
  runId?: string;
}
/** Parse already-decoded official datasets or neutral matrix/case documents. */
export function parseDocuments(
  documents: unknown[],
  context: ImportContext = {},
): ImportResult {
  const warnings: string[] = [],
    entries: DocumentEntry[] = [];
  function unwrap(value: unknown, runId?: string): void {
    if (Array.isArray(value)) {
      for (const item of value) unwrap(item, runId);
      return;
    }
    const r = obj(value);
    if (r.__cx_file_document === true) {
      unwrap(r.value, string(r.runId) || runId);
      return;
    }
    if (Array.isArray(r.datasets)) {
      for (const d of r.datasets) unwrap(obj(d).dataset ?? d, runId);
      return;
    }
    if (
      Array.isArray(r.series) ||
      Array.isArray(r.requested_cases) ||
      r.record_type === "case-attempt" ||
      (r.measurement && (r.identity || r.case))
    ) {
      entries.push({ value, runId });
      return;
    }
    if (r.matrix || r.documents || r.shards || r.data || r.dataset) {
      if (r.matrix) unwrap(r.matrix, runId);
      if (r.documents) unwrap(r.documents, runId);
      if (r.shards) unwrap(r.shards, runId);
      if (r.data) unwrap(r.data, runId);
      if (r.dataset) unwrap(r.dataset, runId);
      return;
    }
    warnings.push(
      "跳过无法识别的 JSON 文档（需要 official dataset、matrix 或 case-attempt）。",
    );
  }
  for (const doc of documents) unwrap(doc);
  const assembled = entries.filter((e) => Array.isArray(obj(e.value).series));
  const matrixEntries = entries.filter((e) =>
    Array.isArray(obj(e.value).requested_cases),
  );
  const rawEntries = entries.filter(
    (e) => !assembled.includes(e) && !matrixEntries.includes(e),
  );
  const datasets = assembled.map((e) =>
    official(obj(e.value), context, warnings),
  );
  const groups = new Map<string, RawCase[]>();
  for (const entry of rawEntries) {
    const c = rawCase(
      obj(entry.value),
      entry.runId && !context.run?.run_id && !context.run?.id
        ? { run: { ...context.run, run_id: entry.runId } }
        : context,
    );
    // A GitHub URL selects the assembled state of that workflow attempt. Untouched
    // cells can legitimately come from an earlier attempt of the same run.
    const targetId = string(context.run?.run_id ?? context.run?.id);
    const targetAttempt = num(context.run?.run_attempt);
    if (
      targetId &&
      (c.run.run_id !== targetId ||
        (targetAttempt && c.sourceAttempt > targetAttempt))
    ) {
      warnings.push(`跳过不属于所选 run/attempt 的 case ${c.id}。`);
      continue;
    }
    if (targetId && targetAttempt && targetAttempt >= c.sourceAttempt) {
      c.run = {
        ...c.run,
        run_attempt: targetAttempt,
        generated_at:
          context.run?.generated_at ??
          context.run?.updated_at ??
          c.run.generated_at,
        conclusion: context.run?.conclusion ?? c.run.conclusion,
      };
      if (c.sourceAttempt < targetAttempt)
        warnings.push(
          `Run ${targetId} attempt ${targetAttempt} 保留未重跑 case 的 attempt ${c.sourceAttempt} 测量。`,
        );
    }
    const key = `${c.run.run_id}@${c.run.run_attempt}:v${c.version}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const usedMatrices = new Set<DocumentEntry>();
  for (const cases of groups.values()) {
    const candidates = matrixEntries.filter(
      (e) =>
        positive(obj(e.value).version, 1) === cases[0].version &&
        (!e.runId || e.runId === cases[0].run.run_id),
    );
    const exact = candidates.filter((e) => e.runId === cases[0].run.run_id);
    const selected =
      exact.length === 1
        ? exact[0]
        : groups.size === 1 && candidates.length === 1
          ? candidates[0]
          : undefined;
    if (selected) usedMatrices.add(selected);
    datasets.push(
      nativeDataset(
        cases,
        selected ? obj(selected.value) : undefined,
        context,
        warnings,
      ),
    );
  }
  for (const entry of matrixEntries) {
    if (usedMatrices.has(entry)) continue;
    if (groups.size) {
      warnings.push(
        "存在无法唯一对应 run/version 的 matrix，未将其套用到其他运行。",
      );
      continue;
    }
    datasets.push(
      nativeDataset(
        [],
        obj(entry.value),
        {
          run: {
            ...context.run,
            ...(entry.runId ? { run_id: entry.runId } : {}),
          },
        },
        warnings,
      ),
    );
  }
  return { datasets, warnings: [...new Set(warnings)] };
}

/** All parsing is in-browser; ZIP archives are never uploaded or written to disk. */
export async function importFiles(
  files: InputFile[],
  context: ImportContext = {},
): Promise<ImportResult> {
  const documents: unknown[] = [],
    warnings: string[] = [];
  const maxExpandedBytes = 250 * 1024 * 1024;
  let expandedBytes = 0;
  const decode = (
    file: InputFile,
    depth: number,
    inheritedId?: string,
  ): void => {
    const name = file.name;
    const runId =
      /cxsweep-matrix-(\d+)/.exec(name)?.[1] ??
      /cxshard-.*-(\d{8,})-\d+(?:\.zip|\/|$)/.exec(name)?.[1] ??
      inheritedId;
    if (
      /\.zip$/i.test(name) ||
      (file.bytes[0] === 0x50 && file.bytes[1] === 0x4b)
    ) {
      if (depth >= 3) {
        warnings.push(`${name}: ZIP 嵌套超过 3 层，已跳过。`);
        return;
      }
      try {
        const contents = unzipSync(file.bytes, {
          filter: (entry) => {
            if (!/\.(json|jsonl|ndjson|csv|zip)$/i.test(entry.name))
              return false;
            if (entry.originalSize + expandedBytes > maxExpandedBytes)
              throw new Error("解压数据超过 250 MiB 限制");
            expandedBytes += entry.originalSize;
            return true;
          },
        });
        for (const [entry, bytes] of Object.entries(contents))
          decode({ name: `${name}/${entry}`, bytes }, depth + 1, runId);
      } catch (error) {
        warnings.push(
          `${name}: ZIP 读取失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return;
    }
    if (!/\.(json|jsonl|ndjson|csv)$/i.test(name)) return;
    const text = strFromU8(file.bytes).replace(/^\uFEFF/, "");
    const add = (value: unknown) =>
      documents.push({ __cx_file_document: true, value, runId });
    if (/\.csv$/i.test(name)) {
      csvDocuments(text, name, warnings).forEach(add);
      return;
    }
    try {
      add(JSON.parse(text));
    } catch {
      // Line-delimited JSON is also accepted when an exporter gave it a .json suffix.
      const lines = text.split(/\r?\n/);
      let accepted = 0;
      for (const [i, line] of lines.entries()) {
        if (!line.trim()) continue;
        try {
          add(JSON.parse(line));
          accepted++;
        } catch {
          warnings.push(`${name}: 第 ${i + 1} 行不是有效 JSON，已跳过。`);
        }
      }
      if (!accepted) warnings.push(`${name}: 没有可读取的 JSON 文档。`);
    }
  };
  for (const file of files) decode(file, 0);
  const result = parseDocuments(documents, context);
  return {
    datasets: result.datasets,
    warnings: [...new Set([...warnings, ...result.warnings])],
  };
}
