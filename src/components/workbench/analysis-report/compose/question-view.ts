// ============================================================================
// question-view — E22 조판실: BuilderQuestion[] → 조판용 순수 뷰모델
// (docs/class-studio-spec.md §3.10.22 E22-1 · .tmp-worksheet-compose/E22-UNITS.md [U2])
// ============================================================================
//
// 「합본은 한 묶음 인쇄이지 한 레코드 저장이 아니다」(스펙 E22-0 계약 1). 문항은 리포트
// 문서 스키마에 저장될 수 없으므로(schema.ts:660 questions.max(8) · :799-812 activityKind
// 닫힌 enum 12종 · :815-826 activityItem 에 선지 필드 없음) **in-memory · 읽기 전용**
// FlowItem 으로만 존재한다. 이 파일은 그 파이프라인의 1단계 — DB 형상(BuilderQuestion)을
// 표기까지 확정된 **순수 문자열/배열 뷰모델**로 굳힌다. 2단계(U3 question-flow.tsx)가
// 이 뷰모델을 FlowItem 으로 감싼다.
//
// 계약(compose-ids.ts 머리주석과 동일 계열):
//   - `"use client"` 없음 · React import 없음 · JSX 0 · 부수효과 0.
//   - **결정적**(deterministic): 같은 입력이면 같은 출력. 렌더 중(useMemo) 호출해도
//     StrictMode 이중 렌더에서 결과가 문자 단위로 동일하다.
//     ⚠ 아래 [함정 2] 참조 — makePaperItem 이 내부에서 Date.now()/Math.random() 을
//     쓰지만 그 산출물(localId)을 **전량 폐기**하므로 이 계약이 성립한다.
//
// ─── 재발 금지 함정 (전부 코드 실측 · E22-UNITS [U2] 1~6) ────────────────────────
//
//  [함정 1] **입력 id 순서 미보존**
//     `getExamPaperBuilderQuestionsByIds`(`src/actions/exam-paper-builder.ts:634-648`)는
//     `orderBy: [{ starred: "desc" }, { createdAt: "desc" }]` 로 정렬해 돌려준다 —
//     **입력 ids 배열 순서를 보존하지 않는다.** 그대로 쓰면 「체크 순번 배지」와
//     「인쇄 순서」가 어긋난다. → 이 파일이 `ids` 배열 순서로 **재정렬**하는 것이 정본이며,
//     호출부(U8 use-compose-questions)는 서버 반환 배열을 절대 그대로 흘리지 않는다.
//
//  [함정 2] **makeLocalId 폐기**
//     `makeLocalId`(`paper-item-utils.tsx:97-99`)는 `${questionId}-${Date.now()}-${random}`
//     이라 호출마다 값이 바뀐다. 이 값이 FlowItem id 로 새어 나가면
//     `pages.tsx:80 itemsById` / `:121 heightById` 가 매 렌더 전부 미스 나서
//     **에러 0 · 「조용한 페이지 넘침」**으로만 드러난다(E21-7 함정 2와 같은 계통).
//     → 이 파일은 `item.localId` 를 **한 번도 읽지 않는다**. 아이덴티티는 `questionId` 뿐.
//
//  [함정 3] **buildGroups 를 부르지 않는다**
//     `buildGroups`(`paper-item-utils.tsx:504-573`)는 PaperItem 배열을 시험지 그룹으로
//     묶으면서 `applyKoSetSharedPassages`·`formatPassageContentForGroup` 를 부수효과처럼
//     실행하고 그룹 객체를 **제자리 변형(mutate)** 한다. 조판실은 mm 실측 파이프라인이라
//     그 그룹 모델을 소비할 곳이 없다. → 세트는 `setId` 로만 직접 묶고
//     (같은 setId **연속 구간의 첫 멤버만** `includePassage:true`),
//     KO 세트는 아예 `unsupported` 로 떨군다(아래 [미지원] 1번).
//
//  [함정 4] **평문 누수 금지**
//     A4 전용 컴포넌트가 있어야 뜻이 통하는 유형을 「그냥 문자열로」 흘리면
//     (A)(B)(C) 컬럼 귀속이 사라지거나 직렬화 마커가 학생지에 그대로 인쇄된다.
//     → `unsupported` 가 `null` 이 아니면 **본문 필드를 전부 비운다**(구조적 차단).
//
//  [함정 5] **구조화 조판 레이어 우회 금지** (26-08-18 적대검수 확정 결함 #1)
//     `structuredSegments`(`question-body-layout.ts:355`)를 안 타고 `item.questionText` 를
//     통째로 발문에 흘리면 [함정 4] 가 금지한 평문 누수가 **unsupported 배지 없이** 발생했다.
//     실측(클래스 「2학년」 조판실):
//       · SENTENCE_ORDER — `[주어진 문장]` 이 평문 인쇄 + (A)(B)(C) 가 통짜 1문단
//         (A4 는 `:290` 에서 헤더를 벗기고 `:308-317` 이 given 박스 + para 로 쪼갠다)
//       · SUMMARY_COMPLETE(_MC) — 발문+↓+요약문이 한 조각, 지문이 **그 뒤**에 인쇄돼
//         A4 계약(`:363-372` 지문 → ↓ → 요약문)과 순서가 역전
//       · SUMMARY_WRITING — `[해석]`/`[요약문]`/`[보기]` 가 4~5박스로 안 갈라지고 1문단
//       · SENTENCE_TRANSFORM — `[원문]` 블록이 A4 의 `stripOriginalBlock`(`:346-353`)을
//         못 타고 그대로 인쇄
//     → 이 파일이 `isStructuredAtomicSubtype`(`question-body-layout.ts:67`) 유형에 대해
//       **A4 와 같은 분해기**를 돌려 `segments`(ComposedSegment[]) 로 굳히고, 발문은
//       `questionStemAndBody(item).stem` 만 남긴다. 표기(라벨/마스킹)도 A4 와 1:1이다
//       (요약문 정답 마스킹 `summaryCompleteMcSummaryForItem` 이 그 분해기 안에 있다).
//
//  [함정 6] **임베드 지문을 발문 활자로 인쇄** (26-08-18 적대검수 확정 결함, high)
//     `passage-policy.ts:186-189` 가 `flow === "embedded"` 유형에 `includePassage=false`
//     를 돌려주므로 그 유형의 영어 본문은 지문 필드가 아니라 **`questionText` 안**에
//     실려 온다. 그걸 통짜로 `.par-ws-qprompt` 에 넣으면 지문 전체가 발문 활자가 된다.
//     브라우저 computed 실측(`.tmp-worksheet-compose/_a22-verify-f2*.mjs`):
//       · 조판실 `.par-ws-qprompt` = font-weight **800** · white-space normal
//         (`report-styles.ts:1256-1261`), 지문 박스 `.par-ws-qpassage` 는 **0개** emit
//       · 같은 문항을 시험지 A4 는 발문(`font-semibold`)과 본문
//         (`<p class="mt-1 whitespace-pre-line">`, computed fw **400** · ws pre-line,
//          `components/a4-paper-page.tsx:1254-1285`)으로 갈라 그린다
//       · 대상 클래스 「2학년」 168행 중 어법 62 · 빈칸 44 · 함축 8 · 지칭 5 · 어휘 5 ·
//         무관 3 … 이 이 경로였다(글의 순서·문장삽입은 [함정 5] 세그먼트가 가져간다)
//     → `splitEmbeddedBody` 가 **A4 와 같은 분리기**(`questionStemAndBody`)로 stem/body 를
//       가르고, body 는 `bodyParagraphs` 로 내려보내 U3 가 `.par-ws-qpassage`
//       (`--font-en` · 굵기 400 · pre-line 보정)에 담는다. 이는 학습지 원본
//       (`report-sections/worksheet.tsx:163-180`: 발문=qprompt · 영어 지문=qpassage)의
//       활자 규약과 같은 축이다. **손실 검사**(공백 제거 비교)로 구조화 분기의 body 버림을
//       구조적으로 막는다.
//
// ─── 미지원(unsupported) 판정 — 우선순위 순, 첫 매칭에서 확정 ──────────────────
//   1. KO 세트 공유지문: `setId` + `isKoQuestionType(subType)`.
//      `makePaperItem`(`paper-item-utils.tsx:289-291,300-301`)이 KO 세트 멤버의
//      `passageContent` 를 **정규화 없이 원문 그대로** 두고 `includePassage:false` 로
//      만든다 — 공유지문 1박스는 `applyKoSetSharedPassages`(`:584-617`, buildGroups 전용
//      경로)가 채우기 때문이다. buildGroups 를 안 부르는 이 경로에서는 지문이 아예 없다.
//   2. KO 구조화 유형: `isKoStructuredSubtype`(`korean/ko-paper-adapter.ts:42-54`).
//      표시 원천이 `questionText` 가 아니라 structuredData → `koStemForItem`/
//      `koStructuredSegments` 다(`a4-paper-page.tsx:963-966` 이 같은 이유로 인라인 편집을
//      잠근다). 평문으로 흘리면 【보기】/【조건】 직렬 블록이 그대로 인쇄된다.
//   3. 다중 빈칸 조합 선지: `BLANK_INFERENCE` + `multiBlankOptionMatrix != null`.
//      실제 수능 표기는 컬럼 헤더 그리드(`a4-paper-page.tsx:1345-1352` → MultiBlankOptionGrid)
//      이고, 평문으로 내리면 "값1 …… 값2" 가 되어 **(A)/(B)/(C) 귀속이 소멸**한다.
//   4. 문장 삽입 주어진문장 박스: `SENTENCE_INSERT` + `splitSentenceInsertGivenBlock` 적중
//      (`option-display.ts:281-303`). 박스 + 지문 위 배치가 A4 전용 조판이다.
//   5. 본문 공백: 발문·지문이 모두 비어 렌더할 것이 없는 경우.
//
// ─── 수용된 한계 ───────────────────────────────────────────────────────────────
//   - 영어 장문 세트의 공유지문은 `makePaperItem` 이 문항 단위로 계산하는
//     `mergedSetPassageForQuestion`(`paper-item-utils.tsx:139-142`, setRender 기반)까지만
//     쓴다. buildGroups 의 `mergedSetPassageForItems`(`:164-184`)가 추가로 하는
//     **멤버 span anchors 교차 재구성**은 재현하지 않는다(그 함수는 비-export).
//     setRender 가 있는 정상 세트는 동일 결과이고, setRender 가 없는 레거시 세트만
//     지문이 원문 그대로 나온다(누수 아님 — 마커만 덜 붙는다).
//   - 지문 단락 분할은 「빈 줄 기준」이 계약인데, 비-KO 지문은
//     `normalizePassageText`(`text-normalization.ts:87-96`)가 단락을 **공백으로 이어 통짜
//     단일 흐름**으로 만든다 → 실질 1조각이다. 조각 축의 페이지 분할은 U3 의
//     `wrap:"ws-list"` 런 래퍼(break-inside:auto)가 담당한다.
//
// ─── 지문 박스 제목(기출 식별자)은 **기본 숨김** ─────────────────────────────────
//   `resolvePaperItemPassageTitle`(`paper-item-utils.tsx:102-106`)이 돌려주는 값은
//   자료실 내부 식별자다 — 실측 조판물에는 "2027학년도 6월 모평 영어 38번 · 문장삽입"
//   처럼 **출처 회차 + 문항 번호 + 그 지문의 원래 유형**까지 찍혔다
//   (`.tmp-worksheet-compose/shots/a22z/v-sheet4.png` · `vis.log` drillLabels). 그 지문에
//   붙은 문항은 요약문 영작 서술형이라 학생지에 **유형 오표기**가 그대로 인쇄된다.
//   시험지 조판은 같은 값을 layout 플래그로 게이트하고 그 기본값이 **false** 다
//   (`components/a4-paper-page.tsx:286` `isSourcePassage && showPassageTitle && …` ·
//    `constants.ts:53 DEFAULT_SHOW_PASSAGE_TITLE = false` → `saved-template-settings.ts:38`
//    기본 템플릿 · DOCX `build-builder-document/assemble.ts:53` · HWPX `_lib/builder.ts:33`
//    도 같은 축이고, `pagination-metrics.ts:290,527` 은 이 플래그가 꺼져 있으면 제목 높이를
//    **레이아웃 예산에서도 뺀다**). 조판실만 무조건 인쇄하면 같은 문항의 인쇄물이
//   두 조판에서 달라진다. → 기본값을 시험지와 일치(숨김)시키고, 표면이 토글을 갖게 되면
//   `options.showPassageTitle` 로 켠다. **가법 계약** — 인자를 생략한 기존 호출부는 무개변.
// ============================================================================

