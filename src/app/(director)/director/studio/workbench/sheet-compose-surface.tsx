"use client";

// ============================================================================
// 클래스 스튜디오 — 우측 패널 내장 **학습지 조판** (docs/class-studio-spec.md §3.10.21)
//
// 시험지 조판(`exam-compose-surface.tsx`)이 **문항 축**에 준 것을 **학습지(문서) 축**에
// 그대로 준다: 페이지·모드 전환 0으로 우측 그 자리에 조판 표면이 들어오고, 왼쪽 목록에서
// 체크할 때마다 학습지가 실시간으로 이어붙거나 빠진다. 그래서 이 파일은 시험지 조판
// 표면의 **6계약을 그대로 복제**한다(구조가 같아야 두 조판이 같은 물건으로 읽힌다):
//   ① `active` prop + `isShowing() = active && Boolean(rootRef.current?.offsetParent)`
//   ② dirty 시 `window.confirm` 닫기 가드
//   ③ Escape 는 active·`!e.defaultPrevented`·isShowing() 일 때만
//   ④ 재가시 시 뒤로가기 버튼 포커스 복원
//   ⑤ 컴팩트 h-10 헤더
//   ⑥ 「체크하면 즉시 올라간다」 안내 1줄
//
// ─── 시험지 조판과 **다른** 점(= 이 유닛의 고유 책임) ────────────────────────────────
// 시험지 빌더는 문항 id 배열만 받으면 자기가 알아서 문항을 가져온다(`syncQuestionIds`).
// 학습지 편집기(`AnalysisReportEditor`)에는 그런 통로가 없다 — 문서 본문(`AnalysisReport`)을
// **완성된 형태로** 받아야 한다. 그래서 「체크 → 조판」의 나머지 절반(문서 로딩·캐시·활성
// 문서 선택·저장/인쇄 헤더·컨테이너 접힘 사다리)이 전부 이 표면 몫이다.
//
// ─── 최상위 제품 계약: 조판은 합성 **뷰**이지 합성 **문서**가 아니다(E21-0) ──────────
// N개 학습지를 한 레코드로 저장하는 길은 영구히 없다(`schema.ts:1016,1062` sections max(12)
// + `section-slots.ts:81` kind-첫-occurrence 슬롯팅). 저장은 끝까지 **활성 문서 1개**의
// PATCH 다. 그래서 헤더가 「편집 중: {문서명} · 부착 {n}건 · 저장 대상은 현재 문서」를
// **상시 문자로** 고지한다 — 고지 없는 합성은 즉시 신뢰 사고다.
//
// ─── 이 파일이 일부러 **하지 않는** 것 ──────────────────────────────────────────────
//  · `onDraftChange` 를 넘기지 않는다(E21-5). 그 콜백은 타이핑 1글자마다 발화하므로
//    스튜디오 전역(`studio-home-client.tsx:232-234` 계열)이 매 글자 리렌더된다.
//  · 합성 로직을 만들지 않는다. `composeDocs` 만 건네면 편집기 내부가 순수층
//    (`analysis-report/compose/`)으로 합성한다 — SectionFlowCache 소유도 편집기 몫이다
//    (`AnalysisReportEditor.tsx` composeCachesRef). 여기서 캐시를 또 들면 이중 소유가 된다.
//  · 체크 해제된 문서의 **본문 캐시는 지우지 않는다**(요구 ①) — 재체크가 네트워크 0으로
//    즉시 되살아나야 "실시간"이다. 지우는 건 조판 순서에서 빠지는 것뿐이다.
//
// ════════════════════════════════════════════════════════════════════════════
// [E22/U9] **합본 조판 표면으로 승격**(docs/class-studio-spec.md §3.10.22)
// ════════════════════════════════════════════════════════════════════════════
//
// ① 문항이 합류한다. 파이프라인은 전부 바깥에 있고 여기는 **배선 3단**뿐이다:
//    `pickedQuestions` → `useComposeQuestions`(U8, 배치 로더+캐시)
//                     → `buildQuestionFlowItems`(U3, 순수 FlowItem 변환)
//                     → `<AnalysisReportEditor composeQuestions={…} />`(U5).
//    합성 자체는 `buildComposedView`(U4) **안**에서 일어난다 — 밖에서 잇는 길은
//    `applyBlockOrder` splice 폴백이 문항 묶음을 활성 학습지 한가운데로 빨아들여
//    영구히 봉인됐다(`compose-flow.ts:313-329`).
//
// ② **합본은 활성 학습지 1건 이상을 요구한다**(E22-6 확정). 편집기는 `initialReport`
//    로만 시드되므로 활성 문서가 없으면 `ReportPages` 가 마운트조차 되지 않아
//    (아래 `activeDoc` 3분기) 문항만 넘겨도 화면에 아무것도 안 뜬다. 순수 문항
//    조판은 기존 시험지 빌더가 계속 담당한다(그쪽은 IntersectionObserver 페이지
//    가상화를 갖고 있고, 여기로 오면 같은 51페이지가 1,311노드 → 약 12,800노드가 된다).
//    → 빈 상태 문구가 그 경로를 한 줄로 안내한다.
//
// ③ **문항은 저장되지 않는다.** E21-0 고지("저장 대상은 현재 문서")에 문항 축을
//    덧대 「문항 m개(시험지 세트에 저장 · 여기서 편집 불가)」를 **상시** 표시한다.
//    고지 없는 합성은 즉시 신뢰 사고라는 규칙이 문항 축에도 그대로 적용된다.
//
// ④ **정답표 토글은 이 표면의 로컬 state 다.** `report.activityAnswerKeyPage` 를
//    재사용하면 문항 설정이 **남의 학습지 문서 스키마**에 저장된다(그 필드는 활성
//    문서의 저장 PATCH 에 그대로 실린다). 문항은 리포트 문서가 아니므로 이 토글은
//    끝까지 화면 상태로만 남는다.
//
// ⑤ **6장 상한 폐기**(E22-0 3번). 근거였던 「pages JSON 이 문서당 수 MB」는 반증됐다
//    (실측 중앙값 49KB · 최대 458KB · 40건 합계 1.9MB / 조판 아이템 30→300 토글
//    890ms→883ms). 하드 상한 대신 ⓐ 서버 요청 배치 상한 12(`SHEET_COMPOSE_DOC_BATCH`)
//    ⓑ 이 파일의 **청크 로딩** ⓒ **소프트 경고**(막지 않는다)로 대체했다.
//
// ════════════════════════════════════════════════════════════════════════════
// [E27/U4] **지문 단위 인터리브 · 조판 목차 · 추가 오토스크롤**
// (`.tmp-worksheet-compose/E27-SPEC.md` §2 R1-4~R1-7 · §4 R3-1/R4)
// ════════════════════════════════════════════════════════════════════════════
//
// E22 까지 인쇄 묶음은 「학습지 전부 → 문항 전부」였다. 같은 지문에 학습지를 여러 장
// 올리면 「지문1 학습지 → 지문2 학습지 → 문제 전부」가 되어, 지문1 문제를 풀려면 지문2
// 학습지를 넘겨야 했다. E27 은 묶음을 **지문 단위**로 자른다:
//   `[지문1 학습지들][지문1 문제들][지문2 학습지들][지문2 문제들][정답표]`
//
// 이 표면이 새로 지는 책임 4개(계산은 여전히 전부 순수층에 있다):
//  ① **지문 그룹 모델** — `picked` **전량**을 passageId 로 연속 그룹핑해 그룹 순서를
//     먼저 확정한다. readyIds 위에서 계산하면 청크가 도착할 때마다 그룹 경계가 흔들려
//     A4 재측정이 반복된다(정찰 A). 그룹의 **앵커**(문항을 매달 문서)만 readyIds 로 고른다.
//  ② **문항 슬라이스** — `buildComposedQuestionViews` 는 지금처럼 **전체 id 로 1회만**
//     부르고(그래야 `no` 가 전역 1..N 이라 통합 정답표와 정합), 그 결과 배열을 passageId 로
//     자른 뒤 **그룹마다 `buildQuestionFlowItems` 를 따로** 부른다(따로 불러야 각 묶음
//     첫 조각에 `breakBefore` 가 붙는다). 정답표는 **맨 끝 1개로 통합**(사용자 확정).
//  ③ **조판 목차 데이터**(`composeOutline`) — 데이터만 내린다. 클릭 처리는 편집기 몫이고,
//     활성 문서 전환은 끝까지 **헤더 문서 칩**의 책임이다(칩 = 편집 대상 전환 + dirty
//     confirm / 목차 = 이동. 섞으면 목차 클릭 한 번에 미저장 편집이 증발한다).
//  ④ **추가 시 자동 스크롤**(R4) — 판정 축이 **이 파일 한 곳**이다. 오케스트레이터는
//     학습지 커밋 지점이 10곳이라 하나만 빠뜨려도 무음 무동작이 된다(정찰 D).
//
// ⚠ 이 4개가 전부 **내용 키 문자열 → useMemo** 관용구 위에 서 있다. Map/배열을 매 렌더
//   새로 만들면 `buildComposedView` 가 전량 재합성된다(실측 489ms). `picked` Map 값에
//   「방금 추가됨」 같은 플래그를 심는 길은 그래서 영구히 막혀 있다.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileQuestion,
  Key,
  LayoutTemplate,
  Loader2,
  Printer,
} from "lucide-react";

import { SaveButton } from "@/components/ui/save-button";
import { cn } from "@/lib/utils";
import {
  AnalysisReportEditor,
  type AnalysisReportEditorEmbed,
  type ComposeDoc,
  type ReportEditorToolbarState,
} from "@/components/workbench/analysis-report/AnalysisReportEditor";
import {
  ACTIVE_DOC_KEY,
  type ComposedDocHeader,
} from "@/components/workbench/analysis-report/compose/compose-flow";
import {
  buildQuestionAnswerKeyItems,
  buildQuestionFlowItems,
} from "@/components/workbench/analysis-report/compose/question-flow";
import { questionOrderId } from "@/components/workbench/analysis-report/compose/question-ids";
import type { ComposedQuestionView } from "@/components/workbench/analysis-report/compose/question-view";
import type {
  ComposeOutlineEntry,
  ComposeOutlineGroup,
  ComposeScrollRequest,
  ComposeScrollTarget,
} from "@/components/workbench/analysis-report/compose/outline-types";
import type { FlowItem } from "@/components/workbench/analysis-report/report-sections";
import { getStudioWorksheetDocs, type StudioWorksheetDoc } from "@/actions/studio/worksheet-docs";
// 요청 배치 상한은 "use server" 모듈에서 export 될 수 없어 플레인 모듈로 떨어져 있다
// (worksheet-docs-constants.ts 주석 — `passage-constants.ts:1-3` 과 같은 이유).
// 구 `SHEET_COMPOSE_MAX_DOCS`(=6)는 E22-0 3번으로 **폐기**됐다 — 이제 남은 것은
// "한 왕복에 몇 개까지 실을 수 있나"뿐이고, 그 수를 넘기는 일은 아래 로더가 청크로 막는다.
import { SHEET_COMPOSE_DOC_BATCH } from "@/actions/studio/worksheet-docs-constants";
import { useComposeQuestions } from "./use-compose-questions";
// [E27 적대검수 — S2] 문항 그룹 정렬의 **정본 규칙**. 오케스트레이터가 소유하지만
// 오케스트레이터는 **부르지 않는다** — `flatPicked` 를 재정렬하면 시험지 빌더의
// 라이브 동기화(`exam-paper-builder-client.tsx:1182-1191`)가 집합 diff 전용이라
// 순수 재정렬에 무동작인데 순번 배지만 즉시 바뀌어 「배지≠시험지 인쇄 순서」가 된다.
// 그래서 이 규칙의 **유일한 호출부가 여기(학습지 조판 표면)** 다: 우리 인쇄 스트림의
// 순서만 우리가 정하고, 그 결과를 대기열 Map 으로 되돌리지 않는다.
// (순환 import 처럼 보이지만 아니다 — 번들러는 named import 를 **호출 지점 프로퍼티
//  접근**으로 컴파일하고 함수 선언은 호이스팅되므로 값이 비어 있는 창이 없다.
//  규칙을 여기로 복제하지 마라: 두 벌이 되는 순간 조용히 갈린다.)
import { withPassageGroupedQuestionOrder } from "@/lib/studio/pick-order";
import type { PickedQuestionMeta } from "./dossier-pick-bar";
import type { SheetPickMeta } from "@/lib/studio/sheet-pick-types";
import { registerSheetComposeDirtyProbe } from "@/lib/studio/sheet-compose-dirty-guard";
import { SHEET_PLAN_LABEL } from "@/lib/studio/sheet-products";
import {
  isFinalOnepageReportShape,
  type AnalysisReport,
} from "@/lib/passage-report/analysis-report/schema";

// ── 임베드 격리 상수(E21-3) ─────────────────────────────────────────────────────
/**
 * 캔버스 루트 DOM id. **반드시 시험지 빌더(`exam-paper-builder-client.tsx:2897`)의
 * `exam-paper-print-root` 와 달라야 한다** — 시험지 조판 표면은 다른 자산 뷰로 가도
 * `hidden` 토글로 **상시 마운트**되므로(studio-home-client.tsx:1689-1700 계열) 두 조판이
 * 동시에 DOM 에 있고, `use-paper-item-drag.ts:52,65` 의 `getElementById` 는 첫 매칭만
 * 잡아 **남의 캔버스를 오토스크롤**한다.
 */
const SHEET_COMPOSE_PRINT_ROOT_ID = "sheet-compose-print-root";
/**
 * localStorage 네임스페이스. 폭 3키 + 패널 섹션 2키 + `defaultApplied.v1` 이 갈라진다.
 * 없으면 임베드에서 줄인 폭이 지문 스튜디오에 영구 누수되고, 더 나쁘게는 임베드가 어떤
 * 지문을 **열어 보기만 해도** 독립 라우트에서 그 지문에 기본 템플릿이 영영 자동 적용되지
 * 않는다(E21-3 4행 — `hasAppliedDefaultFor` 가 템플릿 유무와 무관하게 기록을 남기므로).
 * 문자셋은 `[A-Za-z0-9_-]`(editor-storage.ts nsSegment 규약) 안에 둔다.
 */
const SHEET_COMPOSE_STORAGE_NS = "sheetCompose";

// ── 접힘 사다리 임계(E21-4) ────────────────────────────────────────────────────
// 편집기의 `isMobile` 은 100% **뷰포트** 기준(`matchMedia('(max-width:1023px)')`)이고 레일
// 표시는 Tailwind `lg:` 로 이중 게이트다 — **컨테이너가 아무리 좁아도 뷰포트가 넓으면
// 크롬이 전부 렌더된다.** 그래서 컨테이너를 재는 쪽(=이 표면)이 접힘을 강제한다.
const LADDER_ACTIVITY_PX = 1120;
const LADDER_PANEL_PX = 880;
const LADDER_PAGES_PX = 700;
/**
 * 히스테리시스 폭. 켤 때는 임계 미만에서 즉시 켜고, **끌 때는 임계+40px 를 넘어야** 끈다.
 * 없으면 사용자가 스플리터를 임계 근처에 놓거나 스크롤바가 나타났다 사라지는 것만으로
 * 접힘이 매 프레임 토글되어 레일이 떨린다(ResizeObserver → setState → 레이아웃 변화 →
 * ResizeObserver 의 되먹임 고리).
 */
const LADDER_HYSTERESIS_PX = 40;

interface Ladder {
  activity: boolean;
  panel: boolean;
  pages: boolean;
  narrow: boolean;
}
const LADDER_OPEN: Ladder = { activity: false, panel: false, pages: false, narrow: false };

/** 폭 + 직전 상태 → 다음 접힘 상태(순수). 히스테리시스는 "켜짐이면 임계를 40 올려 본다". */
function nextLadder(width: number, prev: Ladder): Ladder {
  const on = (limit: number, current: boolean) =>
    current ? width < limit + LADDER_HYSTERESIS_PX : width < limit;
  const activity = on(LADDER_ACTIVITY_PX, prev.activity);
  return {
    activity,
    panel: on(LADDER_PANEL_PX, prev.panel),
    pages: on(LADDER_PAGES_PX, prev.pages),
    // narrow 는 사다리 **전 구간**(= 첫 계단이 켜지는 순간부터) 적용한다. 툴바 장문 라벨을
    // 컨테이너 기준으로 되돌리는 CSS 훅일 뿐이라(`.are-shell[data-embed-narrow]`) 일찍
    // 켜도 손해가 없고, 늦게 켜면 activity 가 접힌 폭에서 툴바가 먼저 넘친다.
    narrow: activity,
  };
}
function sameLadder(a: Ladder, b: Ladder): boolean {
  return (
    a.activity === b.activity &&
    a.panel === b.panel &&
    a.pages === b.pages &&
    a.narrow === b.narrow
  );
}

// ── docKey ────────────────────────────────────────────────────────────────────
const DOC_KEY_UNSAFE = /[^A-Za-z0-9_]/g;
/**
 * reportId → 부착 문서 docKey.
 *
 * 규약 2개를 동시에 만족해야 한다:
 *  1) 문자셋 `[A-Za-z0-9_]`(`isValidDocKey`) — `scrollToBlock` 이 `CSS.escape` 없이
 *     `[data-paper-item-id="${id}"]` 를 문자열 결합하므로 위반 시 조판이 조용히 깨진다.
 *     (편집기가 위반 문서를 콘솔 경고 후 **제외**하므로 조용히 사라지기까지 한다.)
 *  2) **위치가 아니라 문서에 고정** — 편집기가 소유한 `Map<docKey, SectionFlowCache>` 의
 *     키라서, `d1`/`d2` 같은 순번 키를 쓰면 체크 해제로 순서가 밀릴 때 **B 문서가 A 문서의
 *     캐시를 물려받는다**. 슬롯키가 `sec:{si}:{key}` 라 문서가 달라도 같은 키가 나오고,
 *     키 배열(`[section, si, no, …]`)까지 우연히 같아질 수 있어 캐시의 "miss 로 안전 실패"
 *     보장이 성립하지 않는다(compose-flow.ts `caches` 계약 주석).
 * 접두 `d_` 는 활성 문서 키 `ACTIVE_DOC_KEY = "d0"` 와의 충돌을 원천 차단한다.
 */
