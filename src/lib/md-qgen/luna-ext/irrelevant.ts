// ============================================================================
// IRRELEVANT(무관한 문장) luna 레인 확장 — 전 유형 이식 캠페인.
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 패밀리 특칙(structural — 지문 변형 구조형): 이 유형의 최강 방어선은
// "정답 마커(삽입 문장)를 통째로 들어내고 나머지 마커를 걷어낸 재구성본 == 원 지문"
// 이다(gate-irrelevant.ts #4). 검산 블록은 출력 직전 실제 재구성·전수 대조를
// 지시하고, 판정은 parser-irrelevant 의 reconstructIrrelevantPassage +
// parser.ts 의 normalizeWs/reconstructionEq 를 **재사용**한다(재구현 금지).
//
// JSON 스키마는 파서 산출물(MdIrrelevantQuestion)과 동형이되, slots 는 받지
// 않는다 — numberedPassage 의 [[n:문장]] 마커가 유일 진실원이고 slots 는
// collectIrrelevantMarks 로 파생한다(같은 사실을 두 번 받는 중복 계약 금지,
// prompts-irrelevant.ts 형식 설계 철칙 1 답습).
// ============================================================================

import { splitPassageSentences as splitQualitySentences } from "@/lib/question-quality/core";
import { IRRELEVANT_SLOT_COUNT_DEFAULT } from "@/lib/question-type-generation-settings";
import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import { splitPassageSentences } from "@/lib/passage-sentence-utils";
import {
  clampIrrelevantMdSlotCount,
  irrelevantMdCircled,
} from "../prompts-irrelevant";
import {
  autoSnapIrrelevantSlots,
  collectIrrelevantMarks,
  comparableIrrelevantSentence,
  normalizeIrrelevantLabel,
  type MdIrrelevantQuestion,
} from "../parser-irrelevant";
import { gateMdIrrelevant } from "../gate-irrelevant";
import { checkIrrelevantMdPassageFeasibility } from "../lane-irrelevant";

/** DB 실물과 동일한 발문(adapter-irrelevant.ts 와 동일 문자열 — 평가 표면 전용). */
const IRRELEVANT_EVAL_DIRECTION = "다음 글에서 전체 흐름과 관계 없는 문장은?";

function slotCountOf(ctx: MdLaneContext): number {
  return clampIrrelevantMdSlotCount(
    (ctx.resolved as { irrelevantSlotCount?: number }).irrelevantSlotCount ??
      IRRELEVANT_SLOT_COUNT_DEFAULT,
  );
}

// ── 교사 지정 준수 검사 — lane-irrelevant.ts:52-96 의 최소 복제 ────────────────
// 원본 teacherPointIssues 는 module-private 라 import 불가(공유 파일 수정 금지
// 규약상 export 추가도 불가 — sharedIssues 로 보고). 로직·보수 규약(첫 문장
// 예외는 판정 불가로 통과 + 보정 기록)을 문자 그대로 옮겼다.

// ── 코어스: 해설 메타 누설 어휘 교정 ────────────────────────────────────────
// 실측(패널 22문항): 해설이 "삽입 문장은…" · "끼운 문장은…" 처럼 그 문장이
// 인위적으로 만들어졌음을 학생 해설지에서 스스로 밝히는 사고가 luna·gemini 양팔
// 공통으로 나온다. 지시 대상은 언제나 정답(무관) 문장 하나뿐이라 "이 문장"으로의
// 치환은 기계적으로 확정 가능하다 → 반려(재생성 비용) 대신 교정한다(SPEC §1-8).
// 확정 치환이 불가능한 서술형 제작 어휘('배치했습니다' 류)는 검산 블록이 막는다.
const META_LEAK_REWRITES: ReadonlyArray<readonly [RegExp, string]> = [
  [/삽입(?:된|한)?\s*문장/g, "이 문장"],
  [/끼워\s*넣은\s*문장/g, "이 문장"],
  [/끼운\s*문장/g, "이 문장"],
  [/추가(?:된|한)\s*문장/g, "이 문장"],
];