import { QUESTION_SUBTYPES, QUESTION_TYPES } from "@/lib/constants";
import { isKoQuestionType, koTypeLabelMap } from "@/lib/korean/registry";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import {
  makePaperItem,
  resolvePaperItemPassageTitle,
} from "@/components/exams/paper-builder/paper-item-utils";
import { formatSourcePassageForQuestionItems } from "@/components/exams/paper-builder/source-passage-markers";
import { isKoStructuredSubtype } from "@/components/exams/paper-builder/korean/ko-paper-adapter";
// [함정 5] A4 와 **같은** 구조화 분해기를 쓴다(복제 금지 — 복제하면 두 표면이 갈린다).
// 이 모듈은 순수 .ts(React·"use client" 0)라 조판실 계약(부수효과 0)을 깨지 않는다.
import {
  isStructuredAtomicSubtype,
  isTopicSentenceWritingSubtype,
  questionStemAndBody,
  structuredSegments,
} from "@/components/exams/paper-builder/question-body-layout";
import { isSummaryWritingSubtype } from "@/components/exams/paper-builder/summary-complete-mc-layout";
import {
  circleGrammarLabelMentions,
  formatInlineMarkersForSubtype,
  multiBlankOptionMatrix,
  optionDisplayLabel,
  optionDisplayTextForSubtype,
  shouldRenderOptionListForSubtype,
  splitSentenceInsertGivenBlock,
} from "@/components/exams/paper-builder/option-display";
import type {
  BuilderQuestion,
  OptionItem,
  PaperItem,
} from "@/components/exams/paper-builder/types";

