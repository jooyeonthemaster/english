// ============================================================================
// 주제문 영작(TOPIC_SENTENCE_WRITING) md 레인 디스크립터.
// 견본: lane-antonym.ts / 인터페이스: ./lane-types.ts
// 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 과금 축(정찰 §0-4 실측): fast 레인 VOCAB_TYPES = {CONTEXT_MEANING, SYNONYM,
// ANTONYM}(fast/route.ts:70,90-98)에 이 유형은 없다 → QUESTION_GEN_SINGLE.
// md-stream 이 같은 값을 하드코딩하므로 이 값이어야 이중청구가 없다.
//
// 설정 축(정찰 §5-2): 노브 15개짜리 유형이다. resolveTopicSentenceWritingSettings 가
// 난이도 프리셋 + 호환성 강제(F)까지 마친 결정론 산출을 주므로 md 레인이 자체 기본값을
// 만들지 않는다(그 실수가 "설정 무시" 사고의 원인이었다 — 규범 §1 [2]).
//
// 교사 지정 포인트(정찰 §5-3): POINT_PICKER_CONFIG 에 이 유형이 없어
// ctx.teacherPoints 는 항상 빈 배열이다 → 준수 게이트도 프롬프트 블록도 만들지 않는다.
// ============================================================================

import {
  buildTopicSentenceWritingDirection,
  readStemLanguageSetting,
  resolveTopicSentenceWritingSettings,
  topicSentenceWritingBlankLabels,
} from "@/lib/question-type-generation-settings";
import type { ResolvedTopicSentenceWritingSettings } from "@/lib/question-type-generation-settings";
import {
  buildMdTopicSentenceWritingPrompt,
  clampTswMdBlankCount,
  clampTswMdDistractorCount,
  TOPIC_SENTENCE_WRITING_MD_BLANK_MAX,
  TOPIC_SENTENCE_WRITING_MD_BLANK_MIN,
  TOPIC_SENTENCE_WRITING_MD_DISTRACTOR_MAX,
  TOPIC_SENTENCE_WRITING_MD_DISTRACTOR_MIN,
  type TswMdMode,
  type TswMdShape,
} from "./prompts-topic-sentence-writing";
import {
  parseMdTopicSentenceWriting,
  type MdTswQuestion,
} from "./parser-topic-sentence-writing";
import { autoSnapTopicSentenceWriting } from "./snap-topic-sentence-writing";
import { gateMdTopicSentenceWriting } from "./gate-topic-sentence-writing";
import { adaptMdTopicSentenceWritingToAiQuestion } from "./adapter-topic-sentence-writing";
import type { MdLane, MdLaneContext, MdLaneParsed } from "./lane-types";

const SUB_TYPE = "TOPIC_SENTENCE_WRITING";

/** 라우트가 넘긴 resolved 와 동일 소스(같은 인자 → 같은 산출)로 전체 노브를 복원한다. */
function resolvedOf(ctx: MdLaneContext): ResolvedTopicSentenceWritingSettings {
  return resolveTopicSentenceWritingSettings(ctx.rawTypeSettings, ctx.rawDifficulty);
}

function shapeOf(ctx: MdLaneContext): TswMdShape {
  const tsw = resolvedOf(ctx);
  const routeView = ctx.resolved as {
    topicSentenceWritingMode?: unknown;
    topicSentenceWritingBlankCount?: unknown;
    topicSentenceWritingDistractorCount?: unknown;
  };
  // 라우트가 적격성 판정에 쓴 세 값을 우선한다(같은 리졸버 산출이라 원칙적으로 동일 —
  // 어긋나더라도 과금·적격성 판단과 생성 형식이 갈리지 않게 라우트 쪽을 진실원으로 둔다).
  const mode: TswMdMode =
    routeView.topicSentenceWritingMode === "scrambled" ||
    routeView.topicSentenceWritingMode === "cloze"
      ? routeView.topicSentenceWritingMode
      : tsw.mode;
  const blankCount = clampTswMdBlankCount(
    routeView.topicSentenceWritingBlankCount ?? tsw.blankCount,
  );
  const distractors = clampTswMdDistractorCount(
    routeView.topicSentenceWritingDistractorCount ?? tsw.distractors,
  );
  return {
    mode,
    topicForm: tsw.topicForm,
    hintEnabled: tsw.hintEnabled,
    hintLooseness: tsw.hintLooseness,
    chunking: tsw.chunking,
    distractors,
    fidelity: tsw.fidelity,
    scrambleOrder: tsw.scrambleOrder,
    // 호환성 강제(F, topic-sentence-writing.ts:291-296) 재적용 — cloze+명사구는 1빈칸.
    blankCount: mode === "cloze" && tsw.topicForm === "nounPhrase" ? 1 : blankCount,
    blankAssignment:
      mode === "cloze" && blankCount >= 2 ? tsw.blankAssignment : "separate",
    clueMode: tsw.clueMode,
    sourceMode: tsw.sourceMode,
    sourceSentenceParaphrase: tsw.sourceSentenceParaphrase,
    scoringGranularity: tsw.scoringGranularity,
  };
}

