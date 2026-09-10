# 导入与导出格式

本项目在浏览器内读取文件，不上传本地数据。入口为 `importFiles(files, context?)`；已解析的 JavaScript 对象可交给 `parseDocuments(documents, context?)`。二者返回 `{ datasets, warnings }`，损坏或不认识的文档会报告警告，其他可用文件仍可导入。

## 推荐的保存方式

- **工作区 JSON**：`{ "datasets": [Dataset, ...] }`，保留 EP、KV、coverage 和来源。可直接再次导入；也接受 `{datasets:[{dataset:Dataset,...}]}`。
- **数据集 CSV**：`exportDatasetCsv(datasets)` 生成 `collectivex-dataset-v1` 契约，保留所有数据集，包括同一 run 从不同来源导入的独立数据集。适合需要 CSV 又希望日后恢复数据的用户。
- **图表 CSV**：`series_id,series_label,x,y,x_axis,y_axis,operation,percentile,detail` 是当前筛选后的可见曲线，用于表格分析和分享。它只包含当前坐标，无法恢复原数据集的全部操作、分位数、拓扑和 coverage；导入时会明确提示改用数据集 CSV 或 JSON。

公开示例：[public/example.csv](../public/example.csv)。它是 run [34432070017](https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34432070017) 的一个真实 H100/NCCL EP16 token point 摘录，不代表该 run 的完整 coverage；原始 artifact 为 `cxshard-h100-dgxc-nccl-ep-bf16-n2-34432070017-1`，ID `10135329362`。

## JSON 与 JSONL

支持以下对象，以及由这些对象组成的数组：

| 输入 | 判别方式 | 行为 |
| --- | --- | --- |
| 官方 assembled Dataset | `series` 数组，通常另有 `run`, `coverage`, `kv` | 保留官方 API 指标与来源 |
| 原始 case | `record_type: "case-attempt"`；也接受带 `measurement` 和 `identity`/`case` 的旧文档 | 从 `measurement.rows` 读取 token ladder |
| sweep matrix | `requested_cases` 数组 | 恢复请求集合与明确 unsupported 项 |
| bundle | `matrix`, `documents`/`shards`，或 `data`/`dataset` 包装 | 递归读取其对象 |

`.jsonl` / `.ndjson` 每个非空行是一份 JSON 文档；也接受以 `.json` 为后缀的逐行格式。坏行不会阻止其余行导入，警告中的行号是文件物理行号。整个文件是合法 JSON 时优先作为单个对象/数组读取。

单独导入 raw case 时仍可绘图，但只有附带且能唯一关联的 matrix 才能知道完整 requested coverage。只有一个 run/version 与一个 matrix 时可以直接关联；多个运行混合导入时，优先使用文件路径内 `cxsweep-matrix-{run_id}`/`cxshard-...-{run_id}-{attempt}` 的 run 身份。无法确定归属的 matrix 不会套用到其他运行。

同 run/attempt/version 的重复 case，选择最大的 `identity.attempt_ordinal`；相同 ordinal 选择较新的 `generated_at`。不会取平均，也不会自动保留旧的成功结果覆盖新的失败结果。本地导入不同 GitHub `run_attempt` 时保留为独立数据集。按 GitHub URL 导入时，以所选 attempt 组装整个 run，未重跑的 cell 保留之前的测量；其 `source_run_attempt` 记录真实来源。

## ZIP

支持浏览器上传的 GitHub artifact ZIP，以及包含 JSON、JSONL、NDJSON、CSV 或 ZIP 的目录归档。文件路径只是输入名称，不会解压写入磁盘。

- 只读取上述支持的后缀，跳过日志、图片等其他条目。
- ZIP 允许至多 3 层；更深归档报告警告并跳过。
- 一个批次累计声明解压大小不超过 250 MiB；在解压条目前检查大小。
- 损坏 ZIP 报告警告，不阻止同批次其他文件导入。
- raw JSON 的 `version` 保留。归属关系与版本不明的 matrix 不会覆盖其他 run 的 coverage。

## 数据集 CSV：`collectivex-dataset-v1`

UTF-8，逗号分隔，标准双引号 escaping，可带 BOM。导出使用 CRLF。空单元格代表缺失，绝不表示零。CSV 列顺序不影响导入；record 顺序也不要求父记录先出现。

每行都有 `schema=collectivex-dataset-v1`、`dataset_index` 和 `record_type`。`dataset_index` 仅用于文件内分组，允许多个 dataset 的 run_id、series_id 相同；它不是 GitHub run ID。每个 dataset 必须恰好有一条 `run` 记录。

| record_type | 身份键 | 内容 |
| --- | --- | --- |
| `run` | `dataset_index` | version 与来源信息 |
| `ep-series` | `dataset_index,series_id` | EP 配置、拓扑、workload 和测量语义；没有点的 series 也可保留 |
| `ep-point` | `dataset_index,series_id,tokens_per_rank` | 每个操作的所有已存在分位数和字节/速率 |
| `coverage-case` | `dataset_index,case_id` | 请求 case 的 disposition/outcome/reason/detail 与配置 |
| `coverage-point` | `dataset_index,case_id,tokens_per_rank` | measured/pending/unsupported/invalid 等状态 |
| `kv-case` | `dataset_index,case_id` | KV case 的 backend、fabric、workload、拓扑、状态 |
| `kv-point` | `dataset_index,case_id` 加 grid 维度 | 一个 KV 实测 grid point |

