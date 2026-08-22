"use client";

// ============================================================================
// 지문 도시에 v3 — 우측 배포 실행대 아코디언 (docs/class-studio-spec.md
// §3.10.5·§3.10.6, 계약은 §3.10.9 「도시에 개편 계약」)
//
// D1: 선택 지문 전부를 지문 단위 아코디언으로(최근 5개 절단·각주 N은
//     오케스트레이터가 내림). 카드 = AssignmentCard 계보 grid-rows-[0fr↔1fr]
//     300ms, 헤더 토글은 lemma-dossier SenseCard 정본(aria-expanded ·
//     title 접기/펼치기 · Chevron 회전).
// D2→E11(§3.10.11-e): 문제 행 1줄 재설계 — 문두 미리보기(line-clamp-2) 폐기.
//     같은 지문에 딸린 문항들이라 문두끼리는 변별력이 없다(사용자 지시) —
//     대신 [유형 · 난이도(킬러 rose) · 프리미엄 · 검수완료 닷 · 생성일시]가
//     행을 채우고, 문두는 title 툴팁으로만 남는다.
// D3: 문제 상세 모달 완전 펼침 — compact 제거 + answerReveal show-all +
//     지문·해설 기본 펼침 prop 조합.
// D4: ready 모듈 칩·실전 칩 = 미리보기 버튼 — ⛔ E25-6(§3.10.24, 26-08-22)으로
//     칩 층·ModulePreviewSheet 배관째 폐기(지시 원문 「이것도 필요 없어」).
// v3(§3.10.5): 배포 모달 폐기 — CTA 행 [학습지 보내기][문제 보내기]는 인라인
//     배포 폼(DossierDeployInline — B3 소유 파일) 토글 트리거로 전환. 카드당
//     한 번에 한 폼만(openForm 로컬 상태), 대상은 좌측 레일이 접은
//     deployTarget 을 읽기 전용으로 소비한다. 배포 성공 시 폼 접힘 +
//     onDeployed 업링크(조용한 재조회는 오케스트레이터 소유).
// v3(§3.10.6): 스탯 그리드와 CTA 행 사이 「생성 중」 스트립 — 오케스트레이터가
//     접은 queueItemsByPassage 를 그리기만 한다(표시 전용·재시도는 발사 지점 소관).
// v4(§3.10.11-c): 큐 스트립 2단 — 1행 정적 배지(유형·난이도·플랜·문항 수, 항목
//     생멸 시에만 변동) + 2행 QueueStreamLine 라이브 꼬리(스토어 키 구독).
//     라이브 델타를 props 로 흘리면 시그니처 메모·memo 방어선이 무너지므로
//     스토어 경유가 유일 경로다. 접힘 카드 헤더에도 진행/실패 미니 표시.
// E19-5(§3.10.19): Sec「학습 모듈」 → Sec「학습지」. 회색 미보유 칩 7개 벽을
//     폐기하고 그 자리에 [생성 큐 → 완성 학습지(dossier.sheets) → 보유 모듈
//     미리보기 칩] 3층을 놓는다. 큐 스트립은 QueueStripRow/QueueStrip 로 추출해
//     **두 자리**에서 호출한다 — 문항 계열(kind === "questions")은 현행 위치
//     (스탯 그리드 아래)에 그대로 남고, 학습지 계열(modules·exam)만 이 Sec 안으로
//     들어온다. 스탯 그리드 「학습 모듈 N/7」도 「학습지 N」으로 교체(7 고정
//     분모는 모듈 체크박스 시절의 유물이라 상품 축과 어긋난다).
// E21-5(§3.10.21 — 26-08-17 사용자 지목): Sec「학습지」 완성 학습지 행을 **문항
//     행과 같은 문법**으로 승격한다. 사용자 원문: "학습지 행을 클릭하면 지문
//     스튜디오로 가버린다. 내가 원하는 건 이게 아니야. 문항 행처럼 [모바일
//     배포][학습지 조판] 두 버튼이 뜨고…". 구조는 E11 문항 행(이 파일 아래쪽)의
//     복제다 — 좌측 role="checkbox" 실버튼(+체크 순번 숫자) · 무롤 div 루트 ·
//     우측 액션. 같은 카드 안에서 두 목록이 다른 문법이면 카드가 누더기가 된다는
//     원칙(이 파일 847-850행 주석)이 이 개편의 근거이자 제약이다.
//     행 루트 <Link> 강등은 부수효과가 아니라 **전제조건**이다 —
//     drag-select.tsx:274-288 hardInteractive 에 "a" 가 있어 조상에 anchor 가
//     있으면 마키 선택이 시작조차 하지 않는다. 지문 스튜디오 이동은 우측
//     chevron 을 작은 <Link> 로 남겨 근육기억을 보존한다.
//     체크 상태(pickedSheets)는 **오케스트레이터 소유** — 문항 축(picked)이
//     이미 그런 이유(aside/드로어 2트리 = 별개 인스턴스, 아래 props 주석)와
//     같다. 신규 4 prop 은 전부 옵셔널이고, 미전달이면 행은 구 렌더 그대로다
//     (호출부 배선은 U13 소관).
//
// 데이터·배선은 오케스트레이터(studio-home-client) 소유 — 이 파일은 지문별
// DossierFetchState(Map, 부재 = 미조회)를 받아 그리기만 한다. 펼침 시 지연
// fetch 트리거도 onExpand 업링크로 위임(폴링·자체 조회 없음, §3.9.6·§3.10.6).
//
// §M(26-08-22) 모바일 학습 임시 숨김: SHOW_STUDIO_MOBILE_LEARNING=false(기본)면
//     카드 CTA 행([학습지 보내기][문제 보내기])을 px-3 래퍼째, 인라인 배포 폼
//     (DossierDeployInline) 접이 컨테이너를 래퍼째 렌더하지 않고, Sec「학습지」
//     행 우측 [모바일 배포] 아이콘 버튼도 렌더하지 않는다(형제 [학습지 조판]·
//     chevron 은 유지 — 우측 클러스터 자연 수축). 체크박스 title 도 조판 단독
//     자구로 바꾼다. openForm 상태·폼 배타 로직은 존치(트리거가 사라져 도달
//     불가). 코드 경로는 전부 존치 — 복구는 env 1줄
//     (NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true).
// ============================================================================

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  LayoutTemplate,
  ListChecks,
  Loader2,
  Maximize2,
  Minus,
  Send,
  Smartphone,
  X,
} from "lucide-react";
import { DragSelect } from "@/components/ui/drag-select";
import { WideModal } from "@/components/layout/wide-modal";
import {
  QuestionCard,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import {
  DIFFICULTY_LEVELS,
  QUESTION_SUBTYPES,
  QUESTION_TYPES,
} from "@/lib/constants";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  planForDifficulty,
  QUESTION_GENERATION_PLANS,
  sanitizeAiModelDisclosureText,
} from "@/lib/question-generation-plans";
import type {
  DossierAssignment,
  DossierQuestionRow,
  DossierSheetRow,
  DossierStudentRow,
  PassageDossier,
} from "@/lib/studio/dossier-types";
import { STUDIO_MODULES, STUDIO_MODULE_BY_ID } from "@/lib/studio/modules";
// 「모바일 배포」 가용 판정은 **정본 1곳**에서만 한다(§3.10.21 E21-5) — 같은
// 술어를 자료 목록판(composer-list-pane)·학습지 실행대(sheets-action-rail)·
// 하단 실행 바(dossier-pick-bar)가 함께 쓰므로, 여기에 리터럴을 복제하면
// "어떤 화면에서는 눌리고 어떤 화면에서는 안 눌리는" 상태가 난다.
// (E24 §3.10.23 전에는 구 「학습지 관리」 필의 평면 행 class-worksheets-pane 도
//  같은 술어를 썼다 — 그 판은 3필 개편에서 자료 목록판으로 흡수됐다.)
import { canDeployWorksheetRow } from "@/lib/studio/sheet-deploy-eligibility";
import type { SheetPickMeta } from "@/lib/studio/sheet-pick-types";
import {
  SHEET_PLAN_LABEL,
  SHEET_STATUS_BADGE,
} from "@/lib/studio/sheet-products";
import type { StreamTailStore } from "@/lib/studio/stream-tail-store";
import { PassageActivityRing } from "@/components/workbench/passage-activity-ring";
import type { PassageActivityKind } from "@/lib/passage-activity";
import type { DossierQueueItem, StudioDeployTarget } from "./deploy-target";
import { DossierDeployInline } from "./dossier-deploy-inline";
import { DossierPickBar, type PickedQuestionMeta } from "./dossier-pick-bar";
import {
  fmtDateTime,
  Sec,
  SectionError,
  SectionSkeleton,
} from "./panel-primitives";
import { ElapsedClock, QueueStreamLine } from "./queue-stream-line";

// §M 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비한다(prop 화 금지:
// memo·시그니처 메모 방어선 무접촉). false 가 기본값 = 숨김이 새 정상.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

export type DossierFetchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | {
      status: "ready";
      dossier: PassageDossier;
      /** U1 실패 계약: data 있음 + error = 배정 파이프라인만 실패(§3.9.6) */
      assignmentsError: string | null;
    };

/** 아코디언 표시 대상 참조 — 제목은 지문함(byId)에서 온 표시용 스냅샷 */
export interface DossierPassageRef {
  id: string;
  title: string;
}

/** 인라인 배포 폼 종별(§3.10.5) — 카드당 한 번에 하나만 펼친다 */
type DeployFormKind = "worksheet" | "questions";

export interface PassageDossierAccordionProps {
  /** 표시 대상(오케스트레이터가 최근 5로 절단해 내림) */
  passages: DossierPassageRef[];
  /** 선택 전체 수 — 표시 수 초과 시 절단 각주를 띄운다(§3.9v2.1) */
  totalCount: number;
  /** 지문별 조회 상태(부재 = 아직 미조회 → 펼침 본문 스켈레톤) */
  states: ReadonlyMap<string, DossierFetchState>;
  expandedId: string | null;
  /** 헤더 토글(접기 = null). fetch 트리거는 오케스트레이터 소유 */
  onExpand: (passageId: string | null) => void;
  onRetry: (passageId: string) => void;
  onOpenQuestion: (questionId: string) => void;
  /** 좌측 레일 체크 상태를 접은 배포 대상(§3.10.3) — null = 클래스 미선택. 읽기 전용 */
  deployTarget: StudioDeployTarget | null;
  /** 지문별 「생성 중」 스트립 항목(§3.10.6) — 오케스트레이터 조립·표시 전용 */
  queueItemsByPassage: ReadonlyMap<string, readonly DossierQueueItem[]>;
  /** 스트림 꼬리 스토어(§3.10.11-b) — 오케스트레이터 ref 소유라 참조 안정.
   *  라이브 값은 QueueStreamLine 의 키 구독으로만 흐른다(props 경유 금지) */
  streamStore: StreamTailStore;
  /** 방금 생성 문항 id(지문별 — §3.10.11-e v2 재조회 diff 누적) — 문항 행
   *  은은한 글로우 표식. 완료 착지 시에만 변하는 참조(memo 방어선 무해) */
  freshQuestionIds: ReadonlyMap<string, ReadonlySet<string>>;
  /** 배포 성공 업링크 — 오케스트레이터가 조용한 재조회 + refreshAfterLibraryChange */
  onDeployed: (passageId: string) => void;
  /** 문항 체크 상태(§3.10.13) — **오케스트레이터 소유**. aside(xl+)와 xl 미만
   *  슬라이드오버가 이 컴포넌트를 서로 다른 트리 위치에 렌더해(별개 인스턴스·
   *  별개 state) 패널 로컬 상태로는 드로어 닫기/패널 접기 한 번에 선택이 전량
   *  소실된다(26-08-14 적대 검수 확정) — 부모가 들어야 두 인스턴스가 공유한다. */
  picked: ReadonlyMap<string, PickedQuestionMeta>;
  onTogglePick: (questionId: string, meta: PickedQuestionMeta) => void;
  onPickRows: (
    entries: readonly (readonly [string, PickedQuestionMeta])[],
    pick: boolean,
  ) => void;
  onClearPicked: () => void;
  /** 바 배포 성공 — 선택 비움·지문별 조용한 재조회·목록 리프레시 **1회**는
   *  오케스트레이터 소유(지문 수만큼 중복 발사 금지 — 적대 검수 minor) */
  onPickBarDeployed: (passageIds: string[]) => void;
  /** 「시험지 조판」 인스튜디오 착지(§3.10.16-b, additive) — 픽바 패스스루.
   *  미제공 = 기존 워크벤치 빌더 라우팅. 참조 안정 전제(memo 방어선). */
  onComposeExam?: (questionIds: string[]) => void;

