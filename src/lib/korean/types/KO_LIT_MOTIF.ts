// ============================================================================
// KO_LIT_MOTIF — 문학 소재·공간·배경의 기능 (단일 소재 / ⓐⓑ 두 소재 대비)
// ============================================================================
// 카탈로그 §2.2 KO_LIT_MOTIF 사양의 전면 구현.
//
// 실측 근거:
//   발문: "'독가촌'에 대한 설명으로 가장 적절한 것은?" (2026 수능 29번 —
//         박태순 '독가촌 풍경') / "'비밀'의 서사적 기능으로 가장 적절한 것은?"
//   소재는 반드시 작은따옴표 인용 + 지문 실재 어구 — 결정론 검증 가능
//   (validator: 발문 내 작은따옴표 어구 전부 containsSpanKo).
//   기능 개념어 은행: 갈등 촉발·심화의 계기 / 인물 심리 표상 / 사건 전환의
//   매개 / 대비 구도 형성 / 과거 회상의 매개 / 공간의 상징성 / 분위기 조성 등.
//   오답 원리: 기능 맞바꿈 · 과잉 상징 · 지문 밖 기능 부여 · 시간 국면 착오.
//   두 소재 대비형(CONTRAST): ⓐ vs ⓑ — LATIN_CIRCLED 마커 2개 모드,
//   반쪽 오답('ⓐ 진술은 참, ⓑ 진술만 왜곡') 설계가 표준 함정.
// ============================================================================

import { z } from "zod";
import { koMc5Envelope, koMarkerSchema } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { LATIN_CIRCLED_LABELS } from "../core/markers";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

const schema = koMc5Envelope({
  motifMode: z
    .enum(["SINGLE", "CONTRAST"])
    .describe(
      "소재 지정 방식 — SINGLE: 소재 1개를 발문 작은따옴표로 지정(마커 없음), CONTRAST: 두 소재를 대비 판정(발문 작은따옴표 병기 방식 또는 지문 ⓐ·ⓑ 마킹 방식)",
    ),
  motifs: z
    .array(z.string().min(1))
    .min(1)
    .max(2)
    .describe(
      "기능을 묻는 소재·공간·배경 어구 — 지문 표기 그대로(verbatim, 조사 제외 명사형). SINGLE=1개, CONTRAST=2개(ⓐ→ⓑ 순서)",
    ),
  stemPolarity: z
    .enum(["NEGATIVE", "POSITIVE"])
    .describe(
      "발문 극성 — SINGLE 기본 POSITIVE('가장 적절한 것은?', 2026 수능 29번 관행), CONTRAST 기본 NEGATIVE('적절하지 않은 것은?')",
    ),
  trapPrinciple: z
    .enum(["FUNCTION_SWAP", "OVER_SYMBOL", "EXTRA_TEXTUAL", "PHASE_CONFUSION", "HALF_TRUE"])
    .describe(
      "왜곡 선지(부정발문이면 정답 선지, 긍정발문이면 대표 오답)에 적용한 주 함정 원리: FUNCTION_SWAP=기능 맞바꿈, OVER_SYMBOL=과잉 상징, EXTRA_TEXTUAL=지문 밖 기능 부여, PHASE_CONFUSION=시간 국면 착오, HALF_TRUE=반쪽 오답(CONTRAST 전용)",
    ),
  markers: z
    .array(koMarkerSchema)
    .max(2)
    .describe(
      "CONTRAST 마킹 방식 전용 — LATIN_CIRCLED ⓐ·ⓑ 정확히 2개, spanText 는 motifs 와 동일(지문 verbatim). SINGLE 모드·작은따옴표 병기 방식은 생략",
    )
    .optional(),
});

