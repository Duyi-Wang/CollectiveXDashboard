/** Browser-only data clients. Credentials are never persisted or exported. */
export const OFFICIAL_API_BASE = "https://inferencex.semianalysis.com/api/v1";
export const OFFICIAL_CORS_HELP =
  "无法读取 InferenceX：官方 API 未开放跨域读取，也可能是网络故障。请启用仅对 inferencex.semianalysis.com 生效的 CORS 浏览器插件后重试；也可读取内置快照或导入本地 JSON。";
const GITHUB_DOWNLOAD_HELP =
  "无法下载 GitHub artifact，可能是网络或浏览器跨域限制。GitHub 自带 CORS 响应头，请让 CORS 插件仅对 inferencex.semianalysis.com 生效，避免重复响应头；也可从 GitHub 下载 ZIP 后本地导入。";
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

export interface RunSummary {
  run_id: string;
  run_attempt?: number;
  generated_at?: string;
  conclusion?: string | null;
  covered_skus?: string[];
  measured_cases?: number;
  requested_cases?: number;
  kv_cases?: { measured: number; requested: number };
  [key: string]: unknown;
}
export interface RunList {
  version: number;
  runs: RunSummary[];
  discovery_complete: boolean;
}
export interface SnapshotIndex extends RunList {
  fetched_at: string;
  source: string;
  files: Record<string, string>;
}
export interface GitHubRunRef {
  owner: string;
  repo: string;
  runId: string;
  attempt?: number;
}
export interface GitHubRunMetadata {
  run_id: string;
  run_attempt: number;
  generated_at: string;
  conclusion: string | null;
  source_sha: string;
  status: string;
  html_url: string;
  path?: string;
}
export interface GitHubArtifact {
  id: number;
  name: string;
  expired: boolean;
  size_in_bytes?: number;
}
export interface SourceFile {
  name: string;
  bytes: Uint8Array;
}
export interface GitHubLoadOptions {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, name: string) => void;
}

function officialUrl(path: string, base = OFFICIAL_API_BASE): string {
  return `${base.replace(/\/$/u, "")}/collectivex/${path}?version=1`;
}

async function responseError(
  response: Response,
  credential = "",
): Promise<Error> {
  let detail = "";
  try {
    const body = (await response.json()) as {
      error?: string;
      message?: string;
    };
    const message = body.error ?? body.message;
    detail = typeof message === "string" ? message : "";
  } catch {
    /* An upstream error need not be JSON. */
  }
  // Error responses are external input, and must never echo a supplied credential.
  if (credential) detail = detail.split(credential).join("[REDACTED]");
  detail = detail.slice(0, 500);
  if (
    response.status === 403 &&
    response.headers.get("x-ratelimit-remaining") === "0"
  ) {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    return new Error(
      `GitHub API 请求额度已耗尽${reset ? `，恢复时间 ${new Date(reset * 1000).toLocaleString()}` : ""}。请使用有权限的 token 或稍后重试。`,
    );
  }
  const hints: Record<number, string> = {
    401: "认证失败，请检查 GitHub token。",
    403: "访问被拒绝，请检查仓库权限、Actions: read 授权或 API 请求额度。",
    404: "未找到数据，或当前凭据无权访问。",
    410: "GitHub artifact 已过期，请尝试官方数据库中保存的副本或本地备份。",
  };
  return new Error(
    `HTTP ${response.status}：${hints[response.status] ?? "数据请求失败。"}${detail ? ` ${detail}` : ""}`,
  );
}

async function fetchJson<T>(
  url: string,
  signal?: AbortSignal,
  headers?: HeadersInit,
  help = OFFICIAL_CORS_HELP,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal, headers });
  } catch (error) {
    if (error instanceof TypeError) throw new Error(help, { cause: error });
    throw error;
  }
  if (!response.ok)
    throw await responseError(
      response,
      new Headers(headers).get("Authorization")?.replace(/^Bearer\s+/iu, "") ??
        "",
    );
  return (await response.json()) as T;
}

export async function fetchOfficialRuns(
  base = OFFICIAL_API_BASE,
  signal?: AbortSignal,
): Promise<RunList> {
  const data = await fetchJson<RunList>(officialUrl("runs", base), signal);
  if (
    data?.version !== 1 ||
    !Array.isArray(data.runs) ||
    !data.runs.every(
      (run) =>
        run &&
        typeof run.run_id === "string" &&
        /^[1-9][0-9]*$/u.test(run.run_id),
    )
  ) {
    throw new Error("官方 run 索引格式不受支持。");
  }
  return data;
}
export function fetchOfficialLatest<T = unknown>(
  base = OFFICIAL_API_BASE,
  signal?: AbortSignal,
): Promise<T> {
  return fetchJson<T>(officialUrl("latest", base), signal);
}
export async function fetchOfficialRun<T = unknown>(
  runId: string,
  base = OFFICIAL_API_BASE,
  signal?: AbortSignal,
): Promise<T> {
  if (!/^[1-9][0-9]*$/u.test(runId))
    throw new Error("run ID 必须是正整数形式的字符串。");
  const data = await fetchJson<T>(officialUrl(`runs/${runId}`, base), signal);
  verifyDatasetRun(data, runId);
  return data;
}

