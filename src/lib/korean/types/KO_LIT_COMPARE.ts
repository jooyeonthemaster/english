// ============================================================================
// KO_LIT_COMPARE — 문학 작품 간 공통점/차이점 ((가)(나) 복합지문 전용)
// ============================================================================
// 카탈로그 §2.2 KO_LIT_COMP 사양의 전면 구현.
//
// 실측 근거:
//   발문: "(가)~(다)의 공통점으로 가장 적절한 것은?" (합본 최빈) /
//         "(가)와 (나)의 차이점으로 가장 적절한 것은?"
//   핵심 원리: 공통점 문항은 '모든 작품에 성립해야 참' — 오답 최빈 함정은
//   '한 작품에만 성립하는 진술'. 검증량 = 작품 수 × 선지 수 (3작품×5선지=15판정).
//   세트 역할: 복합((가)(나)) 세트 1번 슬롯 — 세트 개시 문항, 2점.
//   passageKinds: ["MIXED"] 단독 — (가)(나) 파트 2개 이상 없는 지문은 구조 무효.
//   ("[A]와 [B]에 대한 설명" 블록 비교 변형은 이 모듈 범위 밖 — v1 제외.)
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { splitKoPassageParts } from "../core/passage-meta";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 스키마 — 공통 MC5 봉투 + 작품×선지 판정 매트릭스 (검증·해설에 필요한 만큼만)
// ---------------------------------------------------------------------------

const PART_ENUM = z.enum(["(가)", "(나)", "(다)", "(라)"]);

const schema = koMc5Envelope({
  comparisonMode: z
    .enum(["COMMON", "DIFFERENCE"])
    .describe(
      "비교 축 — COMMON: 공통점(모든 작품에 성립해야 참, 합본 최빈), DIFFERENCE: 차이점(작품 간 대비 진술)",
    ),
  stemPolarity: z
    .enum(["POSITIVE", "NEGATIVE"])
    .describe(
      "발문 극성 — POSITIVE: '…으로 가장 적절한 것은?' (기본·최빈), NEGATIVE: '…으로 적절하지 않은 것은?'",
    ),
  comparedParts: z
    .array(PART_ENUM)
    .min(2)
    .max(4)
    .describe("비교 대상 파트 라벨 — 지문에 실재하는 (가)(나)(다) 중에서, 발문이 지시하는 것과 정확히 일치"),
  optionAnalyses: z
    .array(
      z.object({
        label: z.enum(["①", "②", "③", "④", "⑤"]).describe("선지 라벨"),
        partVerdicts: z
          .array(
            z.object({
              part: PART_ENUM.describe("판정 대상 파트"),
              holds: z
                .boolean()
                .describe("이 선지의 진술(차이점 모드는 이 파트에 해당하는 절)이 이 작품에서 성립하는가"),
              basis: z
                .string()
                .min(1)
                .describe("성립/불성립 판정 근거 한 줄 — 해당 파트의 구절을 언급 (검수용)"),
            }),
          )
          .min(2)
          .describe("comparedParts 의 모든 파트를 정확히 1회씩 커버 — 검증량 = 작품 수 × 선지 수의 매트릭스 한 행"),
        trapPrinciple: z
          .enum(["PARTIAL_ONLY", "ABSENT_ALL", "EFFECT_DISTORTED", "ROLE_SWAP", "HALF_TRUE_PAIR"])
          .describe(
            "오답 선지만 선언(정답 선지는 생략): PARTIAL_ONLY=일부 작품에만 성립(최빈 함정), ABSENT_ALL=어느 작품에도 없음, EFFECT_DISTORTED=기법은 공통 실재하나 효과 왜곡, ROLE_SWAP=파트 간 특징 교차 귀속, HALF_TRUE_PAIR=대구 선지의 절반만 참(차이점 모드 전용)",
          )
          .optional(),
      }),
    )
    .length(5)
    .describe("선지 ①~⑤ 각각의 작품별 성립 판정 매트릭스 — 전 칸 판정 필수 (검증량 = 작품 수 × 선지 수)"),
});

// ---------------------------------------------------------------------------
// 생성 프롬프트 — 출제 매뉴얼
// ---------------------------------------------------------------------------