// ─── 뷰모델 ───────────────────────────────────────────────────────────────────

/**
 * 구조화 유형의 본문 1조각. `StructSegment`(`question-body-layout.ts:222-226`)를
 * **표기까지 확정한** 조판실 판이다(A4 `StructuredBody`(`a4-paper-page.tsx:104-340`)가
 * 렌더 시점에 하던 라벨 분리를 여기서 미리 끝낸다 — 소비자는 그대로 그리기만 한다).
 *
 *  - `box.passage` → 출처/원문 지문 박스(테두리)
 *  - `box.summary` → 요약문/주제문 박스
 *  - `box.given`   → 주어진 문장 · [해석]/[보기]/[앞글자]/[주제 힌트]/[배열 단어] 보조 박스
 *  - `arrow`       → SUMMARY_COMPLETE_MC 의 ↓ (지문 → 요약문)
 *  - `para`        → 글의 순서 (A)(B)(C) 단락
 *  - `text`        → 박스가 아닌 평문 본문
 */
export type ComposedSegment =
  | { kind: "box"; boxStyle: "passage" | "summary" | "given"; label: string; text: string }
  | { kind: "arrow" }
  | { kind: "para"; label: string; text: string }
  | { kind: "text"; text: string };

/**
 * 조판 1문항의 **표기까지 확정된** 뷰모델.
 *
 * 소비자(U3 question-flow.tsx)는 여기 담긴 문자열을 **그대로** 렌더한다:
 *  - `questionText` → `renderQuestionTextInline(questionText, subType)`
 *  - `options[i].text` → `renderFormattedInline(text, subType)` (라벨은 `options[i].label` 그대로)
 * 라벨/선지 표기 정책(`optionDisplayLabel`·`optionDisplayTextForSubtype`)은 **이미 적용돼
 * 있으므로 소비자가 다시 적용하면 이중 변환**이 된다.
 */
