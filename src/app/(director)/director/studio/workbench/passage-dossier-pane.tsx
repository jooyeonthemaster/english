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
// E30(§3.10.29 — 실전 학습지 분리): 섹션「학습지」가 지문당 최대 **3행**(기본 /
//     실전 / 파이널)을 그린다. 이 판이 이행하는 것은 4가지다.
//     (a) 「실전 학습지 추가」 동선 — **기본 보유 지문에서만** ◈5 로 노출한다
//         (E30 §2-1 (c) · §2-4 층③). 서버가 404 로 막지만(worksheet/route.ts 부모
//         필수 404) **화면이 먼저 말해야 한다** — 눌러 보고 실패로 배우게 하지 않는다.
//     (b) 체크 토글에 `withBasicCompanions`(§4-4 D-COMPANION) — 실전만 담기면
//         같은 지문의 기본을 **앞쪽에** 동반 삽입한다. 체크박스 `disabled` 는
//         쓰지 않는다(그건 방어가 아니라 장식이다 — pick-order.ts 주석 정본).
//     (c) 해제 대칭(§4-5) — 기본을 해제하면 같은 지문의 **실전**도 같은 델타로
//         함께 뺀다(파이널은 대상이 아니다 — 기본 없이도 성립하는 문서다).
//     (d) 표시 순서 — 같은 지문 안에서는 `sheetPlanRank`(정본 1곳) asc.
//         서버 정렬은 `updatedAt desc` 라 나중에 만든 실전이 기본 **위**에 온다.
// E29 경계 문법 이식(26-08-23 사용자 지시): 이 카드의 픽 축 섹션(학습지·문제)이
//     흰 바탕 위 무선(無線)이라 「어디까지가 한 덩어리인가」가 안 읽혔다.
//     `composer-list-pane.tsx` 의 [E29] 4단 규약을 **값 복제**로 들여온다 —
//     복제 계약(왜 import 하지 않는가·좌측 정렬 축이 왜 12px 인가)은 `ROW_*` 토큰
//     주석, 선반(③)은 이 파일 로컬 `SecAxis` 주석이 소유한다. 두 섹션 중 **행**
//     문법까지 바꾼 것은 학습지 축뿐이다(문항 축 유예 사유는 SecAxis 호출부 주석).
// RCA §4 처방 #22(26-08-23): 큐 스트립 **실패 행에 「다시 시도」**. 신규 로직 0 —
//     `use-passage-queue.ts:1072 retryAnalysis` 배선만 내려온다(RCA RC-2 처방 7:
//     "queueApi.retryAnalysis 를 읽는 곳이 0건").
//
// 스탯 그리드 폐기(26-08-24 사용자 지시): 펼침 본문 맨 위 2열 카운터
//     (「학습지 N」·「문제 N」, §M on 이면 「배정」 3열)을 렌더째 걷어냈다. 같은 수는
//     바로 아래 두 섹션이 스스로 말한다 — Sec「학습지」의 행 수와 Sec「생성된 문제」
//     머리의 「검수완료 n/N」. 카운터만 위에 한 번 더 세워 두면 필터가 걸린 순간
//     둘이 서로 다른 수를 말한다. `sheetRows`·`questions.total`·`assignments` 는
//     다른 층이 계속 쓰므로 데이터 배관은 그대로다(집계 제거 아님, 표시 제거).
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
  Plus,
  RotateCw,
  Send,
  Smartphone,
  X,
} from "lucide-react";
import {
  PRACTICE_REPORT_MARKER,
  PRIME_REPORT_MARKER,
} from "@/actions/workbench/passage-constants";
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
// [E30 §3-1] 실전 단가는 **산식 정본 1곳**에서만 온다 — 「◈5」 를 리터럴로 적으면
// 표기와 청구가 갈린다(E19-2 계약: 모달의 가격 표기와 실제 청구가 어긋나면 안 된다).
// 이 버튼은 `hasBasic === true` 일 때만 렌더되므로 인자도 그 사실 그대로 넘긴다.
import { getPracticeSheetCreditCost } from "@/lib/passage-analysis-credit-costs";
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
// [E30] 동반 픽·랭크는 **순수층 정본 1곳**(lib/studio/pick-order)만 쓴다. 같은 규칙을
// 이 판에 복제하면 병합 목록판(composer-list-pane)과 조용히 갈린다 — 그 갈림은
// 타입 에러 0 · 콘솔 0 이고 **인쇄물에서만** 발견된다(pick-order.ts 머리주석 정본).
import { sheetPlanRank, withBasicCompanions } from "@/lib/studio/pick-order";
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
  /**
   * [E32] **평면 축(목록에서 담은 문항)** — 옵셔널 additive. 미전달이면 아래
   * `pickedIds` 가 종전과 같이 도시에 축만으로 만들어져 렌더가 바이트 동일하다.
   *
   * 이게 필요한 이유: 조판 표면과 병합 목록이 읽는 문항 축은 **평면 축 하나뿐**
   * 이고, 도시에 발사구는 발사 직전에 도시에 축을 그리로 승계한다. 그런데 도시에
   * 행의 체크 표시가 도시에 축만 보면, **평면 축에 이미 담긴 문항의 행이 미체크로
   * 보인다** — 사용자는 그 행을 다시 눌러 같은 문항을 두 축에 이중 등재하고,
   * 카드의 「전체 선택」도 이미 담긴 것까지 다시 담는다. 그래서 체크 표시는
   * **두 축의 합집합**이어야 하고, 해제 클릭의 2축 처리는 오케스트레이터
   * (`togglePickedQuestion` · `pickQuestionRows`)가 짝으로 담당한다.
   */
  pickedFlat?: ReadonlyMap<string, PickedQuestionMeta>;
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

  // ── [E30 §3.10.29] 실전 학습지 축(additive 3 prop — 전부 옵셔널) ──────────
  // E21-5 가 세운 additive 계약을 그대로 따른다: **미전달이면 화면이 변하지 않는다.**
  // 배선(오케스트레이터 studio-home-client)이 아직 안 왔어도 이 파일만 먼저 머지될 수
  // 있어야 한다.
  //
  // ⚠ 셋 다 **참조 안정**(useCallback)이어야 한다 — 이 컴포넌트는 `memo` 로 감싸져
  //   있고(파일 말미), 오케스트레이터는 폴링 틱(5초)·SSE 델타마다 재렌더된다.
  //   렌더마다 새 화살표 함수를 내리면 memo 방어선이 통째로 무너져 카드 27장이
  //   초당 다시 그려진다(이 파일 memo 주석의 계약).
  /**
   * 학습지 픽 **배치** 커밋 — `entries` 순서대로 담고(pick=true) / 한 델타로 뺀다
   * (pick=false). 문항 축 `onPickRows` 와 **같은 문법**이다.
   *
   * ⚠ **왜 `onToggleSheetPick` 을 두 번 부르면 안 되는가**(이 prop 이 존재하는 이유):
   *   오케스트레이터의 `toggleSheetPick` 은 `pickedSheetsRef.current` 를 읽어 `next` 를
   *   만드는데(studio-home-client.tsx `toggleSheetPick`), 그 ref 는 **렌더 중에**
   *   갱신된다(`pickedSheetsRef.current = pickedSheets`). 한 이벤트 핸들러에서 두 번
   *   부르면 둘 다 **같은 prev** 를 읽어 두 번째 커밋이 첫 번째를 덮는다 — 동반 픽된
   *   기본 행이 조용히 증발한다(에러 0 · 배지만 1 오르고 순서는 틀림).
   * ⚠ 해제(pick=false)도 **한 델타**여야 §4-5 의 「dirty confirm 1회」가 성립한다.
   *   두 번 부르면 사용자가 confirm 을 두 번 보고, 두 번째에서 「취소」를 누르면
   *   기본만 빠진 반쪽 상태가 남는다.
   * 미전달이면 `onToggleSheetPick` 단건 경로로 폴백한다(동반 픽 없음 = 구 동작).
   */
  onPickSheetRows?: (
    entries: readonly (readonly [string, SheetPickMeta])[],
    pick: boolean,
  ) => void;
  /**
   * [E30 §2-1 (c)] 「실전 학습지 추가」 발사 — 기존 기본 학습지를 **부모로 삼아**
   * 실전 자식 문서만 만든다(`POST /api/workbench/passage-reports/prime/{id}/worksheet`,
   * ◈5). 라우트 분기·잡 폴링은 오케스트레이터(use-studio-queue) 소유다 —
   * 이 판은 「어느 지문에 대해 눌렀는가」만 말한다.
   * 미전달이면 버튼을 **렌더하지 않는다**(눌러도 아무 일 없는 버튼 금지).
   */
  onAddPracticeSheet?: (passageId: string) => void;
  /**
   * [RCA §4 처방 #22] 큐 스트립 실패 행 「다시 시도」 —
   * `use-passage-queue.ts retryAnalysis(passageId)` 를 그대로 내린다(신규 로직 0).
   * 미전달이면 버튼 미렌더.
   */
  onRetryAnalysis?: (passageId: string) => void;
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
// [E29 경계 · 26-08-23] **학습지 축**의 체크 ON 은 violet 이다(문항 축 = blue).
// 병합 목록판이 이미 그 언어를 쓴다(composer-list-pane.tsx `BOX_ON_Q`=blue /
// `BOX_ON_W`=violet). 같은 reportId 행이 두 판에서 다른 색이면 축 색이 축을 말하지
// 못하고 그냥 장식이 된다 — 선반 바·선택 행 좌측 바가 이 색을 그대로 이어받는다.
const PICK_BOX_ON_W = `${PICK_BOX_BASE} border-violet-600 bg-violet-600 text-white`;

