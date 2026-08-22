"use client";

// ============================================================================
// 지문관리 행 인라인 지문 수정기 (docs/class-studio-spec.md §3.10.18 E18-d)
//
// 행의 「지문 수정」 버튼이 펼치는 편집 표면. 워크스페이스 지문 행
// (WorkspacePassageRow)을 `embedded` 로 **그대로** 태운다 — AI 복원 · 변형 지문
// 생성 · 앞 맥락 문단 추가(1~5문장 스테퍼) · 하이라이트 백드롭 4겹 · undo/redo ·
// 고친 자리 diff · 단어 수가 전부 워크스페이스와 같은 코드다.
//
// ── 왜 편집기를 복제하지 않았나 ─────────────────────────────────────────────
// 편집기 본체는 선택 무대 · 백드롭 좌표 계산 · 삽입 바가 서로 물려 있는 1,000줄
// 짜리다. 한 벌 더 만들면 두 편집기가 서서히 갈라지고, 그때 "지문관리에서만
// 하이라이트가 밀린다" 같은 버그가 남는다(workspace-passage-row.tsx:334-341).
// 이 파일은 **상태 어댑터일 뿐**이고 화면은 한 벌만 존재한다.
// 선례 정본 = authoring-passage-editor.tsx(AI 지문 생성 결과 카드) — 그 파일과
// 이 파일의 유일한 차이는 ① 지문이 **이미 등록돼 있다**(passageId 실값 →
// ensureRegistered 불필요) ② 저장이 새 지문 생성이 아니라 **원본 갱신**이다.
//
// ── 저장 모델(사용자 확정 26-08-15): 명시적 「저장」 버튼 ──────────────────
// 자동 저장이 아니다. 저장 전에는 DB 가 바뀌지 않으므로 AI 복원·변형을 마음껏
// 실험하고 버릴 수 있다. 저장해야 이후 생성(워크북·실전)이 편집본을 쓴다 —
// **미저장 편집분은 생성에 반영되지 않는다**(§3.10.18 E18-d 계약).
//
// 회귀 방지 계약
//  · 본문의 진실은 이 컴포넌트의 state 다. 부모(그리드·라이브러리 판)는 저장
//    시점에만 통지받는다 — PassageCardGrid 는 memo 도 가상화도 없고 행마다
//    JSON.parse(analysisData) 를 돌리므로, 타이핑이 부모로 올라가면 수백 행이
//    매 키스트로크 재렌더된다(§3.10.18 E18-h).
//  · undo 스택(past/future)은 워크스페이스에서 **부모 훅**이 소유한다 — 여기서도
//    어댑터가 소유해야 접기/펴기 아닌 리렌더에 스택이 날아가지 않는다.
//  · aria/데이터 속성 방어는 호출부(그리드 확장 슬롯)가 건다 — §3.10.18 E18-g.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Save, X } from "lucide-react";
import { toast } from "sonner";

import { WorkspacePassageRow } from "@/app/(director)/director/workbench/generate/workspace/workspace-passage-row";
import {
  adjustHighlights,
  adjustRange,
  type RowHighlight,
  type RowRange,
  type RowSnapshot,
  type WorkspaceRow,
} from "@/app/(director)/director/workbench/generate/workspace/workspace-types";
import type { PassageItem } from "@/app/(director)/director/workbench/generate/generate-page-types";
import { formatExtractedTextForDisplay } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/display-text";
import {
  variantModeLabel,
  variantTag,
  type VariantDirection,
  type WholePassageTransformMode,
} from "@/lib/passage-transform/schema";

/** use-workspace-rows.ts 와 같은 값이어야 한다(되돌리기 깊이 규약). */
const HISTORY_LIMIT = 50;

