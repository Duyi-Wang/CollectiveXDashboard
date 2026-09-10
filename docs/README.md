# Documentation

Start with the [project README](../README.md) for installation, imports, analysis features, exports, and static hosting.

The detailed technical notes below are currently written in **Simplified Chinese**. Source paths, API fields, formulas, commands, and upstream links retain their original spelling.

| Document | Contents |
| --- | --- |
| [CollectiveX research](collectivex-research.md) | PR #2004, current benchmark contracts, upstream visualization logic, measurement semantics, and color rules |
| [Data sources](data-sources.md) | Official API endpoints, CORS behavior, GitHub authentication, artifact selection, and reruns |
| [Import and export formats](import-formats.md) | JSON/JSONL/ZIP inputs, Dataset CSV schema, Chart CSV limitations, units, and examples |
| [Verification notes](verification.md) | Reproducible local checks and separately recorded live-network and rendering observations |

Additional references:

- [Snapshot manifest](../public/data/index.json): source URL, fetch time, selected runs, and SHA-256 checksums.
- [Importable sample CSV](../public/example.csv): one real H100/NCCL-EP observation.
- [Dashboard screenshot](dashboard.png): the default English interface and dark theme.
- [Repository instructions](../AGENTS.md): architecture, contributor conventions, and measurement invariants.

Research conclusions describe the upstream revisions and dates cited in each document. Recheck the current upstream contract before assuming those details still apply to new benchmark generations.