/** 발문은 결정론 합성값이 정본이다 — AI 문구를 절대 쓰지 않는다. */
function directionOf(ctx: MdLaneContext): string {
  const fromRoute = (ctx.resolved as { topicSentenceWritingDirection?: unknown })
    .topicSentenceWritingDirection;
  if (typeof fromRoute === "string" && fromRoute.trim()) return fromRoute.trim();
  return buildTopicSentenceWritingDirection(resolvedOf(ctx));
}

/**
 * 학생 시험지에 실제로 인쇄되는 박스 라벨. **번역하면 안 된다** — 온라인 응시면
 * (taking-parts/question-view.tsx)과 인쇄·DOCX·HWPX 직렬화가 이 문자열을 한국어로
 * 하드코딩하고 있어서, 영어 발문이 `[Topic Hint]`·`[Word Bank]` 를 가리키면 학생은
 * 시험지에 없는 박스를 찾게 된다(레인 자신의 buildExtras 가 금지한 바로 그 결함).
 * 라벨 자체를 stemLanguage 로 분기시키는 것은 이 레인의 소유 밖이므로, 발문이
 * 실물 라벨을 그대로 인용한다. 배점 `[N점]` 도 앱 전역 표기라 한국어 결정론 발문과
 * 1:1로 맞춘다(렌더·내보내기가 전부 `[N점]` 관습이다).
 */
const TSW_HINT_BOX_LABEL = "[주제 힌트]";
const TSW_WORD_BANK_BOX_LABEL = "[보기]";

/**
 * 질문 언어=en 일 때의 발문. 고정 문장 하나로 갈아 끼우면 배점·빈칸 라벨·미끼 안내가
 * 통째로 사라져 설정이 무시된다 — 한국어 결정론 발문과 같은 옵션 분기를 영어로 미러한다.
 */
export function buildTswMdDirectionEn(s: ResolvedTopicSentenceWritingSettings): string {
  const points = s.difficulty === "BASIC" ? "[2점]" : s.difficulty === "KILLER" ? "[4점]" : "[3점]";
  const noun = s.topicForm === "nounPhrase" ? "topic phrase" : "topic sentence";
  const hint = s.hintEnabled ? `Referring to the ${TSW_HINT_BOX_LABEL} box, ` : "";
  const tail = s.distractors > 0 ? " (Some of the given words are not used.)" : "";
  const inflect = s.fidelity !== "verbatim" ? " (change word forms if needed)" : "";
  let body: string;
  if (s.mode === "scrambled") {
    body =
      s.distractors === 0 && s.fidelity === "verbatim"
        ? `${hint}arrange all of the given words, using each exactly once, in the correct order to form the ${noun} of the passage.`
        : `${hint}arrange the given words${inflect} in the correct order to form the ${noun} of the passage.`;
  } else {
    const labels = topicSentenceWritingBlankLabels(s.blankCount).join(", ");
    const pick =
      s.distractors > 0
        ? `using only the words you need from the ${TSW_WORD_BANK_BOX_LABEL} box`
        : `using the words in the ${TSW_WORD_BANK_BOX_LABEL} box`;
    body = `${hint}write the words for blanks ${labels} of the ${noun} of the passage, ${pick}${inflect}.`;
  }
  const sentence = body.charAt(0).toUpperCase() + body.slice(1);
  return `${sentence}${tail} ${points}`.replace(/\s{2,}/g, " ").trim();
}

