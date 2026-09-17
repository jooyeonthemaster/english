// ============================================================================
// question-flow — E22 조판실: ComposedQuestionView[] → FlowItem[]
// (docs/class-studio-spec.md §3.10.22 E22-1 · .tmp-worksheet-compose/E22-UNITS.md [U3])
// ============================================================================
//
// 파이프라인 3단계 중 마지막. ① `question-view.ts`(U2)가 DB 형상을 표기 확정된 순수
// 뷰모델로 굳히고 ② 이 파일이 그 뷰모델을 **리포트 조판 껍데기**(`wrap:"ws-list"`)에
// 담아 `FlowItem[]` 으로 만들며 ③ `compose-flow.ts:330`(U4)이 그 배열을 합성 스트림
// 맨 끝에 잇는다. 여기서 만든 아이템은 **저장 경로에 단 한 번도 커밋되지 않는다** —
// 문항을 리포트 문서에 담는 길이 스키마로 막혀 있기 때문이다(근거 4건은
// `question-ids.ts:8-15` 머리주석 · `compose-flow.ts:66-77`).
//
// 계약:
//   - `"use client"` **없음**(형제 `worksheet-flow.tsx`·`paper-item-utils.tsx` 와 동일).
//     소비처(U9 `sheet-compose-surface.tsx`)가 이미 클라이언트 경계 안이다.
//   - **순수**. 렌더 중(useMemo) 호출해도 안전하다 — `Date.now()`/`Math.random()`/
//     모듈 카운터를 한 번도 쓰지 않으므로 StrictMode 이중 호출에서 id 가 문자 단위로
//     동일하다(React Compiler 가 에러 수준으로 켜져 있는 리포다).
//   - 컴포넌트를 선언하지 않는다(전부 인라인 JSX 데이터). 훅 0 · 부수효과 0.
//
// ─── 왜 `wrap: "ws-list"` 인가 (신규 wrap 금지) ────────────────────────────────
// `WrapKind`(`report-sections/types.ts:18-43`) 에 값을 하나 더 넣으면
// `report-pages/items.ts:92-99 isStandalone` · `report-pages/runs.tsx:27,114-135` ·
// `packFlow`(`items.ts:200,279-295`) 3개 **공유 파일**이 전부 개변 대상이 된다(무회귀 위반).
// ws-list 를 재사용하면 그 4개 파일이 한 글자도 안 바뀌면서
//   · `ACTIVITY_PAD_MM = 5`(`report-pages/constants.ts:27`) 박스 크롬 예산
//   · `metaMinHeight = 0`(`items.ts:225` — ws-list 조각은 저장 minHeight 무시)
//   · 페이지 경계 조각 분할(`items.ts:287` `newRun = … || (wsl && groupStart)`)
// 이 전부 공짜로 따라온다.
//
// ─── 【절대 금지 1】 조각에 `.par-ws-question` 을 달지 마라 ───────────────────────
// `.par-ws-question`(`report-styles.ts:1217-1222`)은 `border + padding + break-inside:avoid`
// 를 가진 **통짜 원자 박스**다. 조각마다 붙이면 박스 안에 박스가 N개 생기고, 각 박스가
// avoid 라 잘림 방지가 도리어 무효화된다. 박스는 이미 `runs.tsx:119-134` 의
// `par-runblock par-ws-block par-ws-run` 래퍼가 제공하고(`report-styles.ts:771-776,791-805`),
// **그 래퍼만 `break-inside: auto`**(`:795`)라 페이지 경계에서 나뉜다.
// → 조각은 평범한 div/ol 로 두고 **활자 클래스만** 승계한다
//   (`.par-ws-qtop`·`.par-ws-qno`·`.par-ws-qtype`·`.par-ws-qprompt`·`.par-ws-qpassage`·
//    `.par-ws-choices`·`.par-ws-choice-label`·`.par-ws-write-space`·`.par-ws-key-table`).
//
// ─── 【절대 금지 2】 시험지 클래스 어휘·id 반입 금지 ──────────────────────────────
// `exam-a4-page` · `exam-preview-page-frame` · `exam-preview-zoom-*` · `exam-cover-page` ·
// `continuation-hint` · id `exam-paper-print-root` 를 한 글자도 들여오지 않는다.
// `print-styles.tsx:20-23,92-159` 의 **호스트 스코프 없는** `@media print` 규칙이 리포트
// 시트 안에서 297mm 강제 · `transform: scale()` · 강제 개페이지를 걸어 조판을 파괴한다.
// (인라인 렌더러가 붙이는 Tailwind 유틸 — `font-bold text-blue-700` 등,
//  `paper-item-utils.tsx:710,714,745,750` — 은 시험지 전용 어휘가 아니라 무관하다.)
//
// ─── 【절대 금지 3】 모든 조각 `showGrip: false` · `resizable: false` ────────────────
// `worksheet-flow.tsx:26` 의 `showGrip: idx === 0` 을 그대로 베끼면 문항마다 그립이 하나씩
// 남고, 드래그 시 `onReorder` → `reorderIds`(`editor-mutations.ts:201`)가 **활성 학습지의**
// blockOrder 에 `qb-…` 외래 id 를 splice 한다. 그립 게이트는 4개 셸이 모두 갖고 있다
// (`shells.tsx:189-190` LiShell · `:223` RowShell · `:243-244` BlockShell · `:283-284` MapItemShell).
// ⚠ 어포던스 제거만으로는 부족하다 — `chromeProps`(`items.ts:145-160`)의
//   `onMouseDown → setActiveId` 가 살아 있어 Delete 키·속성 패널 경유가 열려 있다.
//   **U5 의 `rejectComposedId` 관문(`isComposedQuestionId`)이 2차 방어로 반드시 필요**하다
//   (`question-ids.ts:35-42` 가 기록한 `deleteItem → setBlockMeta(hidden)` 사고 경로).
//
// ─── 조각 분할이 잘림 방지의 본체 ──────────────────────────────────────────────
// `.par-sheet { overflow: hidden }`(`report-styles.ts:25-37`) 때문에 한 페이지 본문
// (250mm)을 넘는 **통짜 블록은 소리 없이 잘린다** — `worksheet.tsx:276-281` 이 기록한
// 실제 결함이다. 그래서 발문머리 / 지문 문단 / 선지 1개 / 작성선 을 각각 독립 조각으로
// 내보내 `packFlow` 가 페이지 경계에서 나눌 수 있게 한다.
//
// ─── 측정은 별도 작업이 필요 없다 ──────────────────────────────────────────────
// `BlockShell`(`shells.tsx:242`)이 `data-mid={it.id}` 를 자동 부착하고
// `pages.tsx:171-186` 이 `.par-measure`(184mm · zoom:1) 안에 한 벌 더 렌더해 실측한다.
// ============================================================================