const prompt = `### 유형: 문학 — 작품 간 공통점/차이점 ((가)(나) 복합지문 전용)

**구조 전제 — 복합지문 필수**:
이 유형은 (가)(나)((다)) 파트 라벨이 있는 복합지문에서만 성립한다. 파트가 2개 미만이면 출제 불가(시스템이 결정론 반려). comparedParts 에 비교 대상 파트를 선언하고, 발문의 파트 지시와 정확히 일치시켜라.

**발문 템플릿** (comparisonMode·stemPolarity 에 따라 정확히 이 형태로):
- COMMON + POSITIVE(기본·최빈): "(가)와 (나)의 공통점으로 가장 적절한 것은?" / 3파트면 "(가)~(다)의 공통점으로 가장 적절한 것은?"
- COMMON + NEGATIVE: "(가)와 (나)의 공통점으로 적절하지 않은 것은?"
- DIFFERENCE + POSITIVE: "(가)와 (나)의 차이점으로 가장 적절한 것은?" / 변형 "(가)와 (나)를 비교한 내용으로 가장 적절한 것은?" 은 쓰지 말고 '차이점' 명시형을 쓰라.
- "[A]와 [B]에 대한 설명으로 가장 적절한 것은?" 블록 비교 변형은 이 유형에서 출제하지 마라(범위 밖).

**핵심 판정 원리 — '모든 작품에 성립해야 참'**:
1. 공통점 선지는 비교 대상 **모든** 작품에서 성립해야 참이다. 한 작품에서라도 무너지면 거짓 — 이것이 이 유형의 유일한 판정 기준이다.
2. 검증량 = 작품 수 × 선지 수 (2작품×5선지=10판정, 3작품×5선지=15판정). optionAnalyses 매트릭스의 **전 칸**을 실제로 판정해 채워라 — 한 칸이라도 근거 없이 채우면 복수 정답 사고가 난다.
3. 차이점(DIFFERENCE) 모드의 선지는 "(가)는 ~하고 있는 반면, (나)는 ~하고 있다" 대구 구조다. partVerdicts 의 각 파트 판정은 그 파트에 해당하는 **절**의 성립 여부다(앞 절은 (가)에서, 뒤 절은 (나)에서 판정).

**선지 구성 원리**:
1. 어미는 '~하고 있다'로 통일하라 (전략·특징 서술 관행). 예: "자연물에 화자의 정서를 의탁하여 정서를 형상화하고 있다."
2. 선지는 [기법·자질]+[~하여]+[효과·의미] 2단 구조를 기본으로 하라. 성립 판정은 기법부와 효과부 **둘 다** 통과해야 한다.
3. 5개 선지는 서로 다른 진술 층위에서 뽑아 층위 중복을 피하라:
   ① 표현·형식 자질(어조, 음성상징어, 대구, 설의, 색채 이미지, 말을 건네는 방식)
   ② 시상·서사 전개(시간의 흐름, 공간의 이동, 회상, 장면 전환)
   ③ 화자·인물의 태도(자연 친화, 현실 비판, 성찰과 반성, 지향과 동경)
   ④ 소재 활용 방식(자연물 의탁, 일상적 소재, 대비적 소재 배치)
   ⑤ 주제 형상화 방식(대비를 통한 부각, 구체적 청자 설정, 반복을 통한 강조)
4. 정답 선지의 공통 자질은 두(세) 작품 **문면**에서 각각 확인 가능해야 한다 — 해석 논쟁이 필요한 심층 공통점은 정답으로 쓰지 마라(외적 준거 없이 해석 개방 금지).

**오답 함정 원리 (trapPrinciple 로 라벨별 선언 — 원리별 예시)**:
1. PARTIAL_ONLY (일부 작품에만 성립 — **최빈 함정, 오답 4개 중 2개 이상**):
   - 예: (가)에만 설의적 표현이 있는데 "(가)와 (나) 모두 설의적 표현을 통해 화자의 고조된 정서를 드러내고 있다." — (가) 성립·(나) 불성립.
   - '한 작품에만 성립'이 가장 매력적이다: 학생이 성립하는 작품만 확인하고 넘어가게 만든다.
2. ABSENT_ALL (어느 작품에도 없음 — 매력도 낮으니 **최대 1개**):
   - 예: 어느 작품에도 수미상관이 없는데 "수미상관의 구조로 시적 안정감을 확보하고 있다."
3. EFFECT_DISTORTED (기법은 공통 실재, 효과 왜곡):
   - 예: 두 작품 모두 자연물이 등장하지만 '자연과의 합일 지향'은 (나)만 해당하는데 "자연물을 통해 합일에의 지향을 드러내고 있다." — 기법부만 훑으면 참처럼 보인다.
4. ROLE_SWAP (파트 간 특징 교차 귀속 — 차이점 모드 핵심):
   - 예: 실제로는 (가)가 회상 구조, (나)가 현재형 진술인데 "(가)는 현재형 진술로 현장감을, (나)는 회상을 통해 그리움을 드러내고 있다."
5. HALF_TRUE_PAIR (대구 선지의 절반만 참 — 차이점 모드 전용):
   - 예: "(가)는 계절의 변화에 따라 시상을 전개하고 있는 반면, (나)는 공간의 이동에 따라 시상을 전개하고 있다." — 앞 절은 참, 뒤 절은 거짓.
- 같은 파트의 같은 불성립 지점을 두 오답이 공유하지 마라 (오답끼리 배제 근거가 겹치면 변별 실패).

**근거앵커(evidence) 작성 — 파트별 커버리지 필수**:
- 정답 선지(성립 선지): relation=SUPPORTS 근거를 **비교 대상 파트마다 1개 이상** 제시하라 — 2파트면 SUPPORTS 2개 이상, 3파트면 3개 이상. spanText 는 반드시 **해당 파트 안의** 원문 구절이어야 한다(시스템이 파트별 소재를 결정론 검증함).
- PARTIAL_ONLY·EFFECT_DISTORTED·HALF_TRUE_PAIR 오답: 성립 파트는 SUPPORTS + 불성립 파트는 CONTRADICTS(문면 모순) 또는 NOT_MENTIONED(해당 자질 부재 — spanText 는 그 파트에서 가장 가까운 관련 구절).
- ABSENT_ALL 오답: relation=NOT_MENTIONED (각 파트의 가장 가까운 구절).
- ROLE_SWAP 오답: relation=DISTORTS + 실제 귀속을 확정하는 각 파트의 구절.

**빈발 반려 사유 — 근거앵커 (시스템이 기계 검사하므로 어기면 전량 반려)**:
1. **근거앵커 누락 선지 금지**: 모든 선지(①~⑤)에 evidence 를 1개 이상 반드시 부착하라 —
   한 선지라도 근거가 비면 즉시 반려된다(1차 반려 최빈 사유).
2. **정답의 파트별 SUPPORTS 커버리지**: 정답(공통 성립) 선지는 비교 대상 **파트마다**
   SUPPORTS 근거 1개 이상 — (가)에서 1개 + (나)에서 1개. 같은 파트에서 2개를 뽑고 다른
   파트를 비우면 반려된다. 근거를 쓰기 전에 각 스팬이 어느 파트 원문에 있는지 확인하라.
3. **운문 인용에 행 구분 기호 삽입 금지**: spanText 는 지문에 있는 문자 그대로만 —
   시 행 사이에 ' / ' 슬래시나 연 구분 기호를 끼워 넣으면("제 상처로 노래하는 법을 /
   천천히 배워 갔다" 류) 지문에 없는 문자라 verbatim 검사에서 반려된다. 두 행을 근거로
   쓰려면 evidence 를 행마다 1개씩 나눠라(줄바꿈·표기 추가 없이 각 행 그대로).

**금지**:
- 단일 지문·파트 1개 지문에서의 출제 (구조 무효 — 결정론 반려).
- 갈래 명칭·문학사 지식만으로 판정되는 선지 ("두 작품 모두 시조이다", "같은 시대의 작품이다").
- 지문 밖 작가 정보·창작 배경에 기대는 진술.
- 외적 준거 없이 해석이 갈리는 심층 감상 진술 (문면에서 확인 불가한 선지).
- 두 개 이상의 선지가 같은 이유(같은 파트·같은 지점)로 틀리는 구성.
- 매트릭스(partVerdicts)와 근거앵커가 모순되는 판정 (holds=true 인데 CONTRADICTS 근거 등).`;

