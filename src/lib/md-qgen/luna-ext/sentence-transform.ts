// ============================================================================
// 문장 전환(SENTENCE_TRANSFORM) luna 레인 확장 — 전 유형 이식 캠페인.
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 서술형(선지 없음) 계열이다 — 정답의 유일 진실원은 modelAnswer 하나이고,
// 레인 어댑터가 correctAnswer 로 복제한다(adapter-sentence-transform.ts).
// acceptedAnswers 류 허용 답안 집합 필드는 **계약에 없다**(FREE_WRITING·
// MANUAL_ONLY 채점 — 어댑터 헤더의 금지 조항이 정본). 표기 변형 흡수는
// 채점기준의 '부분점수' 줄이 담당하므로 검산이 그 줄의 구체성을 강제한다.
//
// 이 유형의 최강 불변식은 **원문장이 지문 축자인가**다(축자가 아니면 시험지
// 밑줄이 소실된다 — parser-sentence-transform.ts 헤더). 스키마 필드 순서 =
// 스트리밍 도착 순서이므로 본문성 큰 필드(originalSentence)를 앞에 둔다.
// 파싱 산출물은 MdSentenceTransformQuestion 동형으로 만들어 레인의 스냅·
// 게이트·어댑터를 전부 재사용한다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  SENTENCE_TRANSFORM_MD_CONDITION_RANGE,
  SENTENCE_TRANSFORM_MD_SCORING_MAX,
  SENTENCE_TRANSFORM_MD_SCORING_MIN,
} from "../prompts-sentence-transform";
import {
  autoSnapSentenceTransform,
  type MdSentenceTransformQuestion,
} from "../parser-sentence-transform";
import { gateMdSentenceTransform } from "../gate-sentence-transform";
import { SENTENCE_TRANSFORM_MD_DIRECTION } from "../adapter-sentence-transform";

// 코어스: 배열 원소 머리의 목록 장식(불릿·번호·원문자) 제거 — md 출력 습관이
// JSON 값 안으로 새는 드리프트. parser-sentence-transform.ts 의 stripMd 가 md
// 경로에서 걷어내는 것과 같은 폭의 머리 장식만 좁게 걷는다(기계 확정 가능).
const LIST_DECOR_RE =
  /^(?:[-*••·●○▪◦‣⁃・]|\d{1,2}[.)]|[①-⑳])\s+/;

