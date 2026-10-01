// 복제 원본: src/app/api/workbench/ai-jobs/question-generation/md-stream/route.ts:950-1147
//   (buildPrompt 어법 GRAMMAR_ERROR 5·1 분기 — base :967-975 · 교사/다양성/추가지시 :1054-1059 ·
//    luna 검산 :1073-1082 · 공용 검산+정답 위치 넛지 :1083-1103 · [반려 재생성] :1110-1145 · 조립 :1146)
// 팔 결정 복제: route.ts:786-822 (KILLER=PREMIUM → luna 제외, v2 = 비-luna × KILLER × 킬스위치).
// 의도된 차이 3개(그 외는 바이트 동일):
//   ① 다양성 블록(:867-948, DB 의존) = "" — 신규 지문·단일 생성의 프로덕션 동작과 동치.
//   ② customPrompt 자리(:1057-1059)에 planBlock 을 **헤더 없이** 넣는다(플래너가 자기 헤더를 쓴다).
//   ③ 넛지 Math.random(:1094) → mulberry32(seed) 한 번 뽑기(분포·임계 동일). 같은 seed 면 재생성도 같은
//      target 이다(프로덕션은 재생성 때 재추첨 — 재현하려면 호출측이 재생성에 다른 seed 를 넘긴다).
// 순수 빌더·상수는 import(복사 금지) — 원본 수정이 그대로 흘러든다. 드리프트 검사: scripts/_tmp-qgenlab-prompt-parity.ts

import {
  buildGrammarKillerV2Prompt,
  isGrammarKillerV2Enabled,
} from "@/lib/md-qgen/grammar-killer-v2";
import {
  buildGrammarMdSharedSelfcheck,
  buildMdGrammarPrompt,
} from "@/lib/md-qgen/prompts";
import {
  LUNA_GRAMMAR_JSON_SCHEMA,
  LUNA_GRAMMAR_SELFCHECK,
  LUNA_QGEN_SYSTEM_MESSAGE,
} from "@/lib/md-qgen/luna-lane";
import {
  LUNA_GRAMMAR_BRIDGE_SPECS,
  type LunaBridgeFieldSpec,
} from "@/lib/md-qgen/luna-stream-bridge";
import { buildTeacherPointsPromptBlock } from "@/lib/question-generation-prompt-contract";
import type { GenFormat, LabDifficulty } from "@/lib/qgen-lab/types";

import { mulberry32 } from "./seeded-random";

// 어법 표준형 고정(랩 범위) — 프로덕션 기본 5·1 과 같다(route.ts:625-630).
const MARKER_COUNT = 5;
const ANSWER_COUNT = 1;

export interface LabTeacherPoint {
  text: string;
  unit: "word" | "phrase";
  tag?: string;
  note?: string;
}

export interface LabPromptArgs {
  passage: string;
  difficulty: LabDifficulty;
  format: GenFormat;
  seed: number;
  teacherPoints?: LabTeacherPoint[];
  /** soft 플래너 블록 — 교사 블록 바로 뒤(프로덕션 customPrompt 자리)에 헤더 없이 삽입. */
  planBlock?: string | null;
  /** 재생성 피드백(gateIssues.join(", ")). */
  feedback?: string | null;
}

export interface LabJsonSchema {
  name: string;
  strict: boolean;
  schema: unknown;
}

export interface LabPrompt {
  prompt: string;
  systemMessage: string | null;
  jsonSchema: LabJsonSchema | null;
  bridgeSpecs: LunaBridgeFieldSpec[] | null;
  grammarKillerV2: boolean;
  /** 정답 위치 넛지 target(2~5). 넛지가 없는 경로(v2·luna)는 null. */
  nudgeTarget: number | null;
}

/** 정답 위치 넛지 target — route.ts:1094-1098 분포 그대로(②22.6·③21.5·④30.1·⑤25.8%), 난수만 시드. */
export function pickNudgeTarget(seed: number, markerCount = MARKER_COUNT): number {
  const draw = mulberry32(seed)() * 0.93;
  return Math.min(
    markerCount,
    draw < 0.21 ? 2 : draw < 0.41 ? 3 : draw < 0.69 ? 4 : 5,
  );
}

/** 정답 위치 넛지 블록 — route.ts:1099-1102 문구 바이트 동일. */
export function buildNudgeBlock(target: number): string {
  return `## 정답 위치 (선호)
- 이번 문항은 가능하면 정답을 ${target}번째 밑줄 부근(±1)에 두어라 — 매번 4번째 밑줄을 정답으로 삼는 습성을 피하기 위한 지시다. 단 **자리 품질이 항상 우선**이다: 그 부근에 좋은 정답 자리가 없으면 이 지시를 무시하고 자리 조사의 1순위를 그대로 써라.`;
}

