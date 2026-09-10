# CollectiveXDashboard

- 默认使用简体中文沟通；代码、字段和命令保留英文。
- Vite + React + TypeScript，纯前端。不要添加 API proxy、服务端或数据库凭据。跨域访问由用户启用浏览器 CORS 插件。
- 三种数据源：本地文件、GitHub Actions run URL、InferenceX 官方公开 API。真实离线快照带来源元数据。
- GitHub token 仅保存在内存，不能写 localStorage、IndexedDB、日志或导出。
- 保留 raw `pair_period` 与 `roundtrip` 的测量语义，不能互相补值。缺少分位数或失败的数据点不能当作 0。
- 校验：`npm test`、`npm run build`、`npm run test:e2e`。依赖用 npm，提交 lockfile。
