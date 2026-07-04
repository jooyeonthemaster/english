// ============================================================================
// KO_LIT_SPEECH — 문학 말하기 방식·대화 양상 ([A]/[B] 블록)
// ============================================================================
// 카탈로그 §2.2 KO_LIT_SPEECH 사양의 전면 구현. RANGE_BRACKET(블록 범위) 마커
// 유형의 대표 — 대화·발화 블록 1~2개를 [A]/[B] 로 지정하고 화행(말하기 방식)을
// 판정한다.
//
// 실측 근거:
//   발문: "[A]에 대한 이해로 적절하지 않은 것은?" (2026 수능 27번)
//         "[A]와 [B]에 대한 설명으로 가장 적절한 것은?"
//   [A]/[B] 2개 모드 선지 = "[A]는 ~하며 [B]는 ~한다" 대칭 구조 5개 반복 —
//   절반만 참(앞절 참 + 뒷절 거짓)이 표준 함정.
//   화행 동사 은행: 하소연·회유·설득·변명·촉구·공감·반박·질책·간청·위로·
//   다짐·떠보기·얼버무리기 등. 고전소설·판소리 문답 대목 최적.
// ============================================================================

import { z } from "zod";
import { koMc5Envelope, koMarkerSchema } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 화행 동사 은행 — 닫힌 풀 (카탈로그 G8 개념어 온톨로지의 화행판).
// 선지 술부와 speechActs 필드는 이 은행의 용어만 사용한다. 프롬프트의 은행
// 나열과 검증기의 풀 대조가 이 상수 하나에서 파생된다(이중화 금지).
// ---------------------------------------------------------------------------
const SPEECH_ACT_BANK = [
  "하소연", "회유", "설득", "변명", "촉구", "공감", "반박", "질책", "간청", "위로",
  "다짐", "떠보기", "얼버무리기", "원망", "채근", "만류", "추궁", "자책", "넋두리",
  "한탄", "당부", "애원", "거절", "수긍", "조롱", "위협", "체념",
] as const;
const SPEECH_ACT_SET: ReadonlySet<string> = new Set(SPEECH_ACT_BANK);

/** 은행 용어가 선지 술부에 (활용형 포함) 등장하는가 — "떠보기"는 "떠보고 있다"에 매칭. */
function optionUsesAct(optionText: string, act: string): boolean {
  if (optionText.includes(act)) return true;
  if (act.endsWith("기")) return optionText.includes(act.slice(0, -1));
  return false;
}

const schema = koMc5Envelope({
  blockMode: z
    .enum(["SINGLE", "DUAL"])
    .describe(
      "블록 모드 — SINGLE: [A] 블록 1개(부정발문 '이해' 판정), DUAL: [A]·[B] 블록 2개(긍정발문 대칭 비교)",
    ),
  markers: z
    .array(koMarkerSchema)
    .min(1)
    .max(2)
    .describe(
      "발화 블록 마커 — 반드시 family=RANGE_BRACKET, 라벨은 [A](·[B]) 순서. spanText 는 해당 대화·발화 블록의 첫 문장부터 끝 문장까지 지문 원문 그대로(한 글자도 변형 금지). SINGLE 모드 1개, DUAL 모드 2개(두 블록은 겹치지 않게)",
    ),
  speechActs: z
    .array(z.string())
    .min(1)
    .max(8)
    .describe(
      "이 문항의 선지 술부에 실제로 사용한 화행 동사 목록 — 반드시 [화행 동사 은행] 내 용어만 (예: 하소연, 회유, 질책)",
    ),
});

