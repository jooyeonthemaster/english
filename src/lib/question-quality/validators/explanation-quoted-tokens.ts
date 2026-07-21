// 해설 인용 실재 게이트 (O199~O201 S3i QUOTED_TOKEN_MISSING 이식) — V4(해설
// 사실성)의 결정형 부분집합: 해설·오답해설·keyPoints 가 따옴표로 인용한 영어
// 표현(12자 이상 조각)이 학생에게 보이는 문항 표면(지문·선지·밑줄·고친 형태 등)
// 에 실재하지 않으면 환각 인용이다. LLM 검증 없이 0원으로 차단한다.
// ⚠ 한계(의도된 트레이드오프): 12자 미만 짧은 인용('attaches' 류 한 단어 환각)은
// 오탐 방지를 위해 이 게이트가 못 본다 — 그 축은 LLM 검수리(E2 계약)·E-gate 가
// 담당한다. 이 게이트는 strict 레인 전용 차단(RELAXED_BLOCKING 미등재).
//
// 오탐 방지(전부 실측 이력 기반):
//   - 허용 코퍼스는 해설 필드를 제외한 문항 JSON 전체 + 원지문 — 유형별 필드
//     열거 없이 모든 표시 표면(givenSentence·summaryWithBlanks·correction 등)을
//     자동 포함한다. 추가로 "교정 대입 문장" 인용 관행(어법 해설이 correction 을
//     대입한 문장을 인용, 빈칸 해설이 정답 선지를 대입한 문장을 인용)을 위해
//     교정/대입 파생 코퍼스를 합성한다(리뷰 실측 오탐 클래스 봉합).
//   - 여는 따옴표는 단어 내부 아포스트로피를 배제(lookbehind) — "author's
//     'inevitable progress'" 에서 "s 'inevitable" 류 유령 인용 차단.
//   - 중략(…/...)·쉼표 인용은 조각으로 분할해 12자 이상 조각만 검사한다
//     (O201: 정상 해설의 중략 인용 관행이 8건 오탐 → 조각 분할로 봉합).
//   - 검사는 대소문자·공백 정규화 substring — 어형 변화 인용("'attach'라는
//     동사")은 코퍼스의 굴절형("attaches")에 부분 포함되어 통과한다.
//   - 비교 정규화는 core 단일 소스(normalizeComparableText — 곱슬따옴표 접기
//     포함): 지문의 타이포그래피 아포스트로피(’)와 해설의 직선 아포스트로피(')
//     가 어긋나 실재 인용을 오탐하는 클래스를 차단한다.

import { normalizeComparableText } from "../core";

const EXPLANATION_FIELDS = new Set([
  "explanation",
  "wrongOptionExplanations",
  "keyPoints",
  "answerLogic",
  "tags",
]);

