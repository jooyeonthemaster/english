// ============================================================================
// 문장 삽입(SENTENCE_INSERT) luna 레인 확장 — 전 유형 이식 캠페인(26-08-14).
// 계약: ../luna-ext-types.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
// 견본: ./title.ts (선택형) — 이 파일은 **지문 변형 구조형**의 이식이다.
//
// 이 유형의 최강 방어선은 재구성 불변식 하나다:
//   번호지문(numberedPassage)에서 마커를 걷어내고 정답 자리에 삽입문장(given)을
//   되돌리면 원 지문과 한 글자도 다르지 않다.
// json_schema 는 파서 산출물(MdInsertQuestion)과 동형으로 설계해 레인의
// 스냅(autoSnapInsertGiven)·게이트(gateMdSentenceInsert)·어댑터를 무수정 재사용한다.
//
// 동적 노브 2개가 형식을 바꾼다(SPEC §2 동적 스키마):
//  - sentenceInsertSlotCount(5~8) → 마커 수·wrong 개수·answer enum
//  - sentenceInsertParaphrasePrefix → givenVariant 필드 유무(2단 출력 계약)
// answer enum 은 **가운데 라벨만** 허용한다 — 게이트가 양끝 정답을 반려하므로
// (fast warning → md 승격) 스키마에서 그 계통을 구조적으로 봉쇄한다.
// ============================================================================

import { splitIntoSentences } from "@/lib/question-postprocess/sentence-splitter";
import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import { normalizeWs, reconstructionEq } from "../parser";
import {
  SENTENCE_INSERT_MD_SLOT_MIN,
  clampInsertMdSlotCount,
} from "../prompts-sentence-insert";
import {
  INLINE_INSERT_MARK_RE,
  INSERT_CIRCLED,
  autoSnapInsertGiven,
  insertCircledLabel,
  insertMarkerOrdinal,
  type MdInsertQuestion,
} from "../parser-sentence-insert";
import { gateMdSentenceInsert } from "../gate-sentence-insert";
import { SENTENCE_INSERT_MD_DIRECTION } from "../adapter-sentence-insert";

interface InsertResolved {
  sentenceInsertSlotCount?: number;
  sentenceInsertParaphrasePrefix?: boolean;
}

function slotCountOf(ctx: MdLaneContext): number {
  return clampInsertMdSlotCount(
    (ctx.resolved as InsertResolved).sentenceInsertSlotCount ??
      SENTENCE_INSERT_MD_SLOT_MIN,
  );
}

function paraphrasePrefixOf(ctx: MdLaneContext): boolean {
  return Boolean(
    (ctx.resolved as InsertResolved).sentenceInsertParaphrasePrefix,
  );
}

// ── 교사 지정 준수 게이트 — lane-sentence-insert.ts 의 판정 등가 복제 ─────────
// 레인 parseAndGate 는 게이트 + 교사포인트 준수검사를 합쳐 반환한다. 그 함수들이
// 레인 파일의 private 이라(공유 파일 수정 금지) 판정만 그대로 옮긴다 — luna 경로의
// parseAndGate 산출이 레인 경로와 동형이어야 어댑터·재생성 정책이 같이 돈다.