import type { CSSProperties, ReactNode } from "react";
import {
  renderFormattedInline,
  renderQuestionTextInline,
} from "@/components/exams/paper-builder/paper-item-utils";
import type { FlowItem } from "../report-sections";
import type { ComposedDocHeader, ComposedFlowItem } from "./compose-flow";
import {
  QUESTION_ANSWER_ORDER_ID,
  QUESTION_ANSWER_SECTION,
  QUESTION_SECTION_BASE,
  questionOrderId,
  questionPartId,
  questionSetOrderId,
} from "./question-ids";
import type { ComposedQuestionView } from "./question-view";

/**
 * 정답표 1조각에 담는 행 수. 통짜 1블록으로 내보내면 250mm 를 넘는 순간
 * `.par-sheet{overflow:hidden}` 에 잘린다(파일 상단 「조각 분할이 잘림 방지의 본체」).
 * 5행이면 최악(해설 400자 × 5행)에도 한 페이지에 들어간다.
 */
const ANSWER_ROWS_PER_PART = 5;

/**
 * 정답표 「정답」 열을 좁은 고정폭으로 조판할지 가르는 라벨 길이 상한.
 * 실측(`_a22-verify-anslen.ts`, 2학년 클래스 168문항): 166건이 len=1(GRAMMAR_ERROR 62 ·
 * BLANK_INFERENCE 44 등 maxLen=1), len>3 은 SUMMARY_WRITING 2건(최대 66자)뿐이다.
 * 3 을 넘는 라벨이 조각에 하나라도 섞이면 학습지 기본 42% 를 유지한다 —
 * 좁은 고정폭은 완전한 문장 정답을 세로로 낙하시킨다(`report-styles.ts` R2 실측).
 */
const QB_KEY_NARROW_MAX_LABEL_LEN = 3;

/**
 * 아무것도 emit 되지 않을 때 돌려주는 **고정 참조** 빈 배열.
 * 매번 새 `[]` 를 돌려주면 그 참조 변화 하나로 `ReportPages` 의 useMemo 체인
 * (`pages.tsx:47-56`)이 전부 무효화되어 문서 전체 재측정이 돈다 — R4 실측에서
 * 「내용이 안 바뀐 토글」에 489ms 를 태운 것과 같은 계통이다.
 */
const EMPTY_ITEMS: FlowItem[] = [];

/**
 * 조각화로 생긴 여분 상단 여백을 상쇄하는 인라인 보정.
 *
 * 왜 인라인인가: `.par-ws-choices`(`report-styles.ts:1261-1267`)와
 * `.par-ws-qpassage`(`:1251-1260`)는 「한 박스 안에서 발문 아래에 한 번 나오는 요소」를
 * 전제로 `margin-top` 을 갖는다. 조각당 1개씩 렌더하면 그 마진이 조각마다 반복되는데,
 * 조각 간 간격은 이미 `.par-ws-run .par-block + .par-block { padding-top: 1.4mm }`
 * (`report-styles.ts:800-802`)가 준다 → 이중 간격이 된다.
 * `report-styles.ts` 는 U6(감독 직접 수정) 소유라 이 유닛이 건드릴 수 없으므로
 * (그리고 전역 CSS 신설은 학생 뷰어까지 닿는다) **스코프가 확실한 인라인 보정**으로 끝낸다.
 * 상수로 뽑아 두어 조각마다 새 객체가 생기지 않게 한다(참조 안정성).
 */
