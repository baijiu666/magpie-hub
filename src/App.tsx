import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ChevronDown, Loader2, Package, RefreshCw, SearchX, Settings2, SlidersHorizontal } from "lucide-react";
import siteConfig from "../config.json";
import { AuthorAvatar } from "@/components/AuthorAvatar";
import { IntroGate } from "@/components/IntroGate";
import { PluginCard } from "@/components/PluginCard";
import { ScrollButtons } from "@/components/ScrollButtons";
import { SettingsDialog, type SourceConfig } from "@/components/SettingsDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FILTERS, Toolbar, type Filter, type Sort } from "@/components/Toolbar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { applyLive, fetchLive, loadSnapshot, type Author, type Plugin } from "@/lib/data";
import { readJson, readStringArray, storageKeys, writeJson } from "@/lib/storage";
import { cn } from "@/lib/utils";

const config = siteConfig as {
  title: string;
  sources: { provider: "github" | "gitee"; owner?: string; repo?: string }[];
  include: string[];
  exclude: string[];
  repoUrl?: string;
  liveOnLoad: boolean;
  gateSeconds: number;
};

const defaultSources: SourceConfig[] = (config.sources ?? [])
  .filter((source) => source.owner)
  .map((source) => ({ provider: source.provider, owner: source.owner as string }));

const LABEL_OF = (value: Filter) => FILTERS.find((item) => item.value === value)?.label ?? "全部";

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.55v-2.1c-3.2.69-3.88-1.35-3.88-1.35-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

