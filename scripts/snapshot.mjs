#!/usr/bin/env node
/** Fetch public data at build time; the resulting website needs no backend. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const base = (process.env.INFERENCEX_API_BASE || 'https://inferencex.semianalysis.com/api/v1').replace(/\/$/u, '');
const output = fileURLToPath(new URL('../public/data/', import.meta.url));
const requested = process.argv.slice(2);
if (requested.some((id) => !/^[1-9][0-9]*$/u.test(id))) throw new Error('Usage: node scripts/snapshot.mjs [runId ...]');
async function read(path) {
  const response = await fetch(`${base}/collectivex/${path}?version=1`, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${path}`);
  return response.json();
}
let list;
for (let pass = 0; pass < 30; pass += 1) {
  list = await read('runs');
  if (!Array.isArray(list.runs) || list.version !== 1) throw new Error('Invalid CollectiveX runs response');
  if (list.discovery_complete !== false) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (list.discovery_complete === false) console.warn('Discovery is still incomplete; snapshot only covers the discovered runs.');
const runs = [...list.runs].sort((a, b) => BigInt(a.run_id) > BigInt(b.run_id) ? -1 : 1);
const ep = runs.filter((run) => (run.measured_cases ?? 0) > (run.kv_cases?.measured ?? 0));
const kv = runs.filter((run) => (run.kv_cases?.measured ?? 0) > 0);
const broadEp = [...ep].sort((a, b) => (b.covered_skus?.length ?? 0) - (a.covered_skus?.length ?? 0) || b.measured_cases - a.measured_cases);
const chosen = requested.length ? [...new Set(requested)] : [...new Set([
  ep[0]?.run_id, broadEp[0]?.run_id, kv[0]?.run_id, kv[1]?.run_id,
  ep[1]?.run_id,
].filter(Boolean))].slice(0, 5);
if (!chosen.length) throw new Error('No measured CollectiveX runs are available');
await mkdir(output, { recursive: true });
const files = {};
const digests = {};
const datasets = await Promise.all(chosen.map(async (id) => {
  const dataset = await read(`runs/${id}`);
  if (dataset.version !== 1 || dataset.run?.run_id !== id || !Array.isArray(dataset.series) || (dataset.kv !== undefined && !Array.isArray(dataset.kv))) throw new Error(`Invalid dataset for ${id}`);
  return { id, dataset, body: `${JSON.stringify(dataset)}\n` };
}));
for (const { id, dataset, body } of datasets) {
  const name = `run-${id}.json`;
  await writeFile(`${output}${name}`, body);
  files[id] = name;
  digests[id] = createHash('sha256').update(body).digest('hex');
  console.log(`${id}: ${dataset.series.length} EP series, ${(dataset.kv ?? []).length} KV cases, ${Buffer.byteLength(body)} bytes`);
}
const index = {
  version: 1,
  fetched_at: new Date().toISOString(),
  source: `${base}/collectivex/runs?version=1`,
  discovery_complete: list.discovery_complete === true,
  available_run_count: list.runs.length,
  runs: chosen.map((id) => list.runs.find((run) => run.run_id === id) ?? { run_id: id }),
  files,
  sha256: digests,
};
await writeFile(`${output}index.json`, `${JSON.stringify(index, null, 2)}\n`);
console.log(`Saved ${chosen.length} public snapshots to ${output}`);
