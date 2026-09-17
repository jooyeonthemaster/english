// ============================================================================
// 주제문 영작(TOPIC_SENTENCE_WRITING) luna 레인 확장 — 전 유형 이식 캠페인.
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 이 유형의 특이점(선택형 견본과 다른 축):
//  - 서술형(writing 패밀리) + **2모드 동적 형식**: 설정이 scrambled(배열)/cloze(빈칸
//    영작)를 확정하고, 스키마·검산·필드 구성이 모드를 따라 통째로 갈린다.
//  - 파생값은 받지 않는다(레인 프롬프트의 §1-B 철칙1 그대로):
//    · modelAnswer — scrambled 는 topic 이 곧 모범답안, cloze 는 치환 합성.
//    · verbatim 배열의 미끼 — 칩 타일링에서 스냅이 파생 확정(distractors 필드 자체를
//      스키마에서 뺀다). 선언 레짐(cloze·비-verbatim)에서만 distractors 를 받는다.
//  - 허용 답안 집합(acceptedAnswers 계열): scrambled=acceptedVariants(같은 칩 등가
//    어순), cloze=blanks[].variants(칩으로 조립 가능한 표기 변형). 패밀리 특칙에 따라
//    검산에 "전부 나열" 규칙을 넣되, 게이트·스냅의 절삭 조건(토큰 구성 동일·칩 조립
//    가능)을 함께 전사한다 — 조건 밖 변형은 기계가 제거하므로 나열해도 소용없다.
//  - 발문은 결정론 합성이 정본이라 모델이 쓰지 않는다(어댑터가 주입).
// 파싱 산출물은 MdTswQuestion 동형 — 레인의 스냅·게이트·어댑터를 전부 재사용한다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  clampTswMdBlankCount,
  clampTswMdDistractorCount,
  tswMdBlankLabels,
  type TswMdMode,
  type TswMdShape,
} from "../prompts-topic-sentence-writing";
import {
  synthesizeTswModelAnswer,
  tswBuildableFromChips,
  tswParenLabel,
  type MdTswBlank,
  type MdTswQuestion,
} from "../parser-topic-sentence-writing";
import { findUnbuildableWordBankBlanks } from "@/lib/question-quality/validators/summary/writing";
import { normalizeWs } from "../parser";
import { autoSnapTopicSentenceWriting } from "../snap-topic-sentence-writing";
import { gateMdTopicSentenceWriting } from "../gate-topic-sentence-writing";
import { resolveTopicSentenceWritingSettings } from "@/lib/question-type-generation-settings";
import {
  isTopicSentenceClozeMode,
  topicSentenceWritingStudentParts,
} from "@/lib/topic-sentence-writing";

const SUB_TYPE = "TOPIC_SENTENCE_WRITING";

// ── 레인 shapeOf 재현(레인 파일은 비공개 함수라 동일 로직을 공개 API 로 복원) ──
// 라우트가 적격성 판정에 쓴 세 값을 우선하고(라우트 = 진실원), 나머지는 리졸버 산출.
function shapeOf(ctx: MdLaneContext): TswMdShape {
  const tsw = resolveTopicSentenceWritingSettings(ctx.rawTypeSettings, ctx.rawDifficulty);
  const routeView = ctx.resolved as {
    topicSentenceWritingMode?: unknown;
    topicSentenceWritingBlankCount?: unknown;
    topicSentenceWritingDistractorCount?: unknown;
  };
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
    // 호환성 강제(F) 재적용 — cloze+명사구는 1빈칸(레인 shapeOf 와 동일).
    blankCount: mode === "cloze" && tsw.topicForm === "nounPhrase" ? 1 : blankCount,
    blankAssignment:
      mode === "cloze" && blankCount >= 2 ? tsw.blankAssignment : "separate",
    clueMode: tsw.clueMode,
    sourceMode: tsw.sourceMode,
    sourceSentenceParaphrase: tsw.sourceSentenceParaphrase,
    scoringGranularity: tsw.scoringGranularity,
  };
}

/** verbatim 배열 = 미끼 파생 레짐(스냅이 칩 타일링으로 확정 — 선언 필드를 두지 않는다). */
function isDerivedDistractorRegime(shape: TswMdShape): boolean {
  return shape.mode === "scrambled" && shape.fidelity === "verbatim";
}

function coerceStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean)
    : [];
}

