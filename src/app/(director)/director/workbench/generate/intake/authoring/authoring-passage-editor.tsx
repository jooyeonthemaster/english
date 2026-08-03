"use client";

// ============================================================================
// AI 지문 생성 결과 — 인라인 편집기 어댑터
//
// 생성된 지문 1편(AuthoringResultItem)을 워크스페이스 지문 행
// (WorkspacePassageRow)에 **그대로** 태운다. 편집기·AI 도구(복원 · 변형 지문 ·
// 앞 맥락 문단 · 문장 재작성) · undo/redo · 하이라이트 · 편집 흔적이 전부
// 워크스페이스와 같은 코드다.
//
// ── 왜 편집기를 복제하지 않았나 ─────────────────────────────────────────────
// 편집기 본체는 선택 무대 · 백드롭 4겹 · 삽입 바 · 좌표 계산이 서로 물려 있는
// 1,000줄짜리다. 한 벌 더 만들면 두 편집기가 서서히 갈라지고, 그때 "생성 카드에서만
// 하이라이트가 밀린다" 같은 버그가 남는다. 그래서 이 파일은 **상태 어댑터일 뿐**이고
// 화면은 한 벌만 존재한다(workspace-passage-row.tsx 의 embedded 옵트인).
//
// ── 이 파일이 실제로 하는 일 ────────────────────────────────────────────────
//  1) AuthoringResultItem → WorkspaceRow 모양으로 감싼다(passageId 는 등록 전이라 "").
//  2) 워크스페이스 스토어(use-workspace-rows)의 **단일 행 판본**을 든다 —
//     pushHistory / applyAiEdit / undo / redo 의 스냅샷 규약이 한 글자도 다르면
//     같은 편집기가 두 표면에서 다르게 동작한다. 아래 구현은 그 파일의 복사본이다.
//  3) 변형 지문 저장은 **원본 Passage id 가 필요하다.** 등록 전이면 그 순간에
//     지문함에 넣어 id 를 받아 온다(호출부가 넘긴 ensureRegistered).
//
// 회귀 방지 계약
//  · 본문의 진실은 이 컴포넌트의 state 다. 부모(카드)는 onChangeContent 로 통지만
//    받는다 — 부모가 매 타이핑마다 리렌더되면 커서가 튄다.
//  · item.passage 가 밖에서 바뀌면(폴링으로 실행 결과가 채워지는 경우) **그때만**
//    본문을 갈아 끼운다. 매 렌더 동기화하면 타이핑이 되돌려진다.
// ============================================================================

import { useCallback, useState, type ReactNode } from "react";

import { WorkspacePassageRow } from "../../workspace/workspace-passage-row";
import {
  adjustHighlights,
  adjustRange,
  type RowHighlight,
  type RowRange,
  type RowSnapshot,
  type WorkspaceRow,
} from "../../workspace/workspace-types";
import type { AuthoringResultItem } from "@/lib/passage-authoring/schema";
import {
  variantModeLabel,
  variantTag,
  type VariantDirection,
  type WholePassageTransformMode,
} from "@/lib/passage-transform/schema";

/** use-workspace-rows.ts 와 같은 값이어야 한다(되돌리기 깊이 규약). */
const HISTORY_LIMIT = 50;

export interface AuthoringPassageEditorProps {
  item: AuthoringResultItem;
  /** 카드 번호(0-based) — 행 헤더의 번호 뱃지. */
  index: number;
  /** 저장·등록 중 잠금. */
  disabled: boolean;
  /** 제목 초안 — 부모가 소유한다(등록 시 이 값이 지문함에 들어간다). */
  title: string;
  onChangeTitle: (title: string) => void;
  /** 본문이 바뀔 때마다 부모에게 통지(등록 시 이 값이 쓰인다). */
  onChangeContent: (content: string) => void;
  /** 일괄 등록용 선택 상태. 넘기지 않으면 체크박스를 그리지 않는다. */
  selected?: boolean;
  onToggleSelected?: () => void;
  /**
   * 접힘 상태는 **부모가 소유한다.** 밴드의 기본 규칙("한 편짜리 실행은 펼쳐서
   * 도착, 여러 편이면 접어서 나열")이 편 바깥에서 정해지기 때문이다.
   */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** 행 푸터 자리에 그릴 것(넣기 버튼 등). */
  footer?: ReactNode;
  /**
   * 변형 지문을 저장하기 직전에 불린다. 이 편의 **원본 Passage id** 를 돌려줘야
   * 하며, 아직 지문함에 없으면 그 자리에서 등록해 id 를 만든다. null 이면 저장을
   * 포기한다(호출부가 이미 사용자에게 사유를 알렸다는 뜻).
   */
  ensureRegistered: () => Promise<string | null>;
  /** 변형본을 지문함에 저장한다. 성공하면 true. */
  onSaveVariant: (input: {
    sourcePassageId: string;
    title: string;
    content: string;
    variantKind: string;
    variantDirection?: string;
    tags?: string[];
  }) => Promise<boolean>;
}