export interface ComposedQuestionView {
  /** DB 문항 id — 조판 FlowItem id 의 유일한 아이덴티티 축(U1 `questionOrderId`). */
  questionId: string;
  /** 장문 세트 membership. 솔로 문항은 null. */
  setId: string | null;
  /** 합본 안 문항 번호(1-based, 해석된 문항들에 대해 연속). */
  no: number;
  /** 유형 배지 문자열(subType 우선 → type 폴백 → "문항"). */
  typeLabel: string;
  /** 원본 subType 코드 — 소비자가 인라인 렌더러에 그대로 넘겨야 마커 표기가 맞는다. */
  subType: string | null;
  /** makePaperItem 정규화 + 인라인 마커 표기 적용 결과. unsupported 면 "". */
  questionText: string;
  /**
   * 지문 박스 제목. **`options.showPassageTitle` 이 참일 때만** 채운다(기본 숨김 —
   * 머리주석 「지문 박스 제목은 기본 숨김」). unsupported 거나 지문 미동봉이면 "".
   */
  passageTitle: string;
  /** 지문 문단(빈 줄 기준 분할). unsupported 거나 지문 미동봉이면 []. */
  passageParagraphs: string[];
  /** 지문 박스를 이 문항에 그릴지. 세트 멤버는 연속 구간 **첫 멤버만** true. */
  includePassage: boolean;
  /**
   * **임베드 지문 본문** 문단 — [함정 6]. 발문 첫 단락 뒤에 붙어 오는 영어 본문
   * (어법 판단·빈칸 추론·함축 의미·지칭·어휘·무관 문장 …)을 발문에서 떼어낸 결과다.
   * 비어 있으면 분리 대상이 아니며 `questionText` 가 통짜 그대로다.
   * 비어 있지 **않으면** `questionText` 는 지시문(stem)만 담는다.
   */
  bodyParagraphs: string[];
  /**
   * 구조화 유형(요약문 완성·글의 순서·영작·출처지문 계열)의 본문 세그먼트 — [함정 5].
   * 비어 있으면(평문 유형) 소비자는 기존 경로(`questionText` + `passageParagraphs`)만 쓴다.
   * 비어 있지 **않으면** `questionText` 는 지시문(stem)만 담고 본문은 전부 여기 있다.
   */
  segments: ComposedSegment[];
  /** 표기 확정된 선지(label = 원형숫자 등, text = 유형별 표시 텍스트). */
  options: OptionItem[];
  /** 선지 목록을 그릴지 — 지문 마커 전용 유형(어법·무관문장·문장삽입·어휘선택)은 false. */
  renderOptionList: boolean;
  /** 정답표용 정답 라벨(예: "③", "2, 4", 서술형은 원문). */
  answerLabel: string;
  /** 정답 선지의 표시 텍스트. 라벨로 환원되지 않거나 unsupported 면 "". */
  answerText: string;
  /** 해설 본문(공백 정규화 + 400자 절단). 없거나 unsupported 면 "". */
  explanation: string;
  /** 서술형 작성선 줄 수. 객관식·unsupported 는 0. */
  writeLines: number;
  /** 미지원 유형 사유(배지 문자열). null 이면 정상 렌더 대상. */
  unsupported: string | null;
}

/** 해설 절단 길이 — 정답표가 페이지를 폭주시키지 않게. */
const MAX_EXPLANATION_CHARS = 400;

/** 절단 말줄임(1글자 U+2026 — 마침표 3개보다 폭이 좁다). */
const ELLIPSIS = "…";

// ─── 유형 라벨 맵 ─────────────────────────────────────────────────────────────
// `lib/exam-scoring/trend.ts:109-122` · `lib/student-analytics/resolvers.ts:26-38` 이
// 쓰는 것과 **같은 관용**(QUESTION_SUBTYPES 평탄화 → QUESTION_TYPES 폴백)이다. 같은
// 소스를 써야 조판 배지와 리포트/히트맵 축 라벨이 문자 단위로 일치한다.
// `src/app/api/ai/generate-questions-auto/_lib/constants.ts` 의 TYPE_LABELS 를 직접
// import 하지 않는 이유: 그 파일은 API 라우트 전용 _lib 이라 클라이언트 번들 경계를
// 넘긴다. 대신 그 맵에만 있고 QUESTION_SUBTYPES 에는 없는 항목을 아래에서 보충한다.

const SUBTYPE_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of Object.values(QUESTION_SUBTYPES)) {
    for (const item of group) map[item.value] = item.label;
  }
  // QUESTION_SUBTYPES(생성 UI 목록)에 없지만 DB 에 실재하는 subType 보충.
  // 자구는 generate-questions-auto/_lib/constants.ts TYPE_LABELS 와 일치시킨다.
  map.GRAMMAR_CHOICE_COMBO = "네모 어법";
  map.TOPIC_MAIN_IDEA = "주제/요지";
  map.CUSTOM = "커스텀";
  map.CUSTOM_LAYOUT = "커스텀";
  // KO(국어) 라벨은 레지스트리 파생 — 미등록이면 KO_ 코드가 그대로 노출되므로 병합 필수.
  Object.assign(map, koTypeLabelMap());
  return map;
})();

const TYPE_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const item of QUESTION_TYPES) map[item.value] = item.label;
  return map;
})();