const STACKED_BLOCK_STYLE: CSSProperties = { marginTop: 0 };

/**
 * 발문 조각의 **하드 개행 보존** 보정([함정 6] 짝).
 *
 * `.par-ws-qprompt`(`report-styles.ts:1256-1261`)에는 `white-space` 선언이 없어 기본값
 * `normal` 이다 — 실측(`_a22-visual.mjs` → `shots/a22z/vis.log`)에서
 * `whiteSpace: "normal"` 인데 텍스트 노드에는 개행이 2개 살아 있었다. 즉
 * `normalizeQuestionText`(`text-normalization.ts:110-127` — `shouldKeepLineBreaks` 가
 * `[조건]`·번호 목록·(A)~(E) 라벨 줄의 개행을 **일부러 보존**한다)가 지켜 둔 줄바꿈이
 * 조판실에서만 공백으로 뭉개졌다. A4 는 같은 자리를 `whitespace-pre-line` 으로 그린다.
 * 통짜 1줄 발문에는 아무 변화가 없다(개행이 없으면 pre-line 과 normal 이 동일).
 */
const PROMPT_STYLE: CSSProperties = { whiteSpace: "pre-line" };

/**
 * 임베드 지문 본문 조각 스타일([함정 6]).
 * `marginTop:0` 은 위 STACKED_BLOCK_STYLE 과 같은 이유(조각당 마진 반복 상쇄),
 * `whiteSpace:"pre-line"` 은 A4 본문(`components/a4-paper-page.tsx:1257-1262`
 * `mt-1 whitespace-pre-line`)과 같은 개행 규약이다.
 */
const BODY_BLOCK_STYLE: CSSProperties = { marginTop: 0, whiteSpace: "pre-line" };

/** 문항 조판 1건의 입력. 호출부(U9)가 `docHeader` 객체를 **한 번만** 만들어 넘긴다. */
export interface QuestionFlowInput {
  /** `buildComposedQuestionViews`(U2) 산출. 배열 순서가 곧 인쇄 순서다. */
  views: ComposedQuestionView[];
  /**
   * 문항 구간의 러닝헤더/푸터 귀속. **객체 1개**를 만들어 넘겨야 한다 —
   * 아이템마다 새 객체를 만들면 하위 memo 비교가 매 렌더 어긋난다
   * (`compose-flow.ts:109-113` 이 부착 문서 축에 대해 못박은 것과 같은 계약).
   * 안 넘기면 `pages.tsx:216` 폴백이 **활성 학습지 제목**을 문항 페이지 머리글에 찍는다.
   */
  docHeader: ComposedDocHeader;
  /** 정답표를 묶음 맨 끝에 붙일지. 이 토글의 소유자는 조판 표면(U9)이다. */
  showAnswerKey: boolean;
  /**
   * [E27] 정답표 **만** 만든다 — 문항 본문 조각은 한 개도 emit 하지 않는다.
   *
   * 왜 별도 플래그인가: E27 은 문항을 지문 그룹마다 따로 조판하지만 정답표는
   * **묶음 전체의 맨 끝에 1개**여야 한다(사용자 확정). 그룹별 호출에는
   * `showAnswerKey:false` 를 주고, 마지막에 **전체 views** 로 이 플래그를 켜 부른다.
   * 정답표 마크업·자구·`sectionIndex`·`breakBefore` 를 복제하지 않고 `pushBlock` 을
   * 그대로 재사용하므로 두 경로가 갈릴 여지가 없다.
   */
  answerKeyOnly?: boolean;
  /**
   * [E27] 이 묶음의 `sectionIndex` 시작 오프셋. 미전달 = 0 (= 기존과 값까지 동일).
   *
   * 왜 필요한가: E27 은 문항을 **지문 그룹마다 따로** 조판하므로 이 함수가 한 조판에
   * 여러 번 불린다. 매 호출이 0부터 세면 서로 다른 그룹의 논리 블록이 **같은 sectionIndex**
   * 를 갖게 되고, `runs.tsx:31-38` 의 런 병합이 `(wrap, sectionIndex)` 쌍을 보므로
   * 그룹 경계에서 박스가 잘못 병합될 여지가 생긴다.
   *
   * 호출부는 그룹마다 넉넉한 보폭(그룹 인덱스 × 1000)을 준다 —
   * `QUESTION_SECTION_BASE`(900,000)와 `QUESTION_ANSWER_SECTION`(990,000) 사이가 90,000 이라
   * 그룹 90개까지 정답표 구간을 절대 침범하지 않는다(현실 상한을 크게 넘는다).
   */
  sectionSeqStart?: number;
}

