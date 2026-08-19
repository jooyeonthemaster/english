// ============================================================================
// SUMMARY_COMPLETE(요약문 완성 주관식·서술형) luna 레인 확장.
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 패밀리 특칙(writing) 적용 노트 — 이 유형은 **선지가 없는 서술형**이다. 학생이
// 빈칸에 직접 영어를 써 넣고 exam-scoring 이 blanks[].acceptedAnswers 와 EXACT
// 대조한다(answer-spec.ts:303-305 · grade.ts:41-60). 그래서 스키마의 accepted
// (허용답 집합)가 채점 계약의 급소이고, 검산 블록에 "표기 변형(축약형·하이픈·
// 미영 철자·관사) 전수 나열" 항목을 특칙대로 싣는다. 단 대소문자·문말 구두점은
// 채점 정규화(normalize.ts:84-96 소문자 접기·꼬리 구두점 제거)가 흡수하므로
// 나열 대상에서 명시적으로 제외한다 — 적으면 스냅이 정답 중복으로 제거할 뿐이다.
//
// 지문 무변형 유형이라 재구성 계약(reconstructionEq)의 소비처가 없다. 그 자리는
// 게이트의 세 축(요약문 무결성·채점 계약·허용답 위생)이 대신하며, 검산 블록이
// gate-summary-complete.ts 의 반려 조건 전량을 전사한다.
//
// 파싱 산출물은 MdSummaryCompleteQuestion 동형으로 어댑트해 레인의 스냅
// (autoSnapSummaryComplete)·게이트(gateMdSummaryComplete)·어댑터를 전부
// 재사용한다. `정답(X):` 단일 진실원 설계(correctAnswer 는 어댑터가 파생,
// acceptedAnswers 선두의 answer 자신도 어댑터가 강제 삽입)도 그대로 계승한다 —
// JSON 스키마에 모범답안·correctAnswer 필드를 따로 두지 않는다(중복 계약 금지).
//
// ── r1 패널(24문항 paired) 확정 F 계통 → r2 보강 지점 ───────────────────────
// 공유 게이트는 무접촉이다. 아래는 전부 이 파일의 검산·스키마·자체 검사로만 막는다.
//  F1 다어절 자유 명사구 키(conceptual flexibility·experiential variety·
//     intergenerational stewardship·epistemically unreliable) — EXACT 채점이라
//     학생이 그 조합을 그대로 산출할 확률이 0. → 한 단어 원칙 + 기계 검사.
//  F2 두 빈칸 상호 함의(numerical indicator → scientific quantification)·
//     같은 개념 2회 요구(self-protective ↔ ward off threats) → 독립성 검산 +
//     동계어(어간) 기계 검사.
//  F3 키가 지문에 근거 없음·해설이 푼 뜻과 키가 불일치(해설은 "앎을 인정하는
//     기준"이라 써 놓고 키는 justification) → 해설↔정답 대조 검산.
//  F4 표적 인접(`requires (A) rather than (B)`)·슬롯 무구속 → 분산 검산 +
//     라벨 간격 기계 검사.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import { normalizeWs } from "../parser";
import {
  SUMMARY_COMPLETE_MD_BLANK_COUNT_DEFAULT,
  clampSummaryCompleteMdBlankCount,
  summaryCompleteMdLabels,
} from "../prompts-summary-complete";
import {
  autoSnapSummaryComplete,
  summaryCompleteParenLabel,
  type MdSummaryCompleteQuestion,
} from "../parser-summary-complete";
import { gateMdSummaryComplete } from "../gate-summary-complete";
import { SUMMARY_COMPLETE_MD_DIRECTION } from "../adapter-summary-complete";
import { addSummaryCompleteMcBlankLines } from "@/lib/summary-complete-mc";

// ── r2 자체 검사 보조기 (이 파일 전용 — 공유 게이트 무접촉) ──────────────────

/** 답 단어 — 하이픈 결합어(self-protective)는 한 단어로 센다. */
function answerWords(value: string): string[] {
  return normalizeWs(value).split(" ").filter(Boolean);
}

