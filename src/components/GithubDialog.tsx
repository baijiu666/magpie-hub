import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { GithubMark } from "@/components/GithubMark";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { GithubViewer } from "@/lib/github";

const NEW_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=public_repo&description=magpie%20hub";

interface GithubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewer: GithubViewer | null;
  error: string | null;
  onConnect: (token: string) => Promise<void>;
  onDisconnect: () => void;
}

export function GithubDialog({ open, onOpenChange, viewer, error, onConnect, onDisconnect }: GithubDialogProps) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // 每次打开都重新开始，别把上次输错的 token 留在框里
  useEffect(() => {
    if (open) {
      setValue("");
      setLocalError(null);
      setPending(false);
    }
  }, [open]);

  async function submit() {
    const token = value.trim();
    if (!token || pending) return;
    setPending(true);
    setLocalError(null);
    try {
      await onConnect(token);
      setValue("");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "连接失败");
    } finally {
      setPending(false);
    }
  }

  const shown = localError ?? error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] rounded-[16px] border-border bg-card p-5 shadow-card sm:p-6">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="text-[17px] font-semibold tracking-[-0.01em]">连接 GitHub</DialogTitle>
          <DialogDescription className="text-[13.5px] leading-relaxed text-ink-3">
            卡片上的星标会直接 star 到对应仓库，和你在 GitHub 上点 star 是同一件事。
          </DialogDescription>
        </DialogHeader>

        {viewer ? (
          <div className="flex items-center gap-3 rounded-[12px] border bg-bg-2 px-3.5 py-3">
            {viewer.avatar ? (
              <img src={viewer.avatar} alt="" className="size-9 rounded-full border" />
            ) : (
              <span className="grid size-9 place-items-center rounded-full border bg-card text-ink-3">
                <GithubMark className="size-[18px]" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">@{viewer.login}</p>
              <p className="text-[12px] text-ink-3">已连接 · 收藏会写进 GitHub</p>
            </div>
            <Button variant="outline" size="sm" onClick={onDisconnect}>
              断开
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="gh-token" className="text-[12.5px] font-medium text-ink-2">
                Personal access token
              </label>
              <Input
                id="gh-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="ghp_… 或 github_pat_…"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                className="h-10 rounded-[10px] font-mono text-[13px]"
              />
            </div>
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              只需勾选{" "}
              <code className="rounded bg-code px-1 py-0.5 font-mono text-[11.5px] text-ink-2">public_repo</code>{" "}
              范围。去{" "}
              <a
                href={NEW_TOKEN_URL}
                target="_blank"
                rel="noreferrer"
                className="text-ink underline decoration-border underline-offset-2 transition-colors hover:decoration-ink-3"
              >
                生成 token
              </a>
              ，复制后粘到这里；token 只存在这台机器的浏览器里。
            </p>
            {shown && (
              <p className="rounded-[10px] border border-[#c0392b]/30 bg-[#c0392b]/5 px-3 py-2 text-[12.5px] text-[#c0392b] dark:border-[#f08b7d]/30 dark:bg-[#f08b7d]/10 dark:text-[#f08b7d]">
                {shown}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="mt-1 gap-2">
          {viewer ? (
            <Button size="sm" onClick={() => onOpenChange(false)}>
              完成
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                稍后
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => void submit()} disabled={pending || !value.trim()}>
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                连接
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}