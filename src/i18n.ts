export type Language = "en" | "zh";
export const LANGUAGE_STORAGE_KEY = "collectivex-dashboard:language";
export type TranslationParams = Record<string, string | number>;

/** UI copy only. Benchmark fields, identifiers, file names and upstream details stay intact. */
export const ENGLISH: Record<string, string> = {
  "在此浏览器保存 Token": "Save token in this browser",
  "清除 Token": "Clear token",
  "保存后会在此站点的浏览器存储中以未加密形式保留，仅在可信设备上启用。Token 不包含在任何导出中。":
    "Saved tokens are stored unencrypted in this browser for this site. Enable only on a trusted device. Tokens are never included in exports.",
  "已保存在此浏览器，关闭窗口或刷新后可自动填入。":
    "Saved in this browser. The token will be filled in when you reopen the dialog or reload.",
  "输入 Token 后将自动保存。":
    "The token will be saved automatically when entered.",
  "未保存：Token 仅用于本次会话，关闭窗口后清除。":
    "Not saved: the token is used for this session only and cleared when the dialog closes.",
  "无法读取浏览器保存的 Token；仍可手动输入并用于本次会话。":
    "Cannot read saved tokens from browser storage. You can still enter a token for this session.",
  "无法保存 Token。当前输入仍可用于本次会话；之前保存的 Token 可能仍在浏览器中。":
    "Could not save the token. The current entry can still be used for this session; a previously saved token may remain in browser storage.",
  "无法删除已保存的 Token。请重试，或在浏览器设置中清除此站点的数据。":
    "Could not remove the saved token. Retry or clear this site's data in your browser settings.",
  "CollectiveX 首页": "CollectiveX home",
  性能实验台: "Benchmark explorer",
  上游项目: "Upstream project",
  浏览器本地运行: "Runs in your browser",
  "参考 InferenceXCurve": "Reference: InferenceXCurve",
  "看清每一次 GPU 通信": "Understand every GPU transfer",
  "对比 CollectiveX 延迟与带宽，探索不同硬件、通信库和并行配置的性能边界。":
    "Compare CollectiveX latency and bandwidth across hardware, communication libraries and parallel configurations.",
  添加数据: "Add data",
  连接数据源: "Data sources",
  本地文件: "Local files",
  官方快照: "Official snapshot",
  官方实时: "Official live",
  官方数据库: "Official database",
  工作区自动保存在当前浏览器: "Workspace saved in this browser",
  另有: "Another ",
  "条格式提示。": " format notes.",
  "另有 {count} 条格式提示。": "{count} more format notes.",
  关闭提示: "Dismiss message",
  当前选择的数据概览: "Selected data overview",
  已选运行: "Selected runs",
  "独立样式，跨运行对比": "Independent styles for each run",
  硬件平台: "Hardware platforms",
  等待选择运行: "Select a run to begin",
  实测数据点: "Measured points",
  "从已载入的 EP / KV 数据逐点计数": "Counted from loaded EP / KV observations",
  数据来源: "Data origin",
  尚未选择: "None selected",
  "随项目附带的真实历史快照，非实时数据":
    "Bundled historical measurements, not live data",
  来源与运行信息可在下方逐项核对: "Inspect each source and run below",
  运行工作区: "Run workspace",
  "勾选运行叠加比较。颜色标识配置，线型区分运行。":
    "Select runs to compare. Colors identify configurations; line patterns identify runs.",
  "导出 JSON": "Export JSON",
  "数据 CSV": "Dataset CSV",
  取消全选: "Deselect all",
  "正在载入官方数据快照…": "Loading official data snapshots…",
  添加第一组测试数据: "Add your first benchmark dataset",
  "导入本地文件、CI run 或官方数据开始分析。":
    "Import local files, a CI run or official data to start exploring.",
  显示: "Show",
  "RUN / 来源": "RUN / Source",
  测试时间: "Run time",
  硬件: "Hardware",
  "EP 曲线 / KV case": "EP series / KV cases",
  工作流状态: "Workflow status",
  操作: "Operation",
  分析视图: "Analysis views",
  测试覆盖: "Test coverage",
  "CollectiveX v1 · 可追溯到原始运行":
    "CollectiveX v1 · Traceable to the original run",
  测试配置: "Configuration",
  传输配置: "Transfer settings",
  阶段: "Phase",
  "Kernel 模式": "Kernel mode",
  精度: "Precision",
  "硬件 SKU": "Hardware SKU",
  通信库: "Backend",
  全部: "All",
  图表: "Chart",
  "带宽 / Batch": "Bandwidth / Batch",
  "Burst 延迟 / Batch": "Burst latency / Batch",
  "带宽上包络 / ISL": "Bandwidth envelope / ISL",
  "并发收益 / Batch": "Overlap gain / Batch",
  方向: "Direction",
  "各 case 最大 ISL": "Largest ISL per case",
  重置筛选: "Reset filters",
  通信性能曲线: "Communication performance",
  "KV Cache 传输性能": "KV cache transfer performance",
  "同一 ISL 下，相对 batch=1 的带宽收益。缺少基准的 case 不显示。":
    "Bandwidth relative to batch 1 at the same ISL. Cases without a baseline are omitted.",
  "每个 ISL 取各 batch 中的最高实测带宽；bulk 单独显示。":
    "Highest measured bandwidth across batches at each ISL. Bulk transfers are shown separately.",
  "Burst 延迟是整批完成时间；带宽包含该批所有请求的数据量。":
    "Burst latency measures completion of the whole batch; bandwidth includes all requests in that batch.",
  "图表 CSV": "Chart CSV",
  性能指标: "Performance metric",
  分位数: "Percentile",
  "p50–p99 区间": "p50–p99 band",
  "Pair period：连续 dispatch → combine 的稳态周期。官方 API 未提供该组件，请导入包含此测量的原始 CI artifacts。":
    "Pair period: steady-state cadence of consecutive dispatch → combine pairs. The official API omits this component; import raw CI artifacts that contain it.",
  "Roundtrip：独立测量的 dispatch → combine 往返延迟；与新版本 pair period 的口径不同，不互相替代。":
    "Roundtrip: independently measured dispatch → combine latency. Its measurement semantics differ from pair period; the two are not interchangeable.",
  "Isolated sum：独立测量组件之和，只用于诊断，不等同于实测 roundtrip。":
    "Isolated sum: sum of independently measured components, for diagnostics only. It is not a measured roundtrip.",
  当前选择没有可绘制的测量值: "No measurements match this selection",
  选择一个运行开始探索: "Select a run to start exploring",
  "在运行工作区勾选含 KV case 的运行，或导入 KV 测试结果。":
    "Select a run with KV cases in the workspace, or import KV benchmark results.",
  "可调整筛选条件、操作或分位数；缺失值不会被补成 0。":
    "Try different filters, operations or percentiles. Missing values are never filled with zero.",
  重置筛选与图例: "Reset filters and legend",
  对比系列: "Comparison series",
  显示全部: "Show all",
  "点击显示 / 隐藏曲线": "Click to show or hide a series",
  个测量点: " measured points",
  "{count} 个测量点": "{count} measured points",
  "条可见系列 ·": " visible series · ",
  "{series} 条可见系列 · {points} 个测量点":
    "{series} visible series · {points} measured points",
  悬停或聚焦数据点查看详细测量值:
    "Hover over or focus a point to inspect measurements",
  测量口径与带宽拟合: "Measurement semantics and bandwidth fit",
  "延迟单位为 µs；带宽使用十进制 GB/s。Payload 带宽按 GPU 归一，包含 FP8 scale bytes；Activation 带宽是所有 rank 的聚合值。p99 速率表示“p99 延迟所对应的速率”，不是速率分布的 p99。":
    "Latency is in µs; bandwidth uses decimal GB/s. Payload bandwidth is per GPU and includes FP8 scale bytes. Activation bandwidth is aggregated across ranks. A p99 rate is the rate at p99 latency, not the p99 of a rate distribution.",
  "只对同一配置的原始 payload bytes / EP 与延迟做最小二乘拟合：latency ≈ α + bytes / β。至少需要 3 个有效点与正斜率；拟合只作诊断，不作为硬件线速结论。":
    "Fit latency against payload bytes / EP within each configuration using least squares: latency ≈ α + bytes / β. At least 3 valid points and a positive slope are required. This diagnostic fit does not establish physical link capacity.",
  系列: "Series",
  "α 固定项 (µs)": "α Fixed overhead (µs)",
  "β 拟合带宽 (GB/s/GPU)": "β Fitted bandwidth (GB/s/GPU)",
  "有效点 / R²": "Valid points / R²",
  可靠性: "Reliability",
  拟合可参考: "Fit meets reliability thresholds",
  "β 不可靠（仅诊断）": "Unreliable β (diagnostic only)",
  " · α 为远端外推": " · α is extrapolated",
  有效点不足或斜率非正: "Too few valid points or non-positive slope",
  测试覆盖与失败原因: "Test coverage and failure reasons",
  "保留 unsupported、failed、pending 状态；没有测量值的测试不进入性能曲线。":
    "Unsupported, failed and pending cases remain visible. Cases without measurements are excluded from performance curves.",
  "搜索 SKU、通信库、失败原因…": "Search SKU, backend or failure reason…",
  搜索测试覆盖: "Search test coverage",
  状态: "Status",
  "实测 / 请求点": "Measured / Requested points",
  原因: "Reason",
  仅含已返回行: "Returned rows only",
  详情: "Details",
  没有符合条件的测试记录: "No matching test records",
  "条记录 · 第": " records · Page ",
  页: "",
  "{count} 条记录 · 第 {page} 页": "{count} records · Page {page}",
  上一页: "Previous",
  下一页: "Next",
  图表数据: "Chart data",
  个可见点: " visible points",
  "{count} 个可见点": "{count} visible points",
  "页面显示前 300 点；CSV 导出包含全部可见数据。":
    "Showing the first 300 points. The CSV export includes all visible points.",
  "基于 InferenceX 公开数据与测试协议独立构建":
    "Independently built using InferenceX public data and benchmark protocols",
  "研究起点 · PR #2004": "Research reference · PR #2004",
  导入测试数据: "Import benchmark data",
  关闭数据导入: "Close data import",
  "从三个来源添加数据，在同一张图上比较不同运行与配置。":
    "Add data from three sources to compare runs and configurations on one chart.",
  数据源: "Data source",
  选择本地数据文件: "Choose local data files",
  "拖放文件到这里，或点击选择": "Drop files here, or click to browse",
  "JSON · JSONL · CSV · ZIP，可同时导入多个文件":
    "JSON · JSONL · CSV · ZIP — multiple files supported",
  "兼容 CollectiveX 原生数据": "Supports native CollectiveX data",
  "支持官方 API 数据集、case-attempt shard、matrix + 结果 ZIP，以及工作区导出的 JSON / 数据 CSV（图表 CSV 仅用于分析）。原始 matrix 与 shard 请一起选择，以保留未成功的测试状态。":
    "Import official API datasets, case-attempt shards, matrix + result ZIPs, or workspace JSON / Dataset CSV exports. Chart CSV is for analysis only. Select the matrix and shards together to preserve unsuccessful test states.",
  "下载 artifact 需要 Actions: read":
    "Artifact downloads require Actions: read",
  "github_pat_… 或 ghp_…": "github_pat_… or ghp_…",
  "读取 CI run 并导入": "Fetch and import CI run",
  "支持指定 run attempt。已过期的 artifacts 无法从 GitHub 恢复，可在官方数据库查找缓存或导入本地备份。":
    "You can select a run attempt. Expired artifacts cannot be recovered from GitHub; try the official database cache or a local backup.",
  "查看 CollectiveX sweep runs": "View CollectiveX sweep runs",
  "直接读取官方公开 API，无需数据库凭据。可按 run 选择历史数据，也可以载入当前最新运行。":
    "Read the official public API directly without database credentials. Choose a historical run or load the latest run.",
  "InferenceX 官方最新数据": "Latest official InferenceX data",
  导入最新运行: "Import latest run",
  浏览运行列表: "Browse runs",
  "按 run ID 读取": "Load by run ID",
  "例如 34432070017": "For example, 34432070017",
  导入: "Import",
  "官方仍在发现更多运行，再次点击“浏览运行列表”可刷新。":
    "The official service is still discovering runs. Click “Browse runs” again to refresh.",
  "个实测 case": " measured cases",
  "{count} 个实测 case": "{count} measured cases",
  "载入随项目附带的官方快照（可离线）":
    "Load bundled official snapshots (offline)",
  "首次连接：启用浏览器 CORS 插件":
    "First connection: enable a CORS browser extension",
  "本应用直接从浏览器访问 API。请使用你在 InferenceXCurve 中使用的 CORS 插件，优先仅对":
    "This app accesses APIs directly from your browser. Use your InferenceXCurve CORS extension, enabling it primarily for ",
  "启用，并授予插件访问当前 Dashboard 页面的站点权限。GitHub API 通常自带 CORS 支持，避免插件添加重复响应头；若 artifact 重定向下载被阻止，可按插件说明设置下载域名，或下载 ZIP 后本地导入。":
    " and grant the extension site access to this dashboard. GitHub APIs normally support CORS; avoid duplicate response headers. If artifact redirects are blocked, configure download domains as documented by the extension, or download the ZIP and import it locally.",
  "插件只解决跨域限制；GitHub token 权限、速率限制和 artifact 过期仍由 GitHub 控制。按插件说明限定使用的网站，使用后可关闭。":
    "The extension handles cross-origin restrictions only. GitHub still controls token permissions, rate limits and artifact expiry. Limit the extension to the sites you need and turn it off when finished.",
  取消连接: "Cancel connection",
  延迟: "Latency",
  "Payload 带宽 / GPU": "Payload bandwidth / GPU",
  "Activation 聚合带宽": "Aggregate activation bandwidth",
  "Token 吞吐量": "Token throughput",
  "越低越好 · 读取所选操作的实测延迟分位数":
    "Lower is better · Measured latency percentile of the selected operation",
  "越高越好 · 完整逻辑 payload（含 scale bytes）÷ EP ÷ 延迟":
    "Higher is better · Full logical payload (including scale bytes) ÷ EP ÷ latency",
  "越高越好 · 全部 rank 的 activation bytes ÷ 延迟，不含 FP8 scale bytes":
    "Higher is better · Activation bytes across all ranks ÷ latency, excluding FP8 scale bytes",
  "越高越好 · global tokens ÷ 所选 roundtrip 或 pair period 延迟":
    "Higher is better · Global tokens ÷ selected roundtrip or pair period latency",
  官方未提供: "Not provided by the official API",
  时间未知: "Unknown time",
  左右滑动查看完整图表: "Scroll horizontally to view the full chart",
  当前筛选没有可绘制的数据: "No plottable data for the current selection",
  "缺失分位数不会补值；对数轴仅显示正数":
    "Missing percentiles stay missing; logarithmic axes show positive values only",
  "{count} 个有效数据点": "{count} valid data points",
  可见系列: "Visible series",
  连续单描述符基线: "Contiguous single-descriptor baseline",
  "verify failed · 不参与绘图": "verify failed · excluded from the chart",
  "该 ISL 下实测最佳 batch": "Best measured batch at this ISL",
  "ISL {isl}：无有效速率": "ISL {isl}: no valid rate",
  "每 rank Token 数": "Tokens per rank",
  "输入序列长度（tokens）": "Input sequence length (tokens)",
  "Batch · 并发请求数": "Batch · requests in flight",
  "带宽（GB/s）": "Bandwidth (GB/s)",
  "Burst 延迟 p50（ms）": "Burst latency p50 (ms)",
  "每个 ISL 的最高带宽（GB/s）": "Best bandwidth at each ISL (GB/s)",
  "带宽 / batch-1 带宽（倍）": "Bandwidth / batch-1 bandwidth (×)",
  "CollectiveX · 通信性能实验台":
    "CollectiveX · Communication benchmark explorer",
  "CollectiveX 通信性能实验台。导入 InferenceX、GitHub Actions 和本地数据，对比 GPU 通信延迟与带宽。":
    "CollectiveX communication benchmark explorer. Import InferenceX, GitHub Actions and local data to compare GPU communication latency and bandwidth.",
  "显示 {origin} {run}": "Show {origin} {run}",
  "打开 run {run}": "Open run {run}",
  "移除 {run}": "Remove {run}",
  "{label} · 载入于 {time}": "{label} · Loaded at {time}",
  "官方快照 · {date}": "Official snapshot · {date}",
  "官方离线快照 {date}": "Official offline snapshot {date}",
  "正在连接数据源…": "Connecting to the data source…",
  "读取 artifacts": "Reading artifacts",
  "已导入 {count} 组数据": "Imported {count} datasets",
  "已导入 {count} 组数据 · {warnings} 条格式提示（已显示在主界面）":
    "Imported {count} datasets · {warnings} format notes (shown in the workspace)",
  "读取 artifact {done}/{total} · {name}":
    "Reading artifact {done}/{total} · {name}",
  "发现 {count} 个运行": "Found {count} runs",
  "没有找到可导入的 CollectiveX 数据。":
    "No importable CollectiveX data was found.",
  "浏览器存储不可用。当前会话仍可使用，请导出 JSON 备份。":
    "Browser storage is unavailable. You can keep using this session; export JSON for a backup.",
  浏览器中的工作区格式不完整: "The stored workspace is incomplete",
  "当前工作区无法保存到浏览器，请导出 JSON 备份。":
    "This workspace could not be saved in your browser. Export JSON for a backup.",
  "初始化数据失败：{message}。请使用“添加数据”导入文件或重新载入快照。":
    "Data initialization failed: {message}. Use “Add data” to import files or reload the snapshots.",
  "图表导出失败：{message}": "Chart export failed: {message}",
  "无法读取 InferenceX：官方 API 未开放跨域读取，也可能是网络故障。请启用仅对 inferencex.semianalysis.com 生效的 CORS 浏览器插件后重试；也可读取内置快照或导入本地 JSON。":
    "Cannot read InferenceX: the official API does not allow cross-origin reads, or the network may be unavailable. Enable a CORS browser extension for inferencex.semianalysis.com and retry, or load a bundled snapshot or local JSON.",
  "无法下载 GitHub artifact，可能是网络或浏览器跨域限制。GitHub 自带 CORS 响应头，请让 CORS 插件仅对 inferencex.semianalysis.com 生效，避免重复响应头；也可从 GitHub 下载 ZIP 后本地导入。":
    "Cannot download the GitHub artifact: the network or browser CORS policy may be blocking it. GitHub provides CORS headers; scope your extension to inferencex.semianalysis.com to avoid duplicates. You can also download the ZIP from GitHub and import it locally.",
  "GitHub API 请求额度已耗尽。请使用有权限的 token 或稍后重试。":
    "GitHub API rate limit exceeded. Use an authorized token or retry later.",
  "GitHub API 请求额度已耗尽，恢复时间 {time}。请使用有权限的 token 或稍后重试。":
    "GitHub API rate limit exceeded; resets at {time}. Use an authorized token or retry later.",
  "认证失败，请检查 GitHub token。":
    "Authentication failed. Check your GitHub token.",
  "访问被拒绝，请检查仓库权限、Actions: read 授权或 API 请求额度。":
    "Access denied. Check repository access, Actions: read permission and API rate limits.",
  "未找到数据，或当前凭据无权访问。":
    "Data was not found or is inaccessible with these credentials.",
  "GitHub artifact 已过期，请尝试官方数据库中保存的副本或本地备份。":
    "The GitHub artifact has expired. Try a copy in the official database or a local backup.",
  "数据请求失败。": "The data request failed.",
  "官方 run 索引格式不受支持。":
    "The official run index format is not supported.",
  "run ID 必须是正整数形式的字符串。":
    "The run ID must be a positive integer represented as a string.",
  "返回数据的 run ID 与请求不匹配，已拒绝导入。":
    "The returned run ID does not match the request. Import rejected.",
  "无法读取内置快照，请检查部署文件或导入本地 JSON。":
    "Cannot read the bundled snapshots. Check the deployment files or import local JSON.",
  "内置快照未包含 run {run}。请使用实时官方源或本地文件。":
    "The bundled snapshots do not include run {run}. Use the live official source or a local file.",
  "无法读取该 run 的内置快照。":
    "Cannot read the bundled snapshot for this run.",
  "请输入完整的 GitHub Actions run URL。":
    "Enter a complete GitHub Actions run URL.",
  "URL 应为 https://github.com/owner/repo/actions/runs/123，可附加 /attempts/2。":
    "Use https://github.com/owner/repo/actions/runs/123, optionally followed by /attempts/2.",
  "GitHub 仓库路径格式不正确。": "The GitHub repository path is invalid.",
  "run attempt 超出可支持范围。":
    "The run attempt is outside the supported range.",
  "run ID 或 attempt 无效。": "Invalid run ID or attempt.",
  "该 run 没有 CollectiveX sweep matrix artifact。请确认 workflow 或尝试官方数据库。":
    "This run has no CollectiveX sweep matrix artifact. Check the workflow or try the official database.",
  "artifact {name} 已过期，无法完整还原此 run。请尝试官方数据库或本地备份。":
    "Artifact {name} has expired, so this run cannot be fully reconstructed. Try the official database or a local backup.",
  "GitHub artifact 下载需要 token，即使仓库公开。请提供具有目标仓库 Actions: read 权限的 token。":
    "Downloading GitHub artifacts requires a token, even for public repositories. Provide a token with Actions: read access to the target repository.",
  "GitHub 返回的 run ID 与请求不匹配，已拒绝导入。":
    "GitHub returned a different run ID. Import rejected.",
  "GitHub 返回了无效的 run attempt。":
    "GitHub returned an invalid run attempt.",
  "GitHub 返回的 run attempt 与请求不匹配。":
    "GitHub returned a different run attempt.",
  "GitHub artifact 列表格式无效。":
    "The GitHub artifact list format is invalid.",
  "该 run 尚未完成；当前只包含已经上传的 artifact，请完成后重新导入。":
    "This run is still in progress. Only uploaded artifacts are included; import again after it finishes.",
  "该 run 只有 matrix，没有结果 shard；可查看请求覆盖范围，但没有实测曲线。":
    "This run contains a matrix but no result shards. Requested coverage is available, but there are no measured curves.",
  "artifact {name} 超过 100 MiB 浏览器导入限制。":
    "Artifact {name} exceeds the 100 MiB browser import limit.",
  "{id} 的 coverage 为 {outcome}，未将其作为成功曲线。":
    "Coverage for {id} is {outcome}; it was not included as a successful series.",
  "Run {run} 未附 coverage，仅统计已导入的曲线。":
    "Run {run} has no coverage data; counts include imported series only.",
  "Run {run} 有重复 case attempt；每个 case 采用最新 attempt，未平均分位数。":
    "Run {run} contains duplicate case attempts. The latest attempt per case is used; percentiles are not averaged.",
  "Run {run} 未附可匹配的 matrix，coverage 仅包含已导入 case。":
    "Run {run} has no matching matrix; coverage includes imported cases only.",
  "{id} 中 correctness 失败的 point 已保留在 coverage 并从曲线排除。":
    "Points that failed correctness in {id} remain in coverage and are excluded from the curves.",
  "{name}: 未知 CSV schema {schema}，已跳过。":
    "{name}: unknown CSV schema {schema}; skipped.",
  "{name}: canonical CSV 缺少 dataset_index。":
    "{name}: canonical CSV is missing dataset_index.",
  "{name}: dataset {index} 必须包含恰好一条 run 记录，已跳过。":
    "{name}: dataset {index} must contain exactly one run record; skipped.",
  "{name}: covered_skus_json 不是有效 JSON，将从内容推导。":
    "{name}: covered_skus_json is not valid JSON; it will be derived from the content.",
  "{name}: dataset {index} 存在缺少身份或重复的 {type}，已跳过。":
    "{name}: dataset {index} contains an unidentified or duplicate {type}; skipped.",
  "{name}: ep-point 找不到所属 series {id}，已跳过。":
    "{name}: ep-point has no parent series {id}; skipped.",
  "{name}: coverage-point 找不到所属 case，已跳过。":
    "{name}: coverage-point has no parent case; skipped.",
  "{name}: kv-point 找不到所属 case，已跳过。":
    "{name}: kv-point has no parent case; skipped.",
  "{name}: 未知 CSV record_type {type}，已跳过。":
    "{name}: unknown CSV record_type {type}; skipped.",
  "{name}: 这是图表视图 CSV，缺少恢复数据集所需的 token/operation 元数据；请导入“数据集 CSV”或 JSON 导出。":
    "{name}: this is a chart-view CSV without the token/operation metadata needed to restore a dataset. Import a Dataset CSV or JSON export instead.",
  "{name}: CSV 缺少 tokens_per_rank 列。":
    "{name}: CSV is missing the tokens_per_rank column.",
  "跳过无法识别的 JSON 文档（需要 official dataset、matrix 或 case-attempt）。":
    "Skipped an unrecognized JSON document (expected an official dataset, matrix or case-attempt).",
  "跳过不属于所选 run/attempt 的 case {id}。":
    "Skipped case {id}, which does not belong to the selected run/attempt.",
  "Run {run} attempt {attempt} 保留未重跑 case 的 attempt {sourceAttempt} 测量。":
    "Run {run} attempt {attempt} retains measurements from attempt {sourceAttempt} for cases that were not rerun.",
  "存在无法唯一对应 run/version 的 matrix，未将其套用到其他运行。":
    "A matrix could not be uniquely matched to a run/version and was not applied to another run.",
  "{name}: ZIP 嵌套超过 3 层，已跳过。":
    "{name}: ZIP nesting exceeds 3 levels; skipped.",
  "解压数据超过 250 MiB 限制": "Decompressed data exceeds the 250 MiB limit",
  "{name}: ZIP 读取失败：{message}": "{name}: ZIP read failed: {message}",
  "{name}: 第 {line} 行不是有效 JSON，已跳过。":
    "{name}: line {line} is not valid JSON; skipped.",
  "{name}: 没有可读取的 JSON 文档。": "{name}: no readable JSON documents.",
};

