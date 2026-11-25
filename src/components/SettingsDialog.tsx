import { useEffect, useRef, useState } from "react";
import { Database, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Provider } from "@/lib/data";
import { ownerKey } from "@/lib/keys";

export interface SourceConfig {
  provider: Provider;
  owner: string;
}

export function parseSource(value: string): SourceConfig | null {
  const raw = value.trim().replace(/^@/, "");
  if (!raw) return null;
  const github = raw.match(/github\.com\/([A-Za-z0-9-]+)/i);
  if (github) return { provider: "github", owner: github[1] };
  const gitee = raw.match(/gitee\.com\/([A-Za-z0-9_.-]+)/i);
  if (gitee) return { provider: "gitee", owner: gitee[1] };
  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(raw)) return { provider: "github", owner: raw };
  return null;
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: SourceConfig[];
  liveOnLoad: boolean;
  onSave: (sources: SourceConfig[], liveOnLoad: boolean) => Promise<void> | void;
  onReset: () => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  sources,
  liveOnLoad,
  onSave,
  onReset
}: SettingsDialogProps) {
  const [draft, setDraft] = useState<SourceConfig[]>(sources);
  const [draftLive, setDraftLive] = useState(liveOnLoad);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(sources);
      setDraftLive(liveOnLoad);
      setInput("");
    }
  }, [open, sources, liveOnLoad]);

  function addSource() {
    const parsed = parseSource(input);
    if (!parsed) {
      toast.error("没看懂，填作者名（如 MYCF711）或主页链接");
      return;
    }
    if (parsed.provider === "gitee") {
      toast.error("Gitee 作者要写进 config.json 再跑 npm run data");
      return;
    }
    if (draft.some((item) => ownerKey(item.provider, item.owner) === ownerKey(parsed.provider, parsed.owner))) {
      toast.error("这个作者已经在列表里了");
      return;
    }
    setDraft([...draft, parsed]);
    setInput("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        tabIndex={-1}
        className="max-h-[88dvh] overflow-y-auto p-4 sm:max-w-md sm:p-6"
        onOpenAutoFocus={(event) => {
          // 不聚焦输入框（手机弹键盘），但把焦点移进弹窗，读屏能读到标题
          event.preventDefault();
          window.setTimeout(() => contentRef.current?.focus(), 20);
        }}
      >
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>作者可以加多个，GitHub 的会实时读取仓库列表。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-author">作者来源</Label>
            <ul className="space-y-2">
              {draft.length === 0 && (
                <li className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">还没有作者</li>
              )}
              {draft.map((source) => (
                <li
                  key={`${source.provider}:${source.owner}`}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                >
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {source.provider === "gitee" ? "gitee" : "github"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">@{source.owner}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground"
                    aria-label={`移除 ${source.owner}`}
                    onClick={() =>
                      setDraft(
                        draft.filter(
                          (item) => ownerKey(item.provider, item.owner) !== ownerKey(source.provider, source.owner)
                        )
                      )
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>

            <div className="flex gap-2">
              <Input
                id="add-author"
                aria-label="添加作者"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSource();
                  }
                }}
                placeholder="作者名或主页链接"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
              <Button variant="secondary" className="h-11 shrink-0 sm:h-9" onClick={addSource}>
                <Plus className="size-4" />
                添加
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="settings-live">每次打开都同步</Label>
              <p className="text-xs text-muted-foreground">匿名接口 60 次/小时</p>
            </div>
            <Switch id="settings-live" checked={draftLive} onCheckedChange={setDraftLive} />
          </div>

        </div>

        <DialogFooter className="sticky bottom-0 -mx-4 -mb-4 flex-row items-center justify-between gap-2 border-t bg-card px-4 py-3 sm:-mx-6 sm:-mb-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              if (window.confirm("清除所有本地设置（作者、收藏、公告记录）并刷新？")) onReset();
            }}
          >
            <RotateCcw className="size-4" />
            清除本地数据
          </Button>
          <Button
            size="sm"
            disabled={saving || draft.length === 0}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draft, draftLive);
              } finally {
                setSaving(false);
              }
            }}
          >
            <Database className={saving ? "size-4 animate-pulse" : "size-4"} />
            {saving ? "同步中…" : "保存并同步"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
