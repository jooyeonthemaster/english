// ============================================================================
// 통합 시험 채점 — 학생 안전 페이로드(sanitizer, 순수)
//
// /t/[token] 공개 응시면(태블릿/OMR)으로 나가는 문항 페이로드의 정본 조립기.
// 보안 계약(설계문서 §3.4·§6-1 — 보안 크리티컬):
//  - **화이트리스트 조립만** 허용. 스프레드/omit(블랙리스트 삭제) 금지 — 이후
//    스키마에 새 정답성 필드가 생겨도 여기 화이트리스트에 없으면 기본 차단된다.
//  - 정답성 필드는 어떤 경로로도 미포함: correctAnswer(s) / answer / blanks[].answer /
//    acceptedAnswers(최상위·blanks[]·underlinedSegments[] 각 원소 — T8b 허용 답안 집합) /
//    acceptableVariants / requiredLemmas / modelAnswer / scoringCriteria / scoringMode /
//    isError / correction / errorExpression / errorPart(s) / correctedPart(s) /
//    correctedSentence / isInappropriate / betterWord / originalWord / substituteWord /
//    correctExpression / wrongExpression / slotValues / irrelevantIndex / incorrectIndex /
//    explanation / wrongOptionExplanations / keyPoints / answerLogic / impliedMeaning /
//    reasoningGap / evidenceChain / surfaceMeaning / originalExpression /
//    objectiveAnswerTexts / translation / evidence / wordBankDistractors(별도 필드로서) /
//    blankGlosses(v1 학생 비노출 — 시각검수 확정) / markedExpressions / markedWords / slots.
//  - 미끼 칩(wordBank·scrambledWords 안의 미끼)은 학생에게 "보이는" 데이터라 포함하되,
//    어느 칩이 미끼인지 식별 가능한 신호(별도 목록·위치 편향)는 절대 내보내지 않는다.
//  - 요약 계열(summaryWithBlanks)은 서버에서 마스킹 완료본만 내보낸다 — 클라이언트가
//    정답으로 마스킹을 재현할 필요가 없도록(SW-LEAK-1/SW-LEAK-MASK 승계).
//  - 절대 throw 금지(문항 단위 격리) — 실패 시 최소 안전 필드(id/subType/questionText)로 강등.
//  - 누출 게이트: tests/unit/exam-scoring-student-safe.test.mjs 가 전 26 영어 유형
//    fixture 직렬화본에서 금지 키·카나리 문자열 부재를 강제한다.
//
// 유형별 조립 구현은 ./student-safe-data.ts(내부 모듈, 500줄 규율 분리)에 있다.
// ============================================================================

import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import {
  isMarkedQuestionSurfaceType,
  normalizeMarkedQuestionSurface,
} from "@/lib/marked-question-surface-normalization";
import { asRecord, asTrimmed, buildSafeData, buildSafeOptions } from "./student-safe-data";
import type { AnswerInputKind, AnswerSpec } from "./types";

// ── 표시 전용 메타 태그 정리(SF1) ────────────────────────────────────────────

/**
 * 학생 노출 questionText 에서 **표시 전용**으로 내부 메타 태그·정답성 라벨 라인을
 * 제거한다. 두 계열을 지운다:
 *  (1) `[type: …]` 힌트 라인(SF1) — 실데이터 322건 CONTENT_MATCH 발문 끝에
 *      structuredData.matchType 를 흘린 라벨만 있는 단독 라인.
 *  (2) `[빈칸 정답] (A) … (B) …` 등 **정답성 라벨** 라인(라벨 뒤 같은 줄의 정답
 *      본문까지 통째로). 진단(실데이터 540건): buildGeneratedQuestionText 가
 *      SUMMARY_COMPLETE(349)·BLANK_INFERENCE(191)의 DB questionText 에
 *      `[빈칸 정답] (A) sunk cost, (B) disregarding` 답키를 직접 구워 넣어,
 *      학생 응시면(/t) 페이로드로 정답이 그대로 새어 나갔다(설계 §6-1 정면 위반).
 *      `[정답]/[모범 답안]/[해설]`(강사 클립보드·내보내기 라벨) 라인도 방어적으로
 *      제거한다 — 어느 것도 학생 표시 콘텐츠가 아니다.
 * 표시용 라벨(`[Table: …]` 도표 캡션 / `[요약문]` / `[해석]`(직역, 설≠석) / `[보기]` /
 * `[주어진 문장]` / `[영작할 우리말]` / `[원문]` / `[조건]` / `[배열 단어]` / `[힌트]` /
 * `[유형: …]`)은 절대 건드리지 않는다. 태그가 없으면 원문을 그대로 반환해 다른
 * 유형·경로에 무회귀. 원본 DB·강사면·시험지 인쇄 경로는 이 함수를 거치지 않으므로
 * 불변(학생 페이로드 조립 단계 전용).
 */