function docKeyFor(reportId: string): string {
  return `d_${reportId.replace(DOC_KEY_UNSAFE, "_")}`;
}

// ── 문서 캐시 ─────────────────────────────────────────────────────────────────
/**
 * 본문 캐시 + 드롭 사유를 **한 state 로** 묶는다. 둘을 따로 두면 "드롭만 갱신했는데
 * docs 참조가 바뀌어" 합성 파이프라인이 통째로 재계산되는 사고가 나기 쉽다 —
 * 여기서는 드롭만 바뀔 때 `docs` 참조를 **그대로 재사용**한다(아래 setStore 참조).
 */
interface DocStore {
  docs: ReadonlyMap<string, StudioWorksheetDoc>;
  /** reportId → 사용자에게 보여 줄 드롭 사유(KO 문서·미링크·파싱 실패·조회 실패). */
  dropped: ReadonlyMap<string, string>;
}
const EMPTY_STORE: DocStore = { docs: new Map(), dropped: new Map() };

// ── [E22/U9] 참조 안정 상수 ───────────────────────────────────────────────────
/**
 * 배열 참조 안정화용 구분자. `` 은 cuid/uuid 어디에도 나타나지 않아 join↔split
 * 왕복이 무손실이고, 문자열 키 하나만 deps 로 물면 **같은 내용 → 같은 참조**가
 * 부수효과 없이 보장된다(`use-compose-questions.ts:60,118-127` 과 같은 관용구).
 *
 * 왜 "직전 값을 ref 에 두고 비교"가 아닌가: 렌더 중 ref 쓰기는 React Compiler 순수성
 * 위반이고 이 파일이 이미 명시적으로 금지한 관용이다(아래 activeIdRef 주석).
 */
const IDS_KEY_SEP = "\u0001";
/** 고정 참조 빈 배열 3종 — 매 렌더 새 `[]` 하나가 합성 전량 재계산의 방아쇠다. */
const EMPTY_IDS: string[] = [];
const EMPTY_QUESTION_ITEMS: FlowItem[] = [];

// ── [E27] 지문 그룹 인터리브 (E27-SPEC §2 R1-4~R1-7) ──────────────────────────
/**
 * 내용 키의 **필드** 구분자. 레코드 구분자는 위 `IDS_KEY_SEP`(U+0001)이고 이건 그 안쪽이다.
 * 두 축 다 제어문자라 cuid/uuid 와 절대 충돌하지 않는다.
 *
 * 왜 「직전 Map 을 ref 에 두고 비교」가 아니라 문자열 접기인가: 렌더 중 ref 쓰기는 React
 * Compiler 순수성 위반이고(이 파일 `activeIdRef` 주석), 여기서 필요한 것은 「내용이 같으면
 * 같은 참조」뿐이라 문자열 하나면 충분하다. `picked`/`pickedQuestions` 는 오케스트레이터가
 * 매 커밋 새 Map 을 만들 수 있으므로(부분 갱신 패턴) Map 참조를 deps 에 물면 안 된다.
 */
const GROUP_FIELD_SEP = "\u0002";
/** 내용 키에 실을 자유 텍스트(제목)의 구분자 오염 제거 — 파싱이 필드 수로 갈리지 않게. */
const KEY_CTRL_RE = /[\u0001\u0002]/g;
function foldKeyText(s: string | null | undefined): string {
  return (s ?? "").replace(KEY_CTRL_RE, " ");
}

/**
 * 문항 묶음 하나가 쓰는 `sectionIndex` 보폭.
 *
 * E27 은 문항을 **지문 그룹마다 따로** 조판하므로 `buildQuestionFlowItems` 가 한 조판에서
 * 여러 번 불린다. 매 호출이 0부터 세면 서로 다른 그룹의 논리 블록이 같은 sectionIndex 를
 * 갖게 되고, `runs.tsx:31-38` 런 병합과 `packFlow`(`items.ts` newSection/newRun)가 둘 다
 * `(wrap, sectionIndex)` 축을 보므로 그룹 경계에서 박스가 잘못 병합될 여지가 생긴다.
 */
const QUESTION_BUNDLE_STRIDE = 1000;
/**
 * 보폭을 적용할 수 있는 묶음 수 상한. `QUESTION_SECTION_BASE`(900,000)와
 * `QUESTION_ANSWER_SECTION`(990,000) 사이가 90,000 이라 90번째 묶음부터는 정답표 구간을
 * **침범**한다 — 침범하면 마지막 문항 조각과 정답표 첫 조각이 `runs.tsx:34` 에서 한 런으로
 * 병합돼 정답표 표가 문항 박스 안으로 빨려 들어간다(`question-ids.ts:110-116`).
 *
 * 그래서 상한을 넘으면 **보폭을 고정(clamp)** 한다. clamp 의 부작용은 두 묶음이 같은
 * sectionIndex 대역을 공유하는 것뿐인데, ws-list 의 런 병합은 `runs.tsx:37` 의 orderId
 * 동일성이, packFlow 의 런 경계는 `wsl && groupStart`(= orderId 변화)가 2차로 막아
 * 실질 무해하다. 정답표 구간 침범과 저울질하면 clamp 가 명백히 안전한 실패다.
 * (현실 상한: 소프트 경고가 총 아이템 600 에서 뜨므로 묶음 90개는 도달 불가에 가깝다.)
 */
const QUESTION_BUNDLE_MAX = 89;
function bundleSectionSeqStart(bundleIndex: number): number {
  return Math.min(bundleIndex, QUESTION_BUNDLE_MAX) * QUESTION_BUNDLE_STRIDE;
}

/** 고정 참조 빈 컨테이너 — 위 `EMPTY_QUESTION_ITEMS` 와 같은 이유(참조 churn = 전량 재합성). */
const EMPTY_AFTER_DOC: ReadonlyMap<string, FlowItem[]> = new Map();
const EMPTY_OUTLINE: ComposeOutlineGroup[] = [];
const EMPTY_GROUPS: ComposePassageGroup[] = [];
const EMPTY_SHEET_LABELS: ReadonlyMap<string, { title: string; planMarker: string }> =
  new Map();
const EMPTY_QUESTION_SLICES: ReadonlyMap<string, ComposedQuestionView[]> = new Map();
const EMPTY_PASSAGE_TITLES: ReadonlyMap<string, string> = new Map();
const EMPTY_QUESTION_BUNDLES: ReadonlyMap<string, FlowItem[]> = new Map();
/**
 * [E27 적대검수 — P3] 「배치할 문항이 0건」의 **고정 참조** 결과.
 * 매번 새 `{ placed: [], tail: [] }` 를 돌려주면 문항 0건 상태에서도 하류
 * `composeQuestionPlan` 이 매 렌더 재실행된다(참조 churn = 전량 재합성 489ms).
 */
const EMPTY_PLACEMENT: {
  placed: {
    groupKey: string;
    passageId: string;
    anchorDocKey: string;
    headerTitle: string;
  }[];
  tail: { passageId: string; headerTitle: string }[];
} = { placed: [], tail: [] };

/** 조판 순서상의 **지문 그룹** 1건. 그룹 순서 = 인쇄 순서(= `picked` Map 삽입 순서). */
interface ComposePassageGroup {
  /**
   * React key. 보통 passageId 그대로다. 같은 지문이 **비연속**으로 두 번 나오면
   * (= 정렬 정본이 아직 안 돌았거나 정렬이 깨진 프레임) `#{index}` 를 덧붙여 key 유일성을
   * 지킨다 — 목차가 중복 key 로 조용히 항목을 잃는 것보다 낫다.
   */
  key: string;
  passageId: string;
  passageTitle: string;
  /** 이 그룹의 학습지 reportId — `picked` 순서 그대로(= 인쇄 순서). */
  reportIds: string[];
}

// ── [E22/U9] 소프트 경고 임계(E22-0 3번 — **막지 않는다**) ─────────────────────
/**
 * 「무거워질 수 있습니다」 고지 임계(조판 아이템 총합).
 *
 * R4 실측: 조판 아이템 30→300 구간에서 토글 890ms→883ms(아이템당 약 1.3ms, 초선형
 * 아님). 즉 600은 "막아야 할 선"이 아니라 "여기서부터는 체감이 생길 수 있다"는 고지선이다.
 */
const SOFT_ITEM_LIMIT = 600;
/**
 * 문서 1건이 만드는 조판 아이템 수의 **보수적 환산치**.
 *
 * 정확한 수는 `reportFlowItems`(`report-sections/assemble.tsx:125`)를 문서마다 다시
 * 돌려야 나오는데, 그 계산은 편집기가 자기 캐시(`composeCachesRef`)와 함께 이미
 * 소유하고 있고 여기서 또 돌리면 **같은 일을 두 번** 하게 된다(캐시 이중 소유 금지 —
 * 파일 상단 「하지 않는 것」). 편집기는 페이지 수/아이템 수를 밖으로 내보내는 채널이
 * 없으므로(`ReportEditorToolbarState` 에 그런 필드가 없다), 고지 전용 지표는
 * R4 실측 「6문서 = 약 300아이템」에서 나온 문서당 50으로 환산한다.
 * 고지는 막지 않으므로 오차가 사용자를 가로막지 않는다.
 */
const EST_ITEMS_PER_DOC = 50;

