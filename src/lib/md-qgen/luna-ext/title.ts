// ============================================================================
// TITLE(제목 추론) luna 레인 확장 — 전 유형 이식 캠페인의 **견본**(본체 작성).
// 계약: ../luna-ext-types.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 선택형 계열(지문 무변형)이라 재구성 계약이 없고, 형식 노브(선지수·정답수·
// 선지언어·극성)가 ctx 를 따라 움직인다 — 동적 스키마의 견본이기도 하다.
// 파싱 산출물은 MdTitleQuestion 동형으로 어댑트해 레인의 스냅·게이트·어댑터를
// 전부 재사용한다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  clampTitleMdAnswerCount,
  clampTitleMdOptionCount,
  TITLE_MD_ANSWER_COUNT_DEFAULT,
  TITLE_MD_CIRCLED,
  TITLE_MD_OPTION_COUNT_DEFAULT,
} from "../prompts-title";
import {
  autoSnapTitleOptions,
  gateMdTitle,
  type MdTitleQuestion,
} from "../parser-title";
import { readOptionLanguageSetting } from "@/lib/question-type-generation-settings";

interface TitleResolved {
  genericOptionCount?: number;
  genericAnswerCount?: number;
  answerPolarity?: string;
}

function optionCountOf(ctx: MdLaneContext): number {
  return clampTitleMdOptionCount(
    (ctx.resolved as TitleResolved).genericOptionCount ?? TITLE_MD_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampTitleMdAnswerCount(
    (ctx.resolved as TitleResolved).genericAnswerCount ?? TITLE_MD_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

function optionLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readOptionLanguageSetting(ctx.rawTypeSettings, "TITLE") === "ko" ? "ko" : "en";
}

function labelsOf(ctx: MdLaneContext): string[] {
  return TITLE_MD_CIRCLED.slice(0, optionCountOf(ctx)).split("");
}

export const TITLE_LUNA_EXT: LunaLaneExt = {
  subType: "TITLE",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const labels = labelsOf(ctx);
    const optionCount = labels.length;
    const answerCount = answerCountOf(ctx);
    const lang = optionLanguageOf(ctx);
    return {
      name: "title_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["options", "answers", "explanation", "wrong"],
        properties: {
          options: {
            type: "array",
            minItems: optionCount,
            maxItems: optionCount,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text"],
              properties: {
                label: { type: "string", enum: labels },
                text: {
                  type: "string",
                  description:
                    lang === "ko"
                      ? "제목 선지(한국어) — 라벨·번호 없이 제목 텍스트만"
                      : "제목 선지(영어) — 라벨·번호 없이 제목 텍스트만",
                },
              },
            },
          },
          answers: {
            type: "array",
            minItems: answerCount,
            maxItems: answerCount,
            items: { type: "string", enum: labels },
            description: "정답 라벨(들) — 지문 등장 순서가 아니라 선지 라벨",
          },
          explanation: { type: "string", description: "정답 해설(한국어, 합쇼체)" },
          wrong: {
            type: "array",
            minItems: optionCount - answerCount,
            maxItems: optionCount - answerCount,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text"],
              properties: {
                label: { type: "string", enum: labels },
                text: {
                  type: "string",
                  // 26-08-18 O225 해설 다이어트
                  description: "이 오답이 왜 탈락인지 판정 근거 딱 1문장(한국어, 합쇼체) — 매력 이유·기제 이름·심리 서사 금지",
                },
              },
            },
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const optionCount = optionCountOf(ctx);
    const answerCount = answerCountOf(ctx);
    const lang = optionLanguageOf(ctx);
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식): 확정성=제약으로 강등, 난이도 정합=목표로 승격.
      "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
      "- 판정 확정성(정답 유일·오답 전원 확정 탈락)은 **제약**이다 — 어떤 경우에도 양보하지 마라. 기출 형식(선지 평행·길이 균형)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 정답 제목·오답 선지**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 선지(한눈에 지워지는 초점 이탈 오답·빤한 정답 제목)로 후퇴하는 것은 실패다 — 확정 탈락이면서 난이도에 맞게 매력적인 오답은 거의 모든 지문에서 만들 수 있다.",
      "- 전부를 동시에 만족할 수 없으면 기제 다양성부터 양보하라.",
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      `- 선지는 정확히 ${optionCount}개, 라벨은 ${TITLE_MD_CIRCLED.slice(0, optionCount)} 순서 그대로다.`,
      `- 정답 라벨은 정확히 ${answerCount}개이고 선지 라벨 집합 안에 있어야 한다. 오답 해설은 정답을 제외한 ${optionCount - answerCount}개 전부에 하나씩 있어야 하며 정답 라벨이 끼면 반려된다.`,
      lang === "ko"
        ? "- 선지 텍스트는 전부 한국어 제목이다 — 영어 제목이 섞이면 반려된다."
        : "- 선지 텍스트는 전부 영어 제목이다 — 한국어 제목이 섞이면 반려된다.",
      "- 선지 텍스트에 라벨·번호(①·1.·(1))를 다시 쓰지 마라 — 텍스트만.",
      "- 기출 형식: 제목 선지는 6~12단어 안팎으로 길이·형식이 평행해야 하고, 정답만 유독 길거나 짧으면 안 된다. 콜론(:) 부제 형식을 쓰려면 여러 선지에 고르게 써라.",
      "- 정답 제목은 글 전체의 중심 내용을 포괄해야 하며, 일부 세부 사항만 담은 제목·범위를 과장한 제목은 오답 자리다. 오답은 지문 소재를 재활용하되 초점 이탈·범위 확대/축소·방향 반전 중 하나로 확정 탈락해야 한다 — 문맥상 성립 가능한 오답이 있으면 정답 시비가 난다.",
      "- 해설·오답 해설에서 지문에 없는 내용을 지어내지 마라. 문체는 합쇼체(-습니다)로 통일하라.",
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 1~2문장·오답 딱 1문장, 유혹·심리 서사 금지 — 짧을수록 좋다.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        options: Array<{ label: string; text: string }>;
        answers: string[];
        explanation: string;
        wrong: Array<{ label: string; text: string }>;
      };
      let q: MdTitleQuestion = {
        kind: "title",
        options: raw.options,
        answers: [...raw.answers],
        explanation: raw.explanation,
        // 코어스: 오답 해설 라벨 오름차순 정렬(표시 결정론 — 어법·빈칸 동일).
        wrong: [...raw.wrong].sort((a, b) => a.label.localeCompare(b.label)),
      };
      const snapped = autoSnapTitleOptions(q);
      q = snapped.question;
      return {
        question: q,
        gateIssues: gateMdTitle(q, ctx.passage, {
          optionCount: optionCountOf(ctx),
          answerCount: answerCountOf(ctx),
          optionLanguage: optionLanguageOf(ctx),
        }),
        corrections: snapped.corrections,
      };
    } catch (e) {
      return {
        question: null,
        gateIssues: [`luna JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`],
        corrections: [],
      };
    }
  },

  bridgeSpecs: [
    { path: "options[].label", prefix: "\n" },
    { path: "options[].text", prefix: " " },
    { path: "answers[]", prefix: "\n정답: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
    { path: "wrong[].label", prefix: "\n" },
    { path: "wrong[].text", prefix: " " },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : "다음 글의 제목으로 가장 적절한 것은?";
    const options = Array.isArray(aiQuestion.options)
      ? (aiQuestion.options as Array<Record<string, unknown>>)
          .map((o) => `${String(o.label ?? "")} ${String(o.text ?? "")}`)
          .join("\n")
      : "";
    return `${direction}\n\n${passage}\n\n${options}`;
  },
};