export function stripStudentMetaTags(text: string): string {
  if (!text) return text;
  const stripped = text
    // (1) 라벨만 있는 [type: …] 단독 라인(줄 종결자 포함, key 는 'type' 한정) 제거.
    .replace(/^[ \t]*\[[ \t]*type[ \t]*:[^\]\n]*\][ \t]*(?:\r?\n|$)/gim, "")
    // (2) 정답성 라벨([빈칸 정답]/[정답]/[모범 답안]/[해설]) 라인 — 라벨 뒤 같은
    //     줄의 정답 본문까지 라인 통째로 제거. `[해석]`(설≠석)·`[요약문]`·`[보기]`
    //     등 표시 라벨은 알파벳/한글이 달라 매칭되지 않는다(무회귀).
    .replace(
      /^[ \t]*\[[ \t]*(?:빈칸[ \t]*정답|정답|모범[ \t]*답안|해설)[^\]\n]*\][^\n]*(?:\r?\n|$)/gim,
      "",
    );
  if (stripped === text) return text; // 태그 없음 → 원문 유지(무회귀 보장)
  // 태그 제거로 생긴 3연속+ 개행 축약 + 말단 잔여 공백/개행 정리(선행은 보존).
  return stripped.replace(/\n{3,}/g, "\n\n").replace(/[ \t\r\n]+$/g, "");
}

// ── 산출 타입 ────────────────────────────────────────────────────────────────

/** SUMMARY_COMPLETE_MC 선지의 빈칸별 값 — 선지 자체가 학생 노출물(정답 표시는 없음) */
export interface StudentSafeOptionBlankValue {
  label: string; // "(A)"
  value: string;
}

export interface StudentSafeOption {
  label: string;
  text: string;
  /** SUMMARY_COMPLETE_MC 전용 — (A)(B)… 빈칸별 선지 값 */
  blankValues?: StudentSafeOptionBlankValue[];
}

export interface StudentSafeParagraph {
  label: string; // "(A)"
  text: string;
}

/** 작문 계열 빈칸의 학생 노출 단서만 — answer/acceptableVariants/requiredLemmas 절대 미포함 */
export interface StudentSafeBlankSlot {
  label: string; // "(A)"
  firstLetterHint?: string; // 👁 "p s d" — 학생 노출 단서
  targetWordCount?: number;
  connectorFrameAfter?: string;
}

/** GRAMMAR_CORRECTION 밑줄 구간의 표시형만 — 오류 위치(errorPart)·정답(correctedPart) 미포함 */
export interface StudentSafeUnderlinedSegment {
  label: string; // "(A)" (단일 구간이어도 입력 필드 매칭용으로 유지)
  displayedText: string; // 학생에게 보이는(오류가 심어진) 밑줄 구간 텍스트
}

/** 유형별 렌더에 필요한 structuredData 필드의 화이트리스트 투영 */
export interface StudentSafeData {
  passageWithBlank?: string;
  passageWithMarkers?: string;
  passageWithUnderline?: string;
  passageWithNumbers?: string;
  underlinedExpression?: string;
  underlinedPronoun?: string;
  underlinedWord?: string;
  targetWord?: string;
  contextSentence?: string;
  givenSentence?: string;
  paragraphs?: StudentSafeParagraph[];
  /** 요약/주제문 계열 — 서버 마스킹 완료본(빈칸선·앞글자 슬롯 포함, 정답 미포함) */
  summaryWithBlanks?: string;
  matchType?: string;
  /** WORD_ORDER/TSW(scrambled) 셔플 칩 — 미끼 포함, 미끼 식별 불가 */
  scrambledWords?: string[];
  /** SUMMARY_WRITING/TSW(cloze) [보기] 칩 — 미끼 포함, 미끼 식별 불가 */
  wordBank?: string[];
  koreanGloss?: string;
  contextHint?: string;
  conditions?: string[];
  referenceSentence?: string;
  originalSentence?: string;
  mode?: string; // TOPIC_SENTENCE_WRITING: "scrambled" | "cloze"
  topicForm?: string;
  blanks?: StudentSafeBlankSlot[];
  underlinedSegments?: StudentSafeUnderlinedSegment[];
}

/** 응시 화면(태블릿/OMR)이 시험지 충실도로 렌더하는 데 필요한 전부 — 정답성 0 */
export interface StudentSafeQuestion {
  id: string;
  subType: string;
  /** 서버 조립본(GRAMMAR_CORRECTION 은 repairGrammarCorrectionQuestionText 경유) */
  questionText: string;
  questionImage?: string;
  direction?: string;
  /** 원문 지문(passage 관계) — 주제/제목/일치 등 원문 참조 유형용 */
  passageContent?: string;
  options?: StudentSafeOption[];
  safeData?: StudentSafeData;
}

