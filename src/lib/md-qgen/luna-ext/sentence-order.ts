// ============================================================================
// SENTENCE_ORDER(글의 순서) luna 레인 확장 — 전 유형 이식 캠페인.
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 패밀리 특칙(structural — 지문 변형 구조형): 이 유형의 최강 불변식은
//   주어진 글 + (원문 순서로 이어 붙인 세 단락) == 지문 전체
// (gate-order #6·#13)다. 검산 블록은 출력 직전 **실제 재구성·문장 전수 대조**
// (문장 보존·라벨 정합·이음매 연속성)를 지시하고, 판정은 레인의
// autoSnapOrderChunks·gateMdSentenceOrder 를 그대로 재사용한다 —
// normalizeWs/reconstructionEq 는 게이트 #13 안에서 이미 돌므로 재구현하지 않는다.
//
// JSON 스키마는 파서 산출물(MdOrderQuestion)과 동형이되 order 순열 배열은 받지
// 않는다 — options[].text("(B)-(C)-(A)")가 유일 진실원이고 order 는
// parseOrderPermutation 으로 파생한다(같은 사실을 두 번 받는 중복 계약 금지).
// variants 는 설정(prefixVariationCount)이 형식을 바꾸므로 **동적 스키마**다:
// 0 이면 필드 자체가 없고, N(1~3)이면 라벨 순서 앞 N개를 minItems=maxItems=N
// 으로 요구한다(2단 출력 계약 — 축자 paragraphs 는 정답 키 검증용으로 불변).
// ============================================================================

import {
  SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES,
  SENTENCE_ORDER_MIN_PARAGRAPH_WORDS,
} from "@/lib/question-quality/core";
import {
  SENTENCE_ORDER_MAX_GIVEN_SENTENCES,
  SENTENCE_ORDER_MAX_GIVEN_TO_AVG_PARAGRAPH_RATIO,
  SENTENCE_ORDER_MAX_GIVEN_WORDS,
  SENTENCE_ORDER_MAX_PARAGRAPH_WORD_RATIO,
} from "@/lib/question-quality/validators/sentence-order";
import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  clampOrderMdPrefixVariationCount,
  SENTENCE_ORDER_MD_CIRCLED,
} from "../prompts-order";
import {
  ORDER_LABELS,
  autoSnapOrderChunks,
  foldForOrderMatch,
  orderDisplayParagraphs,
  orderPermutationText,
  parseOrderPermutation,
  type MdOrderQuestion,
} from "../parser-order";
import { gateMdSentenceOrder } from "../gate-order";
import { SENTENCE_ORDER_MD_DIRECTION } from "../adapter-order";

const CIRCLED: readonly string[] = [...SENTENCE_ORDER_MD_CIRCLED];

/**
 * 기출 고정 선지 배열 — 수능·평가원 글의 순서는 6개 순열 중 **제시 순서 그대로인
 * (A)-(B)-(C) 를 뺀 5개**만, 그것도 **사전순 고정 배치**로만 싣는다:
 *   ①(A)-(C)-(B) ②(B)-(A)-(C) ③(B)-(C)-(A) ④(C)-(A)-(B) ⑤(C)-(B)-(A)
 * 적대검수 실측(26-08-14 r1 패킷): 13문항 중 4문항이 (A)-(B)-(C) 를 ①에 올려
 * 실질 4지선다가 됐고, 5문항이 배치를 흐트러뜨렸다 — 두 계통 모두 기출 시험지 표면이
 * 아니다. 게이트 #7·#9 는 '5개·중복 없음·정답이 (A)-(B)-(C) 아님'까지만 보므로 이
 * 계통을 못 잡는다. 여기서 **스키마 enum(후보 봉쇄) + 결정형 코어스(배치 복원)** 로
 * 0원에 소멸시킨다(SPEC §1-8). 하드코딩이 아니라 라벨 순열에서 파생한다.
 */
