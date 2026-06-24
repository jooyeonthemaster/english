"use client";

// ============================================================================
// 지문 세트 — 전용 섹션 (생성결과·문제관리 공용)
// ============================================================================
// 세트 멤버는 inSet=true 라 일반 목록에는 안 뜬다. 이 섹션이 그 세트들을
// 한 장의 카드(QuestionSetCard)로 묶어 보여주고, 수정/상세는 일반 문제 상세
// 모달과 동일한 SetDetailDialog(멤버 토글 + QuestionBankCard embedded + 일반
// 편집 EditQuestionDialog)로 처리한다. 멤버 분리는 그 문항만 단독으로 빼낸다.
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { WorkbenchLoadingCard } from "@/components/workbench/workbench-loading-card";

import {
  approveQuestionSet,
  deleteQuestionSet,
  listQuestionSets,
  splitQuestionSetMember,
  type QuestionSetForRender,
} from "@/actions/question-sets";
import {
  approveWorkbenchQuestion,
  unapproveWorkbenchQuestion,
} from "@/actions/workbench";
import { useQuestionEditor } from "@/components/workbench/question-bank-client/use-question-editor";
import { EditQuestionDialog } from "@/components/workbench/question-bank-client/edit-question-dialog";
import { SetDetailDialog } from "@/components/workbench/question-bank-client/set-detail-dialog";

import { QuestionSetCard } from "./question-set-card";