const prompt = `### 유형: 문학 — 소재·공간·배경의 기능

**발문 템플릿** (motifMode·stemPolarity 에 따라 정확히 이 형태로):
- SINGLE + POSITIVE(기본): "'{소재}'에 대한 설명으로 가장 적절한 것은?" 또는 "'{소재}'의 서사적 기능으로 가장 적절한 것은?" (운문이면 "'{소재}'의 기능으로 가장 적절한 것은?")
- SINGLE + NEGATIVE: "'{소재}'에 대한 이해로 적절하지 않은 것은?"
- CONTRAST + NEGATIVE(기본) — 두 표기 방식 중 택일:
  · 작은따옴표 병기: "'{소재1}'와 '{소재2}'에 대한 이해로 적절하지 않은 것은?" (markers 생략)
  · ⓐⓑ 마킹: "ⓐ와 ⓑ에 대한 이해로 적절하지 않은 것은?" (지문에 ⓐ__소재1__·ⓑ__소재2__ 마킹, markers 2개)
  같은 소재 어구가 지문에 2회 이상 나오면 지시가 유일해지도록 ⓐⓑ 마킹 방식을 써라.
- CONTRAST + POSITIVE: "'{소재1}'와 '{소재2}'에 대한 설명으로 가장 적절한 것은?" / "ⓐ와 ⓑ에 대한 설명으로 가장 적절한 것은?"
- 발문에 소재 어구를 쓸 때는 **반드시 작은따옴표('…')로 인용하고 지문 표기 그대로** 써라 (ⓐⓑ 마킹 방식 발문만 예외) — 시스템이 발문 내 모든 작은따옴표 어구의 지문 실재를 기계 검증한다. 조사·어미를 붙이거나 요약어로 바꾸면 반려된다.

**소재 선정 원리**:
1. 지문에 실재하는 구체 명사(사물·공간·시간 배경)를 골라라: 인물이 주고받는 물건, 사건이 벌어지는 공간, 반복 등장하는 자연물, 국면 전환 지점에 개입하는 대상.
2. 기능이 지문 문면(발화·서술자 논평·장면 배치)으로 확인 가능한 소재만 — 작품 밖 지식 없이는 기능을 말할 수 없는 소재는 금지.
3. motifs 필드에 소재 어구를 지문 verbatim 으로 담아라 (SINGLE=1개, CONTRAST=2개를 ⓐ→ⓑ 순서로).
4. CONTRAST 는 기능이 실제로 **대비되는 쌍**을 골라라: 현실 공간 vs 이상 공간, 과거를 환기하는 사물 vs 현재를 상징하는 사물, 인물 A의 애착물 vs 인물 B의 애착물. 마킹 방식이면 markers 의 spanText 는 motifs 와 글자 하나까지 동일해야 한다.

**기능 개념어 은행** (선지의 기능부는 이 은행에서 조합하라):
- 갈등 촉발·심화의 계기 / 갈등 해소의 실마리
- 인물 심리의 표상(응축·환기) / 인물의 처지·내면의 형상화
- 사건 전환의 매개 / 새로운 사건 전개의 계기
- 인물 간·공간 간 대비 구도 형성
- 과거 회상의 매개 / 인물 간 유대(또는 단절)의 매개
- 공간의 상징성(이상향·도피처·억압의 공간·회귀의 공간)
- 시간적 배경의 분위기 조성 / 계절감을 통한 정서 환기
- 주제 의식의 부각 / 앞으로 전개될 사건의 암시(복선)

**선지 구성 원리**:
1. SINGLE: 각 선지는 "'{소재}'는 ~하는 기능을 한다 / ~을 드러낸다 / ~의 계기가 된다" 형태의 완결 평서문. 5개 선지는 서로 다른 장면(국면)의 근거 또는 서로 다른 기능 축을 다뤄라 — 같은 문장을 근거로 한 선지 2개 금지.
2. CONTRAST: 각 선지는 "ⓐ는 ~하고, ⓑ는 ~한다" / "'{소재1}'은 ~하는 반면, '{소재2}'는 ~한다" 대구 구조로, **다섯 선지 전부 두 소재를 모두 진술**해야 한다 (한쪽만 말하는 선지 금지 — 시스템이 검증). 소재 지시는 발문과 같은 표기(라벨 또는 작은따옴표 어구)를 써라.
3. 기능 진술은 [기능 개념어] + [지문 근거 국면] 결합으로: "이별의 상황을 환기한다"가 아니라 "ⓐ는 인물이 고향을 떠나올 때의 기억을 환기하여 그리움을 심화한다"처럼 장면과 묶어라.
4. 부정발문이면 참 4 + 왜곡 1(=정답), 긍정발문이면 왜곡 4 + 참 1(=정답). 긍정발문의 오답 4개는 서로 다른 함정 원리를 쓰라(같은 원리 2회 금지).

**오답 함정 원리** (trapPrinciple — 하나를 정확히 적용, 원리별 예시):
- FUNCTION_SWAP(기능 맞바꿈): 지문 내 **다른 소재의 기능**을 이 소재에 귀속. 예: '편지'가 과거 회상의 매개이고 '사진'이 재회의 계기인데, 선지는 "'편지'는 두 인물이 재회하는 계기가 된다"로 교차.
- OVER_SYMBOL(과잉 상징): 지문 근거 없이 통념 상징을 부여. 예: '달'이 문면상 시간 표지로만 쓰였는데 "'달'은 임에 대한 그리움을 표상한다"로 단정. 통념상 그럴듯할수록 좋은 함정이다.
- EXTRA_TEXTUAL(지문 밖 기능 부여): 발췌 장면에 없는 사건·심리에 대한 기능. 예: 지문에 화해 장면이 없는데 "'우물'은 두 인물의 갈등이 해소되는 공간이다"로 진술.
- PHASE_CONFUSION(시간 국면 착오): 소재가 특정 국면에서만 하는 기능을 다른 국면으로 이동. 예: 결말에서야 갈등 해소의 실마리가 되는 소재를 "사건 초반부터 인물들을 화해시키는 매개"로 진술.
- HALF_TRUE(반쪽 오답 — CONTRAST 전용): ⓐ 진술은 완전히 참, ⓑ 진술만 한 끗 왜곡(또는 그 반대). 학생이 ⓐ만 확인하고 넘어가게 만드는 대구 선지의 표준 함정. 왜곡되는 반쪽은 위 4원리 중 하나를 적용하라.
- 왜곡은 **정확히 한 지점**이어야 한다 — 두 군데 이상 틀리면 너무 쉬워진다.

**근거앵커(evidence) 작성**:
- 각 선지의 근거 spanText 는 해당 소재가 등장하는 장면의 원문 구절(소재 어구 포함 권장)에서 뽑아라.
- 참 선지: relation=SUPPORTS.
- FUNCTION_SWAP·PHASE_CONFUSION 왜곡: relation=DISTORTS + 실제 기능(또는 실제 국면)이 확인되는 원문 구절.
- OVER_SYMBOL·EXTRA_TEXTUAL 왜곡: relation=NOT_MENTIONED + 소재가 등장하는 가장 가까운 원문 구절(부재 증명의 기준점).

**금지**:
- 소재 없이 성립하는 작품 일반론 선지 ("이 작품은 ~을 그리고 있다").
- 발문·선지의 소재 인용을 지문 표기와 다르게 변형(축약·조사 결합·현대어 교체).
- 두 개 이상의 선지가 같은 이유로 틀리는 구성.
- 자습서식 고정 상징의 무근거 단정 — 기능은 발췌 지문 문면에서 확인 가능해야 한다.
- SINGLE 모드에서 마커(㉠/ⓐ) 사용 — 소재 지시는 발문 작은따옴표로만.`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const mode = settings.motifMode;
  if (mode === "SINGLE") {
    lines.push("- motifMode=SINGLE 로 출제하라: 소재 1개를 발문 작은따옴표로 지정하고 마커는 쓰지 마라.");
  } else if (mode === "CONTRAST") {
    lines.push(
      "- motifMode=CONTRAST 로 출제하라: 기능이 대비되는 두 소재를 골라 다섯 선지 전부 두 소재 대구('ⓐ는 ~하고, ⓑ는 ~한다')로 구성하라. 소재 어구가 지문에 유일하면 발문 작은따옴표 병기 방식(markers 생략), 반복 등장하면 지문 ⓐ·ⓑ 마킹 방식(markers 2개)을 써라.",
    );
  } else {
    lines.push(
      "- 소재 지정 방식 자동: 기능이 대비되는 소재 쌍(현실/이상 공간, 과거/현재의 매개물 등)이 뚜렷하면 CONTRAST(ⓐ·ⓑ), 아니면 SINGLE 을 택하라.",
    );
  }
  const polarity = settings.stemPolarity;
  if (polarity === "POSITIVE") {
    lines.push("- 긍정발문('가장 적절한 것은?')으로 출제하라: 참 1 + 왜곡 4 (오답은 서로 다른 함정 원리).");
  } else if (polarity === "NEGATIVE") {
    lines.push("- 부정발문('적절하지 않은 것은?')으로 출제하라: 참 4 + 왜곡 1.");
  } else {
    lines.push("- 발문 극성 자동: SINGLE 이면 긍정발문(수능 관행), CONTRAST 면 부정발문을 기본으로 하라.");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 수업·자습서에서 '소재의 상징적 의미' 표로 정리될 법한 핵심 소재를 우선 지정하되, 선지는 고정 해석의 암기 재생이 아니라 지문 문면 근거로 판정되게 재구성하라. 왜곡은 내신 기출 변형 관행(극성 반전·주체 교체·한 단어 치환) 수준의 한 끗 차이를 허용한다.",
    );
  } else {
    lines.push(
      "- 수능 모드: 발췌 장면의 문면 기준으로만 기능을 판정하게 하라 — 작품 전체 줄거리 지식이 있어야 참/거짓이 갈리는 진술은 선지로 쓰지 마라.",
    );
  }
  return lines.join("\n");
}

