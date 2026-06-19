"use client";

// ============================================================================
// AcademyActivityTimeline — 학원 상세 페이지의 활동/콘텐츠 타임라인.
// 학원이 만든 시험지·지문·추출(업로드 PDF/캡처)·AI 생성물을 한 곳에 모으고,
// 각 행의 '자료 보기'(Eye)에서 원문/페이지 이미지/시험지 DOCX·HWPX를 바로 보고
// 다운로드한다. 기본 필터를 "생성물"로 둬서 페이지 이동/로그인 노이즈에 묻히지
// 않게 한다. (자체 fetch — 상세 페이지 서버 컴포넌트는 손대지 않는다)
// ============================================================================

import { useCallback, useEffect, useState, useTransition } from "react";
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
import { getAcademyActivity } from "@/actions/admin-activity";
import {
  ACTIVITY_CATEGORY_OPTIONS,
  type ActivityFilter,
  type ActivityItem,
} from "@/lib/admin-activity-types";
import { ActivityList } from "@/components/admin/activity/activity-list";

const PAGE_SIZE = 40;

export function AcademyActivityTimeline({ academyId }: { academyId: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [category, setCategory] = useState<ActivityFilter>("CREATED");
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(
    (next: ActivityFilter) => {
      startTransition(async () => {
        const res = await getAcademyActivity(academyId, {
          category: next,
          limit: PAGE_SIZE,
        });
        if (res.kind === "ok") {
          setItems(res.items);
          setNextBefore(res.nextBefore);
        } else {
          setItems([]);
          setNextBefore(null);
        }
        setLoaded(true);
      });
    },
    [academyId],
  );

  // 최초 진입 시 1회 로드
  useEffect(() => {
    load(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academyId]);

  function applyCategory(next: ActivityFilter) {
    setCategory(next);
    setNextBefore(null);
    load(next);
  }

  function loadMore() {
    if (!nextBefore) return;
    startTransition(async () => {
      const res = await getAcademyActivity(academyId, {
        category,
        before: nextBefore,
        limit: PAGE_SIZE,
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

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-5 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <ListTree className="size-4 text-gray-400" strokeWidth={1.8} aria-hidden />
          <h3 className="text-[14px] font-semibold text-gray-800">
            활동 · 생성 콘텐츠
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
              onValueChange={(v) => applyCategory(v as ActivityFilter)}
            >
              <SelectTrigger className="h-8 text-[12px] min-w-[150px]">
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
            variant="ghost"
            size="sm"
            className="h-8 text-[12px] text-gray-500"
            onClick={() => load(category)}
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

      {!loaded && isPending ? (
        <div className="px-5 py-12 flex items-center justify-center text-gray-400">
          <Loader2 className="size-5 animate-spin" strokeWidth={2} aria-hidden />
        </div>
      ) : (
        <ActivityList
          items={items}
          emptyMessage={
            category === "CREATED"
              ? "아직 생성한 콘텐츠가 없습니다"
              : "조건에 맞는 활동이 없습니다"
          }
        />
      )}

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
                <Loader2 className="size-3.5 mr-1.5 animate-spin" strokeWidth={2} aria-hidden />
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
