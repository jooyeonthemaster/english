// ============================================================================
// SUMMARY_WRITING(요약문 영작) luna 레인 확장.
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 패밀리 특칙(writing) 적용 노트 — 이 유형은 **선지 없는 서술형**이다.
//  · 허용 답안 집합 = blanks[].variants(어댑터의 acceptableVariants). 검산 블록에
//    "표기 변형(축약형·관사·대소문자·구문 전환) 전부 나열" 규칙을 넣었다(§패밀리 특칙).
//  · 발문·모범답안·미끼는 스키마에 **필드 자체가 없다** — 발문은 설정 결정론 합성값,
//    모범답안은 요약문+정답 치환 파생, 미끼는 잔여 칩 파생(md 레인 철칙 1과 동일).
//    받는 순간 "모범답안 ≠ 요약문+정답" 같은 실패 모드가 새로 생기기 때문이다.
//  · 지문 무변형이라 재구성 계약이 없다(reconstructionEq 소비처 없음). 그 등가물은
//    ① 라벨 정합(요약문에 (A)… 각 1회·순서대로) ② 지문 축자 복사 금지(모범답안
//    내용어 6토큰+ 연속 겹침 반려) ③ 정답 누수 금지(정답 어구가 요약문에 통째)이며
//    셋 다 검산 블록에 전사했다.
// 파싱 산출물은 MdSummaryWritingQuestion 동형으로 조립해 레인의 스냅(autoSnap)·
// 설정 집행(enforce)·게이트(gateMdSummaryWriting)·어댑터를 전부 재사용한다.
// 설정 해석도 레인과 같은 결정 소스(resolveSummaryWritingSettings)를 쓴다 —
// 레인 lane-summary-writing.ts:59 와 같은 함수·같은 인자라 값이 갈릴 수 없다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  clampSummaryWritingMdBlankCount,
  summaryWritingDistractorNeed,
  summaryWritingMdLabels,
} from "../prompts-summary-writing";
import {
  summaryWritingLabel,
  type MdSummaryWritingBlank,
  type MdSummaryWritingQuestion,
} from "../parser-summary-writing";
import { autoSnapSummaryWriting } from "../snap-summary-writing";
import {
  enforceSummaryWritingSettings,
  gateMdSummaryWriting,
  type SummaryWritingGateOptions,
} from "../gate-summary-writing";
import {
  buildSummaryWritingDirection,
  resolveSummaryWritingSettings,
  type ResolvedSummaryWritingSettings,
} from "@/lib/question-type-generation-settings";
import { summaryWritingStudentParts } from "@/lib/summary-writing";

/** 레인(lane-summary-writing.ts:59)과 동일한 설정 결정 소스 — 결정론이라 갈릴 수 없다. */
function settingsOf(ctx: MdLaneContext): ResolvedSummaryWritingSettings {
  return resolveSummaryWritingSettings(ctx.rawTypeSettings, ctx.rawDifficulty);
}

/** 레인 gateOptionsOf(lane-summary-writing.ts:75)와 같은 매핑 — 게이트 판정 축 동기. */
function gateOptionsOf(
  settings: ResolvedSummaryWritingSettings,
): SummaryWritingGateOptions {
  return {
    blankCount: clampSummaryWritingMdBlankCount(settings.blankCount),
    glossEnabled: settings.glossEnabled,
    wordBankEnabled: settings.wordBankEnabled,
    wordBankUsage: settings.wordBankUsage,
    boxDistractors: settings.boxDistractors,
    targetWordsMode: settings.targetWordsMode,
    targetWordsPerBlank: settings.targetWordsPerBlank,
    requireCriteria: settings.scoringGranularity === "rubric",
    // 표제어는 LEMMA 채점(=keyword)에서만 읽힌다(grade.ts:52) — 레인과 동일 근거.
    requireLemmas: settings.scoringGranularity === "keyword",
  };
}

/** 목표 단어 수 규칙 문구 — 스키마 description·검산 블록이 같은 문구를 공유한다. */
function wordRuleOf(s: ResolvedSummaryWritingSettings): string {
  if (s.targetWordsMode === "exact") {
    return `정확히 ${s.targetWordsPerBlank}단어(발문이 못박음 — 세어 보고 어긋나면 다시 짜라)`;
  }
  if (s.targetWordsMode === "approx") {
    return `${Math.max(2, s.targetWordsPerBlank - 2)}~${s.targetWordsPerBlank + 2}단어(발문이 약 ${s.targetWordsPerBlank}단어를 안내함)`;
  }
  return `2단어 이상(단어 수는 학생에게 비노출 — 대략 ${s.targetWordsPerBlank}단어 규모로 설계)`;
}