function stripMetaLeak(s: string): { text: string; hit: boolean } {
  let out = s;
  for (const [re, to] of META_LEAK_REWRITES) out = out.replace(re, to);
  return { text: out, hit: out !== s };
}

const normalizeForCompliance = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function complianceOverlaps(a: string, b: string): boolean {
  const na = normalizeForCompliance(a);
  const nb = normalizeForCompliance(b);
  if (!na || !nb) return false;
  return ` ${na} `.includes(` ${nb} `) || ` ${nb} `.includes(` ${na} `);
}

function teacherPointIssues(
  q: MdIrrelevantQuestion,
  ctx: MdLaneContext,
): { issues: string[]; notes: string[] } {
  if (ctx.teacherPoints.length === 0 || q.slots.length === 0) {
    return { issues: [], notes: [] };
  }
  const firstSentence = splitPassageSentences(ctx.passage)[0] ?? "";
  const issues: string[] = [];
  const notes: string[] = [];
  for (const point of ctx.teacherPoints) {
    if (q.slots.some((slot) => complianceOverlaps(slot.text, point.text))) continue;
    if (firstSentence && complianceOverlaps(firstSentence, point.text)) {
      notes.push(
        `교사 지정 문장이 지문 첫 문장(도입문)이라 이 유형에서는 번호를 붙일 수 없어 준수 검사를 건너뜀: '${point.text.slice(0, 40)}'`,
      );
      continue;
    }
    issues.push(`교사 지정 문장이 번호 슬롯에 없음: '${point.text.slice(0, 60)}'`);
  }
  return { issues, notes };
}

