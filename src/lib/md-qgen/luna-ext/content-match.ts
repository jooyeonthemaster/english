// ============================================================================
// CONTENT_MATCH(내용 일치) luna 레인 확장 — 전 유형 이식 캠페인(견본: ./title.ts).
// 계약: ../luna-ext-types.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 선택형 계열(지문 무변형) — 재구성 계약이 없다. 대신 이 유형의 최강 게이트는
// `근거(evidence)` 축자 3불변식(지문 축자 실재 · 서로 다른 문장 · 지문 등장순)이다
// (gate-content-match.ts 머리말). 스키마·검산 전부가 그 축을 중심으로 설계됐다.
// 형식 노브 넷(선지수 5~12 · 정답수 1~N · 선지 언어 en/ko · 극성 일치/불일치)이
// ctx 를 따라 움직이는 동적 스키마다. 파싱 산출물은 MdContentMatchQuestion
// (parser-content-match.ts) 동형으로 만들어 레인의 스냅(autoSnapContentMatchEvidence)·
// 게이트(gateMdContentMatch)·어댑터(레인 adapt 경유)를 전부 재사용한다.
//
// ⚠ 발문(direction)은 여기서도 모델에게 받지 않는다 — 어댑터가
//   contentMatchDirection(극성×정답수×발문언어) 으로 결정론 합성한다(§1-B 철칙 1,
//   fast 레인 content-match-direction-polarity 사고의 재발 방지 그대로).
//   스키마에 direction 칸을 만들면 그 설계를 되돌리는 것이다.
// ⚠ 노브 계산은 lane-content-match.ts 의 optionCountOf/answerCountOf/matchTypeOf/
//   optionLanguageOf 와 문자 그대로 동일해야 한다 — 어긋나면 스키마가 강제한
//   형상과 게이트가 요구하는 형상이 갈라져 정상 출력이 반려된다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  readContentMatchAnswerCountSetting,
  readContentMatchOptionCountSetting,
  readContentMatchTypeSetting,
  readOptionLanguageSetting,
  type ContentMatchPolarity,
} from "@/lib/question-type-generation-settings";
import {
  clampContentMatchMdAnswerCount,
  clampContentMatchMdOptionCount,
  CONTENT_MATCH_MD_CIRCLED,
} from "../prompts-content-match";
import {
  autoSnapContentMatchEvidence,
  CONTENT_MATCH_LABELS,
  type MdContentMatchQuestion,
} from "../parser-content-match";
import { gateMdContentMatch } from "../gate-content-match";
import { contentMatchDirection } from "../adapter-content-match";

// ── 노브 계산(lane-content-match.ts 와 1:1 동일) ────────────────────────────
interface ContentMatchResolved {
  contentMatchOptionCount?: number;
  contentMatchAnswerCount?: number;
  contentMatchType?: unknown;
}

function optionCountOf(ctx: MdLaneContext): number {
  const resolved = (ctx.resolved as ContentMatchResolved).contentMatchOptionCount;
  return clampContentMatchMdOptionCount(
    resolved ?? readContentMatchOptionCountSetting(ctx.rawTypeSettings),
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  const optionCount = optionCountOf(ctx);
  const resolved = (ctx.resolved as ContentMatchResolved).contentMatchAnswerCount;
  return clampContentMatchMdAnswerCount(
    resolved ?? readContentMatchAnswerCountSetting(ctx.rawTypeSettings, optionCount),
    optionCount,
  );
}

function matchTypeOf(ctx: MdLaneContext): ContentMatchPolarity {
  const resolved = (ctx.resolved as ContentMatchResolved).contentMatchType;
  if (resolved === "일치" || resolved === "불일치") return resolved;
  return readContentMatchTypeSetting(ctx.rawTypeSettings);
}

function optionLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readOptionLanguageSetting(ctx.rawTypeSettings, "CONTENT_MATCH") === "ko" ? "ko" : "en";
}

function labelsOf(ctx: MdLaneContext): string[] {
  return CONTENT_MATCH_MD_CIRCLED.slice(0, optionCountOf(ctx));
}

// ── 코어스(결정형 정렬) 재료 ────────────────────────────────────────────────
function labelRank(label: string): number {
  const index = (CONTENT_MATCH_LABELS as readonly string[]).indexOf(label);
  return index < 0 ? CONTENT_MATCH_LABELS.length : index;
}