// ---------------------------------------------------------------------------
// settings — comparisonMode·stemPolarity knob + examMode 반영
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const mode = settings.comparisonMode;
  if (mode === "DIFFERENCE") {
    lines.push(
      '- comparisonMode=DIFFERENCE 로 출제하라: 발문은 "(가)와 (나)의 차이점으로 가장 적절한 것은?", 선지는 "(가)는 ~하고 있는 반면, (나)는 ~하고 있다" 대구 구조. 오답에 HALF_TRUE_PAIR(절반 참)·ROLE_SWAP(교차 귀속)을 반드시 포함하라.',
    );
  } else {
    lines.push(
      '- comparisonMode=COMMON 으로 출제하라 (합본 최빈): 발문은 "(가)와 (나)의 공통점으로…" (3파트면 "(가)~(다)의 공통점으로…"). 오답의 주력은 PARTIAL_ONLY(한 작품에만 성립) 2개 이상.',
    );
  }
  if (settings.stemPolarity === "NEGATIVE") {
    lines.push(
      "- stemPolarity=NEGATIVE 로 출제하라: '적절하지 않은 것은?' — 이때 정답이 성립하지 않는 선지(함정 원리 적용)이고, 나머지 4개는 모든 작품에서 성립해야 한다(각각 파트별 근거 확보).",
    );
  } else {
    lines.push("- stemPolarity=POSITIVE 로 출제하라 ('가장 적절한 것은?') — 정답 1개만 모든 작품에 성립.");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 교과서 수록작(수업에서 다룬 작품)과 외부 초면 작품을 엮는 '수능형 내신'의 표준 구도를 전제하라. 공통점 진술은 수업 필기·자습서에 등장하는 표준 개념어에 앵커하되, 기출 선지의 위치·표현 암기만으로는 풀리지 않게 재진술하라. 불성립 지점은 초면 작품 쪽에 배치해 실제 대조를 강제하라.",
    );
  } else {
    lines.push(
      "- 수능 모드: 복합(갈래 복합·주제 통합) 세트의 1번 슬롯(세트 개시 문항, 2점) 관행을 따르라. 판정은 문면 대조만으로 결정 가능해야 하며(외적 준거 없이 해석이 갈리는 진술 금지), 진술 층위는 표현·전개·태도 층위를 고르게 분산하라.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 — 유형 특화 결정론 체크
//   1) (가)(나) 파트 2개 이상 (MIXED 구조 필수)
//   2) comparedParts ↔ 지문 파트·발문 지시 정합
//   3) comparisonMode·stemPolarity ↔ 발문 문면 정합
//   4) optionAnalyses 매트릭스 완전성 (검증량 = 작품 수 × 선지 수)
//   5) 매트릭스 ↔ 정답 정합 ('모든 작품에 성립해야 참')
//   6) 정답 선지 근거의 파트별 SUPPORTS 커버리지 (2파트면 2개+)
//   7) trapPrinciple ↔ 매트릭스 모순 검사 + 함정 구성 경고
// 공통 게이트(선지 수·근거 verbatim·어미 strategy·마커해소)는 dispatch 선실행 — 중복 금지.
// ---------------------------------------------------------------------------

const PART_ORDER = ["(가)", "(나)", "(다)", "(라)"] as const;
const DISTORT_RELATIONS = new Set(["CONTRADICTS", "NOT_MENTIONED", "DISTORTS"]);

interface PartVerdict {
  part: string;
  holds: boolean;
}

interface OptionAnalysis {
  label: string;
  trapPrinciple?: string;
  partVerdicts: PartVerdict[];
}

function readAnalyses(q: Record<string, unknown>): OptionAnalysis[] {
  if (!Array.isArray(q.optionAnalyses)) return [];
  const out: OptionAnalysis[] = [];
  for (const raw of q.optionAnalyses) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    if (typeof a.label !== "string") continue;
    const verdicts: PartVerdict[] = [];
    if (Array.isArray(a.partVerdicts)) {
      for (const v of a.partVerdicts) {
        if (!v || typeof v !== "object") continue;
        const pv = v as Record<string, unknown>;
        if (typeof pv.part === "string" && typeof pv.holds === "boolean") {
          verdicts.push({ part: pv.part, holds: pv.holds });
        }
      }
    }
    out.push({
      label: a.label,
      trapPrinciple: typeof a.trapPrinciple === "string" ? a.trapPrinciple : undefined,
      partVerdicts: verdicts,
    });
  }
  return out;
}

/** 발문이 지시하는 파트 집합 — "(가)~(다)" 범위 표기와 개별 표기 모두 해석. */
function referencedPartsInDirection(direction: string): Set<string> {
  const refs = new Set<string>();
  const rangeRe = /\((가|나|다|라)\)\s*[~∼～]\s*\((가|나|다|라)\)/g;
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(direction)) !== null) {
    const a = PART_ORDER.indexOf(`(${m[1]})` as (typeof PART_ORDER)[number]);
    const b = PART_ORDER.indexOf(`(${m[2]})` as (typeof PART_ORDER)[number]);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) refs.add(PART_ORDER[i]);
  }
  const singleRe = /\((가|나|다|라)\)/g;
  while ((m = singleRe.exec(direction)) !== null) refs.add(`(${m[1]})`);
  return refs;
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const comparisonMode = question.comparisonMode === "DIFFERENCE" ? "DIFFERENCE" : "COMMON";
  const stemPolarity = question.stemPolarity === "NEGATIVE" ? "NEGATIVE" : "POSITIVE";

  // ── (1) 복합지문 구조 검사 — (가)(나) 파트 2개 이상 (결정론) ─────────────
  const labeledParts = splitKoPassageParts(ctx.passage).filter((p) => p.label);
  if (labeledParts.length < 2) {
    add(
      "error",
      "ko-direction-grammar",
      `작품 간 비교 유형은 (가)(나) 복합지문 전용입니다 — 지문에서 라벨 파트가 ${labeledParts.length}개만 판정되었습니다 (파트 2개 이상 필수, 단일 지문 출제 불가)`,
    );
    return issues; // 구조 무효 — 이하 파트 의존 검사는 무의미
  }
  const partTextOf = new Map<string, string>();
  for (const p of labeledParts) {
    if (p.label) partTextOf.set(p.label, p.text);
  }

  // ── (2) comparedParts ↔ 지문 파트·발문 지시 정합 (결정론) ────────────────
  const comparedParts = Array.isArray(question.comparedParts)
    ? (question.comparedParts as unknown[]).filter((p): p is string => typeof p === "string")
    : [];
  const comparedSet = new Set(comparedParts);
  if (comparedSet.size < 2) {
    add("error", "ko-direction-grammar", "comparedParts 는 서로 다른 파트 2개 이상이어야 합니다");
  }
  for (const part of comparedSet) {
    if (!partTextOf.has(part)) {
      add(
        "error",
        "ko-direction-grammar",
        `comparedParts 의 ${part} 가 지문에 실재하지 않습니다 — 지문 파트: ${[...partTextOf.keys()].join(" ")}`,
      );
    }
  }
  const directionRefs = referencedPartsInDirection(direction);
  for (const part of comparedSet) {
    if (!directionRefs.has(part)) {
      add("error", "ko-direction-grammar", `발문이 비교 대상 ${part} 를 지시하지 않습니다 — 발문·comparedParts 불일치`);
    }
  }
  for (const part of directionRefs) {
    if (!comparedSet.has(part)) {
      add(
        "error",
        "ko-direction-grammar",
        `발문이 ${part} 를 지시하지만 comparedParts 에 없습니다 — 발문·comparedParts 불일치`,
      );
    }
  }

  // ── (3) comparisonMode·stemPolarity ↔ 발문 문면 정합 (결정론) ────────────
  if (comparisonMode === "COMMON" && !direction.includes("공통")) {
    add("error", "ko-direction-grammar", "comparisonMode=COMMON 인데 발문에 '공통점' 지시가 없습니다");
  }
  if (comparisonMode === "DIFFERENCE" && !/차이/.test(direction)) {
    add("error", "ko-direction-grammar", "comparisonMode=DIFFERENCE 인데 발문에 '차이점' 지시가 없습니다");
  }
  const negativeStem = ctx.koText.isNegativeStemKo(direction);
  if (stemPolarity === "NEGATIVE" && !negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
  }
  if (stemPolarity === "POSITIVE" && negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
  }

  // ── (4) optionAnalyses 매트릭스 완전성 — 검증량 = 작품 수 × 선지 수 ──────
  const analyses = readAnalyses(question);
  const byLabel = new Map<string, OptionAnalysis>();
  for (const a of analyses) byLabel.set(a.label, a);
  if (analyses.length !== 5 || byLabel.size !== 5) {
    add(
      "error",
      "ko-option-count",
      `optionAnalyses 가 선지 ①~⑤ 를 정확히 1회씩 커버해야 합니다 (현재 ${analyses.length}개, 고유 라벨 ${byLabel.size}개)`,
    );
  }
  const requiredJudgements = comparedSet.size * 5;
  for (const a of analyses) {
    const verdictParts = a.partVerdicts.map((v) => v.part);
    const verdictSet = new Set(verdictParts);
    const missing = [...comparedSet].filter((p) => !verdictSet.has(p));
    const extra = verdictParts.filter((p) => !comparedSet.has(p));
    if (missing.length > 0 || extra.length > 0 || verdictSet.size !== verdictParts.length) {
      add(
        "error",
        "ko-option-count",
        `${a.label} 선지의 partVerdicts 가 비교 대상 파트를 정확히 1회씩 커버하지 않습니다` +
          (missing.length ? ` — 누락: ${missing.join(" ")}` : "") +
          (extra.length ? ` — 비교 대상 외 파트: ${extra.join(" ")}` : "") +
          ` (검증량 = 작품 수 × 선지 수 = ${comparedSet.size}×5 = ${requiredJudgements}판정 전 칸 필수)`,
      );
    }
  }

  // ── (5) 매트릭스 ↔ 정답 정합 — '모든 작품에 성립해야 참' (결정론) ────────
  const holdsInAll = (a: OptionAnalysis): boolean =>
    a.partVerdicts.length > 0 && a.partVerdicts.every((v) => v.holds);
  for (const a of analyses) {
    if (a.partVerdicts.length === 0) continue; // (4)에서 이미 반려
    const isCorrect = a.label === correctAnswer;
    const mustHoldInAll = stemPolarity === "POSITIVE" ? isCorrect : !isCorrect;
    if (mustHoldInAll && !holdsInAll(a)) {
      const failed = a.partVerdicts.filter((v) => !v.holds).map((v) => v.part);
      add(
        "error",
        "ko-correct-answer-invalid",
        `${a.label} 선지는 ${isCorrect ? "정답" : "참 선지"}인데 매트릭스상 ${failed.join(" ")} 에서 불성립입니다 — 공통 판정은 '모든 작품에 성립해야 참'`,
      );
    }
    if (!mustHoldInAll && holdsInAll(a)) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${a.label} 선지는 ${isCorrect ? "정답(불성립 선지)" : "오답"}인데 매트릭스상 전 작품 성립입니다 — 복수 정답 위험`,
      );
    }
  }

  // ── (6) 정답 선지 근거의 파트별 SUPPORTS 커버리지 (결정론) ───────────────
  //  POSITIVE: 정답이 '모든 작품에 성립'하는 선지 — 파트마다 SUPPORTS 근거
  //  스팬이 1개 이상 그 파트 원문 안에 실재해야 한다 (2파트면 SUPPORTS 2개+).
  //  NEGATIVE: 정답은 불성립 선지 — 왜곡 계열(CONTRADICTS/NOT_MENTIONED/
  //  DISTORTS) 근거가 1개 이상 있어야 한다.
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  const correctEvidence = evidence.filter(
    (e) => typeof e.optionLabel === "string" && e.optionLabel === correctAnswer,
  );
  if (correctAnswer && stemPolarity === "POSITIVE") {
    const supportSpans = correctEvidence
      .filter((e) => e.relation === "SUPPORTS" && typeof e.spanText === "string")
      .map((e) => e.spanText as string);
    const uncovered: string[] = [];
    for (const part of comparedSet) {
      const partText = partTextOf.get(part);
      if (!partText) continue; // (2)에서 이미 반려
      const covered = supportSpans.some((span) => ctx.koText.containsSpanKo(partText, span));
      if (!covered) uncovered.push(part);
    }
    if (uncovered.length > 0) {
      add(
        "error",
        "ko-evidence-missing",
        `정답 선지의 SUPPORTS 근거가 ${uncovered.join(" ")} 파트에 없습니다 — 공통 성립 정답은 비교 대상 파트마다 근거 스팬 1개 이상 필수 (${comparedSet.size}파트면 SUPPORTS ${comparedSet.size}개 이상)`,
      );
    }
  }
  if (correctAnswer && stemPolarity === "NEGATIVE") {
    const hasDistort = correctEvidence.some(
      (e) => typeof e.relation === "string" && DISTORT_RELATIONS.has(e.relation),
    );
    if (!hasDistort) {
      add(
        "error",
        "ko-evidence-missing",
        `부정발문 정답(불성립 선지)에 왜곡 계열 근거(CONTRADICTS/NOT_MENTIONED/DISTORTS)가 없습니다 — 불성립 파트의 배제 근거를 지정해야 합니다`,
      );
    }
  }

  // ── (7) trapPrinciple ↔ 매트릭스 모순 검사 (결정론) + 함정 구성 경고 ─────
  const flawedAnalyses = analyses.filter((a) =>
    stemPolarity === "POSITIVE" ? a.label !== correctAnswer : a.label === correctAnswer,
  );
  for (const a of analyses) {
    if (!a.trapPrinciple) continue;
    const isFlawSlot = flawedAnalyses.includes(a);
    if (!isFlawSlot) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${a.label} 선지는 성립(참) 선지인데 trapPrinciple(${a.trapPrinciple})이 선언되어 있습니다 — 함정 원리는 불성립 선지에만 선언`,
      );
      continue;
    }
    if (a.partVerdicts.length === 0) continue;
    const trues = a.partVerdicts.filter((v) => v.holds).length;
    const falses = a.partVerdicts.filter((v) => !v.holds).length;
    if (a.trapPrinciple === "PARTIAL_ONLY" && !(trues >= 1 && falses >= 1)) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${a.label} 선지는 PARTIAL_ONLY(일부 작품에만 성립) 함정인데 매트릭스가 성립 ${trues}/불성립 ${falses} — 성립·불성립이 공존해야 합니다`,
      );
    }
    if (a.trapPrinciple === "ABSENT_ALL" && trues > 0) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${a.label} 선지는 ABSENT_ALL(전 작품 부재) 함정인데 매트릭스상 성립 파트가 ${trues}개 있습니다`,
      );
    }
    if (a.trapPrinciple === "HALF_TRUE_PAIR") {
      if (comparisonMode !== "DIFFERENCE") {
        add(
          "error",
          "ko-correct-answer-invalid",
          `${a.label} 선지의 HALF_TRUE_PAIR(대구 절반 참)는 차이점(DIFFERENCE) 모드 전용 함정입니다`,
        );
      } else if (!(trues >= 1 && falses >= 1)) {
        add(
          "error",
          "ko-correct-answer-invalid",
          `${a.label} 선지는 HALF_TRUE_PAIR 함정인데 매트릭스에 참 절과 거짓 절이 공존하지 않습니다 (성립 ${trues}/불성립 ${falses})`,
        );
      }
    }
    if ((a.trapPrinciple === "EFFECT_DISTORTED" || a.trapPrinciple === "ROLE_SWAP") && falses === 0) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${a.label} 선지는 ${a.trapPrinciple} 함정인데 매트릭스상 불성립 파트가 없습니다`,
      );
    }
  }
  // 최빈 함정(일부 작품에만 성립) 밀도 — 공통점 모드의 매력 오답 구성 경고
  if (comparisonMode === "COMMON" && stemPolarity === "POSITIVE" && analyses.length === 5) {
    const partialShaped = flawedAnalyses.filter((a) => {
      const trues = a.partVerdicts.filter((v) => v.holds).length;
      const falses = a.partVerdicts.filter((v) => !v.holds).length;
      return trues >= 1 && falses >= 1;
    }).length;
    if (partialShaped < 2) {
      add(
        "warning",
        "ko-option-ending",
        `'일부 작품에만 성립' 형태의 오답이 ${partialShaped}개뿐입니다 — 이 유형의 최빈 함정(한 작품에만 성립)을 오답 4개 중 2개 이상 배치하세요`,
      );
    }
    const absentShaped = flawedAnalyses.filter((a) =>
      a.partVerdicts.length > 0 && a.partVerdicts.every((v) => !v.holds),
    ).length;
    if (absentShaped > 1) {
      add(
        "warning",
        "ko-option-ending",
        `전 작품 불성립(ABSENT_ALL 형태) 오답이 ${absentShaped}개입니다 — 매력도가 낮으니 최대 1개로 줄이고 부분 성립 함정으로 대체하세요`,
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_LIT_COMPARE: KoTypeModule = {
  meta: {
    typeId: "KO_LIT_COMPARE",
    area: "LITERATURE",
    label: "작품 간 공통점·차이점",
    formatCategory: "객관식",
    uiGroup: "국어 문학",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: [],
    optionEnding: "strategy",
    needsSolverGate: false,
    description:
      "(가)(나) 복합지문에서 작품 간 공통점('모든 작품에 성립해야 참') 또는 차이점을 판정하는 복합 세트 개시 유형 — 검증량 = 작품 수 × 선지 수",
    setSlot: "복합((가)(나) 갈래 복합·합본) 세트 1번 슬롯 — 세트 개시 문항, 2점",
    studentTask:
      "선지 5개를 (가)(나) 모든 작품에 대조해, 전 작품에서 성립하는 공통점(또는 정확한 대비 진술) 하나를 고릅니다.",
    bestFor: [
      "(가)(나) 갈래 복합 지문 (운문+운문, 운문+수필)",
      "교과서 수록작 + 외부 초면 작품을 엮은 수능형 내신 지문",
      "표현·전개·태도 층위의 공통 자질이 문면에서 확인되는 작품 조합",
    ],
    outputUi: ["(가)(나) 복합지문 동봉", "5지선다('~하고 있다')", "작품×선지 판정 매트릭스 근거 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "comparisonMode",
        label: "비교 축",
        kind: "select",
        options: [
          { value: "COMMON", label: "공통점 (합본 최빈)" },
          { value: "DIFFERENCE", label: "차이점 (대구 선지)" },
        ],
        defaultValue: "COMMON",
        description: "공통점은 '모든 작품에 성립해야 참', 차이점은 절반만 참인 대구 함정이 표준",
      },
      {
        key: "stemPolarity",
        label: "발문 극성",
        kind: "select",
        options: [
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것)" },
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것)" },
        ],
        defaultValue: "POSITIVE",
        description: "부정발문은 참 선지 4개 전부에 파트별 근거가 필요해 검증 부담이 커집니다",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    return buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: true,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "2작품 비교(10판정). 공통점은 표층 형식 자질(말을 건네는 어투·자연물 소재·계절감)로, 오답의 불성립 지점이 해당 작품 문면에서 즉시 확인되게 하라.",
    INTERMEDIATE:
      "부분 성립(한 작품에만 성립) 함정을 2개 이상 배치하고, 기법은 공통 실재하되 효과부가 어긋나는 EFFECT_DISTORTED 를 1개 포함하라. 판정에 작품별 맥락(연·장면 단위) 결합이 필요하게 하라.",
    KILLER:
      "3작품 (가)~(다) 비교로 15판정을 강제하라. 오답 전부를 '한 작품에만 성립하거나 효과만 어긋나는' 절반 참으로 설계하고, 정답의 공통 자질은 태도·형상화 방식 층위로 추상화해 표면 어휘 매칭으로는 판정이 안 되게 하라. 불성립 지점은 작품마다 다른 파트에 분산해 전 매트릭스 검증을 강제하라.",
  },
};
