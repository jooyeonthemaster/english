import React from "react";
// ─── Types ───────────────────────────────────────────────

export interface QuestionCardItem {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  createdAt: Date;
  passage: {
    id: string;
    title: string;
    content: string;
    grade?: number | null;
    semester?: string | null;
    publisher?: string | null;
    school?: { id: string; name: string } | null;
  } | null;
  // content 등 옵셔널 — 시험지 생성 좌측 목록이 해설 본문을 지연 로드하므로(병합 전엔
  // explanation:{id} 만 존재). 렌더러는 q.explanation?.content 로 안전 접근한다.
  explanation: {
    id: string;
    content?: string;
    keyPoints?: string | null;
    wrongOptionExplanations?: string | null;
  } | null;
  _count?: { examLinks: number };
  /** AI 생성 시 원본 구조화 데이터 (StructuredQuestionRenderer용) */
  structuredData?: unknown;
  /** 지문 세트 멤버면 그 세트 id(묶음 표시용). 일반 문항은 null. */
  setId?: string | null;
  /** 지문 세트 라벨(예: "독해 핵심 2문항") — 묶음 헤더용. */
  setLabel?: string | null;
}

// ─── Component ───────────────────────────────────────────

export interface QuestionCardProps {
  q: QuestionCardItem;
  num: number;
  selected?: boolean;
  /** 방금 상세를 열어봤다가 닫은 카드 — 한 번 배경이 반짝인다. */
  recentlyViewed?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
  onApprove?: () => void;
  onUnapprove?: () => void;
  onDetail?: () => void;
  onEdit?: () => void;
  /** Hide actions (edit, dropdown) — for read-only contexts */
  readonly?: boolean;
  /** Compact mode — smaller padding, hide passage preview by default */
  compact?: boolean;
  showReviewActions?: boolean;
  hideReviewStatusStamp?: boolean;
  /** 미검수(빨간) 테두리 글로우 억제 — 휴지통처럼 검수 상태가 무의미하고
   *  파괴적(영구삭제) 빨강과 혼동되면 안 되는 컨텍스트 전용. */
  suppressUnapprovedBorder?: boolean;
  /** Show the 수정(pencil) + 더보기(...) action pair in the header, left of 펼치기.
   *  Works even in readonly contexts (e.g. 문제 생성 결과 카드). */
  showHeaderActions?: boolean;
  /** Open the detail view when the card body is clicked. */
  openOnCardClick?: boolean;
  /** 해설보기 줄 왼쪽에 '상세 보기' 버튼을 띄우고, 해설보기를 오른쪽으로 보낸다.
   *  두 버튼 색은 '펼치기' 버튼과 통일(blue-400). 생성/검수 결과 카드 전용. */
  showDetailButton?: boolean;
  /** Icon-only detail button anchored at the bottom-right of the card. */
  showDetailIconButton?: boolean;
  /** 영역 드래그 선택(DragSelect)이 읽는 식별자. 기본은 q.id 지만, 선택 상태가
   *  q.id 가 아닌 다른 키(예: 생성 결과의 persistedQuestionId)로 관리되는 경우
   *  해당 키를 넘긴다. null 을 주면 이 카드는 영역 선택 대상에서 제외된다. */
  dragItemId?: string | null;
  /** 해설 보기 줄 왼쪽에 끼울 추가 액션(예: 동형 '분석 정보'). 카드 클릭으로 상세가 열리므로
   *  별도 '상세 보기' 버튼 없이 이 슬롯만 노출된다. 선택 — 미지정 시 표시 안 함. */
  detailExtra?: React.ReactNode;
  /** 구조화 렌더러의 정답 노출 모드 강제(미지정 시 기존 동작: compact=show-all/else=default).
   *  정오표 상세보기처럼 강사면에서 정답을 즉시 노출해야 할 때 "show-all" 을 넘긴다. */
  answerReveal?: "default" | "show-all";
  /** 카드 내부 원본 지문 블록을 강제로 숨긴다(지문을 바깥에서 별도로 렌더할 때).
   *  구조화 렌더러가 지문을 자체 포함하는 유형은 원래도 숨겨지므로 무관하다. */
  suppressPassageBlock?: boolean;
  /** 접이식 원본 지문 블록을 처음부터 펼친 상태로 연다(상세보기 모달 등 전체 노출 컨텍스트). */
  passageDefaultOpen?: boolean;
  /** 해설 패널을 처음부터 펼친 상태로 연다(상세보기 모달 등 완전 노출 컨텍스트 —
   *  passageDefaultOpen 동형. 비-compact 경로에서만 의미가 있다). */
  explanationDefaultOpen?: boolean;
}