const prompt = `### 유형: 문학 — 말하기 방식·대화 양상 ([A]/[B] 블록)

**발문 템플릿** (blockMode 에 따라 정확히 이 형태로):
- SINGLE(블록 1개, 부정발문): "[A]에 대한 이해로 적절하지 않은 것은?"
- DUAL(블록 2개, 긍정발문): "[A]와 [B]에 대한 설명으로 가장 적절한 것은?"

**블록([A]/[B]) 선정 원리**:
1. 지문에서 인물의 발화가 연속되는 **대화·문답·설득 대목**을 블록으로 지정하라. 고전소설·판소리의 문답 대목(청↔거절, 추궁↔변명, 하소연↔위로)이 최적이다.
2. spanText 는 블록 **첫 문장부터 끝 문장까지의 지문 원문 그대로** — 중간 생략·요약·조사 변형 전부 금지. 블록은 발화(큰따옴표 대사)를 중심으로 하되 사이에 낀 짧은 지문 서술("~라고 하니")까지 통째로 포함한다.
3. 블록 분량: 최소 2문장 이상(발화 1~2턴 이상). 어절 1~2개짜리 구절이면 이 유형이 아니라 ㉠계열(구절 유형) 사안이다.
4. DUAL 모드의 두 블록은 **말하기 전략·처지·태도가 대비되는** 두 국면(또는 두 인물의 발화 국면)으로 골라라: 예) [A]=춘향이 수청을 거절하며 절개를 내세우는 대목 vs [B]=변학도가 회유하다 위협으로 돌아서는 대목. 두 블록은 지문에서 겹치지 않아야 한다.
5. 라벨은 지문 등장 순서대로 [A]→[B].

**화행 동사 은행** (닫힌 풀 — 선지의 화행 서술과 speechActs 필드는 이 은행의 용어만 사용, 은행 밖 용어 금지):
${SPEECH_ACT_BANK.join(", ")}
- speechActs 필드에는 선지 술부에 실제로 사용한 화행 동사만 나열하라(쓰지 않은 화행 나열 금지).

**선지 구성 원리 — SINGLE 모드**:
1. 5개 선지는 [A] 블록 안의 서로 다른 발화(또는 같은 발화의 서로 다른 국면)에 대한 말하기 방식 진술이다.
2. 진술 골격: "[발화 수단/내용]을 통해/들어 [화행]하고 있다" — 예) "상대의 지난 잘못을 들어 질책하고 있다".
3. 부정발문이므로 참 선지 4개 + 왜곡 선지 1개(=정답).

**선지 구성 원리 — DUAL 모드**:
1. 5개 선지 전부를 **"[A]는 ~하며(~하고), [B]는 ~한다" 대칭 구조**로 반복하라 — 앞절은 [A]의 화행, 뒷절은 [B]의 화행. [A]가 항상 앞절.
2. 정답 1개만 앞절·뒷절이 모두 참. 오답 4개의 표준 함정은 **절반만 참**: 앞절([A])은 지문으로 확인되는 참 진술로 두고 **뒷절([B])만 거짓**으로 만들어라(전수 대조를 강제하는 장치). 4개 중 1개 정도는 앞절 거짓·뒷절 참으로 변주해도 좋다.
3. 두 절의 화행 어휘는 같은 추상 수준으로 평행하게 (앞절만 구체 인용, 뒷절만 일반론 금지).

**오답 함정 원리** (하나를 정확히 적용하고, 왜곡 지점은 정확히 한 곳):
- **절반 참(대칭 선지 표준 함정)**: 앞절 참 + 뒷절 거짓. 예) "[A]는 상대의 처지에 공감하며(참), [B]는 자신의 결백을 변명한다(거짓 — 실제로는 상대를 추궁)".
- **인접 화행 오귀속**: 같은 극성 안에서 이웃 화행으로 치환 — 하소연↔간청, 회유↔설득, 변명↔얼버무리기, 질책↔반박. 예) 사정을 늘어놓아 동정을 구하는 발화(하소연)를 "행동을 요구하며 간청"으로.
- **발화 주체·청자 뒤바꿈**: 갑이 을에게 한 말을 을의 발화로, 또는 청자를 제3자로. 문답 대목에서 최빈.
- **수단-목적 분리 왜곡**: 발화 수단(고사 인용·자기 비하·눈물)은 맞게 쓰고 그 목적(화행)만 틀리게. 예) "옛 고사를 끌어와(참) 상대를 조롱한다(거짓 — 실제로는 설득)".
- **극성 반전**: 질책→위로, 반박→공감처럼 정반대 화행으로. 너무 쉬워지므로 BASIC 난이도 외에는 단독 사용을 피하라.
- **블록 밖 발화 근거화**: [A] 범위 밖에서 한 말하기를 [A]의 것으로 서술. 블록 경계 확인을 강제한다.

**근거앵커(evidence) 작성**:
- 각 선지의 근거 spanText 는 **해당 블록([A]/[B]) 내부의 발화·서술에서 verbatim** 으로 뽑아라. 블록 밖 구절을 근거로 삼지 마라(발화 주체 확인용 서술만 예외).
- 참 진술(참 선지·대칭 선지의 참인 절): relation=SUPPORTS.
- 왜곡 진술: relation=DISTORTS(화행 오귀속·수단-목적 분리·주체 뒤바꿈) 또는 NOT_MENTIONED(블록에 없는 발화의 사실화).
- DUAL 모드 오답 선지에는 근거 2개를 붙여라: 참인 절의 SUPPORTS + 거짓인 절의 DISTORTS.

**금지**:
- 발화가 아닌 서술·묘사 중심 대목을 블록으로 지정 (말하기 방식 판정이 성립하지 않음).
- 블록 없이 성립하는 작품 일반론 선지 ("이 작품의 인물들은 ~하다").
- 화행 동사 없이 내용 요약만 하는 선지 ("[A]는 수청 요구를 거절한다" — 내용 이해 유형과의 경계 붕괴).
- 두 개 이상의 선지가 같은 지점에서 같은 이유로 틀리는 구성.
- DUAL 모드에서 대칭 구조를 깨는 선지 ([A]만 서술하거나 [B]를 앞절에 두는 선지).`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  if (settings.blockMode === "SINGLE") {
    lines.push(
      "- blockMode=SINGLE 로 출제하라: [A] 블록 1개, 발문은 '[A]에 대한 이해로 적절하지 않은 것은?', 참 4 + 왜곡 1.",
    );
  } else if (settings.blockMode === "DUAL") {
    lines.push(
      "- blockMode=DUAL 로 출제하라: [A]·[B] 블록 2개, 발문은 '[A]와 [B]에 대한 설명으로 가장 적절한 것은?', 5개 선지 전부 '[A]는 ~하며 [B]는 ~한다' 대칭 구조, 오답은 절반 참 함정.",
    );
  } else {
    lines.push(
      "- 블록 모드는 지문 특성에 맞게 선택하라: 대비되는 발화 국면이 둘 이상이면 DUAL([A]/[B] 대칭 비교), 밀도 높은 문답 대목이 하나면 SINGLE([A] 단독).",
    );
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 수업에서 강조될 법한 핵심 문답 대목(주제 갈등이 응축된 대화)을 블록으로 지정하고, 화행 어휘는 교과서·자습서 통용어(하소연·설득·회유 등)로 제한하라. 단 자습서 고정 해석의 위치 암기로 풀리지 않게 왜곡 지점은 발화 문면 대조로만 판정되게 하라.",
    );
  } else {
    lines.push(
      "- 수능 모드: 초면 발췌 기준으로 판정 가능해야 한다 — 작품 배경지식 없이 블록 문면과 앞뒤 맥락만으로 화행이 확정되는 발화를 골라라.",
    );
  }
  return lines.join("\n");
}

