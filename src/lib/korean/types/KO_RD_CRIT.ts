// ============================================================================
// KO_RD_CRIT — 독서 비판적 이해 (관점 비교·반론·평가)
// ============================================================================
// 카탈로그 §2.1 KO_RD_CRIT 사양의 전면 구현.
//
// 실측 근거:
//   발문: "(가)의 관점에서 (나)를 비판한 내용으로 가장 적절한 것은?" (주제통합)
//         "'○○ 관점'에 대한 비판으로 가장 적절한 것은?" (단일지문)
//         "<보기>의 입장에서 윗글을 평가한 것으로 가장 적절한 것은?" (외적 준거)
//   정답 축: 이론·관점의 '설명 범위 한계' 지적 (틀렸다는 단정이 아니라 못 다루는
//   영역·사례·조건의 노출) — 발문 핵심어(작은따옴표 어구)는 지문 실재 개념.
//   오답 4원리: 비판 주체·대상 반전 / 일치 지점의 대립 오독 /
//   제3의 근거 무단 도입(NOT_MENTIONED) / 비판이 아니라 요약인 선지.
//   AI 난도 4 — CoT 연구에서도 비판적 이해가 최약 지점(HITL 검수 권장 유형).
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
// 스키마 — 공통 MC5 봉투 + 비판 구도 선언 필드 (검증·해설에 필요한 만큼만)
// ---------------------------------------------------------------------------

const schema = koMc5Envelope({
  critMode: z
    .enum(["CROSS_PART", "SINGLE_VIEW", "BOGI_VIEW"])
    .describe(
      "비판 구도 — CROSS_PART: (가)의 관점에서 (나)를 비판(주제통합 복합지문), SINGLE_VIEW: 단일지문 내 '○○ 관점'에 대한 비판, BOGI_VIEW: <보기>의 입장에서 윗글을 평가(외적 준거)",
    ),
  criticSubject: z
    .string()
    .min(1)
    .describe(
      "비판 주체 관점 — CROSS_PART 는 '(가)' 또는 '(나)', BOGI_VIEW 는 '<보기>', SINGLE_VIEW 는 지문에 실재하는 관점 명칭 verbatim. ⚠ '윗글'/'지문'/'필자' 같은 지시어는 지문에 실재하지 않아 반려된다",
    ),
  critTarget: z
    .string()
    .min(2)
    .describe(
      "비판 대상 관점의 명칭 — 지문에 그대로 실재하는 개념·이론·관점 어구 verbatim (예: '기능주의 관점'). 발문의 작은따옴표 인용과 일치시킬 것",
    ),
  limitPoint: z
    .string()
    .min(1)
    .describe(
      "정답 선지가 지적하는 '설명 범위 한계' 한 줄 요약 — 비판 대상 관점이 설명하지 못하는 영역·사례·조건 (해설·검수용)",
    ),
  wrongOptionDesigns: z
    .array(
      z.object({
        label: z.enum(["①", "②", "③", "④", "⑤"]).describe("오답 선지 라벨"),
        principle: z
          .enum(["SUBJECT_TARGET_SWAP", "AGREEMENT_AS_CONFLICT", "THIRD_GROUND", "SUMMARY_NOT_CRITIQUE"])
          .describe(
            "이 오답에 적용한 함정 원리: SUBJECT_TARGET_SWAP=비판 주체·대상 반전, AGREEMENT_AS_CONFLICT=두 관점의 일치 지점을 대립으로 오독, THIRD_GROUND=지문에 없는 제3의 근거 도입, SUMMARY_NOT_CRITIQUE=비판이 아니라 요약인 선지",
          ),
      }),
    )
    .length(4)
    .describe("오답 4개 각각의 함정 원리 선언 — 정답 라벨은 포함 금지, 4원리 중 최소 3종 사용"),
});

// ---------------------------------------------------------------------------
// 생성 프롬프트 — 출제 매뉴얼
// ---------------------------------------------------------------------------

