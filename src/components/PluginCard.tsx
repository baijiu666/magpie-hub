import { memo, useState } from "react";
import { motion } from "motion/react";
import { AppWindow, Check, Copy, ExternalLink, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Plugin } from "@/lib/data";
import { installTarget } from "../../shared/filters.mjs";
import { copyWithToast } from "@/lib/clipboard";
import { installOrCopy } from "@/lib/install";
import { formatDate, hueOf, initialOf } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PluginCardProps {
  plugin: Plugin;
  starred: boolean;
  onToggleStar: (plugin: Plugin) => void;
  canOpenInMagpie: boolean;
  isMobile: boolean;
  index: number;
}

function PluginLogo({ plugin }: { plugin: Plugin }) {
  const [failed, setFailed] = useState(false);
  const hue = hueOf(plugin.repo);

  if (plugin.icon && !failed) {
    return (
      <img
        src={new URL(plugin.icon, document.baseURI).href}
        alt={`${plugin.displayName} 图标`}
        loading="lazy"
        decoding="async"
        className="size-10 shrink-0 rounded-[10px] border object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-[10px] text-sm font-semibold text-white shadow-sm"
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 68% 56%), hsl(${(hue + 46) % 360} 64% 44%))`
      }}
    >
      {initialOf(plugin.displayName)}
    </span>
  );
}

function PluginCardBase({ plugin, starred, onToggleStar, canOpenInMagpie, isMobile, index }: PluginCardProps) {
  const repoUrl = plugin.repoUrl;
  const providers = plugin.providers ?? [];
  const target = installTarget(plugin);
  const onNpm = Boolean(plugin.npmVersion);
  const [copied, setCopied] = useState(false);

  function copyInstall() {
    void copyWithToast(plugin.install, "安装命令已复制");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function openInMagpie() {
    installOrCopy(plugin, canOpenInMagpie);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.018, 0.36), ease: [0.22, 1, 0.36, 1] }}
      whileTap={{ scale: 0.995 }}
      className="h-full"
    >
    <Card
      data-plugin={plugin.repo}
      data-provider={plugin.provider}
      className={cn(
        "group flex h-full flex-col transition-colors duration-200 hover:border-primary/40 hover:shadow-md",
        plugin.paused && "opacity-80"
      )}
    >
      <CardHeader className="gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
        <div className="flex items-start gap-3">
          <PluginLogo plugin={plugin} />

          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="truncate text-[0.95rem] leading-snug">
              <a href={repoUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                {plugin.displayName || plugin.repo}
              </a>
            </CardTitle>
            <p className="truncate font-mono text-[0.7rem] text-muted-foreground">
              {plugin.host}/{plugin.owner}/{plugin.repo}
            </p>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-pressed={starred}
                aria-label={starred ? "取消收藏" : "收藏"}
                onClick={() => onToggleStar(plugin)}
              >
                <motion.span
                  key={starred ? "on" : "off"}
                  initial={{ scale: 0.55, rotate: -14 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 20 }}
                  className="inline-flex"
                >
                  <Star className={cn("size-4", starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                </motion.span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{starred ? "取消收藏" : "收藏"}</TooltipContent>
          </Tooltip>
        </div>

        <CardDescription className="line-clamp-3 min-h-[3.9rem] text-[0.8rem] leading-relaxed">
          {plugin.summary || plugin.description || "作者还没写简介。"}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-wrap gap-1.5 px-4 pb-4 sm:px-5">
        {plugin.paused && (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            已停维护
          </Badge>
        )}
        {plugin.version && (
          <Badge variant="secondary" className="font-mono text-[0.7rem]">
            v{plugin.version}
          </Badge>
        )}
        {providers.slice(0, 2).map((p) => (
          <Badge
            key={p}
            variant="outline"
            title={providers.join(" · ")}
            className="font-mono text-[0.7rem] text-muted-foreground"
          >
            {p}
          </Badge>
        ))}
      </CardContent>

      <CardFooter className="mt-auto flex-col items-stretch gap-2.5 px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
        <button
          type="button"
          onClick={copyInstall}
          title="点击复制安装命令"
          aria-label="点击复制安装命令"
          className="group/code block w-full rounded-md border border-transparent bg-muted px-2.5 py-1.5 text-left font-mono text-[0.7rem] leading-snug text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/70 active:scale-[0.995]"
        >
          <span className="block text-[0.65rem] opacity-70">magpie plugin add</span>
          <span className="flex items-center gap-1.5">
            <span className="truncate text-foreground/80">{target}</span>
            <motion.span
              key={copied ? "yes" : "no"}
              initial={{ scale: 0.6, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              className="ml-auto inline-flex shrink-0 items-center gap-1 text-[0.65rem] text-primary"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3 opacity-0 transition-opacity group-hover/code:opacity-60" />}
              {copied ? "已复制" : ""}
            </motion.span>
          </span>
        </button>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[0.7rem] text-muted-foreground/80">
            更新于 {formatDate(plugin.updatedAt)}
            {plugin.stars > 0 ? ` · ★ ${plugin.stars}` : ""}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={openInMagpie}
              aria-label={onNpm && canOpenInMagpie ? "在 magpie 中打开安装页" : "安装（复制命令）"}
              title={
                onNpm && canOpenInMagpie
                  ? "在 magpie 面板中打开，由你确认安装"
                  : isMobile
                    ? "复制安装命令"
                    : onNpm
                      ? "没检测到本机 magpie，点击复制命令"
                      : "未发布到 npm，点击复制命令"
              }
            >
              {onNpm ? <AppWindow className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="size-7" asChild>
              <a href={repoUrl} target="_blank" rel="noreferrer" aria-label="打开 GitHub 仓库">
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
    </motion.div>
  );
}

export const PluginCard = memo(PluginCardBase);
