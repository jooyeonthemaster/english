// ============================================================================
// SUMMARY_COMPLETE_MC(요약문 완성 객관식) luna 레인 확장.
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 패밀리 특칙(structural) 적용 노트 — 이 유형은 **지문 무변형** 구조형이다.
// 어법·순서처럼 지문을 재구성하는 계약이 없으므로 reconstructionEq 의 소비처가
// 없다(재구현 금지 원칙에 따라 별도 재구현도 하지 않는다). 재구성·보존 게이트의
// 등가물은 다음 세 축이며, 검산 블록의 [재구성 대조] 항목이 이를 모델에 강제한다:
//   ① 마커/번호 정합 — 요약문에 (A)(B)… 가 각 1회·순서대로(게이트 #3)
//   ② 원문 대조 — 요약문이 지문을 연속 8단어 이상 축자로 옮기지 않음(게이트 #7,
//      이 유형의 정체성 = 압축 재진술)
//   ③ 연속성 — 정답 조합을 실제로 꽂아 재구성한 완성문이 자연스러운 영어 한 문장
// 파싱 산출물은 MdSummaryMcQuestion 동형으로 어댑트해 레인의 스냅(autoSnap)·
// 게이트(gateMdSummaryMc)·어댑터를 전부 재사용한다. `정답:` 단일 진실원 설계
// (빈칸 정답 = answer 선지의 values 파생)도 그대로 계승한다 — JSON 스키마에
// 빈칸 정답 필드를 따로 두지 않는다(중복 계약 = correct-pair-mismatch 의 온상).
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import { normalizeWs } from "../parser";
import {
  SUMMARY_MC_MD_BLANK_COUNT_DEFAULT,
  SUMMARY_MC_MD_OPTION_COUNT,
  SUMMARY_MC_MD_VALUE_JOINER,
  clampSummaryMcMdBlankCount,
  summaryMcMdLabels,
} from "../prompts-summary-mc";
import {
  autoSnapSummaryMc,
  SUMMARY_MC_CIRCLED,
  type MdSummaryMcQuestion,
} from "../parser-summary-mc";
import { gateMdSummaryMc, summaryMcGateAdvisories } from "../gate-summary-mc";
import { summaryMcMdDirection } from "../adapter-summary-mc";
import { addSummaryCompleteMcBlankLines } from "@/lib/summary-complete-mc";

/** 레인(lane-summary-mc.ts:47)과 동일한 설정 축 — 리졸버 키 2개 + 유형 기본값. */
function blankCountOf(ctx: MdLaneContext): number {
  const resolved = ctx.resolved as {
    summaryCompleteMcBlankCount?: unknown;
    blankCount?: unknown;
  };
  return clampSummaryMcMdBlankCount(
    resolved.summaryCompleteMcBlankCount ??
      resolved.blankCount ??
      SUMMARY_MC_MD_BLANK_COUNT_DEFAULT,
  );
}

/** 게이트(gate-summary-mc.ts isEasyDifficulty)와 같은 판정 — 그 외 전부 엄격. */
function isEasyDifficulty(difficulty: string): boolean {
  const d = difficulty.toUpperCase();
  return d === "BASIC" || d === "INTERMEDIATE";
}

const CIRCLED_LABELS = SUMMARY_MC_CIRCLED.split("");

function circledIndex(label: string): number {
  return SUMMARY_MC_CIRCLED.indexOf(label);
}