/**
 * 문항 1건의 지문 박스 조각들(문단당 1조각).
 * 제목은 **첫 문단 조각 안**에 넣는다 — 별도 조각으로 두면 페이지 하단에 제목만 남는
 * 고아가 생긴다(`worksheet-flow.tsx:86` 이 미니제목을 첫 문항과 한 조각으로 묶은 것과 같은 이유).
 */
function passageParts(view: ComposedQuestionView): ReactNode[] {
  return view.passageParagraphs.map((paragraph, i) => (
    <div key={`pg-${i}`} className="par-ws-qpassage" style={STACKED_BLOCK_STYLE}>
      {i === 0 && view.passageTitle ? (
        <div className="par-ws-drill-label">{view.passageTitle}</div>
      ) : null}
      {/* 표기(마커 → 원형숫자 등)는 U2 가 `formatInlineMarkersForSubtype` 로 이미 적용했다.
          여기서 다시 적용하면 이중 변환이다(`question-view.ts:107-111` 계약). */}
      {renderFormattedInline(paragraph, view.subType)}
    </div>
  ));
}

/**
 * 임베드 지문 **본문 조각**들(문단당 1조각) — [함정 6].
 *
 * 어법 판단·빈칸 추론 등 `flow === "embedded"` 유형은 영어 본문이 `questionText` 안에
 * 실려 오는데(`passage-policy.ts:186-189`), 그 전량을 발문 상자에 넣으면
 * `.par-ws-qprompt` 의 `font-weight: 800`(`report-styles.ts:1256-1261`)이 지문 전체에
 * 걸린다(실측: A4 같은 본문은 computed 400). U2 가 A4 와 같은 분리기로 갈라 둔 body 를
 * 여기서 **학습지의 영어 지문 박스**(`.par-ws-qpassage` — `--font-en` · 굵기 400)에 담아
 * `report-sections/worksheet.tsx:163-180`(발문=qprompt · 영어 지문=qpassage) 규약을 맞춘다.
 * 렌더러는 A4 본문 경로(`components/a4-paper-page.tsx:1288-1291`)와 같은
 * `renderQuestionTextInline` 을 쓴다(표기는 U2 가 이미 확정 — 재적용 금지).
 */
function bodyParts(view: ComposedQuestionView): ReactNode[] {
  return view.bodyParagraphs.map((paragraph, i) => (
    <div key={`bd-${i}`} className="par-ws-qpassage" style={BODY_BLOCK_STYLE}>
      {renderQuestionTextInline(paragraph, view.subType)}
    </div>
  ));
}

/**
 * 구조화 본문 세그먼트 1개 = **조각 1개**([함정 5] · `question-view.ts` ComposedSegment).
 *
 * 조각으로 쪼개는 이유는 파일 상단 「조각 분할이 잘림 방지의 본체」 그대로다 — 요약문
 * 완성의 지문 박스는 단독으로도 250mm 를 넘길 수 있어 통짜로 두면 `.par-sheet
 * {overflow:hidden}` 에 소리 없이 잘린다.
 *
 * 클래스 승계(신설 0):
 *   - passage 박스 → `.par-ws-qpassage`(`report-styles.ts:1251-1260`) — 조판실의 기존
 *     지문 박스와 **같은 활자**를 써야 같은 문항의 두 지문 경로가 갈리지 않는다.
 *   - summary/given 박스 → 인라인 보정. `report-styles.ts` 는 U6(감독) 소유라 이 유닛이
 *     클래스를 신설할 수 없고(파일 상단 STACKED_BLOCK_STYLE 과 같은 이유), 값은
 *     `.par-ws-grammar-choice`(`report-styles.ts:1122-1129`)의 테두리·틴트 예산을 그대로
 *     따라 리포트 활자 스케일(`--par-fs`)에 붙는다.
 *   - 라벨 → `.par-ws-drill-label`(`:1117-1121`). A4 는 같은 자리를 볼드 span 으로 그린다
 *     (`a4-paper-page.tsx:301-314`).
 */
const SEGMENT_BOX_STYLE: CSSProperties = {
  marginTop: 0,
  border: ".3mm solid var(--tint-border)",
  background: "var(--tint)",
  padding: "1.5mm 1.8mm",
  fontSize: "calc(8.6pt * var(--par-fs, 1))",
  lineHeight: 1.42,
  // [조건]·[보기] 목록의 줄바꿈 보존 — A4 `StructuredBody` 의 whitespace-pre-line 과 동형
  // (`a4-paper-page.tsx:268`). 통짜 문단으로 뭉개지던 목록을 막는다.
  whiteSpace: "pre-line",
};