const prompt = `### 유형: 독서 — 비판적 이해 (관점 비교·반론·평가)

**발문 템플릿** (critMode 에 따라 정확히 이 형태로 — 반드시 긍정발문):
- CROSS_PART(주제통합 복합지문): "(가)의 관점에서 (나)를 비판한 내용으로 가장 적절한 것은?" (역방향 "(나)의 관점에서 (가)를 비판한 내용으로 가장 적절한 것은?" 허용 — criticSubject 와 일치시킬 것)
- SINGLE_VIEW(단일지문): "'○○ 관점'에 대한 비판으로 가장 적절한 것은?" — ○○은 **지문에 그대로 등장하는 개념·이론 명칭**이어야 한다(지문에 없는 명명 금지, 시스템이 결정론 검증함). 작은따옴표 인용을 그대로 쓰라.
- BOGI_VIEW(외적 준거): "<보기>의 입장에서 윗글을 평가한 것으로 가장 적절한 것은?" — <보기>에 3~5문장의 대안 관점(다른 학자·이론·기준)을 신규 서술하고, 그 관점은 지문 관점과 판정 기준이 실제로 갈려야 한다.

**전제 — 지문의 대립 구도 확인**:
이 유형은 지문 안에 (또는 지문×<보기> 사이에) 판정 기준이 다른 두 관점이 있어야 성립한다. 지문에 대립 구도가 없으면 SINGLE_VIEW 로 출제하되, 지문 관점이 '무엇을 전제하고 무엇을 다루지 않는지'가 문면에서 재구성 가능해야 한다.

**정답 선지 설계 — 정답 축은 '설명 범위의 한계' 지적**:
1. 정답은 비판 대상 관점(critTarget)이 **틀렸다는 단정이 아니라, 설명하지 못하는 영역·사례·조건을 지적**하는 진술이다.
   - 좋은 예: "㉯ 관점은 제도의 변화 동인을 행위자의 선택으로만 환원하므로, 행위자가 선택할 수 없는 구조적 제약이 제도를 바꾸는 경우를 설명하지 못한다."
   - 나쁜 예: "㉯ 관점은 틀렸다 / 무의미하다 / 현실과 동떨어져 있다." (가치 폄하 단정 — 금지)
2. 정답의 비판 근거는 **비판 주체 관점(criticSubject)의 전제·판정 기준에서 도출**되어야 한다. 주체 관점과 무관한 범용 비판(어느 관점에나 적용되는 비판)은 정답 유일성을 깨뜨린다 — 금지.
3. limitPoint 필드에 정답이 지적하는 한계를 한 줄로 선언하라 (해설과 정합해야 한다).
4. 정답 술어는 한계 지적 계열로: "~을 설명하지 못한다 / ~을 간과하고 있다 / ~에만 국한된다 / ~인 경우를 다루지 못한다 / ~을 놓치고 있다".

**오답 선지 설계 — 함정 4원리 (wrongOptionDesigns 에 라벨별로 선언, 최소 3종 사용)**:
1. SUBJECT_TARGET_SWAP (비판 주체·대상 반전): 실제로는 (나)가 (가)를 비판할 내용을 (가)→(나) 비판 자리에 놓는다.
   - 예: (가)=규범 중심 관점, (나)=현실 용법 중심 관점일 때, "언어 현실의 변화를 무시한다"는 (나)→(가) 방향의 비판인데 이를 "(가)의 관점에서 (나)를 비판" 선지로 제시.
2. AGREEMENT_AS_CONFLICT (일치 지점의 대립 오독): 두 관점이 **공유하는 전제**를 차이인 양 비판한다.
   - 예: (가)(나) 모두 'X 의 존재'를 인정하는데 "(나)는 X 의 존재를 인정하지 않는다는 점에서 한계가 있다"로 제시. 근거앵커로 두 관점의 일치 구절을 각각 지정하라.
3. THIRD_GROUND (제3의 근거 무단 도입): 지문 어디에도 없는 이론·사례·통계·기준을 비판 근거로 끌어온다.
   - 예: 지문에 없는 "최근 실험 결과" "제3의 절충 이론"을 근거로 삼는 비판. 근거앵커 relation 은 반드시 NOT_MENTIONED (spanText 는 가장 가까운 관련 구절).
4. SUMMARY_NOT_CRITIQUE (요약 선지): critTarget 관점의 내용을 **지문과 일치하게 정확히 요약만** 하고 비판 술어가 없다 — 진술 자체는 참이라 매력도가 높지만 발문(비판)에 부적합해 오답이 된다. 근거앵커 relation 은 SUPPORTS.
- 4개 오답에 같은 원리를 3회 이상 반복하지 마라. SUMMARY_NOT_CRITIQUE 는 최대 1개.

**선지 형식**:
- 5개 선지 전부 "~ㄴ다/~있다" 평서형 종결의 완결 문장. 길이·구문 구조를 평행하게.
- 선지에서 지문 개념을 지칭할 때 작은따옴표 인용을 쓰면 지문 원문 그대로 복사하라(시스템이 verbatim 검증함).

**근거앵커(evidence) 작성**:
- 정답: ①비판 주체 관점의 전제·판정 기준 구절(SUPPORTS) ②비판 대상 관점의 한계가 노출되는 구절(SUPPORTS 또는 DISTORTS 아님 — 한계 지점의 원문) — 2개 이상 권장.
- SUBJECT_TARGET_SWAP 오답: relation=DISTORTS + 실제 비판 방향을 확정하는 구절(주체 관점의 전제 구절).
- AGREEMENT_AS_CONFLICT 오답: relation=DISTORTS 또는 CONTRADICTS + 두 관점이 일치함을 보여 주는 구절.
- THIRD_GROUND 오답: relation=NOT_MENTIONED + 가장 가까운 관련 구절.
- SUMMARY_NOT_CRITIQUE 오답: relation=SUPPORTS + 요약의 원문 구절 (참이지만 비판이 아님을 해설에 명시).

**빈발 반려 사유 (시스템이 기계 검사하므로 어기면 전량 반려)**:
1. **criticSubject 에 '윗글'/'지문'/'필자'/'글쓴이' 같은 지시어 금지** — 이런 값은 지문에
   verbatim 실재하지 않아 즉시 반려된다(1차 반려 최빈 사유). 허용 값은 정확히 셋뿐이다:
   CROSS_PART → '(가)' 또는 '(나)', BOGI_VIEW → '<보기>', SINGLE_VIEW → 지문에 그대로
   등장하는 관점·이론 명칭(예: '기능주의 관점')을 지문에서 찾아 복사한 것.
2. SUMMARY_NOT_CRITIQUE(요약 함정) 오답에는 **SUPPORTS 근거 필수** — 요약 선지는 지문과
   일치해야 매력 오답이 된다. NOT_MENTIONED/DISTORTS 를 붙이면 함정 원리와 모순으로 반려.
3. critTarget·발문 작은따옴표 어구는 지문 원문에서 복사한 표현만 — 네가 만든 명명
   ('전통적 관점' 등 지문에 없는 통칭)은 반려된다.

**금지**:
- 부정발문("적절하지 않은 것은?") — 이 유형은 긍정발문 전용이다.
- 발문 작은따옴표 어구가 지문에 실재하지 않는 명명 (결정론 반려 대상).
- 가치 폄하·인신 공격식 비판 단정("틀렸다", "무의미하다", "쓸모없다").
- 지문 밖 상식·배경지식만으로 성립하는 비판.
- 두 관점 모두에 똑같이 적용되는 범용 비판을 정답으로 (유일성 훼손).
- 정답과 오답이 같은 한계를 다른 표현으로 지적하는 구성 (복수 정답 시비).`;