/**
 * 코어스(기계 확정): 빈칸 라벨 표기 정규화("a"·"B." → "(A)"·"(B)") + 라벨 오름차순
 * 재정렬 + 라벨 중복 시 첫 항목 채택 — md 파서의 tswParenLabel·정렬 규약과 동일 축.
 * 라벨은 곧 학생 답안 키(StudentInput.texts)라 괄호 대문자 고정이 필수다.
 */
function coerceBlanks(value: unknown, notes: string[]): MdTswBlank[] {
  if (!Array.isArray(value)) return [];
  const byLabel = new Map<string, MdTswBlank>();
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const rawLabel = typeof rec.label === "string" ? rec.label.trim() : "";
    const normalized = tswParenLabel(rawLabel);
    const label = normalized || rawLabel;
    if (!label) continue;
    if (byLabel.has(label)) {
      notes.push(`빈칸 라벨 중복 — '${label}' 첫 항목만 채택`);
      continue;
    }
    if (normalized && normalized !== rawLabel) {
      notes.push(`빈칸 라벨 '${rawLabel}' → '${normalized}' 정규화(괄호 대문자 = 채점 키)`);
    }
    byLabel.set(label, {
      label,
      answer: typeof rec.answer === "string" ? rec.answer.trim() : "",
      variants: coerceStringArray(rec.variants),
    });
  }
  const arrived = [...byLabel.values()];
  const sorted = [...arrived].sort((a, b) => a.label.localeCompare(b.label));
  if (
    arrived.map((b) => b.label).join("") !== sorted.map((b) => b.label).join("")
  ) {
    notes.push("빈칸 라벨 오름차순 재정렬");
  }
  return sorted;
}

/**
 * 코어스(cloze 전용, 기계 확정): [보기]에 섞인 **미선언 잉여 칩**을 걷어낸다.
 *
 * ⚠ 실측 사고(r1 감수 Q15): 미끼는 정확히 2개로 선언됐는데 칩이 15개 도착했고, 그중
 * 11개가 정답 조립에 쓰이지 않았다 — 게다가 8개는 학생 화면의 주제문에 이미 인쇄된
 * 단어(adult·help·rather·than·through…)를 되실은 것이고 `through` 는 두 번 실렸다.
 * cloze 게이트는 **선언된 미끼 개수**만 세고 칩 풀의 잉여는 세지 않아(공유 게이트라
 * 수정 금지) 이 문항이 클린으로 통과했다. 발문은 "쓰지 않는 단어가 포함됨"이라고만
 * 약속하는데 실물은 73%가 미사용이라, 무엇을 고르라는 것인지 단서가 사라진다.
 *
 * 판정 기준은 **조립 가능성 오라클**이다(게이트·스냅과 동일 알고리즘):
 * 칩 하나를 뺐을 때도 모든 빈칸 정답이 조립되고 모든 동치가 살아남으면 그 칩은
 * 정답과 무관한 잉여다. 잉여는 설정 미끼 수만큼만 남기고 나머지를 버린다.
 * - 선언 미끼 칩은 절대 건드리지 않는다(빼면 게이트가 "미끼가 재료 안에 없음"으로
 *   반려 — 고쳐 살리려다 죽인다).
 * - 원본이 이미 조립 불가면 손대지 않는다(진짜 원인을 게이트가 자리와 함께 지목해야
 *   재생성 피드백이 성립한다 — 철칙5).
 * 버린 것은 전부 corrections 로 남긴다(조용히 버리지 않는다 — 철칙3).
 */
