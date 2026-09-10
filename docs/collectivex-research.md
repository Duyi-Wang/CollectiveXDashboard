# CollectiveX 可视化与数据契约研究

核验时间：2026-09-10。研究对象为实际源码、工作流和线上响应，PR 说明只作为历史线索。

## 源码版本与历史边界

- [InferenceX 当前 main](https://github.com/SemiAnalysisAI/InferenceX/tree/01cea4dbe8ff63142368059b270db4651187c422)：本地 HEAD 与 GitHub API 返回的 main SHA 一致。
- [首个 PR #2004](https://github.com/SemiAnalysisAI/InferenceX/pull/2004)：2026-07-14 合并，merge SHA `a9e8ce1d720d9a694dc55b2f03dbc716cc3c8056`。
- [InferenceX-app 当前 master](https://github.com/SemiAnalysisAI/InferenceX-app/tree/3520165e9be0fbef288bf77d793b5ce245741024)：这是官方仪表板的独立代码库，默认分支是 `master`，不是 `main`。本地 HEAD 与 GitHub 默认分支 SHA 一致。

PR #2004 的 body 仍描述固定 608 cases、512 个观测和三 run promotion；**实际合入版本的工作流已经只上传 neutral JSON**，并不存在 body 所说的发布步骤。不能把 PR body 的历史设计当作当前数据契约。当前采样次数也已经增加到 2048，且新增连续 pair 计时。

## 从基准测试到图表

生产端的 [collectivex-sweep.yml](https://github.com/SemiAnalysisAI/InferenceX/blob/01cea4dbe8ff63142368059b270db4651187c422/.github/workflows/collectivex-sweep.yml) 生成矩阵，以 shard 为单位运行 GPU benchmark，上传：

| artifact | 内容 | 保留期 |
| --- | --- | --- |
| `cxsweep-matrix-{run_id}` | `matrix_full.json`，requested cases、disposition、拓扑、token ladder | 14 天 |
| `cxshard-{shard_id}-{run_id}-{run_attempt}` | 一个或多个 `record_type: case-attempt` JSON | 14 天 |

失败或部分成功的 job 也会在 `always()` 路径上传已有 JSON；没有产出的 case 不会凭空生成 failed record。生产端不负责 ranking、跨 run aggregation 或推荐。

CI 内可视化是 Markdown job summary：

- [summarize.py](https://github.com/SemiAnalysisAI/InferenceX/blob/01cea4dbe8ff63142368059b270db4651187c422/experimental/CollectiveX/summarize.py) 按 SKU/backend/suite/routing/mode/phase/EP/precision 排序，每条 case 选 `T=64`，缺少时选 ladder 中间点，展示 p50/p99、拓扑、wire copy basis、outcome、rank skew。headline 优先 `pair_period`，旧记录才退回 `roundtrip`，并明确标注二者不可混排。
- [bandwidth.py](https://github.com/SemiAnalysisAI/InferenceX/blob/01cea4dbe8ff63142368059b270db4651187c422/experimental/CollectiveX/bandwidth.py) 展示逐 token point、逐 component 的带宽以及 α/β 拟合，纯读取产物，不决定 CI 成败。

真正的交互式曲线位于 InferenceX-app，链路为：GitHub artifacts → API 读取时 lazy ingest → 独立 Neon 数据库保存 raw matrix/docs → shared reader 组装 dataset → React Query → 前端筛选 → D3 图表。[官方数据链路说明](https://github.com/SemiAnalysisAI/InferenceX-app/blob/3520165e9be0fbef288bf77d793b5ce245741024/docs/collectivex.md) 解释了：缓存使看过的 run 在 GitHub artifact 到期后仍可读取；不存在 CollectiveX CI ingest workflow；只校验工作流身份，不限定 main 分支；GitHub 不可用时可返回已存储数据。

## 原始 JSON 契约

权威来源：[ep_harness.py](https://github.com/SemiAnalysisAI/InferenceX/blob/01cea4dbe8ff63142368059b270db4651187c422/experimental/CollectiveX/bench/ep_harness.py)。一份 case JSON 包含一整条 token ladder。

| 字段 | 用途 |
| --- | --- |
| `version`, `record_type`, `generated_at` | 当前版本仍为 1；`case-attempt` 是 discriminator |
| `identity.case_id` | case 的稳定身份 |
| `identity.case_factors.sku` | 完整 runner SKU，后缀可能代表不同 fabric，不能只保留 GPU 型号 |
| `identity.case_factors.case` | backend、suite、mode、phase、precision、ep、routing、hidden、topk、experts、workload、ladder 和拓扑 |
| `identity.allocation_factors` | `run_id`, `run_attempt`, `source_sha` |
| `identity.attempt_ordinal` | 单个 case 的执行 attempt |
| `measurement.rows[]` | token ladder 上的观测点 |
| `measurement.sampling` | fresh-entry 和 chain 两套采样参数 |
| `implementation` | backend 名称、kernel_generation、maturity、stage 排除语义等 |
| `outcome.status`, `outcome.reasons` | 成功/无效与原因，不应根据是否有数字推断成功 |
| `runtime.vendor`, `topology`, `provenance` | 厂商、实际拓扑、源版本与容器 |

每个 row 的 `tokens_per_rank` 为 X 轴；`global_tokens = tokens_per_rank × ep`。`components` 中每个 component 含 `availability`, `origin`, `percentiles_us`, `sample_count`。缺失或 unavailable component 为无数据，不应填 0；缺少 p99 不能用 p50 补齐。

重要的辅助字段：`correctness.passed`、`routing.locality`、`byte_provenance`、`wire_byte_provenance`、`logical_copies`、`cross_rank_min_us`、`cross_rank_spread_us`、`chain_floor_us`、`chain_health`。

## 延迟的两种独立含义

[sweep.json](https://github.com/SemiAnalysisAI/InferenceX/blob/01cea4dbe8ff63142368059b270db4651187c422/experimental/CollectiveX/configs/sweep.json) 当前 workload 是 `deepseek-v4-pro`：hidden 7168、topk 6、384 experts、uniform routing；EP8/EP16；BF16 与 FP8 dispatch，combine 为 BF16。normal 有 decode/prefill，low-latency 只覆盖 decode。完整 decode ladder 为 1 到 512 的 2 次幂，prefill 为 1024/2048/4096/8192；实际 backend 可以截断 ladder。

1. `dispatch`, `combine`, `roundtrip` 是 fresh-entry 计时：每个窗口前后排空 GPU，每 trial 每 component 32 次同步完整 roundtrip warmup，256 trials × 8 次计时 = 2048 观测；先对同一次迭代取跨 rank 最大值，再合并观测，使用 nearest-rank quantile：排序数组下标 `ceil(q / 100 × n) - 1`。
2. `pair_period` 是连续 dispatch→combine 的 steady-state period，`origin: chained-median`。4 trials，每 trial 128 pairs，丢弃前 16 pairs，共 448 观测；跨 rank median。它代表循环中的 cadence，与 drained roundtrip 是不同量。
3. `isolated_sum` 是 dispatch、stage、combine 的各自分位数相加。分位数之和不等于总延迟分位数，不可当成实测 roundtrip，也不可据此计算 SLO 吞吐量。
4. stage 是 expert-output staging；当前正常语义下它位于 transport 外，在 FP8 情况下更是 harness scaffolding，不能加回 transport 总延迟。历史 generation 应查看 `implementation.stage_excluded_from_roundtrip`，不能根据 version=1 判断语义相同。

参考：[完整方法学](https://github.com/SemiAnalysisAI/InferenceX/blob/01cea4dbe8ff63142368059b270db4651187c422/experimental/CollectiveX/docs/methodology.md)。

## 带宽与吞吐量

令 `B` 为 aggregate EP world 的 payload bytes，`E` 为 EP size，`Lq` 为 q 分位延迟（µs）：

```text
per-GPU payload GB/s at q-latency = B / E / Lq × 1e-3
global token/s at roundtrip q-latency = global_tokens / Lq × 1e6
aggregate activation GB/s = activation_data_bytes / Lq × 1e-3
```

这表示“在 p99 延迟下对应的速率”，不是统计意义上的 p99 带宽。

优先使用 `wire_byte_provenance[component].total_logical_bytes`，fallback 到 `byte_provenance`。normal 常按 `(token,destination rank)` 去重；部分 low-latency kernels 每个 `(token,expert)` 都发送，wire bytes 因此更大。FP8 scale bytes 属于 payload。这里仍含本 rank 的本地 copy；评估实际 fabric 流量需进一步考虑 `1 - routing.locality.local_rank_fraction`，也不能把它直接当 NIC 总线利用率。

上游 `bandwidth.py` 的 α/β：OLS 拟合 `latency_us = alpha_us + slope × aggregate_bytes`，`beta_GBps_per_GPU = 1e-3 / slope / E`。至少 3 点、至少 2 个不同 byte 值、正 slope；排除 correctness failed 点。只有 R² ≥ 0.9 且最顶端 transfer term 占观测延迟 ≥ 0.25 时才认为 β 可靠；若最小 bytes 大于最大值的 10%，α 标为外推。α/β 是模型，不能当链路实测峰值。

## 官方仪表板怎样处理数据

来源：[reader.ts](https://github.com/SemiAnalysisAI/InferenceX-app/blob/3520165e9be0fbef288bf77d793b5ce245741024/packages/db/src/collectivex/reader.ts)、[前端 data.ts](https://github.com/SemiAnalysisAI/InferenceX-app/blob/3520165e9be0fbef288bf77d793b5ce245741024/packages/app/src/components/collectivex/data.ts)、[CollectiveXDisplay.tsx](https://github.com/SemiAnalysisAI/InferenceX-app/blob/3520165e9be0fbef288bf77d793b5ce245741024/packages/app/src/components/collectivex/CollectiveXDisplay.tsx)、[CollectiveXChart.tsx](https://github.com/SemiAnalysisAI/InferenceX-app/blob/3520165e9be0fbef288bf77d793b5ce245741024/packages/app/src/components/collectivex/CollectiveXChart.tsx)。

- reader 接受 runtime.vendor 为 amd/nvidia 的结果；按 case_id 分成功和其他终态，成功优先；按输入顺序每组采用首条。不会跨 run 平均延迟，不会把分位数平均后称为 pooled percentile。
- matrix 的 requested cases 决定 coverage；不存在结果且 matrix 未写 unsupported 的格子保留 pending；unsupported/failed/invalid 保留其原因。曲线只取成功 case。
- 正常成功 case 缺少 ladder 顶部 point 时，官方 reader 推断 backend-token-capacity；中间缺点为 not-measured。独立 dashboard 应更保守：优先明确 ladder_dropped/cap 元数据，未知缺失不要断言硬件不支持。
- API dataset 形状为 `{version,run,coverage,series,kv?}`。series 有 `series_id,phase,mode,precision,backend,system,points`；system 保存 SKU/vendor/EP/拓扑；points 的 `components.*.latency_us` 是标准化分位数，另带 payload_bytes 及速率。
- 用户可勾选多个 run，series_id 加 run 前缀；配置对应一致颜色，run 由不同虚线表示。EP、phase、mode、precision、SKU、backend 过滤后绘图。默认 EP8/decode/FP8/p99/roundtrip latency，normal 和 low-latency 都选中。
- X 为 tokens/rank，X/Y 使用 log scale。Y 可选 latency、roundtrip token/s、aggregate activation GB/s、per-chip payload GB/s。component 为 dispatch、stage、combine、roundtrip；只绘制有限正数，不对缺失点补值。
- 底部 known-support 是人工维护的 capability 表，不等于当前 run 的测量 coverage。

**当前官方 reader 存在关键能力边界：mapPoint 只输出 dispatch/stage/combine/roundtrip，未输出 raw `pair_period`、correctness 和 chain diagnostics。官方 API 无法凭空恢复这些字段。** 独立 dashboard 应对 local/CI raw 保留 pair_period，让用户明确选两种延迟；official dataset 中缺失的 pair_period 应显示无数据。当前官方前端 α/β 实现也尚未带入生产端新增的 R²/transfer-share gate，独立实现应优先遵循生产端当前可靠性约束。

## 可重复的真实观测

2026-09-10 请求 [latest?version=1](https://inferencex.semianalysis.com/api/v1/collectivex/latest?version=1) 返回 HTTP 200：run `34432070017`，source SHA `fed9aed93157d3ae689cd34b5997f0a9029fd961`，4 个 measured cases、28 个 measured points，SKU h100-dgxc/h200-dgxc。

直接下载 [该 CI run](https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34432070017) 的 artifact `cxshard-h100-dgxc-nccl-ep-bf16-n2-34432070017-1`（artifact ID `10135329362`），对照其中 case `h100-dgxc-nccl-ep-deepseek-v4-pro-normal-decode-ep16-uniform-bf16`，T=1：

| 指标 | 实测值 |
| --- | --- |
| global_tokens | 16 |
| dispatch p50 | 224.12799298763275 µs |
| combine p50 | 86.59200370311737 µs |
| roundtrip p50 | 289.95200991630554 µs |
| pair_period p50 | 269.27998661994934 µs |
| roundtrip payload bytes（aggregate） | 2,351,104 |
| roundtrip per-GPU payload bandwidth at p50 latency | 0.5067873129847084 GB/s |
| roundtrip token rate at p50 latency | 55,181.54540338724 tokens/s |
| raw roundtrip sample_count | 2048 |
| raw pair_period sample_count | 448 |

手算验证：`2351104 / 16 / 289.95200991630554 × 1e-3 = 0.5067873129847084`。官方响应保留相同 roundtrip 数值，但不存在 pair_period。该点也证明 isolated dispatch+combine p50（310.7199966907501 µs）不等于实测 roundtrip p50。

## 前端 only 的数据接入边界

- 本地 JSON、JSONL/NDJSON、ZIP 可以完全在浏览器内解析；CSV 适合已展开的 point/component 行。若用户只导入部分 shards、没有 matrix，应明确 coverage 只代表已导入数据。
- GitHub API 的 artifacts listing/download 需要权限，过期 artifact 不可重建；run URL 自身是入口，不能当作 JSON。应保留 run ID/attempt/source SHA 以便追溯，并处理同一逻辑 shard 的重跑。
- 官方读取接口为 `/api/v1/collectivex/latest?version=1`、`/api/v1/collectivex/runs?version=1`、`/api/v1/collectivex/runs/{runId}?version=1`。runs response 的 `discovery_complete: false` 表示还需继续有界发现；latest 不保证是一场全 fleet sweep。
- 本次带 `Origin: http://localhost:5173` 检查官方响应，**没有 Access-Control-Allow-Origin**。curl 成功不等于浏览器跨域成功。本项目按用户要求不提供任何代理，采用与 InferenceXCurve 相同的方式：需要网络拉取时由用户启用 CORS 浏览器扩展，也可先下载文件再本地导入。不能把 secret 放进静态 bundle，也不能声称普通浏览器无需扩展即可直连当前官方 API。
- 官方数据库是其服务内部的独立 Neon；“读取官方数据库”对独立前端应通过官方公开只读 API，避免在浏览器暴露 PostgreSQL credential。

## 本项目导入规则

`src/importers.ts` 是按上述字段契约独立实现的浏览器解析器，没有复制官方 reader 实现。它接受 official dataset、raw case-attempt、matrix 与 shards、JSON 数组、JSONL/NDJSON、ZIP，以及本项目 dataset JSON 导出包。

兼容的简易 CSV 每行表示一个 token point；完整可往返数据 CSV 另见 [导入格式文档](import-formats.md)。简易 CSV 必要列为 `tokens_per_rank`；建议同时提供 `case_id,sku,backend,mode,phase,precision,ep,run_id,run_attempt,global_tokens`。延迟列为 `<operation>_<percentile>_us`，例如 `roundtrip_p50_us`、`dispatch_p99_us`；payload 字节列为 `<operation>_payload_bytes` 或 `<operation>_logical_bytes`，仍是 aggregate bytes。`correctness_passed=False` 的 point 不进入曲线。兼容历史 CSV 的 `dedupe_key` 因子串（`key=value|key=value`）。没有写出的分位数仍保持缺失。

同一 run/attempt/version 内，同 case 存在多个 case attempt 时，选择 `attempt_ordinal` 最大的记录；相同 ordinal 选择较新 `generated_at`。这不是跨 run 统计聚合，也不保证成功优先：新的失败 attempt 会显示失败。本地导入不同 GitHub run_attempt 时保留为独立 dataset；通过 GitHub URL 读取时，按选定 attempt 组装运行，未重跑 cell 的旧测量通过 source_run_attempt 保留来源。无法确定归属的 matrix 不会擅自套用到其他 run。

验证覆盖当前 raw 的 pair_period/wire bytes、PR 时代缺少 pair_period/precision 字段的 raw、官方 assembled 数据、失败和缺失 point、matrix-only、重复 attempt、CSV quoting、JSONL 坏行、损坏 ZIP、KV 数据单位、导出再导入。另用真实 run `34432070017` 的 h100 artifact 验证出 2 条曲线/14 个点，并用本地 2026-07-07 至 2026-07-14 历史 JSONL 验证出 6 个 runs、58 条曲线、332 个成功 points。


## 上游配色与本项目暗色主题

2026-09-10 核验上游 [globals.css](https://github.com/SemiAnalysisAI/InferenceX-app/blob/3520165e9be0fbef288bf77d793b5ce245741024/packages/app/src/app/globals.css#L163)：亮色背景 `#EAEBEC`、文字 `#131416`；暗色背景 `#131416`、文字 `#EAEBEC`；primary 为金橙色 `#F7B041`，secondary 为蓝色 `#0B86D1`。品牌色在亮色主题使用 secondary，在暗色主题使用 primary。

CollectiveX 通过 `useThemeColors` → [generateVendorColors](https://github.com/SemiAnalysisAI/InferenceX-app/blob/3520165e9be0fbef288bf77d793b5ce245741024/packages/app/src/lib/dynamic-colors.ts) 给当前选中配置分配 OKLCH 色彩，不是固定一组十六进制曲线颜色。[厂商色相区间](https://github.com/SemiAnalysisAI/InferenceX-app/blob/3520165e9be0fbef288bf77d793b5ce245741024/packages/constants/src/gpu-keys.ts#L198) 为：AMD 12–42°（红/橙）、NVIDIA 120–170°（绿）、OpenAI 290–330°（紫）、Google 250–275°（蓝）、unknown 185–235°（青蓝）；暗色主题提高明度。配置颜色与 run 线型是独立维度。

本项目按用户偏好使用 AMD 风格的深灰 / 红色主题，而非 AMD 官方设计规范：页面背景 `#0D0F13`、面板 `#15171C`、主按钮 `#CE2939`、文字强调 `#FF6874`。AMD 曲线使用红、珊瑚、橙色，NVIDIA 使用绿、薄荷、青色；配置哈希决定具体色相与明度，切换筛选不会改变同一配置的颜色。身份来自数据的 vendor 字段，不通过 SKU 猜测。页面和导出的 SVG/PNG 使用一致的深色背景、坐标和图例颜色。CSS 语义色值在 `src/styles.css`，导出所需的具体色值在 `src/theme.ts`。