// ---------------------------------------------------------------------------
// settings — critMode knob + examMode 반영
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const mode = settings.critMode;
  if (mode === "CROSS_PART") {
    lines.push(
      "- critMode=CROSS_PART 로 출제하라: (가)(나) 복합지문 전제, 발문은 \"(가)의 관점에서 (나)를 비판한 내용으로 가장 적절한 것은?\" (또는 역방향).",
    );
  } else if (mode === "SINGLE_VIEW") {
    lines.push(
      "- critMode=SINGLE_VIEW 로 출제하라: 발문은 \"'○○ 관점'에 대한 비판으로 가장 적절한 것은?\" — ○○은 지문 실재 개념 명칭.",
    );
  } else if (mode === "BOGI_VIEW") {
    lines.push(
      "- critMode=BOGI_VIEW 로 출제하라: <보기>에 대안 관점을 서술하고 발문은 \"<보기>의 입장에서 윗글을 평가한 것으로 가장 적절한 것은?\".",
    );
  } else {
    lines.push(
      "- critMode 는 지문 구조로 선택하라: (가)(나) 복합지문이면 CROSS_PART, 단일지문에 대립 관점이 내재하면 SINGLE_VIEW, 단일 관점 지문이면 BOGI_VIEW(<보기>로 대안 관점 공급).",
    );
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 대립 지점은 지문에 명시된 문장(수업 강조점)에서 잡고, 정답의 한계 지적이 지문 문면에서 직접 확인되게 하라. <보기>는 자습서식 관점 요약 문체를 허용한다. 요약 함정(SUMMARY_NOT_CRITIQUE)을 반드시 1개 포함해 '비판 vs 요약' 구분 훈련이 되게 하라.",
    );
  } else {
    lines.push(
      "- 수능 모드: 정답의 한계 지적은 지문에 명시된 문장의 복사가 아니라 두 관점의 전제 진술을 결합해야 도출되게 하라(재진술 거리 확보). 주체·대상 반전 오답은 문면만 훑으면 그럴듯해 보이도록 주체 관점의 어휘를 섞어 서술하라.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 — 유형 특화 결정론 체크
// ---------------------------------------------------------------------------

const OPTION_LABELS_MC5 = ["①", "②", "③", "④", "⑤"] as const;

/** 정답 축(설명 범위 한계 지적)의 술어 닫힌 집합 — 요약 선지와의 구분 판정. */
const CRITIQUE_PREDICATE_RE =
  /(한계|설명하지 못|설명할 수 없|해명하지 못|해명할 수 없|다루지 못|다룰 수 없|간과|놓치|포착하지 못|답하기 어렵|답할 수 없|국한|불과하|환원|적용되지 않|적용될 수 없|충분하지 않|충분히 .{0,8}(다루|설명|반영)지 못)/;

function readWrongDesigns(q: Record<string, unknown>): { label: string; principle: string }[] {
  if (!Array.isArray(q.wrongOptionDesigns)) return [];
  const out: { label: string; principle: string }[] = [];
  for (const raw of q.wrongOptionDesigns) {
    if (!raw || typeof raw !== "object") continue;
    const d = raw as Record<string, unknown>;
    if (typeof d.label === "string" && typeof d.principle === "string") {
      out.push({ label: d.label, principle: d.principle });
    }
  }
  return out;
}

function readBogiText(q: Record<string, unknown>): string {
  if (!q.bogi || typeof q.bogi !== "object") return "";
  const lines = (q.bogi as Record<string, unknown>).lines;
  return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === "string").join("\n") : "";
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const critMode = typeof question.critMode === "string" ? question.critMode : "";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const bogiText = readBogiText(question);

  // ── (1) 긍정발문 전용 — 부정발문 반려 (오답 원리 선언 체계의 전제) ──────
  if (ctx.koText.isNegativeStemKo(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      "비판적 이해 유형은 긍정발문('~비판한 내용으로 가장 적절한 것은?') 전용입니다 — 부정발문 금지",
    );
  }

  // ── (2) 발문 작은따옴표 어구의 지문 실재성 (결정론 — 카탈로그 사양) ─────
  //  '○○ 관점' 같은 발문 핵심어는 지문(BOGI_VIEW 는 지문 또는 <보기>)에
  //  verbatim 실재해야 한다. 공통 게이트는 '선지' 인용만 검사하므로 여기서
  //  발문을 검사한다.
  for (const quoted of ctx.koText.extractQuotedSpansKo(direction)) {
    if (quoted.length < 2) continue;
    const inPassage = ctx.koText.containsSpanKo(ctx.passage, quoted);
    const inBogi = bogiText ? ctx.koText.containsSpanKo(bogiText, quoted) : false;
    if (!inPassage && !inBogi) {
      add(
        "error",
        "ko-quote-not-verbatim",
        `발문 인용 어구 '${quoted.slice(0, 30)}'가 지문에 실재하지 않습니다 — 발문 핵심어는 지문 실재 개념이어야 합니다`,
      );
    }
  }

  // ── (3) critTarget·criticSubject 지문 실재성 (결정론) ────────────────────
  const critTarget = typeof question.critTarget === "string" ? question.critTarget.trim() : "";
  if (critTarget && !ctx.koText.containsSpanKo(ctx.passage, critTarget)) {
    add(
      "error",
      "ko-quote-not-verbatim",
      `critTarget(비판 대상 관점) "${critTarget.slice(0, 30)}"이 지문에 실재하지 않습니다 — 지문 개념·관점 명칭을 verbatim 으로 지정해야 합니다`,
    );
  }
  const criticSubject = typeof question.criticSubject === "string" ? question.criticSubject.trim() : "";
  const structuralSubjects = new Set(["(가)", "(나)", "(다)", "<보기>", "보기"]);
  if (
    criticSubject &&
    !structuralSubjects.has(criticSubject) &&
    !ctx.koText.containsSpanKo(ctx.passage, criticSubject) &&
    !(bogiText && ctx.koText.containsSpanKo(bogiText, criticSubject))
  ) {
    add(
      "error",
      "ko-quote-not-verbatim",
      `criticSubject(비판 주체 관점) "${criticSubject.slice(0, 30)}"이 지문/보기에 실재하지 않습니다`,
    );
  }

  // ── (4) critMode ↔ 발문·지문 구조 정합 (결정론) ─────────────────────────
  if (critMode === "CROSS_PART") {
    if (!(direction.includes("(가)") && direction.includes("(나)"))) {
      add(
        "error",
        "ko-direction-grammar",
        "critMode=CROSS_PART 인데 발문이 (가)/(나) 를 지시하지 않습니다 — \"(가)의 관점에서 (나)를 비판한 내용으로 가장 적절한 것은?\" 형태여야 합니다",
      );
    }
    const labeledParts = splitKoPassageParts(ctx.passage).filter((p) => p.label);
    if (labeledParts.length < 2) {
      add(
        "error",
        "ko-direction-grammar",
        "critMode=CROSS_PART 인데 지문이 (가)(나) 복합지문이 아닙니다 — 단일지문은 SINGLE_VIEW/BOGI_VIEW 로 출제해야 합니다",
      );
    }
  } else if (critMode === "SINGLE_VIEW") {
    if (ctx.koText.extractQuotedSpansKo(direction).length === 0) {
      add(
        "error",
        "ko-direction-grammar",
        "critMode=SINGLE_VIEW 인데 발문에 작은따옴표 관점 인용('○○ 관점')이 없습니다",
      );
    }
  } else if (critMode === "BOGI_VIEW") {
    if (!bogiText) {
      add("error", "ko-bogi-missing", "critMode=BOGI_VIEW 인데 <보기>(대안 관점)가 없습니다");
    }
    if (!/보\s*기/.test(direction)) {
      add(
        "error",
        "ko-direction-grammar",
        "critMode=BOGI_VIEW 인데 발문이 <보기>를 지시하지 않습니다 — \"<보기>의 입장에서 윗글을 평가한 것으로 가장 적절한 것은?\" 형태여야 합니다",
      );
    }
  }

  // ── (5) wrongOptionDesigns 라벨 정합 (결정론) ───────────────────────────
  const designs = readWrongDesigns(question);
  const designLabels = designs.map((d) => d.label);
  if (correctAnswer && designLabels.includes(correctAnswer)) {
    add(
      "error",
      "ko-correct-answer-invalid",
      `wrongOptionDesigns 에 정답 라벨 ${correctAnswer} 이 포함되어 있습니다 — 오답 4개만 선언해야 합니다`,
    );
  }
  if (new Set(designLabels).size !== designLabels.length) {
    add("error", "ko-correct-answer-invalid", "wrongOptionDesigns 에 중복 라벨이 있습니다");
  }
  if (correctAnswer && designs.length === 4) {
    const expectedWrong = OPTION_LABELS_MC5.filter((l) => l !== correctAnswer);
    const missing = expectedWrong.filter((l) => !designLabels.includes(l));
    if (missing.length > 0) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `오답 라벨 ${missing.join(" ")} 의 함정 원리 선언이 없습니다 — 오답 4개 전부 wrongOptionDesigns 에 선언해야 합니다`,
      );
    }
  }

  // ── (6) 함정 원리 ↔ 근거앵커 relation 정합 (결정론) ─────────────────────
  //  THIRD_GROUND 오답 = NOT_MENTIONED 근거 필수 (지문에 없는 근거 도입 함정).
  //  SUMMARY_NOT_CRITIQUE 오답 = SUPPORTS 근거 필수 (지문과 일치하는 요약).
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
  for (const d of designs) {
    const relations = relationOf.get(d.label) ?? new Set<string>();
    if (d.principle === "THIRD_GROUND" && relations.size > 0 && !relations.has("NOT_MENTIONED")) {
      add(
        "error",
        "ko-evidence-missing",
        `${d.label} 선지는 THIRD_GROUND(제3 근거 도입) 함정인데 NOT_MENTIONED 근거가 없습니다 — 함정 원리와 근거 관계가 모순됩니다`,
      );
    }
    if (d.principle === "SUMMARY_NOT_CRITIQUE" && relations.size > 0 && !relations.has("SUPPORTS")) {
      add(
        "error",
        "ko-evidence-missing",
        `${d.label} 선지는 SUMMARY_NOT_CRITIQUE(요약 함정)인데 SUPPORTS 근거가 없습니다 — 요약 선지는 지문과 일치해야 매력 오답이 됩니다`,
      );
    }
  }

  // ── (7) 정답 축·요약 함정의 술어 검사 (닫힌 술어 집합 — 휴리스틱 경고) ──
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  const textOf = new Map<string, string>();
  for (const o of options) {
    if (typeof o.label === "string" && typeof o.text === "string") textOf.set(o.label, o.text);
  }
  const correctText = textOf.get(correctAnswer) ?? "";
  if (correctText && !CRITIQUE_PREDICATE_RE.test(correctText)) {
    add(
      "warning",
      "ko-option-ending",
      `정답 선지에 한계 지적 술어(설명하지 못한다/간과/국한 등)가 없습니다 — 정답 축은 '설명 범위 한계' 지적이어야 합니다: "${correctText.slice(0, 40)}"`,
    );
  }
  for (const d of designs) {
    if (d.principle !== "SUMMARY_NOT_CRITIQUE") continue;
    const t = textOf.get(d.label) ?? "";
    if (t && CRITIQUE_PREDICATE_RE.test(t)) {
      add(
        "warning",
        "ko-option-ending",
        `${d.label} 선지는 요약 함정(SUMMARY_NOT_CRITIQUE)인데 한계 지적 술어가 들어 있습니다 — 요약 선지는 비판 술어 없이 내용 재진술만 해야 합니다`,
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_RD_CRIT: KoTypeModule = {
  meta: {
    typeId: "KO_RD_CRIT",
    area: "READING",
    label: "비판적 이해(관점 평가)",
    formatCategory: "객관식",
    uiGroup: "국어 독서",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 2,
    usesBogi: "optional",
    markerFamilies: [],
    optionEnding: "plain",
    needsSolverGate: false,
    description:
      "대립 구도 지문에서 한 관점으로 다른 관점의 설명 범위 한계를 비판·평가하는 독서 고난도 유형 — (가)(나)·단일지문·<보기> 준거 3모드",
    setSlot: "주제통합 세트 후반 슬롯 — 관점 대립 지문의 비판·평가 문항(2~3점)",
    studentTask:
      "비판 주체 관점의 전제에서 출발해, 대상 관점이 설명하지 못하는 한계를 정확히 지적한 선지 하나를 고릅니다.",
    bestFor: [
      "두 관점이 대립하는 (가)(나) 주제통합 지문",
      "이론·관점의 전제와 적용 범위가 명시된 인문·사회 지문",
      "<보기> 대안 관점으로 평가 구도를 만들 수 있는 단일 관점 지문",
    ],
    outputUi: ["지문 동봉", "(선택) <보기> 대안 관점", "5지선다", "선지별 함정 원리·근거 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "critMode",
        label: "비판 구도",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(지문 구조)" },
          { value: "CROSS_PART", label: "(가)→(나) 관점 비판 (복합지문)" },
          { value: "SINGLE_VIEW", label: "'○○ 관점' 비판 (단일지문)" },
          { value: "BOGI_VIEW", label: "<보기> 입장에서 평가 (외적 준거)" },
        ],
        defaultValue: "AUTO",
        description: "복합지문은 (가)→(나) 교차 비판, 단일지문은 내부 관점 비판 또는 <보기> 준거 평가",
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
      "대립 지점이 지문에 명시된 문장에서 직접 확인되게 하라. 함정은 주체·대상 반전(SUBJECT_TARGET_SWAP) 위주로, 반전이 문면 대조만으로 드러나게.",
    INTERMEDIATE:
      "정답의 한계 지적을 두 관점의 전제 진술 결합에서 도출하게 하라. 일치 지점 오독(AGREEMENT_AS_CONFLICT) 함정을 반드시 1개 포함하고, 요약 함정은 지문과 완전 일치하는 재진술로.",
    KILLER:
      "3점 배점을 고려하라. 정답의 한계는 대상 관점의 한정 조건('~인 경우에만')과 주체 관점의 전제를 결합해야만 보이게 숨겨라. 주체·대상 반전 오답에 주체 관점의 어휘를 섞어 표면 판별을 차단하고, 모든 선지의 구문을 평행하게 맞춰 전수 검증을 강제하라.",
  },
};
