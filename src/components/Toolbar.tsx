import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AuthorAvatar } from "@/components/AuthorAvatar";
import type { Provider } from "@/lib/data";
import { ownerKey } from "@/lib/keys";
import { cn } from "@/lib/utils";

export type Filter = "all" | "active" | "starred" | "paused";
export type Sort = "updated" | "name" | "oldest";

export interface AuthorOption {
  provider: Provider;
  owner: string;
  avatar: string | null;
}

interface ToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  filter: Filter;
  onFilterChange: (value: Filter) => void;
  sort: Sort;
  onSortChange: (value: Sort) => void;
  counts: Record<Filter, number>;
  authors: AuthorOption[];
  ownerFilter: string | null;
  onOwnerFilterChange: (key: string | null) => void;
}

export const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "active", label: "可用" },
  { value: "starred", label: "收藏" },
  { value: "paused", label: "已停维护" }
];

const keyOf = (author: AuthorOption) => ownerKey(author.provider, author.owner);

const chipClass = (active: boolean, extra = "") =>
  cn(
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border text-xs transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97]",
    extra,
    active
      ? "border-primary/40 bg-primary/10 text-foreground"
      : "bg-card text-muted-foreground hover:text-foreground"
  );

export function Toolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  counts,
  authors,
  ownerFilter,
  onOwnerFilterChange
}: ToolbarProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索插件、仓库、provider…"
            aria-label="搜索插件"
            className="h-10 bg-card pl-9"
          />
        </div>
        <Select value={sort} onValueChange={(value) => onSortChange(value as Sort)}>
          <SelectTrigger className="h-10 w-[116px] shrink-0 bg-card sm:w-[132px]" aria-label="排序">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="updated">最近更新</SelectItem>
            <SelectItem value="name">名称 A→Z</SelectItem>
            <SelectItem value="oldest">最早更新</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {FILTERS.map((item) => {
          const active = filter === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onFilterChange(item.value)}
              aria-pressed={active}
              className={chipClass(active, "px-3 py-2")}
            >
              {item.label}
              <span className="tabular-nums opacity-60">{counts[item.value]}</span>
            </button>
          );
        })}
      </div>

      {authors.length > 1 && (
        <div className="scrollbar-none -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
          <button
            type="button"
            onClick={() => onOwnerFilterChange(null)}
            aria-pressed={ownerFilter === null}
            className={chipClass(ownerFilter === null, "px-3 py-2")}
          >
            全部作者
          </button>
          {authors.map((author) => {
            const key = keyOf(author);
            const active = ownerFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onOwnerFilterChange(active ? null : key)}
                aria-pressed={active}
                className={chipClass(active, "py-1.5 pl-1.5 pr-3")}
              >
                <AuthorAvatar src={author.avatar} name={author.owner} className="size-5 rounded-full" />
                {author.owner}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
