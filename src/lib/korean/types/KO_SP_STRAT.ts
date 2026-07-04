// ============================================================================
// KO_SP_STRAT — 화법: 발표 말하기 방식·표현 전략 (발표 세트 1슬롯)
// ============================================================================
// 카탈로그 §2.3 KO_SP_STRAT 사양의 전면 구현. 자체자료(koStimulus) 필수 유형 —
// 정형 발표문(SPEECH_SCRIPT)을 신규 생성해 문항에 동봉한다(수능 35~37 구조).
//
// 실측 관행(수능 화작 35번 슬롯):
//   발문: "위 발표자의 말하기 방식으로 가장 적절한 것은?" (부정형 변형 존재)
//   발표문 정형 구조: 인사·자기소개 → 화제 도입(선정 동기) → 본문(정보 전달+
//   자료 제시+청중 질문·반응 확인) → 마무리(요약·당부)
//   괄호 지시문 — (청중의 반응을 살피며)·(화면을 가리키며)·(목소리를 높여) —
//   이 준언어·비언어·상호작용 선지의 **유일한 근거**다.
//   선지 = [행위]+[목적/효과] 2중 구조, 어미 '~하고 있다'.
//   오답 2원리: (a)행위 부재(발표문에 그 행위 자체가 없음)
//              (b)행위 있으나 목적·효과 불일치.
//   난이도: 하(정답률 90%+ 관행 — 화작 페이스 조절 슬롯).
//
// 표면 계약: 이 유형의 근거 표면은 지문이 아니라 발표문(자료)이다. 공통 게이트
// (quality/common.ts)의 evidence verbatim 판정은 지문/보기/자료 3표면을 모두
// 허용하므로, 여기 validate 가 "자료 표면 한정"을 자체 강제한다.
// ============================================================================

import { z } from "zod";
import { koMc5Envelope, koStimulusBlockSchema } from "../registry/envelope-schema";
import {
  buildDefaultKoRenderModel,
  readKoStimulusBlocks,
  type KoRenderModel,
  type KoRenderStimulusBlock,
} from "../core/render-model";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeMeta,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 스키마 — 공통 봉투 + 발표문 필수 + 극성·오답 설계 기록
// ---------------------------------------------------------------------------

const schema = koMc5Envelope({
  koStimulus: z
    .array(koStimulusBlockSchema)
    .min(1)
    .describe(
      "발표문 — 이 유형의 필수 자료. kind는 반드시 'SPEECH_SCRIPT' 1개 블록. lines는 문단(발화 단락) 단위 행 배열이며, 괄호 지시문 '(청중의 반응을 살피며)' 류를 행 안에 그대로 포함한다. label·title은 생략(발문이 '위 발표'로 지시)",
    ),
  stemPolarity: z
    .enum(["POSITIVE", "NEGATIVE"])
    .describe(
      "발문 극성 — POSITIVE(표준): '위 발표자의 말하기 방식으로 가장 적절한 것은?' (적절 1 + 부적절 4), NEGATIVE(변형): '위 발표자의 말하기 방식으로 적절하지 않은 것은?' (적절 4 + 부적절 1)",
    ),
  wrongOptionDesign: z
    .array(
      z.object({
        label: z.enum(["①", "②", "③", "④", "⑤"]).describe("부적절 선지 라벨"),
        principle: z
          .enum(["ACT_ABSENT", "PURPOSE_MISMATCH"])
          .describe(
            "부적절 사유: ACT_ABSENT=행위 부재(발표문에 그 행위 자체가 없음 — 근거 relation NOT_MENTIONED), PURPOSE_MISMATCH=행위는 실재하나 목적/효과 왜곡(근거 relation DISTORTS/CONTRADICTS)",
          ),
      }),
    )
    .min(1)
    .max(4)
    .describe(
      "부적절 선지 설계 기록 — POSITIVE 발문이면 오답 4개 전부, NEGATIVE 발문이면 정답(부적절 선지) 1개",
    ),
});