export const IRRELEVANT_LUNA_EXT: LunaLaneExt = {
  subType: "IRRELEVANT",
  // O223 A축(26-08-18): 지문 전문(numberedPassage)+삽입 문장을 재출력하는 유형 —
  // 14k 는 긴 지문에서 사고 잠식 절단(finish=length) 위험. 조건영작 20k 전례.
  maxTokens: 20_000,

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const slotCount = slotCountOf(ctx);
    const labels = Array.from({ length: slotCount }, (_, i) => String(i + 1));
    // 기출 형식: 무관 문장(정답)은 첫/마지막 번호가 될 수 없다 — 스키마가 선차단.
    const answerLabels = labels.slice(1, -1);
    return {
      name: "irrelevant_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["numberedPassage", "answer", "explanation", "wrong"],
        properties: {
          // 본문성 큰 필드를 앞에 — 필드 순서 = 스트리밍 도착 순서.
          numberedPassage: {
            type: "string",
            description: `원 지문 전체를 한 글자도 바꾸지 않고 그대로 옮기되, 네가 새로 쓴 무관 문장 1개를 연속된 두 원문 문장 사이에 끼워 넣은 지문. 무관 문장을 포함한 문장 ${slotCount}개를 지문 등장 순서대로 [[1:문장 전체]] ~ [[${slotCount}:문장 전체]] 로 감싼다(문장 끝 구두점까지 마커 안에, 반드시 ]] 로 닫는다). 지문 첫 문장은 감싸지 않는다. 마커 밖 텍스트는 원 지문 그대로여야 한다`,
          },
          answer: {
            type: "string",
            enum: answerLabels,
            description:
              "네가 끼워 넣은 무관 문장의 번호 — 정답의 유일한 진실원. 가운데 번호만 가능",
          },
          explanation: {
            type: "string",
            description:
              "정답 해설(한국어, 합쇼체, 딱 2문장) — 1문장: 그 문장이 앞뒤와 어떤 논리 기능에서 어긋나는지. 2문장: 빼면 흐름이 복원된다는 서술인데, **무관 문장 바로 앞 원문 문장과 바로 뒤 원문 문장 그 한 쌍만** 지목해야 한다(그 둘이 아닌 인접쌍은 삭제 전에도 이미 붙어 있었으므로 '복원'이 거짓이 된다). 문장을 원문자 번호로 지칭하지 말고 내용으로 인용. 학생 해설지 문면이므로 '삽입 문장'·'끼운 문장'·'배치했습니다' 같은 출제 시점 어휘 금지",
          },
          wrong: {
            type: "array",
            minItems: slotCount - 1,
            maxItems: slotCount - 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text"],
              properties: {
                label: { type: "string", enum: labels },
                text: {
                  type: "string",
                  description:
                    "이 문장이 글에서 맡는 역할(정의·예시·대조·귀결 등)과 왜 흐름에 필요한지 1문장(한국어, 합쇼체). 정답 번호는 제외",
                },
              },
            },
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const slotCount = slotCountOf(ctx);
    const sourceCount = slotCount - 1;
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
      "- 확정성(원문 축자 보존·재구성 일치·정답 유일성)은 **제약**이다: 아래 검산에 걸리는 출력은 어떤 경우에도 내지 마라. 기출 형식(첫 문장 제외·가운데 정답·번호 등장순·분산)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 위장 강도의 무관 문장**이 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 무관 문장(어휘만 빌려 왔을 뿐 훑기만 해도 드러나는 노골적 화제 이탈)으로 후퇴하는 것은 실패다 — 무관 문장 검산을 다 지키면서 난이도에 맞는 위장은 거의 모든 지문에서 가능하다.",
      "- 지문이 짧거나 조건이 겹쳐 전부를 만족할 수 없으면 **위장 공예부터 양보하라**(무관성 기제는 가장 흔한 '주제 침입'으로 물러서도 된다). 원문 축자 보존과 정답 유일성은 절대 양보 불가다.",
      "",
      "## 재구성 검산 (필수 — 이 유형 최강 기계 검사. 출력 직전 실제로 수행하라)",
      `- numberedPassage 에서 ①정답 번호 마커(네가 쓴 무관 문장)를 통째로 들어내고 ②나머지 마커 [[n:...]] 를 걷어낸 결과가 원 지문과 **한 글자도 다르지 않은지**, 출력 직전 실제로 재구성해 원문과 문장 단위로 전수 대조하라(공백·따옴표·구두점·대소문자 포함). 원문 문장이 하나라도 빠지거나 순서가 바뀌거나 마커 밖 텍스트가 달라지면 자동 반려된다.`,
      `- 표시(비정답) 문장 ${sourceCount}개는 지문 원문 문장의 복사-붙여넣기 **축자**여야 한다. 요약·패러프레이즈·두 문장 결합·한 문장 분할·구두점 변경 전부 반려된다.`,
      `- 마커는 \`[[번호:문장 전체]]\` 하나뿐이고 반드시 \`]]\` 로 닫는다. 문장 끝 구두점까지 마커 안에 넣어라. 마커 수는 정확히 ${slotCount}개다.`,
      `- 번호는 지문 등장 순서대로 1~${slotCount} 연속이어야 한다 — 건너뛰거나 되돌아가면 반려된다.`,
      "- 각 마커는 문장 정확히 하나만 감싼다. 약어·소수점 마침표(Dr. · U.S. · 3.5)가 든 문장은 시스템이 경계를 잡지 못하니 표시 대상에서 빼고 다른 문장을 골라라.",
      "- 같은 문장을 두 번호에 중복 표시하지 마라.",
      "",
      "## 기출 형식 관행 (필수)",
      "- 지문 **첫 문장은 절대 표시하지 마라** — 도입문은 판단 기준점이라 번호 없이 그대로 보여 주는 것이 기출 형식이다.",
      `- 정답(무관 문장)은 가운데 번호(2~${slotCount - 1})에 넣어라. 1번과 ${slotCount}번 자리의 정답은 자동 반려된다.`,
      "- 무관 문장 **바로 앞 문장도 반드시 번호를 붙인 표시 문장**이어야 한다(무관 문장이 어디에 물려 있는지가 확정되어야 한다).",
      "- 표시 문장은 지문 전체에 분산하라 — 앞부분에 몰아 고르면 반려된다(지문이 8문장 이상이면 뒤쪽 1/3에서 최소 1문장).",
      "",
      "## 무관 문장 검산 (필수)",
      "- 무관 문장은 네가 **새로 쓴** 문장이어야 한다 — 지문에 이미 있는 문장(의 재진술)이면 반려된다.",
      "- 역접 연결어(However / Yet / Instead / In contrast / On the contrary / Conversely / Nevertheless / Nonetheless)로 시작하지 마라 — 훑기만으로 들켜 즉시 반려된다. 지문과 같은 방향인 척해야 한다.",
      "- 어휘 정박: 지문 전체의 내용어를 2개 이상, 표시 문장의 내용어를 1개 이상 재사용하라. 새 어휘투성이 문장은 반려된다 — 재료를 지문에서 빌려 와라.",
      "- 다만 **직전·직후 원문 문장의 4단어 이상 연속 어구를 통째로 되풀이하지 마라**. 내용어를 골라 다시 쓰는 것과 어구를 복사-붙여넣기 하는 것은 다르다 — 어구가 겹치면 학생이 지문을 읽지 않고 '앞 문장을 그대로 베낀 문장'만 찾아 정답을 맞힌다.",
      "- **'모순 문장'이 아니라 '무관 문장'을 써라.** 바로 뒤 원문 문장이 네 문장을 축자로 부정·반박하는 자리(예: 뒤 문장이 'This does not mean…' 처럼 곧바로 뒤집는 자리)는 피하라. 정답이 지문 이해 없이 인접 두 문장 대조만으로 드러나면 유형이 무너진다. 무관성은 **논지 역전**보다 **화제·범위 이탈**(같은 방향인 척하며 다른 것을 말함)로 만드는 편이 안전하다.",
      "- **첫머리 표지 편중 금지**: 이 유형 최대 누설은 '정답만 유독 같은 표지로 시작한다'는 것이다. 네 문장이 'Indeed,' 로 시작하려면 **그 문항의 원문 표시 문장 중에도 같은 첨가 표지로 시작하는 문장이 있어야** 한다 — 없으면 쓰지 마라. 'may also / can also' 같은 첨가 부사 상투구도 같은 이유로 피하고, 시작 형태를 문항마다 바꿔라(지시어 주어·명사구 주어·부사구 등).",
      "- 길이·문체를 표시 문장 평균에 맞춰라(평균의 0.45배 미만·1.8배 초과는 반려). 유독 짧거나 긴 문장은 읽기 전에 들킨다.",
      "- 지문에 없는 극단어(always / never / everyone / completely / entirely / guarantees / ensures)·처방 단서(To maximize… / should+동사 / must avoid / ought to)·'주체 + must/should/need to' 조언문을 쓰지 마라.",
      "- 방법론·측정·도구 화제로 새지 마라('the procedure requires…' · 'it is essential to…' · 'to measure/optimize…' · 측정 동명사 시작 · laboratory equipment · automated tracking · develop/build tools) — 실측 최빈 자동 탈락 계통이다.",
      "- 지문에 없는 새 무대·분야 명사(school / software / traffic / restaurant / weather / technology / advertising 류)를 끌어오지 마라.",
      "",
      "## 해설 검산 (필수)",
      "- answer 에는 무관 문장의 번호 하나만 적는다 — 정답의 유일한 진실원이다.",
      "- 해설·오답 해설 본문에서 문장을 원문자 번호(①②③)로 지칭하지 마라 — 번호가 어긋나면 문항이 무효가 된다. 반드시 내용 인용으로 지칭하라.",
      `- 오답 해설은 정답을 제외한 번호 전부에 하나씩, 정확히 ${sourceCount}개다. 정답 번호를 끼우면 반려된다. 각 오답 해설은 그 문장의 역할(정의·예시·대조·귀결)을 서로 다르게 말하라 — '흐름에 자연스럽습니다' ${sourceCount}회 반복은 실패다.`,
      "- **복원 지점 2단계 검산(실측 최다 오류 — 반드시 이 순서로 하라)**: ①numberedPassage 에서 무관 문장 **바로 앞** 원문 문장 P 와 **바로 뒤** 원문 문장 N 을 눈으로 짚어 확정한다. ②해설의 '빼면 복원된다' 서술은 **오직 P→N 그 한 쌍**을 내용으로 인용해 지목한다. P·N 이 아닌 다른 인접쌍(예: N 과 그 다음 문장)을 '복원되는 연결'로 쓰면 **거짓 서술**이다 — 그 둘은 무관 문장을 넣기 전에도 이미 붙어 있었으므로 삭제로 복원되는 대상이 아니다. 인용할 때 P·N 각각의 내용을 한 조각씩 실어 두 문장이 서로 다른 문장임이 드러나게 하라.",
      "- 오답 해설도 **그 번호 문장 자체의 내용만** 근거로 삼아라. 번호가 붙지 않은 이웃 문장의 내용을 그 번호의 역할로 끌어오면 귀속 오류다(무번호 문장은 학생 표면에서 그 번호에 속하지 않는다).",
      "- 해설의 구조 서술(어느 문장 뒤에 끼웠는지·앞뒤 관계)은 실제 지문을 재확인한 사실만 써라 — 상투 문구 복사는 반려된다.",
      "- **출제 시점 어휘 금지(메타 누설)**: 해설·오답 해설은 그대로 학생 해설지에 인쇄된다. '삽입 문장'·'삽입된/삽입한 문장'·'끼운/끼워 넣은 문장'·'추가한 문장'·'배치했습니다'·'구성했습니다'·'출제' 처럼 그 문장이 인위적으로 만들어졌음을 드러내는 표현을 쓰지 마라. 반드시 '…라고 말하는 문장' 처럼 **내용 인용**으로 지칭하라.",
      "- 해설·오답 해설은 한국어, 문체는 합쇼체(-습니다)로 통일하라.",
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 해설 딱 2문장(어긋나는 논리 기능·P→N 복원만), 오답 해설 딱 1문장(그 문장의 역할·왜 흐름에 필요한지만). 학생이 왜 그 문장에 속는지·왜 매력적인지 같은 유혹·심리 서사는 쓰지 마라 — 판정 근거만, 짧을수록 좋다.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        numberedPassage?: unknown;
        answer?: unknown;
        explanation?: unknown;
        wrong?: unknown;
      };
      const numberedPassage = String(raw.numberedPassage ?? "").trim();
      const answer = normalizeIrrelevantLabel(raw.answer);
      const metaLeakFields: string[] = [];
      const deMeta = (s: string, field: string) => {
        const r = stripMetaLeak(s);
        if (r.hit) metaLeakFields.push(field);
        return r.text;
      };
      const wrong = (Array.isArray(raw.wrong) ? raw.wrong : [])
        .map((w) => ({
          label: normalizeIrrelevantLabel((w as { label?: unknown }).label),
          text: deMeta(
            String((w as { text?: unknown }).text ?? "").trim(),
            `오답 해설 ${normalizeIrrelevantLabel((w as { label?: unknown }).label) || "?"}`,
          ),
        }))
        // 드리프트 관용(parseMdIrrelevant 와 동일 규약): 오답 목록에 끼어든
        // 정답 라벨·빈 항목은 파서 층에서 걸러낸다 — 조용한 버림이 아니라,
        // 게이트가 남은 개수·라벨 집합을 대조해 어긋나면 반려한다.
        .filter((w) => w.label && w.text && w.label !== answer);

      const parsed: MdIrrelevantQuestion = {
        kind: "irrelevant",
        numberedPassage,
        // slots 는 numberedPassage 마커에서 파생 — 단일 진실원.
        slots: collectIrrelevantMarks(numberedPassage).map((m) => ({
          label: m.label,
          text: m.text,
        })),
        answer,
        explanation: deMeta(String(raw.explanation ?? "").trim(), "해설"),
        wrong,
      };
      const metaCorrections =
        metaLeakFields.length > 0
          ? [
              `해설 메타 누설 어휘를 '이 문장'으로 교정: ${metaLeakFields.join(", ")}`,
            ]
          : [];

      // 코어스: 레인의 0원 스냅 재사용 — (1) 등장순 재번호(정답·오답 동기 치환)
      // (2) 종결 부호 흡수 (3) 비정답 슬롯 축자 스냅.
      const snapped = autoSnapIrrelevantSlots(parsed, ctx.passage);
      const q = snapped.question;

      // 지문으로는 불가능한 슬롯 수면 다른 반려는 전부 파생 잡음 — 진짜 원인만
      // 낸다(lane-irrelevant.ts parseAndGate 와 동일한 완충).
      const feasibility = checkIrrelevantMdPassageFeasibility(ctx.resolved, ctx.passage);
      if (!feasibility.ok) {
        return {
          question: q,
          gateIssues: [
            `선택지 수 ${slotCountOf(ctx)}개는 이 지문으로 만들 수 없다 — ${feasibility.error ?? ""}`.trim(),
          ],
          corrections: [...metaCorrections, ...snapped.corrections],
        };
      }

      const teacher = teacherPointIssues(q, ctx);
      return {
        question: q,
        gateIssues: [
          ...gateMdIrrelevant(q, ctx.passage, {
            slotCount: slotCountOf(ctx),
            difficulty: ctx.difficulty,
          }),
          ...teacher.issues,
        ],
        corrections: [...metaCorrections, ...snapped.corrections, ...teacher.notes],
      };
    } catch (e) {
      return {
        question: null,
        gateIssues: [`luna JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`],
        corrections: [],
      };
    }
  },

  // 번호지문 값은 md 레인이 스트리밍하던 원문 형상([[n:문장]] 마커 포함)과 동형으로
  // 흘린다 — 기존 gemini md 스트림과 같은 UX. JSON 구문은 브릿지가 침묵시킨다.
  bridgeSpecs: [
    { path: "numberedPassage", prefix: "번호지문:\n", suffix: "\n" },
    { path: "answer", prefix: "\n정답: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
    { path: "wrong[].label", prefix: "\n" },
    { path: "wrong[].text", prefix: " " },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : IRRELEVANT_EVAL_DIRECTION;
    const sentences = Array.isArray(aiQuestion.sentences)
      ? (aiQuestion.sentences as unknown[]).map((s) => String(s ?? ""))
      : [];
    const irrelevantIndex = Number(aiQuestion.irrelevantIndex);

    // 학생 표면 재현: 원 지문을 문장 단위로 걷고, 다음 슬롯과 일치하는 문장에
    // ①~⑩ 을 붙인다. 삽입(무관) 문장은 직전 슬롯(앵커) 바로 뒤에 끼운다 —
    // 프로덕션 buildSpreadMarkedPassage 와 같은 배치 규약(평가 전용 간이판).
    const passageSentences = splitQualitySentences(passage, { includeShort: true });
    const parts: string[] = [];
    let slotIdx = 0;
    for (const ps of passageSentences) {
      const target =
        slotIdx < sentences.length && slotIdx !== irrelevantIndex
          ? sentences[slotIdx]
          : null;
      if (
        target !== null &&
        comparableIrrelevantSentence(ps) === comparableIrrelevantSentence(target)
      ) {
        parts.push(`${irrelevantMdCircled(slotIdx)} ${ps}`);
        slotIdx += 1;
        if (slotIdx === irrelevantIndex && slotIdx < sentences.length) {
          parts.push(`${irrelevantMdCircled(slotIdx)} ${sentences[slotIdx]}`);
          slotIdx += 1;
        }
      } else {
        parts.push(ps);
      }
    }
    return `${direction}\n\n${parts.join(" ")}`;
  },
};
