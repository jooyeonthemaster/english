// ============================================================================
// 배열 영작(WORD_ORDER) luna 레인 확장 — 전 유형 이식 캠페인.
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 서술형(선지 없음) 계열. 파싱 산출물은 MdWordOrderQuestion 동형으로 만들어
// 레인의 스냅(autoSnapWordOrderChips)·게이트(gateMdWordOrder)·어댑터를 전부
// 재사용한다.
//
// 스키마 설계 — md 계약 §1-B 철칙1("정답은 한 곳에서만 받고 칩은 파생")의 JSON
// 등가형:
//   - 정답의 유일 진실원은 answerChunks(어순 그대로의 청크 배열) 하나다.
//     modelAnswer 는 joinWordOrderChunks 로 파생하고, chips 는
//     answerChunks ∪ distractors 로 합성한다. 그래서 "칩으로 모범답안을 조립할
//     수 없음"(게이트 #7 회계)이 검사가 아니라 **항등식**이 된다 — md 경로에서
//     최대 반려 계통이었던 축이 luna 경로에서는 구조적으로 소멸한다.
//   - md 의 ` / ` 마커 문자열 대신 JSON 배열로 받는 이유: md 규격은 luna
//     크립토나이트(O215)이고, 마커 공백 규약(`a / b` 만 구분자) 오식이 청크
//     전체를 한 덩어리로 붕괴시키는 실패 모드가 배열에는 원리상 없다. 칩 안의
//     슬래시(and/or·km/h)도 배열 원소 안에서 자연 보존된다(#7b 사각 봉합).
//   - 청크 개수·미끼 최소 개수는 ctx(난이도)에서 계산하는 동적 스키마다 —
//     프롬프트 목표치(WORD_ORDER_MD_ANSWER_CHUNK_TARGET)를 스키마가 강제하고,
//     게이트 허용 범위(3~9)는 그보다 넓어 스키마 준수 출력이 개수 축으로
//     반려되는 일이 없다.
//
// 패밀리 특칙(writing·SPEC §패밀리): acceptedAnswers 칸이 스키마에 있으므로
// "표기 변형 전부 나열" 검산을 넣는다 — 단 이 유형의 허용답 계약은 "정답 청크만
// 으로 과부족 없이 조립되는 등가 어순"뿐이라(축약형·관사·치환은 칩으로 만들 수
// 없다 — gate #10·snap 4 가 멀티셋으로 결정론 차단), 검산은 두 방향을 모두
// 강제한다: ①성립하는 등가 어순은 빠짐없이 나열(빠지면 그 어순으로 쓴 정답
// 학생이 오답 처리) ②토큰을 바꾸는 표기 변형은 금지(넣어도 자동 제외).
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  WORD_ORDER_MD_ANSWER_CHUNK_TARGET,
  WORD_ORDER_MD_ANSWER_TOKEN_MIN,
  wordOrderMdDistractorMin,
} from "../prompts-word-order";
import {
  joinWordOrderChunks,
  splitWordOrderChips,
  stripWordOrderLineWrappers,
  type MdWordOrderQuestion,
} from "../parser-word-order";
import { autoSnapWordOrderChips, gateMdWordOrder } from "../gate-word-order";
import {
  WORD_ORDER_MD_DIRECTION,
  WORD_ORDER_MD_DIRECTION_NO_DISTRACTOR,
} from "../adapter-word-order";
import { cleanMdValue } from "../decoration";

/**
 * 미끼 상한 — 스키마 전용(게이트에는 미끼 상한이 없다). 청크 상한(KILLER 8)과
 * 합쳐 칩 총수가 게이트 상한(WORD_ORDER_MD_CHIP_MAX=12)을 구조적으로 넘지
 * 못하게 하는 값이다: 8 + 4 = 12.
 */
const WORD_ORDER_LUNA_DISTRACTOR_MAX = 4;

/** 허용답 상한 — 배열 과제의 등가 어순은 실무상 소수다(과다 나열 = 시비 소지). */
const WORD_ORDER_LUNA_ACCEPTED_MAX = 4;

/**
 * 모델이 "없음"으로 채워 오는 빈 값 마커 — 파서의 EMPTY_MARKERS 는 모듈
 * 비공개라 여기 최소 부분집합만 둔다(hint·acceptedAnswers 전용 코어스).
 */
