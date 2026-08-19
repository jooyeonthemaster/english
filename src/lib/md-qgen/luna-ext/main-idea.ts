// ============================================================================
// MAIN_IDEA(요지·주장) luna 레인 확장 — 전 유형 이식 캠페인(SPEC 정본).
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 선택형 계열(지문 무변형) — 재구성 계약이 없다. 지문과 문항을 잇는 유일한
// 결정형 앵커는 evidence(md `근거:` 줄 동형 — 정답 논지가 가장 압축된 지문
// 문장의 축자 복사)이고, 게이트 #7 이 그 필드만 지문과 대조한다(gate-main-idea).
// 형식 노브 4개(선지수·정답수·선지언어·극성)가 ctx 를 따라 움직이는 동적
// 스키마다. 파싱 산출물은 MdMainIdeaQuestion 동형 — 레인의 스냅(autoSnapMainIdea)·
// 게이트(gateMdMainIdea)·어댑터(레인 adapt)를 전부 재사용한다.
//
// 발문은 스키마에 두지 않는다 — 어댑터(adapter-main-idea.ts)가 발문축(stemAxis)
// × 극성 × 복수정답 × 언어 16종을 결정형으로 만드는 것이 이 유형의 계약이라,
// 모델은 stemAxis 한 단어만 고른다(md 계약의 `발문형:` 줄과 동형).
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  clampMainIdeaMdAnswerCount,
  clampMainIdeaMdOptionCount,
  MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT,
  MAIN_IDEA_MD_LABELS,
  MAIN_IDEA_MD_OPTION_COUNT_DEFAULT,
  type MainIdeaOptionLanguage,
  type MainIdeaPolarity,
} from "../prompts-main-idea";
import {
  autoSnapMainIdea,
  type MdMainIdeaQuestion,
} from "../parser-main-idea";
import { gateMdMainIdea } from "../gate-main-idea";
import { normalizeWs } from "../parser";
import { readOptionLanguageSetting } from "@/lib/question-type-generation-settings";

interface MainIdeaResolved {
  genericOptionCount?: number;
  genericAnswerCount?: number;
  answerPolarity?: MainIdeaPolarity;
}

const LABEL_LIST: readonly string[] = MAIN_IDEA_MD_LABELS;
const labelIndex = (label: string): number => LABEL_LIST.indexOf(label);

