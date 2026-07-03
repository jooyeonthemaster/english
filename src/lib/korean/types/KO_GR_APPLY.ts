// ============================================================================
// KO_GR_APPLY — 문법 지문형 세트 2문항째: <보기> 사례 적용 (언매 36번 미러, 3점)
// ============================================================================
// 카탈로그 §2.5 KO_GR_APPLY 사양의 전면 구현. KO_GR_READ(지문 이해)와 지문을
// 공유하는 지문형 문법 세트의 후행 3점 슬롯 — 지문이 설명한 문법 규칙을
// <보기>의 **신규 사례 5개(ⓐ~ⓔ)** 에 적용해 [규칙 × 사례] 매트릭스를 판정한다.
//
// 실측 근거(언매 36번 관행):
//   발문: "윗글을 바탕으로 <보기>의 ⓐ~ⓔ를 이해한 내용으로 적절하지 않은 것은? [3점]"
//   변형: "윗글과 <보기>를 바탕으로 <자료>를 탐구한 것으로 적절하지 않은 것은? [3점]"
//   (<보기>+<자료> 이중 박스 — v1 은 단일 박스 라벨 "자료" 로 근사)
//   <보기>: 지문 규칙을 적용할 사례 5개 — 현대 국어 용례 또는 15세기↔현대 대응쌍.
//   ★ ⓐ~ⓔ 는 <보기> lines 안의 평문 라벨이다 — 지문 markers 가 아니다.
//   선지: "ⓐ는 ~이므로 ㉠에 해당한다" 식의 규칙×사례 매트릭스 판정, ①=ⓐ 1:1 대응.
//   오답 3원리: 적용 조건 1개 누락 사례의 해당/비해당 오판 · 규칙의 예외 무시 ·
//   두 규칙 교차 오적용.
//   배점: 3점 (언매 3점 2개 중 1개 통상 배치 — 고정 규칙 아님, 카탈로그 §3.3)
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { LATIN_CIRCLED_LABELS } from "../core/markers";
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

/** <보기> 사례 라벨 — ⓐ~ⓔ 고정 5개 (보기 lines 안의 평문, 지문 마커 아님). */
const CASE_LABELS = LATIN_CIRCLED_LABELS.slice(0, 5);

const trapPrincipleEnum = z
  .enum(["CONDITION_DROP_MISJUDGE", "EXCEPTION_IGNORED", "RULE_CROSS_APPLY"])
  .describe(
    "왜곡 원리: CONDITION_DROP_MISJUDGE=적용 조건 1개를 누락한 사례를 해당/비해당으로 오판, EXCEPTION_IGNORED=지문의 예외 조항('다만/~를 제외하면')을 무시하고 원칙만 적용, RULE_CROSS_APPLY=사례에 적용될 규칙 대신 표면이 유사한 다른 규칙의 조건·결과를 귀속",
  );

const schema = koMc5Envelope({
  stemPolarity: z
    .enum(["NEGATIVE", "POSITIVE"])
    .describe(
      "발문 극성 — NEGATIVE: '적절하지 않은 것은?' (기본·언매 36번 관행, 왜곡 판정 1개=정답), POSITIVE: '가장 적절한 것은?' (고난도 전수검증형, 왜곡 판정 4개)",
    ),
  ruleConcepts: z
    .array(z.string().min(1))
    .min(1)
    .max(6)
    .describe(
      "판정에 사용한 지문의 문법 규칙·개념어 목록 (지문 verbatim — 한 글자도 바꾸지 말 것. 예: '구개음화', 'ㄴ 첨가', '관계 관형사절'). 각 선지는 이 중 최소 1개를 본문에 포함해야 한다 — 시스템이 기계 검증",
    ),
  trapDesign: z
    .array(
      z.object({
        label: z.enum(["①", "②", "③", "④", "⑤"]).describe("왜곡 판정 선지의 라벨"),
        principle: trapPrincipleEnum,
      }),
    )
    .min(1)
    .max(4)
    .describe(
      "왜곡 선지 설계 명세 — NEGATIVE 발문이면 정답 선지 1개, POSITIVE 발문이면 오답 선지 4개 각각에 사용한 왜곡 원리를 기록 (POSITIVE 는 서로 다른 원리 우선)",
    ),
});