function pruneClozeChips(
  chips: string[],
  blanks: MdTswBlank[],
  distractors: string[],
  shape: TswMdShape,
  notes: string[],
): string[] {
  if (shape.mode !== "cloze" || chips.length === 0) return chips;
  const demand = blanks
    .filter((blank) => blank.answer)
    .map((blank) => ({ label: blank.label, candidates: [blank.answer] }));
  if (demand.length === 0) return chips;
  const variants = blanks.flatMap((blank) => blank.variants).filter(Boolean);
  const declared = new Set(
    distractors.map((d) => normalizeWs(d).toLowerCase()).filter(Boolean),
  );
  const intact = (pool: string[]): boolean =>
    findUnbuildableWordBankBlanks(pool, demand).length === 0 &&
    variants.every((variant) => tswBuildableFromChips(pool, variant));
  if (!intact(chips)) return chips;

  const declaredInPool = chips.filter((chip) =>
    declared.has(normalizeWs(chip).toLowerCase()),
  ).length;
  const spareBudget = Math.max(0, shape.distractors - declaredInPool);
  let pool = [...chips];
  const dropped: string[] = [];
  let kept = 0;
  for (let i = pool.length - 1; i >= 0; i -= 1) {
    const chip = pool[i];
    if (declared.has(normalizeWs(chip).toLowerCase())) continue;
    const reduced = [...pool.slice(0, i), ...pool.slice(i + 1)];
    if (!intact(reduced)) continue; // 정답·동치 조립에 필요한 칩
    if (kept < spareBudget) {
      kept += 1;
      continue;
    }
    pool = reduced;
    dropped.push(chip);
  }
  if (dropped.length > 0) {
    notes.push(
      `[보기]에서 미선언 잉여 칩 ${dropped.length}개 제거(정답·동치 조립에 쓰이지 않고 미끼로도 선언되지 않음 — 발문 "쓰지 않는 단어가 포함됨"이 약속하는 미끼는 ${shape.distractors}개다): ${dropped
        .slice(0, 8)
        .map((chip) => `'${chip}'`)
        .join(", ")}`,
    );
  }
  return pool;
}

const FORM_WORD: Record<TswMdShape["topicForm"], string> = {
  sentence: "주제문(동사가 있는 완전한 문장)",
  nounPhrase: "주제 명사구(동사 없는 학술 명사구)",
};