/** 기능 진술 판정용 개념어 은행 (닫힌 키워드 집합 — 소프트 게이트). */
const FUNCTION_VOCAB = [
  "갈등", "심리", "정서", "내면", "전환", "대비", "회상", "상징", "분위기", "매개",
  "계기", "암시", "복선", "부각", "표상", "조성", "환기", "유대", "단절", "형상화",
  "이상향", "도피", "억압", "회귀", "실마리",
] as const;

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });
  const { koText } = ctx;

  const direction = typeof question.direction === "string" ? question.direction : "";
  const motifMode = question.motifMode === "CONTRAST" ? "CONTRAST" : "SINGLE";
  const motifs = Array.isArray(question.motifs)
    ? (question.motifs as unknown[]).filter(
        (m): m is string => typeof m === "string" && m.trim().length > 0,
      )
    : [];
  const markers = Array.isArray(question.markers)
    ? (question.markers as Record<string, unknown>[])
    : [];
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];

  // 공백 유연 동일성 (상호 포함 = 캐노니컬 폼 동일)
  const sameSpan = (a: string, b: string) =>
    koText.containsSpanKo(a, b) && koText.containsSpanKo(b, a);

  // [결정론 1] 발문 내 작은따옴표 어구 전부 지문 실재 (스펙 지정 검사)
  const quoted = koText.extractQuotedSpansKo(direction);
  for (const span of quoted) {
    if (!koText.containsSpanKo(ctx.passage, span)) {
      add(
        "error",
        "ko-quote-not-verbatim",
        `발문 인용 '${span}' 이(가) 지문에 없습니다 — 소재는 지문 표기 그대로 작은따옴표 인용해야 합니다`,
      );
    }
  }

  // [결정론 2] motifs 개수↔모드 정합 + 지문 실재 + 발문이 각 소재를 지시
  const expectedMotifs = motifMode === "CONTRAST" ? 2 : 1;
  if (motifs.length !== expectedMotifs) {
    add(
      "error",
      "ko-direction-grammar",
      `motifMode=${motifMode} 인데 motifs 가 ${motifs.length}개입니다 (요구: ${expectedMotifs}개)`,
    );
  }
  motifs.forEach((motif, i) => {
    if (!koText.containsSpanKo(ctx.passage, motif)) {
      add("error", "ko-quote-not-verbatim", `소재 '${motif}' 이(가) 지문에 없습니다 (verbatim 요구)`);
    }
    // extractQuotedSpansKo 는 2자 이상만 추출하므로 한 글자 소재('달'·'별')는 리터럴 인용 검사로 보강
    const quotedHit =
      quoted.some((q) => sameSpan(q, motif)) ||
      direction.includes(`'${motif}'`) ||
      direction.includes(`‘${motif}’`);
    // 마킹 방식(markers 존재)일 때만 ⓐ·ⓑ 라벨 지시를 인정 — 마킹 없는 라벨은 고아 참조
    const labelHit =
      motifMode === "CONTRAST" && markers.length > 0 && direction.includes(LATIN_CIRCLED_LABELS[i]);
    if (!quotedHit && !labelHit) {
      add(
        "error",
        "ko-direction-grammar",
        `발문이 소재 '${motif}' 를 작은따옴표 인용${
          motifMode === "CONTRAST" && markers.length > 0
            ? ` 또는 ${LATIN_CIRCLED_LABELS[i]} 라벨`
            : ""
        }로 지시하지 않습니다`,
      );
    }
  });

  // [결정론 3] 발문 극성 ↔ 선언 극성 정합
  const declaredPolarity =
    question.stemPolarity === "NEGATIVE" || question.stemPolarity === "POSITIVE"
      ? question.stemPolarity
      : motifMode === "CONTRAST"
        ? "NEGATIVE"
        : "POSITIVE";
  const negativeStem = koText.isNegativeStemKo(direction);
  if (declaredPolarity === "NEGATIVE" && !negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
  }
  if (declaredPolarity === "POSITIVE" && negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
  }

  // [결정론 4] 마커 모드 정합 — SINGLE 은 마커 금지, CONTRAST 마킹 방식은 ⓐⓑ 정확히 2개
  //   (CONTRAST 에서 markers 0개 = 작은따옴표 병기 방식 — 결정론 2가 두 소재 인용을 강제)
  if (motifMode === "SINGLE") {
    if (markers.length > 0) {
      add(
        "error",
        "ko-marker-option-mismatch",
        "SINGLE 모드에서는 마커를 사용하지 않습니다 — 소재는 발문 작은따옴표로만 지시",
      );
    }
  } else {
    if (markers.length > 0 && markers.length !== 2) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `CONTRAST 마킹 방식은 ⓐ·ⓑ 마커 정확히 2개가 필요합니다 (현재 ${markers.length}개) — 마킹 없이 내려면 발문 작은따옴표 병기 방식(markers 생략)을 쓰세요`,
      );
    } else if (markers.length === 2) {
      const families = markers.map((m) => (typeof m.family === "string" ? m.family : ""));
      if (families.some((f) => f !== "LATIN_CIRCLED")) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `두 소재 대비 마커는 LATIN_CIRCLED(ⓐ·ⓑ) 패밀리여야 합니다 (현재: ${families.join(", ")})`,
        );
      }
      const labels = markers.map((m) => (typeof m.label === "string" ? m.label : ""));
      if (labels.join("") !== "ⓐⓑ") {
        add("error", "ko-marker-option-mismatch", `마커 라벨이 ⓐⓑ 순서가 아닙니다: ${labels.join("")}`);
      }
      if (motifs.length === 2) {
        markers.forEach((m, i) => {
          const span = typeof m.spanText === "string" ? m.spanText : "";
          if (span && !sameSpan(span, motifs[i])) {
            add(
              "error",
              "ko-marker-option-mismatch",
              `${labels[i] || LATIN_CIRCLED_LABELS[i]} 마커 spanText("${span}")가 motifs[${i}]("${motifs[i]}")와 다릅니다 — 마커와 소재 목록은 동일 어구여야 합니다`,
            );
          }
        });
      }
    }

    // [결정론 5] 반쪽 오답 설계 전제: 다섯 선지 전부 ⓐ·ⓑ(또는 두 소재)를 모두 진술
    for (const o of options) {
      const text = typeof o.text === "string" ? o.text : "";
      const label = typeof o.label === "string" ? o.label : "";
      if (!text) continue;
      const refs = [0, 1].map(
        (i) =>
          text.includes(LATIN_CIRCLED_LABELS[i]) ||
          (motifs[i] ? koText.containsSpanKo(text, motifs[i]) : false),
      );
      if (!refs[0] || !refs[1]) {
        const nameOf = (i: number) =>
          markers.length === 2 ? LATIN_CIRCLED_LABELS[i] : `'${motifs[i] ?? "?"}'`;
        const missing =
          !refs[0] && !refs[1]
            ? `${nameOf(0)}·${nameOf(1)} 둘 다`
            : !refs[0]
              ? `${nameOf(0)} 를`
              : `${nameOf(1)} 를`;
        add(
          "error",
          "ko-marker-option-mismatch",
          `${label} 선지가 ${missing} 지시하지 않습니다 — 대비형 선지는 두 소재를 모두 진술해야 합니다`,
        );
      }
    }
  }

  // [결정론 6] 함정 원리 ↔ 모드 정합: HALF_TRUE(반쪽 오답)는 CONTRAST 전용
  const trap = typeof question.trapPrinciple === "string" ? question.trapPrinciple : "";
  if (trap === "HALF_TRUE" && motifMode !== "CONTRAST") {
    add(
      "error",
      "ko-marker-option-mismatch",
      "HALF_TRUE(반쪽 오답)는 두 소재 대비(CONTRAST) 모드 전용 함정 원리입니다 — SINGLE 에서는 FUNCTION_SWAP/OVER_SYMBOL/EXTRA_TEXTUAL/PHASE_CONFUSION 중 선택",
    );
  }

  // [결정론 7] 근거 relation ↔ 발문 극성 정합 (왜곡 선지=DISTORTS 계열, 참 선지=SUPPORTS)
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
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
  const distortRelations = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    const shouldBeFlawed = negativeStem ? isCorrect : !isCorrect;
    const hasSupport = relations.has("SUPPORTS");
    const hasDistort = [...relations].some((r) => distortRelations.has(r));
    if (shouldBeFlawed && !hasDistort) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 왜곡 선지인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다 — 극성 모순`,
      );
    }
    if (!shouldBeFlawed && !hasSupport) {
      add("error", "ko-evidence-missing", `${label} 선지는 참 선지인데 SUPPORTS 근거가 없습니다 — 극성 모순`);
    }
  }

  // [소프트] 기능 진술 부재 감지 — 개념어 은행 키워드가 전체 선지에 하나도 없으면 경고
  if (options.length > 0) {
    const hasFunctionVocab = options.some((o) => {
      const text = typeof o.text === "string" ? o.text : "";
      return FUNCTION_VOCAB.some((w) => text.includes(w));
    });
    if (!hasFunctionVocab) {
      add(
        "warning",
        "ko-option-ending",
        "선지에 소재 기능 개념어(갈등·심리·전환·대비·상징·매개·분위기 등)가 하나도 없습니다 — 내용 확인 선지가 아니라 기능 진술 선지인지 확인하세요",
      );
    }
  }

  return issues;
}

export const KO_LIT_MOTIF: KoTypeModule = {
  meta: {
    typeId: "KO_LIT_MOTIF",
    area: "LITERATURE",
    label: "소재·배경의 기능",
    formatCategory: "객관식",
    uiGroup: "국어 문학",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: [
      "LIT_MODERN_POEM",
      "LIT_CLASSIC_POEM",
      "LIT_MODERN_NOVEL",
      "LIT_CLASSIC_NOVEL",
      "LIT_ESSAY",
      "LIT_PLAY",
      "MIXED",
    ],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: ["LATIN_CIRCLED"],
    optionEnding: "plain",
    needsSolverGate: false,
    description:
      "지문 속 소재·공간·배경을 작은따옴표(또는 ⓐ·ⓑ 대비 마킹)로 지정하고 그 서사적·시적 기능을 판정하는 문학 유형",
    setSlot: "산문 세트 3번 슬롯(마커·소재·말하기 축) — 갈래복합 세트의 개별 작품 이해 슬롯 겸용",
    studentTask:
      "지정된 소재가 작품에서 하는 기능(갈등 계기·심리 표상·전환 매개 등) 진술 중 왜곡된 하나(또는 참인 하나)를 고릅니다.",
    bestFor: [
      "소재·공간이 사건 전개에 개입하는 산문",
      "대비되는 두 공간·사물이 있는 작품",
      "상징적 시어·배경이 뚜렷한 운문",
    ],
    outputUi: ["지문 동봉(대비형은 ⓐ·ⓑ 마킹)", "5지선다", "선지별 근거·오답 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "motifMode",
        label: "소재 지정 방식",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(지문 특성)" },
          { value: "SINGLE", label: "단일 소재('…' 인용)" },
          { value: "CONTRAST", label: "두 소재 대비(ⓐ·ⓑ)" },
        ],
        defaultValue: "AUTO",
        description: "대비형은 다섯 선지 전부 ⓐ·ⓑ 대구 진술 — 반쪽 오답 설계로 체감 난도가 올라갑니다",
      },
      {
        key: "stemPolarity",
        label: "발문 극성",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(모드 관행)" },
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것)" },
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것)" },
        ],
        defaultValue: "AUTO",
        description: "수능 관행: 단일 소재=긍정발문, 두 소재 대비=부정발문",
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
      "소재의 기능이 서술자 논평·인물 발화로 명시된 지점을 근거로 하라. 왜곡은 명백한 기능 맞바꿈(지문 내 다른 소재의 기능 이식) 하나로.",
    INTERMEDIATE:
      "기능 판정에 소재가 등장하는 두 장면(국면)의 결합이 필요하게 하라. 왜곡은 시간 국면 착오 또는 동일 극성 내 과잉 일반화로, 참 선지 중 1개는 문면에 직접 서술되지 않은 기능(암시·대비)을 맥락 종합으로 진술하라.",
    KILLER:
      "두 소재 대비형(CONTRAST)을 우선 고려하라. 왜곡 선지는 반쪽 오답(ⓐ 진술은 참, ⓑ 진술만 한 끗 왜곡)으로 설계해 10개 반쪽 진술의 전수 검증을 강제하고, 과잉 상징 오답은 통념상 그럴듯한 상징(달=그리움, 길=인생)을 써서 지문 근거 확인 없이는 배제되지 않게 하라.",
  },
};
