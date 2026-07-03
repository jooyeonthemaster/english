// ============================================================================
// KO_RD_APPLY — 독서 <보기> 구체 사례 적용 (3점 킬러 슬롯)
// ============================================================================
// 카탈로그 §2.1 KO_RD_BOKI 사양의 전면 구현 (스펙 §5 타입코드 KO_RD_APPLY).
//
// 실측 근거(2026 수능 12번 = 전체 오답률 1위 77~79%, 열팽창 <보기> 적용):
//   발문: "윗글을 바탕으로 <보기>를 이해한 내용으로 적절하지 않은 것은? [3점]"
//         긍정발문 전환("…가장 적절한 것은?")이 최고난도 — 선지 전수 검증 강제
//   <보기>: 지문 원리를 적용할 신규 사례·실험·시나리오 — 변인 기호(a/b, A/B, T₀)와
//   수치를 명시하고, 필요시 "(단, ~는 고려하지 않음.)" 통제 조항으로 판정 조건 봉인
//   선지 어미: '~겠군' (감상·적용형 어미 — 공통 게이트 optionEnding=appreciation)
//   오답 4원리: 비례/반비례 관계 반전 · 조건 누락 적용 · 사례 요소-지문 개념 오매칭 ·
//   지문 원리의 범위 밖 확장
//   3점 배치: 독서 세트 마지막~끝에서 둘째 슬롯 사실상 고정, 킬러 배제 이후
//   독서 변별의 핵심 축 — needsSolverGate=true (독립 솔버 정답 일치 게이트 + 검수 권장)
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { koAnalyzeContentTokens } from "../text/ko-tokenizer";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 스키마 — 공통 MC5 봉투 + 유형 특화 필드
// ---------------------------------------------------------------------------

const trapPrincipleEnum = z
  .enum(["PROPORTION_FLIP", "CONDITION_OMISSION", "CONCEPT_MISMATCH", "SCOPE_OVEREXTENSION"])
  .describe(
    "왜곡 원리: PROPORTION_FLIP=비례/반비례 관계 반전, CONDITION_OMISSION=조건 누락 적용(통제 조항·한정 조건 무시), CONCEPT_MISMATCH=사례 요소-지문 개념 오매칭, SCOPE_OVEREXTENSION=지문 원리의 범위 밖 확장",
  );

const schema = koMc5Envelope({
  stemPolarity: z
    .enum(["NEGATIVE", "POSITIVE"])
    .describe(
      "발문 극성 — NEGATIVE: '적절하지 않은 것은?' (기본, 왜곡 선지 1개=정답), POSITIVE: '가장 적절한 것은?' (최고난도 전수검증형, 왜곡 선지 4개)",
    ),
  bogiDesignNote: z
    .string()
    .min(20)
    .describe(
      "보기-지문 정합 설계 메모 (내부 감사용, 학생 비노출) — <보기>의 각 변인·수치·조건이 지문의 어느 원리 문장에 대응하는지, 정답 판정이 어떤 대응 경로로 확정되는지 2~4문장으로 기록",
    ),
  trapDesign: z
    .array(
      z.object({
        label: z.enum(["①", "②", "③", "④", "⑤"]).describe("왜곡 진술 선지의 라벨"),
        principle: trapPrincipleEnum,
      }),
    )
    .min(1)
    .max(4)
    .describe(
      "왜곡 선지 설계 명세 — NEGATIVE 발문이면 정답 선지 1개, POSITIVE 발문이면 오답 선지 4개 각각에 사용한 왜곡 원리를 기록 (POSITIVE 는 4개 원리가 서로 달라야 함)",
    ),
});

// ---------------------------------------------------------------------------
// 생성 프롬프트 — 출제 매뉴얼
// ---------------------------------------------------------------------------