/** 포함 비교용 정규화 — 구두점·대소문자 무관(교사 지정 문장은 UI 에서 잘려 온다). */
function foldForCompliance(text: string): string {
  return normalizeWs(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teacherPointIssues(q: MdInsertQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const issues: string[] = [];
  const surfaces = [q.given, q.givenVariant].map(foldForCompliance).filter(Boolean);
  if (surfaces.length === 0) return issues; // 판정 불가 — 게이트 #1 이 이미 말한다.
  for (const point of ctx.teacherPoints) {
    const pt = foldForCompliance(point.text);
    if (!pt) continue;
    const hit = surfaces.some(
      (s) => ` ${s} `.includes(` ${pt} `) || ` ${pt} `.includes(` ${s} `),
    );
    if (!hit) {
      issues.push(
        `교사 지정 문장을 빼내지 않았음: '${point.text.slice(0, 60)}' — 이 문장을 삽입문장으로 써라`,
      );
    }
  }
  return issues;
}

// ── 코어스 3 — 꼬리 마커 구출("고쳐서 살린다") ───────────────────────────────
// 실측 결함(r1 감수 Q04·Q09 계통): 마지막 마커가 **지문 맨 끝**(마지막 문장 뒤)에
// 매달려 그 자리에 뒤 문장이 없다. 기출 문장삽입은 모든 후보 자리가 뒤 문장을 갖고,
// 뒤가 없는 자리는 학생이 읽기도 전에 소거되어 5지선다가 4지선다로 붕괴한다.
// 게이트(markerPlacementIssues)는 맨 앞만 막고 맨 끝은 막지 않으므로 여기서 고친다.
//
// 확정 조건에서만 발동한다 — 마지막 마커 뒤가 공백뿐이고, 직전 마커와의 사이에
// 문장이 2개 이상 남아(= 비어 있는 문장 경계가 실재) 그 마커를 옮길 자리가
// **유일하게** 정해질 때. 표시 문장 수가 마커 수와 같아 물리적으로 불가능한 지문
// (원 지문 6문장 · 자리 5개)에서는 무발동으로 침묵한다 — 그건 공유 게이트의 하한
// 식(slotCount+1) 문제라 여기서 고칠 수 없다(SPEC §2 공유 파일 무접촉).
// 정답 마커는 절대 건드리지 않는다(재구성 불변식의 축).
function rescueTailMarker(
  numberedPassage: string,
  answerOrdinal: number,
): { text: string; correction: string } | null {
  const src = numberedPassage;
  const matches = [...src.matchAll(INLINE_INSERT_MARK_RE)];
  if (matches.length < 2) return null;
  const last = matches[matches.length - 1];
  const prev = matches[matches.length - 2];
  const lastStart = last.index ?? -1;
  const prevEnd = (prev.index ?? 0) + prev[0].length;
  if (lastStart < 0 || prevEnd >= lastStart) return null;
  // 마지막 마커 뒤가 공백뿐일 때만 = 지문 맨 끝에 매달린 자리.
  if (src.slice(lastStart + last[0].length).trim() !== "") return null;
  // 정답 자리는 옮기지 않는다(옮기면 정답이 가리키는 자리가 바뀐다).
  if (answerOrdinal === matches.length - 1) return null;

  const tail = src.slice(prevEnd, lastStart);
  const tailSentences = splitIntoSentences(tail.trim());
  if (tailSentences.length < 2) return null; // 비어 있는 문장 경계가 없다 — 침묵.
  const lastSentence = tailSentences[tailSentences.length - 1];
  const at = tail.lastIndexOf(lastSentence);
  if (at <= 0) return null; // 분할기 왕복 손실 — 손대지 않는다.

  const moved = `${src.slice(0, prevEnd)}${tail.slice(0, at)}${last[0]} ${tail
    .slice(at)
    .trimStart()}`.trimEnd();
  return {
    text: moved,
    correction: `마지막 마커 ${last[0]} 가 지문 맨 끝에 매달려 뒤 문장이 없었음 — 마지막 문장 앞으로 옮김(기출 형식: 모든 자리는 뒤 문장을 갖는다)`,
  };
}

export const SENTENCE_INSERT_LUNA_EXT: LunaLaneExt = {
  // 26-08-14: 지문에 마커 5개를 심어 전문을 재출력하는 유형 — 같은 절단 계통
  // (r1 게이트 7/12)이라 형제 유형(순서·네모)과 같은 예산을 준다.
  maxTokens: 22_000,
  subType: "SENTENCE_INSERT",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const slotCount = slotCountOf(ctx);
    const paraphrase = paraphrasePrefixOf(ctx);
    const labels = INSERT_CIRCLED.slice(0, slotCount).split("");
    // 정답은 양끝 금지(게이트 승격 규칙) — 스키마에서 가운데 라벨만 허용.
    const innerLabels = labels.slice(1, -1);
    const wrongCount = slotCount - 1;
    // 필드 순서 = 스트리밍 도착 순서 — md 표면(삽입문장 → 번호지문 → 정답 → 해설 →
    // 오답)과 동형으로 두어 브릿지 UX 가 gemini md 스트림과 같은 순서로 흐른다.
    const properties: Record<string, unknown> = {
      given: {
        type: "string",
        description:
          "지문에서 빼낸 문장 — 지문 원문에서 복사-붙여넣기한 **완결된 한 문장 축자**(첫 글자부터 끝 구두점까지 그대로, 개행 없이 한 줄). 새로 지어낸 다리 문장·반 문장·두 문장 동시 추출 금지. 지문의 첫 문장은 빼낼 수 없다.",
      },
      ...(paraphrase
        ? {
            givenVariant: {
              type: "string",
              description:
                "학생에게 보이는 재진술본 — given 의 **앞부분(도입구·앞 절·주어부)만** 다른 표현으로 다시 쓰고, 뒷부분은 given 과 한 글자도 다르지 않게 그대로 이어 붙인 한 문장. 자리를 결정하는 지시어·대명사와 연결사의 논리 방향은 반드시 유지한다.",
            },
          }
        : {}),
      numberedPassage: {
        type: "string",
        description: `given 을 뺀 나머지 지문 **전체**를 한 글자도 바꾸지 않고 그대로 옮기되, 문장과 문장 사이 후보 자리 ${slotCount}곳에 [[1]] ~ [[${slotCount}]] 마커를 지문 등장 순서대로 끼워 넣은 것. 마커 밖의 모든 텍스트는 원문과 완전히 동일해야 하고, given 이 있던 자리에는 반드시 마커가 있어야 하며, given 을 본문에 다시 적으면 안 된다. 마커는 지문 전체에 고루 흩고, **마지막 마커 뒤에도 문장이 최소 한 개 남아야 한다**(지문 맨 끝에 마커를 매달지 마라 — 남은 문장 수가 모자라 물리적으로 불가능할 때만 예외).`,
      },
      answer: {
        type: "string",
        enum: innerLabels,
        description:
          "빼낸 문장이 원래 있던 자리의 마커 원문자 — 그 자리에 given 을 되돌리면 원 지문이 복원되는 유일한 자리여야 한다(양끝 자리는 금지라 선택지에 없다).",
      },
      explanation: {
        type: "string",
        description:
          "정답 해설(한국어, 합쇼체) — 딱 2문장·각 문장 100자 이내로 짧게. 그 자리에서 앞 고리와 뒤 고리가 각각 무엇으로 닫히는지만 쓴다. 자리 번호(원문자)를 쓰지 말고 문장 내용을 인용해 위치를 지목한다.",
      },
      wrong: {
        type: "array",
        minItems: wrongCount,
        maxItems: wrongCount,
        description: `정답을 제외한 ${wrongCount}개 자리 전부에 하나씩(라벨 중복·정답 라벨 금지)`,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "text"],
          properties: {
            label: { type: "string", enum: labels },
            text: {
              type: "string",
              description:
                "이 자리가 어느 고리에서 왜 끊기는지 1문장(한국어, 합쇼체, 120자 이내) — 자리 번호(원문자) 금지, 인접 문장 내용을 인용해 어느 문장 뒤 자리인지 지목. 지문을 다시 읽어 사실인 근거만 쓴다(없다고 단정하기 전에 앞쪽 지문에 정말 없는지 확인)",
            },
          },
        },
      },
    };
    return {
      name: "sentence_insert_item",
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
    const slotCount = slotCountOf(ctx);
    const paraphrase = paraphrasePrefixOf(ctx);
    const innerLabels = INSERT_CIRCLED.slice(1, slotCount - 1);
    const wrongCount = slotCount - 1;
    const variantBlock = paraphrase
      ? [
          "",
          "## 변형본 검산 (필수 — givenVariant)",
          "- given 은 지문 축자 그대로, givenVariant 는 학생에게 보이는 재진술본이다 — givenVariant 가 given 과 완전히 같으면 반려된다(변형이 아니다).",
          "- 변형은 문장 **앞부분(도입구·앞 절·주어부)에만** 적용하고, 뒷부분은 given 과 한 글자도 다르지 않게 그대로 이어 붙여라 — 기계가 꼬리를 토큰 단위로 대조한다(뒤 4분의 1 이상 축자 보존). 문장 전체를 다시 쓰면 반려된다.",
          "- 앞부분이 지시어·대명사로 앞 내용을 되받고 있으면 변형본에도 **같은 선행어를 가리키는** 지시어·대명사를 남겨라. 연결사는 표현을 바꿔도 되지만(however → by contrast) **논리 방향**은 유지하라 — 자리를 결정하던 단서가 사라지면 반려된다.",
          "- 변형본은 한 문장, given 의 0.6~1.6배 단어 수를 지켜라. 지문의 다른 구간을 옮겨 적으면 반려된다.",
          "- 변형본을 **정답 자리와 그 바로 앞·뒤 자리 3곳에만** 끼워 읽어 유일성이 유지되는지 확인하라(전 자리를 다시 풀지 마라). 다른 자리도 맞게 됐으면 더 가벼운 변형으로 되돌려라.",
        ]
      : [];
    return [
      "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
      "- 1순위 판정 확정성(재구성 불변식·정답 자리 유일) > 2순위 기출 형식(문장 사이 마커·등장순 번호·가운데 정답·해설의 번호 지칭 금지) > 3순위 함정 공예(기제 다양성·매력도 비대칭).",
      "- 전부를 동시에 만족할 수 없으면 **함정 기제 다양성부터 양보하라**(비슷한 기제가 두 자리에 겹쳐도 좋다). 그래도 막히면 **빼낼 문장을 다른 전환점 문장으로 교체하라** — 재구성 불변식·마커 형식·정답 유일성은 절대 양보 불가.",
      "",
      "## 결정 절차 (이 순서대로 **한 번에** 정하고 되돌아가지 마라)",
      "1. 지문을 한 번만 읽고 문장에 번호를 매긴다. 첫 문장과 마지막 문장은 후보에서 뺀다.",
      "2. 남은 문장 중 **문두가 지시어·대명사·연결사로 앞 문장을 직접 되받는 첫 문장**을 빼낼 문장으로 확정한다 — 이 한 기준이 응집 단서·자리 유일성·가운데 정답을 동시에 만족시킨다. 후보가 여럿이면 지문 중간 구간에서 가장 먼저 나오는 것을 택하고 서로 비교하지 마라.",
      `3. 그 자리에 정답 마커를 놓고, 나머지 마커를 정답 앞쪽에 최소 1개·뒤쪽에 최소 1개 두되 남은 문장 경계에 고루 흩는다(마지막 마커 뒤에도 문장을 최소 1개 남긴다). 마커는 총 ${slotCount}개다.`,
      "4. 아래 검산 절을 순서대로 **1회** 적용한다. 위반이 나오면 그 절이 지시하는 최소 수정만 하고 1번으로 되돌아가지 마라.",
      "- 숙고는 이 4단계로 끝내라. 지문을 여러 번 되읽거나 후보 문장을 서너 개 비교하면 출력 예산이 사고에 소진되어 JSON 이 절단된 채 반려된다(실측 실패 계통 1위). 결정은 빠르게, 검산은 정확하게.",
      "",
      "## 재구성 검산 (필수 — 출력 직전 실제로 재구성해 원문과 대조하라)",
      `- numberedPassage 에서 [[1]]~[[${slotCount}]] 마커를 전부 걷어낸 텍스트의 정답 자리에 given 을 되끼운 결과를 원 지문과 **문장 단위로 전수 대조**하라 — 문장 누락·중복·순서 바뀜·고쳐 쓴 단어·바뀐 구두점·끊긴 연속성이 하나라도 있으면 옮겨 적기부터 다시 하라. 이 재구성이 원 지문과 한 글자라도 다르면 자동 반려된다.`,
      "- given 은 지문에 실재하는 **완결된 한 문장**을 통째로 복사한 것인가(첫 글자 대문자부터 끝 종결부호까지). 반 문장·두 문장 동시 추출·새로 지어낸 문장은 전부 반려된다.",
      "- 지문의 **첫 문장은 빼낼 수 없다**(앞 고리가 없어 자리가 결정되지 않는다). 둘째 문장 이후의 전환점에서 골라라.",
      "- numberedPassage 본문에 given 을 다시 적지 않았는가 — 남아 있으면 정답 자리가 노출되어 반려된다.",
      "",
      "## 마커·번호 검산 (필수)",
      `- 마커는 정확히 ${slotCount}개이고, [[1]]부터 [[${slotCount}]]까지 **지문 등장 순서대로**인지 세어 확인하라. 번호 건너뛰기·순서 뒤섞기·범위 밖 번호([[0]]·[[${slotCount + 1}]])는 반려된다.`,
      "- 마커는 **문장과 문장 사이에만** 둔다(마침표 뒤). 문장 한가운데(쉼표 뒤·절 경계)와 지문 맨 앞은 금지, 두 마커를 붙여 놓아 사이에 문장이 없게 만드는 것도 금지다.",
      `- 빼낸 문장이 있던 그 자리에 반드시 마커가 있어야 하고, answer 는 정확히 그 마커의 원문자다 — 재구성 검산이 성립하는 자리와 어긋나면 반려된다.`,
      `- 정답은 양끝([[1]]·[[${slotCount}]])이 아니어야 한다 — answer 가 ${innerLabels} 중 하나가 되도록 빼낼 문장과 마커 배치를 정하라.`,
      "- 마커는 지문 전체에 고루 흩어라(앞쪽 절반에 몰면 뒤쪽이 후보가 아니게 된다) — 기출 형식 관행이다.",
      `- **마지막 마커([[${slotCount}]]) 뒤에는 문장이 최소 한 개 남아야 한다** — 지문 맨 끝(마지막 문장 뒤)에 마커를 매달면 그 자리는 '글 뒤에 덧붙이기'가 되어 학생이 읽기도 전에 소거되고, 선택지 하나가 죽어 ${slotCount}지선다가 ${slotCount - 1}지선다로 붕괴한다(기출 위반). 남은 문장 수가 마커 수와 같아 물리적으로 불가능할 때만 예외다.`,
      "",
      "## 주어진 문장 검산 (필수)",
      "- 학생에게 보이는 주어진 문장에 응집 단서가 최소 1개 있는가: 지시어·대명사(this/these/that/those/such+명사·it/they/their) 또는 방향 있는 연결사(However·Therefore·For example 류). 단서가 하나도 없는 자립 문장은 어느 자리에도 들어가 복수정답이 되므로 반려된다.",
      "- 주어진 문장과 거의 같은 문장이 numberedPassage 에 남아 있으면 정답 자리가 그대로 노출되어 반려된다 — 지문에 내용이 겹치는 쌍둥이 문장이 있으면 다른 문장을 빼내라.",
      "- 유일성 시험은 **3곳만** 하라(전 자리를 다 풀면 예산이 샌다): 정답 자리의 바로 앞 자리 · 바로 뒤 자리 · 주어진 문장과 어휘가 가장 많이 겹치는 자리. 그중 '여기도 말이 되는데?' 가 하나라도 있으면 그 자리에서 마커를 치우거나 빼낼 문장을 바꿔라(복수정답은 문항 사망이다). 특히 병렬 예시 나열 구간의 일반화 문장은 금지다.",
      "- 신정보(부정관사 a/an·복수 무관사)가 먼저 나오고 그것을 지시어(this/these/such+명사)가 뒤에서 받는 것이 영어의 정상 결속 순서다 — 주어진 문장이 지시어로 그 신정보를 받는 문장이라면, 신정보가 나오는 문장 **뒤쪽 자리도** 정답 후보가 되어 복수정답이 나기 쉽다. 그런 쌍이 지문에 있으면 다른 문장을 빼내라.",
      ...variantBlock,
      "",
      "## 해설·오답 검산 (필수)",
      "- 해설은 딱 2문장 — 그 자리에서 앞 고리와 뒤 고리가 각각 무엇으로 닫히는지. **해설·오답 해설 산문에 자리 번호(원문자 ①~⑧)를 하나라도 쓰면 반려된다** — 위치는 반드시 문장 내용을 인용해 지목하라('That expense…' 문장 바로 앞 자리처럼). 표시 번호와 어긋나 문항 전체가 무효가 된 실측 사고가 있는 규칙이다.",
      `- wrong 은 정답을 제외한 ${wrongCount}개 자리 전부에 하나씩인지 확인하라 — 라벨 중복·누락·정답 라벨 포함·자리 범위 밖 라벨은 전부 반려된다.`,
      "- 앞 고리·뒤 고리 구조 서술(무엇이 무엇을 되받는지)은 실제 지문을 다시 읽고 **사실만** 써라 — 지문에 없는 되받음·선행어를 지어내면 반려된다.",
      "- **부재 주장 검증(실측 사고 계통)**: '~이 아직 제시되지 않았습니다 / 빠져 있습니다 / 선행 대상이 존재하지 않습니다' 라고 쓰기 전에, 그 대상 표현이 **그 자리보다 앞쪽 지문 어디에도 정말 없는지** 눈으로 훑어 확인하라. 두 문장 앞에라도 실재하면 그 서술은 학생이 지문을 되짚는 순간 반증되는 허위다 — 그럴 때는 '직전 문장이 아니라 두 문장 앞이라 인접 고리가 성립하지 않습니다' 처럼 **거리·인접성**으로 사실대로 써라.",
      "- **인접 어휘 검증**: '어휘 사슬이 끊깁니다' 라고 쓰기 전에, 그 자리에 주어진 문장을 실제로 끼워 앞뒤 문장을 읽어 보라 — 오히려 그 어휘가 바로 옆에 붙는 자리를 '끊긴다' 고 쓰면 정반대 서술이다. 그 자리의 진짜 배제 근거(전개 순서 역행·지시 대상 충돌·논리 방향 반대)를 대신 써라.",
      `- 오답 ${wrongCount}줄은 **서로 다른 배제 축**을 쓰라: 지시어가 받을 선행 내용 부재 / 논리 방향(대조·인과) 역전 / 전개 순서 역행(결과 뒤에 원리) / 의미 충돌(즉시 대 장기, 단수 대 복수). 전부 '지시어가 받을 내용이 없다' 한 축으로 쓰면 미끼가 고착돼 변별이 죽는다.`,
      "- 해설·오답 해설은 한국어(지문 표현 인용만 영어 허용), 문체는 합쇼체(-습니다)로 통일하라.",
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 해설 딱 2문장(앞 고리·뒤 고리가 무엇으로 닫히는지만), 오답 해설 딱 1문장(그 자리가 어느 고리에서 왜 끊기는지만). 학생이 왜 그 자리에 끌리는지·왜 매력적인지 같은 유혹·심리 서사는 쓰지 마라 — 판정 근거만, 짧을수록 좋다.",
      // 26-08-15 판정 실측: 공유 계약이 오답 해설을 1문장으로 제한하는데, luna 는
      // 그 제약을 곧이곧대로 지켜 근거 없는 축약형("지시어가 받을 내용이 없습니다")
      // 만 냈고 대조군(gemini)은 제약을 어겨 지문 인용을 곁들인 상세형을 냈다.
      // 감수는 후자를 더 높게 채점했다(내용 craft 5.6 vs 7.3). 분량 계약은 조판
      // 규약이라 늘릴 수 없으므로, **같은 1문장 안에서 밀도를 올린다**.
      `- 오답 ${wrongCount}줄은 1문장을 지키되 **그 자리를 특정하는 지문 표현을 반드시 인용**해 근거를 박아라 — "지시어가 받을 내용이 없습니다" 처럼 인용 없는 일반 서술은 학생이 검증할 수 없어 빈 껍데기다. 예: "바로 앞 'a small similarity' 가 아직 나오지 않아 'such cases' 가 되받을 대상이 없습니다."`,
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        given?: string;
        givenVariant?: string;
        numberedPassage?: string;
        answer?: string;
        explanation?: string;
        wrong?: Array<{ label?: string; text?: string }>;
      };
      const answer = insertCircledLabel(raw.answer ?? "");
      // 코어스 1 — md 파서와 같은 관용: 라벨 해독 불가·정답 라벨이 낀 오답 줄은
      // 걸러낸다(결손·중복은 게이트가 라벨 집합 대조로 전부 진단한다). 이어서
      // 라벨 오름차순 정렬(표시 결정론 — 어법·빈칸·TITLE 동일).
      const wrong: { label: string; text: string }[] = [];
      for (const w of Array.isArray(raw.wrong) ? raw.wrong : []) {
        const label = insertCircledLabel(w?.label ?? "");
        if (!label || label === answer) continue;
        wrong.push({ label, text: String(w?.text ?? "").trim() });
      }
      wrong.sort((a, b) => a.label.localeCompare(b.label));

      let q: MdInsertQuestion = {
        kind: "sentenceInsert",
        given: String(raw.given ?? "").trim(),
        givenVariant: String(raw.givenVariant ?? "").trim(),
        numberedPassage: String(raw.numberedPassage ?? "").trim(),
        answer,
        explanation: String(raw.explanation ?? "").trim(),
        wrong,
      };
      // 코어스 3 — 꼬리 마커 구출(위 함수 주석). 스냅보다 먼저 돌린다: 스냅은
      // 삽입문장만 만지고, 이 코어스는 번호지문만 만져 서로 간섭하지 않는다.
      const extra: string[] = [];
      const rescued = rescueTailMarker(q.numberedPassage, insertMarkerOrdinal(answer));
      if (rescued) {
        q = { ...q, numberedPassage: rescued.text };
        extra.push(rescued.correction);
      }
      // 코어스 2 — 레인 스냅 재사용: 삽입문장의 구두점·대소문자 드리프트를 지문
      // 축자로 보정(0원). 단어가 다르면 손대지 않고 게이트가 반려한다.
      const snapped = autoSnapInsertGiven(q, ctx.passage);
      q = snapped.question;
      return {
        question: q,
        gateIssues: [
          ...gateMdSentenceInsert(q, ctx.passage, {
            slotCount: slotCountOf(ctx),
            paraphrasePrefix: paraphrasePrefixOf(ctx),
          }),
          ...teacherPointIssues(q, ctx),
        ],
        corrections: [...extra, ...snapped.corrections],
      };
    } catch (e) {
      return {
        question: null,
        gateIssues: [`luna JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`],
        corrections: [],
      };
    }
  },

  // md 표면 동형 순서: 삽입문장(+변형) → 번호지문 → 정답 → 해설 → 오답.
  // givenVariant 스펙은 paraphrase 설정이 꺼져 있으면(필드 부재) 그냥 안 울린다.
  bridgeSpecs: [
    { path: "given", prefix: "삽입문장: ", suffix: "\n" },
    { path: "givenVariant", prefix: "삽입문장(변형): ", suffix: "\n" },
    { path: "numberedPassage", prefix: "\n번호지문:\n", suffix: "\n" },
    { path: "answer", prefix: "\n정답: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
    { path: "wrong[].label", prefix: "\n" },
    { path: "wrong[].text", prefix: " " },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    // 어댑터 산출(aiQuestion)로부터 학생 시험 표면을 렌더한다 — 후처리
    // processSentenceInsert 의 렌더 규칙 등가: 원 지문에서 빼낸 문장을 지우고
    // markerAfterSentenceIndices(원 지문 좌표) 를 표시 좌표로 −1 보정한 뒤
    // 각 문장 뒤에 ( ① )~( ⑧ ) 를 놓는다.
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : SENTENCE_INSERT_MD_DIRECTION;
    const given = String(aiQuestion.givenSentence ?? "").trim();
    const source = String(aiQuestion.sourceSentenceToOmit ?? "").trim();
    const rawIndices = Array.isArray(aiQuestion.markerAfterSentenceIndices)
      ? (aiQuestion.markerAfterSentenceIndices as unknown[]).filter(
          (n): n is number => typeof n === "number" && Number.isInteger(n),
        )
      : [];
    const sentences = splitIntoSentences(passage);
    let omittedIndex = sentences.findIndex((s) => normalizeWs(s) === normalizeWs(source));
    if (omittedIndex < 0 && source) {
      omittedIndex = sentences.findIndex((s) => reconstructionEq(s, source));
    }
    const displaySentences =
      omittedIndex >= 0 ? sentences.filter((_, k) => k !== omittedIndex) : [...sentences];
    const markerAt = new Map<number, string>();
    rawIndices.forEach((idx, ordinal) => {
      const display = omittedIndex >= 0 && idx >= omittedIndex ? idx - 1 : idx;
      markerAt.set(display, INSERT_CIRCLED[ordinal] ?? `(${ordinal + 1})`);
    });
    const body = displaySentences
      .map((s, i) => (markerAt.has(i) ? `${s} ( ${markerAt.get(i)} )` : s))
      .join(" ");
    return [direction, "", `[주어진 문장] ${given}`, "", body].join("\n");
  },
};
