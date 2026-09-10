# CollectiveX 数据接入研究

核验日期：2026-09-10。参考本地 `InferenceX-app` commit `3520165e9be0fbef288bf77d793b5ce245741024` 和 `InferenceXCurve` commit `34aaf96fbb8905c9512182dccb3e03a7a3b17f91`，并实际请求官方公开 API。

## 官方数据库的公开接口

CollectiveX 使用独立 Neon PostgreSQL 数据库，前端通过公开 HTTP API 读取组装好的数据集，不需要数据库连接字符串。服务端在读取时从 GitHub Actions 懒加载 matrix/shard 原始 JSON 并持久化。原始 artifact 过期后，已经保存到官方数据库的 run 仍可读取；从未保存且已过期的 run 无法重建。数据库原文在读取时经过统一 reader，因此 reader 修正会应用于历史记录。

| GET 端点 | 返回值 |
| --- | --- |
| `https://inferencex.semianalysis.com/api/v1/collectivex/runs?version=1` | `{version, runs: RunSummary[], discovery_complete}` |
| `https://inferencex.semianalysis.com/api/v1/collectivex/latest?version=1` | `CollectiveXDataset` |
| `https://inferencex.semianalysis.com/api/v1/collectivex/runs/{runId}?version=1` | 指定 run 的 `CollectiveXDataset` |

`version=1` 是必填的当前 benchmark contract；不是 API 路径中的 `v1`。未知/遗漏 version 返回 400。run ID 是十进制字符串，不能为方便计算而转成浮点数。数据集包含 `{version, run, coverage, series, kv}`。`series` 是 EP 测量，`kv` 是 KV transfer case；只含 KV 的 run 的 EP `requested_points` 可以是零，不能据此认定 run 没有数据。

run list 没有 `limit` 或分页协议。实测加 `limit=5` 仍返回全部 10 条记录。`discovery_complete: false` 表示服务端只完成一个有界发现批次；官方页面每秒重新请求直至完成，期间已有记录仍然可用。发现窗口为 44 天（30 天 rerun 窗口加 14 天 artifact 保留），已经入库的历史记录不受这个窗口限制。`latest` 按创建时单调增加的 run ID 排序，不是完成时间。

实测成功的代表数据：

| run | 内容 | 元数据 |
| --- | --- | --- |
| `34432070017` | H100/H200、NCCL-EP，4 个 EP series | attempt 1；2026-09-10；success |
| `33356406487` | NVIDIA/AMD、多 backend EP sweep | 2026-08-31；failure 但存在有效测量 |
| `33412478973` | NVIDIA/AMD、Mooncake 等 14 个 KV case | attempt 2；2026-08-31；success |

失败/取消的 run 仍可能有有效结果；图表应只读取 measured/success 数据点，同时保留失败、unsupported、pending coverage。官方摘要数值与实际组装曲线点数可能不同，应分别标注其含义，不能为了对齐而改写原始数据。

### CORS 与纯前端部署

2026-09-10 的真实 GET 响应，包括带 `Origin: https://duyi-wang.github.io` 的请求，均为 HTTP 200，但**没有 `Access-Control-Allow-Origin`**。因此公开且不需要认证不等于浏览器可跨域读取。`InferenceXCurve` 的本地开发能同步，是因为 Vite 将 `/inferencex-api` 转发给官方；它的静态 GitHub Pages 部署也受同一 CORS 限制。

按照用户指定方案，本项目不提供代理；开发和静态部署都直接请求官方 API：

1. 实时同步：浏览器安装并启用 CORS 插件，仅对 `inferencex.semianalysis.com` 生效。页面、转换、图表和数据处理都在浏览器中运行。
2. 离线快照：构建前或 GitHub Actions 中请求官方 API，把索引和选定 run 数据生成同源静态 JSON。页面能直接读取；界面必须显示快照抓取时间，并区分“快照”和“实时”。
CORS 是服务器响应策略，无法通过前端 `no-cors`、伪造 `Origin` 或增加请求头解决。浏览器插件可修改浏览器所见响应，关闭插件时界面应明确提示 CORS 或网络故障。JavaScript 无法可靠区分二者。

静态快照只包含明确列出的 run，不应把全量官方 run list 当作全部都已离线缓存。离线加载未缓存 run 时应给出明确说明，并提供更新快照或使用实时源的方法。

## GitHub Actions run URL

输入契约：`https://github.com/{owner}/{repo}/actions/runs/{runId}`，可接受 `/attempts/{attempt}` 和 query/hash。当前 run metadata 的 `run_attempt` 是默认版本；显式 attempt 应保留该选择。

流程：

