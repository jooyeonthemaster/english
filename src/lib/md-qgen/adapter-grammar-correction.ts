// ============================================================================
// 문법 오류 수정(GRAMMAR_CORRECTION) 어댑터 — md 파싱 결과 →
// processGrammarCorrection 이 받는 AI 문항 형상. 견본: adapter-antonym.ts.
//
// ── 후처리 경계 계약 (processors/grammar-correction.ts 실측) ────────────────
//  어댑터가 만든다(최소 입력):
//    direction · underlinedSegments[](label·sourceText·displayedText·isError=true·
//    errorPart·correctedPart·acceptedAnswers?·surroundingText) ·
//    explanation · keyPoints(빈 배열) · tags · difficulty
//  후처리가 만든다(어댑터가 절대 만들지 않는다 — 이중 생성은 충돌한다):
//    passageWithUnderline(`__(A) 구간__` 재조립, :125) · 라벨 정규화(:56) ·
//    errorPart/errorParts/correctedPart/correctedParts 평탄화(:127-134) ·
//    correctAnswer("(A) x, (B) y" 조립, :148-150) · direction 정규화(:156) ·
//    acceptedAnswers 정규화·재부착(:121)
//
//  ⚠ 라벨 축은 **"(A)" 대문자 고정**이다(grammar-correction-display.ts 의
//    grammarCorrectionLabel 과 같은 축). 숫자·원문자로 내면 저장 데이터와
//    시험지·DOCX 표면이 기존 문항과 함께 어긋난다.
//  ⚠ 모든 구간은 isError=true 다. 하나라도 false 면 후처리가 통째로 실패한다
//    (processGrammarCorrection:43-50). 이 유형에는 "옳은 밑줄(미끼)" 이 없다.
//  ⚠ 빈칸·어법 계열 필드(blanks·passageWithBlank·originalExpression·
//    markedExpressions·sentenceWithError)를 흘리면 validators/misc.ts 의
//    type-foreign-field 로 error 가 찍힌다 — 넣지 마라.
//  ⚠ options/wrongOptionExplanations 를 만들지 마라 — 선지가 없는 서술형이다.
// ============================================================================

import { contextAround } from "./adapter";
import { cleanMdValue } from "./decoration";
import { normalizeWs } from "./parser";
import {
  GRAMMAR_CORRECTION_MD_ERROR_COUNT_MAX,
  GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN,
} from "./prompts-grammar-correction";
import {
  INLINE_CORRECTION_MARK_RE,
  correctionMarkLabel,
  deriveCorrectionSourceText,
  type MdGrammarCorrectionQuestion,
} from "./parser-grammar-correction";
import type { MdLaneAdaptResult } from "./lane-types";

/** 후처리 DEFAULT_GRAMMAR_CORRECTION_DIRECTION 과 동일 문자열(사용자 표면 무변경). */
export const GRAMMAR_CORRECTION_MD_DIRECTION_SINGLE =
  "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.";

/**
 * 밑줄 2곳 이상용 발문 — 라벨을 열거해 "각각 고쳐 쓴다"를 명시한다.
 * normalizeGrammarCorrectionDirection 의 통과 조건(밑줄 + 고쳐, 그리고 구간이
 * 2개 이상이므로 "밑줄 친 부분 중" 단일 가드에 걸리지 않음)을 만족하므로
 * 후처리가 이 문자열을 그대로 유지한다.
 */
export function grammarCorrectionMdDirection(labels: readonly string[]): string {
  if (labels.length <= 1) return GRAMMAR_CORRECTION_MD_DIRECTION_SINGLE;
  return `다음 글의 밑줄 친 ${labels.join(", ")}에서 각각 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.`;
}

