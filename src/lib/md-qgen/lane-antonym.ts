// ============================================================================
// 반의어(ANTONYM) md 레인 디스크립터.
// 【신규 유형 승차의 견본(EXEMPLAR)】 다른 유형 lane 은 이 파일의 구조를 그대로 따른다.
// 계약 문서: docs/md-qgen-type-expansion-spec.md · 인터페이스: ./lane-types.ts
// ============================================================================

import { buildAntonymCandidateBlock } from "@/lib/question-quality/candidate-blocks/antonym";
import {
  readAntonymPairCountSetting,
  readStemLanguageSetting,
} from "@/lib/question-type-generation-settings";
import { normalizeWs } from "./parser";
import {
  buildMdAntonymPrompt,
  clampAntonymMdPairCount,
  ANTONYM_MD_PAIR_COUNT_MAX,
  ANTONYM_MD_PAIR_COUNT_MIN,
} from "./prompts-antonym";
import {
  autoSnapAntonymPairs,
  gateMdAntonym,
  parseMdAntonym,
  type MdAntonymQuestion,
} from "./parser-antonym";
import { adaptMdAntonymToAiQuestion } from "./adapter-antonym";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const ANTONYM_DIRECTION_EN =
  "Which pair of the underlined word and its paired word is NOT an antonym pair?";

function pairCountOf(ctx: MdLaneContext): number {
  return clampAntonymMdPairCount(
    (ctx.resolved as { antonymPairCount?: number }).antonymPairCount ??
      ANTONYM_MD_PAIR_COUNT_MIN,
  );
}

/** 교사 지정 준수 게이트 — 지정 표현마다 표적 단어 중 하나와 포함 관계여야 한다. */
function teacherPointIssues(q: MdAntonymQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const issues: string[] = [];
  for (const p of ctx.teacherPoints) {
    const pt = normalizeWs(p.text);
    if (!pt) continue;
    const hit = q.pairs.some((pair) => {
      const w = normalizeWs(pair.word);
      return w.length > 0 && (w.includes(pt) || pt.includes(w));
    });
    if (!hit) issues.push(`교사 지정 표현이 밑줄에 없음: '${p.text.slice(0, 60)}'`);
  }
  return issues;
}

export const ANTONYM_MD_LANE: MdLane = {
  subType: "ANTONYM",

  // ⚠ fast 레인 getOperationType 과 동기 — 어휘 계열은 1크레딧이다.
  // md-stream 이 QUESTION_GEN_SINGLE 을 하드코딩하고 있어, 이 값을 쓰지 않으면
  // 반의어가 2크레딧으로 이중 청구된다(정찰 확정 R1).
  operationType: "QUESTION_GEN_VOCAB",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(어법 도입기와 동일).
  retryEligible: true,

  isEligible(resolved) {
    const n = Number(
      (resolved as { antonymPairCount?: number }).antonymPairCount ??
        ANTONYM_MD_PAIR_COUNT_MIN,
    );
    return (
      Number.isFinite(n) &&
      n >= ANTONYM_MD_PAIR_COUNT_MIN &&
      n <= ANTONYM_MD_PAIR_COUNT_MAX
    );
  },

  buildBasePrompt(ctx) {
    return buildMdAntonymPrompt(ctx.passage, "full", ctx.difficulty, {
      pairCount: pairCountOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 후보 가드레일 — 안 실으면 금지 쌍(force-restrain 류)이 재출현한다.
    // lib→lib 이므로 레이어 규칙 위반 없음.
    const candidateBlock = buildAntonymCandidateBlock(
      ctx.passage,
      ctx.rawDifficulty,
      pairCountOf(ctx),
      { variantIndex: ctx.variantIndex },
    );
    if (candidateBlock) extras.push(candidateBlock);

    if (readStemLanguageSetting(ctx.rawTypeSettings, "ANTONYM") === "en") {
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 해설·오답 해설은 한국어 그대로 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const parsed = parseMdAntonym(text);
    const snapped = autoSnapAntonymPairs(parsed, ctx.passage);
    const q = snapped.question;
    return {
      question: q,
      gateIssues: [
        ...gateMdAntonym(q, ctx.passage, { pairCount: pairCountOf(ctx) }),
        ...teacherPointIssues(q, ctx),
      ],
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdAntonymToAiQuestion(
      parsed.question as MdAntonymQuestion,
      ctx.passage,
      ctx.rawDifficulty,
    );
    if (
      result.ok &&
      result.aiQuestion &&
      readStemLanguageSetting(ctx.rawTypeSettings, "ANTONYM") === "en"
    ) {
      result.aiQuestion.direction = ANTONYM_DIRECTION_EN;
    }
    return result;
  },

  qualityArgs(ctx) {
    return {
      antonymPairCount: pairCountOf(ctx),
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "ANTONYM"),
    };
  },

  mdFormat(ctx) {
    return { pairCount: pairCountOf(ctx) };
  },

  diversityTargets(structuredData) {
    const words: string[] = [];
    const marked = structuredData.markedWords;
    if (Array.isArray(marked)) {
      for (const mw of marked as Array<Record<string, unknown>>) {
        if (typeof mw?.word === "string" && mw.word.trim()) {
          words.push(mw.word.trim().slice(0, 90));
        }
      }
    }
    return words;
  },
};

// 설정 리더 재수출 금지 — 라우트는 lane 인터페이스만 소비한다.
export { readAntonymPairCountSetting };
