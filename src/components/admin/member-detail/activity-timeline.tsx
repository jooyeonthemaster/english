"use client";

// ============================================================================
// ActivityTimeline — 회원 상세의 활동 타임라인 섹션.
// 도메인 테이블 유니온(getMemberActivity) 기반이라 과거 이력까지 전부 보인다.
// 거래 이력 테이블과 동일한 패턴: 필터 변경 시 리셋, "더 보기" 커서 페이지네이션.
// ============================================================================

import { useState, useTransition } from "react";
import { Loader2, ListTree, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMemberActivity } from "@/actions/admin-activity";
import {
  ACTIVITY_CATEGORY_OPTIONS,
  type ActivityCategory,
  type ActivityItem,
} from "@/lib/admin-activity-types";
import { ActivityList } from "@/components/admin/activity/activity-list";

interface ActivityTimelineProps {
  memberId: string;
  initial: { items: ActivityItem[]; nextBefore: string | null };
}

export function ActivityTimeline({ memberId, initial }: ActivityTimelineProps) {
  const [items, setItems] = useState<ActivityItem[]>(initial.items);
  const [nextBefore, setNextBefore] = useState<string | null>(
    initial.nextBefore,
  );
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const [isPending, startTransition] = useTransition();

  function applyCategory(next: ActivityCategory | "all") {
    setNextBefore(null);
    startTransition(async () => {
      const res = await getMemberActivity(memberId, {
        category: next,
        limit: 40,
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
      const res = await getMemberActivity(memberId, {
        category,
        before: nextBefore,
        limit: 40,
      });
      if (res.kind === "ok") {
        // 유니온 커서는 createdAt 기반 — 동률 시각 재조회로 인한 중복만 걸러낸다
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
        });
        setNextBefore(res.nextBefore);
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <ListTree
            className="size-4 text-gray-400"
            strokeWidth={1.8}
            aria-hidden
          />
          <h3 className="text-[14px] font-semibold text-gray-800">
            활동 타임라인
          </h3>
          <span className="text-[11px] text-gray-400 tabular-nums">
            · {items.length}건{nextBefore ? "+" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400 font-medium">분류</span>
            <Select
              value={category}
              onValueChange={(v) => {
                const next = v as ActivityCategory | "all";
                setCategory(next);
                applyCategory(next);
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
            onClick={() => applyCategory(category)}
            disabled={isPending}
            aria-label="타임라인 새로고침"
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
        emptyMessage={
          category !== "all"
            ? "조건에 맞는 활동이 없습니다"
            : "아직 활동 내역이 없습니다"
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