  // ── 학습지(문서) 축 체크·액션(§3.10.21 E21-5, additive) ───────────────────
  // 4개 전부 옵셔널이고 **onToggleSheetPick 이 곧 스위치**다: 미전달이면 학습지
  // 행은 구 렌더(<Link> 행 / classId 없으면 정적 div)를 그대로 낸다. 호출부
  // 배선은 U13(studio-home-client) 소관이라, 이 파일만 먼저 머지돼도 화면이
  // 변하지 않아야 한다(유닛 간 additive 계약).
  /** 조판 대기열(Map) — **삽입 순서 = 조판 순서**. 문항 축 `picked` 와 같은
   *  이유로 오케스트레이터 소유다(aside/드로어 2트리 = 별개 인스턴스). 참조는
   *  선택 변동 시에만 갈리므로 memo 방어선 무해. */
  pickedSheets?: ReadonlyMap<string, SheetPickMeta>;
  /** 행 체크 토글 — 키는 reportId, 값은 SheetPickMeta 정본(lib/studio/sheet-pick-types).
   *  도시에는 지문 1건 스코프라 meta.passageId/passageTitle 은 dossier.passage 에서 채운다
   *  (DossierSheetRow 에는 그 두 필드가 없다 — dossier-types.ts:83-91). */
  onToggleSheetPick?: (reportId: string, meta: SheetPickMeta) => void;
  /** 행 1건 모바일 배포 — PRIME 행만 열린다(canDeployWorksheetRow 게이트). */
  onDeploySheet?: (meta: SheetPickMeta) => void;
  /** 학습지 조판 발사 — [학습지 조판] 뷰(`centerAssetView === "sheet"`) 전환 +
   *  우측 조판 표면(§3.10.21 E21-5 · 필 명칭은 E24 §3.10.23).
   *  인자는 조판 순서대로 정렬된 reportId 배열(대기열 ∪ 이 행). */
  onComposeSheets?: (reportIds: string[]) => void;
  /** 학습지 축 선택 비움(§3.10.22 E22-U14) — 하단 실행 바의 「선택 해제」가 두
   *  축을 함께 걷는다. 오케스트레이터 `clearPickedSheets` 가 정본이고 그 안에서
   *  dirty 가드(guardSheetPickRemoval)를 지난다 — 여기서 Map 을 만들지 않는다.
   *  미전달이면 바는 문항 축만 비운다(additive). */
  // boolean 반환은 그대로 흘려보낸다(dossier-pick-bar.tsx clearAll 의 2축 원자
  // 청산이 「취소」를 false 로 읽는다). 여기서 () => void 로 좁히면 그 판정이
  // 타입상 불가능해져 「취소했는데 문항만 증발」이 되살아난다.
  onClearSheets?: () => boolean | void;
  /**
   * §M(26-08-22) 조판 유도 넛지 — 하단 실행 바(DossierPickBar)의 조판 버튼
   * 펄스로 패스스루만 한다. 원시 boolean(기본 false) — memo 방어선 무해.
   */
  pickBarNudge?: boolean;
  /**
   * 카드 헤더 「선택 해제」(26-08-22 사용자 지시) — 이 지문을 도시에 공급원
   * (지문함 선택 selectedIds)에서 뺀다. 도시에는 선택의 **투영**이라 자체 상태를
   * 지우지 않고 업링크만 한다(공급원 단일 소유 — library-pane §3.10.11-a 발행
   * 이펙트가 카드 소멸까지 책임진다). 미전달이면 X 버튼 미렌더(additive).
   */
  onRemovePassage?: (passageId: string) => void;
}

// 유형·난이도 한글 라벨 — constants 단일 소스 평탄화(actions/studio/dossier.ts 미러)
const QUESTION_TYPE_LABEL: Record<string, string> = {};
for (const item of QUESTION_TYPES) QUESTION_TYPE_LABEL[item.value] = item.label;
const QUESTION_SUBTYPE_LABEL: Record<string, string> = {};
for (const list of Object.values(QUESTION_SUBTYPES)) {
  for (const item of list) QUESTION_SUBTYPE_LABEL[item.value] = item.label;
}
// export: 생성 문제 전체보기(class-questions-pane §3.10.16-b)가 같은 라벨
// 환산을 쓴다 — 행·요약 칩·필터가 표면 간에 어긋나지 않게 단일 소스.
export function questionRowTypeLabel(
  type: string,
  subType: string | null,
): string {
  return (
    (subType ? QUESTION_SUBTYPE_LABEL[subType] : undefined) ??
    QUESTION_TYPE_LABEL[type] ??
    type
  );
}
const DIFFICULTY_LABEL: ReadonlyMap<string, string> = new Map(
  DIFFICULTY_LEVELS.map((d) => [d.value, d.label]),
);

/** 큐 스트립 부재 시 참조 안정 빈 배열(memo 방어선 — §3.10.9 함정 1) */
const EMPTY_QUEUE_ITEMS: readonly DossierQueueItem[] = [];

/**
 * 큐 항목 종류 → 활동 링 톤 축(§3.10.20). 두 계약을 하나로 합치지 않는 이유:
 * DossierQueueItem.kind 는 스트립의 라벨·배지 분기를 겸하는 표시 계약이고,
 * PassageActivityKind 는 호스트 중립 톤 축이라 수명이 다르다. 이름이 갈리는
 * 곳은 "modules"(학습지 계열의 구 명칭) 한 칸뿐이라 표로 못 박는다.
 */
const DOSSIER_KIND_TO_ACTIVITY: Record<
  DossierQueueItem["kind"],
  PassageActivityKind
> = {
  modules: "sheet",
  exam: "exam",
  questions: "questions",
};

// 신규 문항 글로우 판정(§3.10.11-e v2)은 전적으로 오케스트레이터 소유
// (fetchDossier settle 에서 diff ∪ 최근 30분 — freshQuestionIds prop) —
// 이 판에서 Date.now() 를 렌더 중 부르면 React Compiler 순수성 위반(실측 경고).

/** 마감 표기 — D-n / D-DAY / 마감 지남(rose). 날짜 단위 비교. */
function dueInfo(dueAt: string | null): { label: string; over: boolean } | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const dayStart = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dayStart(due) - dayStart(new Date())) / 86_400_000);
  if (diff < 0) return { label: "마감 지남", over: true };
  return { label: diff === 0 ? "D-DAY" : `D-${diff}`, over: false };
}

// (E25-6 §3.10.24) MODULE_CHIP_READY / MODULE_CHIP_BUTTON 은 「미리보기」 칩 층과
// 함께 **폐기**했다(E19-5 가 미보유 회색 칩을 지운 것과 같은 방향 — 지시 원문
// 「이것도 필요 없어」). 미리보기의 정본은 지문 스튜디오(passage-studio-client)다.

// 학습지 상태 배지는 lib/studio/sheet-products.ts 의 SHEET_STATUS_BADGE **정본을
// 직수입**한다(§3.10.19 E19-5). 초판은 class-worksheets-pane 의 값을 여기에
// 복제했는데, 그러면 같은 문서가 두 표면에서 다른 배지를 달 수 있다(적대 검수
// minor 실적). 순수 상수 모듈이라 표면 간 컴포넌트 의존도 생기지 않는다.
// 미지값은 소비처가 원문 폴백(DB 컬럼이 String — dossier-types.ts 계약).

/** 학습지 행 부재 시 참조 안정 빈 배열(EMPTY_QUEUE_ITEMS 와 같은 근거) */
const EMPTY_SHEET_ROWS: readonly DossierSheetRow[] = [];
/** 착지 글로우 초기값 — 참조 안정 빈 집합(렌더마다 new Set 을 만들지 않게) */
const EMPTY_FRESH_SHEET_IDS: ReadonlySet<string> = new Set<string>();

// 배포 CTA(§3.10.5) — aria-disabled 관용구: 비활에서도 title 사유 툴팁이 뜨게
// native disabled 를 쓰지 않는다(§3.9v2 정본, workbook-generate-modal 계승).
const CTA_BASE =
  "flex items-center justify-center gap-1 rounded-lg text-[11.5px] font-semibold transition-colors";
const CTA_PRIMARY = `${CTA_BASE} bg-blue-600 text-white hover:bg-blue-700`;
const CTA_SECONDARY = `${CTA_BASE} border border-blue-200 bg-white text-blue-700 hover:bg-blue-50`;
const CTA_DISABLED = `${CTA_BASE} cursor-not-allowed bg-slate-100 text-slate-400`;
const CTA_SECONDARY_DISABLED = `${CTA_BASE} cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400`;

// 문항 체크박스(26-08-14 — 선택 → 하단 바 「모바일 배포·시험지 조판」 재료).
// 행 전체가 상세 모달 버튼이라 중첩 인터랙티브 금지 — 행을 div 로 감싸고
// 체크 버튼·상세 버튼을 형제로 나란히 둔다(아래 E11 행 구조 참조).
const PICK_BOX_BASE =
  "flex shrink-0 items-center justify-center rounded-[5px] border transition-colors";
const PICK_BOX_ON = `${PICK_BOX_BASE} border-blue-600 bg-blue-600 text-white`;
const PICK_BOX_OFF = `${PICK_BOX_BASE} border-slate-300 bg-white text-transparent`;

// 학습지 행 우측 액션(§3.10.21 E21-5) — 문항 행 「상세보기」 고스트 버튼과
// **같은 꼴**(평시 조용한 회색, 행 hover 에서 테두리·흰 배경·그림자가 올라옴).
// 같은 카드 안 두 목록의 액션이 다른 얼굴이면 카드가 누더기가 된다는 원칙에
// 따라 토큰까지 맞춘다. 도시에 패널은 좁아(우측 aside) 라벨 텍스트를 붙이면
// 제목이 잘리므로 아이콘 + title/aria-label 로 간다 — 라벨은 행이 아니라 하단
// 실행대(문항 축 DossierPickBar 동형)의 몫이다.
const SHEET_ACTION_BASE =
  "flex size-6 items-center justify-center rounded-md border border-transparent transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400";
const SHEET_ACTION = `${SHEET_ACTION_BASE} cursor-pointer text-slate-300 hover:border-blue-200 hover:bg-white hover:text-blue-600 hover:shadow-sm group-hover:text-slate-400`;
// 비활은 native disabled 를 쓰지 않는다 — 비활 상태에서도 title 사유 툴팁이
// 떠야 한다(§3.9v2 정본, 이 파일 CTA 관용구와 동일).
const SHEET_ACTION_OFF = `${SHEET_ACTION_BASE} cursor-not-allowed text-slate-200`;

/** 조판 대기열 부재 시 참조 안정 빈 Map(EMPTY_QUEUE_ITEMS 와 같은 근거) */
const EMPTY_SHEET_PICKS: ReadonlyMap<string, SheetPickMeta> = new Map<
  string,
  SheetPickMeta
>();

const STATUS_BADGE: Record<
  DossierStudentRow["status"],
  { label: string; cls: string }
> = {
  DONE: {
    label: "완료",
    cls: "shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600",
  },
  IN_PROGRESS: {
    label: "진행 중",
    cls: "shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600",
  },
  ASSIGNED: {
    label: "대기",
    cls: "shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500",
  },
};

/** 분석 상태 배지 — 행동이 필요한 상태만 알린다(§3.10.15 E14: 「분석 완료」
 *  상시 배지는 소음이라 폐기 — 정상 상태는 무배지가 정본).
 *
 *  26-08-15 사용자 지시: 「미분석」 배지도 폐기한다. 분석은 학습 워크북 생성이
 *  알아서 하는 것이라 "아직 안 했다"는 상시 표시는 행동을 못 낳는 소음이었다
 *  (「분석 완료」를 지운 것과 같은 근거). 남는 유일한 배지는 **본문 수정됨** —
 *  이건 "저장된 분석이 지금 본문과 어긋난다"는 실제 행동 신호이고, 행 인라인
 *  지문 수정(§3.10.18 E18-d)으로 본문을 고칠 수 있게 되면서 오히려 더 중요해졌다. */
