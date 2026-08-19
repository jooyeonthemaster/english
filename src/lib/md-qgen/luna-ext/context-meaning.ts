// ============================================================================
// CONTEXT_MEANING(문맥 속 의미) luna 레인 확장 — 전 유형 이식 캠페인.
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · ./implied-meaning.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 어휘 계열(vocabRecon 패밀리) — 지문 무변형·밑줄 표적 유형이다. 모델이 내는
// 것은 밑줄 표적(word) 한 줄과 선지·정답·해설·오답뿐이며, 유일한 지문 결속점이
// word 라 스키마도 그 필드를 맨 앞에 둔다(스트리밍 도착 순서 = 브릿지 `밑줄:`
// 섹션이 먼저 흐른다). 재구성 계약은 없지만 **축자 계약은 있다**: 후처리
// processContextMeaning 이 word 를 replaceAtPosition 으로 지문에 도로 써 넣으므로
// 대소문자 하나만 어긋나도 지문 원문이 모델 표기로 조용히 바뀐다 — 검산 블록이
// "한 글자씩 대조 + 등장 1회 확인"을 강제하고, 스냅(autoSnapContextMeaningTarget)
// 이 잔여 드리프트를 0원으로 흡수한다.
//
// 형식 노브: 선지수(4~8)·정답수(1~N-1)·선지 언어(en 기본/ko 토글)가 ctx 를
// 따라가는 동적 스키마다. 발문 언어(stemLanguage)는 레인 adapt 가 집행하므로
// 이 파일은 손대지 않는다. 과금도 무접촉 — 레인 operationType(QUESTION_GEN_VOCAB)
// 그대로다.
//
// 파싱 산출물은 MdContextMeaningQuestion 동형으로 어댑트해 레인의 스냅·게이트
// (gateMdContextMeaning)·어댑터를 전부 재사용한다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  clampContextMeaningMdAnswerCount,
  clampContextMeaningMdOptionCount,
  CONTEXT_MEANING_MD_ANSWER_COUNT_DEFAULT,
  CONTEXT_MEANING_MD_CIRCLED,
  CONTEXT_MEANING_MD_OPTION_COUNT_DEFAULT,
  CONTEXT_MEANING_MD_OPTION_MAX_KO_CHARS,
  CONTEXT_MEANING_MD_OPTION_MAX_WORDS,
  CONTEXT_MEANING_MD_TARGET_MAX_CHARS,
  CONTEXT_MEANING_MD_TARGET_MAX_WORDS,
} from "../prompts-context-meaning";
import {
  autoSnapContextMeaningTarget,
  locateContextMeaningTarget,
  type MdContextMeaningQuestion,
} from "../parser-context-meaning";
import { gateMdContextMeaning } from "../gate-context-meaning";
import { CONTEXT_MEANING_MD_DIRECTION } from "../adapter-context-meaning";
import { normalizeWs } from "../parser";
import { readOptionLanguageSetting } from "@/lib/question-type-generation-settings";

interface ContextMeaningResolved {
  genericOptionCount?: number;
  genericAnswerCount?: number;
}