// ── [E29 경계 토큰 — **값 복제본**] ────────────────────────────────────────
//
// 정본은 `composer-list-pane.tsx:339-362` 의 [E29] 경계 토큰 4단이다. 여기 있는 것은
// **같은 값의 복제본**이고, 그 사실을 이 리포의 관용대로 주석으로 못박는다
// (SHEET_ACTION_* 이 문항 행 고스트 버튼 토큰을 복제할 때와 같은 계약).
// **import 하지 않는 이유**: 그 파일은 「학습지 조판」 뷰의 목록판이고 이 파일은
// 우측 실행대다 — 서로를 import 하면 두 표면이 한 덩어리로 묶여 한쪽 개편이 다른
// 쪽 번들을 끌고 들어온다. 값이 바뀌면 **두 파일을 함께 고칠 것.**
//
// 4단 규약(정본 주석 요약): ① 카드 = 테두리+미세 그림자 ② 카드 머리 = 흰 바탕
// ③ 섹션 선반 = 회색 띠 + 좌측 3px **축 색 바** ④ 행 = 흰 바탕 + 행 사이 헤어라인,
// 선택 행은 좌측 3px 축 색 inset.
//
// ⚠ **좌측 정렬 축만 값이 다르다.** 정본은 10px(`ROW_PAD_X = pl-2.5 pr-2.5`)인데
//   이 판은 12px 이다 — 이 카드의 모든 층(CTA 행·Sec 본문)이 `px-3` 축에
//   서 있어서, 10px 로 맞추면 학습지 섹션만 2px 안쪽으로 들어가 「계단」이 생긴다.
//   중요한 것은 판 **사이**의 일치가 아니라 판 **안**의 일치다(정본 주석의 「계단」 경고).
/** 행 사이 헤어라인(4단계 경계) — 실선보다 한 단 옅다. */
const ROW_HAIRLINE = "divide-y divide-slate-100";
/** 선택 행의 좌측 축 바 — 레이아웃을 밀지 않는 inset 그림자(padding 무영향).
 *  구판은 `ring-1 ring-inset ring-blue-100` 이었는데 blue-50/70 바탕 위에서 사실상
 *  보이지 않았다(사용자 지적 "경계 선이 너무 안 보여") — 정본이 같은 이유로 버렸다. */