// ---------------------------------------------------------------------------
// 생성 프롬프트 — 카탈로그 §2.3 메커니즘을 출제 매뉴얼 수준으로
// ---------------------------------------------------------------------------

const prompt = `### 유형: 화법 — 발표 말하기 방식·표현 전략 (발표문 자체 생성)

**⚠ 이 유형은 지문 출제형이 아니다.** 위에 제공된 지문은 **발표 화제·정보의 소재로만** 참고하라.
문항의 판정 대상은 네가 koStimulus 로 새로 쓰는 **발표문**이며, 모든 선지·근거(evidence)는
발표문에서만 성립해야 한다. 지문 문장을 발표문에 그대로 복사하지 마라(25자 이상 연속 일치 금지) —
발표 구어체("~인데요", "~하겠습니다", "여러분")로 전면 재작성하라.

**발문 템플릿** (stemPolarity 에 따라 정확히 이 형태로 — [3점] 마크업 금지):
- POSITIVE(표준): "위 발표자의 말하기 방식으로 가장 적절한 것은?"
- NEGATIVE(변형): "위 발표자의 말하기 방식으로 적절하지 않은 것은?"

**발표문(koStimulus, kind="SPEECH_SCRIPT") 설계 — 정형 구조 필수**:
1. 학생 발표 상황(수업 시간, 청중=급우)을 전제한 1인 발표문. 분량 500~900자(공백 제외),
   lines 는 발화 단락 단위 4~8행.
2. 4단 정형 구조를 순서대로 갖춰라:
   ① 인사·자기소개·화제 제시 — 첫 행은 "안녕하세요" 류 인사로 시작
   ② 화제 도입 — 화제 선정 동기(자신의 경험·청중과의 관련성)와 발표 내용 예고
   ③ 본문 — 핵심 정보 전달 + 자료 제시(사진·그래프·영상 등 언급) + 청중에게 질문을
      던지거나 반응을 확인하는 상호작용 최소 1회
   ④ 마무리 — 내용 요약·당부·인사
3. **괄호 지시문을 2~4개** 행 안에 심어라. 표준 예:
   (청중의 반응을 살피며) / (화면을 가리키며) / (목소리를 높여) / (잠시 뜸을 들인 후)
   / (손을 든 청중을 보며) / (천천히 또박또박한 발음으로)
   - 지시문은 **준언어(목소리·속도·발음)·비언어(몸짓·시선)·상호작용(반응 확인) 선지의
     유일한 근거**다. 지시문에 없는 준언어·비언어·상호작용 행위를 참 선지로 만들지 마라.
   - 발표문 본문에서 괄호는 지시문 전용이다 — 연도·부연 설명 괄호 표기는 쓰지 마라.
4. 발표 화제는 지문의 중심 소재에서 가져오되, 청중(고등학생)이 흥미를 가질 국면으로
   재구성하라. 지문에 없는 상식적 보조 정보는 추가해도 좋다(판정 근거는 발표문 문면이므로).

**선지 구성 원리 — [행위]+[목적/효과] 2중 구조, '~하고 있다' 종결**:
1. 모든 선지는 "[구체 행위]하여/함으로써 [목적·효과]하고 있다" 골격이다.
   예: "청중에게 질문을 던져 발표 내용에 대한 주의를 환기하고 있다."
2. 행위 어휘 풀(닫힌 집합에서 고르되 발표문 문면과 대응시켜라):
   질문 던지기 / 자신의 경험 언급 / 구체적 수치·사례 제시 / 시각 자료 활용 /
   전문가·문헌 인용 / 발표 순서 예고 / 내용 요약 / 비유적 표현 활용 /
   청중의 반응 확인 / 준언어적 표현(성량·속도) 조절 / 화제와 청중의 관련성 부각
3. 목적·효과부는 청중 지향으로: 흥미 유발 / 이해를 도움 / 주의 환기 / 신뢰성 확보 /
   내용 강조 / 참여 유도 / 기억에 남도록 함 등.
4. 5개 선지의 행위는 서로 겹치지 않게, 발표문 전반(도입·본문·마무리)에 분산 대응시켜라.
5. POSITIVE 발문: 적절 선지 1개(=정답) + 부적절 선지 4개.
   NEGATIVE 발문: 적절 선지 4개 + 부적절 선지 1개(=정답).

**부적절 선지 2원리 — wrongOptionDesign 에 라벨별로 기록**:
- ACT_ABSENT(행위 부재): 발표문에 그 행위 자체가 없다.
  예: 발표문에 인용이 없는데 "전문가의 견해를 인용하여 신뢰성을 높이고 있다."
  행위 어휘 풀에 있는 그럴듯한 행위여야 한다 — 황당한 행위(노래·율동)는 금지.
- PURPOSE_MISMATCH(목적 불일치): 행위는 발표문에 실재하나 목적·효과를 왜곡한다.
  예: 도입부 질문의 목적이 '흥미 유발'인데 "청중의 배경지식을 점검하기 위해"로 서술.
  발표문 해당 국면의 기능과 정면으로 어긋나는 목적을 붙여라 — 애매한 중간 지대 금지.
- POSITIVE 발문의 부적절 4개는 두 원리를 섞되(각 원리 최소 1개), 같은 행위를 두 선지에
  중복 사용하지 마라. 부적절 지점은 선지당 **정확히 한 곳**이다.

**근거앵커(evidence) 작성 — 근거 표면은 발표문이다 (지문 인용 절대 금지)**:
- 모든 선지(①~⑤)에 evidence 1개 이상. spanText 는 **발표문(koStimulus lines)에서
  그대로 복사**한 구절이어야 한다(verbatim — 한 글자도 바꾸지 말 것).
- 지시문을 근거로 쓸 때는 괄호를 포함해 그대로: spanText="(청중의 반응을 살피며)".
- 적절 선지: relation=SUPPORTS + 그 행위가 실행된 발표문 구절.
- ACT_ABSENT 선지: relation=NOT_MENTIONED + 그 행위가 있을 법한 자리의 가장 가까운 구절.
- PURPOSE_MISMATCH 선지: relation=DISTORTS + 실제 목적이 드러나는 발표문 구절.

**금지**:
- 지시문 근거 없는 준언어·비언어·상호작용 참 선지 (지시문이 유일 근거 원칙 위반).
- 발표문에 없는 행위의 참 선지화, 부적절 지점이 두 곳 이상인 선지.
- 지문 문장의 발표문 통복사, evidence 의 지문 인용.
- '~하고 있다' 이외의 선지 종결, [목적/효과]부가 없는 행위 단독 선지.
- 두 선지가 같은 이유로 부적절해지는 구성.`;

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  if (settings.stemPolarity === "NEGATIVE") {
    lines.push(
      "- stemPolarity=NEGATIVE 로 출제하라: 발문 '위 발표자의 말하기 방식으로 적절하지 않은 것은?', 적절 선지 4개 + 부적절 선지 1개(=정답), wrongOptionDesign 은 정답 1건만.",
    );
  } else {
    lines.push(
      "- stemPolarity=POSITIVE(표준)로 출제하라: 발문 '위 발표자의 말하기 방식으로 가장 적절한 것은?', 적절 선지 1개(=정답) + 부적절 선지 4개, wrongOptionDesign 4건.",
    );
  }
  const focus = settings.strategyFocus;
  if (focus === "PARAVERBAL") {
    lines.push(
      "- 전략 초점: 준언어·비언어 중심 — 괄호 지시문을 3~4개로 늘리고(성량·속도·발음·시선·몸짓), 정답 또는 핵심 참 선지가 지시문을 근거로 성립하게 하라.",
    );
  } else if (focus === "INTERACTION") {
    lines.push(
      "- 전략 초점: 청중 상호작용 중심 — 본문에 청중 질문·반응 확인을 2회 이상 배치하고(지시문 '(청중의 반응을 살피며)' 동반), 선지 과반이 상호작용·질문 행위를 다루게 하라.",
    );
  } else if (focus === "ORGANIZATION") {
    lines.push(
      "- 전략 초점: 내용 조직 중심 — 발표 순서 예고·자료 제시·요약 마무리를 뚜렷이 넣고, 선지 과반이 조직·자료 활용 행위(예고/수치 제시/요약)를 다루게 하라.",
    );
  } else {
    lines.push("- 전략 초점은 발표문 특성에 맞게 자동 배분하라(준언어/상호작용/내용 조직 고루).");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 교과서 담화 관행을 따르고, 선지에 개념어(준언어적 표현·비언어적 표현·상호작용)를 명시적으로 사용해 정의 이해를 함께 확인하라. 부적절 선지는 개념어-행위 오귀속(비언어를 준언어로)도 1개 허용.",
    );
  } else {
    lines.push(
      "- 수능 모드: 발표 세트 도입 슬롯(정답률 90%+ 관행) — 발표문 문면 대조만으로 일의적으로 판정되게 하라. 개념어 나열보다 행위-목적 자연어 서술 우선.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 헬퍼 — 발표문 지시문·표면 텍스트 (결정론)
// ---------------------------------------------------------------------------

/** 괄호 지시문 후보 — 한글 포함 2~40자 괄호 스팬 (프롬프트가 괄호=지시문 전용 강제). */
const DIRECTIVE_RE = /\(([^()]{2,40})\)/g;

function extractDirectives(blocks: KoRenderStimulusBlock[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.kind !== "SPEECH_SCRIPT") continue;
    for (const line of block.lines) {
      const re = new RegExp(DIRECTIVE_RE.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        if (/[가-힣]/.test(m[1])) out.push(m[1].trim());
      }
    }
  }
  return out;
}

/** 자료 블록들을 검증용 평문으로 (title 행 + 본문 행 — 공통 게이트와 동일 규약). */
function stimulusPlainText(blocks: KoRenderStimulusBlock[]): string {
  return blocks.map((b) => [b.title ?? "", ...b.lines].filter(Boolean).join("\n")).join("\n");
}

/** [목적/효과]부 존재 판정용 청중 지향 효과 어휘 (닫힌 집합 — 결정론). */
const EFFECT_TERMS = [
  "청중", "듣는 이", "이해", "관심", "흥미", "주의", "집중", "신뢰", "전달", "강조",
  "환기", "유도", "기억", "참여", "공감", "궁금증", "친밀감", "경각심", "주목", "인상", "실감",
] as const;

const OPTION_LABELS = ["①", "②", "③", "④", "⑤"] as const;
const DISTORT_RELATIONS = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);