function questionTypeLabel(question: BuilderQuestion): string {
  const bySubType = question.subType ? SUBTYPE_LABELS[question.subType] : undefined;
  if (bySubType) return bySubType;
  return TYPE_LABELS[question.type] ?? "문항";
}

// ─── 미지원 판정 ──────────────────────────────────────────────────────────────

/**
 * A4 전용 컴포넌트가 필요한 유형을 걸러 사유 문자열을 돌려준다(정상이면 null).
 * 판정 순서가 곧 우선순위이며 첫 매칭에서 확정한다(사유가 겹칠 때 더 근본적인 쪽이 먼저).
 * 근거는 이 파일 머리주석 [미지원] 1~5 참조.
 */
function unsupportedReason(
  question: BuilderQuestion,
  questionText: string,
  options: OptionItem[],
  passageParagraphs: string[],
): string | null {
  const subType = question.subType;

  if (question.setId && isKoQuestionType(subType)) {
    return "국어 세트 공유지문 — 시험지 조판에서 인쇄하세요";
  }
  if (isKoStructuredSubtype(subType)) {
    return "국어 구조화 문항(보기·조건 박스) — 시험지 조판에서 인쇄하세요";
  }
  if (subType === "BLANK_INFERENCE" && multiBlankOptionMatrix(options) !== null) {
    return "다중 빈칸 조합 선지(컬럼 표) — 시험지 조판에서 인쇄하세요";
  }
  if (
    subType === "SENTENCE_INSERT" &&
    splitSentenceInsertGivenBlock(questionText, subType).givenText
  ) {
    return "문장 삽입 주어진문장 박스 — 시험지 조판에서 인쇄하세요";
  }
  if (!questionText.trim() && passageParagraphs.length === 0) {
    return "본문이 비어 있습니다";
  }
  return null;
}

// ─── 보조 ────────────────────────────────────────────────────────────────────

