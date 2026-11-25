import { installFor, isPaused, isPluginRepo } from "../../shared/filters.mjs";

export type Provider = "github" | "gitee";

export interface Plugin {
  provider: Provider;
  owner: string;
  repo: string;
  host: string;
  repoUrl: string;
  displayName: string;
  description: string;
  summary: string;
  version: string | null;
  npmName?: string | null;
  providers: string[];
  icon?: string | null;
  npmVersion?: string | null;
  topics: string[];
  stars: number;
  paused: boolean;
  updatedAt: string;
  install: string;
}

export interface Author {
  provider: Provider;
  owner: string;
  avatar: string | null;
}

export interface Snapshot {
  authors?: Author[];
  magpie?: { owner: string; avatar: string | null };
  plugins: Plugin[];
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const res = await fetch(new URL("data/plugins.json", document.baseURI), {
      cache: "no-cache",
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    return (await res.json()) as Snapshot;
  } catch {
    return null;
  }
}

export interface LiveRepo {
  name: string;
  description: string | null;
  topics?: string[];
  stargazers_count?: number;
  archived?: boolean;
  pushed_at?: string;
  updated_at?: string;
}

export async function fetchLive(owner: string): Promise<LiveRepo[]> {
  const repos: LiveRepo[] = [];

  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100&sort=updated&page=${page}`,
      { headers: { accept: "application/vnd.github+json" }, cache: "no-store" }
    );
    if (!res.ok) {
      const limited = res.status === 403 || res.status === 429;
      throw new Error(limited ? "GitHub 接口限流了，稍后再试" : `GitHub 返回 ${res.status}`);
    }
    const batch = (await res.json()) as LiveRepo[];
    repos.push(...batch);
    if (batch.length < 100) break;
  }

  return repos;
}

function fromLiveRepo(repo: LiveRepo, owner: string): Plugin {
  const description = repo.description ?? "";
  return {
    provider: "github",
    owner,
    repo: repo.name,
    host: "github.com",
    repoUrl: `https://github.com/${owner}/${repo.name}`,
    displayName: repo.name,
    description,
    summary: description,
    version: null,
    npmName: null,
    providers: [],
    icon: null,
    npmVersion: null,
    topics: repo.topics ?? [],
    stars: repo.stargazers_count ?? 0,
    paused: isPaused(`${repo.name} ${description}`, Boolean(repo.archived)),
    updatedAt: repo.pushed_at ?? repo.updated_at ?? "",
    install: installFor({ provider: "github", owner, repo: repo.name })
  };
}

/** 实时列表决定“有哪些仓库”，快照补齐版本号、中文简介和图标。 */
function mergeLive(repos: LiveRepo[], owner: string, previous: Plugin[]): Plugin[] {
  const byRepo = new Map(previous.map((plugin) => [plugin.repo, plugin]));
  return repos.filter(isPluginRepo).map((repo) => {
    const prev = byRepo.get(repo.name);
    if (!prev) return fromLiveRepo(repo, owner);
    return {
      ...prev,
      updatedAt: repo.pushed_at ?? prev.updatedAt,
      stars: repo.stargazers_count ?? prev.stars,
      paused: isPaused(`${repo.name} ${repo.description ?? ""}`, Boolean(repo.archived)),
      topics: repo.topics?.length ? repo.topics : prev.topics,
      install: installFor({ provider: "github", owner, repo: repo.name })
    };
  });
}

/** 只替换这个 GitHub 作者的那部分，Gitee 等其他来源原样保留。 */
export function applyLive(owner: string, repos: LiveRepo[], previous: Plugin[]): Plugin[] {
  const isSameOwner = (plugin: Plugin) => plugin.provider === "github" && plugin.owner === owner;
  return [
    ...previous.filter((plugin) => !isSameOwner(plugin)),
    ...mergeLive(repos, owner, previous.filter(isSameOwner))
  ];
}