/** 구동사 불변 파티클 — 2단어 답이 "관용 고정 단위"인지 가르는 유일 예외. */
const PHRASAL_PARTICLES = new Set([
  "off", "up", "out", "down", "away", "back", "over", "through", "in", "on",
  "into", "onto", "upon", "around", "along", "aside", "apart", "together",
  "forward", "ahead", "about", "across", "by", "for", "with", "against",
]);

/** 자유 결합 다어절 판정 — 참이면 EXACT 채점에서 아무도 못 맞히는 키다. */
function multiWordAnswerIssue(label: string, answer: string): string | null {
  const w = answerWords(answer);
  if (w.length <= 1) return null;
  if (w.length === 2 && PHRASAL_PARTICLES.has(w[1].toLowerCase().replace(/[^a-z]/g, ""))) {
    return null; // ward off·fend off 류 구동사는 한 어휘 단위다.
  }
  return `정답${label}이 ${w.length}단어 자유 결합구('${answer}') — 이 유형은 EXACT 자동채점이라 학생이 그 조합을 그대로 쓸 확률이 사실상 0이다. 같은 뜻의 **한 단어**(하이픈 결합어 가능)로 압축하거나, 그 한 단어가 유일해지도록 요약문 슬롯을 다시 써라.`;
}

/** 어간 근사 — 동계어(quantify/quantification, reflex/reflexive)를 한 키로 접는다. */
const STEM_SUFFIXES = [
  "ationally", "ational", "ations", "ation", "ability", "ibility", "ically",
  "iveness", "fulness", "ousness", "edness", "ments", "ment", "nesses", "ness",
  "ities", "ity", "ively", "ive", "ingly", "ing", "ions", "ion", "able", "ible",
  "ances", "ance", "ences", "ence", "ers", "er", "ors", "or", "ies", "ied",
  "ily", "ous", "ful", "al", "ly", "ed", "es", "s", "y",
];
function crudeStem(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  let changed = true;
  while (changed && w.length > 4) {
    changed = false;
    for (const s of STEM_SUFFIXES) {
      if (s.length < w.length - 3 && w.endsWith(s)) {
        w = w.slice(0, w.length - s.length);
        changed = true;
        break;
      }
    }
  }
  return w;
}
/** 두 답이 같은 어족인지 — 짧은 쪽이 긴 쪽의 접두이고 5자 이상이면 동계로 본다. */
function sameWordFamily(a: string, b: string): boolean {
  const x = crudeStem(a);
  const y = crudeStem(b);
  if (x.length < 5 || y.length < 5) return x.length >= 4 && x === y;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/** 요약문에서 두 라벨 사이의 단어 수 — 인접 표적(밑줄 두 개가 붙어 인쇄) 검출. */
function wordsBetweenLabels(summary: string, first: string, second: string): number | null {
  const s = normalizeWs(summary);
  const i = s.indexOf(first);
  if (i < 0) return null;
  const j = s.indexOf(second, i + first.length);
  if (j < 0) return null;
  return s
    .slice(i + first.length, j)
    .split(/\s+/)
    .filter(Boolean).length;
}
/** 이 값 이하로 붙으면 반려 — `requires (A) rather than (B)` 계통(r1 Q23). */
const MIN_LABEL_GAP_WORDS = 3;

/**
 * r2 추가 자체 검사 — 공유 게이트가 보지 않는 축(답 단위·표적 분산·빈칸 독립성).
 * 문구는 그대로 [반려 재생성] 피드백이 되므로 "무엇을 어떻게 고칠지"까지 적는다.
 */
function extraIssues(q: MdSummaryCompleteQuestion, labels: string[]): string[] {
  const v: string[] = [];
  const filled = q.blanks.filter((b) => b.answer.trim());

  for (const b of filled) {
    const issue = multiWordAnswerIssue(b.label, b.answer.trim());
    if (issue) v.push(issue);
  }

  // 두 빈칸이 같은 어족이면 한 칸이 다른 칸을 함의한다(r1 F2 계통).
  for (let i = 0; i < filled.length; i += 1) {
    for (let j = i + 1; j < filled.length; j += 1) {
      const a = filled[i];
      const b = filled[j];
      if (sameWordFamily(a.answer.trim(), b.answer.trim())) {
        v.push(
          `${a.label}('${a.answer.trim()}')와 ${b.label}('${b.answer.trim()}')의 정답이 같은 어족이라 한 칸이 다른 칸을 함의한다 — 두 빈칸은 서로 다른 논리 마디(원인/결과·조건/귀결)를 물어야 한다. 한 칸을 다른 축의 어휘로 다시 설계하라.`,
        );
      }
    }
  }

  // 표적 인접 — 밑줄 두 개가 한 대구 안에 붙으면 슬롯이 답을 구속하지 못한다.
  for (let i = 0; i + 1 < labels.length; i += 1) {
    const gap = wordsBetweenLabels(q.summary, labels[i], labels[i + 1]);
    if (gap !== null && gap < MIN_LABEL_GAP_WORDS) {
      v.push(
        `요약문에서 ${labels[i]} 와 ${labels[i + 1]} 사이가 ${gap}단어뿐이다 — 두 빈칸을 서로 다른 절로 갈라 최소 5단어 이상 떨어뜨려라(${labels[i]} 는 전반부, ${labels[i + 1]} 는 후반부). \`requires ${labels[i]} rather than ${labels[i + 1]}\` 처럼 한 대구 안에 몰면 앞뒤 구조가 답의 품사·의미축을 전혀 구속하지 못한다.`,
      );
    }
  }

  return v;
}

/** 레인(lane-summary-complete.ts:48)과 동일한 설정 축 — 리졸버 키 3개 + 기본값. */
function blankCountOf(ctx: MdLaneContext): number {
  const resolved = ctx.resolved as {
    summaryCompleteBlankCount?: unknown;
    blankCount?: unknown;
    summaryBlankCount?: unknown;
  };
  return clampSummaryCompleteMdBlankCount(
    resolved.summaryCompleteBlankCount ??
      resolved.blankCount ??
      resolved.summaryBlankCount ??
      SUMMARY_COMPLETE_MD_BLANK_COUNT_DEFAULT,
  );
}

export const SUMMARY_COMPLETE_LUNA_EXT: LunaLaneExt = {
  subType: "SUMMARY_COMPLETE",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const blankCount = blankCountOf(ctx);
    const labels = summaryCompleteMdLabels(blankCount);
    return {
      name: "summary_complete_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "blanks", "explanation"],
        properties: {
          // 본문성 필드 최선두 — 스트리밍 도착 순서 = 사용자 표면 순서.
          summary: {
            type: "string",
            description: `빈칸 라벨 ${labels.join(", ")} 가 각각 정확히 1회, ${labels.join(" → ")} 순서로 든 영어 한 문장 요약문(라벨 제외 8~60단어, 종결부호로 끝냄). 지문의 어느 구간도 연속 8단어 이상 그대로 옮기지 말고 상위 추상으로 재진술하라. 라벨만 쓰고 밑줄(_____)·말줄임표는 붙이지 마라(시험지가 자동 부착). 정답 값을 본문에 노출하지 마라. **표적 분산**: ${labels[0]} 는 앞 절, 마지막 라벨은 뒤 절에 두어 최소 5단어 이상 떨어뜨리고, \`${labels[0]} rather than ${labels[1] ?? "(B)"}\` 처럼 한 대구 안에 몰지 마라. 빈칸 앞뒤에 관사·전치사·조동사 등 답의 품사·수·시제를 구속하는 단어를 두어라. 정답의 어근·직접 반의어(non-linear ↔ linear, counter- ↔ counteract)를 요약문 본문에 인쇄하면 그 자리의 답이 다른 단어로 확정되어 버리니 금지.`,
          },
          blanks: {
            type: "array",
            minItems: blankCount,
            maxItems: blankCount,
            description: `빈칸 채점 계약 — ${labels.join(" → ")} 순서로 빈칸마다 정확히 하나씩.`,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "answer", "accepted"],
              properties: {
                label: { type: "string", enum: labels },
                answer: {
                  type: "string",
                  description:
                    "이 빈칸의 정답 — **영어 한 단어**가 원칙이다(하이픈 결합어 self-protective 는 한 단어로 친다). 예외는 사전에 한 어휘로 등재된 구동사(ward off)뿐이며, 형용사+명사(conceptual flexibility)·부사+형용사(epistemically unreliable) 같은 자유 결합 2단어 이상은 금지 — 채점이 EXACT 라 그 조합을 그대로 쓸 학생이 없다. 값만 적어라(라벨 재부착·따옴표·문말 구두점 금지). 대안 나열(슬래시·쉼표·or) 절대 금지 — 채점이 이 문자열 전체를 정확 대조하므로 나열하면 아무도 못 맞힌다. 동치는 accepted 로. 지문에 개념 자체가 없는 전문용어를 답으로 잡지 마라(지문의 논지로 직접 지지되는 어휘여야 한다).",
                },
                accepted: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "완전 동치 허용답 — 자동채점에서 무조건 만점이 되는 집합. 요약문에 꽂았을 때 문법이 그대로 성립하고 의미가 완전히 같은 표기 변형(축약형↔전개형·하이픈 유무·미영 철자·문법이 성립하는 관사 포함형)을 전부 나열하라. 대소문자·문말 구두점 차이는 채점이 자동 흡수하므로 적지 마라. 정답 자신은 넣지 마라(자동 포함). 같은 의미장의 '비슷한' 단어를 넣으면 오답이 만점 처리된다 — 확신 있는 동치가 없으면 빈 배열 [].",
                },
              },
            },
          },
          explanation: {
            type: "string",
            description:
              "정답 해설(한국어 합쇼체, 딱 2문장) — 각 빈칸이 지문의 어느 논지를 압축하는지, 그 근거 문장이 무엇인지. 각 빈칸의 정답 어휘를 반드시 그대로 인용해 적고(‘…’ 안에 영어 원형), 그 한국어 뜻풀이가 실제 정답어와 같은 단어를 가리키는지 확인하라(뜻풀이와 정답어가 어긋나면 정답을 뜻풀이에 맞는 단어로 교체한다). 슬롯 조건('형용사 자리입니다')만 쓰고 끝내지 마라.",
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const blankCount = blankCountOf(ctx);
    const labels = summaryCompleteMdLabels(blankCount);
    const labelsText = labels.join(", ");
    const labelsRun = labels.join("");
    return [
      "## 규칙 충돌 시 우선순위 (필수)",
      "- 1순위 판정 확정성(각 빈칸 정답이 하나로 수렴·채점 계약·라벨 정합) > 2순위 기출 형식(영어 한 문장 요약문·1~3단어 답·재진술) > 3순위 함정 공예(학생 오답 기제 설계·요약문의 수사적 세련미). 막히면 3순위부터 양보하라 — 요약문을 더 평이하게 다시 쓰거나 빈칸 자리를 더 확정적인 급소로 옮겨도 된다. 채점 계약(정답 하나만·허용답 완전 동치만)과 라벨 정합은 양보 대상이 아니다.",
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      `- 요약문에 ${labelsRun} 가 각각 정확히 1회, ${labels.join(" → ")} 순서로만 등장하는지 확인하라. 범위 밖 라벨·중복 등장·순서 역전은 전부 반려된다.`,
      "- 요약문은 영어 한 문장이다 — 한국어가 한 글자라도 섞이면 반려. 라벨 제외 8~60단어. 종결부호(.!?)로 끝나야 하며(중간 절단 반려), 두 문장 이상이면 반려된다.",
      "- 요약문 라벨 옆에 밑줄(_____)·말줄임표를 덧붙이지 마라 — 시험지가 자동 부착한다. 남아 있으면 반려된다.",
      "- [원문 대조] 요약문이 지문의 어느 구간과도 연속 8단어 이상 겹치면 복사로 반려된다 — 지문 문장을 옮기거나 이어 붙이지 말고 상위 추상으로 재진술하라.",
      `- blanks 는 ${labels.join(" → ")} 순서로 빈칸마다 정확히 하나씩이고, label 은 "${labels[0]}" 처럼 반각 괄호+대문자 표기 그대로다.`,
      `- answer 는 영어 단어 **값만** 적는다. 한국어·괄호 뜻풀이가 섞이거나, 값 앞에 라벨을 다시 붙이거나(특히 다른 빈칸의 라벨), 따옴표로 감싸면 반려된다.`,
      "- [한 단어 원칙] 각 answer 를 공백으로 세어라 — 1단어여야 한다(하이픈 결합어 self-protective 는 1단어). 예외는 사전 등재 구동사(ward off) 한 가지뿐이고, 형용사+명사(conceptual flexibility)·부사+형용사(epistemically unreliable)·수식어+명사(intergenerational stewardship) 같은 **자유 결합 다어절은 반려**된다. 채점이 EXACT 대조라 다어절 키는 정답률이 어휘력이 아니라 표현 우연에 좌우되고 사실상 아무도 못 맞힌다. 두 칸의 답 단위(단어 수·품사)도 서로 평행해야 한다.",
      `- [표적 분산] 요약문에서 ${labels[0]} 와 다음 라벨 사이의 단어 수를 세어라 — 3단어 미만이면 반려된다(권장 5단어 이상). \`${labels[0]} rather than ${labels[1] ?? "(B)"}\` 처럼 한 대구 안에 두 빈칸을 몰지 말고, 앞 절과 뒤 절로 갈라 배치하라. 빈칸 앞뒤에는 관사·전치사·조동사·수 일치 요소를 두어 답의 품사·수·시제가 슬롯만으로 결정되게 하라 — \`requires ___ rather than ___\` 처럼 아무 명사구나 받는 자리는 금지다.`,
      "- [빈칸 독립성] 테스트: 첫 빈칸의 답을 채운 상태로 나머지 빈칸을 보라. 앞 칸이 채워지는 순간 뒤 칸이 논리적으로 함의되면(numerical indicator → scientific quantification) 뒤 칸은 변별력이 0이므로 다른 논리 마디로 옮겨라. 또 두 칸이 같은 개념을 두 번 요구해도 안 된다(self-protective 반응 + 위협을 ward off = 보호 개념 중복). 두 답이 같은 어족(같은 어근의 파생어)이면 자동 반려된다.",
      "- [대체 후보 배제] 각 빈칸에 대해, 그 자리에 들어갈 법한 흔한 영어 단어 3개를 떠올려라. 그중 지문·요약문 구조로 **배제되지 않는** 것이 있으면 그 문항은 정답이 하나로 수렴하지 않는다 — (i) 완전 동치면 accepted 에 넣고, (ii) 의미가 다르면 요약문 슬롯을 다시 써서 배제하라. 특히 지문에 그대로 있는 축자어가 네 정답보다 근거가 강하면(지문 automatic 인데 키는 habitual) 축자어를 정답으로 삼거나 accepted 에 넣어라.",
      "- [반의어·어근 누출] 요약문 본문에 정답의 어근·직접 반의어를 인쇄하지 마라 — `adopting a non-linear approach ... (A) cognitive patterns` 처럼 쓰면 (A)는 구조상 linear 로 확정되어 네가 잡은 키가 배제된다. `counter-technologies` 를 써 놓고 counteract 를 답으로 요구하는 것도 같은 사고다.",
      "- [정답↔해설 정합] explanation 이 각 빈칸을 한국어 뜻으로 풀 때, 그 뜻이 실제 answer 를 가리키는지 대조하라. '앎을 인정하는 기준'이라 써 놓고 정답을 justification 으로 적는 식의 불일치는 정답이 틀렸다는 신호다 — 뜻풀이에 맞는 단어로 answer 를 교체하라. 지문에 개념 자체가 없는 전문용어(certainty·justification 류)를 키로 잡지 마라.",
      "- answer 에 대안을 나열하지 마라 — 슬래시(/)·쉼표·세미콜론·or·\"(or ...)\" 가 보이면 반려된다. 채점은 그 값 전체를 한 문자열로 정확 대조하므로 나열하는 순간 어떤 학생도 그 칸을 맞힐 수 없다. 동치는 전부 accepted 로 보내라.",
      "- [정답 노출] 각 answer 와 accepted 의 각 값을 요약문에서 검색하라 — 요약문에 그대로 있으면 그 빈칸이 무의미해져 반려된다.",
      `- [정답 중복] ${labelsText} 의 answer 는 서로 달라야 한다 — 두 칸이 같은 답이면 한 칸만 물은 문항으로 반려된다. 한 빈칸의 accepted 값이 **다른 빈칸의 answer** 와 같아도 반려된다(두 칸이 같은 답을 받게 된다).`,
      "- [지문 베끼기] 2단어 이상 answer 가 지문에 연속으로 통째 들어 있으면 반려된다 — 지문이 문항 안에 함께 인쇄되므로 찾아 베끼기가 된다. 지문에 없는 상위 개념·재진술로 다시 설계하라.",
      "- [허용답 = 무조건 만점 집합] accepted 에 적은 표현은 자동채점에서 무조건 만점이다. 요약문에 꽂았을 때 문법이 그대로 성립하고 의미가 완전히 같은 표현만 넣어라. 같은 의미장의 '비슷한' 단어, 정도·극성이 다른 단어, 품사·문법 슬롯이 다른 형태는 절대 금지 — 조금이라도 망설여지면 빼라.",
      "- [표기 변형 전수 나열] 각 answer 의 완전 동치 표기 변형을 accepted 에 전부 나열했는지 확인하라: 축약형↔전개형(do not↔don't), 하이픈 유무(well-being↔wellbeing), 미·영 철자(behavior↔behaviour), 문법이 똑같이 성립하는 관사 포함형. 단 대소문자·문말 구두점 차이는 채점 정규화가 흡수하므로 적지 마라 — 적으면 정답 중복으로 간주되어 제거될 뿐이다.",
      "- accepted 에 정답 자신을 다시 넣지 마라(채점 집합에 자동 포함된다). 같은 값을 두 번 넣지 마라. 빈 문자열·\"없음\"·\"-\" 을 넣지 마라 — 확신 있는 동치가 없으면 빈 배열 [] 로 두라.",
      "- explanation 은 한국어 합쇼체(-습니다) 딱 2문장 — 각 빈칸이 지문의 어느 논지를 압축하는지, 그 근거 문장이 무엇인지. 한국어가 없으면 반려된다. 구조 서술은 실제 지문을 재확인한 사실만 적어라(확인 없는 상투 서술 금지).",
      `- 기출 형식: 발문은 "다음 글의 내용을 한 문장으로 요약하고자 한다"로 고정 인쇄되고, 요약문은 지문 아래 별도 단에 ${labels[0]} _____ 빈칸선과 함께 인쇄된다. 빈칸 앞뒤 구조가 답의 품사·수·시제를 구속해야 학생 답이 하나로 수렴하고, ${labelsRun} 는 하나의 논리축(인과·대조·문제-해결)으로 묶이는 것이 관행이다. 정답은 지문 표면어 복사가 아니라 상위 개념 재진술이어야 한다.`,
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    const blankCount = blankCountOf(ctx);
    try {
      const raw = JSON.parse(text) as {
        summary?: unknown;
        blanks?: Array<{ label?: unknown; answer?: unknown; accepted?: unknown }>;
        explanation?: unknown;
      };
      const corrections: string[] = [];

      const rawBlanks = Array.isArray(raw.blanks) ? raw.blanks : [];
      let blanks = rawBlanks.map((b) => ({
        label: typeof b?.label === "string" ? b.label : String(b?.label ?? ""),
        answer: typeof b?.answer === "string" ? b.answer : String(b?.answer ?? ""),
        accepted: Array.isArray(b?.accepted)
          ? b.accepted.map((a) => (typeof a === "string" ? a : String(a ?? "")))
          : [],
      }));

      // 코어스: 라벨 표기 정규화("(a)"·"A" → "(A)") — 파서의 summaryCompleteParenLabel
      // 과 동일 축이라 기계 확정 가능하다. 정규화 결과가 서로 충돌(중복)하면 유일
      // 확정 불가이므로 손대지 않고 게이트가 자리를 지목하게 둔다.
      const normalized = blanks.map((b) => {
        const norm = summaryCompleteParenLabel(b.label);
        return norm && norm !== b.label ? { ...b, label: norm } : b;
      });
      const normLabels = normalized.map((b) => b.label);
      if (
        new Set(normLabels).size === normLabels.length &&
        normalized.some((b, i) => b.label !== blanks[i].label)
      ) {
        const fixed = normalized
          .filter((b, i) => b.label !== blanks[i].label)
          .map((b) => b.label)
          .join(", ");
        corrections.push(`빈칸 라벨 표기를 (A) 축으로 정규화: ${fixed}`);
        blanks = normalized;
      }

      let q: MdSummaryCompleteQuestion = {
        kind: "summaryComplete",
        summary: typeof raw.summary === "string" ? raw.summary : String(raw.summary ?? ""),
        blanks,
        explanation:
          typeof raw.explanation === "string"
            ? raw.explanation
            : String(raw.explanation ?? ""),
      };

      // 레인 스냅 재사용 — 요약문 라벨 표기 정규화·밑줄 제거·값 장식 제거·허용답
      // 위생(자기중복 제거)·라벨 오름차순 정렬까지 md 경로와 동일 축.
      const snapped = autoSnapSummaryComplete(q, { blankCount });
      q = snapped.question;

      const labels = summaryCompleteMdLabels(blankCount);
      return {
        question: q,
        gateIssues: [
          ...gateMdSummaryComplete(q, ctx.passage, { blankCount }),
          ...extraIssues(q, labels),
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

  // 필드 도착 순서 = 스키마 property 순서. accepted 는 배열 원소마다 prefix 가
  // 1회씩 붙으므로 변형 하나당 한 줄로 방류된다(콤마 조인은 브릿지 계약상 불가).
  bridgeSpecs: [
    { path: "summary", prefix: "요약문: ", suffix: "\n" },
    { path: "blanks[].label", prefix: "\n정답" },
    { path: "blanks[].answer", prefix: ": " },
    { path: "blanks[].accepted[]", prefix: "\n허용답: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : SUMMARY_COMPLETE_MD_DIRECTION;
    // 학생 표면과 동일하게 라벨 뒤 빈칸선을 부착(표시 계층 함수 재사용 —
    // gate #6 주석의 addSummaryCompleteMcBlankLines 가 그 정본이다).
    const summary = addSummaryCompleteMcBlankLines(
      normalizeWs(aiQuestion.summaryWithBlanks),
    );
    const labels = Array.isArray(aiQuestion.blanks)
      ? (aiQuestion.blanks as Array<Record<string, unknown>>)
          .map((b) => String(b.label ?? ""))
          .filter(Boolean)
      : [];
    const answerLines = (
      labels.length > 0
        ? labels
        : summaryCompleteMdLabels(SUMMARY_COMPLETE_MD_BLANK_COUNT_DEFAULT)
    )
      .map((label) => `${label}: ______________`)
      .join("\n");
    return `${direction}\n\n${passage}\n\n[요약문]\n${summary}\n\n[답안 기입]\n${answerLines}`;
  },
};