// ---------------------------------------------------------------------------
// 생성 프롬프트 — 출제 매뉴얼
// ---------------------------------------------------------------------------

const prompt = `### 유형: 문법 — 지문형 세트 2문항째: <보기> 사례 적용 (언매 36번 미러, 3점)

**지문 전제**: 대상 지문은 문법 규칙(음운 변동·단어 형성·문장 구조·국어사 등)을 조건과
예외까지 서술하는 문법 설명 지문이다. 출제 전에 지문에서 **적용 조건이 명시된 규칙**
('~인 경우에만', '다만 ~', '~를 제외하면')을 추출하라 — 이 유형은 그 규칙을 새 사례에
적용시키는 [규칙 × 사례] 매트릭스 문항이다.

**발문 템플릿** (stemPolarity 에 따라 정확히 이 형태로 — [3점] 마크업은 넣지 말 것, 시스템 처리):
- NEGATIVE(기본): "윗글을 바탕으로 <보기>의 ⓐ~ⓔ를 이해한 내용으로 적절하지 않은 것은?"
- POSITIVE: "윗글을 바탕으로 <보기>의 ⓐ~ⓔ를 이해한 내용으로 가장 적절한 것은?"
- 변형 허용: "윗글을 바탕으로 <자료>의 ⓐ~ⓔ를 탐구한 내용으로 …" (박스 라벨을 '자료'로
  둘 때 — 발문의 박스 명칭은 bogi.label 과 반드시 일치시켜라. 시스템이 기계 검증한다).

**<보기> 사례 설계 사양** (이 유형의 심장):
1. <보기>는 지문 규칙을 적용할 **신규 사례 정확히 5개**다. 각 사례는 bogi.lines 안에
   "ⓐ 맏이[마지]" / "ⓑ 그는 시골에서 온 학생을 만났다." 처럼 **행 머리 ⓐ~ⓔ 라벨 + 사례**
   형식으로 넣어라. ★ ⓐ~ⓔ 는 <보기> 안의 평문 라벨이다 — **markers 필드에 넣지 마라**
   (markers 는 지문 마킹 전용, 여기 넣으면 시스템이 지문에 ⓐ를 오삽입한다).
2. 사례의 형태는 지문 규칙의 종류에 맞춘다: 음운 변동이면 '표기[발음]' 쌍, 단어 형성이면
   단어와 직접구성요소, 문장 구조·문법 요소면 완결 문장, 국어사면 '중세 형태 → 현대 형태'
   대응쌍. 판정에 필요한 정보(발음·형태 분석)는 사례 안에 전부 제시하라 — 학생이 지문 밖
   지식으로 보충하게 하지 마라.
3. 사례 5개는 지문 규칙들을 고르게 커버하라: 지문이 규칙을 2개 이상 설명하면 규칙마다
   최소 1개 사례를 배정하고, **적용 조건의 충족/미충족이 갈리는 경계 사례**(조건 하나가
   빠져 규칙이 적용되지 않는 사례)를 반드시 1개 이상 포함하라 — 오답 함정의 원료다.
4. 지문이 예시로 든 단어·문장을 사례로 재사용하지 마라(최대 1개까지만 허용) — 지문 예시의
   복사는 적용 능력이 아니라 재확인만 측정한다.
5. 중세 국어 사례는 옛한글 특수 자모(ㆍ ㅿ ㆁ ㆆ, 첫가끝 조합)가 필요 없는, 현대 한글로
   표기 가능한 형태만 사용하라(조판 제약).

**선지 구성 원리**:
1. **선지-사례 1:1 순서 대응**: ①은 ⓐ에 대한 판정, ②는 ⓑ … ⑤는 ⓔ. 순서를 절대 바꾸지
   마라 (시스템이 기계 검증한다).
2. 선지는 [사례 라벨 지목] + [형태·조건 분석] + [지문 규칙 귀속 판정] 의 3부 구조다.
   예: "ⓐ는 형식 형태소 'ㅣ' 앞에서 'ㄷ'이 'ㅈ'으로 바뀐 것이므로 구개음화에 해당한다."
   지문에 ㉠·㉡ 개념 마커가 있으면 "ⓐ는 ~이므로 ㉠에 해당한다" 형태도 좋다.
3. **모든 선지는 ruleConcepts 에 등록한 지문 개념어를 최소 1개 본문에 포함해야 한다** —
   규칙 귀속 없는 사례 감상("ⓐ는 발음이 자연스럽다")은 이 유형이 아니다.
4. 선지 어미는 평서형('~에 해당한다/~가 일어난다/~가 결합한 것이다' 류의 '~다')으로 통일.
5. NEGATIVE 발문이면 올바른 판정 4개 + 왜곡 판정 1개(=정답). POSITIVE 발문이면 왜곡 4개
   + 올바른 판정 1개(=정답).

**오답(왜곡 판정) 함정 원리** — trapDesign 에 라벨별로 기록하고, 선지당 하나를 정확히 적용:
- CONDITION_DROP_MISJUDGE(적용 조건 누락 오판): 적용 조건 1개가 빠진 사례를 '해당'으로
  판정(또는 조건 충족 사례를 '비해당'으로). 예: 지문 "구개음화는 뒤의 'ㅣ'가 형식
  형태소인 경우에만 일어난다" + 사례 ⓒ '잔디'(한 형태소 내부) → 선지 "ⓒ는 'ㄷ'이 'ㅣ'
  앞에 있으므로 구개음화가 일어난다" — '형식 형태소' 조건 검사를 누락.
- EXCEPTION_IGNORED(예외 무시): 지문의 '다만/[붙임]/~를 제외하면' 예외 조항이 사례에
  적용되는데 원칙만으로 판정. 예: 지문 "다만 합성어에서는 'ㄴ'이 첨가된다" 를 무시하고
  합성어 사례를 원칙 규칙만으로 설명.
- RULE_CROSS_APPLY(두 규칙 교차 오적용): 사례에 실제 적용되는 규칙은 A인데 표면 형태가
  유사한 규칙 B의 조건·결과를 귀속. 예: 'ㄴ' 첨가 사례 '홑이불[혼니불]'을 구개음화로
  설명, 관형사절 사례를 부사절로 귀속.
- 왜곡은 선지당 **정확히 한 지점** — 형태 분석과 규칙 귀속이 동시에 틀리면 소거가 쉬워져
  3점 변별력이 죽는다. 왜곡 지점 외의 분석 서술은 전부 올바르게 유지하라.
- POSITIVE 발문의 왜곡 4개는 서로 다른 원리를 우선 사용하라(3원리 소진 후 중복 허용).

**근거앵커(evidence) 작성법**:
- 올바른 판정 선지: relation=SUPPORTS + 그 판정의 근거가 되는 지문 규칙 서술(적용 조건
  포함) verbatim. <보기> 사례 문장이 아니라 **지문** 구절을 spanText 로 복사하라.
- 왜곡 선지: relation=DISTORTS(조건 누락·규칙 교차) 또는 CONTRADICTS(예외 무시) +
  **판정을 가르는 조건·예외 조항 구절**('~인 경우에만 ~', '다만 ~')을 spanText 로 복사하라.
- note 에 '어느 사례를 어느 규칙·조건으로 판정했는지' 한 줄로 남겨라.

**해설(explanation)**:
- 정답 선지의 사례를 [형태 분석 → 적용 조건 검사 → 규칙 귀속] 3단으로 다시 판정해 보이고,
  왜곡 지점을 원리명으로 지목하라. 나머지 사례들의 올바른 귀속도 한 줄씩 확인하라.

**금지**:
- **<보기> 사례의 실세계 사실 날조** — 사전 뜻풀이·장단음(예: 말[馬]=단음, 말ː[言]=장음)·
  표준 발음의 실제 값을 지어내거나 뒤바꿔 제시하지 마라. 국어사전 사실이 100% 확실한
  대표 사례만 쓰고, 확신이 없으면 실세계 사실 판정이 필요 없는(지문 규칙 적용만으로
  정오가 갈리는) 사례로 대체하라 — 보기 사실 오류는 문항 전체의 신뢰를 무너뜨린다.
- 지문 밖 문법 지식(교육과정 배경지식·규정 조문 암기)이 있어야만 판정되는 사례 — 판정
  근거는 전부 지문 문면에 있어야 한다(지문형 문법의 존재 이유).
- <보기> 사례를 읽지 않아도 지문만으로 정오가 판정되는 선지.
- 두 선지 이상이 같은 이유로 동시에 틀리는 구성 (단일정답성 파괴 — 3점 문항 최대 리스크).
- ⓐ~ⓔ 사례 라벨을 markers 필드에 넣는 것 (지문 마킹 아님).
- 판정에 쓰이지 않는 장식용 사례 정보(발음·한자 병기) 남발 — 사례의 모든 정보는 판정
  경로에 참여해야 한다.
- 옛한글 자모가 필요한 국어사 세부 표기.`;