const DISTORT_RELATIONS = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const markers = Array.isArray(question.markers)
    ? (question.markers as Record<string, unknown>[])
    : [];
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  const direction = typeof question.direction === "string" ? question.direction : "";

  // blockMode 복원 (필드 부재 시 마커 수로 방어적 추론)
  const declaredMode =
    question.blockMode === "SINGLE" || question.blockMode === "DUAL"
      ? (question.blockMode as "SINGLE" | "DUAL")
      : null;
  const mode = declaredMode ?? (markers.length >= 2 ? "DUAL" : "SINGLE");

  // ── 결정론 체크 1: 마커 = 전부 RANGE_BRACKET + 1~2개 + 모드별 라벨 정합 ──
  for (const m of markers) {
    const family = typeof m.family === "string" ? m.family : "";
    if (family !== "RANGE_BRACKET") {
      add(
        "error",
        "ko-marker-option-mismatch",
        `말하기 방식 유형의 마커는 전부 RANGE_BRACKET([A]/[B])이어야 합니다 — ${family} 발견`,
      );
    }
  }
  if (markers.length < 1 || markers.length > 2) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `발화 블록 마커는 1~2개여야 합니다 — 현재 ${markers.length}개`,
    );
  }
  const labels = markers.map((m) => (typeof m.label === "string" ? m.label : ""));
  const expectedLabels = mode === "DUAL" ? ["[A]", "[B]"] : ["[A]"];
  if (declaredMode && markers.length !== expectedLabels.length) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `blockMode=${declaredMode} 인데 마커가 ${markers.length}개입니다 (기대: ${expectedLabels.length}개)`,
    );
  } else if (labels.join("") !== expectedLabels.join("")) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `블록 라벨이 ${expectedLabels.join("·")} 순서가 아닙니다: ${labels.join(" ") || "(없음)"}`,
    );
  }

  // ── 결정론 체크 2: 발문에 블록 라벨 포함 (모드별 템플릿 정합) ──────────
  if (mode === "SINGLE") {
    if (!direction.includes("[A]")) {
      add("error", "ko-direction-grammar", `SINGLE 모드 발문에 [A] 가 없습니다: "${direction}"`);
    }
    if (direction.includes("[B]")) {
      add(
        "error",
        "ko-direction-grammar",
        "SINGLE 모드 발문에 [B] 가 등장합니다 — 블록이 1개인 문항입니다",
      );
    }
    if (!ctx.koText.isNegativeStemKo(direction)) {
      add(
        "error",
        "ko-direction-grammar",
        `SINGLE 모드 발문은 부정발문("[A]에 대한 이해로 적절하지 않은 것은?")이어야 합니다: "${direction}"`,
      );
    }
  } else {
    if (!direction.includes("[A]") || !direction.includes("[B]")) {
      add(
        "error",
        "ko-direction-grammar",
        `DUAL 모드 발문에 [A]·[B] 가 모두 있어야 합니다("[A]와 [B]에 대한 설명으로 가장 적절한 것은?"): "${direction}"`,
      );
    }
    if (ctx.koText.isNegativeStemKo(direction)) {
      add(
        "error",
        "ko-direction-grammar",
        "DUAL 모드 발문은 긍정발문('가장 적절한 것은?')이어야 합니다 — 대칭 선지 절반 참 함정은 긍정발문 전제",
      );
    }
  }

  // ── 결정론 체크 3: 선지-블록 언급 정합 ─────────────────────────────────
  for (const o of options) {
    const text = typeof o.text === "string" ? o.text : "";
    const label = typeof o.label === "string" ? o.label : "";
    if (!text) continue;
    if (mode === "DUAL") {
      // 대칭 구조: 각 선지에 [A]·[B] 둘 다 언급
      const missing = ["[A]", "[B]"].filter((b) => !text.includes(b));
      if (missing.length > 0) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${label} 선지에 ${missing.join("·")} 언급이 없습니다 — DUAL 모드 선지는 "[A]는 ~하며 [B]는 ~한다" 대칭 구조여야 합니다`,
        );
      } else if (text.indexOf("[B]") < text.indexOf("[A]")) {
        add(
          "warning",
          "ko-marker-order",
          `${label} 선지에서 [B] 가 [A] 보다 앞에 있습니다 — 대칭 구조([A] 앞절, [B] 뒷절)가 깨졌습니다`,
        );
      }
    } else if (text.includes("[B]")) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `${label} 선지가 존재하지 않는 블록 [B] 를 언급합니다 (SINGLE 모드)`,
      );
    }
  }

  // ── 결정론 체크 4: 블록 스팬 분량 (블록 vs 구절 위계) ──────────────────
  for (const m of markers) {
    const span = typeof m.spanText === "string" ? m.spanText : "";
    const label = typeof m.label === "string" ? m.label : "";
    if (!span) continue;
    const sentences = ctx.koText.splitSentencesKo(span);
    if (sentences.length < 2 && ctx.koText.eojeolCount(span) < 8) {
      add(
        "warning",
        "ko-marker-hierarchy",
        `${label} 블록 스팬이 발화 블록이라기엔 짧습니다(문장 ${sentences.length}개, "${span.slice(0, 24)}…") — 구절 단위면 ㉠계열 유형을 쓰세요`,
      );
    }
  }

  // ── 결정론 체크 5: 발문 극성 ↔ 근거 relation 정합 ─────────────────────
  //   SINGLE(부정발문): 정답(왜곡 선지)=왜곡 계열 근거, 참 선지 4개=SUPPORTS.
  //   DUAL(긍정발문): 정답(전참 선지)=SUPPORTS, 오답 4개(절반 참)=왜곡 계열 1개 이상.
  const negativeStem = ctx.koText.isNegativeStemKo(direction);
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
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    const shouldHaveDistort = negativeStem ? isCorrect : !isCorrect;
    const hasDistort = [...relations].some((r) => DISTORT_RELATIONS.has(r));
    const hasSupport = relations.has("SUPPORTS");
    if (shouldHaveDistort && !hasDistort) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 왜곡(절반 참 포함) 선지인데 왜곡 계열 근거(DISTORTS/CONTRADICTS/NOT_MENTIONED)가 없습니다 — 극성 모순`,
      );
    }
    if (!shouldHaveDistort && !hasSupport) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 참 선지인데 SUPPORTS 근거가 없습니다 — 극성 모순`,
      );
    }
  }

  // ── 결정론 체크 6: 근거 스팬의 블록 내 위치 (블록 밖 근거 경고) ────────
  const blockSpans = markers
    .map((m) => (typeof m.spanText === "string" ? m.spanText : ""))
    .filter(Boolean);
  if (blockSpans.length > 0) {
    for (const e of evidence) {
      const span = typeof e.spanText === "string" ? e.spanText : "";
      const label = typeof e.optionLabel === "string" ? e.optionLabel : "";
      if (!span || !label) continue;
      const inAnyBlock = blockSpans.some((block) => ctx.koText.containsSpanKo(block, span));
      if (!inAnyBlock && ctx.koText.containsSpanKo(ctx.passage, span)) {
        add(
          "warning",
          "ko-marker-hierarchy",
          `${label} 선지의 근거가 [A]/[B] 블록 밖에 있습니다: "${span.slice(0, 30)}" — 말하기 방식 판정 근거는 블록 내부 발화여야 합니다`,
        );
      }
    }
  }

  // ── 결정론 체크 7: 지문 내 블록 등장 순서 ([A] 가 [B] 보다 앞) ─────────
  //   스팬 미실재·블록 겹침 자체는 공통 게이트(마커해소·overlap) 소관 —
  //   여기서는 둘 다 해소될 때의 라벨-순서 정합만 본다.
  if (mode === "DUAL" && markers.length === 2) {
    const spanOf = (m: Record<string, unknown>) =>
      typeof m.spanText === "string" ? m.spanText : "";
    const occOf = (m: Record<string, unknown>) =>
      typeof m.occurrenceIndex === "number" ? m.occurrenceIndex : 0;
    const matchA = spanOf(markers[0])
      ? ctx.koText.findSpanKo(ctx.passage, spanOf(markers[0]), occOf(markers[0]))
      : null;
    const matchB = spanOf(markers[1])
      ? ctx.koText.findSpanKo(ctx.passage, spanOf(markers[1]), occOf(markers[1]))
      : null;
    if (matchA && matchB && matchB.sourceStart < matchA.sourceStart) {
      add(
        "warning",
        "ko-marker-order",
        "[B] 블록이 지문에서 [A] 블록보다 먼저 등장합니다 — 라벨은 지문 등장 순서대로 [A]→[B] 로 부여해야 합니다",
      );
    }
  }

  // ── 결정론 체크 8: 화행 동사 은행(닫힌 풀) 대조 ────────────────────────
  //   [코드 재사용] 전용 코드(스펙 KO_SPEECH_TERM_UNKNOWN 상당)가 quality/codes.ts
  //   에 없어, 선지 술부 규약과 인접한 warning 코드 ko-option-ending 을 재사용한다.
  const acts = Array.isArray(question.speechActs)
    ? (question.speechActs as unknown[]).filter((a): a is string => typeof a === "string")
    : [];
  for (const act of acts) {
    if (!SPEECH_ACT_SET.has(act)) {
      add(
        "warning",
        "ko-option-ending",
        `speechActs 의 "${act}" 는 화행 동사 은행 밖 용어입니다 — 은행 내 용어(하소연·회유·설득 등)로 교체하세요`,
      );
    }
  }
  for (const o of options) {
    const text = typeof o.text === "string" ? o.text : "";
    const label = typeof o.label === "string" ? o.label : "";
    if (!text) continue;
    const usesBankTerm = SPEECH_ACT_BANK.some((act) => optionUsesAct(text, act));
    if (!usesBankTerm) {
      add(
        "warning",
        "ko-option-ending",
        `${label} 선지 술부에 화행 동사 은행 용어가 없습니다 — 말하기 방식 선지는 은행 내 화행 동사로 서술해야 합니다`,
      );
    }
  }
  for (const act of acts) {
    if (!SPEECH_ACT_SET.has(act)) continue;
    const used = options.some(
      (o) => typeof o.text === "string" && optionUsesAct(o.text as string, act),
    );
    if (!used) {
      add(
        "warning",
        "ko-option-ending",
        `speechActs 에 선언된 "${act}" 가 어느 선지에도 사용되지 않았습니다 — 실사용 화행만 나열하세요`,
      );
    }
  }

  return issues;
}

export const KO_LIT_SPEECH: KoTypeModule = {
  meta: {
    typeId: "KO_LIT_SPEECH",
    area: "LITERATURE",
    label: "말하기 방식·대화 양상([A]/[B])",
    formatCategory: "객관식",
    uiGroup: "국어 문학",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["LIT_MODERN_NOVEL", "LIT_CLASSIC_NOVEL", "LIT_PLAY", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: ["RANGE_BRACKET"],
    optionEnding: "plain",
    needsSolverGate: false,
    description:
      "대화·발화 블록을 [A]/[B] 로 지정하고 화행(하소연·회유·설득 등 말하기 방식)을 판정하는 산문 대화 유형",
    setSlot: "산문 세트 중간 슬롯 — 고전소설·판소리 문답 대목 최적",
    studentTask:
      "[A](·[B]) 블록 발화의 말하기 방식 진술에서 왜곡된 하나(부정발문) 또는 앞절·뒷절 모두 참인 하나(대칭 비교)를 고릅니다.",
    bestFor: ["고전소설·판소리의 문답 대목", "인물 간 설득·추궁·하소연 장면", "희곡·시나리오 대사 장면"],
    outputUi: ["[A]/[B] 블록 마킹 지문", "5지선다(대칭 구조)", "블록 내 발화 근거 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "blockMode",
        label: "블록 모드",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(지문 특성)" },
          { value: "SINGLE", label: "[A] 단독 (이해 판정·부정발문)" },
          { value: "DUAL", label: "[A]/[B] 대비 (대칭 비교·절반 참 함정)" },
        ],
        defaultValue: "AUTO",
        description: "DUAL 은 두 발화 국면의 대칭 비교로 전수 검증을 강제해 체감 난도가 올라갑니다",
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
      "SINGLE 모드 우선. 화행이 발화 문면에 직접 드러나는 블록(직접 요청·질책)을 고르고, 왜곡은 극성 반전 수준으로 명확하게.",
    INTERMEDIATE:
      "절반 참 함정을 도입하라(DUAL 이면 표준 적용). 화행 오귀속은 동일 극성 내 인접 화행 치환(하소연↔간청, 회유↔설득)으로.",
    KILLER:
      "DUAL 모드로 오답 4개 전부를 절반 참으로 설계하되 앞절([A])은 전부 지문으로 확인되는 참 진술로 통일해 뒷절([B]) 전수 대조를 강제하라. 표면 화행(공손한 권유)과 실제 의도(떠보기·회유)가 분리되는 발화를 블록으로 채택하라.",
  },
};