export function AuthoringPassageEditor({
  item,
  index,
  disabled,
  title,
  onChangeTitle,
  onChangeContent,
  selected,
  onToggleSelected,
  collapsed,
  onToggleCollapsed,
  footer,
  ensureRegistered,
  onSaveVariant,
}: AuthoringPassageEditorProps) {
  // 편집 상태 — 워크스페이스 행 하나와 같은 모양. passageId 는 등록 전이라 빈
  // 문자열이고, embedded 모드에서는 그 값을 읽는 표면(이력 팝오버)이 꺼져 있다.
  const [content, setContent] = useState(item.passage);
  const [range, setRangeState] = useState<RowRange | null>(null);
  const [highlights, setHighlights] = useState<RowHighlight[]>([]);
  const [past, setPast] = useState<RowSnapshot[]>([]);
  const [future, setFuture] = useState<RowSnapshot[]>([]);

  // 밖에서 본문이 바뀐 경우에만 갈아 끼운다(폴링으로 실행 결과가 나중에 채워지는
  // 복구 run). 매 렌더 동기화하면 타이핑이 되돌려진다.
  //
  // ⚠️ effect 가 아니라 **렌더 중 조정**이다. 이 코드베이스는 effect 본문의 setState
  //   를 금지한다(react-hooks/set-state-in-effect = 캐스케이딩 렌더). 렌더 중
  //   setState 는 React 가 공식 권장하는 "prop 이 바뀌면 state 를 맞추는" 패턴이고,
  //   같은 렌더 패스 안에서 다시 실행되므로 화면에 중간 상태가 새지 않는다.
  const [seededPassage, setSeededPassage] = useState(item.passage);
  if (item.passage !== seededPassage) {
    setSeededPassage(item.passage);
    setContent(item.passage);
    setRangeState(null);
    setHighlights([]);
    setPast([]);
    setFuture([]);
  }

  const notifyContent = useCallback(
    (next: string) => {
      setContent(next);
      onChangeContent(next);
    },
    [onChangeContent],
  );

  // ── 아래 다섯 핸들러는 use-workspace-rows.ts 의 단일 행 판본이다 ────────────
  // 스냅샷을 언제 쌓고 무엇을 비우는지가 한 글자라도 다르면 같은 편집기가 두
  // 표면에서 다르게 동작한다. 그쪽을 고치면 여기도 함께 고칠 것.

  const handleChangeContent = useCallback(
    (next: string) => {
      setHighlights((prev) => adjustHighlights(content, next, prev));
      // 본문이 바뀌면 기존 범위 오프셋은 신뢰할 수 없다 → 해제.
      setRangeState(null);
      notifyContent(next);
    },
    [content, notifyContent],
  );

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
      // AI 변형/앞 맥락 추가는 단일 구간 변경 — 하이라이트처럼 출제 범위도
      // 오프셋을 보정해 유지한다(겹치면 살아남은 구간만).
      setRangeState((prev) => adjustRange(content, next, prev));
      setHighlights((prev) => [
        ...adjustHighlights(content, next, prev),
        highlight,
      ]);
      notifyContent(next);
    },
    [content, highlights, notifyContent],
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
    notifyContent(snapshot.content);
  }, [past, content, highlights, notifyContent]);

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
    notifyContent(snapshot.content);
  }, [future, content, highlights, notifyContent]);

  // ── 변형 지문 저장 — 등록 전이면 이 순간에 지문함에 넣어 원본 id 를 만든다 ──
  // 라벨·태그는 워크스페이스(passage-workspace.handleAddVariant)와 **같은 함수**로
  // 만든다. 문자열을 여기서 손코딩하면 두 표면이 만든 변형본이 지문 목록에서
  // 서로 다르게 분류된다.
  const handleAddVariant = useCallback(
    async (input: {
      sourcePassageId: string;
      title: string;
      content: string;
      mode: WholePassageTransformMode;
      direction?: VariantDirection;
    }) => {
      const sourceId = await ensureRegistered();
      if (!sourceId) return false;
      return onSaveVariant({
        sourcePassageId: sourceId,
        title: input.title,
        content: input.content,
        variantKind: variantModeLabel(input.mode, input.direction),
        variantDirection: input.direction,
        tags: [variantTag(input.mode, input.direction)],
      });
    },
    [ensureRegistered, onSaveVariant],
  );

  const row: WorkspaceRow = {
    localId: item.id,
    // 등록 전에는 id 가 없다. embedded 모드가 이 값을 읽는 표면(생성 이력)을
    // 꺼두므로 빈 문자열이 화면에 새어 나가지 않는다.
    passageId: "",
    title,
    content,
    // 생성 결과는 "저장된 본문"이 없다 — 원본 생성본을 기준으로 두면 손을 대는
    // 순간 '수정됨' 뱃지가 떠 무엇이 달라졌는지 알려 준다.
    savedContent: item.passage,
    range,
    override: null,
    collapsed,
    highlights,
    past,
    future,
  };

  return (
    <WorkspacePassageRow
      index={index}
      row={row}
      // 워크스페이스 전용 값 — embedded 에서는 이 둘을 읽는 뱃지가 꺼져 있다.
      globalDifficulty="INTERMEDIATE"
      globalGenerationPlan="STANDARD"
      disabled={disabled}
      onChangeContent={handleChangeContent}
      onPushHistory={handlePushHistory}
      onApplyAi={handleApplyAi}
      onUndo={handleUndo}
      onRedo={handleRedo}
      onClearHighlights={() => setHighlights([])}
      onSetRange={setRangeState}
      onToggleCollapsed={onToggleCollapsed}
      // 생성 결과 카드에는 "제거할 워크스페이스"가 없다(embedded 가 버튼을 지운다).
      onRemove={() => {}}
      onAddVariant={handleAddVariant}
      selected={selected}
      onToggleSelected={onToggleSelected}
      embedded
      footer={footer}
      onChangeTitle={onChangeTitle}
    />
  );
}