const ROW_PICK_BAR_W = "shadow-[inset_3px_0_0_0_#7c3aed]";
/** 행·선반·머리가 공유하는 좌측 정렬 축(12px — 위 ⚠ 참조). */
const ROW_PAD_X = "px-3";

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

/**
 * [E30 §3-1] 「실전 학습지 추가」 표기 단가.
 *
 * 이 버튼은 `hasBasic === true` 에서만 렌더되므로(위 canAddPractice) 단가는 언제나
 * EXTRA 축이다 — 그래도 리터럴 `5` 를 적지 않고 **산식 정본을 호출해** 값을 얻는다.
 * 리터럴은 상수가 개정될 때 표기만 비껴가고, 그 어긋남은 사용자가 결제 후에 발견한다
 * (E19-2: 「모달의 가격 표기와 실제 청구가 어긋나면 안 되므로 판정 술어는 라우트와
 *  동일 구현을 쓴다」). 청구 쪽도 같은 함수를 부른다((c) 라우트 §2-2).
 * 모듈 상수인 이유: 인자가 상수라 렌더마다 다시 부를 이유가 없다.
 */
const PRACTICE_ADD_UNIT_COST = getPracticeSheetCreditCost({ hasBasic: true });

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
// 카드 본문 직속(맨 위) 현행 위치로 갈라져 그려진다. 같은 JSX 를 두 벌 복제하면 시광
// 스윕·라이브 꼬리·배지 분기가 조금씩 갈라지는 것이 시간 문제라, 스펙이 "토큰
// 복제 금지 — 별도 컴포넌트로 추출해 두 자리에서 호출"을 명시한다(§3.10.19 E19-5).
// 아래 두 컴포넌트는 구 인라인 JSX(525-614행)를 **한 글자도 바꾸지 않고** 옮긴 것.

