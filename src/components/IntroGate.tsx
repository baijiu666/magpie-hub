import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AppWindow, ArrowRight, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { copyWithToast } from "@/lib/clipboard";
import { installOrCopy } from "@/lib/install";
import type { Plugin } from "@/lib/data";
import { storageKeys } from "@/lib/storage";
import { AuthorAvatar } from "@/components/AuthorAvatar";

const SEEN_TTL = 12 * 60 * 60 * 1000; // 12 小时内不再弹
const LOGO = () => new URL("owner.png", document.baseURI).href;

function fresh(value: string | null) {
  const at = Number(value ?? 0);
  return at > 0 && Date.now() - at < SEEN_TTL;
}

function hasSeen() {
  try {
    if (fresh(sessionStorage.getItem(storageKeys.intro))) return true;
  } catch {
    /* 忽略 */
  }
  try {
    return fresh(localStorage.getItem(storageKeys.intro));
  } catch {
    return false;
  }
}

function markSeen() {
  const now = String(Date.now());
  try {
    sessionStorage.setItem(storageKeys.intro, now);
  } catch {
    /* 忽略 */
  }
  try {
    localStorage.setItem(storageKeys.intro, now);
  } catch {
    /* 忽略 */
  }
}

function buildPrompt(sample?: Plugin) {
  const name = sample?.repo ?? "<插件名>";
  const url = sample?.repoUrl ? `（${sample.repoUrl}）` : "";
  return `插件：${name}${url}

我遇到的问题：<用一句话说清楚就行，比如：登录之后模型列表是空的>

帮我看看是怎么回事。如果确认是插件本身的问题，请直接给作者提 issue 或 PR。`;
}

interface IntroGateProps {
  seconds: number;
  sample?: Plugin;
  canOpenInMagpie: boolean;
  isMobile: boolean;
}

/**
 * 开屏使用公告：倒计时结束前不提供关闭入口。
 * 被外部脚本摘掉会自动挂回去（JavaScript 客户端做不了绝对防绕过，只能做到这一步）。
 */
