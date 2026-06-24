"use client";

// ============================================================================
// 지문 세트 — 전용 섹션 (생성결과·문제관리 공용)
// ============================================================================
// 세트 멤버는 inSet=true 라 일반 목록에는 안 뜬다. 이 섹션이 그 세트들을
// 한 장의 카드(QuestionSetCard: 공유 지문 1회 + 멤버 문항 전부 + 정답·해설)로
// 묶어 보여준다 — 일반 문항과 완전히 분리된 별도 렌더 경로. 확대(상세)는 같은
// 카드를 모달로 크게 띄워 멤버 전부를 한눈에 보여준다.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";

import {
  approveQuestionSet,
  deleteQuestionSet,
  listQuestionSets,
  splitQuestionSetMember,
  type QuestionSetForRender,
} from "@/actions/question-sets";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import { QuestionSetCard } from "./question-set-card";

export function QuestionSetSection({
  refreshKey,
  onCountChange,
  gridClassName,
}: {
  /** 값이 바뀌면 세트를 다시 불러온다(생성 완료 신호 등). */
  refreshKey?: unknown;
  /** 보이는 세트 수를 부모에 알림 — 부모의 빈-상태 판정에 사용. useState setter 권장. */
  onCountChange?: (count: number) => void;
  /** 세트 카드를 일반 목록과 같은 열 그리드로 배치(1/2/3열 토글 연동). 미지정 시 1열 스택. */
  gridClassName?: string;
}) {
  const [sets, setSets] = useState<QuestionSetForRender[]>([]);
  const [splitIds, setSplitIds] = useState<Set<string>>(() => new Set());
  const [detailSet, setDetailSet] = useState<QuestionSetForRender | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listQuestionSets({ limit: 50 });
      setSets(data);
      // 서버에 반영된 상태 → 낙관적 분리 표시 초기화. 카운트는 여기서 부모에 보고
      // (effect 내 동기 setState 회피).
      setSplitIds(new Set());
      onCountChange?.(data.length);
    } catch {
      setSets([]);
      onCountChange?.(0);
    }
  }, [onCountChange]);

  useEffect(() => {
    // 마운트/refreshKey 변경 시 데이터 페치 — set-state-in-effect 는 의도된 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refreshKey, refresh]);

  const handleSplit = useCallback(
    async (questionId: string) => {
      // 낙관적으로 즉시 그룹에서 제외 → 일반 목록에 합류(서버 분리는 백그라운드).
      setSplitIds((prev) => new Set(prev).add(questionId));
      const res = await splitQuestionSetMember(questionId);
      if (res.success) {
        await refresh();
      } else {
        setSplitIds((prev) => {
          const next = new Set(prev);
          next.delete(questionId);
          return next;
        });
      }
    },
    [refresh],
  );

  const handleApprove = useCallback(
    async (setId: string) => {
      await approveQuestionSet(setId);
      await refresh();
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (setId: string) => {
      await deleteQuestionSet(setId);
      setDetailSet((cur) => (cur?.id === setId ? null : cur));
      await refresh();
    },
    [refresh],
  );

  // 낙관적으로 분리한 멤버를 빼고, 멤버가 0이면 세트도 숨긴다.
  const visible = useMemo(
    () =>
      sets
        .map((s) => ({
          ...s,
          members: s.members.filter((m) => !splitIds.has(m.questionId)),
        }))
        .filter((s) => s.members.length > 0),
    [sets, splitIds],
  );

  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-0.5">
        <Layers className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-[12px] font-bold text-slate-600">지문 세트</span>
        <span className="text-[11px] font-medium text-slate-400">
          카드 하나가 세트 전체 — 분리하면 일반 문항이 됩니다.
        </span>
      </div>

      <div className={gridClassName ?? "space-y-3"}>
        {visible.map((set) => (
          <QuestionSetCard
            key={set.id}
            set={set}
            compact
            onSplitMember={handleSplit}
            onExpand={() => setDetailSet(set)}
            onApprove={() => handleApprove(set.id)}
            onDelete={() => handleDelete(set.id)}
          />
        ))}
      </div>

      <Dialog
        open={!!detailSet}
        onOpenChange={(o) => {
          if (!o) setDetailSet(null);
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto p-0">
          {detailSet && (
            <QuestionSetCard
              set={detailSet}
              onSplitMember={handleSplit}
              onApprove={() => handleApprove(detailSet.id)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