interface WrongDesignEntry {
  label: string;
  principle: "ACT_ABSENT" | "PURPOSE_MISMATCH";
}

function readWrongDesign(v: unknown): WrongDesignEntry[] {
  if (!Array.isArray(v)) return [];
  const out: WrongDesignEntry[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const d = raw as Record<string, unknown>;
    if (
      typeof d.label === "string" &&
      (d.principle === "ACT_ABSENT" || d.principle === "PURPOSE_MISMATCH")
    ) {
      out.push({ label: d.label, principle: d.principle });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 유형 특화 검증 (공통 게이트는 dispatch 가 선실행)
// ---------------------------------------------------------------------------

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const stemPolarity = question.stemPolarity === "NEGATIVE" ? "NEGATIVE" : "POSITIVE";
  const negativeStem = ctx.koText.isNegativeStemKo(direction);

  // ── ① 발문 극성 ↔ 선언 극성 정합 ───────────────────────────────────────
  if (stemPolarity === "POSITIVE" && negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
  }
  if (stemPolarity === "NEGATIVE" && !negativeStem) {
    add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
  }

  // ── ② 발문 프레임: '발표(자)' + '말하기 방식/표현 전략' 지시 ────────────
  if (direction && !/발표/.test(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      `발문이 발표(발표자)를 지시하지 않습니다 — "위 발표자의 말하기 방식으로 ~것은?" 프레임 필요: "${direction.slice(0, 40)}"`,
    );
  }
  if (direction && !/(말하기\s*방식|표현\s*전략)/.test(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      `발문이 '말하기 방식'(또는 '표현 전략')을 지시하지 않습니다: "${direction.slice(0, 40)}"`,
    );
  }

  // ── ③ 발표문(SPEECH_SCRIPT) 존재 + 정형 구조 결정론 게이트 ──────────────
  const blocks = readKoStimulusBlocks(question.koStimulus);
  const speechBlocks = blocks.filter((b) => b.kind === "SPEECH_SCRIPT");
  if (speechBlocks.length === 0) {
    // 공통 게이트의 required 결손과 별개로, kind 일탈(엉뚱한 자료만 동봉)도 여기서 차단
    add(
      "error",
      "ko-stimulus-missing",
      "발표문(kind=SPEECH_SCRIPT) 자료가 없습니다 — 이 유형의 판정 대상은 발표문입니다",
    );
  } else {
    const speechText = stimulusPlainText(speechBlocks);
    const speechChars = ctx.koText.charCountKo(speechText);
    if (speechChars < 200) {
      add(
        "error",
        "ko-stimulus-missing",
        `발표문이 너무 짧습니다(공백 제외 ${speechChars}자) — 말하기 방식 5개 판정에는 최소 200자(권장 500~900자)가 필요합니다`,
      );
    }
    // 괄호 지시문 ≥2 — 준언어·비언어·상호작용 선지의 유일 근거 장치
    const directives = extractDirectives(speechBlocks);
    if (directives.length < 2) {
      add(
        "error",
        "ko-stimulus-missing",
        `발표문의 괄호 지시문이 ${directives.length}개입니다 — '(청중의 반응을 살피며)' 류 지시문 2개 이상 필수(준언어·상호작용 선지의 유일 근거)`,
      );
    }
    // 정형 도입(인사) 관행
    const firstLine = speechBlocks[0].lines[0] ?? "";
    if (firstLine && !/(안녕|여러분|반갑)/.test(firstLine)) {
      add(
        "warning",
        "ko-stimulus-kind",
        `발표문 첫 행이 인사·청중 호명으로 시작하지 않습니다(정형 발표 구조 관행): "${firstLine.slice(0, 30)}"`,
      );
    }
    // 지문 통복사(25자 이상 연속 일치) — 지문은 소재 참고 전용
    for (const block of speechBlocks) {
      const copied = block.lines.find(
        (line) => line.length >= 25 && ctx.koText.containsSpanKo(ctx.passage, line),
      );
      if (copied) {
        add(
          "warning",
          "ko-stimulus-kind",
          `발표문 행이 지문 문장을 그대로 복사했습니다 — 발표 구어체로 재작성 필요: "${copied.slice(0, 30)}…"`,
        );
        break;
      }
    }
  }

  // ── ④ 근거 표면 한정: evidence 스팬은 발표문(자료) verbatim ──────────────
  // 공통 게이트는 지문/보기/자료 3표면을 모두 허용한다 — 이 유형은 자료 한정을
  // 자체 강제한다(지문에만 있는 스팬이 통과하는 구멍 봉쇄).
  const stimulusText = stimulusPlainText(blocks);
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  for (const e of evidence) {
    const span = typeof e.spanText === "string" ? e.spanText : "";
    if (!span) continue;
    if (!stimulusText || !ctx.koText.containsSpanKo(stimulusText, span)) {
      add(
        "error",
        "ko-evidence-not-in-passage",
        `근거 스팬이 발표문(자료)에 없습니다 — 이 유형의 근거 표면은 발표문이며 지문 인용은 금지입니다: "${span.slice(0, 40)}"`,
      );
    }
  }

  // ── ⑤ 극성-근거관계 정합 ────────────────────────────────────────────────
  // 부적절 선지(POSITIVE 발문의 오답 4 / NEGATIVE 발문의 정답 1) ↔ 왜곡 계열,
  // 적절 선지 ↔ SUPPORTS.
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
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
    const shouldBeInappropriate = negativeStem ? isCorrect : !isCorrect;
    const hasSupport = relations.has("SUPPORTS");
    const hasDistort = [...relations].some((r) => DISTORT_RELATIONS.has(r));
    if (shouldBeInappropriate && !hasDistort) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 부적절(왜곡) 선지인데 근거 relation 이 왜곡 계열(NOT_MENTIONED/DISTORTS/CONTRADICTS)이 아닙니다 — 극성 모순`,
      );
    }
    if (!shouldBeInappropriate && !hasSupport) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 적절(참) 선지인데 SUPPORTS 근거가 없습니다 — 행위가 실행된 발표문 구절을 앵커하세요`,
      );
    }
  }

  // ── ⑥ 선지 2중 구조 [행위]+[목적/효과] 프록시 ───────────────────────────
  // 어미('~하고 있다')는 공통 게이트(optionEnding="strategy")가 검사한다.
  // 여기서는 목적·효과부(청중 지향 효과 어휘) 존재를 추가 검사한다.
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  for (const o of options) {
    const label = typeof o.label === "string" ? o.label : "";
    const text = typeof o.text === "string" ? o.text : "";
    if (!text) continue;
    if (!EFFECT_TERMS.some((term) => text.includes(term))) {
      add(
        "warning",
        "ko-option-ending",
        `${label} 선지에 목적/효과부(청중 지향 효과 어휘)가 없습니다 — [행위]+[목적/효과] 2중 구조 위반 의심: "${text.slice(0, 40)}"`,
      );
    }
  }

  // ── ⑦ wrongOptionDesign 정합 (라벨 집합 + 원리↔relation 교차) ───────────
  const design = readWrongDesign(question.wrongOptionDesign);
  if (design.length > 0 && OPTION_LABELS.includes(correctAnswer as (typeof OPTION_LABELS)[number])) {
    const expectedBad = negativeStem
      ? new Set<string>([correctAnswer])
      : new Set<string>(OPTION_LABELS.filter((l) => l !== correctAnswer));
    const declared = new Set(design.map((d) => d.label));
    const setEqual =
      declared.size === expectedBad.size && [...declared].every((l) => expectedBad.has(l));
    if (!setEqual) {
      add(
        "warning",
        "ko-negative-stem-mismatch",
        `wrongOptionDesign 라벨(${[...declared].join(" ")})이 부적절 선지 집합(${[...expectedBad].join(" ")})과 다릅니다 — 극성·정답 위치 확인 필요`,
      );
    }
    for (const d of design) {
      const relations = relationOf.get(d.label) ?? new Set<string>();
      if (d.principle === "ACT_ABSENT" && !relations.has("NOT_MENTIONED")) {
        add(
          "error",
          "ko-evidence-missing",
          `${d.label} 는 ACT_ABSENT(행위 부재) 선지인데 근거 relation 에 NOT_MENTIONED 가 없습니다`,
        );
      }
      if (
        d.principle === "PURPOSE_MISMATCH" &&
        !relations.has("DISTORTS") &&
        !relations.has("CONTRADICTS")
      ) {
        add(
          "error",
          "ko-evidence-missing",
          `${d.label} 는 PURPOSE_MISMATCH(목적 불일치) 선지인데 근거 relation 에 DISTORTS/CONTRADICTS 가 없습니다`,
        );
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_SP_STRAT: KoTypeModule = {
  meta: {
    typeId: "KO_SP_STRAT",
    // ⚠ 계약 갭(specGaps 보고됨): KoArea·KoTypeMeta.uiGroup 유니온에 화법·작문·매체
    // 축이 아직 없다. 조립(레지스트리) 단계가 type-module.ts 유니온을
    // ("SPEECH" / "국어 화법·작문·매체") 로 확장하면 아래 두 단언은 자연 소멸한다.
    // (meta.area 는 현재 런타임 소비처 없음 — 단언은 타입 층위에만 영향.)
    area: "SPEECH" as unknown as KoTypeMeta["area"],
    label: "발표 말하기 방식·표현 전략",
    formatCategory: "객관식",
    uiGroup: "국어 화법·작문·매체" as unknown as KoTypeMeta["uiGroup"],
    answerFormat: "MC5",
    // 화법 유형: 지문 미동봉 — 사용자 지문은 발표 화제의 소재 참고로만 프롬프트에 반영.
    includesPassage: false,
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    usesStimulus: "required",
    stimulusKinds: ["SPEECH_SCRIPT"],
    markerFamilies: [],
    optionEnding: "strategy",
    needsSolverGate: false,
    description:
      "자체 생성 정형 발표문(인사→화제 도입→자료 제시·청중 질문→마무리, 괄호 지시문 동봉)을 판정 대상으로, [행위]+[목적/효과] 2중 선지에서 행위 부재·목적 불일치를 가려내는 화법 도입 유형",
    setSlot: "발표 세트(수능 화작 35~37번) 1슬롯 고정 — 정답률 90%+ 페이스 조절 슬롯",
    studentTask:
      "발표문(괄호 지시문 포함)을 읽고, 각 선지의 [행위]가 발표문에 실재하는지·[목적/효과]가 해당 국면과 일치하는지 대조해 판정합니다.",
    bestFor: [
      "발표 화제의 소재가 될 정보성 지문(독서 전 분야)",
      "화작 선택 대비 발표 담화 기본기 훈련",
      "내신 화법 단원(준언어·비언어·상호작용 개념) 확인",
    ],
    outputUi: ["발표문(자료) 박스 — 괄호 지시문 포함", "5지선다('~하고 있다' 전략형)", "선지별 행위-목적 정합 해설"],
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
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것 — 표준)" },
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것 — 변형)" },
        ],
        defaultValue: "POSITIVE",
        description: "표준은 긍정발문(적절 1 + 부적절 4) — 부정발문은 적절 4 + 부적절 1 변형",
      },
      {
        key: "strategyFocus",
        label: "전략 초점",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(고른 배분)" },
          { value: "PARAVERBAL", label: "준언어·비언어(지시문 중심)" },
          { value: "INTERACTION", label: "청중 상호작용(질문·반응 확인)" },
          { value: "ORGANIZATION", label: "내용 조직(예고·자료·요약)" },
        ],
        defaultValue: "AUTO",
        description: "발표문 설계와 선지 행위 풀의 무게 중심",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    // 화법 자체자료형 — 지문 미동봉(발표문 stimulus 는 buildDefault 가 항상 포함).
    return buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: false,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "부적절 선지는 ACT_ABSENT(행위 부재) 위주로 — 발표문 한 번 훑기로 부재가 확인되게 하라. 참(적절) 선지의 행위는 발표문 표면 어휘와 거의 일대일로 대응시키고, 지시문 근거 선지는 1개만.",
    INTERMEDIATE:
      "부적절 선지에 PURPOSE_MISMATCH 를 2개 이상 섞어라 — 행위는 실재하되 목적·효과가 해당 국면의 기능과 어긋나게. 선지 행위를 도입·본문·마무리 전 국면에 분산해 발표문 왕복 대조를 유도하라.",
    KILLER:
      "부적절 선지 전부를 PURPOSE_MISMATCH '절반 참' 설계로: 행위는 모두 발표문에 실재하고 오직 목적·효과만 한 끗 왜곡하라. 유사 행위쌍(질문 2회 — 도입부 흥미 유발 vs 본문 이해 점검)을 발표문에 심어 위치·기능 구분 없이는 배제가 불가능하게 하라. 단 이 유형은 화작 페이스 조절 슬롯(정답률 90%+ 관행)이므로 킬러여도 발문·선지 문면은 평이하게 유지하라.",
  },
};