/** AnswerSpec 에서 정답을 제거한 UI 투영 — 입력 위젯(OMR 칸/텍스트 필드)만 파생 가능 */
export interface AnswerUiSpecField {
  key: string; // StudentInput.texts 의 키
  label: string; // 표시 라벨 "(A)" | "밑줄 1"
}

export interface AnswerUiSpec {
  inputKind: AnswerInputKind;
  optionCount?: number;
  optionLabels?: string[];
  /** MULTI: "N개 선택" 카운터 — 설계 승인된 의도적 노출(§V2) */
  selectCount?: number;
  fields?: AnswerUiSpecField[];
  manualReason?: string;
}

/** buildStudentSafeQuestion 입력 — Question 레코드의 렌더 관련 최소 투영 */
export interface StudentRenderableQuestion {
  id: string;
  type?: string | null;
  subType: string | null;
  questionText: string;
  questionImage?: string | null;
  /** DB options 컬럼(JSON 문자열) 또는 파싱본 */
  options?: unknown;
  structuredData?: unknown;
  /**
   * 서버 내부 마스킹 폴백 전용(SUMMARY_COMPLETE_MC 정답 선지 식별) —
   * 산출물에는 어떤 형태로도 포함되지 않는다.
   */
  correctAnswer?: string | null;
  passage?: { content: string | null } | null;
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 문항 → 학생 안전 페이로드. 어떤 입력에도 throw 하지 않는다.
 * questionText 는 서버 조립(GRAMMAR_CORRECTION 마킹 지문 재구성 — exam-taking.ts
 * buildStudentQuestionText 의 영어 경로와 동일). KO 유형은 배포 단계에서 차단되므로
 * 여기서는 다루지 않는다(§계약: KOREAN 시험지 배포 금지).
 */
export function buildStudentSafeQuestion(
  q: StudentRenderableQuestion,
): StudentSafeQuestion {
  const fallbackText = stripStudentMetaTags(
    typeof q.questionText === "string" ? q.questionText : "",
  );
  try {
    const subType = q.subType ?? "";
    const data = normalizeMarkedQuestionSurface(
      subType,
      asRecord(q.structuredData),
      q.passage?.content,
    );

    const safe: StudentSafeQuestion = {
      id: q.id,
      subType,
      questionText: stripStudentMetaTags(
        repairGrammarCorrectionQuestionText({
          subType: q.subType,
          questionText: q.questionText,
          structuredData: q.structuredData,
        }),
      ),
    };

    const image = asTrimmed(q.questionImage);
    if (image) safe.questionImage = image;

    const direction = asTrimmed(data?.direction);
    if (direction) safe.direction = direction;

    const passageContent = asTrimmed(q.passage?.content);
    if (passageContent) safe.passageContent = passageContent;

    const options = buildSafeOptions(
      subType,
      isMarkedQuestionSurfaceType(subType)
        ? (data?.options ?? q.options)
        : (q.options ?? data?.options),
    );
    if (options.length > 0) safe.options = options;

    const safeData = buildSafeData(subType, data, q);
    if (safeData && Object.keys(safeData).length > 0) safe.safeData = safeData;

    return safe;
  } catch {
    // 조립 실패 시에도 응시는 계속돼야 한다 — questionText(시험지 인쇄 표면과 동일한
    // 학생 노출물)만으로 강등. structuredData 는 어떤 것도 내보내지 않는다.
    return { id: q.id, subType: q.subType ?? "", questionText: fallbackText };
  }
}

/**
 * AnswerSpec → 정답 제거 UI 투영. 화이트리스트 조립(스프레드 금지) —
 * correctChoices / fields[].answers / fields[].lemmas / textMode / partialCredit /
 * points 는 어떤 경로로도 내보내지 않는다.
 */
export function buildAnswerUiSpec(spec: AnswerSpec): AnswerUiSpec {
  const ui: AnswerUiSpec = { inputKind: spec.inputKind };
  if (typeof spec.optionCount === "number") ui.optionCount = spec.optionCount;
  if (Array.isArray(spec.optionLabels) && spec.optionLabels.length > 0) {
    ui.optionLabels = spec.optionLabels.map((label) => String(label));
  }
  if (typeof spec.selectCount === "number") ui.selectCount = spec.selectCount;
  if (Array.isArray(spec.fields) && spec.fields.length > 0) {
    ui.fields = spec.fields.map((f) => ({ key: f.key, label: f.label }));
  }
  if (spec.manualReason) ui.manualReason = spec.manualReason;
  return ui;
}