const prompt = `### 유형: 독서 — <보기> 구체 사례 적용 (3점 킬러)

**발문 템플릿** (stemPolarity 에 따라 정확히 이 형태로 — [3점] 마크업은 넣지 말 것, 시스템 처리):
- NEGATIVE(기본): "윗글을 바탕으로 <보기>를 이해한 내용으로 적절하지 않은 것은?"
- POSITIVE(최고난도): "윗글을 바탕으로 <보기>를 이해한 내용으로 가장 적절한 것은?"
- 변형 허용: "윗글을 참고하여 <보기>를 이해한 내용으로 …" / "윗글을 바탕으로 <보기>의 ㄱ~ㄷ을 이해한 내용으로 …" — 어느 경우든 발문에 '<보기>'가 반드시 등장해야 한다.

**<보기> 설계 사양** (이 유형의 심장 — 지문 원리를 적용할 **신규** 사례·실험·시나리오):
1. <보기>는 지문에 등장하지 않는 새로운 구체 상황이어야 한다: 실험 설계, 가상 사례, 제도 적용 상황, 기기·시스템의 작동 시나리오 등. 지문 문장의 재진술·요약은 <보기>가 아니다.
2. **변인 기호와 수치를 명시하라**: 비교 대상은 a/b, A/B, 갑/을, ㄱ/ㄴ 같은 기호로 지정하고, 판정에 필요한 조건은 수치(온도 20℃, 농도 3%, 기간 2년, 금액 1,000만 원 등)로 고정하라. 기호·수치 없는 서술형 <보기>는 판정 기준이 흐려져 복수정답 시비를 부른다.
3. 판정 조건을 봉인하라: 지문 원리 밖의 교란 요인이 개입할 수 있으면 반드시 "(단, ~은 고려하지 않음.)" 통제 조항으로 차단하라. 통제 조항은 별도 행으로 두고 <보기>의 마지막에 배치한다.
4. <보기>의 모든 변인·조건은 지문의 원리 문장과 1:1 이상 대응해야 한다 — 지문이 다루지 않는 속성을 <보기>에 넣어 판정을 요구하지 마라. 이 대응 관계를 bogiDesignNote 에 감사 가능하게 기록하라.
5. 분량은 3~6행. 행 나열이 필요하면 'ㄱ. …' 항목 형식을 사용한다.

**선지 구성 원리**:
1. 선지는 [<보기> 요소 지목] + [지문 원리 적용] + '~겠군' 의 3부 구조다. 예: "a는 b보다 온도 변화가 크므로 ㉠ 단계에서 팽창 폭이 더 크겠군."
2. **모든 선지는 <보기>의 변인 기호·수치·요소를 직접 언급해야 한다** — <보기> 없이 지문만으로 판정되는 선지는 이 유형이 아니다(검증기가 기계 검사한다).
3. 선지 어미는 '~겠군'(또는 '~군')으로 통일하라.
4. NEGATIVE 발문이면 올바른 적용 4개 + 왜곡 적용 1개(=정답). POSITIVE 발문이면 왜곡 4개 + 올바른 적용 1개(=정답).
5. 5개 선지는 <보기>의 서로 다른 요소·국면을 다뤄라 — 같은 변인 쌍의 같은 비교를 표현만 바꿔 반복하지 마라.

**오답(왜곡 적용) 함정 원리** — trapDesign 에 라벨별로 기록하고, 하나를 정확히 적용하라:
- PROPORTION_FLIP(비례/반비례 관계 반전): 지문 "x가 커질수록 y는 작아진다" → 선지는 <보기>의 a(x 큼)에 대해 "y도 크겠군". 수치 계산 없이 **방향 판정만으로** 오류가 확정되게 설계하라.
- CONDITION_OMISSION(조건 누락 적용): 지문 원리에 붙은 한정("~인 경우에만", "다만 ~를 제외하고")이나 <보기>의 통제 조항을 무시하고 원리를 일괄 적용. 예: 지문 "밀폐 상태에서만 압력이 유지된다" + <보기> b는 개방 상태 → 선지 "b도 압력이 유지되겠군".
- CONCEPT_MISMATCH(사례 요소-지문 개념 오매칭): <보기>의 a에 대응하는 지문 개념은 ㉠인데 ㉡의 성질을 a에 적용. 예: <보기>의 '선체결 계약'은 지문의 '낙성 계약' 사례인데 '요물 계약'의 효과를 귀속.
- SCOPE_OVEREXTENSION(지문 원리의 범위 밖 확장): 지문이 특정 영역에 한정해 진술한 원리를 <보기>의 다른 영역까지 확장 적용하거나, 지문에 없는 인과를 <보기> 수치에서 창작. 그럴듯하지만 지문 어디에도 근거가 없어야 한다.
- POSITIVE 발문의 왜곡 4개는 **서로 다른 원리**를 쓰라(같은 원리 2회 금지). 왜곡은 선지당 정확히 한 지점 — 두 군데 이상 틀리면 소거가 쉬워진다.

**근거앵커(evidence) 작성법**:
- 올바른 적용 선지: relation=SUPPORTS + 그 적용의 근거가 되는 지문 원리 문장(verbatim). <보기> 문장이 아니라 **지문** 구절을 spanText 로 복사하라.
- 왜곡 선지: PROPORTION_FLIP·CONDITION_OMISSION·CONCEPT_MISMATCH 는 relation=DISTORTS + 올바른 방향/조건/대응을 명시한 지문 원문 구절. SCOPE_OVEREXTENSION 은 relation=NOT_MENTIONED + 가장 가까운 관련 구절.
- note 에 '보기의 어느 요소를 지문의 어느 원리로 판정했는지' 한 줄로 남겨라.

**해설·bogiDesignNote**:
- explanation 은 <보기> 요소 → 지문 원리 → 판정의 3단 경로를 보여 주고, 정답 선지의 왜곡 지점을 원리명으로 지목하라.
- bogiDesignNote(내부 감사용)에는 변인·수치별 지문 대응표와 통제 조항의 존재 이유를 기록하라. 학생에게 노출되지 않는다.

**금지**:
- 지문 내용의 재진술에 불과한 <보기> (신규 사례가 아님).
- <보기>를 읽지 않아도 지문만으로 판정되는 선지.
- 지문 원리와 <보기> 조건이 상충해 두 선지 이상이 동시에 틀리는 구성 (단일정답성 파괴 — 이 유형 최대 리스크).
- 교육과정 밖 배경지식(전공 공식·법 조문 암기)이 있어야만 판정되는 선지.
- 수치를 제시하고도 판정에 쓰지 않는 장식용 수치 남발 (모든 수치는 판정 경로에 참여해야 한다).`;