/** [반려 재생성] 블록 — route.ts:1110-1145 를 한 글자도 바꾸지 않은 사본. */
export function buildRegenFeedbackBlock(feedback: string): string {
  // 누설·정답 시비 계열 반려는 **지문 원문이 그 표현을 이미 포함**해서 난다 —
  // 지문은 수정 금지라 같은 자리·같은 후보쌍을 고집하면 반드시 재반려된다.
  // (26-08-11 RCA: 재생성이 같은 strictly|strict 쌍을 다시 골라 확정 실패·환불.
  //  일반 지시 "위반을 해소하라"만으로는 모델이 표적 교체까지 도달하지 못했다.)
  const needsRelocation = /누설|정답 시비|네모 밖|밑줄 밖|그대로 남아/.test(
    feedback,
  );
  // 인접 반려(26-08-14 실사용 신고)는 양보 방향을 명시한다 — 제약 과적으로
  // 재생성이 같은 배치를 반복하는 RCA 계통(26-08-11) 예방: 위치 분산이 포인트
  // 다양성보다 우선임을 알려 실제 탈출구(코드 2회 허용)를 열어 준다.
  const needsSpread = /인접/.test(feedback);
  const needsNarrow = /구·절/.test(feedback);
  // v2 인용 게이트 반려(26-08-17): 인용이 축자가 아니거나 위치 서술이 어순과
  // 다르다는 뜻 — 재복사·사실 서술로 탈출구를 명시한다.
  const needsQuote = /인용|바로 앞/.test(feedback);
  return `[반려 재생성] 직전 출력이 기계 검사에서 반려되었다: ${feedback}. 위반을 전부 해소하고 같은 요구사항으로 완제품을 다시 설계하라.${
    needsRelocation
      ? " 누설·정답 시비 사유는 지문 원문이 그 표현을 이미 포함하고 있다는 뜻이다 — 같은 자리·같은 후보쌍으로는 절대 해소되지 않으니, 지적된 표적을 버리고 **다른 문장의 다른 포인트로 교체**해 설계하라(지문 본문 수정은 금지)."
      : ""
  }${
    needsSpread
      ? " 인접 사유는 밑줄 배치 문제다 — 붙어 있는 두 밑줄 중 하나를 지문의 떨어진 다른 부분의 확정적 포인트로 옮겨라. 포인트 다양성(코드 종류)을 줄이는 한이 있어도 위치 분산이 우선이다(같은 코드 2회까지 허용)."
      : ""
  }${
    needsNarrow
      ? " 구·절 사유는 밑줄 범위 문제다 — 포인트를 교체할 필요 없이, 판정을 결정짓는 핵심 단어 1개(불가피하면 2단어)로 밑줄을 좁혀 다시 그어라."
      : ""
  }${
    needsQuote
      ? " 인용·바로 앞 사유는 해설이 지문을 그대로 베끼지 않았거나 위치 서술이 실제 어순과 다르다는 뜻이다 — 해당 밑줄 주변을 지문(해설은 화면 표시 형태)에서 다시 찾아 한 글자도 바꾸지 말고 복사하고, 인용에 보이는 사실만 서술하라."
      : ""
  }`;
}

/**
 * 랩 어법 프롬프트 조립. extras 순서 = 프로덕션(route.ts:1054-1145):
 *   교사 블록 → [다양성 "" 생략] → planBlock(customPrompt 자리) → 검산(luna | 공용+넛지 | v2 없음) → 피드백.
 * KILLER 는 v2 킬스위치(QGEN_GRAMMAR_KILLER_V2=off)가 꺼져 있으면 프로덕션처럼 구형 KILLER base
 * + 공용 검산 + 넛지로 간다(route.ts:815-822, :1083).
 */
export function buildLabGrammarPrompt(a: LabPromptArgs): LabPrompt {
  const luna = a.format === "luna-json";
  if (luna && a.difficulty === "KILLER") {
    // 프로덕션에 luna KILLER 는 없다 — KILLER=PREMIUM 은 luna 레인 제외(route.ts:786-797).
    throw new Error(
      "[qgen-lab] KILLER × luna-json 은 프로덕션 형상이 없다(route.ts:786-797) — md 형식을 써라",
    );
  }
  const grammarKillerV2 =
    !luna && a.difficulty === "KILLER" && isGrammarKillerV2Enabled();
  const base = grammarKillerV2
    ? buildGrammarKillerV2Prompt(a.passage)
    : buildMdGrammarPrompt(a.passage, "full", a.difficulty, {
        markerCount: MARKER_COUNT,
        answerCount: ANSWER_COUNT,
      });
  const extras: string[] = [];
  const teacherBlock = buildTeacherPointsPromptBlock(a.teacherPoints ?? []);
  if (teacherBlock) extras.push(teacherBlock);
  // 다양성 블록 = "" (무DB) — 미주입.
  const planBlock = a.planBlock?.trim();
  if (planBlock) extras.push(planBlock);
  let nudgeTarget: number | null = null;
  if (luna) {
    // luna 표준형(5·1) 검산 — 공용 검산·넛지 대신 말미(피드백 직전).
    extras.push(LUNA_GRAMMAR_SELFCHECK);
  } else if (!grammarKillerV2) {
    extras.push(buildGrammarMdSharedSelfcheck(MARKER_COUNT));
    if (ANSWER_COUNT === 1 && MARKER_COUNT >= 4) {
      nudgeTarget = pickNudgeTarget(a.seed, MARKER_COUNT);
      extras.push(buildNudgeBlock(nudgeTarget));
    }
  }
  if (a.feedback) extras.push(buildRegenFeedbackBlock(a.feedback));
  const prompt =
    extras.length > 0 ? `${base}\n\n${extras.join("\n\n")}` : base;
  return {
    prompt,
    systemMessage: luna ? LUNA_QGEN_SYSTEM_MESSAGE : null,
    jsonSchema: luna ? (LUNA_GRAMMAR_JSON_SCHEMA as unknown as LabJsonSchema) : null,
    bridgeSpecs: luna ? LUNA_GRAMMAR_BRIDGE_SPECS : null,
    grammarKillerV2,
    nudgeTarget,
  };
}