const LUNA_EMPTY_MARKERS = new Set([
  "",
  "-",
  "—",
  "–",
  "없음",
  "(없음)",
  "n/a",
  "na",
  "none",
  "null",
]);

function isLunaEmptyMarker(value: string): boolean {
  return LUNA_EMPTY_MARKERS.has(value.trim().toLowerCase());
}

function chunkRangeOf(ctx: MdLaneContext): { min: number; max: number } {
  return WORD_ORDER_MD_ANSWER_CHUNK_TARGET[ctx.difficulty];
}

/** 칩 비교용 토큰화 — 대소문자·구두점(쉼표/마침표/따옴표)을 지운 낱말 배열. */
function chipTokens(chip: string): string[] {
  return chip
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** a 가 b 안에 **연속 낱말열**로 통째로 들어 있는가. */
function containsTokenRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let hit = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * 유일성 붕괴 계통 검사 — **정답 청크를 통째로 삼키는 미끼**를 반려한다.
 *
 * 실측 근거(WORD_ORDER 판정 라운드1, luna F 2/3 이 이 형상): 미끼가 정답 청크를
 * 통째로 품으면(`a willingness` ⊂ `and a willingness`) 그 미끼를 쓰는 순간 정답
 * 청크가 둘 이상 동시에 빠지면서 **다른 완결 문장을 조립할 경로**가 열린다.
 * 미사용 칩 개수가 발문에 고지되지 않으므로 학생은 개수로도 배제할 수 없어
 * 복수정답 시비가 된다. 기계로 확정 가능한 위반이지만 대체 미끼를 자동 생성할
 * 수는 없으므로(유일 확정 불가) SPEC §1-8 에 따라 코어스가 아니라 게이트 이슈다.
 * 인쇄면에서 같은 어구가 두 번 찍히는 오독(형식 감수 지적)도 함께 막는다.
 */
function distractorSwallowIssues(
  answerChunks: string[],
  distractors: string[],
): string[] {
  const issues: string[] = [];
  const chunkTokens = answerChunks.map((c) => ({ raw: c, tokens: chipTokens(c) }));
  for (const distractor of distractors) {
    const dTokens = chipTokens(distractor);
    if (dTokens.length === 0) continue;
    for (const chunk of chunkTokens) {
      if (chunk.tokens.length === 0) continue;
      if (dTokens.length <= chunk.tokens.length) continue; // 축자 동일은 게이트가 별도로 잡는다
      if (!containsTokenRun(dTokens, chunk.tokens)) continue;
      issues.push(
        `미끼 '${distractor}' 가 정답 청크 '${chunk.raw}' 를 통째로 포함합니다 — 이 미끼를 쓰면 정답 청크가 둘 이상 한꺼번에 빠져 다른 완결 문장을 조립할 경로가 열립니다(복수정답 위험). 정답 청크 하나와 같은 자리를 1:1로 다투는 미끼로 바꾸십시오`,
      );
      break;
    }
  }
  return issues;
}

export const WORD_ORDER_LUNA_EXT: LunaLaneExt = {
  subType: "WORD_ORDER",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const chunkRange = chunkRangeOf(ctx);
    const distractorMin = wordOrderMdDistractorMin(ctx.difficulty);
    const killer = ctx.difficulty === "KILLER";
    return {
      name: "word_order_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        // 필드 순서 = 스트리밍 도착 순서 — 본문성 필드(정답 청크)를 앞에.
        required: [
          "answerChunks",
          "distractors",
          "hint",
          "acceptedAnswers",
          "explanation",
        ],
        properties: {
          answerChunks: {
            type: "array",
            minItems: chunkRange.min,
            maxItems: chunkRange.max,
            items: {
              type: "string",
              description:
                "정답 청크 하나 — 의미 단위의 맨 텍스트(라벨·따옴표·굵게 금지). 쉼표·마침표는 조각 끝에 붙이고, 구두점만 남은 조각은 만들지 마라",
            },
            description: `정답 문장을 어순 그대로 ${chunkRange.min}~${chunkRange.max}개 의미 단위로 끊은 조각들 — 공백 하나로 이어 붙이면 곧 완성 문장(주어+정동사, 종결부호로 끝)이 된다. 미끼는 여기 넣지 않는다`,
          },
          distractors: {
            type: "array",
            minItems: distractorMin,
            maxItems: WORD_ORDER_LUNA_DISTRACTOR_MAX,
            items: {
              type: "string",
              description:
                "미끼 칩 하나 — 정답에 쓰이지 않는 **새** 칩. 정답 청크를 다시 적는 것이 아니며 정답 청크와 글자 하나까지 같아선 안 된다",
            },
            description: `정답에 쓰이지 않는 미끼 칩 ${distractorMin}~${WORD_ORDER_LUNA_DISTRACTOR_MAX}개 — 시스템이 자동으로 정답 청크와 섞어 학생에게 제시한다`,
          },
          hint: {
            type: "string",
            description: killer
              ? "한국어 한 줄 문맥 힌트 — KILLER 는 빈 문자열 권장. 쓴다면 문장의 논지 역할만 가리키고, 정답 직역·정답 영어 표현 3단어 이상 연속 인용 금지"
              : "한국어 한 줄 문맥 힌트 — 문장이 글에서 하는 역할만 가리킨다. 정답 직역·정답 영어 표현 3단어 이상 연속 인용 금지. 쓰지 않으면 빈 문자열",
          },
          acceptedAnswers: {
            type: "array",
            minItems: 0,
            maxItems: WORD_ORDER_LUNA_ACCEPTED_MAX,
            items: {
              type: "string",
              description:
                "정답 청크만으로 과부족 없이 조립되는 등가 어순의 완성 문장 하나",
            },
            description:
              "허용 답안 집합 — 정답 청크의 순수 재배열로 성립하는 등가 어순 문장 **전부**. 축약형·관사 추가/삭제·단어 치환이 필요한 문장은 칩으로 만들 수 없으므로 금지. 확신 없으면 빈 배열(비워도 채점은 모범답안으로 정상 작동)",
          },
          explanation: {
            type: "string",
            description:
              "정답 해설 딱 2문장(한국어 합쇼체) — ①어떤 구문 전환을 적용했는지 ②그 어순이 왜 유일하게 성립하는지",
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const chunkRange = chunkRangeOf(ctx);
    const distractorMin = wordOrderMdDistractorMin(ctx.difficulty);
    const killer = ctx.difficulty === "KILLER";
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수)",
      "- 확정성(청크 회계 항등·모범답안 유일 성립·허용답 순수 재배열)은 **제약**이다: 이를 어기는 청크·미끼 구성은 어떤 경우에도 내지 마라. 기출 형식(지문 변형 후 배열·의미 단위 청크·미끼 평행)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 표적 문장·변형·미끼**가 목표다. '복수정답 시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 선택(짧고 단순한 문장·형식적 변형·즉시 소거되는 미끼)으로 후퇴하는 것은 실패다 — 확정적이면서 난이도에 맞는 구성은 거의 모든 지문에 있다.",
      `- 전부를 동시에 만족할 수 없으면 **미끼 축 다양성부터 양보하라** — 변형은 흔한 축(태·시제 전환) 하나로 줄이고, 미끼는 하한 ${distractorMin}개만 두고, 힌트는 빈 문자열로 빼도 된다. 허용답도 확신 없으면 빈 배열로 — 비워도 채점은 모범답안으로 정상 작동한다.`,
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      `- answerChunks 를 공백 하나로 이어 읽어 보라 — 주어와 정동사를 갖춘 자연스러운 영어 완성 문장이어야 하고, ${WORD_ORDER_MD_ANSWER_TOKEN_MIN}단어 미만이면 배열 과제 불성립으로 반려된다. 마지막 청크는 종결부호(.)로 끝내라.`,
      "- 청크·미끼·모범답안 어디에도 한글이 섞이면 반려된다 — 칩은 전부 영어다.",
      `- 청크는 정확히 ${chunkRange.min}~${chunkRange.max}개(스키마 강제), 각 청크는 의미 단위다. 구두점만 남은 청크(\`,\` \`.\`)는 반려된다 — 쉼표·마침표는 앞 청크 끝에 붙여라.`,
      "- 한 청크가 정답 전체 단어 수의 절반을 넘으면 반려된다 — 청크를 고르게 쪼개라.",
      "- 청크·미끼를 따옴표·굵게(**)·백틱·표 기호로 감싸지 마라 — 가장자리 장식 한 글자가 채점 문자열에 실려 정답을 정확히 쓴 학생 전원이 오답 처리된다.",
      `- 미끼는 ${distractorMin}개 이상(스키마 강제)이고 **반드시 distractors 배열에만** 쓴다. answerChunks 에 정답에 안 쓰는 조각을 섞으면 조립 회계가 깨져 반려된다 — 미끼는 시스템이 자동으로 칩에 섞는다.`,
      "- 미끼가 정답 청크와 글자 하나까지 똑같으면 반려된다(같은 칩이 두 번 제시돼 함정이 아니라 잡음). 정답 칩의 활용형(-ing/-ed/-s)·행위자 뒤바꿈·연결사 후보·근접 의미어로 만들되, 서로 다른 축 둘 이상으로 분산하라.",
      // ── 유일성 붕괴 계통(실측 반려 1계통 — 이 유형 F 의 최대 원인) ──────────
      "- **대안 배열 검산 — 이 유형에서 가장 중요한 검산이다**: 출력 직전, 미끼를 실제로 끼워 다른 문장을 조립해 보라. ①미끼 하나만 바꿔 끼운 배열 ②미끼를 최대한 많이 쓴 배열 — 둘 다 소리 내어 읽어라. 그중 하나라도 (a)주어+정동사를 갖춘 완결 문장이 되고 (b)지문 논지와 어긋나지 않으면 **정답이 둘**이다. 그 미끼를 버리고 다시 만들어라. 발문은 미사용 칩 개수를 알려 주지 않으므로 학생은 '칩을 몇 개 남기는가'로 후보를 좁힐 수 없다 — 개수 차이는 배제 근거가 되지 못한다.",
      "- **미끼 슬롯 배타성**: 미끼 하나를 쓰면 정답 청크가 **정확히 하나** 빠져야 한다. 정답 청크를 통째로 품은 미끼(정답 청크 `a willingness` ↔ 미끼 `and a willingness`, 정답 청크 `the body sweats` ↔ 미끼 `When the body sweats`)는 정답 청크 둘 이상을 한꺼번에 삼켜 **다른 조립 경로를 여는 재료**이므로 기계 검사에서 자동 반려된다. 미끼는 정답 청크 하나와 같은 자리를 1:1로 다투는 대체재로만 만들어라.",
      "- **미끼 재료 금지**: 미끼로 새 주어·새 정동사·새 종속접속사(If/When/Because/Although…)를 문장에 들여오지 마라. 정답 골격과 독립한 절을 세울 재료가 칩 은행에 있으면 두 번째 완결 문장이 선다(실측 사고: 미끼 `If wealthy interests dislike` + `their programmers will invent` 만으로 문법·논지 모두 성립하는 대안 문장이 조립됨). 미끼는 **형태축**(활용형·태·수 일치)과 **역할축**(전치사·연결사 1:1 대치)만 건드린다.",
      "- **배제 근거 자문**: 미끼마다 '학생이 이걸 왜 못 쓰는가'를 한 줄로 적어 보라. 근거가 문법 위반이면 좋은 미끼다. 근거가 '지문 논지와 안 맞음'뿐인 미끼만 있으면 채점 분쟁이 나니 **문법축 미끼를 최소 하나** 남겨라. 근거를 한 줄로 못 적는 미끼는 사실상 제2의 정답이다 — 즉시 교체하라.",
      "- 지문 verbatim 검산: 모범답안과 지문의 대응 문장을 나란히 놓고 연속으로 겹치는 최장 구간의 단어 수를 세어라 — 연속 6단어 이상 겹치면 통째 복사로 반려된다(지문이 문항에 함께 인쇄되어 베껴 쓰기 문제가 된다). 태·구문·시제 전환을 실제로 거친 뒤 배열하라.",
      "- acceptedAnswers 에는 정답 청크만으로 **과부족 없이** 조립되는 등가 어순 문장만 넣을 수 있다 — 축약형(it's ↔ it is)·관사 추가/삭제·대소문자 표기만 다른 단어 치환·단어 추가/누락은 칩으로 만들 수 없으므로 넣는 즉시 자동 제외된다. 각 후보를 단어 단위로 세어 정답 칩과 1:1 대응하는지 확인하라.",
      "- 그 제약 안에서 실제로 문법이 성립하는 등가 어순이 있으면 **하나도 빼지 말고 전부** 나열하라 — 빠뜨린 등가 어순으로 답한 학생은 오답 처리된다. 하나라도 확신이 없으면 빈 배열로 두라.",
      killer
        ? "- 힌트는 빈 문자열이 가장 좋다. 쓴다면 한국어 한 줄이어야 하고(영어 힌트 반려), 정답의 영어 표현이 3단어 이상 연속으로 들어가면 정답 누수로 반려된다. 정답 직역 금지 — 문장이 글에서 하는 역할까지만 가리켜라."
        : "- 힌트는 한국어 한 줄이다 — 영어로 쓰면 반려되고, 정답의 영어 표현이 3단어 이상 연속으로 들어가면 정답 누수로 반려된다. 정답 직역 금지 — 문장이 글에서 하는 역할만 가리켜라.",
      "- explanation 은 한국어 합쇼체(-습니다) 딱 2문장이다 — ①어떤 구문 전환을 적용했는지 ②그 어순이 왜 유일하게 성립하는지. 한국어가 없으면 반려된다.",
      "- 해설이 따옴표로 인용하는 영어 표현은 모범답안·칩·지문에 실재하는 것만 쓴다 — 없는 표현을 지어 인용하면(환각 인용) 반려되고, 문항 표면에 없는 6단어 이상 영어 문장이 섞여도 반려된다. \"분사구문으로 접었다\" 같은 구조 서술은 실제 지문·정답 문장을 재확인한 사실만 써라.",
      "- **해설 구조 용어 대조 검산**: 해설에 쓴 문법 용어(부정사구·관계사절·분사구문·목적격보어·도치·수식어)는 **모범답안에서 그 성분을 손가락으로 짚을 수 있을 때만** 쓴다. 용어를 하나 쓸 때마다 정답 문장을 되읽어 해당 성분을 찾아라 — 못 찾으면 그 용어를 지워라(실측 사고: 정답의 `keeps you coming up with`는 keep+O+-ing 의 **분사**인데 해설이 '부정사구'라 단언해 학생이 찾을 수 없는 성분을 가리켰다). 상투 문구를 사실 확인 없이 복사하지 마라.",
      "- **배제 축 분리 서술**: 미끼가 문법으로 걸러지면 '문법상', 글의 논지로 걸러지면 '글의 논지상'이라고 축을 밝혀 써라. 문맥으로만 갈리는데 \"이 어순만 문법적으로 성립합니다\"라고 쓰면 거짓 서술이라 반려 대상이다.",
      "- 기출 형식: 미끼는 정답 칩과 길이·형식이 비슷해야 한다 — 유독 짧거나 긴 칩 하나가 \"안 쓰는 칩\"임을 흘리면 안 된다. 미끼 재료는 이 지문의 소재·어휘에서 가져와라(무관 단어는 장식이다).",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        answerChunks?: unknown;
        distractors?: unknown;
        hint?: unknown;
        acceptedAnswers?: unknown;
        explanation?: unknown;
      };
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error("최상위가 JSON 객체가 아님");
      }
      const corrections: string[] = [];

      // 코어스(기계 확정): 원소별로 파서 공유 유틸을 통과시킨다 —
      //  ①줄 전체 래퍼·장식 벗김(stripWordOrderLineWrappers, 파서와 동일 경로)
      //  ②원소 안에 md 습관대로 ` / ` 마커를 쓴 드리프트는 조각으로 분해
      //  ③빈 원소·"없음" 마커는 제외.
      const readChipList = (value: unknown, label: string): string[] => {
        const out: string[] = [];
        for (const item of Array.isArray(value) ? value : []) {
          const rawItem = String(item ?? "");
          const pieces = splitWordOrderChips(stripWordOrderLineWrappers(rawItem));
          if (pieces.length === 0) {
            if (rawItem.trim()) {
              corrections.push(
                `${label} 빈/장식 전용 원소 제외: '${rawItem.trim().slice(0, 30)}'`,
              );
            }
            continue;
          }
          if (pieces.length > 1) {
            corrections.push(
              `${label} 원소 안의 ' / ' 마커를 ${pieces.length}조각으로 분해`,
            );
          }
          out.push(...pieces);
        }
        return out;
      };

      const answerChunks = readChipList(raw.answerChunks, "모범답안 청크");
      const distractors = readChipList(raw.distractors, "미끼");

      const hintRaw = cleanMdValue(raw.hint);
      const acceptedAnswers: string[] = [];
      for (const item of Array.isArray(raw.acceptedAnswers)
        ? raw.acceptedAnswers
        : []) {
        const entry = stripWordOrderLineWrappers(String(item ?? ""));
        if (!entry || isLunaEmptyMarker(entry)) continue;
        acceptedAnswers.push(entry);
      }

      // §1-B 철칙1 의 JSON 등가 — modelAnswer 는 청크에서 파생, chips 는
      // 청크 ∪ 미끼. 회계(#7)가 항등식이 된다. chunksFromAnswer=true 라
      // 스냅의 셔플(step 5)은 설계된 단계로 취급되어 보정 기록을 남기지
      // 않는다(파서 신형식과 동일 의미론).
      const q: MdWordOrderQuestion = {
        kind: "word-order",
        modelAnswer: joinWordOrderChunks(answerChunks),
        chips: [...answerChunks, ...distractors],
        chunksFromAnswer: answerChunks.length > 1,
        distractors,
        contextHint: isLunaEmptyMarker(hintRaw) ? "" : hintRaw,
        acceptedAnswers,
        explanation: cleanMdValue(raw.explanation),
      };

      // 레인과 동일한 0원 스냅(종결부호·미끼 축자·허용답 절삭·칩 재배열) →
      // 레인 게이트 재사용(옵션도 lane-word-order.ts 와 동일: distractorMin 만).
      const snapped = autoSnapWordOrderChips(q);
      const snappedDistractors = Array.isArray(snapped.question.distractors)
        ? snapped.question.distractors.map((d) => String(d ?? ""))
        : distractors;
      return {
        question: snapped.question,
        gateIssues: [
          ...gateMdWordOrder(snapped.question, ctx.passage, {
            distractorMin: wordOrderMdDistractorMin(ctx.difficulty),
          }),
          // 레인 게이트에 없는 이 유형 전용 축(유일성 붕괴 계통) — ext 로컬 검사.
          ...distractorSwallowIssues(answerChunks, snappedDistractors),
        ],
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

  // 사용자 SSE 표면 — md 레인 섹션(모범답안/미끼/힌트/허용답/해설)과 동렬.
  // 배열 원소는 원소마다 라벨을 단다(multiblank 견본 관행 — 배열 시작 시점에
  // 1회 라벨을 낼 방법이 브릿지에 없다). hint 가 빈 문자열이면 브릿지가
  // prefix 를 내지 않아 힌트 줄 자체가 침묵한다(의도).
  bridgeSpecs: [
    { path: "answerChunks[]", prefix: "\n청크: " },
    { path: "distractors[]", prefix: "\n미끼: " },
    { path: "hint", prefix: "\n\n힌트: " },
    { path: "acceptedAnswers[]", prefix: "\n허용답: " },
    { path: "explanation", prefix: "\n\n해설: ", suffix: "\n" },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const distractorCount = Array.isArray(aiQuestion.wordBankDistractors)
      ? aiQuestion.wordBankDistractors.length
      : 0;
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : distractorCount > 0
          ? WORD_ORDER_MD_DIRECTION
          : WORD_ORDER_MD_DIRECTION_NO_DISTRACTOR;
    // 학생 표면 = 발문 + 지문(이 유형은 지문이 INLINE 으로 함께 인쇄된다 —
    // gate #9 헤더 실측) + 셔플 완료된 칩 은행 + (있다면) 한국어 힌트.
    // scrambledWords 는 어댑터가 arrangeWordOrderChips 로 어순 누수를 제거한
    // 최종 배열이다 — 여기서 다시 섞지 않는다(게이트가 본 형상 그대로).
    const chips = Array.isArray(aiQuestion.scrambledWords)
      ? (aiQuestion.scrambledWords as unknown[])
          .map((c) => String(c ?? "").trim())
          .filter(Boolean)
      : [];
    const bank = chips.map((c) => `[ ${c} ]`).join("  ");
    const hint =
      typeof aiQuestion.contextHint === "string" && aiQuestion.contextHint.trim()
        ? `\n\n힌트: ${aiQuestion.contextHint.trim()}`
        : "";
    return `${direction}\n\n${passage}\n\n<보기>\n${bank}${hint}\n\n답안: ______________________________________`;
  },
};