function QueueStripRow({
  item,
  streamStore,
  onRetry,
}: {
  item: DossierQueueItem;
  streamStore: StreamTailStore;
  /**
   * [RCA §4 처방 #22] 실패 행 「다시 시도」 — **미전달이면 버튼이 없다**(기존 렌더
   * 바이트 동일). 신규 로직 0: 배선은 `use-passage-queue.ts:1072 retryAnalysis`
   * 하나이고, RCA RC-2 처방 7 이 기록한 사실("queueApi.retryAnalysis 를 읽는 곳이
   * **0건**")을 이 판이 처음으로 소비한다.
   *
   * ⚠ 이 판이 붙여 주는 것은 **학습지 계열(kind !== "questions")** 뿐이다 —
   *   `retryAnalysis` 는 지문 분석 큐(passageId 단수)를 되살리는 함수라 문항 세션
   *   큐에는 의미가 없다. 문항 축까지 같은 버튼으로 덮으면 누른 사람은 「재시도했다」고
   *   믿는데 아무 일도 일어나지 않는다(무음 실패 — RCA 가 잡은 바로 그 계통).
   *   호출부(DossierBody)가 그 판정을 소유한다.
   */
  onRetry?: () => void;
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
        {/* [RCA #22] 실패 행 「다시 시도」 — 실패는 **행동 신호**인데 여기엔 지금까지
            사유만 있고 출구가 없었다(RCA RC-2 처방 9). `ml-auto` 로 우측 끝에 서고,
            running 행의 경과시계와는 상호배타라 자리 다툼이 없다.
            ⚠ 루트 stopPropagation 은 필요 없다 — 이 스트립 행은 클릭 핸들러가 없는
            표시 전용 div 다(파일 위쪽 「표시 전용」 계약). */}
        {item.status === "error" && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="ml-auto flex shrink-0 cursor-pointer items-center gap-0.5 rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 transition-colors hover:bg-rose-100"
          >
            <RotateCw className="size-2.5 shrink-0" aria-hidden="true" />
            다시 시도
          </button>
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

/** 스트립 래퍼 — **패딩은 호출부가 정한다**. 카드 본문 직속(맨 위)은
 *  자기 px-3 pt-2 를 들지만, Sec 안에서는 Sec 이 이미 px-3 py-2.5 를 주므로
 *  간격만 남긴다(panel-primitives.tsx:90). 여기서 패딩을 고정하면 Sec 안에서
 *  좌우 여백이 두 번 먹어 스트립만 안쪽으로 밀려 들어간다. */
function QueueStrip({
  items,
  streamStore,
  className,
  onRetry,
}: {
  items: readonly DossierQueueItem[];
  streamStore: StreamTailStore;
  className: string;
  /** [RCA #22] 실패 행 재시도 — 미전달이면 두 자리 다 구 렌더 그대로(위 행 주석). */
  onRetry?: () => void;
}) {
  return (
    <div className={className}>
      {items.map((item) => (
        <QueueStripRow
          key={item.id}
          item={item}
          streamStore={streamStore}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}

/**
 * [E29 경계 ③] **픽 축이 있는 섹션**의 머리 — `panel-primitives.tsx` 의 `Sec` 와
 * 같은 마크업에 좌측 3px 축 색 바를 더한 것.
 *
 * 왜 `Sec` 를 고치지 않는가: `Sec` 는 우측 패널 계열 **공용** 프리미티브라
 * (class-panel 도 쓴다) 축 개념이 없는 섹션까지 색 바를 달게 된다. 여기서 필요한
 * 것은 「이 띠 아래는 학습지 축 / 문제 축」이라는 **픽 축 고지**뿐이라, 축이 있는
 * 두 섹션만 이 판 로컬로 승격한다. 배정 현황처럼 픽 축이 없는 섹션은 `Sec` 그대로다.
 *
 * ⚠ `Sec` 와 **같은 값**을 복제한다(bg-slate-50/80 · border-b-slate-100 · py-1.5 ·
 *   h3 타이포). 한쪽만 바뀌면 같은 카드 안에서 섹션 머리가 두 얼굴이 된다 —
 *   값이 바뀌면 두 파일을 함께 고칠 것(위 [E29 경계 토큰] 복제 계약과 동일).
 * ⚠ 좌 padding 은 `border-l-[3px]`(3) + `pl-[9px]`(9) = **12px** 로 본문 `px-3` 축에
 *   정확히 선다. `pl-3` 을 그대로 두면 바 두께만큼 제목이 밀려 「계단」이 된다.
 * ⚠ tailwind-merge 를 태우지 않는다(문자열 연결) — 정본 파일이 `cn()` 안에서
 *   범용 `border-slate-200` 과 `border-l-*` 를 섞었다가 좌측 바가 **DOM 에서 사라진**
 *   전례가 있다. 여기서는 측면 전용 색만 쓰고 merge 자체를 태우지 않는다.
 *
 * `flush` = 본문의 좌우/상하 padding 을 **행 목록에 넘긴다**. 전폭 원장 행(경계 ④)은
 * 자기 좌우 여백을 스스로 들어야 헤어라인이 선반 폭과 같은 길이로 그어진다 —
 * 본문이 `px-3` 을 쥐고 있으면 행 사이 선이 양쪽에서 12px 씩 짧아져 「점선 계단」이 된다.
 */
function SecAxis({
  title,
  axis,
  action,
  flush = false,
  children,
}: {
  title: string;
  /** 축 색 — 학습지 = violet, 문제 = blue(체크박스 색과 같은 언어) */
  axis: "worksheet" | "question";
  action?: React.ReactNode;
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-slate-200/80">
      <div
        className={
          "flex items-center justify-between gap-2 border-b border-b-slate-100 border-l-[3px] bg-slate-50/80 py-1.5 pl-[9px] pr-3 " +
          (axis === "worksheet" ? "border-l-violet-400" : "border-l-blue-400")
        }
      >
        <h3 className="text-[10.5px] font-bold tracking-wide text-slate-600">
          {title}
        </h3>
        {action}
      </div>
      <div className={flush ? undefined : "px-3 py-2.5"}>{children}</div>
    </section>
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
    // [E29 경계 ④] 전폭 원장 행 — `rounded-md` 칩을 버리고 좌우 12px 축(ROW_PAD_X)에
    // 맞춘다. 선택 표식은 옅은 ring 이 아니라 **좌측 3px 축 바**(ROW_PICK_BAR_W) +
    // 진한 바탕이다. 행 사이 선은 이 행이 아니라 **목록 컨테이너**(ROW_HAIRLINE)가
    // 긋는다 — 행마다 border-b 를 달면 마지막 행 아래에도 한 줄이 남는다.
    <div
      data-drag-item-id={row.reportId}
      onClick={onToggle}
      className={
        "group flex w-full cursor-pointer items-center transition-colors " +
        ROW_PAD_X +
        " " +
        (checked
          ? `bg-violet-50 ${ROW_PICK_BAR_W}`
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
        // 좌 padding 은 루트(ROW_PAD_X)가 들었다 — 여기 `pl-1.5` 를 남기면 체크박스만
        // 12px 축에서 6px 더 밀려 선반·제목과 계단이 생긴다.
        className="flex shrink-0 cursor-pointer items-center self-stretch py-1.5 pr-1"
      >
        <span
          className={
            (checked
              ? PICK_BOX_ON_W
              : `${PICK_BOX_OFF} group-hover:border-violet-400`) + " size-4"
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
      <span className="flex shrink-0 items-center gap-0.5 self-stretch py-1 pl-0.5">
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
          // [E32] **문항 동반을 고지한다.** 이 버튼은 픽바 [합본 조판]과 같은
          // 오케스트레이터 콜백(composeSheetsFromDossier)으로 흐르고, 그 콜백은
          // 도시에 문항 픽을 조판 축으로 승계한다. 구 자구는 학습지만 약속해
          // 「학습지 1장만 열려던 건데 문항 5개가 딸려 나왔다」가 됐다(적대검수 minor).
          title="[학습지 조판] 화면 우측에서 조판을 엽니다 — 체크한 학습지가 있으면 그 순서 뒤에 이 학습지가 이어붙고, 체크한 문항이 있으면 함께 조판됩니다"
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

// ── 펼침 본문 — 생성 중 스트립(§3.10.11-c) → CTA 행 → 인라인 폼
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
  onPickSheetRows,
  onAddPracticeSheet,
  onDeploySheet,
  onComposeSheets,
  onRetry,
  onRetryAnalysis,
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
  /** [E30 §4-4·§4-5] 학습지 픽 배치 커밋 — 계약은 파일 상단 props 주석 */
  onPickSheetRows?: (
    entries: readonly (readonly [string, SheetPickMeta])[],
    pick: boolean,
  ) => void;
  /** [E30 §2-1 (c)] 「실전 학습지 추가」 발사 — 미전달이면 버튼 미렌더 */
  onAddPracticeSheet?: (passageId: string) => void;
  onDeploySheet?: (meta: SheetPickMeta) => void;
  onComposeSheets?: (reportIds: string[]) => void;
  onRetry: () => void;
  /** [RCA #22] 큐 스트립 실패 행 재시도(학습지 계열 전용 — QueueStripRow 주석) */
  onRetryAnalysis?: () => void;
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
  const rawSheetRows = dossier.sheets ?? EMPTY_SHEET_ROWS;
  // [E30 §4-2] 같은 지문 안 표시 순서 = `sheetPlanRank` asc(기본 → 실전 → 직독직해 → 파이널 → 국어).
  // 서버 질의는 `updatedAt desc`(actions/studio/dossier.ts sheetRows)라 **나중에 만든
  // 실전이 기본 위**에 온다 — 사용자 요구(「학습지를 추가하고 실전 학습지를 추가하도록」)가
  // 화면에서부터 뒤집힌 채 시작한다. 랭크는 정본 1곳(pick-order.sheetPlanRank)만 쓴다.
  // ⚠ **정렬만** 한다 — 필터·절단 금지. 미지 마커는 랭크 9로 꼬리에 서고 사라지지 않는다
  //   (표시부는 미지 마커를 원문 폴백으로 그리는 계약이라, 정렬에서 증발시키면 화면에
  //    있던 행이 인쇄에서 사라진다 — pick-order.ts SHEET_PLAN_RANK 주석 정본).
  // ⚠ 이것은 **표시 순서**일 뿐 픽 순서가 아니다. 픽 순서는 끝까지 `pickedSheets` Map 의
  //   삽입 순서 하나뿐이다(E27 R1-0) — 여기서 정렬한 결과를 `composeIdsWith` 나
  //   대기열에 되먹이지 마라.
  // ⚠ `sort` 는 안정 정렬(ES2019 규격)이라 동랭크는 서버의 updatedAt desc 를 보존한다.
  const sheetRows = useMemo(() => {
    if (rawSheetRows.length < 2) return rawSheetRows;
    return [...rawSheetRows].sort(
      (a, b) => sheetPlanRank(a.planMarker) - sheetPlanRank(b.planMarker),
    );
  }, [rawSheetRows]);
  const maxTypeCount = questions.byType.reduce((m, t) => Math.max(m, t.count), 0);
  // 큐 축 분리(§3.10.19 E19-5 마지막 문단) — 학습지와 문제는 다른 산출물이라
  // 한 자리에 섞으면 사용자가 "내 학습지가 어디 갔나"를 다시 묻게 된다.
  // 문항 계열은 현행 위치(카드 본문 직속·맨 위)에, 학습지 계열(modules·exam)은
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

  // ── [E30 §4-4 D-COMPANION · §4-5 해제 대칭] 학습지 체크 토글 ────────────────
  //
  // 모집단은 **이 지문의 sheetRows 전량**이다(§4-4 호출부 표). 도시에는 지문 1건
  // 스코프라 필터·절단이 없어 「접힌 카드의 기본 행을 못 찾는」 구멍이 원리적으로
  // 없다 — 병합 목록판이 `mergedRows`(전체)를 넘겨야 했던 것과 같은 요구를 이 판은
  // 구조로 만족한다.
  //
  // ⚠ **`onToggleSheetPick` 을 두 번 부르지 마라.** 오케스트레이터의 `toggleSheetPick`
  //   은 렌더 중 갱신되는 `pickedSheetsRef.current` 에서 prev 를 읽으므로, 한 핸들러
  //   안의 두 번째 호출이 첫 번째를 덮는다(동반 픽된 기본이 조용히 증발). 그래서
  //   배치 채널(`onPickSheetRows`)이 있고, 없으면 **동반 없이** 구 동작으로 떨어진다.
  const sheetPickMetaRows = sheetRows.map(sheetMeta);
  const handleSheetToggle = (row: DossierSheetRow) => {
    const meta = sheetMeta(row);
    // 배치 채널 미배선 = additive 폴백(E21-5 계약) — 화면이 구 동작 그대로다.
    if (!onPickSheetRows) {
      onToggleSheetPick?.(row.reportId, meta);
      return;
    }
    if (pickedSheets.has(row.reportId)) {
      // ── 해제 대칭(§4-5) ──
      // 기본을 빼면 같은 지문의 **실전**도 같은 델타로 함께 뺀다. 안 그러면 담기
      // 방어(동반 픽)가 반쪽이 된다 — 「실전만 남은 픽」이 해제 경로로 만들어진다.
      // ⚠ 파이널(PRIME_FINAL)은 동반 해제 대상이 **아니다** — 기본 없이도 성립하는
      //   문서다(DB 실측 고아 3건). 동반 규칙은 PRIME_PRACTICE 에만 적용한다.
      // ⚠ 실전만 해제하는 것은 자유다(기본은 남는다) — 아래 분기가 PRIME 일 때만 돈다.
      const removed: SheetPickMeta[] = [meta];
      if (row.planMarker === PRIME_REPORT_MARKER) {
        for (const r of sheetRows) {
          if (r.planMarker !== PRACTICE_REPORT_MARKER) continue;
          if (!pickedSheets.has(r.reportId)) continue;
          removed.push(sheetMeta(r));
        }
      }
      // **한 델타**로 보낸다 — 두 번 부르면 dirty confirm 이 두 번 뜨고, 두 번째에서
      // 「취소」를 누르면 기본만 빠진 반쪽 상태가 남는다(§4-5).
      onPickSheetRows(
        removed.map((m) => [m.reportId, m] as const),
        false,
      );
      return;
    }
    // ── 동반 픽(§4-4) ──
    // 실전/파이널을 담으면 같은 지문의 기본을 **앞쪽에** 끼운다. 기본 행이 없으면
    // (파이널 고아) 규칙 3 으로 무동작 — 담기를 막지 않는다.
    const added = withBasicCompanions(
      [meta],
      sheetPickMetaRows,
      new Set(pickedSheets.keys()),
    );
    onPickSheetRows(
      added.map((m) => [m.reportId, m] as const),
      true,
    );
  };

  // ── [E30 §2-1 (c) · §2-4 층③] 「실전 학습지 추가」 노출 판정 ────────────────
  // 서버가 404(부모 PRIME 부재)로 막지만 **화면이 먼저 말해야 한다** — 없는 물건을
  // 팔아 놓고 실패로 배우게 하지 않는다.
  const hasBasicSheet = sheetRows.some(
    (r) => r.planMarker === PRIME_REPORT_MARKER,
  );
  // ⚠ 「이미 실전을 보유했는가」는 **두 축의 OR** 다(§1-4 D3-c 읽기 합집합):
  //   ① 자식 행(PRIME_PRACTICE) 존재  ② 레거시 병합본 — 기본 PRIME 의
  //   learning-worksheet 가 worksheet-grade. ②는 서버가 `analysis.hasExam` 으로
  //   내려 준다. ①을 **여기서도** 다시 보는 것은 중복이 아니라 안전망이다:
  //   dossier.ts 의 hasExam 이 합집합으로 확장되기 전(또는 D3-b 부모 강등으로 ②가
  //   false 로 떨어진 뒤)에 ①만 참인 창이 열리는데, 그때 이 버튼이 되살아나면
  //   **이미 ◈5 를 낸 사용자에게 같은 물건을 다시 판다**(§1-4 ⚠ 그대로).
  const hasPracticeSheet = sheetRows.some(
    (r) => r.planMarker === PRACTICE_REPORT_MARKER,
  );
  // §2-4 층③ 이 지목한 `detail.analyzed` 가드 미러 — 부모 리포트가 파싱조차 안 되면
  // (c) 라우트의 `baseReport`(생성기 2번째 인자)가 성립하지 않는다.
  const canAddPractice =
    onAddPracticeSheet !== undefined &&
    analysis.analyzed &&
    hasBasicSheet &&
    !hasPracticeSheet &&
    !analysis.hasExam;
  // 「지문당 활성 1잡」 배타(worksheet/route.ts)가 409 로 막는 창 — 자구는 서버
  // 409 원문을 그대로 쓴다(임의 문구 금지 · 화면과 서버가 같은 말을 한다).
  const addPracticeReason = sheetQueueItems.some((i) => i.status === "running")
    ? "이미 진행 중인 생성이 있습니다."
    : undefined;

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
                  ? "파이널 원페이지·실전 학습지·직독직해 분석본·국어 워크북은 인쇄용 학습지라 모바일 배포 대상이 아닙니다 — 기본 학습지를 만들면 보낼 수 있습니다"
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
      <SecAxis
        title="학습지"
        axis="worksheet"
        // [E29 경계 ④] 본문 padding 을 행 목록에 넘긴다 — 전폭 원장 행이 자기 좌우
        // 여백을 들어야 헤어라인이 선반과 같은 길이로 그어진다(SecAxis flush 주석).
        flush
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
          <p className="px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-400 break-keep">
            아직 만든 학습지가 없습니다
          </p>
        ) : (
          <>
            {/* ① 생성 큐 — flush 라 좌우 여백(px-3)은 스트립이 직접 든다.
                [RCA #22] 실패 행 「다시 시도」는 학습지 계열에만 내린다(문항 계열은
                `retryAnalysis` 로 되살아나지 않는다 — QueueStripRow 주석 정본). */}
            {sheetQueueItems.length > 0 ? (
              <QueueStrip
                items={sheetQueueItems}
                streamStore={streamStore}
                className={
                  "space-y-1 px-3 pt-2.5 " +
                  (sheetRows.length > 0 ? "pb-2" : "pb-2.5")
                }
                onRetry={onRetryAnalysis}
              />
            ) : null}

            {/* ② 완성 학습지 — 큐 항목이 사라진 자리로 "들어와지는" 층.
                ⚠ 【정정】 구 주석은 「행 골격·타이포·hover 를 아래 문항 행(E11)과
                  같은 계열로 맞춘다」였는데, [E29 경계] 이식으로 **더는 사실이 아니다**:
                  학습지 행만 전폭 원장(헤어라인 + 좌측 축 바)이 되고 문항 행은 아직
                  칩 문법이다. 그 비대칭은 실수가 아니라 **의도적 유예**이며 사유는
                  아래 「생성된 문제」 섹션 주석에 적어 뒀다(마키 히트 rect 계약).
                  살아 있는 원칙은 그대로다 — 두 목록이 오래 다른 문법이면 카드가
                  누더기가 되므로, 문항 축 개편이 열릴 때 이 비대칭을 닫아라.
                E21-5(§3.10.21): 행 클릭이 **조판 선택 토글**로 바뀌고 지문
                스튜디오 이동은 우측 chevron 링크로 내려간다 — 근거·구조 계약은
                SheetRowView 상단 주석. 배선 전(신규 prop 미전달)에는 구 렌더
                (행 전체 <Link>, classId 없으면 정적 div)가 그대로 나온다. */}
            {sheetRows.length > 0 ? (
              // [E29 경계 ④] 행 사이 선은 **컨테이너**(ROW_HAIRLINE)가 긋는다 —
              // 행마다 border-b 를 달면 마지막 행 아래에도 한 줄이 남아 「행이 하나 더
              // 있는 것처럼」 읽힌다(정본 CARD_MORE_CLS 주석과 같은 계통).
              // 큐 스트립이 위에 있을 때만 그 경계를 실선으로 한 번 긋는다(없으면
              // 선반의 border-b 가 이미 첫 행 위 선을 겸한다).
              <div
                className={
                  (sheetQueueItems.length > 0
                    ? "border-t border-slate-100 "
                    : "") + ROW_HAIRLINE
                }
              >
                {sheetRows.map((row) => {
                  // 배포 게이트는 정본 1곳에서만(§3.10.21 E21-5) — PRIME 외는
                  // deploy.ts 가 passageId 로 PRIME 행을 재조회하다 실패해
                  // "먼저 AI 분석을 완료해 주세요"라는 오해를 부른다.
                  // [E30] 실전 행도 여기서 fail-closed 로 잠긴다(P8: 로직 무개변,
                  // 사유 자구만 실전을 포함하도록 확장됐다 — 잠긴 이유가 사실이어야
                  // 사용자가 자기 행이 왜 잠겼는지 안다).
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
                      // [E30 §4-4·§4-5] 동반 픽·해제 대칭은 handleSheetToggle 이
                      // 소유한다. 미배선(두 핸들러 모두 부재)이면 구 렌더 폴백.
                      onToggle={
                        onToggleSheetPick || onPickSheetRows
                          ? () => handleSheetToggle(row)
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
                {/* [E30 §2-1 (c)] 「실전 학습지 추가」 — 행 목록의 **마지막 칸**이라
                    행과 같은 전폭·같은 좌측 축에 선다(정본 CARD_MORE_CLS 문법).
                    자기 폭 점선 버튼으로 두면 헤어라인과 충돌해 「행이 하나 더 있는
                    것처럼」 읽힌다.
                    ⚠ 노출 조건은 `canAddPractice` 한 곳이 소유한다 — 기본 미보유
                      지문에서는 **렌더 자체를 하지 않는다**(비활 버튼으로 남기면
                      "왜 안 눌리지"를 서버 404 로 배우게 된다).
                    ⚠ 이 버튼은 조판 픽이 아니라 **발사**다. 그래서 체크박스 열이
                      없고, 행 클릭 토글과 구분되게 좌측 아이콘이 Plus 다. */}
                {canAddPractice ? (
                  <button
                    type="button"
                    aria-disabled={addPracticeReason !== undefined}
                    title={
                      addPracticeReason ??
                      `기존 기본 학습지를 부모로 삼아 실전 학습지를 만듭니다 — 지문당 ◈${PRACTICE_ADD_UNIT_COST}`
                    }
                    onClick={() => {
                      if (addPracticeReason !== undefined) return;
                      onAddPracticeSheet?.(dossier.passage.id);
                    }}
                    className={
                      "flex w-full items-center gap-1.5 py-2 text-left text-[11.5px] font-semibold transition-colors " +
                      ROW_PAD_X +
                      (addPracticeReason !== undefined
                        ? " cursor-not-allowed bg-slate-50/60 text-slate-400"
                        : " cursor-pointer bg-slate-50/60 text-slate-500 hover:bg-violet-50 hover:text-violet-700")
                    }
                  >
                    <Plus className="size-3.5 shrink-0" aria-hidden="true" />
                    실전 학습지 추가
                    <span className="ml-auto shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-500 ring-1 ring-slate-200">
                      ◈{PRACTICE_ADD_UNIT_COST}
                    </span>
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* (E25-6 §3.10.24) 구 ③ 「미리보기」 모듈 칩 층(D4→E19-5 3층)은 지시로
                **폐기** — ModulePreviewSheet 배관(시트 상태·onPreviewModule 사슬)째
                걷어냈다. readyChips 는 위 빈 상태 판정이 계속 쓴다. 되살릴 일이
                생기면 지문 스튜디오(passage-studio-client)의 미리보기가 정본이다. */}
          </>
        )}
      </SecAxis>

      {/* [E29 경계 ③] 픽 축이 있는 두 번째 섹션 — 축 색은 blue(문항 축 체크박스와
          같은 언어). 본문은 `flush` 를 쓰지 않는다: 문항 목록은 필터 3셀렉트·유형
          분포 차트·전체선택 행이 한 덩어리로 얹힌 블록이고, 그 안쪽 행은
          **DragSelect 히트 rect 계약**(마키)이 걸려 있어 전폭 원장으로 뜯는 것은
          E30 범위 밖의 위험이다. 이번에 맞추는 것은 **섹션 머리**까지다 —
          같은 카드 안 두 섹션이 다른 머리를 쓰면 축 색 언어 자체가 성립하지 않는다.
          (행 문법까지 맞추는 것은 문항 축 개편이 열릴 때 함께 한다.) */}
      <SecAxis
        title="생성된 문제"
        axis="question"
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
      </SecAxis>

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
  onPickSheetRows,
  onAddPracticeSheet,
  onDeploySheet,
  onComposeSheets,
  onToggle,
  onRetry,
  onRetryAnalysis,
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
  /** [E30] 학습지 픽 배치 커밋(동반 픽·해제 대칭) — 계약은 파일 상단 props 주석 */
  onPickSheetRows?: (
    entries: readonly (readonly [string, SheetPickMeta])[],
    pick: boolean,
  ) => void;
  /** [E30] 「실전 학습지 추가」 발사 — DossierBody 패스스루 */
  onAddPracticeSheet?: (passageId: string) => void;
  onDeploySheet?: (meta: SheetPickMeta) => void;
  onComposeSheets?: (reportIds: string[]) => void;
  onToggle: () => void;
  onRetry: () => void;
  /** [RCA #22] 큐 스트립 실패 행 재시도 — DossierBody 패스스루 */
  onRetryAnalysis?: () => void;
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
                onPickSheetRows={onPickSheetRows}
                onAddPracticeSheet={onAddPracticeSheet}
                onDeploySheet={onDeploySheet}
                onComposeSheets={onComposeSheets}
                onRetry={onRetry}
                onRetryAnalysis={onRetryAnalysis}
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
  pickedFlat,
  onTogglePick,
  onPickRows,
  onClearPicked,
  onPickBarDeployed,
  onComposeExam,
  pickedSheets,
  onToggleSheetPick,
  onPickSheetRows,
  onAddPracticeSheet,
  onDeploySheet,
  onComposeSheets,
  onClearSheets,
  pickBarNudge = false,
  onRemovePassage,
  onRetryAnalysis,
}: PassageDossierAccordionProps) {
  // (E25-6) 구 모듈 미리보기 시트(D4) 상태·배관은 칩 층 폐기와 함께 소멸.

  // 인라인 폼 펼침 상태(§3.10.5) — 카드당 한 폼만, 재클릭 접기. 지문 전환
  // (expandedId 변경)에도 유지하고, 표시 집합에서 빠진 지문 것만 정리한다.
  const [openForm, setOpenForm] = useState<Record<string, DeployFormKind | null>>(
    {},
  );

  // ── 문항 체크(26-08-14 — §3.10.13) — 상태·프룬은 오케스트레이터 소유(위
  // props 주석 참조). 여기는 행 판정용 id 집합과 바 제목 해석 재료만 파생한다.
  // [E32] **두 축 합집합.** 행 체크·카드 담김 배지·순번 배지·마키 값이 전부 이
  // 집합에서 파생되므로(아래 소비처들), 여기 한 곳만 union 으로 만들면 「평면
  // 축에 담긴 문항이 도시에에서는 미체크로 보인다」가 통째로 사라진다.
  // pickedFlat 미전달이면 종전과 동일한 참조 계산으로 떨어진다(additive).
  // ⚠ **삽입 순서가 계약이다: 평면 축이 먼저, 도시에 신규분이 뒤.** 이 Set 의
  //   순회 순서가 곧 카드의 **순번 배지**(orderById)이고, 배지는 「조판 순서」를
  //   약속한다. 실제 조판 순서는 오케스트레이터 승계(inheritDossierQuestions)와
  //   픽바 집계(mergedPicked)가 **둘 다 평면 축을 앞에** 두므로, 여기서 도시에를
  //   먼저 담으면 배지 숫자만 다른 순서를 말하는 거짓 표시가 된다.
  const pickedIds = useMemo(() => {
    const s = new Set<string>();
    if (pickedFlat) for (const id of pickedFlat.keys()) s.add(id);
    for (const id of picked.keys()) s.add(id);
    return s;
  }, [picked, pickedFlat]);
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
              onPickSheetRows={onPickSheetRows}
              onAddPracticeSheet={onAddPracticeSheet}
              onDeploySheet={onDeploySheet}
              onComposeSheets={onComposeSheets}
              onToggle={() => onExpand(expandedId === p.id ? null : p.id)}
              onRetry={() => onRetry(p.id)}
              // [RCA #22] 큐 실패 행 재시도 — 도시에 카드는 지문 1건 스코프라
              // passageId 를 여기서 접는다(스트립 항목에는 passageId 가 없다 —
              // deploy-target.ts DossierQueueItem 계약).
              onRetryAnalysis={
                onRetryAnalysis ? () => onRetryAnalysis(p.id) : undefined
              }
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
        // [E32] 바의 문항 카운트·유형 칩·배포 페이로드가 **두 축 union** 이 된다
        // (그 파일 mergedPicked). 이 한 줄이 빠지면 바가 「합본 조판 — 문항 5개」로
        // 약속하고 8개를 조판하는 상태로 되돌아간다.
        pickedFlat={pickedFlat}
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
