// ============================================================================
// TOPIC(주제 추론) luna 레인 확장 — 전 유형 이식 캠페인(견본: ./title.ts).
// 계약: ../luna-ext-types.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 선택형 계열(지문 무변형) — 재구성 계약이 없고, 형식 노브 넷(선지수 4~8 ·
// 정답수 1~N-1 · 선지 언어 en/ko · 극성 POSITIVE/NEGATIVE)이 ctx 를 따라
// 움직이는 동적 스키마다. 파싱 산출물은 MdTopicQuestion(parser-topic.ts) 동형으로
// 만들어 레인의 스냅(autoSnapTopicOptions)·게이트(gateMdTopic)·어댑터
// (adaptMdTopicToAiQuestion, 레인 adapt 경유)를 전부 재사용한다.
//
// ⚠ 발문(direction)은 여기서도 모델에게 받지 않는다 — 레인 adapt 가
//   buildTopicDirection(극성×정답수×발문언어) 으로 결정론 생성한다(lane-topic.ts
//   설계 결정 그대로). 스키마에 direction 칸을 만들면 그 설계를 되돌리는 것이다.
// ⚠ 노브 계산은 lane-topic.ts 의 optionCountOf/answerCountOf/polarityOf/
//   optionLanguageOf 와 문자 그대로 동일해야 한다 — 어긋나면 스키마가 강제한
//   형상과 게이트가 요구하는 형상이 갈라져 정상 출력이 반려된다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  GENERIC_ANSWER_COUNT_DEFAULT,
  GENERIC_OPTION_COUNT_DEFAULT,
  readOptionLanguageSetting,
} from "@/lib/question-type-generation-settings";
import {
  clampTopicMdAnswerCount,
  clampTopicMdOptionCount,
  TOPIC_MD_CIRCLED,
  type TopicMdOptionLanguage,
  type TopicMdPolarity,
} from "../prompts-topic";
import {
  autoSnapTopicOptions,
  topicLabelIndex,
  type MdTopicQuestion,
} from "../parser-topic";
import { gateMdTopic } from "../gate-topic";

interface TopicResolved {
  genericOptionCount?: number;
  genericAnswerCount?: number;
  answerPolarity?: string;
}

// ── 노브 계산(lane-topic.ts 와 1:1 동일) ───────────────────────────────────
function optionCountOf(ctx: MdLaneContext): number {
  return clampTopicMdOptionCount(
    (ctx.resolved as TopicResolved).genericOptionCount ?? GENERIC_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampTopicMdAnswerCount(
    (ctx.resolved as TopicResolved).genericAnswerCount ?? GENERIC_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

function polarityOf(ctx: MdLaneContext): TopicMdPolarity {
  return (ctx.resolved as TopicResolved).answerPolarity === "NEGATIVE"
    ? "NEGATIVE"
    : "POSITIVE";
}

function optionLanguageOf(ctx: MdLaneContext): TopicMdOptionLanguage {
  return readOptionLanguageSetting(ctx.rawTypeSettings, "TOPIC") === "ko" ? "ko" : "en";
}

function labelsOf(ctx: MdLaneContext): string[] {
  return TOPIC_MD_CIRCLED.slice(0, optionCountOf(ctx)) as unknown as string[];
}

// ── 선지 형상 검사(r1 판정 수리, 26-08-14) ────────────────────────────────
// r1 luna 세트에서 확정된 F 3계통은 전부 "선지 집합의 형상"에서 나왔다:
//   ① 두 선지가 한 낱말만 갈아끼운 쌍둥이(economy/burden), ② 낱말 집합이 같고
//   순서만 뒤집힌 거울쌍(A over B / B over A), ③ 정답이 오답을 축자로 감싸는
//   포함쌍. 셋 다 정답이 그 쌍 안에 있다는 사실을 지문 없이 노출한다.
// 공유 게이트(gate-topic.ts)는 선지 '완전 중복'만 잡으므로, 부분 축자 공유는
// 여기서 잡는다(게이트 파일은 캠페인 금지 대상 — 자기 파일에서만 조인다).
// 임계는 r1 대조군(gemini 11문항)에 오프라인 적용해 오탐 0건을 확인한 값이다.
const OPTION_SHARE_RUN_LIMIT = 4; // 연속 공유 단어 수
const OPTION_SHARE_CONTENT_MIN = 2; // 그중 내용어 최소 개수(기능어 연속은 무해)
const OPTION_MIRROR_CONTENT_MIN = 3; // 거울쌍 판정 최소 내용어 수

const OPTION_FUNCTION_WORDS = new Set(
  ("a an the of in on for to and or by with as at from into through over under between among about " +
    "its their our your his her this that these those is are be being been not no nor than then so " +
    "such very more most less least own same s t").split(" "),
);

function optionWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'’-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function contentWords(words: string[]): string[] {
  return words.filter((w) => !OPTION_FUNCTION_WORDS.has(w));
}

/** 두 선지의 최장 연속 공유 구간(단어 단위). */
function longestSharedRun(a: string[], b: string[]): string[] {
  let best: string[] = [];
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let k = 1; k <= b.length; k += 1) {
      if (a[i - 1] === b[k - 1]) {
        cur[k] = prev[k - 1] + 1;
        if (cur[k] > best.length) best = a.slice(i - cur[k], i);
      }
    }
    prev = cur;
  }
  return best;
}

