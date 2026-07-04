// ============================================================================
// KO_RD_INFER — 독서 추론·이유 도출·빈칸 완성 (inferMode 3모드)
// ============================================================================
// 카탈로그 §2.1 KO_RD_INFER + KO_RD_BLANK(빈칸모드로 흡수 — 스펙 §5) 사양의
// 전면 구현. 3모드 knob(inferMode):
//   INFER    (기본)   "윗글에서 추론한 내용으로 적절하지 않은 것은?" — 부정발문
//   REASON            "㉠의 이유로 가장 적절한 것은?" — ㉠(KOR_CIRCLED) 정확 1개
//   COMPLETE          "㉮에 들어갈 말로 가장 적절한 것은?" — <보기> 안 빈칸 "[ ㉮ ]"
//
// 실측 근거(2026 수능 6·11·15·16번 계열):
//   메커니즘: 지문 진술 2개 이상 결합으로 미명시 함의 도출 — 매회 3~5문항,
//   최상위 변별의 한 축. 오답 원리: 근거 없는 상식 진술(NOT_MENTIONED) ·
//   필요↔충분 방향 반전 · 과잉 추론 · 한 진술만 쓰면 참처럼 보이는 부분 결합.
//
// 결정론 게이트(스펙 지정): 정답 도출에 지문 근거 2개 이상 결합 강제 —
//   긍정발문(REASON·COMPLETE) 정답 선지는 SUPPORTS 스팬 2개 이상(서로 다른
//   구절), 부정발문(INFER) 정답(왜곡) 선지는 판정 근거 스팬 2개 이상 +
//   왜곡 계열 relation. REASON 마커 1개 검사, COMPLETE bogi+빈칸 토큰 검사.
// ============================================================================

