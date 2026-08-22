"use client";

/**
 * [E21/U7 — 26-08-17] `docs/class-studio-spec.md` §3.10.21 E21-2 「편집기 additive」.
 *
 * 이 파일에 이번에 들어간 것은 **배선뿐**이다. 합성 로직은 전부 순수층(`compose/`)에 있고,
 * 여기서는 그 산출물을 캔버스·썸네일 레일에 꽂고, 임베드 격리 스위치(localStorage ns ·
 * print root id · narrow · 접힘 시드/강제)를 아래로 흘려보낸다. 손대기 전 이미 2252줄이라
 * 순증을 최소로 묶는 것이 스펙의 명시 요구다(E21-6 6번 — 파일 분할은 별건).
 *
 * 불변식(어기면 소비처 5곳이 즉시 회귀한다 — prime-analysis-view · korean-report-modal ·
 * extraction-detail-modal · dev harness · passage-analysis-modal):
 *  1) 기존 prop 6개 **무접촉**, 신규 3개(`composeDocs`/`embed`/`onRequestActiveDoc`)는 전부
 *     옵셔널이며 미전달 시 렌더 결과가 **바이트 동일**하다. 신규 값이 닿는 자리는 전부
 *     `?? 현행값` 폴백이다.
 *  2) **편집 상태 `report`(useReducer present)는 합성이 절대 건드리지 않는다.** 저장 PATCH 는
 *     끝까지 활성 문서 1개다(E21-0 — 합성은 뷰이지 문서가 아니다).
 *  3) `isMobile`(`useIsMobile()`)과 `report-edit-styles` 의 1023.98px 미디어쿼리 계열은
 *     손대지 않는다. 훅만 바꾸면 JS 판정과 CSS 판정(캐럿 핸들러가 독립 재선언)이 갈라져
 *     「크롬은 숨었는데 인라인 편집은 pointer-events:none」 반쪽 상태가 난다(E21-2 마지막 항).
 */

import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  GripVertical,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import {
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
} from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import { usePaperItemDrag } from "@/components/exams/paper-builder/components/a4-paper-page-parts/use-paper-item-drag";
import { cn } from "@/lib/utils";
import {
  type ActivityBlock,
  type ActivityKind,
  type AnalysisReport,
  type AnalysisSection,
  type BlockMeta,
  type CustomBlock,
  isFinalOnepageReportShape,
  type ReportCover,
  type ReportMeta,
  type VocabTestLayout,
  type VocabTestMode,
  type VocabularyTier,
} from "@/lib/passage-report/analysis-report/schema";
import {
  worksheetAnswersAreHidden,
  worksheetClozeTranslationsAreHidden,
} from "@/lib/passage-report/analysis-report/worksheet-surface";
import { isKoAnalysisReportShape } from "@/lib/passage-report/analysis-report/ko-report-detect";
import { notifyCreditsChanged } from "@/lib/credits-client";

import {
  enumerateItems,
  isActivityAnswerId,
  orderIdOf,
  type ItemDescriptor,
  type DropPlacement,
  type ReportEdit,
} from "./report-pages";
import { reportFlowItems, reportOutline, reportSectionSlots, type FlowItem } from "./report-sections";
// describeItems(=FlowItem[] → ItemDescriptor[]) 와 SectionFlowCache 는 배럴이 아니라
// 정의 파일에서 직접 가져온다 — 같은 웨이브에서 신설되는 계약 API 라 배럴 갱신 여부와
// 무관하게 컴파일되도록 경로를 고정한다(배럴은 여전히 기존 심볼만 재수출).
// [E27] `editIdOf` 도 같은 파일에서 직접 가져온다 — 배럴(`report-pages/index.ts:4`)이
// `orderIdOf` 만 재수출하고 `editIdOf` 는 내보내지 않는다. 조판 목차의 「문서 앵커 해석」
// (`firstBlockIdOfDoc`)이 `editId ?? id` 폴백을 그대로 써야 `data-paper-item-id`
// (`report-pages/items.ts:150` 이 `editIdOf(it)` 로 박는 값)와 정확히 같은 문자열이 된다.
import { describeItems, editIdOf } from "./report-pages/items";
import { SectionFlowCache } from "./report-sections/flow-cache";
// E21 합성층 — 순수 함수만 가져온다(JSX·상태 없음). 같은 웨이브 신설이라 바로 위 :82-85 와
// 같은 이유로 배럴을 거치지 않고 정의 파일을 직접 가리킨다.
import { ACTIVE_DOC_KEY, buildComposedView, type ComposeDoc } from "./compose/compose-flow";
import { isComposedNsId, isValidDocKey } from "./compose/compose-ids";
// E22 합본 — 문항 id 판정(순수 문자열, 런타임 의존 0). 위 :88-90 과 같은 이유로 배럴을 거치지 않는다.
import { isComposedQuestionId } from "./compose/question-ids";
// E27 조판 목차·스크롤 채널 — **순수 타입만**(런타임 import 0). 조판 표면·편집기·목차 팝오버
// 세 파일이 서로를 import 하지 않고 같은 모양을 공유하기 위한 계약 파일이다.
import type {
  ComposeOutlineEntry,
  ComposeOutlineGroup,
  ComposeScrollRequest,
} from "./compose/outline-types";
// E23 — sourceHasVocab 판정용 기본 출제 술어(vocabulary-flow.tsx:104 가 쓰는 것과 동일).
// 배럴(index.ts)이 재수출하지 않는 심볼이라 정의 파일에서 직접 가져온다(위 :82-93 관용구).
import { isDefaultVocabularyTestTarget } from "./report-sections/vocabulary";
import {
  applyBlockOrder,
  blankExamRow,
  blankGrammarRow,
  blankVocabRow,
  deleteCustomBlock,
  deleteItem,
  deleteSection,
  hideOrDeleteIds,
  injectVocabTestSection,
  moveIdBy,
  newCustomBlockId,
  removeInjectedVocabSection,
  reorderIds,
  setBlockMeta,
  setTableColWidths,
  setCustomBlock,
  setMeta,
  setSection,
  setVocabularyStudyLayout,
  setVocabularyTestLayout,
  setVocabularyTestMode,
  setVocabularyTierFilter,
  setVocabularyTestOnly,
  toggleHiddenSection,
  toggleTableCol,
} from "./editor-mutations";
import { ANALYSIS_REPORT_EDIT_CSS } from "./report-edit-styles";
import { ActivityToggleSwitch } from "./activity-palette-modal";
import { type WebtoonPick } from "./webtoon-picker-modal";
import type { ActivityAction } from "./custom-activity-renders";
import {
  activityAvailabilityByKind,
  activityBlockLabel,
  appliedActivityParams,
  appliedActivitySentences,
  applyManualBlankToBlock,
  extractGenContext,
  insertIntoWordBank,
  makeActivityBlock,
  rerolledActivityBlock,
} from "@/lib/passage-report/analysis-report/study-activities";
import { reportHistoryReducer } from "./editor-history";
import { downscaleImage } from "./image-utils";
import { usePanelWidths } from "./use-panel-widths";
import { EditorTopBar } from "./editor-top-bar";
import { PageThumbnailRail } from "./page-thumbnail-rail";
import { EditorCanvas } from "./editor-canvas";
import { ActivityPaletteRail } from "./activity-palette-rail";
import {
  addSavedReportSettings,
  COVER_DEFAULTS,
  deleteSavedReportSettings,
  getDefaultReportSettings,
  hasAppliedDefaultFor,
  markAppliedDefaultFor,
  persistAppliedReportSettings,
  SPACER_MIN_MM,
  type SavedReportSettings,
} from "./editor-storage";
import { FloatingFormatToolbar } from "./floating-format-toolbar";
import { MobilePanelSheet, MobileReportActionBar } from "./mobile-editor-chrome";
import { PropertiesPanel } from "./properties-panel";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { SettingsTemplatePopover } from "./cover-logo-panels";
import { SectionOutlinePopover, type OutlineCustomEntry } from "./section-outline-popover";
import { ReportSaveAsDialog } from "./save-as-dialog";

const REPORT_A4_WIDTH_PX = Math.round((210 * 96) / 25.4);
const REPORT_A4_HEIGHT_PX = Math.round((297 * 96) / 25.4);
// 편집 모드는 페이지 컨트롤(이동/삭제)이 페이지 사이에 들어가므로 간격을 넓게.
// report-edit-styles 의 `.par-sheet-wrap { margin-bottom }` / `.par-root-edit { padding-top }`
// 값과 반드시 일치해야 스크롤 높이가 어긋나지 않는다.
const REPORT_EDIT_PAGE_GAP_PX = Math.round((18 * 96) / 25.4);
const REPORT_EDIT_TOP_INSET_PX = Math.round((18 * 96) / 25.4);
const LOGO_FILE_MAX_BYTES = 1.5 * 1024 * 1024;
// fit(자동 맞춤) 배율 하한 — 좁은 모바일 캔버스에서도 한 페이지가 폭을 채우도록
// 수동 줌 하한(PREVIEW_ZOOM_MIN=0.5)보다 낮게 둔다. 데스크톱은 캔버스가 넓어
// fit 값이 늘 1로 수렴하므로 이 하한은 사실상 모바일에서만 작동한다.
const FIT_ZOOM_MIN = 0.2;
/**
 * usePaperItemDrag 에 넘기는 미사용 세터(드롭 인디케이터 partKey — 이 편집기는 쓰지 않는다).
 * 인라인 화살표로 두면 매 렌더 새 함수가 되어 startDrag 정체성을 흔든다.
 */
const NOOP = () => {};
/**
 * [E22/U5] `composeQuestions` 미전달 시의 **모듈 상수 빈 배열**.
 *
 * 인라인 `?? []` 로 두면 매 렌더 새 배열이 되어 `composed`(:1689)·`composedThumb`(:1738)
 * 두 useMemo 의 의존성이 항상 바뀐다 → 합성이 매 렌더 재실행되고 `buildComposedView` 가
 * 새 `flowItems` 배열을 돌려주므로 `ReportPages` 의 메모(`report-pages/pages.tsx:47-56`)가
 * 전부 무효화되어 **문서 전체 재측정**이 돈다. U4 가 보고한 「questions 배열의 참조 안정성은
 * 호출부 책임」이 정확히 이 지점이다.
 */
const EMPTY_QUESTION_ITEMS: FlowItem[] = [];
/**
 * [E27/U5] `composeQuestionsAfterDoc` 미전달 시의 **모듈 상수 빈 Map**. 이유는 바로 위
 * `EMPTY_QUESTION_ITEMS` 와 한 글자도 다르지 않다 — 인라인 `?? new Map()` 은 매 렌더 새 참조라
 * `composed`/`composedThumb` 두 useMemo 가 항상 재실행되고, 새 `flowItems` 배열이 나와
 * `ReportPages` 메모가 전부 깨져 문서 전체 재측정(실측 489ms)이 돈다.
 * ⚠ **절대 여기에 값을 넣지 마라** — 공유 상수라 한 편집기 인스턴스가 오염시키면 전부가 오염된다.
 */
const EMPTY_QUESTIONS_AFTER_DOC: ReadonlyMap<string, FlowItem[]> = new Map();
/** [E27/U5] 합성 스트림 미러 ref 의 초기값. 같은 이유로 모듈 상수(매 렌더 새 배열 금지). */
const EMPTY_FLOW_ITEMS: FlowItem[] = [];

/**
 * [E27 · §3.10.26 R3-2] 조판 점프 글로우의 클래스명.
 *
 * `report-edit-styles.ts:163-191` 의 `.par-root-edit .par-jump-glow` 규칙과 **문자열이
 * 정확히 일치**해야 한다. 그 규칙은 `outline` / `box-shadow` 두 속성으로만 그린다 — 편집 시트의
 * `@media print` 리셋(`report-edit-styles.ts:315-330`)이 끄는 것이 정확히 그 둘 + `animation`
 * 이라, `background`/`filter`/`::after` 로 그리면 A4 인쇄물에 파란 테두리가 그대로 남는다.
 *
 * ⚠ `src/lib/hint-glow.ts` 의 `triggerHintGlow` 를 **그대로 쓰지 마라**. 그 함수가 붙이는
 * `smoat-hint-glow` 는 위 print 리셋 목록에 없어 인쇄물에 남고, 게다가 스스로
 * `scrollIntoView` 를 호출해 이 파일이 소유한 스크롤러 기반 좌표 계산과 이중으로 싸운다.
 * 여기서는 그 **패턴만**(remove → 리플로우 강제 → add → animationend 자가 해제) 복제한다.
 */
const JUMP_GLOW_CLASS = "par-jump-glow";
/**
 * 글로우 강제 해제 백스톱(ms). 애니메이션 길이(1.6s)보다 넉넉히 길다.
 *
 * 왜 필요한가: `report-edit-styles.ts:177-191` 의 `@media (prefers-reduced-motion: reduce)`
 * 분기가 `animation: none` 으로 정적 outline 만 남기는데, 그러면 `animationend`/`animationcancel`
 * 이 **한 번도 발화하지 않아** 클래스가 영구히 붙는다(= 파란 테두리가 안 꺼진다).
 * 이 타이머가 그 경로의 유일한 해제자다.
 */
const JUMP_GLOW_BACKSTOP_MS = 2600;
/**
 * 점프 대상 노드 탐색 재시도 상한/간격.
 *
 * **시간 상수를 늘리는 대신 재시도한다.** 근거: `report-pages/pages.tsx:86,107` 이 재페이지네이션
 * 직전 scrollTop 을 저장했다가 `:152-155` 가 pages 확정 직후 useLayoutEffect 로 **되돌려 놓는다**.
 * 그 복원보다 먼저 쏘면 아무 일도 안 일어난 것처럼 보인다. 기존 `scrollToBlock` 의 160ms
 * 매직넘버(:1129)는 **단일 문서** 경험칙이라 조판(문서 N + 문항 M)에서는 모자란다.
 * 재시도 루프는 노드가 실제 `.par-sheet` 에 박힌 프레임(= 복원 이후)에 반드시 걸린다.
 * (측정 클론에는 `data-paper-item-id` 가 없다 — `report-pages/items.ts:145` 가 measure 면
 *  빈 객체를 돌려주므로, 노드를 찾았다는 것 자체가 "실제 페이지에 배치됐다"의 증거다.)
 */
const JUMP_RETRY_MAX = 20;
const JUMP_RETRY_GAP_MS = 50;

/**
 * [E27/U5] 글로우 세대 추적 — 같은 요소를 연속 점프해도 앞 요청의 해제자가 뒤 요청을 끄지 않게 한다.
 *
 * `detach` 는 **직전 요청이 걸어 둔 해제자 일습**(`animationstart`/`animationend`/
 * `animationcancel` 리스너 3개 + 백스톱 타이머)을 떼는 함수다. 세대(`gen`) 비교만으로,
 * 그리고 이 선(先)해제만으로 왜 둘 다 부족한지는 `glowOnce` 머리주석의 실측 문단.
 * 요청 하나당 정확히 하나만 살아 있어야 하므로, 새 요청 초입과 언마운트(`releaseGlow`)에서
 * 반드시 호출하고 `undefined` 로 비운다.
 */
type JumpGlowState = { gen: number; el: HTMLElement | null; detach?: () => void };

/**
 * [E27 · R3-2] **찾은 요소 1개에만** 1회성 글로우를 입힌다.
 *
 * ⚠ 전량 부착 금지: 문항 조각은 **전부 같은 `editId`**(`qb-{questionId}` —
 * `compose/question-flow.tsx:402-403`)를 공유해 `data-paper-item-id` 가 동일하다.
 * `querySelectorAll` 로 전부 켜면 그 문항이 걸친 페이지 3~4장이 한꺼번에 발광한다.
 *
 * ── 같은 항목을 1.6초 안에 재클릭할 때의 함정(E27 적대검수 확정 결함) ────────────────
 * `classList.remove` 로 진행 중인 애니메이션을 끊으면 `animationcancel` 이 **비동기로** 뒤늦게
 * 도착한다. 그 사이 이미 새 글로우를 붙였으므로, 방어가 없으면 그 취소 이벤트가 **새 해제자**를
 * 깨워 새 글로우를 즉시 꺼 버린다(= 같은 항목 연속 클릭이 무반응으로 보인다).
 *
 * ⚠ **세대(`gen`) 비교로도, 옛 리스너 선(先)해제로도 못 막는다.** 둘 다 「옛 해제자」만 막는데,
 * 실제로 글로우를 끄는 것은 **새 해제자가 받는 옛 이벤트**이기 때문이다. Chromium 실측(E27/F2
 * 하네스): 옛 리스너를 `classList.remove` **전에** 전부 떼어도 취소 이벤트는 그 뒤 등록된 새
 * 리스너에 그대로 배달된다(`animationcancel@318ms` → `animationstart@334ms`, 16ms 간격).
 * 이벤트는 *등록 시점*이 아니라 *배달 시점*의 리스너 집합으로 간다.
 *
 * 그래서 방어가 3중이다:
 *  ① `state.detach` — 옛 세대의 리스너·타이머를 **물리적으로** 떼어 누수와 옛 해제자를 없앤다.
 *  ② `started` 배리어 — **자기 `animationstart` 가 오기 전에 도착한 end/cancel 은 남의 것**이라
 *     무시한다. 위 실측대로 옛 취소는 언제나 새 시작보다 먼저 오고(같은 프레임 큐 순서),
 *     새 애니메이션의 종료는 1.6초 뒤라 마진이 100배다. **이 배리어가 실제 수정 본체다.**
 *  ③ `state.gen` 비교 — 백스톱과 이벤트가 겹쳐 두 번 들어오는 경우의 최종 방어.
 * ⚠ 백스톱은 ② 를 **통과시키면 안 된다**(`finish` 를 직접 부른다). 모션 축소 분기는
 * `animationstart` 가 아예 없어서, 배리어에 걸리면 파란 테두리가 영구히 남는다.
 */
function glowOnce(el: HTMLElement, state: JumpGlowState): void {
  const gen = ++state.gen;
  // ① 옛 세대의 리스너 3개 + 백스톱 타이머를 **클래스에 손대기 전에** 떼어낸다.
  //    이것만으로는 재클릭 결함이 안 고쳐진다(옛 이벤트는 새 리스너로 간다 — 머리주석 실측).
  //    그래도 필수다: 없으면 죽은 세대의 리스너가 노드에 누적되고 백스톱이 2.6초 떠다닌다.
  state.detach?.();
  state.detach = undefined;
  // 직전 대상이 다른 요소면 먼저 꺼 둔다 — 두 곳이 동시에 빛나면 "어디로 갔는지"가 흐려진다.
  // (그 노드의 리스너는 위 ① 에서 이미 떨어졌으므로 여기가 그 글로우의 유일한 해제 지점이다.
  //  ⚠ 이 줄을 지우면 앞 대상이 켜진 채로 남는다 — ① 이 그 노드의 자가 해제를 없앴기 때문이다.)
  if (state.el && state.el !== el) state.el.classList.remove(JUMP_GLOW_CLASS);
  state.el = el;
  el.classList.remove(JUMP_GLOW_CLASS);
  // 리플로우 강제 — 같은 요소를 연속으로 눌러도 애니메이션이 매번 재시작되게(hint-glow.ts 패턴).
  void el.offsetWidth;
  el.classList.add(JUMP_GLOW_CLASS);
  let backstop = 0;
  /** ② 배리어 — **내 애니메이션이 실제로 시작했는가.** false 인 동안 오는 end/cancel 은 남의 것. */
  let started = false;
  // 아래 세 클로저는 서로를 앞서 참조하지만 **호출은 언제나 전부 초기화된 뒤**(이벤트·타이머·
  // 다음 요청)라 TDZ 에 걸리지 않는다 — 클로저 안의 전방 참조는 합법이다.
  const detach = () => {
    el.removeEventListener("animationstart", onStart);
    el.removeEventListener("animationend", onTerminal);
    el.removeEventListener("animationcancel", onTerminal);
    window.clearTimeout(backstop);
    // 자기 것일 때만 비운다 — 더 새 요청이 이미 자기 detach 를 심었으면 그것을 죽이면 안 된다.
    if (state.detach === detach) state.detach = undefined;
  };
  const finish = () => {
    // 리스너·타이머는 세대와 무관하게 **항상** 자기 것을 정리한다(같은 노드에 누적되면 누수).
    detach();
    // ③ 백스톱과 이벤트가 겹쳐 두 번 들어와도 자기 세대가 아니면 클래스에 손대지 않는다.
    if (state.gen !== gen) return;
    el.classList.remove(JUMP_GLOW_CLASS);
    if (state.el === el) state.el = null;
  };
  const onStart = () => {
    started = true;
  };
  const onTerminal = () => {
    // ★ 여기가 수정 본체다. 이 한 줄을 지우면 「같은 항목 재클릭 = 글로우 무반응」이 부활한다.
    if (!started) return;
    finish();
  };
  el.addEventListener("animationstart", onStart);
  el.addEventListener("animationend", onTerminal);
  el.addEventListener("animationcancel", onTerminal);
  // ⚠ 백스톱은 `onTerminal` 이 아니라 `finish` 를 부른다 — 모션 축소 분기
  // (`report-edit-styles.ts:176-191` `animation: none`)에는 `animationstart` 가 없어서
  // 배리어를 태우면 클래스가 영구히 남는다(= 인쇄물 밖 화면에 파란 테두리 고착).
  backstop = window.setTimeout(finish, JUMP_GLOW_BACKSTOP_MS);
  state.detach = detach;
}

/**
 * [E27/U5] 진행 중인 글로우를 **완전히** 해제한다 — 언마운트 정리 전용.
 *
 * 왜 필요한가: `glowOnce` 의 자가 해제는 `animationend`(1.6초) 또는 백스톱(2.6초)에 달려 있는데,
 * 조판은 활성 문서 전환이 곧 **재마운트**(표면 `key={activeDoc.reportId}` 교체)라 글로우 도중에
 * 편집기가 사라지는 일이 일상이다. 정리하지 않으면 떨어져 나간 노드에 리스너 3개와 타이머 1개가
 * 최대 2.6초 매달린 채 남는다. 클래스 제거는 노드가 어차피 버려지므로 형식적이지만, 같은 노드가
 * 재사용되는 경우까지 덮으려고 함께 한다.
 *
 * `gen` 을 한 칸 올리는 것은 이중 방어다 — `detach` 가 이미 배달 경로를 끊었으므로 없어도 되지만,
 * 이미 큐에 들어간 이벤트가 있어도 세대 불일치로 무해해진다.
 */
function releaseGlow(state: JumpGlowState): void {
  state.gen++;
  state.detach?.();
  state.detach = undefined;
  if (state.el) {
    state.el.classList.remove(JUMP_GLOW_CLASS);
    state.el = null;
  }
}