function analysisBadge(analysis: PassageDossier["analysis"]): {
  label: string;
  cls: string;
} | null {
  if (analysis.stale)
    return { label: "본문 수정됨", cls: "border-rose-200 bg-rose-50 text-rose-600" };
  return null;
}

/** 배정 접힘 카드(§3.9.3-5) — grid-rows 0fr↔1fr 300ms(SenseCard 계보) */
function AssignmentCard({ row }: { row: DossierAssignment }) {
  const [open, setOpen] = useState(false);
  const due = dueInfo(row.dueAt);
  const isWorksheet = row.kind === "WORKSHEET";
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
      >
        <div className="flex items-center gap-1.5">
          <span
            className={
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold " +
              (isWorksheet
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600")
            }
          >
            {isWorksheet ? "학습지" : "문제"}
          </span>
          <span className="min-w-0 flex-1 text-[11.5px] font-semibold leading-snug text-slate-700 break-keep">
            {row.title}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
          <span className="rounded-full border border-slate-200 px-1.5 py-px font-medium text-slate-500">
            {row.className ?? "개별 배정"}
          </span>
          {!isWorksheet && row.questionCount !== null ? (
            <span className="font-medium tabular-nums text-slate-400">
              문항 {row.questionCount}개
            </span>
          ) : null}
          <span className="font-semibold tabular-nums text-slate-600">
            완료 {row.doneCount}/{row.taskCount}
          </span>
          {due ? (
            <span
              className={
                "font-semibold tabular-nums " +
                (due.over ? "text-rose-500" : "text-slate-500")
              }
            >
              {due.label}
            </span>
          ) : null}
        </div>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-slate-100 px-2.5 py-2">
            {isWorksheet ? (
              <div className="flex flex-wrap items-center gap-1">
                {(row.modules ?? []).map((m) => (
                  <span
                    key={m}
                    className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600"
                  >
                    {STUDIO_MODULE_BY_ID.get(m)?.label ?? m}
                  </span>
                ))}
                <span className="ml-auto text-[10.5px] font-semibold tabular-nums text-slate-500">
                  평균 첫 시도 정답률{" "}
                  {row.avgFirstTryPct === null ? "—" : `${row.avgFirstTryPct}%`}
                </span>
              </div>
            ) : null}
            {row.students.length === 0 ? (
              <p className="py-1 text-[11px] text-slate-400">
                배정된 학생이 없습니다
              </p>
            ) : (
              <div className={isWorksheet ? "mt-1.5 space-y-px" : "space-y-px"}>
                {row.students.map((s) => (
                  <div
                    key={s.studentId}
                    // min-h-8: 고정 h-8 이 긴 이름 배지 행과 충돌하지 않게(D2)
                    className="flex min-h-8 items-center gap-2 rounded px-1"
                  >
                    <span
                      className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-slate-700"
                      title={s.name}
                    >
                      {s.name}
                    </span>
                    <span className={STATUS_BADGE[s.status].cls}>
                      {STATUS_BADGE[s.status].label}
                    </span>
                    <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
                      {s.scorePct === null ? "—" : `${s.scorePct}%`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 큐 스트립(§3.10.11-c) — E19-5 로 **한 자리에서 두 자리**가 되며 추출 ──────
// 학습지 계열(kind: modules·exam)은 Sec「학습지」 1층으로, 문항 계열(questions)은
// 스탯 그리드 아래 현행 위치로 갈라져 그려진다. 같은 JSX 를 두 벌 복제하면 시광
// 스윕·라이브 꼬리·배지 분기가 조금씩 갈라지는 것이 시간 문제라, 스펙이 "토큰
// 복제 금지 — 별도 컴포넌트로 추출해 두 자리에서 호출"을 명시한다(§3.10.19 E19-5).
// 아래 두 컴포넌트는 구 인라인 JSX(525-614행)를 **한 글자도 바꾸지 않고** 옮긴 것.

function QueueStripRow({
  item,
  streamStore,
}: {
  item: DossierQueueItem;
  streamStore: StreamTailStore;
}) {
  return (
    <div
      className={
        "relative overflow-hidden rounded-md px-2 py-1.5 " +
        (item.status === "error"
          ? "bg-rose-50"
          : "border border-blue-100 bg-blue-50")
      }
    >
      {item.status === "running" ? (
        <span className="studio-strip-sheen" aria-hidden="true" />
      ) : null}
      <div className="relative flex items-center gap-1.5 text-[11.5px]">
        {item.status === "error" ? (
          <span
            className="size-1.5 shrink-0 rounded-full bg-rose-500"
            aria-hidden="true"
          />
        ) : (
          <Loader2
            className="size-3.5 shrink-0 animate-spin text-blue-500"
            aria-hidden="true"
          />
        )}
        <span
          className={
            "min-w-0 truncate font-semibold " +
            (item.status === "error" ? "text-rose-600" : "text-blue-800")
          }
        >
          {item.label}
        </span>
        {item.badges?.difficulty &&
        DIFFICULTY_LABEL.has(item.badges.difficulty) ? (
          <span
            className={
              "shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold " +
              (item.badges.difficulty === "KILLER"
                ? "bg-rose-100 text-rose-600"
                : "bg-white/80 text-slate-500")
            }
          >
            {DIFFICULTY_LABEL.get(item.badges.difficulty)}
          </span>
        ) : null}
        {/* 26-08-18 난이도 기반 티어: 난이도 뱃지(KILLER rose)가 같은 티어를 말하면 이중 표기라 숨김. */}
        {item.badges?.plan === "PREMIUM" &&
        planForDifficulty(item.badges?.difficulty) !== "PREMIUM" ? (
          <span className="shrink-0 rounded border border-violet-200 bg-violet-50 px-1 py-0.5 text-[10px] font-bold text-violet-700">
            {QUESTION_GENERATION_PLANS.PREMIUM.shortLabel}
          </span>
        ) : null}
        {item.badges?.count ? (
          <span className="shrink-0 text-[10.5px] font-medium tabular-nums text-blue-400">
            {item.badges.count}문항
          </span>
        ) : null}
        {/* stage 는 스트림 라인이 병기 — 스트림 라인이 안 뜨는 경우
            (streamKey 없는 실전 워크북·실패 행)만 1행에 detail 유지 */}
        {(!item.streamKey || item.status === "error") && item.detail ? (
          <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-400">
            {item.detail}
          </span>
        ) : null}
        {/* 스트림 없는 running(실전 워크북 — §3.10.11-c)은 경과만 우측 끝에.
            detail 스팬(flex-1) 공존 시 자유 공간이 0이라 ml-auto 는 0으로
            붕괴해 겹침 없이 그대로 우측 배치된다 — detail 뒤 순서가 전제 */}
        {item.status === "running" && !item.streamKey && item.startedAt ? (
          <span className="ml-auto shrink-0">
            <ElapsedClock fromMs={item.startedAt} />
          </span>
        ) : null}
      </div>
      {/* 실패는 1행 유지(스트림은 이미 종료) — running + streamKey 만 라이브.
          relative: 시광 오버레이(positioned)가 정적 형제 위에 칠해지는
          스태킹을 뒤집어 꼬리 텍스트가 항상 위에 오게 한다 */}
      {item.status === "running" && item.streamKey ? (
        <div className="relative mt-1">
          <QueueStreamLine
            store={streamStore}
            streamKey={item.streamKey}
            fallbackStartedAt={item.startedAt}
          />
        </div>
      ) : null}
    </div>
  );
}

/** 스트립 래퍼 — **패딩은 호출부가 정한다**. 스탯 그리드 아래(카드 본문 직속)는
 *  자기 px-3 pt-2 를 들지만, Sec 안에서는 Sec 이 이미 px-3 py-2.5 를 주므로
 *  간격만 남긴다(panel-primitives.tsx:90). 여기서 패딩을 고정하면 Sec 안에서
 *  좌우 여백이 두 번 먹어 스트립만 안쪽으로 밀려 들어간다. */
function QueueStrip({
  items,
  streamStore,
  className,
}: {
  items: readonly DossierQueueItem[];
  streamStore: StreamTailStore;
  className: string;
}) {
  return (
    <div className={className}>
      {items.map((item) => (
        <QueueStripRow key={item.id} item={item} streamStore={streamStore} />
      ))}
    </div>
  );
}

// ── 완성 학습지 행(§3.10.21 E21-5) — 문항 행(E11)과 **같은 문법** ────────────
// 왜 추출했나: 구 인라인 JSX 는 <Link>/<div> 2분기뿐이라 map 콜백 안에서 끝났지만,
// 체크 실버튼 + 액션 2버튼 + chevron 링크가 붙으면서 DossierBody 본체를 가릴 만큼
// 커졌다(QueueStripRow 추출과 같은 근거 — 이 파일 위쪽 주석).
//
// 구조 계약(문항 행 복제):
//  · 루트 = **무롤 div**. role="checkbox" 를 루트에 두면 ARIA Children
//    Presentational 로 자식 버튼 시맨틱이 죽는다(문항 행 주석과 동일 계약).
//  · 루트에 anchor 를 두지 않는다 — drag-select.tsx:274-288 hardInteractive 의
//    "a" 가 조상에 있으면 마키가 시작조차 못 한다(§3.10.21 E21-5 "전제조건").
//  · `data-drag-item-id` — 지금 이 목록은 DragSelect 밖이라 무동작이지만, 문항
//    목록이 나중에 그랬듯 마키를 씌울 때 행 마크업을 다시 뜯지 않게 미리 심는다.
//    (히트 판정 셀렉터는 drag-select.tsx:267 `[data-drag-item-id]` 단일 축)
//  · 본문 스팬은 버튼이 아니다 — 클릭 토글은 루트가 소유한다.
//
// 【미배선 폴백】 onToggle 이 없으면 구 렌더를 **한 글자도 바꾸지 않고** 낸다.
function SheetRowView({
  row,
  passageId,
  fresh,
  classId,
  checked,
  order,
  deployReason,
  onToggle,
  onDeploy,
  onCompose,
}: {
  row: DossierSheetRow;
  /** 지문 스튜디오 딥링크 경로 재료(도시에는 지문 1건 스코프) */
  passageId: string;
  fresh: boolean;
  /** 클래스 미선택이면 딥링크 경로를 만들 수 없다 → chevron 미렌더(구 분기 의미 보존) */
  classId: string | undefined;
  checked: boolean;
  /** 체크 순번(= 조판 순서). 미체크면 undefined */
  order: number | undefined;
  /** 배포 불가 사유(canDeployWorksheetRow) — null = 배포 가능 */
  deployReason: string | null;
  onToggle?: () => void;
  onDeploy?: () => void;
  onCompose?: () => void;
}) {
  const status = SHEET_STATUS_BADGE.get(row.status) ?? {
    label: row.status,
    cls: "border-slate-200 bg-slate-50 text-slate-500",
  };
  const planLabel = SHEET_PLAN_LABEL.get(row.planMarker) ?? row.planMarker;
  // 행 본문 5조각 — 구/신 렌더가 **같은 내용**을 내도록 한 번만 쓴다.
  const inner = (
    <>
      <FileText className="size-3.5 shrink-0 text-blue-500" aria-hidden="true" />
      <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
        {planLabel}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-700">
        {row.title}
      </span>
      <span
        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${status.cls}`}
      >
        {status.label}
      </span>
      <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
        {fmtDateTime(row.updatedAt)}
      </span>
    </>
  );

  // ── 신 렌더 본문 = **2단 구조**(§3.10.17-d v2.2 평면 행 정본과 동일 문법) ──
  // 1단 행(구 `inner`)을 그대로 쓰면 좁은 도시에 패널에서 **제목이 0px 로 소멸**한다.
  // 실측(26-08-18, aside 360px / 행 309px): 체크 26 + 아이콘 14 + 종류 배지 76 +
  // 상태 배지 44 + 일시 50 + 액션 3개 90 + gap = 309 를 이미 채워, flex-1 인 제목이
  // 정확히 **0px** 이 됐다(폭 560px 로 넓히면 139px 로 회복 — 폭 의존 붕괴 확정).
  // 문항 행은 제목이 「어법 판단」 같은 짧은 유형명(55px)이라 같은 1단 구조로 살아남지만,
  // 학습지 행의 제목은 문서 제목(장문)이라 같은 구조를 쓸 수 없다.
  // → 스펙이 이미 정한 2단 문법으로 간다: **1줄 = 제목 단독**(행 폭 전부, 무경쟁),
  //   2줄 = 종류·상태 배지 ─ 일시(우측 고정). 액션 열은 두 줄에 걸쳐 self-stretch.
  const innerStacked = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <FileText className="size-3.5 shrink-0 text-blue-500" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-700">
          {row.title}
        </span>
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1">
        <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
          {planLabel}
        </span>
        <span
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${status.cls}`}
        >
          {status.label}
        </span>
        {/* 빈 스페이서가 제목과 자유 폭을 반분하는 §3.8.11 #17-② 함정을 피해,
            2줄에서만 flex-1 을 쓴다(이 줄에는 flex-1 경쟁자가 없다). */}
        <span className="min-w-0 flex-1" aria-hidden="true" />
        <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
          {fmtDateTime(row.updatedAt)}
        </span>
      </span>
    </>
  );

  // ── 구 렌더(미배선) — 구 코드 그대로. 신규 prop 이 오기 전엔 바이트 동일 ──
  if (!onToggle) {
    const rowCls =
      "group flex items-center gap-1.5 rounded-md px-1 py-1.5 transition-colors " +
      (fresh
        ? "studio-fresh-glow bg-blue-50/50 hover:bg-blue-50"
        : "hover:bg-slate-50");
    return classId ? (
      <Link
        href={`/director/studio/c/${classId}/p/${passageId}`}
        title={`${row.title} — 지문 스튜디오에서 열기`}
        className={`${rowCls} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400`}
      >
        {inner}
        <ChevronRight
          className="size-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500"
          aria-hidden="true"
        />
      </Link>
    ) : (
      <div className={rowCls} title={row.title}>
        {inner}
      </div>
    );
  }

  return (
    <div
      data-drag-item-id={row.reportId}
      onClick={onToggle}
      className={
        "group flex w-full cursor-pointer items-center rounded-md transition-colors " +
        (checked
          ? "bg-blue-50/70 ring-1 ring-inset ring-blue-100"
          : fresh
            ? "studio-fresh-glow bg-blue-50/50 hover:bg-blue-50"
            : "hover:bg-slate-50")
      }
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`${planLabel} 학습지 「${row.title}」 선택`}
        title={
          order !== undefined
            ? `체크 순서 ${order}번 — 학습지 조판 순서`
            : "체크하면 학습지 조판에 이 순서로 이어붙습니다"
        }
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex shrink-0 cursor-pointer items-center self-stretch py-1.5 pl-1.5 pr-1"
      >
        <span
          className={
            (checked
              ? PICK_BOX_ON
              : `${PICK_BOX_OFF} group-hover:border-blue-400`) + " size-4"
          }
        >
          {order !== undefined && order <= 99 ? (
            // 체크 순서 = 조판 순서 시각화(문항 행과 동일 문법)
            <span className="text-[9px] font-bold leading-none tabular-nums">
              {order}
            </span>
          ) : checked ? (
            <Check className="size-3" strokeWidth={3} aria-hidden="true" />
          ) : null}
        </span>
      </button>
      {/* 본문 = 무버튼 스팬(마키 시작면). 클릭 토글은 루트가 소유.
          2단(flex-col)이라 제목 줄이 행 폭을 독점한다 — 위 innerStacked 주석의 실측 근거. */}
      <span className="flex min-w-0 flex-1 flex-col justify-center py-1.5 pr-1 text-left">
        {innerStacked}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 self-stretch py-1 pl-0.5 pr-1">
        {/* [모바일 배포] — **행 1건**을 지목한다. 이 카드에는 이미 카드 단위
            「학습지 보내기」 CTA(formKind "worksheet")가 있어 의미가 겹쳐 보이지만
            대상이 다르다: 그쪽은 이 지문의 **학습 모듈 묶음**(DossierDeployInline 이
            readyModules 를 재료로 요구 — 이 파일 CTA 주석의 두 축 설명)을 한
            과제로 보내고, 이쪽은 **이 문서 한 건**을 보낸다. 기존 CTA 는 손대지
            않고(§3.10.21 은 행 축만 개편한다) title 자구로만 구분한다.
            비활 사유는 sheet-deploy-eligibility 정본 문자열을 그대로 쓴다.
            §M off 면 이 버튼만 미렌더 — 형제 [학습지 조판]·chevron 이 우측
            클러스터를 자연 수축시킨다. */}
        {SHOW_MOBILE ? (
        <button
          type="button"
          data-drag-select-ignore="true"
          aria-disabled={deployReason !== null}
          aria-label={`${row.title} 모바일 배포`}
          title={
            deployReason ??
            "이 학습지 한 건을 모바일로 보냅니다 — 카드 위 「학습지 보내기」는 이 지문의 학습 모듈을 묶어 보내는 다른 통로입니다"
          }
          onClick={(e) => {
            e.stopPropagation();
            if (deployReason !== null) return;
            onDeploy?.();
          }}
          className={deployReason !== null ? SHEET_ACTION_OFF : SHEET_ACTION}
        >
          <Smartphone className="size-3" aria-hidden="true" />
        </button>
        ) : null}
        {/* [학습지 조판] — 같은 이름의 [학습지 조판] 뷰로 전환하고 우측 그 자리에
            조판을 연다(§3.10.21 E21-5 · 필 명칭은 E24 §3.10.23, 문항 축
            「시험지 조판」과 동형). 대기열이 있으면 그 순서를 그대로 살리고 이 행만
            뒤에 붙인다 — 자세한 규칙은 호출부(DossierBody.composeIdsWith) 주석 참조. */}
        <button
          type="button"
          data-drag-select-ignore="true"
          aria-label={`${row.title} 학습지 조판`}
          title="[학습지 조판] 화면 우측에서 조판을 엽니다 — 체크한 학습지가 있으면 그 순서 뒤에 이 학습지가 이어붙습니다"
          onClick={(e) => {
            e.stopPropagation();
            onCompose?.();
          }}
          className={SHEET_ACTION}
        >
          <LayoutTemplate className="size-3" aria-hidden="true" />
        </button>
        {/* 지문 스튜디오 이동 — 구 행 전체 클릭의 잔존 출구(근육기억 보존).
            classId 없으면 경로를 만들 수 없어 미렌더(구 분기 의미 그대로). */}
        {classId ? (
          <Link
            href={`/director/studio/c/${classId}/p/${passageId}`}
            data-drag-select-ignore="true"
            onClick={(e) => e.stopPropagation()}
            aria-label={`${row.title} 지문 스튜디오에서 열기`}
            title={`${row.title} — 지문 스튜디오에서 열기`}
            className={SHEET_ACTION}
          >
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </span>
    </div>
  );
}

// ── 펼침 본문 — 스탯 그리드 → 생성 중 스트립(§3.10.11-c) → CTA 행 → 인라인 폼
//    (§3.10.5) → 학습지(E19-5) → 문제(E11) → 배정 → 각주 ──

function DossierBody({
  dossier,
  assignmentsError,
  queueItems,
  streamStore,
  freshIds,
  formKind,
  deployTarget,
  pickedIds,
  onTogglePick,
  onPickRows,
  pickedSheets,
  onToggleSheetPick,
  onDeploySheet,
  onComposeSheets,
  onRetry,
  onOpenQuestion,
  onToggleForm,
  onDeployed,
}: {
  dossier: PassageDossier;
  assignmentsError: string | null;
  queueItems: readonly DossierQueueItem[];
  streamStore: StreamTailStore;
  /** 방금 생성 문항 id(이 지문 — §3.10.11-e v2) — 부재 = 세션 내 신규 없음 */
  freshIds: ReadonlySet<string> | undefined;
  formKind: DeployFormKind | null;
  deployTarget: StudioDeployTarget | null;
  /** 하단 바 선택 상태(26-08-14) — 아코디언(호스트) 소유, 전 지문 공용 집합 */
  pickedIds: ReadonlySet<string>;
  onTogglePick: (questionId: string, meta: PickedQuestionMeta) => void;
  /** 전체 선택/해제 — 필터로 표시 중인 행만 대상으로 한다 */
  onPickRows: (
    entries: readonly (readonly [string, PickedQuestionMeta])[],
    pick: boolean,
  ) => void;
  /** 학습지 조판 대기열(§3.10.21 E21-5) — 삽입 순서 = 조판 순서. 전 지문 공용 */
  pickedSheets: ReadonlyMap<string, SheetPickMeta>;
  onToggleSheetPick?: (reportId: string, meta: SheetPickMeta) => void;
  onDeploySheet?: (meta: SheetPickMeta) => void;
  onComposeSheets?: (reportIds: string[]) => void;
  onRetry: () => void;
  onOpenQuestion: (questionId: string) => void;
  onToggleForm: (kind: DeployFormKind) => void;
  onDeployed: (passageId: string) => void;
}) {
  const { analysis, questions, assignments } = dossier;
  const readySet = new Set<string>(analysis.readyModules);
  // 보유 모듈 칩(E19-5 3층) — 미보유 회색 칩은 폐기했으므로 보유분만 남긴다.
  // 순서는 서버 배열이 아니라 STUDIO_MODULES 정본 순서를 따른다(칩 순서가
  // 지문마다 달라 보이면 같은 카드가 매번 다른 물건처럼 읽힌다).
  const readyChips = STUDIO_MODULES.filter(
    (m) => m.id !== "exam" && readySet.has(m.id),
  );
  // 서버 계약상 필수 필드지만(§3.10.19 E19-6) 구 응답 캐시가 남아 있어도 행이
  // 사라질 뿐 카드가 죽지 않게 참조 안정 빈 배열로 폴백한다.
  const sheetRows = dossier.sheets ?? EMPTY_SHEET_ROWS;
  const maxTypeCount = questions.byType.reduce((m, t) => Math.max(m, t.count), 0);
  // 큐 축 분리(§3.10.19 E19-5 마지막 문단) — 학습지와 문제는 다른 산출물이라
  // 한 자리에 섞으면 사용자가 "내 학습지가 어디 갔나"를 다시 묻게 된다.
  // 문항 계열은 현행 위치(스탯 그리드 아래)에, 학습지 계열(modules·exam)은
  // Sec「학습지」 1층에 각각 같은 QueueStrip 으로 그린다.
  const questionQueueItems = queueItems.filter((i) => i.kind === "questions");
  const sheetQueueItems = queueItems.filter((i) => i.kind !== "questions");

  // ── 방금 착지한 학습지 글로우(E19-5 2층) ──────────────────────────────────
  // 문항 행 선례(freshIds)는 오케스트레이터가 재조회 diff 로 내려 주지만 학습지
  // 축에는 그런 prop 이 없고, 이 판은 **새 props 를 추가할 수 없다**(memo·시그니처
  // 메모 방어선 — 파일 말미 주석). 그래서 같은 판 안에서 reportId 집합의 증분만
  // 본다: 완료 → 오케스트레이터의 조용한 재조회(§3.10.19 E19-7)로 sheets 가
  // 갈리는 순간 새로 등장한 행만 글로우가 붙는다. 최초 마운트분은 "직전 = 현재"로
  // 시작하므로 절대 글로우하지 않는다(거짓 신규 방지). 렌더 중 조건부 setState 는
  // 이 파일이 이미 두 번 쓰는 "이전 렌더 정보 보관" 공인 패턴이고, 렌더 중
  // Date.now() 를 부르지 않으므로 React Compiler 순수성도 지킨다.
  const sheetIdKey = sheetRows.map((r) => r.reportId).join("|");
  const [prevSheetIdKey, setPrevSheetIdKey] = useState(sheetIdKey);
  const [freshSheetIds, setFreshSheetIds] =
    useState<ReadonlySet<string>>(EMPTY_FRESH_SHEET_IDS);
  if (sheetIdKey !== prevSheetIdKey) {
    const before = new Set(
      prevSheetIdKey === "" ? [] : prevSheetIdKey.split("|"),
    );
    const added = sheetRows
      .map((r) => r.reportId)
      .filter((id) => !before.has(id));
    setPrevSheetIdKey(sheetIdKey);
    if (added.length > 0)
      setFreshSheetIds(new Set([...freshSheetIds, ...added]));
  }

  // ── 학습지 체크·액션 재료(§3.10.21 E21-5) ─────────────────────────────────
  // DossierSheetRow 에는 passageId/passageTitle 이 없다(도시에는 지문 1건
  // 스코프라 서버가 안 싣는다 — dossier-types.ts:83-91). 픽 메타 정본
  // (SheetPickMeta)은 두 필드를 요구하므로 dossier.passage 에서 채운다.
  // 이 값이 정확해야 하는 이유: 저장 PATCH 경로와 모바일 배포가 reportId 가
  // 아니라 **passageId** 로 흐른다(sheet-pick-types.ts:33-40).
  const sheetMeta = (row: DossierSheetRow): SheetPickMeta => ({
    reportId: row.reportId,
    passageId: dossier.passage.id,
    title: row.title,
    passageTitle: dossier.passage.title,
    planMarker: row.planMarker,
    status: row.status,
  });
  // 체크 순번 = 조판 순서. pickedSheets 는 전 지문 공통이라 번호도 지문 경계를
  // 넘어 이어진다(문항 축 orderById 와 동일 계약).
  const sheetOrderById = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const id of pickedSheets.keys()) m.set(id, ++i);
    return m;
  }, [pickedSheets]);
  // 행 [학습지 조판] 이 넘길 id 배열 — **대기열을 파괴하지 않는다**.
  // ① 이 행이 이미 체크돼 있으면 대기열 순서 그대로.
  // ② 아니면 대기열 뒤에 이 행을 덧붙인다(체크 없이 눌러도 1건 조판이 성립하고,
  //    다른 지문에서 이미 고른 문서가 조용히 증발하지 않는다).
  // 상한(SHEET_COMPOSE_MAX_DOCS=6) 초과 판정·안내는 오케스트레이터 소관이다 —
  // 행은 "무엇을 조판할지"만 말하고 "되는지"는 말하지 않는다(문항 축에서 상한
  // 안내를 실행대가 지는 것과 같은 분업, dossier-pick-bar.tsx:328-336).
  const composeIdsWith = (reportId: string): string[] => {
    const ids = [...pickedSheets.keys()];
    return ids.includes(reportId) ? ids : [...ids, reportId];
  };

  const deployDisabled = analysis.readyModules.length === 0 && !analysis.hasExam;
  const composeDisabled = questions.total === 0;

  // 인라인 폼 지연 마운트 — 한 번 열린 종별은 접혀도 마운트를 유지해 0fr 접힘
  // 애니메이션과 입력 상태를 보존한다(아코디언 본문 상시 마운트 관용구 동형).
  // 최초부터 마운트하지 않는 이유: 닫힌 카드에서 폼의 미리보기 구독(서버 액션)
  // 이 발화하지 않게(§3.10.9 함정 2 방어). 렌더 중 조건부 setState 는
  // "이전 렌더 정보 보관" 공인 패턴(react.dev/reference/react/useState).
  const [lastFormKind, setLastFormKind] = useState<DeployFormKind | null>(null);
  if (formKind !== null && formKind !== lastFormKind) setLastFormKind(formKind);
  const mountedFormKind = formKind ?? lastFormKind;

  // ── 생성된 문제 필터·유형 분포 접기(26-08-12 지시 — "제대로 필터링") ──
  // 카드 본문은 상시 마운트(0fr 접힘)라 지문별로 세션 내 유지된다. 유형 매칭은
  // 행 라벨과 같은 함수(questionRowTypeLabel — 서버 byType 라벨 미러)로 판정.
  const [chartOpen, setChartOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [diffFilter, setDiffFilter] = useState<string>("all");
  const [approvedFilter, setApprovedFilter] = useState<
    "all" | "approved" | "pending"
  >("all");
  const filterActive =
    typeFilter !== null || diffFilter !== "all" || approvedFilter !== "all";
  const filteredRows = questions.rows.filter(
    (r) =>
      (typeFilter === null ||
        questionRowTypeLabel(r.type, r.subType) === typeFilter) &&
      (diffFilter === "all" || r.difficulty === diffFilter) &&
      (approvedFilter === "all" ||
        (approvedFilter === "approved" ? r.approved : !r.approved)),
  );
  const resetFilters = () => {
    setTypeFilter(null);
    setDiffFilter("all");
    setApprovedFilter("all");
  };

  // ── 문항 체크(26-08-14) — 하단 바(모바일 배포·시험지 조판) 재료 조립 ──────
  // 메타는 행과 같은 라벨 함수로 뽑아 바 요약 칩과 행 표기가 어긋나지 않게 한다.
  const rowMeta = (r: DossierQuestionRow): PickedQuestionMeta => ({
    passageId: dossier.passage.id,
    passageTitle: dossier.passage.title,
    typeLabel: questionRowTypeLabel(r.type, r.subType),
    difficulty: r.difficulty,
    premium: r.premium,
  });
  const pickedInFiltered = filteredRows.reduce(
    (n, r) => n + (pickedIds.has(r.id) ? 1 : 0),
    0,
  );
  const allFilteredPicked =
    filteredRows.length > 0 && pickedInFiltered === filteredRows.length;

  // ── 마키(드래그) 선택(§3.10.17-e (l)) — 평면 목록과 같은 문법. DragSelect 는
  // 자기 컨테이너(root) 안의 카드만 히트로 잡는다. 2026-08-20 누적 개편 **전에는**
  // next 가 빈 집합에서 시작해, 그대로 커밋하면 다른 지문 카드의 선택이 통째로
  // 날아갔다(아코디언은 지문마다 이 판이 하나씩). 지금은 next 가 기존 선택을 품고
  // 오므로 그 사고는 원리적으로 막혔지만, 스코프(이 지문의 표시 행) 안쪽만 diff 해
  // add/remove 2콜로 반영하는 구조는 그대로 둔다 — 이 판이 건드릴 수 있는 것은 자기
  // 지문의 행뿐이라는 불변식을 코드로 못 박는 방어선이다. 둘 다 함수형 업데이터라
  // 순차 합성이 안전하고, Map 삽입 순서(=조판 순서)는 add 순서로 보존된다.
  const dragValue = useMemo(() => new Set(pickedIds), [pickedIds]);
  // 체크 순서 = 조판 순서(§3.10.13) 시각화 — pickedIds 는 전 지문 공통 집합이라
  // 번호도 지문 경계를 넘어 이어진다(하단 바·조판이 그 순서로 싣는다).
  const orderById = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const id of pickedIds) m.set(id, ++i);
    return m;
  }, [pickedIds]);
  const commitDragSelection = (next: Set<string>) => {
    const add: (readonly [string, PickedQuestionMeta])[] = [];
    const remove: (readonly [string, PickedQuestionMeta])[] = [];
    for (const r of filteredRows) {
      const want = next.has(r.id);
      const has = pickedIds.has(r.id);
      if (want && !has) add.push([r.id, rowMeta(r)] as const);
      else if (!want && has) remove.push([r.id, rowMeta(r)] as const);
    }
    if (remove.length > 0) onPickRows(remove, false);
    if (add.length > 0) onPickRows(add, true);
  };

  return (
    <div>
      {/* 스탯 그리드 — lemma 토큰(gap-px rounded-lg border). §M off 면 「배정」
          (모바일 과제) 칩을 빼고 2열로 접는다 — 빈 반칸 잔재 금지. */}
      <div className="px-3 pt-2.5">
        <div
          className={`grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 ${SHOW_MOBILE ? "grid-cols-3" : "grid-cols-2"}`}
        >
          {(
            // E19-5: 「학습 모듈 N/7」 폐기 — 7 고정 분모는 모듈 체크박스
            // 시절의 유물이라 학습지 상품 축과 어긋난다(§3.10.19).
            SHOW_MOBILE
              ? ([
                  ["학습지", String(sheetRows.length)],
                  ["문제", String(questions.total)],
                  ["배정", assignmentsError ? "—" : String(assignments.length)],
                ] as const)
              : ([
                  ["학습지", String(sheetRows.length)],
                  ["문제", String(questions.total)],
                ] as const)
          ).map(([label, value]) => (
            <div key={label} className="bg-white px-2 py-1.5">
              <p className="text-[10.5px] font-semibold text-slate-400">
                {label}
              </p>
              <p className="mt-0.5 text-[14px] font-bold leading-tight tabular-nums text-slate-900">
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 큐 스트립 v2(§3.10.11-c) — **문항 계열 전용 자리**(E19-5). 학습지 계열은
          아래 Sec「학습지」 1층으로 이사했다: 학습지와 문제는 다른 산출물이라 한
          자리에 섞으면 "내 학습지가 어디 갔나"를 다시 묻게 된다(§3.10.19 E19-5
          마지막 문단). 표시 전용은 불변 — 재시도·발사는 발사 지점 소관, 완료
          회수는 오케스트레이터 소관. 행 내부(정적 배지 1행 + 라이브 꼬리 2행 ·
          시광 스윕 · 톤)는 QueueStripRow 로 옮겼을 뿐 그대로다 */}
      {questionQueueItems.length > 0 ? (
        <QueueStrip
          items={questionQueueItems}
          streamStore={streamStore}
          className="space-y-1 px-3 pt-2"
        />
      ) : null}

      {/* 배포 CTA 행(§3.10.5) — 모달 폐기, 인라인 폼 토글 트리거(재클릭 접기).
          활성 판정은 v2 승계: aria-disabled + onClick 초입 return + title 사유.
          §M off 면 px-3 래퍼째 미렌더 — 카드 하단이 자연스럽게 닫힌다 */}
      {SHOW_MOBILE ? (
      <div className="px-3 pb-2.5 pt-2">
        <div className="grid h-8 grid-cols-2 gap-1.5">
          <button
            type="button"
            aria-disabled={deployDisabled}
            aria-expanded={formKind === "worksheet"}
            // 사유 문구는 상태별로 가른다 — 이 카드의 두 축이 서로 다르기 때문:
            // 문서 축(스탯 「학습지 N」·Sec「학습지」 행)은 PRIME 계열 **전량**을
            // 세지만(actions/studio/dossier.ts:217 generationPlan in
            // PRIME_REPORT_MARKERS), 배포 축(deployDisabled → readyModules)은 같은
            // 파일 161-171 의 findFirst(PRIME_REPORT_MARKER) **단일 마커** 파싱에서만
            // 나온다. 그래서 파이널 원페이지·국어 워크북만 만든 지문은 행이 착지한
            // 채로 배포가 잠기고, 방금 학습지를 만든 사용자에게 "분석하라"고 말하는
            // 정면 모순이 된다. 게이트 술어는 그대로 둔다(DossierDeployInline 이
            // readyModules 를 실제 재료로 요구) — 잠긴 이유만 사실대로 바꾼다.
            // 실측 근거의 사각: `.tmp-studio-qa/shots-ws-launch/02-landed.png` 는
            // 영어 basic 정상 경로라 두 축이 같이 서 모순이 찍히지 않는다 — 모순은
            // 파이널·국어 축 전용이다.
            title={
              deployDisabled
                ? sheetRows.length > 0
                  ? "파이널 원페이지·국어 워크북은 인쇄용 학습지라 모바일 배포 대상이 아닙니다 — 기본 학습지를 만들면 보낼 수 있습니다"
                  : "AI 분석 후 배포할 수 있습니다"
                : undefined
            }
            onClick={() => {
              if (deployDisabled) return;
              onToggleForm("worksheet");
            }}
            className={deployDisabled ? CTA_DISABLED : CTA_PRIMARY}
          >
            <Send className="size-3.5 shrink-0" aria-hidden="true" />
            학습지 보내기
          </button>
          <button
            type="button"
            aria-disabled={composeDisabled}
            aria-expanded={formKind === "questions"}
            title={composeDisabled ? "생성된 문제가 없습니다" : undefined}
            onClick={() => {
              if (composeDisabled) return;
              onToggleForm("questions");
            }}
            className={composeDisabled ? CTA_SECONDARY_DISABLED : CTA_SECONDARY}
          >
            <ListChecks className="size-3.5 shrink-0" aria-hidden="true" />
            문제 보내기
          </button>
        </div>
      </div>
      ) : null}

      {/* 인라인 배포 폼(§3.10.5) — grid-rows 0fr↔1fr 3중 래퍼 관용구.
          대상은 좌측 레일(deployTarget) 읽기 전용, 성공 시 접힘은 onDeployed
          경유로 아코디언 본체(openForm)가 수행한다.
          §M off 면 래퍼째 미렌더(접힘 잔재·탭 스톱 금지) — 트리거(CTA 행)도
          함께 사라져 formKind 는 어떤 경로로도 갱신되지 않는다 */}
      {SHOW_MOBILE ? (
      <div
        className={`grid transition-[grid-template-rows] duration-300 ${formKind ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          {mountedFormKind ? (
            <div className="px-3 pb-3">
              <DossierDeployInline
                mode={mountedFormKind}
                dossier={dossier}
                target={deployTarget}
                onDeployed={onDeployed}
              />
            </div>
          ) : null}
        </div>
      </div>
      ) : null}

      {/* E19-5(§3.10.19) — 구 Sec「학습 모듈」(회색 미보유 칩 7개 벽)의 대체물.
          위→아래 3층: ① 생성 큐(학습지 계열) ② 완성 학습지 착지 행 ③ 보유 모듈
          미리보기 칩. 셋 다 비면 한 줄 빈 상태만 남는다 — 회색 칩 7개를 되살리지
          않는다(그것이 이 개편이 없앤 소음이다). 헤더 action(마지막 분석 시각)만
          현행 그대로 승계한다 */}
      <Sec
        title="학습지"
        action={
          analysis.lastAnalyzedAt ? (
            <span
              className="text-[10.5px] tabular-nums text-slate-400"
              title="마지막 AI 분석 시각"
            >
              분석 {fmtDateTime(analysis.lastAnalyzedAt)}
            </span>
          ) : undefined
        }
      >
        {sheetQueueItems.length === 0 &&
        sheetRows.length === 0 &&
        readyChips.length === 0 &&
        !analysis.hasExam ? (
          <p className="py-1 text-[11.5px] leading-relaxed text-slate-400 break-keep">
            아직 만든 학습지가 없습니다
          </p>
        ) : (
          <>
            {/* ① 생성 큐 — Sec 이 이미 px-3 을 주므로 간격 클래스만 넘긴다 */}
            {sheetQueueItems.length > 0 ? (
              <QueueStrip
                items={sheetQueueItems}
                streamStore={streamStore}
                className="space-y-1"
              />
            ) : null}

            {/* ② 완성 학습지 — 큐 항목이 사라진 자리로 "들어와지는" 층.
                행 골격·타이포·hover 는 아래 문항 행(E11)과 같은 계열로 맞춘다
                (같은 카드 안에서 두 목록이 다른 문법이면 카드가 누더기가 된다).
                E21-5(§3.10.21): 행 클릭이 **조판 선택 토글**로 바뀌고 지문
                스튜디오 이동은 우측 chevron 링크로 내려간다 — 근거·구조 계약은
                SheetRowView 상단 주석. 배선 전(신규 prop 미전달)에는 구 렌더
                (행 전체 <Link>, classId 없으면 정적 div)가 그대로 나온다. */}
            {sheetRows.length > 0 ? (
              <div className={sheetQueueItems.length > 0 ? "mt-1.5" : undefined}>
                <div className="space-y-1">
                  {sheetRows.map((row) => {
                    // 배포 게이트는 정본 1곳에서만(§3.10.21 E21-5) — PRIME 외는
                    // deploy.ts 가 passageId 로 PRIME 행을 재조회하다 실패해
                    // "먼저 AI 분석을 완료해 주세요"라는 오해를 부른다.
                    const eligibility = canDeployWorksheetRow(row.planMarker);
                    return (
                      <SheetRowView
                        key={row.reportId}
                        row={row}
                        passageId={dossier.passage.id}
                        fresh={freshSheetIds.has(row.reportId)}
                        classId={deployTarget?.classId}
                        checked={pickedSheets.has(row.reportId)}
                        order={sheetOrderById.get(row.reportId)}
                        deployReason={eligibility.ok ? null : eligibility.reason}
                        onToggle={
                          onToggleSheetPick
                            ? () => onToggleSheetPick(row.reportId, sheetMeta(row))
                            : undefined
                        }
                        onDeploy={
                          onDeploySheet
                            ? () => onDeploySheet(sheetMeta(row))
                            : undefined
                        }
                        onCompose={
                          onComposeSheets
                            ? () => onComposeSheets(composeIdsWith(row.reportId))
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* (E25-6 §3.10.24) 구 ③ 「미리보기」 모듈 칩 층(D4→E19-5 3층)은 지시로
                **폐기** — ModulePreviewSheet 배관(시트 상태·onPreviewModule 사슬)째
                걷어냈다. readyChips 는 위 빈 상태 판정이 계속 쓴다. 되살릴 일이
                생기면 지문 스튜디오(passage-studio-client)의 미리보기가 정본이다. */}
          </>
        )}
      </Sec>

      <Sec
        title="생성된 문제"
        action={
          questions.total > 0 ? (
            <span className="text-[10.5px] tabular-nums text-slate-400">
              검수완료 {questions.approvedCount}/{questions.total}
            </span>
          ) : undefined
        }
      >
        {questions.total === 0 ? (
          <p className="py-1 text-[11.5px] leading-relaxed text-slate-400 break-keep">
            생성된 문제가 없습니다
          </p>
        ) : (
          <>
            {/* 필터 바(26-08-12 지시) — 유형(byType 라벨)·난이도·검수 3셀렉트.
                판정은 행 렌더와 같은 라벨/필드라 서버 왕복 없음(클라 필터). */}
            <div className="flex items-center gap-1">
              <select
                aria-label="유형 필터"
                value={typeFilter ?? ""}
                onChange={(e) => setTypeFilter(e.target.value || null)}
                className="h-7 min-w-0 flex-[1.4] cursor-pointer rounded-md border border-slate-200 bg-white px-1 text-[11px] text-slate-600 outline-none focus:border-blue-400"
              >
                <option value="">전체 유형</option>
                {questions.byType.map((t) => (
                  <option key={t.label} value={t.label}>
                    {t.label} ({t.count})
                  </option>
                ))}
              </select>
              <select
                aria-label="난이도 필터"
                value={diffFilter}
                onChange={(e) => setDiffFilter(e.target.value)}
                className="h-7 min-w-0 flex-1 cursor-pointer rounded-md border border-slate-200 bg-white px-1 text-[11px] text-slate-600 outline-none focus:border-blue-400"
              >
                <option value="all">전체 난이도</option>
                {DIFFICULTY_LEVELS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="검수 상태 필터"
                value={approvedFilter}
                onChange={(e) =>
                  setApprovedFilter(
                    e.target.value as "all" | "approved" | "pending",
                  )
                }
                className="h-7 min-w-0 flex-1 cursor-pointer rounded-md border border-slate-200 bg-white px-1 text-[11px] text-slate-600 outline-none focus:border-blue-400"
              >
                <option value="all">전체 검수</option>
                <option value="approved">검수완료</option>
                <option value="pending">미검수</option>
              </select>
            </div>

            {/* 유형 분포 — 접이식(기본 접힘, 26-08-12 지시 — 세로 공간 절약).
                라벨 클릭 = 그 유형으로 필터 토글(차트가 필터 진입점을 겸한다). */}
            <button
              type="button"
              aria-expanded={chartOpen}
              onClick={() => setChartOpen((v) => !v)}
              className="mt-1.5 flex w-full cursor-pointer items-center gap-1 rounded-md px-1 py-1 text-left transition-colors hover:bg-slate-50"
            >
              <span className="text-[11px] font-semibold text-slate-500">
                유형 분포
              </span>
              <span className="text-[10.5px] tabular-nums text-slate-400">
                {questions.byType.length}종
              </span>
              <ChevronDown
                className={`ml-auto size-3.5 shrink-0 text-slate-300 transition-transform duration-300 ${chartOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-300 ${chartOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="min-h-0 overflow-hidden">
                {/* 라벨 열은 그리드 공유 컬럼(auto) — 가장 긴 라벨("요약문
                    완성(객관식)" 등)에 맞춰 절단 없이 늘고 바 시작점은 전 행
                    정렬 유지(구 w-[72px] truncate 폐기). 160px 캡은 병적 라벨의
                    마지막 방어선(% 캡은 auto 트랙에서 순환이라 무효). */}
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-1 pb-1 pt-0.5">
                  {questions.byType.map((t) => (
                    <Fragment key={t.label}>
                      <button
                        type="button"
                        onClick={() =>
                          setTypeFilter((cur) =>
                            cur === t.label ? null : t.label,
                          )
                        }
                        title={
                          typeFilter === t.label
                            ? "유형 필터 해제"
                            : `「${t.label}」만 보기`
                        }
                        className={
                          "max-w-[160px] cursor-pointer truncate whitespace-nowrap text-left text-[11px] transition-colors " +
                          (typeFilter === t.label
                            ? "font-semibold text-blue-600"
                            : "text-slate-500 hover:text-slate-700")
                        }
                      >
                        {t.label}
                      </button>
                      <span className="h-[7px] min-w-0 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className="block h-full rounded-full bg-blue-500"
                          style={{
                            width: `${maxTypeCount > 0 ? (t.count / maxTypeCount) * 100 : 0}%`,
                          }}
                        />
                      </span>
                      <span className="min-w-6 text-right text-[11px] font-semibold tabular-nums text-slate-600">
                        {t.count}
                      </span>
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
            {/* E11(§3.10.11-e): 1줄 행 — 유형·난이도·프리미엄·검수완료·생성일시.
                문두는 title 툴팁으로만(같은 지문 문항끼리 문두는 변별력 없음).
                방금/최근 생성분(§3.10.11-e v2)은 은은한 글로우로 구분 — 세션 diff
                (freshIds) ∪ 최근 30분(createdAt — 새로고침 직후 폴백). 글로우는
                space-y-px 이웃과 겹치지 않게 링 반경을 작게 유지한 keyframes.
                26-08-14: 행 앞 체크박스 — 행 전체가 상세 모달 버튼이라 중첩
                인터랙티브 금지, div 래퍼 안에 체크 버튼·상세 버튼을 형제로 둔다.
                체크분은 하단 바(모바일 배포·시험지 조판)로 흐른다. */}
            <div className="mt-2 border-t border-slate-100 pt-1.5">
              {filteredRows.length > 0 ? (
                <div className="flex items-center justify-between gap-2 px-1 pb-1">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={
                      allFilteredPicked
                        ? "true"
                        : pickedInFiltered > 0
                          ? "mixed"
                          : "false"
                    }
                    title={
                      SHOW_MOBILE
                        ? "체크한 문항은 하단 바에서 모바일 배포·시험지 조판으로 이어집니다"
                        : "체크한 문항은 하단 바에서 시험지 조판으로 이어집니다"
                    }
                    onClick={() =>
                      onPickRows(
                        filteredRows.map((r) => [r.id, rowMeta(r)] as const),
                        !allFilteredPicked,
                      )
                    }
                    className="flex cursor-pointer items-center gap-1.5 rounded-md px-0.5 py-1 transition-colors hover:bg-slate-50"
                  >
                    <span
                      className={
                        (pickedInFiltered > 0 ? PICK_BOX_ON : PICK_BOX_OFF) +
                        " size-3.5"
                      }
                    >
                      {allFilteredPicked ? (
                        <Check
                          className="size-2.5"
                          strokeWidth={3}
                          aria-hidden="true"
                        />
                      ) : pickedInFiltered > 0 ? (
                        <Minus
                          className="size-2.5"
                          strokeWidth={3}
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                    <span className="text-[10.5px] font-semibold text-slate-500">
                      {filterActive ? "표시된 문항 전체 선택" : "전체 선택"}
                    </span>
                  </button>
                  {pickedInFiltered > 0 ? (
                    <span className="shrink-0 text-[10px] font-bold tabular-nums text-blue-600">
                      {pickedInFiltered}개 선택
                    </span>
                  ) : null}
                </div>
              ) : null}
              <DragSelect
                deferCommit
                value={dragValue}
                onChange={commitDragSelection}
                className="space-y-1"
              >
                {filteredRows.length === 0 ? (
                  <div className="flex items-center justify-between gap-2 px-1.5 py-2">
                    <span className="text-[11.5px] text-slate-400 break-keep">
                      조건에 맞는 문제가 없습니다
                    </span>
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="shrink-0 cursor-pointer rounded-md border border-slate-200 px-2 py-1 text-[10.5px] font-semibold text-slate-500 transition-colors hover:bg-slate-50"
                    >
                      필터 초기화
                    </button>
                  </div>
                ) : null}
                {filteredRows.map((r) => {
                  const fresh = freshIds?.has(r.id) ?? false;
                  const checked = pickedIds.has(r.id);
                  const order = checked ? orderById.get(r.id) : undefined;
                  const typeLabel = questionRowTypeLabel(r.type, r.subType);
                  return (
                    // 행 루트 = 무롤 div(마키 시작면 + 클릭 토글) — 체크 시맨틱은
                    // 좌측 실버튼이 갖는다(role=checkbox 를 루트에 두면 ARIA
                    // Children Presentational 로 상세 버튼 시맨틱이 죽는다,
                    // class-questions-pane 과 동일 계약).
                    <div
                      key={r.id}
                      data-drag-item-id={r.id}
                      onClick={() => onTogglePick(r.id, rowMeta(r))}
                      className={
                        "group flex w-full cursor-pointer items-center rounded-md transition-colors " +
                        (checked
                          ? "bg-blue-50/70 ring-1 ring-inset ring-blue-100"
                          : fresh
                            ? "studio-fresh-glow bg-blue-50/50 hover:bg-blue-50"
                            : "hover:bg-slate-50")
                      }
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        aria-label={`${typeLabel} 문항 선택`}
                        title={
                          order !== undefined
                            ? `체크 순서 ${order}번 — 시험지 조판 순서`
                            : SHOW_MOBILE
                              ? "체크하면 하단 바에서 모바일 배포·시험지 조판으로 이어집니다"
                              : "체크하면 하단 바에서 시험지 조판으로 이어집니다"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePick(r.id, rowMeta(r));
                        }}
                        className="flex shrink-0 cursor-pointer items-center self-stretch py-1.5 pl-1.5 pr-1"
                      >
                        <span
                          className={
                            (checked
                              ? PICK_BOX_ON
                              : `${PICK_BOX_OFF} group-hover:border-blue-400`) +
                            " size-4"
                          }
                        >
                          {order !== undefined && order <= 99 ? (
                            // 체크 순서 = 조판 순서 시각화(평면 목록과 동일 문법)
                            <span className="text-[9px] font-bold leading-none tabular-nums">
                              {order}
                            </span>
                          ) : checked ? (
                            <Check
                              className="size-3"
                              strokeWidth={3}
                              aria-hidden="true"
                            />
                          ) : null}
                        </span>
                      </button>
                      {/* 본문 = 무버튼 스팬(마키 시작면 — 제어 커서·버튼이면
                          마키가 안 켜진다). 클릭 토글은 루트가 소유. */}
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-1 text-left">
                        <span className="min-w-0 truncate text-[11.5px] font-semibold text-slate-700">
                          {typeLabel}
                        </span>
                        {r.difficulty && DIFFICULTY_LABEL.has(r.difficulty) ? (
                          <span
                            className={
                              "shrink-0 rounded-[4px] px-1 py-px text-[9.5px] font-bold " +
                              (r.difficulty === "KILLER"
                                ? "bg-rose-50 text-rose-600"
                                : "bg-slate-100 text-slate-500")
                            }
                          >
                            {DIFFICULTY_LABEL.get(r.difficulty)}
                          </span>
                        ) : null}
                        {/* 26-08-18 난이도 기반 티어: 난이도 뱃지가 같은 티어를 말하면 이중 표기라 숨김. */}
                        {r.premium && planForDifficulty(r.difficulty) !== "PREMIUM" ? (
                          <span className="shrink-0 rounded-[4px] border border-violet-200 bg-violet-50 px-1 py-px text-[9.5px] font-bold text-violet-700">
                            {QUESTION_GENERATION_PLANS.PREMIUM.shortLabel}
                          </span>
                        ) : null}
                        {r.approved ? (
                          <span className="flex shrink-0 items-center gap-1 text-[9.5px] font-bold text-emerald-600">
                            <span
                              className="size-1.5 rounded-full bg-emerald-500"
                              aria-hidden="true"
                            />
                            검수완료
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1" aria-hidden="true" />
                        <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                          {fmtDateTime(r.createdAt)}
                        </span>
                      </span>
                      {/* 상세보기 — 평시엔 조용한 고스트, 행 hover 에서 테두리·
                          배경이 올라오는 전용 아이콘 버튼(§3.10.17-e (l)).
                          data-drag-select-ignore: 이 위에서 마키 시작 금지. */}
                      <span className="flex shrink-0 items-center self-stretch py-1 pl-0.5 pr-1.5">
                        <button
                          type="button"
                          data-drag-select-ignore="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenQuestion(r.id);
                          }}
                          title={r.stem || "문항 상세보기"}
                          aria-label={`${typeLabel} 문항 상세보기`}
                          className="flex size-6 cursor-pointer items-center justify-center rounded-md border border-transparent text-slate-300 transition-all hover:border-blue-200 hover:bg-white hover:text-blue-600 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 group-hover:text-slate-400"
                        >
                          <Maximize2 className="size-3" aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </DragSelect>
            </div>
            {filterActive && filteredRows.length > 0 ? (
              <p className="mt-1 flex items-center justify-between px-1.5 text-[10.5px] text-slate-400">
                <span className="tabular-nums">
                  {questions.rows.length}개 중 {filteredRows.length}개 표시
                </span>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="cursor-pointer font-semibold text-slate-500 transition-colors hover:text-slate-700"
                >
                  필터 초기화
                </button>
              </p>
            ) : null}
          </>
        )}
      </Sec>

      {/* §M off 면 배정 현황(모바일 과제 이력) Sec 째 미렌더 — 결과 탭 숨김(U10)과
          같은 계열의 표면이다(검수 coverage-major 수리, 26-08-22). */}
      {SHOW_MOBILE ? (
        <Sec title="배정 현황">
          {assignmentsError ? (
            <SectionError message={assignmentsError} onRetry={onRetry} />
          ) : assignments.length === 0 ? (
            <p className="py-1 text-[11.5px] leading-relaxed text-slate-400 break-keep">
              아직 배정된 학습이 없습니다
            </p>
          ) : (
            <div className="space-y-1.5">
              {assignments.map((a) => (
                <AssignmentCard key={a.id} row={a} />
              ))}
            </div>
          )}
        </Sec>
      ) : null}

      {/* 각주(lemma 이디엄 — §3.9.3-6, 문구는 §3.9v2.4 개정). §M off 면 숨겨진
          「문제 보내기」·배정 현황을 가리키는 자구를 걷어낸다(댕글링 참조 금지). */}
      {SHOW_MOBILE ? (
        <p className="px-3 py-2.5 text-[10.5px] leading-relaxed text-slate-400 break-keep">
          문제 목록·문제 보내기는 최신 50문항 기준 · 배정 현황은 최근
          30건(학습지)·200건 스캔(문제) 기준입니다
        </p>
      ) : (
        <p className="px-3 py-2.5 text-[10.5px] leading-relaxed text-slate-400 break-keep">
          문제 목록은 최신 50문항 기준입니다
        </p>
      )}
    </div>
  );
}

// ── 아코디언 카드(D1) — 헤더 토글은 lemma SenseCard 정본, 본문은 상시 마운트 ──
// (0fr↔1fr 전환 중에도 내용이 있어야 접힘 애니메이션이 성립 — AssignmentCard 동형)

function DossierAccordionCard({
  passage,
  state,
  open,
  formKind,
  queueItems,
  streamStore,
  freshIds,
  deployTarget,
  pickedIds,
  onTogglePick,
  onPickRows,
  pickedSheets,
  onToggleSheetPick,
  onDeploySheet,
  onComposeSheets,
  onToggle,
  onRetry,
  onOpenQuestion,
  onToggleForm,
  onDeployed,
  onRemove,
}: {
  passage: DossierPassageRef;
  state: DossierFetchState | undefined;
  open: boolean;
  formKind: DeployFormKind | null;
  queueItems: readonly DossierQueueItem[];
  streamStore: StreamTailStore;
  /** 방금 생성 문항 id(이 지문) — DossierBody 글로우 표식 패스스루 */
  freshIds: ReadonlySet<string> | undefined;
  deployTarget: StudioDeployTarget | null;
  /** 문항 체크 상태·핸들러(26-08-14) — DossierBody 패스스루 */
  pickedIds: ReadonlySet<string>;
  onTogglePick: (questionId: string, meta: PickedQuestionMeta) => void;
  onPickRows: (
    entries: readonly (readonly [string, PickedQuestionMeta])[],
    pick: boolean,
  ) => void;
  /** 학습지 조판 체크 상태·핸들러(§3.10.21 E21-5) — DossierBody 패스스루 */
  pickedSheets: ReadonlyMap<string, SheetPickMeta>;
  onToggleSheetPick?: (reportId: string, meta: SheetPickMeta) => void;
  onDeploySheet?: (meta: SheetPickMeta) => void;
  onComposeSheets?: (reportIds: string[]) => void;
  onToggle: () => void;
  onRetry: () => void;
  onOpenQuestion: (questionId: string) => void;
  onToggleForm: (kind: DeployFormKind) => void;
  onDeployed: (passageId: string) => void;
  /** 카드 「선택 해제」(26-08-22) — 미전달이면 X 버튼 미렌더 */
  onRemove?: () => void;
}) {
  const badge = state?.status === "ready" ? analysisBadge(state.dossier.analysis) : null;
  // 접힘 상태에서도 생성 진행·실패를 숨기지 않는다(§3.10.11-c 말미) —
  // running 우선(진행이 실패 잔재보다 정보 가치가 높다).
  // E19-5 로 본문 스트립은 학습지/문항 두 축으로 갈렸지만 이 미니 표시는
  // **전체 항목 기준**을 유지한다 — 접힌 헤더는 축을 구분할 자리가 없고,
  // 여기서 말해야 하는 것은 "이 카드에서 뭔가 돌고 있다" 하나뿐이다.
  const hasRunning = queueItems.some((q) => q.status === "running");
  const hasQueueError = !hasRunning && queueItems.some((q) => q.status === "error");
  // 접힘 카드 테두리 링(§3.10.20) — 지문관리 행과 **같은 모션**이라 좌(행)에서
  // 쏜 것이 우(도시에)에서도 같은 얼굴로 돈다. 펼침에서는 그리지 않는다:
  // 본문에 큐 스트립이 이미 있어 중복이고, 수백 px 짜리 카드를 두르는 링은
  // 「살짝」이 아니게 된다. 접힘일 때만 링이 스트립의 대역이다.
  const runningRingKind: PassageActivityKind | null =
    open || !hasRunning
      ? null
      : DOSSIER_KIND_TO_ACTIVITY[
          queueItems.find((q) => q.status === "running")!.kind
        ];
  // 생성 중 테두리 색(26-08-21) — 링 톤 축과 **같은 계열**로 맞춘다. 링이
  // 카드 안쪽 밴드라 테두리가 회색으로 남으면 파란 밴드가 회색 선에 갇혀
  // 더 안 보였다(사용자 실측: "테두리 글로우가 잘 안 보인다").
  const runningBorder =
    runningRingKind === null
      ? null
      : runningRingKind === "questions"
        ? "border-indigo-400"
        : "border-blue-400";
  // 폼 펼침 스크롤 앵커(§3.10.5) — 열리는 카드가 시야에 들어오게.
  // block:"nearest" 라 이미 보이는 카드에는 개입하지 않는다.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (formKind !== null) rootRef.current?.scrollIntoView({ block: "nearest" });
  }, [formKind]);
  return (
    <div
      ref={rootRef}
      // relative: 아래 활동 링(absolute inset-0)의 기준 상자. 링은
      // pointer-events 가 없어 헤더 버튼 클릭에 영향을 주지 않는다.
      //
      // 경계색(26-08-21): 흰 패널 위 흰 카드라 slate-200 테두리는 배경과 거의
      // 구분되지 않았다(사용자 실측). 명도만 올리는 대신 **색상 축 자체를
      // 파랑으로** 옮긴다 — 배경(흰색)과 다른 색이면 경계가 대비가 아니라
      // 색으로 읽혀 얇은 1px 로도 확실히 잡힌다.
      // 생성 중에는 테두리를 한 단 진하게(runningBorder) + 카드 바깥으로
      // 번지는 헤일로(globals.css .passage-activity-halo)를 얹는다. 헤일로가
      // 자기 shadow 를 그리므로 평시 그림자와는 배타다.
      data-activity-kind={runningRingKind ?? undefined}
      className={`relative overflow-hidden rounded-lg border bg-white transition-colors ${
        runningBorder
          ? `passage-activity-halo ${runningBorder}`
          : "border-blue-300 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
      }`}
    >
      {runningRingKind ? <PassageActivityRing kind={runningRingKind} /> : null}
      {/* 헤더 행(26-08-22) — 구 「전폭 토글 버튼」에서 [토글(flex-1) | X] 형제
          구조로 개편(버튼 안에 버튼 금지). hover 배경·group(체브론 착색)은
          래퍼로 승격해 행 전체 hover 감각을 보존한다.
          체브론·X 는 **테두리 칩**(size-7 border bg-white — 목록 행의 연필
          버튼과 같은 문법)으로 그린다: 구판의 나체 slate-300 아이콘은 흰 카드
          위에서 거의 안 보였다(사용자 실측 "버튼이 거의 안 보여"). */}
      <div className="group flex w-full items-center transition-colors hover:bg-slate-50">
        <button
          type="button"
          aria-expanded={open}
          title={open ? "접기" : "펼치기"}
          onClick={onToggle}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-2 pl-2.5 pr-1.5 text-left"
        >
          <span className="min-w-0 flex-1 text-[12.5px] font-bold leading-snug text-slate-800 break-keep">
            {passage.title}
          </span>
          {/* svg 의 title 속성은 툴팁이 안 뜬다 — span 래퍼가 title 을 든다 */}
          {hasRunning ? (
            <span className="flex shrink-0 items-center" title="생성 중">
              <Loader2
                className="size-3 animate-spin text-blue-500"
                aria-hidden="true"
              />
            </span>
          ) : hasQueueError ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-rose-500"
              title="생성 실패"
            />
          ) : null}
          {badge ? (
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${badge.cls}`}
            >
              {badge.label}
            </span>
          ) : null}
          {/* 펼침 어포던스 — 토글 버튼 내부라 실버튼이 아닌 시각 칩(span). */}
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors group-hover:border-blue-300 group-hover:text-blue-600"
          >
            <ChevronDown
              className={`size-4 transition-transform duration-300 motion-reduce:transition-none ${open ? "" : "-rotate-90"}`}
              aria-hidden="true"
            />
          </span>
        </button>
        {/* 선택 해제(26-08-22 사용자 지시) — 이 지문을 목록 선택에서 뺀다.
            카드 소멸은 공급원(selectedIds) 발행 이펙트가 자동 수행.
            hover 는 rose(제거 의미축) — slate hover 는 토글과 구분이 안 된다. */}
        {onRemove ? (
          <button
            type="button"
            title="선택 해제 — 이 지문을 목록 선택에서 뺍니다"
            aria-label={`${passage.title} 선택 해제`}
            onClick={onRemove}
            className="mr-2 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {/* inert(§3.10.21 E21-5 5번 — 이 파일의 기존 규약 승계): 0fr 접힘은 시각
          클립일 뿐이라 본문이 상시 마운트인 이 카드에서는 내부 버튼·셀렉트가
          보이지 않는 탭 스톱으로 남는다. 정본 관용구는 dossier-pick-bar.tsx:243-247
          (React 19 불리언 inert 로 서브트리째 포커스·클릭 차단). 학습지 행에
          체크 실버튼·액션 2버튼이 붙으면서 접힌 카드 1장당 탭 스톱이 행 수 × 3만큼
          늘어나 더는 미룰 수 없었다. 펼침(open)에서는 속성이 사라지므로 열린
          카드의 동작은 그대로다. */}
      <div
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-blue-100">
            {state === undefined || state.status === "loading" ? (
              <div className="px-3 py-3">
                <SectionSkeleton rows={5} />
              </div>
            ) : state.status === "error" ? (
              <div className="px-3 py-3">
                <SectionError message={state.error} onRetry={onRetry} />
              </div>
            ) : (
              <DossierBody
                dossier={state.dossier}
                assignmentsError={state.assignmentsError}
                queueItems={queueItems}
                streamStore={streamStore}
                freshIds={freshIds}
                formKind={formKind}
                deployTarget={deployTarget}
                pickedIds={pickedIds}
                onTogglePick={onTogglePick}
                onPickRows={onPickRows}
                pickedSheets={pickedSheets}
                onToggleSheetPick={onToggleSheetPick}
                onDeploySheet={onDeploySheet}
                onComposeSheets={onComposeSheets}
                onRetry={onRetry}
                onOpenQuestion={onOpenQuestion}
                onToggleForm={onToggleForm}
                onDeployed={onDeployed}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// memo(검수 L4-1): 오케스트레이터는 폴링 틱(5초)·SSE 델타마다 재렌더된다 —
// props 는 전부 참조 안정(시그니처 메모·useCallback)이라 여기서 재렌더를 끊는다
// (ClassTree·LibraryPane 방어선 동형). export 는 파일 말미의 memo 래퍼.
function PassageDossierAccordionInner({
  passages,
  totalCount,
  states,
  expandedId,
  onExpand,
  onRetry,
  onOpenQuestion,
  deployTarget,
  queueItemsByPassage,
  streamStore,
  freshQuestionIds,
  onDeployed,
  picked,
  onTogglePick,
  onPickRows,
  onClearPicked,
  onPickBarDeployed,
  onComposeExam,
  pickedSheets,
  onToggleSheetPick,
  onDeploySheet,
  onComposeSheets,
  onClearSheets,
  pickBarNudge = false,
  onRemovePassage,
}: PassageDossierAccordionProps) {
  // (E25-6) 구 모듈 미리보기 시트(D4) 상태·배관은 칩 층 폐기와 함께 소멸.

  // 인라인 폼 펼침 상태(§3.10.5) — 카드당 한 폼만, 재클릭 접기. 지문 전환
  // (expandedId 변경)에도 유지하고, 표시 집합에서 빠진 지문 것만 정리한다.
  const [openForm, setOpenForm] = useState<Record<string, DeployFormKind | null>>(
    {},
  );

  // ── 문항 체크(26-08-14 — §3.10.13) — 상태·프룬은 오케스트레이터 소유(위
  // props 주석 참조). 여기는 행 판정용 id 집합과 바 제목 해석 재료만 파생한다.
  const pickedIds = useMemo(() => new Set(picked.keys()), [picked]);
  // 현재 표시 스냅샷의 지문 제목 — 배포 과제 제목이 체크 시점 스냅샷(stale)이
  // 아니라 최신 제목으로 실리게 바에 내린다(적대 검수 minor).
  const passageTitleById = useMemo(
    () => new Map(passages.map((p) => [p.id, p.title])),
    [passages],
  );

  // 표시 집합 이탈 정리 — 빠진 지문 엔트리만 제거(재진입 시 접힌 채 시작).
  // 렌더 중 조건부 setState = "이전 렌더 정보 보관" 공인 패턴(효과 불사용).
  const [prevPassages, setPrevPassages] = useState(passages);
  if (passages !== prevPassages) {
    setPrevPassages(passages);
    const keep = new Set(passages.map((p) => p.id));
    const stale = Object.keys(openForm).filter((id) => !keep.has(id));
    if (stale.length > 0) {
      const next = { ...openForm };
      for (const id of stale) delete next[id];
      setOpenForm(next);
    }
  }

  const toggleForm = useCallback((passageId: string, kind: DeployFormKind) => {
    // (E25-6) 구 「시트 배타」 setPreview(null) 은 미리보기 시트 소멸로 함께 제거.
    setOpenForm((prev) => ({
      ...prev,
      [passageId]: prev[passageId] === kind ? null : kind,
    }));
  }, []);

  // 배포 성공(§3.10.5): 폼 접힘 → 업링크(조용한 재조회는 오케스트레이터 소유)
  const handleDeployed = useCallback(
    (passageId: string) => {
      setOpenForm((prev) =>
        prev[passageId] ? { ...prev, [passageId]: null } : prev,
      );
      onDeployed(passageId);
    },
    [onDeployed],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2">
          {passages.map((p) => (
            <DossierAccordionCard
              key={p.id}
              passage={p}
              state={states.get(p.id)}
              open={expandedId === p.id}
              formKind={openForm[p.id] ?? null}
              queueItems={queueItemsByPassage.get(p.id) ?? EMPTY_QUEUE_ITEMS}
              streamStore={streamStore}
              freshIds={freshQuestionIds.get(p.id)}
              deployTarget={deployTarget}
              pickedIds={pickedIds}
              onTogglePick={onTogglePick}
              onPickRows={onPickRows}
              // 미전달이면 참조 안정 빈 Map — 렌더마다 new Map() 을 만들면
              // sheetOrderById(useMemo) 가 매 렌더 재계산된다(§3.10.9 함정 1).
              pickedSheets={pickedSheets ?? EMPTY_SHEET_PICKS}
              onToggleSheetPick={onToggleSheetPick}
              onDeploySheet={onDeploySheet}
              onComposeSheets={onComposeSheets}
              onToggle={() => onExpand(expandedId === p.id ? null : p.id)}
              onRetry={() => onRetry(p.id)}
              onRemove={
                onRemovePassage ? () => onRemovePassage(p.id) : undefined
              }
              onOpenQuestion={onOpenQuestion}
              onToggleForm={(kind) => toggleForm(p.id, kind)}
              onDeployed={handleDeployed}
            />
          ))}
        </div>
        {totalCount > passages.length ? (
          <p className="pt-2.5 text-[10.5px] leading-relaxed text-slate-400 break-keep">
            선택 지문 {totalCount}개 중 최근 {passages.length}개를 표시합니다
          </p>
        ) : null}
      </div>
      {/* 하단 고정 실행 바(26-08-14) — 문항 체크 시에만 올라온다. 스크롤 영역
          밖(flex-col 형제)이라 목록을 아무리 내려도 항상 하단에 붙어 있다.
          §3.10.22 E22-U14: 학습지 축 4 prop 을 그대로 패스스루한다("학습지
          선택해도 조판되게" — E22-0 계약 4). **가공 없이 원본 참조를 넘긴다**:
          여기서 `pickedSheets ?? EMPTY_SHEET_PICKS` 로 채우지 않는 것이 의도다 —
          바는 `undefined` 를 「학습지 축 미배선」 스위치로 읽어 기존 렌더로
          떨어진다(위 카드 경로는 sheetOrderById 재계산 때문에 빈 Map 폴백이
          필요했지만 바는 size 만 본다). */}
      <DossierPickBar
        picked={picked}
        passageTitleById={passageTitleById}
        deployTarget={deployTarget}
        onClear={onClearPicked}
        onDeployed={onPickBarDeployed}
        onComposeExam={onComposeExam}
        pickedSheets={pickedSheets}
        onClearSheets={onClearSheets}
        onComposeSheets={onComposeSheets}
        onDeploySheet={onDeploySheet}
        // §M 조판 유도 — 두 축 중 어느 쪽이든 생성 완료면 조판 버튼이 빤짝인다.
        nudge={pickBarNudge}
      />
    </div>
  );
}

export const PassageDossierAccordion = memo(PassageDossierAccordionInner);

// ── 도시에 문제 상세 모달(§3.9.5① — questionId 경로, U1 getStudioQuestionCard) ──

export type DossierQuestionState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; card: QuestionCardItem };

export function DossierQuestionModal({
  open,
  state,
  onClose,
}: {
  open: boolean;
  state: DossierQuestionState;
  onClose: () => void;
}) {
  return (
    <WideModal
      open={open}
      onClose={onClose}
      icon={ListChecks}
      title={
        state.status === "ready" && state.card.passage?.title
          ? sanitizeAiModelDisclosureText(state.card.passage.title)
          : "문제 상세"
      }
      description="생성된 문제"
    >
      <div className="space-y-3 px-4 py-4 sm:px-5">
        {state.status === "loading" ? (
          <p className="py-10 text-center text-[12.5px] text-slate-400">
            문항 정보를 불러오는 중입니다
          </p>
        ) : state.status === "error" ? (
          <p className="py-10 text-center text-[12.5px] text-rose-500">
            {state.error}
          </p>
        ) : (
          // D3: 완전 펼침 — compact 제거 + 정답 즉시 노출 + 지문·해설 기본 펼침.
          // 읽기 전용 열람이라 회전 스탬프는 소음 — variant-source-modal 정본.
          <QuestionCard
            q={state.card}
            num={1}
            readonly
            suppressUnapprovedBorder
            hideReviewStatusStamp
            answerReveal="show-all"
            passageDefaultOpen
            explanationDefaultOpen
          />
        )}
      </div>
    </WideModal>
  );
}