// ---------------------------------------------------------------------------
// 설정 → 프롬프트 지시 블록
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  if (settings.stemPolarity === "POSITIVE") {
    lines.push(
      "- stemPolarity=POSITIVE 로 출제하라: 발문은 '윗글을 바탕으로 <보기>의 ⓐ~ⓔ를 이해한 내용으로 가장 적절한 것은?', 선지는 왜곡 판정 4(서로 다른 원리 우선) + 올바른 판정 1 (전수 검증 강제).",
    );
  } else {
    lines.push(
      "- stemPolarity=NEGATIVE 로 출제하라: 발문은 '윗글을 바탕으로 <보기>의 ⓐ~ⓔ를 이해한 내용으로 적절하지 않은 것은?' (언매 36번 관행), 올바른 판정 4 + 왜곡 1.",
    );
  }
  if (settings.boxLabel === "자료") {
    lines.push(
      "- 사례 박스 라벨은 '자료' 로 하라(bogi.label=\"자료\", 언매 36번 <보기>+<자료> 이중 박스 변형의 단일 박스 근사). 발문도 '<자료>의 ⓐ~ⓔ를 탐구한 내용으로 …' 형태로 박스 명칭을 일치시켜라.",
    );
  } else {
    lines.push("- 사례 박스 라벨은 '보기' 로 하라(bogi.label=\"보기\").");
  }
  if (settings.caseKind === "MODERN") {
    lines.push(
      "- 사례는 현대 국어 용례로 구성하라: 음운 변동이면 '표기[발음]' 쌍, 단어·문장 단위 규칙이면 완결 형태를 제시하고, 조건 충족/미충족이 갈리는 경계 사례를 섞어라.",
    );
  } else if (settings.caseKind === "HISTORICAL") {
    lines.push(
      "- 사례는 중세 국어↔현대 국어 대응쌍으로 구성하라('중세 형태 → 현대 형태' + 필요시 현대어 풀이). 단 옛한글 특수 자모(ㆍ ㅿ ㆁ ㆆ) 없이 표기 가능한 형태만 사용하라.",
    );
  } else {
    lines.push(
      "- 사례 종류는 지문 규칙에 맞게 선택하라(음운·형태·통사 규칙=현대 국어 용례, 국어사 규칙=중세↔현대 대응쌍).",
    );
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 사례는 교과서 문법 단원의 학습활동에서 다뤘을 법한 친숙한 단어·문장으로 재구성하라(민원 회피 관행). 왜곡 지점은 수능보다 명시적으로(조건 하나의 명백한 누락) 설계해 채점 시비를 차단하되, 판정 근거는 전부 지문 문면에 두어라.",
    );
  } else {
    lines.push(
      "- 수능(언매 36번) 모드: 사례는 완전 신규 용례로. 왜곡은 '한 끗 차이'(조건 하나 누락·표면 유사 규칙 교차)로 설계해 매력적 오답을 만들어라. 3점 슬롯의 변별력이 목표다.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 — 유형 특화 결정론 체크
// (공통 게이트: 선지수·근거앵커 verbatim·<보기> 존재·발문 문법·마커 해소는
//  dispatch 가 선실행 — 여기서 중복 구현하지 않는다)
// ---------------------------------------------------------------------------

const DISTORT_RELATIONS = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);
const OPTION_LABELS = ["①", "②", "③", "④", "⑤"] as const;

function readBogiLines(question: Record<string, unknown>): string[] {
  const bogi =
    question.bogi && typeof question.bogi === "object"
      ? (question.bogi as Record<string, unknown>)
      : null;
  return Array.isArray(bogi?.lines)
    ? (bogi.lines as unknown[]).filter((l): l is string => typeof l === "string")
    : [];
}

function readBogiLabel(question: Record<string, unknown>): string {
  const bogi =
    question.bogi && typeof question.bogi === "object"
      ? (question.bogi as Record<string, unknown>)
      : null;
  return typeof bogi?.label === "string" ? bogi.label : "";
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const stemPolarity = question.stemPolarity === "POSITIVE" ? "POSITIVE" : "NEGATIVE";
  const negativeStem = ctx.koText.isNegativeStemKo(direction);
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";

  // [결정론 1] stemPolarity ↔ 발문 극성 정합
  if (stemPolarity === "NEGATIVE" && !negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
  }
  if (stemPolarity === "POSITIVE" && negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
  }

  // [결정론 2] 발문-박스 라벨 정합: 발문에 박스 명칭(<보기>/<자료>/<학습 활동>)이
  //   등장해야 하고, bogi.label 과 일치해야 한다 (언매 36번 발문 규약).
  const bogiLabel = readBogiLabel(question);
  if (!/보\s*기|자료|학습\s*활동/.test(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      "발문에 사례 박스 명칭(<보기>/<자료>)이 없습니다 — 이 유형의 발문은 '윗글을 바탕으로 <보기>의 ⓐ~ⓔ를 이해한 내용으로 …' 형태여야 합니다",
    );
  } else if (bogiLabel.includes("자료") && !direction.includes("자료")) {
    add(
      "error",
      "ko-direction-grammar",
      `사례 박스 라벨이 "${bogiLabel}" 인데 발문은 <자료>를 언급하지 않습니다 — 발문의 박스 명칭과 bogi.label 을 일치시키세요`,
    );
  }

  // [결정론 3] <보기> lines 에 사례 라벨 ⓐ~ⓔ 5개 전부 존재 (사례 5개 구조의 심장)
  const bogiLines = readBogiLines(question);
  const bogiText = bogiLines.join("\n");
  if (bogiText) {
    const missingLabels = CASE_LABELS.filter((label) => !bogiText.includes(label));
    if (missingLabels.length > 0) {
      add(
        "error",
        "ko-bogi-missing",
        `<보기>에 사례 라벨 ${missingLabels.join(" ")} 가 없습니다 — 사례 적용형 <보기>는 ⓐ~ⓔ 라벨 사례 5개를 lines 안에 담아야 합니다 (예: "ⓐ 맏이[마지]")`,
      );
    }

    // [결정론 4] 사례가 지문 예시의 통복사인지 — 라벨 행의 사례부가 지문에 그대로
    //   존재하면 신규 용례가 아니라는 신호 (warning — 최대 1개 재활용 허용 규약)
    let reusedCount = 0;
    const reusedSamples: string[] = [];
    for (const line of bogiLines) {
      const labelIdx = CASE_LABELS.findIndex((label) => line.trimStart().startsWith(label));
      if (labelIdx === -1) continue;
      const caseBody = line.trimStart().slice(CASE_LABELS[labelIdx].length).trim();
      if (caseBody.length >= 4 && ctx.koText.containsSpanKo(ctx.passage, caseBody)) {
        reusedCount += 1;
        reusedSamples.push(`${CASE_LABELS[labelIdx]} "${caseBody.slice(0, 20)}"`);
      }
    }
    if (reusedCount > 1) {
      add(
        "warning",
        "ko-option-ending",
        `<보기> 사례 ${reusedCount}개(${reusedSamples.join(", ")})가 지문 문면을 그대로 재사용했습니다 — 사례는 신규 용례여야 합니다(재활용은 최대 1개)`,
      );
    }
  }

  // [결정론 5] 선지-사례 1:1 순서 대응 (①=ⓐ … ⑤=ⓔ, 언매 36번 관행)
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  for (let i = 0; i < Math.min(options.length, 5); i++) {
    const text = typeof options[i].text === "string" ? (options[i].text as string) : "";
    const optionLabel = typeof options[i].label === "string" ? (options[i].label as string) : "";
    const caseLabel = CASE_LABELS[i];
    if (text && !text.includes(caseLabel)) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `${optionLabel} 선지가 사례 ${caseLabel} 를 지시하지 않습니다 — 선지-사례 1:1 순서 대응(①=ⓐ) 위반`,
      );
    }
  }

  // [결정론 6] ruleConcepts 지문 verbatim 실재 + 각 선지의 지문 개념어 포함
  const ruleConcepts = Array.isArray(question.ruleConcepts)
    ? (question.ruleConcepts as unknown[]).filter((c): c is string => typeof c === "string" && !!c.trim())
    : [];
  for (const concept of ruleConcepts) {
    if (!ctx.koText.containsSpanKo(ctx.passage, concept)) {
      add(
        "error",
        "ko-quote-not-verbatim",
        `ruleConcepts 의 개념어 "${concept.slice(0, 30)}" 가 지문에 없습니다(verbatim 위반) — 판정 규칙은 지문 문면의 개념어여야 합니다`,
      );
    }
  }
  if (ruleConcepts.length > 0) {
    for (const o of options) {
      const text = typeof o.text === "string" ? o.text : "";
      const label = typeof o.label === "string" ? o.label : "";
      if (!text) continue;
      if (!ruleConcepts.some((concept) => text.includes(concept))) {
        add(
          "warning",
          "ko-option-ending",
          `${label} 선지에 지문 개념어(${ruleConcepts.slice(0, 3).join("·")}${ruleConcepts.length > 3 ? " 등" : ""})가 없습니다 — 사례 적용 선지는 지문 규칙·개념어로의 귀속 판정을 포함해야 합니다`,
        );
      }
    }
  }

  // [결정론 7] ⓐ~ⓔ 는 <보기> 사례 라벨 — 지문 markers(LATIN_CIRCLED)로 넣으면
  //   렌더가 지문에 ⓐ를 오삽입한다 (구조 오류)
  const markers = Array.isArray(question.markers)
    ? (question.markers as Record<string, unknown>[])
    : [];
  const latinMarkers = markers.filter((m) => m.family === "LATIN_CIRCLED");
  if (latinMarkers.length > 0) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `지문 markers 에 LATIN_CIRCLED(ⓐ계열) ${latinMarkers.length}개 — 이 유형의 ⓐ~ⓔ 는 <보기> lines 안의 사례 라벨이지 지문 마킹이 아닙니다 (지문 마킹은 ㉠계열 개념 마커만 허용)`,
    );
  }

  // [결정론 8] trapDesign ↔ 극성·정답 정합 (왜곡 선지 명세의 구조 검사)
  const trapDesign = Array.isArray(question.trapDesign)
    ? (question.trapDesign as Record<string, unknown>[])
    : [];
  const trapLabels = trapDesign
    .map((t) => (typeof t.label === "string" ? t.label : ""))
    .filter(Boolean);
  const expectedTrapLabels = negativeStem
    ? correctAnswer
      ? [correctAnswer]
      : []
    : OPTION_LABELS.filter((l) => l !== correctAnswer);
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

  // [결정론 9] 극성-근거관계 정합: 왜곡 판정 선지의 근거는 DISTORTS/CONTRADICTS/
  //   NOT_MENTIONED, 올바른 판정 선지의 근거는 SUPPORTS 여야 한다.
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
        `${label} 선지는 왜곡 판정 선지인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다 — 극성 모순`,
      );
    }
    if (!shouldBeDistorted && !hasSupport) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 올바른 판정 선지인데 SUPPORTS 근거가 없습니다 — 극성 모순`,
      );
    }
  }

  // [결정론 10] 3점 슬롯 배점 관행 — 명시 배점이 3 미만이면 경고
  if (typeof question.points === "number" && question.points < 3) {
    add(
      "warning",
      "ko-points-unusual",
      `문법 <보기> 사례 적용 유형은 3점 배치가 관행인데 배점이 ${question.points}점입니다`,
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_GR_APPLY: KoTypeModule = {
  meta: {
    typeId: "KO_GR_APPLY",
    area: "GRAMMAR",
    label: "문법 <보기> 사례 적용(3점)",
    formatCategory: "객관식",
    uiGroup: "국어 문법",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["GRAMMAR_CONCEPT"],
    defaultPoints: 3,
    usesBogi: "required",
    markerFamilies: ["KOR_CIRCLED"],
    optionEnding: "plain",
    needsSolverGate: false,
    lockedOptionOrder: true,
    description:
      "문법 설명 지문의 규칙을 <보기>의 신규 사례 5개(ⓐ~ⓔ)에 적용해 [규칙 × 사례] 매트릭스 판정의 정오를 가리는 지문형 문법 3점 유형 — 언매 36번 미러",
    setSlot:
      "문법 지문형 2문항 세트 2번째 슬롯(언매 36번 미러) — 3점 통상 배치(언매 3점 2개 중 1개, 고정 규칙 아님), 지문 이해(KO_GR_READ) 후행",
    studentTask:
      "지문의 문법 규칙(조건·예외 포함)을 <보기>의 사례 ⓐ~ⓔ에 적용한 판정 5개 중, 조건 누락·예외 무시·규칙 교차로 왜곡된 하나(또는 올바른 하나)를 고릅니다.",
    bestFor: [
      "적용 조건·예외가 명시된 문법 규칙 설명 지문",
      "음운 변동·단어 형성·문장 구조 개념 지문(용례 판정 가능)",
      "중세↔현대 대응 규칙을 서술한 국어사 지문",
    ],
    outputUi: [
      "문법 설명 지문 동봉",
      "<보기>/<자료> 박스(ⓐ~ⓔ 사례 5개)",
      "5지선다(①=ⓐ 1:1 대응)",
      "선지별 근거·오답 해설(조건·예외 조항 앵커)",
    ],
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
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것 — 언매 36번 관행)" },
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것 — 전수검증형)" },
        ],
        defaultValue: "NEGATIVE",
        description: "긍정발문은 왜곡 판정 4개의 전수 검증을 강제해 체감 난도가 올라갑니다",
      },
      {
        key: "boxLabel",
        label: "사례 박스 라벨",
        kind: "select",
        options: [
          { value: "보기", label: "<보기> (기본)" },
          { value: "자료", label: "<자료> (이중 박스 변형의 단일 박스 근사)" },
        ],
        defaultValue: "보기",
        description: "언매 36번의 <보기>+<자료> 이중 박스 변형은 라벨 '자료'의 단일 박스로 근사합니다",
      },
      {
        key: "caseKind",
        label: "사례 종류",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(지문 규칙에 맞춤)" },
          { value: "MODERN", label: "현대 국어 용례 (표기[발음]·단어·문장)" },
          { value: "HISTORICAL", label: "중세↔현대 대응쌍 (옛한글 자모 불요 형태만)" },
        ],
        defaultValue: "AUTO",
        description: "<보기>에 담을 사례 5개의 골격을 지정합니다",
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
      "사례 5개가 각각 지문 규칙 1개와 1:1로 대응하고, 판정이 규칙의 원칙 문장 하나와의 대조로 확정되게 하라. 왜곡은 명백한 규칙 교차(RULE_CROSS_APPLY) 하나로 — 형태 분석은 올바르되 귀속 규칙만 틀리게.",
    INTERMEDIATE:
      "사례 중 2개 이상을 적용 조건의 충족/미충족이 갈리는 경계 사례로 배치해 조건 문장과 사례의 왕복 대조를 강제하라. 왜곡은 조건 누락 오판(CONDITION_DROP_MISJUDGE)으로 — 조건 하나만 검사에서 빠지게 하고, 왜곡 지점 외 분석은 전부 올바르게 유지하라.",
    KILLER:
      "표면 형태가 유사하지만 적용 규칙·조건이 다른 사례 쌍(같은 표기 환경·다른 형태소 구성)을 <보기>에 나란히 배치하고, 왜곡은 예외 무시(EXCEPTION_IGNORED)나 두 규칙 교차로 — 지문의 '다만/~인 경우에만' 조항이 정오를 가르게 하라. 참 판정 선지들도 조건 검사를 거쳐야 확정되는 재진술로 구성해 전수 검증을 강제하고, 긍정발문 전환을 함께 고려하라.",
  },
};