/**
 * [E27 · R3-2] `docKey` → 그 문서의 **첫 아이템 editId**. `null` docKey = 활성(편집 중) 문서.
 *
 * 왜 편집기가 이걸 소유하는가: 조판 표면은 부착 문서의 `docKey` 는 알지만 그 문서의 **첫 블록
 * id** 는 모른다(블록 id 는 합성 시점에 `compose-ids.ts` 가 접미해 만든다). 문항은 반대로
 * 표면이 `qb-{questionId}` 를 순수 문자열로 정확히 계산할 수 있어 `kind:"block"` 으로 바로 온다.
 *
 * 판정 근거(둘 다 코드 확인):
 *  · 부착 문서 — `nsFlowItem`(`compose/compose-ids.ts:79-84`)이 `id`/`editId`/`orderId` 3필드를
 *    전부 `__{docKey}` 로 접미하므로 `endsWith` 가 정확하다.
 *  · 활성 문서 — `compose-flow.ts:215-249` 는 활성 **본문** 아이템을 접미하지 **않는다**
 *    (편집 계약이 원본 id 를 쓴다). 접미되는 것은 활동 정답 페이지 아이템(`__d0`)뿐이고
 *    그것은 문서 끝이라 첫 아이템이 될 수 없다. 그래서 「`__` 없고 `qb-` 로 시작하지도 않는
 *    첫 아이템」이 곧 활성 문서의 머리다.
 *
 * `isComposedNsId`/`isComposedQuestionId` 를 쓰는 이유는 문자열 리터럴 이중 진실원을 만들지
 * 않기 위해서다(두 판정이 각각 `__` 와 `qb-` 의 정본이다).
 */
function firstBlockIdOfDoc(items: FlowItem[], docKey: string | null): string | null {
  if (docKey === null) {
    for (const it of items) {
      const id = editIdOf(it);
      if (!isComposedNsId(id) && !isComposedQuestionId(id)) return id;
    }
    return null;
  }
  const suffix = `__${docKey}`;
  for (const it of items) {
    const id = editIdOf(it);
    if (id.endsWith(suffix)) return id;
  }
  return null;
}

/**
 * [E23] 활동 생성에 쓸 리포트 해석 — **활동 생성 소스는 "지문"이지 "문서"가 아니다.**
 * 파이널 원페이지 문서면 같은 지문의 기본 리포트(activitySource)가 생성 소스가 되고,
 * 소스가 없으면(T1 강등) 파이널 자신이 그대로 소스가 된다(extractGenContext 의
 * final-onepage 폴백 — en 전용, ko 의존 활동은 availability 가 카드 단계에서 막는다).
 * setReport updater 안에서는 반드시 updater 의 r 과 activitySourceRef 로 호출한다 —
 * 렌더 스코프의 report/activitySource 캡처는 stale 참조다.
 */
function resolveActivityGenReport(
  report: AnalysisReport,
  source: AnalysisReport | null | undefined,
): AnalysisReport {
  return isFinalOnepageReportShape(report) && source ? source : report;
}

export type ReportEditorToolbarState = {
  dirty: boolean;
  saving: boolean;
  save: () => void;
  // 실전 학습지(워크북+수능추론) 옵트인 생성 — 저장 버튼 옆(모달 헤더)에서 렌더.
  // 이미 콘텐츠가 있으면(hasWorksheet) 생성 버튼은 숨긴다.
  worksheetBusy: boolean;
  worksheetHasContent: boolean;
  /** 실전 학습지 생성을 지원하는 문서인지 — KO·파이널 원페이지 문서는 false.
      호스트는 구 상태(undefined)와의 호환을 위해 `!== false` 로 판정한다. */
  worksheetSupported: boolean;
  generateWorksheet: () => void;
  /** '다른 이름으로 저장' 다이얼로그 열기. 다이얼로그 자체는 편집기가 소유한다(호스트마다 복제 금지). */
  requestSaveAs: () => void;
  /** 사본 저장 진행 중. 저장 버튼의 스피너·비활성 판정에 쓴다. */
  savingAs: boolean;
};

/** 편집기를 다른 표면에 **임베드**할 때만 쓰는 격리 스위치 묶음(§3.10.21 E21-3·E21-4). */
export interface AnalysisReportEditorEmbed {
  /** localStorage 네임스페이스(예: `"sheetCompose"`). 폭 3키·defaultApplied 키가 갈라진다.
      미전달 = 현행 전역 키(독립 라우트 경로). */
  storageNamespace?: string;
  /** 세 레일의 **초기** 접힘값만 시드한다 — 이후 사용자 토글은 자유. */
  initialCollapsed?: { activity?: boolean; pages?: boolean; panel?: boolean };
  /** 컨테이너 폭에 따른 **표시 강제**(E21-4 접힘 사다리). 값이 주어진 축은 그 값이 이기고,
      내부 state 는 그대로 보존된다 → 컨테이너가 다시 넓어지면 사용자가 열어 둔 상태로 복귀.
      편집기의 `isMobile` 은 100% 뷰포트 기준이라 컨테이너가 아무리 좁아도 스스로는 접히지
      않는다 — 그래서 접기 판정은 컨테이너를 재는 표면(호스트) 몫이고 여기는 통로만 연다. */
  forceCollapsed?: { activity?: boolean; pages?: boolean; panel?: boolean };
  /** 셸 루트에 `data-embed-narrow` 를 심는다. `report-edit-styles` 의 `.are-shell[data-embed-narrow]`
      스코프 규칙이 뷰포트 기준 `sm:` 유틸(툴바 장문 라벨)을 컨테이너 기준으로 되돌린다. */
  narrow?: boolean;
  /** 캔버스 루트 DOM id. 미전달 = 현행 `"exam-paper-print-root"`. 시험지 조판이 숨김 마운트로
      상시 보존되므로 임베드는 반드시 다른 id 를 줘야 오토스크롤이 남의 캔버스를 잡지 않는다. */
  printRootId?: string;
  /** 인쇄 대상에서 제외(par-root 2개 공존 시 백지 방지). */
  printExclude?: boolean;
}

interface Props {
  passageId: string;
  initialReport: AnalysisReport;
  onDraftChange?: (report: AnalysisReport, state: { dirty: boolean }) => void;
  onSaved?: (report: AnalysisReport) => void;
  onExit?: () => void;
  /** 저장 버튼을 바깥(모달 헤더)에서 렌더할 수 있게 저장 상태/함수를 끌어올린다. */
  onToolbarStateChange?: (state: ReportEditorToolbarState | null) => void;
  /** E23 — 파이널 원페이지 문서의 **활동 생성 소스 폴백**: 같은 지문의 기본 리포트.
      활동 생성 소스는 "지문"이지 "문서"가 아니다 — 파이널 문서는 sections 가 final-onepage
      하나뿐이라 학습 활동·단어 시험지의 원천 데이터가 없고, 이 소스가 그 자리를 채운다.
      미전달(또는 null)이면: 기본 문서는 현행 렌더와 바이트 동일(I1), 파이널 문서는 T1 강등
      (en-계 활동만 availability 로 열림). */
  activitySource?: AnalysisReport | null;
  /** E21 — 활성 문서 **뒤에 이어 붙일 읽기전용 문서**들(배열 순서 = 조판 순서).
      미전달/빈 배열이면 합성 자체를 하지 않고 기존 단일 문서 경로가 그대로 돈다. */
  composeDocs?: ComposeDoc[];
  /** E22(§3.10.22 E22-0 1번) — 활성 학습지 **뒤에 이어 붙일 시험지 문항**의 읽기전용 FlowItem[].
      배열 순서 = 인쇄 순서. **문항은 문서에 저장되지 않는 합성분**이다: 리포트 스키마가 문항을
      담을 수 없고(`schema.ts:660` questions.max(8) · `:331-341` no≤12·choices 2~6 ·
      `:799-812` activityKind 닫힌 enum · `:815-826` activityItem 에 선지 필드 없음), 저장 PATCH 는
      끝까지 활성 문서 1개다(E21-0). 그래서 아래 `rejectComposedId` 가 `qb-` id 편집을 전면 차단한다.

      **미전달(또는 빈 배열)이면 기존 경로가 바이트 동일**이다 — `composeQuestionItems` 가 모듈
      상수 빈 배열로 폴백해 `composeActive` 산식이 `composeCompanions.length > 0` 과 동치가 되고,
      `buildComposedView` 는 옵셔널 필드 미전달로 U4 이전과 같은 산출물을 돌려준다.
      **참조 안정성은 호출부 책임**(매 렌더 새 배열이면 문서 전체가 재측정된다 — :175-184 참조). */
  composeQuestions?: FlowItem[];
  /** E27(§3.10.26 R1) — `docKey → 그 문서 아이템 **직후**에 끼워 넣을 문항 FlowItem[]`.
      활성 문서는 `ACTIVE_DOC_KEY`("d0") 키를 쓴다. 위 `composeQuestions`(꼬리 = 정답표 ·
      학습지 없는 지문의 문항)와 **함께** 쓰이며 서로를 대체하지 않는다.

      왜 두 축인가: E22 까지 문항은 언제나 스트림 맨 끝이라, 같은 지문에 학습지를 여러 장 올리면
      「지문1 학습지 → 지문2 학습지 → 문제 전부」가 되어 지문1 문제를 풀려면 지문2 학습지를
      넘겨야 했다. E27 은 인쇄 묶음을 지문 단위로 자른다 — `[지문1 학습지들][지문1 문제들]…`.

      **미전달(또는 빈 Map)이면 기존 경로가 바이트 동일**이다 — 모듈 상수
      `EMPTY_QUESTIONS_AFTER_DOC` 로 폴백해 `composeActive` 산식이 E22 와 동치가 되고,
      `buildComposedView` 는 옵셔널 필드 미전달로 같은 산출물을 돌려준다.
      **참조 안정성은 호출부 책임**(매 렌더 새 Map 이면 문서 전체가 재측정된다 — :203-210 참조). */
  composeQuestionsAfterDoc?: ReadonlyMap<string, FlowItem[]>;
  /** E27(R3-1) — 상단바 **기존 「목차」 팝오버**가 흡수하는 조판 트리. 버튼 증설 0이 사용자 확정이다.
      미전달/빈 배열이면 팝오버는 조판 블록을 렌더하지 않아 기존과 픽셀 동일하다.
      배열 순서 = 인쇄 순서(표면이 `pickedSheets`/`flatPicked` Map 삽입 순서로 확정한 그대로). */
  composeOutline?: ComposeOutlineGroup[];
  /** E27(R3-2) — 표면 → 편집기 **스크롤 + 1회 글로우** 요청. `activeId` 는 건드리지 않는다.
      `nonce` 원시값만 effect deps 에 들어간다(객체를 deps 에 넣으면 요청이 없을 때도 재측정). */
  scrollRequest?: ComposeScrollRequest | null;
  /** E21 — 임베드 격리 옵션. 미전달이면 독립 라우트 동작 그대로. */
  embed?: AnalysisReportEditorEmbed;
  /** E21 — 활성 문서 전환 요청 채널. **편집기는 v1 에서 이걸 발화하지 않는다**(헤더 문서 칩은
      표면이 소유한다 — E21-5 "저장·인쇄 버튼은 표면 헤더가 직접 렌더"). 계약에 미리 뚫어 두는
      이유는, 나중에 캔버스/레일에서 부착 문서를 클릭해 전환하는 경로가 생겨도 **prop 모양이
      바뀌지 않게** 하기 위해서다(소비처 5곳 재검증을 두 번 하지 않는다). */
  onRequestActiveDoc?: (docKey: string) => void;
}

export type { ComposeDoc };

