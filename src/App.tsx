import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  ChevronDown,
  Download,
  Loader2,
  RefreshCw,
  SearchX,
  Settings2,
  SlidersHorizontal
} from "lucide-react";
import siteConfig from "../config.json";
import { AuthorAvatar } from "@/components/AuthorAvatar";
import { GithubMark } from "@/components/GithubMark";
import { GithubDialog } from "@/components/GithubDialog";
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
import { formatDate } from "@/lib/format";
import {
  fetchStarred,
  fetchViewer,
  mapLimit,
  readGithubToken,
  setStarred,
  writeGithubToken,
  type GithubViewer
} from "@/lib/github";
import { readJson, storageKeys, writeJson } from "@/lib/storage";
import { cn } from "@/lib/utils";

const config = siteConfig as {
  title: string;
  heading: string;
  magpieVersion?: string;
  magpieStableVersion?: string;
  sources: { provider: "github" | "gitee"; owner?: string; repo?: string }[];
  include: string[];
  exclude: string[];
  liveOnLoad: boolean;
  gateSeconds: number;
};

const defaultSources: SourceConfig[] = (config.sources ?? [])
  .filter((source) => source.owner)
  .map((source) => ({ provider: source.provider, owner: source.owner as string }));

/** 版心与参考站一致：1080px */
const wrap = "mx-auto w-full max-w-[1080px] px-4 sm:px-6";

/** 收起后的浮动条要把当前筛选状态写出来 */
const LABEL_OF = (value: Filter) => FILTERS.find((item) => item.value === value)?.label ?? "全部";

type Platform = "mac" | "windows" | "linux" | "other";

/** 下载按钮上的系统标记：按访客系统切换，图标照 usemagpie 的取法 */
function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  if (platform === "mac") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
      </svg>
    );
  }
  if (platform === "windows") {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
        <path d="M1 2.3 6.7 1.5v5.6H1V2.3Zm6.4-.9L15 .3v6.8H7.4V1.4ZM1 7.9h5.7v5.6L1 12.7V7.9Zm6.4 0H15v6.8l-7.6-1.1V7.9Z" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11" />
    </svg>
  );
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "mac";
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "other";
}

const DOWNLOAD_LABEL: Record<Platform, string> = {
  mac: "下载 Mac 版",
  windows: "下载 Windows 版",
  linux: "下载 Linux 版",
  other: "下载 magpie"
};

type Channel = "latest" | "stable";

/** 与 usemagpie.ai 下载页一致的三个平台与各自的安装包 */
const PLATFORMS: {
  key: Platform;
  name: string;
  requirement: string;
  archs: { label: string; ext: string; file: string }[];
}[] = [
  {
    key: "mac",
    name: "macOS",
    requirement: "12 及以上",
    archs: [
      { label: "Apple Silicon", ext: ".dmg", file: "magpie-darwin-arm64.dmg" },
      { label: "Intel", ext: ".dmg", file: "magpie-darwin-amd64.dmg" }
    ]
  },
  {
    key: "windows",
    name: "Windows",
    requirement: "10 及以上",
    archs: [
      { label: "x64", ext: ".exe", file: "magpie-windows-amd64.exe" },
      { label: "ARM", ext: ".exe", file: "magpie-windows-arm64.exe" }
    ]
  },
  {
    key: "linux",
    name: "Linux",
    requirement: "GTK 3 + WebKitGTK 4.1",
    archs: [
      { label: "x86-64", ext: "", file: "magpie-linux-amd64" },
      { label: "ARM64", ext: "", file: "magpie-linux-arm64" }
    ]
  }
];

