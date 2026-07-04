// ============================================================================
// KO_WR_METHOD — 작문 글쓰기 방식·내용 조직 (초고 자체자료형)
// ============================================================================
// 카탈로그 §2.4 KO_WR_METHOD 사양의 전면 구현. stimulus(DRAFT) 필수 유형 —
// 지문(Passage)이 아니라 문항 봉투에 동봉되는 **학생 초고**가 판정 표면이다
// (includesPassage=false, 사용자 지문은 초고의 소재·화제 참고로만).
//
// 실측 근거(수능 화작 43~45번대·학평 작문 세트):
//   발문: "(다)에 활용된 글쓰기 방식으로 가장 적절한 것은?" — 단독 출제형은
//   "윗글(초고)에 활용된 글쓰기 방식으로 가장 적절한 것은?"
//   선지 = [조직 방식]+[적용 대상] 2절 결합, '~하고 있다' 종결.
//   조직 방식 풀 8종: 사례 열거·대조·범주화·시기별 전개·문답·예상 반론-재반박·
//   비유·통계 인용 (이 풀 밖의 방식 금지 — 풀 대조가 결정론 게이트).
//   오답 2원리: (a)방식 부재(초고에 없는 방식) (b)대상 불일치(방식은 실재하나
//   적용 대상 오귀속). 정답 evidence 는 초고 verbatim 이어야 한다.
// ============================================================================

