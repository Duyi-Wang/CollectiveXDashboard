import { LanguageSwitch, useI18n } from "./i18n-react";
import { useEffect, useRef, useState } from "react";
import {
  X,
  Upload,
  Github,
  Database,
  ArrowDownToLine,
  LoaderCircle,
  FileJson,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import type { ImportResult, LoadedDataset } from "./model";
import { importFiles, parseDocuments } from "./importers";
import {
  fetchOfficialLatest,
  fetchOfficialRun,
  fetchOfficialRuns,
  fetchSnapshotIndex,
  fetchSnapshotRun,
  loadGitHubRunArtifacts,
  type RunSummary,
} from "./sources";
import { number, shortDate } from "./utils";

export type SourceTab = "local" | "github" | "official";
interface Props {
  initialTab: SourceTab;
  onClose: () => void;
  onImport: (
    result: ImportResult,
    origin: LoadedDataset["origin"],
    label: string,
  ) => void;
}
export default function SourcesPanel({ initialTab, onClose, onImport }: Props) {
  const { language, t, message } = useI18n();
  const [tab, setTab] = useState(initialTab);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [runId, setRunId] = useState("");
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [drag, setDrag] = useState(false);
  const [complete, setComplete] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      abort.current?.abort();
    };
  }, []);
  async function task(action: (signal: AbortSignal) => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus("正在连接数据源…");
    abort.current = new AbortController();
    try {
      await action(abort.current.signal);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  const receive = (
    result: ImportResult,
    origin: LoadedDataset["origin"],
    label: string,
  ) => {
    if (!result.datasets.length)
      throw new Error(
        result.warnings.join("；") || "没有找到可导入的 CollectiveX 数据。",
      );
    onImport(result, origin, label);
    setStatus(
      `已导入 ${result.datasets.length} 组数据${result.warnings.length ? ` · ${result.warnings.length} 条格式提示（已显示在主界面）` : ""}`,
    );
  };
  async function localFiles(files: FileList | File[]) {
    if (!files.length || busy) return;
    const selected = Array.from(files);
    await task(async () => {
      const inputs = await Promise.all(
        selected.map(async (f) => ({
          name: f.name,
          bytes: new Uint8Array(await f.arrayBuffer()),
        })),
      );
      receive(
        await importFiles(inputs),
        "local",
        selected.map((f) => f.name).join(", "),
      );
    });
  }
  return (
    <dialog
      ref={dialog}
      className="source-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
      aria-labelledby="source-title"
    >
      <div className="dialog-header">
        <div>
          <p className="eyebrow">DATA CONNECTIONS</p>
          <h2 id="source-title">{t("导入测试数据")}</h2>
        </div>
        <LanguageSwitch />
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={t("关闭数据导入")}
        >
          <X size={20} />
        </button>
      </div>
      <p className="muted">
        {t("从三个来源添加数据，在同一张图上比较不同运行与配置。")}
      </p>
      <div className="source-tabs" role="tablist" aria-label={t("数据源")}>
        {(
          [
            ["local", Upload, t("本地文件")],
            ["github", Github, "GitHub CI"],
            ["official", Database, t("官方数据库")],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              setError("");
              setStatus("");
            }}
            disabled={busy}
            className={tab === value ? "active" : ""}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div className="source-content">
        {tab === "local" && (
          <>
            <label
              className={`dropzone ${drag ? "drag" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void localFiles(e.dataTransfer.files);
              }}
            >
              <input
                type="file"
                multiple
                accept=".json,.jsonl,.ndjson,.csv,.tsv,.zip"
                disabled={busy}
                onChange={(e) => {
                  if (e.target.files) void localFiles(e.target.files);
                  e.target.value = "";
                }}
                aria-label={t("选择本地数据文件")}
              />
              <span className="drop-icon">
                <Upload size={24} />
              </span>
              <strong>{t("拖放文件到这里，或点击选择")}</strong>
              <span>{t("JSON · JSONL · CSV · ZIP，可同时导入多个文件")}</span>
            </label>
            <div className="info-box">
              <FileJson size={18} />
              <div>
                <strong>{t("兼容 CollectiveX 原生数据")}</strong>
                <p>
                  {t(
                    "支持官方 API 数据集、case-attempt shard、matrix + 结果 ZIP，以及工作区导出的 JSON / 数据 CSV（图表 CSV 仅用于分析）。原始 matrix 与 shard 请一起选择，以保留未成功的测试状态。",
                  )}
                </p>
              </div>
            </div>
          </>
        )}
        {tab === "github" && (
          <>
            <label className="field">
              GitHub Actions run URL
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/SemiAnalysisAI/InferenceX/actions/runs/…"
                disabled={busy}
              />
            </label>
            <label className="field">
              GitHub token{" "}
              <span className="muted small">
                {t("下载 artifact 需要 Actions: read")}
              </span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t("github_pat_… 或 ghp_…")}
                disabled={busy}
              />
            </label>
            <p className="small muted">
              <ShieldCheck size={14} />
              {t("Token 仅用于本次浏览器请求，关闭窗口即清除，不保存或导出。")}
            </p>
            <button
              className="primary wide"
              disabled={busy || !url.trim()}
              onClick={() =>
                void task(async (signal) => {
                  const result = await loadGitHubRunArtifacts(
                    url.trim(),
                    token.trim(),
                    {
                      signal,
                      onProgress: (done, total, name) =>
                        setStatus(`读取 artifact ${done}/${total} · ${name}`),
                    },
                  );
                  const parsed = await importFiles(result.files, {
                    run: result.run,
                  });
                  receive(
                    {
                      datasets: parsed.datasets,
                      warnings: [...result.warnings, ...parsed.warnings],
                    },
                    "github",
                    url.trim(),
                  );
                })
              }
            >
              <Github size={16} />
              {t("读取 CI run 并导入")}
            </button>
            <p className="small muted">
              {t(
                "支持指定 run attempt。已过期的 artifacts 无法从 GitHub 恢复，可在官方数据库查找缓存或导入本地备份。",
              )}
            </p>
            <a
              className="text-link"
              href="https://github.com/SemiAnalysisAI/InferenceX/actions/workflows/collectivex-sweep.yml"
              target="_blank"
              rel="noreferrer"
            >
              {t("查看 CollectiveX sweep runs")}
              <ExternalLink size={13} />
            </a>
          </>
        )}
        {tab === "official" && (
          <>
            <div className="info-box">
              <Database size={18} />
              <div>
                <strong>InferenceX · CollectiveX v1</strong>
                <p>
                  {t(
                    "直接读取官方公开 API，无需数据库凭据。可按 run 选择历史数据，也可以载入当前最新运行。",
                  )}
                </p>
              </div>
            </div>
            <div className="button-row">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void task(async (signal) =>
                    receive(
                      await parseDocuments([
                        await fetchOfficialLatest(undefined, signal),
                      ]),
                      "official",
                      t("InferenceX 官方最新数据"),
                    ),
                  )
                }
              >
                <ArrowDownToLine size={16} />
                {t("导入最新运行")}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void task(async (signal) => {
                    const list = await fetchOfficialRuns(undefined, signal);
                    setRuns(list.runs);
                    setComplete(list.discovery_complete);
                    setStatus(`发现 ${list.runs.length} 个运行`);
                  })
                }
              >
                {t("浏览运行列表")}
              </button>
            </div>
            <div className="inline-input">
              <label className="field">
                {t("按 run ID 读取")}
                <input
                  inputMode="numeric"
                  value={runId}
                  onChange={(e) => setRunId(e.target.value)}
                  placeholder={t("例如 34432070017")}
                  disabled={busy}
                />
              </label>
              <button
                disabled={busy || !/^\d+$/.test(runId)}
                onClick={() =>
                  void task(async (signal) =>
                    receive(
                      await parseDocuments([
                        await fetchOfficialRun(runId, undefined, signal),
                      ]),
                      "official",
                      `InferenceX #${runId}`,
                    ),
                  )
                }
              >
                {t("导入")}
              </button>
            </div>
            {!complete && (
              <p className="notice">
                {t("官方仍在发现更多运行，再次点击“浏览运行列表”可刷新。")}
              </p>
            )}
            {runs.length > 0 && (
              <div className="remote-runs">
                {runs.map((run) => (
                  <div className="remote-run" key={run.run_id}>
                    <div>
                      <strong>#{run.run_id}</strong>
                      <span>
                        {shortDate(run.generated_at ?? "", language)} ·{" "}
                        {(run.covered_skus ?? []).join(", ")} ·{" "}
                        {t("{count} 个实测 case", {
                          count: number(run.measured_cases, 0),
                        })}
                      </span>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void task(async (signal) =>
                          receive(
                            await parseDocuments([
                              await fetchOfficialRun(
                                run.run_id,
                                undefined,
                                signal,
                              ),
                            ]),
                            "official",
                            `InferenceX #${run.run_id}`,
                          ),
                        )
                      }
                    >
                      {t("导入")}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              className="subtle wide"
              disabled={busy}
              onClick={() =>
                void task(async (signal) => {
                  const index = await fetchSnapshotIndex(signal);
                  const docs = await Promise.all(
                    index.runs.map((run) =>
                      fetchSnapshotRun(run.run_id, index, signal),
                    ),
                  );
                  receive(
                    await parseDocuments(docs),
                    "snapshot",
                    `官方离线快照 ${index.fetched_at}`,
                  );
                })
              }
            >
              {t("载入随项目附带的官方快照（可离线）")}
            </button>
          </>
        )}
      </div>
      {tab !== "local" && (
        <details className="cors-help" open>
          <summary>{t("首次连接：启用浏览器 CORS 插件")}</summary>
          <p>
            {t(
              "本应用直接从浏览器访问 API。请使用你在 InferenceXCurve 中使用的 CORS 插件，优先仅对",
            )}
            <code>inferencex.semianalysis.com</code>{" "}
            {t(
              "启用，并授予插件访问当前 Dashboard 页面的站点权限。GitHub API 通常自带 CORS 支持，避免插件添加重复响应头；若 artifact 重定向下载被阻止，可按插件说明设置下载域名，或下载 ZIP 后本地导入。",
            )}
          </p>
          <p>
            {t(
              "插件只解决跨域限制；GitHub token 权限、速率限制和 artifact 过期仍由 GitHub 控制。按插件说明限定使用的网站，使用后可关闭。",
            )}
          </p>
        </details>
      )}
      {busy && (
        <button className="subtle" onClick={() => abort.current?.abort()}>
          {t("取消连接")}
        </button>
      )}
      {status && (
        <p
          className={`import-status ${busy ? "is-loading" : "is-success"}`}
          role="status"
        >
          {busy && <LoaderCircle className="spin" size={16} />}{" "}
          {message(status)}
        </p>
      )}
      {error && (
        <div className="error-box" role="alert">
          {message(error)}
        </div>
      )}
    </dialog>
  );
}