export default function App() {
  const [sources, setSources] = useState<SourceConfig[]>(defaultSources);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [magpie, setMagpie] = useState<{ owner: string; avatar: string | null } | null>(null);
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [forceCollapsed] = useState(() => new URLSearchParams(location.search).get("panel") === "collapsed");

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated");
const [channel, setChannel] = useState<Channel>("latest");
  // 收藏 = GitHub 仓库的真实 star：token 只在本机，ghStars 缓存已 star 的 owner/repo
  const [ghToken, setGhToken] = useState<string>(() => readGithubToken());
  const [ghViewer, setGhViewer] = useState<GithubViewer | null>(null);
  const [ghStars, setGhStars] = useState<Set<string>>(() => new Set<string>());
  const [starBusy, setStarBusy] = useState<Set<string>>(() => new Set<string>());
  const [ghOpen, setGhOpen] = useState(false);
  const [ghError, setGhError] = useState<string | null>(null);
  const [liveOnLoad, setLiveOnLoad] = useState<boolean>(() =>
    readJson<boolean>(storageKeys.live, Boolean(config.liveOnLoad))
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadRef = useRef<HTMLDivElement | null>(null);

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

  // 顶部栏只在页面滚动后才出现下边线；滚过 200px 把搜索/筛选收成一条
  useEffect(() => {
    let lastY = 0;
    const update = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
setScrolled(y > 4);
      const delta = y - lastY;
      lastY = y;
      setScrolledDown(y > 200);
      if (y < 60) {
        setPanelExpanded(false);
      } else if (y > 200 && delta > 2) {
        // 展开过一次也没用：继续往下滑就重新收成一条
        setPanelExpanded(false);
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    // 惯性滚动不一定每次都触发 scroll，低频兜底一次
    const timer = window.setInterval(update, 500);
    return () => {
      window.removeEventListener("scroll", update);
      window.clearInterval(timer);
    };
  }, []);

const primaryOwner = sources.find((source) => source.provider === "github")?.owner ?? null;
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

const starKey = (plugin: Plugin) => `${plugin.owner}/${plugin.repo}`.toLowerCase();
  const isStarred = (plugin: Plugin) => ghStars.has(starKey(plugin));

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
    setLiveAt(new Date().toISOString());
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
      if (event.key === "/" && !typing && !document.getElementById("intro-gate")) {
        event.preventDefault();
        setPanelExpanded(true);
        window.requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>('input[aria-label="搜索插件"]')?.focus()
        );
      }
      if (event.key === "Escape" && typing) {
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
        setSnapshotAt(snapshot?.generatedAt ?? "");
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

  const visible = useMemo(
    () => plugins.filter((plugin) => !config.exclude.includes(plugin.repo) || config.include.includes(plugin.repo)),
    [plugins]
  );

  // 作者筛选作用在「可见」之上，状态与关键词再作用在这之上
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
// eslint-disable-next-line react-hooks/exhaustive-deps
    [pool, ghStars]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, query, filter, sort, ghStars]);

  // token 变了就先验一遍，验不过直接清掉，别让用户对着无效 token 点空
  useEffect(() => {
    if (!ghToken) {
      setGhViewer(null);
      setGhStars(new Set<string>());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const viewer = await fetchViewer(ghToken);
        if (!cancelled) {
          setGhViewer(viewer);
          setGhError(null);
        }
      } catch (error) {
        if (cancelled) return;
        setGhViewer(null);
        setGhError(error instanceof Error ? error.message : "token 校验失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ghToken]);

  // 当前列表里每个 GitHub 仓库拉一次 star 状态，并发 5，避免触发二级限流
  const githubRepoKeys = useMemo(
    () =>
      Array.from(new Set(pool.filter((plugin) => plugin.provider === "github").map(starKey))).join(","),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pool]
  );

  useEffect(() => {
    if (!ghToken || !githubRepoKeys) return;
    let cancelled = false;
    void (async () => {
      const entries = await mapLimit(githubRepoKeys.split(","), 5, async (key) => {
        const [owner, repo] = key.split("/");
        try {
          return [key, await fetchStarred(ghToken, owner, repo)] as const;
        } catch {
          return [key, null] as const;
        }
      });
      if (cancelled) return;
      setGhStars((previous) => {
        const next = new Set(previous);
        for (const [key, value] of entries) {
          if (value === true) next.add(key);
          else if (value === false) next.delete(key);
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ghToken, githubRepoKeys]);

  async function toggleStar(plugin: Plugin) {
    if (plugin.provider !== "github") {
      toast.error("Gitee 仓库还不支持一键 star，点右侧外链去仓库页收藏");
      return;
    }
    if (!ghToken) {
      setGhOpen(true);
      return;
    }
    const key = starKey(plugin);
    if (starBusy.has(key)) return;
    const next = !ghStars.has(key);
    setStarBusy((previous) => new Set(previous).add(key));
    setGhStars((previous) => {
      const updated = new Set(previous);
      if (next) updated.add(key);
      else updated.delete(key);
      return updated;
    });
    try {
      await setStarred(ghToken, plugin.owner, plugin.repo, next);
      toast.success(next ? `已在 GitHub star ${plugin.repo}` : `已取消 star ${plugin.repo}`);
    } catch (error) {
      setGhStars((previous) => {
        const updated = new Set(previous);
        if (next) updated.delete(key);
        else updated.add(key);
        return updated;
      });
      toast.error(error instanceof Error ? error.message : "star 失败");
    } finally {
      setStarBusy((previous) => {
        const updated = new Set(previous);
        updated.delete(key);
        return updated;
      });
    }
  }

  async function connectGithub(token: string) {
    const viewer = await fetchViewer(token);
    writeGithubToken(token);
    setGhToken(token);
    setGhViewer(viewer);
    setGhError(null);
    setGhOpen(false);
    toast.success(`已连接 @${viewer.login}，收藏会写进 GitHub`);
  }

  function disconnectGithub() {
    writeGithubToken("");
    setGhToken("");
    setGhViewer(null);
    setGhStars(new Set<string>());
    setGhError(null);
    setGhOpen(false);
    toast.message("已断开 GitHub，收藏状态不再同步");
  }

  async function handleSave(nextSources: SourceConfig[], nextLive: boolean) {
    writeJson(storageKeys.sources, nextSources);
    writeJson(storageKeys.sourcesSig, JSON.stringify(defaultSources));
    writeJson(storageKeys.live, nextLive);
    setSources(nextSources);
    setLiveOnLoad(nextLive);
    setSettingsOpen(false);
    setOwnerFilter(null);

    // 被移除的作者，卡片一起撤掉；剩下的保持原样
    setPlugins((previous) =>
      previous.filter((plugin) =>
        nextSources.some(
          (source) =>
            source.provider === plugin.provider && source.owner.toLowerCase() === plugin.owner.toLowerCase()
        )
      )
    );

    setSaving(true);
    await sync(nextSources);
    setSaving(false);
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
writeGithubToken("");
    localStorage.removeItem("theme");
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
  const sample = rows[0] ?? pool[0];

  const channels = useMemo(() => {
    const list: { id: Channel; label: string; version: string }[] = [];
    if (config.magpieVersion) list.push({ id: "latest", label: "最新版", version: config.magpieVersion });
    if (config.magpieStableVersion) list.push({ id: "stable", label: "稳定版", version: config.magpieStableVersion });
    return list;
  }, []);

  const activeVersion = channels.find((item) => item.id === channel)?.version ?? config.magpieVersion ?? "";

  const sourceStats = authorGroups.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      total: pool.filter((plugin) => plugin.provider === item.provider && plugin.owner === item.owner).length,
      latest: pool
        .filter((plugin) => plugin.provider === item.provider && plugin.owner === item.owner)
        .reduce<string | null>((latest, plugin) => {
          if (!latest) return plugin.updatedAt;
          return new Date(plugin.updatedAt) > new Date(latest) ? plugin.updatedAt : latest;
        }, null)
    }))
  );

  

  const collapsed = (forceCollapsed || scrolledDown) && !panelExpanded;
  const activeOwner = ownerFilter?.split(":")[1] ?? null;

  const platform = useMemo<Platform>(() => detectPlatform(), []);

  // 主按钮：访客系统对应的默认架构；识别不出系统时交给官网按 UA 配对
  const primaryTarget = useMemo(() => {
    const group = PLATFORMS.find((item) => item.key === platform);
    if (!group) return "https://usemagpie.ai/download";
    return `https://github.com/yetone/magpie-releases/releases/download/v${activeVersion}/${group.archs[0].file}`;
  }, [platform, activeVersion]);

  // 点空白处或按 Esc 收起下载菜单
  useEffect(() => {
    if (!downloadOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!downloadRef.current?.contains(event.target as Node)) setDownloadOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDownloadOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [downloadOpen]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh flex-col bg-background">
<header
          className={cn(
            "sticky top-0 z-40 bg-background/80 backdrop-blur-md transition-colors supports-[backdrop-filter]:bg-background/68",
            scrolled && "border-b"
          )}
        >
          <div className={cn(wrap, "flex h-[60px] items-center gap-2.5 sm:gap-3")}>
            <a
              href="./"
              onClick={(event) => {
                event.preventDefault();
                scrollToTop();
              }}
              className="flex shrink-0 items-center gap-2.5 whitespace-nowrap"
            >
              <AuthorAvatar src="owner.png" name={config.title} className="size-7 rounded-lg border" />
              <span className="text-[17px] font-[650] tracking-[-0.01em]">{config.title}</span>
            </a>

            <nav className="ml-auto hidden items-center gap-6 text-[14px] text-ink-2 md:flex">
              <a href="#plugins" className="transition-colors hover:text-ink">
                插件
              </a>
              <a href="#sources" className="transition-colors hover:text-ink">
                来源
              </a>
              <a
                href={`https://github.com/${primaryOwner}`}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-ink"
              >
                GitHub
              </a>
            </nav>

            <div className="ml-auto flex items-center gap-1 md:ml-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={ghViewer ? `GitHub @${ghViewer.login}` : "连接 GitHub"}
                    onClick={() => setGhOpen(true)}
                  >
                    {ghViewer?.avatar ? (
                      <img src={ghViewer.avatar} alt="" className="size-5 rounded-full border" />
                    ) : (
                      <GithubMark className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {ghViewer ? `@${ghViewer.login} · 收藏即 star` : "连接 GitHub，收藏即 star"}
                </TooltipContent>
              </Tooltip>
              <Button variant="ghost" size="sm" onClick={() => sync()} disabled={syncing} className="gap-1.5 px-2">
                {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                <span className="hidden text-[13px] min-[560px]:inline">同步</span>
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
              <Button size="sm" className="ml-1 h-8 gap-1.5 px-2.5" asChild>
                <a
                  href="https://usemagpie.ai/zh#get"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="下载 magpie"
                  title="下载 magpie（Windows · macOS · Linux）"
                >
                  <Download className="size-3.5" />
                  <span className="hidden min-[420px]:inline">下载</span>
                </a>
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <section className={cn(wrap, "pt-10 pb-2 text-center sm:pt-14")}>
            <img
              src={new URL("img/magpie.svg", document.baseURI).href}
              alt=""
              width={72}
              height={72}
              className="mx-auto size-[72px] dark:invert"
            />
            <h1 className="mt-6 text-[clamp(1.95rem,4.2vw,2.75rem)] font-bold leading-[1.15] tracking-[-0.02em]">
              每个 Agent，每个模型。
            </h1>
            <p className="mt-3 text-[17px] leading-relaxed text-ink-2">
              免费、开源、原生。支持 macOS、Windows 和 Linux。
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <div ref={downloadRef} className="relative">
                <div className="inline-flex overflow-hidden rounded-[10px]">
                  <Button size="lg" className="gap-2 rounded-none" asChild>
                    <a href={primaryTarget} target="_blank" rel="noreferrer">
                      <PlatformIcon platform={platform} className="size-4" />
                      {DOWNLOAD_LABEL[platform]}
                    </a>
                  </Button>
                  <Button
                    size="lg"
                    className="w-9 rounded-none border-l border-white/25 px-0 dark:border-black/20"
                    aria-label="选择其他平台或架构"
                    aria-haspopup="menu"
                    aria-expanded={downloadOpen}
                    onClick={() => setDownloadOpen((open) => !open)}
                  >
                    <ChevronDown className={cn("size-4 transition-transform", downloadOpen && "rotate-180")} />
                  </Button>
                </div>

                {downloadOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+8px)] z-50 w-[272px] rounded-[14px] border bg-card p-1.5 text-left shadow-card"
                  >
                    {PLATFORMS.map((group) => (
                      <div key={group.key}>
                        <p className="flex items-baseline justify-between gap-3 px-2.5 pb-1 pt-2 text-[11px] uppercase tracking-[0.08em] text-ink-3">
                          <span>{group.name}</span>
                          <span className="normal-case tracking-normal">{group.requirement}</span>
                        </p>
                        {group.archs.map((arch) => (
                          <a
                            key={arch.label}
                            role="menuitem"
                            href={`https://github.com/yetone/magpie-releases/releases/download/v${activeVersion}/${arch.file}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setDownloadOpen(false)}
                            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13.5px] text-ink-2 transition-colors hover:bg-secondary hover:text-ink"
                          >
                            <span>{arch.label}</span>
                            <span className="font-mono text-[11.5px] text-ink-3">{arch.ext || "bin"}</span>
                          </a>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <Button variant="outline" size="lg" className="gap-2" asChild>
                <a href="https://github.com/yetone/magpie" target="_blank" rel="noreferrer">
                  <GithubMark className="size-4" />
                  在 GitHub 上查看
                </a>
              </Button>
            </div>

            <div
              className="mt-6 inline-flex items-center gap-1 rounded-full border bg-bg-2 p-1"
              role="tablist"
              aria-label="发行通道"
            >
              {channels.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={channel === item.id}
                  onClick={() => setChannel(item.id)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
                    channel === item.id
                      ? "bg-card font-medium text-ink ring-1 ring-border"
                      : "text-ink-3 hover:text-ink-2"
                  )}
                >
                  {item.label} <span className="font-mono text-[12px]">{item.version}</span>
                </button>
              ))}
            </div>
          </section>

          <section id="plugins" className={cn(wrap, "pt-10 sm:pt-12")}>
            <p className="eyebrow mb-3">插件</p>
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <h2 className="text-[clamp(1.875rem,4vw,2.625rem)] font-[680] leading-[1.1] tracking-[-0.02em]">
                一条命令，装进 magpie。
              </h2>
              <span className="pb-1 text-[13px] text-ink-3">
                {snapshotAt ? `快照 ${formatDate(snapshotAt)}` : "实时数据"}
                {liveAt ? ` · 已同步 ${formatDate(liveAt)}` : ""}
              </span>
            </div>
            <p className="mt-4 mb-7 max-w-[36em] text-[16px] text-ink-2 sm:text-[17px]">
              卡片里的命令直接贴进终端；发布到 npm 的插件，还可以在 magpie 面板里点一下安装。
            </p>

            <div
              className="sticky top-[60px] z-30 -mx-4 bg-background/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
              data-collapsed={collapsed}
              data-scrolled={scrolledDown}
            >
              {collapsed ? (
                <motion.button
                  key="mini"
                  type="button"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  onClick={() => setPanelExpanded(true)}
                  className="flex h-10 w-full items-center gap-2 rounded-full border bg-card px-3.5 text-[12px] text-ink-3"
                >
                  <SlidersHorizontal className="size-3.5" />
<span className="truncate font-medium text-ink">
                    {LABEL_OF(filter)}
                    {activeOwner ? ` · @${activeOwner}` : ""}
                    {query.trim() ? ` · “${query.trim()}”` : ""}
                  </span>
                  <span className="tabular-nums">{rows.length} 个</span>
                  <ChevronDown className="ml-auto size-4 shrink-0" />
                </motion.button>
              ) : (
                <motion.div
                  key="full"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
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

            {loading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="rounded-[14px] border bg-card p-5">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-10 rounded-[10px]" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-2/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="mt-4 h-3 w-full" />
                    <Skeleton className="mt-2 h-3 w-5/6" />
                    <Skeleton className="mt-4 h-10 w-full rounded-lg" />
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
                    starBusy={starBusy.has(starKey(plugin))}
                    canOpenInMagpie={magpieOnline && !isMobile}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-1 flex flex-col items-center justify-center rounded-[14px] border border-dashed bg-card/40 px-6 py-14 text-center sm:py-20">
                <span className="grid size-11 place-items-center rounded-full border bg-secondary text-ink-3">
                  <SearchX className="size-[18px]" />
                </span>
                <p className="mt-4 text-[15px] font-medium">{hasFilters ? "没有匹配的插件" : "这里还没有插件"}</p>
                <p className="mt-1 max-w-sm text-[13.5px] text-ink-3">
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
              </div>
            )}
          </section>

          <section id="sources" className={cn(wrap, "pt-16 sm:pt-20")}>
            <p className="eyebrow mb-3">数据来源</p>
            <h2 className="text-[clamp(1.875rem,4vw,2.625rem)] font-[680] leading-[1.1] tracking-[-0.02em]">
              插件从这些仓库读出来。
            </h2>
            <p className="mt-4 mb-7 max-w-[36em] text-[16px] text-ink-2 sm:text-[17px]">
              列表来自 GitHub 与 Gitee 的公开接口：构建时生成一份快照，页面打开后还能按需实时刷新。加作者只需要改一行配置。
            </p>

            <div className="hairline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {sourceStats.map((item) => (
                <div key={`cell:${item.provider}:${item.owner}`} className="p-6">
                  <div className="flex items-center gap-2.5">
                    {item.avatar ? (
                      <img
                        src={new URL(item.avatar, document.baseURI).href}
                        alt=""
                        className="size-6 rounded-full border"
                      />
                    ) : (
                      <span className="grid size-6 place-items-center rounded-full border bg-secondary text-[10px] uppercase text-ink-3">
                        {item.owner.slice(0, 1)}
                      </span>
                    )}
                    <span className="text-[15px] font-semibold tracking-[-0.01em]">@{item.owner}</span>
                    <span className="ml-auto rounded-md border px-1.5 py-0.5 font-mono text-[11px] text-ink-3">
                      {item.provider}
                    </span>
                  </div>
                  <p className="mt-3.5 flex items-baseline gap-2">
                    <span className="text-[26px] font-[650] leading-none tracking-[-0.02em] tabular-nums">
                      {item.total}
                    </span>
                    <span className="text-[13px] text-ink-3">个插件</span>
                  </p>
                  <p className="mt-2 text-[13px] text-ink-3">最近更新 {formatDate(item.latest)}</p>
                  <a
                    href={
                      item.provider === "gitee" ? `https://gitee.com/${item.owner}` : `https://github.com/${item.owner}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-1 text-[13px] text-ink-2 transition-colors hover:text-ink"
                  >
                    打开主页
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </section>

          <section className={cn(wrap, "pt-24 pb-20 text-center sm:pt-28")} id="get">
            <img
              src={new URL("owner.png", document.baseURI).href}
              alt=""
              width={72}
              height={72}
              className="mx-auto size-[72px] rounded-[18px] border object-cover"
            />
            <h2 className="mx-auto mt-5 max-w-[16em] text-[clamp(1.75rem,3.6vw,2.25rem)] font-[680] leading-[1.15] tracking-[-0.02em]">
              每个插件，一条命令。
            </h2>
            <p className="mx-auto mt-3 max-w-[26em] text-[15px] text-ink-2 sm:text-[16px]">
              免费、开源、纯静态。搜索、收藏和来源都只记在你自己的浏览器里。
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={() => {
                  void navigator.clipboard?.writeText(sample?.install ?? "").then(
                    () => toast.success(sample ? "安装命令已复制" : "还没有插件可复制"),
                    () => toast.error("浏览器不给写剪贴板")
                  );
                }}
              >
                复制安装命令
              </Button>
              <Button variant="outline" size="lg" asChild>
                <a href="https://github.com/yetone/magpie" target="_blank" rel="noreferrer">
                  <GithubMark className="size-4" />
                  在 GitHub 上查看
                </a>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap justify-center gap-3">
              {[
                { label: "数据快照", value: snapshotAt ? formatDate(snapshotAt) : plugins.length ? "已加载" : "未生成", note: "npm run data" },
                {
                  label: "本机 magpie",
                  value: magpieOnline ? "已连接" : "未检测到",
                  note: isMobile ? "手机端不探测" : "127.0.0.1:3425"
                },
                {
                  label: "GitHub 收藏",
                  value: ghViewer ? `@${ghViewer.login}` : "未连接",
                  note: ghViewer ? `${ghStars.size} 个已 star` : "点右上角连接"
                }
              ].map((cell) => (
                <div
                  key={cell.label}
                  className="grid flex-[0_1_260px] grid-cols-2 items-baseline gap-x-4 gap-y-1 rounded-[12px] border bg-card px-4 py-3.5 text-left text-[13.5px]"
                >
                  <b className="text-[14px] font-semibold text-ink">{cell.label}</b>
                  <span className="justify-self-end text-[12.5px] text-ink-3">{cell.note}</span>
                  <span className="col-span-2 font-mono text-[12.5px] text-ink-2">{cell.value}</span>
                </div>
              ))}
            </div>
          </section>
        </main>

        <footer className="border-t py-6 text-[13px] text-ink-3">
          <div className={cn(wrap, "flex flex-wrap items-center justify-between gap-x-6 gap-y-4")}>
            <a
              href="https://github.com/yetone/magpie"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-ink"
            >
              <AuthorAvatar src={magpie?.avatar ?? null} name={magpie?.owner ?? "yetone"} className="size-5 rounded-full" />
              magpie <span className="text-ink-3/70">@{magpie?.owner ?? "yetone"}</span>
            </a>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {authorGroups.map((group) => (
                <div key={group.provider} className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-ink-3/70">{group.provider}</span>
                  <div className="flex items-center gap-2">
                    {group.items.map((item) => (
                      <a
                        key={`foot:${item.provider}:${item.owner}`}
                        href={item.provider === "gitee" ? `https://gitee.com/${item.owner}` : `https://github.com/${item.owner}`}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 transition-colors hover:text-ink",
                          ownerFilter === `${item.provider}:${item.owner}` && "border-ink/30 text-ink"
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
          <div className={cn(wrap, "mt-4 text-[12.5px] text-ink-3/80")}>© 2026 {config.title} · 插件版权归各自作者所有</div>
        </footer>

        <ScrollButtons />

        <GithubDialog
          open={ghOpen}
          onOpenChange={setGhOpen}
          viewer={ghViewer}
          error={ghError}
          onConnect={connectGithub}
          onDisconnect={disconnectGithub}
        />

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