import { z } from "zod";
import { koMc5Envelope, koStimulusBlockSchema } from "../registry/envelope-schema";
import {
  buildDefaultKoRenderModel,
  readKoStimulusBlocks,
  type KoRenderModel,
} from "../core/render-model";
import type {
  KoArea,
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeMeta,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// ⚠ 계약 갭 — 조립(레지스트리) 단계 해소 대상 캐스트
// ---------------------------------------------------------------------------
// KoTypeMeta.area / uiGroup 유니언에는 화법·작문·매체 축이 아직 없다(A4 토대는
// stimulus 인프라만 확장). 팬아웃 사양이 지정한 uiGroup "국어 화법·작문·매체" 와
// 작문 영역 값("WRITING")을 런타임에 그대로 싣기 위한 국소 캐스트다.
// type-module.ts 유니언이 확장되면 이 두 캐스트를 제거해도 그대로 컴파일된다.
const WR_AREA = "WRITING" as unknown as KoArea;
const WR_UI_GROUP = "국어 화법·작문·매체" as unknown as KoTypeMeta["uiGroup"];

// ---------------------------------------------------------------------------
// 조직 방식 풀 (카탈로그 내장 풀 — 이 8종 밖의 방식 선언 금지)
// ---------------------------------------------------------------------------
// optionKeywords: 선지가 해당 방식을 명명할 때 반드시 포함해야 하는 표준 개념어
// 표면형(풀 대조 결정론 게이트). 프롬프트가 같은 어휘 사용을 강제하므로
// 게이트-프롬프트가 커플링되어 있다 — 한쪽만 고치지 말 것.

const KO_WR_METHOD_IDS = [
  "EXAMPLE_LISTING",
  "CONTRAST",
  "CATEGORIZATION",
  "CHRONOLOGICAL",
  "QUESTION_ANSWER",
  "REBUTTAL",
  "ANALOGY",
  "STATISTIC_CITATION",
] as const;
type KoWrMethodId = (typeof KO_WR_METHOD_IDS)[number];

const KO_WR_METHOD_POOL: Record<
  KoWrMethodId,
  { name: string; optionKeywords: string[] }
> = {
  EXAMPLE_LISTING: { name: "사례 열거", optionKeywords: ["사례", "예를 들", "예시", "열거"] },
  CONTRAST: { name: "대조", optionKeywords: ["대조", "차이"] },
  CATEGORIZATION: {
    name: "범주화",
    optionKeywords: ["범주", "분류", "유형별", "종류별", "나누어"],
  },
  CHRONOLOGICAL: {
    name: "시기별 전개",
    optionKeywords: ["시기", "시간의 흐름", "변천", "단계"],
  },
  QUESTION_ANSWER: { name: "문답", optionKeywords: ["묻고 답", "질문", "물음", "문답"] },
  REBUTTAL: { name: "예상 반론-재반박", optionKeywords: ["반론", "반박"] },
  ANALOGY: { name: "비유", optionKeywords: ["비유", "빗대", "유추", "견주"] },
  STATISTIC_CITATION: {
    name: "통계 인용",
    optionKeywords: ["통계", "수치", "조사 결과", "설문"],
  },
};

const methodEnum = z.enum(KO_WR_METHOD_IDS);
const OPTION_LABELS = ["①", "②", "③", "④", "⑤"] as const;

const schema = koMc5Envelope({
  koStimulus: z
    .array(koStimulusBlockSchema)
    .min(1)
    .describe(
      "학생 초고 — kind='DRAFT' 블록 정확히 1개. title=초고 제목(선택), lines=문단 단위 행 3~5개('처음-중간-끝' 학생 글 관행). 이 유형의 판정 표면은 지문이 아니라 이 초고다",
    ),
  stemPolarity: z
    .enum(["POSITIVE", "NEGATIVE"])
    .describe(
      "발문 극성 — POSITIVE(기본·수능 관행): '글쓰기 방식으로 가장 적절한 것은?', NEGATIVE(내신 변형): '적절하지 않은 것은?'",
    ),
  usedMethods: z
    .array(methodEnum)
    .min(1)
    .describe(
      "초고 문면에 실제로 실현된 조직 방식 전부(풀 8종 중) — 여기 선언한 방식은 초고에서 문면으로 확인 가능해야 하며, 선지 설계(optionDesigns)의 VALID/TARGET_MISMATCH 방식은 반드시 이 배열에 있어야 함",
    ),
  optionDesigns: z
    .array(
      z.object({
        label: z.enum(OPTION_LABELS).describe("대응 선지 라벨"),
        method: methodEnum.describe("이 선지가 명명한 조직 방식"),
        target: z
          .string()
          .min(1)
          .describe("이 선지가 방식의 적용 대상으로 주장하는 내용 요소(초고의 화제·주장·문제 등)"),
        status: z
          .enum(["VALID", "METHOD_ABSENT", "TARGET_MISMATCH"])
          .describe(
            "선지 판정 설계: VALID=방식·대상 모두 초고와 정합(적절), METHOD_ABSENT=초고에 없는 방식(오답원리 a), TARGET_MISMATCH=방식은 초고에 실재하나 적용 대상을 다른 내용 요소로 오귀속(오답원리 b)",
          ),
      }),
    )
    .length(5)
    .describe(
      "선지 5개 전부의 설계 명세(①~⑤ 각 1개) — POSITIVE 발문이면 VALID 정확히 1개(=정답), NEGATIVE 발문이면 VALID 정확히 4개(비정답 전부)",
    ),
});

const prompt = `### 유형: 작문 — 글쓰기 방식·내용 조직 (초고 자체자료형)

**자료(초고) 설계 — 이 유형의 판정 표면**:
1. koStimulus 에 kind="DRAFT" 블록을 **정확히 1개** 동봉하라. lines 는 문단 단위 행 3~5개
   ('처음: 화제 제시·문제 제기 → 중간: 전개 → 끝: 제언·당부'의 학생 초고 관행), title 은
   초고 제목(예: "교내 분리배출 실천을 늘리자") — 필요시.
2. 초고는 이 문항을 위해 **신규 집필된 학생 글**이어야 한다. 사용자 지문은 소재·화제
   참고로만 쓰고 지문 문장을 초고에 복사하지 마라. 문체는 고등학생 설득문·건의문·소개문 수준.
3. usedMethods 로 선언한 조직 방식은 초고 **문면에서 실제로 확인**되어야 한다:
   - 사례 열거: 구체 사례 2개 이상을 나란히 제시 ("실제로 ○○학교는 ~. △△구청도 ~.")
   - 대조: 두 대상·상황의 차이를 맞세움 ("~인 반면, ~는 ~다")
   - 범주화: 내용을 종류·유형으로 나누어 제시 ("~는 크게 두 가지로 나눌 수 있다")
   - 시기별 전개: 시간의 흐름·단계에 따라 전개 ("과거에는 ~였으나 최근에는 ~")
   - 문답: 스스로 물음을 던지고 답함 — 초고에 **물음표(?)가 있는 질문 문장** 필수
   - 예상 반론-재반박: 반대 견해를 가정하고 되받아침 ("~라는 반론이 있을 수 있다. 하지만 ~")
   - 비유: 대상을 다른 것에 빗대어 표현
   - 통계 인용: **수치가 드러난** 조사·통계 제시 ("설문 결과 73%가 ~")
4. 초고에는 정답 방식 외에도 usedMethods 의 방식이 자연스럽게 녹아 있어야 하며,
   선언하지 않은 방식이 문면에 뚜렷이 실현되어 있으면 안 된다(오답 시비 차단).

**발문 템플릿** (stemPolarity 에 따라 정확히 이 형태로):
- POSITIVE(기본): "윗글(초고)에 활용된 글쓰기 방식으로 가장 적절한 것은?"
- NEGATIVE(내신 변형): "윗글(초고)에 활용된 글쓰기 방식으로 적절하지 않은 것은?"
세트 결합 시에는 "윗글(초고)" 자리에 "(다)" 등 자료 라벨이 올 수 있으나, 단독 출제에서는
위 형태를 유지하라. '글쓰기 방식'(또는 '내용 조직') 표현은 발문에 반드시 포함한다.

**선지 = [방식]+[대상] 2절 결합 (전 선지 공통 — 하나라도 어기면 반려)**:
1. 1절(방식): 조직 방식을 **표준 개념어로 명명** — 반드시 아래 표면형을 쓰라
   (검증 게이트가 이 어휘로 풀 대조를 수행한다):
   사례 열거→'사례를 열거하여/예를 들어', 대조→'~와 대조하여/차이를 밝히며',
   범주화→'~를 유형별로 나누어/분류하여', 시기별→'시간의 흐름에 따라/시기별로',
   문답→'묻고 답하는 방식으로/물음을 던지고', 반론-재반박→'예상되는 반론을 제시하고 반박하며',
   비유→'~에 빗대어/비유하여', 통계→'통계 수치를 인용하여/설문 조사 결과를 제시하여'.
2. 2절(대상): 그 방식이 적용된 초고의 내용 요소를 명시 — "~의 심각성을/~의 필요성을/
   ~라는 주장을" 등. optionDesigns[].target 과 일치시킬 것.
3. 종결: 반드시 '~하고 있다'(드러내고 있다/강조하고 있다/뒷받침하고 있다 등).
   예: "묻고 답하는 방식으로 분리배출 실천이 저조한 원인을 드러내고 있다."
4. 5개 선지의 방식은 서로 달라야 한다(같은 방식 2회 금지) — 풀 8종에서 5종을 골라 배치.

**오답 설계 2원리 (optionDesigns[].status — 정확히 이 두 가지만)**:
- METHOD_ABSENT(방식 부재): 초고에 실현되지 않은 방식을 명명한다. 이때 method 는
  usedMethods 에 **없어야** 한다. 대상(2절)은 초고에 실재하는 내용 요소로 그럴듯하게 —
  대상까지 가짜면 읽지 않고도 배제되어 함정이 죽는다.
- TARGET_MISMATCH(대상 불일치): 방식은 초고에 실재한다(usedMethods 에 있어야 함).
  그러나 그 방식이 실제로 적용된 대상이 아닌 **다른 내용 요소**에 오귀속한다.
  (예: 통계는 '실천율 저조'를 보이는 데 쓰였는데 선지는 "통계 수치를 인용하여 제도
  개선의 성과를 강조하고 있다"로 서술) — 이 유형의 킬러 함정.
- 왜곡은 선지당 **정확히 한 지점**이다. 방식도 틀리고 대상도 틀린 이중 왜곡 금지.

**정답 선지 (POSITIVE 기준 — status=VALID)**:
- 초고에 가장 뚜렷하게 실현된 방식 + 그 방식이 실제 적용된 대상의 정확한 결합.
- NEGATIVE 발문이면 반대로: VALID 4개(전부 방식·대상 정합) + 왜곡 1개(=정답).

**근거앵커(evidence) 작성 — 전부 초고에서 복사 (⚠ 전 관계 공통, 시스템이 기계 차단)**:
- **모든 evidence 의 spanText 는 네가 koStimulus 에 쓴 초고 lines 에서 복사-붙여넣기**
  해야 한다 — SUPPORTS 만이 아니라 NOT_MENTIONED/DISTORTS 근거도 마찬가지다.
  참고 지문의 문장(또는 기억 속 원문)을 인용하면 초고에 없는 스팬이라 전량 반려된다.
  초고를 먼저 확정하고, 근거는 그 초고 행에서 눈으로 찾아 그대로 옮겨 적어라.
- 오답 해설(wrongOptionExplanations)의 작은따옴표 직접 인용도 **초고 문장만** —
  참고 지문 문장을 인용하면 학생 화면(초고)에서 그 문장을 찾을 수 없다(반려 대상).
- VALID 선지: relation=SUPPORTS + **초고에서 그대로 복사한** 방식 실현 구절(verbatim —
  지문이 아니라 초고다. 한 글자도 바꾸지 마라).
- METHOD_ABSENT 선지: relation=NOT_MENTIONED + 가장 가까운 관련 **초고** 구절.
- TARGET_MISMATCH 선지: relation=DISTORTS + 그 방식이 **실제로 적용된** 초고 구절
  (오귀속을 판정하는 기준 구절).

**금지**:
- 풀 8종 밖의 방식 명명("인용", "정의", "묘사" 등 — 풀에 없으면 선지로 쓰지 마라).
- 초고 없이 사용자 지문을 판정 표면으로 삼는 구성(이 유형의 자기부정).
- 두 선지가 같은 이유로 틀리는 구성, 상식만으로 배제되는 황당 오답.
- 선지에 초고 문장 통복사(선지는 방식·대상의 메타 서술이지 초고 발췌가 아니다).`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  if (settings.stemPolarity === "NEGATIVE") {
    lines.push(
      "- stemPolarity=NEGATIVE 로 출제하라: 발문 '윗글(초고)에 활용된 글쓰기 방식으로 적절하지 않은 것은?', 선지는 VALID 4개 + 왜곡 1개(=정답). usedMethods 에 4개 이상 방식을 선언하고 초고에 전부 실현하라.",
    );
  } else {
    lines.push(
      "- stemPolarity=POSITIVE 로 출제하라 (가장 적절한 것은?): VALID 정확히 1개(=정답) + 오답 4개.",
    );
  }
  const answerMethod = typeof settings.answerMethod === "string" ? settings.answerMethod : "AUTO";
  if (answerMethod !== "AUTO" && (KO_WR_METHOD_IDS as readonly string[]).includes(answerMethod)) {
    const m = KO_WR_METHOD_POOL[answerMethod as KoWrMethodId];
    lines.push(
      `- 정답 방식 축: '${m.name}' — 초고에 이 방식을 가장 뚜렷하게 실현하고 정답 선지가 이 방식을 명명하게 하라 (NEGATIVE 발문이면 이 방식은 VALID 선지 중 하나로).`,
    );
  } else {
    lines.push("- 정답 방식 축은 초고 소재에 맞게 풀 8종에서 자동 선택하라.");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 초고 소재는 교과서·학교생활 관행(교내 캠페인·지역사회 건의문·동아리 소개문)으로, 선지의 방식 명명은 수업 개념어(내용 조직 방법·전개 방식)와 결합하라. TARGET_MISMATCH 함정은 같은 문단 안의 인접 내용 요소로 미세하게.",
    );
  } else {
    lines.push(
      "- 수능 모드: 초고는 사회적 쟁점·정보 전달 소재의 완결된 학생 글로, 오답은 초고 훑기만으로 배제되지 않게 대상 진술을 초고 실재 요소로 구성하라.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 헬퍼
// ---------------------------------------------------------------------------

interface OptionDesign {
  label: string;
  method: KoWrMethodId | "";
  target: string;
  status: "VALID" | "METHOD_ABSENT" | "TARGET_MISMATCH" | "";
}

function readOptionDesigns(question: Record<string, unknown>): OptionDesign[] {
  if (!Array.isArray(question.optionDesigns)) return [];
  const out: OptionDesign[] = [];
  for (const raw of question.optionDesigns) {
    if (!raw || typeof raw !== "object") continue;
    const d = raw as Record<string, unknown>;
    const method = typeof d.method === "string" ? d.method : "";
    const status = typeof d.status === "string" ? d.status : "";
    out.push({
      label: typeof d.label === "string" ? d.label : "",
      method: (KO_WR_METHOD_IDS as readonly string[]).includes(method)
        ? (method as KoWrMethodId)
        : "",
      target: typeof d.target === "string" ? d.target : "",
      status:
        status === "VALID" || status === "METHOD_ABSENT" || status === "TARGET_MISMATCH"
          ? status
          : "",
    });
  }
  return out;
}

function readUsedMethods(question: Record<string, unknown>): Set<KoWrMethodId> {
  const out = new Set<KoWrMethodId>();
  if (!Array.isArray(question.usedMethods)) return out;
  for (const m of question.usedMethods) {
    if (typeof m === "string" && (KO_WR_METHOD_IDS as readonly string[]).includes(m)) {
      out.add(m as KoWrMethodId);
    }
  }
  return out;
}

/** 초고(자료) 전 블록을 검증용 평문 하나로 접는다 (title 행 + 본문 행). */
function draftPlainText(question: Record<string, unknown>): string {
  return readKoStimulusBlocks(question.koStimulus)
    .map((b) => [b.title ?? "", ...b.lines].filter(Boolean).join("\n"))
    .join("\n");
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const stemPolarity = question.stemPolarity === "NEGATIVE" ? "NEGATIVE" : "POSITIVE";
  const negativeStem = ctx.koText.isNegativeStemKo(direction);
  const draft = draftPlainText(question);
  const designs = readOptionDesigns(question);
  const usedMethods = readUsedMethods(question);

  // ── ① 발문: 극성 선언 정합 + '글쓰기 방식' 프레임 지시 ─────────────────
  if (direction) {
    if (stemPolarity === "POSITIVE" && negativeStem) {
      add("error", "ko-direction-grammar", "stemPolarity=POSITIVE 인데 발문이 부정발문입니다");
    }
    if (stemPolarity === "NEGATIVE" && !negativeStem) {
      add("error", "ko-direction-grammar", "stemPolarity=NEGATIVE 인데 발문이 부정발문이 아닙니다");
    }
    if (!/(글쓰기\s*방식|쓰기\s*방식|내용\s*조직|조직\s*방식|글쓰기\s*전략)/.test(direction)) {
      add(
        "error",
        "ko-direction-grammar",
        `발문이 '글쓰기 방식'(또는 '내용 조직')을 지시하지 않습니다: "${direction.slice(0, 40)}"`,
      );
    }
  }

  // ── ② 선지 설계 명세: ①~⑤ 전수 + 극성별 VALID 개수 + 정답 대응 ────────
  const designOf = new Map<string, OptionDesign>();
  for (const d of designs) {
    if (d.label) designOf.set(d.label, d);
  }
  const missingLabels = OPTION_LABELS.filter((l) => !designOf.has(l));
  if (missingLabels.length > 0) {
    add(
      "error",
      "ko-correct-answer-invalid",
      `optionDesigns 가 선지 전수를 커버하지 않습니다 — 누락: ${missingLabels.join(" ")}`,
    );
  } else {
    const validCount = designs.filter((d) => d.status === "VALID").length;
    const expectedValid = stemPolarity === "POSITIVE" ? 1 : 4;
    if (validCount !== expectedValid) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${stemPolarity} 발문은 VALID 선지가 정확히 ${expectedValid}개여야 합니다 (현재 ${validCount}개) — 정답 유일성 훼손`,
      );
    }
    const answerDesign = designOf.get(correctAnswer);
    if (answerDesign) {
      const answerShouldBeValid = stemPolarity === "POSITIVE";
      if (answerShouldBeValid && answerDesign.status !== "VALID") {
        add(
          "error",
          "ko-correct-answer-invalid",
          `긍정발문의 정답 ${correctAnswer} 선지 status 가 VALID 가 아닙니다 (${answerDesign.status || "미선언"})`,
        );
      }
      if (!answerShouldBeValid && answerDesign.status === "VALID") {
        add(
          "error",
          "ko-correct-answer-invalid",
          `부정발문의 정답 ${correctAnswer} 선지가 VALID(적절) 설계입니다 — 정답은 왜곡 선지여야 합니다`,
        );
      }
    }
  }

  // ── ③ 풀 대조 (결정론): status ↔ usedMethods + 방식 개념어 ↔ 선지 문면 ──
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  const optionTextOf = new Map<string, string>();
  for (const o of options) {
    if (typeof o.label === "string" && typeof o.text === "string") {
      optionTextOf.set(o.label, o.text);
    }
  }
  const seenMethods = new Map<KoWrMethodId, string[]>();
  for (const d of designs) {
    if (!d.label || !d.method || !d.status) continue;
    const labels = seenMethods.get(d.method) ?? [];
    labels.push(d.label);
    seenMethods.set(d.method, labels);
    // status ↔ usedMethods 상호 모순 (오답원리의 기계 검증 — 복수정답 차단)
    if (d.status === "METHOD_ABSENT" && usedMethods.has(d.method)) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${d.label} 선지는 METHOD_ABSENT(방식 부재) 설계인데 방식 ${KO_WR_METHOD_POOL[d.method].name}(${d.method})이 usedMethods 에 선언되어 있습니다 — 이 선지가 참이 되어 복수정답 위험`,
      );
    }
    if ((d.status === "VALID" || d.status === "TARGET_MISMATCH") && !usedMethods.has(d.method)) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${d.label} 선지(${d.status})의 방식 ${KO_WR_METHOD_POOL[d.method].name}(${d.method})이 usedMethods 에 없습니다 — ${d.status === "VALID" ? "정합 선지의 방식은 초고에 실현되어야" : "대상 불일치 함정은 방식이 초고에 실재해야"} 합니다`,
      );
    }
    // 선지 문면이 선언 방식의 표준 개념어를 포함하는가 (풀 대조)
    const text = optionTextOf.get(d.label) ?? "";
    if (text && !KO_WR_METHOD_POOL[d.method].optionKeywords.some((k) => text.includes(k))) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${d.label} 선지 문면에 선언 방식 '${KO_WR_METHOD_POOL[d.method].name}'의 표준 개념어(${KO_WR_METHOD_POOL[d.method].optionKeywords.join("/")})가 없습니다 — 설계-문면 불일치로 정오 판정 불가`,
      );
    }
  }
  for (const [method, labels] of seenMethods) {
    if (labels.length > 1) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `선지 ${labels.join(" ")} 가 같은 방식(${KO_WR_METHOD_POOL[method].name})을 중복 명명합니다 — 5개 선지의 방식은 서로 달라야 합니다`,
      );
    }
  }

  // ── ④ 초고 문면 신호 (결정론 가능한 방식만): 문답=?·통계=수치 ──────────
  if (draft) {
    if (usedMethods.has("QUESTION_ANSWER") && !draft.includes("?")) {
      add(
        "error",
        "ko-correct-answer-invalid",
        "usedMethods 에 문답(QUESTION_ANSWER)이 선언됐는데 초고에 물음표(?) 질문 문장이 없습니다 — 방식 미실현",
      );
    }
    if (usedMethods.has("STATISTIC_CITATION") && !/\d/.test(draft)) {
      add(
        "error",
        "ko-correct-answer-invalid",
        "usedMethods 에 통계 인용(STATISTIC_CITATION)이 선언됐는데 초고에 수치(숫자)가 없습니다 — 방식 미실현",
      );
    }
  }

  // ── ⑤ 근거앵커: 극성-relation 정합 + VALID 계열 SUPPORTS 는 초고 verbatim ─
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
    const design = designOf.get(label);
    if (!design || !design.status) continue;
    const shouldBeValid = design.status === "VALID";
    if (shouldBeValid && !relations.has("SUPPORTS")) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 방식·대상 정합(VALID) 설계인데 SUPPORTS 근거가 없습니다`,
      );
    }
    if (!shouldBeValid && ![...relations].some((r) => distortRelations.has(r))) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 왜곡(${design.status}) 설계인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다`,
      );
    }
  }
  // 판정 표면은 초고다 — 근거 스팬이 사용자 지문에만 있고 초고에 없으면
  // 공통 게이트(지문∪보기∪자료 합집합 검사)를 통과해도 여기서 차단한다.
  // [W2] SUPPORTS 만 검사하던 종전 게이트가 NOT_MENTIONED/DISTORTS(오답 근거)를
  // `continue` 로 건너뛰어, 지문 픽스처에서 통복사한 근거환각이 그대로 저장됐다
  // (판정단 critical — 화면의 초고 안에서 근거 문장을 찾을 수 없는 구조 결함).
  // 이 유형의 **모든** evidence 는 초고 verbatim 이어야 한다(NOT_MENTIONED 의
  // spanText 도 '가장 가까운 초고 구절'이 스펙이다).
  for (const e of evidence) {
    const relation = typeof e.relation === "string" ? e.relation : "";
    const span = typeof e.spanText === "string" ? e.spanText : "";
    if (!span) continue;
    if (!draft || !ctx.koText.containsSpanKo(draft, span)) {
      add(
        "error",
        "ko-evidence-not-in-passage",
        `${relation || "(관계 미상)"} 근거 스팬이 초고(자료)에 없습니다(verbatim 위반) — 이 유형의 근거 표면은 지문이 아니라 초고이며, NOT_MENTIONED/DISTORTS 근거도 초고에서 복사해야 합니다: "${span.slice(0, 40)}"`,
      );
    }
  }

  // ── ⑥ 오답 해설의 직접 인용도 초고 표면이어야 한다 — 지문 통복사 누출 차단.
  //    작은따옴표 인용이 초고에는 없는데 사용자 지문에는 verbatim 실재하면
  //    지문 문장을 초고 인용인 양 끌어온 명백한 누출(길이 8자 이상만 판정,
  //    선지 문면·발문 인용 재사용은 허용 — 오탐 억제).
  const wrongExplanations = Array.isArray(question.wrongOptionExplanations)
    ? (question.wrongOptionExplanations as Record<string, unknown>[])
    : [];
  const optionTexts = options
    .map((o) => (typeof o.text === "string" ? o.text : ""))
    .join("\n");
  for (const w of wrongExplanations) {
    const label = typeof w.label === "string" ? w.label : "";
    const explanationText = typeof w.explanation === "string" ? w.explanation : "";
    if (!explanationText) continue;
    for (const quoted of ctx.koText.extractQuotedSpansKo(explanationText)) {
      if (quoted.length < 8) continue;
      if (draft && ctx.koText.containsSpanKo(draft, quoted)) continue;
      if (optionTexts && ctx.koText.containsSpanKo(optionTexts, quoted)) continue;
      if (ctx.passage && ctx.koText.containsSpanKo(ctx.passage, quoted)) {
        add(
          "error",
          "ko-evidence-not-in-passage",
          `${label || "오답"} 해설의 인용('${quoted.slice(0, 30)}…')이 초고에는 없고 참고 지문에만 있습니다 — 해설 인용은 초고 문장에서만 복사하세요`,
        );
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// module
// ---------------------------------------------------------------------------

export const KO_WR_METHOD: KoTypeModule = {
  meta: {
    typeId: "KO_WR_METHOD",
    area: WR_AREA,
    label: "글쓰기 방식·내용 조직",
    formatCategory: "객관식",
    uiGroup: WR_UI_GROUP,
    answerFormat: "MC5",
    includesPassage: false,
    passageKinds: [
      "READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED",
    ],
    defaultPoints: 2,
    usesBogi: "none",
    usesStimulus: "required",
    stimulusKinds: ["DRAFT"],
    markerFamilies: [],
    optionEnding: "strategy",
    needsSolverGate: false,
    description:
      "자체 생성한 학생 초고(DRAFT)에 실현된 조직 방식을 [방식]+[대상] 결합 선지로 판정 — 방식 풀 8종 대조·정답 근거 초고 verbatim 을 결정론 검증하는 작문 표준 유형",
    setSlot: "작문 세트(43~45번대) 앞쪽 슬롯 — 초고 공유 세트의 도입 문항",
    studentTask:
      "학생 초고를 읽고, 초고에 실제로 활용된 글쓰기 방식과 그 적용 대상이 바르게 결합된 선지(또는 왜곡된 선지)를 고릅니다.",
    bestFor: [
      "사회적 쟁점·캠페인 소재의 설득문·건의문 초고",
      "내신 작문 단원(내용 조직·전개 방식 개념어) 확인",
      "화작 선택자 작문 세트 도입 훈련",
    ],
    outputUi: ["학생 초고 자료 박스(문단 행 보존)", "5지선다([방식]+[대상] 결합형)", "선지별 초고 근거 해설"],
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
          { value: "POSITIVE", label: "긍정발문(가장 적절한 것 — 수능 관행)" },
          { value: "NEGATIVE", label: "부정발문(적절하지 않은 것 — 내신 변형)" },
        ],
        defaultValue: "POSITIVE",
        description: "부정발문은 초고에 방식 4개 이상을 실현해야 해 초고 밀도가 올라갑니다",
      },
      {
        key: "answerMethod",
        label: "정답 방식 축",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(초고 소재에 맞게)" },
          ...KO_WR_METHOD_IDS.map((id) => ({ value: id, label: KO_WR_METHOD_POOL[id].name })),
        ],
        defaultValue: "AUTO",
        description: "초고에 가장 뚜렷하게 실현하고 정답 선지가 명명할 조직 방식",
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
      includesPassage: false, // 판정 표면은 초고(stimulus) — 지문 미동봉
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "정답 방식은 표면 신호가 뚜렷한 것(문답·통계 인용·사례 열거)으로, 오답은 METHOD_ABSENT 위주 — 초고를 한 번 훑는 것만으로 방식 유무가 판정되게 하라.",
    INTERMEDIATE:
      "오답에 TARGET_MISMATCH 를 2개 이상 배치해 방식 유무 확인만으로는 풀리지 않게 하라. 정답 방식은 대조·범주화처럼 두 문단 이상을 종합해야 확인되는 것으로.",
    KILLER:
      "초고에 방식을 3개 이상 실현하고 오답 4개를 전부(또는 3개 이상) TARGET_MISMATCH 로 — 모든 선지의 방식이 초고에 실재해 대상 진술까지 문단별 대조를 강제하라. 대상 오귀속은 같은 문단의 인접 내용 요소로 한 끗 차이로. 내신이면 NEGATIVE 전환을 함께 고려하라.",
  },
};
