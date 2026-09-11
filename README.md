# CollectiveX Dashboard — MORI Internal Fork

[**Open the dashboard**](https://duyi-wang.github.io/CollectiveXDashboard/) · [GitHub repository](https://github.com/Duyi-Wang/CollectiveXDashboard) · [Build and deployment](https://github.com/Duyi-Wang/CollectiveXDashboard/actions/workflows/ci.yml)

A **MORI internal fork** for exploring GPU communication benchmarks from [InferenceX CollectiveX](https://github.com/SemiAnalysisAI/InferenceX/tree/main/experimental/CollectiveX). Compare expert-parallel communication and KV cache transfers across hardware, backends, configurations, and runs.

Built with React, TypeScript, Vite, and D3. The app runs entirely in the browser: local files are parsed locally, and live data is fetched directly from GitHub or the public InferenceX API. **There is no backend or API proxy.** Live access to the official API requires a browser CORS extension.

- **Three data sources:** local JSON/JSONL/CSV/ZIP files, GitHub Actions run URLs, and the official InferenceX API.
- **EP and KV analysis:** latency, bandwidth, percentiles, configuration filters, run comparisons, and test coverage.
- **Portable results:** workspace JSON, round-trip Dataset CSV, filtered Chart CSV, and SVG/PNG exports with legends and a **MORI Internal** watermark.
- **Ready to explore:** five real official snapshots, an AMD-inspired dark theme, and English/Chinese UI switching. English is the default.

The dark theme uses restrained red for the brand and primary actions, slate-blue for informational and selected states, green for success, and amber for warnings. Benchmark curves retain their vendor-specific colors.

## Quick start

Use **Node.js 22.12 or newer** and npm. The repository includes an `.nvmrc` for Node.js 22.

```bash
git clone https://github.com/Duyi-Wang/CollectiveXDashboard.git
cd CollectiveXDashboard
npm ci
npm run dev
```

Open **http://localhost:5173**. The development server listens on `0.0.0.0`, so it is also accessible through the host's network address.

A fresh workspace loads the bundled historical snapshots and selects the EP sweep with the most series. No internet access or GitHub token is needed to explore these snapshots. Their source URLs, fetch time, and SHA-256 checksums are recorded in [public/data/index.json](public/data/index.json).

Use **EN** or the Chinese language button in the header to switch languages. The choice is remembered separately from the workspace. Switching languages preserves loaded data, filters, and legend selections.

## Import data

| Source | How to load it | Requirements |
| --- | --- | --- |
| Local files | Drop or select JSON, JSONL, NDJSON, CSV, or ZIP files. Multiple files can be selected together. | Files are parsed in the browser and are not uploaded. |
| GitHub Actions | Paste `https://github.com/owner/repo/actions/runs/123`, optionally followed by `/attempts/2`. | A token with access to the repository and permission to read Actions artifacts. |
| Official InferenceX API | Import the latest run, browse available runs, or enter a run ID. | Enable a browser CORS extension for the official API. Database credentials are not needed. |

For raw sweep results, import the **matrix and result shards together** to preserve requested coverage and unsuccessful cases. A shard alone still supplies its measurements, but cannot establish the complete requested test matrix.

The [sample CSV](public/example.csv) contains one real H100/NCCL-EP measurement and can be used to try local import. See the [format reference](docs/import-formats.md) for supported contracts and examples; this detailed reference is currently in Simplified Chinese.

### Browser CORS extension

The official API currently omits `Access-Control-Allow-Origin`, so an ordinary cross-origin browser request is blocked even though the API is public. Use a CORS browser extension that can modify response headers, as with [InferenceXCurve](https://github.com/Duyi-Wang/InferenceXCurve):

1. Enable it for `inferencex.semianalysis.com`.
2. Grant the extension site access to the dashboard page as required by the extension.
3. Retry the import.

GitHub normally supplies valid CORS headers. Avoid adding duplicate headers to GitHub requests. If an artifact redirect is blocked, follow the extension's domain settings or download the ZIP from GitHub and import it locally. Local files and bundled snapshots do not require an extension.

An extension does not bypass token permissions, API rate limits, or artifact expiry. The app reports these failures separately where the response permits it.

### GitHub authentication and reruns

Artifact downloads require a token even for public repositories. Prefer a fine-grained personal access token scoped to the target repository with **Actions: read** permission, subject to the repository owner's access policy.

Tokens are session-only by default and are cleared when the dialog closes. Enable **Save token in this browser** to store a token in this site's localStorage and fill it in after reopening or reloading. Changes to the token are saved automatically while the option is enabled. Unchecking it removes the saved value while leaving the current entry available for this session; **Clear token** removes the saved value and clears the input.

Saved tokens are **unencrypted** and accessible to scripts running on the same origin. Enable this option only on a device you trust. Storage is specific to the browser profile and site origin (scheme, hostname, and port), so `localhost`, a network IP, and a deployed website have separate saved tokens. The credential uses a dedicated key and is never included in IndexedDB workspaces, JSON/CSV exports, logs, or URLs. If browser storage is unavailable, the app reports the failure and still accepts a token for the current session.

For a selected run attempt, the importer chooses each cell's newest eligible shard and retains older measurements for cells that were not rerun. Original shard attempts remain traceable. Expired artifacts cannot be reconstructed from GitHub; an already-ingested copy may still exist in the official database.

## Explore and export

- **Expert Parallel:** filter phase, kernel mode, precision, EP size, hardware SKU, and backend. Inspect Dispatch, Stage, Combine, Roundtrip, Pair period, and Isolated sum.
- **Metrics:** latency, per-GPU payload bandwidth, aggregate activation bandwidth, and token throughput. Choose p50/p90/p95/p99, linear or logarithmic axes, and a p50–p99 latency band.
- **Run comparison:** configuration colors stay stable while line patterns distinguish runs. Click legend entries to toggle curves, or hover over and keyboard-focus points to inspect measurements and provenance.
- **KV Transfer:** bandwidth or burst latency versus batch, the best bandwidth at each ISL, and overlap gain relative to batch 1. Bulk and paged transfers remain separate.
- **Coverage:** inspect successful, unsupported, failed, invalid, and pending cases. Coverage describes the loaded runs, not the upstream project's manually maintained support matrix.
- **Bandwidth diagnostics:** fit fixed overhead and bandwidth within a series, with R-squared and reliability indicators. A fit is not a measurement of physical link capacity.

The workspace is saved in the current browser's IndexedDB. Use exports for backups or moving between browsers:

| Export | Contents | Importable into the app? |
| --- | --- | --- |
| Workspace JSON | All loaded datasets, including EP, KV, coverage, and run metadata | Yes |
| Dataset CSV | Typed records preserving the full datasets and measurement units | Yes |
| Chart CSV | The currently visible coordinates, labels, axes, and point details | No; intended for analysis in other tools |
| SVG / PNG | The current chart, MORI Internal watermark, and full visible-series legend in the dark theme | Image output only |

Removing a run only changes the local workspace. Clearing browser site data can remove saved workspaces and preferences.

### Measurement semantics

`roundtrip` and `pair_period` measure different execution patterns and are never substituted for each other. At the time of the upstream investigation, the official API omitted raw `pair_period` measurements; import raw artifacts to inspect that component when available.

EP latency is expressed in **microseconds**, while KV latency is in **milliseconds**. Fields named `gbps` represent **GB/s**, not Gbit/s. Payload bandwidth is per GPU and includes scale bytes; activation bandwidth is aggregated across ranks. A rate at p99 latency is not the p99 of a rate distribution. Missing values and failed observations are not filled with zero.

## Build for static hosting

```bash
npm run build
npm run preview
```

The production output is **`dist/`**. Serve it from any static host, including GitHub Pages. Relative asset paths support repository subpaths. Use HTTP(S), not `file://`, because the application uses ES modules.

The hosted dashboard is available at **https://duyi-wang.github.io/CollectiveXDashboard/**. Every push to `main` runs unit tests, builds the site, runs Playwright tests, and deploys the verified `dist/` to GitHub Pages. Pull requests and other branches run verification without deploying. You can also run the workflow manually on `main` to redeploy.

Pages uses the **GitHub Actions** build source and the `github-pages` environment. Deployment uses the built-in workflow token and OpenID Connect, with no personal token or database credentials stored in repository secrets. The same CORS-extension requirements apply in development and production. Build output and dependencies remain ignored by Git.

### Refresh bundled snapshots

Snapshot refreshes run on a development machine or in CI, without a persistent service:

```bash
npm run snapshot
# Or select specific run IDs:
npm run snapshot -- 34432070017 33412478973
npm run build
```

The default refresh saves up to five representative EP/KV runs. These are historical samples, not an offline mirror of the entire database. Review and commit updated snapshot files and their manifest together.

## Development

```bash
npm test                         # Parser, metric, chart, source, and locale tests
npm run build                    # TypeScript checks and the production build
npx playwright install chromium  # One-time local browser installation
npm run test:e2e                  # Browser tests against the production build
```

Run the build before E2E tests so the preview server uses current code. On Linux CI, Playwright installs browser dependencies with `npx playwright install --with-deps chromium`.

The GitHub Actions [verification and deployment workflow](.github/workflows/ci.yml) runs these checks on pushes and pull requests, and can also be started manually. A successful `main` run deploys to Pages. Tests use bundled measurements and mocked network responses, so they require no personal GitHub token or database credentials. Live API checks are documented separately in the [verification notes](docs/verification.md).

| Directory / file | Purpose |
| --- | --- |
| `src/App.tsx`, `src/SourcesPanel.tsx` | Workspace, filters, analysis views, and import controls |
| `src/sources.ts`, `src/tokenStorage.ts` | Direct API requests, artifact selection, and optional local token storage |
| `src/importers.ts`, `src/export.ts` | Input normalization and round-trip Dataset CSV |
| `src/model.ts`, `src/metrics.ts` | Shared data contract, metric reads, fits, and KV analysis |
| `src/chart.tsx`, `src/theme.ts`, `src/styles.css` | SVG rendering, dark theme, and image exports |
| `src/i18n.ts`, `src/i18n-react.tsx` | UI copy, language switching, and preferences |
| `src/storage.ts` | Browser workspace persistence |
| `public/`, `scripts/snapshot.mjs` | Static assets and traceable official snapshots |
| `tests/` | Unit tests and Playwright browser tests |
| `docs/` | Research, data contracts, screenshots, and validation notes |
| `AGENTS.md`, `CLAUDE.md` | Contributor-agent instructions; `CLAUDE.md` is a relative symlink to `AGENTS.md` |

See the [documentation index](docs/README.md) for the research references. Detailed research notes currently remain in Simplified Chinese. See [AGENTS.md](AGENTS.md) for repository conventions and data invariants.

## References and license

- [InferenceX PR #2004](https://github.com/SemiAnalysisAI/InferenceX/pull/2004): initial CollectiveX integration.
- [CollectiveX sweep workflow](https://github.com/SemiAnalysisAI/InferenceX/actions/workflows/collectivex-sweep.yml): benchmark runs and artifacts.
- [InferenceXCurve](https://github.com/Duyi-Wang/InferenceXCurve): reference for browser-based imports and exploration.
- [InferenceX dashboard](https://inferencex.semianalysis.com/): official data source and visualization reference.

This is an independent tool, not an official SemiAnalysis or AMD product. The source code is available under the [MIT license](LICENSE). Bundled public benchmark data retains its upstream provenance; benchmark data and third-party dependencies remain subject to their respective terms.
