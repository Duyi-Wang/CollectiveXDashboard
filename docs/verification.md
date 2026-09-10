# 验证记录

验证环境：2026-09-10，Node.js 22.22.2，Chromium 153，Vite 6.4.3。项目路径 `/home/duwang/CollectiveXDashboard`。

## 可重复的自动检查

- `npm ci`：从 lockfile 全新安装依赖。
- `npm run build`：TypeScript 严格类型检查和 Vite 生产构建。
- `npm test`：60 项单元测试，覆盖 raw/官方/CSV/ZIP 解析、rerun 组装、分位数缺失、单位换算、KV、OLS、真实 SVG 断线、数据 CSV 往返、权限错误与凭据脱敏。
- `npm run test:e2e`：9 项 Chromium 测试，在生产静态构建上运行。覆盖真实快照数值、筛选和键盘 tooltip、本地 ZIP 导入、JSON/CSV 与 IndexedDB 往返、官方 CORS 失败/恢复、GitHub 下载链路、token 关闭即清除、KV/coverage、SVG/PNG 图例与文件格式、390px 窄屏无页面横向溢出。

网络协议 E2E 中的官方/GitHub 响应为受控模拟，用于保证 CI 可重复且无需真实 token；测量值来自随项目保存的真实官方快照。以下真实网络检查另外执行，不能与模拟测试混淆。

## 真实网络检查

1. 官方 `runs?version=1`、`latest?version=1`、指定 EP/KV run 返回 HTTP 200。最新快照运行 `34432070017`：4 个 EP series、28 个点；广覆盖运行 `33356406487`：117 个 EP series、860 个点。KV runs `33412478973` 和 `33378604574` 各有 14 个 case、1080 行。
2. 未启用扩展的 Chromium 访问官方 API，浏览器报告缺少 `Access-Control-Allow-Origin`；应用显示 CORS/网络提示。这符合官方原始响应头。
3. 在临时 Chromium profile 载入仅针对官方 API 设置 `Access-Control-Allow-Origin: *` 的 Manifest V3 测试扩展，并授予请求目标及当前 localhost 页面的站点权限。直接点击“导入最新运行”成功，提示“已导入 1 组数据”。没有本地或远程代理，没有关闭浏览器整体安全策略。测试扩展不随产品分发；实际用户使用自己选择的 CORS 插件。
4. 使用当前机器已有的 `gh` 登录凭据，在 Chromium 的产品界面中输入 run URL `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34432070017`，直接下载 matrix 和两个 shard ZIP。导入得到 1 个运行、4 条 EP 曲线、28 个点；界面显示 GitHub CI 来源。token 只通过内存传递，没有写入文件、测试 trace、截图或日志。
5. 该 run 的真实 artifacts：matrix ID `10134835706`；H100 shard ID `10135329362`；H200 shard ID `10135198237`。三个 artifact 检查时均未过期。公共匿名 API 曾返回共享出口限流 403，已有登录凭据请求成功。

生产部署与本地开发均使用同样的官方绝对 URL 和 GitHub URL。`vite.config.ts` 没有 proxy，应用中没有 API server 或数据库凭据。没有创建远程仓库或发布网站；本地 Git 提交保存交付内容。

## 视觉与数据边界

桌面和手机视口已通过实际渲染检查，桌面截图见 `docs/dashboard.png`。SVG/PNG 导出带完整可见系列图例、来源和 attempt；PNG 的 signature 已在浏览器测试中检查。

官方 API 没有提供 raw `pair_period`，选择该组件时显示无数据；只有带实际该组件的原始 JSON/shard 才可绘图。失败、缺分位数与缺带宽不会被补成 0。已知缺失 ladder 点断开曲线。官方 counters 保留原值，页面实测点数另外从返回行计数。静态快照不是实时全库备份。

## 中英文界面

首次访问默认英文。新增验证覆盖英语/中文即时切换、语言刷新后保留、切换前后筛选与曲线路径和导出数据一致、导入错误/进度动态换语言、KV 图例及 SVG 导出语言、窄屏布局，以及 localStorage 被禁用时仍能切换。原有完整流程测试在中文模式继续通过。
