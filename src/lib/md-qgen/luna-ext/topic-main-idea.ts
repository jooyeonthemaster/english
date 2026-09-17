// ============================================================================
// TOPIC_MAIN_IDEA(주제+요지 복합) luna 레인 확장 — 전 유형 이식 캠페인.
// 계약: ../luna-ext-types.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
// 견본: ./title.ts (선택형 계열 동적 스키마)
//
// 선택형 계열(지문 무변형)이라 재구성 계약이 없다. 대신 이 유형 유일의 지문
// 정박점인 `evidence`(근거문장 축자 — 게이트 전용, 학생 표면 미노출)가 JSON
// 필드로 승격된다. 설계의 축이 되는 값이므로 스키마 맨 앞(스트리밍 최선두)에
// 둔다 — 모델이 근거문장을 먼저 확정하고 선지를 설계하는 md 형식 순서와 동형.
//
// 형식 노브 4개가 전부 ctx 를 따라 움직이는 동적 스키마다:
//   optionCount(4~8) · answerCount(1~N-1) · gistMode(보기 언어 설정이 곧 형식:
//   en=주제/영어 명사구, ko=요지/한국어 진술문) · polarity(NEGATIVE=부적절 고르기).
// ⚠ 극성이 뒤집히면 '정답'이 가리키는 대상 자체가 뒤집힌다(프롬프트 정본의
//   반복 경고). 검산·스키마 description 전부를 극성으로 갈라 정답 키 반전을 막는다.
// 파싱 산출물은 MdTopicMainIdeaQuestion 동형으로 만들어 레인의 스냅·게이트·
// 어댑터를 전부 재사용한다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT,
  TOPIC_MAIN_IDEA_MD_LABELS,
  TOPIC_MAIN_IDEA_MD_OPTION_COUNT_DEFAULT,
  clampTopicMdAnswerCount,
  clampTopicMdOptionCount,
  type MdGistMode,
  type MdGistPolarity,
} from "../prompts-topic-main-idea";
import {
  autoSnapTopicMainIdea,
  type MdTopicMainIdeaQuestion,
} from "../parser-topic-main-idea";
import { gateMdTopicMainIdea } from "../gate-topic-main-idea";
import { readOptionLanguageSetting } from "@/lib/question-type-generation-settings";

const SUB_TYPE = "TOPIC_MAIN_IDEA";

interface GistResolved {
  genericOptionCount?: number;
  genericAnswerCount?: number;
  answerPolarity?: string;
}

