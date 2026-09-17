"use client";

// ============================================================================
// ActivityTimeline — 회원 상세의 활동 타임라인 섹션.
// 도메인 테이블 유니온(getMemberActivity) 기반이라 과거 이력까지 전부 보인다.
// (getMemberActivity 는 회원이 속한 학원 단위로 조회 — 옛 학원 상세 타임라인과 같은 범위)
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
import { SectionCard } from "@/components/admin/kit";
import { getMemberActivity } from "@/actions/admin-activity";
import {
  ACTIVITY_CATEGORY_OPTIONS,
  type ActivityFilter,
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
  const [category, setCategory] = useState<ActivityFilter>("all");
  const [isPending, startTransition] = useTransition();

  function applyCategory(next: ActivityFilter) {
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
    <SectionCard
      title="활동 타임라인"
      icon={ListTree}
      description={`${items.length}건${nextBefore ? "+" : ""}`}
      padded={false}
      actions={
        <>
          <label className="inline-flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-gray-400">분류</span>
            <Select
              value={category}
              onValueChange={(v) => {
                const next = v as ActivityFilter;
                setCategory(next);
                applyCategory(next);
              }}
            >
              <SelectTrigger className="h-8 min-w-[120px] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-[12px]">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-gray-500"
            onClick={() => applyCategory(category)}
            disabled={isPending}
            aria-label="타임라인 새로고침"
          >
            <RefreshCw
              className={cn("size-3.5", isPending && "animate-spin")}
              strokeWidth={2}
              aria-hidden
            />
            새로고침
          </Button>
        </>
      }
    >
      <div className={cn(isPending && "opacity-60")}>
        <ActivityList
          items={items}
          emptyMessage={
            category !== "all"
              ? "조건에 맞는 활동이 없습니다"
              : "아직 활동 내역이 없습니다"
          }
        />
      </div>

      {(nextBefore || isPending) && items.length > 0 && (
        <div className="flex items-center justify-center border-t border-gray-50 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={loadMore}
            disabled={isPending || !nextBefore}
            className="text-gray-600"
          >
            {isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />
                불러오는 중
              </>
            ) : (
              "더 보기"
            )}
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