export const SUMMARY_WRITING_LUNA_EXT: LunaLaneExt = {
  subType: "SUMMARY_WRITING",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const s = settingsOf(ctx);
    const blankCount = clampSummaryWritingMdBlankCount(s.blankCount);
    const labels = summaryWritingMdLabels(blankCount);
    const needLemmas = s.scoringGranularity === "keyword";
    const wordRule = wordRuleOf(s);

    const chipUnit =
      s.wordBankChunking === "chunk"
        ? "단어 또는 짧은 의미 덩어리(2~3단어, 한 칩이 빈칸 정답의 절반 이상을 담으면 안 됨)"
        : s.wordBankChunking === "mixed"
          ? "단어 단위 기본, 일부만 짧은 덩어리"
          : "단어 하나";
    const usageRule =
      s.wordBankUsage === "useAll"
        ? "칩 전체가 모든 빈칸 정답을 정확히 덮어야 한다 — 남는 칩도 모자란 칩도 0개(미끼 없음)"
        : s.wordBankUsage === "usePartial"
          ? `어느 정답에도 쓰이지 않는 미끼 칩을 ${summaryWritingDistractorNeed(s)}개 이상 섞어라(정답 단어의 동의어·활용형·역방향 단어)`
          : "정답 조립에 필요한 칩은 전부 포함하라(여분 칩 허용)";
    const fidelityRule =
      s.wordBankFidelity === "verbatim"
        ? "칩 형태 그대로 쓰면 정답이 된다(정답 단어와 칩이 한 글자도 다르면 안 됨)"
        : s.wordBankFidelity === "inflected"
          ? "칩은 기본형, 정답에서는 시제·수·태를 맞춘 활용형(틀린 형태를 주고 고치게 하는 것은 금지)"
          : "일부 칩만 기본형, 나머지는 그대로 쓰이는 형태";

    // 빈칸 항목 — 파서 산출물 MdSummaryWritingBlank 와 동형. lemmas 는 keyword
    // 채점에서만 받는다(그 외 모드에선 읽히지도 않는 필드로 반려가 나는 실패 모드를
    // 필드 부재로 구조적으로 소멸 — 게이트 requireLemmas 주석과 동일 근거).
    const blankProperties: Record<string, unknown> = {
      label: { type: "string", enum: labels },
      answer: {
        type: "string",
        description: `이 빈칸에 들어갈 영어 어구 — ${wordRule}. 요약문의 라벨 자리에 대입하면 문법이 맞는 완전한 문장이 되어야 한다. 지문 문장의 축자 복사 금지, 다른 빈칸 정답과 중복 금지.`,
      },
      variants: {
        type: "array",
        items: {
          type: "string",
          description:
            "동치 정답 하나 — 그 빈칸에 그대로 들어가는 완전한 영어 어구(조각 금지)",
        },
        description:
          s.scoringGranularity === "exact"
            ? "허용 답안 집합 — 자동채점이 이 집합과의 정확 일치로만 판정한다. 어순·동의구문·표기 변형 동치를 빠짐없이 나열하되, 확신 없는 변형은 넣지 마라(집합에 든 문자열은 무조건 만점 처리된다)."
            : "허용 답안 집합 — 어순·구문이 다른 동치 정답 0~3개. 확신 있는 것만, 없으면 빈 배열.",
      },
      ...(needLemmas
        ? {
            lemmas: {
              type: "array",
              minItems: 1,
              items: {
                type: "string",
                description:
                  "핵심 단어 하나 — 소문자 한 단어, 정답 어구에 실제로 등장하는 형태 그대로",
              },
              description:
                "부분점수 채점 근거 — 그 빈칸 정답에 반드시 들어가야 할 핵심 내용어만(기능어 제외)",
            },
          }
        : {}),
    };

    return {
      name: "summary_writing_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "summary",
          ...(s.glossEnabled ? ["gloss"] : []),
          ...(s.wordBankEnabled ? ["chips"] : []),
          "blanks",
          "criteria",
          "explanation",
        ],
        properties: {
          // 본문성 필드 최선두 — 스트리밍 도착 순서 = 사용자 표면 순서.
          summary: {
            type: "string",
            description: `글 전체를 압축한 영어 한 문장 요약문 — 빈칸 라벨 ${labels.join(", ")} 가 각각 정확히 1회, ${labels.join(" → ")} 순서로 들어간다. 라벨만 쓰고 밑줄(____)·정답 어구를 넣지 마라. 라벨 제외 6단어 이상.`,
          },
          ...(s.glossEnabled
            ? {
                gloss: {
                  type: "string",
                  description:
                    "요약문 전체 의미의 한국어 한 문장 — 빈칸(정답) 구간은 1:1 직역하지 말고 상위 개념으로 뭉갠다",
                },
              }
            : {}),
          ...(s.wordBankEnabled
            ? {
                chips: {
                  type: "array",
                  minItems: 2,
                  items: {
                    type: "string",
                    description: `[보기] 칩 하나 — ${chipUnit}. 라벨·콜론·불릿·메모 금지, 칩 텍스트만.`,
                  },
                  description: `[보기] 칩 목록. ${usageRule}. ${fidelityRule}. 같은 단어가 정답에 2회 필요하면 같은 문자열을 2개 넣어라(×2 규약). 나열 순서는 정답 어순을 피해 셔플.`,
                },
              }
            : {}),
          blanks: {
            type: "array",
            minItems: blankCount,
            maxItems: blankCount,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "answer", "variants", ...(needLemmas ? ["lemmas"] : [])],
              properties: blankProperties,
            },
          },
          criteria: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: {
              type: "string",
              description:
                "채점 기준 항목 한 줄(한국어) — '의미: 2점' 처럼 채점 축과 배점",
            },
            description:
              s.scoringGranularity === "rubric"
                ? "루브릭 채점의 판단 근거 — 항목별 배점을 한국어로(권장 2~3개)"
                : "부분점수 참고용 채점 축(한국어, 1개 이상)",
          },
          explanation: {
            type: "string",
            // 26-08-18 O225 해설 다이어트
            description:
              "정답 해설 — 한국어 합쇼체(-습니다) 1~2문장: 정답 어구가 지문의 어느 근거에서 도출되는지만(판정 근거). 학생 심리·출제 의도 서사 금지",
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const s = settingsOf(ctx);
    const blankCount = clampSummaryWritingMdBlankCount(s.blankCount);
    const labels = summaryWritingMdLabels(blankCount);
    const labelsText = labels.join(", ");
    const need = summaryWritingDistractorNeed(s);
    const exact = s.scoringGranularity === "exact";

    const lines: string[] = [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수)",
      "- 판정 확정성(정답이 빈칸에 유일·확정적으로 들어맞고, 보기만으로 조립 가능하며, 채점 집합이 정확)은 **제약**이다: 어떤 경우에도 양보하지 마라. 라벨 정합·조립 가능성·정답 누수 금지·언어 규칙과 기출 형식(글 전체 압축의 영어 한 문장 요약문·다단어 정답·보기 규약·합쇼체 해설)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 정답 어구·미끼 설계**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 선택(기초 어휘 정답 어구·정답과 무관해 즉시 배제되는 미끼)으로 후퇴하는 것은 실패다 — 확정적으로 채점되면서 난이도에 맞는 어구는 거의 모든 지문에 있다.",
      "- 전부를 동시에 만족할 수 없으면 **공예부터 양보하라** — 미끼 기제가 서로 겹쳐도 되고, 동치를 줄여도 되고, 요약문을 더 평이하게 다시 써도 된다.",
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      `- blanks 는 정확히 ${blankCount}개, label 은 ${labelsText} 순서 그대로다. summary 에는 각 라벨이 괄호 대문자 표기로 정확히 1회씩, ${labels.join(" → ")} 순서로 등장해야 하고, 범위 밖 라벨이 하나라도 섞이면 반려된다(그 자리는 채점되지 않는 빈칸으로 렌더된다).`,
      "- summary 는 글 전체를 압축한 영어 한 문장(라벨 제외 6단어 이상)이다. 한 단락·한 사례만 요약하면 실패다. 한국어 혼입, 밑줄(____) 삽입, '정답:'·'해설:' 같은 섹션 문자열 혼입은 각각 반려된다.",
      `- 각 blanks[].answer 는 영어 다단어 어구다 — ${wordRuleOf(s)}. 1단어 정답·한국어·두 빈칸 동일 정답은 반려된다. 요약문의 라벨 자리에 대입해 관사·전치사 중복 없이 문법이 맞는지 실제로 읽어 보라.`,
      "- [누수] 각 정답 어구(내용어 연속)가 summary(빈칸 밖)에 이미 그대로 적혀 있으면 반려된다 — 빈칸 자리에는 라벨만 남겨라.",
      "- [축자] summary 의 라벨을 각 정답으로 치환한 완성문을 지문과 대조하라. 내용어 6토큰 이상이 지문의 연속 구간과 그대로 겹치면 베껴쓰기 과제로 반려된다 — 시제·태·구문 전환을 최소 1개 넣어 상위 층위로 재구성하라(지문이 문항과 함께 보인다).",
      `- [허용 답안 집합] variants 에는 그 빈칸에 그대로 들어가는 **완전한 대체 어구**만 담아라 — 2단어 미만이거나 정답 길이의 절반에 못 미치는 조각이 섞이면 반려된다. 표기 변형(축약형 do not↔don't, 관사 유무, 대소문자, 하이픈, 구문 전환)을 전부 나열해 정답 처리 누락을 막아라. ${
        exact
          ? "이 채점 모드(정확 일치)에서는 여기 없는 표현이 전부 오답 처리되므로 빠짐없이 적되, 확신 없는 변형은 오답을 흡수하므로 넣지 마라."
          : "확신 있는 것만 1~3개 — 없으면 빈 배열로 둬라(집합에 든 문자열은 무조건 만점 처리된다)."
      } 정답과 같은 문자열은 무의미하다(기계가 제거한다).`,
      ...(s.scoringGranularity === "keyword"
        ? [
            "- [핵심어] lemmas 는 빈칸마다 1개 이상 — 한 단어씩 소문자로, **정답 어구(또는 동치)에 실제로 등장하는 형태 그대로** 적어라. 채점기가 학생 답 토큰과 정확 대조하므로 정답이 collecting 인데 collect 로 적으면 어떤 학생도 만족할 수 없어 반려된다. 관사·전치사·조동사 같은 기능어는 핵심어가 아니다.",
          ]
        : []),
      ...(s.glossEnabled
        ? [
            "- [해석] gloss 는 글 전체 의미의 한국어 한 문장이다(비면 반려). 역번역 검산: 해석의 빈칸 해당 구간을 다시 영어로 직역해 정답의 단어·어순이 그대로 복원되면 그건 해석이 아니라 정답 받아쓰기다 — 그 구간을 역할 서술(상위 개념)로 다시 써라.",
          ]
        : []),
      ...(s.wordBankEnabled
        ? [
            "- [보기] chips 는 배열 원소 하나가 칩 하나다(최소 2개). 칩 안에 콜론·불릿·번호·메모 문자열이 섞이면 학생 [보기] 상자에 그대로 나가므로 반려된다.",
            "- [조립] 각 정답을 chips 만으로 실제로 조립해 보라. 필요한 단어가 하나라도 없으면 반려된다 — 관사·전치사·대명사(the/of/along …)는 어형변화가 없으므로 정확히 같은 칩이 있어야 하고, 같은 단어가 2회 필요하면 같은 문자열 칩을 2개 넣어라(×2 규약).",
            "- 칩 하나가 다단어 정답 어구를 통째로(연속) 담으면 정답 노출로 반려된다 — 정답은 반드시 여러 칩으로 흩어라.",
            "- chips 를 왼쪽부터 읽었을 때 정답 어순이 그대로 나오면 반려된다 — 미끼를 정답 칩 사이사이에 끼워 셔플하라.",
            ...(s.wordBankUsage === "useAll"
              ? [
                  "- [useAll] 조립 후 남는 칩이 하나라도 있으면 반려된다 — 칩 전체가 빈칸 정답들을 정확히 덮어야 한다(미끼 0개).",
                ]
              : s.wordBankUsage === "usePartial"
                ? [
                    `- [usePartial] 어느 정답에도 쓰이지 않는 미끼 칩이 ${need}개 이상 있어야 한다 — 기계가 보기와 정답을 대조해 잔여 칩을 세므로 목록을 따로 적을 필요도, 속일 방법도 없다. 미끼는 정답 단어의 동의어·활용형·역방향 단어로 — 지문 주제와 무관한 단어는 미끼가 아니라 장식이다.`,
                    ...(s.glossEnabled
                      ? [
                          "- [해석]이 제공되는 문항에서 미끼가 0개면 단어 집합과 내용·어순이 동시에 노출되어(영작이 받아쓰기로 전락) 반려된다.",
                        ]
                      : []),
                  ]
                : [
                    "- [freeCount] 정답 조립에 필요한 칩은 하나도 빠뜨리지 마라. 여분 칩은 허용된다.",
                  ]),
            ...(blankCount >= 2 && s.blankAssignment === "shared"
              ? [
                  "- [shared] 어느 칩이 어느 빈칸으로 가는지가 유일하게 결정되도록 배분하라 — 두 가지 배분이 모두 성립하면 그 문항은 무효다.",
                ]
              : []),
          ]
        : [
            "- 보기 상자는 없다(chips 필드 자체가 없다). 정답 어구는 지나치게 특수한 콜로케이션을 피하고, 지문 논지를 잡은 학생이 재료 없이 도달할 수 있는 표현으로 잡아라.",
          ]),
      s.scoringGranularity === "rubric"
        ? "- [채점기준] criteria 는 한국어 항목 1개 이상(권장 2~3) — '의미: 2점' 처럼 채점 축과 배점으로 적어라. 루브릭 채점은 사람/AI 검토로 넘어가므로 이 줄이 곧 채점자의 판단 근거다(비면 반려)."
        : "- [채점기준] criteria 는 부분점수 참고용 한국어 항목 1개 이상 — 항목명은 '의미'·'어순'·'정확성' 처럼 채점 축으로 붙여라.",
      "- [해설] explanation 은 한국어 합쇼체(-습니다) 1~2문장 — 정답 어구가 지문의 어느 근거에서 도출되는지만. 구조 서술은 실제 지문을 재확인한 사실만 적고, 지문에 없는 내용을 지어내지 마라(비거나 한국어가 아니면 반려된다).",
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 해설 1~2문장(정답 도출 근거만) — 이 유형은 오답 해설이 없다. 학생 심리·출제 의도·유혹 서사는 쓰지 마라 — 짧을수록 좋다.",
      `- 발문은 교사 설정에서 기계가 이미 합성했다(출력에 발문 필드가 없다). 네가 만든 summary${s.glossEnabled ? "·gloss" : ""}${s.wordBankEnabled ? "·chips" : ""} 실물이 그 발문의 약속(${[
        ...(s.glossEnabled ? ["[해석]"] : []),
        ...(s.wordBankEnabled ? ["[보기]"] : []),
        ...(s.targetWordsMode !== "hidden" ? ["단어 수"] : []),
        "빈칸 라벨",
      ].join("·")})과 정확히 일치해야 한다.`,
    ];
    return lines.join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    const settings = settingsOf(ctx);
    try {
      const parsed = JSON.parse(text) as unknown;
      const raw = (
        parsed && typeof parsed === "object" ? parsed : {}
      ) as Record<string, unknown>;
      const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
      const strList = (v: unknown): string[] =>
        Array.isArray(v)
          ? v
              .map((item) => (typeof item === "string" ? item.trim() : ""))
              .filter(Boolean)
          : [];

      const corrections: string[] = [];

      // ── 코어스: 빈칸 라벨 정규화 + 중복 라벨 병합 + 라벨 오름차순 정렬 ──
      // 파서(parser-summary-writing.ts:378-438)와 같은 규칙이다: 라벨은
      // summaryWritingLabel 로 (A) 정본화, 같은 라벨은 병합(첫 정답 승리·동치/핵심어
      // 누적), 형식 밖 라벨은 드롭(게이트 #1 이 개수 부족으로 지목), 마지막에 라벨
      // 오름차순 정렬. 전부 기계 확정 가능한 교정이라 반려 대신 고쳐서 살린다.
      type Entry = { answer: string; variants: string[]; lemmas: string[] };
      const byLabel = new Map<string, Entry>();
      const order: string[] = [];
      let labelNormalized = false;
      let labelMerged = false;
      const rawBlanks = Array.isArray(raw.blanks) ? raw.blanks : [];
      for (const item of rawBlanks) {
        const b = (
          item && typeof item === "object" ? item : {}
        ) as Record<string, unknown>;
        const rawLabel = str(b.label);
        const label = summaryWritingLabel(rawLabel);
        if (!label) continue; // (A)~(C) 축 밖 — 파서와 동일하게 드롭, 게이트가 개수로 지목.
        if (label !== rawLabel) labelNormalized = true;
        let entry = byLabel.get(label);
        if (!entry) {
          entry = { answer: "", variants: [], lemmas: [] };
          byLabel.set(label, entry);
          order.push(label);
        } else {
          labelMerged = true;
        }
        const answer = str(b.answer);
        if (!entry.answer && answer) entry.answer = answer;
        entry.variants.push(...strList(b.variants));
        entry.lemmas.push(...strList(b.lemmas));
      }
      const blanks: MdSummaryWritingBlank[] = order.map((label) => {
        const entry = byLabel.get(label) as Entry;
        return {
          label,
          answer: entry.answer,
          variants: entry.variants,
          lemmas: entry.lemmas,
        };
      });
      const beforeSort = blanks.map((b) => b.label).join("");
      blanks.sort((a, b) => a.label.localeCompare(b.label));
      if (labelNormalized) corrections.push("빈칸 라벨 표기를 (A) 정본으로 정규화");
      if (labelMerged) corrections.push("같은 라벨의 빈칸 항목을 병합(첫 정답 유지)");
      if (blanks.map((b) => b.label).join("") !== beforeSort) {
        corrections.push("빈칸 정답을 라벨 오름차순으로 재정렬");
      }

      const summary = str(raw.summary);
      const gloss = str(raw.gloss);
      const chips = strList(raw.chips);
      const criteria = strList(raw.criteria);
      const explanation = str(raw.explanation);

      const q: MdSummaryWritingQuestion = {
        kind: "summaryWriting",
        summary,
        gloss,
        chips,
        blanks,
        criteria,
        explanation,
        // JSON 경로의 "줄 존재" = 값이 실재하는 필드. 빈 값을 "줄은 있으나 값을 못
        // 읽음"(md 전용 조언)으로 지목하면 JSON 모델에게 틀린 처방이 나가므로, 값이
        // 있을 때만 머리표를 인정해 게이트가 정확히 "누락"을 말하게 한다(철칙 3·5).
        headsSeen: [
          ...(summary ? ["요약문"] : []),
          ...(gloss ? ["해석"] : []),
          ...(chips.length > 0 ? ["보기"] : []),
          ...(criteria.length > 0 ? ["채점기준"] : []),
          ...(explanation ? ["해설"] : []),
        ],
      };

      // 레인과 동일 순서: 스냅(라벨 표기·빈칸선·동치 중복·표제어 표면형·칩 재배열)
      // → 설정 집행(꺼진 상자 절삭) → 게이트.
      const snapped = autoSnapSummaryWriting(q);
      const enforced = enforceSummaryWritingSettings(snapped.question, {
        glossEnabled: settings.glossEnabled,
        wordBankEnabled: settings.wordBankEnabled,
      });
      return {
        question: enforced.question,
        gateIssues: gateMdSummaryWriting(
          enforced.question,
          ctx.passage,
          gateOptionsOf(settings),
        ),
        corrections: [
          ...corrections,
          ...snapped.corrections,
          ...enforced.corrections,
        ],
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

  // JSON→md 점진 렌더. lemmas 는 채점 메타(단어 토큰 대조용)라 침묵시킨다.
  // chips 는 브릿지에 배열 1회성 머리표가 없어 원소마다 ` / ` 로 잇는다(표시 전용).
  bridgeSpecs: [
    { path: "summary", prefix: "요약문: ", suffix: "\n" },
    { path: "gloss", prefix: "\n해석: ", suffix: "\n" },
    { path: "chips[]", prefix: " / " },
    { path: "blanks[].label", prefix: "\n\n정답" },
    { path: "blanks[].answer", prefix: ": " },
    { path: "blanks[].variants[]", prefix: "\n동치: " },
    { path: "criteria[]", prefix: "\n채점기준: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : "다음 글의 요약문 빈칸에 들어갈 말을 영작하시오.";
    // 실제 학생 안전 직렬화(summary-writing.ts — 마스킹·[해석]·[요약문]·[보기])를
    // 그대로 재사용한다. 재구현하면 마스킹 규칙이 갈려 평가 표면이 실물과 어긋난다.
    const parts = summaryWritingStudentParts(
      aiQuestion as Parameters<typeof summaryWritingStudentParts>[0],
    );
    return `${direction}\n\n${passage}\n\n${parts.join("\n")}`;
  },
};