function optionCountOf(ctx: MdLaneContext): number {
  return clampMainIdeaMdOptionCount(
    (ctx.resolved as MainIdeaResolved).genericOptionCount ??
      MAIN_IDEA_MD_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampMainIdeaMdAnswerCount(
    (ctx.resolved as MainIdeaResolved).genericAnswerCount ??
      MAIN_IDEA_MD_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

/** 극성 — 레인과 동일 판독(미설정이면 POSITIVE, 리졸버가 키를 안 싣는다). */
function isNegativeOf(ctx: MdLaneContext): boolean {
  return (ctx.resolved as MainIdeaResolved).answerPolarity === "NEGATIVE";
}

/** 선지 언어 — MAIN_IDEA 기본은 한국어 진술문(레인과 동일 판독). */
function optionLanguageOf(ctx: MdLaneContext): MainIdeaOptionLanguage {
  return readOptionLanguageSetting(ctx.rawTypeSettings, "MAIN_IDEA") === "en" ? "en" : "ko";
}

function labelsOf(ctx: MdLaneContext): string[] {
  return [...LABEL_LIST.slice(0, optionCountOf(ctx))];
}

// ── 형식 tell 검사(luna 전용 보강 게이트) ────────────────────────────────────
// 근거: MAIN_IDEA paired 벤치(24문항) 실측 판정. 공유 게이트 #4·#5 를 클린 통과한
// 문항에서 **luna 팔에만** 세 계통의 반려 사유가 나왔다 — gemini 팔은 같은 지표에서
// 0건이었다(임계는 gemini 실측 분포 위에 잡았으므로 오반려 여지가 좁다).
//   (a) 정답이 형식만으로 표남: 정답이 최장이면서 최단과 편차 19자↑ 또는 1.4배↑
//       (Q10 1.82배·Q15 1.83배·Q11 1.61배·Q06 1.47배 — gemini 최대 1.28배)
//   (b) 앞머리 축자 공유 거울쌍: 정답과 방향반대 오답이 앞 10자 이상을 그대로
//       공유하고 뒤 절만 A/B 를 맞바꿔, 지문을 읽지 않아도 후보가 2개로 좁혀짐
//       (Q16 26자·Q10 21자·Q11 16자·Q03 15자·Q20 12자 — gemini 최대 5자)
//   (c) 문맥 의존 선지: 다른 선지를 지시어로 받는 선지(Q15 ⑤ "이러한 불일치를
//       해소하려면" 의 선행사가 지문이 아니라 정답 선지 ④). 저장 단계에서 선지
//       순서가 재배열되면 아예 성립하지 않는다.
// 공유 게이트(gate-main-idea.ts)는 손대지 않는다 — 여기서 luna 출력에만 덧대고,
// 반려는 재생성 피드백으로 흘러 모델이 검산 문장에 맞춰 다시 쓴다.
// 한글 뒤에서는 \b(=[A-Za-z0-9_] 경계)가 성립하지 않는다 — 공백·구두점 예측으로 끊는다.
const CROSS_REF_OPENER =
  /^(?:이러한|이와\s*같은|그러한|그와\s*같은|이런|그런|위와\s*같은|앞서|앞의|이를|그것을|그것이|따라서|그러므로|그러나|반면|하지만)(?=[\s,·]|$)/;

/**
 * 정답 라벨 자리 — 지문 해시 + variantIndex 로 결정론적으로 흩는다.
 * r2 프로브에서 자리를 variantIndex 하나로만 잡았더니 단일 변형 잡(variantIndex=0)
 * 이 8/8 전부 ① 이 되었다 — 모델이 지시를 그대로 따르는 만큼, 지시가 한 자리를
 * 가리키면 세트 전체가 그 자리에 쏠려 '① 찍기' 요령이 생긴다(r1 gemini 는 ③ 58%,
 * r1 luna 는 ① 50% 로 양팔 공통 결함이었다). 지문마다 자리가 달라지게 섞는다.
 */
function answerSlotOf(ctx: MdLaneContext, optionCount: number): string {
  const src = ctx.passage ?? "";
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return LABEL_LIST[((h >>> 0) + (ctx.variantIndex ?? 0)) % optionCount];
}

/** 두 문자열이 앞머리에서 축자로 공유하는 글자 수. */
function sharedPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

export function mainIdeaFormatTellIssues(
  options: Array<{ label: string; text: string }>,
  answers: string[],
  lang: MainIdeaOptionLanguage,
): string[] {
  const v: string[] = [];
  const items = options
    .map((o) => ({ label: o.label, text: normalizeWs(o.text ?? "") }))
    .filter((o) => o.text.length > 0);
  if (items.length < 2) return v;

  // (a)+(강화) 길이 tell — 정답 지목형과 전체 불균형형 둘 다.
  const lens = items.map((o) => o.text.length);
  const max = Math.max(...lens);
  const min = Math.min(...lens);
  const ratio = min > 0 ? max / min : 1;
  const longest = items[lens.indexOf(max)];
  const shortest = items[lens.indexOf(min)];
  const answerSet = new Set(answers);
  const answerIsLongest = answerSet.has(longest.label);
  const diffTrips = lang === "ko" ? max - min >= 19 : false;
  if (answerIsLongest && (diffTrips || ratio >= 1.4)) {
    v.push(
      `정답이 길이로 드러남 — 정답 ${longest.label}이 최장(${max}자)이고 최단 ${shortest.label}(${min}자)의 ${ratio.toFixed(2)}배다. 정답을 최장 선지로 만들지 말고 선지 ${items.length}개 길이를 고르게(최장이 최단의 1.4배 미만) 다시 써라`,
    );
  } else if (ratio >= 1.6) {
    v.push(
      `선지 길이 불균형(형식 tell) — 최장 ${longest.label}(${max}자) 대 최단 ${shortest.label}(${min}자) ${ratio.toFixed(2)}배. 길이만으로 후보가 좁혀지지 않도록 고르게 다시 써라`,
    );
  }

  // (b) 앞머리 축자 공유 — 정답이 낀 쌍은 정답 노출이므로 임계를 더 낮게 본다.
  const headLimit = lang === "ko" ? 10 : 16;
  const headLimitWithAnswer = lang === "ko" ? 8 : 14;
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const shared = sharedPrefixLen(items[i].text, items[j].text);
      const withAnswer = answerSet.has(items[i].label) || answerSet.has(items[j].label);
      const limit = withAnswer ? headLimitWithAnswer : headLimit;
      if (shared >= limit) {
        v.push(
          `선지 ${items[i].label}${items[j].label} 가 앞머리 ${shared}자를 축자로 공유함('${items[i].text.slice(0, shared)}')${
            withAnswer ? " — 정답이 낀 쌍이라 후보가 둘로 좁혀진다" : ""
          }. 특히 뒤 절만 A/B 를 맞바꾼 거울쌍은 금지 — 두 선지의 주어·앞머리를 서로 다르게 다시 써라`,
        );
      }
    }
  }

  // (c) 문맥 의존 선지 — 선지는 홀로 판정 가능한 독립 진술이어야 한다.
  for (const o of items) {
    if (CROSS_REF_OPENER.test(o.text)) {
      v.push(
        `${o.label} 선지가 다른 선지를 지시어로 받음: '${o.text.slice(0, 24)}…' — 선지 순서는 저장 단계에서 재배열되므로 각 선지는 지문만 보고 홀로 판정되는 독립 진술이어야 한다`,
      );
    }
  }
  return v;
}

export const MAIN_IDEA_LUNA_EXT: LunaLaneExt = {
  subType: "MAIN_IDEA",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const labels = labelsOf(ctx);
    const optionCount = labels.length;
    const answerCount = answerCountOf(ctx);
    const wrongCount = optionCount - answerCount;
    const lang = optionLanguageOf(ctx);
    const negative = isNegativeOf(ctx);
    return {
      name: "main_idea_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["stemAxis", "evidence", "options", "answers", "explanation", "wrong"],
        properties: {
          stemAxis: {
            type: "string",
            enum: ["요지", "주장"],
            description:
              "발문축 한 단어 — 필자가 당위·권고를 직접 밀면 주장, 현상·원리의 종합이면 요지",
          },
          evidence: {
            type: "string",
            description:
              "글의 요지가 가장 압축된 지문 문장 하나(5~60단어) — 지문 축자, 한 글자도 바꾸지 말 것",
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
                      ? "요지 선지 — 한국어 완결 진술문('~다.' 류 종결), 라벨·번호 없이 문장만, 개행 금지. 길이는 40~55자로 다른 선지와 고르게(정답만 길면 반려), 다른 선지와 앞머리 10자 이상을 축자 공유하지 말 것(거울쌍 금지), 다른 선지를 지시어로 받지 않는 독립 진술일 것"
                      : "요지 선지 — 영어 완전한 문장, 라벨·번호 없이 문장만, 개행 금지. 길이는 다른 선지와 고르게(최장이 최단의 1.4배 미만), 앞머리 축자 공유·다른 선지 참조 금지",
                },
              },
            },
          },
          answers: {
            type: "array",
            minItems: answerCount,
            maxItems: answerCount,
            items: { type: "string", enum: labels },
            description: negative
              ? "정답 라벨(들) — 요지로 적절하지 **않은** 선지의 라벨"
              : "정답 라벨(들) — 글의 요지를 가장 잘 담은 선지의 라벨",
          },
          explanation: {
            type: "string",
            description: "정답 해설(한국어, 합쇼체) — 근거 문장 연결과 정답 도출만 딱 2문장",
          },
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
                  description: negative
                    ? "이 선지가 왜 요지로 타당한지(=왜 정답이 아닌지) 지문 근거로 1문장(한국어, 합쇼체)"
                    : "이 오답이 왜 탈락인지 판정 근거 딱 1문장(한국어, 합쇼체) — 매력 이유·기제 이름·심리 서사 금지",
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
    const labelRun = LABEL_LIST.slice(0, optionCount).join("");
    const lang = optionLanguageOf(ctx);
    const negative = isNegativeOf(ctx);
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식): 확정성=제약으로 강등, 난이도 정합=목표로 승격.
      "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
      `- 판정 확정성(evidence 축자·정답 유일·${
        negative ? "타당 선지 전원 방어 가능" : "오답 전원 확정 탈락"
      })은 **제약**이다 — 어떤 경우에도 양보하지 마라. 기출 형식(완결 진술문·**선지 길이 평행·앞머리 비공유·선지 독립**·정답 무표식), 특히 아래 **(기계 검사)** 표시가 붙은 형식 항목도 양보 불가다.`,
      "- 그 제약 안에서는 **요청된 난이도에 맞는 오답 설계**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 오답(한눈에 지워지는 근거 없음·지문 밖 소재)으로 후퇴하는 것은 실패다 — 확정 탈락이면서 난이도에 맞게 매력적인 오답은 거의 모든 지문에서 만들 수 있다.",
      "- 막히면 3순위(오답 기제 다양성·표현 공예)부터 양보하라 — 오답 다섯 기제를 다 채우지 못해도 되고 표현이 밋밋해도 된다.",
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      "- evidence 는 지문에 한 글자도 다르지 않게 실재하는 문장 **하나**(5~60단어)여야 한다. 따옴표·굵게 장식 없이 원문 그대로 옮겨라 — 지문에 없는 문장이면 문항 전체가 반려된다.",
      ...(ctx.teacherPoints.length > 0
        ? [
            "- 교사 지정 출제 포인트 문장 중 **하나를 그대로** evidence 로 옮겨라 — 다른 문장을 고르면 반려된다. 지정 문장이 여럿이면 정답 논지가 가장 압축된 것을 evidence 로 쓰고, 나머지 문장의 논지도 정답 선지와 해설에 반영하라.",
          ]
        : []),
      `- 선지는 정확히 ${optionCount}개, 라벨은 ${labelRun} 순서 그대로다. 선지 텍스트에 라벨·번호(①·1.·(1))를 다시 쓰지 마라.`,
      lang === "ko"
        ? `- 선지 ${optionCount}개는 전부 한국어 **완결 진술문**('~다.' 류 종결)이어야 한다. 영어 문장이 섞이거나, 명사구 제목("...의 중요성"·"...에 대한 고찰")로 쓰면 반려된다.`
        : `- 선지 ${optionCount}개는 전부 영어 완전한 문장이어야 한다 — 한국어가 섞이면 반려된다.`,
      "- 선지는 개행 없이 완결된 한 문장이다 — 쉼표나 연결어미(…며/…지만/…하고)로 끝나면 잘린 선지로 판정되어 반려된다.",
      "- 선지 어느 위치에도 정답 표시((정답)·← 정답·✅ 류)를 달지 마라 — 정답의 유일한 진실원은 answers 필드다(표시가 남으면 시험지에 정답이 인쇄된다).",
      `- 두 선지가 같은 진술이거나 한 선지가 다른 선지를 통째로 담으면 반려된다 — 서로 배타적인 진술 ${optionCount}개여야 한다(복수정답 시비 = 문항 무효).`,
      // ── 형식 tell 3계통(실측 반려 사유) — 기계 검사가 그대로 다시 잡는다 ──
      lang === "ko"
        ? `- **길이 tell 금지(기계 검사)**: 선지 ${optionCount}개를 40~55자 안에서 고르게 쓰고, 최장이 최단의 1.4배를 넘거나 19자 이상 길면 반려된다. 특히 **정답을 최장 선지로 만들지 마라** — 정답만 '양보절+결론'·'대조 2절' 같은 종합문이고 나머지가 단문이면, 지문을 읽지 않아도 가장 길고 가장 포괄적인 선지가 정답으로 지목된다(실측 최다 반려 사유). 정답이 길어지면 오답을 늘리지 말고 **정답을 줄여라**.`
        : `- **길이 tell 금지(기계 검사)**: 최장 선지가 최단의 1.4배를 넘으면 반려된다. 정답을 최장 선지로 만들지 마라 — 가장 길고 가장 포괄적인 선지가 정답이라는 요령에 노출된다.`,
      `- **거울쌍·앞머리 공유 금지(기계 검사)**: 어느 두 선지도 앞머리를 ${
        lang === "ko" ? "10자(정답이 낀 쌍은 8자)" : "16자(정답이 낀 쌍은 14자)"
      } 이상 축자로 공유하면 반려된다. 정답과 그 정면 반대 진술을 같은 앞머리로 시작해 뒤 절만 'A보다 B' ↔ 'B보다 A' 로 맞바꾸는 거울쌍이 최악이다 — 지문을 안 읽어도 정답 후보가 그 둘로 좁혀진다. 오답은 정답의 부정문이 아니라 **다른 소재·다른 주어**로 만들고, 정답과 가장 매력적인 오답을 이웃한 라벨에 나란히 두지 마라.`,
      "- **독립 선지(기계 검사)**: 선지는 다른 선지를 지시어로 받지 마라('이러한 불일치를 해소하려면…'·'그러한 경향은…'·'따라서…'). 선지 순서는 저장 단계에서 재배열되므로 앞 선지에 기대는 선지는 아예 성립하지 않는다 — 각 선지는 지문만 읽고 홀로 참·거짓이 판정되는 완결 진술이어야 한다.",
      "- 선지 추상도 평행: 절대 표현(반드시·결코·전혀·항상·완전히)을 일부 선지에만 몰지 말고, '제도·정책·법·규제를 마련해야 한다' 류 당위 오답을 문항마다 습관적으로 한 자리씩 채워 넣지 마라(전부 오답인 고정 패턴은 읽지 않고도 소거된다).",
      `- 정답 라벨 자리를 습관적으로 ${LABEL_LIST[0]}·${LABEL_LIST[2]} 에 몰지 마라(정답 번호가 한 자리에 쏠리면 찍기 요령이 생긴다) — 선지 배열 순서는 내용과 무관하므로, 이번 문항의 정답은 **${answerSlotOf(
        ctx,
        optionCount,
      )} 자리**에 두고 나머지 ${optionCount - 1}개를 다른 자리에 배치하라.`,
      `- answers 는 정확히 ${answerCount}개이고 전부 선지 라벨 집합 안에 있어야 한다.`,
      negative
        ? `- 이 문항의 정답은 요지로 **적절하지 않은** 선지 ${answerCount}개다. 정답(부적절) 선지는 지문과 대조하면 결정적으로 어긋나야 하고(evidence 문장의 축자 복사도 반려된다), 나머지 ${wrongCount}개는 전부 지문 근거로 방어 가능한 타당한 진술이어야 한다 — 하나라도 흔들리면 정답이 둘이 되어 문항이 무효다.`
        : `- 정답 선지는 evidence 문장의 번역·축자 복사가 아니라 글 전체 논지의 **재진술**이어야 한다(축자 복사면 반려). 오답 ${wrongCount}개는 전부 지문에 실재하는 소재로 만들되 방향반대·도입부함정·범위확대·부분승격·근거없음 중 서로 다른 기제로 **확정** 탈락해야 한다 — 문맥상 성립 가능한 오답이 남으면 복수정답 시비가 난다.`,
      "- explanation 은 한국어 20자 이상, 합쇼체(-습니다)로 통일하라. 해설·오답 해설에서 선지를 번호(①·1번)로 지칭하지 마라 — 선지 순서는 저장 단계에서 재배열된다. 지칭이 필요하면 선지 내용을 인용하라.",
      `- wrong 은 정답을 제외한 ${wrongCount}개 전부에 라벨당 정확히 하나씩이어야 한다. 정답 라벨이 끼거나, 라벨이 중복되거나, 하나라도 빠지거나, 항목이 6자 미만이면 반려된다.`,
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 1~2문장·오답 딱 1문장, 유혹·심리 서사 금지 — 짧을수록 좋다.",
      "- 해설·오답 해설의 구조 서술(전환·인과·예시 위치 등)은 실제 지문을 재확인한 사실만 쓰라 — 지문에 없는 내용을 지어내면 반려 사유다.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        stemAxis: string;
        evidence: string;
        options: Array<{ label: string; text: string }>;
        answers: string[];
        explanation: string;
        wrong: Array<{ label: string; text: string }>;
      };
      const corrections: string[] = [];
      const optionCount = optionCountOf(ctx);
      const expected = LABEL_LIST.slice(0, optionCount).join("");

      // 코어스 1: 선지 라벨 순열 재정렬 — 라벨 집합이 정확히 기대 집합인데 순서만
      // 어긋난 경우에 한해 기계 확정 교정한다(중복·이탈 라벨은 게이트가 지목).
      let options = raw.options.map((o) => ({ label: o.label, text: o.text }));
      if (options.map((o) => o.label).join("") !== expected) {
        const sorted = [...options].sort((a, b) => labelIndex(a.label) - labelIndex(b.label));
        if (sorted.map((o) => o.label).join("") === expected) {
          options = sorted;
          corrections.push("선지 라벨 오름차순 재정렬");
        }
      }

      // 코어스 2: 정답 라벨 중복 제거 — 중복은 정보가 없고, 제거해야 게이트가
      // "정답 N개 (K개 필요)" 라는 참원인으로 반려한다(은폐 방지).
      const answers = raw.answers.filter((a, i) => raw.answers.indexOf(a) === i);
      if (answers.length !== raw.answers.length) {
        corrections.push("정답 라벨 중복 제거");
      }

      let q: MdMainIdeaQuestion = {
        kind: "mainIdea",
        stemAxis: raw.stemAxis === "주장" ? "주장" : "요지",
        evidence: raw.evidence,
        options,
        answers,
        explanation: raw.explanation,
        // 코어스 3: 오답 해설 라벨 오름차순 정렬(표시 결정론 — 어법·빈칸·TITLE 동일).
        wrong: [...raw.wrong].sort((a, b) => labelIndex(a.label) - labelIndex(b.label)),
        // JSON 경로에는 md 섹션 앵커 개념이 없다 — 필드 존재가 곧 앵커다(게이트 #0).
        anchors: { answer: true, wrong: true },
      };
      const snapped = autoSnapMainIdea(q, ctx.passage);
      q = snapped.question;
      const lang = optionLanguageOf(ctx);
      const gateIssues = gateMdMainIdea(q, ctx.passage, {
        optionCount,
        answerCount: answerCountOf(ctx),
        optionLanguage: lang,
        teacherPoints: ctx.teacherPoints.map((point) => point.text),
      });
      // 선지 개수·라벨축이 이미 깨진 상태에서 tell 검사를 얹으면 참원인이 묻힌다
      // (철칙 3 은폐 금지) — 공유 게이트가 클린일 때만 형식 tell 을 덧댄다.
      if (gateIssues.length === 0) {
        gateIssues.push(...mainIdeaFormatTellIssues(q.options, q.answers, lang));
      }
      return {
        question: q,
        gateIssues,
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
    { path: "stemAxis", prefix: "발문형: ", suffix: "\n" },
    { path: "evidence", prefix: "근거: ", suffix: "\n" },
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
            // 어댑터 저장 라벨은 "1"~"8" — 학생 표면은 원문자 관습이라 되돌린다.
            const rawLabel = String(o.label ?? "");
            const n = Number(rawLabel);
            const label =
              Number.isInteger(n) && n >= 1 && n <= LABEL_LIST.length
                ? LABEL_LIST[n - 1]
                : rawLabel;
            return `${label} ${String(o.text ?? "")}`;
          })
          .join("\n")
      : "";
    return `${direction}\n\n${passage}\n\n${options}`;
  },
};