import { z } from "zod";
import { koBogiSchema, koMarkerSchema, koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import type {
  KoDifficulty,
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

const OPTION_LABELS = ["①", "②", "③", "④", "⑤"] as const;

const schema = koMc5Envelope({
  inferMode: z
    .enum(["INFER", "REASON", "COMPLETE"])
    .describe(
      "출제 모드 — INFER: 부정발문 추론 판정(기본), REASON: ㉠의 이유 도출(지문 ㉠ 마커 1개), COMPLETE: <보기> 문장 완성(빈칸 토큰 '[ ㉮ ]')",
    ),
  trapPrinciples: z
    .array(
      z.object({
        label: z.enum(["①", "②", "③", "④", "⑤"]).describe("함정(왜곡) 선지 라벨"),
        principle: z
          .enum([
            "BASELESS_PLAUSIBLE",
            "NECESSITY_SUFFICIENCY_FLIP",
            "OVER_INFERENCE",
            "PARTIAL_COMBINATION",
          ])
          .describe(
            "적용한 함정 원리: BASELESS_PLAUSIBLE=근거 없는 상식 진술, NECESSITY_SUFFICIENCY_FLIP=필요↔충분 방향 반전, OVER_INFERENCE=과잉 추론(정도·범위 격상), PARTIAL_COMBINATION=부분 결합(한 진술만 반영하면 참처럼 보임)",
          ),
      }),
    )
    .min(1)
    .max(4)
    .describe(
      "왜곡 측 선지의 함정 원리 선언 — INFER(부정발문)는 정답 1개만, REASON/COMPLETE(긍정발문)는 오답 4개 전부",
    ),
  markers: z
    .array(koMarkerSchema)
    .max(1)
    .describe(
      "REASON 모드 전용 — ㉠(KOR_CIRCLED) 마커 정확 1개. 이유가 문면에 없는 결과·판단 구절을 마킹. INFER·COMPLETE 모드에서는 생략",
    )
    .optional(),
  bogi: koBogiSchema
    .describe(
      "COMPLETE 모드 전용 필수 — 지문을 읽은 학생의 정리·반응 문장 2~4행. 결론 자리에 평문 빈칸 토큰 '[ ㉮ ]' 정확 1개(언더스코어 빈칸 금지)",
    )
    .optional(),
});

const prompt = `### 유형: 독서 — 추론·이유 도출·빈칸 완성 (inferMode 3모드)

**유형의 본질**: 지문에 명시되지 않은 함의를 **지문 진술 2개 이상의 결합**으로 도출한다.
타당한 추론 선지는 반드시 서로 다른 두 근거 구절을 결합해야만 성립해야 하며, 지문 한 문장의
재진술만으로 참/거짓이 판정되면 이 유형이 아니라 사실적 이해(내용 일치)로 강등된 실격작이다.

**발문 템플릿 (inferMode 에 따라 정확히 이 형태로)**:
- INFER(기본): "윗글에서 추론한 내용으로 적절하지 않은 것은?" — 부정발문 고정.
- REASON: "㉠의 이유로 가장 적절한 것은?" — 긍정발문 고정. 지문에 ㉠ 마커 정확 1개.
- COMPLETE: "㉮에 들어갈 말로 가장 적절한 것은?" — 긍정발문 고정. <보기> 안에 빈칸 토큰 "[ ㉮ ]".

**모드별 설계 지침**:
1. INFER — 참 추론 4개 + 왜곡 추론 1개(=정답).
   - 참 선지 4개 각각: 지문의 서로 다른 두 진술(가급적 서로 다른 문단)을 결합해야만 도출되는
     미명시 함의. 지문 문장의 어휘 치환 수준 재진술은 금지 — "지문이 직접 말하지 않았지만
     두 진술을 합치면 필연적으로 참"인 진술이어야 한다.
   - 왜곡 선지(정답): 아래 함정 원리 중 하나를 정확히 적용. 지문 어휘를 그대로 사용해
     표면적으로는 참 선지들과 구분되지 않게 하라.
2. REASON — ㉠의 이유 도출.
   - 마킹 대상: 이유가 문면에 직접 서술되지 않았으나 앞뒤 진술 2개를 결합하면 필연적으로
     도출되는 결과·판단·전환 구절 하나를 ㉠로 마킹. spanText 는 지문 원문 그대로(조사 하나도
     바꾸지 말 것). ㉠ 이외의 추가 마커 금지.
   - 정답: 두 근거의 결합으로 도출되는 이유. 선지 5개 전부 어미를 "~기 때문이다"로 통일하라.
   - 오답 4개: 함정 원리 4개를 각각 정확히 1회씩 적용하라(같은 원리 2회 금지). 특히
     '㉠보다 시간상 뒤의 사실을 이유로 제시'(인과 역전)는 OVER_INFERENCE 계열로 유효한 함정이다.
3. COMPLETE — <보기> 문장 완성.
   - <보기>: 지문을 읽은 학생의 정리·반응·요약 문장 2~4행. 결론 자리를 정확히 평문 토큰
     "[ ㉮ ]" 로 비운다. 언더스코어 빈칸(____)·네모 기호 사용 금지. 빈칸은 <보기> 전체에서 1곳.
   - 빈칸 자리는 지문 원리 2개의 결합으로 필연 도출되는 결론이어야 한다. <보기>의 다른 행에
     정답 문구가 그대로 노출되면 실격(정답 누출).
   - 정답 선지 = 빈칸에 넣었을 때 <보기> 문장이 문법적으로 자연스럽고 지문과 정합하는 유일한 완성.
   - 오답 4개: 빈칸에 넣어도 문법적으로는 자연스럽게 이어지되, 지문 범위 초과·방향 반전인 완성.
     5개 선지는 길이·구문 구조를 평행하게 유지하라(정답만 길거나 정교하면 누출).

**오답 함정 원리 (trapPrinciples 에 왜곡 측 선지별로 선언 — INFER는 정답 1개, REASON/COMPLETE는 오답 4개)**:
- BASELESS_PLAUSIBLE(근거 없는 상식 진술): 지문의 개념어를 사용해 상식적으로 그럴듯하지만
  지문 어디에도 근거가 없는 진술. (예: 지문이 "가격 상한제는 공급량을 줄인다"까지만 말했는데
  → "가격 상한제는 암시장을 필연적으로 발생시킨다") relation=NOT_MENTIONED + 가장 가까운 관련 구절.
- NECESSITY_SUFFICIENCY_FLIP(필요↔충분 반전): 지문의 "A이면 B이다"를 "B이면 A이다" 또는
  "A일 때에만 B이다"로 조건의 방향·강도를 반전. (예: "면역 반응이 일어나면 발열이 나타난다"
  → "발열이 나타났다면 면역 반응이 일어난 것이다") relation=DISTORTS + 원 조건문 구절.
- OVER_INFERENCE(과잉 추론): 지문이 허용하는 결론보다 정도·범위·확실성을 격상.
  ("~할 수 있다"→"~할 수밖에 없다", "일부"→"모든", "경향이 있다"→"항상") relation=DISTORTS.
- PARTIAL_COMBINATION(부분 결합): 지문 진술 하나만 반영하면 참처럼 보이지만, 결합해야 할
  다른 진술(한정 조건·예외 조항)이 배제하는 진술 — 이 유형 최상위 함정. relation=CONTRADICTS
  + 배제하는 조항 구절.

**근거앵커(evidence) 작성법 — 이 유형의 결정론 게이트이므로 정확히 지켜라**:
- 타당한 추론 선지(REASON·COMPLETE의 정답, INFER의 참 선지 4개): relation=SUPPORTS 스팬을
  **서로 다른 구절로 2개 이상** 제공하라 — 두 스팬이 결합 근거의 양쪽이 되어야 한다.
  같은 문장의 반복, 한 스팬이 다른 스팬을 포함하는 경우는 1개로 계산되어 반려된다.
- 특히 긍정발문(REASON·COMPLETE)의 정답 선지는 SUPPORTS 2개가 각각 다른 문장에서 나와야 통과한다.
- 왜곡 선지(INFER의 정답 포함): 함정 원리에 대응하는 relation(NOT_MENTIONED/DISTORTS/CONTRADICTS)
  근거 + 왜곡의 출발점이 된 원문 진술을 함께 제공하라 — INFER의 정답(왜곡) 선지도 근거 스팬이
  2개 이상(왜곡이 출발한 진술 + 배제·부재를 판정하는 구절)이어야 한다.

**금지**:
- 지문 한 문장의 재진술만으로 참/거짓이 판정되는 선지 (결합 없는 선지).
- 지문 없이 상식만으로 정답이 골라지는 구성, 정답 선지에 외부 배경지식을 요구하는 구성
  (결합 재료는 전부 지문 안에 있어야 한다).
- 두 개 이상의 선지가 같은 이유로 틀리는 구성.
- COMPLETE 모드에서 <보기>에 언더스코어 빈칸(____) 사용 — 반드시 "[ ㉮ ]".
- REASON 모드에서 ㉠ 이외 추가 마커, INFER·COMPLETE 모드에서 지문 마커 사용.`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings, difficulty: KoDifficulty): string {
  const lines: string[] = [];
  const mode = settings.inferMode;
  if (mode === "REASON") {
    lines.push(
      "- inferMode=REASON 으로 출제하라: 지문에 ㉠(KOR_CIRCLED) 마커 정확 1개, 발문은 '㉠의 이유로 가장 적절한 것은?', 선지 어미는 '~기 때문이다' 통일. <보기>는 사용하지 마라.",
    );
  } else if (mode === "COMPLETE") {
    lines.push(
      "- inferMode=COMPLETE 로 출제하라: <보기>(학생의 정리 문장 2~4행)에 빈칸 토큰 '[ ㉮ ]' 정확 1개, 발문은 '㉮에 들어갈 말로 가장 적절한 것은?'. 지문 마커(markers)는 사용하지 마라.",
    );
  } else {
    lines.push(
      "- inferMode=INFER 로 출제하라: 부정발문 '윗글에서 추론한 내용으로 적절하지 않은 것은?', 참 추론 4개 + 왜곡 추론 1개(=정답). 지문 마커·<보기>는 사용하지 마라.",
    );
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 추론 폭을 수업 해석 범위 내로 좁혀라 — 결합할 두 근거가 같은 문단 안에 있어도 좋고, 함의 도출은 문면에서 1단계 거리로. 오답은 근거 부재·모순이 지문 대조로 명확히 확인되게 설계하라(채점 민원 차단). 학평 기출풍의 정형 표현을 유지하라.",
    );
  } else {
    lines.push(
      "- 수능 모드: 결합할 두 근거를 서로 다른 문단에 분산하고, 왜곡 선지는 지문 어휘를 그대로 쓰되 논리 방향만 비틀어 '아슬아슬함'을 확보하라." +
        (difficulty === "KILLER" ? " 3점 배점(points=3) 승격을 고려하라." : ""),
    );
  }
  return lines.join("\n");
}