function interpolate(text: string, params: TranslationParams): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    String(params[key] ?? match),
  );
}
const reverse = new Map(Object.entries(ENGLISH).map(([zh, en]) => [en, zh]));
export function translate(
  key: string,
  language: Language,
  params: TranslationParams = {},
): string {
  const canonical = Object.hasOwn(ENGLISH, key)
    ? key
    : (reverse.get(key) ?? key);
  return interpolate(
    language === "en" ? (ENGLISH[canonical] ?? key) : canonical,
    params,
  );
}

// Parsers keep canonical diagnostic strings. Translate only exact authored message
// patterns at the UI boundary, so stored messages switch language with the page.
const patterns = Object.entries(ENGLISH)
  .flatMap(([zh, en]) => {
    if (!zh.includes("{")) return [];
    return [zh, en].map((pattern) => {
      const names: string[] = [];
      const parts = pattern.split(/(\{\w+\})/g).map((part) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        if (name) {
          names.push(name);
          return "([\\s\\S]*?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      });
      return { key: zh, regex: new RegExp(`^${parts.join("")}$`), names };
    });
  })
  .sort(
    (a, b) =>
      b.key.replace(/\{\w+\}/g, "").length -
      a.key.replace(/\{\w+\}/g, "").length,
  );

export function translateMessage(
  message: string,
  language: Language,
  depth = 0,
): string {
  if (depth > 4) return message;
  if (Object.hasOwn(ENGLISH, message) || reverse.has(message))
    return translate(message, language);
  for (const pattern of patterns) {
    const match = pattern.regex.exec(message);
    if (!match) continue;
    const params = Object.fromEntries(
      pattern.names.map((name, i) => [
        name,
        ["message", "origin"].includes(name)
          ? translateMessage(match[i + 1], language, depth + 1)
          : match[i + 1],
      ]),
    );
    return translate(pattern.key, language, params);
  }
  // Preserve the server's detail verbatim, translating only our HTTP error prefix.
  const http = /^HTTP (\d+)：([\s\S]*)$/.exec(message);
  if (http && language === "en") {
    for (const key of [
      "认证失败，请检查 GitHub token。",
      "访问被拒绝，请检查仓库权限、Actions: read 授权或 API 请求额度。",
      "未找到数据，或当前凭据无权访问。",
      "GitHub artifact 已过期，请尝试官方数据库中保存的副本或本地备份。",
      "数据请求失败。",
    ]) {
      if (http[2].startsWith(key))
        return `HTTP ${http[1]}: ${translate(key, language)}${http[2].slice(key.length)}`;
    }
  }
  if (message.includes("；"))
    return message
      .split("；")
      .map((part) => translateMessage(part, language, depth + 1))
      .join(language === "en" ? "; " : "；");
  return message;
}

export function readLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
}