export function adaptMdGrammarCorrectionToAiQuestion(
  q: MdGrammarCorrectionQuestion,
  passage: string,
  difficulty: string,
): MdLaneAdaptResult {
  if (
    q.segments.length < GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN ||
    q.segments.length > GRAMMAR_CORRECTION_MD_ERROR_COUNT_MAX
  ) {
    return {
      ok: false,
      error: `밑줄 구간 ${q.segments.length}개 (${GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN}~${GRAMMAR_CORRECTION_MD_ERROR_COUNT_MAX}개 필요)`,
    };
  }

  // 각 자리의 원문 축자 구간(sourceText)을 복원한다 — 이 유형의 위치 탐색 키다.
  const sourceByLabel = new Map<string, string>();
  for (const segment of q.segments) {
    const sourceText = deriveCorrectionSourceText(segment);
    if (!sourceText) {
      return {
        ok: false,
        error: `${segment.label} 밑줄 구간의 원문을 복원할 수 없음(틀린 표현이 구간 안에 유일하게 존재해야 한다)`,
      };
    }
    sourceByLabel.set(segment.label, sourceText);
  }

  // 밑줄지문에서 마커를 **복원 원문으로** 되돌리며 각 자리의 "깨끗한 지문" 내
  // 위치를 계산한다 — 정본 adaptMdGrammarToAiQuestion 의 재구성 위치추적과 동일 기법.
  const positions = new Map<string, { index: number; length: number }>();
  let clean = "";
  let cursor = 0;
  for (const m of q.markedPassage.matchAll(INLINE_CORRECTION_MARK_RE)) {
    // 마커 라벨은 소문자·공백 드리프트를 흡수해 저장 축("(A)")으로 정규화한다 —
    // 여기서 raw 캡처를 그대로 쓰면 `[[a:…]]` 출력에서 sourceByLabel 조회가
    // 전부 빗나가 좌표가 통째로 어긋난다.
    const label = correctionMarkLabel(m[1]);
    // 마커 안 텍스트는 파서가 cleanMdValue 로 세척한 축(displayedText)과 같은 값이어야
    // 한다 — 여기서 raw 캡처를 그대로 쓰면 좌표가 장식 길이만큼 어긋난다.
    const restored = sourceByLabel.get(label) ?? cleanMdValue(m[2]);
    clean += q.markedPassage.slice(cursor, m.index);
    positions.set(label, { index: clean.length, length: restored.length });
    clean += restored;
    cursor = (m.index ?? 0) + m[0].length;
  }
  clean += q.markedPassage.slice(cursor);
  // 재구성본이 원문과 정합할 때만 그 좌표를 신뢰한다(게이트가 이미 검사하지만,
  // 어댑터 단독 호출·드리프트 대비 이중 방어).
  const useClean = clean.length > 0 && normalizeWs(clean) === normalizeWs(passage);
  const source = useClean ? clean : passage;

  const underlinedSegments = q.segments.map((segment) => {
    const sourceText = sourceByLabel.get(segment.label) ?? segment.displayedText;
    const pos = positions.get(segment.label);
    const index = useClean && pos ? pos.index : passage.indexOf(sourceText);
    const length = pos?.length ?? sourceText.length;
    return {
      label: segment.label,
      sourceText,
      displayedText: segment.displayedText,
      // 이 유형은 밑줄 전부가 오류다(후처리 하드 계약).
      isError: true,
      errorPart: segment.errorPart,
      correctedPart: segment.correctedPart,
      ...(segment.acceptedAnswers.length > 0
        ? { acceptedAnswers: [...segment.acceptedAnswers] }
        : {}),
      // 위치 확정 실패 시 빈 문자열 — 후처리 findExpressionInPassage 의 퍼지
      // 탐색에 맡긴다(정본 규약: 엉뚱한 좌표를 넘기느니 비운다).
      surroundingText: index >= 0 ? contextAround(source, index, length) : "",
    };
  });

  return {
    ok: true,
    aiQuestion: {
      direction: grammarCorrectionMdDirection(q.segments.map((s) => s.label)),
      underlinedSegments,
      explanation: q.explanation,
      // keyPoints 합성 금지 — 정본 adapter.ts:319-322 와 동일 근거(합성문이
      // 모델 오태깅을 학생 표면에 노출한 실사고). 빈 배열 = 검증기·렌더 스킵.
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