type Q = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** 스팬 목록에서 '서로 다른 구절'만 남긴다 — 포함 관계인 스팬 쌍은 1개로 계산. */
function distinctSpans(spans: string[]): string[] {
  const out: string[] = [];
  for (const raw of spans) {
    const s = squash(raw);
    if (!s) continue;
    if (out.some((x) => x.includes(s) || s.includes(x))) continue;
    out.push(s);
  }
  return out;
}

function readBogiLines(q: Q): string[] {
  if (!q.bogi || typeof q.bogi !== "object") return [];
  const lines = (q.bogi as Q).lines;
  return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === "string") : [];
}

const BLANK_TOKEN_RE = /\[\s*㉮\s*\]/;
const FLAW_RELATIONS = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const mode =
    question.inferMode === "REASON" ? "REASON" : question.inferMode === "COMPLETE" ? "COMPLETE" : "INFER";
  const direction = str(question.direction);
  const dir = squash(direction);
  const correctAnswer = str(question.correctAnswer);
  const options = Array.isArray(question.options) ? (question.options as Q[]) : [];
  const markers = Array.isArray(question.markers) ? (question.markers as Q[]) : [];
  const bogiLines = readBogiLines(question);
  const bogiText = bogiLines.join("\n");

  // ── 1) 모드 ↔ 발문 템플릿 정합 (결정론) ─────────────────────────────────
  const actuallyNegative = ctx.koText.isNegativeStemKo(direction);
  if (mode === "INFER") {
    if (!actuallyNegative) {
      add("error", "ko-direction-grammar", "INFER 모드는 부정발문('…적절하지 않은 것은?')이어야 합니다");
    }
    if (!/추론/.test(dir)) {
      add(
        "error",
        "ko-direction-grammar",
        `INFER 모드 발문은 '윗글에서 추론한 내용으로 적절하지 않은 것은?' 계열이어야 합니다("추론" 부재): "${dir}"`,
      );
    }
  }
  if (mode === "REASON") {
    if (actuallyNegative) {
      add("error", "ko-direction-grammar", "REASON 모드는 긍정발문('㉠의 이유로 가장 적절한 것은?')이어야 합니다");
    }
    if (!/이유로 가장 적절한 것은\?$/.test(dir)) {
      add(
        "error",
        "ko-direction-grammar",
        `REASON 모드 발문은 '㉠의 이유로 가장 적절한 것은?' 형태여야 합니다: "${dir}"`,
      );
    }
    if (!dir.includes("㉠")) {
      add("error", "ko-direction-grammar", "REASON 모드 발문이 마커 ㉠ 을 지시하지 않습니다");
    }
  }
  if (mode === "COMPLETE") {
    if (actuallyNegative) {
      add("error", "ko-direction-grammar", "COMPLETE 모드는 긍정발문('㉮에 들어갈 말로 가장 적절한 것은?')이어야 합니다");
    }
    if (!dir.includes("㉮") || !/들어갈 말로 가장 적절한 것은\?$/.test(dir)) {
      add(
        "error",
        "ko-direction-grammar",
        `COMPLETE 모드 발문은 '㉮에 들어갈 말로 가장 적절한 것은?' 형태여야 합니다: "${dir}"`,
      );
    }
  }

  // ── 2) REASON 마커 구조 / 타 모드 마커 금지 (결정론) ────────────────────
  if (mode === "REASON") {
    if (markers.length !== 1) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `REASON 모드는 ㉠ 마커 정확 1개가 필요합니다 (현재 ${markers.length}개)`,
      );
    } else {
      const m = markers[0];
      if (str(m.family) !== "KOR_CIRCLED") {
        add(
          "error",
          "ko-marker-option-mismatch",
          `REASON 모드 마커는 KOR_CIRCLED(㉠계열)여야 합니다: ${str(m.family)}`,
        );
      }
      if (str(m.label) !== "㉠") {
        add("error", "ko-marker-option-mismatch", `REASON 모드 마커 라벨은 ㉠ 이어야 합니다: "${str(m.label)}"`);
      }
    }
  } else if (markers.length > 0) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `${mode} 모드에는 지문 마커를 사용하지 않습니다 (${markers.length}개 발견) — 마커는 REASON 모드 전용`,
    );
  }

  // ── 3) COMPLETE 보기 + 빈칸 토큰 + 정답 누출 (결정론) ───────────────────
  if (mode === "COMPLETE") {
    if (bogiLines.length === 0) {
      add("error", "ko-bogi-missing", "COMPLETE 모드는 <보기>(학생 정리 문장)가 필수입니다");
    } else {
      const tokenCount = bogiText.match(new RegExp(BLANK_TOKEN_RE.source, "g"))?.length ?? 0;
      if (tokenCount === 0) {
        add("error", "ko-bogi-missing", "COMPLETE 모드 <보기>에 빈칸 토큰 '[ ㉮ ]' 이 없습니다 (언더스코어 빈칸 금지)");
      } else if (tokenCount > 1) {
        add("error", "ko-bogi-missing", `COMPLETE 모드 빈칸 토큰 '[ ㉮ ]' 은 정확 1개여야 합니다 (현재 ${tokenCount}개)`);
      }
      // 정답 선지 텍스트가 보기 다른 자리에 그대로 노출 = 누출
      const correctOption = options.find((o) => str(o.label) === correctAnswer);
      const correctText = correctOption ? str(correctOption.text) : "";
      if (correctText.length >= 4 && ctx.koText.containsSpanKo(bogiText, correctText)) {
        add("error", "ko-answer-leak", "COMPLETE 모드 <보기>에 정답 선지 문구가 그대로 노출되어 있습니다");
      }
    }
  }

  // ── 4) 정답 도출 근거 2개 이상 결합 게이트 (결정론 — 스펙 지정) ─────────
  //   모드가 기대하는 극성으로 판정한다(발문 오류는 1)에서 별도 차단).
  //   긍정발문(REASON·COMPLETE): 정답 선지 SUPPORTS 스팬 ≥2 (서로 다른 구절).
  //   부정발문(INFER): 정답(왜곡) 선지는 왜곡 계열 relation ≥1 + 근거 스팬 ≥2,
  //                    참 선지 4개는 각각 SUPPORTS ≥1 (극성 정합).
  const expectNegative = mode === "INFER";
  const evidence = Array.isArray(question.evidence) ? (question.evidence as Q[]) : [];
  const spansByLabel = new Map<string, string[]>();
  const supportSpansByLabel = new Map<string, string[]>();
  const relationsByLabel = new Map<string, Set<string>>();
  for (const e of evidence) {
    const label = str(e.optionLabel);
    const relation = str(e.relation);
    const span = str(e.spanText);
    if (!label) continue;
    if (span) {
      spansByLabel.set(label, [...(spansByLabel.get(label) ?? []), span]);
      if (relation === "SUPPORTS") {
        supportSpansByLabel.set(label, [...(supportSpansByLabel.get(label) ?? []), span]);
      }
    }
    if (relation) {
      const set = relationsByLabel.get(label) ?? new Set<string>();
      set.add(relation);
      relationsByLabel.set(label, set);
    }
  }
  if ((OPTION_LABELS as readonly string[]).includes(correctAnswer)) {
    if (!expectNegative) {
      const supports = distinctSpans(supportSpansByLabel.get(correctAnswer) ?? []);
      if (supports.length < 2) {
        add(
          "error",
          "ko-evidence-missing",
          `정답 선지(${correctAnswer})의 SUPPORTS 근거 스팬이 ${supports.length}개 — 추론 유형은 서로 다른 지문 구절 2개 이상의 결합 근거가 필요합니다`,
        );
      }
      // 오답 4개는 왜곡 계열 근거가 있어야 함 (극성 정합)
      for (const label of OPTION_LABELS) {
        if (label === correctAnswer) continue;
        const relations = relationsByLabel.get(label) ?? new Set<string>();
        if (![...relations].some((r) => FLAW_RELATIONS.has(r))) {
          add(
            "error",
            "ko-evidence-missing",
            `${label} 선지는 왜곡(함정) 선지인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다 — 극성 모순`,
          );
        }
      }
    } else {
      const relations = relationsByLabel.get(correctAnswer) ?? new Set<string>();
      if (![...relations].some((r) => FLAW_RELATIONS.has(r))) {
        add(
          "error",
          "ko-evidence-missing",
          `부정발문 정답(왜곡 추론) 선지 ${correctAnswer} 의 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다 — 극성 모순`,
        );
      }
      const allSpans = distinctSpans(spansByLabel.get(correctAnswer) ?? []);
      if (allSpans.length < 2) {
        add(
          "error",
          "ko-evidence-missing",
          `정답(왜곡 추론) 선지 ${correctAnswer} 의 판정 근거 스팬이 ${allSpans.length}개 — 왜곡이 출발한 진술 + 배제·부재를 판정하는 구절, 서로 다른 스팬 2개 이상이 필요합니다`,
        );
      }
      for (const label of OPTION_LABELS) {
        if (label === correctAnswer) continue;
        const rel = relationsByLabel.get(label) ?? new Set<string>();
        if (!rel.has("SUPPORTS")) {
          add(
            "error",
            "ko-evidence-missing",
            `${label} 선지는 참 추론 선지인데 SUPPORTS 근거가 없습니다 — 극성 모순`,
          );
        }
      }
    }
  }

  // ── 5) trapPrinciples 라벨 ↔ 왜곡 측 선지 정합 (결정론) ─────────────────
  const traps = Array.isArray(question.trapPrinciples) ? (question.trapPrinciples as Q[]) : [];
  const trapLabels = traps.map((t) => str(t.label)).filter(Boolean);
  const expectedFlawLabels = expectNegative
    ? [correctAnswer]
    : (OPTION_LABELS as readonly string[]).filter((l) => l !== correctAnswer);
  const trapSet = new Set(trapLabels);
  const expectedSet = new Set(expectedFlawLabels);
  const setEqual = trapSet.size === expectedSet.size && [...trapSet].every((l) => expectedSet.has(l));
  if (trapLabels.length > 0 && !setEqual) {
    add(
      "warning",
      "ko-negative-stem-mismatch",
      `trapPrinciples 라벨(${[...trapSet].join(" ") || "없음"})이 발문 극성상 왜곡 측 선지(${expectedFlawLabels.join(" ")})와 일치하지 않습니다`,
    );
  }

  // ── 6) 모드별 선지 어미 (meta.optionEnding="any" — 여기서 모드 인지 검사) ──
  //   INFER·REASON 선지는 평서형('~다') 종결. COMPLETE 는 빈칸 완성 어구라 자유.
  if (mode !== "COMPLETE") {
    for (const o of options) {
      const text = str(o.text);
      if (!text) continue;
      const endingIssue = ctx.koText.optionEndingIssueKo(text, "plain");
      if (endingIssue) {
        add("warning", "ko-option-ending", `${str(o.label)} ${endingIssue}: "${text.slice(0, 40)}"`);
        break; // 같은 지적 반복 방지 — 첫 위반만
      }
    }
  }

  return issues;
}

