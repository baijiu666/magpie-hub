import { memo, useState } from "react";
import { motion } from "motion/react";
import { AppWindow, Check, Copy, ExternalLink, Loader2, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Plugin } from "@/lib/data";
import { installTarget } from "../../shared/filters.mjs";
import { copyWithToast } from "@/lib/clipboard";
import { installOrCopy } from "@/lib/install";
import { formatDate, initialOf } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PluginCardProps {
  plugin: Plugin;
  starred: boolean;
  onToggleStar: (plugin: Plugin) => void;
  starBusy?: boolean;
  canOpenInMagpie: boolean;
  isMobile: boolean;
  index: number;
}

function PluginLogo({ plugin }: { plugin: Plugin }) {
  const [failed, setFailed] = useState(false);

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
      className="grid size-10 shrink-0 place-items-center rounded-[10px] border bg-code text-[13px] font-semibold text-ink-2"
    >
      {initialOf(plugin.displayName)}
    </span>
  );
}

function PluginCardBase({
  plugin,
  starred,
  onToggleStar,
  starBusy,
  canOpenInMagpie,
  isMobile,
  index
}: PluginCardProps) {
  const repoUrl = plugin.repoUrl;
  const providers = plugin.providers ?? [];
  const target = installTarget(plugin);
  const onNpm = Boolean(plugin.npmVersion);
  const [copied, setCopied] = useState(false);
  const repoPath = `${plugin.host}/${plugin.owner}/${plugin.repo}`;

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
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.995 }}
      className="h-full"
    >
      <Card
        data-plugin={plugin.repo}
        data-provider={plugin.provider}
        className={cn(
          "group flex min-w-0 flex-col transition-colors duration-200 hover:border-ink/20 hover:shadow-card",
          plugin.paused && "opacity-75"
        )}
      >
        <CardHeader className="gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
          <div className="flex items-start gap-3">
            <PluginLogo plugin={plugin} />

            <div className="min-w-0 flex-1 space-y-1">
              <CardTitle className="truncate text-[0.95rem] leading-snug">
                <a href={repoUrl} target="_blank" rel="noreferrer" className="transition-colors hover:text-ink-2">
                  {plugin.displayName || plugin.repo}
                </a>
              </CardTitle>
              <p className="truncate font-mono text-[0.7rem] text-ink-3" title={repoPath}>
                {repoPath}
              </p>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-pressed={starred}
                  aria-label={starred ? "取消 star" : "star 到 GitHub"}
                  disabled={starBusy}
                  onClick={() => onToggleStar(plugin)}
                >
                  {starBusy ? (
                    <Loader2 className="size-[15px] animate-spin text-ink-3" />
                  ) : (
                    <motion.span
                      key={starred ? "on" : "off"}
                      initial={{ scale: 0.55, rotate: -14 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 520, damping: 20 }}
                      className="inline-flex"
                    >
                      <Star className={cn("size-[15px]", starred ? "fill-ink text-ink" : "text-ink-3")} />
                    </motion.span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{starred ? "已 star，点击取消" : "star 到 GitHub"}</TooltipContent>
            </Tooltip>
          </div>

          <CardDescription className="line-clamp-3 min-h-[3.9rem] text-[0.8rem] leading-relaxed">
            {plugin.summary || plugin.description || "作者还没写简介。"}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-wrap gap-1.5 px-4 pb-4 sm:px-5">
          {plugin.paused && (
            <Badge variant="outline" className="text-ink-3">
              已停维护
            </Badge>
          )}
          {plugin.version && (
            <Badge variant="secondary" className="font-mono">
              v{plugin.version}
            </Badge>
          )}
          {providers.slice(0, 2).map((p) => (
            <Badge key={p} variant="outline" title={providers.join(" · ")} className="font-mono text-ink-3">
              {p}
            </Badge>
          ))}
        </CardContent>

        <CardFooter className="mt-auto flex-col items-stretch gap-2.5 px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
          <code className="block rounded-lg border bg-code px-2.5 py-2 font-mono text-[12px] leading-snug">
            <span className="block text-[11px] text-ink-3">$ magpie plugin add</span>
            <span className="block truncate text-ink-2">{target}</span>
          </code>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[0.7rem] text-ink-3">
              更新于 {formatDate(plugin.updatedAt)}
              {plugin.stars > 0 ? ` · ★ ${plugin.stars}` : ""}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="secondary" size="sm" className="h-7 gap-1 px-2 text-[12px]" onClick={copyInstall}>
                <motion.span
                  key={copied ? "yes" : "no"}
                  initial={{ scale: 0.7, opacity: 0.6 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="inline-flex"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </motion.span>
                {copied ? "已复制" : "复制"}
              </Button>
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
                <AppWindow className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7" asChild>
                <a href={repoUrl} target="_blank" rel="noreferrer" aria-label="打开仓库">
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