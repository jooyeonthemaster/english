// ============================================================================
// AI 문제 수정 — 편집 전용 결정론 가드 (run-edit 에서만 사용)
// ============================================================================
// 베이스라인(before)을 가진 "수정" 맥락에서만 의미가 있는 가드들을 모은다. 생성
// 파이프라인(question-quality.ts)은 베이스라인이 없으므로 이 가드를 타지 않는다 →
// 생성 경로 무회귀. run-edit.ts 가 품질게이트 결과와 합쳐 errors/warnings 로 처리한다.
// ============================================================================

import type { QuestionQualityIssue } from "@/lib/question-quality";
import type { DiffEntry } from "./detailed-diff";
import type { EditFieldChange } from "./types";

type Rec = Record<string, unknown>;

// ── 1) 무결성 치명 코드(acceptedWithWarnings 폴백에서 강등 출시 금지) ──────────
// 정답이 학생면에서 소실/무효이거나, 정답이 누설되거나, 유형이 변형된 경우. 이 코드의
// error 가 maxAttempts 소진 후에도 남으면 "경고와 함께 수락"으로 출시하지 않고 하드
// 실패(호출자 환불·재시도 유도)한다. 길게 늘어진 선지·미세 퇴화 등 "쓸 수는 있는"
// 결함은 여기 넣지 않는다(종전대로 경고 수락 → 수율 보존).
//
// ⚠️ 불변식: question-quality.ts 의 SHIP_FIRST_WARNING_CODES 와 교집합이 0 이어야 한다.
//   (SHIP_FIRST 에 든 코드는 게이트에서 warning 으로 강등되어 애초에 lastErrors 에 안
//    잡히므로 차단이 무력화된다. 신규 차단 코드는 절대 SHIP_FIRST 에 넣지 말 것.)
export const BLOCKING_EDIT_CODES = new Set<string>([
  // 어법: 정답 비가시·오류 부재·정답 라벨 불일치 (풀 수 없거나 정답이 학생면에서 소실)
  "grammar-render-marker-count",
  "grammar-marker-count",
  "grammar-error-count",
  "grammar-error-not-mutated",
  "grammar-correct-answer-labels",
  "grammar-missing-error-expression",
  // 어법 콤보: 렌더 슬롯 구조 붕괴(선지 자체가 학생면에 안 보임)
  "combo-render-slot-count",
  // 객관식 정답/선지 구조(정답이 옵션에 없음·개수·빈·중복 = 풀 수 없음)
  "correct-answer-mismatch",
  "option-count",
  "empty-option-text",
  "duplicate-option-text",
  "generic-answer-count",
  // 정답 극성(내용일치 일치/불일치·대의 부정극성) = 복수정답/정답무효
  "content-match-direction-polarity",
  "content-match-type-mismatch",
  "gist-polarity-direction-mismatch",
  "gist-polarity-field-mismatch",
  // 정답 누설(학생면 직접 노출) — question-quality.ts 신규 게이트와 코드 1:1 매칭
  "sw-wordbank-answer-coverage",
  "fbk-missing-blank-marker",
  "fbk-answer-skeleton-leak",
  "sentence-order-label-order-leak",
  "sentence-order-text-order-prefix",
  "sentence-order-unscrambled-answer",
  // 유형 변형(다른 유형으로 둔갑) — 유형 고정 계약 위반
  "type-foreign-field",
  "title-direction-foreign",
]);

/** lastErrors 중 출시 차단 대상이 하나라도 있나(폴백 강등 금지 판정). */
export function hasBlockingError(errors: QuestionQualityIssue[]): boolean {
  return errors.some((e) => BLOCKING_EDIT_CODES.has(e.code));
}

// ── 2) provider 스키마 미스매치 감지(M6 친절 안내) ────────────────────────────
// generateObject 가 "No object generated: response did not match schema" 류를 던지는
// 경우(선지 7개/유형 변경/밑줄 10개 등 구조 위반). 원시 영어 대신 한국어로 안내한다.
export function isSchemaMismatchError(raw: string): boolean {
  return /no object generated|did not match schema|could not parse|response did not match/i.test(
    raw,
  );
}

export const SCHEMA_MISMATCH_USER_MESSAGE =
  "선지·밑줄·빈칸 개수나 문제 유형은 AI 수정으로 바꿀 수 없어요. 개수·유형은 그대로 두고 내용 수정으로 다시 시도해 주세요.";

// ── 3) 선지/정답 길이 가드(M1 폭증 · M2 정답-길이 식별) ────────────────────────
// 상한을 절대값이 아니라 "베이스라인 상대값"으로 둔다 → 원래 길었던 정상 선지(절대
// 길이가 큰 정상 문제)는 before≈after 면 통과(레이아웃 회귀 방지). 표준 프리셋의 실측
// 성장률은 1.0~1.17 이라 ×1.6 문턱 아래 → 정상 편집 무회귀.
const LENGTH_INFLATION_TYPES = new Set([
  "TITLE",
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IMPLIED_MEANING",
  "BLANK_INFERENCE",
  "IRRELEVANT",
  "REFERENCE",
]);

const INFLATION_RATIO = 1.6;

function optionTexts(q: Rec): string[] {
  const opts = Array.isArray(q.options) ? q.options : [];
  return opts
    .map((o) =>
      o && typeof o === "object" && typeof (o as Rec).text === "string"
        ? ((o as Rec).text as string).trim()
        : "",
    )
    .filter((t) => t.length > 0);
}