export const TOPIC_SENTENCE_WRITING_MD_LANE: MdLane = {
  subType: SUB_TYPE,

  // ⚠ fast 레인 getOperationType 과 동기 — 어휘 계열이 아니므로 표준 2크레딧.
  operationType: "QUESTION_GEN_SINGLE",

  // 신형식 초기 반려율 실측이 없으므로 보수 정책(규범 §1 [6] — 신규 유형 전부 true).
  retryEligible: true,

  isEligible(resolved) {
    const view = resolved as {
      topicSentenceWritingMode?: unknown;
      topicSentenceWritingBlankCount?: unknown;
      topicSentenceWritingDistractorCount?: unknown;
    };
    const mode = view.topicSentenceWritingMode;
    if (mode !== "scrambled" && mode !== "cloze") return false;
    const blankCount = Number(view.topicSentenceWritingBlankCount ?? 1);
    const distractors = Number(view.topicSentenceWritingDistractorCount ?? 0);
    return (
      Number.isFinite(blankCount) &&
      blankCount >= TOPIC_SENTENCE_WRITING_MD_BLANK_MIN &&
      blankCount <= TOPIC_SENTENCE_WRITING_MD_BLANK_MAX &&
      Number.isFinite(distractors) &&
      distractors >= TOPIC_SENTENCE_WRITING_MD_DISTRACTOR_MIN &&
      distractors <= TOPIC_SENTENCE_WRITING_MD_DISTRACTOR_MAX
    );
  },

  buildBasePrompt(ctx) {
    return buildMdTopicSentenceWritingPrompt(
      ctx.passage,
      "full",
      ctx.difficulty,
      shapeOf(ctx),
    );
  },

  buildExtras(ctx) {
    const extras: string[] = [];
    const stemLanguage = readStemLanguageSetting(ctx.rawTypeSettings, SUB_TYPE);
    // 발문-실물 정합 블록. 발문은 옵션 조합으로 이미 확정돼 있고 학생 시험지에 그대로
    // 인쇄된다 — 모델이 그 약속과 다른 것을 내면(미끼 0개인데 "쓰지 않는 단어가 포함됨",
    // 힌트 없는데 "[주제 힌트]를 참고하여") 학생이 없는 박스를 찾는 무효 문항이 된다.
    extras.push(
      `## 학생이 볼 발문 (결정론 합성 — 이 문구가 시험지에 그대로 인쇄된다)\n${
        stemLanguage === "en"
          ? buildTswMdDirectionEn(resolvedOf(ctx))
          : directionOf(ctx)
      }\n- 발문이 약속하는 것과 네 출력이 1:1로 맞아야 한다. 발문에 없는 박스를 만들지 말고, 발문이 가리키는 박스를 빠뜨리지 마라.\n- 발문은 네가 쓰는 것이 아니다. 출력에 발문 줄을 넣지 마라.`,
    );
    if (stemLanguage === "en") {
      extras.push(
        `## 질문 언어 (교사 설정, 필수)\n- 학생에게 보이는 발문은 영어로 나간다(위 문구 그대로). [주제 힌트]·해설·채점기준은 한국어 그대로 유지한다.`,
      );
    }
    return extras;
  },

  parseAndGate(text, ctx) {
    const shape = shapeOf(ctx);
    const parsed = parseMdTopicSentenceWriting(text, shape.mode);
    const snapped = autoSnapTopicSentenceWriting(parsed, shape);
    return {
      question: snapped.question,
      gateIssues: gateMdTopicSentenceWriting(snapped.question, ctx.passage, shape),
      corrections: snapped.corrections,
    };
  },

  adapt(parsed: MdLaneParsed, ctx) {
    const shape = shapeOf(ctx);
    const direction =
      readStemLanguageSetting(ctx.rawTypeSettings, SUB_TYPE) === "en"
        ? buildTswMdDirectionEn(resolvedOf(ctx))
        : directionOf(ctx);
    return adaptMdTopicSentenceWritingToAiQuestion(
      parsed.question as MdTswQuestion,
      ctx.rawDifficulty,
      shape,
      direction,
    );
  },

  qualityArgs(ctx) {
    // ValidateQuestionQualityInput(dispatcher.ts:41-92)에 이 유형 전용 슬롯은
    // topicSentenceWritingBlankCount 하나뿐이다.
    return {
      topicSentenceWritingBlankCount: shapeOf(ctx).blankCount,
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, SUB_TYPE),
    };
  },

  mdFormat(ctx) {
    const shape = shapeOf(ctx);
    return {
      mode: shape.mode,
      topicForm: shape.topicForm,
      blankCount: shape.blankCount,
      blankAssignment: shape.blankAssignment,
      distractors: shape.distractors,
      chunking: shape.chunking,
      fidelity: shape.fidelity,
      scrambleOrder: shape.scrambleOrder,
      clueMode: shape.clueMode,
      hintEnabled: shape.hintEnabled,
      hintLooseness: shape.hintLooseness,
      sourceMode: shape.sourceMode,
      sourceSentenceParaphrase: shape.sourceSentenceParaphrase,
      scoringGranularity: shape.scoringGranularity,
      stemLanguage: readStemLanguageSetting(ctx.rawTypeSettings, SUB_TYPE),
    };
  },

  /**
   * 회피 표적은 **완성된 주제문**이다 — 같은 지문에서 같은 주제를 반복해 뽑는 것이
   * 이 유형의 유일한 반복 실패 모드다. 지문 축자가 아니므로(정답은 패러프레이즈·추론
   * 명제여야 한다) 게이트의 "지문 통째 복사 금지"와 충돌하지 않는다
   * (순서 유형이 축자 표적을 못 쓰는 이유와 대조 — lane-order.ts:203-211).
   */
  diversityTargets(structuredData) {
    const modelAnswer = structuredData.modelAnswer;
    if (typeof modelAnswer !== "string" || !modelAnswer.trim()) return [];
    return [modelAnswer.trim().slice(0, 90)];
  },
};