function verifyDatasetRun(data: unknown, runId: string): void {
  if ((data as { run?: { run_id?: unknown } } | null)?.run?.run_id !== runId) {
    throw new Error("返回数据的 run ID 与请求不匹配，已拒绝导入。");
  }
}

function snapshotRoot(): string {
  return `${import.meta.env.BASE_URL}data/`;
}
export function fetchSnapshotIndex(
  signal?: AbortSignal,
): Promise<SnapshotIndex> {
  return fetchJson<SnapshotIndex>(
    `${snapshotRoot()}index.json`,
    signal,
    undefined,
    "无法读取内置快照，请检查部署文件或导入本地 JSON。",
  );
}
export async function fetchSnapshotRun<T = unknown>(
  runId: string,
  index?: SnapshotIndex,
  signal?: AbortSignal,
): Promise<T> {
  const manifest = index ?? (await fetchSnapshotIndex(signal));
  const file = manifest.files[runId];
  if (!file || !/^[a-zA-Z0-9_.-]+\.json$/u.test(file))
    throw new Error(
      `内置快照未包含 run ${runId}。请使用实时官方源或本地文件。`,
    );
  const data = await fetchJson<T>(
    `${snapshotRoot()}${file}`,
    signal,
    undefined,
    "无法读取该 run 的内置快照。",
  );
  verifyDatasetRun(data, runId);
  return data;
}

export function parseGitHubRunUrl(input: string): GitHubRunRef {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("请输入完整的 GitHub Actions run URL。");
  }
  const match =
    /^\/([^/]+)\/([^/]+)\/actions\/runs\/([1-9][0-9]*)(?:\/attempts\/([1-9][0-9]*))?(?:\/)?$/u.exec(
      url.pathname,
    );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    !match
  ) {
    throw new Error(
      "URL 应为 https://github.com/owner/repo/actions/runs/123，可附加 /attempts/2。",
    );
  }
  if (
    !/^[a-zA-Z0-9_.-]+$/u.test(match[1]!) ||
    !/^[a-zA-Z0-9_.-]+$/u.test(match[2]!)
  )
    throw new Error("GitHub 仓库路径格式不正确。");
  const attempt = match[4] ? Number(match[4]) : undefined;
  if (attempt !== undefined && !Number.isSafeInteger(attempt))
    throw new Error("run attempt 超出可支持范围。");
  return {
    owner: match[1]!,
    repo: match[2]!,
    runId: match[3]!,
    ...(attempt ? { attempt } : {}),
  };
}

/** Preserve untouched cells during partial reruns; never silently use expired predecessors. */
export function selectGitHubArtifacts(
  artifacts: readonly GitHubArtifact[],
  runId: string,
  attempt: number,
): GitHubArtifact[] {
  if (
    !/^[1-9][0-9]*$/u.test(runId) ||
    !Number.isSafeInteger(attempt) ||
    attempt < 1
  )
    throw new Error("run ID 或 attempt 无效。");
  const matrix = artifacts
    .filter((item) => item.name === `cxsweep-matrix-${runId}`)
    .sort((a, b) => b.id - a.id)[0];
  if (!matrix)
    throw new Error(
      "该 run 没有 CollectiveX sweep matrix artifact。请确认 workflow 或尝试官方数据库。",
    );
  const pattern = new RegExp(`^cxshard-(.+)-${runId}-([1-9][0-9]*)$`, "u");
  const cells = new Map<
    string,
    { artifact: GitHubArtifact; attempt: number }
  >();
  for (const artifact of artifacts) {
    const match = pattern.exec(artifact.name);
    if (!match) continue;
    const shardAttempt = Number(match[2]);
    if (!Number.isSafeInteger(shardAttempt) || shardAttempt > attempt) continue;
    const previous = cells.get(match[1]!);
    if (
      !previous ||
      shardAttempt > previous.attempt ||
      (shardAttempt === previous.attempt && artifact.id > previous.artifact.id)
    ) {
      cells.set(match[1]!, { artifact, attempt: shardAttempt });
    }
  }
  const selected = [
    matrix,
    ...[...cells.values()]
      .map((entry) => entry.artifact)
      .sort((a, b) => a.name.localeCompare(b.name)),
  ];
  const expired = selected.find((item) => item.expired);
  if (expired)
    throw new Error(
      `artifact ${expired.name} 已过期，无法完整还原此 run。请尝试官方数据库或本地备份。`,
    );
  return selected;
}