const CANON_ORDER_TEXTS: readonly string[] = (function buildCanonicalOrders() {
  const perms: string[][] = [];
  const walk = (used: string[], rest: readonly string[]) => {
    if (rest.length === 0) return void perms.push(used);
    rest.forEach((l, i) => walk([...used, l], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  walk([], ORDER_LABELS);
  const identity = orderPermutationText([...ORDER_LABELS]);
  return perms
    .map((p) => orderPermutationText(p))
    .filter((t) => t !== identity)
    .sort();
})();

function prefixVariationOf(ctx: MdLaneContext): number {
  return clampOrderMdPrefixVariationCount(
    (ctx.resolved as { sentenceOrderPrefixVariationCount?: number })
      .sentenceOrderPrefixVariationCount ?? 0,
  );
}

/** md 파서와 동일한 저장 형상 규약 — 본문은 언제나 개행 접힌 한 줄이다. */
const collapse = (s: unknown): string =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

const asLabeled = (v: unknown): Array<{ label: string; text: string }> =>
  Array.isArray(v)
    ? v.map((r) => ({
        label: String((r as { label?: unknown })?.label ?? "").trim(),
        text: collapse((r as { text?: unknown })?.text),
      }))
    : [];

/**
 * 교사 지정 준수 게이트 — lane-order.ts teacherPointIssues 의 문자 그대로 복제.
 * 원본은 module-private 라 import 불가하고, 공유 파일 수정 금지 규약상 export
 * 추가도 불가하다(luna-ext/irrelevant.ts 와 같은 처리). 준수 판정은 **학생
 * 표시면** 기준이다 — 변형이 갈아 끼우는 자리가 정확히 '단락 첫 문장'이라 축자로만
 * 재면 지정 문장이 저장·인쇄본에서 사라졌는데도 '준수'로 통과한다(적대검수 실증).
 */
function teacherPointIssues(q: MdOrderQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  if (q.paragraphs.length === 0) return []; // 판정 불가 — 통과
  const issues: string[] = [];
  const given = foldForOrderMatch(q.given);
  const exact = q.paragraphs.map((p) => foldForOrderMatch(p.text));
  const shown = (prefixVariationOf(ctx) > 0 ? orderDisplayParagraphs(q) : q.paragraphs).map((p) =>
    foldForOrderMatch(p.text),
  );
  const atSeam = (bodies: string[], pt: string) =>
    bodies.some((b) => b.startsWith(pt) || b.endsWith(pt));
  for (const point of ctx.teacherPoints) {
    const pt = foldForOrderMatch(point.text);
    if (!pt) continue;
    const inGiven = given.length > 0 && (given.includes(pt) || pt.includes(given));
    if (inGiven || atSeam(shown, pt)) continue;
    issues.push(
      atSeam(exact, pt)
        ? `교사 지정 문장이 변형 대상 단락의 첫 문장이라 학생 표시면에서 사라짐: '${point.text.slice(0, 40)}' — 절단선을 옮겨 그 문장이 단락 끝·주어진 글·변형하지 않는 단락의 시작 중 한 자리에 오게 하라`
        : `교사 지정 문장이 주어진 글·단락 경계 어디에도 없음: '${point.text.slice(0, 60)}'`,
    );
  }
  return issues;
}

export const SENTENCE_ORDER_LUNA_EXT: LunaLaneExt = {
  // 26-08-14 판정 실측: 지문 전체를 단락으로 재조립하는 유형이라 14k 예산에서
  // 사고가 13.5~13.9k 를 소진해 JSON 이 절단됐다(finish_reason=length, r1 3건).
  // 품질이 아니라 예산 결함이라 재생성도 같은 사유로 죽는다 — 이 유형만 상향.
  maxTokens: 22_000,
  subType: "SENTENCE_ORDER",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const variation = prefixVariationOf(ctx);
    const variantLabels = ORDER_LABELS.slice(0, variation);
    const labeledItem = (
      labels: readonly string[],
      labelDesc: string,
      textDesc: string,
    ) => ({
      type: "object",
      additionalProperties: false,
      required: ["label", "text"],
      properties: {
        label: { type: "string", enum: [...labels], description: labelDesc },
        text: { type: "string", description: textDesc },
      },
    });
    // 필드 순서 = 스트리밍 도착 순서 — 본문성 큰 필드(given·paragraphs·variants)를
    // 앞에 둔다. Object.keys 삽입 순서가 required 와 스트림 순서의 진실원이다.
    const properties: Record<string, unknown> = {
      given: {
        type: "string",
        description:
          "지문 맨 앞 1~2문장을 한 글자도 바꾸지 않고 복사한 축자 — 라벨·머리표 없이 본문만, 개행 없이 한 줄",
      },
      paragraphs: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        description:
          "배열 순서대로 (A)(B)(C) 3개. 라벨은 제시 순서일 뿐 원문 순서가 아니다 — 원문 순서를 섞어 라벨을 붙여라",
        items: labeledItem(
          ORDER_LABELS,
          "제시 라벨 — 배열 순서대로 (A)(B)(C)",
          "지문의 연속 구간 축자 — 한 단어도 고치지 말고 구두점까지 원문 그대로, 라벨·순서 번호 없이 본문만, 개행 없이 한 줄",
        ),
      },
      ...(variation > 0
        ? {
            variants: {
              type: "array",
              minItems: variation,
              maxItems: variation,
              description: `라벨 순서대로 앞 ${variation}개 단락(${variantLabels.join("")})의 학생 표시본 — 첫 문장만 재진술하고 2번째 문장부터는 그 단락 축자와 한 글자도 다르지 않게 이어 붙인다`,
              items: labeledItem(
                variantLabels,
                "변형 대상 단락 라벨 — 배열 순서대로",
                "첫 문장만 같은 뜻 다른 표현(영어)으로 재진술하고 2번째 문장부터는 해당 단락 축자 그대로 이어 붙인 본문 전체 — 개행 없이 한 줄",
              ),
            },
          }
        : {}),
      // 선지는 **기출 고정 배열**이다 — text 를 enum 으로 묶어 (A)-(B)-(C) 가 선지에
      // 오르는 계통을 원천 봉쇄하고, 배치가 흔들리면 코어스가 되돌린다.
      options: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        description: `배열 순서대로 ①~⑤ — 기출 고정 배열 그대로: ${CANON_ORDER_TEXTS.map((t, i) => `${CIRCLED[i]} ${t}`).join(" / ")}`,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "text"],
          properties: {
            label: {
              type: "string",
              enum: [...CIRCLED],
              description: "선지 번호 — 배열 순서대로 ①~⑤",
            },
            text: {
              type: "string",
              enum: [...CANON_ORDER_TEXTS],
              description:
                "그 번호 자리의 순열 — 기출 고정 배열이므로 위 목록의 순서 그대로 하나씩 쓴다(섞지 마라)",
            },
          },
        },
      },
      answer: {
        type: "string",
        enum: [...CIRCLED],
        description: "정답 선지 번호 — 네 조각을 원문 위치 순으로 정렬해 도출한 순열이 실린 선지",
      },
      explanation: {
        type: "string",
        description:
          "정답 해설(한국어, 합쇼체) — 이음매마다 어떤 응집장치(지시사·연결사·시간 표지·어휘 사슬)가 순서를 확정하는지 2문장 안팎. 단락은 괄호 표기 '(A)', 순열은 '(B)-(A)-(C)' 하이픈 표기로만 쓰고, 지문 인용은 유니코드 홑따옴표로 통일한다",
      },
      wrong: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        description: "정답을 뺀 나머지 4개 선지 각각의 오답 해설 — 네 줄이 서로 다른 파손 지점을 짚는다",
        items: labeledItem(
          CIRCLED,
          "오답 선지 번호 — 정답 번호는 제외",
          "이 배열이 어느 이음매에서 무엇 때문에 깨지는지 1문장(한국어, 합쇼체). 근거로 드는 표현이 정말 그 라벨 단락 안에 있는지 확인하고 쓴다 — 다른 단락의 문장을 그 라벨의 것으로 말하면 허위 해설이다",
        ),
      },
    };
    return {
      name: "sentence_order_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(properties),
        properties,
      },
    };
  },

  buildSelfcheck(ctx): string {
    const variation = prefixVariationOf(ctx);
    const lines = [
      // ⚠ 사고 예산이 맨 앞이다. r1 벤치 실측: luna 실패 6건 중 3건이 JSON 절단이었고
      //   셋 다 finish_reason=length·사고 13.5k/14k — 즉 반려 사유는 품질이 아니라
      //   **절단선 탐색을 멈추지 못한 것**이었다. 종결 조건을 먼저 못박는다.
      "## 사고 예산 (먼저 읽어라 — 이 지시가 다른 모든 지시보다 앞선다)",
      "- 이 문항은 창작이 아니라 **복원**이다. 지문이 이미 정한 유일한 원문 순서를 그대로 옮기고 절단선만 고르면 된다 — 새 문장을 지어낼 여지가 없으므로 길게 탐색할 것이 없다.",
      "- 절단안 탐색은 **최대 2회**다. 1안이 아래 검산에 걸리면 절단선을 딱 한 번만 옮겨 2안을 만들고, 2안에서는 3순위(오답 기제 분산·near-miss 공예)를 전부 버려서라도 즉시 출력하라. 3안을 만들지 마라 — 사고가 길어지면 출력이 중간에서 잘려 문항 전체가 폐기된다.",
      "- 절차를 한 번 밟았으면 곧바로 JSON 을 쓰기 시작하라. 이미 통과한 검산을 되풀이하지 마라.",
      "",
      "## 규칙 충돌 시 우선순위 (지시가 서로 부딪히면 이 사다리를 따르라)",
      "- 1순위 판정 확정성(무손실 축자 4분할·원문 순서와 정답 일치·정답 유일) > 2순위 기출 형식(문장 경계 절단·공짜 소거 금지·분량 균형) > 3순위 공예·다양성(오답 기제 분산·near-miss 배열).",
      "- 막히면 3순위부터 양보하라 — 오답 기제가 겹쳐도 되고 near-miss 를 빼도 된다. 절단선이 전부 막히면 주어진 글을 1문장 또는 2문장으로 바꿔 절단선 자체를 옮겨라. 축자 계약과 문장 경계 절단은 어떤 경우에도 양보 불가다.",
      "",
      // 분량 계통(r1 luna 반려 2건 + 하한 미달 1건)은 '균형을 맞춰라'라는 서술로는
      // 안 잡힌다 — 목표 길이를 산술로 먼저 정하고 실제로 세게 한다.
      "## 절단 절차 (숫자 순서대로 실제로 수행하라 — 눈대중 금지)",
      "1. 지문 문장에 앞에서부터 번호를 매겨 세라(S1, S2, …). 총 문장 수와 총 단어 수를 적어라.",
      `2. given 은 지문 **맨 앞** S1(원칙), 지문이 8문장 이상이면 S1~S2 까지 허용한다(${SENTENCE_ORDER_MAX_GIVEN_SENTENCES}문장·${SENTENCE_ORDER_MAX_GIVEN_WORDS}단어 이하). given 단어 수를 세어 적어라.`,
      "3. **목표 단락 길이 = (총 단어 − given 단어) ÷ 3** 을 계산해 적어라. 남은 문장을 문장 경계에서만 세 구간으로 갈라, 각 구간이 그 목표의 0.8~1.25배가 되게 경계를 잡아라.",
      `4. 세 구간의 단어 수를 **실제로 세어 나란히 적고** 최대÷최소를 계산하라 — ${SENTENCE_ORDER_MAX_PARAGRAPH_WORD_RATIO} 이하가 계약이고 목표는 1.5 이하다(여유를 둬야 세는 오차에 죽지 않는다). 각 구간은 ${SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES}문장·${SENTENCE_ORDER_MIN_PARAGRAPH_WORDS}단어 이상, given 은 세 구간 평균의 ${SENTENCE_ORDER_MAX_GIVEN_TO_AVG_PARAGRAPH_RATIO}배 이하다(지문이 아주 짧으면 그 안에서 최대한 고르게).`,
      "5. 어긋나면 경계 문장 하나를 옆 구간으로 옮겨 3~4를 다시 계산하라. 그래도 안 되면 given 을 1문장으로 줄여 남은 예산을 늘려라.",
      "6. 세 구간에 (A)(B)(C) 라벨을 **원문 순서와 다르게** 섞어 붙여라(원문 순서 그대로 붙이면 정답이 (A)-(B)-(C) 가 되어 반려된다).",
      "",
      "## 재구성 검산 (출력 직전 실제로 수행하라)",
      "- given 과 단락 세 개를 **원문 등장 순서로** 실제로 이어 붙여 지문 전체와 문장 단위로 전수 대조하라 — 빠진 문장·중복 문장·고쳐 쓴 단어·바뀐 구두점이 하나라도 있으면 기계 검사에서 자동 반려된다. 네 조각은 전부 지문에서 복사-붙여넣기한 축자다(따옴표·쉼표까지 원문 그대로, 문장 합치기·쪼개기 금지).",
      "- 지문 끝까지 남김없이 세 단락에 담아라 — 지문 앞·뒤 유실, 두 조각의 같은 구간 중복 사용은 자동 반려된다.",
      "- 절단은 문장 경계에서만: 네 조각 각각이 대문자로 시작하고 마침표(또는 ?!)로 끝나는지, 이음매마다 문장 종결부호가 실제로 있는지 눈으로 확인하라(예외: von Neumann·iPhone 류 원래 소문자로 시작하는 고유명사). Prof.·Dr.·Fig.·e.g. 같은 약어의 마침표 뒤에서 자르면 문장 한가운데 절단으로 반려된다.",
      "",
      "## 라벨·본문 위생 (기출 관행)",
      '- paragraphs 는 정확히 3개, label 은 배열 순서대로 "(A)","(B)","(C)" 다. 라벨은 **제시 순서**이지 원문 순서가 아니다.',
      "- 단락 본문과 given 안에 (A)(B)(C)·(a)(b)(c)·[A]·Ⓐ 라벨이나 순서 번호(1. / ② / (2))를 다시 쓰지 마라 — 본문에는 지문 문장만 담는다.",
      "- 공짜 소거 금지: 정답 배열의 **첫 단락을 뺀 나머지 두 단락**이 아래 형태로 시작하면 학생이 첫 단어만 보고 선지를 지워 실질 2~3지선다가 된다. 걸리면 절단선을 옮겨 그 첫 문장을 자립화하라.",
      "  · 미해소 연결사: However/Therefore/Thus/Instead/Moreover/Finally/But/Yet/In fact/In contrast/For example/In other words/Stated differently/That is/After all",
      "  · 지시구·대명사: These/Those/Such + 명사, 그리고 선행어 없이 문장을 여는 This/That/It/They (예: 'This is an example…', 'They found that…')",
      "  · 앞에서 도입돼야만 성립하는 정관사구(예: 'The coward sees…' — 앞 조각에서 a coward 가 먼저 나와야 한다)",
      "  · 앞 조각의 질문에만 붙는 단독 응답(예: 'Perhaps, but also perhaps not.')",
      "",
      // 유일성은 이 유형의 최대 결함이다 — r1 블라인드 2인이 동시에 다른 배열을 고른
      // 문항이 4건 나왔고, 전부 '두 단락이 같은 명제를 정도만 달리해 반복'하는 절단선이었다.
      "## 정답 유일성 스트레스 (필수 — 이 유형 최대 결함)",
      "- 정답 배열을 확정한 뒤, **나머지 4개 배열을 각각 실제로 이어 붙여 읽어라**. 하나라도 지시사·대명사·연결사·어휘 사슬이 끊기지 않고 자연스럽게 읽히면 그 절단선은 실패다.",
      "- 각 이음매는 '이쪽이 더 자연스럽다'는 선호가 아니라 **끊기면 문장이 성립하지 않는 장치**로 잠겨야 한다: 대명사의 유일 선행어, 지시사의 유일 선행어, 고유 어휘의 최초 도입→재인용(부정관사→정관사), 질문→응답. 선호로만 배제되는 배열이 하나라도 남으면 절단선을 옮겨라.",
      "- 특히 두 단락이 거의 같은 명제를 정도만 달리해 되풀이하면(비교급 대구, 동어반복, 같은 결론의 재진술) 그 둘의 선후는 잠기지 않는다 — 그런 절단선은 버려라.",
      "",
      "## 선지·정답",
      `- 선지 5개는 **기출 고정 배열**이고 스키마가 그 5개만 허용한다. 이 순서 그대로 적어라(섞지 마라): ${CANON_ORDER_TEXTS.map((t, i) => `${CIRCLED[i]} ${t}`).join(" / ")}`,
      "- 제시 순서를 그대로 찍는 (A)-(B)-(C) 는 기출에서 선지가 되지 않는다 — 선지에도 정답에도 올리지 마라.",
      "- answer 를 출력 직전 재검산하라: 세 단락을 원문 위치 순서로 정렬했을 때의 라벨 순서가 곧 정답 순열이고, 위 고정 배열에서 그 순열이 실린 번호가 정답이다 — 서버가 같은 방법으로 도출해 대조하므로 어긋나면 자동 반려된다.",
      "",
      "## 해설 (사실성·표기 규약)",
      "- explanation 은 한국어 합쇼체(-습니다) 2문장 안팎 — 이음매마다 어떤 응집장치가 순서를 확정하는지 지목하되, 실제 지문을 다시 읽고 **사실만** 써라(있지도 않은 지시사·연결사를 상투적으로 지어내지 마라).",
      "- 오답 해설을 쓰기 **전에**, 근거로 삼을 표현이 정말 그 라벨 단락 안에 있는지 문자열로 확인하라. 다른 단락의 문장을 그 라벨의 것이라고 쓰면 허위 해설이다(같은 지문의 형제 문항 해설이 넘어오는 사고가 실측됐다).",
      "- 배제 논거로 드는 사태(질문↔응답 역전·선행어 부재·인과 역전)가 그 배열에서 **실제로 일어나는지** 배열을 이어 붙여 확인하라 — 어떤 배열에서도 일어날 수 없는 일을 근거로 삼지 마라.",
      "- 지시 표현의 선행어를 말할 때는 그 선행어가 **같은 단락 안**에 있는지 먼저 확인하라. 한 단락 안에서 완결되는 지시(예: 그 단락 첫 문장을 받는 'For this')는 순서를 가르는 근거가 되지 못한다.",
      "- 표기 규약: 단락은 언제나 괄호 표기 '(A)', 순열은 '(B)-(A)-(C)' 하이픈 표기다(괄호를 벗겨 'B의 지시사'·'A→B' 로 쓰지 마라). 지문 인용은 유니코드 홑따옴표로 통일하고 큰따옴표·ASCII 따옴표를 섞지 마라. 오답 해설은 선지 순열을 되풀이하며 시작하지 말고 곧바로 이음매를 짚어라.",
      "- wrong 은 정답을 뺀 나머지 4개 라벨에 정확히 하나씩(라벨 중복·정답 라벨 포함은 반려), 각 1문장, 합쇼체. 네 줄이 **서로 다른 파손 지점**을 짚어야 한다 — 같은 논거를 두 줄에 쓰지 마라.",
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 해설 1~2문장(이음매의 응집장치·정답 도출만), 오답 해설 딱 1문장(어느 이음매에서 왜 깨지는지만). 학생이 왜 그 배열에 끌리는지·왜 매력적인지 같은 유혹·심리 서사는 쓰지 마라 — 짧을수록 좋다.",
    ];
    if (variation > 0) {
      const targets = ORDER_LABELS.slice(0, variation).join("");
      lines.push(
        "",
        `## 단락 첫 문장 변형 (교사 설정 ${variation}개, 필수)`,
        `- variants 는 라벨 순서대로 앞에서 ${variation}개 — ${targets} 에만 만든다. 각 변형본은 그 단락의 **첫 문장만** 같은 뜻 다른 표현으로 재진술하고, 2번째 문장부터는 축자 단락과 한 글자도 다르지 않게 그대로 이어 붙인다(서버가 문자 단위로 대조한다). given 은 절대 변형하지 마라.`,
        "- 재진술 첫 문장은 정확히 1문장, 종결부호로 끝나고, 축자 첫 문장의 0.6~1.7배 단어 수, 영어만(한글 금지). 축자 첫 문장 복사·통째 포함(앞뒤 덧붙임)·지문 다른 구간 옮겨 적기·다른 단락 재진술은 전부 반려된다 — 새 표현으로 다시 쓰되 핵심 명사 두엇은 자연히 남긴다.",
        "- 위치를 결정하는 단서의 **종류와 방향**을 보존하라(However=역접, Therefore=인과, this/such+명사=되받기, then/later=시간). later↔earlier 처럼 방향을 뒤집거나, 되받는 지시 대상을 다른 조각의 것으로 바꾸면 표시면이 정답과 어긋나 반려된다. 연결사·지시사가 없고 어휘 사슬이 유일한 자리 근거면 그 핵심어를 최소 하나 남겨라.",
        `- 변형 후에도 **표시면(변형본 기준)이 계약**이다: 세 단락 각각 ${SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES}문장·${SENTENCE_ORDER_MIN_PARAGRAPH_WORDS}단어 이상, 최대/최소 ${SENTENCE_ORDER_MAX_PARAGRAPH_WORD_RATIO}배 이하, 첫머리에 새 연결사·지시구를 붙이지 마라(정답 첫 단락만 예외).`,
        "- 변형본만 읽고 문항을 처음부터 다시 풀어 보라 — 다른 배열도 성립하면 더 가벼운 변형으로 되돌려라. 정답 순열과 (A)(B)(C) 라벨은 변형 전과 같아야 한다.",
      );
    }
    return lines.join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        given?: unknown;
        paragraphs?: unknown;
        variants?: unknown;
        options?: unknown;
        answer?: unknown;
        explanation?: unknown;
        wrong?: unknown;
      };
      const corrections: string[] = [];
      // order 는 text 순열 문자열에서 파생한다 — 파서와 동일한 관용(parseOrderPermutation).
      let options = (Array.isArray(raw.options) ? raw.options : []).map((r) => {
        const optionText = String((r as { text?: unknown })?.text ?? "").trim();
        return {
          label: String((r as { label?: unknown })?.label ?? "").trim(),
          text: optionText,
          order: parseOrderPermutation(optionText) ?? [],
        };
      });
      // 코어스: 선지 제시 순서를 ①~⑤ 로 정렬(기계 확정 가능 — SPEC §1-8 라벨 정렬).
      // 라벨이 전부 유효하고 중복이 없을 때만 — 애매하면 그대로 두고 게이트가 반려한다.
      const circledRank = (l: string) => CIRCLED.indexOf(l);
      if (
        options.length > 1 &&
        new Set(options.map((o) => o.label)).size === options.length &&
        options.every((o) => circledRank(o.label) >= 0) &&
        options.map((o) => o.label).join("") !== CIRCLED.slice(0, options.length).join("")
      ) {
        options = [...options].sort((a, b) => circledRank(a.label) - circledRank(b.label));
        corrections.push("선지 제시 순서를 ①~⑤ 로 정렬");
      }
      // 코어스: 선지 **순열 배치**를 기출 고정 배열로 되돌린다(SPEC §1-8 결정형 교정).
      // 집합이 정확히 기출 5종일 때만 발동한다 — 그때만 배치가 기계로 확정 가능하다.
      // 정답 라벨과 오답 해설 라벨을 **같은 맵으로 함께 옮긴다**: 라벨만 재배치하면
      // 해설이 다른 배열에 붙어 v4 허위 해설을 스스로 만들어낸다.
      let answerLabel = String(raw.answer ?? "").trim();
      let wrongRows = asLabeled(raw.wrong);
      const optionOrders = options.map((o) => orderPermutationText(o.order));
      const isCanonicalSet =
        options.length === CANON_ORDER_TEXTS.length &&
        new Set(optionOrders).size === CANON_ORDER_TEXTS.length &&
        optionOrders.every((t) => CANON_ORDER_TEXTS.includes(t));
      if (isCanonicalSet && optionOrders.join("|") !== CANON_ORDER_TEXTS.join("|")) {
        const relabel = new Map<string, string>(
          options.map((o): [string, string] => [
            o.label,
            CIRCLED[CANON_ORDER_TEXTS.indexOf(orderPermutationText(o.order))],
          ]),
        );
        options = CANON_ORDER_TEXTS.map((t, i) => ({
          label: CIRCLED[i],
          text: t,
          order: parseOrderPermutation(t) ?? [],
        }));
        answerLabel = relabel.get(answerLabel) ?? answerLabel;
        wrongRows = wrongRows.map((w) => ({ ...w, label: relabel.get(w.label) ?? w.label }));
        corrections.push(
          `선지 순열을 기출 고정 배열(${CANON_ORDER_TEXTS.map((t, i) => `${CIRCLED[i]} ${t}`).join(" ")})로 재배치 — 정답·오답해설 라벨 동반 이동`,
        );
      }
      // 집합 자체가 기출 5종이 아니면(= (A)-(B)-(C) 가 선지에 올라간 계통) 배치를
      // 기계로 되돌릴 수 없다 — 그 자리에 넣을 순열의 오답 해설이 없기 때문이다.
      // 스키마 enum 이 이미 막지만, 만약을 대비해 재생성으로 보낸다.
      // (중복 순열은 게이트 #7 이 따로 말하므로 여기서는 침묵한다 — 진단 중복 방지.)
      const optionSetIssues =
        options.length === CANON_ORDER_TEXTS.length &&
        new Set(optionOrders).size === CANON_ORDER_TEXTS.length &&
        !isCanonicalSet
          ? [
              `선지 순열 집합이 기출 5종이 아님 — ${CANON_ORDER_TEXTS.join(" / ")} 만 선지가 된다(제시 순서 그대로인 (A)-(B)-(C) 는 기출에서 선지에 오르지 않는다). 실제: ${optionOrders.join(" / ")}`,
            ]
          : [];
      let q: MdOrderQuestion = {
        kind: "sentenceOrder",
        given: collapse(raw.given),
        variants: asLabeled(raw.variants),
        paragraphs: asLabeled(raw.paragraphs),
        options,
        answer: answerLabel,
        explanation: String(raw.explanation ?? "").trim(),
        // 코어스: 오답 해설 라벨 오름차순 정렬(표시 결정론 — 어법·빈칸·제목 동일).
        // 위 재배치가 라벨을 옮겼을 수 있으므로 **옮긴 뒤에** 정렬한다.
        wrong: [...wrongRows].sort((a, b) => a.label.localeCompare(b.label)),
      };
      // 레인 스냅 재사용 — 단락·변형 라벨 (A)(B)(C) 정렬 + 구두점 드리프트를 fold
      // 좌표로 찾아 원문 문자 그대로 재적재(변형본 꼬리 동기 보정 포함).
      const snapped = autoSnapOrderChunks(q, ctx.passage);
      q = snapped.question;
      return {
        question: q,
        gateIssues: [
          ...gateMdSentenceOrder(q, ctx.passage, {
            prefixVariationCount: prefixVariationOf(ctx),
          }),
          ...optionSetIssues,
          ...teacherPointIssues(q, ctx),
        ],
        corrections: [...corrections, ...snapped.corrections],
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
    { path: "given", prefix: "주어진 글: ", suffix: "\n" },
    { path: "paragraphs[].label", prefix: "\n" },
    { path: "paragraphs[].text", prefix: " " },
    { path: "variants[].label", prefix: "\n변형 " },
    { path: "variants[].text", prefix: " " },
    { path: "options[].label", prefix: "\n" },
    { path: "options[].text", prefix: " " },
    { path: "answer", prefix: "\n\n정답: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
    { path: "wrong[].label", prefix: "\n" },
    { path: "wrong[].text", prefix: " " },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, _passage): string {
    // ⚠ 지문 원문은 싣지 않는다 — 이 유형은 원문 순서가 곧 정답이라, 원문을 표면에
    //   실으면 블라인드 패널이 문항이 아니라 정답지를 보게 된다(계기 오염).
    //   학생 표면 = 발문 + 주어진 글 + (A)(B)(C) 단락(표시본) + 순열 선지.
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : SENTENCE_ORDER_MD_DIRECTION;
    const given =
      typeof aiQuestion.givenSentence === "string" ? aiQuestion.givenSentence : "";
    const paragraphs = Array.isArray(aiQuestion.paragraphs)
      ? (aiQuestion.paragraphs as Array<Record<string, unknown>>)
          .map((p) => `${String(p.label ?? "")} ${String(p.text ?? "")}`)
          .join("\n\n")
      : "";
    const options = Array.isArray(aiQuestion.options)
      ? (aiQuestion.options as Array<Record<string, unknown>>)
          .map((o) => {
            // 어댑터 저장 라벨은 "1"~"5" — 시험지 표기는 원문자다.
            const n = Number(o.label);
            const label =
              Number.isInteger(n) && n >= 1 && n <= CIRCLED.length
                ? CIRCLED[n - 1]
                : String(o.label ?? "");
            return `${label} ${String(o.text ?? "")}`;
          })
          .join("\n")
      : "";
    return `${direction}\n\n[주어진 글]\n${given}\n\n${paragraphs}\n\n${options}`;
  },
};