export const SUMMARY_COMPLETE_MC_LUNA_EXT: LunaLaneExt = {
  subType: "SUMMARY_COMPLETE_MC",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const blankCount = blankCountOf(ctx);
    const labels = summaryMcMdLabels(blankCount);
    return {
      name: "summary_complete_mc_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "options", "answer", "explanation", "wrong"],
        properties: {
          // 본문성 필드 최선두 — 스트리밍 도착 순서 = 사용자 표면 순서.
          summary: {
            type: "string",
            description: `빈칸 라벨 ${labels.join(", ")} 가 각각 정확히 1회, ${labels.join(" → ")} 순서로 든 영어 한 문장 요약문. 라벨만 쓰고 밑줄(_____)은 붙이지 마라. 정답 값을 본문에 노출하지 마라.`,
          },
          options: {
            type: "array",
            minItems: SUMMARY_MC_MD_OPTION_COUNT,
            maxItems: SUMMARY_MC_MD_OPTION_COUNT,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "values"],
              properties: {
                label: { type: "string", enum: CIRCLED_LABELS },
                values: {
                  type: "array",
                  minItems: blankCount,
                  maxItems: blankCount,
                  items: {
                    type: "string",
                    description: `빈칸 채움값 — i번째 원소가 ${labels.join(", ")} 의 i번째 빈칸 값. 영어 단어 또는 6단어 이하 어구만, 라벨 표기·구분자 없이 값만.`,
                  },
                },
              },
            },
          },
          answer: {
            type: "string",
            enum: CIRCLED_LABELS,
            description:
              "정답 선지 라벨 — 정답의 유일한 진실원. 각 빈칸의 정답은 이 선지의 values 에서 파생된다(따로 적을 곳 없음).",
          },
          explanation: {
            type: "string",
            description: "정답 해설(한국어 합쇼체, 딱 2문장)",
          },
          wrong: {
            type: "array",
            minItems: SUMMARY_MC_MD_OPTION_COUNT - 1,
            maxItems: SUMMARY_MC_MD_OPTION_COUNT - 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text"],
              properties: {
                label: { type: "string", enum: CIRCLED_LABELS },
                text: {
                  type: "string",
                  description:
                    "이 오답 조합의 어느 칸의 어떤 값이 왜 어긋나는지 1문장(한국어 합쇼체)",
                },
              },
            },
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const blankCount = blankCountOf(ctx);
    const labels = summaryMcMdLabels(blankCount);
    const labelsText = labels.join(", ");
    const labelsRun = labels.join("");
    const strict = !isEasyDifficulty(ctx.rawDifficulty);
    const wrongCount = SUMMARY_MC_MD_OPTION_COUNT - 1;

    const trapRule =
      blankCount === 2
        ? `- 반쪽 정답 2종: (A)만 정답이고 (B)가 틀린 조합 최소 1개, (B)만 정답이고 (A)가 틀린 조합 최소 1개${strict ? " — 없으면 반려된다" : ""}. 맞는 쪽 값은 정답 값을 한 글자도 바꾸지 말고 그대로 복사하라 — 표기가 미묘하게 다르면 반쪽 정답으로 인정되지 않는다.`
        : `- 한 칸만 틀린 near-miss 조합 최소 1개${strict ? " — 없으면 반려된다" : ""}: ${labelsRun} 중 한 칸만 오답이고 나머지는 정답 값을 그대로 복사한 조합. 그래야 학생이 모든 칸을 검증한다.`;

    const lines = [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수)",
      "- 판정 확정성(정답 조합만 유일하게 성립·오답 전원 확정 탈락·라벨 정합)은 **제약**이다: 어떤 경우에도 양보하지 마라. 기출 형식(영어 한 문장 요약문·열 병렬·값 길이 균형)과 반쪽 정답 구조도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 오답 값·함정 강도**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 값(정답 의미장과 무관해 즉시 소거되는 선지)으로 후퇴하는 것은 실패다 — 확정적으로 틀리면서 정답 의미장에 근접한 값은 거의 모든 지문에 있다.",
      "- 전부를 동시에 만족할 수 없으면 **함정 공예부터 양보하라** — 오답 기제가 서로 겹쳐도 되고 요약문을 더 평이하게 다시 써도 된다.",
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      `- [재구성 대조] 출력 직전, answer 가 가리키는 선지의 values 를 요약문의 ${labelsText} 자리에 실제로 꽂아 완성문을 재구성하고 원문 지문과 대조하라. ① 마커 정합: 요약문에 ${labelsRun} 가 각각 정확히 1회, ${labels.join(" → ")} 순서로만 등장하고 범위 밖 라벨이 없어야 한다. ② 원문 대조: 요약문(재구성 완성문 포함)이 지문의 어느 구간과도 연속 8단어 이상 겹치면 복사로 반려된다 — 상위 추상의 재진술로 다시 써라. ③ 연속성: 완성문이 문법적으로 자연스러운 영어 한 문장으로 읽혀야 한다(억지 전치사 연결 금지).`,
      "- 요약문은 영어 한 문장(라벨 제외 8~60단어)이고 종결부호로 끝난다. 두 문장 이상·한국어 혼입·문장 중간 절단은 반려된다.",
      "- 요약문 라벨 옆에 밑줄(_____)·말줄임표를 덧붙이지 마라(시험지가 자동 부착). 정답 값이 요약문 본문에 그대로 있으면 빈칸이 무의미해져 반려된다.",
      `- 선지는 정확히 ${SUMMARY_MC_MD_OPTION_COUNT}개이고 label 은 ①②③④⑤ 순서 그대로다. 각 선지의 values 는 ${labelsText} 순서로 정확히 ${blankCount}개 — 값에 빈칸 라벨 표기((A))·표 구분자(|)·라벨 접두를 넣지 말고 값만 적어라.`,
      "- 값은 전부 영어 단어 또는 짧은 영어 어구(6단어 이하)다. 한국어·괄호 뜻풀이·설명구가 섞이면 반려된다.",
      `- 열 병렬·열 다양성: 같은 칸 자리의 값 ${SUMMARY_MC_MD_OPTION_COUNT}개는 같은 품사·문법 슬롯에 꽂히고 단어 수 편차 ±3 이내여야 한다. 각 칸마다 서로 다른 값이 최소 2개 있어야 한다 — 한 열이 전부 같으면 그 빈칸을 묻지 않은 것으로 반려된다.`,
      "- 같은 값 조합을 두 번 쓰지 마라. 특히 정답과 모든 값이 같은 오답은 문항 무효로 반려된다.",
      trapRule,
      ...(strict && blankCount === 2
        ? [
            "- KILLER 함정 강도: 정답 (A) 값을 그대로 둔 채 (B) 자리만 정답 (B)와 같은 의미장의 다른 값으로 바꾼 오답, 그리고 정답 (B) 값을 그대로 둔 채 (A) 자리만 정답 (A)와 같은 의미장의 다른 값으로 바꾼 오답이 각각 최소 1개씩 있어야 한다. 가장 강한 함정을 정답 값에 붙여라 — 즉시 소거되는 값 뒤에 묻으면 반려된다.",
          ]
        : []),
      "- answer 는 반드시 선지 label 중 하나다. 빈칸 정답을 따로 적을 곳은 없다 — answer 선지의 values 가 곧 각 빈칸의 정답이므로, 그 값들이 빈칸에 확정적으로 유일하게 들어맞는지 마지막으로 재확인하라.",
      `- explanation 은 한국어 합쇼체(-습니다) 딱 2문장 — 각 빈칸의 근거 문장을 연결해 정답 조합을 도출하되, 구조 서술은 실제 지문을 재확인한 사실만 적어라. wrong 은 정답 label 을 제외한 ${wrongCount}개 전부에 1문장씩(어느 칸의 어떤 값이 왜 어긋나는지) — 정답 label 이 끼면 반려된다.`,
      '- 해설·오답 해설에서 선지를 "3번"·"선지 5" 같은 평숫자로 지칭하지 마라(저장 시 재배열될 수 있다) — ①~⑤ 원형 문자나 값 자체를 인용하라.',
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 해설 딱 2문장(각 빈칸 근거·정답 조합 도출만), 오답 해설 딱 1문장(어느 칸의 어떤 값이 왜 어긋나는지만). 왜 매력적인지·학생이 왜 고르는지·기제 이름 같은 유혹·심리 서사는 쓰지 마라 — 짧을수록 좋다.",
      "- 기출 형식: 정답 값만 유독 길거나 유독 추상적이면 안 된다(같은 칸 값들의 길이 차 ±3단어). 오답 값은 전부 지문에 실재하는 소재·논리에서 길어 올려라 — 지문에 없는 분야 개념을 수입하면 함정이 아니라 장식이다.",
    ];
    return lines.join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    const blankCount = blankCountOf(ctx);
    try {
      const raw = JSON.parse(text) as {
        summary: string;
        options: Array<{ label: string; values: string[] }>;
        answer: string;
        explanation: string;
        wrong: Array<{ label: string; text: string }>;
      };
      const corrections: string[] = [];

      // 코어스 1: 선지 라벨 오름차순 정렬 — 라벨이 중복 없는 집합일 때만(유일
      // 확정). 중복·결손은 손대지 않고 게이트가 순서 위반으로 지목하게 둔다.
      let options = raw.options.map((o) => ({
        label: o.label,
        // 표시 text 는 계약 리터럴로 결정론 재조립(어댑터와 동일 축).
        text: o.values.join(SUMMARY_MC_MD_VALUE_JOINER),
        values: [...o.values],
      }));
      if (new Set(options.map((o) => o.label)).size === options.length) {
        const sorted = [...options].sort(
          (a, b) => circledIndex(a.label) - circledIndex(b.label),
        );
        if (sorted.some((o, i) => o !== options[i])) {
          corrections.push("선지를 라벨 오름차순(①~⑤)으로 재정렬 — 등장 순서가 어긋난 행");
          options = sorted;
        }
      }

      let q: MdSummaryMcQuestion = {
        kind: "summaryMc",
        summary: raw.summary,
        options,
        answer: raw.answer,
        explanation: raw.explanation,
        // 코어스 2: 오답 해설 라벨 오름차순 정렬(표시 결정론 — title·어법 동일).
        wrong: [...raw.wrong].sort(
          (a, b) => circledIndex(a.label) - circledIndex(b.label),
        ),
      };

      // 레인 스냅 재사용 — 라벨 표기 정규화·빈칸선 제거·값 장식/라벨 접두 제거·
      // 라벨 기준 열 재정렬까지 md 경로와 동일 축.
      const snapped = autoSnapSummaryMc(q);
      q = snapped.question;

      const gateOptions = {
        blankCount,
        optionCount: SUMMARY_MC_MD_OPTION_COUNT,
        // 원본 난이도 문자열 — 검증기 requestedDifficulty 축과 동일(레인 주석 참조).
        difficulty: ctx.rawDifficulty,
      };
      const gateIssues = gateMdSummaryMc(q, ctx.passage, gateOptions);
      return {
        question: q,
        gateIssues,
        // 비차단 권고는 게이트 클린일 때만 — 레인 parseAndGate 와 동일 규약.
        corrections: [
          ...corrections,
          ...snapped.corrections,
          ...(gateIssues.length === 0 ? summaryMcGateAdvisories(q, gateOptions) : []),
        ],
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
    { path: "summary", prefix: "요약문: ", suffix: "\n" },
    { path: "options[].label", prefix: "\n" },
    { path: "options[].values[]", prefix: " " },
    { path: "answer", prefix: "\n\n정답: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
    { path: "wrong[].label", prefix: "\n" },
    { path: "wrong[].text", prefix: " " },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const blanks = Array.isArray(aiQuestion.blanks)
      ? (aiQuestion.blanks as Array<Record<string, unknown>>)
          .map((b) => String(b.label ?? ""))
          .filter(Boolean)
      : [];
    const labels =
      blanks.length > 0 ? blanks : summaryMcMdLabels(SUMMARY_MC_MD_BLANK_COUNT_DEFAULT);
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : summaryMcMdDirection(labels);
    // 학생 표면과 동일하게 라벨 뒤 빈칸선을 부착(표시 계층 함수 재사용).
    const summary = addSummaryCompleteMcBlankLines(
      normalizeWs(aiQuestion.summaryWithBlanks),
    );
    const options = Array.isArray(aiQuestion.options)
      ? (aiQuestion.options as Array<Record<string, unknown>>)
          .map((o, i) => {
            const n = Number(o.label);
            const circled =
              Number.isInteger(n) && n >= 1 && n <= SUMMARY_MC_CIRCLED.length
                ? SUMMARY_MC_CIRCLED[n - 1]
                : String(o.label ?? SUMMARY_MC_CIRCLED[i] ?? "");
            return `${circled} ${String(o.text ?? "")}`;
          })
          .join("\n")
      : "";
    return `${direction}\n\n${passage}\n\n[요약문]\n${summary}\n\n${options}`;
  },
};