未知 schema 或 record_type、缺失/重复父记录、找不到父 series/case 的点都会报告警告。有效的官方 run counters 与 covered_skus 原样保留，因为其统计范围可能大于返回行集合；只有源数据缺失的字段才从已导入 coverage/KV 推导。

字段表：

| 字段 | 含义 |
| --- | --- |
| `version,run_id,run_attempt,generated_at,source_sha,conclusion,run_url` | run provenance，时间字符串与 SHA 原样保留 |
| `requested_cases,terminal_cases,measured_cases,unsupported_cases,failed_cases,requested_points,terminal_points,measured_points,kv_requested_cases,kv_measured_cases,covered_skus_json` | 原始 run summary；covered_skus 是 JSON 字符串数组，缺少才推导 |
| `series_id,case_id,label,sku,vendor,backend,phase,mode,precision,workload,measurement_semantics,source_run_attempt` | case/series 身份，不简化 SKU 后缀 |
| `ep,nodes,gpus_per_node,scale_up_domain,scale_up_transport,scale_out_transport,topology_class` | `ep` 恢复为 `system.ep_size`，其余保留原拓扑含义 |
| `disposition,outcome,reason,detail,terminal_status` | coverage 状态与原因，detail 支持带换行和逗号的文本 |
| `tokens_per_rank,global_tokens,correctness_passed` | 点位信息，correctness 为 true/false 或空 |
| `<operation>_present` | true 表示 component 对象；false 表示明确 unavailable/null；空表示根本没有该字段 |
| `<operation>_<percentile>_us` | EP 延迟，单位 µs |
| `<operation>_payload_bytes` | aggregate EP world payload bytes，包含 FP8 scale bytes |
| `<operation>_activation_bytes` | aggregate activation bytes |
| `<operation>_payload_rate_<percentile>` | **每 GPU** 完整 payload GB/s，在所选延迟分位点对应的速率 |
| `<operation>_activation_rate_<percentile>` | **aggregate** activation GB/s，排除 scale bytes |
| `<operation>_provenance` | 原测量 provenance，例如 `chained-median` |
| `token_rate_<percentile>` | 已提供的 roundtrip global tokens/s |

`operation` 为 `dispatch,combine,roundtrip,pair_period,stage,isolated_sum`；`percentile` 为 `p50,p90,p95,p99`。没有 p99 时其单元格为空，导入后仍不存在 p99；不会用 p50 填充。`pair_period` 与 `roundtrip` 使用不同列，不能互补延迟。只有 pair_period 而没有 roundtrip 的数据也能导入。

KV 字段包括 `fabric,kind,isl,page_tokens,batch,op,descs,req_bytes,prep_ms,gbps_p50,gbps_p50_incl_prep,verify_passed`；`latency_ms_{p50,p95,min,max,n}` 为整批延迟，`request_ms_{p50,p95,min,max,n}` 为单请求完成时间分布。KV 延迟保持 **ms**，不会当作 EP 的 µs；`page_tokens` 对 bulk 可以为空。缺少 `gbps_p50` 时保留 null，延迟仍可使用，不会填 0 带宽。

## 兼容的简易 / 历史 CSV

没有 schema/record_type 的 CSV 使用旧的“一行一个 EP token point”形式。必须有 `tokens_per_rank` 列；建议提供：

```csv
case_id,sku,backend,mode,phase,precision,ep,run_id,tokens_per_rank,global_tokens,roundtrip_p50_us,roundtrip_p99_us,roundtrip_logical_bytes,correctness_passed
example,mi355x,mori,normal,decode,bf16,8,local,4,32,20,25,160000,True
```

此块是用于说明契约的手工数值示例。支持所有 `<operation>_<percentile>_us`，以及 `<operation>_payload_bytes` 或其历史别名 `<operation>_logical_bytes`。字节数始终是 aggregate，导入器计算 per-GPU 带宽时会除以 EP。缺少 EP/字节时带宽不能恢复；未知维度保持 unknown。

历史 `dedupe_key` 的 `sku=...|backend=...|mode=...` 因子串可补充配置列，显式列优先。`source_sha` / `head_sha`、`run_attempt`、`attempt_ordinal` 和 `generated_at` 可携带 provenance。没有 status 列时，这种用于测量结果的旧 CSV 按 success 读取；`correctness_passed=False` 的点进入 invalid coverage 并从曲线排除。需要表达完整请求集合、KV、失败原因或保留官方已计算速率时，使用数据集 CSV 或 JSON。

## 测量边界

`roundtrip` 是 fresh-entry 跨 rank max 延迟；`pair_period` 是连续 dispatch→combine 的跨 rank median 周期。导入器不会生成不存在的 component，不会把 isolated_sum 的分位数相加结果当成真实 transport 吞吐量。原始记录优先使用 wire byte provenance；官方 API 未提供的 pair_period 无法由 roundtrip 恢复。

当前官方和 GitHub artifact 的跨域请求可能需要浏览器 CORS 扩展。本项目不提供代理；如果不启用扩展，可以手动下载文件后本地导入。任何 token 均不进入上述导出格式。