export const TOPIC_SENTENCE_WRITING_LUNA_EXT: LunaLaneExt = {
  subType: SUB_TYPE,

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const shape = shapeOf(ctx);
    const labels = tswMdBlankLabels(shape.blankCount);
    const derived = isDerivedDistractorRegime(shape);
    const declareDistractors = !derived && shape.distractors > 0;
    // 필드 순서 = 스트리밍 도착 순서 — 본문성(주제문·재료)을 앞에, 해설을 뒤에.
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    const add = (key: string, schema: unknown) => {
      properties[key] = schema;
      required.push(key);
    };

    add("topic", {
      type: "string",
      description:
        shape.mode === "scrambled"
          ? `완성된 영어 ${FORM_WORD[shape.topicForm]} 한 줄 — 이 문장이 곧 모범답안이다. 지문 문장의 축자 복사 금지(구문 전환·환언 필수), 한글·줄바꿈 금지`
          : `${labels.join(", ")} placeholder 를 각 정확히 1회 포함하는 영어 ${FORM_WORD[shape.topicForm]} 한 줄 — 빈칸 정답 어구는 절대 넣지 마라. 빈칸을 걷어내도 문장 골격(내용 단어 3개 이상)이 읽혀야 한다`,
    });
    add("chips", {
      type: "array",
      minItems:
        shape.mode === "scrambled"
          ? 4
          : Math.max(3, shape.blankCount * 2 + shape.distractors),
      maxItems: 26,
      items: {
        type: "string",
        description:
          "재료 하나 — 영어 표기 그대로. 슬래시(/) 금지, 구두점만으로 된 재료 금지, 같은 단어가 두 번 필요하면 같은 문자열을 두 개",
      },
      description:
        shape.mode === "scrambled"
          ? `배열 재료(${
              shape.chunking === "chunk"
                ? "의미 단위 청크 4~7덩어리"
                : shape.chunking === "word"
                  ? "단어 단위 — 관사·전치사도 각각 하나"
                  : "핵심 어구는 청크, 기능어는 단어"
            }) — 반드시 섞어라. 각 재료는 정답에 통째로 들어가거나 통째로 남거나 둘 중 하나여야 한다`
          : `[보기] 칩(${
              shape.chunking === "chunk"
                ? "의미 단위 청크"
                : shape.chunking === "word"
                  ? "단어 단위"
                  : "어구 청크+기능어 단어 혼합"
            }) — 각 빈칸 정답을 전치사·관사까지 조립할 수 있어야 한다. 반드시 섞어라(왼→오 = 정답 어순 금지)`,
    });
    if (declareDistractors) {
      add("distractors", {
        type: "array",
        minItems: shape.distractors,
        maxItems: shape.distractors,
        items: {
          type: "string",
          description: "chips 안에 실재하는 문자열과 대소문자까지 동일하게",
        },
        description: `정답에 쓰이지 않는 미끼 — 정확히 ${shape.distractors}개, 전부 chips 배열 안에 실재해야 한다. 정답 자리와 실제로 경쟁하는 단어만(무관 단어는 즉시 소거돼 함정이 아니다)`,
      });
    }
    if (shape.hintEnabled) {
      add("hint", {
        type: "string",
        description:
          "[주제 힌트] 한국어 한 줄 — 영어 정답 어구를 2단어 이상 그대로 옮기면 자동 반려. " +
          (shape.hintLooseness === "literal"
            ? "강도 literal: 정답 명제를 쉬운 우리말로 거의 직역(단, 영어 어순 베끼기 금지)"
            : shape.hintLooseness === "natural"
              ? "강도 natural: 자연스러운 의역 — 정답 어구 1:1 대응 금지"
              : "강도 gist: 논지의 방향만 가리킨다 — 정답 어휘 노출 금지"),
      });
    }
    if (shape.mode === "cloze") {
      add("blanks", {
        type: "array",
        minItems: labels.length,
        maxItems: labels.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "answer", "variants"],
          properties: {
            label: {
              type: "string",
              enum: labels,
              description: "빈칸 라벨 — (A) 부터 오름차순, topic 의 placeholder 와 동일",
            },
            answer: {
              type: "string",
              description:
                "이 빈칸의 모범 영작 — 영어 다단어 어구(2단어 이상). 지문 문장 통째 복사 금지, 빈칸끼리 중복 금지",
            },
            variants: {
              type: "array",
              minItems: 0,
              maxItems: 6,
              items: { type: "string" },
              description:
                "같은 뜻으로 인정할 허용 답안 — [보기] 칩으로 조립 가능한 표기 변형(관사 생략형·어형 변화형 등)을 전부 나열. 칩으로 조립 불가한 변형은 기계가 버린다. 없으면 빈 배열",
            },
          },
        },
        description: `빈칸 정답 ${labels.join("·")} — 라벨 오름차순 정확히 ${labels.length}개`,
      });
    } else {
      add("acceptedVariants", {
        type: "array",
        minItems: 0,
        maxItems: 6,
        items: { type: "string" },
        description:
          "허용답 — 같은 칩을 전부 같은 횟수로 써서 조립되는 등가 어순 문장을 전부 나열(못 실은 등가 어순은 그 학생 답이 오답 처리된다). 단어가 하나라도 다르면(추가·삭제·활용형) 기계가 버린다. 확신 없으면 빈 배열",
      });
    }
    if (shape.scoringGranularity === "rubric") {
      add("scoringCriteria", {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "string",
          description: "채점 항목(한국어) — 무엇을 확인해 몇 점인지",
        },
        description: "부분점수 채점기준 2개 이상(루브릭 채점 설정)",
      });
    }
    // 26-08-18 O225 해설 다이어트 — "학생이 어디서 흔들리는지" 심리 서사 지시 제거, 정답 도출만.
    add("explanation", {
      type: "string",
      description:
        "해설 1~2문장(한국어, 합쇼체) — 이 주제를 지문의 어느 논리 흐름에서 도출했는지(정답 도출만). '학생이 어디서 흔들리는지' 같은 유혹·심리 서사 금지 — 짧을수록 좋다",
    });

    return {
      name:
        shape.mode === "scrambled"
          ? "topic_sentence_writing_scrambled"
          : "topic_sentence_writing_cloze",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required,
        properties,
      },
    };
  },

  buildSelfcheck(ctx): string {
    const shape = shapeOf(ctx);
    const labels = tswMdBlankLabels(shape.blankCount);
    const derived = isDerivedDistractorRegime(shape);
    const lines: string[] = [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수)",
      "- 확정성(정답이 재료로 유일하게 조립·검산 전부 통과)은 **제약**이다: 이를 어기는 주제문·칩 구성은 어떤 경우에도 내지 마라. 기출 형식(주제문 단어 수 관행·라벨 규격·재료 셔플)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 주제문 구문·미끼**가 목표다. '정답 시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 선택(뻔한 구문의 주제문·즉시 소거되는 미끼)으로 후퇴하는 것은 실패다 — 확정적이면서 난이도에 맞는 구성은 거의 모든 지문에 있다.",
      "- 막히면 이렇게 양보하라: 미끼의 교묘함부터 버리고(그 자리와 경쟁만 하면 된다), 주제문을 더 평이한 구문으로 다시 세워라. 확신 없는 허용답·동치는 통째로 비워라(빈 배열 허용). 판정 확정성은 절대 양보하지 마라.",
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      // ── 공통(gateCommon 전사) ──
      shape.topicForm === "nounPhrase"
        ? "- 완성 답안은 동사 없는 학술 명사구다 — 기출 관행은 12단어 이내, 기계 허용폭은 3~16단어(벗어나면 반려). 정동사가 들어가면 명사구가 아니다."
        : "- 완성 답안은 주어·정동사가 있는 완결된 영어 문장 한 줄이다 — 기출 관행은 12~14단어, 기계 허용폭은 6~24단어(벗어나면 반려)." +
          (shape.mode === "cloze"
            ? " 단어 수는 빈칸 정답을 채워 넣은 완성문 기준으로 세라."
            : ""),
      "- 완성 답안에 한글이 한 글자라도 섞이면 반려된다 — 영어로만.",
      "- 지문 축자 복사 금지(정답 무효급): 완성 답안과 지문 문장을 나란히 놓고 내용어 6개 이상 연속 일치 구간이 있으면 자동 반려된다. 지문이 문항 안에 함께 인쇄되므로 학생이 베껴 쓰면 끝난다 — 시제·태·구문 전환 또는 상위어 환언을 최소 1개 넣어라.",
      "- 네가 세운 주제가 지문의 한 단락이 아니라 글 전체를 덮는지 한 줄로 답해 보라 — 못 대면 주제를 다시 세워라. 주제는 정확히 하나다(두 주제를 접속사로 잇지 마라).",
      "- 주제가 **필자의 결론**인지 확인하라. 지문이 'many philosophers think…' · 'It's been popular to suppose…' 처럼 **남의 견해로 귀속한 뒤 반박·의문(This is puzzling 등)을 다는 통설**을 주제로 세우면 정답 자체가 틀린다 — 필자가 그 견해를 받아들이는지 반박하는지 한 줄로 답해 보고 세워라.",
      "- 빈칸(또는 대조의 두 극)을 **교환 가능한 대칭 등위**로 잇지 마라 — `A together with B` · `A and B` · `A as well as B` 는 순서를 강제할 장치가 없어 두 극을 맞바꾼 답안이 똑같이 성립한다(실측 반려 계통). 방향이 박힌 비대칭 프레임만 써라: `not A but B` · `less on A than on B` · `rather than` · `instead of` · `as A than as B`, 또는 조건(`only when …`) · 인과(`because …`) · 수단(`by …`) 프레임. 대조 프레임만 반복하지 말고 조건·인과·수단 쪽도 섞어라(단 확정성이 흔들리면 대조로 되돌아와라).",
      "- 구두점만으로 된 재료(`,` `.` 류)를 만들지 마라. 재료 문자열 안에 슬래시(/)를 쓰지 마라.",
    ];
    if (shape.hintEnabled) {
      lines.push(
        "- hint(주제 힌트)는 한국어 한 줄로 반드시 낸다 — 발문이 [주제 힌트] 박스를 약속하므로 없으면 반려된다. 힌트에 정답의 영어 어구가 2단어 이상 연속으로 들어가면 자동 반려된다(영어 어구를 아예 쓰지 마라).",
      );
    }
    if (shape.mode === "scrambled") {
      lines.push(
        "- 칩을 하나씩 짚으며 \"이건 정답에 통째로 들어간다 / 이건 통째로 남는다\"로 전부 둘 중 하나로 갈리는지 확인하라 — 반만 쓰이는 칩이 하나라도 있으면 부족·잉여 토큰으로 반려된다.",
        "- 어떤 칩도 정답 문장 전체(또는 절반 이상)를 통째로 담으면 안 된다 — 그 순간 배열이 아니라 받아쓰기다.",
        "- 칩 나열을 왼쪽에서 오른쪽으로 그냥 읽었을 때 정답 어순이 드러나면 안 된다(기계가 재배열하지만, 어떤 순서로 놓아도 어순이 읽히는 칩 구성은 탈출 불가로 반려된다).",
      );
      if (shape.fidelity === "verbatim") {
        lines.push(
          `- 어형 정합(verbatim): 칩은 정답에 들어갈 그 형태 그대로다. 칩을 전부 이어 붙였을 때 정답 단어와 과부족 없이 일치하고, 정답에 쓰이지 않는 칩이 **정확히 ${shape.distractors}개** 남는지 하나씩 세어 확인하라(기계가 칩 타일링으로 세므로 미끼를 따로 선언하지 않는다${shape.distractors === 0 ? " — 잉여 재료가 하나라도 있으면 반려된다. 발문에 '쓰지 않는 단어' 안내가 없다" : ""}).`,
        );
      } else {
        lines.push(
          `- 어형 정합(${shape.fidelity}): 칩은 ${shape.fidelity === "inflected" ? "기본형(원형·단수)으로 주고 학생이 어형을 맞춘다" : "일부는 그대로, 일부는 기본형으로 준다"} — 틀린 형태를 주는 어법수정형은 금지. 미끼를 뺀 칩으로 정답의 핵심 내용어가 전부 조립되는지, 그리고 칩 토큰 총량이 정답보다 20% 이상 많지 않은지 세어 보라(잉여가 크면 절단·미선언 재료로 반려된다).`,
          `- distractors 배열은 정확히 ${shape.distractors}개이고, 각 항목은 chips 안에 대소문자까지 똑같은 문자열로 실재해야 한다(다르면 학생 화면에 그 단어가 두 번 보인다). 미끼는 정답 자리와 실제 경쟁하는 것만.`,
        );
      }
      lines.push(
        "- acceptedVariants(허용답)에는 같은 칩을 전부 같은 횟수로 써서 조립되는 등가 어순 문장을 **전부** 나열하라 — 못 실은 등가 어순은 그렇게 답한 학생이 오답 처리된다. 대소문자·구두점 표기 변형은 채점기가 흡수하니 싣지 말고, 단어 구성이 다른 문장(축약형·활용형·단어 추가/삭제)은 기계가 제거하니 싣지 마라. 확신 있는 것만, 없으면 빈 배열.",
      );
    } else {
      lines.push(
        `- topic 에 ${labels.join(" · ")} 가 각각 **정확히 1회**씩 있는지 세라 — 0회·2회면 반려된다. 빈칸을 걷어낸 골격에 내용 단어가 3개 이상 남는지도 세라(골격이 \`The (A), (B).\` 수준이면 반려).`,
        `- blanks 는 라벨 오름차순 정확히 ${labels.length}개다. 각 정답은 영어 **다단어 어구**(2단어 이상)여야 하고(1단어면 반려), 빈칸끼리 정답이 같으면 반려된다.`,
        "- 빈칸 정답 어구(2단어 이상)가 topic·힌트 어디에도 통째로 박혀 있지 않은지 확인하라 — 박혀 있으면 영작이 아니라 받아쓰기라 반려된다.",
        "- [보기] 칩만으로 각 빈칸 정답을 실제로 조립할 수 있는지 전치사·관사까지 하나씩 대조하라 — 같은 단어가 두 번 필요하면 칩도 두 개여야 한다(관사·전치사·대명사 같은 기능어는 정확히 같은 형태의 칩만 인정된다). 부족 토큰 하나로 채점 불능급 반려다.",
        "- 어떤 칩도 다단어 빈칸 정답 하나를 통째로 담으면 안 된다(옮겨 적기 전락). [보기]를 왼→오로 읽었을 때 빈칸 정답 어순이 드러나면 안 된다.",
        `- distractors 배열은 정확히 ${shape.distractors}개이고 전부 chips 안에 실재해야 한다(대소문자까지 동일).${shape.distractors === 0 ? " 미끼 0개 설정 — 정답 조립에 쓰이지 않는 여분 칩을 넣지 마라(발문에 '쓰지 않는 단어' 안내가 없다)." : " 미끼는 정답 자리와 실제 경쟁하는 것만 — 무관 단어는 즉시 소거돼 함정이 아니다."}`,
        "- blanks[].variants 에는 [보기] 칩으로 조립 가능한 허용 표기 변형(관사 생략형·칩이 공급하는 어형 변화형 등)을 **전부** 나열하라 — 못 실은 변형은 그렇게 쓴 학생이 감점된다. 칩으로 조립 불가한 변형과 정답과 동일한 문자열은 기계가 제거하니 싣지 마라.",
        "- 정답 어구에서 수식어를 하나씩 빼고 읽어 보라(`unconscious physical responses` → `physical responses`). 빼도 문장과 문맥이 성립하면 그 축약형을 쓴 학생을 오답 처리할 근거가 없다 — 수식어 하나만 빠져도 뜻이 어긋나게 설계하고, 그래도 남는 축약형은 variants 에 실어 흡수하라.",
        `- [보기] 칩은 **정답·동치 조립에 필요한 칩 + 미끼 정확히 ${shape.distractors}개**가 전부다. 학생 화면의 주제문에 이미 인쇄된 단어를 칩으로 되싣지 마라(같은 단어가 문장과 [보기]에 동시에 보인다). 같은 문자열 칩을 두 개 넣는 것은 정답에 그 단어가 두 번 필요할 때뿐이다. 출력 전 칩 개수를 세어 "필요 칩 + ${shape.distractors}" 와 맞는지 확인하라 — 선언 안 된 잉여 칩은 기계가 걷어내므로 공들여 넣어도 사라진다.`,
      );
      if (shape.distractors > 0) {
        lines.push(
          "- **미끼 대입 검산(이 유형 최대 반려 계통 — 반드시 하라)**: 미끼를 하나씩 각 빈칸의 정답 자리에 실제로 끼워 넣어 완성문을 읽어 보라. 문법·문맥이 성립하는 미끼는 미끼가 아니라 **또 하나의 정답**이라 채점 불능이다 — 그 단어를 버리고 다른 미끼를 잡아라. 정답 어휘의 동의어(numerical↔quantitative · method↔approach · present↔immediate · weigh↔compare · conscious↔deliberate · automatic↔unconscious 류)는 절대 미끼로 쓰지 마라.",
          "- 미끼는 **지문이 배제하는 단어**여야 한다. 정답에 쓴 단어는 지문에 없는데 버리는 미끼가 지문에 그대로 등장하면 그 미끼 쪽이 근거가 더 강한 정답이 된다(이의제기에서 진다). 정답 어구의 내용어마다 근거 문장을 하나씩 짚어 보고, 미끼로는 그 근거가 없는 단어만 골라라.",
        );
      }
      if (shape.blankCount >= 2) {
        lines.push(
          `- ${labels.join(" ↔ ")} 의 내용어를 **서로 맞바꾼 문장**을 실제로 써서 읽어 보라 — 읽히면 정답이 둘이다. 두 빈칸의 같은 문법 자리를 채우는 유사어(형용사↔형용사·명사↔명사)를 하나씩 나눠 배치하지 마라.`,
        );
      }
      if (shape.clueMode === "firstLetter") {
        lines.push(
          "- 단서 모드(firstLetter): 학생 화면에 정답 각 단어의 첫 글자가 자동 노출된다 — 첫 글자만으로 특정되는 뻔한 정답은 피하라.",
        );
      } else if (shape.clueMode === "wordCount") {
        lines.push(
          "- 단서 모드(wordCount): 학생 화면에 정답 단어 수만큼 빈칸이 자동 노출된다 — 단어 수가 곧 단서임을 감안해 설계하라.",
        );
      }
    }
    if (shape.scoringGranularity === "rubric") {
      lines.push(
        "- scoringCriteria 는 2개 이상, 각각 한국어로 \"무엇을 확인해 몇 점인지\"를 적어라(1개면 반려된다).",
      );
    }
    lines.push(
      // 26-08-18 O225 해설 다이어트 — "학생이 어디서 흔들리는지" 심리 서사 지시 제거, 분량 1~2문장.
      "- 해설은 한국어 1~2문장, 합쇼체(-습니다)로 통일하라 — 주제를 어느 논리 흐름에서 도출했는지(정답 도출)만. '학생이 어디서 흔들리는지' 같은 유혹·심리 서사 금지 — 짧을수록 좋다. 지문에 없는 구조를 지어내 서술하지 마라(실제 지문을 재확인한 사실만).",
      "- 해설에서 '지문에 자주 등장하는 어휘'처럼 **지문 표면을 서술하려면 그 단어를 지문에서 실제로 찾아 세어 본 뒤**에만 써라 — 지문에 한 번도 없는 단어를 '지문 표면 어휘'라고 부르면 해설 허위다(실측 반려 계통). 자신 없으면 그 문장을 통째로 빼고 논리 흐름만 써라.",
      "- 해설 안에서 영어 단어를 지칭할 때는 반드시 작은따옴표로 감싸라('alter' 처럼). 맨 영단어를 한국어 조사·명사에 직접 붙이지 마라(`distorted 지각` · `deep에` ✕) — 정답해설지에 그대로 인쇄된다.",
      "- 발문은 결정론 합성으로 이미 인쇄된다 — 필드 값 안에 발문·라벨(\"주제문:\"·\"칩:\"·\"①\")을 다시 쓰지 마라.",
    );
    return lines.join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    const shape = shapeOf(ctx);
    try {
      const raw = JSON.parse(text) as {
        topic?: unknown;
        chips?: unknown;
        distractors?: unknown;
        hint?: unknown;
        blanks?: unknown;
        acceptedVariants?: unknown;
        scoringCriteria?: unknown;
        explanation?: unknown;
      };
      const notes: string[] = [];
      const topic = typeof raw.topic === "string" ? raw.topic.trim() : "";
      const blanks = shape.mode === "cloze" ? coerceBlanks(raw.blanks, notes) : [];
      const distractors = coerceStringArray(raw.distractors);
      const chips = pruneClozeChips(
        coerceStringArray(raw.chips),
        blanks,
        distractors,
        shape,
        notes,
      );
      const q: MdTswQuestion = {
        kind: "topic-sentence-writing",
        mode: shape.mode,
        // JSON 경로에는 `방식:` 에코 줄이 없다(스키마가 모드를 구조로 강제) — 빈 값.
        declaredMode: "",
        topic,
        chips,
        // 파생 레짐(verbatim 배열)은 스키마에 필드가 없고 스냅이 타일링으로 확정한다.
        distractors,
        hint: typeof raw.hint === "string" ? raw.hint.trim() : "",
        blanks,
        modelAnswer:
          shape.mode === "scrambled" ? topic : synthesizeTswModelAnswer(topic, blanks),
        acceptedVariants:
          shape.mode === "scrambled" ? coerceStringArray(raw.acceptedVariants) : [],
        scoringCriteria: coerceStringArray(raw.scoringCriteria),
        explanation:
          typeof raw.explanation === "string" ? raw.explanation.trim() : "",
        // 관측 플래그 — JSON 은 모드 고유 필드로 도착하므로 혼용·표 드리프트가 없다.
        sawChipLabel: shape.mode === "scrambled" && chips.length > 0,
        sawBankLabel: shape.mode === "cloze" && chips.length > 0,
        sawTopicLabel: Boolean(topic),
        sawAnswerLine: shape.mode === "cloze" && blanks.length > 0,
        sawTableLayout: false,
        distractorsDerived: false,
        strayModelAnswer: "",
      };
      // 레인과 동일한 3단(파싱→스냅→게이트) — 산출물은 레인 parseAndGate 동형이라
      // 레인 adapt 가 그대로 소비한다.
      const snapped = autoSnapTopicSentenceWriting(q, shape);
      return {
        question: snapped.question,
        gateIssues: gateMdTopicSentenceWriting(snapped.question, ctx.passage, shape),
        corrections: [...notes, ...snapped.corrections],
      };
    } catch (e) {
      return {
        question: null,
        gateIssues: [
          `luna JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`,
        ],
        corrections: [],
      };
    }
  },

  // md 표면 동형 렌더. 두 모드의 합집합 경로를 싣는다 — 없는 경로는 침묵이 계약이라
  // (scrambled 에 blanks 없음, 파생 레짐에 distractors 없음) 안전하다.
  bridgeSpecs: [
    { path: "topic", prefix: "주제문: ", suffix: "\n\n재료:" },
    { path: "chips[]", prefix: "\n- " },
    { path: "distractors[]", prefix: "\n미끼: " },
    { path: "hint", prefix: "\n\n힌트: " },
    { path: "acceptedVariants[]", prefix: "\n허용답: " },
    { path: "blanks[].label", prefix: "\n\n정답" },
    { path: "blanks[].answer", prefix: ": " },
    { path: "blanks[].variants[]", prefix: "\n동치: " },
    { path: "scoringCriteria[]", prefix: "\n채점기준: " },
    { path: "explanation", prefix: "\n\n해설: ", suffix: "\n" },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const cloze = isTopicSentenceClozeMode(aiQuestion);
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : cloze
          ? "다음 글의 주제문 빈칸에 들어갈 말을 [보기]의 단어를 활용하여 영작하시오."
          : "다음 글의 주제문이 되도록 주어진 단어를 올바른 순서로 배열하시오.";
    // 학생 안전 직렬화 정본 재사용(SW-LEAK-1) — 정답계열 필드는 절대 노출되지 않는다.
    const parts = topicSentenceWritingStudentParts(aiQuestion);
    const answerLines = cloze
      ? (Array.isArray(aiQuestion.blanks) ? aiQuestion.blanks : [])
          .map((blank) => {
            const label =
              typeof (blank as Record<string, unknown>).label === "string"
                ? String((blank as Record<string, unknown>).label)
                : "";
            return `${label}: ____________________`;
          })
          .join("\n")
      : "답안: ____________________________________";
    return `${direction}\n\n${passage}\n\n${parts.join("\n")}\n\n${answerLines}`;
  },
};