function optionCountOf(ctx: MdLaneContext): number {
  return clampContextMeaningMdOptionCount(
    (ctx.resolved as ContextMeaningResolved).genericOptionCount ??
      CONTEXT_MEANING_MD_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampContextMeaningMdAnswerCount(
    (ctx.resolved as ContextMeaningResolved).genericAnswerCount ??
      CONTEXT_MEANING_MD_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

/** 레인 optionLanguageOf 와 동일 판정 — 기본 en, 교사 토글 ko. */
function optionLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readOptionLanguageSetting(ctx.rawTypeSettings, "CONTEXT_MEANING") === "ko"
    ? "ko"
    : "en";
}

function labelsOf(ctx: MdLaneContext): string[] {
  return CONTEXT_MEANING_MD_CIRCLED.slice(0, optionCountOf(ctx));
}

/**
 * 교사 지정 준수 — 레인 lane-context-meaning.ts 의 동명 검사와 동일 로직
 * (비수출이라 여기서 동형 재현). 이 유형은 POINT_PICKER_CONFIG 미등재로
 * teacherPoints 가 실전에서 항상 비지만, 레인 parseAndGate 산출과의 동형성을
 * 위해 방어 유지.
 */
function teacherPointIssues(
  q: MdContextMeaningQuestion,
  ctx: MdLaneContext,
): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const target = normalizeWs(q.word).toLowerCase();
  const issues: string[] = [];
  for (const point of ctx.teacherPoints) {
    const pt = normalizeWs(point.text).toLowerCase();
    if (!pt) continue;
    if (!target || (!target.includes(pt) && !pt.includes(target))) {
      issues.push(`교사 지정 표현이 밑줄에 없음: '${point.text.slice(0, 60)}'`);
    }
  }
  return issues;
}

export const CONTEXT_MEANING_LUNA_EXT: LunaLaneExt = {
  subType: "CONTEXT_MEANING",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const labels = labelsOf(ctx);
    const optionCount = labels.length;
    const answerCount = answerCountOf(ctx);
    const lang = optionLanguageOf(ctx);
    return {
      name: "context_meaning_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["word", "options", "answers", "explanation", "wrong"],
        properties: {
          // 유일한 지문 결속점 — 맨 앞(브릿지 `밑줄:` 섹션이 먼저 흐른다).
          word: {
            type: "string",
            description:
              "지문에서 밑줄 칠 다의어 표적 — 지문에 실재하는 표현을 한 글자도 바꾸지 않고 복사(굴절형·대소문자·구두점까지 원문 그대로). " +
              `한 단어가 기본, 구동사·관용구만 ${CONTEXT_MEANING_MD_TARGET_MAX_WORDS}단어 이내 허용. ` +
              "지문에 정확히 1회만 등장하는 표현이어야 한다. 따옴표·별표로 감싸지 마라.",
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
                    lang === "ko"
                      ? `이 문맥에서의 뜻풀이 선지(한국어, ${CONTEXT_MEANING_MD_OPTION_MAX_KO_CHARS}자 이내 구) — 라벨·번호·괄호 주석 없이 뜻풀이만`
                      : `이 문맥에서의 뜻풀이 선지(영어, ${CONTEXT_MEANING_MD_OPTION_MAX_WORDS}단어 이내 구) — 라벨·번호·괄호 주석 없이 뜻풀이만. 완결 문장 금지`,
                },
              },
            },
          },
          answers: {
            type: "array",
            minItems: answerCount,
            maxItems: answerCount,
            items: { type: "string", enum: labels },
            description: "정답 라벨(들) — 선지 라벨 그대로",
          },
          explanation: {
            type: "string",
            // 26-08-18 O225 해설 다이어트
            description:
              "정답 해설(한국어, 합쇼체) — 1~2문장: 이 단어가 이 지문에서 어느 의미축으로 쓰였는지와 그 축을 확정하는 근거 문장만(판정 근거). 학생 심리·출제 의도 서사 금지",
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
                    "이 오답이 왜 탈락인지 딱 1문장(한국어, 합쇼체) — 판정 근거만, 매력 이유·기제 이름·학생 심리 서사 금지",
                },
              },
            },
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const labels = labelsOf(ctx);
    const optionCount = labels.length;
    const answerCount = answerCountOf(ctx);
    const wrongCount = optionCount - answerCount;
    const nearFieldMin = Math.min(2, wrongCount);
    const lang = optionLanguageOf(ctx);
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수)",
      "- 확정성(밑줄이 지문 축자·1회 등장, 문맥이 뜻을 유일하게 결정, 오답 전원 확정 탈락)은 **제약**이다: 이를 어기는 표적·선지는 어떤 경우에도 내지 마라. 기출 형식(단어 단위 밑줄·뜻풀이 구 선지·길이 평행·오답 해설 전원)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 표적·오답**이 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 선택(문맥 없이도 뜻이 잡히는 뻔한 표적·즉시 지워지는 오답)으로 후퇴하는 것은 실패다 — 확정적이면서 난이도에 맞는 표적은 거의 모든 지문에 있다.",
      "- 전부를 동시에 만족할 수 없으면 **공예 다양성부터 양보하라** — 기제 다양성과 비주류 뜻 욕심을 버리고, 지문에 1회만 등장하고 판정이 확정적인 다른 표적으로 교체해도 된다.",
      "",
      "## 밑줄 표적 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      "- word 는 지문에 실재하는 표현을 **한 글자도 바꾸지 않고** 복사했는가 — 굴절형·대소문자·구두점까지 원문 그대로. 출력 직전 word 를 지문에서 찾아 **한 글자씩 대조**하라(축자 일치 자가 검산). 한 글자라도 다르면 반려된다.",
      "- word 가 지문에 **정확히 1회** 등장하는가 — 등장 횟수를 직접 세어라. 두 번 이상 나오는 표현은 밑줄 자리가 확정되지 않아 반려된다. 2회 이상이면 다른 표적으로 교체하라.",
      `- word 는 ${CONTEXT_MEANING_MD_TARGET_MAX_WORDS}단어 이내·${CONTEXT_MEANING_MD_TARGET_MAX_CHARS}자 이내인가 — 한 단어가 기본이고 구동사·관용구만 짧은 구로 허용된다. 절·문장 밑줄은 반려된다(그건 IMPLIED_MEANING 의 자리다).`,
      "- word 는 영문자로 시작해 영문자로 끝나는가 — 따옴표·구두점·별표를 밑줄 안에 넣지 마라.",
      "- 관사·전치사·접속사·대명사·be동사 **단독** 밑줄이 아닌가(a·the·it·is 류) — 기능어 단독은 반려된다. 내용어여야 한다.",
      "- word 가 따옴표로 인용된 토큰이거나 the word ~ / called ~ / known as ~ 바로 뒤가 아닌가 — 지문이 뜻을 직접 알려 주는 언급(mention) 자리는 문항이 성립하지 않아 반려된다. 지문이 소개하는 외국어 단어도 같은 이유로 실격이다.",
      "- word 가 문장 중간의 대문자 시작 단어가 아닌가 — 고유명사·외국어 표기는 표적이 될 수 없어 반려된다.",
      "- ⭐ 리트머스: word 를 **사전 대표 의미**로 바꿔 그 문장을 다시 읽어 보라. 그래도 자연스럽게 읽히면 문맥이 뜻을 결정하지 못하는 자리다 — 그 표적은 버리고 더 문맥 의존적인 후보로 교체하라.",
      "",
      "## 선지·정답 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      `- 선지는 정확히 ${optionCount}개이고 label 이 ${labels.join("")} 순서 그대로인가. 빈 선지 텍스트가 없는가. 두 선지가 사실상 같은 내용이면 반려된다.`,
      lang === "ko"
        ? `- 선지 텍스트는 전부 **한국어 뜻풀이**인가(교사 설정) — 한국어가 아니면 반려된다. ${CONTEXT_MEANING_MD_OPTION_MAX_KO_CHARS}자 이내의 짧은 뜻풀이 구로 써라.`
        : `- 선지 텍스트는 전부 **영어 뜻풀이 구**인가 — 한글이 한 글자라도 섞이면 반려된다. 각 선지는 ${CONTEXT_MEANING_MD_OPTION_MAX_WORDS}단어 이내다. 완결 문장으로 늘어지면 반려된다.`,
      "- 선지에 별표·백틱·밑줄 표기 같은 마크다운 장식이 없는가 — 남아 있으면 반려된다.",
      "- 선지에 괄호·대괄호 주석이 없는가 — 서버가 괄호 안을 말없이 삭제하므로 반려된다. 뜻풀이만 남겨라.",
      "- 어느 선지도 word 자체나 그 굴절형이 아닌가 — 동어반복은 문항이 무너져 반려된다.",
      "- 정답 선지만 여러 단어이고 나머지가 전부 한 단어인 형태가 아닌가 — 형태로 정답이 들켜 반려된다. 길이·격식·구체성을 평행하게 맞춰라.",
      "- 선지(특히 정답)에 쓴 뜻풀이 표현이 지문 본문에 축자로 기등장하지 않는가 — 지문이 답을 흘려 정답 시비가 난다. 기등장하면 표현을 바꾸거나 다른 표적으로 교체하라.",
      "- 재대입 검산: 각 선지를 밑줄 자리에 대입해 읽어 보라. 정답 대입문만 원문과 같은 뜻으로 자연스럽고, 오답 대입문은 문법은 성립하되(품사·수·시제 일치) 의미가 어긋나야 한다. 형태만으로 지워지는 오답은 다시 써라.",
      `- 각 오답이 "이 단어가 실제 가질 수 있는 다른 뜻"이거나 "이 문맥이 부르는 오독"인가 — 어느 쪽도 아닌 무작위 오답은 장식이다. 정답과 같은 의미장의 오답이 ${nearFieldMin}개 이상인지 세어라.`,
      `- answers 는 정확히 ${answerCount}개이고 전부 선지 label 집합 안에 있는가.` +
        (answerCount >= 2
          ? ` 정답 ${answerCount}개는 서로 같은 뜻의 재탕이 아니라 서로 다른 측면을 짚어야 한다.`
          : ` ${answerCount + 1}개째로 시비 걸릴 선지가 있으면 그 선지를 다시 써라.`),
      `- wrong 은 정답을 제외한 ${wrongCount}개 전부에 하나씩 있는가 — 개수가 어긋나거나 정답 라벨이 wrong 에 끼면 반려된다.`,
      // 26-08-18 O225 해설 다이어트
      "- explanation 을 채웠는가 — 한국어 합쇼체(-습니다) 1~2문장: 어느 의미축으로 쓰였는지 + 그 축을 확정하는 근거 문장. 지문 구조를 서술할 때는 실제 지문을 재확인해 **사실만** 써라. wrong 해설도 합쇼체 1문장씩(왜 탈락인지만).",
      "- 해설 분량: 정답 해설 1~2문장(의미축·근거 문장), 오답 해설 딱 1문장(왜 탈락인지). 매력 이유·기제 이름·학생 심리 서사는 쓰지 마라 — 짧을수록 좋다.",
      "- 해설·오답 해설에서 선지를 평숫자로 지칭하지 않았는가 — 아라비아 숫자에 '번'을 붙이거나 '선지'·'보기' 뒤에 숫자를 적거나 괄호 숫자·원문자 물결 범위를 쓰는 표기다. 선지는 출제 후 재배열되므로 하나라도 있으면 재배열이 통째로 취소된다. 내용을 인용하거나 원문자 하나만 써라.",
      "",
      "## 기출 형식 관행 (수능 문맥 의미 — 위반하면 실전에서 들킨다)",
      "- 밑줄은 **단어 단위**가 기출 관행이다 — run·charge·address 같은 쉬운 다의어 한 단어가 최적 표적이고, 여러 단어는 구동사·관용구일 때만 허용된다.",
      "- 선지는 전부 짧은 뜻풀이 구로 평행하게 — 정답만 유독 길거나 짧거나 격식이 다르면 내용을 안 읽고도 찍힌다.",
      wrongCount >= 2
        ? "- 오답 기제는 서로 다르게 쓰되 **사전 대표뜻 오답을 반드시 하나 포함**하라 — 밑줄만 본 학생이 집는 최매력 오답이 이 유형의 변별 관행이다."
        : "- 오답이 하나뿐이면 **사전 대표뜻** 기제를 쓴다 — 변별력이 가장 높다.",
      "- 정답은 이 문맥에서의 뜻을 옮긴 재진술이다 — 밑줄 단어의 표면 어휘를 선지에 재사용하지 마라.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        word: string;
        options: Array<{ label: string; text: string }>;
        answers: string[];
        explanation: string;
        wrong: Array<{ label: string; text: string }>;
      };
      // 코어스 ①: 정답 라벨 중복 제거(md 파서의 Set 수집과 동형 — 중복이 남으면
      // 개수 게이트가 "정답 N개" 로 지목한다).
      const answers = [...new Set(raw.answers)];
      let q: MdContextMeaningQuestion = {
        kind: "contextMeaning",
        word: typeof raw.word === "string" ? raw.word.trim() : "",
        options: raw.options.map((o) => ({
          label: o.label,
          text: typeof o.text === "string" ? o.text.trim() : o.text,
        })),
        answers,
        answer: answers[0] ?? "",
        explanation:
          typeof raw.explanation === "string" ? raw.explanation.trim() : "",
        // 코어스 ②: 오답 해설 라벨 오름차순 정렬(표시 결정론 — 어법·빈칸·제목 동일).
        wrong: [...raw.wrong]
          .map((w) => ({
            label: w.label,
            text: typeof w.text === "string" ? w.text.trim() : w.text,
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      };
      // 코어스 ③: 밑줄 표적 지문 축자 스냅(레인 스냅 재사용 — 대소문자·구두점·
      // 구간 드리프트를 유일 위치일 때만 교정. 실패는 게이트가 반려).
      const snapped = autoSnapContextMeaningTarget(q, ctx.passage);
      q = snapped.question;
      return {
        question: q,
        gateIssues: [
          ...gateMdContextMeaning(q, ctx.passage, {
            optionCount: optionCountOf(ctx),
            answerCount: answerCountOf(ctx),
            optionLanguage: optionLanguageOf(ctx),
          }),
          ...teacherPointIssues(q, ctx),
        ],
        corrections: snapped.corrections,
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

  bridgeSpecs: [
    { path: "word", prefix: "밑줄: ", suffix: "\n" },
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
        : CONTEXT_MEANING_MD_DIRECTION;
    // 학생 표면은 밑줄이 표시된 지문이다 — 후처리 passageWithUnderline 의
    // `__단어__` 관례로 평가 전용 렌더를 한다(레인·게이트와 같은 탐색기 재사용).
    const word =
      typeof aiQuestion.underlinedWord === "string"
        ? aiQuestion.underlinedWord
        : "";
    const hit = word ? locateContextMeaningTarget(passage, word) : null;
    const surface =
      hit && hit.count === 1
        ? `${passage.slice(0, hit.index)}__${passage.slice(hit.index, hit.index + hit.length)}__${passage.slice(hit.index + hit.length)}`
        : passage;
    const options = Array.isArray(aiQuestion.options)
      ? (aiQuestion.options as Array<Record<string, unknown>>)
          .map(
            (o, i) =>
              `${CONTEXT_MEANING_MD_CIRCLED[i] ?? String(o.label ?? "")} ${String(o.text ?? "")}`,
          )
          .join("\n")
      : "";
    return `${direction}\n\n${surface}\n\n${options}`;
  },
};