/** ↓(지문 → 요약문) 조각. A4 `a4-paper-page.tsx:173-182` 과 같은 자리·같은 글리프. */
const SEGMENT_ARROW_STYLE: CSSProperties = {
  marginTop: 0,
  textAlign: "center",
  fontWeight: 900,
  lineHeight: 1.1,
};

/** (A)(B)(C) 단락 조각 — 박스가 아니라 평문 단락이다(A4 `:342-353` 미러). */
const SEGMENT_PARA_STYLE: CSSProperties = { marginTop: 0, whiteSpace: "pre-line" };

function segmentParts(view: ComposedQuestionView): ReactNode[] {
  return view.segments.map((segment, i) => {
    const key = `sg-${i}`;
    if (segment.kind === "arrow") {
      return (
        <div key={key} style={SEGMENT_ARROW_STYLE} aria-hidden>
          {"↓"}
        </div>
      );
    }
    if (segment.kind === "para") {
      return (
        <p key={key} style={SEGMENT_PARA_STYLE}>
          <span className="par-ws-choice-label">{`${segment.label} `}</span>
          {/* 표기는 U2 가 이미 확정했다 — 재적용 금지(`question-view.ts` 계약). */}
          {renderFormattedInline(segment.text, view.subType)}
        </p>
      );
    }
    if (segment.kind === "text") {
      return (
        <div key={key} style={SEGMENT_PARA_STYLE}>
          {renderFormattedInline(segment.text, view.subType)}
        </div>
      );
    }
    const isPassageBox = segment.boxStyle === "passage";
    return (
      <div
        key={key}
        className={isPassageBox ? "par-ws-qpassage" : undefined}
        style={isPassageBox ? STACKED_BLOCK_STYLE : SEGMENT_BOX_STYLE}
      >
        {isPassageBox && view.passageTitle ? (
          <div className="par-ws-drill-label">{view.passageTitle}</div>
        ) : null}
        {segment.label ? <div className="par-ws-drill-label">{segment.label}</div> : null}
        {renderFormattedInline(segment.text, view.subType)}
      </div>
    );
  });
}

/** 발문머리 조각 — 번호 배지 + 유형 라벨 + 발문. */
function headPart(view: ComposedQuestionView): ReactNode {
  return (
    <div>
      <div className="par-ws-qtop">
        <span className="par-ws-qno">{view.no}</span>
        <span className="par-ws-qtype">{view.typeLabel}</span>
      </div>
      {view.unsupported ? (
        // 미지원 유형은 **배지 1줄만** 그린다. U2 가 `unsupported !== null` 일 때 본문 필드를
        // 전부 비워 두었으므로(`question-view.ts:364-367`) 흘릴 내용 자체가 없다 = 평문 누수
        // 구조적 차단. 정답표 행은 `answerLabel` 로 살아 있어 번호↔정답 정렬이 유지된다.
        <div className="par-ws-note">{view.unsupported}</div>
      ) : (
        <div className="par-ws-qprompt" style={PROMPT_STYLE}>
          {/* `renderQuestionTextInline`(`paper-item-utils.tsx:889`)만 쓴다 — 이 함수의
              SENTENCE_INSERT 「주어진 문장」 분기(`:898-911`)는 U2 가 unsupported 로 떨궈
              여기 도달하지 않으므로, 실제로는 항상 `renderFormattedInline` 경로다. */}
          {renderQuestionTextInline(view.questionText, view.subType)}
        </div>
      )}
    </div>
  );
}

/** 선지 1개 = 1조각. `<ol>` 1개에 `<li>` 1개 — 활자·격자 클래스를 그대로 승계한다. */
function optionPart(label: string, text: string, subType: string | null, key: string): ReactNode {
  return (
    <ol key={key} className="par-ws-choices" style={STACKED_BLOCK_STYLE}>
      <li>
        {/* 라벨은 U2 가 `optionDisplayLabel` 로 확정했다 — 그대로 출력(재적용 금지). */}
        <span className="par-ws-choice-label">{label}</span>
        <span>{renderFormattedInline(text, subType)}</span>
      </li>
    </ol>
  );
}

/** 서술형 작성선 1조각. 줄 간격 6mm 는 손글씨 공간(`report-styles.ts:1133-1134`). */
function writeLinesPart(count: number): ReactNode {
  return (
    <div className="par-ws-write-space" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={`wl-${i}`} className="par-ws-write-line" />
      ))}
    </div>
  );
}

