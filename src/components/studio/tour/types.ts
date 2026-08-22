import type { ReactNode } from "react";

// ============================================================================
// 클래스 스튜디오 온보딩 투어 — 타입 정본 (.tmp-studio-tour/spec.md §1)
//
// 투어는 순수 클라이언트 계층이며 **프롭 0** 으로 자립한다: 필 전환은 실 필 버튼
// `button[data-asset-view]` 를 click() 하고(사용자 클릭과 동일 경로), 상태 스냅숏은
// DOM 에서 파생한다. 서버 액션 0 · 스토어 쓰기 0 · 픽(체크) 생성 0.
// 앵커는 data-* 계약 속성 셀렉터만 쓴다 — 라벨/aria 부분매칭은 리포 명시 규약으로
// 금지다(source-switcher.tsx:33-44 와 같은 근거).
// ============================================================================

/** 챕터 id — 배열 순서가 곧 투어 진행 순서다. */
export type TourChapterId =
  | "overview"
  | "register"
  | "worksheet"
  | "questions"
  | "sheet-compose"
  | "exam-compose"
  | "deploy";

export interface TourChapter {
  id: TourChapterId;
  /** 카드 상단 칩·챕터 점프 목록 라벨 */
  label: string;
}

/** 필(중앙 자산 뷰) — source-switcher 의 StudioAssetView 와 값 호환(결합은 끊는다). */
export type TourViewId = "passages" | "sheet" | "exam";

/** 데모 시연 계층 — 실 서버·스토어를 절대 만지지 않는 목업 렌더. */
export interface TourDemo {
  /**
   * overlay = 앵커 rect 위에 정렬해 실 UI 자리에서 시연(예: 우측 패널 위 큐 목업).
   * stage   = 중앙 스테이지 카드에서 시연(예: 크롭 플레이그라운드).
   */
  kind: "overlay" | "stage";
  render: () => ReactNode;
  /** overlay 전용 — 미지정 시 스텝 anchor 를 그대로 쓴다. */
  anchor?: string;
}

export interface TourStepDef {
  /** 안정 id — 진행 저장·프로브 판정 축. 확정 후 개명 금지(스펙 §5-8). */
  id: string;
  chapter: TourChapterId;
  /**
   * CSS 셀렉터(data-* 계약 속성). 미지정이면 중앙 카드 스텝.
   * 앵커가 grace(600ms) 넘게 소실(부재 또는 rect 0×0)이면 fallback 정책을 따른다.
   */
  anchor?: string;
  /** 앵커 소실 시: center = 중앙 카드로 강등(기본) · skip = 스텝 건너뜀 */
  fallback?: "center" | "skip";
  /** 스텝 진입 전에 보장할 필 — engine 이 필 버튼 실클릭으로 전환한다. */
  view?: TourViewId;
  title: string;
  body: ReactNode;
  /** 툴팁 우선 배치 — auto(기본)는 여유 공간 최대 변. */
  placement?: "auto" | "top" | "bottom" | "left" | "right";
  /** 컷아웃 패딩 px (기본 8) */
  padding?: number;
  /** 컷아웃 라운드 px (기본 12) */
  radius?: number;
  /**
   * true 면 컷아웃 안 실 UI 클릭을 허용한다(홀 블로커 제거).
   * 기본 false — 프레젠테이션 모드(결정론)가 정본이다.
   */
  interactive?: boolean;
  demo?: TourDemo;
}

/** engine 이 스텝 정의를 정규화한 런타임 형태. */
export interface TourStepRuntime extends TourStepDef {
  index: number;
  /** 챕터 내 순번(1-base)·챕터 스텝 수 — 진행도 표기용 */
  chapterStep: number;
  chapterSize: number;
}

export const TOUR_CHAPTERS: TourChapter[] = [
  { id: "overview", label: "한눈에 보기" },
  { id: "register", label: "지문 등록" },
  { id: "worksheet", label: "학습지 생성" },
  { id: "questions", label: "실전 문제 생성" },
  { id: "sheet-compose", label: "학습지 조판" },
  { id: "exam-compose", label: "시험지 조판" },
  // 라벨 개정(적대검수): §M off 기본에서 배포 표면이 전무한데 「배포와 확인」
  // 이라 챕터명만 배포를 약속했다 — 실제 스텝 구성(현황판·학생·단계·재진입)에 맞춘다.
  { id: "deploy", label: "현황과 마무리" },
];

export const chapterIndex = (id: TourChapterId): number =>
  TOUR_CHAPTERS.findIndex((c) => c.id === id);

/** 헤더 「튜토리얼」 버튼 → 투어 개방 이벤트 계약. */
export const TOUR_OPEN_EVENT = "studio-tour:open";

/** 필 버튼 정본 셀렉터(E24 ⑦(a) 계약 속성) — 투어의 뷰 보장이 클릭할 대상. */
export const assetPillSelector = (view: TourViewId): string =>
  `button[data-asset-view="${view}"]`;
