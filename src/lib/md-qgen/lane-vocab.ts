// ============================================================================
// 어휘 적절성(VOCAB_CHOICE) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md · recon-synthesis §3-A
//
// 실장애 배경: 이 유형은 fast 레인에서 "생성이 지나치게 느림" 이었다. 원인은
// 구형 JSON 스키마 강제 + 다단 파이프라인이고, 해결은 md 단일 콜 승차다.
// ============================================================================

import {
  readStemLanguageSetting,
  readVocabChoiceAnswerCountSetting,
  readVocabChoiceMarkerCountSetting,
  readVocabChoiceSynonymVariantsSetting,
} from "@/lib/question-type-generation-settings";
import { normalizeWs } from "./parser";
import {
  buildMdVocabPrompt,
  clampVocabMdAnswerCount,
  clampVocabMdMarkerCount,
  VOCAB_MD_ANSWER_COUNT_MIN,
  VOCAB_MD_MARKER_COUNT_MAX,
  VOCAB_MD_MARKER_COUNT_MIN,
} from "./prompts-vocab";
import {
  autoSnapVocabMarks,
  parseMdVocab,
  type MdVocabQuestion,
} from "./parser-vocab";
import { gateMdVocab } from "./gate-vocab";
import { adaptMdVocabToAiQuestion, VOCAB_MD_DIRECTION_MULTI } from "./adapter-vocab";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const VOCAB_DIRECTION_EN_SINGLE =
  "Which of the underlined words is NOT appropriate in the context?";
const VOCAB_DIRECTION_EN_MULTI =
  "Choose all the underlined words that are NOT appropriate in the context.";

interface VocabResolved {
  vocabChoiceMarkerCount?: number;
  vocabChoiceAnswerCount?: number;
  vocabChoiceSynonymVariants?: boolean;
}

