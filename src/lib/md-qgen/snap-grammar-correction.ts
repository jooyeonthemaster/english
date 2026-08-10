// ============================================================================
// 문법 오류 수정(GRAMMAR_CORRECTION) 0원 자동보정(스냅) — LLM 콜 없음.
// parser-grammar-correction.ts 에서 분리했다(규범 "400줄에서 분할" 조항 —
// gate-grammar-correction.ts 선례). 의존 방향은 이 파일 → parser 단방향이다
// (parser 가 여기를 재수출하면 순환 import 가 된다 — 하지 마라).
//
// 보정은 전부 결정형이고, 전부 "재구성 게이트가 최종 심판" 이라는 이중 안전망
// 위에서 돈다 — 잘못 보정하면 재구성이 어긋나 그대로 반려된다.
// ============================================================================

import { cleanMdValue } from "./decoration";
import { countWordBoundaryMatches, escapeRegExp, normalizeWs } from "./parser";
import type { MdGrammarCorrectionQuestion } from "./parser-grammar-correction";

/** 대소문자만 다른 유일 등장 표면을 찾는다(문두 대문자 드리프트 보정용). */
function caseOnlySurface(haystack: string, needle: string): string | null {
  const trimmed = needle.trim();
  if (!trimmed) return null;
  const body = escapeRegExp(trimmed).replace(/\s+/g, "\\s+");
  const hits = [
    ...haystack.matchAll(new RegExp(`(?<![A-Za-z])${body}(?![A-Za-z])`, "gi")),
  ];
  if (hits.length !== 1) return null;
  return hits[0][0] === trimmed ? null : hits[0][0];
}

const TRAILING_PUNCT = /[.,;:!?]+$/;

/**
 * 0원 자동 보정. 네 가지만, 전부 결정형이다.
 *
 *  (1) 꼬리 구두점 제거 — `고침(A): were → was.` 처럼 문장부호가 붙어 오면
 *      틀린 표현이 밑줄 안에서 안 잡힌다. 제거본이 정확히 1회 잡힐 때만 채택.
 *  (2) 화살표 방향 복구 — 틀린 표현이 밑줄 안에 없는데 올바른 표현이 정확히
 *      1회 있으면 모델이 좌우를 바꿔 쓴 것이다(실측 최다 드리프트 형태).
 *  (3) 대소문자 스냅 — 문장 첫 단어를 소문자로 적어 오는 드리프트.
 *  (4) 허용답 정규화 — 공백·중복 제거 + 올바른 표현을 반드시 포함시킨다
 *      (채점 집합에서 모범답안이 빠지면 정답을 쓴 학생이 오답 처리된다).
 */
export function autoSnapCorrectionSegments(
  q: MdGrammarCorrectionQuestion,
): { question: MdGrammarCorrectionQuestion; corrections: string[] } {
  const corrections: string[] = [];
  const segments = q.segments.map((segment) => {
    let next = segment;
    const inMarker = (expr: string) =>
      expr ? countWordBoundaryMatches(next.displayedText, expr) : 0;

    // (1) 꼬리 구두점
    if (next.errorPart && inMarker(next.errorPart) !== 1) {
      const trimmedError = next.errorPart.replace(TRAILING_PUNCT, "").trim();
      if (trimmedError && trimmedError !== next.errorPart && inMarker(trimmedError) === 1) {
        const trimmedFix = next.correctedPart.replace(TRAILING_PUNCT, "").trim();
        corrections.push(
          `${next.label} 고침 줄 꼬리 구두점 제거: '${next.errorPart}' → '${trimmedError}'`,
        );
        next = {
          ...next,
          errorPart: trimmedError,
          correctedPart: trimmedFix || next.correctedPart,
        };
      }
    }

    // (2) 화살표 방향 복구
    if (
      next.errorPart &&
      next.correctedPart &&
      inMarker(next.errorPart) !== 1 &&
      inMarker(next.correctedPart) === 1
    ) {
      corrections.push(
        `${next.label} 고침 줄 좌우 교정: '${next.errorPart} → ${next.correctedPart}' 를 뒤집음`,
      );
      next = { ...next, errorPart: next.correctedPart, correctedPart: next.errorPart };
    }

    // (3) 대소문자 스냅
    if (next.errorPart && inMarker(next.errorPart) !== 1) {
      const surface = caseOnlySurface(next.displayedText, next.errorPart);
      if (surface) {
        corrections.push(
          `${next.label} 틀린 표현 대소문자 스냅: '${next.errorPart}' → '${surface}'`,
        );
        next = { ...next, errorPart: surface };
      }
    }

    // (4) 허용답 정규화
    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (const raw of next.acceptedAnswers) {
      // 채점 집합(exam-scoring answer-spec)으로 그대로 나가는 값이다 — 장식이 한 겹만
      // 남아도 학생의 정답이 오답 처리된다. 세척은 공유 유틸 하나로만 한다.
      const value = cleanMdValue(raw);
      if (!value) continue;
      const key = normalizeWs(value).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(value);
    }
    if (cleaned.length > 0 && next.correctedPart) {
      const fixKey = normalizeWs(next.correctedPart).toLowerCase();
      if (!seen.has(fixKey)) {
        cleaned.unshift(next.correctedPart);
        corrections.push(`${next.label} 허용답에 올바른 표현 '${next.correctedPart}' 보충`);
      }
    }
    if (
      cleaned.length !== next.acceptedAnswers.length ||
      cleaned.some((value, i) => value !== next.acceptedAnswers[i])
    ) {
      next = { ...next, acceptedAnswers: cleaned };
    }

    return next;
  });

  return { question: { ...q, segments }, corrections };
}