/**
 * `ComposedQuestionView[]` → 조판 `FlowItem[]`.
 *
 * 반환 배열은 `buildComposedView({ …, questions })`(`compose-flow.ts:172,330`)의
 * 4번째 입력으로 그대로 넘어간다. **배열 순서가 곧 인쇄 순서**이고, 합류 지점이
 * companions 루프 직후 · blockOrder 사전 확정 직전인 이유는 그 파일 `:313-329` 참조.
 *
 * ■ 아이템 규약(전 조각 공통)
 *   - `wrap: "ws-list"` (파일 상단 근거)
 *   - `orderId === editId === questionOrderId(view.questionId)` — 조각들의 논리 블록 id.
 *     `no` 가 아니라 `questionId` 로 만들어야 로딩 중 번호 변동에 id 가 흔들리지 않는다
 *     (`question-view.ts:283-288` U2 계약 3).
 *   - `id = questionPartId(orderId, n)` → `qb-…::p{n}`
 *   - `sectionIndex` 는 **논리 블록마다 다르다**(아래 `sectionSeq`).
 *   - `showGrip:false` · `resizable:false` (파일 상단 【절대 금지 3】)
 *   - `docHeader` 를 전 조각에 실어 러닝헤더/푸터 귀속을 문항 구간으로 돌린다.
 *   - **묶음의 첫 조각에만** `breakBefore: true` — 문항 묶음은 새 페이지에서 시작한다.
 *     `packFlow`(`items.ts:216` `|| !!it.breakBefore`)가 blockMeta 경유 없이 아이템 필드를
 *     직접 받으므로 더미 spacer 삽입이 필요 없다.
 */
