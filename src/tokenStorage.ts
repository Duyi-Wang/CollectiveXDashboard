/** Opt-in, origin-scoped credential storage. Never include this key in workspace exports. */
export const GITHUB_TOKEN_STORAGE_KEY = "collectivex-dashboard:github-token:v1";

export function readGitHubToken(): { token: string; available: boolean } {
  try {
    return {
      token: localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY)?.trim() ?? "",
      available: true,
    };
  } catch {
    return { token: "", available: false };
  }
}

export function saveGitHubToken(token: string): boolean {
  try {
    const value = token.trim();
    if (value) localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, value);
    else localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY);
    return true;
  } catch {
    // Storage errors can contain sensitive details. Only return success/failure.
    return false;
  }
}

export function clearGitHubToken(): boolean {
  return saveGitHubToken("");
}
