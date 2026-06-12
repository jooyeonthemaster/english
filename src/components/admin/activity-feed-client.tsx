"use client";

// ============================================================================
// ActivityFeedClient — /admin/activity 전역 활동 모니터링 피드.
// 전 학원 활동을 시간 역순 유니온으로 보여준다. 자동 폴링 없음(수동 새로고침)
// — egress 비용 원칙.
// ============================================================================

import { useState, useTransition } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getGlobalActivity } from "@/actions/admin-activity";
import {
  ACTIVITY_CATEGORY_OPTIONS,
  type ActivityCategory,
  type ActivityItem,
} from "@/lib/admin-activity-types";
import { ActivityList } from "@/components/admin/activity/activity-list";

interface ActivityFeedClientProps {
  initial: { items: ActivityItem[]; nextBefore: string | null };
}

export function ActivityFeedClient({ initial }: ActivityFeedClientProps) {
  const [items, setItems] = useState<ActivityItem[]>(initial.items);
  const [nextBefore, setNextBefore] = useState<string | null>(
    initial.nextBefore,
  );
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const [academyQuery, setAcademyQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  function reload(
    nextCategory: ActivityCategory | "all",
    nextQuery: string,
  ) {
    setNextBefore(null);
    startTransition(async () => {
      const res = await getGlobalActivity({
        category: nextCategory,
        academyQuery: nextQuery || undefined,
        limit: 50,
      });
      if (res.kind === "ok") {
        setItems(res.items);
        setNextBefore(res.nextBefore);
      } else {
        setItems([]);
        setNextBefore(null);
      }
    });
  }

  function loadMore() {
    if (!nextBefore) return;
    startTransition(async () => {
      const res = await getGlobalActivity({
        category,
        academyQuery: appliedQuery || undefined,
        before: nextBefore,
        limit: 50,
      });
      if (res.kind === "ok") {
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
        });
        setNextBefore(res.nextBefore);
      }
    });
  }

  function submitSearch() {
    setAppliedQuery(academyQuery);
    reload(category, academyQuery);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold text-gray-800">
            전체 활동 피드
          </h3>
          <span className="text-[11px] text-gray-400 tabular-nums">
            · {items.length}건{nextBefore ? "+" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch();
            }}
            className="relative"
          >
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400"
              strokeWidth={2}
              aria-hidden
            />
            <Input
              value={academyQuery}
              onChange={(e) => setAcademyQuery(e.target.value)}
              placeholder="학원명 검색"
              className="h-8 w-[180px] pl-8 text-[12px]"
              maxLength={100}
            />
          </form>

          <label className="inline-flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400 font-medium">분류</span>
            <Select
              value={category}
              onValueChange={(v) => {
                const next = v as ActivityCategory | "all";
                setCategory(next);
                reload(next, appliedQuery);
              }}
            >
              <SelectTrigger className="h-8 text-[12px] min-w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_CATEGORY_OPTIONS.map((o) => (
                  <SelectItem
                    key={o.value}
                    value={o.value}
                    className="text-[12px]"
                  >
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[12px] text-gray-500"
            onClick={() => reload(category, appliedQuery)}
            disabled={isPending}
            aria-label="피드 새로고침"
          >
            <RefreshCw
              className={cn("size-3.5 mr-1", isPending && "animate-spin")}
              strokeWidth={2}
              aria-hidden
            />
            새로고침
          </Button>
        </div>
      </div>

      <ActivityList
        items={items}
        showAcademy
        emptyMessage={
          appliedQuery || category !== "all"
            ? "조건에 맞는 활동이 없습니다"
            : "아직 기록된 활동이 없습니다"
        }
      />

      {(nextBefore || isPending) && items.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadMore}
            disabled={isPending || !nextBefore}
            className="text-[12px] text-gray-600"
          >
            {isPending ? (
              <>
                <Loader2
                  className="size-3.5 mr-1.5 animate-spin"
                  strokeWidth={2}
                  aria-hidden
                />
                불러오는 중
              </>
            ) : (
              "더 보기"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