function markerCountOf(ctx: MdLaneContext): number {
  return clampVocabMdMarkerCount(
    (ctx.resolved as VocabResolved).vocabChoiceMarkerCount ?? VOCAB_MD_MARKER_COUNT_MIN,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampVocabMdAnswerCount(
    (ctx.resolved as VocabResolved).vocabChoiceAnswerCount ?? VOCAB_MD_ANSWER_COUNT_MIN,
    markerCountOf(ctx),
  );
}

function synonymVariantsOf(ctx: MdLaneContext): boolean {
  return (ctx.resolved as VocabResolved).vocabChoiceSynonymVariants === true;
}

/**
 * 교사 지정 준수 게이트 — 지정 표현마다 밑줄 자리 하나와 포함 관계여야 한다.
 * 준수 표면은 point-picker-config 의 `VOCAB_CHOICE → markedWords[].originalWord`
 * 와 같은 축(원형)이며, 변장 모드를 고려해 표시어도 함께 본다.
 */
function teacherPointIssues(q: MdVocabQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const issues: string[] = [];
  for (const p of ctx.teacherPoints) {
    const pt = normalizeWs(p.text);
    if (!pt) continue;
    const hit = q.marks.some((m) =>
      [m.original, m.shown].some((raw) => {
        const w = normalizeWs(raw);
        return w.length > 0 && (w.includes(pt) || pt.includes(w));
      }),
    );
    if (!hit) issues.push(`교사 지정 표현이 밑줄에 없음: '${p.text.slice(0, 60)}'`);
  }
  return issues;
}

export const VOCAB_CHOICE_MD_LANE: MdLane = {
  subType: "VOCAB_CHOICE",

  // fast 레인 getOperationType 과 동기 — VOCAB_TYPES 는 {CONTEXT_MEANING,
  // SYNONYM, ANTONYM} 뿐이라 VOCAB_CHOICE 는 어휘 계열이지만 2크레딧이다.
  // (여기를 QUESTION_GEN_VOCAB 로 "고쳐" 두면 fast 폴백과 요금이 갈린다.)
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(어법 도입기와 동일).
  retryEligible: true,

  isEligible(resolved) {
    const r = resolved as VocabResolved;
    const marker = Number(r.vocabChoiceMarkerCount ?? VOCAB_MD_MARKER_COUNT_MIN);
    const answer = Number(r.vocabChoiceAnswerCount ?? VOCAB_MD_ANSWER_COUNT_MIN);
    return (
      Number.isFinite(marker) &&
      Number.isFinite(answer) &&
      marker >= VOCAB_MD_MARKER_COUNT_MIN &&
      marker <= VOCAB_MD_MARKER_COUNT_MAX &&
      answer >= VOCAB_MD_ANSWER_COUNT_MIN &&
      answer <= marker
    );
  },

  buildBasePrompt(ctx) {
    return buildMdVocabPrompt(ctx.passage, "full", ctx.difficulty, {
      markerCount: markerCountOf(ctx),
      answerCount: answerCountOf(ctx),
      synonymVariants: synonymVariantsOf(ctx),
    });
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    // 질문 언어 — md 레인의 확인된 기존 구멍(라우트에 stemLanguage 참조 0건)을
    // 레인에서 메운다. VOCAB_CHOICE 는 toggle scope 가 "stem" 이라 발문만 집행한다.
    if (readStemLanguageSetting(ctx.rawTypeSettings, "VOCAB_CHOICE") === "en") {
      extras.push(
        "## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 낸다. 해설·오답 해설은 한국어 그대로 유지한다.",
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const synonymVariants = synonymVariantsOf(ctx);
    const parsed = parseMdVocab(text);
    // answerCount 를 넘겨야 스냅이 "정답 축 확정" 을 판정할 수 있다 — 정답 라벨이
    // 설정 개수와 어긋나면 비정답 원형 교정을 끄고 게이트가 원인을 직접 말한다.
    const snapped = autoSnapVocabMarks(parsed, ctx.passage, {
      synonymVariants,
      answerCount: answerCountOf(ctx),
    });
    const q = snapped.question;
    return {
      question: q,
      gateIssues: [
        ...gateMdVocab(q, ctx.passage, {
          markerCount: markerCountOf(ctx),
          answerCount: answerCountOf(ctx),
          synonymVariants,
        }),
        ...teacherPointIssues(q, ctx),
      ],
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const result = adaptMdVocabToAiQuestion(
      parsed.question as MdVocabQuestion,
      ctx.passage,
      ctx.rawDifficulty,
      synonymVariantsOf(ctx),
    );
    if (
      result.ok &&
      result.aiQuestion &&
      readStemLanguageSetting(ctx.rawTypeSettings, "VOCAB_CHOICE") === "en"
    ) {
      result.aiQuestion.direction =
        result.aiQuestion.direction === VOCAB_MD_DIRECTION_MULTI
          ? VOCAB_DIRECTION_EN_MULTI
          : VOCAB_DIRECTION_EN_SINGLE;
    }
    return result;
  },

  qualityArgs(ctx) {
    return {
      vocabChoiceMarkerCount: markerCountOf(ctx),
      vocabChoiceAnswerCount: answerCountOf(ctx),
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, "VOCAB_CHOICE"),
    };
  },

  mdFormat(ctx) {
    return {
      markerCount: markerCountOf(ctx),
      answerCount: answerCountOf(ctx),
      synonymVariants: synonymVariantsOf(ctx),
    };
  },

  diversityTargets(structuredData) {
    const words: string[] = [];
    const marked = structuredData.markedWords;
    if (Array.isArray(marked)) {
      for (const mw of marked as Array<Record<string, unknown>>) {
        if (typeof mw?.originalWord === "string" && mw.originalWord.trim()) {
          words.push(mw.originalWord.trim().slice(0, 90));
        }
      }
    }
    return words;
  },
};

// 설정 리더 재수출 — 라우트는 lane 인터페이스만 소비하지만, 벤치·픽스처가
// "UI 설정 → resolved" 경로를 직접 재현할 때 쓴다(견본 lane-antonym 동형).
export {
  readVocabChoiceAnswerCountSetting,
  readVocabChoiceMarkerCountSetting,
  readVocabChoiceSynonymVariantsSetting,
};