export default function App() {
  const [sources, setSources] = useState<SourceConfig[]>(defaultSources);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [magpie, setMagpie] = useState<{ owner: string; avatar: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [stars, setStars] = useState<string[]>(() => readStringArray(storageKeys.stars));
  const [liveOnLoad, setLiveOnLoad] = useState<boolean>(() =>
    readJson<boolean>(storageKeys.live, Boolean(config.liveOnLoad))
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [forceCollapsed] = useState(() => new URLSearchParams(location.search).get("panel") === "collapsed");
  const expandedAt = useRef(0);

  // 手机 / 平板：没有本机 magpie，一键安装只能退回复制命令
  const isMobile = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const forced = new URLSearchParams(location.search).get("mobile");
    if (forced === "1") return true;
    if (forced === "0") return false;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
  }, []);

  // 探测本机 magpie 网关（默认 3425）；no-cors 只看能不能连通，不看内容
  const [magpieOnline, setMagpieOnline] = useState(false);
  useEffect(() => {
    if (isMobile) return;
    let timer = 0;
    const probe = () => {
      const controller = new AbortController();
      timer = window.setTimeout(() => controller.abort(), 1500);
      fetch("http://127.0.0.1:3425/", { mode: "no-cors", signal: controller.signal })
        .then(() => setMagpieOnline(true))
        .catch(() => setMagpieOnline(false))
        .finally(() => window.clearTimeout(timer));
    };
    probe();
    // magpie 可能稍后才启动，隔一会儿重探一次
    const interval = window.setInterval(probe, 20000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
    };
  }, [isMobile]);

  // 滚动到一定距离后把搜索/筛选收成一条
  useEffect(() => {
    let lastY = 0;
    const update = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const delta = y - lastY;
      lastY = y;
      setScrolledDown(y > 200);
      if (y < 60) {
        if (!forceCollapsed) setPanelExpanded(false);
      } else if (y > 200 && delta > 6 && Date.now() - expandedAt.current > 800) {
        // 展开后 800ms 内不动它，避免刚展开就被自己的滚动事件收起（抽搐）
        setPanelExpanded(false);
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    const timer = window.setInterval(update, 500);
    return () => {
      window.removeEventListener("scroll", update);
      window.clearInterval(timer);
    };
  }, []);

  const siteRepo = config.repoUrl ?? "https://github.com/baijiu666/magpie-hub";
  const siteRepoOwner = siteRepo.split("/").filter(Boolean).slice(-2, -1)[0] ?? "repo";
  const avatarMap = useMemo(
    () => new Map(authors.map((author) => [`${author.provider}:${author.owner.toLowerCase()}`, author.avatar])),
    [authors]
  );
  const avatarOf = (provider: string, owner: string) =>
    avatarMap.get(`${provider}:${owner.toLowerCase()}`) ?? null;
  const authorGroups = useMemo(
    () =>
      (["github", "gitee"] as const)
        .map((provider) => ({
          provider,
          items: sources
            .filter((source) => source.provider === provider)
            .map((source) => ({ ...source, avatar: avatarOf(source.provider, source.owner) }))
        }))
        .filter((group) => group.items.length > 0),
    [sources, avatarMap]
  );
  const authorOptions = useMemo(
    () => sources.map((source) => ({ ...source, avatar: avatarOf(source.provider, source.owner) })),
    [sources, avatarMap]
  );

  const starSet = useMemo(() => new Set(stars), [stars]);
  const isStarred = (plugin: Plugin) =>
    starSet.has(`${plugin.provider}:${plugin.owner.toLowerCase()}/${plugin.repo}`);

  async function sync(list: SourceConfig[] = sources, silent = false) {
    const githubSources = list.filter((source) => source.provider === "github" && source.owner);
    if (!githubSources.length) {
      if (!silent) toast.error("至少要留一个 GitHub 作者才能同步");
      return false;
    }
    setSyncing(true);
    const results = await Promise.allSettled(githubSources.map((source) => fetchLive(source.owner)));
    const fulfilled = results.flatMap((result, index) =>
      result.status === "fulfilled" ? [{ owner: githubSources[index].owner, repos: result.value }] : []
    );
    const rejected = results.find((result) => result.status === "rejected");
    const lastError =
      rejected && rejected.status === "rejected"
        ? rejected.reason instanceof Error
          ? rejected.reason.message
          : "同步失败"
        : "";

    setPlugins((previous) => fulfilled.reduce((acc, item) => applyLive(item.owner, item.repos, acc), previous));
    setSyncing(false);
    const done = fulfilled.length;

    if (!silent) {
      if (done === 0) toast.error(lastError || "同步失败");
      else if (done < githubSources.length) toast.warning(`同步了 ${done} 位作者，${lastError}`);
      else {
        const giteeCount = list.filter((source) => source.provider === "gitee" && source.owner).length;
        toast.success(
          giteeCount
            ? `已同步 ${done} 位 GitHub 作者（Gitee ${giteeCount} 位由定时任务更新）`
            : `已同步 ${done} 位作者的仓库列表`
        );
      }
    }
    return done > 0;
  }

  // 键盘：/ 聚焦搜索，Esc 清空搜索
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA)$/.test(target.tagName);
      const dialogOpen = Boolean(document.querySelector('[role="dialog"]'));
      if (event.key === "/" && !typing && !dialogOpen) {
        event.preventDefault();
        setPanelExpanded(true);
        window.requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>('input[aria-label="搜索插件"]')?.focus()
        );
      }
      if (event.key === "Escape" && typing && !dialogOpen) {
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    (async () => {
      const signature = JSON.stringify(defaultSources);
      const stored = readJson<SourceConfig[]>(storageKeys.sources, []);
      const storedSignature = readJson<string>(storageKeys.sourcesSig, "");
      const useStored = Array.isArray(stored) && stored.length > 0 && storedSignature === signature;
      let next = (useStored ? stored : defaultSources).filter((source) => source?.provider && source?.owner);

      const fromUrl = new URLSearchParams(location.search).get("owner");
      if (fromUrl) {
        const owner = fromUrl.replace(/^@/, "").trim();
        if (owner && !next.some((source) => source.owner === owner)) {
          next = [{ provider: "github", owner }, ...next];
        }
      }
      setSources(next);

      const snapshot = await loadSnapshot();
      const allowed = new Set(next.map((source) => `${source.provider}:${source.owner.toLowerCase()}`));
      const kept = (snapshot?.plugins ?? []).filter((plugin) =>
        allowed.has(`${plugin.provider}:${plugin.owner.toLowerCase()}`)
      );
      if (kept.length) {
        setPlugins(kept);
        setAuthors(snapshot?.authors ?? []);
        setMagpie(snapshot?.magpie ?? null);
      }
      setLoading(false);

      // 快照里没有的作者（刚在设置里加的）或开了自动同步，都需要拉一次
      const missingOwner = next.some(
        (source) =>
          source.provider === "github" &&
          !kept.some((plugin) => plugin.owner.toLowerCase() === source.owner.toLowerCase())
      );
      if (
        !kept.length ||
        missingOwner ||
        readJson<boolean>(storageKeys.live, Boolean(config.liveOnLoad))
      ) {
        const ok = await sync(next, true);
        if (!ok && !kept.length) toast.error("读取插件列表失败，点右上角「同步」重试");
      }
    })();
  }, []);

  const isVisible = (plugin: Plugin) =>
    !config.exclude.includes(plugin.repo) || config.include.includes(plugin.repo);

  const visible = useMemo(() => plugins.filter(isVisible), [plugins]);
  const pool = useMemo(
    () =>
      ownerFilter
        ? visible.filter(
            (plugin) => `${plugin.provider}:${plugin.owner.toLowerCase()}` === ownerFilter.toLowerCase()
          )
        : visible,
    [visible, ownerFilter]
  );

  useEffect(() => {
    document.title = `${config.title} · ${visible.length} 个插件`;
  }, [visible.length]);

  const counts = useMemo<Record<Filter, number>>(
    () => ({
      all: pool.length,
      active: pool.filter((plugin) => !plugin.paused).length,
      starred: pool.filter((plugin) => isStarred(plugin)).length,
      paused: pool.filter((plugin) => plugin.paused).length
    }),
    [pool, starSet]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = pool.filter((plugin) => {
      if (filter === "active" && plugin.paused) return false;
      if (filter === "paused" && !plugin.paused) return false;
      if (filter === "starred" && !isStarred(plugin)) return false;
      if (!q) return true;
      const haystack = [
        plugin.repo,
        plugin.owner,
        plugin.host,
        plugin.displayName,
        plugin.summary,
        plugin.description,
        ...(plugin.providers ?? []),
        ...(plugin.topics ?? [])
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    // 收藏只改图标，不参与排序，避免点一下整页卡片跳位
    const decorated = filtered.map((plugin) => ({
      plugin,
      time: new Date(plugin.updatedAt).getTime() || 0
    }));
    decorated.sort((a, b) => {
      if (sort === "name") {
        return (a.plugin.displayName || a.plugin.repo).localeCompare(b.plugin.displayName || b.plugin.repo, "zh-CN");
      }
      if (sort === "oldest") return a.time - b.time;
      return b.time - a.time;
    });
    return decorated.map((item) => item.plugin);
  }, [pool, query, filter, sort, starSet]);

  const toggleStar = useCallback((plugin: Plugin) => {
    const id = `${plugin.provider}:${plugin.owner.toLowerCase()}/${plugin.repo}`;
    setStars((previous) => {
      const next = previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id];
      writeJson(storageKeys.stars, next);
      return next;
    });
  }, []);

  async function handleSave(nextSources: SourceConfig[], nextLive: boolean) {
    writeJson(storageKeys.sources, nextSources);
    writeJson(storageKeys.sourcesSig, JSON.stringify(defaultSources));
    writeJson(storageKeys.live, nextLive);
    setSources(nextSources);
    setLiveOnLoad(nextLive);
    setSettingsOpen(false);

    setOwnerFilter(null);
    setPlugins((previous) =>
      previous.filter((plugin) =>
        nextSources.some(
          (source) =>
            source.provider === plugin.provider && source.owner.toLowerCase() === plugin.owner.toLowerCase()
        )
      )
    );

    await sync(nextSources);
  }

  function handleReset() {
    try {
      Object.values(storageKeys).forEach((key) => localStorage.removeItem(key));
      localStorage.removeItem("theme");
    } catch {
      /* 存储被禁用也继续 */
    }
    try {
      sessionStorage.removeItem(storageKeys.intro);
    } catch {
      /* 忽略 */
    }
    setSettingsOpen(false);
    setStars([]);
    setLiveOnLoad(Boolean(config.liveOnLoad));
    location.reload();
  }

  function scrollToTop() {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previous;
  }

  const hasFilters = filter !== "all" || query.trim().length > 0 || ownerFilter !== null;
  const sample = visible.find((plugin) => !plugin.paused) ?? visible[0];
  const collapsed = (scrolledDown || forceCollapsed) && !panelExpanded;
  const activeOwner = ownerFilter?.split(":")[1] ?? null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh flex-col bg-background">
        <header
          className={cn(
            "sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur transition-shadow duration-200 supports-[backdrop-filter]:bg-background/60",
            scrolledDown && "shadow-sm"
          )}
        >
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:h-16 sm:gap-3 sm:px-6">
            <a
              href="./"
              onClick={(event) => {
                event.preventDefault();
                scrollToTop();
              }}
              className="flex shrink-0 items-center gap-2 font-semibold tracking-tight whitespace-nowrap"
            >
              <AuthorAvatar src="owner.png" name={config.title} className="size-8 rounded-lg border" />
              <span className="text-[0.95rem] sm:text-base">{config.title}</span>
            </a>

            <div className="ml-auto flex items-center gap-1.5">
              <Button
                  variant="ghost"
                  size="sm"
                  className="hidden gap-1.5 px-2 text-muted-foreground min-[380px]:inline-flex"
                  asChild
                >
                  <a href={siteRepo} target="_blank" rel="noreferrer" aria-label="打开站点仓库">
                    <GithubMark className="size-4" />
                    <span className="hidden sm:inline">@{siteRepoOwner}</span>
                  </a>
              </Button>
              <Button variant="outline" size="sm" onClick={() => sync()} disabled={syncing} className="px-2 sm:px-3">
                {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                <span className="hidden min-[380px]:inline">同步</span>
              </Button>
              <ThemeToggle />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="设置" onClick={() => setSettingsOpen(true)}>
                    <Settings2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>设置</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 sm:px-6 sm:pb-20">
          <h1 className="sr-only">公开仓库里的 magpie 插件</h1>

          <div
            className="sticky top-14 z-30 -mx-4 bg-background/90 px-4 py-2.5 backdrop-blur sm:top-16 sm:-mx-6 sm:px-6"
            data-collapsed={collapsed}
            data-scrolled={scrolledDown}
          >
            <div className="relative">
              {collapsed && (
              <button
                type="button"
                onClick={() => {
                  expandedAt.current = Date.now();
                  setPanelExpanded(true);
                }}
                className="flex h-10 w-full items-center gap-2 rounded-full border bg-card px-3.5 text-xs text-muted-foreground shadow-sm"
              >
                <SlidersHorizontal className="size-3.5" />
                <span className="truncate text-foreground">
                  {LABEL_OF(filter)}
                  {activeOwner ? ` · @${activeOwner}` : ""}
                  {query.trim() ? ` · “${query.trim()}”` : ""}
                </span>
                <span className="tabular-nums opacity-60">{rows.length} 个</span>
                <ChevronDown className="ml-auto size-4 shrink-0" />
              </button>
              )}

              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="relative z-10 w-full min-w-0"
                >
                  <Toolbar
                    query={query}
                    onQueryChange={setQuery}
                    filter={filter}
                    onFilterChange={setFilter}
                    sort={sort}
                    onSortChange={setSort}
                    counts={counts}
                    authors={authorOptions}
                    ownerFilter={ownerFilter}
                    onOwnerFilterChange={setOwnerFilter}
                  />
                </motion.div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="rounded-xl border p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-[10px]" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="mt-4 h-3 w-full" />
                  <Skeleton className="mt-2 h-3 w-5/6" />
                  <Skeleton className="mt-4 h-8 w-full" />
                </div>
              ))}
            </div>
          ) : rows.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {rows.map((plugin, index) => (
                <PluginCard
                  key={`${plugin.provider}:${plugin.owner}/${plugin.repo}`}
                  index={index}
                  plugin={plugin}
                  starred={isStarred(plugin)}
                  onToggleStar={toggleStar}
                  canOpenInMagpie={magpieOnline && !isMobile}
                  isMobile={isMobile}
                />
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="mt-2 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center sm:py-20"
            >
              <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <SearchX className="size-5" />
              </span>
              <p className="mt-4 font-medium">{hasFilters ? "没有匹配的插件" : "这里还没有插件"}</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {hasFilters ? "换个关键词，或切回「全部」。" : "先跑 npm run data 生成快照，或点右上角「同步」。"}
              </p>
              {hasFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-5"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                    setOwnerFilter(null);
                  }}
                >
                  清除筛选
                </Button>
              )}
            </motion.div>
          )}
        </main>

        <footer className="mt-auto border-t">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-muted-foreground sm:px-6">
            <a
              className="inline-flex items-center gap-1.5 hover:text-foreground"
              href="https://github.com/yetone/magpie"
              target="_blank"
              rel="noreferrer"
            >
              <AuthorAvatar src={magpie?.avatar ?? null} name={magpie?.owner ?? "yetone"} className="size-5 rounded-full" />
              magpie <span className="opacity-60">@{magpie?.owner ?? "yetone"}</span>
            </a>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {authorGroups.map((group) => (
                <div key={group.provider} className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{group.provider}</span>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {group.items.map((item) => (
                      <a
                        key={`${item.provider}:${item.owner}`}
                        href={
                          item.provider === "gitee"
                            ? `https://gitee.com/${item.owner}`
                            : `https://github.com/${item.owner}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 transition-colors hover:text-foreground",
                          ownerFilter === `${item.provider}:${item.owner}` && "border-primary/40 text-foreground"
                        )}
                      >
                        <AuthorAvatar src={item.avatar} name={item.owner} className="size-5 rounded-full" />
                        {item.owner}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </footer>

        <ScrollButtons />

        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          sources={sources}
          liveOnLoad={liveOnLoad}
          onSave={handleSave}
          onReset={handleReset}
        />

        <IntroGate
          seconds={config.gateSeconds}
          sample={sample}
          canOpenInMagpie={magpieOnline && !isMobile}
          isMobile={isMobile}
        />
      </div>
    </TooltipProvider>
  );
}