export function SheetComposeSurface({
  classId,
  className,
  picked,
  activeReportId,
  onActiveReportIdChange,
  active = true,
  onClose,
  academyId,
  pickedQuestions,
  questionsTitle,
}: {
  /** 문서 로더의 소유 검증 입력. null 이면 조회 자체를 하지 않는다(클래스 미선택). */
  classId: string | null;
  /**
   * 헤더 표기용 **클래스명**. React 관용의 CSS class 가 아니다 —
   * `exam-compose-surface.tsx:58` 이 같은 이름을 같은 의미로 쓰고 있어 맞춘다
   * (두 조판 표면의 prop 이름이 갈리면 오케스트레이터에서 매번 헷갈린다).
   */
  className: string | null;
  /**
   * 체크된 학습지. **Map 삽입 순서 = 조판 순서**이고 소유자는 오케스트레이터다
   * (`studio-home-client.tsx:1409-1414` 주석 — 우측 본문이 aside/드로어 2트리에
   * 렌더되므로 상태를 아래에 두면 별개 인스턴스가 된다).
   * 참조가 바뀔 때만 재조회하므로 **내용이 같으면 같은 Map 참조를 유지**해야 한다.
   *
   * [E27] 이 순서는 이제 **지문 그룹 순서**이기도 하다 — 오케스트레이터의
   * `withPassageGroupedOrder`(§2 R1-2)가 같은 passageId 의 학습지를 붙여 놓은 상태로
   * 내려온다. 이 표면은 그 순서를 **그대로 믿고 연속 그룹핑만** 한다(임의 재정렬 금지 —
   * 순번 배지 3표면이 전부 이 Map 삽입 순서 파생이라 갈리면 「배지 1,2,3 인데 인쇄는
   * 3,1,2」가 재발한다. R1-0 최상위 불변식).
   */
  picked: ReadonlyMap<string, SheetPickMeta>;
  /** 활성(=편집 대상) 문서. null 이면 체크 순서 첫 문서로 자동 수렴한다. */
  activeReportId: string | null;
  /** 활성 문서 전환 요청(헤더 문서 칩 클릭 · 자동 수렴 동기화). */
  onActiveReportIdChange: (reportId: string) => void;
  /**
   * 표면이 지금 보이는가. 다른 자산 뷰로 가면 호스트가 **숨김 마운트**로 보존하며 false 를
   * 내린다. false 동안 Escape 닫기·포커스가 비활성이고(숨은 표면이 전역 Escape 를 가로채
   * confirm 을 띄우는 것 방지), **인쇄 대상에서도 빠진다**(아래 printExclude).
   */
  active?: boolean;
  onClose: () => void;
  // ── [E22/U9] 문항 축 — **전부 옵셔널(additive)** ───────────────────────────
  /**
   * 문항 조회의 테넌트 검증 입력(`getExamPaperBuilderQuestionsByIds` 1인자).
   * 미전달이면 빈 문자열로 떨어져 `useComposeQuestions` 가 **조회 자체를 하지 않는다**
   * (그 훅 `:100` 계약). 지시서는 이 prop 을 필수로 적었지만 절대규칙 ②(새 prop 은
   * 옵셔널, 미전달 시 기존 동작 바이트 동일)가 우선하고, 배선 유닛(U13)이 아직
   * 착지하지 않은 상태에서 호출부가 tsc 를 깨지 않아야 한다. 동작 계약은 동일하다.
   */
  academyId?: string;
  /**
   * 체크된 문항. **Map 삽입 순서 = 체크 순서 = 순번 배지 = 시험지 조판 인쇄 순서**이고
   * 소유자는 오케스트레이터다(`studio-home-client.tsx` flatPicked — `picked` 와 같은
   * 이유로 같은 위치).
   *
   * ⚠ [E27 적대검수 — S2] **이 표면의 인쇄 순서는 이 순서가 아니다.** 학습지 조판은
   *   지문 그룹 단위로 인터리브하므로, 아래 `questionIdsKey` 에서
   *   `withPassageGroupedQuestionOrder` 로 **지문 그룹 순서**로 다시 세운 뒤 조판한다.
   *   그 결과를 이 Map 으로 되돌리면 안 된다 — 되돌리는 순간 시험지 축(집합 diff 전용
   *   라이브 동기화)에서 「배지만 바뀌고 인쇄 순서는 그대로」가 재발한다.
   *   두 조판이 서로 다른 순서로 인쇄하는 것이 **의도**이고, 학습지 조판의 순서는
   *   조판 목차(`composeOutline`)가 눈으로 보여 준다.
   *
   * 미전달 = 문항 0건 = 기존 학습지 전용 조판과 **산출물 바이트 동일**
   * (아래 `composeQuestionPlan` 이 고정 참조 빈 배열/빈 Map 으로 떨어지고, 편집기의
   * `composeActive` 산식이 `composeCompanions.length > 0` 과 동치가 된다).
   */
  pickedQuestions?: ReadonlyMap<string, PickedQuestionMeta>;
  /**
   * 문항 구간의 러닝헤더 제목. 안 주면 「문항」. 이 값이 없으면 `pages.tsx:216` 폴백이
   * **활성 학습지 제목**을 문항 페이지 머리글에 찍어 오귀속이 인쇄물에 남는다
   * (`compose-flow.ts:117-119` — docHeader 존재 자체가 귀속 스위치다).
   */
  questionsTitle?: string;
}) {
  const [store, setStore] = useState<DocStore>(EMPTY_STORE);
  const [pending, setPending] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [toolbar, setToolbar] = useState<ReportEditorToolbarState | null>(null);
  const [ladder, setLadder] = useState<Ladder>(LADDER_OPEN);
  /**
   * [E22/U9-6] 문항 정답표를 묶음 맨 끝에 붙일지 — **이 표면의 로컬 state**.
   *
   * `report.activityAnswerKeyPage` 를 재사용하지 않는다. 그 필드는 활성 학습지 문서의
   * 스키마 필드이고 저장 PATCH 에 그대로 실린다(`schema.ts` activityAnswerKeyPage) —
   * 문항 조판 설정을 거기 쓰면 **남의 문서**가 오염된다. 문항은 애초에 리포트 문서에
   * 담길 수 없으므로(E22-0 1번) 이 토글도 문서가 아니라 화면이 소유하는 것이 맞다.
   * 기본 켜짐: 정답 없는 인쇄물은 되돌아와 다시 뽑아야 한다.
   */
  const [showAnswerKey, setShowAnswerKey] = useState(true);

  const { docs, dropped } = store;

  // ── 조판 대상 id ────────────────────────────────────────────────────────────
  /**
   * [E22/U9-7] **하드 상한 없음**(E22-0 3번으로 `SHEET_COMPOSE_MAX_DOCS` 폐기).
   * 체크한 학습지는 전부 조판에 올라간다. 「잘라서 성공시키고 배너로 고지」하던 구
   * 경로는 통째로 사라졌고, 그 자리를 ⓐ 로더의 청크 요청 ⓑ 소프트 경고가 대신한다.
   *
   * [E22/U9-9] **참조 안정화 ①/③.** 구현이 `useMemo(…, [picked])` 가 아니라 **내용 키**인
   * 이유: `picked` 는 오케스트레이터가 매 커밋 새 Map 을 만들 수 있고(부분 갱신 패턴),
   * 그때마다 `composeIds` 가 새 배열이 되면 조회 effect → readyIds → composeDocs →
   * `buildComposedView` 가 줄줄이 헛돈다. R4 실측상 참조 churn 하나가 「내용이 안 바뀐
   * 토글」에도 전량 재합성+재측정 489ms 를 태운다.
   */
  const composeIdsKey = picked.size === 0 ? "" : [...picked.keys()].join(IDS_KEY_SEP);
  const composeIds = useMemo(
    () => (composeIdsKey === "" ? EMPTY_IDS : composeIdsKey.split(IDS_KEY_SEP)),
    [composeIdsKey],
  );

  // ── 지연 조회 + 캐시 ────────────────────────────────────────────────────────
  // 증분만 가져온다(`exam-paper-builder-client.tsx:1181-1191` lastSyncIdsRef dead-reckoning
  // 과 같은 계열이지만, 여기서는 "이미 캐시에 있나"만 보면 되므로 직전 배열 비교가 필요 없다).
  const storeRef = useRef(store);
  useEffect(() => {
    // 조회 effect 보다 **먼저 선언**해야 같은 커밋에서 ref 가 최신으로 갱신된 뒤 조회가 돈다.
    storeRef.current = store;
  }, [store]);
  const inFlightRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!classId) return;
    const wanted = composeIds.filter(
      (id) =>
        !storeRef.current.docs.has(id) &&
        !storeRef.current.dropped.has(id) &&
        !inFlightRef.current.has(id),
    );
    if (wanted.length === 0) return;
    for (const id of wanted) inFlightRef.current.add(id);
    setPending((n) => n + 1);
    // 의도적으로 **취소 플래그를 두지 않는다**. deps(composeIds)가 바뀌면 cleanup 이 도는데,
    // 거기서 응답을 버리면 그 사이 in-flight 로 표시된 id 들이 영영 다시 요청되지 않아
    // "체크했는데 안 뜨는" 정지 상태가 된다. 언마운트만 mountedRef 로 막는다(setState 안전).
    void (async () => {
      try {
        // [E22/U9-8] **청크 순차 요청**. 상한이 사라진 뒤로 「전체 선택」이 수십 건을
        // 한 왕복에 실을 수 있는데, 서버는 `SHEET_COMPOSE_DOC_BATCH`(=12) 초과를
        // 명시 실패시키고(`worksheet-docs.ts:131`) 큰 왕복 하나는 꼬리 지연(실측
        // 이상치 10.1s)이 통째로 「체크했는데 안 뜬다」로 보인다. 청크마다 setStore 를
        // 하므로 **먼저 온 문서부터 화면에 붙는다**(부분 성공 우선 — 기존 계약 유지).
        // 병렬(Promise.all)이 아니라 순차인 이유: 동시 왕복이 늘면 서버 트랜잭션이
        // 겹쳐 전체 지연이 되레 커지고, 부분 성공의 순서 보장도 잃는다.
        for (let i = 0; i < wanted.length; i += SHEET_COMPOSE_DOC_BATCH) {
          const chunk = wanted.slice(i, i + SHEET_COMPOSE_DOC_BATCH);
          const res = await getStudioWorksheetDocs({ classId, reportIds: chunk });
          if (!mountedRef.current) return;
          if (!res.success || !res.data) {
            const msg = res.error || "학습지를 불러오지 못했습니다.";
            setFetchError(msg);
            // 실패 id 를 드롭에 적어 둬야 체크가 바뀔 때마다 같은 요청이 되풀이되지 않는다.
            // 「다시 시도」가 드롭 전량을 비우므로 사용자는 언제든 회복할 수 있다.
            // **이 청크만** 드롭으로 적는다 — 뒤 청크는 아직 시도조차 안 했으므로
            // 실패로 기록하면 재시도 없이는 영영 안 뜬다.
            setStore((prev) => {
              const next = new Map(prev.dropped);
              for (const id of chunk) next.set(id, msg);
              return { docs: prev.docs, dropped: next };
            });
            // 한 청크가 실패했다고 나머지를 포기하지 않는다(부분 성공 우선).
            continue;
          }
          const fetched = res.data.docs;
          const serverDropped = res.data.dropped ?? [];
          setStore((prev) => {
            const nextDocs = new Map(prev.docs);
            for (const doc of fetched) nextDocs.set(doc.reportId, doc);
            const nextDropped = new Map(prev.dropped);
            for (const d of serverDropped) nextDropped.set(d.reportId, d.reason);
            // 응답에도 드롭 목록에도 없는 id = 존재하지 않거나 권한 밖. 사유를 채워 두지
            // 않으면 무한 재요청이 된다(서버가 조용히 빼는 경우까지 방어).
            const got = new Set(fetched.map((d) => d.reportId));
            for (const id of chunk) {
              if (!got.has(id) && !nextDropped.has(id)) {
                nextDropped.set(id, "학습지를 찾을 수 없습니다.");
              }
            }
            return { docs: nextDocs, dropped: nextDropped };
          });
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setFetchError(
          err instanceof Error ? err.message : "학습지를 불러오지 못했습니다.",
        );
      } finally {
        for (const id of wanted) inFlightRef.current.delete(id);
        if (mountedRef.current) setPending((n) => n - 1);
      }
    })();
  }, [classId, composeIds, reload]);

  const retry = useCallback(() => {
    setFetchError(null);
    // 본문 캐시는 유지하고 **드롭 기록만** 비운다 — 이미 받은 문서를 다시 받을 이유가 없다.
    setStore((prev) => (prev.dropped.size === 0 ? prev : { docs: prev.docs, dropped: new Map() }));
    setReload((n) => n + 1);
  }, []);

  // ── 활성 문서 ───────────────────────────────────────────────────────────────
  /**
   * [E22/U9-9] **참조 안정화 ②/③.**
   *
   * 구 코드는 `useMemo(() => composeIds.filter(…), [composeIds, docs])` 였다. `docs` 는
   * 청크가 하나 도착할 때마다 새 Map 이 되므로, **이미 준비된 문서 목록이 한 글자도
   * 바뀌지 않아도** readyIds 가 새 배열이 되고 그 아래 activeId/composeDocs 가 줄줄이
   * 새 참조를 낳는다(청크 로딩을 도입하면서 이 churn 이 청크 수만큼 곱해졌다).
   * 여기서는 필터 결과를 **문자열 키**로 접어 내용이 같으면 같은 배열을 돌려준다.
   * 필터 자체는 Map.has 몇 번이라 렌더마다 돌려도 무시할 만하다.
   */
  const readyIdsKey = composeIds.filter((id) => docs.has(id)).join(IDS_KEY_SEP);
  const readyIds = useMemo(
    () => (readyIdsKey === "" ? EMPTY_IDS : readyIdsKey.split(IDS_KEY_SEP)),
    [readyIdsKey],
  );
  // 기본은 체크 순서 첫 문서. 오케스트레이터가 들고 있는 activeReportId 가 아직 안 왔거나
  // (체크 해제로) 목록에서 사라졌으면 자동 수렴한다 — 활성 문서가 없는 상태를 만들지 않는다.
  const activeId = useMemo(
    () =>
      activeReportId && readyIds.includes(activeReportId)
        ? activeReportId
        : readyIds[0] ?? null,
    [activeReportId, readyIds],
  );
  const activeDoc = activeId ? docs.get(activeId) ?? null : null;

  // 자동 수렴 결과를 오케스트레이터에 되돌려 준다(활성 문서 소유는 위쪽 계약).
  // 렌더 중 부모 setState 는 금지라 effect 로 미룬다. 같은 값이면 부르지 않으므로 루프 없음.
  useEffect(() => {
    if (activeId && activeId !== activeReportId) onActiveReportIdChange(activeId);
  }, [activeId, activeReportId, onActiveReportIdChange]);

  /**
   * 부착 문서 = 활성 제외 나머지를 **체크 순서 그대로**.
   *
   * 참조 안정성이 성능의 전부다: 이 배열이 렌더마다 새로 만들어지면 편집기의
   * `composeCompanions` useMemo → `buildComposedView` 가 매번 다시 돌아 부착 문서 FlowItem
   * 이 전량 새 객체가 되고(노드 참조는 캐시가 지키지만) A4 재측정이 계속 발생한다.
   * 그래서 deps 를 안정 참조(readyIds/docs)와 원시값(activeId)으로만 구성한다.
   *
   * [E22/U9-9] **참조 안정화 ③.** 위 두 곳을 내용 키로 접은 뒤 이 memo 의 deps 는
   * 전부 「진짜 내용이 바뀔 때만」 바뀐다: `readyIds`(내용 키) · `activeId`(원시값) ·
   * `docs`(본문이 실제로 갱신될 때만 새 Map — 드롭만 바뀌는 경로는 위 setStore 가
   * `docs: prev.docs` 로 참조를 그대로 넘긴다). 남는 churn 은 **활성 문서 저장**과
   * **새 청크 도착** 두 경우인데 둘 다 실제 내용 변화라 재합성이 정답이다.
   * (여기서 「직전 배열을 ref 에 두고 얕은 비교」로 한 단계 더 접는 길은 렌더 중
   *  ref 쓰기가 되어 React Compiler 순수성 위반이다 — 아래 activeIdRef 주석과 같은 규약.)
   *
   * [E27] docKey 결정을 **별도 memo 로 먼저** 뽑는다(아래 `composeDocKeyById`).
   * 이유 2개, 둘 다 실측 계약이다:
   *  ① 문항 앵커(§R1-7)와 조판 목차(§R3-1)가 「그 문서의 docKey」를 알아야 하는데
   *     `docKeyFor(id)` 를 다시 부르면 아래 충돌 회피(`_${n}` 접미)를 재현하지 못해
   *     **충돌한 문서에서만** 앵커가 빗나간다(에러 0 · 인쇄물에서만 발견).
   *  ② keyById 의 deps 에 `docs` 를 물리면 **활성 문서를 저장할 때마다** 새 Map 이 되고,
   *     그 churn 이 문항 배치 → 문항 FlowItem 전량 재생성까지 번진다. keyById 는
   *     `readyIds`·`activeId` 만으로 결정되므로 `docs` 를 물 이유가 없다.
   */
  const composeDocKeyById = useMemo<ReadonlyMap<string, string>>(() => {
    const used = new Set<string>();
    const keyById = new Map<string, string>();
    for (const id of readyIds) {
      if (id === activeId) continue;
      let key = docKeyFor(id);
      // sanitize 후 충돌은 현실적으로 불가능하지만(cuid/uuid 는 영숫자+고정위치 하이픈),
      // 충돌하면 id 유일성이 무너져 **페이지 넘침으로만** 드러나므로 방어한다(E21-7 2번).
      // 접미 숫자는 「지금까지 담은 부착 문서 수」 — `readyIds` 가 이미 `docs.has(id)` 로
      // 걸러진 배열이라 아래 `composeDocs` 의 `list.length` 와 값이 항상 같다.
      if (used.has(key)) key = `${key}_${keyById.size}`;
      used.add(key);
      keyById.set(id, key);
    }
    return keyById;
  }, [readyIds, activeId]);
  const composeDocs = useMemo<ComposeDoc[]>(() => {
    const list: ComposeDoc[] = [];
    for (const id of readyIds) {
      if (id === activeId) continue;
      const doc = docs.get(id);
      const key = composeDocKeyById.get(id);
      if (!doc || !key) continue;
      list.push({ docKey: key, title: doc.title, report: doc.report });
    }
    return list;
  }, [readyIds, activeId, docs, composeDocKeyById]);

  // ── [E27] 지문 그룹 모델 (E27-SPEC §2 R1-7 1번) ─────────────────────────────
  /**
   * **`picked` 전량**(readyIds 아님)을 passageId 로 **연속 그룹핑**한다.
   *
   * 왜 readyIds 가 아닌가: `composeDocs` 는 본문이 도착한 문서만 담으므로, 청크가 순차
   * 도착하는 동안 그룹 경계가 프레임마다 달라진다. 그 위에서 인터리브를 계산하면 로딩
   * 중에 문항 묶음이 문서 사이를 오가며 A4 재측정이 반복된다(정찰 A 위험). **그룹 순서는
   * picked 로 먼저 확정하고, 「어느 문서 뒤에 붙일지」(앵커)만 readyIds 로 고른다.**
   *
   * 왜 「연속」 그룹핑인가: `picked` 의 Map 삽입 순서가 곧 인쇄 순서라는 것이 이 판의
   * 최상위 불변식이다(R1-0). 정렬 정본(`studio-home-client.tsx` withPassageGroupedOrder)이
   * 같은 지문을 이미 붙여 놓으므로 연속 그룹핑 결과 = 지문 그룹이고, **만약 정렬이 아직
   * 안 돌았거나 깨진 프레임**이면 연속 그룹핑이 그 사실을 그대로 보존한다(임의 재정렬로
   * 순번 배지와 인쇄 순서를 다시 갈라놓지 않는다 — 26-08 「배지 1,2,3 인데 인쇄는 3,1,2」).
   *
   * 참조 안정성: Map 을 deps 에 물지 않고 **내용 키 문자열**로 접는다(위 composeIdsKey
   * 관용구 — 메모 본문이 `picked` 를 다시 읽으면 unstable Map 참조가 deps 로 새어 든다).
   *
   * ⚠ 키를 **둘로 가른다.** 그룹 키에는 조판 산출에 실제로 영향을 주는 것만 담는다
   * (reportId · passageId · 지문 제목 = 문항 러닝헤더 재료). 문서 제목·플랜 마커는
   * **목차 라벨 전용**이라 아래 `sheetLabelKey` 로 따로 접는다 — 한 키에 합치면 문서
   * 제목이 바뀌는 것만으로 문항 FlowItem 이 전량 재생성된다(그럴 이유가 없다).
   */
  const pickedGroupKey =
    picked.size === 0
      ? ""
      : [...picked]
          .map(([id, m]) =>
            [id, m.passageId, foldKeyText(m.passageTitle)].join(GROUP_FIELD_SEP),
          )
          .join(IDS_KEY_SEP);
  const passageGroups = useMemo<ComposePassageGroup[]>(() => {
    if (pickedGroupKey === "") return EMPTY_GROUPS;
    const groups: ComposePassageGroup[] = [];
    const usedKeys = new Set<string>();
    let current: ComposePassageGroup | null = null;
    for (const record of pickedGroupKey.split(IDS_KEY_SEP)) {
      const [id, passageId, passageTitle] = record.split(GROUP_FIELD_SEP);
      const pid = passageId ?? "";
      if (!current || current.passageId !== pid) {
        // 같은 지문이 비연속으로 재등장하면 key 만 갈라 유일성을 지킨다(위 타입 주석).
        let key: string = pid;
        if (usedKeys.has(key)) key = `${key}#${groups.length}`;
        usedKeys.add(key);
        current = {
          key,
          passageId: pid,
          passageTitle: passageTitle ?? "",
          reportIds: [],
        };
        groups.push(current);
      }
      current.reportIds.push(id ?? "");
    }
    return groups;
  }, [pickedGroupKey]);

  /** 목차 라벨 폴백 — 문서 본문(`docs`)이 아직 없어도 제목/플랜을 쓸 수 있게. */
  const sheetLabelKey =
    picked.size === 0
      ? ""
      : [...picked]
          .map(([id, m]) =>
            [id, foldKeyText(m.planMarker), foldKeyText(m.title)].join(GROUP_FIELD_SEP),
          )
          .join(IDS_KEY_SEP);
  const sheetLabels = useMemo<
    ReadonlyMap<string, { title: string; planMarker: string }>
  >(() => {
    if (sheetLabelKey === "") return EMPTY_SHEET_LABELS;
    const labels = new Map<string, { title: string; planMarker: string }>();
    for (const record of sheetLabelKey.split(IDS_KEY_SEP)) {
      const [id, planMarker, title] = record.split(GROUP_FIELD_SEP);
      labels.set(id ?? "", { title: title ?? "", planMarker: planMarker ?? "" });
    }
    return labels;
  }, [sheetLabelKey]);

  /**
   * [E27 적대검수 — P4] **본문에서 온** 목차 라벨(제목·플랜 마커)만 내용 키로 접은 것.
   *
   * 조판 목차는 `docs` 에서 이 두 필드밖에 읽지 않는데, `handleSaved` 가 활성 문서를
   * 저장할 때마다 `new Map(prev.docs)` 로 **새 Map** 을 만든다. `composeOutline` 이
   * 원시 `docs` 를 deps 로 물면 저장 1회에 목차 전체가 재조립됐다(제목·마커는 그대로라
   * 산출은 동일 — 순수 낭비). `sheetLabels` 와 **완전히 같은 관용구**로 접어, 제목이나
   * 마커가 **실제로** 바뀐 저장에서만 목차가 다시 만들어지게 한다.
   *
   * 폴백(`sheetLabels`)과 역할이 다르다: 이쪽은 「본문이 도착한 문서의 진짜 값」,
   * 저쪽은 「본문 도착 전 대기열 메타」다. 목차는 이쪽 → 저쪽 순으로 폴백한다.
   */
  const docLabelKey =
    readyIds.length === 0
      ? ""
      : readyIds
          .map((id) => {
            const doc = docs.get(id);
            return [id, foldKeyText(doc?.planMarker), foldKeyText(doc?.title)].join(
              GROUP_FIELD_SEP,
            );
          })
          .join(IDS_KEY_SEP);
  const docLabels = useMemo<
    ReadonlyMap<string, { title: string; planMarker: string }>
  >(() => {
    if (docLabelKey === "") return EMPTY_SHEET_LABELS;
    const labels = new Map<string, { title: string; planMarker: string }>();
    for (const record of docLabelKey.split(IDS_KEY_SEP)) {
      const [id, planMarker, title] = record.split(GROUP_FIELD_SEP);
      labels.set(id ?? "", { title: title ?? "", planMarker: planMarker ?? "" });
    }
    return labels;
  }, [docLabelKey]);

  /**
   * [E27 적대검수 — S2] 문항 정렬의 기준이 되는 **학습지 지문 그룹 순서**.
   *
   * `passageGroups` 는 이미 `picked` 삽입 순서(= 학습지 인쇄 순서) 그대로이므로
   * 여기서는 지문 첫 등장만 뽑아 중복을 걷어낸다. 빈 키("" = 지문 미상)는 싣지 않는다 —
   * 그 축은 언제나 꼬리이고, `withPassageGroupedQuestionOrder` 도 같은 판정을 한다.
   */
  const sheetGroupOrder = useMemo<string[]>(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const group of passageGroups) {
      if (group.passageId === "" || seen.has(group.passageId)) continue;
      seen.add(group.passageId);
      out.push(group.passageId);
    }
    return out;
  }, [passageGroups]);

  // ── [E22/U9-2] 문항 축 파이프라인 ───────────────────────────────────────────
  //
  // 배선 3단(로더 → 순수 변환 → 편집기)만 여기 있고 계산은 전부 바깥이다.
  // 각 단계가 **고정 참조**를 유지하는 것이 이 블록의 유일한 설계 목표다 —
  // 문항 축 배열 하나가 매 렌더 새로 만들어지면 활성 학습지 본문까지 통째로
  // 재측정된다(`AnalysisReportEditor.tsx:175-184` 가 같은 이유로 모듈 상수를 둔다).
  //
  // ══ [E27 적대검수 — S2] 여기서 **지문 그룹 순서로 정렬**한다 ══════════════════
  //
  // 이 배열의 순서가 곧 ① 로더 요청 순서 ② `buildComposedQuestionViews` 의
  // **전역 `no`(1..N)** ③ 아래 꼬리 배치 순서다. 그래서 여기서 인쇄 순서로 세워 두면
  // 「문항 번호는 인쇄 순서대로 1..N 연속」(E27-SPEC §0 사용자 확정)이 자동으로 선다.
  //
  // ⚠ **왜 오케스트레이터가 아니라 여기인가**(초판 E27 을 되돌린 것이다):
  //   오케스트레이터에서 `flatPicked` 자체를 재정렬하면 그 Map 이 `composeSyncIds`
  //   → 시험지 빌더 `syncQuestionIds` 로도 흐르는데, 소비처
  //   (`exam-paper-builder-client.tsx:1182-1191`)가 **집합 diff 전용**이라
  //   `toAdd`/`toRemove` 가 둘 다 비는 **순수 재정렬 커밋에 무동작**이다. 반면
  //   순번 배지는 같은 Map 파생이라 즉시 바뀐다(`composer-list-pane.tsx:553-558` ·
  //   `passage-dossier-pane.tsx:1548`) → 학습지를 체크하는 것만으로 「배지만 바뀌고
  //   시험지 인쇄 순서는 그대로」. 이 리포가 이미 한 번 수리한 「3,1,2」의 재발이다.
  //
  // ⚠ **의도된 갈림**: 그 결과 「문항 순번 배지(체크 순서) ≠ 학습지 조판 인쇄 순서」다.
  //   두 조판이 서로 다른 순서로 인쇄하므로 배지 숫자 하나가 둘 다를 만족할 수 없고,
  //   학습지 조판의 실제 순서는 **조판 목차 트리**(`composeOutline`)가 보여 준다.
  //   「일관성」을 이유로 이 정렬을 오케스트레이터로 되돌리지 마라.
  //
  // ⚠ 참조 안정성: 결과를 **내용 키 문자열**로 즉시 접는다. 정렬 함수가 만드는 Map 은
  //   여기서 keys() 를 뽑는 데만 쓰고 버린다(매 렌더 새 Map 이 하류로 새면 전량
  //   재합성 489ms).
  const questionIdsKey =
    !pickedQuestions || pickedQuestions.size === 0
      ? ""
      : [
          ...withPassageGroupedQuestionOrder(pickedQuestions, sheetGroupOrder).keys(),
        ].join(IDS_KEY_SEP);
  const questionIds = useMemo(
    () => (questionIdsKey === "" ? EMPTY_IDS : questionIdsKey.split(IDS_KEY_SEP)),
    [questionIdsKey],
  );
  // 훅은 조건 없이 호출한다(문항 미배선이어도). `academyId` 가 빈 문자열이면 훅이
  // 조회 자체를 하지 않으므로(`use-compose-questions.ts:146`) 네트워크 0이다.
  const {
    views: questionViews,
    loading: questionsLoading,
    error: questionsError,
    retry: retryQuestions,
  } = useComposeQuestions({ academyId: academyId ?? "", ids: questionIds });

  /**
   * 문항 구간의 러닝헤더/푸터 귀속. **객체 1개**를 만들어 전 조각이 공유한다 —
   * 아이템마다 새 객체면 하위 memo 비교가 매 렌더 어긋난다(`compose-flow.ts:109-113`).
   * `docNo` 는 주지 않는다: 문항은 문서가 아니라 문서 번호가 없고, 넘기면 없는 번호가
   * 푸터에 찍힌다(`runs.tsx:218` 은 값이 있으면 그대로 쓴다).
   */
  const questionDocHeader = useMemo<ComposedDocHeader>(
    () => ({ title: questionsTitle?.trim() || "문항" }),
    [questionsTitle],
  );
  // ── [E27] 문항 뷰 슬라이스 (E27-SPEC §2 R1-6) ───────────────────────────────
  /**
   * `buildComposedQuestionViews` 는 **전체 id 로 1회만** 부른다(위 `useComposeQuestions`
   * 무접촉). 그래야 ① `no` 가 전역 1..N 연속이라 맨 끝 통합 정답표와 정합하고
   * ② 세트 연속 판정(`prevSetId`)이 그룹 경계에서 끊기지 않는다.
   * 그룹 분할은 그 **결과 배열을 슬라이스**하는 것으로만 한다.
   *
   * 슬라이스 키: `ComposedQuestionView` 에는 passageId 가 **없으므로**
   * (`question-view.ts:191-240` — 그 파일은 E27 무수정 대상) `pickedQuestions` 의
   * `PickedQuestionMeta.passageId` 로 얻는다. 그쪽이 두 발원지(병합 목록·도시에)에서
   * 같은 의미를 갖는 유일한 타입 안전 통로다(정찰 A 9번).
   *
   * Map 삽입 순서 = 뷰 등장 순서 = 인쇄 순서라, 아래 꼬리 배치가 이 순서를 그대로 쓴다.
   */
  const questionPassageKey =
    !pickedQuestions || pickedQuestions.size === 0
      ? ""
      : [...pickedQuestions]
          .map(([id, m]) =>
            [id, m.passageId, foldKeyText(m.passageTitle)].join(GROUP_FIELD_SEP),
          )
          .join(IDS_KEY_SEP);
  const questionSlices = useMemo<{
    /** passageId → 그 지문의 문항 뷰(전역 순서 보존). */
    byPassage: ReadonlyMap<string, ComposedQuestionView[]>;
    /** passageId → 지문 제목(러닝헤더 · 목차 라벨). */
    titleOf: ReadonlyMap<string, string>;
  }>(() => {
    if (questionViews.length === 0) {
      return { byPassage: EMPTY_QUESTION_SLICES, titleOf: EMPTY_PASSAGE_TITLES };
    }
    const passageOf = new Map<string, string>();
    const titleOf = new Map<string, string>();
    if (questionPassageKey !== "") {
      for (const record of questionPassageKey.split(IDS_KEY_SEP)) {
        const [id, passageId, passageTitle] = record.split(GROUP_FIELD_SEP);
        passageOf.set(id ?? "", passageId ?? "");
        if (passageTitle) titleOf.set(passageId ?? "", passageTitle);
      }
    }
    const byPassage = new Map<string, ComposedQuestionView[]>();
    for (const view of questionViews) {
      // 메타가 없으면 그룹 키 ""(무지문) — **버리지 않는다**. 버리면 문항이 조용히 사라진다.
      const pid = passageOf.get(view.questionId) ?? "";
      const bucket = byPassage.get(pid);
      if (bucket) bucket.push(view);
      else byPassage.set(pid, [view]);
    }
    return { byPassage, titleOf };
  }, [questionViews, questionPassageKey]);

  // ── [E27] 문항 배치 결정 (E27-SPEC §2 R1-7 2~3번) ───────────────────────────
  /**
   * 「어느 지문 문항이 어느 문서 **뒤**에 붙는가」를 **한 곳에서** 정한다.
   * 조판 스트림(아래 `composeQuestionPlan`)과 조판 목차(`composeOutline`)가 같은 결정을
   * 읽어야 「목차에는 지문1 밑에 있는데 인쇄물에서는 맨 뒤」가 원천적으로 불가능해진다.
   *
   *  · 앵커 = 그 그룹에서 **readyIds 에 있는 마지막 문서**의 docKey(활성이면 ACTIVE_DOC_KEY).
   *    마지막인 이유: 그 지문 학습지를 전부 넘긴 **뒤**에 그 지문 문제가 나와야 한다.
   *  · 같은 지문이 비연속으로 두 번 나오면 **마지막 실행의 앵커**가 이긴다. 첫 실행에
   *    붙이면 그 지문 학습지 일부가 자기 문제 **뒤**에 인쇄된다.
   *
   * ══ [E27 적대검수 — P1] ready 문서가 0인 그룹은 **직전 앵커로 캐리포워드**한다 ══
   *
   * 구현 초판은 `if (!anchor) continue;` 로 그 그룹 문항을 **꼬리**로 보냈다. 그런데
   * `no` 는 이미 그 지문을 **앞에 두는** 순서로 매겨져 있으므로 인쇄물의 문항 번호가
   * 오름차순이 아니게 된다(사용자 확정 계약 §0 「인쇄 순서대로 1..N 연속」 위반 +
   * 통합 정답표와 학생지 순서 갈림). 실측 재현(3그룹): pA(SA)·pB(SB)·pC(SC) 중 SA 가
   * 서버 드롭 → 스트림 `[SB][qB 1][SC][qC 3][꼬리 qA 2]` = 학생지 번호가 **1,3,2**.
   * 드롭 문서는 `docs` 에 영원히 안 들어오므로(로더가 `dropped` 에만 기록) 이 상태는
   * 체크를 풀거나 「다시 시도」 전까지 **영구**다.
   *
   * → 앵커가 없는 그룹은 **직전에 앵커를 가진 그룹**의 docKey 를 그대로 쓴다. 그러면
   *   배치 묶음 순서 = `passageGroups` 순서 = `no` 순서가 되어 오름차순이 복원된다
   *   (`afterDoc.set` 이 append 라 같은 앵커에 두 묶음이 걸려도 순서가 보존된다).
   *   ⚠ `ACTIVE_DOC_KEY` 폴백은 **채택 금지** — 활성 문서는 다른 지문일 수 있어
   *     「자기 문제 앞에 남의 학습지」를 만든다.
   *   ⚠ 캐리포워드 대상은 「직전에 **앵커가 있던** 그룹」이지 「직전에 문항이 배치된
   *     그룹」이 아니다. 문항 없는 그룹도 앵커는 전진시켜야, 「G2(학습지만) →
   *     G3(문항만·드롭)」에서 G3 문항이 G1 뒤가 아니라 G2 뒤에 붙는다.
   *   · **첫 그룹이 ready 0** 이면 캐리포워드 대상이 없으므로 그대로 꼬리로 둔다.
   *     정렬 정본이 활성 문서의 그룹을 맨 앞에 두고 활성은 언제나 ready 라
   *     (`activeId = readyIds[0]` 수렴) 정상 상태에서는 도달하지 않는 과도 프레임이다.
   *
   * 순수 로직 게이트: `node .tmp-worksheet-compose/_e27-s2p1-order.mjs`
   *   B 케이스가 이 수정의 RED→GREEN 증명이다(캐리포워드 OFF = `[SB] 1 [SC] 3 2` →
   *   ON = `[SB] 1 2 [SC] 3`). E1/E2 가 「선두 ready 0」의 과도성(한 커밋 뒤 자기치유)을,
   *   C 가 「문항 없는 중간 그룹도 앵커는 전진한다」를, G(퍼즈 2000)가 일반성을 잡는다.
   *
   * ══ [E27 적대검수 — P3] 결과를 **내용 키 문자열**로 접는다 (§2 R1-7 규칙 4) ══
   *
   * 구현 초판은 매 실행이 새 객체 리터럴을 반환해, 학습지 축이 흔들릴 때마다
   * (청크 1개 도착 · 학습지 1장 추가 체크) 배치 **내용이 한 글자도 안 바뀌어도**
   * 새 참조가 나가고 그것이 `composeQuestionPlan` deps 를 때려 **문항 FlowItem 전량**
   * (문항 300개 × 조각 ~8 ≈ 2,400 ReactNode)이 재생성됐다. 여기서는 이 파일이 이미
   * 세 곳에서 쓰는 관용구(`readyIdsKey` → `readyIds`)를 그대로 적용해, 결정 결과를
   * 렌더 중 문자열로 만들고 **그 문자열이 바뀔 때만** 객체를 만든다.
   * (문자열 계산 자체는 Map/Set 조회 몇 번이라 렌더마다 돌려도 무시할 만하다 —
   *  같은 판단으로 `readyIdsKey`·`pickedGroupKey` 도 memo 밖에 있다.)
   */
  const questionPlacementKey = (() => {
    if (questionSlices.byPassage.size === 0) return "";

    const readySet = new Set(readyIds);
    // 지문별 앵커. 뒤 그룹이 앞 그룹을 덮어써 「마지막 실행이 이긴다」가 성립한다.
    const anchorOf = new Map<string, { groupKey: string; docKey: string }>();
    for (const group of passageGroups) {
      // 앵커 후보는 **스트림 순서의 마지막 문서**다. 합성 스트림은 `buildComposedView` 가
      // 「활성 1건 → 부착 N건(readyIds 순서)」로 고정하므로(`compose-flow.ts:230-236`),
      // 그룹에 부착 문서가 하나라도 있으면 **그 그룹의 마지막 부착 문서**가 언제나
      // 활성 문서보다 뒤에 온다. 활성 문서를 앵커로 잡으면 정렬이 흔들린 프레임에서
      // 「그 지문 학습지 일부가 자기 문제 **뒤**에」 인쇄된다.
      let lastCompanionKey: string | null = null;
      let hasActive = false;
      for (const id of group.reportIds) {
        if (!readySet.has(id)) continue;
        if (id === activeId) {
          hasActive = true;
          continue;
        }
        const key = composeDocKeyById.get(id);
        // keyById 는 같은 readyIds/activeId 로 만들어져 여기서 미스가 날 수 없지만,
        // 미스를 흘리면 앵커가 조용히 엉뚱한 문서를 가리키는 자리라 방어적으로 건너뛴다.
        if (key) lastCompanionKey = key;
      }
      const docKey = lastCompanionKey ?? (hasActive ? ACTIVE_DOC_KEY : null);
      if (docKey) anchorOf.set(group.passageId, { groupKey: group.key, docKey });
    }

    const placedRecords: string[] = [];
    const tailRecords: string[] = [];
    const done = new Set<string>();
    /** 직전에 앵커를 가진 그룹(문항 유무 무관) — 위 P1 캐리포워드의 원천. */
    let lastAnchor: { groupKey: string; docKey: string } | null = null;
    for (const group of passageGroups) {
      const own = anchorOf.get(group.passageId);
      // ⚠ `done`/슬라이스 판정보다 **먼저** 전진시킨다(문항 없는 그룹도 앵커는 전진).
      if (own) lastAnchor = own;
      if (done.has(group.passageId)) continue;
      const slice = questionSlices.byPassage.get(group.passageId);
      if (!slice || slice.length === 0) continue;
      const anchor = own ?? lastAnchor;
      if (!anchor) continue; // 선두 그룹이 ready 0 → 아래 꼬리 루프가 집어 간다
      done.add(group.passageId);
      const title =
        group.passageTitle || questionSlices.titleOf.get(group.passageId) || "";
      placedRecords.push(
        [anchor.groupKey, group.passageId, anchor.docKey, foldKeyText(title)].join(
          GROUP_FIELD_SEP,
        ),
      );
    }
    // 꼬리는 **문항 등장 순서**로 돈다(`byPassage` 삽입 순서 = 정렬된 questionIds 순서).
    // passageGroups 를 돌면 「학습지가 한 장도 없는 지문」의 문항이 통째로 빠진다 —
    // 사라짐 사고의 정확한 경로다.
    for (const [passageId, slice] of questionSlices.byPassage) {
      if (done.has(passageId) || slice.length === 0) continue;
      done.add(passageId);
      tailRecords.push(
        [passageId, foldKeyText(questionSlices.titleOf.get(passageId) || "")].join(
          GROUP_FIELD_SEP,
        ),
      );
    }
    if (placedRecords.length === 0 && tailRecords.length === 0) return "";
    // 두 목록의 경계는 `IDS_KEY_SEP` 두 번(빈 레코드)으로 표시한다 — 레코드 자체는
    // 절대 빈 문자열이 될 수 없으므로(passageId 또는 groupKey 가 항상 앞에 온다)
    // 이 경계는 애매해지지 않는다.
    return `${placedRecords.join(IDS_KEY_SEP)}${IDS_KEY_SEP}${IDS_KEY_SEP}${tailRecords.join(IDS_KEY_SEP)}`;
  })();
  const questionPlacement = useMemo<{
    /** 그룹 안에 배치된 문항 묶음 — `passageGroups` 순서. */
    placed: {
      groupKey: string;
      passageId: string;
      anchorDocKey: string;
      headerTitle: string;
    }[];
    /** 학습지 그룹에 못 붙어 꼬리로 가는 문항 묶음 — 문항 등장 순서. */
    tail: { passageId: string; headerTitle: string }[];
  }>(() => {
    if (questionPlacementKey === "") return EMPTY_PLACEMENT;
    const [placedPart = "", tailPart = ""] = questionPlacementKey.split(
      `${IDS_KEY_SEP}${IDS_KEY_SEP}`,
    );
    const placed = (placedPart === "" ? [] : placedPart.split(IDS_KEY_SEP)).map(
      (record) => {
        const [groupKey, passageId, anchorDocKey, headerTitle] =
          record.split(GROUP_FIELD_SEP);
        return {
          groupKey: groupKey ?? "",
          passageId: passageId ?? "",
          anchorDocKey: anchorDocKey ?? "",
          headerTitle: headerTitle ?? "",
        };
      },
    );
    const tail = (tailPart === "" ? [] : tailPart.split(IDS_KEY_SEP)).map((record) => {
      const [passageId, headerTitle] = record.split(GROUP_FIELD_SEP);
      return { passageId: passageId ?? "", headerTitle: headerTitle ?? "" };
    });
    return { placed, tail };
  }, [questionPlacementKey]);

  // ── [E27] 문항 FlowItem — 그룹별 묶음 + 꼬리 (E27-SPEC §2 R1-4·R1-5) ─────────
  /**
   * 그룹마다 `buildQuestionFlowItems` 를 **따로** 부른다. 한 번 부르고 잘라 쓰면 안 된다 —
   * `pushBlock` 의 `forceFirst = opts.breakBefore || items.length === 0`
   * (`question-flow.tsx:390`)이 **호출 단위**로 판정하므로, 따로 불러야 각 묶음의 첫
   * 조각에 `breakBefore` 가 붙어 지문마다 새 페이지에서 시작한다.
   *
   * `docHeader` 는 **그룹당 객체 1개**를 만들어 그 그룹의 전 조각이 공유한다. 하나로
   * 돌려쓰면 `pages.tsx:219-222` 가 모든 문항 페이지에 같은 제목(「문항」)을 찍어
   * 지문1 문제와 지문2 문제가 인쇄물에서 구분되지 않는다(정찰 E 위험).
   *
   * 정답표는 **맨 끝 1개로 통합**(사용자 확정)이라 그룹 호출에는 `showAnswerKey:false` 를
   * 주고, 꼬리에서 **전체 views** 로 `buildQuestionAnswerKeyItems` 를 한 번 부른다.
   * `no` 가 전역 1..N 이므로 통합 정답표 번호가 인쇄 순서와 그대로 맞는다.
   *
   * ══ [E27 적대검수 — P3] **묶음 생성**과 **앵커 배치**를 두 memo 로 가른다 ══
   *
   * 초판은 한 memo 가 `questionPlacement`(앵커 포함)를 deps 로 물어, 학습지 축이
   * 흔들릴 때마다(학습지 1장 추가 체크 · 로더 청크 1회 도착) 문항 FlowItem 이 **전량**
   * 재생성됐다 — 문항 300개 × 조각 ~8 ≈ 2,400 ReactNode 가 새 객체가 되면서 캔버스 ·
   * 측정 클론(`par-measure`) · 썸네일 레일 3트리의 문항 서브트리가 통째로 재렌더된다
   * (`AnalysisReportEditor.tsx:1462-1464` 가 부착 문서 축에 확보해 둔 bailout 이득이
   *  문항 축에서만 소실됐다).
   *
   * ① `questionBundles`(아래) — 묶음 **내용**만 만든다. deps 에 **앵커가 없다**:
   *    묶음 내용을 정하는 것은 `views`(questionSlices) · `headerTitle` · 보폭 오프셋
   *    (= 묶음 순서)뿐이고, 그 셋을 `bundleOrderKey` 라는 **내용 키 문자열**로 접는다.
   *    ⚠ `bundleOrderKey` 에 `anchorDocKey` 를 넣지 마라 — 앵커는 **배치** 축이지 묶음
   *      내용이 아니다. 넣으면 초판과 정확히 같아진다.
   * ② `composeQuestionPlan`(이것) — 만들어진 묶음을 앵커 docKey 로 **재배치만** 한다.
   *    앵커가 바뀌어도 묶음 배열 참조가 그대로라 문항 ReactNode 가 보존된다.
   */
  const bundleOrderKey =
    questionPlacement.placed.length === 0 && questionPlacement.tail.length === 0
      ? ""
      : [
          ...questionPlacement.placed.map((e) =>
            [e.passageId, e.headerTitle].join(GROUP_FIELD_SEP),
          ),
          // 배치/꼬리 경계도 보폭에 영향을 주므로 키에 남긴다(빈 레코드 1개).
          "",
          ...questionPlacement.tail.map((e) =>
            [e.passageId, e.headerTitle].join(GROUP_FIELD_SEP),
          ),
        ].join(IDS_KEY_SEP);
  /** passageId → 그 지문 묶음의 FlowItem[]. 배치(앵커)와 무관한 **내용**만 담는다. */
  const questionBundles = useMemo<ReadonlyMap<string, FlowItem[]>>(() => {
    if (bundleOrderKey === "") return EMPTY_QUESTION_BUNDLES;
    const headerFor = (title: string): ComposedDocHeader =>
      // 지문 제목이 없으면 기존 폴백(`questionsTitle` 또는 「문항」)을 그대로 쓴다.
      ({ title: title ? `${title} · 문항` : questionDocHeader.title });
    const bundles = new Map<string, FlowItem[]>();
    let bundle = 0;
    // 배치 묶음 → 꼬리 묶음 순으로 보폭을 배정한다(= 인쇄 순서). 순서가 바뀌면
    // sectionIndex 대역이 갈려 런 병합 경계가 달라지므로 위 bundleOrderKey 가
    // 두 목록을 **순서까지** 담고 있어야 한다.
    for (const entry of questionPlacement.placed) {
      const views = questionSlices.byPassage.get(entry.passageId);
      if (!views || views.length === 0) continue;
      bundles.set(
        entry.passageId,
        buildQuestionFlowItems({
          views,
          docHeader: headerFor(entry.headerTitle),
          showAnswerKey: false,
          sectionSeqStart: bundleSectionSeqStart(bundle++),
        }),
      );
    }
    for (const entry of questionPlacement.tail) {
      const views = questionSlices.byPassage.get(entry.passageId);
      if (!views || views.length === 0) continue;
      bundles.set(
        entry.passageId,
        buildQuestionFlowItems({
          views,
          docHeader: headerFor(entry.headerTitle),
          showAnswerKey: false,
          sectionSeqStart: bundleSectionSeqStart(bundle++),
        }),
      );
    }
    return bundles.size === 0 ? EMPTY_QUESTION_BUNDLES : bundles;
    // `questionPlacement` 는 bundleOrderKey 와 같은 커밋에서만 바뀌므로 deps 에서
    // 뺀다(넣으면 앵커 변화가 다시 새어 들어와 이 memo 의 존재 이유가 사라진다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleOrderKey, questionSlices, questionDocHeader]);

  const composeQuestionPlan = useMemo<{
    /** docKey → 그 문서 **직후**에 삽입할 문항 FlowItem[](`buildComposedView` 계약). */
    afterDoc: ReadonlyMap<string, FlowItem[]>;
    /** 스트림 맨 끝 — 학습지 없는 지문의 문항 + 통합 정답표. */
    tail: FlowItem[];
    /** 소프트 경고용 조각 총수(문서 축 환산치와 합산한다). */
    itemCount: number;
  }>(() => {
    if (questionViews.length === 0) {
      return { afterDoc: EMPTY_AFTER_DOC, tail: EMPTY_QUESTION_ITEMS, itemCount: 0 };
    }
    const afterDoc = new Map<string, FlowItem[]>();
    for (const entry of questionPlacement.placed) {
      const items = questionBundles.get(entry.passageId);
      if (!items || items.length === 0) continue;
      // 앵커가 겹치는 일은 **정상**이다(P1 캐리포워드 — ready 0 그룹이 직전 그룹의
      // 앵커를 물려받는다). 덮어쓰지 말고 이어 붙여야 ⓐ 문항이 사라지지 않고
      // ⓑ `passageGroups` 순서 = `no` 순서가 스트림에 그대로 남는다.
      // 겹치지 않는 앵커는 묶음 **배열 참조를 그대로** 내보내 문항 서브트리가 bailout 된다.
      const prev = afterDoc.get(entry.anchorDocKey);
      afterDoc.set(entry.anchorDocKey, prev ? [...prev, ...items] : items);
    }

    const tail: FlowItem[] = [];
    for (const entry of questionPlacement.tail) {
      const items = questionBundles.get(entry.passageId);
      if (!items || items.length === 0) continue;
      tail.push(...items);
    }
    // 정답표는 **전체 views** 로 한 번. 토글은 그대로 살아 있다(E22/U9-6 로컬 state).
    if (showAnswerKey) {
      tail.push(
        ...buildQuestionAnswerKeyItems({
          views: questionViews,
          docHeader: questionDocHeader,
        }),
      );
    }

    let itemCount = tail.length;
    for (const items of afterDoc.values()) itemCount += items.length;
    return {
      afterDoc: afterDoc.size === 0 ? EMPTY_AFTER_DOC : afterDoc,
      tail: tail.length === 0 ? EMPTY_QUESTION_ITEMS : tail,
      itemCount,
    };
  }, [
    questionViews,
    questionBundles,
    questionPlacement,
    questionDocHeader,
    showAnswerKey,
  ]);
  const composeQuestionTail = composeQuestionPlan.tail;
  const composeQuestionsAfterDoc = composeQuestionPlan.afterDoc;

  // ── [E27] 조판 목차 데이터 (E27-SPEC §4 R3-1) ───────────────────────────────
  /**
   * 지문 그룹 순서 = 인쇄 순서. 클릭 핸들러는 만들지 않는다 — 편집기(U5)가
   * 이 데이터를 기존 「목차」 팝오버에 흘리고 클릭을 자기 안에서 스크롤로 처리한다
   * (버튼 증설 0 · 활성 문서 전환은 끝까지 **헤더 문서 칩**의 책임 — E27-SPEC R3-0/R3-1).
   *
   * 문서 항목은 **합성 스트림에 실제로 올라간 것만** 넣는다(readyIds). 아직 안 온 문서를
   * 넣으면 눌러도 아무 데도 못 가는 항목이 되고, 그 「무동작」은 사용자에게 고장으로 읽힌다
   * (로딩 중이라는 사실은 헤더 칩의 스피너가 이미 말하고 있다).
   *
   * ══ [E27 적대검수 — P2] 조기 반환 판정은 **편집기의 `composeActive` 와 같은 축** ══
   *
   * 초판 판정은 `passageGroups.length === 0 && tail.length === 0` = 「**픽이 있나**」였다.
   * 그런데 편집기의 조판 관문은 `AnalysisReportEditor.tsx:2046-2049`
   * `composeCompanions.length > 0 || composeQuestionItems.length > 0 ||
   *  composeQuestionsAfterDocMap.size > 0` = 「**실제로 조판됐나**」다. 학습지를 1장만
   * 체크하면(= E18 직행, 이 판의 가장 흔한 진입 경로) 앞은 true 인데 뒤는 false 라
   * 두 축이 같은 사실에 다른 답을 낸다. 그 상태로 상단바 「목차」를 열면
   * `section-outline-popover.tsx:100 hasCompose` 가 켜져 ① 트리거 title 이 바뀌고
   * ② 「…이동만 합니다」 안내가 뜨고 ③ **자기 자신 1개짜리** 조판 블록이 렌더되고
   * ④ 섹션 목록 높이가 52vh → 30vh 로 잘린다 — 정보량 0의 순수 손해이고
   * E27-SPEC §4 R3-0 「미조판이면 기존과 픽셀 동일」 위반이다.
   *
   * → 판정을 **부착 문서 ≥1 · 배치 문항 ≥1 · 꼬리 문항 ≥1** 로 바꿔 진실원을 1개로 만든다.
   *   `composeDocs`(= 활성 제외 부착 문서)는 이 파일이 이미 소유한다.
   *   ⚠ `passageGroups.length` 로 되돌리지 마라 — 그 순간 위 4증상이 그대로 재발한다.
   *
   * ══ [E27 적대검수 — P4] deps 에서 원시 `docs` Map 을 뺀다 ══
   *
   * 여기서 `docs` 로부터 읽는 것은 `title`·`planMarker` 두 필드뿐인데, `handleSaved` 가
   * 활성 문서 저장마다 **새 Map** 을 만든다. 그러면 readyIds·sheetLabels·passageGroups·
   * questionPlacement 가 전부 참조를 유지하는데 `docs` 하나 때문에 목차 전체(그룹 +
   * 수백 엔트리 객체)가 재조립됐다 — 저장은 제목·마커를 바꾸지 않으므로 산출은 동일하고,
   * 팝오버가 닫혀 있으면 그 배열을 읽는 DOM 도 없다. 이 파일이 스스로 못박은
   * 「내용 키 문자열 → useMemo」 계약(상단 GROUP_FIELD_SEP 주석)의 **유일한 예외**였다.
   * → 아래 `docLabels`(sheetLabels 와 완전히 같은 관용구)로 접어 문다.
   */
  const composeOutline = useMemo<ComposeOutlineGroup[]>(() => {
    if (
      composeDocs.length === 0 &&
      questionPlacement.placed.length === 0 &&
      questionPlacement.tail.length === 0
    ) {
      return EMPTY_OUTLINE;
    }
    const readySet = new Set(readyIds);
    // groupKey → 그 그룹에 붙는 passageId **목록**(순서 = 인쇄 순서).
    // ⚠ 단수 Map 이면 안 된다 — P1 캐리포워드 이후 「ready 0 그룹」의 문항이 직전 그룹의
    //   앵커/groupKey 를 물려받으므로 한 groupKey 에 두 지문이 걸리는 것이 **정상**이다.
    //   단수로 두면 나중 것이 앞의 것을 덮어써 목차에서 문항 묶음 하나가 조용히 사라진다.
    const placedByGroup = new Map<string, string[]>();
    for (const entry of questionPlacement.placed) {
      const bucket = placedByGroup.get(entry.groupKey);
      if (bucket) bucket.push(entry.passageId);
      else placedByGroup.set(entry.groupKey, [entry.passageId]);
    }
    const questionEntries = (passageId: string): ComposeOutlineEntry[] => {
      const views = questionSlices.byPassage.get(passageId);
      if (!views) return [];
      return views.map((view) => ({
        kind: "question" as const,
        key: view.questionId,
        blockId: questionOrderId(view.questionId),
        label: view.typeLabel,
        no: view.no,
      }));
    };

    const out: ComposeOutlineGroup[] = [];
    for (const group of passageGroups) {
      const entries: ComposeOutlineEntry[] = [];
      for (const id of group.reportIds) {
        if (!readySet.has(id)) continue;
        const doc = docLabels.get(id);
        const fallback = sheetLabels.get(id);
        const marker = doc?.planMarker || fallback?.planMarker || "";
        const isActive = id === activeId;
        const docKey = isActive ? null : composeDocKeyById.get(id) ?? null;
        // 활성이 아닌데 docKey 가 없으면 스크롤 대상을 특정할 수 없다(위 방어와 같은 이유
        // — `docKey:null` 은 「활성 문서」라는 뜻이라 넘기면 엉뚱한 곳으로 간다).
        if (!isActive && !docKey) continue;
        entries.push({
          kind: "doc",
          key: id,
          docKey,
          // ── [E28] §3.10.27 R7 — 목차 doc 항목의 이름을 갈아 끼운다 ─────────────
          // 이 트리는 **이미 지문으로 그룹**돼 있고 그룹 헤더가 `passageTitle` 을
          // 말한다(아래 `out.push`). 그래서 항목 1줄이 가질 수 있는 값은 셋뿐인데
          // 둘은 못 쓴다:
          //  · AI 제목(`report.title`) = 사용자가 폐기한 바로 그 이름(E28-SPEC §0-1).
          //  · 지문 제목 = 그룹 헤더의 되풀이 + **형제 항목이 글자 단위로 같아진다**
          //    (같은 지문의 PRIME/PRIME_FINAL 은 passageId 가 같다 — §0-2).
          // → 남는 하나, **플랜 라벨**이 정답이다. 같은 지문의 형제를 구분하는 축이
          //   애초에 플랜이고(기본 학습지 / 파이널 원페이지 / 국어 워크북), 그 값은
          //   `SHEET_PLAN_LABEL` 정본에서만 온다(복제본 금지 — sheet-products.ts).
          label: SHEET_PLAN_LABEL.get(marker) || marker || "학습지",
          // AI 제목은 **버리지 않고 강등**한다 — 팝오버가 이 값을 `title` 툴팁에만
          // 싣는다(`section-outline-popover.tsx` doc 분기).
          // ⚠ 팝오버에서 이걸 다시 시각 배지로 되돌리지 마라: 그 span 은 `shrink-0`
          //   이라 20자가 넘는 AI 제목이 302px 팝오버에서 라벨을 통째로 밀어낸다.
          sub: doc?.title || fallback?.title || undefined,
          active: isActive,
        });
      }
      for (const passageId of placedByGroup.get(group.key) ?? []) {
        entries.push(...questionEntries(passageId));
      }
      if (entries.length === 0) continue;
      out.push({
        key: group.key,
        passageTitle:
          group.passageTitle ||
          questionSlices.titleOf.get(group.passageId) ||
          "지문",
        entries,
      });
    }
    // 꼬리(학습지 없는 지문의 문항)도 목차에 실어야 인쇄 순서와 목차가 1:1 이 된다.
    // key 는 학습지 그룹 key(=passageId)와 충돌할 수 있어 `#q` 로 갈라 둔다.
    for (const entry of questionPlacement.tail) {
      const entries = questionEntries(entry.passageId);
      if (entries.length === 0) continue;
      out.push({
        key: `${entry.passageId}#q`,
        passageTitle: entry.headerTitle || "지문",
        entries,
      });
    }
    return out.length === 0 ? EMPTY_OUTLINE : out;
  }, [
    passageGroups,
    sheetLabels,
    docLabels,
    composeDocs,
    questionPlacement,
    questionSlices,
    readyIds,
    activeId,
    composeDocKeyById,
  ]);

  const questionCount = questionViews.length;
  /** 체크는 됐는데 아직 본문이 안 온 문항 수 — 고지 문구가 「m개」를 과대 표시하지 않게 한다. */
  const questionPendingCount = Math.max(0, questionIds.length - questionCount);

  // ── [E23] 파이널 활동 소스 — 같은 지문의 **기본** 리포트 ───────────────────
  /**
   * 활동 생성 소스는 「지문」이지 「문서」가 아니다(e22-activity-spec §2 계약). 활성
   * 문서가 파이널 원페이지면 같은 지문의 기본 행(GET 무파라미터)을 가져와
   * `activitySource` 로 편집기에 내린다 — 문장 ko·청크를 요구하는 활동(직독직해·
   * 문장 해석 등)이 파이널에서 살아나는 유일한 통로다(파이널 섹션에는 둘 다 없다).
   *
   * 캐시는 **passageId 키**(문서 전환 왕복에 재fetch 0)이고 **null 도 캐시값**이다:
   * 404·파싱 실패·기본 행이 도리어 파이널 모양(구서버가 variant 를 몰라 같은 행을
   * 돌려주는 오염 — prime-analysis-view.tsx `loadFinal` 가드와 동형, 방향만 반대)
   * 이면 null 로 **확정**해 재시도하지 않는다. 소스가 없으면 en-계 활동만 가용한
   * T1 강등이 정답이지 재시도가 아니다. 기본 문서 활성 시 fetch 자체가 없다(무회귀).
   * 도착 전에는 UI 를 막지 않는다 — 값이 오면 prop 이 자연 갱신될 뿐이다.
   */
  const [activitySourceCache, setActivitySourceCache] = useState<
    ReadonlyMap<string, AnalysisReport | null>
  >(new Map());
  // 판정은 planMarker 우선(행 정본), 마커가 다른 값이면 문서 모양으로 폴백 —
  // PATCH 자기감지(route.ts marker 산식)와 같은 판별자를 공유한다.
  const activeDocIsFinal =
    !!activeDoc &&
    (activeDoc.planMarker === "PRIME_FINAL" || isFinalOnepageReportShape(activeDoc.report));
  const activeFinalPassageId = activeDocIsFinal && activeDoc ? activeDoc.passageId : null;
  useEffect(() => {
    if (!activeFinalPassageId) return;
    if (activitySourceCache.has(activeFinalPassageId)) return;
    // 문서 전환·언마운트 뒤 도착한 응답은 버린다(cancelled — 늦은 setState 방지,
    // `prime-analysis-view.tsx` 로더와 동형). 위 문서 로더가 경고한 「영영 재요청 안
    // 되는 정지 상태」를 피하려고 **in-flight 기록을 따로 두지 않는다**: 버려진 지문은
    // 캐시가 비어 있으므로 다음 활성화 때 effect deps 변화로 자연히 다시 요청된다
    // (중복 방지는 완료 응답을 담는 캐시 몫 — 전환 왕복 중복 fetch 는 드물고 무해하다).
    let cancelled = false;
    void (async () => {
      let next: AnalysisReport | null = null;
      try {
        const res = await fetch(
          `/api/workbench/passage-reports/prime/${activeFinalPassageId}`,
        );
        const j = (await res.json()) as { report?: unknown } | null;
        if (j?.report && !isFinalOnepageReportShape(j.report as AnalysisReport)) {
          next = j.report as AnalysisReport;
        }
      } catch {
        // 실패 = null 강등 확정. 별도 배너를 띄우지 않는다 — 활동 소스는 부가 데이터라
        // 없어도 조판·편집이 전부 동작하고, 가용성 라벨이 사유를 카드 단위로 말해 준다.
      }
      if (cancelled) return;
      setActivitySourceCache((prev) => {
        const nextMap = new Map(prev);
        nextMap.set(activeFinalPassageId, next);
        return nextMap;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeFinalPassageId, activitySourceCache]);

  // ── 저장 결과를 캐시에 반영 ─────────────────────────────────────────────────
  // 안 하면 문서 A 를 저장한 뒤 B 로 갔다가 A 로 돌아왔을 때 **저장 이전 본문**이 뜬다
  // (편집기는 initialReport 로만 시드되고 캐시는 조회 시점 스냅샷이므로).
  // 판정 입력은 원시값으로 캡처한다 — activeDoc 을 통째로 deps 에 물면 저장(report
  // 참조 교체)마다 handleSaved 가 재생성된다. 아래 두 값은 같은 문서 안에서 불변이다.
  const activePassageId = activeDoc?.passageId ?? null;
  const activePlanMarker = activeDoc?.planMarker ?? null;
  const handleSaved = useCallback(
    (nextReport: AnalysisReport) => {
      if (!activeId) return;
      setStore((prev) => {
        const cur = prev.docs.get(activeId);
        if (!cur) return prev;
        const nextDocs = new Map(prev.docs);
        nextDocs.set(activeId, { ...cur, report: nextReport });
        return { docs: nextDocs, dropped: prev.dropped };
      });
      // [E23] 기본(PRIME) 저장은 활동 소스 캐시에도 반영(판별자는 activeDocIsFinal 과
      // 동일 — 마커 우선·저장본 모양 폴백, 파이널 저장은 캐시 무접촉) — 같은 세션에서
      // 기본을 고치고 파이널로 넘어갔을 때의 스테일 소스 주입 방지(E23 검수 A-3).
      if (
        activePassageId &&
        activePlanMarker !== "PRIME_FINAL" &&
        !isFinalOnepageReportShape(nextReport)
      ) {
        setActivitySourceCache((prev) => {
          const next = new Map(prev);
          next.set(activePassageId, nextReport);
          return next;
        });
      }
    },
    [activeId, activePassageId, activePlanMarker],
  );

  // ── 접힘 사다리(ResizeObserver) ─────────────────────────────────────────────
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      // 【필수 0가드】 폭 0 = 숨김 서브트리(display:none — 자산 뷰 전환·xl 미만 aside).
      // 그대로 반영하면 전 계단이 접힌 채 **편도 고착**되어 다시 보여도 안 펴진다
      // (`exam-paper-builder-client.tsx:1964-1968` 이 같은 함정을 같은 방식으로 막는다).
      if (width <= 0) return;
      setLadder((prev) => {
        const next = nextLadder(width, prev);
        return sameLadder(prev, next) ? prev : next;
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const embed = useMemo<AnalysisReportEditorEmbed>(
    () => ({
      storageNamespace: SHEET_COMPOSE_STORAGE_NS,
      // 초기 시드 = 현재 사다리. RO 는 마운트 직후 한 번 더 확정하므로 이건 첫 페인트용이다.
      initialCollapsed: {
        activity: ladder.activity,
        panel: ladder.panel,
        pages: ladder.pages,
      },
      // **강제는 접는 방향으로만** 건다. `false` 를 내리면 넓은 폭에서 사용자가 직접 접는
      // 것까지 막힌다(편집기 계약: 값이 주어진 축은 그 값이 이긴다).
      forceCollapsed: {
        activity: ladder.activity || undefined,
        panel: ladder.panel || undefined,
        pages: ladder.pages || undefined,
      },
      narrow: ladder.narrow,
      printRootId: SHEET_COMPOSE_PRINT_ROOT_ID,
      // 인쇄 제외는 **가시성과 동기**다. 숨김 마운트 중에 false 로 두면 par-root 2개가
      // 인쇄 대상으로 공존해(`report-styles.ts:1878-1885` 가 둘 다 같은 좌표에 절대배치)
      // 사용자가 시험지를 인쇄할 때 백지가 나온다(26-08-11 21루트 백지 실측 이력과 동형).
      printExclude: !active,
    }),
    [ladder, active],
  );

  // ── 닫기·전환·**해제** 가드 ─────────────────────────────────────────────────
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = Boolean(toolbar?.dirty);
  }, [toolbar?.dirty]);

  /**
   * 【필수】 미저장 편집 소실 가드의 **세 번째 경로**: 체크 해제.
   *
   * 닫기(handleClose)·활성 전환(requestActiveDoc)에는 confirm 이 있었지만, 대기열에서
   * 활성 문서를 빼는 경로에는 없었다. 그 경우 위 `activeId` 자동 수렴(:308-314)이 다음
   * 문서로 넘어가고 `key={activeDoc.reportId}`(:706)가 편집기를 재마운트해 **편집이
   * 경고 없이 증발**한다 — 프로브 `.tmp-worksheet-compose/_audit-l3-b.mjs` 실측:
   * 타이핑 후 `dirty: 2` → 그 행 체크 해제 → `dialogs: []`(confirm 0건) ·
   * `dirty: 0` · `ZQX still in canvas: false`, 재체크해도 복구 불가(undo 히스토리까지
   * 재마운트로 초기화).
   *
   * 대기열을 줄이는 코드는 전부 오케스트레이터에 있으므로(`studio-home-client.tsx`
   * applySheetPicked/toggleSheetPick/clearPickedSheets/…), 여기서는 **자기 상태를 읽는
   * 함수만** 싱글턴에 등록하고 판정·confirm 은 그쪽 커밋 직전에 돈다. prop 사슬로
   * 내리지 않는 이유는 가드 모듈 머리주석 참조(2트리 렌더 함정과 재차 얽힌다).
   * ref 로 읽으므로 deps 는 빈 배열 — dirty/활성이 바뀔 때마다 재등록할 이유가 없다.
   */
  const activeIdRef = useRef<string | null>(null);
  // 렌더 중 ref 쓰기는 하지 않는다(React Compiler 순수성 — 오케스트레이터
  // :1766 주석과 같은 규약). 커밋 후 갱신으로 충분하다: 가드는 **사용자 클릭**
  // 시점에만 읽히고, 클릭은 언제나 커밋 이후다.
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(
    () =>
      registerSheetComposeDirtyProbe(() => ({
        activeReportId: activeIdRef.current,
        dirty: dirtyRef.current,
      })),
    [],
  );

  const handleClose = useCallback(() => {
    // 시험지 조판과 달리 **초안 자동 보관이 없다** — 학습지 편집기는 IndexedDB 초안 기제가
    // 없고 저장은 명시 PATCH 뿐이다. 그래서 자구도 "임시 보관"이 아니라 "사라진다"여야 한다.
    if (dirtyRef.current) {
      const ok = window.confirm(
        "저장하지 않은 편집이 있어요. 조판을 닫으면 사라집니다. 계속할까요?",
      );
      if (!ok) return;
    }
    onClose();
  }, [onClose]);

  const requestActiveDoc = useCallback(
    (reportId: string) => {
      if (reportId === activeId) return;
      // 전환은 편집기 `key` 교체 = 재마운트다(E21-6 4번). undo 히스토리·줌·활성 블록이
      // 초기화되고 미저장 편집은 복구 불가라, confirm 자구가 그 사실을 그대로 말한다.
      if (dirtyRef.current) {
        const ok = window.confirm(
          "저장하지 않은 편집이 있어요. 다른 학습지로 옮기면 사라집니다. 계속할까요?",
        );
        if (!ok) return;
      }
      onActiveReportIdChange(reportId);
    },
    [activeId, onActiveReportIdChange],
  );

  // ── 가시성·포커스·Escape (시험지 조판 표면과 동일 계약) ────────────────────
  const rootRef = useRef<HTMLDivElement | null>(null);
  const backBtnRef = useRef<HTMLButtonElement | null>(null);
  // active 는 호스트가 아는 숨김(자산 뷰 전환)만 잡는다. CSS 로만 숨는 경우(xl 미만 aside 의
  // hidden xl:flex 등)는 호스트도 모르므로 자기 DOM 가시성으로 판정 — display:none 서브트리는
  // offsetParent 가 null 이다.
  const isShowing = () => active && Boolean(rootRef.current?.offsetParent);
  useEffect(() => {
    if (isShowing()) backBtnRef.current?.focus();
    // isShowing 은 렌더마다 새 함수지만 판정 재료(active·DOM)는 안정적이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (e.defaultPrevented) return;
      if (!isShowing()) return;
      // 편집기가 소유한 중첩 다이얼로그('다른 이름으로 저장' 등)가 열려 있으면 Esc 는
      // 그쪽 몫이다 — 여기서 닫기 가드까지 트리거하면 confirm 이 겹쳐 뜬다
      // (`passage-analysis-modal.tsx:254-256` 이 같은 이유로 같은 셀렉터를 쓴다).
      if (document.querySelector('[data-slot="dialog-content"]')) return;
      handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, handleClose]);

  // ── [E27 · R4] 추가 시 자동 스크롤 ─────────────────────────────────────────
  /**
   * **판정 축은 이 파일 한 곳이다.**
   *
   * 오케스트레이터에 심지 않는 이유(정찰 D 결론): `pickedSheets` 커밋 지점이 10곳
   * (`studio-home-client.tsx:1910·2113·2149·2162·2181·2210·2259·2300·2377·2564`)이라
   * 하나만 빠뜨려도 **조용한 무동작**이 되고, 반대로 커밋 이전 지점에 걸면 제거 confirm 을
   * 취소한 사용자에게 「취소했는데 캔버스만 튄다」가 남는다(`library-pane.tsx:998-1005`).
   * 표면에서 **직전 내용 키와 diff** 하면 어느 경로로 들어왔든 결과 하나만 보게 된다.
   *
   * ⚠ `picked` Map 값에 「방금 추가됨」 플래그를 심지 마라 — 참조 churn 하나가 전량
   *   재합성 489ms 를 태운다(E22/U9-9 실측). 그래서 재료는 이미 있는 내용 키 2개뿐이다.
   * ⚠ 좌측 목록판(`composer-list-pane.tsx`)에 콜백/상태를 내리지 마라 — `memo` 가 죽는다.
   */
  /**
   * ══ [E27 적대검수 — S1] 요청에 **발행 시점의 활성 문서**를 함께 싣는다 ══
   *
   * 이 요청은 **생성 1곳뿐이고 청산 경로가 0곳**인데, 편집기의 소비 effect 는
   * 의도적으로 마운트 가드가 없다(`AnalysisReportEditor.tsx:2211-2220` 주석 —
   * 「새 학습지가 활성이 되어 선두로 이동」하는 R4 경로가 정확히 재마운트 첫 커밋이라
   * 가드를 두면 무음 무동작이 된다). 그런데 편집기는 활성 문서가 바뀔 때마다
   * `key={activeDoc.reportId}` 로 **재마운트**되므로, 그 첫 커밋에서 **이미 소비된 옛
   * 요청이 그대로 재발사**된다: 문항 Q 체크로 발사(정상) → 헤더 칩으로 학습지 B 로
   * 전환(또는 활성 학습지 체크 해제로 activeId 자동 수렴) → B 가 아니라 **예전 문항 Q**
   * 로 스크롤 + 글로우.
   *
   * → 요청에 `forActive`(발행 시점 activeId)를 실어 **표면에서 무효화**한다. 편집기는
   *   무접촉이고, 스펙이 마운트 발사를 남겨 둔 근거(새 학습지가 활성이 되어 선두로
   *   이동)는 요청 생성 시점 activeId 와 같은 문서라 그대로 산다.
   *
   * ⚠ 「`requestActiveDoc` 안에서 `setScrollRequest(null)`」 단독 처방은 **채택 금지**다 —
   *   칩 클릭만 덮고 「활성 학습지 체크 해제 → `activeId` 가 `readyIds[0]` 로 자동 수렴」
   *   경로(위 activeId memo)에서는 `requestActiveDoc` 이 아예 호출되지 않는다.
   */
  const [scrollRequest, setScrollRequest] = useState<{
    req: ComposeScrollRequest;
    /** 발행 시점의 활성 문서 reportId. 지금 활성과 다르면 **스테일**이다. */
    forActive: string | null;
  } | null>(null);
  /**
   * 「본문이 아직 안 온 대상」 보류함. 선례: 시험지 빌더 `pendingScrollItemId`
   * (`exam-paper-builder-client.tsx:357-359,1762-1769`). 체크 → 조회 → 조판까지 왕복이
   * 있으므로 커밋 시점에 바로 쏘면 대상 DOM 이 존재하지 않아 무음 무동작이 된다.
   */
  const [pendingScroll, setPendingScroll] = useState<
    { kind: "doc"; id: string } | { kind: "question"; id: string } | null
  >(null);
  /** 직전 내용 키. `null` = 아직 baseline 미수립(초기 마운트). */
  const prevPickKeysRef = useRef<{ sheets: string; questions: string } | null>(null);
  const scrollNonceRef = useRef(0);

  useEffect(() => {
    const prev = prevPickKeysRef.current;
    prevPickKeysRef.current = { sheets: composeIdsKey, questions: questionIdsKey };
    // ① **초기 마운트는 baseline 만** 세운다. 안 그러면 조판을 열자마자 캔버스가 튄다
    //    (열림 = 「전부 신규」로 보인다).
    if (!prev) return;
    // ①-b ══ [E27 적대검수 — P6] 숨김 중에는 **보류 자체를 만들지 않는다** ══
    //    E27-SPEC §4 R4 규칙 5 는 「`active !== true` 면 **발사하지 않는다**」인데,
    //    초판은 아래 소비 effect 에서만 막아 사실상 **무기한 연기**였다. 이 표면은
    //    `sheetComposeOpen` 동안 **숨김 마운트로 상시 생존**하고 `active` 만 갈리므로
    //    ([시험지 조판] 필로 이동 = `centerAssetView !== "sheet"`), 그 필에서 문항을
    //    체크하면 숨은 이 effect 가 pending 을 쌓았다가 사용자가 [학습지 조판] 으로
    //    **돌아오기만 해도** 소급 발화했다 — 그 필에서 아무 조작도 안 했는데 캔버스가
    //    점프 + 글로우. baseline(`prevPickKeysRef`)은 위에서 **이미 전진**시켰으므로
    //    여기서 빠져도 전이가 소급되지 않는다(오케스트레이터 투어 억제 ④ · xl 억제 ③이
    //    쓰는 「ref 는 전진시키고 전이는 버린다」와 같은 관용구).
    if (!isShowing()) return;
    const addedOf = (before: string, after: string): string | null => {
      if (after === "") return null;
      const had = new Set(before === "" ? [] : before.split(IDS_KEY_SEP));
      // ② 신규가 여러 개면(마키·전체선택) **첫 신규 항목** 하나만 — 인쇄 순서상 앞선 것이다.
      for (const id of after.split(IDS_KEY_SEP)) if (!had.has(id)) return id;
      return null;
    };
    const addedSheet = addedOf(prev.sheets, composeIdsKey);
    // ③ 학습지·문항이 같은 커밋에 함께 들어오면 학습지 우선 — 지문 그룹에서 앞선다.
    if (addedSheet) {
      setPendingScroll({ kind: "doc", id: addedSheet });
      return;
    }
    const addedQuestion = addedOf(prev.questions, questionIdsKey);
    if (addedQuestion) setPendingScroll({ kind: "question", id: addedQuestion });
    // ④ **제거만 있는 커밋에는 발사 금지** — 신규 0이면 여기서 그냥 끝난다.
    //
    // ⚠ deps 에 `active` 를 **넣지 마라.** 넣으면 재가시 커밋에서 이 effect 가 다시 돌고,
    //   그때 `prev` 는 숨김 중 전진한 baseline 이라 신규 0이지만 — 숨김 중 **여러 번**
    //   체크·해제가 오갔을 때 마지막 커밋만 반영된 baseline 과 어긋나는 창이 생긴다.
    //   P6 의 요지는 「숨김 중 전이는 **버린다**」이지 「모아 뒀다 나중에 판정한다」가 아니다.
    // isShowing 은 렌더마다 새 함수지만 판정 재료(active·DOM)는 안정적이다
    // (아래 소비 effect · 포커스/Escape effect 와 같은 규약).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeIdsKey, questionIdsKey]);

  useEffect(() => {
    if (!pendingScroll) return;
    // 보류 중 대상이 목록에서 빠졌으면(체크 해제·드롭) 보류를 청산한다. 안 하면 한참 뒤
    // 엉뚱한 커밋에서 되살아난다.
    const stillPicked =
      pendingScroll.kind === "doc"
        ? picked.has(pendingScroll.id) && !dropped.has(pendingScroll.id)
        : Boolean(pickedQuestions?.has(pendingScroll.id));
    if (!stillPicked) {
      setPendingScroll(null);
      return;
    }
    // ⑤ 숨김 마운트(display:none 서브트리)는 offsetParent 가 null 이라 좌표가 전부 0 이다.
    //    보류를 유지한 채 빠진다 — 재가시(`active` 전이)에 이 effect 가 다시 돈다.
    //    [P6] 이 지점의 보류는 **가시 상태에서 생긴 것만** 남는다(위 ①-b) — 즉
    //    「사용자가 이 필에서 체크했고 본문이 아직 안 왔다」뿐이라, 재가시 소급 발화가
    //    규칙 5 위반이 아니라 규칙 4(대상 도착까지 보류)의 정상 동작이다.
    if (!isShowing()) return;
    let target: ComposeScrollTarget | null = null;
    if (pendingScroll.kind === "doc") {
      // 본문 미도착이면 계속 보류(readyIds 가 바뀌면 다시 돈다).
      if (!readyIds.includes(pendingScroll.id)) return;
      if (pendingScroll.id === activeId) {
        target = { kind: "doc", docKey: null };
      } else {
        const docKey = composeDocKeyById.get(pendingScroll.id);
        if (!docKey) return;
        target = { kind: "doc", docKey };
      }
    } else {
      if (!questionViews.some((v) => v.questionId === pendingScroll.id)) return;
      target = { kind: "block", id: questionOrderId(pendingScroll.id) };
    }
    setPendingScroll(null);
    scrollNonceRef.current += 1;
    // [S1] `forActive` = **발행 시점의 활성 문서**. 편집기에 내릴 때 지금 활성과 대조해
    //      스테일 요청을 무효화한다(위 state 선언 주석).
    setScrollRequest({
      req: { target, nonce: scrollNonceRef.current },
      forActive: activeId,
    });
    // isShowing 은 렌더마다 새 함수지만 판정 재료(active·DOM)는 안정적이다
    // (위 포커스/Escape effect 와 같은 규약).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingScroll,
    active,
    readyIds,
    activeId,
    composeDocKeyById,
    questionViews,
    picked,
    dropped,
    pickedQuestions,
  ]);

  const print = useCallback(() => {
    // 【필수 0건 가드 — 적대 검수 확정 결함】 조판 문서가 0건이면 인쇄를 **발사하지 않는다**.
    // 활성 문서가 없으면 `ReportPages` 가 어디에도 마운트되지 않아(빈 상태 분기 :695-700)
    // 인쇄 화이트리스트 CSS(`report-styles.ts:1825-1885` — `body *{visibility:hidden}` +
    // `.par-root` 만 되살리는 규칙)가 **주입조차 되지 않는다**. 실측(`page.pdf()`)에서
    // 0건 상태 인쇄는 학습지가 아니라 **스튜디오 앱 화면 2페이지**를 뱉었다(1문서 대조군은
    // 학습지 5페이지). 버튼 `disabled` 와 이중으로 막는 이유: 버튼은 시각 신호일 뿐이고
    // 이 가드는 로딩 중(:715-723)·조회 실패(:724-739)처럼 `picked>0` 이지만 activeDoc 이
    // 없는 구간까지 함께 덮는다.
    if (!activeDoc) return;
    // 폰트 미로드 상태로 print() 를 부르면 브라우저가 스풀 중 폰트를 받아 시작이 지연된다
    // (`passage-analysis-modal.tsx:589-593` 관용구).
    void document.fonts.ready.then(() => window.print());
  }, [activeDoc]);

  // ── 문서 칩 스트립 스크롤 계기(고지 배지 소멸 결함 수술) ────────────────────
  // 초판은 고지 배지와 문서 칩을 **한 줄**에 두고 그 줄에 `overflow-x-auto` 를 걸었다.
  // 실측(dev 서버·문서 3건): 칩이 전부 `shrink-0`(215+268+282 = 765px + gap/padding ≈ 799px)
  // 이라 여유폭을 통째로 먹고, `min-w-0 shrink` 였던 고지 배지가 content 0 으로 압축되어
  // **w=14px(= padding+border)** 만 남았다 — 1440·1280 에서 고지 문구 100% 비가시,
  // 1720 에서도 「· 부착 2건 · 저장 대상은 현재 문서」가 잘렸다. E21-0 이 「고지 없는 합성은
  // 즉시 신뢰 사고」로 못박은 바로 그 문구다. 그래서 줄을 둘로 쪼갠다:
  //   위 줄 = 고지 전용(스크롤 0 · 줄바꿈 허용 · 압축 금지) / 아래 줄 = 칩 전용(스크롤 + 계기).
  const chipStripRef = useRef<HTMLDivElement | null>(null);
  const [chipOverflow, setChipOverflow] = useState<{ start: boolean; end: boolean }>({
    start: false,
    end: false,
  });
  const syncChipOverflow = useCallback(() => {
    const el = chipStripRef.current;
    if (!el) return;
    // 1px 여유 — 소수 픽셀(브라우저 줌·스크롤바 gutter)에서 end 가 영영 true 로 남는 것 방지.
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setChipOverflow((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );
  }, []);
  useEffect(() => {
    const el = chipStripRef.current;
    if (!el) {
      setChipOverflow((prev) =>
        prev.start || prev.end ? { start: false, end: false } : prev,
      );
      return;
    }
    syncChipOverflow();
    const onScroll = () => syncChipOverflow();
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => syncChipOverflow());
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
    // ResizeObserver 는 **컨테이너 폭**만 잡는다. 칩 개수·제목이 바뀌면 scrollWidth 가
    // 바뀌므로(체크 추가/해제·지연 로딩 완료) 그 축을 deps 로 따로 물린다.
  }, [syncChipOverflow, composeIds, docs, activeId, activeDoc]);
  const scrollChips = useCallback((dir: -1 | 1) => {
    const el = chipStripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: "smooth" });
  }, []);

  // ── 배너(드롭 · 조회 실패) ─────────────────────────────────────────────────
  // 【E22】 「상한 초과」 조각은 **소멸**했다 — 문서 하드 상한이 폐기됐으므로 잘리는 문서
  // 자체가 없다(E22-0 3번). 이 배너는 이제 「올리지 못한 문서」 전용이고, 무게 고지는
  // 아래 소프트 경고가 **별도 줄**로 담당한다(실패와 정보를 같은 색으로 말하지 않는다).
  const droppedInPick = useMemo(
    () => composeIds.filter((id) => dropped.has(id)),
    [composeIds, dropped],
  );
  const banner = useMemo(() => {
    const parts: string[] = [];
    if (droppedInPick.length > 0) {
      const reason = dropped.get(droppedInPick[0]) ?? "조판할 수 없습니다.";
      parts.push(
        droppedInPick.length > 1
          ? `${droppedInPick.length}건은 조판에 올리지 못했습니다 — ${reason}`
          : reason,
      );
    }
    if (fetchError) parts.push(fetchError);
    // 문항 축 실패도 같은 배너에 싣는다 — 실패 채널을 둘로 나누면 좁은 폭에서 둘째 줄이
    // 밀려 안 보인다. 「다시 시도」는 아래에서 두 축을 모두 재시도한다.
    if (questionsError) parts.push(questionsError);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [droppedInPick, dropped, fetchError, questionsError]);

  const attachedCount = composeDocs.length;
  const loading = pending > 0;

  /**
   * [E22/U9-7] **소프트 경고 — 막지 않는다.**
   *
   * 조판 아이템 총합이 임계를 넘으면 「무거워질 수 있습니다」 한 줄만 띄운다. 문서 축
   * 아이템 수는 편집기 밖으로 나오는 채널이 없어 R4 실측 환산치를 쓴다(위 상수 주석).
   * 문항 축은 조각 단위 실측치라 정확하다 — [E27] 이후로는 문항 조각이 **그룹별 묶음 +
   * 꼬리**로 흩어지므로 `composeQuestionPlan.itemCount`(둘의 합)를 쓴다. 한쪽만 세면
   * 지문 인터리브가 켜진 순간 고지가 과소 표시된다.
   */
  const estimatedItems =
    readyIds.length * EST_ITEMS_PER_DOC + composeQuestionPlan.itemCount;
  const heavyNotice =
    estimatedItems > SOFT_ITEM_LIMIT
      ? `학습지 ${readyIds.length}건 + 문항 ${questionCount}개 — 조판이 무거워질 수 있습니다(계속 진행됩니다)`
      : null;

  /** 두 축을 함께 재시도. 실패 배너가 한 줄이므로 버튼도 하나여야 한다. */
  const retryAll = useCallback(() => {
    retry();
    retryQuestions();
  }, [retry, retryQuestions]);

  return (
    // ⚠ `role="region"` 은 장식이 아니라 **QA 계약**이다(E24 §6-1). 3필 개편으로
    // 필 라벨 「학습지 조판」이 이 표면의 `aria-label` 과 **글자 단위로 같아졌고**,
    // 프로브는 `[role="region"][aria-label="학습지 조판"]` 로 둘을 가른다 — 필은
    // `<button>` 이라 `role=region` 을 절대 못 갖기 때문이다. 이 두 속성 중 하나라도
    // 걷어내면 프로브가 필에서 조기 resolve 해 **가짜 GREEN**(표면이 안 떠도 통과)이
    // 된다. 「중복 같아 보인다」는 이유로 지우지 마라.
    <div
      ref={rootRef}
      role="region"
      aria-label="학습지 조판"
      className="flex h-full min-h-0 min-w-0 flex-col bg-white"
    >
      {/* ── 컴팩트 헤더 — 복귀 + 정체 + 저장/사본/생성/인쇄 ──
          편집기 안에는 저장 버튼도 Ctrl+S 도 없다(E21-5). `onToolbarStateChange` 로
          끌어올린 상태를 여기가 그린다 — 관용구 정본은 passage-analysis-modal.tsx:536-601
          이고, h-10 헤더에 맞춰 라벨을 걷어내고 아이콘 위주로 축약했다. */}
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-slate-200 bg-white px-2">
        <button
          ref={backBtnRef}
          type="button"
          onClick={handleClose}
          title="조판 닫기 — 학습지 목록으로 돌아갑니다"
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          돌아가기
        </button>
        <LayoutTemplate className="size-3.5 shrink-0 text-blue-600" aria-hidden="true" />
        <h3 className="shrink-0 text-[12px] font-bold tracking-tight text-slate-800">
          학습지 조판
        </h3>
        {className ? (
          <span className="min-w-0 truncate text-[11px] font-medium text-slate-400">
            · {className}
          </span>
        ) : null}
        <span className="flex-1" aria-hidden="true" />
        {/* 미저장 신호는 **여기가 유일한 노출처**다 — 좁은 컨테이너에서는 편집기 툴바의
            「저장 필요」 배지가 `.are-shell[data-embed-narrow]` 규칙으로 숨는다(E21-4). */}
        {toolbar?.dirty ? (
          <span
            title="저장하지 않은 편집이 있습니다"
            className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
          >
            저장 필요
          </span>
        ) : null}
        {toolbar ? (
          <>
            {toolbar.worksheetSupported !== false && !toolbar.worksheetHasContent ? (
              <button
                type="button"
                onClick={toolbar.generateWorksheet}
                disabled={toolbar.worksheetBusy || toolbar.saving}
                title="실전 학습지(어법 선택·어휘 빈칸·배열 + 수능추론 5문항) 추가 생성 — 크레딧이 차감됩니다"
                aria-label="실전 학습지 생성"
                className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-blue-200 bg-white text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {toolbar.worksheetBusy ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <FileQuestion className="size-3.5" aria-hidden="true" />
                )}
              </button>
            ) : null}
            {/* 저장 + 캐럿(다른 이름으로 저장). 다이얼로그·PATCH·토스트는 전부 편집기 소유라
                여기선 콜백만 연결한다(호스트마다 복제 금지 계약). */}
            <SaveButton
              onClick={toolbar.save}
              saving={toolbar.saving || toolbar.savingAs}
              disabled={!toolbar.dirty}
              iconOnly
              title="현재 문서 저장 — 부착 문서는 저장되지 않습니다"
              className="size-7"
              secondaryActions={[
                {
                  label: "다른 이름으로 저장",
                  icon: <Copy className="size-3.5" />,
                  onClick: toolbar.requestSaveAs,
                  disabled: toolbar.savingAs,
                },
              ]}
            />
          </>
        ) : null}
        {/* [E22/U9-6] 문항 정답표 토글 — **문서가 아니라 이 화면이 소유**한다.
            문항이 0건이면 토글할 대상이 없으므로 아예 렌더하지 않는다(빈 버튼 금지). */}
        {questionCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAnswerKey((v) => !v)}
            aria-pressed={showAnswerKey}
            title={
              showAnswerKey
                ? "문항 정답·해설표를 묶음 맨 끝에서 뺍니다 (이 설정은 저장되지 않습니다)"
                : "문항 정답·해설표를 묶음 맨 끝에 붙입니다 (이 설정은 저장되지 않습니다)"
            }
            aria-label="문항 정답표"
            className={cn(
              "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors",
              showAnswerKey
                ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50",
            )}
          >
            <Key className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
        {/* 인쇄는 저장·생성 버튼과 달리 `toolbar` 게이트 밖에 있어 **0건 빈 상태에서도
            정상 활성으로 남아 있었다**(그 상태에서 유일하게 남는 액션이라 사용자가 가장
            먼저 누른다). 실측상 그 인쇄는 학습지가 아니라 스튜디오 앱 화면을 뱉는다 —
            자구는 실행대와 같은 계열로 맞춘다(`sheets-action-rail.tsx:68` PICK_FIRST). */}
        <button
          type="button"
          onClick={print}
          disabled={!activeDoc}
          title={
            activeDoc
              ? // [E22/U9-5 → E27 개정] 문항이 **같은 인쇄 묶음에 들어 있다**는 사실을
                // 자구에 박는다. 「학습지만 나오는 줄 알았는데 문항이 딸려 나왔다」와 그
                // 반대가 둘 다 사고다.
                // ⚠ 구 주석의 「마지막 구간」은 E27 이후 거짓이다(문항은 자기 지문 학습지
                //   직후에 낀다 — 위 고지 툴팁 P5 주석). 표시 문자열은 배치를 주장하지
                //   않으므로 무접촉이지만, 주석까지 거짓으로 두면 다음 사람이 그 전제로
                //   코드를 고친다.
                questionCount > 0
                ? `인쇄 — 활성 + 부착 문서 ${attachedCount}건 + 문항 ${questionCount}개가 A4 한 묶음으로 이어서 인쇄됩니다`
                : "인쇄 — 조판된 전체(활성 + 부착 문서)가 이어서 인쇄됩니다"
              : "왼쪽 목록에서 학습지를 먼저 체크하세요"
          }
          aria-label="인쇄"
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300 disabled:hover:bg-white"
        >
          <Printer className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* (E25 §3.10.24) 구 「체크 = 조판」 상시 안내 1줄은 삭제 — 체크가 곧 개방·
          반영이 된 지금, 동작 자체가 그 문장이다(시험지 조판과 동형 삭제). */}

      {/* ── 고지 배지 + 문서 칩 ──
          「합성은 뷰이지 문서가 아니다」(E21-0)를 사용자가 항상 볼 수 있는 자리에 문자로
          박아 둔다. 저장 대상이 무엇인지 모른 채 N개를 편집하는 순간이 곧 사고다. */}
      {activeDoc ? (
        <div className="shrink-0 border-b border-slate-100 bg-white">
          {/* ① 고지 줄 — **자기 줄을 통째로 갖고, 절대 압축되지 않는다.**
              한 줄에 칩과 같이 두었을 때는 칩(`shrink-0`)이 폭을 다 먹고 배지가 w=14px 로
              찌그러져 1440·1280 에서 고지가 100% 사라졌다(위 계기 주석의 실측). 여기서는
              가로 스크롤도 flex 압축도 없으므로 어떤 폭에서도 문구가 살아 있다. 폭이 모자라면
              `break-keep` 으로 어절 단위 줄바꿈만 한다(잘림 0). 다만 **문서 제목만**은
              길이가 무한이라 인라인 블록 truncate 로 가둔다 — 그래야 계약 문구
              「저장 대상은 현재 문서」가 제목에 밀려 사라지지 않는다. 전문은 title 툴팁. */}
          <p
            /* [E27 적대검수 — P5] 「인쇄 묶음 **맨 뒤**에 붙어」는 E27 이후 **거짓**이다.
               실제 배치는 `compose-flow.ts:254-256`(활성 문서 직후) · `:335-337`(부착
               문서 직후)이 정하고 둘 다 companions 루프 **안/앞**이라 문항은 스트림
               한가운데다. 맨 뒤에 남는 것은 통합 정답표와 「학습지 없는 지문의 문항」뿐.
               자구를 그대로 두면 사용자가 「문항은 뒤에만 나오니 학습지만 먼저 뽑겠다」고
               페이지 범위를 지정했을 때 문항이 섞여 인쇄된다 — E21-0 이 「고지 없는(=틀린)
               합성은 즉시 신뢰 사고」로 못박은 바로 그 지점이다. */
            title={`조판은 여러 학습지를 한 화면에 이어 붙여 보여 주는 것뿐입니다. 저장·인쇄 중 저장은 지금 편집 중인 문서 1건(${activeDoc.title})에만 적용됩니다. 부착 ${attachedCount}건.${
              questionCount > 0
                ? ` 문항 ${questionCount}개는 시험지 세트에 저장되어 있고 여기서는 같은 지문 학습지 뒤에 이어 붙어 보이기만 합니다(정답표는 맨 끝 1개) — 조판에서 편집·삭제할 수 없습니다.`
                : ""
            }`}
            className="border-b border-slate-100/80 bg-slate-50/70 px-2 py-1 text-[10px] leading-[1.5] font-semibold break-keep text-slate-500"
          >
            {/* 좁은 컨테이너(사다리 narrow = 컨테이너 <1120px)에서는 계약의 **핵심 두 조각**
                (저장 대상 = 이 문서 · 부착 n건)만 남긴다. 3줄로 늘어나 캔버스 높이를 먹는
                것보다 낫고, 「저장 대상」이라는 말 자체가 E21-0 고지의 알맹이다. */}
            {ladder.narrow ? "저장 대상: " : "편집 중: "}
            <span className="inline-block max-w-[60%] truncate align-bottom text-slate-800">
              {activeDoc.title}
            </span>
            {ladder.narrow
              ? ` · 부착 ${attachedCount}건`
              : ` · 부착 ${attachedCount}건 · 저장 대상은 현재 문서`}
            {/* [E22/U9-5] **문항 축 고지는 상시**(E22-0 계약 확장).
                narrow 에서도 이 조각만은 접지 않는다 — 「지금 화면에 문항이 섞여 있고
                그건 이 문서에 저장되지 않는다」는 사실은 폭이 좁다고 감출 수 있는 종류가
                아니다(고지 없는 합성 = 신뢰 사고, E21-0). 대신 narrow 에서는 괄호 설명을
                줄여 한 줄을 아낀다 — 전문은 위 title 툴팁에 그대로 있다.
                아직 본문이 안 온 문항은 개수에서 빼되 「+n 불러오는 중」으로 존재를 알린다.
                빼지 않으면 로딩 중에 표시 개수가 인쇄 결과보다 커진다. */}
            {questionCount > 0 ? (
              <span className="text-blue-700">
                {ladder.narrow
                  ? ` · 문항 ${questionCount}개(편집 불가)`
                  : ` · 문항 ${questionCount}개(시험지 세트에 저장 · 여기서 편집 불가)`}
              </span>
            ) : null}
            {questionPendingCount > 0 ? (
              <span className="text-slate-400">
                {questionsLoading
                  ? ` +${questionPendingCount} 불러오는 중`
                  : ` +${questionPendingCount}건 미표시`}
              </span>
            ) : null}
          </p>
          {/* ② 칩 줄 — 조판 순서와 활성 문서 전환(E21-6 4번)의 **유일한 조작면**이라
              고지와 자리를 다투게 두지 않는다. 넘칠 때만 좌우 페이드 + ‹ › 버튼이 뜬다
              (레이아웃에 영향 없도록 absolute 오버레이 — 버튼이 폭을 먹으면 스크롤 여부가
              토글되며 떨린다). */}
          <div className="relative px-2 py-1">
            <div
              ref={chipStripRef}
              className="flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {/* ── [E28] §3.10.27 R7 — 칩 이름 통일과 그 **경계** ──────────────────
                  사용자 지시: 「학습지 이름도 AI 가 생성한 것 말고 지문 이름으로 통일」.
                  DB 실측(E28-SPEC §0-1)상 지금까지 칩에 찍히던 것은 `PassageReport.title`
                  (= AI 생성)이었고, 사용자가 부르는 이름은 `Passage.title` 이다.
                  → 칩 라벨 = [플랜 축약][지문 제목], AI 제목은 툴팁으로 강등.

                  ⚠ **인쇄물은 무접촉이다.** 이 통일은 목록/조판 **UI** 축에만 적용한다:
                    · `compose/compose-flow.ts:277` `docHeader = { title: doc.title }`(러닝헤더)
                    · `report-pages/pages.tsx:218-219` 의 docHeader 폴백
                  둘 다 그대로 둔다. 인쇄 자구는 사용자가 말한 축이 아니고, 러닝헤더를
                  지문 제목으로 바꾸면 ⓐ 같은 지문 학습지 2장이 인쇄물에서 구분 불가가 되고
                  ⓑ 문항 구간 헤더(`{지문 제목} · 문항`, 위 `headerFor`)와 글자가 겹쳐
                  「이 페이지가 학습지인가 문제인가」의 귀속이 무너진다.
                  「통일」을 인쇄까지 넓히려면 별도 스펙 절 + 인쇄 게이트를 먼저 세워라. */}
              {composeIds.map((id, index) => {
                const doc = docs.get(id);
                const meta = picked.get(id);
                const dropReason = dropped.get(id);
                // AI 생성 제목 — 이제 칩 **본문이 아니라** 툴팁 재료다.
                const aiTitle = doc?.title ?? meta?.title ?? "";
                // 지문 제목은 `StudioWorksheetDoc` 에 **없다**(worksheet-docs.ts:50-58).
                // 유일한 통로가 대기열 메타이고, `composeIds` 가 `picked.keys()` 파생이라
                // 여기서 meta 가 비는 일은 구조적으로 없다 — 그래도 폴백은 남긴다.
                const passageTitle = meta?.passageTitle ?? "";
                const marker = doc?.planMarker ?? meta?.planMarker ?? "";
                const planLabel = SHEET_PLAN_LABEL.get(marker) ?? marker;
                /**
                 * 칩 앞머리의 플랜 **축약**. 168px 안에서 「기본 학습지」(≈63px)를 통째로
                 * 실으면 지문 제목이 3~4자만 남아 같은 지문 형제 칩이 구분되지 않는다.
                 * 새 상수를 만들지 않고 `SHEET_PLAN_LABEL` 정본의 첫 어절을 취한다 —
                 * 이 리포는 라벨 **복제본**을 명시적으로 금지한다(sheet-products.ts
                 * SHEET_STATUS_BADGE 주석 「값 복제본이 두 표면에 살면 같은 문서가 서로
                 * 다른 배지를 달게 된다」). 정본이 단일 어절로 바뀌면 축약 = 원문이라
                 * 안전하게 퇴화한다. 전체 라벨은 툴팁에 그대로 있다.
                 */
                const planShort = planLabel.split(" ")[0] ?? "";
                /** 칩 본문 1줄. 지문 제목이 정본, 없으면 AI 제목으로 폴백(빈 칩 금지). */
                const chipTitle = passageTitle || aiTitle || "학습지";
                const isActive = id === activeId;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!doc}
                    onClick={() => requestActiveDoc(id)}
                    // [E28] 툴팁이 **전체**를 담는다 — 지문 제목 · 플랜 라벨(축약 아님) ·
                    // AI 제목. 칩 본문이 truncate 로 잘려도 사용자가 「어느 학습지인가」를
                    // 끝까지 복원할 수 있어야 강등이지 삭제가 아니다.
                    // AI 제목이 칩 본문과 같은 문자열이면(= 지문 제목이 비어 폴백된 경우)
                    // 같은 말을 두 번 하지 않는다.
                    title={
                      dropReason
                        ? dropReason
                        : doc
                          ? `${index + 1}. ${chipTitle}${planLabel ? ` · ${planLabel}` : ""}${
                              aiTitle && aiTitle !== chipTitle ? ` · AI 제목: ${aiTitle}` : ""
                            }${isActive ? " (편집 중)" : " — 클릭하면 이 학습지를 편집합니다"}`
                          : "불러오는 중입니다"
                    }
                    // 【인라인 스타일이어야 한다】 `max-w-[168px]`(특이도 0,1,0)은 이 앱에서
                    // **죽은 클래스**다 — `layout.tsx:106` 이 전 사용자에게 무조건 붙이는
                    // `smoat-large-ui` 때문에 `globals.css:1878-1881`
                    // `body.smoat-large-ui :where(button,[role="button"]){max-width:100%}`
                    // (특이도 0,1,1)가 뒤에서 이긴다. 실측 computed max-width 가 전 칩 "100%"
                    // 라 제목이 긴 문서는 칩이 213·267·282px 까지 부풀어 줄을 넘겼다.
                    // 인라인 선언은 어떤 셀렉터 특이도보다 강해 재발하지 않는다.
                    style={{ maxWidth: 168 }}
                    className={cn(
                      "flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[10.5px] font-semibold transition-colors",
                      isActive
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-700",
                      dropReason && "border-amber-200 bg-amber-50/60 text-amber-700",
                      !doc && "cursor-not-allowed opacity-60",
                      doc && "cursor-pointer",
                    )}
                  >
                    <span className="shrink-0 tabular-nums opacity-70">{index + 1}</span>
                    {/* [E28] 플랜 축약은 **절대 truncate 되지 않는 자리**(shrink-0)다.
                        같은 지문의 PRIME/PRIME_FINAL 두 칩은 지문 제목이 글자 단위로
                        같아서(§0-2), 이 조각이 잘리는 순간 두 칩이 완전히 동일해져
                        「편집 중 문서 전환」이라는 칩의 유일한 책임이 수행 불가가 된다.
                        색은 부모 상속(활성=blue-700 / 기본=slate-500 / 드롭=amber-700)이라
                        상태 3종 어디서도 대비가 깨지지 않는다. */}
                    {planShort ? (
                      <span className="shrink-0 rounded bg-black/5 px-1 text-[9.5px] font-bold leading-4">
                        {planShort}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate">{chipTitle}</span>
                    {!doc && !dropReason ? (
                      <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
                    ) : null}
                    {dropReason ? (
                      <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>
            {/* 좌우 계기 — 「잘린 것이 아니라 더 있다」를 시각으로 말한다. 초판은 하드 절단이라
                넘친 칩(1280 에서 3번)이 존재조차 보이지 않았다. */}
            {chipOverflow.start ? (
              <>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-9 bg-gradient-to-r from-white via-white/85 to-transparent"
                />
                <button
                  type="button"
                  onClick={() => scrollChips(-1)}
                  aria-label="이전 학습지 보기"
                  title="이전 학습지 보기"
                  className="absolute top-1/2 left-0.5 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-600"
                >
                  <ChevronLeft className="size-3" aria-hidden="true" />
                </button>
              </>
            ) : null}
            {chipOverflow.end ? (
              <>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-9 bg-gradient-to-l from-white via-white/85 to-transparent"
                />
                <button
                  type="button"
                  onClick={() => scrollChips(1)}
                  aria-label="다음 학습지 보기"
                  title="다음 학습지 보기"
                  className="absolute top-1/2 right-0.5 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-600"
                >
                  <ChevronRight className="size-3" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 배너 — 드롭·조회 실패(문서·문항 두 축). 나머지는 계속 그린다(부분 성공 우선).
          「상한 초과」 조각은 E22-0 3번으로 소멸했다. */}
      {banner ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-amber-100 bg-amber-50/70 px-2.5 py-1">
          <AlertTriangle className="size-3 shrink-0 text-amber-600" aria-hidden="true" />
          <span
            title={banner}
            className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-amber-800"
          >
            {banner}
          </span>
          {droppedInPick.length > 0 || fetchError || questionsError ? (
            <button
              type="button"
              onClick={retryAll}
              className="shrink-0 cursor-pointer rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 transition-colors hover:bg-amber-100"
            >
              다시 시도
            </button>
          ) : null}
        </div>
      ) : null}

      {/* [E22/U9-7] 소프트 경고 — **막지 않는다.** 실패 배너(amber)와 색·아이콘을 갈라
          「이건 고장이 아니라 정보」임을 시각으로 먼저 말한다. 버튼도 재시도도 없다. */}
      {heavyNotice ? (
        <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-2.5 py-1">
          <p
            title={`${heavyNotice}. 조판을 막지는 않습니다 — 페이지 재계산이 느리게 느껴지면 체크를 나눠서 인쇄해 보세요.`}
            className="truncate text-[10.5px] font-medium text-slate-500"
          >
            {heavyNotice}
          </p>
        </div>
      ) : null}

      {/* ── 본체 ──
          `min-h-0 flex-1` 확정 높이가 전제다 — 편집기 셸이 `h-full min-h-0 overflow-hidden`
          이라 부모가 높이를 못 주면 A4 캔버스가 페이지 전체를 밀어낸다.
          ResizeObserver 도 이 div 를 잰다(편집기가 실제로 쓰는 폭). */}
      <div ref={bodyRef} className="min-h-0 flex-1">
        {picked.size === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6">
            <p className="text-center text-[12.5px] break-keep text-slate-400">
              왼쪽 목록에서 학습지를 체크하면 여기에 조판됩니다
            </p>
            {/* [E22/U9-4] **합본은 활성 학습지 1건 이상을 요구한다**(E22-6 확정).
                편집기는 `initialReport` 로만 시드되므로 활성 문서 없이는 `ReportPages` 가
                마운트조차 되지 않는다 — 문항만 체크한 사용자에게 이 화면은 영원히 빈
                화면이고, 그 사실을 말해 주지 않으면 「체크했는데 아무것도 안 나온다」가 된다.
                순수 문항 조판을 여기로 끌어오지 않는 이유는 성능이다: 시험지 빌더의
                IntersectionObserver 페이지 가상화를 잃어 같은 51페이지가 1,311노드 →
                약 12,800노드가 된다(E22-6). 그 경로의 발사대는 **옆 [시험지 조판] 탭**의
                실행대 CTA 다.
                ⚠ 아래 자구를 손볼 때 주의(E24 §3-B): 구 자구는 「[시험지 조판]을
                쓰세요」로 **버튼 라벨**을 가리켰지만, E24 3필 개편에서 「조판실」 필이
                [학습지 조판]·[시험지 조판] 2필로 갈리면서 같은 글자가 **옆 탭 이름**이
                됐다. 버튼처럼 말하면 사용자가 이 표면 안에서 없는 버튼을 찾는다 —
                그래서 「탭으로 옮겨 가라」로 말한다. 선택(flatPicked·pickedSheets)은
                클래스 단위 상태라 탭을 옮겨도 청산되지 않는다(E24 §1③). */}
            {questionIds.length > 0 ? (
              <p className="text-center text-[11.5px] break-keep text-slate-400">
                문항 {questionIds.length}개를 체크했습니다 — 문항만 조판하려면 옆의{" "}
                <span className="font-semibold text-slate-500">[시험지 조판]</span> 탭으로
                옮겨 가세요(체크한 문항은 탭을 옮겨도 그대로 남습니다).
                여기(합본)는 학습지를 1건 이상 함께 체크해야 열립니다.
              </p>
            ) : null}
          </div>
        ) : activeDoc ? (
          <AnalysisReportEditor
            // 활성 문서 전환 = **재마운트**(E21-6 4번). undo 히스토리·줌·활성 블록이 문서마다
            // 독립이어야 하고, 편집 상태(useReducer present)는 initialReport 로만 시드되므로
            // key 교체 외에 갈아 끼울 길이 없다.
            key={activeDoc.reportId}
            passageId={activeDoc.passageId}
            initialReport={activeDoc.report}
            onSaved={handleSaved}
            onToolbarStateChange={setToolbar}
            composeDocs={composeDocs}
            // [E22/U9-3] 문항은 **읽기전용 합성분**이다. 편집기는 이 배열을 `composeActive`
            // 산식(`AnalysisReportEditor.tsx:1596`)에 합류시켜 조판 모드를 켜고,
            // `rejectComposedId`(`:346`)가 `qb-` id 의 편집·삭제·재정렬을 전면 차단한다.
            // **참조 안정성은 이쪽(호출부) 책임**이라 위 useMemo 사슬이 그 계약을 진다.
            // [E27] 꼬리 = 학습지 없는 지문의 문항 + **통합 정답표**(맨 끝 1개, 사용자 확정).
            composeQuestions={composeQuestionTail}
            // [E27] 지문 단위 인터리브의 본체 — `docKey → 그 문서 **직후**에 끼울 문항`.
            // 그룹의 **마지막 ready 문서**에 그 지문 문항 전량을 매단다(활성 문서면 "d0").
            // 미전달이면 `buildComposedView` 산출이 바이트 동일이라는 것이 additive 계약이다.
            composeQuestionsAfterDoc={composeQuestionsAfterDoc}
            // [E27] 조판 목차 데이터만 내린다 — **클릭 핸들러는 만들지 않는다.**
            // 목차 클릭 → 스크롤은 편집기가 자기 팝오버 안에서 처리하고(U5), 활성 문서
            // 전환은 끝까지 헤더 문서 칩의 책임이다(칩 = 편집 대상 전환 + dirty confirm,
            // 목차 = 이동. 두 역할을 섞으면 목차 클릭에 미저장 편집이 증발한다).
            composeOutline={composeOutline}
            // [E27 · R4] 추가 시 자동 스크롤. **nonce 원시값만** effect deps 에 넣어야 한다
            // (객체를 deps 에 그대로 넣으면 요청이 없을 때도 재측정이 돈다).
            // [E27 적대검수 — S1] 활성 문서가 바뀐 뒤에는 **null 로 내린다**. 편집기는
            // `key={activeDoc.reportId}` 로 재마운트되고 소비 effect 에 마운트 가드가
            // 없어서, 그대로 두면 이미 소비된 옛 요청이 재마운트 첫 커밋에 재발사된다
            // (문서 칩으로 B 를 눌렀는데 예전 문항 Q 로 점프 + 글로우).
            // ⚠ 이 대조를 빼지 마라 — 편집기 쪽에 마운트 가드를 다는 길은 스펙이
            //   막았다(그 가드가 R4 「새 학습지가 활성이 되어 선두로 이동」을 죽인다).
            scrollRequest={
              scrollRequest && scrollRequest.forActive === activeId
                ? scrollRequest.req
                : null
            }
            // [E23] 활동 생성 소스. **undefined 와 null 은 다른 말이다** — 기본 문서에는
            // prop 자체가 무의미하니 undefined(=미전달, 현행 바이트 동일), 파이널에는
            // 「아직 안 옴/없음 확정」이 null(편집기가 T1 강등으로 동작). 캐시 값은 지문당
            // 같은 참조가 유지되므로 이 prop 이 재측정을 유발하지 않는다.
            activitySource={
              activeDocIsFinal
                ? (activitySourceCache.get(activeDoc.passageId) ?? null)
                : undefined
            }
            embed={embed}
            // onDraftChange 는 의도적으로 미전달 — 타이핑 1글자마다 스튜디오 전역이 리렌더된다.
          />
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span className="text-[12.5px] font-medium">
                학습지를 불러오는 중입니다
              </span>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6">
            <p className="text-center text-[12.5px] break-keep text-slate-400">
              {fetchError ??
                (composeIds.length > 0
                  ? "체크한 학습지를 조판에 올리지 못했습니다."
                  : "조판할 학습지가 없습니다.")}
            </p>
            <button
              type="button"
              onClick={retry}
              className="cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