export function AnalysisReportEditor({
  passageId,
  initialReport,
  onDraftChange,
  onSaved,
  onExit,
  onToolbarStateChange,
  activitySource,
  composeDocs,
  composeQuestions,
  composeQuestionsAfterDoc,
  composeOutline,
  scrollRequest,
  embed,
}: Props) {
  const [history, dispatchReport] = useReducer(reportHistoryReducer, {
    present: initialReport,
    past: [],
    future: [],
  });
  const report = history.present;
  const setReport = useCallback(
    (updater: SetStateAction<AnalysisReport>, options?: { record?: boolean }) => {
      dispatchReport({ type: "set", updater, record: options?.record });
    },
    [],
  );
  const [baseline, setBaseline] = useState<AnalysisReport>(initialReport);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 토글/삽입/삭제 후 미리보기를 해당 블록으로 스크롤하기 위한 참조들.
  // (정의 순서상 뒤에 오는 scrollToBlock/orderedIds 를 앞쪽 핸들러에서 쓰기 위해 ref 경유)
  const scrollToBlockRef = useRef<(id: string) => void>(() => {});
  const orderedIdsRef = useRef<string[]>([]);
  // 편집 패널 배타 펼침(openPropertiesPanelExclusive)도 같은 이유로 ref 경유 —
  // 정의가 exclusiveOpen(뒤쪽) 이후에만 가능해서 앞쪽 insertActivity 가 직접 못 잡는다(TDZ).
  const openPropertiesPanelExclusiveRef = useRef<() => void>(() => {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 06 실전 학습지(워크북+수능추론) 옵트인 생성 진행 상태.
  const [worksheetBusy, setWorksheetBusy] = useState(false);
  // '다른 이름으로 저장' — 이름 입력 다이얼로그 개폐 + 사본 저장 진행 상태.
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [savingAs, setSavingAs] = useState(false);
  // 사본 저장은 서버가 새 지문·보고서 행을 만든다 — 목록을 다시 읽어야 새 학습지가 보인다.
  const router = useRouter();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<DropPlacement>("before");

  const dirty = report !== baseline;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  // ── PRIME_KO 게이트 ── 국어 학습지 보고서에는 영어 파생 도구(학습 활동 팔레트·
  // 단어 시험지·실전 학습지 생성)를 노출하지 않는다. 전부 영어 섹션(parsing/
  // vocabulary/learning-worksheet) 위에서만 동작하는 영어 전용 파이프라인이다.
  // 웹툰 삽입(과목 중립 — 서버가 지문 subject 로 프롬프트를 게이트)은 유지한다.
  const koReport = useMemo(() => isKoAnalysisReportShape(report), [report]);
  // ── 파이널 원페이지 판별 ── E23 이후 이 플래그가 여전히 게이트하는 것은 **문서 재생성
  // 축**(실전 학습지 생성 — worksheetSupported/showGenerateWorksheet)뿐이다. 학습 활동·
  // 단어 시험지·웹툰 팔레트는 파이널에서도 상시 노출되며, 생성 소스는 아래 activityGenReport
  // (같은 지문의 기본 리포트 폴백)로 해석한다.
  // 저장 PATCH URL 은 무변경 — 서버가 report 모양을 자기감지해 PRIME_FINAL 행에 저장한다.
  const finalOnepage = useMemo(() => isFinalOnepageReportShape(report), [report]);

  // ── E23 활동 생성 소스 해석 ── 팔레트·활동 생성 헬퍼가 읽는 genReport 와 가용성 맵.
  // activitySource 는 setReport updater 안에서도 읽어야 하므로 ref 미러로 둔다(렌더 캡처 금지).
  const activitySourceRef = useRef<AnalysisReport | null>(null);
  activitySourceRef.current = activitySource ?? null;
  const activityGenReport = useMemo(
    () => resolveActivityGenReport(report, activitySource),
    [report, activitySource],
  );
  // 카드 활성/비활성은 실데이터 판정(문서 종류 스위치 금지) — ok:false 카드가 1차 차단이고,
  // insertActivity 초입 가드가 2차 방어다(빈 활동 블록 삽입 경로 0 — I5).
  const activityAvailability = useMemo(() => activityAvailabilityByKind(activityGenReport), [activityGenReport]);
  // insertActivity(영구 안정 콜백)가 읽는 미러 — 의존성에 넣으면 팔레트로 내려가는 콜백
  // 정체성이 편집마다 흔들린다.
  const activityAvailabilityRef = useRef(activityAvailability);
  activityAvailabilityRef.current = activityAvailability;
  // 설정 패널의 활동 문장 범위 UI 근거 — genReport 기준 문장 수(파이널 폴백/소스 포함).
  const activitySentenceCount = useMemo(
    () => extractGenContext(activityGenReport).sentences.length,
    [activityGenReport],
  );
  // 파이널 단어 시험지의 원천 — 소스(기본 리포트)의 vocabulary 행 보유 여부(승격 주입 게이트).
  // rows.length 만 보면 전 행이 core-tier 인 소스에서 「켤 수 있음」으로 읽혀 **빈 시험지**가
  // 주입된다 — 실제 출제 대상(vocabulary-flow.tsx:104 의 기본 출제 술어) 존재로 판정한다.
  const sourceHasVocab = useMemo(() => {
    const vs = activitySource?.sections.find((s) => s.kind === "vocabulary");
    return vs?.kind === "vocabulary" && vs.rows.filter((row) => isDefaultVocabularyTestTarget(row)).length > 0;
  }, [activitySource]);

  useEffect(() => {
    onDraftChange?.(report, { dirty });
  }, [dirty, onDraftChange, report]);

  // ─── 【합성 조판】외래 id 관문 ────────────────────────────────────────────────
  // §3.10.21 E21-7 4번은 **페이지 컨트롤**만 닫았는데(아래 `edit` 메모의 P0 주석), 같은 논리가
  // **블록 컨트롤**에도 그대로 성립한다: `report-pages/pages.tsx:204` 가 페이지 아이템 전량
  // (부착 문서 포함)에 활성 문서와 **같은 `edit`** 를 내리므로, 부착 문서 블록의 휴지통/그립/
  // 리사이즈가 `deleteItem`(`editor-mutations.ts:250` → `:262,285 setBlockMeta(hidden)`) ·
  // `setBlockMeta(minHeight)` · `reorderIds` 를 **활성 report** 로 커밋한다. `blockMeta` 는
  // `schema.ts:1020 z.record(z.string(), …)` 라 키 제한이 없어 스키마를 통과해 영구 저장되고,
  // 사용자는 "부착 문서를 편집했다"고 믿지만 그 학습지를 단독으로 열면 하나도 안 바뀌어 있다
  // (E21-0 「저장 대상은 현재 문서」 고지와 어긋나는 신뢰 사고).
  //
  // 1차 방어는 어포던스 제거 — `compose-ids.ts` 의 `nsAttachedFlowItem` 이 부착 아이템에
  // `showGrip:false`/`resizable:false` 를 박아 `shells.tsx` 의 크롬을 통째로 없앤다.
  // 2차 방어가 이 관문이다. 크롬을 거치지 않는 경로가 남기 때문:
  //   · Delete 키 — 아래 keydown 핸들러가 `activeId` 로 바로 `deleteActive` 를 부른다.
  //   · 선택 — `chromeProps`(`report-pages/items.ts:145-160`)의 `onMouseDown → setActiveId` 는
  //     부착 블록에서도 살아 있어 activeId 가 외래 id 가 될 수 있다.
  //
  // **ref 로 읽는 이유**(중요): `composeActive` 는 이 파일 훨씬 아래(:1497 부근)에서 계산되는데,
  // 아래 콜백들의 의존성 배열은 렌더 시점에 평가되므로 거기에 `composeActive` 를 넣으면 TDZ 다.
  // 게다가 `deleteActive`/`onResize`/`onReorder`/`onBlockMeta` 는 **영구 안정 콜백**이라는 계약이
  // 있고(`edit` 메모 하단 주석), 의존성이 늘면 `edit` 이 매 렌더 새 객체가 되어 전 페이지가
  // 리렌더된다. ref 는 두 문제를 동시에 없앤다.
  const composeActiveRef = useRef(false);
  /** 외래 id 면 안내 후 `true`(= 호출부는 즉시 return). 합성 모드가 아니면 항상 `false`. */
  const rejectComposedId = useCallback((id: string) => {
    if (!composeActiveRef.current) return false;
    // 【E22】두 축을 **OR 로** 켜야 한다. 학습지 축은 접미 네임스페이스(`__docKey`)로 판정하지만
    // 문항 id 에는 `__` 가 한 글자도 없어(U1 이 `isComposedNsId` 와의 충돌을 원천 차단하려고
    // 그렇게 설계했다 — `compose-ids.ts:214-216`) `isComposedNsId` 단독으로는 문항을 못 잡는다.
    // 안 켜면 `deleteItem`(`editor-mutations.ts:250`)이 `/^s(\d+)-(.+)$/`(`:261`) 불일치로
    // `:262 setBlockMeta(hidden)` 폴백에 떨어져 `qb-…::p0` 를 **활성 학습지 report 의 blockMeta 에
    // 써 넣고**, `schema.ts:1020 z.record(z.string(), …)` 가 키를 제한하지 않아 그대로 저장된다.
    const ns = isComposedNsId(id);
    const qb = isComposedQuestionId(id);
    if (!ns && !qb) return false;
    toast.info(
      qb
        // 문항은 in-memory 읽기전용 합성분이다(§3.10.22 E22-0 1번) — 편집을 받아 줄 저장처가
        // 원리적으로 없다. 어디서 고쳐야 하는지까지 알려야 "고장"으로 읽히지 않는다.
        ? "문항은 시험지 세트에 저장됩니다 — 조판에서는 편집할 수 없습니다."
        // 활성 문서의 정답 페이지 파생 블록도 합성 중에는 접미 id 로 렌더된다(E21-1 5번) —
        // 그 접미 id 로 커밋하면 활성 report 에 어디에도 매칭되지 않는 쓰레기 키가 남는다.
        : id.endsWith(`__${ACTIVE_DOC_KEY}`)
          ? "조판 중에는 정답 페이지 블록을 편집할 수 없습니다. 조판을 닫고 편집해 주세요."
          : "부착 문서는 읽기전용입니다. 그 학습지를 단독으로 열어 편집해 주세요.",
    );
    return true;
  }, []);

  // 콘텐츠 편집 콜백 (안정적)
  const med = useMemo(() => ({ commit: (next: ReportMeta) => setReport((r) => setMeta(r, next)) }), [setReport]);
  const sectionEdit = useCallback(
    (index: number) => ({ commit: (next: AnalysisSection) => setReport((r) => setSection(r, index, next)) }),
    [setReport],
  );

  const onReorder = useCallback((sourceId: string, targetId: string, place: DropPlacement) => {
    // 관문(위 「합성 조판 외래 id」). **target 도** 막는다 — 활성 블록을 부착 문서 위에 떨궈도
    // `reorderIds`(`editor-mutations.ts:191-203`)는 `ids.indexOf(외래 target) < 0` 로 원본 배열을
    // 그대로 돌려주지만, `setReport` 는 이미 새 객체를 만든 뒤라 **아무 변화 없이 dirty 만 켜지고**
    // 여태 없던 `blockOrder` 가 통째로 물질화된다(그러면 E21-7 1번 splice 함정의 사정권에 들어간다).
    if (rejectComposedId(sourceId) || rejectComposedId(targetId)) return;
    // [E23] 파이널 시트 **앞** 드롭 봉인 — CoverShell 은 data-paper-item-id 를 무조건 붙여
    // 드롭 타깃이 되므로 여기서 막는다(파이널 시트 = 본편 첫 장 계약): before 는 after 로 강제.
    if (place === "before" && /^s\d+-final$/.test(targetId)) place = "after";
    setReport((r) => {
      const ids = applyBlockOrder(enumerateItems(r).map((b) => b.id), r.blockOrder);
      return { ...r, blockOrder: reorderIds(ids, sourceId, targetId, place) };
    });
  }, [setReport, rejectComposedId]);

  const onBlockMeta = useCallback((id: string, patch: Partial<BlockMeta>) => {
    // 관문 — 외래 키를 그대로 `blockMeta` 에 써 넣는 가장 직접적인 경로다
    // (`schema.ts:1020` 이 `z.record(z.string(), …)` 라 검증에서 절대 걸리지 않는다).
    if (rejectComposedId(id)) return;
    setReport((r) => setBlockMeta(r, id, patch));
  }, [setReport, rejectComposedId]);

  // 워드프로세서식: 텍스트 블록 끝에서 Enter → 바로 아래에 빈 텍스트 블록 생성.
  // 생성된 블록은 렌더 후 effect 가 본문에 포커스를 넣어 곧바로 이어 쓸 수 있다.
  const pendingFocusRef = useRef<string | null>(null);
  // customBlocks 길이 미러(렌더 중 갱신 — activityAvailabilityRef 와 같은 관용구) —
  // 80개 상한 가드를 updater **밖**(삽입 함수 초입)에서 읽어 toast·후속 부작용
  // (setActiveId/scrollToBlock/nonce/패널열기)까지 통째로 차단하기 위한 것.
  // updater 안 가드는 toast 없는 return r 백스톱으로만 남긴다(updater 순수성).
  const customBlocksLenRef = useRef(0);
  customBlocksLenRef.current = report.customBlocks?.length ?? 0;
  // anchorId 기준 앞/뒤에 빈 텍스트 블록 삽입. anchorId === null 이면 맨 앞에.
  const insertBlockAt = useCallback(
    (
      kind: "text" | "spacer",
      anchorId: string | null,
      place: "before" | "after",
    ) => {
      // customBlocks 80개 상한 — schema 의 `.max(80).catch(undefined)` 는 81개째부터
      // 배열 **전체를 소거**하므로(저장 시 블록 전멸) Enter 연타도 넘치기 전에 여기서 끊는다.
      if (customBlocksLenRef.current >= 80) {
        toast.error("추가 블록은 최대 80개까지예요. 기존 블록을 정리한 뒤 다시 추가해 주세요.");
        return;
      }
      const id = newCustomBlockId();
      setReport((r) => {
        // 상한 백스톱(같은 렌더 안 연속 호출은 위 ref 가 아직 옛 값) — toast 는 초입이 담당.
        if ((r.customBlocks?.length ?? 0) >= 80) return r;
        const cb: CustomBlock =
          kind === "spacer"
            ? { kind: "spacer", id, heightMm: 16 }
            : { kind: "text", id, text: "" };
        const withBlock = { ...r, customBlocks: [...(r.customBlocks ?? []), cb] };
        const naturalIds = enumerateItems(withBlock).map((d) => d.id);
        const fullOrder = applyBlockOrder(naturalIds, withBlock.blockOrder);
        const anchor = anchorId ?? fullOrder.find((x) => x !== id) ?? null;
        const blockOrder = anchor
          ? reorderIds(fullOrder, id, anchor, anchorId ? place : "before")
          : fullOrder;
        return { ...withBlock, blockOrder };
      });
      setActiveId(id);
      if (kind === "text") pendingFocusRef.current = id;
      scrollToBlockRef.current(id);
    },
    [setReport],
  );
  const insertTextAfter = useCallback(
    (anchorId: string) => insertBlockAt("text", anchorId, "after"),
    [insertBlockAt],
  );

  // ─── 학습 활동(결정론·AI 아님) ───
  // 마지막으로 다룬 학습 활동 블록 — 다른 블록을 선택해도 그 설정 섹션이 사라지지 않고(접힌 채) 유지된다.
  const [lastActivityId, setLastActivityId] = useState<string | null>(null);
  // 팔레트에서 활동을 (재)활성화할 때마다 +1 — 설정 섹션이 접혀 있어도 다시 펼치게 하는 신호.
  const [activityActivateNonce, setActivityActivateNonce] = useState(0);

  // 팔레트에서 활동 선택 → 워크시트 맨 끝에 활동 블록 삽입 (전체 지문·기본 파라미터).
  const insertActivity = useCallback(
    (activityKind: ActivityKind) => {
      // 가용성 이중 방어 — 팔레트 카드(availability prop)가 1차로 막지만, 카드를 거치지 않는
      // 경로가 남아도 빈 활동 블록이 삽입되지 않게 여기서 끊는다(E23 I5 「빈 블록 삽입 경로 0」).
      if (!activityAvailabilityRef.current[activityKind]?.ok) return;
      // customBlocks 80개 상한 — schema 의 `.max(80).catch(undefined)` 는 81개째부터 배열
      // **전체를 소거**하므로(저장 시 블록 전멸) updater 진입 전에 끊는다 — 후속
      // setActiveId/scrollToBlock/nonce/패널열기까지 통째로 차단(insertBlockAt 과 동일 규약).
      if (customBlocksLenRef.current >= 80) {
        toast.error("추가 블록은 최대 80개까지예요. 기존 블록을 정리한 뒤 다시 추가해 주세요.");
        return;
      }
      const id = newCustomBlockId();
      setReport((r) => {
        // 상한 백스톱(같은 렌더 안 연속 호출은 위 ref 가 아직 옛 값) — toast 는 초입이 담당.
        if ((r.customBlocks?.length ?? 0) >= 80) return r;
        // 활동 생성 소스는 "지문"이지 "문서"가 아니다(E23) — 파이널 문서면 같은 지문의
        // 기본 리포트(activitySource)로 생성한다. r·ref 기준 해석(렌더 스코프 캡처 금지).
        const block = makeActivityBlock(resolveActivityGenReport(r, activitySourceRef.current), { activityKind, id });
        const withBlock = { ...r, customBlocks: [...(r.customBlocks ?? []), block] };
        const naturalIds = enumerateItems(withBlock).map((d) => d.id);
        const fullOrder = applyBlockOrder(naturalIds, withBlock.blockOrder);
        const anchor = fullOrder.filter((x) => x !== id).pop() ?? null;
        const blockOrder = anchor ? reorderIds(fullOrder, id, anchor, "after") : fullOrder;
        // 새 페이지 분할은 렌더러 기본값(firstBreak ?? true)이 담당하므로 메타를 따로 심지 않는다
        // (메타에 breakBefore 를 넣으면 분할된 회차/문항마다 끊김).
        return { ...withBlock, blockOrder };
      });
      setActiveId(id);
      scrollToBlockRef.current(id);
      setActivityActivateNonce((n) => n + 1);
      // 설정 섹션이 보이도록 편집 패널을 연다(접혀 있던 경우) — narrow 임베드는 배타 규칙 경유.
      openPropertiesPanelExclusiveRef.current();
    },
    [setReport],
  );

  // ─── 지문 웹툰(이미지) 삽입 ───
  const [webtoonPickerOpen, setWebtoonPickerOpen] = useState(false);
  const insertImageBlock = useCallback(
    (pick: WebtoonPick) => {
      // customBlocks 80개 상한 — insertActivity 와 동일한 함정 방어(schema `.max(80)
      // .catch(undefined)` 가 초과 시 배열 전체를 소거한다). updater 진입 전에 끊어
      // 후속 setActiveId/scrollToBlock/패널열기까지 통째로 차단한다.
      if (customBlocksLenRef.current >= 80) {
        toast.error("추가 블록은 최대 80개까지예요. 기존 블록을 정리한 뒤 다시 추가해 주세요.");
        return;
      }
      const id = newCustomBlockId();
      setReport((r) => {
        // 상한 백스톱(같은 렌더 안 연속 호출은 위 ref 가 아직 옛 값) — toast 는 초입이 담당.
        if ((r.customBlocks?.length ?? 0) >= 80) return r;
        const block: CustomBlock = {
          kind: "image",
          id,
          imageUrl: pick.imageUrl,
          webtoonId: pick.webtoonId,
          widthPct: 70,
          align: "center",
          ...(pick.ratio ? { ratio: pick.ratio } : {}),
        };
        const withBlock = {
          ...r,
          customBlocks: [...(r.customBlocks ?? []), block],
        };
        const naturalIds = enumerateItems(withBlock).map((d) => d.id);
        const fullOrder = applyBlockOrder(naturalIds, withBlock.blockOrder);
        const anchor = fullOrder.filter((x) => x !== id).pop() ?? null;
        const blockOrder = anchor
          ? reorderIds(fullOrder, id, anchor, "after")
          : fullOrder;
        return { ...withBlock, blockOrder };
      });
      setActiveId(id);
      scrollToBlockRef.current(id);
      // 편집 패널 펼침은 배타 규칙 경유(insertActivity 와 동일) — 직접
      // setPropertiesPanelCollapsed(false) 는 narrow 임베드에서 활동+편집 동시 열림 →
      // A4 캔버스 19px 소멸(「사이드 패널 배타」 실측)을 재발시키는 배타 누수였다.
      openPropertiesPanelExclusiveRef.current();
      setWebtoonPickerOpen(false);
    },
    [setReport],
  );

  // 팔레트 토글용 — 문서에 추가된 활동 블록 수(유형별). 카드의 ON 스위치/개수 배지 근거.
  const activityCountByKind = useMemo(() => {
    const counts: Partial<Record<ActivityKind, number>> = {};
    for (const b of report.customBlocks ?? []) {
      if (b.kind !== "activity") continue;
      counts[b.activityKind] = (counts[b.activityKind] ?? 0) + 1;
    }
    return counts;
  }, [report.customBlocks]);

  // 팔레트 ON 스위치 끄기 — 그 유형의 활동 블록을 문서에서 전부 제거(undo 가능).
  const removeActivityKind = useCallback(
    (activityKind: ActivityKind) => {
      const ids = (report.customBlocks ?? [])
        .filter((b) => b.kind === "activity" && b.activityKind === activityKind)
        .map((b) => b.id);
      if (ids.length === 0) return;
      setReport((r) => ids.reduce((acc, id) => deleteCustomBlock(acc, id), r));
      // 지워진 블록이 선택돼 있었으면 해제 (lastActivityId 정리는 전용 effect 가 담당).
      setActiveId((current) => {
        if (!current) return current;
        const logical = current.startsWith("c-") ? current.split("::", 1)[0] : current;
        return ids.includes(logical) ? null : current;
      });
    },
    [report.customBlocks, setReport],
  );

  // 추가된 유형의 팔레트 카드 클릭 — 또 추가하지 않고 기존 첫 블록을 선택·스크롤해 설정을 연다.
  // 블록 위 컨트롤: 다시 섞기(seed+1 재생성)·밀도·정답 토글·삭제. AI 호출 없음.
  const onActivity = useCallback(
    (id: string, action: ActivityAction) => {
      setReport((r) => {
        if (action.type === "answerKeyPage") return { ...r, activityAnswerKeyPage: action.on };
        const list = r.customBlocks ?? [];
        const b = list.find((x) => x.id === id);
        if (!b || b.kind !== "activity") return r;
        if (action.type === "remove") return deleteCustomBlock(r, id);
        // [E23/I5] 재생성 3분기(reroll/param/sentences) 가용성 가드 — T1 강등(소스 부재)에서
        // 저장된 활동을 **빈 내용으로 재생성-덮어쓰기** 하는 경로 차단. updater 순수성
        // 유지를 위해 조용한 no-op(toast 금지). answers/title/kicker/blankItem 은 재생성이
        // 아니라(원천 데이터 불필요) 가드 대상이 아니다.
        if (
          (action.type === "reroll" || action.type === "param" || action.type === "sentences") &&
          !activityAvailabilityRef.current[b.activityKind]?.ok
        )
          return r;
        // 재생성 계열(reroll/param/sentences)의 문장·데이터 원천도 genReport 기준(E23) —
        // 파이널이면 기본 리포트로 해석한다. r·ref 기준(렌더 스코프 캡처 금지).
        const genReport = resolveActivityGenReport(r, activitySourceRef.current);
        let next: ActivityBlock;
        if (action.type === "reroll") next = rerolledActivityBlock(genReport, b);
        else if (action.type === "param") next = appliedActivityParams(genReport, b, action.patch);
        else if (action.type === "sentences") next = appliedActivitySentences(genReport, b, action.sentenceNos);
        else if (action.type === "answers") next = { ...b, answersHidden: action.hidden };
        else if (action.type === "title") next = { ...b, title: action.value };
        // 빈 영문 라벨은 undefined 로 — 표시 시 payload.instructions 기본값으로 되돌아간다.
        else if (action.type === "kicker") next = { ...b, kicker: action.value.trim() ? action.value : undefined };
        else if (action.type === "blankItem") {
          // 블록 전체 연속 재번호(nested 는 회차별 리셋) — 인라인=정답지 번호 일치 보장.
          const renum = applyManualBlankToBlock(
            b.payload.items,
            action.index,
            action.start,
            action.end,
            b.activityKind === "nested-cloze",
          );
          if (!renum) return r; // 빈칸 불가(영어 아님 / 기존 빈칸과 겹침)
          const items = b.payload.items.map((it, i) => ({ ...it, prompt: renum.items[i].prompt, answerKey: renum.items[i].answerKey }));
          // 드래그로 만든 새 빈칸의 단어를 단어 은행에도 추가(은행을 쓰는 유형에 한해). 끝이 아니라 흩어 넣어 누출 방지.
          const wordBank = Array.isArray(b.payload.wordBank) ? insertIntoWordBank(b.payload.wordBank, renum.added) : b.payload.wordBank;
          next = { ...b, payload: { ...b.payload, items, wordBank } };
        } else return r;
        return { ...r, customBlocks: list.map((x) => (x.id === id ? next : x)) };
      });
    },
    [setReport],
  );

  // 빈 영역 클릭 시 "여백/텍스트" 중 무엇을 넣을지 고르는 작은 메뉴.
  const [insertMenu, setInsertMenu] = useState<
    { x: number; y: number; anchorId: string | null } | null
  >(null);

  // 새로 삽입된 텍스트 블록이 렌더되면 본문 필드에 캐럿을 놓는다.
  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    const raf = requestAnimationFrame(() => {
      const body = document.querySelector<HTMLElement>(
        `[data-paper-item-id="${CSS.escape(id)}"] .par-customtext-b`,
      );
      if (!body) return;
      pendingFocusRef.current = null;
      body.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(body);
      range.collapse(true);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [report.customBlocks, report.blockOrder]);

  // 삽입 메뉴: Esc 또는 스크롤 시 닫기.
  useEffect(() => {
    if (!insertMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInsertMenu(null);
    };
    const onScroll = () => setInsertMenu(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [insertMenu]);

  const onColWidths = useCallback((group: string, widths: Record<string, number>) => {
    setReport((r) => setTableColWidths(r, group, widths));
  }, [setReport]);

  // 섹션 헤더(par-sec-head) ko/en 라벨 인라인 편집 — 보고서 레벨 오버라이드 맵(슬롯키 → {ko,en}).
  const onSectionHeading = useCallback((key: string, patch: { ko?: string; en?: string }) => {
    setReport((r) => ({
      ...r,
      sectionHeadings: { ...(r.sectionHeadings ?? {}), [key]: { ...(r.sectionHeadings?.[key] ?? {}), ...patch } },
    }));
  }, [setReport]);

  const setCustom = useCallback((id: string, patch: Partial<CustomBlock>) => {
    setReport((r) => setCustomBlock(r, id, patch));
  }, [setReport]);

  const onResize = useCallback((id: string, mm: number) => {
    // 관문 — 리사이즈는 `setBlockMeta(minHeight)` 로 떨어지므로 위 onBlockMeta 와 같은 오염이다.
    if (rejectComposedId(id)) return;
    setReport((r) => {
      const cb = r.customBlocks?.find((b) => b.id === id);
      if (cb?.kind === "spacer") {
        // 여백 블록은 heightMm 로 직접 반영 + 잔여 minHeight 제거(이중 높이 방지)
        const r2 = setCustomBlock(r, id, { heightMm: Math.min(237, Math.max(SPACER_MIN_MM, mm)) });
        return setBlockMeta(r2, id, { minHeight: undefined });
      }
      return setBlockMeta(r, id, { minHeight: mm > 0 ? Math.min(237, mm) : undefined });
    });
  }, [setReport, rejectComposedId]);

  // ── 표지(Cover) ──
  const [coverError, setCoverError] = useState<string | null>(null);
  const ced = useMemo(() => ({ commit: (next: ReportCover) => setReport((r) => ({ ...r, cover: next })) }), [setReport]);
  const setCoverPatch = useCallback((patch: Partial<ReportCover>) => {
    setReport((r) => ({ ...r, cover: { ...COVER_DEFAULTS, ...(r.cover ?? {}), ...patch } }));
  }, [setReport]);

  // 학습자료 설정 템플릿 — 현재 설정을 이름 붙여 저장 / 골라서 적용 / 삭제 / 현재 보고서 초기화
  const onSaveReportSettings = useCallback(
    (name: string) =>
      addSavedReportSettings(
        {
          brand: report.brand,
          themeId: report.themeId,
          englishOnlyPage: !!report.englishOnlyPage,
          cover: report.cover,
        },
        name,
      ),
    [report.brand, report.themeId, report.englishOnlyPage, report.cover],
  );
  const onApplyReportSettings = useCallback(
    (entry: SavedReportSettings) => {
      setReport((r) => ({
        ...r,
        brand: entry.brand ?? r.brand,
        themeId: entry.themeId ?? r.themeId,
        englishOnlyPage: entry.englishOnlyPage ?? r.englishOnlyPage,
        cover: entry.cover ? { ...COVER_DEFAULTS, ...entry.cover } : r.cover,
      }));
      return persistAppliedReportSettings(entry);
    },
    [setReport],
  );
  const onDeleteReportSettings = useCallback((id: string) => deleteSavedReportSettings(id), []);
  const onResetReportSettings = useCallback(() => {
    setReport((r) => ({ ...r, themeId: "black-white", englishOnlyPage: false, cover: { ...COVER_DEFAULTS } }));
  }, [setReport]);

  // 기본 템플릿 자동 적용 — 이 지문의 보고서를 '처음' 열 때 딱 한 번. 이후(편집한 뒤)에는
  // 다시 덮어쓰지 않도록 passageId 를 기록해 둔다. 기본 템플릿이 없으면 적용은 건너뛰되
  // '열어 봤다'는 기록은 남겨, 이미 본 보고서가 나중 기본 지정에 끌려가지 않게 한다.
  // ns 를 함께 넘기는 이유(§3.10.21 E21-3 4행): 이 effect 는 **기본 템플릿이 없어도 '열어 봤다'
  // 기록만 남긴다**(바로 위 주석의 의도된 동작). ns 가 없으면 임베드가 어떤 지문을 열기만 해도
  // 독립 라우트에서 그 지문에 기본 템플릿이 **영영** 자동 적용되지 않는다.
  const storageNs = embed?.storageNamespace;
  useEffect(() => {
    if (hasAppliedDefaultFor(passageId, storageNs)) return;
    const def = getDefaultReportSettings();
    markAppliedDefaultFor(passageId, storageNs);
    if (def) onApplyReportSettings(def);
  }, [passageId, storageNs, onApplyReportSettings]);
  const onLogoFile = useCallback(
    async (file?: File | null) => {
      if (!file) return;
      setCoverError(null);
      if (!file.type.startsWith("image/")) {
        setCoverError("이미지 파일만 로고로 넣을 수 있습니다.");
        return;
      }
      if (file.size > LOGO_FILE_MAX_BYTES) {
        setCoverError("로고 이미지는 1.5MB 이하로 올려주세요.");
        return;
      }
      try {
        const url = await downscaleImage(file);
        if (url.length > 900_000) {
          setCoverError("로고 용량이 큽니다. 더 작거나 단순한 이미지를 사용하세요.");
          return;
        }
        setCoverPatch({ logoDataUrl: url, showLogo: true, logoX: undefined, logoY: undefined });
      } catch {
        setCoverError("로고를 불러오지 못했습니다. PNG/JPG 파일을 사용하세요.");
      }
    },
    [setCoverPatch],
  );

  const [pageList, setPageList] = useState<string[][]>([]);
  // 페이지 이동/재정렬 핸들러가 pageList 를 클로저로 잡으면, 재페이지네이션마다
  // `edit` 객체가 새로 만들어져 문서 트리 memo 가 풀린다. 값은 ref 로 읽는다 —
  // 두 핸들러 모두 사용자 조작 시점에만 호출되므로 항상 최신 pageList 를 본다.
  const pageListRef = useRef(pageList);
  pageListRef.current = pageList;
  const [activePageIndex, setActivePageIndex] = useState(0);
  // 세 접힘 state 의 초기값만 embed.initialCollapsed 로 시드한다(미전달 = 기존 false).
  // 이후 사용자 토글은 자유 — 시드는 마운트 1회뿐이라 호스트가 값을 바꿔도 되돌리지 않는다.
  const [pagesPanelCollapsed, setPagesPanelCollapsed] = useState(embed?.initialCollapsed?.pages ?? false);
  const [propertiesPanelCollapsed, setPropertiesPanelCollapsed] = useState(
    embed?.initialCollapsed?.panel ?? false,
  );
  // 학습 활동 팔레트는 창 가장 왼쪽(페이지 패널보다 왼쪽)에 붙는 독립 칼럼. 기본 펼침.
  const [activityPanelCollapsed, setActivityPanelCollapsed] = useState(
    embed?.initialCollapsed?.activity ?? false,
  );
  // ── E21-4 접힘 사다리 = **표시 강제가 아니라 상태 전이**다 ──────────────────
  // 초판(26-08-18)은 `force ?? state` 렌더타임 오버라이드였는데, 실측에서 1440 뷰포트
  // (셸 745px)의 학습 활동·편집 패널이 **영영 열리지 않았다** — 핸들은 있고 state 는
  // 뒤집히지만 표시가 강제에 묶여 불변(.tmp-worksheet-compose/probe-force-collapse.mjs:
  // PANEL_OPENABLE=false·ACTIVITY_OPENABLE=false). 사용자 확정 요구(「이 탭들도 그대로
  // 유지한 채로」)와 정면 충돌하므로 규약을 바꾼다:
  //   · 사다리가 어떤 축을 **처음 접으라고 말하는 순간**에만 접는다(직전 상태 보관).
  //   · 사다리가 놓아주면 보관분으로 되돌린다 — 단 **강제 중 사용자가 직접 만졌으면
  //     그 조작이 이긴다**(복귀하지 않는다).
  //   · 강제 중에도 핸들 토글은 항상 즉시 반영된다(일방 잠금 없음).
  // 전이 판정은 참조가 아니라 **시그니처 문자열**로 한다 — 호스트가 매 렌더 새 객체를
  // 만드는 것이 정상이므로 참조 비교는 무한 재적용을 낳는다.
  const forceCollapsedSig = `${embed?.forceCollapsed?.activity ?? ""}|${
    embed?.forceCollapsed?.pages ?? ""
  }|${embed?.forceCollapsed?.panel ?? ""}`;
  /** 축별 { 강제 진입 직전 사용자 상태, 강제로 밀어넣은 값 } */
  const forceMemoRef = useRef<
    Partial<Record<"activity" | "pages" | "panel", { prev: boolean; forced: boolean }>>
  >({});
  const forceCollapsedRef = useRef(embed?.forceCollapsed);
  forceCollapsedRef.current = embed?.forceCollapsed;
  useEffect(() => {
    const f = forceCollapsedRef.current;
    const memo = forceMemoRef.current;
    const apply = (
      axis: "activity" | "pages" | "panel",
      next: boolean | undefined,
      setter: Dispatch<SetStateAction<boolean>>,
    ) => {
      const kept = memo[axis];
      if (next === undefined) {
        if (!kept) return; // 강제한 적 없음 = 할 일 없음
        delete memo[axis];
        setter((prev) => (prev === kept.forced ? kept.prev : prev));
        return;
      }
      setter((prev) => {
        if (!kept) memo[axis] = { prev, forced: next };
        else kept.forced = next;
        return next;
      });
    };
    apply("activity", f?.activity, setActivityPanelCollapsed);
    apply("pages", f?.pages, setPagesPanelCollapsed);
    apply("panel", f?.panel, setPropertiesPanelCollapsed);
    // forceCollapsedSig 가 값 동등성을 대표한다(embed 참조 변화는 의도적으로 무시 —
    // 그래서 강제값은 ref 로 읽는다. 세터는 안정 참조라 deps 에 필요 없다).
  }, [forceCollapsedSig]);
  // 표시용 접힘 = **state 그 자체**. 미전달 경로는 기존과 동일 값·동일 렌더다.
  const pagesCollapsed = pagesPanelCollapsed;
  const panelCollapsed = propertiesPanelCollapsed;
  const activityCollapsed = activityPanelCollapsed;

  // ── 좁은 임베드의 **사이드 패널 배타** — 캔버스 최소 폭 보증 ────────────────
  // 좁은 컨테이너에서 세 사이드 패널을 동시에 펼치면 고정 폭 합(팔레트 264 + 레일 112 +
  // 편집 304 + 핸들·드래그바 46 = 726px)이 셸을 다 먹어 **A4 캔버스가 19px 로 소멸**한다
  // (실측 26-08-18, 1440 뷰포트에서 조판 aside 745px: s6-compose-panels-expanded--w1440.png).
  // 사다리(E21-4)는 "자동으로 접는" 방향만 담당하고 사용자가 직접 여는 것은 막지 않으므로,
  // 배타 규칙이 없으면 사용자는 자기 손으로 캔버스를 죽일 수 있다.
  // → narrow 동안에는 **한 번에 하나만** 열린다: 새로 여는 축이 이기고 나머지는 접힌다.
  //   (시험지 빌더의 `bothBuilderPanelsOpen` 가드와 같은 계열 규약. narrow 가 아니면
  //    이 래퍼들은 순수 통과라 독립 라우트 동작은 바이트 동일하다.)
  const narrowEmbed = Boolean(embed?.narrow);
  const exclusiveOpen = useCallback(
    (axis: "activity" | "pages" | "panel") => {
      if (!narrowEmbed) return;
      if (axis !== "activity") setActivityPanelCollapsed(true);
      if (axis !== "pages") setPagesPanelCollapsed(true);
      if (axis !== "panel") setPropertiesPanelCollapsed(true);
    },
    [narrowEmbed],
  );
  const toggleActivityPanel = useCallback(() => {
    setActivityPanelCollapsed((v) => {
      if (v) exclusiveOpen("activity");
      return !v;
    });
  }, [exclusiveOpen]);
  const expandPagesPanel = useCallback(() => {
    exclusiveOpen("pages");
    setPagesPanelCollapsed(false);
  }, [exclusiveOpen]);
  const collapsePagesPanel = useCallback(() => setPagesPanelCollapsed(true), []);
  const togglePropertiesPanel = useCallback(() => {
    setPropertiesPanelCollapsed((v) => {
      if (v) exclusiveOpen("panel");
      return !v;
    });
  }, [exclusiveOpen]);
  // 코드 경로(활동 삽입·단어 시험지 켜기)가 편집 패널을 펼칠 때의 공식 입구 — narrow 임베드면
  // exclusiveOpen("panel") 을 경유해 활동 팔레트/페이지 레일을 접는다. 직접
  // setPropertiesPanelCollapsed(false) 만 부르면 narrow 에서 활동+편집 동시 열림 →
  // A4 캔버스 19px 소멸(위 「사이드 패널 배타」 실측)이 재발한다. narrow 아니면 현행 단순 펼침.
  const openPropertiesPanelExclusive = useCallback(() => {
    exclusiveOpen("panel");
    setPropertiesPanelCollapsed(false);
  }, [exclusiveOpen]);
  openPropertiesPanelExclusiveRef.current = openPropertiesPanelExclusive;
  // '단어 시험지' 카드를 누른 적 있으면 우측 패널에 단어 시험지 설정 섹션이 떠 있는다(활동 설정과 동일).
  const [vocabTestFocused, setVocabTestFocused] = useState(false);
  // 카드를 누를 때마다 +1 — 설정 섹션이 접혀 있어도 다시 펼치고 그 위치로 스크롤하는 신호.
  const [vocabTestActivateNonce, setVocabTestActivateNonce] = useState(0);
  // 편집창에 처음 들어오면 '설정' 패널이 열려 있고, 블록을 선택하면 '편집' 패널로 전환된다.
  const [materialSettingsOpen, setMaterialSettingsOpen] = useState(true);
  // 모바일(<lg): 팔레트·페이지 레일·우측 패널을 숨기고 캔버스를 전체 폭으로.
  // 우측 패널은 하단 바에서 여는 풀스크린 시트(mobilePanelOpen)로 대체한다.
  const isMobile = useIsMobile();
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  // 모바일 인라인 편집 차단 2겹: pointer-events:none(CSS)에 더해, 크롬 터치 타깃 보정이
  // pointer-events 를 무시하고 contentEditable 을 네이티브 포커스하는 경로를 즉시 blur 로
  // 끊는다(가상 키보드 팝업 방지). 블록 선택(mousedown)은 이미 끝난 뒤라 영향 없음.
  useEffect(() => {
    if (!isMobile) return;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.classList?.contains("par-edit-field")) target.blur();
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [isMobile]);
  // 블록을 선택하면 학습자료 설정에서 편집 패널로 자동 전환(그 블록 도구를 바로 보여주기 위해)
  useEffect(() => {
    if (activeId) setMaterialSettingsOpen(false);
  }, [activeId]);
  // 폭 3키도 ns 아래로 가른다 — 임베드에서 바짝 줄인 폭이 지문 스튜디오로 영구 누수하던 경로.
  const { railWidth, panelWidth, activityWidth, widthDragging, startWidthDrag, consumeWidthDragClick } = usePanelWidths(storageNs);
  const previewScrollerRef = useRef<HTMLDivElement>(null);
  // 좌측 페이지 썸네일 목록 스크롤러 — 본문 스크롤을 따라 활성 페이지를 보이게 한다.
  const pagesPanelScrollerRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [zoomControlsPos, setZoomControlsPos] = useState({ top: 12, right: 12 });
  const zoom = manualZoom ?? fitZoom;
  const previewPageCount = Math.max(pageList.length, 1);
  const previewContentHeight =
    previewPageCount * (REPORT_A4_HEIGHT_PX + REPORT_EDIT_PAGE_GAP_PX) +
    REPORT_EDIT_TOP_INSET_PX;

  // 모바일(<lg): 줌을 바꾸면 페이지가 뷰포트보다 넓어질 때 브라우저가 좌측으로 붙여
  // 스크롤 시작점을 잡는다 → 가로 스크롤을 가운데로 맞춰 페이지가 화면 중앙에 오게 한다.
  // (데스크톱은 건드리지 않는다 — 확대 중 스크롤 위치가 튀지 않도록.)
  useEffect(() => {
    if (!isMobile) return;
    const scroller = previewScrollerRef.current;
    if (!scroller) return;
    const raf = requestAnimationFrame(() => {
      scroller.scrollLeft = Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
    });
    return () => cancelAnimationFrame(raf);
  }, [zoom, isMobile]);

  useEffect(() => {
    const scroller = previewScrollerRef.current;
    if (!scroller) return;

    let lastFitWidth = 0;
    const updateFitZoom = () => {
      const styles = window.getComputedStyle(scroller);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const availableWidth = Math.max(200, scroller.clientWidth - paddingX);
      if (lastFitWidth > 0 && Math.abs(availableWidth - lastFitWidth) < 24) return;
      lastFitWidth = availableWidth;
      const nextFit = Math.min(1, Math.max(FIT_ZOOM_MIN, availableWidth / REPORT_A4_WIDTH_PX));
      setFitZoom(Math.round(nextFit * 100) / 100);
    };

    updateFitZoom();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateFitZoom);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scroller = previewScrollerRef.current;
    if (!scroller) return;

    // 페이지 노드는 pageList 가 바뀔 때만 달라진다 → effect 진입 시 1회 조회해 캐시한다.
    // (예전에는 스크롤 이벤트마다 문서 전체를 querySelectorAll 했다.)
    let pageNodes: HTMLElement[] = [];
    const refreshNodes = () => {
      pageNodes = Array.from(scroller.querySelectorAll<HTMLElement>("[data-page-index]"));
    };

    const updateActivePage = () => {
      // 캐시가 비었거나(초기) 노드가 DOM 에서 떨어져 나갔으면 다시 조회 — 결과가
      // 예전(매번 조회)과 100% 같도록 보장하는 안전판.
      if (pageNodes.length === 0 || !pageNodes[0].isConnected) refreshNodes();
      const scrollerRect = scroller.getBoundingClientRect();
      let nextIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      pageNodes.forEach((node) => {
        const rawIndex = Number(node.dataset.pageIndex);
        const top = node.getBoundingClientRect().top - scrollerRect.top;
        const distance = Math.abs(top - 24);
        if (Number.isFinite(rawIndex) && distance < bestDistance) {
          nextIndex = rawIndex;
          bestDistance = distance;
        }
      });
      setActivePageIndex(nextIndex);
    };

    // 스크롤 이벤트는 한 프레임에 여러 번 올 수 있다 → rAF 로 프레임당 1회로 합친다.
    // 프레임 경계에서 읽는 스크롤 위치 = 그 프레임 마지막 이벤트의 위치이므로 결과값은 동일하다.
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        updateActivePage();
      });
    };

    refreshNodes();
    updateActivePage();
    const frame = window.requestAnimationFrame(() => {
      refreshNodes();
      updateActivePage();
    });
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      if (raf) window.cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
    };
    // pageList.length 가 아니라 pageList 자체 — 페이지 수가 같아도 재분할되면
    // 캐시한 노드를 다시 읽어야 한다(setPageList 는 samePages 가드로 참조가 안정적).
  }, [pageList, zoom]);

  // 본문 미리보기를 스크롤하면(activePageIndex 변경) 좌측 썸네일 목록도 따라와
  // 현재 보고 있는 페이지 썸네일이 항상 보이게 한다. 이미 보이면 움직이지 않는다.
  useEffect(() => {
    const scroller = pagesPanelScrollerRef.current;
    if (!scroller) return;
    const el = scroller.querySelector<HTMLElement>(
      `[data-thumb-index="${activePageIndex}"]`,
    );
    if (!el) return;
    const sRect = scroller.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    if (eRect.top >= sRect.top && eRect.bottom <= sRect.bottom) return;
    const target =
      scroller.scrollTop +
      (eRect.top - sRect.top) -
      (scroller.clientHeight - eRect.height) / 2;
    scroller.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activePageIndex]);

  const scrollToPage = useCallback((index: number) => {
    const scroller = previewScrollerRef.current;
    const node = scroller?.querySelector<HTMLElement>(`[data-page-index="${index}"]`);
    if (!scroller || !node) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = node.getBoundingClientRect();
    scroller.scrollTo({
      top: scroller.scrollTop + targetRect.top - scrollerRect.top - 20,
      behavior: "smooth",
    });
    setActivePageIndex(index);
  }, []);

  // 단어 시험지/학습지 편집 후 영향을 받은 블록으로 스크롤·선택을 옮긴다.
  const scrollToBlock = useCallback((id: string) => {
    window.setTimeout(() => {
      const scroller = previewScrollerRef.current;
      const el =
        scroller?.querySelector<HTMLElement>(`[data-paper-item-id="${id}"]`) ??
        scroller?.querySelector<HTMLElement>(`.par-root-edit .par-sheet [data-mid="${id}"]`);
      if (scroller && el) {
        const scrollerRect = scroller.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        scroller.scrollTo({
          top: Math.max(0, scroller.scrollTop + elRect.top - scrollerRect.top - 18),
          behavior: "smooth",
        });
      }
      const pageEl = el?.closest<HTMLElement>("[data-page-index]");
      const pageIndex = Number(pageEl?.dataset.pageIndex);
      if (Number.isFinite(pageIndex)) setActivePageIndex(pageIndex);
      setActiveId(id);
    }, 160);
  }, []);
  scrollToBlockRef.current = scrollToBlock;

  // id 를 정적으로 알 수 없는 블록(예: 정답·해설 키 — 내용에 따라 키가 달라짐)을
  // CSS 선택자로 찾아 스크롤. 첫 매칭 요소로 이동하고 활성 블록도 그 블록으로.
  const scrollToSelector = useCallback((selector: string) => {
    window.setTimeout(() => {
      const scroller = previewScrollerRef.current;
      const el = scroller?.querySelector<HTMLElement>(selector);
      if (!scroller || !el) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      scroller.scrollTo({
        top: Math.max(0, scroller.scrollTop + elRect.top - scrollerRect.top - 18),
        behavior: "smooth",
      });
      const pageEl = el.closest<HTMLElement>("[data-page-index]");
      const pageIndex = Number(pageEl?.dataset.pageIndex);
      if (Number.isFinite(pageIndex)) setActivePageIndex(pageIndex);
      const id = el.getAttribute("data-paper-item-id");
      if (id) setActiveId(id);
    }, 160);
  }, []);

  // ─── [E27 · §3.10.26 R3-2] 조판 점프 — 스크롤 + 1회 글로우, `setActiveId` 는 **하지 않는다** ──
  //
  // 위 `scrollToBlock`/`scrollToSelector` 는 **건드리지 않는다**(단독 편집 경로의 동작을 한 글자도
  // 바꾸지 않는 것이 additive 계약). 여기는 별도 함수다. 차이는 딱 하나 — 마지막 `setActiveId` 가
  // 없다는 것. 그 한 줄이 왜 조판에서 금지인가(3건 전부 코드로 확인):
  //
  //  ① **Delete 토스트 오발화** — Delete keydown 핸들러(:1763-1780, 특히 `:1776
  //     deleteActive(activeId)`)가 `activeId` 로 곧장 삭제를 부르고, 외래 id 면 관문
  //     (`:1523 rejectComposedId` → `:570` toast.info)이 「부착 문서는 읽기전용입니다」/
  //     「문항은 시험지 세트에 저장됩니다」 를 띄운다. 사용자는 목차에서 항목을 눌렀을 뿐
  //     삭제를 시도한 적이 없다.
  //  ② **속성 패널 공백 + 설정 패널 강제 닫힘** — `descriptors` 는 활성 문서
  //     `readOnlyFlowItems` 로만 만들어지므로(E21-2 계약) 외래 id 는 `active === null` 이 되어
  //     패널이 이유 없이 비고, `:1123`(`if (activeId) setMaterialSettingsOpen(false)`)이
  //     학습자료 설정 패널까지 닫아 버린다.
  //  ③ **전 페이지 리렌더** — `activeId` 는 `edit` useMemo 의 deps(:2041)라
  //     `MemoReportPages` 의 페이지 셸 트리가 통째로 다시 그려진다(재측정은 아니지만 공짜도 아니다).
  //
  // 대신 **글로우**로 "여기다"를 알린다. React state 를 쓰지 않고 imperative 하게 클래스만
  // 붙였다 떼는 이유도 ③ 과 같다 — 상태를 하나 더 만들면 켜질 때/꺼질 때 두 번 전 페이지가 리렌더된다.
  /** 진행 중인 노드 탐색 루프 핸들. 요청이 갱신되거나 언마운트되면 반드시 취소한다(이중 스크롤 금지). */
  const jumpRetryRef = useRef<{ raf: number; timer: number }>({ raf: 0, timer: 0 });
  /**
   * 글로우 세대 + 해제자 추적(`glowOnce` 참조 — 같은 항목을 1.6초 안에 재클릭해도 앞 요청의
   * 지연 `animationcancel` 이 뒤 요청의 글로우를 끄지 않게 한다). 언마운트 정리는 `releaseGlow`.
   */
  const jumpGlowRef = useRef<JumpGlowState>({ gen: 0, el: null });

  const cancelJumpRetry = useCallback(() => {
    const r = jumpRetryRef.current;
    if (r.raf) window.cancelAnimationFrame(r.raf);
    if (r.timer) window.clearTimeout(r.timer);
    r.raf = 0;
    r.timer = 0;
  }, []);

  /**
   * 합성 스트림의 임의 블록으로 스크롤 + 글로우. `id` 는 **논리 블록 id**
   * (= `data-paper-item-id` = `editIdOf(it)`)다.
   *
   * 노드 탐색은 `scrollToBlock` 과 같은 2단 폴백이다:
   *   `[data-paper-item-id]`(대부분) → `.par-root-edit .par-sheet [data-mid]`(CoverShell 등 예외).
   * `CSS.escape` 를 쓰지 않는 것도 같다 — id 문자셋이 `isValidDocKey`(`compose-ids.ts:39-43`)와
   * `isSafeQuestionKey`(`question-ids.ts`)로 이미 보장돼 따옴표·백슬래시·공백이 들어올 수 없다.
   * 두 번째 선택자의 `.par-sheet` 스코프는 **필수**다 — 빼면 숨겨진 측정 클론(`data-mid` 를
   * 그대로 달고 있다)을 잡아 좌표가 0 인 곳으로 스크롤한다.
   */
  const scrollToComposedBlock = useCallback(
    (id: string) => {
      cancelJumpRetry();
      let tries = 0;
      const attempt = () => {
        jumpRetryRef.current.raf = 0;
        const scroller = previewScrollerRef.current;
        const el =
          scroller?.querySelector<HTMLElement>(`[data-paper-item-id="${id}"]`) ??
          scroller?.querySelector<HTMLElement>(`.par-root-edit .par-sheet [data-mid="${id}"]`) ??
          null;
        if (!scroller || !el) {
          // 아직 페이지에 안 박혔다 — 재페이지네이션 + 스크롤 복원(`pages.tsx:152-155`)이
          // 끝난 프레임까지 기다린다. 시간 상수를 키우는 대신 재시도하는 이유는 :237-247 참조.
          if (++tries >= JUMP_RETRY_MAX) return;
          jumpRetryRef.current.timer = window.setTimeout(() => {
            jumpRetryRef.current.timer = 0;
            jumpRetryRef.current.raf = window.requestAnimationFrame(attempt);
          }, JUMP_RETRY_GAP_MS);
          return;
        }
        const scrollerRect = scroller.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        scroller.scrollTo({
          // -18 오프셋은 기존 두 스크롤 함수와 같은 관용구(블록이 상단에 딱 붙지 않게).
          top: Math.max(0, scroller.scrollTop + elRect.top - scrollerRect.top - 18),
          behavior: "smooth",
        });
        // 페이지 인덱스 동기화는 해도 된다 — 좌측 썸네일 레일 하이라이트용이고
        // `activeId` 와는 무관하다(`scrollToPage` 도 이것만 한다 — 미접촉 선례).
        const pageEl = el.closest<HTMLElement>("[data-page-index]");
        const pageIndex = Number(pageEl?.dataset.pageIndex);
        if (Number.isFinite(pageIndex)) setActivePageIndex(pageIndex);
        // **찾은 첫 요소 1개에만.** 이유는 `glowOnce` 머리주석(문항 조각 editId 공유).
        glowOnce(el, jumpGlowRef.current);
      };
      jumpRetryRef.current.raf = window.requestAnimationFrame(attempt);
    },
    [cancelJumpRetry],
  );

  // 언마운트 시 진행 중인 탐색 루프 **+ 글로우 해제자** 정리 — 조판은 활성 문서 전환이
  // **재마운트**라(표면 key 교체) 루프가 살아 있으면 죽은 스크롤러를 계속 조회하고,
  // 글로우 쪽은 리스너 3개 + 백스톱 타이머(최대 2.6초)가 떨어져 나간 노드에 매달린 채 남는다.
  // deps 에 `jumpGlowRef` 를 넣지 않는 것은 ref 객체가 마운트 내내 항등이기 때문이다.
  useEffect(
    () => () => {
      cancelJumpRetry();
      releaseGlow(jumpGlowRef.current);
    },
    [cancelJumpRetry],
  );

  // 어떤 기능 블록(접두사로 식별)의 '바로 윗 블록' id. 기능을 끄기 전 현재 순서에서
  // 계산해, 끈 뒤 사라진 자리 바로 위로 스크롤하는 데 쓴다.
  const blockAbovePrefix = useCallback((prefix: string): string | null => {
    const order = orderedIdsRef.current;
    const idx = order.findIndex((bid) => bid.startsWith(prefix));
    return idx > 0 ? order[idx - 1] : null;
  }, []);

  // 기능을 끌 때 '튕김' 방지: 먼저 위(targetId, 아직 존재하는 블록)로 부드럽게 스크롤한
  // 뒤, 스크롤이 끝나고 나서 콘텐츠를 제거(apply)한다. 제거는 화면 아래쪽에서 일어나므로
  // 스크롤 위치가 순간 보정되며 튕기는 일이 없다.
  const scrollUpThenApply = useCallback(
    (targetId: string | null, apply: () => void) => {
      const scroller = previewScrollerRef.current;
      const el = targetId
        ? scroller?.querySelector<HTMLElement>(`[data-paper-item-id="${targetId}"]`)
        : null;
      if (!scroller || !el) {
        apply();
        return;
      }
      if (targetId) setActiveId(targetId);
      const sRect = scroller.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const top = Math.max(0, scroller.scrollTop + eRect.top - sRect.top - 18);
      const pageEl = el.closest<HTMLElement>("[data-page-index]");
      const pageIndex = Number(pageEl?.dataset.pageIndex);
      if (Number.isFinite(pageIndex)) setActivePageIndex(pageIndex);
      if (Math.abs(top - scroller.scrollTop) < 4) {
        apply(); // 이미 그 위치 → 곧장 제거
        return;
      }
      scroller.scrollTo({ top, behavior: "smooth" });
      window.setTimeout(apply, 450); // 부드러운 스크롤이 끝난 뒤 제거
    },
    [],
  );

  const zoomPreviewIn = useCallback(() => {
    setManualZoom((current) =>
      Math.min(PREVIEW_ZOOM_MAX, Math.round(((current ?? zoom) + PREVIEW_ZOOM_STEP) * 100) / 100),
    );
  }, [zoom]);

  const zoomPreviewOut = useCallback(() => {
    setManualZoom((current) =>
      Math.max(PREVIEW_ZOOM_MIN, Math.round(((current ?? zoom) - PREVIEW_ZOOM_STEP) * 100) / 100),
    );
  }, [zoom]);

  const resetPreviewZoom = useCallback(() => setManualZoom(null), []);

  // 캔버스 빈 배경 클릭 → 선택 해제. 인라인 화살표로 두면 EditorCanvas 의 memo 가
  // 매 렌더 무효화되므로 정체성을 고정한다.
  const deselect = useCallback(() => setActiveId(null), []);

  const fitPreviewToScreen = useCallback(() => {
    const scroller = previewScrollerRef.current;
    if (!scroller) return;
    const styles = window.getComputedStyle(scroller);
    const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const availableWidth = Math.max(1, scroller.clientWidth - paddingX);
    const availableHeight = Math.max(1, scroller.clientHeight - paddingY);
    const next = Math.min(availableWidth / REPORT_A4_WIDTH_PX, availableHeight / REPORT_A4_HEIGHT_PX);
    const clamped = Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, next));
    setManualZoom(Math.round(clamped * 100) / 100);
  }, []);

  // 드래그 시작 위치를 ref 로 읽어 핸들러 정체성을 영구 고정한다(deps []).
  // 예전에는 deps 가 [zoomControlsPos] 라, 컨트롤을 한 번 움직일 때마다 EditorCanvas 의
  // prop 이 새 함수가 되어 문서 트리 memo 가 통째로 무효화됐다.
  const zoomControlsPosRef = useRef(zoomControlsPos);
  zoomControlsPosRef.current = zoomControlsPos;
  const handlePreviewZoomControlsDragStart = useCallback(
    (event: ReactMouseEvent<HTMLSpanElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const startMouseX = event.clientX;
      const startMouseY = event.clientY;
      const { top: startTop, right: startRight } = zoomControlsPosRef.current;
      // 드래그 중에는 컨트롤 DOM 에 직접 반영하고(블록 리사이즈 핸들·표 열너비 드래그와
      // 동일한 관용구), 포인터를 놓을 때 딱 한 번만 상태로 확정한다. mousemove 마다
      // setState 하면 프레임당 문서 전체 트리를 건드리게 된다.
      const controlsEl = event.currentTarget.parentElement as HTMLElement | null;
      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";

      let next = { top: startTop, right: startRight };
      const handleMove = (moveEvent: MouseEvent) => {
        next = {
          top: Math.max(0, startTop + (moveEvent.clientY - startMouseY)),
          right: Math.max(0, startRight - (moveEvent.clientX - startMouseX)),
        };
        if (controlsEl) {
          controlsEl.style.top = `${next.top}px`;
          controlsEl.style.right = `${next.right}px`;
        } else {
          // 컨트롤 DOM 을 못 찾는 경우(구조 변경 등)에는 예전 경로로 안전 복귀.
          setZoomControlsPos(next);
        }
      };
      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
        // 최종 위치를 React 상태로 확정 — 이후 리렌더가 같은 값을 다시 쓰므로 튐이 없다.
        setZoomControlsPos((prev) =>
          prev.top === next.top && prev.right === next.right ? prev : next,
        );
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [],
  );

  const deleteActive = useCallback((id: string) => {
    // 관문 — 블록 휴지통(`shells.tsx BlockDelete`)과 Delete 키가 함께 타는 경로다.
    // 외래 접미 id 는 `deleteItem`(`editor-mutations.ts:250`)의 `/^s(\d+)-(.+)$/`·`c-` 판정이
    // 전부 빗나가 `:262,285 setBlockMeta(r, id, { hidden: true })` 로 떨어진다 — 즉
    // "남의 문서 블록 삭제"가 "활성 문서 blockMeta 에 정체불명 hidden 키 기록"이 된다.
    if (rejectComposedId(id)) return;
    const order = orderedIdsRef.current;
    const idx = order.indexOf(id);
    const prev = idx > 0 ? order[idx - 1] : null;
    setReport((r) => deleteItem(r, id));
    setActiveId(null);
    if (prev) scrollToBlock(prev);
    else scrollToPage(0);
  }, [setReport, scrollToBlock, scrollToPage, rejectComposedId]);
  const deletePage = useCallback((ids: string[]) => {
    if (!ids.length) return;
    // 학습 활동 정답 페이지(파생 블록: activity-answers-head / c-…-ans)는 개별 삭제 대상이 아니라
    // 문서 레벨 '정답 별도 페이지' 옵션을 끄는 것으로 처리한다(활동 블록은 유지·설정에서 재활성).
    const isAnswerPage = ids.every((id) => id === "activity-answers-head" || /-ans$/.test(id));
    if (isAnswerPage) {
      if (!window.confirm("학습 활동 정답 페이지를 숨길까요? (활동은 유지되고, 활동 설정에서 다시 켤 수 있어요)")) return;
      setReport((r) => ({ ...r, activityAnswerKeyPage: false }));
      return;
    }
    const logicalIds = Array.from(new Set(ids.map((id) => (id.startsWith("c-") ? id.split("::", 1)[0] : id))));
    if (!window.confirm(`이 페이지의 블록 ${logicalIds.length}개를 삭제할까요?`)) return;
    setReport((r) => hideOrDeleteIds(r, logicalIds));
  }, [setReport]);

  // 페이지를 통째로 한 칸 위/아래로 이동 — 인접 페이지의 블록 묶음과 통째로 자리바꿈한다.
  // 자동 페이지네이션(높이 기준)이라 한 블록(특히 회차·문항이 여럿인 학습 활동)이
  // 두 페이지에 걸쳐 렌더되는 경우가 흔하다. 그런 블록은 "첫 조각이 놓인 페이지"의
  // 소유로 보고 한 덩어리로 옮겨야, 페이지 안 블록이 쪼개지지 않고 전체가 함께 이동한다.
  const movePage = useCallback(
    (pageIds: string[], dir: -1 | 1) => {
      if (!pageIds.length) return;
      const pages = pageListRef.current;
      const pi = pages.findIndex(
        (p) => p.length > 0 && p[0] === pageIds[0],
      );
      if (pi < 0) return;
      const ti = pi + dir;
      if (ti < 0 || ti >= pages.length) return;
      setReport((r) => {
        // 페이지 조각(part-key) → blockOrder 정렬 단위(orderId) 매핑.
        const orderOf = new Map<string, string>();
        for (const it of reportFlowItems(r)) {
          if (isActivityAnswerId(it.id)) continue;
          orderOf.set(it.id, orderIdOf(it));
        }
        const toOrder = (id: string) =>
          orderOf.get(id) ?? (id.startsWith("c-") ? id.split("::", 1)[0] : id);

        const ids = applyBlockOrder(
          enumerateItems(r).map((b) => b.id),
          r.blockOrder,
        );
        const pos = new Map(ids.map((id, i) => [id, i] as const));

        // 각 orderId 의 "소유 페이지" = 그 블록의 첫 조각이 놓인 페이지(앞 페이지 우선).
        const ownerPage = new Map<string, number>();
        pages.forEach((parts, pageIdx) => {
          for (const part of parts) {
            const oid = toOrder(part);
            if (!pos.has(oid) || ownerPage.has(oid)) continue;
            ownerPage.set(oid, pageIdx);
          }
        });

        const curOwned = ids.filter((id) => ownerPage.get(id) === pi);
        const adjOwned = ids.filter((id) => ownerPage.get(id) === ti);
        // 옮길 블록이 없는 페이지(예: 다른 블록의 연속 조각만 있는 페이지)는 무시.
        if (!curOwned.length || !adjOwned.length) return r;

        // 앞쪽(먼저 오는) 묶음 lower, 뒤쪽(나중 오는) 묶음 upper 를 통째로 자리바꿈.
        const lower = dir < 0 ? adjOwned : curOwned;
        const upper = dir < 0 ? curOwned : adjOwned;
        const start = pos.get(lower[0])!;
        const end = pos.get(upper[upper.length - 1])!;
        // 두 묶음이 [start, end] 구간을 빈틈없이 채울 때만 안전하게 swap (방어).
        if (end - start + 1 !== lower.length + upper.length) return r;

        return {
          ...r,
          blockOrder: [
            ...ids.slice(0, start),
            ...upper,
            ...lower,
            ...ids.slice(end + 1),
          ],
        };
      });
    },
    [setReport],
  );
  // 페이지를 드래그해 임의의 최종 위치(toPi)로 이동 — movePage 의 "소유 블록" 규칙을
  // 일반화한 버전. 페이지가 소유한 블록 묶음(첫 조각이 그 페이지에 놓인 orderId)을 통째로
  // 빼서 대상 페이지 묶음의 앞/뒤에 끼운다. 숨김/비소유 id 는 without 에 그대로 보존돼
  // blockOrder 에서 사라지지 않는다.
  const reorderPages = useCallback(
    (fromPi: number, toPi: number) => {
      if (fromPi === toPi) return;
      const pages = pageListRef.current;
      setReport((r) => {
        const orderOf = new Map<string, string>();
        for (const it of reportFlowItems(r)) {
          if (isActivityAnswerId(it.id)) continue;
          orderOf.set(it.id, orderIdOf(it));
        }
        const toOrder = (id: string) =>
          orderOf.get(id) ?? (id.startsWith("c-") ? id.split("::", 1)[0] : id);

        const ids = applyBlockOrder(
          enumerateItems(r).map((b) => b.id),
          r.blockOrder,
        );
        const pos = new Map(ids.map((id, i) => [id, i] as const));

        const ownerPage = new Map<string, number>();
        pages.forEach((parts, pageIdx) => {
          for (const part of parts) {
            const oid = toOrder(part);
            if (!pos.has(oid) || ownerPage.has(oid)) continue;
            ownerPage.set(oid, pageIdx);
          }
        });

        const movedSet = new Set(ids.filter((id) => ownerPage.get(id) === fromPi));
        if (movedSet.size === 0) return r;
        const targetOwned = ids.filter((id) => ownerPage.get(id) === toPi);
        if (targetOwned.length === 0) return r;

        const without = ids.filter((id) => !movedSet.has(id));
        const moved = ids.filter((id) => movedSet.has(id)); // 내부 순서 보존
        const anchor =
          toPi > fromPi ? targetOwned[targetOwned.length - 1] : targetOwned[0];
        const anchorAt = without.indexOf(anchor);
        if (anchorAt < 0) return r;
        const insertAt = toPi > fromPi ? anchorAt + 1 : anchorAt;

        return {
          ...r,
          blockOrder: [
            ...without.slice(0, insertAt),
            ...moved,
            ...without.slice(insertAt),
          ],
        };
      });
    },
    [setReport],
  );
  const onToggleCol = useCallback((si: number, key: string) => {
    setReport((r) => toggleTableCol(r, si, key));
  }, [setReport]);

  // ── 단어 시험지 / 학습지 출력 ──
  const onVocabTestMode = useCallback((si: number, mode: VocabTestMode) => {
    // 파이널 문서의 vocabulary 는 정의상 전부 주입본(E23) — 편집 패널의 「단어 시험지 포함」
    // OFF(study)가 setVocabularyTestMode 로 떨어지면 숨김 단어장 섹션이 **유령 주입본**으로
    // 남는다(deactivateVocabTest 와 달리 섹션이 제거되지 않음). 켜기/모드 전환은 현행 유지.
    const apply = () =>
      setReport((r) =>
        mode === "study" && isFinalOnepageReportShape(r)
          ? removeInjectedVocabSection(r)
          : setVocabularyTestMode(r, si, mode),
      );
    if (mode === "study") {
      // 끄기 → 단어시험이 사라지므로 그 위로 부드럽게 올라간 뒤 제거.
      scrollUpThenApply(blockAbovePrefix(`s${si}-vocab-test`) ?? `s${si}-head`, apply);
    } else {
      apply();
      scrollToBlock(`s${si}-vocab-test-head`);
    }
  }, [blockAbovePrefix, scrollToBlock, scrollUpThenApply, setReport]);
  const onVocabTestLayout = useCallback((si: number, layout: VocabTestLayout) => {
    setReport((r) => setVocabularyTestLayout(r, si, layout));
    scrollToBlock(`s${si}-vocab-test-head`);
  }, [scrollToBlock, setReport]);
  const onVocabStudyLayout = useCallback((si: number, layout: VocabTestLayout) => {
    setReport((r) => setVocabularyStudyLayout(r, si, layout));
    // 레이아웃이 바뀌면 행 블록 id 가 바뀌어(row↔study-grid) 선택이 풀린다 —
    // 섹션 헤더로 선택을 옮겨 패널의 단어장 토글이 계속 떠 있게 한다.
    setActiveId(`s${si}-head`);
    scrollToBlock(`s${si}-head`);
  }, [scrollToBlock, setReport]);
  const onVocabTierFilter = useCallback((si: number, tiers: VocabularyTier[]) => {
    setReport((r) => setVocabularyTierFilter(r, si, tiers));
  }, [setReport]);
  const onVocabTestOnly = useCallback(
    (si: number, enabled: boolean, mode: Exclude<VocabTestMode, "study"> = "hide-meaning") => {
      const apply = () => setReport((r) => setVocabularyTestOnly(r, si, enabled, mode));
      if (enabled) {
        apply();
        scrollToBlock(`s${si}-vocab-test-head`);
      } else {
        // 끄기 → 단어시험이 사라지므로 그 위로 부드럽게 올라간 뒤 제거.
        scrollUpThenApply(blockAbovePrefix(`s${si}-vocab-test`) ?? `s${si}-head`, apply);
      }
    },
    [blockAbovePrefix, scrollToBlock, scrollUpThenApply, setReport],
  );
  const onRestoreVocabTestRows = useCallback((si: number) => {
    setReport((r) => {
      const sec = r.sections[si];
      if (!sec || sec.kind !== "vocabulary") return r;
      return setSection(r, si, { ...sec, vocabTestExcludedKeys: undefined });
    });
    scrollToBlock(`s${si}-vocab-test-head`);
  }, [scrollToBlock, setReport]);
  const onToggleWorksheetAnswers = useCallback((si: number) => {
    const sec = report.sections[si];
    // 현재 숨김 상태면 이번 토글로 '포함'이 된다 → 새로 나타나는 정답·해설로 스크롤.
    const willInclude =
      sec?.kind === "learning-worksheet" ? worksheetAnswersAreHidden(sec) : false;
    const apply = () =>
      setReport((r) => {
        const s2 = r.sections[si];
        if (!s2 || s2.kind !== "learning-worksheet") return r;
        return setSection(r, si, { ...s2, hiddenAnswers: !worksheetAnswersAreHidden(s2) });
      });
    if (willInclude) {
      apply();
      // 정답·해설 키 블록은 내용에 따라 id 가 달라 선택자로 첫 블록을 찾는다.
      scrollToSelector(`[data-paper-item-id^="s${si}-ws-answer"]`);
    } else {
      // 포함 해제 → 정답·해설이 사라지므로 그 위로 부드럽게 올라간 뒤 제거.
      scrollUpThenApply(blockAbovePrefix(`s${si}-ws-answer`) ?? `s${si}-ws-title`, apply);
    }
  }, [report, blockAbovePrefix, scrollToSelector, scrollUpThenApply, setReport]);

  const onToggleWorksheetClozeTranslations = useCallback((si: number) => {
    setReport((r) => {
      const s2 = r.sections[si];
      if (!s2 || s2.kind !== "learning-worksheet") return r;
      return setSection(r, si, {
        ...s2,
        hiddenClozeTranslations: !worksheetClozeTranslationsAreHidden(s2),
      });
    });
    scrollToBlock(`s${si}-ws-cloze`);
  }, [scrollToBlock, setReport]);

  // Delete 키로 선택 블록 삭제. 텍스트 편집 중이라도 필드가 '비어 있으면' 블록을
  // 지운다(방금 삽입한 빈 텍스트/여백 블록을 클릭 후 바로 삭제할 수 있도록).
  // 내용이 있는 필드를 편집 중일 때만 글자 삭제로 두고 블록은 보존한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || !activeId) return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.isContentEditable || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) {
        const text =
          ae.tagName === "INPUT" || ae.tagName === "TEXTAREA"
            ? (ae as HTMLInputElement | HTMLTextAreaElement).value
            : ae.textContent ?? "";
        if (text.trim().length > 0) return; // 실제 텍스트 편집 중 → 블록 보존
      }
      e.preventDefault();
      deleteActive(activeId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, deleteActive]);

  // Cmd/Ctrl+Enter: 편집 중인 블록 앞에서 페이지 넘김(breakBefore 토글).
  // 텍스트의 Enter(줄바꿈)와 짝을 이루는 '페이지 단위 줄바꿈' 느낌의 동작.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      const ae = document.activeElement as HTMLElement | null;
      const field = ae?.closest?.(".par-edit-field") as HTMLElement | null;
      if (!field) return;
      const id = field
        .closest<HTMLElement>("[data-paper-item-id]")
        ?.getAttribute("data-paper-item-id");
      if (!id) return;
      e.preventDefault();
      // 활동 블록은 기본값이 새 페이지(true)이므로 실효값 기준으로 토글.
      const isAct = report.customBlocks?.find((b) => b.id === id)?.kind === "activity";
      const current = report.blockMeta?.[id]?.breakBefore ?? isAct;
      onBlockMeta(id, { breakBefore: !current });
      scrollToBlock(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [report.blockMeta, report.customBlocks, onBlockMeta, scrollToBlock]);

  // 워드프로세서처럼: 블록의 왼쪽 여백/빈 영역을 클릭하면, 클릭한 줄에 해당하는
  // 편집 필드에 캐럿을 놓는다(필드 바깥이라 기본적으로는 커서가 안 잡히는 문제 보완).
  // 이렇게 들어간 커서에서 Enter(줄바꿈)·Cmd/Ctrl+Enter(페이지 넘김)를 바로 칠 수 있다.
  useEffect(() => {
    const caretRangeAt = (x: number, y: number): Range | null => {
      const doc = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (
          x: number,
          y: number,
        ) => { offsetNode: Node; offset: number } | null;
      };
      if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y);
      const pos = doc.caretPositionFromPoint?.(x, y);
      if (!pos) return null;
      const r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
      return r;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // 모바일(<lg): 인라인 캐럿 배치·삽입 메뉴를 통째로 끈다. 여기서 preventDefault 를
      // 호출하면 터치의 호환 mousedown 이 취소돼 블록 탭 선택(chromeProps.onMouseDown)이
      // 죽는다 — 데스크톱 마우스는 네이티브 이벤트라 영향이 없어 그동안 안 드러났던 차이.
      if (window.matchMedia("(max-width: 1023.98px)").matches) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // 삽입 메뉴 자체 클릭은 버튼 onClick 에 맡긴다.
      if (target.closest("[data-insert-menu]")) return;
      // 그 외 어디를 누르든 열려있는 삽입 메뉴는 닫는다(빈 영역이면 아래서 다시 연다).
      setInsertMenu(null);
      if (!target.closest(".par-root-edit")) return;
      // 텍스트/인터랙티브 요소를 직접 클릭한 경우는 브라우저 기본 동작에 맡긴다.
      if (target.closest(".par-edit-field")) return;
      if (
        target.closest(
          "button, a, input, textarea, select, [role='button'], .par-edit-chrome, .par-egrip2",
        )
      )
        return;
      const block = target.closest<HTMLElement>(".par-eline[data-paper-item-id]");
      if (!block) {
        // 빈 영역(블록 사이/페이지 여백) 클릭 → 그 위치에 빈 텍스트 블록 생성.
        // 시트 본문(.par-sheet-body) 안일 때만 동작(회색 배경·패널 클릭은 무시).
        if (!target.closest(".par-sheet-body")) return;
        const blocks = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".par-root-edit .par-eline[data-paper-item-id]",
          ),
        );
        let anchorId: string | null = null;
        let bestBottom = -Infinity;
        for (const b of blocks) {
          const br = b.getBoundingClientRect();
          if (br.bottom <= e.clientY && br.bottom > bestBottom) {
            bestBottom = br.bottom;
            anchorId = b.getAttribute("data-paper-item-id");
          }
        }
        e.preventDefault();
        // 즉시 삽입하지 않고, 클릭 위치에 "여백/텍스트" 선택 메뉴를 띄운다.
        setInsertMenu({ x: e.clientX, y: e.clientY, anchorId });
        return;
      }
      const fields = Array.from(
        block.querySelectorAll<HTMLElement>(".par-edit-field"),
      );
      if (fields.length === 0) return;

      const { clientX: x, clientY: y } = e;
      // 클릭한 줄(세로 위치)을 포함하는 필드 → 없으면 Y 기준 가장 가까운 필드.
      let field =
        fields.find((f) => {
          const r = f.getBoundingClientRect();
          return y >= r.top && y <= r.bottom;
        }) ?? null;
      if (!field) {
        let bestDist = Infinity;
        for (const f of fields) {
          const r = f.getBoundingClientRect();
          const d = Math.abs((r.top + r.bottom) / 2 - y);
          if (d < bestDist) {
            bestDist = d;
            field = f;
          }
        }
      }
      if (!field) return;
      const fld = field;
      const r = fld.getBoundingClientRect();
      const atStart = x <= r.left + r.width / 2; // 왼쪽 여백 → 줄 시작, 오른쪽 → 줄 끝
      e.preventDefault();
      // rAF 로 네이티브 포커스/선택 처리 이후에 캐럿을 확정한다.
      requestAnimationFrame(() => {
        fld.focus();
        const px = atStart ? r.left + 1 : r.right - 1;
        const py = Math.min(Math.max(y, r.top + 1), r.bottom - 1);
        let range = caretRangeAt(px, py);
        if (!range || !fld.contains(range.startContainer)) {
          range = document.createRange();
          range.selectNodeContents(fld);
          range.collapse(atStart);
        }
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  const { startDrag } = usePaperItemDrag({
    setActiveItemId: setActiveId,
    setDraggingItemId: setDraggingId,
    setDragOverItemId: setDragOverId,
    setDragOverPartKey: NOOP,
    setDragPlacement: setPlacement,
    onMoveItemToDropTarget: onReorder,
  });
  // usePaperItemDrag(시험지 빌더와 공용 훅)는 훅 본문에서 함수를 선언해 매 렌더 새
  // { startDrag } 를 돌려준다. 그게 아래 `edit` useMemo 의 의존성이라 edit 이 매 렌더
  // 새 객체가 되어(= useMemo 가 사실상 no-op) 문서 전체 shell 트리가 재실행됐다.
  // 공용 훅은 건드리지 않고 소비 측에서 ref 경유로 정체성만 고정한다.
  // ※ ref 대입을 렌더 본문에서 매번 수행해야 stale closure 가 생기지 않는다.
  const startDragRef = useRef(startDrag);
  startDragRef.current = startDrag;
  const stableStartDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, id: string) => startDragRef.current(event, id),
    [],
  );

  // ─── E21 조판 합성 (§3.10.21 E21-1·E21-2) ────────────────────────────────────
  // `edit` 보다 위에 둬야 한다 — 아래 P0 가드가 이 값을 읽는다(useMemo 콜백은 그 자리에서
  // 동기 실행되므로 선언이 뒤에 있으면 TDZ 다).
  // docKey 사전 검증은 **여기가 유일한 관문**이다 — `isValidDocKey` 는 판정만 제공하고
  // 강제하지 않는 것이 U1 계약이고, 규약 밖 문자가 통과하면 `scrollToBlock`(이 파일 :819-825,
  // 스펙이 인용한 구 :745-747)이 `CSS.escape` 없이 `[data-paper-item-id="${id}"]` /
  // `[data-mid="${id}"]` 를 문자열 결합하므로 조판이 조용히 깨진다.
  // 위반 문서는 콘솔로 알리고 **제외**한다(무단 통과가 더 위험).
  const composeCompanions = useMemo(() => {
    const list = composeDocs ?? [];
    const ok = list.filter((d) => isValidDocKey(d.docKey));
    if (process.env.NODE_ENV !== "production" && ok.length !== list.length) {
      console.error(
        "[compose] docKey 규약([A-Za-z0-9_]) 위반으로 제외:",
        list.filter((d) => !isValidDocKey(d.docKey)).map((d) => d.docKey),
      );
    }
    return ok;
  }, [composeDocs]);
  // 문항 축 — 미전달이면 **모듈 상수**(:184)로 폴백해 참조가 영구 고정된다.
  const composeQuestionItems = composeQuestions ?? EMPTY_QUESTION_ITEMS;
  // [E27] 지문 인터리브 축 — 미전달이면 **모듈 상수 빈 Map**(:210)으로 폴백해 참조가 영구 고정된다.
  const composeQuestionsAfterDocMap = composeQuestionsAfterDoc ?? EMPTY_QUESTIONS_AFTER_DOC;
  // 【E22 진짜 관문】(§3.10.22 E22-2 6번) 이 한 줄이 아래 6+1 소비처를 전부 켠다:
  //   `composeActiveRef`(:1601 → 외래 id 관문 :346) · `railDeletePage`(:1611) ·
  //   `edit.onDeletePage`(:1641) · `edit.onMovePage`(:1648) · `composed`(:1691) ·
  //   `composedThumb`(:1740) · 캔버스 `flowItems`(:2489 `composed?.flowItems ?? …`).
  // `composeCompanions.length > 0` 만 보면 「학습지 1(활성) + 부착 0 + 문항 N」에서
  // `composed` 가 null 이라 `flowItems` 가 `naturalFlowItems` 로 떨어져 **문항이 화면에
  // 아예 안 나온다**(U4 가 `buildComposedView` 조기 반환 가드를 같은 이유로 확장했다 —
  // compose-flow.ts 의 `companions.length === 0 && (questions?.length ?? 0) === 0`).
  // 미전달 시에는 `composeQuestionItems.length === 0` 이라 산식이 기존과 완전 동치다.
  //
  // 【E27】여기에 **`composeQuestionsAfterDocMap.size` 축을 반드시 더한다.** E27 이후 문항의
  // 정상 배치는 「문서 뒤 인터리브」라, 「학습지 1(활성) + 부착 0 + 그 지문 문항 N」이면
  // `composeQuestions`(꼬리)는 **비어 있고** 문항 전량이 이 Map 에만 들어온다. 이 항을 빼면
  // 그 조합에서 `composeActive === false` → `composed === null` → 캔버스가
  // `naturalFlowItems` 로 떨어져 **문항이 화면에 아예 안 나온다**. 위 E22 함정과 완전히 같은
  // 계통이며(에러 0 · 경고 0 · 인쇄물에서만 발견), `compose-flow.ts` 의 조기 반환 가드도
  // 같은 이유로 `(questionsAfterDoc?.size ?? 0) === 0` 을 함께 건다 — 두 판정은 **한 쌍**이다.
  // 미전달 시에는 size 가 0(모듈 상수 빈 Map)이라 산식이 E22 와 완전 동치다.
  const composeActive =
    composeCompanions.length > 0 ||
    composeQuestionItems.length > 0 ||
    composeQuestionsAfterDocMap.size > 0;
  // 위쪽(:~300)에 선언한 외래 id 관문 `rejectComposedId` 가 읽는 값. 렌더 중 대입이지만
  // **멱등**(같은 렌더 입력 → 같은 값)이라 StrictMode 이중 렌더에서도 결과가 같다 —
  // 바로 아래 `composeCachesRef` 초기화가 이미 쓰고 있는 것과 동일한 관용구다.
  // effect 로 미루면 첫 페인트 동안 관문이 열려 있어(= 조판 첫 프레임에서 삭제가 통과) 안 된다.
  composeActiveRef.current = composeActive;
  // docKey → SectionFlowCache 는 **호스트가 소유**해야 활성 문서 타이핑 시 부착 문서 재계산이
  // 0이 된다(compose-flow.ts 의 `caches` 계약). 문서 간 캐시 공유는 슬롯키 충돌로 오염이라 Map 분리.
  const composeCachesRef = useRef<Map<string, SectionFlowCache> | null>(null);
  if (!composeCachesRef.current) composeCachesRef.current = new Map();
  // 레일 썸네일의 휴지통도 `deletePage` → `hideOrDeleteIds` 로 아래 P0 와 **같은 오염 경로**다.
  // 레일 prop 은 필수(`page-thumbnail-rail.tsx:56`)라 undefined 를 줄 수 없으므로, 합성 모드에서는
  // 이유를 알리고 무동작한다 — 조용한 무동작은 "고장"으로 읽힌다.
  const railDeletePage = useCallback(
    (ids: string[]) => {
      if (composeActive) {
        toast.info("조판 중에는 페이지를 삭제할 수 없습니다. 그 학습지를 단독으로 열어 편집해 주세요.");
        return;
      }
      deletePage(ids);
    },
    [composeActive, deletePage],
  );

  const edit: ReportEdit = useMemo(
    () => ({
      med,
      sectionEdit,
      activeId,
      setActiveId,
      onReorder,
      onBlockMeta,
      setCustom,
      insertTextAfter,
      onActivity,
      ced,
      onResize,
      onColWidths,
      onSectionHeading,
      // 【P0】합성 모드에서는 두 콜백을 **내리지 않는다**(§3.10.21 E21-2 · E21-7 4번).
      // `PageControls`(`report-pages/shells.tsx:24`)는 두 콜백이 **다** 없을 때만 미렌더인데,
      // 부착 문서 페이지의 휴지통은 `hideOrDeleteIds`(`editor-mutations.ts:293-305`,
      // 특히 :300-302)가 외래 id 에 대해 **활성 report 의 blockMeta 에 `{hidden:true}` 를
      // 써 넣고**, blockMeta 는 `z.record(z.string(), blockMetaSchema)`(`schema.ts:1020`)라
      // 키 제한이 없어 **스키마를 통과해 그대로 저장된다**. movePage 쪽은 조용히 무동작.
      onDeletePage: composeActive ? undefined : deletePage,
      // `onDelete`/`onResize`/`onReorder`/`onBlockMeta` 는 여기서 끊지 **않는다** — 활성 문서
      // 편집은 조판 중에도 살아 있어야 하기 때문. 위 P0 와 완전히 같은 오염이 블록 컨트롤에도
      // 있었고(부착 문서 블록의 휴지통/그립/리사이즈), 그쪽은 ① `nsAttachedFlowItem` 의
      // `showGrip:false`/`resizable:false` 로 어포던스를 없애고 ② 각 콜백 초입의
      // `rejectComposedId`(이 파일 :~300) 로 외래 id 를 관문 차단하는 2단으로 막았다.
      onDelete: deleteActive,
      onMovePage: composeActive ? undefined : movePage,
      drag: { startDrag: stableStartDrag, draggingId, dragOverId, placement },
    }),
    // stableStartDrag/med/sectionEdit/… 는 전부 영구 안정 → edit 은 이제
    // activeId / draggingId / dragOverId / placement 4개가 바뀔 때만 새 객체가 된다.
    [med, sectionEdit, activeId, onReorder, onBlockMeta, setCustom, insertTextAfter, onActivity, ced, onResize, onColWidths, onSectionHeading, deletePage, deleteActive, movePage, stableStartDrag, draggingId, dragOverId, placement, composeActive],
  );

  // ─── 문서 FlowItem 계산 (한 번의 report 변경에 '두 벌'만) ─────────────────────
  // 예전에는 report 1회 변경마다 reportFlowItems(문서 전체 JSX 조립)가 3벌 돌았다:
  //   ① ReportPages 내부 natural(edit 포함) ② enumerateItems(descriptors, edit 없음)
  //   ③ thumbItemsById(edit 없음, deferred)
  // ①은 여기서 계산해 flowItems 로 주입하고(ReportPages 는 그대로 씀), ②③은 동일한
  // '편집 콜백 없는' 호출이므로 한 벌로 합친다 → 3벌 → 2벌.
  // 두 벌을 나눌 수밖에 없는 이유: 썸네일/descriptors 는 편집용 노드(contentEditable)를
  // 절대 공유하면 안 되고, KO 보고서에서는 edit 유무로 아이템 수가 실제로 달라진다
  // (ko-section-flow.tsx 의 `if (editable) push("ko-quiz-toggle")`).
  const editFlow = useMemo(
    () => ({ med, sectionEdit, setCustom, insertTextAfter, ced, onActivity, onSectionHeading }),
    [med, sectionEdit, setCustom, insertTextAfter, ced, onActivity, onSectionHeading],
  );
  // 섹션 단위 캐시 — 안 바뀐 섹션의 FlowItem 배열(=React 엘리먼트 참조)을 보존해
  // 측정 클론/본문/썸네일 3벌 모두에서 React 가 서브트리를 bailout 하게 한다.
  // 편집본과 읽기전용본은 슬롯 키가 겹치므로 캐시 인스턴스를 반드시 분리한다.
  const editFlowCacheRef = useRef<SectionFlowCache | null>(null);
  if (!editFlowCacheRef.current) editFlowCacheRef.current = new SectionFlowCache();
  const readOnlyFlowCacheRef = useRef<SectionFlowCache | null>(null);
  if (!readOnlyFlowCacheRef.current) readOnlyFlowCacheRef.current = new SectionFlowCache();

  /** 편집용(자연 순서). ReportPages 로 그대로 내려가 visibleFlowItems 가 적용된다. */
  const naturalFlowItems = useMemo(
    () => reportFlowItems(report, editFlow, editFlowCacheRef.current ?? undefined),
    [report, editFlow],
  );
  /** 읽기전용(편집 콜백 없음) — descriptors + 썸네일이 공유. 예전 두 호출과 인자 동일. */
  const readOnlyFlowItems = useMemo(
    () => reportFlowItems(report, undefined, readOnlyFlowCacheRef.current ?? undefined),
    [report],
  );

  /** 캔버스용 합성. 활성 구간은 **편집용** flow(naturalFlowItems)라 인라인 편집이 살아 있다. */
  const composed = useMemo(
    () =>
      composeActive
        ? buildComposedView({
            active: { report, natural: naturalFlowItems },
            companions: composeCompanions,
            caches: composeCachesRef.current ?? new Map(),
            // E22 — 합류 지점은 `buildComposedView` **안**이 유일한 정답이다(§3.10.22 E22-1).
            // 밖에서 append 하면 `applyBlockOrder`(`editor-mutations.ts:170-186`)의 splice 폴백이
            // 문항 묶음을 활성 학습지 **한가운데로 빨아들인다**(에러 0 · 인쇄물에서만 발견).
            questions: composeQuestionItems,
            // E27 — 지문 단위 인터리브. 위 `questions`(꼬리)와 **함께** 넘긴다.
            // 삽입 지점이 `buildComposedView` 안이어야 하는 이유는 바로 위 E22 주석과 동일하다
            // (`blockOrder` 사전 확정 루프보다 앞이어야 splice 폴백에 빨려 들어가지 않는다).
            questionsAfterDoc: composeQuestionsAfterDocMap,
          })
        : null,
    [
      composeActive,
      composeCompanions,
      report,
      naturalFlowItems,
      composeQuestionItems,
      composeQuestionsAfterDocMap,
    ],
  );

  // ─── [E27 · R3-2] 조판 목차 점프 · 표면 스크롤 요청 채널 ────────────────────────────
  //
  // ⚠ 이 두 소비처는 **`descriptors` 를 쓰지 않는다.** 조판 항목(부착 문서·문항)을
  // `descriptors`/`ItemDescriptor` 에 섞으면 속성 패널·드래그 재정렬이 활성 report 에 없는 id 를
  // 편집하려 들고, 그 커밋이 `blockMeta`(`schema.ts:1020` — 키 제한 없음)를 통과해 저장된다(E21-2).
  // 앵커 해석은 오직 **합성 스트림**(`composed.flowItems`)에서만 한다.

  /**
   * 앵커 해석용 스트림 미러. **렌더 중 ref 쓰기는 하지 않는다**(React Compiler 순수성 —
   * `sheet-compose-surface.tsx:719-724` activeIdRef 규약). 커밋 후 갱신으로 충분하다:
   * 목차 클릭도 표면의 스크롤 요청도 언제나 커밋 이후에 도착한다.
   *
   * `composed` 가 null(단독 편집 · 미조판)이면 `naturalFlowItems` 로 폴백한다 —
   * 그 경우에도 `kind:"doc"` + `docKey:null`(활성 문서) 요청이 문서 머리로 정상 해석되어야 한다.
   */
  const composedItemsRef = useRef<FlowItem[]>(EMPTY_FLOW_ITEMS);
  useEffect(() => {
    composedItemsRef.current = composed?.flowItems ?? naturalFlowItems;
  }, [composed, naturalFlowItems]);

  /**
   * 스크롤 요청 미러. **이 effect 는 아래 소비 effect 보다 반드시 먼저 선언돼 있어야 한다** —
   * 같은 커밋에서 effect 는 선언 순서대로 돌므로, 순서가 뒤바뀌면 소비 쪽이 **직전 요청**을 읽는다.
   * 객체째 deps 에 넣지 않는 이유는 아래 소비 effect 주석 참조(여기는 ref 대입뿐이라 무해하다).
   */
  const scrollRequestRef = useRef<ComposeScrollRequest | null>(null);
  useEffect(() => {
    scrollRequestRef.current = scrollRequest ?? null;
  }, [scrollRequest]);

  /**
   * 표면(조판) → 편집기 스크롤/글로우.
   *
   * **deps 는 `nonce` 원시값 하나뿐이다.** `scrollRequest` 객체를 그대로 넣으면 표면이 매 렌더
   * 새 객체를 만드는 순간 요청이 **없을 때도** effect 가 돌고, 그게 곧 조판 전량 재합성·재측정
   * (실측 489ms)의 방아쇠가 된다. 같은 대상을 다시 요청하려면 표면이 nonce 만 올린다
   * (사내 선례: `vocabTestActivateNonce` — `properties-panel.tsx:186-192`).
   *
   * 마운트 직후에도 요청이 있으면 발사한다(가드를 두지 않는다). 조판 표면은 활성 문서가 바뀌면
   * `key={activeDoc.reportId}` 로 편집기를 **재마운트**하는데, 「새로 체크한 학습지가 활성이 되어
   * 선두로 이동」하는 R4 시나리오가 정확히 그 경로라 첫 커밋에서 쏘지 않으면 무음 무동작이 된다.
   */
  const scrollRequestNonce = scrollRequest?.nonce ?? null;
  useEffect(() => {
    const req = scrollRequestRef.current;
    if (req === null || scrollRequestNonce === null) return;
    const id =
      req.target.kind === "block"
        ? req.target.id
        : firstBlockIdOfDoc(composedItemsRef.current, req.target.docKey);
    if (id) scrollToComposedBlock(id);
  }, [scrollRequestNonce, scrollToComposedBlock]);

  /**
   * 조판 목차 항목 클릭 — **스크롤만 한다. 활성 문서를 전환하지 않는다.**
   *
   * 전환은 표면 헤더의 문서 칩이 소유한다(`sheet-compose-surface.tsx:1114` requestActiveDoc).
   * 전환은 `key` 교체 = 편집기 **재마운트**라 미저장 편집·undo 히스토리·줌이 전부 증발하고,
   * 그 앞에 걸린 dirty confirm(`:747-761`)까지 우회된다. 목차에서 그걸 하면
   * 「목차를 눌렀을 뿐인데 편집이 사라졌다」가 된다(정찰 D 확정 위험).
   *
   * `kind:"doc"` 은 표면이 블록 id 를 알 수 없으므로(합성 시점에 접미되는 값이다) 여기서
   * `firstBlockIdOfDoc` 로 앵커를 푼다. `kind:"question"` 은 표면이 `qb-{questionId}` 를
   * 순수 문자열로 정확히 계산할 수 있어 그대로 쓴다.
   */
  const handleJumpCompose = useCallback(
    (entry: ComposeOutlineEntry) => {
      if (entry.kind === "question") {
        scrollToComposedBlock(entry.blockId);
        return;
      }
      const id = firstBlockIdOfDoc(composedItemsRef.current, entry.docKey);
      if (id) scrollToComposedBlock(id);
    },
    [scrollToComposedBlock],
  );

  // descriptors(속성 패널·목차)는 **readOnlyFlowItems 그대로** 유지한다(E21-2) —
  // 부착 문서 블록이 섞이면 활성 report 에 없는 id 를 편집하려 든다.
  const descriptors = useMemo(() => describeItems(readOnlyFlowItems), [readOnlyFlowItems]);
  // ─── 페이지 썸네일용 데이터 ───
  // 실제 블록 노드를 한 번만 계산해 모든 썸네일이 공유. 타이핑 중 썸네일
  // 재렌더가 입력을 끊지 않도록 deferred 값으로 낮은 우선순위로 갱신한다.
  // (useDeferredValue 는 같은 컴포넌트 안에서 같은 패스에 함께 지연/확정되므로
  //  deferredReport 와 deferredFlowItems 는 항상 같은 report 를 가리킨다.)
  const deferredReport = useDeferredValue(report);
  const deferredFlowItems = useDeferredValue(readOnlyFlowItems);
  // 레일이 실제로 보일 때만 썸네일 인덱스를 만든다. 모바일은 레일 자체가 미렌더이고
  // (아래 `!isMobile &&` 가드), 접힘 상태에서는 PageThumbnailRail 이 early return 이라
  // itemsById/pageInfo 를 한 번도 읽지 않는다 — 그동안은 순수 낭비였다.
  // 레일을 펼치는 순간 thumbSource 가 붙어 그대로 복구된다.
  const railActive = !isMobile && !pagesCollapsed;
  const thumbSource = railActive ? deferredFlowItems : null;
  /**
   * 썸네일용 합성 — 소스를 합류시키지 않으면 pageList 엔 부착 문서 페이지 id 가 있는데
   * itemsById 는 활성 문서 것뿐이라 **부착 문서 썸네일이 전부 빈 시트**로 뜨고,
   * coverFlags 가 어긋나 레일 페이지 번호가 캔버스와 불일치한다(E21-2).
   *
   * 활성 구간을 `readOnlyFlowItems`(=thumbSource)로 다시 합성하는 이유 — 성능·정확성 둘 다:
   *  · 정확성: `composed.flowItems` 의 활성 구간은 편집용 노드(contentEditable)라 썸네일이
   *    그걸 공유하면 바로 위 :1468-1470「두 벌을 나눌 수밖에 없는 이유」가 금지한 그 공유가
   *    된다. 반대로 활성분만
   *    readOnly 맵으로 따로 덮으면, 합성이 접미한 **활성 정답 페이지 id**(`…__d0`)가
   *    readOnly 쪽에 없어 정답 페이지 썸네일만 빈 시트가 된다 — 그래서 "합성 한 번 더"가
   *    id 축을 정확히 일치시키는 유일한 방법이다.
   *  · 성능: 부착 문서 재계산은 사실상 0이다. 두 합성 모두 companions 를
   *    `reportFlowItems(doc.report, undefined, cache)` 로 **인자가 완전히 동일**하게 부르므로
   *    같은 캐시가 같은 배열 참조를 돌려준다(flow-cache.ts:48-54). 남는 비용은 아이템당
   *    얕은 복사뿐이고, 그마저 deferred 값 위에서 돌며 레일이 접히면 아예 안 돈다.
   */
  const composedThumb = useMemo(
    () =>
      composeActive && thumbSource
        ? buildComposedView({
            active: { report: deferredReport, natural: thumbSource },
            companions: composeCompanions,
            caches: composeCachesRef.current ?? new Map(),
            // E22 — 여기에도 반드시 전달한다(§3.10.22 E22-2 7번). 빠뜨리면 `pageList` 에는
            // 문항 페이지 id 가 있는데 `thumbItemsById`(:1758-1764)가 그 id 를 모르므로 레일의
            // 문항 페이지가 **전부 빈 시트**가 되고, `thumbPageInfo`(:1766)의 coverFlags·본문
            // 번호가 캔버스와 어긋난다(E21-2 가 부착 문서에서 겪은 것과 같은 결함).
            //
            // 문항 FlowItem 은 활성 문서와 달리 편집용/읽기전용 두 벌이 없다 — 애초에 읽기전용
            // 합성분이라 contentEditable 노드가 없어(:1660-1664 「두 벌을 나눌 수밖에 없는 이유」의
            // 금지 대상이 아님) 캔버스와 **같은 배열을 그대로 공유해도 안전**하다.
            questions: composeQuestionItems,
            // E27 — **이쪽에도 반드시 전달한다.** 캔버스(:2077 `composed`)에만 넘기고 여기를 빠뜨리면
            // 위 E22 주석과 **완전히 같은 결함**이 재발한다: `pageList` 에는 인터리브된 문항
            // 페이지 id 가 있는데 `thumbItemsById` 는 그 id 를 몰라 레일의 문항 페이지가 전부
            // 빈 시트가 되고, `thumbPageInfo` 의 coverFlags·본문 번호가 캔버스와 어긋난다.
            // (인터리브는 문항을 스트림 **한가운데**로 옮기므로 어긋남이 꼬리 배치보다 더 크다.)
            questionsAfterDoc: composeQuestionsAfterDocMap,
          })
        : null,
    [
      composeActive,
      composeCompanions,
      deferredReport,
      thumbSource,
      composeQuestionItems,
      composeQuestionsAfterDocMap,
    ],
  );
  const thumbItemsById = useMemo(() => {
    const map = new Map<string, FlowItem>();
    const src = composedThumb?.flowItems ?? thumbSource;
    if (!src) return map;
    for (const it of src) map.set(it.id, it);
    return map;
  }, [composedThumb, thumbSource]);
  // 표지를 제외한 본문 페이지 번호/총수 (중앙 캔버스의 푸터 번호와 일치).
  const thumbPageInfo = useMemo(() => {
    const coverFlags = pageList.map(
      (ids) => ids.length === 1 && thumbItemsById.get(ids[0])?.wrap === "cover",
    );
    const bodyTotal = coverFlags.filter((c) => !c).length;
    let bodyNo = 0;
    const bodyNumbers = coverFlags.map((isCover) => (isCover ? 0 : ++bodyNo));
    return { coverFlags, bodyTotal, bodyNumbers };
  }, [pageList, thumbItemsById]);
  const orderedIds = useMemo(
    () => applyBlockOrder(descriptors.map((d) => d.id), report.blockOrder),
    [descriptors, report.blockOrder],
  );
  orderedIdsRef.current = orderedIds;
  const blockAbove = useCallback(
    (id: string) => {
      const i = orderedIds.indexOf(id);
      return i > 0 ? orderedIds[i - 1] : null;
    },
    [orderedIds],
  );

  // ─── 섹션 목차(상단바 팝오버) ─────────────────────────────────────────────
  // 20페이지 문서에서 타이핑 중에도 매 렌더 재계산되지 않도록 의존성을 좁힌다 —
  // reportOutline 이 실제로 읽는 필드만 나열(report 전체를 넣으면 키 입력마다 재계산).
  const outlineEntries = useMemo(
    () => reportOutline(report),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report.sections, report.hiddenSections, report.sectionHeadings, report.englishOnlyPage, report.vocabTestOnly],
  );
  // 커스텀 블록은 섹션 슬롯이 아니라 blockMeta[id].hidden 축이다(다른 스위치, 다른 그룹).
  // 단어 시험지 전용 모드에서는 assemble 이 커스텀 블록을 아예 조판하지 않으므로(assemble 의
  // `if (!vocabTestOnly)` 게이트) 목차에도 내보내지 않는다 — 안 그러면 지면에 없는 블록을
  // 끄고 켤 수 있는 것처럼 보이고, 눌러도 이동할 대상이 없어 아무 일도 일어나지 않는다.
  // (섹션 축은 section-slots 의 headless 슬롯이 이미 같은 처리를 한다.)
  const outlineCustomEntries = useMemo<OutlineCustomEntry[]>(
    () =>
      (report.vocabTestOnly ? [] : (report.customBlocks ?? [])).map((block) => ({
        id: block.id,
        label:
          block.kind === "activity"
            ? activityBlockLabel(block)
            : block.kind === "image"
              ? "지문 웹툰 이미지"
              : block.kind === "spacer"
                ? "여백 블록"
                : "텍스트 블록",
        hidden: !!report.blockMeta?.[block.id]?.hidden,
      })),
    [report.customBlocks, report.blockMeta, report.vocabTestOnly],
  );

  /** 스크롤 애니메이션 때문에 적용이 지연된 목차 토글 키 — 같은 키의 연타를 삼킨다. */
  const pendingOutlineTogglesRef = useRef<Set<string>>(new Set());

  const toggleOutlineSection = useCallback(
    (key: string) => {
      // 끌 때는 scrollUpThenApply 가 상태 반영을 최대 450ms 늦춘다(스크롤 애니메이션 뒤에 적용).
      // 그동안 팝오버 스위치는 report 파생값이라 꿈쩍도 하지 않아서, 사용자가 "안 눌렸나" 하고
      // 한 번 더 누르면 같은 turningOff 로 두 번째 토글이 예약돼 껐다 켜진다(= 두 번 껐는데 켜져 있음).
      // 대기 중인 키는 두 번째 클릭을 무시한다.
      if (pendingOutlineTogglesRef.current.has(key)) return;
      const turningOff = !(report.hiddenSections ?? []).includes(key);
      const headId = reportSectionSlots(report).find((slot) => slot.key === key)?.headId ?? null;
      const apply = () => {
        pendingOutlineTogglesRef.current.delete(key);
        setReport((r) => toggleHiddenSection(r, key));
        setActiveId(null);
      };
      // 끌 때는 사라질 자리 바로 위로 먼저 스크롤해 '튕김'을 막고, 켤 때는 그 섹션으로 이동.
      if (turningOff) {
        pendingOutlineTogglesRef.current.add(key);
        scrollUpThenApply(headId ? blockAbove(headId) : null, apply);
      } else {
        apply();
        if (headId) scrollToBlockRef.current(headId);
      }
    },
    [report, setReport, scrollUpThenApply, blockAbove],
  );

  const toggleOutlineCustom = useCallback(
    (id: string) => {
      const turningOff = !report.blockMeta?.[id]?.hidden;
      // 되돌릴 때 hidden 을 false 가 아니라 undefined 로 지워 blockMeta 를 깨끗하게 유지한다.
      const apply = () => setReport((r) => setBlockMeta(r, id, { hidden: turningOff || undefined }));
      if (turningOff) scrollUpThenApply(blockAbove(id), apply);
      else {
        apply();
        scrollToBlockRef.current(id);
      }
    },
    [report.blockMeta, setReport, scrollUpThenApply, blockAbove],
  );
  const logicalActiveId = activeId?.startsWith("c-") ? activeId.split("::", 1)[0] : activeId;
  const active: ItemDescriptor | null = useMemo(
    () => descriptors.find((d) => d.id === logicalActiveId) ?? null,
    [descriptors, logicalActiveId],
  );
  const activeMeta: BlockMeta = (logicalActiveId && report.blockMeta?.[logicalActiveId]) || {};
  const activePos = logicalActiveId ? orderedIds.indexOf(logicalActiveId) : -1;

  // 활성 학습 활동 추적 — 활동 블록을 선택하면 그 id 를 기억하고, 삭제되면 비운다.
  // 다른 블록을 선택해도 마지막 활동의 설정 섹션은 패널에 남아(접힘) 다시 펼쳐 쓸 수 있다.
  useEffect(() => {
    if (logicalActiveId && report.customBlocks?.some((b) => b.id === logicalActiveId && b.kind === "activity")) {
      setLastActivityId(logicalActiveId);
    }
  }, [logicalActiveId, report.customBlocks]);
  useEffect(() => {
    if (lastActivityId && !report.customBlocks?.some((b) => b.id === lastActivityId)) setLastActivityId(null);
  }, [lastActivityId, report.customBlocks]);
  const lastActivityBlock =
    (lastActivityId && (report.customBlocks?.find((b) => b.id === lastActivityId && b.kind === "activity") as ActivityBlock | undefined)) || null;
  const activityActive = !!lastActivityBlock && logicalActiveId === lastActivityBlock.id;

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workbench/passage-reports/prime/${passageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "저장에 실패했습니다.");
      const saved = (j.report as AnalysisReport) ?? report;
      dispatchReport({ type: "replace", report: saved, clearHistory: true });
      setBaseline(saved);
      onSaved?.(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [passageId, report, onSaved]);

  /** 사본을 만든 적이 있으면 편집기가 닫힐 때 목록을 한 번 다시 읽는다(아래 saveAs 주석 참고). */
  const listNeedsRefreshRef = useRef(false);

  /**
   * 다른 이름으로 저장 — 지금 편집 중인 보고서를 **새 학습지 사본**으로 복제한다.
   *
   * 원본(현재 passageId 의 보고서)은 한 바이트도 바뀌지 않는다. 그래서 성공해도
   * dirty/baseline/history 를 절대 초기화하지 않는다 — 사본 저장은 저장이 아니라 복제다.
   * (여기서 baseline 을 갱신하면 "저장했다고 생각하고 창을 닫아 편집을 잃는" 사고가 난다.)
   *
   * 서버가 새 지문 행을 만들었으므로 목록 갱신이 필요하지만, **여기서 바로 치면 안 된다.**
   * 호스트 목록(passage-list-client)은 모달 대상을 `passages.find(id)` 로 잡는데,
   * router.refresh() 가 목록을 새 배열로 갈아치우는 순간 그 find 가 잠시 비면
   * 모달이 통째로 언마운트되고 **저장하지 않은 편집이 소리 없이 사라진다**
   * (사본 저장은 원본 저장이 아니므로 편집은 그대로 살아 있어야 한다).
   * 그래서 갱신 요청만 표시해 두고 편집기가 닫힐 때 한 번 친다.
   * @returns 실패 사유(한국어) — 성공이면 null.
   */
  const saveAs = useCallback(async (nextTitle: string): Promise<string | null> => {
    const title = nextTitle.trim();
    if (!title) return "학습지 이름을 입력해주세요.";
    setSavingAs(true);
    try {
      const res = await fetch(`/api/workbench/passage-reports/prime/${passageId}/save-as`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 미저장 편집까지 그대로 복제한다(서버는 report 생략 시 저장본을 복제).
        body: JSON.stringify({ title, report }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) return j?.error ?? "사본 저장에 실패했습니다.";
      toast.success(`'${title}' 사본으로 저장했습니다. 원본에는 저장되지 않았습니다.`);
      listNeedsRefreshRef.current = true;
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setSavingAs(false);
    }
  }, [passageId, report]);

  useEffect(
    () => () => {
      if (listNeedsRefreshRef.current) router.refresh();
    },
    [router],
  );

  const revert = useCallback(() => {
    if (dirty && !window.confirm("저장하지 않은 편집을 모두 되돌릴까요?")) return;
    dispatchReport({ type: "replace", report: baseline, clearHistory: true });
    setActiveId(null);
  }, [dirty, baseline]);

  // 06 실전 학습지 옵트인 생성 — 서버에 저장된 보고서 위에 워크시트 섹션을 만들어 병합한다.
  // 미저장 편집이 있으면 서버 보고서 기준으로 생성되므로 먼저 저장할지 확인한다.
  const generateWorksheet = useCallback(async () => {
    if (dirty) {
      if (!window.confirm("저장하지 않은 편집은 실전 학습지에 반영되지 않아요. 먼저 저장 후 생성할까요?")) return;
      await save();
    }
    setWorksheetBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workbench/passage-reports/prime/${passageId}/worksheet`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "실전 학습지 생성에 실패했습니다.");
      const saved = (j.report as AnalysisReport) ?? report;
      dispatchReport({ type: "replace", report: saved, clearHistory: true });
      setBaseline(saved);
      onSaved?.(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorksheetBusy(false);
      // 차감/실패환급 모두 잔액이 바뀌므로 사이드바 뱃지 즉시 갱신.
      notifyCreditsChanged();
    }
  }, [dirty, save, passageId, report, onSaved]);

  const undo = useCallback(() => {
    // 실행취소로 되돌아갈 상태(past 의 마지막)와 현재 상태를 비교해, 다시 보이게 되는
    // 블록(삭제 취소로 복구된 블록)을 찾아 선택 상태로 둔다.
    // 삭제는 블록을 완전히 제거하기도 하고 blockMeta.hidden=true 로 숨기기도 하므로,
    // "보이는 블록 id" 집합(숨김 제외)을 비교해야 두 경우 모두 복구 블록을 찾을 수 있다.
    const restored = history.past[history.past.length - 1];
    let restoredId: string | null = null;
    if (restored) {
      const visibleId = (it: FlowItem, r: AnalysisReport) =>
        isActivityAnswerId(it.id) ||
        r.blockMeta?.[orderIdOf(it)]?.hidden ||
        r.blockMeta?.[it.id]?.hidden
          ? null
          : orderIdOf(it);
      const before = new Set(
        reportFlowItems(history.present)
          .map((it) => visibleId(it, history.present))
          .filter((id): id is string => !!id),
      );
      for (const it of reportFlowItems(restored)) {
        const id = visibleId(it, restored);
        if (id && !before.has(id)) {
          restoredId = id;
          break;
        }
      }
    }
    dispatchReport({ type: "undo" });
    setActiveId(restoredId);
    if (restoredId) scrollToBlockRef.current(restoredId);
  }, [history]);

  const redo = useCallback(() => {
    dispatchReport({ type: "redo" });
    setActiveId(null);
  }, []);

  // Cmd/Ctrl+Z 실행취소, Cmd/Ctrl+Shift+Z·Cmd/Ctrl+Y 다시실행.
  // 인라인 텍스트 편집(contentEditable)·입력창·선택상자에 포커스가 있을 땐 가로채지 않아
  // 브라우저 기본 텍스트 실행취소를 보존한다(엑셀·시험지 생성와 동일한 규칙).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const editing =
        !!el &&
        (el.isContentEditable ||
          el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT");
      if (editing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) redo();
        } else if (canUndo) {
          undo();
        }
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        if (canRedo) redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, canUndo, canRedo]);

  const fontScale = activeMeta.fontScale ?? 1;
  const setMetaPatch = (patch: Partial<BlockMeta>) => logicalActiveId && onBlockMeta(logicalActiveId, patch);
  const moveActive = (dir: -1 | 1) =>
    logicalActiveId && setReport((r) => ({ ...r, blockOrder: moveIdBy(orderedIds, logicalActiveId, dir) }));
  const addRow = (sectionIndex: number) =>
    setReport((r) => {
      const sec = r.sections[sectionIndex];
      if (!sec) return r;
      if (sec.kind === "passage") {
        const nextN = (sec.sentences.reduce((m, x) => Math.max(m, x.n), 0) || 0) + 1;
        return setSection(r, sectionIndex, { ...sec, sentences: [...sec.sentences, { n: nextN, en: "", ko: "" }] });
      }
      if (sec.kind === "vocabulary") return setSection(r, sectionIndex, { ...sec, rows: [...sec.rows, blankVocabRow()] });
      if (sec.kind === "grammar") return setSection(r, sectionIndex, { ...sec, rows: [...sec.rows, blankGrammarRow()] });
      if (sec.kind === "exam-focus") return setSection(r, sectionIndex, { ...sec, rows: [...sec.rows, blankExamRow()] });
      if (sec.kind === "summary") return setSection(r, sectionIndex, { ...sec, sentences: [...sec.sentences, ""] });
      return r;
    });

  // 상단 바 — 정답·해설지 포함 / 단어 시험지만 토글
  const toolbarWorksheetIndex = useMemo(
    () => report.sections.findIndex((section) => section.kind === "learning-worksheet"),
    [report.sections],
  );
  const toolbarWorksheetSection = toolbarWorksheetIndex >= 0 ? report.sections[toolbarWorksheetIndex] : null;
  // 기본 분석은 logicRows 만 든 learning-worksheet 를 만든다. 실제 06 워크북/추론 콘텐츠가
  // 있을 때만 '정답지 토글'을 보이고, 없을 때만 '실전 학습지 생성' 버튼을 보인다.
  const toolbarWorksheetHasContent =
    toolbarWorksheetSection?.kind === "learning-worksheet" &&
    (!!toolbarWorksheetSection.workbookSet ||
      !!toolbarWorksheetSection.inferenceSet ||
      !!toolbarWorksheetSection.cloze ||
      !!toolbarWorksheetSection.practice ||
      !!toolbarWorksheetSection.drills);
  const toolbarAnswerKeyIncluded =
    toolbarWorksheetSection?.kind === "learning-worksheet" ? !worksheetAnswersAreHidden(toolbarWorksheetSection) : false;

  // 저장·실전 학습지 생성 버튼을 모달 헤더에서 렌더하도록 상태/함수를 끌어올린다.
  // save/generateWorksheet 는 편집마다 정체성이 바뀌므로 ref 로 안정화 — 의미 있는 상태
  // (dirty/saving/busy/hasContent)가 바뀔 때만 부모에 보고해 키 입력마다 모달이 리렌더되는 것을 막는다.
  const saveRef = useRef(save);
  const genRef = useRef(generateWorksheet);
  useEffect(() => {
    saveRef.current = save;
    genRef.current = generateWorksheet;
  }, [save, generateWorksheet]);
  const stableSave = useCallback(() => saveRef.current(), []);
  const stableGenerateWorksheet = useCallback(() => genRef.current(), []);
  // '다른 이름으로 저장'은 다이얼로그를 여는 것뿐이라 setState 세터만 닫아 잡는다 —
  // deps 가 빈 useCallback 이므로 save/generateWorksheet 와 동일하게 정체성이 영원히 고정된다.
  // (편집 중인 report·title 을 여기로 끌어들이면 키 입력마다 호스트 모달이 리렌더된다.)
  const stableRequestSaveAs = useCallback(() => setSaveAsOpen(true), []);
  useEffect(() => {
    onToolbarStateChange?.({
      dirty,
      saving,
      save: stableSave,
      worksheetBusy,
      worksheetHasContent: toolbarWorksheetHasContent,
      // KO·파이널 원페이지 문서는 실전 학습지(영어 전용 파이프라인) 미지원 — 호스트가 생성 버튼을 숨긴다.
      worksheetSupported: !koReport && !finalOnepage,
      generateWorksheet: stableGenerateWorksheet,
      requestSaveAs: stableRequestSaveAs,
      // savingAs 는 사본 저장 시작·종료에만 바뀌는 의미 있는 boolean 이라 보고해도 안전하다.
      savingAs,
    });
  }, [dirty, saving, stableSave, worksheetBusy, toolbarWorksheetHasContent, koReport, finalOnepage, stableGenerateWorksheet, stableRequestSaveAs, savingAs, onToolbarStateChange]);
  useEffect(
    () => () => onToolbarStateChange?.(null),
    [onToolbarStateChange],
  );

  // 첫 단어장 섹션 대상
  const toolbarVocabularyIndex = useMemo(
    () => report.sections.findIndex((section) => section.kind === "vocabulary"),
    [report.sections],
  );
  const toolbarVocabularySection = toolbarVocabularyIndex >= 0 ? report.sections[toolbarVocabularyIndex] : null;
  const toolbarVocabMode: VocabTestMode =
    toolbarVocabularySection?.kind === "vocabulary" ? toolbarVocabularySection.vocabTestMode ?? "study" : "study";
  const toolbarVocabTestEnabled = !!report.vocabTestOnly || toolbarVocabMode !== "study";
  const VOCAB_TEST_MODE_LABEL: Record<VocabTestMode, string> = {
    study: "꺼짐",
    "hide-meaning": "뜻 쓰기",
    "hide-headword": "단어 쓰기",
    synonym: "동의어 쓰기",
    antonym: "반의어 쓰기",
  };
  // 단어 시험지를 학습 활동 카드처럼 켜는 핸들러 — 켜고 우측 패널에 '단어 시험지 설정' 섹션을 펼친다.
  // (문서를 스크롤/점프시키지 않으려고 onVocabTestMode 대신 setReport 로 직접 모드만 켠다.)
  const activateVocabTest = () => {
    if (finalOnepage && toolbarVocabularyIndex < 0 && sourceHasVocab) {
      // 파이널 문서엔 vocabulary 섹션이 없다 — 소스(기본 리포트)의 섹션을 승격 주입한다(E23).
      // hiddenSections "vocabulary" 등록이 핵심: 파이널 슬롯 경로(section-slots.ts 의
      // final-onepage 조기 반환)는 주입 섹션에 슬롯을 만들지 않으므로, 지면 출력은 assemble 의
      // 「숨긴 단어장 + 켜진 시험지」 특례 emit(hidden.has("vocabulary"))이 유일한 경로다 —
      // 시험지 페이지만 나오고 학습용 단어장 표는 나오지 않는다(의도된 동작).
      const si = report.sections.length; // 주입 섹션 인덱스 — sections 끝에 추가된다
      setReport((r) => injectVocabTestSection(r, activitySourceRef.current));
      scrollToBlock(`s${si}-vocab-test-head`);
    } else if (!toolbarVocabTestEnabled) {
      setReport((r) => setVocabularyTestMode(r, toolbarVocabularyIndex, "hide-meaning"));
    }
    setVocabTestFocused(true);
    setVocabTestActivateNonce((n) => n + 1);
    setMaterialSettingsOpen(false);
    // narrow 임베드에서 활동 팔레트와 동시 열림을 막는 배타 규칙 경유(캔버스 소멸 방지).
    openPropertiesPanelExclusive();
  };
  // 카드의 ON 스위치 — 단어 시험지 끄기. "study" 모드는 vocabTestOnly 까지 함께 해제하며,
  // onVocabTestMode 가 사라지는 시험지 위로 부드럽게 스크롤한 뒤 제거한다.
  const deactivateVocabTest = () => {
    if (finalOnepage) {
      // 파이널의 vocabulary 는 정의상 전부 주입본(E23) — 섹션 제거 + hidden 키 정리로 원복한다.
      setReport((r) => removeInjectedVocabSection(r));
      return;
    }
    if (toolbarVocabTestEnabled) onVocabTestMode(toolbarVocabularyIndex, "study");
  };
  const canToggleToolbarVocabTestOnly =
    toolbarVocabularySection?.kind === "vocabulary" && toolbarVocabularySection.rows.length > 0;

  // 우측 편집 패널(세그먼트 토글 + PropertiesPanel) — 데스크톱 aside 와 모바일
  // 풀스크린 시트가 같은 JSX 를 공유한다(프롭 중복·드리프트 방지). 한 시점엔 한쪽만 렌더.
  const editPanelAside = (
    // data-panel-key: usePanelWidths 드래그 고속 경로 앵커 — 아래 애니메이션
    // 컨테이너와 함께 드래그 중 style.width 직접 기록 대상(데스크톱 전용 —
    // 모바일 시트에서는 폭 핸들이 렌더되지 않아 드래그가 시작되지 않는다).
    <aside
      data-panel-key="panel"
      style={{ width: isMobile ? "100%" : panelWidth }}
      className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-slate-50/80"
    >
              <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2">
                {/* 편집 ↔ 설정 세그먼트 토글 (시험지 생성 패널과 동일 패턴) */}
                <div
                  role="tablist"
                  aria-label="학습지 편집 패널"
                  className="relative grid grid-cols-2 overflow-hidden rounded-md border border-blue-200 bg-white p-1"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded bg-blue-600 shadow-sm shadow-blue-600/20 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      materialSettingsOpen && "translate-x-full",
                    )}
                  />
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!materialSettingsOpen}
                    onClick={() => setMaterialSettingsOpen(false)}
                    className={cn(
                      "relative z-10 h-8 rounded px-2 text-[12px] font-black transition-colors duration-200",
                      !materialSettingsOpen ? "text-white" : "text-blue-700 hover:text-blue-900",
                    )}
                  >
                    편집
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={materialSettingsOpen}
                    onClick={() => setMaterialSettingsOpen(true)}
                    className={cn(
                      "relative z-10 h-8 rounded px-2 text-[12px] font-black transition-colors duration-200",
                      materialSettingsOpen ? "text-white" : "text-blue-700 hover:text-blue-900",
                    )}
                  >
                    설정
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[11px] font-semibold text-slate-400">
                    {materialSettingsOpen ? "표지·로고·디자인·템플릿" : active ? "선택 블록 조정" : "문서 설정"}
                  </p>
                  {materialSettingsOpen ? (
                    <SettingsTemplatePopover
                      onSave={onSaveReportSettings}
                      onApply={onApplyReportSettings}
                      onDelete={onDeleteReportSettings}
                      onReset={onResetReportSettings}
                    />
                  ) : null}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2.5 [scrollbar-gutter:stable]">
                {/* 설정 ↔ 편집 전환 시 부드러운 슬라이드·페이드. key 로 콘텐츠를 갈아끼워 진입 애니메이션을 재생.
                    탭 위치(편집=좌, 설정=우)에 맞춰 들어오는 방향을 준다. */}
                <div
                  key={materialSettingsOpen ? "settings" : "edit"}
                  className={cn(
                    "animate-in fade-in-0 duration-300 ease-out",
                    materialSettingsOpen ? "slide-in-from-right-2" : "slide-in-from-left-2",
                  )}
                >
                <PropertiesPanel
                  // [E21-3] 섹션 순서/접힘 2키까지 임베드 ns 로 격리(폭 3키·defaultApplied 와 동일 규약).
                  // 미전달 시 undefined → 현행 상수 키라 독립 라우트는 바이트 동일.
                  storageNamespace={storageNs}
                  report={report}
                  active={active}
                  activeMeta={activeMeta}
                  activeCustom={(logicalActiveId && report.customBlocks?.find((b) => b.id === logicalActiveId)) || null}
                  activityBlock={lastActivityBlock}
                  activityActive={activityActive}
                  activityActivateNonce={activityActivateNonce}
                  // E23 — 활동 문장 범위 UI 근거(genReport 기준 문장 수). additive: 미전달이면
                  // 패널이 현행 passage 계산으로 폴백한다(U4).
                  activitySentenceCount={activitySentenceCount}
                  onActivateActivity={() => {
                    if (lastActivityId) {
                      setActiveId(lastActivityId);
                      scrollToBlock(lastActivityId);
                      setActivityActivateNonce((n) => n + 1);
                    }
                  }}
                  activePos={activePos}
                  total={orderedIds.length}
                  fontScale={fontScale}
                  coverError={coverError}
                  onCoverPatch={setCoverPatch}
                  onLogoFile={onLogoFile}
                  onTheme={(t) => setReport((r) => ({ ...r, themeId: t }))}
                  onToggleEnglishPage={() => {
                    const turningOn = !report.englishOnlyPage;
                    setReport((r) => ({ ...r, englishOnlyPage: !r.englishOnlyPage }));
                    if (turningOn) scrollToBlock("english-only-0");
                    else scrollToPage(0);
                  }}
                  onBrand={(v) => setReport((r) => ({ ...r, brand: v }))}
                  settingsOpen={materialSettingsOpen}
                  onMetaPatch={setMetaPatch}
                  onMove={moveActive}
                  onAddRow={addRow}
                  onSetCustom={setCustom}
                  onActivity={onActivity}
                  onDeleteItem={deleteActive}
                  onToggleCol={onToggleCol}
                  onToggleWorksheetAnswers={onToggleWorksheetAnswers}
                  onToggleWorksheetClozeTranslations={onToggleWorksheetClozeTranslations}
                  onVocabTestMode={onVocabTestMode}
                  onVocabTestLayout={onVocabTestLayout}
                  onVocabStudyLayout={onVocabStudyLayout}
                  onVocabTestOnly={onVocabTestOnly}
                  onRestoreVocabTestRows={onRestoreVocabTestRows}
                  onVocabTierFilter={onVocabTierFilter}
                  vocabTestFocused={vocabTestFocused}
                  vocabTestActivateNonce={vocabTestActivateNonce}
                  vocabSectionIndex={toolbarVocabularyIndex}
                  onScrollToBlock={scrollToBlock}
                  onDeleteCustom={(id) => deleteActive(id)}
                  onDeleteSection={(si) => {
                    if (window.confirm("이 섹션 전체를 삭제할까요?")) {
                      const prev = blockAbove(`s${si}-head`);
                      setReport((r) => deleteSection(r, si));
                      setActiveId(null);
                      if (prev) scrollToBlock(prev);
                      else scrollToPage(0);
                    }
                  }}
                />
                </div>
              </div>
    </aside>
  );

  return (
    <div
      // narrow 는 CSS 훅일 뿐이다 — `.are-shell[data-embed-narrow]` **스코프 규칙**만 붙는다
      // (§3.10.4 계열 전역 규칙 신설 금지). 미전달이면 속성 자체가 렌더되지 않아 바이트 동일.
      data-embed-narrow={embed?.narrow ? "" : undefined}
      className="are-shell flex h-full min-h-0 flex-col overflow-hidden bg-[#F4F6F9]"
    >
      <style dangerouslySetInnerHTML={{ __html: ANALYSIS_REPORT_EDIT_CSS }} />

      <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
        {/* 좌측 컬럼 — 상단바 + 작업 영역(팔레트·페이지·캔버스). 상단바가 미리보기(캔버스) 우측 끝에서
            끝나도록, 우측 편집 패널은 이 컬럼 바깥의 전체 높이 형제로 둔다(패널이 위까지 채워짐). */}
        <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
          <EditorTopBar
            outlineSlot={
              <SectionOutlinePopover
                entries={outlineEntries}
                customEntries={outlineCustomEntries}
                pageCount={pageList.length}
                onToggleSection={toggleOutlineSection}
                onToggleCustom={toggleOutlineCustom}
                onJump={scrollToBlock}
                // [E27 · R3-0/R3-1] **버튼 증설 0** — 기존 「목차」 팝오버 1개가 조판 트리를
                // 흡수한다(사용자 확정). 두 prop 다 옵셔널이라 미조판(단독 편집)에서는
                // `composeOutline` 이 undefined 라 팝오버가 기존과 픽셀 동일하게 렌더된다.
                // `onJumpCompose` 는 **스크롤 전용**이다 — 활성 문서 전환은 표면 헤더 칩 몫
                // (여기서 하면 재마운트로 미저장 편집이 증발한다). 자세한 근거는
                // `handleJumpCompose` 머리주석.
                composeGroups={composeOutline}
                onJumpCompose={handleJumpCompose}
              />
            }
            error={error}
            dirty={dirty}
            saving={saving}
            canUndo={canUndo}
            canRedo={canRedo}
            worksheetBusy={worksheetBusy}
            worksheetHasContent={toolbarWorksheetHasContent}
            showGenerateWorksheet={!onToolbarStateChange && !koReport && !finalOnepage}
            // 저장 버튼을 끌어올리지 않는 컨텍스트에는 사본 저장 입구가 없다 — 툴바에 인라인으로 둔다.
            showSaveAs={!onToolbarStateChange}
            savingAs={savingAs}
            onSaveAs={stableRequestSaveAs}
            answerKeyIncluded={toolbarAnswerKeyIncluded}
            onToggleAnswers={() => onToggleWorksheetAnswers(toolbarWorksheetIndex)}
            onUndo={undo}
            onRedo={redo}
            onRevert={revert}
            onGenerateWorksheet={generateWorksheet}
          />
          <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 좌측 끝 — 학습 활동 팔레트 (편집 패널과 같은 세로 탭 여닫힘 매커니즘 + 부드러운 폭 애니메이션)
            모바일(<lg)에선 페이지 레일과 함께 숨겨 캔버스가 전체 폭을 쓴다. */}
        {!isMobile && (
        <>
        {/* E23 — 파이널 원페이지에서도 팔레트 상시 노출(게이트 제거). 활동 생성 소스는 "지문"
            이지 "문서"가 아니다: 파이널이면 같은 지문의 기본 리포트(activitySource →
            activityGenReport)로 생성·미리보기하고, 소스가 없으면(T1 강등) availability 가
            en-계 활동만 연다 — 빈 블록 삽입 경로 0(I5).
            koMode 재사용은 여전히 불가 — 웹툰 피커 subject 가 KOREAN 으로 오염된다. */}
        <ActivityPaletteRail
          koMode={koReport}
          finalContext={finalOnepage}
          collapsed={activityCollapsed}
          onToggleCollapsed={toggleActivityPanel}
          activityWidth={activityWidth}
          widthDragging={widthDragging}
          onStartActivityDrag={(event) => startWidthDrag(event, "activity")}
          onConsumeDragClick={consumeWidthDragClick}
          webtoonPickerOpen={webtoonPickerOpen}
          passageId={passageId}
          onOpenWebtoonPicker={() => setWebtoonPickerOpen(true)}
          onCloseWebtoonPicker={() => setWebtoonPickerOpen(false)}
          onPickWebtoon={insertImageBlock}
          report={activityGenReport}
          onPickActivity={insertActivity}
          activityCounts={activityCountByKind}
          onToggleOffKind={removeActivityKind}
          availability={activityAvailability}
          vocabTestSlot={
                  // 파이널은 vocabulary 섹션이 없어도 소스(기본 리포트)에 어휘가 있으면 켤 수
                  // 있다 — activateVocabTest 가 소스 섹션을 승격 주입한다(E23). KO 는 계속 숨김.
                  !koReport && (canToggleToolbarVocabTestOnly || (finalOnepage && sourceHasVocab)) ? (
                    // 헤더의 스위치가 실제 <button> 이라 카드 자체는 div[role=button] 으로(중첩 버튼 금지).
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={toolbarVocabTestEnabled}
                      onClick={() => (toolbarVocabTestEnabled ? deactivateVocabTest() : activateVocabTest())}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          if (toolbarVocabTestEnabled) deactivateVocabTest();
                          else activateVocabTest();
                        }
                      }}
                      title={toolbarVocabTestEnabled ? "단어 시험지 끄기" : "단어 시험지 켜기"}
                      className={cn(
                        // 꺼짐 상태도 파랑을 유지한다 — 회색(border-slate-200 bg-white)이면 흰 배경에 묻혀
                        // '꺼져 있음'이 곧 '존재감 없음'이 된다(사용자 지적). ring 으로 켜짐/꺼짐을 가른다.
                        "group flex w-full cursor-pointer flex-col gap-2 rounded-xl border p-3 text-left transition-all",
                        toolbarVocabTestEnabled
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/15 hover:bg-blue-100/60"
                          : "border-blue-300 bg-white shadow-sm ring-1 ring-blue-100 hover:border-blue-400 hover:bg-blue-50/50 hover:ring-blue-200",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                            toolbarVocabTestEnabled
                              ? "bg-blue-600 text-white"
                              : "bg-blue-50 text-blue-500 group-hover:bg-blue-100",
                          )}
                        >
                          <FileQuestion className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-black text-slate-900">단어 시험지</span>
                          <span className="block truncate text-[10.5px] font-semibold text-slate-400">
                            지문 단어로 시험지 페이지 생성
                          </span>
                        </span>
                        <ActivityToggleSwitch
                          on={toolbarVocabTestEnabled}
                          title={toolbarVocabTestEnabled ? "단어 시험지 끄기" : "단어 시험지 켜기"}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (toolbarVocabTestEnabled) deactivateVocabTest();
                            else activateVocabTest();
                          }}
                        />
                      </div>
                      <div
                        className={cn(
                          "rounded-lg border px-2 py-1.5",
                          toolbarVocabTestEnabled ? "border-blue-200 bg-white/70" : "border-blue-100 bg-blue-50/70",
                        )}
                      >
                        <span className="text-[9px] font-black uppercase tracking-wider text-blue-400">
                          {toolbarVocabTestEnabled ? "현재 출제" : "지금 꺼짐"}
                        </span>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold leading-snug text-blue-700">
                          {/* truncate 는 「…·반의어」 꼬리를 잘라 정보를 잃는다 — 2줄 클램프로 무손실. */}
                          <span className="min-w-0 flex-1 line-clamp-2">
                            {toolbarVocabTestEnabled
                              ? `${VOCAB_TEST_MODE_LABEL[toolbarVocabMode]}${report.vocabTestOnly ? " · 시험지만" : ""}`
                              : "눌러서 켜기 — 뜻·단어·동의어·반의어"}
                          </span>
                          <ChevronRight className="size-3 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
                        </p>
                      </div>
                    </div>
                  ) : finalOnepage && !koReport && !canToggleToolbarVocabTestOnly && !sourceHasVocab ? (
                    // 파이널 + 소스에 출제 대상 어휘 없음(T1 강등 포함) — 슬롯을 조용히 비우면
                    // 「어제는 있었는데 사라졌다」로 읽힌다(무설명 증발). 비활성 카드로 이유를
                    // 남긴다. 다른 문서 축(기본/KO)은 현행 null 유지 — 이 분기는 파이널 전용.
                    <div
                      aria-disabled="true"
                      className="flex w-full cursor-not-allowed flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-left opacity-80"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                          <FileQuestion className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-black text-slate-400">단어 시험지</span>
                          <span className="block truncate text-[10.5px] font-semibold text-slate-300">
                            지문 단어로 시험지 페이지 생성
                          </span>
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white/70 px-2 py-1.5">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                          데이터 없음
                        </span>
                        <p className="mt-0.5 text-[11px] font-bold leading-snug text-slate-400">
                          기본 학습지가 있어야 켤 수 있어요
                        </p>
                      </div>
                    </div>
                  ) : null
          }
        />

        {/* 좌측 — 페이지 인디케이터 */}
        <PageThumbnailRail
          collapsed={pagesCollapsed}
          onExpand={expandPagesPanel}
          onCollapse={collapsePagesPanel}
          railWidth={railWidth}
          pageList={pageList}
          scrollerRef={pagesPanelScrollerRef}
          activePageIndex={activePageIndex}
          onSelectPage={scrollToPage}
          // 썸네일은 합성 pagesReport(=blockMeta·blockOrder 사전 확정본)를 봐야 캔버스와
          // 같은 조판을 그린다. 미합성이면 참조까지 현행 그대로다.
          report={composedThumb?.pagesReport ?? deferredReport}
          itemsById={thumbItemsById}
          pageInfo={thumbPageInfo}
          onDeletePage={railDeletePage}
          onStartRailDrag={(event) => startWidthDrag(event, "rail")}
          // 합성 중 페이지 재정렬은 활성 report 의 blockOrder 를 부착 문서 페이지 기준으로
          // 다시 쓰게 되어 삭제와 같은 오염이다 → 드래그 핸들 자체를 미렌더(:314 가드).
          onReorderPages={composeActive ? undefined : reorderPages}
        />
        </>
        )}

        {/* 중앙 — A4 캔버스 (자연 크기, 드래그 autoscroll 용 id) */}
        <EditorCanvas
          pageList={pageList}
          zoom={zoom}
          zoomControlsPos={zoomControlsPos}
          onZoomIn={zoomPreviewIn}
          onZoomOut={zoomPreviewOut}
          onReset={resetPreviewZoom}
          onFit={fitPreviewToScreen}
          onZoomControlsDragStart={handlePreviewZoomControlsDragStart}
          scrollerRef={previewScrollerRef}
          onDeselect={deselect}
          a4Width={REPORT_A4_WIDTH_PX}
          contentHeight={previewContentHeight}
          // 여기만 합성본으로 바꾼다 — **편집 상태 `report`(useReducer present)는 무접촉**이고,
          // 저장 PATCH 는 끝까지 활성 문서 1개다(E21-0).
          report={composed?.pagesReport ?? report}
          edit={edit}
          onPagesChange={setPageList}
          flowItems={composed?.flowItems ?? naturalFlowItems}
          printRootId={embed?.printRootId}
          printExclude={embed?.printExclude}
        />

        {/* 인라인 텍스트 편집용 떠다니는 서식 툴바 — 모바일은 인라인 편집 자체가 꺼져 있어 미렌더 */}
        {!isMobile && (
        <FloatingFormatToolbar
          blockMeta={report.blockMeta}
          onBlockMeta={onBlockMeta}
          onClozeBlank={(blockId, itemIndex, start, end) => onActivity(blockId, { type: "blankItem", index: itemIndex, start, end })}
        />
        )}

        {/* 학습 활동 팔레트는 우측 편집 패널 '활동' 탭으로 이동 (모달 제거) */}

        {/* 빈 영역 클릭 시 뜨는 블록 삽입 메뉴(여백/텍스트) — 모바일 제외(오조작 방지) */}
        {insertMenu && !isMobile
          ? createPortal(
              <div
                data-insert-menu
                role="menu"
                style={{
                  position: "fixed",
                  left: insertMenu.x,
                  top: insertMenu.y - 10,
                  transform: "translate(-50%, -100%)",
                }}
                className="no-print z-[80] flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-[12px] shadow-xl"
              >
                <span className="px-1.5 text-[11px] font-semibold text-slate-400">
                  여기에 추가
                </span>
                <button
                  type="button"
                  onClick={() => {
                    insertBlockAt("text", insertMenu.anchorId, "after");
                    setInsertMenu(null);
                  }}
                  className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  텍스트
                </button>
                <button
                  type="button"
                  onClick={() => {
                    insertBlockAt("spacer", insertMenu.anchorId, "after");
                    setInsertMenu(null);
                  }}
                  className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  여백
                </button>
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 -bottom-1 size-2 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white"
                />
              </div>,
              document.body,
            )
          : null}
          </div>
        </div>

        {/* 우측 — 속성(편집) 패널. 세로 탭 = 여닫기 + 폭조절 겸용 핸들(시험지 생성 UI와 동일).
            펼친 상태: 드래그로 폭 조절, 클릭으로 닫기. 접힌 상태: 클릭으로 열기. */}
        <button
          type="button"
          onPointerDown={
            panelCollapsed ? undefined : (event) => startWidthDrag(event, "panel")
          }
          onClick={() => {
            if (!panelCollapsed && consumeWidthDragClick()) return;
            // 토글은 항상 즉시 반영된다(사다리 강제도 이걸 막지 않는다 — 위 forceCollapsed
            // 주석의 실측 근거). narrow 임베드에서는 배타 규칙이 함께 돌아 캔버스를 지킨다.
            togglePropertiesPanel();
          }}
          title={panelCollapsed ? "편집 패널 열기" : "드래그하여 폭 조절 · 클릭하여 닫기"}
          aria-label={panelCollapsed ? "편집 패널 열기" : "편집 패널 닫기"}
          aria-expanded={!panelCollapsed}
          className={cn(
            "group/rhandle no-print hidden h-full min-h-0 w-5 shrink-0 touch-none select-none flex-col items-center justify-center gap-1 border-l border-slate-200 bg-white/80 py-2 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 lg:flex",
            !panelCollapsed && "cursor-col-resize",
          )}
        >
          {panelCollapsed ? (
            <ChevronLeft className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <span style={{ writingMode: "vertical-rl" }}>편집 패널</span>
          {!panelCollapsed ? (
            <GripVertical className="h-3 w-3 opacity-40 transition-opacity group-hover/rhandle:opacity-70" />
          ) : null}
        </button>
        {/* 애니메이션 컨테이너 — 폭을 0↔패널폭으로 부드럽게 전환. 모바일은 시트로 대체. */}
        {!isMobile && (
        <div
          aria-hidden={panelCollapsed}
          data-panel-key="panel"
          className="no-print flex h-full min-h-0 shrink-0 overflow-hidden"
          style={{
            width: panelCollapsed ? 0 : panelWidth,
            transition: widthDragging ? "none" : "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
            {editPanelAside}
        </div>
        )}
      </div>

      {/* ── 모바일 전용(<lg) — 하단 액션 바(셸 푸터) + 편집 패널 풀스크린 시트 ──
          블록 미선택: '학습지 설정' 진입 버튼. 블록 선택: 위로/아래로/상세 편집/삭제.
          데스크톱은 isMobile=false 라 전부 미렌더. */}
      {isMobile && (
        <MobileReportActionBar
          active={active}
          canMove={activePos >= 0}
          onMoveUp={() => moveActive(-1)}
          onMoveDown={() => moveActive(1)}
          onOpenDetail={() => setMobilePanelOpen(true)}
          onDelete={() => {
            if (logicalActiveId) deleteActive(logicalActiveId);
          }}
          onDeselect={() => setActiveId(null)}
          onOpenSettings={() => {
            setMaterialSettingsOpen(true);
            setMobilePanelOpen(true);
          }}
        />
      )}
      {isMobile && mobilePanelOpen && (
        <MobilePanelSheet
          title={materialSettingsOpen ? "학습지 설정" : active ? "블록 상세 편집" : "문서 설정"}
          onClose={() => setMobilePanelOpen(false)}
        >
          {editPanelAside}
        </MobilePanelSheet>
      )}

      {/* '다른 이름으로 저장' — 호스트가 아니라 편집기가 소유한다(호스트마다 복제하면 즉시 드리프트).
          호스트는 계약의 requestSaveAs() 만 부르고, 성공해도 원본 dirty/baseline 은 그대로다. */}
      <ReportSaveAsDialog
        open={saveAsOpen}
        onOpenChange={setSaveAsOpen}
        sourceTitle={report.meta.titleKo}
        dirty={dirty}
        saving={savingAs}
        onSubmit={saveAs}
      />
    </div>
  );
}