/**
 * 선지 쌍 형상 반려 — 기계로 고칠 수 없는(어휘를 새로 써야 하는) 위반이라
 * 코어스가 아니라 게이트 이슈다. 문구가 그대로 재생성 피드백이 되므로 자리를 지목한다.
 */
function optionShapeIssues(options: Array<{ label: string; text: string }>): string[] {
  const v: string[] = [];
  const parsed = options
    .filter((o) => o.text)
    .map((o) => ({ label: o.label, words: optionWords(o.text), text: o.text }));
  for (let i = 0; i < parsed.length; i += 1) {
    for (let k = i + 1; k < parsed.length; k += 1) {
      const a = parsed[i];
      const b = parsed[k];
      const ca = contentWords(a.words);
      const cb = contentWords(b.words);
      if (
        ca.length >= OPTION_MIRROR_CONTENT_MIN &&
        ca.length === cb.length &&
        [...ca].sort().join("") === [...cb].sort().join("")
      ) {
        v.push(
          `선지 ${a.label}·${b.label} 이 같은 낱말을 순서만 뒤집어 쓴 거울쌍임 — ` +
            `'${a.text.slice(0, 60)}' / '${b.text.slice(0, 60)}'. ` +
            `한 쌍이 눈에 보이면 정답이 그 안에 있다는 신호가 되므로, 한쪽을 다른 초점·다른 어휘로 새로 써라`,
        );
        continue;
      }
      const run = longestSharedRun(a.words, b.words);
      if (run.length >= OPTION_SHARE_RUN_LIMIT && contentWords(run).length >= OPTION_SHARE_CONTENT_MIN) {
        v.push(
          `선지 ${a.label}·${b.label} 이 '${run.join(" ")}' ${run.length}단어를 연속으로 그대로 공유함 — ` +
            `선지끼리 같은 구를 돌려쓰면(한 낱말만 갈아끼우거나 한쪽이 다른 쪽을 감싸면) 정답이 그 쌍 안에 있음이 드러난다. ` +
            `한쪽 선지를 다른 어휘로 다시 써서 연속 공유를 ${OPTION_SHARE_RUN_LIMIT - 1}단어 이하로 줄여라`,
        );
      }
    }
  }
  return v;
}

