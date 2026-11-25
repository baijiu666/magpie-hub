// GitHub REST API：把卡片上的「收藏」接到仓库的真实 star。
// 纯前端，token 只存在本机 localStorage，请求直接打到 api.github.com。
const TOKEN_KEY = "magpiehub:github-token";
const API = "https://api.github.com";

export interface GithubViewer {
  login: string;
  avatar: string | null;
}

export class GithubError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GithubError";
    this.status = status;
  }
}

export function readGithubToken(): string {
  try {
    return (localStorage.getItem(TOKEN_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function writeGithubToken(token: string) {
  const value = token.trim();
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 隐私模式下 localStorage 不可写，认了
  }
}

function headers(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

async function call(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${API}${path}`, {
      ...init,
      headers: { ...headers(token), ...(init.headers ?? {}) }
    });
  } catch {
    throw new GithubError(0, "连不上 GitHub，检查网络或代理后重试");
  }
}

function describe(status: number): string {
  if (status === 401) return "token 无效或已过期";
  if (status === 403) return "token 权限不足，需要 public_repo 范围";
  if (status === 404) return "仓库不存在，或 token 无权访问";
  if (status === 422) return "GitHub 拒绝了这次请求";
  if (status === 429) return "触发 GitHub 限流，稍后再试";
  return `GitHub 返回 ${status}`;
}

export async function fetchViewer(token: string): Promise<GithubViewer> {
  const res = await call(token, "/user");
  if (!res.ok) throw new GithubError(res.status, describe(res.status));
  const data = (await res.json()) as { login?: string; avatar_url?: string | null };
  if (!data.login) throw new GithubError(res.status, "读不到账号信息");
  return { login: data.login, avatar: data.avatar_url ?? null };
}

export async function fetchStarred(token: string, owner: string, repo: string): Promise<boolean> {
  const res = await call(token, `/user/starred/${owner}/${repo}`, { method: "HEAD" });
  if (res.status === 204) return true;
  if (res.status === 404) return false;
  throw new GithubError(res.status, describe(res.status));
}

export async function setStarred(
  token: string,
  owner: string,
  repo: string,
  starred: boolean
): Promise<void> {
  const res = await call(token, `/user/starred/${owner}/${repo}`, {
    method: starred ? "PUT" : "DELETE"
  });
  if (res.status === 204) return;
  throw new GithubError(res.status, describe(res.status));
}

// 并发上限：25 个仓库逐个 HEAD 太慢，一口气打 25 个又容易触发二级限流
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}