export function IntroGate({ seconds, sample, canOpenInMagpie, isMobile }: IntroGateProps) {
  const params = new URLSearchParams(location.search);
  const forced = params.get("gate") === "1";
  const skipped = params.get("gate") === "0";

  const [open, setOpen] = useState(() => {
    if (skipped) return false;
    if (forced) return true;
    return !hasSeen();
  });
  const [ready, setReady] = useState(seconds <= 0);
  const [left, setLeft] = useState(seconds);
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const prompt = buildPrompt(sample);
  const install = sample?.install ?? "magpie plugin add github:<作者>/<仓库>";
  const onNpm = Boolean(sample?.npmVersion);
  const hasSample = Boolean(sample);

  const enter = useCallback(() => {
    setOpen(false);
    markSeen();
  }, []);

  function installNow() {
    if (onNpm && canOpenInMagpie && sample) {
      window.location.href = `magpie://plugin?name=${encodeURIComponent(sample.npmName ?? sample.repo)}`;
      return;
    }
    void copyWithToast(install, "安装命令已复制");
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    setLeft(seconds);
    const tick = window.setInterval(() => {
      setLeft((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    const timer = window.setTimeout(() => setReady(true), Math.max(0, seconds) * 1000);

    const node = rootRef.current;
    const parent = node?.parentElement ?? null;

    // 遮罩后面的所有兄弟节点（含后面才挂载的滚动按钮）全部 inert
    const setSiblingsInert = (inert: boolean) => {
      const host = rootRef.current?.parentElement;
      if (!host) return;
      Array.from(host.children).forEach((element) => {
        if (element !== rootRef.current) (element as HTMLElement).inert = inert;
      });
    };
    setSiblingsInert(true);
    const inertTimer = window.setInterval(() => setSiblingsInert(true), 300);

    const blockKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Esc") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== "Tab") return;
      const root = rootRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])')
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", blockKeys, true);

    // 被 hook / 脚本移除后自动挂回去（监听整棵 DOM，节点被谁摘掉都能发现）
    const observer = new MutationObserver(() => {
      const current = rootRef.current;
      if (!current || document.body.contains(current)) return;
      const host = parent?.isConnected ? parent : document.body;
      host.appendChild(current);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    rootRef.current?.focus();

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(tick);
      window.clearInterval(inertTimer);
      document.removeEventListener("keydown", blockKeys, true);
      setSiblingsInert(false);
      observer.disconnect();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, seconds]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={rootRef}
          id="intro-gate"
          role="dialog"
          aria-modal="true"
          aria-labelledby="intro-gate-title"
          tabIndex={-1}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-background/85 p-3 backdrop-blur-md sm:p-6"
        >
          <div className="mx-auto flex min-h-full w-full max-w-xl items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="w-full rounded-2xl border bg-card p-4 text-card-foreground shadow-2xl sm:p-6"
            >
              <div className="flex items-center gap-2">
                <AuthorAvatar src="owner.png" name="M" className="size-6 rounded-md border" />
                <h2 id="intro-gate-title" className="text-lg font-semibold tracking-tight sm:text-xl">
                  使用公告
                </h2>
              </div>

              <div className="mt-4 space-y-4">
                <section className="space-y-2">
                  <p className="text-sm font-medium">1 · 复制指令直接安装</p>
                  <div className="flex items-start gap-2">
                    <code className="scrollbar-none min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-2.5 py-2 font-mono text-[11.5px] leading-relaxed whitespace-nowrap text-muted-foreground">
                      {install}
                    </code>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="size-8 shrink-0"
                      aria-label="复制安装命令"
                      disabled={!hasSample}
                      onClick={() => copyWithToast(install, "安装命令已复制")}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label={onNpm && canOpenInMagpie ? "在 magpie 中安装" : "安装（复制命令）"}
                      disabled={!hasSample}
                      title={onNpm && canOpenInMagpie ? "在 magpie 中打开，按 Install" : "未发布到 npm，点击复制命令"}
                      onClick={installNow}
                    >
                      {onNpm && canOpenInMagpie ? <AppWindow className="size-3.5" /> : <Copy className="size-3.5" />}
                    </Button>
                  </div>
                  {onNpm && canOpenInMagpie && (
                    <p className="text-xs text-muted-foreground">右侧按钮会在 magpie 里打开插件页，按 Install 完成。</p>
                  )}
                </section>

                <section className="space-y-2">
                  <p className="text-sm font-medium">2 · 遇到问题，直接把这段发给你的 AI</p>
                  <div className="relative">
                    <pre className="max-h-[34dvh] overflow-auto rounded-md border bg-muted/40 p-3 pr-12 font-mono text-[11.5px] leading-relaxed break-words whitespace-pre-wrap">
                      {prompt}
                    </pre>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="secondary"
                          className="absolute right-2 top-2 size-7"
                          aria-label="复制这段描述"
                          disabled={!hasSample}
                          onClick={() => copyWithToast(prompt, "问题描述已复制")}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>复制这段</TooltipContent>
                    </Tooltip>
                  </div>
                </section>
              </div>

              <div className="mt-5">
                <Button
                  className="group relative h-11 w-full overflow-hidden text-[15px]"
                  variant={ready ? "default" : "secondary"}
                  disabled={!ready || !hasSample}
                  onClick={enter}
                >
                  {!ready && (
                    <motion.span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-primary/25"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: reduceMotion ? 0 : Math.max(seconds, 0.1), ease: "linear" }}
                    />
                  )}
                  <span className="relative inline-flex items-center gap-2">
                    {!hasSample ? (
                      "正在载入插件列表…"
                    ) : ready ? (
                      <>
                        进入插件列表
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    ) : (
                      "马上就好…"
                    )}
                  </span>
                  <span className="sr-only" aria-live="polite">
                    {hasSample && !ready ? `还有 ${left} 秒` : ""}
                  </span>
                </Button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