export async function loadGitHubRunArtifacts(
  input: string,
  token = "",
  options: GitHubLoadOptions = {},
): Promise<{
  run: GitHubRunMetadata;
  files: SourceFile[];
  warnings: string[];
}> {
  const ref = parseGitHubRunUrl(input);
  if (!token.trim())
    throw new Error(
      "GitHub artifact 下载需要 token，即使仓库公开。请提供具有目标仓库 Actions: read 权限的 token。",
    );
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token.trim()}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const root = `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  const metadataPath = `/actions/runs/${ref.runId}${ref.attempt ? `/attempts/${ref.attempt}` : ""}`;
  const metadata = await fetchJson<Record<string, unknown>>(
    `${root}${metadataPath}`,
    options.signal,
    headers,
    GITHUB_DOWNLOAD_HELP,
  );
  if (
    !metadata ||
    (typeof metadata.id === "number" && !Number.isSafeInteger(metadata.id)) ||
    String(metadata.id) !== ref.runId
  ) {
    throw new Error("GitHub 返回的 run ID 与请求不匹配，已拒绝导入。");
  }
  const runAttempt = ref.attempt ?? Number(metadata.run_attempt);
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1)
    throw new Error("GitHub 返回了无效的 run attempt。");
  if (Number(metadata.run_attempt) !== runAttempt)
    throw new Error("GitHub 返回的 run attempt 与请求不匹配。");
  const run: GitHubRunMetadata = {
    run_id: ref.runId,
    run_attempt: runAttempt,
    generated_at: String(metadata.updated_at ?? metadata.created_at ?? ""),
    conclusion:
      typeof metadata.conclusion === "string" ? metadata.conclusion : null,
    source_sha: String(metadata.head_sha ?? ""),
    status: String(metadata.status ?? ""),
    html_url: String(metadata.html_url ?? input),
    ...(typeof metadata.path === "string" ? { path: metadata.path } : {}),
  };
  const artifacts: GitHubArtifact[] = [];
  for (let page = 1; ; page += 1) {
    const payload = await fetchJson<{
      total_count: number;
      artifacts: GitHubArtifact[];
    }>(
      `${root}/actions/runs/${ref.runId}/artifacts?per_page=100&page=${page}`,
      options.signal,
      headers,
      GITHUB_DOWNLOAD_HELP,
    );
    if (
      !Array.isArray(payload?.artifacts) ||
      !payload.artifacts.every(
        (item) =>
          item &&
          Number.isSafeInteger(item.id) &&
          item.id > 0 &&
          typeof item.name === "string" &&
          typeof item.expired === "boolean",
      )
    )
      throw new Error("GitHub artifact 列表格式无效。");
    artifacts.push(...payload.artifacts);
    if (
      payload.artifacts.length < 100 ||
      artifacts.length >= payload.total_count
    )
      break;
  }
  const selected = selectGitHubArtifacts(artifacts, ref.runId, runAttempt);
  const files: SourceFile[] = [];
  const warnings: string[] = [];
  if (run.status !== "completed")
    warnings.push(
      "该 run 尚未完成；当前只包含已经上传的 artifact，请完成后重新导入。",
    );
  if (selected.length === 1)
    warnings.push(
      "该 run 只有 matrix，没有结果 shard；可查看请求覆盖范围，但没有实测曲线。",
    );
  options.onProgress?.(0, selected.length, "读取 artifacts");
  for (const artifact of selected) {
    if (artifact.size_in_bytes && artifact.size_in_bytes > MAX_ARCHIVE_BYTES)
      throw new Error(
        `artifact ${artifact.name} 超过 100 MiB 浏览器导入限制。`,
      );
    let response: Response;
    try {
      // Construct a fixed GitHub endpoint; never send credentials to an artifact-supplied URL.
      response = await fetch(`${root}/actions/artifacts/${artifact.id}/zip`, {
        headers,
        signal: options.signal,
      });
    } catch (error) {
      if (error instanceof TypeError)
        throw new Error(GITHUB_DOWNLOAD_HELP, { cause: error });
      throw error;
    }
    if (!response.ok) throw await responseError(response, token.trim());
    if (Number(response.headers.get("content-length")) > MAX_ARCHIVE_BYTES)
      throw new Error(
        `artifact ${artifact.name} 超过 100 MiB 浏览器导入限制。`,
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_ARCHIVE_BYTES)
      throw new Error(
        `artifact ${artifact.name} 超过 100 MiB 浏览器导入限制。`,
      );
    files.push({ name: `${artifact.name}.zip`, bytes });
    options.onProgress?.(files.length, selected.length, artifact.name);
  }
  return { run, files, warnings };
}