// 코어스: 조건 줄 말미 마침표 통일(제거). r1 감수 실측 — 한 세트 안에서 마침표를
// 붙인 문항 11개 / 안 붙인 문항 13개로 갈려 조건 박스 조판이 들쭉날쭉했다.
// 기계 확정 가능한 표기 정규화이므로 반려 대신 교정한다(SPEC §1-8).
// 앞 글자가 한글이거나 닫는 따옴표·괄호일 때만 걷는다 — 말줄임표(…·...)와
// 약어 마침표('U.S.')는 손대지 않는다(놓치는 방향의 오차만 남긴다).
const CONDITION_TAIL_PERIOD_RE = /(?<=[가-힣'’"”)\]])\.$/;

function conditionRangeOf(ctx: MdLaneContext): { min: number; max: number } {
  return SENTENCE_TRANSFORM_MD_CONDITION_RANGE[ctx.difficulty];
}

export const SENTENCE_TRANSFORM_LUNA_EXT: LunaLaneExt = {
  subType: "SENTENCE_TRANSFORM",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const range = conditionRangeOf(ctx);
    return {
      name: "sentence_transform_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "originalSentence",
          "conditions",
          "modelAnswer",
          "scoringCriteria",
          "explanation",
        ],
        properties: {
          originalSentence: {
            type: "string",
            description:
              "지문에 실제로 있는 문장 하나를 한 글자도 바꾸지 말고 그대로(축자) 복사 — 문장 처음부터 종결부호까지 통째로, 정확히 한 문장. 6~60단어 영어 문장(권장 12~35단어, 콜론·세미콜론으로 독립절이 이어진 문장은 피한다)",
          },
          conditions: {
            type: "array",
            minItems: range.min,
            maxItems: range.max,
            items: {
              type: "string",
              description:
                "전환 조건 — 한국어 한 줄, 불릿·번호 장식 없이 조건 문장만, 판정 축은 한 줄에 하나. 전환의 방향·기제를 지시하고 목표 영어 문자열은 최소한만 인용한다(작은따옴표). 마지막 한 줄은 분량 잠금('총 N단어로 쓸 것')이어야 한다",
            },
            description: `전환 조건 ${range.min}~${range.max}개 — 채점자가 O/X 를 그을 수 있는 기계 판정형만. 조건에 인용된 영어 어구의 단어 합은 모범답안 단어 수의 1/3 미만이어야 한다(조건을 이어 붙이면 정답이 완성되는 '조립 키트' 금지)`,
          },
          modelAnswer: {
            type: "string",
            description:
              "조건을 전부 적용한 영어 완성 문장 정확히 한 문장 — 원문장과 반드시 다르고, 대안 답안·부연 금지",
          },
          scoringCriteria: {
            type: "array",
            minItems: SENTENCE_TRANSFORM_MD_SCORING_MIN,
            maxItems: SENTENCE_TRANSFORM_MD_SCORING_MAX,
            items: {
              type: "string",
              description:
                "등급형 채점 기준 한 줄(예: '만점: …' '부분점수: …' '0점: …') — 한국어",
            },
            description: `등급형 채점 기준 ${SENTENCE_TRANSFORM_MD_SCORING_MIN}~${SENTENCE_TRANSFORM_MD_SCORING_MAX}개 — 만점 형태와 0점 형태를 최소한 구분`,
          },
          explanation: {
            type: "string",
            description:
              "정답 해설(한국어 합쇼체, 딱 2문장) — ①어떤 전환을 어느 자리에 적용했는지 ②극성·hedge·의미역이 어떻게 보존됐는지. 구조 명칭은 정확히(전치사+명사구를 후치 수식하는 분사구는 '분사구문'이 아니다), 보존 주장은 실제로 성립하는 것만",
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const range = conditionRangeOf(ctx);
    const killer = ctx.difficulty === "KILLER";
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수)",
      "- 확정성(원문장 지문 축자·지문 내 유일·조건 기계 판정 가능·모범답안 하나로 수렴)은 **제약**이다: 이를 어기는 설계는 어떤 경우에도 내지 마라. 기출 형식(조건은 한국어 한 줄·필수/금지 어휘 작은따옴표·등급형 채점기준·해설 합쇼체)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 원문장·전환 축**이 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 선택(짧고 평이한 원문장·형식적 전환)으로 후퇴하는 것은 실패다 — 확정적이면서 난이도에 맞는 원문장·전환은 거의 모든 지문에 있다.",
      `- 전부를 동시에 만족할 수 없으면 **전환 축 다양성부터 양보하라** — 더 흔한 축(태 전환·절 압축)과 더 평이한 문장을 골라도 반려되지 않는다. 그래도 막히면 조건 개수를 하한(${range.min}개)으로 줄여라.`,
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      "- originalSentence 는 아래 지문에 실제로 있는 문장 하나를 **한 글자도 바꾸지 않고** 그대로 복사한다(곱슬따옴표·대시·쉼표까지 지문 표기 그대로). 요약·의역·짜깁기·플레이스홀더 삽입은 즉시 반려된다. 출력 직전에 지문에서 그 문장을 찾아 문자 단위로 대조하라.",
      "- 그 문장은 지문에서 정확히 1회만 등장해야 한다 — 두 번 이상 나오는 문장은 밑줄 자리가 확정되지 않아 반려된다.",
      "- 문장 처음부터 종결부호(. ! ?)까지 통째로다 — 절만 잘라오면 반려, 문장 두 개를 이어붙여도 반려, 문단(빈 줄)을 넘어 걸쳐도 반려된다.",
      "- originalSentence 는 6단어 이상 60단어 이하의 영어 문장이다(한국어 혼입 반려). 종속절·분사구·수동태·조동사·비교급·인과 접속사 같은 전환 손잡이가 최소 하나 있는 문장을 골라라.",
      `- 조건은 정확히 ${range.min}~${range.max}개다.${killer ? " KILLER 는 서로 다른 전환 축 2개 이상이어야 한다(같은 축을 둘로 쪼갠 것은 2개가 아니다)." : ""} 각 조건은 한국어를 포함한 한 줄(3~120자)이고, 앞 조건과 중복되면 반려된다.`,
      "- 필수·금지 어휘를 지정할 때는 반드시 작은따옴표로 감싸라('Intercepting' 처럼). 감싼 토큰은 기계가 모범답안과 대조한다 — \"…'X'를 사용할 것/…'X'로 시작할 것\"이면 X 가 모범답안에 실제로 있어야 하고, \"…'X'를 쓰지 말 것\"이면 X 가 모범답안에 없어야 한다. 어느 쪽이든 어기면 반려된다.",
      "- **분량 잠금은 필수다.** 조건의 마지막 한 줄은 반드시 \"총 N단어로 쓸 것\"으로 쓴다(N 은 모범답안의 실제 단어 수). 이 잠금이 없으면 조건을 모두 지킨 제2·제3의 답안이 생겨 수동 채점이 붕괴한다. 예외는 단 하나 — \"전환한 부분을 제외한 나머지 어휘와 어순은 원문과 동일하게 유지할 것\" 을 조건으로 넣은 경우이며, 이때도 다른 잠금 없이 조건을 방향 지시만으로 끝내지 마라.",
      "- \"총 N단어로 쓸 것\" 을 썼다면 모범답안의 단어를 실제로 하나씩 세어 N 과 정확히 일치시켜라(하이픈 결합어·축약형은 1단어). 문장 일부에 거는 단어 수 조건('전치사구는 4단어로')에는 '총'을 붙이지 마라.",
      "- **조건은 정답 조립 키트가 되면 안 된다.** 조건이 작은따옴표로 제시한 영어 어구의 단어 수를 전부 더해 모범답안 단어 수로 나눠 보라 — 1/3(33%)을 넘으면 그 문항은 폐기하고 조건을 다시 설계하라. 조건 문자열을 순서대로 이어 붙였을 때 모범답안이 거의 그대로 완성되면(학생이 베껴 적기만 하면 되면) 전환 능력을 전혀 측정하지 못하는 불량 문항이다. 조건은 **전환의 방향·기제**(어느 구조를 어느 구조로, 어느 자리로)를 지시하고, 목표 문자열 인용은 문두 어구 하나 정도로 최소화하라. 분량 잠금이 어려운 유일성을 대신 담당한다.",
      "- **조건은 원문장을 정확히 지목해야 한다.** 조건이 원문장의 어구를 인용할 때는 그 문자열이 원문장에 관사까지 문자 그대로 있어야 한다('the perceived object' 라고 썼는데 원문은 'a perceived object' 면 반려 계통이다). '두 번째 X' 같은 서수 지목은 원문장에서 실제로 세어 확인하고, 애매하면 서수 대신 주변 어구로 지목하라('between 뒤의 X').",
      "- **조건-모범답안 역검(필수).** 조건 전부를 문면 그대로 순서대로 적용해 답을 다시 만들어 보고 그것이 modelAnswer 와 글자 단위로 같은지 확인하라. 두 조건이 같은 어구를 두고 다른 처분을 지시하면(한쪽은 주어로 올리라, 다른 쪽은 대명사로 바꾸라) 학생은 어떤 답도 만들 수 없다 — 반드시 폐기하고 다시 써라.",
      "- 조건 한 줄에는 판정 축 하나만 담아라 — '금지 어휘 + 총 N단어' 처럼 채점자가 O/X 를 두 번 그어야 하는 줄은 두 줄로 쪼갠다. 조건 개수 상한을 넘길 것 같으면 전환 축을 줄여서 상한을 지켜라(분량 잠금 줄은 절대 빼지 마라).",
      "- 원문장은 12~35단어에서 고르는 것이 표준이다. 콜론·세미콜론으로 독립절이 이어진 문장, 40단어를 넘는 문장은 피하라 — 전환 구간 밖 어구를 학생이 통째로 옮겨 적는 전사 노동만 늘고 밑줄이 두 절을 덮어 표적이 흐려진다.",
      "- modelAnswer 는 영어 완성 문장 **정확히 한 문장**이다 — 5단어 이상이고 종결부호로 끝난다. 한국어 혼입, 대안 답안(\"Alternatively …\"), 부연 설명이 붙으면 문장 2개로 판정되어 반려된다(이 유형은 수동 채점이라 강사가 그 오염을 그대로 읽는다).",
      "- modelAnswer 는 originalSentence 와 (구두점·대소문자를 걷어내고 비교해도) 반드시 달라야 한다 — 같으면 '전환 미이행'으로 반려된다.",
      "- modelAnswer 가 지문 어딘가에 통째로 들어 있으면 반려된다 — 지문이 학생에게 함께 보이므로 베껴 쓰기 과제가 된다.",
      "- 의미 보존 3대 검산: ①극성(긍정/부정이 뒤집히지 않았는가) ②hedge(seem·appear·may·usually 류 완화 표현이 사라져 단정문이 되지 않았는가) ③의미역(누가 무엇을 하는가가 그대로인가)을 한 줄씩 답해보라 — 하나라도 어긋나면 전환 설계를 폐기하고 다시 만들어라.",
      `- scoringCriteria 는 ${SENTENCE_TRANSFORM_MD_SCORING_MIN}~${SENTENCE_TRANSFORM_MD_SCORING_MAX}개의 등급형(만점/부분점수/0점)이다. 부분점수 줄에는 인정하는 표기 변형(축약형·어순 차이 같은 동치 변형)을 구체적으로 적어라 — 이 줄이 이 유형의 허용 답안 폭을 정의한다. 항목이 중복되면 반려된다.`,
      "- explanation 은 한국어 합쇼체(-습니다) 딱 2문장이다 — ①어떤 전환을 원문장의 어느 자리에 적용했는지 ②원문의 명제 의미(극성·hedge·의미역)가 어떻게 보존됐는지. 20자 미만이거나 문장 중간에서 끊기면 반려된다.",
      "- explanation 이 따옴표로 인용하는 영어 표현(12자 이상)은 원문장·조건·모범답안·지문에 실재하는 것만 쓴다 — 없는 표현을 지어 인용하면(환각 인용) 반려된다. 구조 서술(\"종속절의 주어를 끌어올렸다\" 류)은 실제 문장을 재확인한 사실만 쓴다.",
      "- explanation 의 **보존 주장은 실제로 성립하는 것만** 쓴다. '완벽하게 보존/손상 없이 그대로'는 상투구다 — 양보 표지가 사라졌거나(while → 무표지 분사구문), 행위자가 삭제됐거나(by구 없는 수동), 양상·개연성이 바뀌었으면(if → Should, 직설 → 가정법) 그 변화를 한 마디로 인정하고 나머지가 보존됐다고 써라. 사실 확인 없는 보존 단언은 허위 해설이다.",
      "- explanation 의 구문 명칭을 정확히 쓴다 — 전치사(Like/With) 뒤 명사구를 뒤에서 꾸미는 분사구는 '분사구문'이 아니라 후치 수식 분사구다. 'with + 명사 + 분사'는 부대상황 구문, 관계대명사+be 생략은 축약 관계절이다. 조건 줄에서 쓴 명칭과 해설의 명칭을 같은 자리에 대해 같게 맞춰라.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        originalSentence?: unknown;
        conditions?: unknown;
        modelAnswer?: unknown;
        scoringCriteria?: unknown;
        explanation?: unknown;
      };
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error("최상위가 JSON 객체가 아님");
      }
      const corrections: string[] = [];
      let decorStripped = false;
      let tailPeriodStripped = false;
      const toList = (v: unknown, unifyTailPeriod = false): string[] =>
        (Array.isArray(v) ? v : [])
          .map((item) => {
            const s = String(item ?? "").trim();
            let stripped = s.replace(LIST_DECOR_RE, "").trim();
            if (stripped !== s) decorStripped = true;
            if (unifyTailPeriod) {
              const unified = stripped.replace(CONDITION_TAIL_PERIOD_RE, "").trim();
              if (unified !== stripped) tailPeriodStripped = true;
              stripped = unified;
            }
            return stripped;
          })
          .filter(Boolean);
      const q: MdSentenceTransformQuestion = {
        kind: "sentenceTransform",
        originalSentence: String(raw.originalSentence ?? "").trim(),
        conditions: toList(raw.conditions, true),
        modelAnswer: String(raw.modelAnswer ?? "").trim(),
        scoringCriteria: toList(raw.scoringCriteria),
        explanation: String(raw.explanation ?? "").trim(),
      };
      if (decorStripped) {
        corrections.push("조건·채점기준 머리 목록 장식 제거(md 불릿 드리프트)");
      }
      if (tailPeriodStripped) {
        corrections.push("조건 줄 말미 마침표 제거(조건 박스 종결부호 통일)");
      }
      // 레인과 동일한 0원 스냅 — 원문장을 지문 축자 슬라이스로 보정(문말 구두점
      // 복원 포함). 보정 불가(다중 등장·문단 경계)는 손대지 않고 게이트가 반려.
      const snapped = autoSnapSentenceTransform(q, ctx.passage);
      corrections.push(...snapped.corrections);
      return {
        question: snapped.question,
        // 레인 parseAndGate 와 동일 옵션(lane-sentence-transform.ts:75) —
        // requireScoringCriteria 는 기본 true(레인은 항상 full 모드).
        gateIssues: gateMdSentenceTransform(snapped.question, ctx.passage, {
          difficulty: ctx.difficulty,
        }),
        corrections,
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
    { path: "originalSentence", prefix: "원문장: ", suffix: "\n\n조건:" },
    { path: "conditions[]", prefix: "\n- " },
    { path: "modelAnswer", prefix: "\n\n모범답안: ", suffix: "\n\n채점기준:" },
    { path: "scoringCriteria[]", prefix: "\n- " },
    { path: "explanation", prefix: "\n\n해설: ", suffix: "\n" },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : SENTENCE_TRANSFORM_MD_DIRECTION;
    const originalSentence =
      typeof aiQuestion.originalSentence === "string" ? aiQuestion.originalSentence : "";
    const conditions = Array.isArray(aiQuestion.conditions)
      ? (aiQuestion.conditions as unknown[]).map((c) => String(c ?? "")).filter(Boolean)
      : [];
    // 실제 시험지는 지문 안에 원문장을 밑줄로 표시한다(source-passage-markers).
    // 게이트가 축자·유일성을 보장하므로 exact 치환 1회로 재현한다. 만에 하나
    // 못 찾으면(평가 표면이 죽으면 안 된다) [원문] 블록으로 폴백한다.
    const surfacePassage =
      originalSentence && passage.includes(originalSentence)
        ? passage.replace(originalSentence, `<u>${originalSentence}</u>`)
        : originalSentence
          ? `${passage}\n\n[원문] ${originalSentence}`
          : passage;
    const conditionBlock = conditions.length
      ? `<조건>\n${conditions.map((c) => `- ${c}`).join("\n")}`
      : "";
    return `${direction}\n\n${surfacePassage}\n\n${conditionBlock}\n\n답안: ______________________________________`;
  },
};