1. `GET https://api.github.com/repos/{owner}/{repo}/actions/runs/{runId}` 读取 `id`、`run_attempt`、`head_sha`、`created_at/updated_at`、`status/conclusion`、`path`。
2. 分页请求 `GET .../actions/runs/{runId}/artifacts?per_page=100&page=N`，读取全部 artifact。应遵循返回数据/下一页而不是任意截断为前五页。
3. matrix 名为 `cxsweep-matrix-{runId}`；shard 名为 `cxshard-{cell}-{runId}-{attempt}`。每个 cell 选择不超过选定 run attempt 的最大 attempt；同 attempt 重名取最大 artifact ID。rerun 只重跑失败 cell 时，其他 cell 保留旧 attempt，不可整体过滤成唯一 attempt。
4. 下载 `GET https://api.github.com/repos/{owner}/{repo}/actions/artifacts/{artifactId}/zip`。该端点返回临时签名重定向，浏览器自动跟随即可。ZIP 内的 JSON 在浏览器里解压、校验，matrix 和 shard 一起交给共同 reader。

公共仓库的 run metadata/artifact list 通常可以匿名读取，但**下载 artifact 仍需要 GitHub token**。推荐 fine-grained PAT，仅授予目标仓库 `Actions: read`。私有仓库还需要 token 对该仓库有访问权，具体取决于资源 owner 和组织策略。不应硬编码、日志打印或随项目导出 token；本项目默认仅在打开的导入窗口内存中使用 token；用户可主动勾选“在此浏览器保存 Token”，将其保存到当前 origin 的 localStorage，关闭窗口或刷新后自动填入。存储键为 `collectivex-dashboard:github-token:v1`，与工作区及语言偏好分离；取消勾选删除保存值，“清除 Token”同时清空输入。该存储未加密，只应在可信设备启用。

GitHub REST API 返回 `Access-Control-Allow-Origin: *`，支持跨域；参考项目已经使用浏览器直接 `fetch` ZIP。本项目同样直接下载，不提供代理。CORS 插件应仅对官方 InferenceX 域名生效：在 GitHub 的有效 CORS 头之外追加同名头，反而可能使下载被浏览器拒绝。直连失败时可在 GitHub 下载 ZIP 后导入。

本次匿名 artifact list 核验遇到 `403`、`X-RateLimit-Remaining: 0`、`X-RateLimit-Limit: 60`，说明共享出口 IP 的匿名额度耗尽；这一结果不代表 CORS 或 artifact 不存在。错误提示需区分 401（认证）、403（权限或限额）、404（不存在/不可见）、410（artifact 过期）。workflow 的 artifact 保留为 14 天，UI 应报告过期，官方数据库可能仍有已经入库的副本。

## 本地文件

应接受官方组装数据集 JSON，以及包含 matrix 和 `record_type: "case-attempt"` shard JSON 的 ZIP/多文件选择。JSON 仅含一个 shard 时可以展示已有测量，但不能凭空恢复 matrix 的完整 requested/unsupported coverage。缺失、`null` 和数值零有不同含义，解析器不能把缺失指标变成零。

相同 run 可以来自官方、ZIP 和本地 JSON；记录来源和 run attempt，跨 run 的 series ID 需要加 run 命名空间。配置颜色可稳定，run 对比使用不同线型，避免相同 matrix case 在多 run 中被错误合并。

## 度量映射

| 字段 | 单位及说明 |
| --- | --- |
| `components.{dispatch,stage,combine,roundtrip}.latency_us.{p50,p90,p95,p99}` | EP 操作延迟，微秒 |
| `activation_data_rate_gbps_at_latency_percentile` | 全 EP world 的 activation GB/s，排除 FP8 scale bytes |
| `payload_data_rate_gbps_at_latency_percentile` | 完整 payload 的每 GPU GB/s，包含记录的 scale bytes |
| `payload_bytes` | 全 EP world 的 aggregate bytes，未除以 EP size |
| `roundtrip_token_rate_at_latency_percentile` | point 级 aggregate tokens/s，不在 component 内 |
| KV `latency_ms` | 整个 burst 的延迟，毫秒 |
| KV `request_ms` | 单 request 完成延迟，毫秒；缺失时不能以 burst 值替代 |
| KV `gbps_p50` / `gbps_p50_incl_prep` | 不含/包含准备开销的 GB/s |

字段中的 `gbps` 实际代表 GB/s，不是 Gbit/s。延迟 p99 对应的速率是由 p99 延迟算出的速率，不是独立采样的 p99 带宽。原始 shard 优先使用 `wire_byte_provenance`，否则回退 `byte_provenance`；payload rate = aggregate payload bytes / EP / latency_us × 1e-3。只在 byte provenance 真实存在时计算，不能把缺失 bytes 当作零。图表应使用“payload rate”而非“链路利用率”，因为不同实现、去重和拓扑并不保证可直接推导物理链路饱和度。

## 可复现请求

```bash
curl --fail --show-error --location \
  'https://inferencex.semianalysis.com/api/v1/collectivex/runs?version=1'
curl --fail --show-error --location \
  'https://inferencex.semianalysis.com/api/v1/collectivex/runs/33412478973?version=1' \
  --output collectivex-33412478973.json
```

参考源码：InferenceX-app 的 `docs/collectivex.md`、`packages/db/src/collectivex/{reader,types,artifact-selection}.ts`、`packages/app/src/lib/collectivex-lazy-ingest.ts`、`packages/app/src/app/api/v1/collectivex/`；InferenceXCurve 的 `src/main.ts`（GitHub import）、`src/inferenceXSync.ts`、`vite.config.ts`。