/** 라벨 오름차순 안정 정렬 — 기계 확정 가능한 표시 결정론(SPEC §1-8). */
function sortRowsByLabel<T extends { label: string }>(
  rows: T[],
): { rows: T[]; changed: boolean } {
  const sorted = [...rows].sort((a, b) => labelRank(a.label) - labelRank(b.label));
  return { rows: sorted, changed: sorted.some((row, i) => row !== rows[i]) };
}

function labeledRowsOf(value: unknown): { label: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      label: typeof r.label === "string" ? r.label : "",
      text: typeof r.text === "string" ? r.text : "",
    };
  });
}

function evidenceRowsOf(value: unknown): { label: string; sentence: string }[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      label: typeof r.label === "string" ? r.label : "",
      sentence: typeof r.sentence === "string" ? r.sentence : "",
    };
  });
}

export const CONTENT_MATCH_LUNA_EXT: LunaLaneExt = {
  subType: "CONTENT_MATCH",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const labels = labelsOf(ctx);
    const optionCount = labels.length;
    const answerCount = answerCountOf(ctx);
    const matchType = matchTypeOf(ctx);
    const lang = optionLanguageOf(ctx);
    const answerSide = matchType === "일치" ? "일치하는" : "일치하지 않는";
    return {
      name: "content_match_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["options", "evidence", "answers", "explanation", "wrong"],
        properties: {
          // 본문성 큰 필드(진술문·근거 축자)를 앞에 — 필드 순서 = 스트리밍 도착 순서.
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
                      ? "진술문(한국어 한 문장) — 라벨·번호 없이 텍스트만. 근거 문장의 재진술(지문 문장 축자 복사 금지). 단독으로 읽어도 완결되는 세계에 대한 내용 진술(앞 진술을 대명사로 받거나 '이 글은 ~라고 본다'로 지문을 대상화하지 말 것)"
                      : "진술문(영어 한 문장) — 라벨·번호 없이 텍스트만. 근거 문장의 재진술(지문 문장 축자 복사 금지), 한글 금지. 단독으로 읽어도 완결되는 세계에 대한 내용 진술(It also…처럼 앞 진술을 받거나 The passage/The discussion/The author …로 지문을 대상화하지 말 것). 10~20단어",
                },
              },
            },
          },
          evidence: {
            type: "array",
            minItems: optionCount,
            maxItems: optionCount,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "sentence"],
              properties: {
                label: { type: "string", enum: labels },
                sentence: {
                  type: "string",
                  description:
                    "그 라벨 진술의 참·거짓이 확정되는 지문 문장 하나 — 지문에서 한 글자도 바꾸지 말고 마침표까지 통째로(요약·중략·두 문장 이어붙이기 금지)",
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
              matchType === "불일치"
                ? `지문의 내용과 ${answerSide} 진술(=정답)의 라벨 — 정확히 ${answerCount}개. 그 진술은 자기 근거 문장과 정면으로 충돌해야 한다(지문이 말하지 않은 정보를 덧붙이는 방식·배타 한정어 부착 금지)`
                : `지문의 내용과 ${answerSide} 진술(=정답)의 라벨 — 정확히 ${answerCount}개`,
          },
          explanation: {
            type: "string",
            description:
              "정답 해설(한국어, 합쇼체, 딱 2문장) — 첫 문장에 정답 라벨 원문자를 명시하고, 정답 진술이 근거 문장의 무엇과 어긋나는지/맞아떨어지는지만",
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
                  // 26-08-18 O225 해설 다이어트 — 판정 근거 1문장만(유혹·기제 서사 제거)
                  description:
                    matchType === "불일치"
                      ? "근거 문장이 이 진술을 왜 참으로 확정하는지 딱 1문장(한국어, 합쇼체) — 왜 틀린 것처럼 보이는지 같은 유혹·심리 서사 금지"
                      : "이 진술이 근거 문장의 무엇과 어긋나는지 딱 1문장(한국어, 합쇼체) — 기제 이름·왜 그럴듯한지 서술 금지",
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
    const rest = optionCount - answerCount;
    const matchType = matchTypeOf(ctx);
    const lang = optionLanguageOf(ctx);
    const labelRun = labels.join("");
    const firstLabel = labels[0];
    const secondLabel = labels[1] ?? labels[0];
    const lastLabel = labels[labels.length - 1];
    // 어긋나는 쪽 / 맞는 쪽 — 극성에 따라 정답·오답이 뒤집힌다.
    const falseSide = matchType === "일치" ? "오답 진술" : "정답 진술";
    const trueSide = matchType === "일치" ? "정답 진술" : "오답 진술";
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수)",
      `- 확정성(정답이 정확히 ${answerCount}개로 유일 확정·모든 진술이 자기 근거 문장 하나로 판정 확정)은 **제약**이다: 이를 깨는 진술·근거는 어떤 경우에도 내지 마라. 기출 형식(근거 지문 축자·지문 등장순·진술 길이 평행)도 양보 불가다.`,
      `- 그 제약 안에서는 **요청된 난이도에 맞는 표적 문장과 왜곡 지점**이 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 왜곡(훑기만 해도 드러나는 노골적 사실 뒤집기)으로 후퇴하는 것은 실패다 — 확정적이면서 난이도에 맞는 왜곡 지점은 거의 모든 지문에 있다.`,
      `- 전부를 동시에 만족할 수 없으면 **왜곡 기제 다양성·재진술 공예부터 양보하라** — 왜곡 기제가 겹쳐도 되고 재진술 강도를 낮춰도 된다. 그래도 막히면 왜곡 지점을 더 명시적인 사실(수치·시점·주체)로 옮겨라. 근거 축자·등장순·정답 유일성은 절대 양보하지 마라.`,
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      `- 진술문(options)은 정확히 ${optionCount}개, 라벨은 ${labelRun} 순서 그대로다. 근거(evidence)도 정확히 ${optionCount}개, 같은 라벨로 진술마다 하나씩이다.`,
      "- 근거는 그 진술의 참·거짓이 확정되는 지문 문장 **하나**를 지문에서 한 글자도 바꾸지 말고 마침표까지 통째로 옮긴다(60단어 이하). 요약·중략(...)·두 문장 이어붙이기·구두점이나 따옴표 변형·단어나 절만 인용하기 — 전부 반려된다. 지문에 없는 문장을 지어내도 반려된다.",
      `- 근거 ${optionCount}개는 **서로 다른 문장**이어야 한다(한 문장을 두 진술의 근거로 쓰면 반려). ${firstLabel}의 근거가 가장 앞, ${lastLabel}의 근거가 가장 뒤 — 지문 등장 순서와 라벨 순서가 하나라도 어긋나면 반려된다. 앞 두 문장에서 짜내지 말고 지문 전체를 고르게 훑으라.`,
      "- 진술문은 근거 문장의 **재진술**이다 — 지문 문장을 그대로 옮겨 적은 진술이 하나라도 있으면 반려된다. 각 진술은 12자 이상 240자 이하의 한 문장이고, 진술끼리 중복되면 반려된다.",
      lang === "ko"
        ? "- 진술문은 전부 한국어로 쓴다 — 한국어가 아닌 진술은 반려된다(지문에서 인용하는 고유명사·전문용어만 영어 허용)."
        : "- 진술문은 전부 영어로 쓴다 — 한글이 한 글자라도 섞이면 반려된다(해설과 오답 해설만 한국어다).",
      `- 진술 ${optionCount}개의 길이를 서로 맞춰라 — 기계 문턱은 3배지만 **가장 긴 진술이 가장 짧은 진술의 2배를 넘지 않게** 조여라.${lang === "en" ? " 영문 진술은 10~20단어(1~1.5행)가 기출 관행이다 — 25단어를 넘기지 마라." : ""} 기출 형식: 정답만 유독 길거나 짧거나 유독 조심스러운 표현("~한 경우도 있다")이면 그 형태만으로 찍힌다.`,
      `- **진술은 단독으로 완결돼야 한다** — 앞 진술을 대명사·접속 부사로 받는 진술(It also presumes …, They further …, "이 또한 ~")은 시험지에 실을 수 없다. ${optionCount}개 중 아무거나 하나만 떼어 읽어도 뜻이 통하는지 전수 확인하라.`,
      `- **지문을 대상화하지 마라** — "The passage portrays …", "The discussion assumes …", "The author argues …", "이 글은 ~라고 가정한다" 같은 메타 서술과 전언 프레임(is said to …, is identified as …)을 쓰지 말고 세계에 대한 내용 진술로 써라. 그런 틀이 ${optionCount}개 중 한둘에만 붙으면 지문을 안 읽고도 그 진술이 찍힌다 — ${optionCount}개의 서술 층위를 하나로 맞춰라.`,
      `- **${falseSide}의 어긋남은 근거 문장과의 정면 충돌이어야 한다** — 같은 주어·같은 관계를 반대로 말하기(인과·수단·수치·시점·조건의 반전). 지문이 말하지 않은 명제를 덧붙이는 방식으로 만들지 마라: 덧붙인 절을 지문 **전체**와 다시 대조해 다른 문장이 그것을 지지하거나 함의하면 그 진술은 참으로 읽혀 어긋남이 사라진다(무정답 사고). ${falseSide}을 완성한 뒤 "이 진술의 모든 절이 지문의 어느 문장과 정면으로 충돌하는가"를 절 단위로 자문하고, 충돌하는 절을 한 개도 못 대면 표적을 바꿔 다시 만들어라.`,
      `- **배타·절대 한정어로 어긋남을 만들지 마라** — only/exclusively/alone/no other/always/never/irrespective of/in every case("오직", "~만", "항상", "결코", "무관하게"). 지문이 그 배타성을 명시적으로 부정하지 않는 한 학생은 그 진술을 참으로 읽고, 그런 표지가 한 진술에만 있으면 형식만으로 찍힌다. 절대 표현을 쓸 거면 근거 문장 자체가 그 절대성을 명시적으로 진술하거나 부정하는 경우로 한정하라.`,
      `- **표적 문장의 자리를 지문 뒤쪽에 몰지 마라** — 어긋남을 늘 마지막 두 문장에 걸면 "끝 두 줄만 대조" 요령이 통하고 정답 라벨이 ${lastLabel} 쪽으로만 쏠린다. 확정성이 같다면 지문 전반부 문장을 표적으로 삼아 ${firstLabel}·${secondLabel}도 ${matchType === "일치" ? "정답" : "정답"}이 될 수 있게 하라(근거는 여전히 지문 등장순이어야 하므로, 표적을 앞으로 옮기는 것이 곧 정답 라벨을 앞으로 옮기는 길이다).`,
      matchType === "일치"
        ? `- 정답(answers)은 정확히 ${answerCount}개, 진술 라벨 집합 안의 라벨만. 정답 진술 ${answerCount}개만 지문 내용과 일치하고, 나머지 ${rest}개는 전부 지문과 어긋나야 한다. 각 진술을 자기 근거 문장과 나란히 놓고 판정이 뒤집히지 않는지 전수 확인하라 — 하나라도 뒤집히면 복수정답으로 문항이 무효다.`
        : `- 정답(answers)은 정확히 ${answerCount}개, 진술 라벨 집합 안의 라벨만. 정답 진술 ${answerCount}개만 지문 내용과 어긋나고, 나머지 ${rest}개는 전부 지문과 일치해야 한다. 각 진술을 자기 근거 문장과 나란히 놓고 판정이 뒤집히지 않는지 전수 확인하라 — 하나라도 뒤집히면 복수정답으로 문항이 무효다.`,
      `- 왜곡(지문과의 어긋남)은 진술당 **한 지점**에서만 건다 — 두 군데를 동시에 비틀면 어긋남이 확정되지 않아 시비가 난다. 지문에 없는 사실을 지어내 ${matchType === "일치" ? "오답" : "정답"}을 만들지 마라(무근거 진술은 지문을 안 읽어도 소거된다).`,
      "- 해설(explanation)은 누락 금지 — 딱 2문장, 합쇼체(-습니다). **첫 문장에 정답 라벨을 원문자로 명시하라**(예: \"⑤는 …\") — 해설만 읽고 어느 진술이 정답인지 알 수 없으면 해설지로 쓸 수 없다. 정답 진술이 근거 문장의 무엇과 어긋나는지(또는 맞아떨어지는지)만 쓰고, 지문에 없는 내용을 지어내지 마라.",
      `- 오답 해설(wrong)은 정답을 제외한 ${rest}개 전부에 하나씩 — 라벨이 중복되거나 정답 라벨이 끼면 반려된다. 합쇼체이며 **한국어만** 쓴다(선지의 영어 표현을 따다 인용하지 마라 — 지문 인용은 근거 필드가 맡는다). 각 줄은 판정 결론으로 끝내라: ${trueSide}이므로 "…하므로 ${matchType === "일치" ? "지문과 어긋납니다" : "참입니다"}" 로 ${rest}개 종결을 통일한다.`,
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 해설 딱 2문장(정답 라벨 명시·근거 문장 대조), 오답 해설 딱 1문장(근거 문장으로 왜 참인지/무엇과 어긋나는지). \"왜 그럴듯한지\"·\"왜 틀린 것처럼 보이는지\"·왜곡 기제 이름 같은 유혹·심리 서사는 쓰지 마라 — 판정 근거만, 짧을수록 좋다.",
      "- **구조 서술은 지어내지 마라** — \"이중 부정 구조라\", \"멀리 있는 선행사라\" 같은 문법·구조 설명은 그 진술과 근거 문장을 실제로 다시 읽어 그 구조가 **실재할 때만** 쓴다. 상투 템플릿을 복사해 없는 구조를 서술하면 해설 자체가 허위가 된다. 확인할 수 없으면 구조 언급 없이 뜻만 대조하라.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as Record<string, unknown>;
      const corrections: string[] = [];

      // 코어스: 라벨 오름차순 안정 정렬(기계 확정 — SPEC §1-8 표준 예시).
      // 스키마가 라벨 enum·개수를 강제하지만 배열 내 순서는 강제하지 못한다.
      const optionsSorted = sortRowsByLabel(labeledRowsOf(raw.options));
      if (optionsSorted.changed) corrections.push("선지 라벨 오름차순 재정렬");
      const evidenceSorted = sortRowsByLabel(evidenceRowsOf(raw.evidence));
      if (evidenceSorted.changed) corrections.push("근거 라벨 오름차순 재정렬");
      const wrongSorted = sortRowsByLabel(labeledRowsOf(raw.wrong));
      if (wrongSorted.changed) corrections.push("오답해설 라벨 오름차순 재정렬");

      const rawAnswers = Array.isArray(raw.answers)
        ? raw.answers.filter((a): a is string => typeof a === "string")
        : [];
      const answers = [...new Set(rawAnswers)].sort((a, b) => labelRank(a) - labelRank(b));
      if (answers.join("\u0000") !== rawAnswers.join("\u0000")) {
        corrections.push("정답 라벨 오름차순 정렬·중복 제거");
      }

      let q: MdContentMatchQuestion = {
        kind: "contentMatch",
        options: optionsSorted.rows,
        evidence: evidenceSorted.rows,
        answers,
        explanation: typeof raw.explanation === "string" ? raw.explanation : "",
        // 파서와 달리 정답 라벨이 낀 오답 줄을 걸러내지 않는다(견본 title.ts 동일) —
        // 게이트가 "오답해설에 정답 라벨 포함"으로 지목해야 재생성이 바로잡는다.
        wrong: wrongSorted.rows,
        // 게이트 #9 가 정답 라벨 인식 실패 시 "받은 값"으로 지목하는 원문.
        answerLine: rawAnswers.join(", "),
      };
      // 레인 스냅 재사용 — 근거 구두점 드리프트·절 인용을 지문 문장 축자로 복원.
      const snapped = autoSnapContentMatchEvidence(q, ctx.passage);
      q = snapped.question;
      return {
        question: q,
        gateIssues: gateMdContentMatch(q, ctx.passage, {
          optionCount: optionCountOf(ctx),
          answerCount: answerCountOf(ctx),
          optionLanguage: optionLanguageOf(ctx),
          teacherPoints: ctx.teacherPoints,
        }),
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

  // 근거 줄은 md 표면(`근거:` 구역) 동형으로 방류한다 — 지문 축자라 사용자에게
  // 진행감을 주는 본문성 필드다. 메타 배열이 아니므로 침묵시키지 않는다.
  bridgeSpecs: [
    { path: "options[].label", prefix: "\n" },
    { path: "options[].text", prefix: " " },
    { path: "evidence[].label", prefix: "\n근거 " },
    { path: "evidence[].sentence", prefix: " " },
    { path: "answers[]", prefix: "\n정답: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
    { path: "wrong[].label", prefix: "\n" },
    { path: "wrong[].text", prefix: " " },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    // 어댑터 산출 direction(교사 설정 결정론)이 있으면 그대로, 없으면 수능 표준형.
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : contentMatchDirection("불일치", 1, "ko");
    const options = Array.isArray(aiQuestion.options)
      ? (aiQuestion.options as Array<Record<string, unknown>>)
          .map((o) => {
            // 어댑터 저장 축은 "1"~"12" — 학생 표면 관행인 원문자로 되돌린다.
            const rawLabel = String(o.label ?? "");
            const n = Number(rawLabel);
            const circled =
              Number.isInteger(n) && n >= 1 && n <= CONTENT_MATCH_LABELS.length
                ? CONTENT_MATCH_LABELS[n - 1]
                : rawLabel;
            return `${circled} ${String(o.text ?? "")}`;
          })
          .join("\n")
      : "";
    return `${direction}\n\n${passage}\n\n${options}`;
  },
};