function optionLens(q: Rec): number[] {
  return optionTexts(q).map((t) => t.length);
}

function avg(ns: number[]): number {
  return ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : 0;
}

const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

/** 옵션/정답 라벨 정규화 — 원숫자(③)·괄호((3))·구두점 표기차를 흡수해 "3" 으로 통일. */
function normLabel(value: unknown): string {
  let s = typeof value === "string" ? value : value == null ? "" : String(value);
  s = s.replace(/[①-⑳]/g, (m) => String(CIRCLED_DIGITS.indexOf(m) + 1));
  return s.replace(/[()[\].\s]/g, "").trim();
}

/**
 * 편집 전후 선지/정답 길이 이상을 결정론으로 검출한다.
 *  - (M1) edit-option-length-inflation [error]: 평균·최장 둘 다 베이스라인×1.6 초과
 *      → 재시도(buildCorrectiveFeedback)로 간결화 유도. 차단 코드 아님(길어도 쓸 수는
 *        있으므로, 끝내 못 줄이면 경고 수락 출시).
 *  - (M2) edit-answer-length-tell [warning]: 정답 선지가 오답들보다 현저히 짧아 길이만으로
 *      정답이 드러남(또는 현저히 길어 정답이 자기 노출). 권고 경고(출시 차단 아님).
 */
export function checkEditLengthIssues(
  subType: string,
  before: Rec,
  after: Rec,
): QuestionQualityIssue[] {
  if (!LENGTH_INFLATION_TYPES.has(subType)) return [];
  const out: QuestionQualityIssue[] = [];

  const b = optionLens(before);
  const a = optionLens(after);
  if (b.length >= 2 && a.length >= 2) {
    const bAvg = avg(b);
    const aAvg = avg(a);
    const bMax = Math.max(...b);
    const aMax = Math.max(...a);
    // (M1) 평균 + 최장 이중조건 → 한 선지만 약간 늘어난 경우 오탐 방지.
    if (bAvg > 0 && bMax > 0 && aAvg > bAvg * INFLATION_RATIO && aMax > bMax * INFLATION_RATIO) {
      out.push({
        severity: "error",
        code: "edit-option-length-inflation",
        message: `선지 길이가 원본보다 과도하게 길어졌습니다(평균 ${Math.round(bAvg)}→${Math.round(aAvg)}자, 최장 ${bMax}→${aMax}자). 유형 규범에 맞게 원본과 비슷한 길이로 간결하게 유지하세요.`,
      });
    }
  }

  // (M2) 정답-길이 식별: 정답 선지가 오답 평균보다 현저히 짧음(또는 김).
  // 라벨은 정규화해 비교(③/(3)/3 표기차 흡수) — 표기차로 정답 옵션을 못 찾아 검사가 조용히
  // 스킵되는 거짓음성을 막는다.
  const ansLabel = normLabel(after.correctAnswer);
  const opts = Array.isArray(after.options) ? after.options : [];
  if (ansLabel && opts.length >= 4) {
    const labelOf = (o: unknown) =>
      o && typeof o === "object" ? normLabel((o as Rec).label) : "";
    const textLenOf = (o: unknown) =>
      o && typeof o === "object" && typeof (o as Rec).text === "string"
        ? ((o as Rec).text as string).trim().length
        : 0;
    const ansOpt = opts.find((o) => labelOf(o) === ansLabel);
    const distLens = opts.filter((o) => labelOf(o) !== ansLabel).map(textLenOf).filter((n) => n > 0);
    const ansLen = ansOpt ? textLenOf(ansOpt) : 0;
    if (ansLen > 0 && distLens.length >= 3) {
      const distAvg = avg(distLens);
      const distMin = Math.min(...distLens);
      const distMax = Math.max(...distLens);
      // 정답이 모든 오답보다 짧고 평균의 60% 미만 → 길이 tell.
      if (ansLen < distMin && ansLen < distAvg * 0.6) {
        out.push({
          severity: "warning",
          code: "edit-answer-length-tell",
          message:
            "정답 선지가 오답들보다 현저히 짧아 길이만으로 정답이 드러납니다. 정답과 오답의 길이를 비슷하게 맞추세요.",
        });
      } else if (ansLen > distMax && ansLen > distAvg * 1.6) {
        out.push({
          severity: "warning",
          code: "edit-answer-length-tell",
          message:
            "정답 선지가 오답들보다 현저히 길어 길이만으로 정답이 드러납니다. 정답과 오답의 길이를 비슷하게 맞추세요.",
        });
      }
    }
  }

  return out;
}

// ── 4) editSummary 환각 억제(M4) ──────────────────────────────────────────────
// 결정론 diff 가 완전히 비었으면(=실제 변경 없음) 모델의 "바꿨다" 서술을 신뢰하지 않는다.
export const NO_CHANGE_EDIT_SUMMARY =
  "지시하신 부분에 해당하는 실질적인 변경이 발생하지 않았습니다. 지시를 더 구체적으로 입력해 다시 시도해 주세요.";

export function isNoRealChange(
  detailed: DiffEntry[],
  changes: EditFieldChange[],
): boolean {
  return detailed.length === 0 && changes.length === 0;
}