export interface LibraryInlinePassageEditorProps {
  /** 편집 대상 — 지문함 목록의 원본(content 는 목록 질의에 이미 실려 있다). */
  passage: PassageItem;
  /**
   * 저장 성공 — 부모가 로컬 목록(setPassages)을 갱신한다.
   * 이 콜백 외에는 부모에게 아무것도 통지하지 않는다(타이핑 무통지 계약).
   */
  onSaved: (passageId: string, next: { content: string }) => void;
  /** 편집 접기 — 미저장 변경이 있으면 이 컴포넌트가 먼저 확인을 받는다. */
  onClose: () => void;
  /** 변형본이 새 지문으로 저장됨 — 부모가 지문 목록을 다시 읽는다. */
  onVariantSaved?: () => void;
  /**
   * 미저장 여부 업링크(적대 검수 확정 critical 수복) — 접기를 **부모가** 몰고
   * 가는 경로(아이콘 재클릭 토글·다른 행 펼침·행 더블클릭/Enter)에서는 이
   * 컴포넌트의 handleClose 확인 관문이 아예 지나가지 않는다. 부모가 이 값을
   * 들고 같은 확인을 대신 물어야 편집분이 조용히 사라지지 않는다.
   * 참조 안정 전제.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

export function LibraryInlinePassageEditor({
  passage,
  onSaved,
  onClose,
  onVariantSaved,
  onDirtyChange,
}: LibraryInlinePassageEditorProps) {
  // 시드는 makeWorkspaceRow 와 **같은 정규화**를 거친다 — 추출 지문의 OCR 하드
  // 줄바꿈을 접지 않으면 워크스페이스와 다른 본문이 보인다.
  const [content, setContent] = useState(() =>
    formatExtractedTextForDisplay(passage.content),
  );
  const [savedContent, setSavedContent] = useState(() =>
    formatExtractedTextForDisplay(passage.content),
  );
  const [range, setRangeState] = useState<RowRange | null>(null);
  const [highlights, setHighlights] = useState<RowHighlight[]>([]);
  const [past, setPast] = useState<RowSnapshot[]>([]);
  const [future, setFuture] = useState<RowSnapshot[]>([]);
  const [saving, setSaving] = useState(false);

  // 밖에서 지문이 갈리면(다른 행을 펼침 없이 목록이 교체되는 경우) 시드를 다시
  // 잡는다. ⚠ effect 가 아니라 **렌더 중 조정**이다 — 이 코드베이스는 effect
  // 본문의 setState 를 금지한다(react-hooks/set-state-in-effect).
  // authoring-passage-editor.tsx:118-131 의 관용구를 그대로 따른다.
  const [seededId, setSeededId] = useState(passage.id);
  if (passage.id !== seededId) {
    const next = formatExtractedTextForDisplay(passage.content);
    setSeededId(passage.id);
    setContent(next);
    setSavedContent(next);
    setRangeState(null);
    setHighlights([]);
    setPast([]);
    setFuture([]);
  }

  // 제목은 이 편집기가 소유하지 않는다 — 행의 연필(PassageInlineTitle →
  // renamePassage)이 정본이다. 편집기가 제목 사본을 들면 편집기를 열어 둔 채
  // 행에서 개명했을 때 저장이 그 개명을 되돌린다(스테일 덮어쓰기). 따라서
  // dirty 판정도 저장 payload 도 **본문 하나**뿐이다.
  //
  // ⚠ 공백 무시 비교(normalize)를 쓰면 안 된다(적대 검수 확정 major): 문단
  //   나누기·줄바꿈 정리처럼 **공백만 바꾼 편집**이 영원히 dirty 로 잡히지 않아
  //   「저장」이 비활성인 채 닫히고 편집분이 조용히 사라진다. 저장 여부는
  //   글자 단위 동일성으로 판정한다(isRowDirty 의 공백 무시 비교는 "생성 전에
  //   변형본을 떠야 하나" 판정용이라 목적이 다르다).
  const dirty = content !== savedContent;

  // 미저장 여부를 부모에 통지 — 부모가 몰고 가는 접기 경로의 확인 관문 재료.
  // 언마운트 시 false 로 회수해 유령 dirty 가 남지 않게 한다.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(
    () => () => {
      onDirtyChange?.(false);
    },
    [onDirtyChange],
  );

  // ── 아래 다섯 핸들러는 use-workspace-rows.ts 의 단일 행 판본이다 ────────────
  // 스냅샷을 언제 쌓고 무엇을 비우는지가 한 글자라도 다르면 같은 편집기가 두
  // 표면에서 다르게 동작한다. 그쪽을 고치면 여기도 함께 고칠 것.

  const handleChangeContent = useCallback((next: string) => {
    setHighlights((prev) => adjustHighlights(content, next, prev));
    // 본문이 바뀌면 기존 범위 오프셋은 신뢰할 수 없다 → 해제.
    setRangeState(null);
    setContent(next);
  }, [content]);

  const handlePushHistory = useCallback(() => {
    setPast((prev) => [
      ...prev.slice(-(HISTORY_LIMIT - 1)),
      { content, highlights },
    ]);
    // 새 편집이 시작되면 다시 실행 스택은 무효.
    setFuture([]);
  }, [content, highlights]);

  const handleApplyAi = useCallback(
    (next: string, highlight: RowHighlight) => {
      setPast((prev) => [
        ...prev.slice(-(HISTORY_LIMIT - 1)),
        { content, highlights },
      ]);
      setFuture([]);
      setRangeState((prev) => adjustRange(content, next, prev));
      setHighlights((prev) => [
        ...adjustHighlights(content, next, prev),
        highlight,
      ]);
      setContent(next);
    },
    [content, highlights],
  );

  const handleUndo = useCallback(() => {
    if (past.length === 0) return;
    const snapshot = past[past.length - 1];
    setFuture((prev) => [
      { content, highlights },
      ...prev.slice(0, HISTORY_LIMIT - 1),
    ]);
    setPast((prev) => prev.slice(0, -1));
    setHighlights(snapshot.highlights);
    setRangeState(null);
    setContent(snapshot.content);
  }, [past, content, highlights]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const snapshot = future[0];
    setPast((prev) => [
      ...prev.slice(-(HISTORY_LIMIT - 1)),
      { content, highlights },
    ]);
    setFuture((prev) => prev.slice(1));
    setHighlights(snapshot.highlights);
    setRangeState(null);
    setContent(snapshot.content);
  }, [future, content, highlights]);

  // ── 변형 지문 저장 — 이 지문은 **이미 등록돼 있으므로** ensureRegistered 가
  // 필요 없다. 라벨·태그는 워크스페이스(passage-workspace.handleAddVariant)와
  // 같은 함수로 만든다 — 문자열을 손코딩하면 두 표면이 만든 변형본이 지문
  // 목록에서 서로 다르게 분류된다. 변형본은 **새 지문**이라 원본은 무손상.
  const handleAddVariant = useCallback(
    async (input: {
      sourcePassageId: string;
      title: string;
      content: string;
      mode: WholePassageTransformMode;
      direction?: VariantDirection;
    }): Promise<boolean> => {
      const nextTitle = input.title.trim();
      const nextContent = input.content.trim();
      if (nextTitle.length === 0 || nextContent.length < 20) {
        toast.error("변형본 제목/본문이 비어 있습니다.");
        return false;
      }
      try {
        const { createDirectInputPassageMaterial } = await import(
          "@/actions/workbench"
        );
        const result = await createDirectInputPassageMaterial({
          title: nextTitle,
          content: nextContent,
          sourcePassageId: input.sourcePassageId,
          variantKind: variantModeLabel(input.mode, input.direction),
          variantDirection: input.direction,
          tags: [variantTag(input.mode, input.direction)],
        });
        if (!result?.success || !result.id) {
          toast.error(
            "변형본 저장에 실패했습니다." +
              (result && "error" in result && result.error
                ? ` (${result.error})`
                : ""),
          );
          return false;
        }
        toast.success(
          "변형본이 새 지문으로 저장됐어요 — 지문 목록에서 바로 쓸 수 있습니다.",
        );
        onVariantSaved?.();
        return true;
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "변형본 저장 중 오류가 발생했습니다.",
        );
        return false;
      }
    },
    [onVariantSaved],
  );

  // ── 저장 — 원본 Passage 갱신 ───────────────────────────────────────────────
  // ⚠ updateWorkbenchPassage 를 쓰면 안 된다: 그쪽은 schoolId 를 미전달 시 **null
  //   로 실제 기록**해(undefined 가 아니라 null) 본문만 고치려다 학교 연결이
  //   지워진다. 전용 액션 updatePassageBody(academyId 스코프 updateMany, title·
  //   content 만 기록 — passages.ts renamePassage 관용구의 본문 판)를 쓴다.
  const handleSave = useCallback(async () => {
    if (saving) return;
    const nextContent = content.trim();
    if (nextContent.length < 20) {
      toast.error("본문이 너무 짧습니다. (최소 20자)");
      return;
    }
    setSaving(true);
    try {
      const { updatePassageBody } = await import("@/actions/workbench");
      // 본문만 보낸다(제목 미전송) — 제목 소유권은 행의 연필에 있다.
      const result = await updatePassageBody(passage.id, {
        content: nextContent,
      });
      if (!result?.success) {
        toast.error(
          (result && "error" in result && result.error) ||
            "지문 저장에 실패했습니다.",
        );
        return;
      }
      setSavedContent(nextContent);
      setContent(nextContent);
      onSaved(passage.id, { content: nextContent });
      toast.success("지문을 저장했습니다.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "지문 저장 중 오류가 발생했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }, [saving, content, passage.id, onSaved]);

  /** 저장본으로 되돌린다(편집 표시·되돌리기 스택까지 초기화). */
  const handleRevert = useCallback(() => {
    if (!dirty) return;
    if (
      !window.confirm(
        "저장하지 않은 편집 내용을 버리고 마지막 저장 상태로 되돌릴까요?",
      )
    ) {
      return;
    }
    setContent(savedContent);
    setRangeState(null);
    setHighlights([]);
    setPast([]);
    setFuture([]);
  }, [dirty, savedContent]);

