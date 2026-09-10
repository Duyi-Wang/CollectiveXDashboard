import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  Database,
  ExternalLink,
  Github,
  Layers3,
  LoaderCircle,
  Network,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  ChartSeries,
  Dataset,
  ImportResult,
  LoadedDataset,
  Metric,
  Operation,
  Percentile,
  Series,
} from "./model";
import { METRICS, OPERATIONS } from "./model";
import {
  PerformanceChart,
  chartColor,
  chartDash,
  exportPng,
  exportSvg,
} from "./chart";
import {
  buildKvSeries,
  fitAlphaBeta,
  metricValue,
  seriesColorKey,
} from "./metrics";
import { parseDocuments } from "./importers";
import { exportDatasetCsv } from "./export";
import { fetchSnapshotIndex, fetchSnapshotRun } from "./sources";
import { loadWorkspace, saveWorkspace } from "./storage";
import { csvCell, downloadBlob, number, shortDate } from "./utils";
import SourcesPanel, { type SourceTab } from "./SourcesPanel";
import { LanguageSwitch, useI18n } from "./i18n-react";

const ORIGIN_LABELS = {
  snapshot: "官方快照",
  official: "官方实时",
  github: "GitHub CI",
  local: "本地文件",
};
const INITIAL_FILTERS = {
  phase: "decode",
  mode: "normal",
  precision: "bf16",
  ep: "8",
  sku: "all",
  backend: "all",
};
type Filters = typeof INITIAL_FILTERS;
const unique = (values: string[]) =>
  [...new Set(values)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
const labelFor = (s: Series) =>
  `${s.system.sku.toUpperCase()} · ${s.backend} · EP${s.system.ep_size} · ${s.mode} · ${s.phase} · ${s.precision}`;
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: (string | [string, string])[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <div>
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option
              key={typeof o === "string" ? o : o[0]}
              value={typeof o === "string" ? o : o[0]}
            >
              {typeof o === "string" ? o : o[1]}
            </option>
          ))}
        </select>
        <ChevronDown size={13} />
      </div>
    </label>
  );
}
function makeLoaded(
  dataset: Dataset,
  origin: LoadedDataset["origin"],
  label: string,
  ordinal = 0,
): LoadedDataset {
  return {
    id: `${origin}:${dataset.run.run_id}:${dataset.run.run_attempt}:${origin === "local" ? label : ""}:${ordinal}`,
    label,
    origin,
    loadedAt: new Date().toISOString(),
    visible: true,
    dataset,
  };
}
export default function App() {
  const { language, t, message } = useI18n();
  const originLabel = Object.fromEntries(
    Object.entries(ORIGIN_LABELS).map(([key, value]) => [key, t(value)]),
  ) as typeof ORIGIN_LABELS;
  const metrics = Object.fromEntries(
    Object.entries(METRICS).map(([key, value]) => [
      key,
      { ...value, label: t(value.label), hint: t(value.hint) },
    ]),
  ) as typeof METRICS;
  const [datasets, setDatasets] = useState<LoadedDataset[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<string[]>([]);
  const [source, setSource] = useState<SourceTab | null>(null);
  const [tab, setTab] = useState<"ep" | "kv" | "coverage">("ep");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [operation, setOperation] = useState<Operation>("roundtrip");
  const [metric, setMetric] = useState<Metric>("latency");
  const [percentile, setPercentile] = useState<Percentile>("p50");
  const [logX, setLogX] = useState(true);
  const [logY, setLogY] = useState(true);
  const [band, setBand] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [kvView, setKvView] = useState<
    "bandwidth" | "latency" | "frontier" | "overlap"
  >("bandwidth");
  const [kvOp, setKvOp] = useState<"pull" | "push">("pull");
  const [kvPage, setKvPage] = useState(256);
  const [kvIsl, setKvIsl] = useState("max");
  const [tableSearch, setTableSearch] = useState("");
  const [tablePage, setTablePage] = useState(0);
  const [rawOpen, setRawOpen] = useState(false);
  const chartContainer = useRef<HTMLDivElement>(null);
  const init = useRef(false);
  useEffect(() => {
    if (init.current) return;
    init.current = true;
    void (async () => {
      try {
        let saved: LoadedDataset[] | null = null;
        try {
          saved = await loadWorkspace();
        } catch {
          setMessages((m) => [
            ...m,
            "浏览器存储不可用。当前会话仍可使用，请导出 JSON 备份。",
          ]);
        }
        if (
          saved &&
          Array.isArray(saved) &&
          saved.every(
            (v) =>
              v &&
              v.dataset &&
              v.id &&
              ["snapshot", "official", "github", "local"].includes(v.origin),
          )
        ) {
          const normalized = parseDocuments(saved.map((v) => v.dataset));
          if (normalized.datasets.length !== saved.length)
            throw new Error("浏览器中的工作区格式不完整");
          setDatasets(
            saved.map((v, i) => ({ ...v, dataset: normalized.datasets[i] })),
          );
        } else {
          const index = await fetchSnapshotIndex();
          const docs = await Promise.all(
            index.runs.map((run) => fetchSnapshotRun(run.run_id, index)),
          );
          const parsed = await parseDocuments(docs);
          const rows = parsed.datasets.map((d, i) =>
            makeLoaded(d, "snapshot", `官方快照 · ${index.fetched_at}`, i),
          );
          const defaultRun = [...rows].sort(
            (a, b) => b.dataset.series.length - a.dataset.series.length,
          )[0];
          setDatasets(
            rows.map((v) => ({ ...v, visible: v.id === defaultRun?.id })),
          );
          if (parsed.warnings.length) setMessages(parsed.warnings);
        }
      } catch (e) {
        setMessages((m) => [
          ...m,
          `初始化数据失败：${e instanceof Error ? e.message : e}。请使用“添加数据”导入文件或重新载入快照。`,
        ]);
      } finally {
        setLoading(false);
        setReady(true);
      }
    })();
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void saveWorkspace(datasets).catch(() =>
        setMessages((m) => [
          ...new Set([...m, "当前工作区无法保存到浏览器，请导出 JSON 备份。"]),
        ]),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [datasets, ready]);
  const active = datasets.filter((d) => d.visible);
  const allSeries = active.flatMap((d) => d.dataset.series);
  const filtered = active.flatMap((d, runIndex) =>
    d.dataset.series
      .filter(
        (s) =>
          (filters.phase === "all" || s.phase === filters.phase) &&
          (filters.mode === "all" || s.mode === filters.mode) &&
          (filters.precision === "all" || s.precision === filters.precision) &&
          (filters.ep === "all" || String(s.system.ep_size) === filters.ep) &&
          (filters.sku === "all" || s.system.sku === filters.sku) &&
          (filters.backend === "all" || s.backend === filters.backend),
      )
      .map((s) => ({
        series: s,
        owner: d,
        runIndex,
        id: `${d.id}:${s.series_id}`,
      })),
  );
  const epChart: ChartSeries[] = filtered.map(
    ({ series: s, owner, runIndex, id }) => ({
      id,
      label: `${labelFor(s)} · #${owner.dataset.run.run_id} · ${originLabel[owner.origin]} · attempt ${owner.dataset.run.run_attempt}`,
      colorKey: seriesColorKey(s),
      runIndex,
      points: [
        ...s.points,
        ...(
          owner.dataset.coverage.find((c) => c.case_id === s.series_id)
            ?.points ?? []
        )
          .filter(
            (p) =>
              !s.points.some(
                (measured) => measured.tokens_per_rank === p.tokens_per_rank,
              ),
          )
          .map((p) => ({
            tokens_per_rank: p.tokens_per_rank,
            global_tokens: p.global_tokens,
            components: {},
          })),
      ]
        .sort((a, b) => a.tokens_per_rank - b.tokens_per_rank)
        .map((p) => ({
          x: p.tokens_per_rank,
          y: metricValue(p, operation, percentile, metric),
          low:
            metric === "latency"
              ? (metricValue(p, operation, "p50", metric) ?? undefined)
              : undefined,
          high:
            metric === "latency"
              ? (metricValue(p, operation, "p99", metric) ?? undefined)
              : undefined,
          detail: `${s.system.sku} · ${s.backend} · ${operation} ${percentile}\n${number(p.tokens_per_rank)} tokens/rank · ${number(p.global_tokens)} global tokens\n${s.system.nodes}×${s.system.gpus_per_node} GPU · ${s.system.scale_up_transport}${s.system.scale_out_transport ? ` + ${s.system.scale_out_transport}` : ""}\n#${owner.dataset.run.run_id} · ${originLabel[owner.origin]} · source attempt ${s.source_run_attempt ?? owner.dataset.run.run_attempt}\ncase ${s.series_id} · workload ${s.workload ?? t("官方未提供")}`,
        })),
    }),
  );
  const kvCases = active.flatMap((d) => d.dataset.kv ?? []);
  const kvPages = unique(
    kvCases.flatMap((c) =>
      c.rows
        .filter((r) => r.kind === "paged" && r.page_tokens != null)
        .map((r) => String(r.page_tokens)),
    ),
  ).map(Number);
  const effectivePage = kvPages.includes(kvPage)
    ? kvPage
    : (kvPages.at(-1) ?? 256);
  const kvIsls = unique(
    kvCases.flatMap((c) =>
      c.rows
        .filter((r) => r.page_tokens === effectivePage && r.op === kvOp)
        .map((r) => String(r.isl)),
    ),
  );
  const effectiveIsl = kvIsls.includes(kvIsl) ? kvIsl : "max";
  const kvChart = useMemo(
    () =>
      buildKvSeries(
        datasets.filter((d) => d.visible),
        {
          view: kvView,
          op: kvOp,
          pageTokens: effectivePage,
          ...(effectiveIsl === "max" ? {} : { isl: Number(effectiveIsl) }),
        },
        language,
      ),
    [datasets, kvView, kvOp, effectivePage, effectiveIsl, language],
  );
  const allChart = tab === "kv" ? kvChart : epChart;
  const shownChart = allChart.filter((s) => !hidden.has(s.id));
  const plotPoints = shownChart.flatMap((s) =>
    s.points.filter((p) => p.y != null),
  );
  const measured = active.reduce(
    (sum, d) =>
      sum +
      d.dataset.series.reduce((n, s) => n + s.points.length, 0) +
      (d.dataset.kv ?? []).reduce((n, c) => n + c.rows.length, 0),
    0,
  );
  const skus = unique(
    active.flatMap((d) => [
      ...d.dataset.series.map((s) => s.system.sku),
      ...(d.dataset.kv ?? []).map((c) => c.sku),
    ]),
  );
  const coverage = active.flatMap((d) => [
    ...d.dataset.coverage.map((c) => ({
      ...c,
      suite: "EP",
      runId: d.dataset.run.run_id,
      measured: c.points.filter((p) => p.terminal_status === "measured").length,
      total: c.points.length,
    })),
    ...(d.dataset.kv ?? []).map((c) => ({
      ...c,
      phase: "kv-transfer",
      mode: c.fabric,
      suite: "KV",
      runId: d.dataset.run.run_id,
      measured: c.rows.length,
      total: c.rows.length,
    })),
  ]);
  const filteredCoverage = coverage.filter((c) =>
    `${c.label} ${c.sku} ${c.backend} ${c.reason} ${c.outcome} ${c.runId}`
      .toLowerCase()
      .includes(tableSearch.toLowerCase()),
  );
  const xLabel =
    tab === "kv"
      ? kvView === "frontier"
        ? t("输入序列长度（tokens）")
        : t("Batch · 并发请求数")
      : t("每 rank Token 数");
  const yLabel =
    tab === "kv"
      ? {
          bandwidth: t("带宽（GB/s）"),
          latency: t("Burst 延迟 p50（ms）"),
          frontier: t("每个 ISL 的最高带宽（GB/s）"),
          overlap: t("带宽 / batch-1 带宽（倍）"),
        }[kvView]
      : `${metrics[metric].label} (${metrics[metric].unit})`;
  function receive(
    result: ImportResult,
    origin: LoadedDataset["origin"],
    label: string,
  ) {
    const newRows = result.datasets.map((d, i) =>
      makeLoaded(d, origin, label, i),
    );
    setDatasets((old) => {
      const map = new Map(old.map((d) => [d.id, d]));
      newRows.forEach((d) => map.set(d.id, d));
      return [...map.values()];
    });
    setMessages(result.warnings);
    setFilters({
      phase: "all",
      mode: "all",
      precision: "all",
      ep: "all",
      sku: "all",
      backend: "all",
    });
    setHidden(new Set());
    if (
      newRows.every((d) => d.dataset.series.length === 0) &&
      newRows.some((d) => d.dataset.kv?.length)
    )
      setTab("kv");
  }
  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setTablePage(0);
  };
  function downloadCsv() {
    const rows = [
      [
        "series_id",
        "series_label",
        "x",
        "y",
        "x_axis",
        "y_axis",
        "operation",
        "percentile",
        "detail",
      ],
      ...shownChart.flatMap((s) =>
        s.points
          .filter((p) => p.y != null)
          .map((p) => [
            s.id,
            s.label,
            p.x,
            p.y,
            xLabel,
            yLabel,
            tab === "ep" ? operation : kvOp,
            tab === "ep" ? percentile : "p50",
            p.detail,
          ]),
      ),
    ];
    downloadBlob(
      new Blob(
        ["\uFEFF", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
      `collectivex-${tab}-${tab === "ep" ? operation : kvView}.csv`,
    );
  }
  async function exportChart(format: "svg" | "png") {
    const svg = chartContainer.current?.querySelector("svg");
    if (!svg) return;
    try {
      if (format === "svg")
        exportSvg(svg, "collectivex-chart.svg", shownChart, language);
      else await exportPng(svg, "collectivex-chart.png", shownChart, language);
    } catch (e) {
      setMessages((m) => [
        ...m,
        `图表导出失败：${e instanceof Error ? e.message : e}`,
      ]);
    }
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="./" className="brand" aria-label={t("CollectiveX 首页")}>
          <span className="brand-icon">
            <Network size={21} />
          </span>
          <span>
            Collective<span className="brand-x">X</span>
            <small>DASHBOARD</small>
          </span>
        </a>
        <nav className="header-nav">
          <span className="nav-active">{t("性能实验台")}</span>
          <a
            href="https://github.com/SemiAnalysisAI/InferenceX/tree/main/experimental/CollectiveX"
            target="_blank"
            rel="noreferrer"
          >
            {t("上游项目")}
            <ArrowUpRight size={13} />
          </a>
        </nav>
        <div className="header-right">
          <LanguageSwitch />
          <span className="browser-badge">
            <span />
            {t("浏览器本地运行")}
          </span>
          <a
            href="https://github.com/Duyi-Wang/InferenceXCurve"
            className="icon-button"
            aria-label={t("参考 InferenceXCurve")}
            target="_blank"
            rel="noreferrer"
          >
            <Github size={19} />
          </a>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">COMMUNICATION BENCHMARK EXPLORER</p>
            <h1>
              {t("看清每一次 GPU 通信")}
              <span className="heading-dot">.</span>
            </h1>
            <p className="subtitle">
              {t(
                "对比 CollectiveX 延迟与带宽，探索不同硬件、通信库和并行配置的性能边界。",
              )}
            </p>
          </div>
          <button className="primary" onClick={() => setSource("official")}>
            <Plus size={17} />
            {t("添加数据")}
          </button>
        </div>
        <div className="source-strip">
          <span className="strip-label">{t("连接数据源")}</span>
          <button onClick={() => setSource("local")}>
            <Upload size={15} />
            {t("本地文件")}
            <span>JSON / CSV / ZIP</span>
          </button>
          <i />
          <button onClick={() => setSource("github")}>
            <Github size={15} />
            GitHub CI<span>Actions run URL</span>
          </button>
          <i />
          <button onClick={() => setSource("official")}>
            <Database size={15} />
            InferenceX<span>{t("官方数据库")}</span>
          </button>
          <span className="strip-end">{t("工作区自动保存在当前浏览器")}</span>
        </div>
        {messages.length > 0 && (
          <div className="message-banner" role="status">
            <div>
              {messages.slice(0, 8).map((m, i) => (
                <p key={i}>{message(m)}</p>
              ))}
              {messages.length > 8 && (
                <p>
                  {t("另有 {count} 条格式提示。", {
                    count: messages.length - 8,
                  })}
                </p>
              )}
            </div>
            <button
              className="icon-button"
              aria-label={t("关闭提示")}
              onClick={() => setMessages([])}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <section className="stat-grid" aria-label={t("当前选择的数据概览")}>
          <div className="stat-card">
            <span>
              {t("已选运行")}
              <Layers3 size={16} />
            </span>
            <strong>
              {active.length.toString().padStart(2, "0")}
              <small>/ {datasets.length}</small>
            </strong>
            <p>{t("独立样式，跨运行对比")}</p>
          </div>
          <div className="stat-card">
            <span>
              {t("硬件平台")}
              <Network size={16} />
            </span>
            <strong>{skus.length.toString().padStart(2, "0")}</strong>
            <p title={skus.join(" · ")}>
              {skus.slice(0, 4).join(" · ") || t("等待选择运行")}
            </p>
          </div>
          <div className="stat-card">
            <span>
              {t("实测数据点")}
              <Activity size={16} />
            </span>
            <strong>{number(measured, 0)}</strong>
            <p>{t("从已载入的 EP / KV 数据逐点计数")}</p>
          </div>
          <div className="stat-card source-card">
            <span>
              {t("数据来源")}
              <Database size={16} />
            </span>
            <strong className="text-stat">
              {active.length
                ? unique(active.map((d) => originLabel[d.origin])).join(" + ")
                : t("尚未选择")}
            </strong>
            <p>
              {active.some((d) => d.origin === "snapshot")
                ? t("随项目附带的真实历史快照，非实时数据")
                : t("来源与运行信息可在下方逐项核对")}
            </p>
          </div>
        </section>
        <section className="panel run-panel">
          <div className="panel-heading">
            <div>
              <h2>
                {t("运行工作区")}
                <span className="count">{datasets.length}</span>
              </h2>
              <p>{t("勾选运行叠加比较。颜色标识配置，线型区分运行。")}</p>
            </div>
            <div className="button-row">
              <button
                className="subtle"
                disabled={!datasets.length}
                onClick={() =>
                  downloadBlob(
                    new Blob(
                      [
                        JSON.stringify(
                          { datasets: datasets.map((d) => d.dataset) },
                          null,
                          2,
                        ),
                      ],
                      { type: "application/json" },
                    ),
                    "collectivex-workspace.json",
                  )
                }
              >
                <ArrowDownToLine size={15} />
                {t("导出 JSON")}
              </button>
              <button
                className="subtle"
                disabled={!datasets.length}
                onClick={() =>
                  downloadBlob(
                    new Blob(
                      [exportDatasetCsv(datasets.map((d) => d.dataset))],
                      { type: "text/csv;charset=utf-8" },
                    ),
                    "collectivex-datasets.csv",
                  )
                }
              >
                {t("数据 CSV")}
              </button>
              <button
                className="subtle"
                onClick={() =>
                  setDatasets((d) => d.map((v) => ({ ...v, visible: false })))
                }
                disabled={!active.length}
              >
                {t("取消全选")}
              </button>
            </div>
          </div>
          {loading ? (
            <div className="loading">
              <LoaderCircle size={21} className="spin" />
              {t("正在载入官方数据快照…")}
            </div>
          ) : datasets.length === 0 ? (
            <div className="empty">
              <Database size={28} />
              <h3>{t("添加第一组测试数据")}</h3>
              <p>{t("导入本地文件、CI run 或官方数据开始分析。")}</p>
              <button onClick={() => setSource("local")}>
                {t("添加数据")}
              </button>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="run-table">
                <thead>
                  <tr>
                    <th className="check-cell">{t("显示")}</th>
                    <th>{t("RUN / 来源")}</th>
                    <th>{t("测试时间")}</th>
                    <th>{t("硬件")}</th>
                    <th>{t("EP 曲线 / KV case")}</th>
                    <th>{t("工作流状态")}</th>
                    <th aria-label={t("操作")} />
                  </tr>
                </thead>
                <tbody>
                  {datasets.map((d) => (
                    <tr key={d.id} className={d.visible ? "selected-row" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          checked={d.visible}
                          aria-label={t("显示 {origin} {run}", {
                            origin: originLabel[d.origin],
                            run: d.dataset.run.run_id,
                          })}
                          onChange={(e) =>
                            setDatasets((old) =>
                              old.map((v) =>
                                v.id === d.id
                                  ? { ...v, visible: e.target.checked }
                                  : v,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <div className="run-id">
                          <svg width="23" height="10" aria-hidden="true">
                            <line
                              x1="0"
                              x2="23"
                              y1="5"
                              y2="5"
                              stroke="var(--selected-marker)"
                              strokeWidth="2"
                              strokeDasharray={chartDash(
                                Math.max(
                                  0,
                                  active.findIndex((v) => v.id === d.id),
                                ),
                              )}
                            />
                          </svg>
                          <strong>#{d.dataset.run.run_id}</strong>
                          <a
                            href={
                              /^https:\/\/github\.com\//.test(
                                d.dataset.run.run_url ?? "",
                              )
                                ? d.dataset.run.run_url
                                : `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${d.dataset.run.run_id}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t("打开 run {run}", {
                              run: d.dataset.run.run_id,
                            })}
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                        <span
                          className="source-tag"
                          title={t("{label} · 载入于 {time}", {
                            label: message(d.label),
                            time: d.loadedAt,
                          })}
                        >
                          {originLabel[d.origin]} · attempt{" "}
                          {d.dataset.run.run_attempt}
                        </span>
                      </td>
                      <td className="mono">
                        {shortDate(d.dataset.run.generated_at, language)}
                      </td>
                      <td>
                        <div className="sku-list">
                          {d.dataset.run.covered_skus.slice(0, 3).map((s) => (
                            <span key={s}>{s}</span>
                          ))}
                          {d.dataset.run.covered_skus.length > 3 && (
                            <span title={d.dataset.run.covered_skus.join(", ")}>
                              +{d.dataset.run.covered_skus.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="mono">
                        {d.dataset.series.length}{" "}
                        <span className="muted">/</span>{" "}
                        {(d.dataset.kv ?? []).length}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${d.dataset.run.conclusion === "success" ? "success" : "neutral"}`}
                        >
                          {d.dataset.run.conclusion === "success" && (
                            <Check size={11} />
                          )}{" "}
                          {d.dataset.run.conclusion ?? "pending"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={t("移除 {run}", {
                            run: d.dataset.run.run_id,
                          })}
                          onClick={() =>
                            setDatasets((old) =>
                              old.filter((v) => v.id !== d.id),
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div
          className="explorer-tabs"
          role="tablist"
          aria-label={t("分析视图")}
        >
          {(
            [
              ["ep", Network, "Expert Parallel"],
              ["kv", Layers3, "KV Transfer"],
              ["coverage", Check, t("测试覆盖")],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? "active" : ""}
              onClick={() => {
                setTab(value);
                setTableSearch("");
                setTablePage(0);
              }}
            >
              <Icon size={16} />
              {label}
              {value === "kv" && <span>{kvCases.length}</span>}
            </button>
          ))}
          <span className="tab-note">
            {t("CollectiveX v1 · 可追溯到原始运行")}
          </span>
        </div>
        {tab !== "coverage" ? (
          <section className="panel explorer-panel">
            <div className="filter-toolbar">
              <div className="filter-label">
                <SlidersHorizontal size={16} />
                {tab === "ep" ? t("测试配置") : t("传输配置")}
              </div>
              {tab === "ep" ? (
                <>
                  {(
                    [
                      ["phase", t("阶段"), allSeries.map((s) => s.phase)],
                      ["mode", t("Kernel 模式"), allSeries.map((s) => s.mode)],
                      [
                        "precision",
                        t("精度"),
                        allSeries.map((s) => s.precision),
                      ],
                      [
                        "ep",
                        "EP",
                        allSeries.map((s) => String(s.system.ep_size)),
                      ],
                      [
                        "sku",
                        t("硬件 SKU"),
                        allSeries.map((s) => s.system.sku),
                      ],
                      ["backend", t("通信库"), allSeries.map((s) => s.backend)],
                    ] as [keyof Filters, string, string[]][]
                  ).map(([key, label, values]) => (
                    <Select
                      key={key}
                      label={label}
                      value={filters[key]}
                      options={[
                        ["all", t("全部")],
                        ...unique([
                          ...values,
                          ...(filters[key] !== "all" ? [filters[key]] : []),
                        ]),
                      ]}
                      onChange={(v) => setFilter(key, v)}
                    />
                  ))}
                </>
              ) : (
                <>
                  <Select
                    label={t("图表")}
                    value={kvView}
                    options={[
                      ["bandwidth", t("带宽 / Batch")],
                      ["latency", t("Burst 延迟 / Batch")],
                      ["frontier", t("带宽上包络 / ISL")],
                      ["overlap", t("并发收益 / Batch")],
                    ]}
                    onChange={(v) => setKvView(v as typeof kvView)}
                  />
                  <Select
                    label={t("方向")}
                    value={kvOp}
                    options={["pull", "push"]}
                    onChange={(v) => setKvOp(v as typeof kvOp)}
                  />
                  <Select
                    label="Page tokens"
                    value={String(effectivePage)}
                    options={kvPages.map(String)}
                    onChange={(v) => setKvPage(Number(v))}
                  />
                  {kvView !== "frontier" && (
                    <Select
                      label="ISL"
                      value={effectiveIsl}
                      options={[["max", t("各 case 最大 ISL")], ...kvIsls]}
                      onChange={setKvIsl}
                    />
                  )}
                </>
              )}
              <button
                className="icon-button reset-filters"
                title={t("重置筛选")}
                aria-label={t("重置筛选")}
                onClick={() => {
                  setFilters({
                    phase: "all",
                    mode: "all",
                    precision: "all",
                    ep: "all",
                    sku: "all",
                    backend: "all",
                  });
                  setHidden(new Set());
                }}
              >
                <RotateCcw size={15} />
              </button>
            </div>
            <div className="chart-heading">
              <div>
                <p className="eyebrow">
                  {tab === "ep"
                    ? "EXPERT PARALLEL COMMUNICATION"
                    : "PREFILL → DECODE HANDOFF"}
                </p>
                <h2>
                  {tab === "ep" ? t("通信性能曲线") : t("KV Cache 传输性能")}
                </h2>
                <p>
                  {tab === "ep"
                    ? metrics[metric].hint
                    : kvView === "overlap"
                      ? t(
                          "同一 ISL 下，相对 batch=1 的带宽收益。缺少基准的 case 不显示。",
                        )
                      : kvView === "frontier"
                        ? t(
                            "每个 ISL 取各 batch 中的最高实测带宽；bulk 单独显示。",
                          )
                        : t(
                            "Burst 延迟是整批完成时间；带宽包含该批所有请求的数据量。",
                          )}
                </p>
              </div>
              <div className="button-row export-buttons">
                <button onClick={downloadCsv} disabled={!plotPoints.length}>
                  {t("图表 CSV")}
                </button>
                <button
                  onClick={() => void exportChart("svg")}
                  disabled={!plotPoints.length}
                >
                  SVG
                </button>
                <button
                  onClick={() => void exportChart("png")}
                  disabled={!plotPoints.length}
                >
                  PNG <ArrowDownToLine size={13} />
                </button>
              </div>
            </div>
            <div className="chart-controls">
              {tab === "ep" && (
                <>
                  <div className="segmented" aria-label={t("性能指标")}>
                    {(Object.keys(METRICS) as Metric[]).map((m) => (
                      <button
                        key={m}
                        className={metric === m ? "active" : ""}
                        onClick={() => {
                          setMetric(m);
                          if (
                            m === "tokens" &&
                            !["roundtrip", "pair_period"].includes(operation)
                          )
                            setOperation("roundtrip");
                        }}
                      >
                        {metrics[m].label}
                      </button>
                    ))}
                  </div>
                  <Select
                    label={t("操作")}
                    value={operation}
                    options={(
                      Object.entries(OPERATIONS) as [Operation, string][]
                    ).filter(
                      ([key]) =>
                        metric !== "tokens" ||
                        ["roundtrip", "pair_period"].includes(key),
                    )}
                    onChange={(v) => setOperation(v as Operation)}
                  />
                  <Select
                    label={t("分位数")}
                    value={percentile}
                    options={["p50", "p90", "p95", "p99"]}
                    onChange={(v) => setPercentile(v as Percentile)}
                  />
                </>
              )}
              <div className="scale-toggles">
                <label>
                  <input
                    type="checkbox"
                    checked={logX}
                    onChange={(e) => setLogX(e.target.checked)}
                  />
                  Log X
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={logY}
                    onChange={(e) => setLogY(e.target.checked)}
                  />
                  Log Y
                </label>
                {tab === "ep" && metric === "latency" && (
                  <label>
                    <input
                      type="checkbox"
                      checked={band}
                      onChange={(e) => setBand(e.target.checked)}
                    />
                    {t("p50–p99 区间")}
                  </label>
                )}
              </div>
            </div>
            {tab === "ep" &&
              ["roundtrip", "pair_period", "isolated_sum"].includes(
                operation,
              ) && (
                <div className="metric-note">
                  <span />{" "}
                  {operation === "pair_period"
                    ? t(
                        "Pair period：连续 dispatch → combine 的稳态周期。官方 API 未提供该组件，请导入包含此测量的原始 CI artifacts。",
                      )
                    : operation === "roundtrip"
                      ? t(
                          "Roundtrip：独立测量的 dispatch → combine 往返延迟；与新版本 pair period 的口径不同，不互相替代。",
                        )
                      : t(
                          "Isolated sum：独立测量组件之和，只用于诊断，不等同于实测 roundtrip。",
                        )}
                </div>
              )}
            <div className="chart-layout">
              <div className="plot-wrap" ref={chartContainer}>
                {plotPoints.length ? (
                  <PerformanceChart
                    series={shownChart}
                    xLabel={xLabel}
                    yLabel={yLabel}
                    logX={logX}
                    logY={logY}
                    showBand={band && tab === "ep" && metric === "latency"}
                    id="performance-chart"
                  />
                ) : (
                  <div className="empty chart-empty">
                    <BarChart3 size={35} />
                    <h3>
                      {active.length
                        ? t("当前选择没有可绘制的测量值")
                        : t("选择一个运行开始探索")}
                    </h3>
                    <p>
                      {tab === "kv"
                        ? t(
                            "在运行工作区勾选含 KV case 的运行，或导入 KV 测试结果。",
                          )
                        : t(
                            "可调整筛选条件、操作或分位数；缺失值不会被补成 0。",
                          )}
                    </p>
                    <button
                      onClick={() => {
                        setFilters({
                          phase: "all",
                          mode: "all",
                          precision: "all",
                          ep: "all",
                          sku: "all",
                          backend: "all",
                        });
                        setHidden(new Set());
                      }}
                    >
                      {t("重置筛选与图例")}
                    </button>
                  </div>
                )}
              </div>
              <aside className="legend">
                <div className="legend-heading">
                  <strong>
                    {t("对比系列")}
                    <span>{allChart.length}</span>
                  </strong>
                  <button onClick={() => setHidden(new Set())}>
                    {t("显示全部")}
                  </button>
                </div>
                <p>{t("点击显示 / 隐藏曲线")}</p>
                <div className="legend-list">
                  {allChart.map((s) => (
                    <button
                      key={s.id}
                      className={`legend-item ${hidden.has(s.id) ? "is-hidden" : ""}`}
                      onClick={() =>
                        setHidden((old) => {
                          const next = new Set(old);
                          next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                          return next;
                        })
                      }
                      aria-pressed={!hidden.has(s.id)}
                      title={s.label}
                    >
                      <svg
                        width="21"
                        height="14"
                        className="legend-swatch-svg"
                        aria-hidden="true"
                      >
                        <line
                          x1="0"
                          x2="21"
                          y1="7"
                          y2="7"
                          stroke={chartColor(s.colorKey)}
                          strokeWidth="2"
                          strokeDasharray={chartDash(s.runIndex)}
                        />
                      </svg>
                      <span>
                        {s.label}
                        <small>
                          {t("{count} 个测量点", {
                            count: s.points.filter((p) => p.y != null).length,
                          })}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
            <div className="chart-footer">
              <span>
                <span className="live-dot" />
                {t("{series} 条可见系列 · {points} 个测量点", {
                  series: shownChart.length,
                  points: plotPoints.length,
                })}
              </span>
              <span>{t("悬停或聚焦数据点查看详细测量值")}</span>
            </div>
            {tab === "ep" && (
              <details className="methodology">
                <summary>{t("测量口径与带宽拟合")}</summary>
                <p>
                  {t(
                    "延迟单位为 µs；带宽使用十进制 GB/s。Payload 带宽按 GPU 归一，包含 FP8 scale bytes；Activation 带宽是所有 rank 的聚合值。p99 速率表示“p99 延迟所对应的速率”，不是速率分布的 p99。",
                  )}
                </p>
                <p>
                  {t(
                    "只对同一配置的原始 payload bytes / EP 与延迟做最小二乘拟合：latency ≈ α + bytes / β。至少需要 3 个有效点与正斜率；拟合只作诊断，不作为硬件线速结论。",
                  )}
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("系列")}</th>
                        <th>{t("α 固定项 (µs)")}</th>
                        <th>{t("β 拟合带宽 (GB/s/GPU)")}</th>
                        <th>{t("有效点 / R²")}</th>
                        <th>{t("可靠性")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered
                        .filter((v) => !hidden.has(v.id))
                        .map(({ series: s, owner, id }) => {
                          const fit = fitAlphaBeta(s, operation, percentile);
                          return (
                            <tr key={id}>
                              <td>
                                {labelFor(s)} · #{owner.dataset.run.run_id}
                              </td>
                              <td>{number(fit?.alphaUs)}</td>
                              <td>{number(fit?.betaGbps)}</td>
                              <td>
                                {fit
                                  ? `${fit.pointCount} / ${number(fit.rSquared, 3)}`
                                  : "—"}
                              </td>
                              <td>
                                {fit
                                  ? `${fit.betaReliable ? t("拟合可参考") : t("β 不可靠（仅诊断）")}${fit.alphaExtrapolated ? t(" · α 为远端外推") : ""}`
                                  : t("有效点不足或斜率非正")}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </section>
        ) : (
          <section className="panel coverage-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("测试覆盖与失败原因")}</h2>
                <p>
                  {t(
                    "保留 unsupported、failed、pending 状态；没有测量值的测试不进入性能曲线。",
                  )}
                </p>
              </div>
              <input
                type="search"
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setTablePage(0);
                }}
                placeholder={t("搜索 SKU、通信库、失败原因…")}
                aria-label={t("搜索测试覆盖")}
              />
            </div>
            <div className="coverage-summary">
              {unique(coverage.map((c) => c.outcome)).map((status) => (
                <span
                  key={status}
                  className={`status-badge ${status === "success" ? "success" : "neutral"}`}
                >
                  {status}{" "}
                  <strong>
                    {coverage.filter((c) => c.outcome === status).length}
                  </strong>
                </span>
              ))}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Case / Run</th>
                    <th>Suite</th>
                    <th>{t("状态")}</th>
                    <th>{t("实测 / 请求点")}</th>
                    <th>{t("原因")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCoverage
                    .slice(tablePage * 30, tablePage * 30 + 30)
                    .map((c, i) => (
                      <tr key={`${c.runId}:${c.case_id}:${i}`}>
                        <td>
                          <strong>{c.label}</strong>
                          <small className="table-sub">
                            #{c.runId} · {c.topology.nodes}×
                            {c.topology.gpus_per_node} GPU ·{" "}
                            {c.topology.scale_up_transport}{" "}
                            {c.topology.scale_out_transport}
                          </small>
                        </td>
                        <td>{c.suite}</td>
                        <td>
                          <span
                            className={`status-badge ${c.outcome === "success" ? "success" : "neutral"}`}
                          >
                            {c.outcome}
                          </span>
                        </td>
                        <td>
                          {c.measured} / {c.total}
                          {c.suite === "KV" && (
                            <small className="table-sub">
                              {t("仅含已返回行")}
                            </small>
                          )}
                        </td>
                        <td className="reason-cell">
                          {c.reason ?? "—"}
                          {c.detail && (
                            <details>
                              <summary>{t("详情")}</summary>
                              <p>{c.detail}</p>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!filteredCoverage.length && (
                <div className="empty">{t("没有符合条件的测试记录")}</div>
              )}
            </div>
            <div className="pagination">
              <span>
                {t("{count} 条记录 · 第 {page} 页", {
                  count: filteredCoverage.length,
                  page: tablePage + 1,
                })}
              </span>
              <div>
                <button
                  disabled={!tablePage}
                  onClick={() => setTablePage((p) => p - 1)}
                >
                  {t("上一页")}
                </button>
                <button
                  disabled={(tablePage + 1) * 30 >= filteredCoverage.length}
                  onClick={() => setTablePage((p) => p + 1)}
                >
                  {t("下一页")}
                </button>
              </div>
            </div>
          </section>
        )}
        {tab !== "coverage" && (
          <section className="panel raw-panel">
            <button
              className="raw-toggle"
              onClick={() => setRawOpen((v) => !v)}
              aria-expanded={rawOpen}
            >
              <span>
                <Activity size={17} />
                <strong>{t("图表数据")}</strong>
                <small>
                  {t("{count} 个可见点", { count: plotPoints.length })}
                </small>
              </span>
              <ChevronDown
                size={17}
                style={{ transform: rawOpen ? "rotate(180deg)" : undefined }}
              />
            </button>
            {rawOpen && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("系列")}</th>
                      <th>{xLabel}</th>
                      <th>{yLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownChart
                      .flatMap((s) =>
                        s.points
                          .filter((p) => p.y != null)
                          .map((p, i) => (
                            <tr key={`${s.id}:${i}`}>
                              <td>{s.label}</td>
                              <td className="mono">{number(p.x)}</td>
                              <td className="mono">{number(p.y, 5)}</td>
                            </tr>
                          )),
                      )
                      .slice(0, 300)}
                  </tbody>
                </table>
                {plotPoints.length > 300 && (
                  <p className="muted small">
                    {t("页面显示前 300 点；CSV 导出包含全部可见数据。")}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
        <footer>
          <span>
            CollectiveX Dashboard <i />
            {t("基于 InferenceX 公开数据与测试协议独立构建")}
          </span>
          <a
            href="https://github.com/SemiAnalysisAI/InferenceX/pull/2004"
            target="_blank"
            rel="noreferrer"
          >
            {t("研究起点 · PR #2004")}
            <ArrowUpRight size={13} />
          </a>
        </footer>
      </main>
      {source && (
        <SourcesPanel
          initialTab={source}
          onClose={() => setSource(null)}
          onImport={receive}
        />
      )}
    </div>
  );
}
