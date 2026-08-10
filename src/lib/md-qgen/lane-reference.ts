// ============================================================================
// 지칭 추론(REFERENCE) md 레인 디스크립터.
// 견본: lane-antonym.ts · 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md
// ============================================================================

import {
  readOptionLanguageSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import { normalizeWs } from "./parser";
import { buildMdReferencePrompt } from "./prompts-reference";
import {
  autoSnapReference,
  parseMdReference,
  referenceTargetOf,
  stripReferenceMarks,
  type MdReferenceQuestion,
} from "./parser-reference";
import { gateMdReference } from "./gate-reference";
import {
  adaptMdReferenceToAiQuestion,
  buildReferenceDirectionEn,
} from "./adapter-reference";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

/**
 * 교사 지정 준수 게이트(방어적).
 * REFERENCE 는 POINT_PICKER_CONFIG 미등재라 clampTeacherPoints 가 항상 [] 를
 * 돌려주므로 실사용에서는 발화하지 않는다. 픽커가 나중에 열려도 계약이 비어 있지
 * 않도록, "지정 표현이 밑줄문장 안에 있어야 한다"는 최소 판정만 걸어 둔다.
 */
function teacherPointIssues(q: MdReferenceQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const sentence = normalizeWs(stripReferenceMarks(q.markedSentence));
  const pronoun = normalizeWs(referenceTargetOf(q.markedSentence).pronoun);
  const issues: string[] = [];
  for (const point of ctx.teacherPoints) {
    const pt = normalizeWs(point.text);
    if (!pt) continue;
    const hit =
      (sentence.length > 0 && sentence.includes(pt)) ||
      (pronoun.length > 0 && (pt.includes(pronoun) || pronoun.includes(pt)));
    if (!hit) {
      issues.push(`교사 지정 표현이 밑줄문장에 없음: '${point.text.slice(0, 60)}'`);
    }
  }
  return issues;
}

export const REFERENCE_MD_LANE: MdLane = {
  subType: "REFERENCE",

  // ⚠ fast 레인 getOperationType 과 동기(fast/route.ts:70·90-98):
  // VOCAB_TYPES = {CONTEXT_MEANING, SYNONYM, ANTONYM} 에 REFERENCE 는 없다 →
  // QUESTION_GEN_SINGLE. 어휘 계열로 착각해 VOCAB 로 적으면 이번엔 반대로
  // 과소 청구가 나고 클라이언트 견적과도 어긋난다.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(규범 §1[6]).
  retryEligible: true,

  // 유형 전용 설정 노브가 없다(dispatchers.ts 에 reference* 키 0건, 선지 5개 고정).
  // 언어 토글은 범위 제한이 아니라 프롬프트 집행 사항이라 적격성과 무관하다.
  isEligible() {
    return true;
  },

  buildBasePrompt(ctx) {
    return buildMdReferencePrompt(ctx.passage, "full", ctx.difficulty);
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 발문 언어 집행 — REFERENCE 의 토글 범위는 'stem' 이다
    // (OPTION_LANGUAGE_FREE_TYPE_IDS 미등재 → 선지는 한국어 구조 고정).
    if (readStemLanguageSetting(ctx.rawTypeSettings, "REFERENCE") === "en") {
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다.\n- 선지는 지금까지의 지시대로 **한국어 지칭 대상**을 유지하고, 해설·오답 해설도 한국어 그대로 둔다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdReference(text);
    const snapped = autoSnapReference(parsed, ctx.passage);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: [
        ...gateMdReference(q, ctx.passage),
        ...teacherPointIssues(q, ctx),
      ],
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdReferenceToAiQuestion(
      parsed.question as MdReferenceQuestion,
      ctx.passage,
      ctx.rawDifficulty,
    );
    if (
      result.ok &&
      result.aiQuestion &&
      readStemLanguageSetting(ctx.rawTypeSettings, "REFERENCE") === "en"
    ) {
      result.aiQuestion.direction = buildReferenceDirectionEn(
        String(result.aiQuestion.underlinedPronoun ?? ""),
      );
    }
    return result;
  },

  qualityArgs(ctx) {
    return {
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "REFERENCE"),
      optionLanguage: readOptionLanguageSetting(ctx.rawTypeSettings, "REFERENCE"),
    };
  },

  mdFormat(ctx) {
    return {
      optionCount: 5,
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "REFERENCE"),
    };
  },

  diversityTargets(structuredData) {
    // fast 레인과 같은 축(question-diversity.ts:241-247): 같은 대명사의 다른 위치
    // 출제를 허용하려고 발생 단위(주변 문맥)로 기록한다.
    const surrounding = structuredData.surroundingText;
    if (typeof surrounding === "string" && surrounding.trim()) {
      return [surrounding.trim()];
    }
    const pronoun = structuredData.underlinedPronoun;
    return typeof pronoun === "string" && pronoun.trim() ? [pronoun.trim()] : [];
  },
};