function optionCountOf(ctx: MdLaneContext): number {
  return clampTopicMdOptionCount(
    (ctx.resolved as GistResolved).genericOptionCount ??
      TOPIC_MAIN_IDEA_MD_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampTopicMdAnswerCount(
    (ctx.resolved as GistResolved).genericAnswerCount ??
      TOPIC_MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

/** 보기 언어 = 문항 형식(레인과 동일 결정 소스 — en=주제 / ko=요지). */
function gistModeOf(ctx: MdLaneContext): MdGistMode {
  return readOptionLanguageSetting(ctx.rawTypeSettings, SUB_TYPE) === "en"
    ? "TOPIC"
    : "MAIN_IDEA";
}

function polarityOf(ctx: MdLaneContext): MdGistPolarity {
  return (ctx.resolved as GistResolved).answerPolarity === "NEGATIVE"
    ? "NEGATIVE"
    : "POSITIVE";
}

function labelsOf(ctx: MdLaneContext): string[] {
  return TOPIC_MAIN_IDEA_MD_LABELS.slice(0, optionCountOf(ctx)) as string[];
}

function rankOf(label: string): number {
  const i = TOPIC_MAIN_IDEA_MD_LABELS.indexOf(
    label as (typeof TOPIC_MAIN_IDEA_MD_LABELS)[number],
  );
  return i >= 0 ? i : TOPIC_MAIN_IDEA_MD_LABELS.length; // 축 밖 라벨은 뒤로 — 게이트가 지목한다
}

export const TOPIC_MAIN_IDEA_LUNA_EXT: LunaLaneExt = {
  subType: SUB_TYPE,

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const labels = labelsOf(ctx);
    const optionCount = labels.length;
    const answerCount = answerCountOf(ctx);
    const gistMode = gistModeOf(ctx);
    const polarity = polarityOf(ctx);
    const kind = gistMode === "TOPIC" ? "주제" : "요지";
    return {
      name: "topic_main_idea_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["evidence", "options", "answers", "explanation", "wrong"],
        properties: {
          evidence: {
            type: "string",
            description:
              "정답 판단의 축이 된 지문 문장 하나 — 지문에서 문장 첫 글자부터 종결 구두점까지 한 글자도 바꾸지 말고 축자로. 재진술·문장 중간 조각·두 문장 결합 금지. 학생에게는 보이지 않고 기계 검증에만 쓰인다",
          },
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
                    gistMode === "TOPIC"
                      ? "주제 선지 — 영어 명사구(중심 화제+필자의 관점). 다른 선지와 앞부분 어구를 그대로 겹쳐 쓰지 마라. 라벨·번호·정답 표시 없이 텍스트만"
                      : "요지 선지 — 한국어 완결 진술문. 종결은 '…한다./…이다./…해야 한다.' 평서형이며, 해설 문체인 합쇼체('…습니다')를 선지에 쓰면 안 된다. 다른 선지와 앞부분 어구를 그대로 겹쳐 쓰지 마라. 라벨·번호·정답 표시 없이 텍스트만",
                },
              },
            },
          },
          answers: {
            type: "array",
            minItems: answerCount,
            maxItems: answerCount,
            items: { type: "string", enum: labels },
            description:
              polarity === "NEGATIVE"
                ? `${kind}로 명백히 부적절한 정답 선지의 라벨 ${answerCount}개`
                : `정답 선지의 라벨 ${answerCount}개`,
          },
          explanation: {
            type: "string",
            description:
              polarity === "NEGATIVE"
                ? `딱 2문장 — 필자가 무엇을 말하는지, 그리고 정답 선지가 왜 그 논지에 비추어 ${kind}로 부적절한지(한국어, 합쇼체). '근거문장은…'처럼 학생 표면에 인쇄되지 않는 내부 필드를 지칭하지 말고 '필자는…'처럼 지문 내용으로 시작하라`
                : `딱 2문장 — 필자가 무엇을 말하는지, 그리고 정답이 왜 글 전체를 대표하는지(한국어, 합쇼체). '근거문장은…'·'이 문장은…'처럼 학생 표면에 인쇄되지 않는 내부 필드를 지칭하지 말고 '필자는…'처럼 지문 내용으로 시작하라`,
          },
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
                  description:
                    polarity === "NEGATIVE"
                      ? `이 선지가 왜 ${kind}로 타당한지(= 왜 정답이 아닌지) 지문 근거로 1문장(한국어, 합쇼체). 학생에게 하는 설명이지 출제 메모가 아니다`
                      : "이 오답이 왜 탈락인지 판정 근거 딱 1문장(한국어, 합쇼체). 학생에게 하는 설명이지 출제 메모가 아니다 — 매력 이유·기제 이름·심리 서사, '최매력 오답'·'학생을 가두는/낚는/선별하는' 같은 설계 자백 표현 금지",
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
    const wrongCount = optionCount - answerCount;
    const gistMode = gistModeOf(ctx);
    const polarity = polarityOf(ctx);
    const kind = gistMode === "TOPIC" ? "주제" : "요지";
    const labelRun = TOPIC_MAIN_IDEA_MD_LABELS.slice(0, optionCount).join("");
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식): 확정성=제약으로 강등, 난이도 정합=목표로 승격.
      "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
      polarity === "NEGATIVE"
        ? `- 판정 확정성(정답 = ${kind}로 명백히 부적절한 선지로 유일 확정·근거문장 축자)은 **제약**이다 — 어떤 경우에도 양보하지 마라. 기출 형식(선지 언어·길이 평행)도 양보 불가다.`
        : `- 판정 확정성(정답 유일·오답 전원 확정 탈락·근거문장 축자)은 **제약**이다 — 어떤 경우에도 양보하지 마라. 기출 형식(선지 언어·길이 평행)도 양보 불가다.`,
      polarity === "NEGATIVE"
        ? `- 그 제약 안에서는 **요청된 난이도에 맞는 선지 설계**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 선택(한눈에 표나는 부적절 정답·빤한 타당 선지)으로 후퇴하는 것은 실패다 — 명백히 부적절하면서도 난이도에 맞게 정교한 정답 선지는 거의 모든 지문에서 만들 수 있다.`
        : `- 그 제약 안에서는 **요청된 난이도에 맞는 오답 설계**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 오답(한눈에 지워지는 근거 없음·지문 밖 소재)으로 후퇴하는 것은 실패다 — 확정 탈락이면서 난이도에 맞게 매력적인 오답은 거의 모든 지문에서 만들 수 있다.`,
      polarity === "NEGATIVE"
        ? "- 막히면 타당 선지의 근거 다양성부터 양보하라."
        : "- 막히면 기제 다양성부터 양보하라.",
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      `- 선지는 정확히 ${optionCount}개, 라벨은 ${labelRun} 순서 그대로 중복·누락 없이 쓴다.`,
      "- 선지 텍스트는 비워 두지 말고, 두 선지가 사실상 같은 문장이면 반려된다 — 같은 뜻을 말만 바꿔 쓰지 마라(복수정답 시비의 최다 원인).",
      "- 선지 텍스트에 라벨·번호를 다시 쓰지 말고, 정답 표시((정답)·O·✓ 류)를 절대 넣지 마라 — 텍스트만.",
      gistMode === "TOPIC"
        ? "- 선지는 전부 영어 **명사구**(중심 화제 + 필자의 관점)다. 한글이 한 글자라도 섞이거나 영문이 없는 선지는 반려된다. 관점 없이 소재만 적은 명사구·완결 문장은 실격이다."
        : "- 선지는 전부 한국어 **완결 진술문**(…한다. / …이다. / …해야 한다.)이다. 한글이 없는 선지는 반려된다. 제목형 명사구·영어 선지는 실격이다.",
      gistMode === "MAIN_IDEA"
        ? "- 선지 종결 문체 점검(실측 반려 계통): 선지는 하나도 빠짐없이 **'-다' 평서형**으로 끝나야 한다. 합쇼체·해요체('…합니다'·'…있습니다'·'…해야 합니다'·'…해요')로 끝나는 선지가 하나라도 있으면 시험지에 실을 수 없어 폐기된다 — 합쇼체는 해설·오답 해설 전용이다. 출력 직전 선지를 한 줄씩 훑어 마지막 두 글자가 '니다'·'어요'가 아닌지 확인하라."
        : "- 선지에 마침표로 끝나는 완결 문장이나 한국어를 섞지 마라 — 명사구만.",
      gistMode === "TOPIC"
        ? "- 지문 문장을 4단어 이상 그대로 옮긴 선지는 축자 복사로 반려된다 — 선지는 전부 재진술이다."
        : "- 지문 문장을 그대로 번역·전사한 선지를 만들지 마라 — 선지는 전부 재진술이다.",
      `- 정답(answers)은 정확히 ${answerCount}개이고 전부 선지 라벨 집합 안에 있어야 한다.`,
      `- 오답 해설(wrong)은 정답을 제외한 ${wrongCount}개 전부에 하나씩 있어야 하며, 라벨이 중복되거나 정답 라벨이 끼면 반려된다.`,
      "- 근거문장(evidence)은 지문의 **완결된 한 문장**을 문장 첫 글자부터 종결 구두점까지 한 글자도 바꾸지 말고 그대로 옮긴다. 재진술·문장 중간 조각·연속하지 않은 두 문장의 결합·따옴표/번호/설명 덧붙임·5단어 미만의 짧은 조각은 전부 반려된다.",
      polarity === "NEGATIVE"
        ? `- 이 문항의 정답은 '${kind}로 부적절한 선지'다. 정답이 아닌 ${wrongCount}개는 전부 ${kind}로 타당해야 하고(서로 다른 근거로 — 같은 말의 재탕 금지), 정답 ${answerCount}개는 지문으로 명백히 반증되어야 한다. "덜 포괄적이다/조금 약하다" 수준의 어긋남은 복수정답이므로 재설계하라.`
        : `- 정답은 글 전체를 포괄하는 ${kind}여야 하고, 오답 전원은 확정 탈락(방향 반전·범위 확대/축소·도입부 통념·예시 승격·근거 없음 중 하나)이어야 한다. 문맥상 성립 가능한 오답이 남으면 정답 시비가 난다.`,
      `- 기출 형식(길이 실측): 선지 ${optionCount}개의 글자수를 **실제로 세어** 가장 긴 것 ÷ 가장 짧은 것이 1.5 이하인지 확인하라. 넘으면 긴 선지의 수식어를 덜어 내 다시 맞춰라. 그리고 **정답이 최장 선지가 되어서는 안 된다** — 정답만 유독 길거나 유독 종합적(조건+양보+귀결의 다절 복문)이면 지문을 읽지 않고 '가장 길고 가장 종합적인 것'만 골라도 풀린다. 절대 표현(모든·결코·완전히 류)을 오답에만 몰지 마라.`,
      "- 선지 미러쌍 금지(실측 반려 계통 — 이 유형 최다 결함): 두 선지가 앞부분을 **10자 이상 그대로 겹쳐 쓴 뒤 꼬리에서만 갈라지는** 배치를 만들지 마라. 특히 정답 문장을 복사해 부정어·반대어만 뒤집은 오답(…할 수 있다 / …할 수 없다, …정확하게 / …편향되게, …확장하는 방향 / …반대되는 방향)은 절대 금지다 — 학생이 지문을 읽지 않고도 '글자가 겹치는 두 선지 중 하나가 정답'이라는 메타 규칙으로 2지선다까지 좁힌다. 방향반대 오답은 **어구를 새로 써서** 같은 논지를 뒤집어라. 출력 직전 모든 선지 쌍의 앞머리를 대조해 겹치는 쌍이 없는지 확인하라.",
      "- 선지는 서로 다른 어구로 시작해야 한다(같은 주어·같은 도입 명사구로 시작하는 선지가 3개 이상이면 다시 써라).",
      '- 해설·오답 해설에서 선지를 "3번"·"선지 1"·"보기 2"·"(3)" 처럼 번호로 지칭하지 마라 — 저장 단계에서 선지 순서가 재배열되므로 선지의 내용으로 지칭하라.',
      "- 해설·오답 해설은 비워 두지 말고 한국어 합쇼체(-습니다)로 통일한다. 지문에 없는 내용·구조 서술을 지어내지 마라(지문 표현의 축자 인용만 허용).",
      "- 해설은 '근거문장은…'·'이 문장은…'으로 시작하지 마라 — 근거문장은 학생 표면에 인쇄되지 않는 내부 필드라 해설지에서는 선행사 없는 지시어가 된다. '필자는…'처럼 지문 내용으로 열어라.",
      "- 위치·구조 서술은 반드시 지문을 다시 세어 보고 쓴다(실측 반려 계통): '도입부'·'글 초반'·'본론에 들어가기 전'이라고 쓰려면 그 문장이 실제로 지문 앞쪽에 있는지 확인하라. 결론 직전 문장을 '도입부 함정'이라 부르는 식의 구조 허위는 해설 사실성 위반으로 폐기된다. 확인이 안 되면 위치를 말하지 말고 내용으로만 설명하라.",
      "- 오답 해설은 학생에게 하는 설명이다. '최매력 오답'·'훑어 읽는 학생을 가두는'·'학생을 낚는/선별하는/소거하는' 같은 출제 설계 자백 표현을 쓰지 말고, 그 선지가 왜 지문과 어긋나는지만 적어라.",
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 1~2문장·오답 딱 1문장, 유혹·심리 서사 금지 — 짧을수록 좋다.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        evidence: string;
        options: Array<{ label: string; text: string }>;
        answers: string[];
        explanation: string;
        wrong: Array<{ label: string; text: string }>;
      };
      const corrections: string[] = [];
      // 코어스 1(무기록): 정답 라벨 중복 제거 — md 경로는 parseGistAnswerRun 이
      // 대들보에서 dedupe 하므로 게이트에 중복 검사가 없다. JSON 경로는 스키마로
      // 중복을 막을 수 없어(json_schema 에 uniqueItems 없음) 여기서 md 파서와
      // 동형으로 걸러야 개수 게이트("정답 1개 (2개 필요)")가 정직하게 울린다.
      const answersIn = raw.answers.filter((a, i) => raw.answers.indexOf(a) === i);
      // 코어스 2(기록): 정답 라벨 오름차순 — 순서가 의미를 갖지 않는 집합이므로
      // 기계 확정 가능(SPEC §1-8). correctAnswer 문자열("2, 4")의 표시 결정론.
      const answers = [...answersIn].sort((a, b) => rankOf(a) - rankOf(b));
      if (answers.join("") !== answersIn.join("")) {
        corrections.push("정답 라벨을 오름차순 정렬");
      }
      const q: MdTopicMainIdeaQuestion = {
        kind: "topicMainIdea",
        evidence: String(raw.evidence ?? ""),
        options: raw.options.map((o) => ({ label: o.label, text: o.text })),
        answers,
        // 게이트 진단용 — 정답 라벨을 하나도 못 읽었을 때 자리를 지목한다.
        answerRaw: answersIn.join(", "),
        // JSON 경로는 wrong 필드 자체가 머리표다 — 배열이 오면 섹션 존재로 본다.
        wrongSectionFound: Array.isArray(raw.wrong),
        explanation: raw.explanation,
        // 코어스 3(무기록): 오답 해설 라벨 오름차순 정렬(표시 결정론 — 정답 라벨이
        // 끼어 있어도 여기서 거르지 않는다: 게이트가 반려해 재생성을 유도해야 한다).
        wrong: [...raw.wrong].sort((a, b) => rankOf(a.label) - rankOf(b.label)),
      };
      // 레인 스냅 재사용 — 선지 라벨순 정렬·정답 표시 제거·근거문장 축자 보정.
      const snapped = autoSnapTopicMainIdea(q, ctx.passage);
      return {
        question: snapped.question,
        gateIssues: gateMdTopicMainIdea(snapped.question, ctx.passage, {
          optionCount: optionCountOf(ctx),
          answerCount: answerCountOf(ctx),
          gistMode: gistModeOf(ctx),
        }),
        corrections: [...corrections, ...snapped.corrections],
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

  // evidence 는 md 스트림에서도 `근거문장:` 줄로 방류되던 표면이다(학생 최종
  // 표면이 아니라 생성 스트림 UX) — md 동형을 위해 같은 라벨로 흘린다.
  bridgeSpecs: [
    { path: "evidence", prefix: "근거문장: ", suffix: "\n" },
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
        : "다음 글의 요지로 가장 적절한 것은?";
    const options = Array.isArray(aiQuestion.options)
      ? (aiQuestion.options as Array<Record<string, unknown>>)
          .map((o) => {
            // 어댑터는 저장 축 숫자 라벨("1"~"8")을 낸다 — 시험지 관행대로 원문자로.
            const label = String(o.label ?? "");
            const n = Number(label);
            const circled =
              Number.isInteger(n) && n >= 1 && n <= TOPIC_MAIN_IDEA_MD_LABELS.length
                ? TOPIC_MAIN_IDEA_MD_LABELS[n - 1]
                : label;
            return `${circled} ${String(o.text ?? "")}`;
          })
          .join("\n")
      : "";
    return `${direction}\n\n${passage}\n\n${options}`;
  },
};