  /** 접기 — 미저장 변경이 있으면 확인을 받는다(작업 유실 방지). */
  const handleClose = useCallback(() => {
    if (
      dirty &&
      !window.confirm(
        "저장하지 않은 편집 내용이 있습니다. 닫으면 사라져요. 계속할까요?",
      )
    ) {
      return;
    }
    onClose();
  }, [dirty, onClose]);

  // 워크스페이스 행 한 개와 같은 모양. passageId 는 **실값**이라 변형 저장이
  // 곧바로 sourcePassageId 를 쓴다(authoring 판의 ensureRegistered 불필요).
  const row: WorkspaceRow = {
    localId: passage.id,
    passageId: passage.id,
    title: passage.title,
    content,
    savedContent,
    range,
    override: null,
    collapsed: false,
    highlights,
    past,
    future,
  };

  return (
    <WorkspacePassageRow
      index={0}
      row={row}
      // 워크스페이스 전용 값 — embedded 에서는 이 둘을 읽는 뱃지가 꺼져 있다.
      globalDifficulty="INTERMEDIATE"
      globalGenerationPlan="STANDARD"
      disabled={saving}
      onChangeContent={handleChangeContent}
      onPushHistory={handlePushHistory}
      onApplyAi={handleApplyAi}
      onUndo={handleUndo}
      onRedo={handleRedo}
      onClearHighlights={() => setHighlights([])}
      onSetRange={setRangeState}
      // 인라인 편집기는 접힘 축이 없다 — 접기는 「닫기」(행 토글) 하나뿐이다.
      onToggleCollapsed={handleClose}
      // 제거할 워크스페이스가 없다(embedded 가 X 버튼을 지운다).
      onRemove={() => {}}
      onAddVariant={handleAddVariant}
      embedded
      footer={
        <div className="flex items-center gap-1.5">
          <span
            className={
              "min-w-0 flex-1 truncate text-[11.5px] font-semibold " +
              (dirty ? "text-amber-600" : "text-slate-400")
            }
          >
            {dirty ? "저장하지 않은 변경이 있습니다" : "저장됨"}
          </span>
          {dirty ? (
            <button
              type="button"
              onClick={handleRevert}
              disabled={saving}
              title="마지막 저장 상태로 되돌립니다"
              className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              되돌리기
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            title="편집을 닫습니다"
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            닫기
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
            title={
              dirty
                ? "수정한 본문을 지문에 저장합니다"
                : "변경된 내용이 없습니다"
            }
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {saving ? "저장 중" : "저장"}
          </button>
        </div>
      }
    />
  );
}