/** 빈 줄(연속 개행) 기준 문단 분할. 빈 문단은 버린다. */
function splitParagraphs(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/** 해설 본문 정규화 — 개행/연속 공백을 한 칸으로 접고 400자에서 자른다. */
function normalizeExplanation(raw: string | undefined, subType: string | null): string {
  const flat = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  // 어법 판단은 해설 프로즈의 "(A)" 라벨 참조를 지문 마커와 같은 원형숫자로 맞춘다
  // (`option-display.ts:199-211` 이 이 유형 전용으로 둔 변환).
  const labeled = subType === "GRAMMAR_ERROR" ? circleGrammarLabelMentions(flat) : flat;
  return labeled.length > MAX_EXPLANATION_CHARS
    ? `${labeled.slice(0, MAX_EXPLANATION_CHARS).trimEnd()}${ELLIPSIS}`
    : labeled;
}

// ─── 임베드 지문 본문 분리 ([함정 6]) ─────────────────────────────────────────

/** 분리 대상이 아닐 때 돌려주는 **고정 참조** 빈 배열(EMPTY_SEGMENTS 와 같은 이유). */
const EMPTY_PARAGRAPHS: string[] = [];

/** 공백을 전부 지운 비교용 폼 — 분리 전후 「글자 손실 0」 불변식 검사에만 쓴다. */
function compactForLossCheck(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * 발문(stem)과 **임베드 지문 본문**(body)을 가른다 — A4 와 **같은 분리기**를 쓴다
 * (`questionStemAndBody`(`question-body-layout.ts:178-215`) → `splitFirstParagraph`).
 *
 * 왜 필요한가(실측): `passage-policy.ts:186-189` 가 `flow === "embedded"` 유형에
 * `includePassage=false` 를 돌려주므로, 그 유형의 영어 본문은 **지문 필드가 아니라
 * `questionText` 안**에 들어온 채로 온다. 그걸 통짜로 `.par-ws-qprompt`
 * (`report-styles.ts:1256-1261` — `font-weight: 800`)에 넣으면 지문 전체가 발문 활자로
 * 인쇄된다. 시험지 A4 는 같은 본문을 `<p class="mt-1 whitespace-pre-line">`
 * (`components/a4-paper-page.tsx:1254-1285`, computed `font-weight:400`)로 따로 그린다 —
 * 실측 대비 굵기 800 vs 400 이 갈렸다. 소비자(U3)는 이 body 를 학습지의 영어 지문 박스
 * `.par-ws-qpassage`(`report-styles.ts:1262-1271` — `--font-en` · 굵기 400)에 담는다.
 * 이는 리포트 학습지 원본(`report-sections/worksheet.tsx:163-180`: 발문=qprompt ·
 * 영어 지문=qpassage)의 활자 규약과 같은 축이다.
 *
 * 분리하지 **않는** 조건(전부 「통짜 유지」로 폴백):
 *  1. KO(국어) 유형 — `.par-ws-qpassage` 는 `--font-en`(Noto Serif) 이라 한국어 본문에
 *     맞지 않는다. KO 구조화는 어차피 unsupported 로 떨어진다.
 *  2. stem·body 중 하나라도 비면 — 분리할 것이 없다(A4 도 통짜로 그린다).
 *  3. **손실 검사 실패** — `questionStemAndBody` 는 구조화 유형에서 body 를 의도적으로
 *     `""` 로 버린다(전용 컴포넌트가 그리므로). 그 분기를 이 경로가 잘못 타면 본문이
 *     통째로 사라진다. 공백 제거 비교로 「stem+body === 원문」을 확인해 구조적으로 막는다.
 */
function splitEmbeddedBody(
  item: PaperItem,
  subType: string | null,
): { prompt: string; body: string } {
  const whole = { prompt: item.questionText, body: "" };
  if (isKoQuestionType(subType)) return whole;
  const { stem, body } = questionStemAndBody(item);
  if (!stem.trim() || !body.trim()) return whole;
  if (
    compactForLossCheck(stem) + compactForLossCheck(body) !==
    compactForLossCheck(item.questionText)
  ) {
    return whole;
  }
  return { prompt: stem, body };
}

// ─── 구조화 세그먼트 ([함정 5]) ───────────────────────────────────────────────

/** 세그먼트가 하나도 없을 때 돌려주는 **고정 참조** 빈 배열(참조 안정성 — U3 EMPTY_ITEMS 와 동형). */
const EMPTY_SEGMENTS: ComposedSegment[] = [];

/**
 * 영작형 보조 박스의 선행 라벨(`[해석] …` → 라벨 `[해석]` + 본문) 분리.
 * A4 `a4-paper-page.tsx:259-264 swLabelMatch` 와 **문자 단위로 같은 패턴**이다
 * (라벨 폭 12자는 「[주제 힌트]」·「[배열 단어]」 길이 상한 근거).
 */
const WRITING_BOX_LABEL_RE = /^(\[[^\]\n]{1,12}\])\s*([\s\S]*)$/;

/**
 * `structuredSegments(item)` → 조판실 `ComposedSegment[]`.
 *
 * A4 렌더러가 하는 일 중 **표기 결정**만 미리 수행한다(박스 헤더 문자열·라벨 분리):
 *   - given + 영작형 → `[해석]`/`[보기]`/`[앞글자]`/`[주제 힌트]`/`[배열 단어]` 라벨 분리
 *     (`a4-paper-page.tsx:312-314`)
 *   - given + 비영작형 → 헤더 "주어진 문장"(`a4-paper-page.tsx:301-305`).
 *     A4 는 이 헤더를 별도 문자열로 찍고 본문에서 `[주어진 문장]` 은 이미 벗겨져 있다
 *     (`question-body-layout.ts:290-292`) — 조판실이 평문으로 흘리던 바로 그 마커다.
 *   - summary + SUMMARY_COMPLETE → 헤더 "[요약문]"(`a4-paper-page.tsx:309-311`)
 *
 * @param dropPassage 세트 멤버일 때 true — 공유지문은 U3 가 **세트 전용 논리 블록**으로
 *   따로 그리므로(`question-flow.tsx:284-294`) 여기서 다시 내면 지문이 두 번 인쇄된다.
 */
function composeStructuredSegments(
  item: Parameters<typeof structuredSegments>[0],
  subType: string | null,
  dropPassage: boolean,
): ComposedSegment[] {
  const isWriting = isSummaryWritingSubtype(subType) || isTopicSentenceWritingSubtype(subType);
  const out: ComposedSegment[] = [];

  for (const seg of structuredSegments(item)) {
    if (seg.kind === "arrow") {
      // 앞 세그먼트(지문 박스)가 잘려 나갔으면 ↓ 는 가리킬 대상이 없다 → 버린다.
      if (out.length > 0) out.push({ kind: "arrow" });
      continue;
    }
    if (seg.kind === "para") {
      const text = formatInlineMarkersForSubtype(seg.text, subType).trim();
      if (text) out.push({ kind: "para", label: seg.label, text });
      continue;
    }
    if (seg.kind === "text") {
      const text = formatInlineMarkersForSubtype(seg.text, subType).trim();
      if (text) out.push({ kind: "text", text });
      continue;
    }

    if (seg.boxStyle === "passage" && dropPassage) continue;
    let label = "";
    let body = seg.text;
    if (isWriting) {
      const matched = body.match(WRITING_BOX_LABEL_RE);
      if (matched) {
        label = matched[1];
        body = matched[2];
      }
    } else if (seg.boxStyle === "given") {
      label = "주어진 문장";
    } else if (seg.boxStyle === "summary" && subType === "SUMMARY_COMPLETE") {
      label = "[요약문]";
    }
    const text = formatInlineMarkersForSubtype(body, subType).trim();
    if (text) out.push({ kind: "box", boxStyle: seg.boxStyle, label, text });
  }

  return out.length > 0 ? out : EMPTY_SEGMENTS;
}

/**
 * 정답 라벨("③" / "3" / "(2)")을 선지 인덱스로 환원한다. 환원 불가(서술형·복수 정답·
 * 자유 텍스트)면 null — 그때 `answerText` 는 빈 문자열로 남는다.
 * 원형숫자 코드 범위는 `question-answer-display.ts:22-28` 와 동일 축이다.
 */
function answerOptionIndex(answerLabel: string, optionCount: number): number | null {
  const text = answerLabel.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const codePoint = text.codePointAt(0);
  if (codePoint !== undefined && text.length <= 2) {
    if (codePoint >= 0x2460 && codePoint <= 0x2473) {
      const index = codePoint - 0x2460;
      return index < optionCount ? index : null;
    }
    if (codePoint >= 0x3251 && codePoint <= 0x325f) {
      const index = codePoint - 0x3251 + 20;
      return index < optionCount ? index : null;
    }
  }

  const numeric = text.match(/^[([]?\s*(\d{1,2})\s*[)\].:]?$/);
  if (numeric) {
    const index = Number(numeric[1]) - 1;
    return index >= 0 && index < optionCount ? index : null;
  }
  return null;
}

// ─── 본체 ────────────────────────────────────────────────────────────────────

/**
 * 조판 표기 옵션. 전 필드 선택이며, **전부 생략하면 시험지 조판의 기본값과 같은
 * 인쇄물**이 나온다(그것이 이 인터페이스를 둔 이유다).
 */
export interface ComposedQuestionViewOptions {
  /**
   * 지문 박스 제목(출처 회차 · 문항 번호 · 원 유형)을 인쇄할지.
   * 기본 **false** = 시험지 조판 `DEFAULT_SHOW_PASSAGE_TITLE`(`constants.ts:53`)과 동일.
   * 근거는 파일 머리주석 「지문 박스 제목은 기본 숨김」.
   */
  showPassageTitle?: boolean;
}

/**
 * `ids` **배열 순서 그대로** 뷰모델을 만든다.
 *
 * @param ids   체크 순서(= 조판 순서). 중복은 첫 등장만 남긴다(하류 `assertUniqueIds` 대비).
 * @param byId  questionId → BuilderQuestion 캐시. 아직 로드되지 않은 id 는 **조용히 건너뛴다**
 *              (U8 로더가 증분 로드 중임을 `loading` 으로 별도 고지한다).
 * @param options 표기 옵션(선택). 생략 = 시험지 조판 기본값(지문 제목 숨김).
 *
 * 반환 배열의 `no` 는 **해석된 문항에 대해 1부터 연속**이다
 * (`reindexItems`(`paper-item-utils.tsx:496-502`)의 questionOrder 규약과 동형).
 */
export function buildComposedQuestionViews(
  ids: string[],
  byId: ReadonlyMap<string, BuilderQuestion>,
  options?: ComposedQuestionViewOptions,
): ComposedQuestionView[] {
  // 지문 제목 가시성 — 기본 숨김. 시험지 조판(`a4-paper-page.tsx:286` 게이트 ·
  // 기본값 `constants.ts:53` false)과 같은 축으로 맞춰, 같은 문항이 두 조판에서
  // 다른 인쇄물을 내지 않게 한다(머리주석 「지문 박스 제목은 기본 숨김」).
  const showPassageTitle = options?.showPassageTitle === true;
  const views: ComposedQuestionView[] = [];
  const seen = new Set<string>();
  // 세트 연속 구간 판정용 — 직전 뷰의 setId. 「같은 setId 가 연속으로 이어질 때만」
  // 두 번째 이후를 멤버로 본다(중간에 다른 문항이 끼면 지문을 다시 그리는 것이 맞다.
  // buildGroups 가 `last.id === item.groupId` 인접 비교만 하는 것과 같은 규칙).
  let prevSetId: string | null = null;

  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const question = byId.get(id);
    if (!question) continue;

    const orderNum = views.length + 1;
    // [함정 2] 3번째 인자(_existingItems)는 makePaperItem 이 void 처리하는 미사용 파라미터다
    // (`paper-item-utils.tsx:257-258`). 빈 배열로 충분하며, 반환값의 localId 는 읽지 않는다.
    const item = makePaperItem(question, orderNum, []);
    const subType = question.subType;

    // 발문 — 정규화(makePaperItem)된 텍스트에 인라인 마커 표기를 얹는다.
    // DOCX/HWPX 내보내기 표면(`export-docx/_lib/build-question.ts:79`,
    // `export-hwpx/_lib/render/fragment.ts:430,466`)이 쓰는 것과 같은 관문이다 —
    // A4 표면은 renderFormattedInline 이 렌더 시점에 (A)→① 를 하지만 그 변환이
    // GRAMMAR_ERROR·ANTONYM 은 대상 밖이라(`paper-item-utils.tsx:660-672`
    // parenthesizedMarkerDisplay 의 유형 목록) 정답 라벨(①)과 지문 마커가 어긋난다.
    // 이 함수는 이미 원형숫자인 텍스트에 대해 무동작(멱등)이다.
    const questionText = formatInlineMarkersForSubtype(item.questionText, subType);

    // 지문 — 세트 연속 구간의 첫 멤버만 그린다(머리주석 [함정 3]).
    const setId = question.setId ?? null;
    const isSetContinuation = Boolean(setId) && setId === prevSetId;
    const rawPassage = formatInlineMarkersForSubtype(
      // 시험지 buildGroups 의 솔로 그룹 경로와 동형: WORD_ORDER·SENTENCE_TRANSFORM 의
      // 대상 문장 밑줄을 지문에 주입한다(`source-passage-markers.ts:139-155`).
      formatSourcePassageForQuestionItems(item.passageContent, [item]),
      subType,
    );
    const passageParagraphs = splitParagraphs(rawPassage);

    // ── 구조화 조판 레이어([함정 5]) ─────────────────────────────────────────
    // A4 가 전용 컴포넌트로 그리는 유형(`isStructuredAtomicSubtype`: 요약문 완성/영작·
    // 글의 순서·주제/요지/제목/내용일치·조건 영작·어순 배열·문장 전환)은 발문 통짜 출력이
    // 곧 평문 누수다. 같은 분해기를 돌려 세그먼트로 굳힌다.
    const segments = isStructuredAtomicSubtype(subType)
      ? composeStructuredSegments(item, subType, Boolean(setId))
      : EMPTY_SEGMENTS;
    // 세그먼트가 비면(분해 결과 없음) 기존 평문 경로를 그대로 쓴다 — 본문 유실 방지.
    const usesSegments = segments.length > 0;
    // 세그먼트가 있으면 발문은 지시문(stem)만 남긴다. 나머지는 전부 세그먼트가 갖는다
    // (A4 `questionStemAndBody`(`question-body-layout.ts:178-215`)와 같은 분리축).
    const stemText = usesSegments
      ? formatInlineMarkersForSubtype(questionStemAndBody(item).stem, subType)
      : questionText;

    // ── 임베드 지문 본문 분리([함정 6]) ──────────────────────────────────────
    // 세그먼트 경로가 이미 본문을 가져간 유형은 건드리지 않는다 — 두 번 그리면 본문 중복이다.
    // 평문(임베드) 유형만 A4 와 같은 stem/body 축으로 갈라 본문을 지문 활자로 내려보낸다.
    const embedded = usesSegments ? null : splitEmbeddedBody(item, subType);
    const promptText =
      embedded && embedded.body
        ? formatInlineMarkersForSubtype(embedded.prompt, subType)
        : stemText;
    const bodyParagraphs =
      embedded && embedded.body
        ? splitParagraphs(formatInlineMarkersForSubtype(embedded.body, subType))
        : EMPTY_PARAGRAPHS;
    // 지문 박스가 세그먼트 안에 있으면(솔로 문항) 별도 지문 조각 경로를 끈다 — 이중 인쇄 방지.
    // 세트 멤버는 위 `dropPassage` 로 세그먼트 쪽을 껐으므로 기존 세트 블록 경로가 그대로 산다.
    const hasPassageSegment = segments.some(
      (segment) => segment.kind === "box" && segment.boxStyle === "passage",
    );
    const includePassage =
      item.includePassage &&
      !isSetContinuation &&
      passageParagraphs.length > 0 &&
      !hasPassageSegment;

    // 선지 — 라벨/표시 텍스트를 여기서 확정한다(소비자는 재적용 금지).
    const options: OptionItem[] = item.options.map((option, index) => ({
      label: optionDisplayLabel(subType, index, option.label),
      text: optionDisplayTextForSubtype(subType, index, option.text),
    }));
    const renderOptionList =
      shouldRenderOptionListForSubtype(subType) && options.length > 0;

    // 정답 — 정답표(`answer-key-layout.ts:38-52 answerEntries`)와 **같은 산식**을 쓴다.
    // 빌더 편집값(item.correctAnswer) 우선, 없으면 원본 문항값 폴백.
    const answerLabel = formatStoredQuestionCorrectAnswer({
      subType: question.subType,
      typeId: question.type,
      correctAnswer: item.correctAnswer || question.correctAnswer,
      structuredData: question.structuredData,
    });
    const answerIndex = renderOptionList
      ? answerOptionIndex(answerLabel, options.length)
      : null;
    const answerText = answerIndex === null ? "" : options[answerIndex].text;

    const unsupported = unsupportedReason(
      question,
      questionText,
      item.options,
      passageParagraphs,
    );

    // [함정 4] 미지원이면 본문 필드를 전부 비워 **평문 누수를 구조적으로 차단**한다.
    // 소비자가 실수로 렌더해도 흘릴 내용 자체가 없다. `answerLabel` 만 남기는 이유:
    // 문항 본문은 안 나가도 정답표 행 번호↔정답 정렬은 유지돼야 하고, 라벨("③")은
    // 그 자체로 내용을 담지 않는다.
    views.push({
      questionId: question.id,
      setId,
      no: orderNum,
      typeLabel: questionTypeLabel(question),
      subType,
      questionText: unsupported ? "" : promptText,
      // 지문 제목은 「지문을 이 문항이 그린다」일 때만 뜻이 있다 — 조각 경로(includePassage)든
      // 세그먼트 박스 경로(hasPassageSegment)든 소유자는 하나뿐이다. 가시성 게이트
      // (showPassageTitle, 기본 숨김)는 두 경로에 **똑같이** 걸린다.
      passageTitle:
        unsupported || (!includePassage && !hasPassageSegment) || !showPassageTitle
          ? ""
          : resolvePaperItemPassageTitle(item),
      passageParagraphs: unsupported || !includePassage ? [] : passageParagraphs,
      includePassage: unsupported ? false : includePassage,
      // [함정 6] 임베드 지문 본문. unsupported 면 다른 본문 필드와 같이 비운다(구조적 차단).
      bodyParagraphs: unsupported ? EMPTY_PARAGRAPHS : bodyParagraphs,
      // [함정 5] 구조화 본문. unsupported 면 다른 본문 필드와 같이 비운다(구조적 차단).
      segments: unsupported ? EMPTY_SEGMENTS : segments,
      options: unsupported ? [] : options,
      renderOptionList: unsupported ? false : renderOptionList,
      answerLabel,
      answerText: unsupported ? "" : answerText,
      explanation: unsupported
        ? ""
        : normalizeExplanation(question.explanation?.content, subType),
      // 서술형 작성선 — makePaperItem 이 확정한 값(커스텀 레이아웃 answerLineCount 우선,
      // 아니면 선지 0개 + GRAMMAR_CORRECTION 제외 시 4줄. `paper-item-utils.tsx:331-333`).
      writeLines: unsupported ? 0 : item.answerSpaceLines,
      unsupported,
    });

    prevSetId = setId;
  }

  return views;
}