export const KO_RD_INFER: KoTypeModule = {
  meta: {
    typeId: "KO_RD_INFER",
    area: "READING",
    label: "추론·이유 도출",
    formatCategory: "객관식",
    uiGroup: "국어 독서",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 2,
    usesBogi: "optional",
    markerFamilies: ["KOR_CIRCLED"],
    // COMPLETE 모드의 빈칸 완성 어구는 종결 어미가 자유이므로 공통 게이트는 "any",
    // INFER·REASON 의 평서형('~다') 검사는 validate() 가 모드 인지로 수행한다.
    optionEnding: "any",
    needsSolverGate: false,
    description:
      "지문 진술 2개 이상을 결합해 미명시 함의·이유·빈칸 결론을 도출하는 독서 추론 유형 (INFER/REASON/COMPLETE 3모드)",
    setSlot: "독서 세트 중간 슬롯 — 매회 3~5문항, 최상위 변별의 한 축",
    studentTask:
      "지문 진술들을 결합해 도출되는 함의를 판정하거나(추론), ㉠의 이유를 도출하거나, <보기> 빈칸 ㉮에 들어갈 결론을 완성합니다.",
    bestFor: ["논증·원리 구조가 뚜렷한 설명 지문", "인과·조건 관계가 밀한 과학·사회 지문", "주제통합·(가)(나) 결합 추론"],
    outputUi: ["지문 동봉(REASON 모드 ㉠ 마킹)", "5지선다", "<보기> 빈칸 완성(COMPLETE 모드)", "선지별 근거·오답 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "inferMode",
        label: "출제 모드",
        kind: "select",
        options: [
          { value: "INFER", label: "추론 판정(적절하지 않은 것)" },
          { value: "REASON", label: "㉠의 이유 도출" },
          { value: "COMPLETE", label: "<보기> 빈칸 완성(㉮)" },
        ],
        defaultValue: "INFER",
        description: "REASON은 지문 ㉠ 마킹, COMPLETE는 <보기> 속 빈칸 '[ ㉮ ]' 완성형입니다",
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
      "결합할 두 근거를 같은 문단의 인접 문장에 두라. 함정은 근거 없는 상식 진술(BASELESS_PLAUSIBLE) 위주로, 지문 대조 한 번에 배제되게 하라.",
    INTERMEDIATE:
      "두 근거를 서로 다른 문단에 분산하라. 함정에 필요↔충분 반전 또는 부분 결합을 1개 이상 포함하고, 참 추론 선지도 어휘 치환이 아닌 함의 진술로 구성하라.",
    KILLER:
      "3점 승격을 고려하라. 결합을 3단(근거 2개 + 한정 조건)으로 확장하고, 과잉 추론 함정은 정도 표현('~할 수 있다'↔'~할 수밖에 없다') 한 끗 차이로, 부분 결합 함정은 배제 조항을 다른 문단 끝에 배치해 전수 왕복 검증을 강제하라.",
  },
};