export function QuestionSetSection({
  refreshKey,
  onCountChange,
  onMemberSplit,
  gridClassName,
  inline = false,
  normalItems,
  showSets = true,
}: {
  /** 값이 바뀌면 세트를 다시 불러온다(생성 완료 신호 등). */
  refreshKey?: unknown;
  /** 보이는 세트 수를 부모에 알림 — 부모의 빈-상태 판정에 사용. useState setter 권장. */
  onCountChange?: (count: number) => void;
  /**
   * 멤버 분리/수정/삭제로 일반 문항이 바뀌면 호출 — 부모가 일반 목록을 다시 읽게 한다.
   * 분리 시에는 새로 생긴 단독 문항 id 를 넘겨, 부모가 글로우/스크롤로 강조하게 한다.
   */
  onMemberSplit?: (newQuestionId?: string) => void;
  /** 세트 카드를 일반 목록과 같은 열 그리드로 배치(1/2/3열 토글 연동). 미지정 시 1열 스택. */
  gridClassName?: string;
  /**
   * 인라인 모드 — 헤더/그리드 래퍼 없이 세트 카드(각 self-start) + 모달을 프래그먼트로
   * 렌더한다. normalItems 가 있으면 그 일반 카드들과 createdAt 기준으로 섞어 정렬한다.
   */
  inline?: boolean;
  /** 인라인 모드에서 세트 카드와 createdAt 기준으로 섞을 일반 카드들(미리 렌더된 node). */
  normalItems?: ReadonlyArray<{
    id: string;
    createdAt: Date | string;
    node: ReactNode;
  }>;
  /** 세트 카드를 끼울지(보통 목록 1페이지에서만 true — 세트는 최신이라 1페이지에 위치). */
  showSets?: boolean;
}) {
  const [sets, setSets] = useState<QuestionSetForRender[]>([]);
  // 분리 진행 중인 멤버 questionId(스피너 표시용). 분리는 세트를 바꾸지 않고 복제본만
  // 추가하므로 세트 표시에서 멤버를 빼지 않는다.
  const [splittingIds, setSplittingIds] = useState<Set<string>>(() => new Set());
  const [detailSetId, setDetailSetId] = useState<string | null>(null);
  // 편집 중인 세트 — 편집 모달의 멤버 토글(1번/2번)을 그릴 컨텍스트. null 이면 일반 단일 편집.
  const [editingSet, setEditingSet] = useState<QuestionSetForRender | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listQuestionSets({ limit: 50 });
      setSets(data);
      // 카운트는 여기서 부모에 보고(effect 내 동기 setState 회피).
      onCountChange?.(data.length);
    } catch {
      setSets([]);
      onCountChange?.(0);
    }
  }, [onCountChange]);

  useEffect(() => {
    // 마운트/refreshKey 변경 시 데이터 페치.
    void refresh();
  }, [refreshKey, refresh]);

  // 일반 편집 다이얼로그(일반 카드와 동일) — 멤버 수정에 그대로 사용.
  const editor = useQuestionEditor(() => {
    void refresh();
    onMemberSplit?.();
  });

  const handleSplit = useCallback(
    async (questionId: string) => {
      // 분리 = 세트는 그대로 두고 그 문항의 복제본을 단독 문항으로 추가. 세트 표시는
      // 그대로, 새 단독 문항만 일반 목록에 뜬다(부모 갱신).
      setSplittingIds((prev) => new Set(prev).add(questionId));
      // "분리 중" 카드가 너무 빨리 사라지지 않도록 최소 표시 시간 보장(생성중 카드처럼 보이게).
      const minHold = new Promise<void>((r) => window.setTimeout(r, 700));
      try {
        const res = await splitQuestionSetMember(questionId);
        if (res.success) {
          await refresh();
          onMemberSplit?.(res.newQuestionId);
          toast.success("문항을 단독 문항으로 분리했습니다.");
        } else {
          toast.error(res.error || "분리에 실패했습니다.");
        }
        await minHold;
      } finally {
        setSplittingIds((prev) => {
          const next = new Set(prev);
          next.delete(questionId);
          return next;
        });
      }
    },
    [refresh, onMemberSplit],
  );

  const handleApproveSet = useCallback(
    async (setId: string) => {
      await approveQuestionSet(setId);
      await refresh();
    },
    [refresh],
  );

  const handleDeleteSet = useCallback(
    async (setId: string) => {
      await deleteQuestionSet(setId);
      setDetailSetId((cur) => (cur === setId ? null : cur));
      await refresh();
    },
    [refresh],
  );

  const handleApproveMember = useCallback(
    async (questionId: string) => {
      await approveWorkbenchQuestion(questionId);
      await refresh();
    },
    [refresh],
  );

  const handleUnapproveMember = useCallback(
    async (questionId: string) => {
      await unapproveWorkbenchQuestion(questionId);
      await refresh();
    },
    [refresh],
  );

  // 멤버 편집 — 일반 문항과 동일한 편집 모달(EditQuestionDialog)을 연다. 세트 컨텍스트를
  // 같이 잡아 편집 모달 상단에 1번/2번 토글을 띄운다.
  const handleEditMember = useCallback(
    (set: QuestionSetForRender, questionId: string) => {
      setEditingSet(set);
      void editor.openEditor(questionId);
    },
    [editor],
  );

  const closeEditor = useCallback(() => {
    editor.closeEditor();
    setEditingSet(null);
  }, [editor]);

  // 멤버가 있는 세트만 표시(분리는 멤버를 빼지 않으므로 사실상 전부).
  const visible = useMemo(
    () => sets.filter((s) => s.members.length > 0),
    [sets],
  );

  // 분리 진행 중인 멤버 — 생성중처럼 "분리 중" 로딩 카드를 그리드 앞에 띄운다.
  const splittingMembers = useMemo(() => {
    const out: { questionId: string; title: string; preview: string }[] = [];
    for (const s of sets) {
      for (const m of s.members) {
        if (splittingIds.has(m.questionId)) {
          out.push({
            questionId: m.questionId,
            title: s.passageTitle || s.setLabel || "지문 세트",
            preview: s.canonicalPassage || m.questionText || "",
          });
        }
      }
    }
    return out;
  }, [sets, splittingIds]);

  // 상세 모달이 띄울 세트 — 서버 스냅샷(sets)에서 id 로 찾아 항상 최신 멤버 반영.
  const detailSet = detailSetId
    ? (sets.find((s) => s.id === detailSetId) ?? null)
    : null;
  // 편집 컨텍스트도 최신 멤버로(분리/수정 후) — id 로 다시 찾는다.
  const liveEditingSet = editingSet
    ? (sets.find((s) => s.id === editingSet.id) ?? editingSet)
    : null;

  // 편집 모달 상단의 멤버 토글(1번/2번) — 세트 편집일 때만.
  const editToggle =
    liveEditingSet && liveEditingSet.members.length > 1 ? (
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-4 py-2">
        <span className="mr-1 text-[11px] font-semibold text-slate-400">
          세트 문항
        </span>
        {liveEditingSet.members.map((m, i) => (
          <button
            key={m.itemId}
            type="button"
            onClick={() => void editor.openEditor(m.questionId)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-semibold tabular-nums transition-colors ${
              editor.editingQuestionId === m.questionId
                ? "bg-blue-50 text-blue-700"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            }`}
          >
            {i + 1}번
          </button>
        ))}
      </div>
    ) : null;

  // 편집 다이얼로그 — 일반 문항과 동일. 세트 컨텍스트면 상단에 멤버 토글을 끼운다.
  const editDialog = (
    <EditQuestionDialog
      open={editor.editDialogOpen}
      onOpenChange={(o) => {
        if (!o) closeEditor();
      }}
      loading={editor.questionLoading}
      loadError={editor.questionLoadError}
      editingQuestion={editor.editingQuestion}
      editingQuestionId={editor.editingQuestionId}
      onClose={closeEditor}
      onDeleted={editor.handleEditorDeleted}
      onRetry={editor.openEditor}
      onSaved={() => {
        void refresh();
        onMemberSplit?.();
      }}
      onApproved={() => void refresh()}
      topBar={editToggle}
    />
  );

  if (visible.length === 0) {
    // 세트가 없어도 편집 다이얼로그는 떠 있을 수 있으므로 같이 렌더한다.
    return editDialog;
  }

  // "분리 중" 로딩 카드 — 일반 생성중 카드(WorkbenchLoadingCard)와 동일한 파란 펄스.
  const renderSplittingCard = (sm: {
    questionId: string;
    title: string;
    preview: string;
  }) => (
    <div
      key={`splitting:${sm.questionId}`}
      data-drag-select-ignore
      className="min-w-0 self-start"
    >
      <WorkbenchLoadingCard
        title={sm.title}
        contentPreview={`${sm.preview.slice(0, 200)}...`}
        statusLabel="분리 중"
        progressLabel="문항을 단독 문항으로 분리하는 중입니다..."
        statusIcon={Loader2}
        variant="analyzing"
        showCheckbox={false}
        fixedHeight
        ariaLabel="문항 분리 중"
      />
    </div>
  );

  // 세트 카드 한 장 — self-start 래퍼로 감싸 일반 카드와 동일하게 자연 높이로 흐른다.
  // (영역 선택 마키는 세트 카드에서 시작하지 않도록 무시 표식.)
  const renderSetCard = (set: QuestionSetForRender) => (
    <div key={set.id} data-drag-select-ignore className="min-w-0 self-start">
      <QuestionSetCard
        set={set}
        compact
        onSplitMember={handleSplit}
        onEdit={() => {
          const first = set.members[0];
          if (first) handleEditMember(set, first.questionId);
        }}
        onOpenDetail={() => setDetailSetId(set.id)}
        onApprove={() => handleApproveSet(set.id)}
        onDelete={() => handleDeleteSet(set.id)}
      />
    </div>
  );

  const setDialogs = (
    <>
      <SetDetailDialog
        open={!!detailSet}
        set={detailSet}
        splittingIds={splittingIds}
        onClose={() => setDetailSetId(null)}
        onDeleteSet={() => {
          if (detailSet) void handleDeleteSet(detailSet.id);
        }}
        onSplitMember={handleSplit}
        onApproveMember={handleApproveMember}
        onUnapproveMember={handleUnapproveMember}
        onEditMember={(qId) => {
          if (detailSet) handleEditMember(detailSet, qId);
        }}
      />
      {editDialog}
    </>
  );

  // 인라인 모드 — 부모의 일반 카드 그리드 안에 세트 카드만 직접 흘려보낸다(끊김 방지).
  if (inline) {
    // 세트 카드 + 일반 카드를 createdAt 최신순으로 섞는다(종류 불문 통합 정렬).
    const ts = (d: Date | string) => new Date(d).getTime();
    const setItems = showSets
      ? visible.map((s) => ({
          id: `set:${s.id}`,
          createdAt: s.createdAt as Date | string,
          node: renderSetCard(s),
        }))
      : [];
    const combined = [...setItems, ...(normalItems ?? [])].sort(
      (a, b) => ts(b.createdAt) - ts(a.createdAt),
    );
    return (
      <>
        {showSets ? splittingMembers.map(renderSplittingCard) : null}
        {combined.map((it) => it.node)}
        {setDialogs}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-0.5">
        <Layers className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-[12px] font-bold text-slate-600">지문 세트</span>
        <span className="text-[11px] font-medium text-slate-400">
          카드 하나가 세트 전체 — 분리하면 그 문항의 복제본이 단독 문항으로 추가됩니다.
        </span>
      </div>

      <div className={gridClassName ?? "space-y-3"}>
        {splittingMembers.map(renderSplittingCard)}
        {visible.map(renderSetCard)}
      </div>

      {setDialogs}
    </div>
  );
}