// ---------------------------------------------------------------------------
// 설정 → 프롬프트 지시 블록
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  if (settings.stemPolarity === "POSITIVE") {
    lines.push(
      "- stemPolarity=POSITIVE 로 출제하라: 발문은 '윗글을 바탕으로 <보기>를 이해한 내용으로 가장 적절한 것은?', 선지는 왜곡 4(서로 다른 원리) + 올바른 적용 1. 2026 수능 12번(전체 오답률 1위)형 최고난도.",
    );
  } else {
    lines.push(
      "- stemPolarity=NEGATIVE 로 출제하라: 발문은 '윗글을 바탕으로 <보기>를 이해한 내용으로 적절하지 않은 것은?', 올바른 적용 4 + 왜곡 1.",
    );
  }
  if (settings.scenarioKind === "EXPERIMENT") {
    lines.push(
      "- <보기>는 실험·측정 시나리오로 설계하라: 실험군/대조군 기호(A/B), 조작 변인 수치, 통제 조항 \"(단, ~은 고려하지 않음.)\" 을 반드시 포함.",
    );
  } else if (settings.scenarioKind === "CASE") {
    lines.push(
      "- <보기>는 인물·상황 사례로 설계하라: 행위 주체(갑/을)와 조건 수치(기간·금액·횟수)를 명시하고, 지문 개념의 성립 요건이 사례 안에서 판정 가능하게 하라.",
    );
  } else if (settings.scenarioKind === "SYSTEM") {
    lines.push(
      "- <보기>는 기기·제도·시스템의 작동 시나리오로 설계하라: 구성 요소 기호(a/b)와 입력 수치를 제시하고, 지문의 절차·단계 원리가 순서대로 적용되게 하라.",
    );
  } else {
    lines.push(
      "- <보기> 시나리오 종류는 지문 분야에 맞게 선택하라(과학·기술=실험/작동, 사회·법=사례/제도, 인문·예술=사례/견해 적용).",
    );
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: <보기>는 수업에서 다뤘을 법한 심화 사례·기출 사례를 재구성한 톤으로(민원 회피 관행) 만들되, 판정 근거는 전부 지문 문면에 두어라. 왜곡 지점은 수능보다 명시적으로(한 요소의 명백한 방향 오류) 설계해 채점 시비를 차단하라.",
    );
  } else {
    lines.push(
      "- 수능 모드: <보기>는 완전 신규 시나리오로. 왜곡은 '한 끗 차이'(방향 반전·조건 하나 누락)로 설계해 매력적 오답을 만들어라. 3점 킬러 슬롯의 변별력이 목표다.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 — 유형 특화 결정론 체크
// (공통 게이트: 선지수·근거앵커 verbatim·보기 존재·선지 어미(appreciation)·
//  발문 문법은 dispatch 가 선실행 — 여기서 중복 구현하지 않는다)
// ---------------------------------------------------------------------------

const DISTORT_RELATIONS = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);

/**
 * 변인 기호(a, b, A, T0, T₀ …)·수치 토큰 추출 — 라틴/숫자 런을 한글 조사와
 * 분리해 뽑는다("a와"→"a", "b를"→"b"). 4자 이상 라틴 런(영단어)은 기호가 아니다.
 */
const SYMBOL_TOKEN_RE = /[A-Za-z]{1,3}[0-9₀-₉]{0,2}|[0-9０-９]+/g;

function extractSymbolTokens(text: string): string[] {
  return (text.match(SYMBOL_TOKEN_RE) ?? []).filter((t) => !/^[A-Za-z]{4,}/.test(t));
}

/**
 * <보기> 어휘 불용어 — 유형 메타 어휘·지시 표현은 '보기 언급'의 판정 근거가 될 수
 * 없다 (KO_LIT_BOGI.BOGI_STOPWORDS 미러 + 독서 사례 적용형 보강: 실험/조건 등).
 */
const RD_APPLY_BOGI_STOPWORDS = new Set([
  "있다", "없다", "때문", "경우", "이후", "이전", "통해", "위해", "대해", "대한",
  "가장", "매우", "여러", "다른", "같은", "모든", "바로", "다시", "이러한",
  "지문", "윗글", "보기", "실험", "사례", "상황", "시나리오", "조건", "않음",
]);

/**
 * <보기> 텍스트에서 선지-연결 판정용 토큰(변인 기호·수치·내용어 스템)을 추출한다.
 * 내용어는 ko-tokenizer(koAnalyzeContentTokens)의 조사 박리 스템 중 **순수 한글
 * 2음절 이상**만 채택한다 — 종전의 '한글 런 + 2자 접두' 방식은 '에서/하였' 류
 * 초고빈도 기능 조각이 stems 에 들어가 어떤 선지든 통과하는 가짜 게이트였다(KO-4).
 * 라틴 혼합 토큰(A에서는 등)의 변인 기호는 symbols(extractSymbolTokens)가 담당한다.
 */
function collectBogiTokens(bogiText: string): { symbols: Set<string>; stems: Set<string> } {
  const symbols = new Set<string>(extractSymbolTokens(bogiText));
  const stems = new Set<string>();
  for (const token of koAnalyzeContentTokens(bogiText)) {
    const stem = token.stem;
    if (!/^[가-힣]{2,}$/.test(stem)) continue;
    if (RD_APPLY_BOGI_STOPWORDS.has(stem)) continue;
    stems.add(stem);
  }
  return { symbols, stems };
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const stemPolarity = question.stemPolarity === "POSITIVE" ? "POSITIVE" : "NEGATIVE";
  const negativeStem = ctx.koText.isNegativeStemKo(direction);
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";

  // [결정론 1] 발문이 <보기> 적용 발문인지 — '보기' 언급 필수
  if (!/보\s*기/.test(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      "발문에 '<보기>' 가 없습니다 — 이 유형의 발문은 '윗글을 바탕으로 <보기>를 이해한 내용으로 …' 형태여야 합니다",
    );
  }

  // [결정론 2] stemPolarity ↔ 발문 극성 정합
  if (stemPolarity === "NEGATIVE" && !negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
  }
  if (stemPolarity === "POSITIVE" && negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
  }

  // <보기> 본문 수집 (존재 자체는 공통 게이트 KOQ_BOGI_MISSING 이 차단)
  const bogi =
    question.bogi && typeof question.bogi === "object"
      ? (question.bogi as Record<string, unknown>)
      : null;
  const bogiLines = Array.isArray(bogi?.lines)
    ? (bogi.lines as unknown[]).filter((l): l is string => typeof l === "string")
    : [];
  const bogiText = bogiLines.join("\n");

  if (bogiText) {
    // [결정론 3] <보기>에 변인 기호 또는 수치 명시 (카탈로그 <보기> 설계 사양)
    const { symbols, stems } = collectBogiTokens(bogiText);
    const hasNumeric = /[0-9０-９]/.test(bogiText) || /[％%]/.test(bogiText);
    const hasVariableSymbol =
      symbols.size > 0 || /[㉮㉯]/.test(bogiText) || /(^|[^가-힣])(갑|을|병)([^가-힣]|$)/.test(bogiText);
    if (!hasNumeric && !hasVariableSymbol) {
      add(
        "error",
        "ko-bogi-missing",
        "<보기>에 변인 기호(a/b, A/B, 갑/을)나 수치가 없습니다 — 사례 적용형 <보기>는 판정 기준(기호·수치)을 명시해야 합니다",
      );
    }

    // [결정론 4] 각 선지가 <보기> 요소를 언급하는지 (보기 어휘·기호·수치 포함 검사)
    const options = Array.isArray(question.options)
      ? (question.options as Record<string, unknown>[])
      : [];
    for (const o of options) {
      const label = typeof o.label === "string" ? o.label : "";
      const text = typeof o.text === "string" ? o.text : "";
      if (!text) continue;
      const mentionsSymbol = extractSymbolTokens(text).some((t) => symbols.has(t));
      const mentionsStem = [...stems].some((s) => text.includes(s));
      const mentionsGapEul = /(^|[^가-힣])(갑|을|병)([^가-힣]|$)/.test(bogiText)
        ? /(^|[^가-힣])(갑|을|병)([^가-힣]|$)/.test(text)
        : false;
      if (!mentionsSymbol && !mentionsStem && !mentionsGapEul) {
        add(
          "error",
          "ko-bogi-missing",
          `${label} 선지가 <보기>의 어떤 요소(변인 기호·수치·어휘)도 언급하지 않습니다 — <보기> 적용형 선지는 보기 요소를 직접 지목해야 합니다`,
        );
      }
    }
  }

  // [결정론 5] trapDesign ↔ 극성·정답 정합 (왜곡 선지 명세의 구조 검사)
  const trapDesign = Array.isArray(question.trapDesign)
    ? (question.trapDesign as Record<string, unknown>[])
    : [];
  const trapLabels = trapDesign
    .map((t) => (typeof t.label === "string" ? t.label : ""))
    .filter(Boolean);
  const optionLabels = ["①", "②", "③", "④", "⑤"];
  const expectedTrapLabels = negativeStem
    ? correctAnswer
      ? [correctAnswer]
      : []
    : optionLabels.filter((l) => l !== correctAnswer);
  if (expectedTrapLabels.length > 0) {
    const got = [...trapLabels].sort().join("");
    const want = [...expectedTrapLabels].sort().join("");
    if (got !== want) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `trapDesign 의 왜곡 선지 라벨(${trapLabels.join(", ") || "없음"})이 발문 극성 기준 왜곡 선지(${expectedTrapLabels.join(", ")})와 일치하지 않습니다 — 정답 무결성 모순`,
      );
    }
  }

  // [결정론 6] 극성-근거관계 정합: 왜곡 선지의 근거는 DISTORTS/CONTRADICTS/NOT_MENTIONED,
  //            올바른 적용 선지의 근거는 SUPPORTS 여야 한다.
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  const relationOf = new Map<string, Set<string>>();
  for (const e of evidence) {
    const label = typeof e.optionLabel === "string" ? e.optionLabel : "";
    const relation = typeof e.relation === "string" ? e.relation : "";
    if (!label || !relation) continue;
    const set = relationOf.get(label) ?? new Set<string>();
    set.add(relation);
    relationOf.set(label, set);
  }
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    const shouldBeDistorted = negativeStem ? isCorrect : !isCorrect;
    const hasSupport = relations.has("SUPPORTS");
    const hasDistort = [...relations].some((r) => DISTORT_RELATIONS.has(r));
    if (shouldBeDistorted && !hasDistort) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 왜곡 적용 선지인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다 — 극성 모순`,
      );
    }
    if (!shouldBeDistorted && !hasSupport) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 올바른 적용 선지인데 SUPPORTS 근거가 없습니다 — 극성 모순`,
      );
    }
  }

  // [결정론 7] 3점 킬러 슬롯 배점 관행 — 명시 배점이 3 미만이면 경고
  if (typeof question.points === "number" && question.points < 3) {
    add(
      "warning",
      "ko-points-unusual",
      `<보기> 사례 적용 유형은 3점 배치가 관행인데 배점이 ${question.points}점입니다`,
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_RD_APPLY: KoTypeModule = {
  meta: {
    typeId: "KO_RD_APPLY",
    area: "READING",
    label: "<보기> 사례 적용(3점)",
    formatCategory: "객관식",
    uiGroup: "국어 독서",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 3,
    usesBogi: "required",
    markerFamilies: [],
    optionEnding: "appreciation",
    needsSolverGate: true,
    description:
      "지문 원리를 <보기>의 신규 사례·실험·시나리오(변인 기호·수치)에 적용해 '~겠군' 선지의 정오를 판정하는 독서 3점 킬러 유형",
    setSlot: "독서 세트 마지막~끝에서 둘째 슬롯 사실상 고정 — 매회 3~4문항, 3점 집중(킬러 배제 이후 독서 변별의 핵심)",
    studentTask: "<보기>의 사례·수치에 지문 원리를 적용한 '~겠군' 진술 5개 중 왜곡된 하나(또는 올바른 하나)를 고릅니다.",
    bestFor: [
      "원리·메커니즘이 명확한 과학·기술 지문",
      "요건-효과 구조의 사회·법 지문",
      "이론을 사례에 적용할 수 있는 인문·예술 지문",
    ],
    outputUi: ["지문 동봉", "<보기> 박스(변인·수치 시나리오)", "5지선다('~겠군')", "선지별 근거·오답 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "stemPolarity",
        label: "발문 극성",
        kind: "select",
        options: [
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것)" },
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것 — 최고난도)" },
        ],
        defaultValue: "NEGATIVE",
        description: "긍정발문은 왜곡 선지 4개의 전수 검증을 강제합니다 (2026 수능 12번형)",
      },
      {
        key: "scenarioKind",
        label: "<보기> 시나리오",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(지문 분야)" },
          { value: "EXPERIMENT", label: "실험·측정 (A/B군·조작 변인)" },
          { value: "CASE", label: "인물·상황 사례 (갑/을·조건 수치)" },
          { value: "SYSTEM", label: "기기·제도 작동 시나리오 (a/b·입력값)" },
        ],
        defaultValue: "AUTO",
        description: "<보기>에 담을 신규 사례의 골격을 지정합니다",
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
      defaultPoints: 3,
    });
  },
  difficultyGuide: {
    BASIC:
      "<보기>는 변인 1~2개의 단순 사례로. 각 선지가 보기 한 요소 ↔ 지문 한 문장의 1:1 대조로 판정되게 하라. 왜곡은 명백한 방향 반전(PROPORTION_FLIP) 하나로.",
    INTERMEDIATE:
      "<보기>에 변인 2개의 상호작용과 통제 조항을 넣어라. 판정에 지문 두 문장의 결합이 필요하게 하고, 왜곡은 조건 누락 적용(CONDITION_OMISSION)이나 개념 오매칭(CONCEPT_MISMATCH)으로 — 왜곡 지점 외 나머지는 전부 올바르게 유지하라.",
    KILLER:
      "긍정발문 전환을 우선 고려하라(왜곡 4개 전수 검증 강제 — 2026 수능 12번, 오답률 77~79% 모델). 비례/반비례 반전은 수치 계산 없이 방향 판정만으로 성립하게, 통제 조항 \"(단, ~은 고려하지 않음.)\" 을 반드시 포함하고 그 조항이 최소 한 선지의 정오를 가르게 하라. 왜곡 4개는 서로 다른 원리로.",
  },
};