const QUOTED_ENGLISH =
  /(?<![A-Za-z])['‘“"]([A-Za-z][A-Za-z .,'-]{2,60}?)['’”"]/g;
const MIN_FRAGMENT_LENGTH = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * "교정/대입 문장" 인용 관행용 파생 코퍼스 — 어법 해설은 원문에 correction 을
 * 대입한 문장을, 빈칸 해설은 빈칸에 정답 선지를 대입한 문장을 자주 인용한다.
 * 원지문에는 그 조합 문자열이 없어 오탐이 나므로 결정형으로 합성해 코퍼스에
 * 더한다. (markedExpressions 의 expression→correction / errorExpression→correction
 * 치환본, passageWithBlank 의 빈칸→정답 선지 대입본.)
 */
function buildDerivedCorpusParts(question: Record<string, unknown>, passage: string): string[] {
  const parts: string[] = [];
  const marked = question.markedExpressions;
  if (Array.isArray(marked)) {
    for (const item of marked) {
      if (!isRecord(item)) continue;
      const expression = typeof item.expression === "string" ? item.expression : "";
      const errorExpression =
        typeof item.errorExpression === "string" ? item.errorExpression : "";
      const correction = typeof item.correction === "string" ? item.correction : "";
      if (expression && correction && passage.includes(expression)) {
        parts.push(passage.split(expression).join(correction));
      }
      if (errorExpression && correction) {
        // 오형이 표시된 렌더 지문 기준 교정 인용("errorExpression → correction 문장").
        const rendered = typeof question.passageWithMarkers === "string"
          ? question.passageWithMarkers
          : "";
        if (rendered && rendered.includes(errorExpression)) {
          parts.push(rendered.split(errorExpression).join(correction));
        }
      }
    }
  }
  const passageWithBlank =
    typeof question.passageWithBlank === "string" ? question.passageWithBlank : "";
  if (passageWithBlank.includes("_____")) {
    const options = Array.isArray(question.options) ? question.options : [];
    for (const option of options) {
      if (!isRecord(option) || typeof option.text !== "string" || !option.text) continue;
      parts.push(passageWithBlank.split(/_{2,}/).join(option.text));
    }
  }
  return parts;
}

/**
 * 검사 대상 텍스트는 JSON.stringify 로 직렬화하면 안 된다 — 직렬화가 모든 문자열
 * 값에 씌우는 큰따옴표를 게이트가 "인용"으로 오인한다(영어 문장 해설 값이 통째로
 * 인용으로 잡히는 오탐, 단위테스트 실측). 문자열 리프 값만 모아 개행으로 잇는다.
 */
function collectStringLeaves(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringLeaves(item, out);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) collectStringLeaves(item, out);
  }
}

function flattenExplanationText(value: unknown): string {
  const leaves: string[] = [];
  collectStringLeaves(value, leaves);
  return leaves.join("\n");
}

export interface ExplanationQuotedTokenFinding {
  code: "explanation-quoted-token-missing";
  message: string;
  evidence: { quote: string; fragment: string; field: string };
}

export function findExplanationQuotedTokenIssue(
  question: Record<string, unknown>,
  passage: string | undefined,
): ExplanationQuotedTokenFinding | null {
  const explanationTexts: Array<{ field: string; text: string }> = [];
  const corpusParts: string[] = [passage ?? ""];
  for (const [key, value] of Object.entries(question)) {
    if (value === null || value === undefined) continue;
    // 내부 메타(_ 접두)는 표시 표면이 아니므로 코퍼스·검사 모두 제외.
    if (key.startsWith("_")) continue;
    if (EXPLANATION_FIELDS.has(key)) {
      // tags 는 검사 대상도 코퍼스도 아니다(자유 라벨) — 오탐·누출 양쪽 차단.
      if (key === "tags") continue;
      // 문자열 리프 값만 추출(직렬화 따옴표 오탐 방지) — 라벨 키는 검사 불필요.
      const text = flattenExplanationText(value);
      if (text) explanationTexts.push({ field: key, text });
      continue;
    }
    const serialized =
      typeof value === "string" ? value : JSON.stringify(value);
    if (serialized) corpusParts.push(serialized);
  }
  if (explanationTexts.length === 0) return null;
  corpusParts.push(...buildDerivedCorpusParts(question, passage ?? ""));
  const corpus = normalizeComparableText(corpusParts.join(" "));

  for (const { field, text } of explanationTexts) {
    for (const match of text.matchAll(QUOTED_ENGLISH)) {
      const quote = match[1].trim();
      // 중략·쉼표 인용은 조각 분할, 12자 미만 조각(관사·단어 조각)은 건너뛴다.
      const fragments = quote
        .split(/\.{2,}|…|,/)
        .map((fragment) => fragment.trim())
        .filter((fragment) => fragment.length >= MIN_FRAGMENT_LENGTH);
      for (const fragment of fragments) {
        if (!corpus.includes(normalizeComparableText(fragment))) {
          return {
            code: "explanation-quoted-token-missing",
            message: `Explanation field "${field}" quotes an English expression that does not exist in the passage, options, or any visible question surface: "${fragment.slice(0, 60)}". Quote only expressions that actually appear in the item (hallucinated citation).`,
            evidence: { quote: quote.slice(0, 80), fragment: fragment.slice(0, 80), field },
          };
        }
      }
    }
  }
  return null;
}