/** 지문에서 그 낱말이 문장 첫머리가 아닌 자리에 대문자로 나오면 고유명사로 본다. */
function looksProperNoun(token: string, passage: string): boolean {
  if (!token) return false;
  if (token.length >= 2 && token === token.toUpperCase()) return true; // 약어(AI·DNA)
  const re = new RegExp(`(?<![\\p{L}])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "gu");
  let m: RegExpExecArray | null;
  while ((m = re.exec(passage)) !== null) {
    const before = passage.slice(0, m.index).replace(/\s+$/, "");
    if (before.length > 0 && !/[.!?:;"'“”]$/.test(before)) return true;
  }
  return false;
}

/**
 * 코어스 ③ — 영어 주제 선지 첫 글자 소문자화("고쳐서 살린다").
 * 주제 유형 선지는 소문자 시작이 기출 관행이고 대문자 시작은 제목 유형의 표기다.
 * r1 luna 세트에서 한 문항이 다섯 선지를 통째로 대문자로 시작해 유형 표기가 섞였다 —
 * 어휘를 건드리지 않는 표면 교정이라 반려 대신 결정형으로 고친다.
 */
function coerceOptionCase(
  options: Array<{ label: string; text: string }>,
  passage: string,
  lang: TopicMdOptionLanguage,
  corrections: string[],
): Array<{ label: string; text: string }> {
  if (lang !== "en") return options;
  return options.map((o) => {
    const text = o.text ?? "";
    const lead = text.length - text.trimStart().length;
    const body = text.slice(lead);
    const m = /^([A-Z])([\p{L}'’-]*)/u.exec(body);
    if (!m) return o;
    // 소유격 꼬리('s)는 떼고 본딧말로 조회한다 — 지문에는 "Seoul" 로만 나온다.
    const head = (m[1] + m[2]).split(/['’]/)[0];
    if (looksProperNoun(head, passage)) return o;
    corrections.push(
      `${o.label} 선지 첫 글자를 소문자로 교정 — 주제 선지는 소문자 시작이 기출 표기(대문자 시작은 제목 유형)`,
    );
    return { ...o, text: text.slice(0, lead) + m[1].toLowerCase() + body.slice(1) };
  });
}

/** 평가 표면용 — 어댑터 저장 라벨("1"~"8")을 학생 표면 원문자로 되돌린다. */
function circledOf(label: string): string {
  const n = Number(label);
  return Number.isInteger(n) && n >= 1 && n <= TOPIC_MD_CIRCLED.length
    ? TOPIC_MD_CIRCLED[n - 1]
    : label;
}

export const TOPIC_LUNA_EXT: LunaLaneExt = {
  subType: "TOPIC",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const labels = labelsOf(ctx);
    const optionCount = labels.length;
    const answerCount = answerCountOf(ctx);
    const wrongCount = optionCount - answerCount;
    const lang = optionLanguageOf(ctx);
    const polarity = polarityOf(ctx);
    return {
      name: "topic_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["options", "answers", "explanation", "wrong"],
        properties: {
          // 본문성 큰 필드 먼저 — 필드 순서 = 스트리밍 도착 순서.
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
                      ? "주제 선지(한국어 명사구) — 라벨·번호 없이 주제구만. 다른 선지와 같은 구를 4어절 이상 연속으로 돌려쓰지 말 것"
                      : "주제 선지(영어 명사구·의문사구) — 라벨·번호 없이 주제구만, 소문자로 시작(고유명사 제외), 마침표 없음. 다른 선지와 4단어 이상 연속으로 같은 표현을 쓰지 말고, 낱말만 뒤바꾼 거울쌍도 금지",
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
                ? "정답(주제로 적절하지 않은 선지) 라벨 — 중복 없이"
                : "정답(주제로 가장 적절한 선지) 라벨 — 중복 없이",
          },
          explanation: { type: "string", description: "정답 해설(한국어 합쇼체, 딱 2문장)" },
          wrong: {
            type: "array",
            minItems: wrongCount,
            maxItems: wrongCount,
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
                      ? "이 선지가 이 글의 주제로 왜 타당한지 지문 근거로 1문장(한국어 합쇼체)"
                      : "이 선지가 왜 주제로 탈락인지 판정 근거 딱 1문장(한국어 합쇼체) — 매력 이유·기제 이름·학생 심리 서사 금지",
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
    const lang = optionLanguageOf(ctx);
    const polarity = polarityOf(ctx);
    const labelRun = TOPIC_MD_CIRCLED.slice(0, optionCount).join("");
    const langRule =
      lang === "ko"
        ? `- 선지 텍스트는 전부 한국어 명사구("~하는 이유"·"~의 필요성" 류)다 — 한국어가 없는 선지는 반려된다. 각 선지는 공백 제외 6~80자.`
        : `- 선지 텍스트는 전부 영어 명사구 또는 짧은 구(the/how/why 시작 포함)다 — 한국어가 한 글자라도 섞이면 반려된다. 각 선지는 3~25단어이고, 완전한 진술문·마침표 종결로 쓰지 마라(그건 요지 유형의 표면이다).`;
    const lengthRule =
      lang === "ko"
        ? "- 길이 평행: 최장 선지가 최단의 2.2배 이상이면서 12자 이상 길면 반려된다. 정답 선지가 최장이면서 2위보다 1.5배 이상·3자 이상 길면 그것만으로 반려된다 — 선지 길이를 서로 비슷하게 맞춰라."
        : "- 길이 평행: 최장 선지가 최단의 2.2배 이상이면서 4단어 이상 길면 반려된다. 정답 선지가 최장이면서 2위보다 1.5배 이상·3단어 이상 길면 그것만으로 반려된다 — 선지 길이는 서로 ±3단어 이내로 맞춰라.";
    const polarityRules =
      polarity === "NEGATIVE"
        ? [
            `- 극성: 이 문항은 '적절하지 **않은** 것' 고르기다. answers 의 ${answerCount}개만 내용상 명백히 부적절해야 하고(범위 이탈·관점 반전·근거 없음 중 하나로 확정), 나머지 ${wrongCount}개는 전부 이 글의 주제로 깨끗하게 타당해야 한다 — 타당한 선지 하나라도 "덜 포괄적"이라는 시비가 붙으면 복수정답으로 문항이 무효다.`,
            `- 부적절한 선지가 길이·문체·추상도·절대 표현(all·never·only 류)으로 표나면 안 된다 — 부적절함은 오직 내용에서만 드러나야 한다.`,
          ]
        : [
            `- 정답 선지는 중심 화제 + 필자의 관점이 한 구 안에 같이 있어야 한다(화제만 있으면 소재, 진술문이면 요지 — 둘 다 주제가 아니다). 오답 ${wrongCount}개는 각각 관점 반전·도입부 소재 함정·범위 이탈·지문 밖 통념·관점 소거 중 하나로 확정 탈락해야 하며, 문맥상 성립 가능한 오답이 남으면 정답 시비가 난다.`,
            `- 절대 표현(all·never·completely·only 류)을 오답에만 몰지 마라 — 그 단어 하나가 소거 요령이 된다. 정답만 유독 종합적으로 보여도 실패다.`,
          ];
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식): 확정성=제약으로 강등, 난이도 정합=목표로 승격.
      "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
      "- 판정 확정성(정답 유일성 — 복수정답·정답 시비 0)은 **제약**이다 — 어떤 경우에도 양보하지 마라. 기출 형식(선지 압축 구·길이/층위 평행)도 아래 기계 한계 안에서는 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 오답 설계**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 오답(한눈에 지워지는 범위 이탈·지문과 무관한 소재)으로 후퇴하는 것은 실패다 — 확정 탈락이면서 난이도에 맞게 매력적인 오답은 거의 모든 지문에서 만들 수 있다.",
      "- 막히면 기제 다양성부터 양보하고, 그다음 길이 평행은 아래 기계 한계 안에서 완화해도 된다.",
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      `- 선지는 정확히 ${optionCount}개, 라벨은 ${labelRun} 을 하나씩 순서대로 — 중복·누락·범위 밖 라벨은 반려된다.`,
      `- 정답 라벨(answers)은 정확히 ${answerCount}개이고 전부 선지 라벨 집합 안에 있어야 한다. 오답 해설(wrong)은 정답을 제외한 ${wrongCount}개 전부에 정확히 하나씩 — 정답 라벨이 wrong 에 끼거나, 빠진 선지가 있으면 반려된다.`,
      "- 선지 텍스트에 라벨·번호를 다시 쓰지 말고, 정답 표시((정답)·★·✔ 류)를 절대 섞지 마라 — 정답 정보는 answers 에만 있다.",
      langRule,
      "- 선지끼리 같은 표현이면 반려된다. 지문 문장을 그대로 잘라 붙인 선지(연속 표현 축자 일치)도 반려된다 — 주제 선지는 지문의 인용이 아니라 압축이다.",
      // ── 선지 집합의 형상(r1 실측 F 3계통 — 이 셋이 이 유형의 최대 급소다) ──
      lang === "ko"
        ? "- 선지끼리 4어절 이상 연속으로 같은 표현을 돌려쓰면 반려된다 — 한 낱말만 갈아끼운 쌍둥이 선지(‘~의 이점’ ↔ ‘~의 부담’), 낱말 순서만 뒤집은 거울쌍(‘A보다 B’ ↔ ‘B보다 A’), 한 선지가 다른 선지를 통째로 감싸는 포함쌍은 전부 금지다. 그런 쌍이 보이면 학생은 지문을 읽지 않고 ‘정답은 이 쌍 안에 있다’로 5지선다를 2지선다로 줄인다."
        : "- 선지끼리 4단어 이상 연속으로 같은 표현을 쓰면 반려된다 — 한 낱말만 갈아끼운 쌍둥이(the mental economy of X ↔ the mental burden of X), 낱말 집합이 같고 순서만 뒤집은 거울쌍(the primacy of A over B ↔ the primacy of B over A), 한 선지가 다른 선지를 축자로 감싸는 포함쌍(A ⊃ B)은 전부 금지다. 그런 쌍이 보이면 학생은 지문을 읽지 않고 ‘정답은 이 쌍 안에 있다’로 5지선다를 2지선다로 줄인다. 다섯 선지는 서로 다른 어휘·다른 초점으로 각자 서 있어야 한다.",
      ...(lang === "en"
        ? [
            "- 영어 선지는 전부 소문자로 시작한다(고유명사·약어만 예외) — 대문자로 시작하는 표기는 제목(TITLE) 유형의 관행이라 주제 문항에 섞이면 유형이 뒤섞인 시험지가 된다. 관사 축(the 유무)도 한 선지만 튀게 두지 마라: 다섯 중 하나만 형태가 다르면 그 하나가 먼저 지목된다.",
          ]
        : []),
      "- 정답 선지가 유일한 최장이 되거나, 정답만 유독 두 요소를 and·쉼표로 묶어 ‘가장 종합적으로’ 보이면 실패다 — 내용을 읽지 않고 ‘제일 많이 담은 것’을 고르는 요령이 성립한다. 정답의 길이·구문은 오답 무리의 중간값에 두어라.",
      lengthRule,
      "- 해설(explanation)은 한국어 합쇼체(-습니다) 딱 2문장 — 10자 미만이면 반려된다. 오답 해설도 각각 합쇼체의 완결된 한 문장(12자 이상)이어야 한다.",
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 1~2문장·오답 딱 1문장, 유혹·심리 서사 금지 — 짧을수록 좋다.",
      "- 해설·오답 해설에서 선지를 번호(③·3번·선지 2)로 지칭하지 마라 — 선지는 저장 시 재배열된다. 지칭이 필요하면 그 선지의 문구를 인용하라. 해설에 지문에 없는 내용을 지어내지 마라.",
      "- 오답 해설의 **구조 서술은 지문을 다시 확인한 사실만** 써라. ‘도입부에 갇혀’·‘논지 전환 이후를 놓쳐’·‘글 후반의 반전’ 같은 상투구는 지문에 실제로 그 위치·전환이 있을 때만 쓴다 — 주장이 첫 문장 주절에 이미 나온 글에 ‘전환 이후를 놓쳤다’고 쓰면 함정 작동 기제가 지문과 모순되는 허위 해설이 된다. 위치를 특정할 수 없으면 위치를 말하지 말고 그 선지가 무엇을 빠뜨렸는지만 써라.",
      "- 오답 기제 라벨은 문항 안에서 서로 겹치지 않게 배분하고, 라벨과 설명이 반대가 되지 않게 하라(‘범위 이탈’이라 적고 ‘좁혀서’라고 설명하면 분류가 뒤집힌 것이다 — 범위를 넓혔으면 범위 이탈, 좁혔으면 그 사실을 그대로 쓴다). 지문이 명시적으로 부정한 명제를 담은 선지는 도입부 소재 함정이 아니라 관점 반전이다.",
      ...polarityRules,
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
      // 코어스 ①: 정답 라벨 중복 제거(파서 parseTopicAnswers 와 동일한 관용) —
      // 중복을 남기면 게이트 #7이 "오답 해설 누락"이라는 파생 문구로 오지목한다.
      const answers: string[] = [];
      for (const a of raw.answers) if (!answers.includes(a)) answers.push(a);
      // 코어스 ③: 영어 선지 첫 글자 소문자화(고유명사·약어 보호) — 표기 축 통일.
      const caseCorrections: string[] = [];
      const options = coerceOptionCase(
        raw.options,
        ctx.passage,
        optionLanguageOf(ctx),
        caseCorrections,
      );
      let q: MdTopicQuestion = {
        kind: "topic",
        options,
        answers,
        // 파서 산출물 동형 — 단일 정답 경로 편의 접근자까지 재현한다.
        answer: answers[0] ?? "",
        explanation: raw.explanation,
        // 코어스 ②: 오답 해설 라벨 오름차순 정렬(표시 결정론 — title·어법 동일).
        wrong: [...raw.wrong].sort(
          (a, b) => topicLabelIndex(a.label) - topicLabelIndex(b.label),
        ),
      };
      const snapped = autoSnapTopicOptions(q);
      q = snapped.question;
      return {
        question: q,
        gateIssues: [
          ...gateMdTopic(q, ctx.passage, {
            optionCount: optionCountOf(ctx),
            answerCount: answerCountOf(ctx),
            optionLanguage: optionLanguageOf(ctx),
          }),
          // 공유 게이트가 보지 않는 축 — 선지 쌍의 축자 공유·거울쌍(r1 F 3계통).
          ...optionShapeIssues(q.options),
        ],
        corrections: [...caseCorrections, ...snapped.corrections],
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
        : "다음 글의 주제로 가장 적절한 것은?";
    const options = Array.isArray(aiQuestion.options)
      ? (aiQuestion.options as Array<Record<string, unknown>>)
          .map((o) => `${circledOf(String(o.label ?? ""))} ${String(o.text ?? "")}`)
          .join("\n")
      : "";
    return `${direction}\n\n${passage}\n\n${options}`;
  },
};
