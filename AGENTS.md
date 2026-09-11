# Repository instructions

## Communication and scope

- Follow the user's preferred language. This workspace defaults to Simplified Chinese for conversation; keep code, commands, paths, API fields, and logs in their original language.
- Keep `README.md` and this file in English. The application supports English and Simplified Chinese, with English as the first-visit default.
- `CLAUDE.md` is a relative symlink to `AGENTS.md`. Edit this file as the single source of instructions; do not replace the symlink with a duplicate file.

## Architecture

This is a frontend-only Vite + React + TypeScript application. Do not introduce an API proxy, application backend, database credentials, or a hosted token service. Both development and production access upstream APIs directly; users enable a browser CORS extension when required.

- `src/App.tsx`: workspace state, filtering, EP/KV/coverage views, and export actions.
- `src/SourcesPanel.tsx`, `src/sources.ts`: import controls, official API calls, GitHub run/artifact selection, and network errors.
- `src/model.ts`, `src/importers.ts`, `src/export.ts`: normalized data contracts, file parsing, and round-trip Dataset CSV.
- `src/metrics.ts`, `src/chart.tsx`: metric calculations, KV comparisons, SVG rendering, and image export.
- `src/i18n.ts`, `src/i18n-react.tsx`: translation catalog, localized diagnostics, and language preferences.
- `src/styles.css`, `src/theme.ts`: semantic UI colors and concrete SVG/PNG colors. Keep both aligned with the AMD-inspired dark theme.
- `src/storage.ts`: IndexedDB workspace persistence.
- `src/tokenStorage.ts`: opt-in GitHub token storage, isolated from workspace persistence and exports.
- `public/data/`, `scripts/snapshot.mjs`: official historical snapshots and their provenance manifest.
- `tests/`: unit tests at the root and Playwright browser tests under `tests/e2e/`.
- `.github/workflows/ci.yml`: verifies every push/PR and deploys successful `main` runs to GitHub Pages. Keep deployment gated on verification; never deploy pull-request code.

Read the relevant documentation under `docs/` before changing a data contract. The detailed research and import notes are currently in Simplified Chinese.

## Data invariants

- Support local files, GitHub Actions run URLs, and the public InferenceX API through the same normalization layer.
- Keep GitHub run IDs as strings. Preserve the source, selected run attempt, original shard attempt, configuration, and topology instead of merging unrelated series.
- Partial reruns retain unchanged cells from earlier attempts. Do not prefer an old successful result over a newer failed attempt of the same cell.
- Keep `pair_period` and `roundtrip` separate. Never synthesize a missing operation or percentile from another one, or treat `isolated_sum` as a measured roundtrip.
- Missing measurements are not zero. Preserve failure and coverage information; curves must break at known missing observations.
- EP latency uses microseconds; KV latency uses milliseconds. Payload bandwidth is per GPU, activation bandwidth is aggregate, and `gbps` fields mean GB/s.
- Preserve valid upstream summary counters. Compute displayed observation counts separately instead of rewriting source metadata to match visible rows.
- Keep JSON and Dataset CSV round-trippable. Chart CSV is a filtered analysis export and is not a complete dataset backup.
- Bundled measurements must be real, labeled as historical snapshots, and traceable through `public/data/index.json`. Update snapshot files and their checksums together; do not label generated example values as measured data.

## Credentials and browser state

- GitHub tokens are session-only by default. Users may explicitly enable saving in origin-scoped localStorage under `collectivex-dashboard:github-token:v1` through `src/tokenStorage.ts`. Keep this key separate from workspace and language data, restore the opt-in token on reopen, and support removal. Never include tokens in IndexedDB, files, logs, traces, URLs, or exports. Report storage failures without exposing credential contents; never claim localStorage is encrypted.
- Language preferences are stored separately from the workspace. Changing the language must not reset datasets, filters, or legend visibility.
- Translate UI copy and application-authored diagnostics. Preserve raw benchmark values, identifiers, file names, and upstream error details.
- Keep dependency directories, build output, local environment files, and test artifacts out of Git.

## Development and verification

Use Node.js 22.12 or newer and npm. Run `npm ci` from the repository root. Commit `package-lock.json` whenever dependency metadata changes.

```bash
npm run dev                       # Listens on 0.0.0.0:5173
npm test                          # Unit tests
npm run build                     # Strict TypeScript checks and production build
npx playwright install chromium   # Install the local E2E browser if needed
npm run test:e2e                   # Browser tests against dist/
```

Build before running E2E tests. Run all three verification commands before submitting application changes. For documentation-only changes, verify paths, commands, Markdown links, and the `CLAUDE.md` symlink; run the full checks when preparing the repository for publication.

Add tests when they protect meaningful data behavior or interaction. Do not add tests that merely duplicate constants or styling. Browser tests should use bundled data and controlled network responses, with no live credentials.

Use TypeScript strict mode, two-space indentation, and the existing formatting style. Keep parsing and metric calculations separate from UI state. Include user-visible strings in the translation catalog, and verify both locales when changing interface copy.

Do not edit `dist/` by hand. Keep changes focused on the requested task. Commit messages should describe the resulting change, and validation reports must distinguish local tests from checks actually run on GitHub.