export function buildQuestionFlowItems(input: QuestionFlowInput): FlowItem[] {
  const { views, docHeader, showAnswerKey } = input;

  const items: ComposedFlowItem[] = [];
  /**
   * 논리 블록마다 증가하는 `sectionIndex` 오프셋.
   *
   * 왜 블록마다 다른 값인가: `runs.tsx:31-37` 런 병합과 `packFlow`(`items.ts:285-287`
   * `newSection`/`newRun`)가 둘 다 `(wrap, sectionIndex)` 축을 본다. 전 문항이 한 값을
   * 공유하면 인접 문항이 한 박스로 병합될 여지가 생긴다(ws-list 는 `runs.tsx:37` 의
   * orderId 조건이 2차로 막지만, 두 경로 모두 안전한 쪽을 택한다 — `question-ids.ts:90-95`).
   *
   * 왜 `viewIndex` 가 아니라 별도 카운터인가: 세트 공유지문이 **자기 논리 블록**을
   * 하나 더 만들기 때문이다. 세트가 없는(=대부분의) 입력에서는 `sectionSeq === viewIndex`
   * 라 스펙 §3.10.22 E22-1 의 `900_000 + i` 와 값까지 완전히 같다.
   * 900_000 이 문서 축 `SECTION_INDEX_STRIDE = 1000`(`compose-flow.ts:99`)과 영구
   * 비충돌인 근거는 `question-ids.ts:96-107`.
   */
  // [E27] 그룹별 호출을 지원하려고 시작값만 열었다. 미전달이면 0 = 기존과 값까지 동일.
  let sectionSeq = input.sectionSeqStart ?? 0;
  // 세트 공유지문 블록 id 충돌 방지용. U2 는 「같은 setId 가 **연속**일 때만」 멤버로 접으므로
  // (`question-view.ts:325`) 같은 세트가 비연속으로 두 번 등장하면 `includePassage` 가 두 번
  // true 가 된다 → 같은 `qb-set-{setId}` 를 두 번 만들면 id 중복이고, 그 순간
  // `pages.tsx` heightById(먼저 만난 것 우선)와 itemsById(나중 것이 이김)의 규칙이 서로 반대라
  // **에러 없이 페이지 넘침으로만** 드러난다(E21-7 함정 2).
  const usedOrderIds = new Set<string>();

  const pushBlock = (opts: {
    orderId: string;
    no: number;
    nodes: ReactNode[];
    /** 생략 시 `QUESTION_SECTION_BASE + sectionSeq++`. 정답표만 전용 값을 명시한다. */
    sectionIndex?: number;
    /** 첫 조각 강제 개페이지. 묶음 첫 블록은 자동으로 켜진다. */
    breakBefore?: boolean;
    /**
     * [E27] 이 논리 블록을 페이지 경계에서 쪼개지 않는다(`FlowItem.atomic`).
     * **정답표는 false** — 이미 `ANSWER_ROWS_PER_PART` 조각 분할이 절단 방지 장치이고,
     * 통째 원자화하면 정답표가 통으로 이월돼 앞 페이지가 백지가 된다.
     */
    atomic?: boolean;
    /** [E27] 다음 원자 그룹(세트 첫 멤버)까지 한 페이지에 묶는다. */
    keepWithNextGroup?: boolean;
  }): void => {
    if (opts.nodes.length === 0) return;
    const sectionIndex =
      opts.sectionIndex ?? QUESTION_SECTION_BASE + sectionSeq++;
    // 문항 묶음 전체의 첫 조각이면 무조건 새 페이지에서 시작한다.
    const forceFirst = opts.breakBefore || items.length === 0;
    opts.nodes.forEach((node, n) => {
      items.push({
        id: questionPartId(opts.orderId, n),
        sectionIndex,
        // `kind` 는 `describeItems`(`items.ts:42`) → 속성 패널 라벨용인데, 문항은
        // descriptors 에 들어가지 않는다(U5 계약: descriptors 는 `readOnlyFlowItems` 유지).
        // 그래도 값은 있어야 하므로 커스텀 블록과 같은 축으로 둔다.
        kind: "custom",
        no: opts.no,
        wrap: "ws-list",
        node,
        orderId: opts.orderId,
        editId: opts.orderId,
        showGrip: false,
        resizable: false,
        docHeader,
        // [E27] 원자성은 **그룹 전 조각**에 실어야 한다 — `packFlow` 는 `groupStart` 인
        // 조각에서만 읽지만, 조각 하나만 표시하면 blockOrder 재정렬로 조각 순서가 바뀔 때
        // 판정이 사라진다. 전 조각 동일 값이면 어느 조각이 앞에 서든 계약이 유지된다.
        ...(opts.atomic ? { atomic: true as const } : null),
        ...(opts.keepWithNextGroup ? { keepWithNextGroup: true as const } : null),
        ...(forceFirst && n === 0 ? { breakBefore: true } : null),
      });
    });
  };

  // [E27] 정답표 전용 호출이면 본문 조각 생성을 통째로 건너뛴다(미전달 = 기존 경로).
  if (!input.answerKeyOnly) for (const view of views) {
    // ── 세트 공유지문 = **별도 논리 블록** ────────────────────────────────────
    // 멤버와 같은 orderId 를 주면 `runs.tsx:37` 의 ws-list 병합 조건(orderId 동일성)에
    // 걸려 공유지문과 첫 멤버가 한 박스로 붙고, 그 박스가 페이지 경계에서 안 나뉜다.
    // (`question-ids.ts:130-136` 이 `questionSetOrderId` 를 따로 둔 이유 그대로.)
    if (view.setId && view.includePassage && view.passageParagraphs.length > 0) {
      let setOrderId = questionSetOrderId(view.setId);
      if (usedOrderIds.has(setOrderId)) {
        // 비연속 재등장(위 usedOrderIds 주석) — 등장 번호로 갈라 id 유일성을 지킨다.
        // `-r{no}` 는 ASCII 뿐이라 `__`(학습지 접미 축) · `::`(조각 구분자) 어느 쪽도
        // 오염시키지 않는다(`question-ids.ts:62-67`).
        setOrderId = questionSetOrderId(`${view.setId}-r${view.no}`);
      }
      usedOrderIds.add(setOrderId);
      // [E27] 공유지문 자체도 원자 그룹이고, **첫 멤버 문항까지** 한 페이지에 묶는다
      //       (둘이 갈리면 지문만 있는 페이지가 생긴다).
      pushBlock({
        orderId: setOrderId,
        no: view.no,
        nodes: passageParts(view),
        atomic: true,
        keepWithNextGroup: true,
      });
    }

    // ── 문항 본체 ────────────────────────────────────────────────────────────
    const orderId = questionOrderId(view.questionId);
    usedOrderIds.add(orderId);

    const parts: ReactNode[] = [headPart(view)];
    if (!view.unsupported) {
      // [함정 6] 임베드 지문 본문은 **발문 바로 뒤**다(A4 `:1254-1285` 와 같은 순서).
      // U2 가 이 배열을 채웠다면 `view.questionText` 에는 지시문만 남아 있어 중복이 없고,
      // 분리 대상이 아닌 유형은 배열이 비어 있어 0회 돈다(무회귀).
      parts.push(...bodyParts(view));
      // 솔로 문항의 지문은 자기 블록 안에 둔다(세트 공유지문만 위에서 분리했다).
      if (!view.setId && view.includePassage) parts.push(...passageParts(view));
      // [함정 5] 구조화 본문(지문 박스 · ↓ · 요약문/보기 박스 · (A)(B)(C) 단락).
      // U2 가 이 배열을 채웠다면 `view.questionText` 에는 지시문만 남아 있으므로 본문
      // 중복이 없다. 평문 유형은 배열이 비어 있어 아래 for 문이 0회 돈다(무회귀).
      parts.push(...segmentParts(view));
      if (view.renderOptionList) {
        view.options.forEach((option, i) => {
          parts.push(optionPart(option.label, option.text, view.subType, `op-${i}`));
        });
      }
      if (view.writeLines > 0) parts.push(writeLinesPart(view.writeLines));
    }
    pushBlock({ orderId, no: view.no, nodes: parts, atomic: true });
  }

  // ── 정답표 ─────────────────────────────────────────────────────────────────
  // `worksheet.tsx:282-466 worksheetAnswerKeySubsections` 패턴 복제(표 3열 + 조각 분할).
  // ⚠ `activityAnswerKeyPage` 규약에는 **절대 합류시키지 않는다** — `assemble.tsx:89-123`
  //   은 `report.customBlocks` 만 훑으므로 합류하려면 id 를 `c-…-ans` 로 위장해야 하는데,
  //   그 순간 `deleteItem → deleteCustomBlock`(`editor-mutations.ts:252`)과
  //   `isActivityAnswerId`(`items.ts:12-14`)의 「항상 문서 맨 끝」 특례가 동시에 켜져
  //   문항 정답표가 활성 학습지의 활동 정답 페이지 뒤로 튕겨 나간다.
  //   `QUESTION_ANSWER_ORDER_ID` 가 `-ans` 로 끝나지 않는 이유가 정확히 이것이다.
  if (showAnswerKey && views.length > 0) {
    const answerParts: ReactNode[] = [];
    for (let start = 0; start < views.length; start += ANSWER_ROWS_PER_PART) {
      const chunk = views.slice(start, start + ANSWER_ROWS_PER_PART);
      answerParts.push(
        <div key={`ak-${start}`} className="par-ws-answer-subsection">
          {start === 0 ? (
            // 미니헤드는 첫 조각에만 — 고아 헤더 방지(`worksheet.tsx:296-309` 와 같은 규칙).
            // `WorksheetMiniTitle` 를 import 하지 않고 마크업만 승계한다: 그 컴포넌트는
            // 편집 필드(`editable-field.tsx Field`)를 끌고 오는데, 문항 정답표는 편집 대상이
            // 아니라 그 의존이 순수한 손해다.
            <div className="par-ws-minihead">
              <span className="par-ws-minihead-k">문항 정답 및 해설</span>
              <span className="par-ws-minihead-e">Answer Key</span>
            </div>
          ) : null}
          {/* 문항 정답은 선지 라벨 1글자인데 학습지용 42% 를 그대로 쓰면 676.8px 표에서
              283.8px 를 한 글자가 먹고 해설이 5~9줄로 눌린다(`_a22-anskey.mjs` 실측:
              firstRowCellWidths=[34, 283.8, 358]). 조각 전체가 짧을 때만 좁은 폭 수식자를
              얹는다 — 긴 문장 정답이 섞인 조각은 손대지 않아 R2 세로낙하가 재현되지 않는다. */}
          <table
            className={
              chunk.every((v) => v.answerLabel.length <= QB_KEY_NARROW_MAX_LABEL_LEN)
                ? "par-ws-key-table par-qb-key-narrow"
                : "par-ws-key-table"
            }
          >
            <tbody>
              {chunk.map((view) => (
                <tr key={view.questionId}>
                  <td>{view.no}</td>
                  <td>{view.answerLabel}</td>
                  <td>{view.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    }
    pushBlock({
      orderId: QUESTION_ANSWER_ORDER_ID,
      no: 0,
      nodes: answerParts,
      // 본문 마지막 문항 조각과 정답표 첫 조각이 `runs.tsx:33-34` 쌍 비교로 한 런에
      // 병합되면 정답표 표가 마지막 문항 박스 안으로 빨려 들어간다. 90,000 간극으로
      // 원천 차단한다(`question-ids.ts:110-116`).
      sectionIndex: QUESTION_ANSWER_SECTION,
      // 정답표는 학생지와 분리해 항상 새 페이지에서 시작
      // (`worksheet-flow.tsx:429-431` 과 같은 정책).
      breakBefore: true,
    });
  }

  return items.length > 0 ? items : EMPTY_ITEMS;
}

/**
 * [E27] **문항 정답표 블록만** 만든다.
 *
 * E27 은 문항을 지문 그룹마다 따로 조판하는데(§3.10.26 R1), 정답표는 사용자 확정에 따라
 * **묶음 전체의 맨 끝에 1개**여야 한다 — 그룹마다 하나씩 생기면 학생지/정답지 분리 인쇄가
 * 불가능해지고 페이지도 그룹 수만큼 늘어난다.
 *
 * 그래서 호출부는 ① 그룹마다 `buildQuestionFlowItems({ …, showAnswerKey: false })` 로
 * 본문만 만들고 ② 마지막에 **전체 views** 로 이 함수를 한 번 불러 꼬리에 붙인다.
 * `views` 의 `no` 는 `buildComposedQuestionViews` 가 전역 1..N 으로 매긴 값이므로
 * 정답표 번호가 인쇄 순서와 그대로 일치한다.
 *
 * 마크업·자구·`sectionIndex`(QUESTION_ANSWER_SECTION)·`breakBefore` 는 전부
 * `buildQuestionFlowItems` 의 정답표 분기를 **그대로 재사용**한다(복제 0 · divergence 0).
 */
export function buildQuestionAnswerKeyItems(input: {
  views: ComposedQuestionView[];
  docHeader: ComposedDocHeader;
}): FlowItem[] {
  return buildQuestionFlowItems({
    views: input.views,
    docHeader: input.docHeader,
    showAnswerKey: true,
    answerKeyOnly: true,
  });
}
