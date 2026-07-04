// ============================================================================
// KO_SP_FUNC — 화법: 대화·대담 발화 기능 (㉠~㉤, stimulus DIALOGUE)
// ============================================================================
// 카탈로그 §2.3 KO_SP_FUNC 사양의 전면 구현. 자체자료(koStimulus) 위에 마커를
// 거는 첫 화법 유형 — 마커 1:1 대응 규율은 KO_LIT_PHRASE 를 미러한다.
//
// 실측 근거:
//   발문: "대화의 흐름을 고려할 때, ㉠~㉤에 대한 설명으로 적절하지 않은 것은?"
//   담화: 융합 세트 (가) 대화·대담·면접 — 확인분 9회 전부 대화·대담·면접
//   메커니즘: 밑줄 발화의 담화 기능(종합/재진술/화제 전환/동의/의문 제기 등) 판정
//   오답 원리: 인접 기능으로 바꿔치기 (재진술↔요약, 동의 표명↔종합 등)
//   세트 역할: 융합 세트(38~42) 앞쪽, 2점
//
// 결정론 장치(이 파일의 검증 축 3개):
//   1) 마커 5개 = 전부 KOR_CIRCLED + targetSurface="stimulus" + ㉠~㉤ 등장 순서
//      (stimulus 표면 해소 자체는 공통 게이트 checkKoMarkersOnSurface 가 수행)
//   2) 선지-마커 1:1 순서 대응 (①=㉠ … ⑤=㉤ — KO_LIT_PHRASE 미러)
//   3) 기능 풀 대조: 발화별 실제 기능(utteranceFunctions)·정답 선지의 주장 기능
//      (answerClaimedFunctionId)을 닫힌 풀에서 선언받아 선지 문면과 기계 대조
// ============================================================================

import { z } from "zod";
import {
  koMarkerSchema,
  koMc5Envelope,
  koStimulusBlockSchema,
} from "../registry/envelope-schema";
import {
  buildDefaultKoRenderModel,
  readKoStimulusBlocks,
  type KoRenderModel,
} from "../core/render-model";
import { KOR_CIRCLED_LABELS, OPTION_LABELS } from "../core/markers";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeMeta,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// [KO-SP-SPECGAP] 화법 영역 축이 계약(type-module.ts — 비소유 파일)에 아직 없다:
//   - KoTypeMeta.area 에 화법 멤버("SPEECH") 미등록
//   - KoTypeMeta.uiGroup 에 "국어 화법·작문·매체" 미등록
// 레지스트리 조립 단계가 두 union 을 확장하면 아래 광역 단언은 자연 무해화된다.
// (string 경유 단언 — union 확장 전에도 tsc 를 통과시키는 팬아웃 규약)
// ---------------------------------------------------------------------------
const KO_SP_AREA: string = "SPEECH";
const KO_SP_UI_GROUP: string = "국어 화법·작문·매체";

// ---------------------------------------------------------------------------
// 담화 기능 풀 (닫힌 집합 — 카탈로그 §2.3: 종합/재진술/화제 전환/동의/의문 제기
// + 팬아웃 사양의 사례 요청/요약). 선지 문면 대조용 표준 표기·검출 키워드 내장.
// ---------------------------------------------------------------------------

interface KoSpDiscourseFunction {
  id: string;
  label: string;
  /** 선지에 그대로 들어가야 하는 표준 서술구 (프롬프트가 verbatim 사용을 강제). */
  canonical: string;
  /** 문면 검출 키워드 — 하나라도 포함되면 해당 기능 진술로 인정. */
  keywords: string[];
  /** 왜곡 선지 제작 시 우선 바꿔치기할 인접(혼동) 기능 id. */
  adjacent: string[];
}

const KO_SP_FUNCTION_POOL: KoSpDiscourseFunction[] = [
  {
    id: "SYNTHESIZE",
    label: "종합",
    canonical: "앞선 발화들의 내용을 종합하고 있다",
    keywords: ["종합"],
    adjacent: ["SUMMARIZE", "RESTATE"],
  },
  {
    id: "RESTATE",
    label: "재진술",
    canonical: "상대의 발화를 자신의 말로 바꾸어 재진술하고 있다",
    keywords: ["재진술", "바꾸어 말하", "바꾸어 진술", "다시 말하", "자신의 말로"],
    adjacent: ["SUMMARIZE", "AGREE"],
  },
  {
    id: "TOPIC_SHIFT",
    label: "화제 전환",
    canonical: "새로운 내용으로 화제를 전환하고 있다",
    keywords: ["화제를 전환", "화제 전환", "새로운 화제", "화제를 돌리", "다른 화제"],
    adjacent: ["SYNTHESIZE", "RAISE_QUESTION"],
  },
  {
    id: "AGREE",
    label: "동의 표명",
    canonical: "상대의 의견에 동의를 표명하고 있다",
    keywords: ["동의", "동조"],
    adjacent: ["RESTATE", "SYNTHESIZE"],
  },
  {
    id: "RAISE_QUESTION",
    label: "의문 제기",
    canonical: "상대의 설명에 의문을 제기하고 있다",
    keywords: ["의문", "반문", "문제를 제기"],
    adjacent: ["REQUEST_EXAMPLE", "TOPIC_SHIFT"],
  },
  {
    id: "REQUEST_EXAMPLE",
    label: "사례 요청",
    canonical: "구체적인 사례를 요청하고 있다",
    keywords: ["사례", "예를 요청", "예시를 요청", "예를 들어 달라"],
    adjacent: ["RAISE_QUESTION"],
  },
  {
    id: "SUMMARIZE",
    label: "요약",
    canonical: "앞선 발화의 내용을 요약하고 있다",
    keywords: ["요약", "간추리"],
    adjacent: ["RESTATE", "SYNTHESIZE"],
  },
];

const KO_SP_FUNCTION_IDS = KO_SP_FUNCTION_POOL.map((f) => f.id) as [string, ...string[]];
const KO_SP_FUNCTION_BY_ID = new Map(KO_SP_FUNCTION_POOL.map((f) => [f.id, f]));

const MARKER_LABELS_5 = ["㉠", "㉡", "㉢", "㉣", "㉤"] as const;

const functionEnum = z.enum(KO_SP_FUNCTION_IDS);

// ---------------------------------------------------------------------------
// 스키마 — koStimulus(DIALOGUE)·마커 5개·발화 기능 선언을 필수 강제
// ---------------------------------------------------------------------------

const schema = koMc5Envelope({
  koStimulus: z
    .array(koStimulusBlockSchema)
    .min(1)
    .describe(
      "필수 — kind=DIALOGUE 대화·대담 자료 1개. lines 는 '사회자: …'/'학생 1: …'/'전문가: …' 화자 라벨 행 단위(발화 1개 = 행 1개), 화자 최소 2인·발화 10~14개",
    ),
  markers: z
    .array(koMarkerSchema)
    .length(5)
    .describe(
      "발화 마킹 5개 — 전부 family=KOR_CIRCLED(㉠~㉤), targetSurface='stimulus'. spanText 는 자료의 한 발화 행에서 화자 라벨을 제외한 발화 문장(또는 연속 구절)을 verbatim 복사 — 행 경계를 넘지 말 것. 담화 등장 순서대로 ㉠→㉤",
    ),
  utteranceFunctions: z
    .array(
      z.object({
        label: z.enum(MARKER_LABELS_5).describe("마커 라벨 — markers 와 같은 순서(㉠→㉤)"),
        functionId: functionEnum.describe(
          "이 발화가 실제로 수행하는 담화 기능 — SYNTHESIZE=종합, RESTATE=재진술, TOPIC_SHIFT=화제 전환, AGREE=동의 표명, RAISE_QUESTION=의문 제기, REQUEST_EXAMPLE=사례 요청, SUMMARIZE=요약",
        ),
        speaker: z.string().describe("해당 발화의 화자 라벨 (자료의 행 머리와 동일 표기 — 예: '사회자', '학생 1')"),
        rationale: z
          .string()
          .describe("이 발화가 해당 기능을 수행한다고 판정한 담화 맥락 근거 1문장 (한국어)"),
      }),
    )
    .length(5)
    .describe("㉠~㉤ 발화별 실제 담화 기능 선언 — 검증 게이트가 선지 문면과 기계 대조한다"),
  answerClaimedFunctionId: functionEnum.describe(
    "정답(왜곡) 선지가 주장하는 '잘못된' 기능 — 해당 발화의 실제 기능과 반드시 다르고, 혼동되기 쉬운 인접 기능(재진술↔요약, 동의 표명↔종합, 의문 제기↔사례 요청)이어야 한다",
  ),
});

// ---------------------------------------------------------------------------
// 프롬프트 — 담화 자체 생성 + 마킹 + 기능 판정 선지의 출제 매뉴얼
// ---------------------------------------------------------------------------

const functionTableForPrompt = KO_SP_FUNCTION_POOL.map(
  (f) => `   - ${f.id}(${f.label}): 선지 표준구 "…${f.canonical}"`,
).join("\n");

const prompt = `### 유형: 화법 — 대화·대담 발화 기능 판정 (㉠~㉤)

**이 유형은 지문을 문항에 동봉하지 않는다.** 제공된 지문은 **화제(소재) 참고용**일 뿐이다 —
지문의 소재·정보를 대화의 내용 재료로 삼되, 지문 문장을 그대로 복사해 넣지 마라.
문항의 몸통은 네가 새로 쓰는 **대화·대담 자료(koStimulus, kind=DIALOGUE)** 다.

**발문 템플릿** (정확히 이 형태로):
- 대화: "대화의 흐름을 고려할 때, ㉠~㉤에 대한 설명으로 적절하지 않은 것은?"
- 대담: "위 대담의 흐름을 고려할 때, ㉠~㉤에 대한 설명으로 적절하지 않은 것은?"

**대화 자료 설계 (koStimulus — kind="DIALOGUE" 1블록)**:
1. 화자 구성 관행: 대담이면 '사회자 + 전문가 (+ 학생)', 학생 대화면 '학생 1/학생 2/학생 3',
   면접이면 '면접자/지원자'. 화자는 최소 2인, 3인 권장.
2. 행 규약: **발화 1개 = lines 원소 1개**, 반드시 "화자: 발화 내용" 형태로 시작하라.
   준언어 지시가 필요하면 "(자료를 가리키며)" 괄호 지시문을 발화 안에 넣는다.
3. 분량: 발화 10~14개. 흐름은 [화제 도입(사회자·질문) → 정보 교환(설명·응답) →
   의문 제기·사례 요청(청자 반응) → 종합·마무리]의 실제 담화 궤적을 따르라.
4. 발화들은 서로 유기적으로 물려야 한다 — 마커 발화의 기능은 **앞뒤 발화와의 관계**에서만
   판정 가능해야 한다(발화 단독으로 기능이 읽히면 담화 문항이 아니다).

**마커(㉠~㉤) 규칙**:
1. 기능이 뚜렷한 발화 5개를 골라 마킹하라 — 담화의 앞·중간·뒤에 분산(연속 발화 3개 이상 몰림 금지).
2. family="KOR_CIRCLED", **targetSurface="stimulus"** (지문이 아니라 자료를 마킹한다).
3. spanText 는 해당 발화 행에서 **화자 라벨("학생 1:" 등)을 제외한** 발화 문장 전체 또는
   연속 구절을 자료 원문 그대로(verbatim) 복사하라 — 행(발화) 경계를 절대 넘지 마라.
4. 담화 등장 순서대로 ㉠→㉤ 라벨을 부여하라.

**담화 기능 풀 (닫힌 집합 — 이 밖의 기능으로 출제 금지)**:
${functionTableForPrompt}
- utteranceFunctions 에 ㉠~㉤ 각 발화의 **실제 기능**을 위 id 로 선언하라 (markers 와 같은 순서).
- 5개 발화의 기능은 최소 3종 이상으로 다양화하라 (같은 기능 5개 금지).

**선지 구성 원리**:
1. 선지-마커 1:1 순서 대응: ①은 ㉠, ②는 ㉡ … 순서를 절대 바꾸지 마라.
2. 선지 형태: "㉠: '화자'가 [무엇에 대해] ~[기능 표준구]." — 위 풀의 **표준구를 그대로 포함**하고
   어미는 반드시 '~하고 있다'로 끝내라 (검증 게이트가 문면을 기계 대조한다).
3. 참 선지 4개: 해당 발화의 실제 기능(utteranceFunctions 선언)과 일치하는 진술.
   기능 표준구 앞의 [무엇에 대해] 부분도 담화 내용과 정확히 맞아야 한다.
4. 왜곡 선지 1개(=정답): **인접 기능 바꿔치기**로만 만들어라 —
   재진술↔요약, 동의 표명↔종합, 의문 제기↔사례 요청, 종합↔요약처럼 겉보기 비슷한 기능으로
   바꿔 적어라. 그 '잘못된' 기능을 answerClaimedFunctionId 에 선언하라(실제 기능과 달라야 함).
   정답 선지 문면에는 실제 기능의 용어(예: 실제가 '요약'이면 '요약')를 넣지 마라 — 왜곡이 흐려진다.
5. 화자·대상 표기: 선지에서 발화 주체를 언급하면 자료의 화자 라벨과 정확히 일치시켜라
   (발화 주체 혼동은 이 유형의 부차 함정이지만, 참 선지에서 실수로 틀리면 복수정답이 된다).

**근거앵커(evidence)**:
- 모든 선지(①~⑤)에 근거 1개 이상. spanText 는 **대화 자료의 행에서 verbatim 복사**
  (마커 발화 자체 또는 기능 판정의 근거가 되는 앞뒤 발화).
- 참 선지 = SUPPORTS, 왜곡 선지(정답) = DISTORTS.

**해설의 발화 순서 서술 주의 (위반 = 반려 — 시스템이 행 순서를 기계 대조한다)**:
- '앞서/이전에/먼저 ○○가 언급한 ~를 재진술' 같은 순서 주장을 쓰기 전에, 지칭한 발화가
  lines 배열에서 해당 마커 발화보다 **정말 앞 행**인지 반드시 확인하라. 마커 뒤에 나오는
  발화를 '앞서 언급한' 것으로 서술하는 순서 환각은 근거 전체의 신뢰를 무너뜨린다.
- '재진술' 기능 판정은 재진술할 **선행 발화가 마커보다 앞 행에 실재**해야 성립한다 —
  아직 등장하지 않은 개념·제도를 재진술했다고 쓰지 마라(시점상 근거 없음).

**금지**:
- 자료 없이 성립하는 일반 화법 지식 선지 ("대화에서는 경청이 중요하다" 류).
- 두 선지가 같은 이유로 틀리는 구성, 기능 풀 밖의 기능 어휘로 만든 선지.
- 지문 문장의 대화 복사 이식 (지문은 소재 참고만).`;

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const form = settings.discourseForm;
  if (form === "PANEL") {
    lines.push("- 담화 형태: **대담** — '사회자 + 전문가 (+ 학생)' 구성, 사회자가 화제 도입·전환·종합을 맡는 진행 구조로 설계하라. 발문은 대담 템플릿을 사용하라.");
  } else if (form === "STUDENTS") {
    lines.push("- 담화 형태: **학생 간 대화** — '학생 1/학생 2/학생 3' 구성, 과제·활동을 둘러싼 수평적 의견 교환으로 설계하라.");
  } else if (form === "INTERVIEW") {
    lines.push("- 담화 형태: **면접** — '면접자/지원자' 구성, 질문-응답-후속질문의 면접 담화로 설계하라. 발문은 \"위 면접의 흐름을 고려할 때, ㉠~㉤에 대한 설명으로 적절하지 않은 것은?\" 으로.");
  } else {
    lines.push("- 담화 형태: 소재(지문 화제)에 자연스러운 쪽으로 선택하라 — 정보·시사 화제면 대담(사회자+전문가), 학교 활동 화제면 학생 간 대화.");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 교과서 담화 단원의 개념어(협력의 원리·공손성 등)가 연상되는 정형 담화로 구성하되, 판정 자체는 담화 맥락으로만 가능하게 하라. 기능 표준구는 수능과 동일하게 유지.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 — 결정론 축 3개 (마커 규율 / 1:1 대응 / 기능 풀 대조) + 담화 형식
// ---------------------------------------------------------------------------

const SPEAKER_LINE_RE = /^\s*([^:：\n(]{1,12})\s*[:：]/;

interface UtteranceFunctionDecl {
  label: string;
  functionId: string;
  speaker: string;
}

function readUtteranceFunctions(v: unknown): UtteranceFunctionDecl[] {
  if (!Array.isArray(v)) return [];
  const out: UtteranceFunctionDecl[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const u = raw as Record<string, unknown>;
    out.push({
      label: typeof u.label === "string" ? u.label : "",
      functionId: typeof u.functionId === "string" ? u.functionId : "",
      speaker: typeof u.speaker === "string" ? u.speaker : "",
    });
  }
  return out;
}

function containsFunctionKeyword(text: string, functionId: string): boolean {
  const fn = KO_SP_FUNCTION_BY_ID.get(functionId);
  if (!fn) return false;
  return fn.keywords.some((k) => text.includes(k));
}

function functionLabelOf(functionId: string): string {
  return KO_SP_FUNCTION_BY_ID.get(functionId)?.label ?? functionId;
}

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
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const answerIdx = (OPTION_LABELS as readonly string[]).indexOf(correctAnswer);
  const utteranceFunctions = readUtteranceFunctions(question.utteranceFunctions);
  const claimedFunctionId =
    typeof question.answerClaimedFunctionId === "string" ? question.answerClaimedFunctionId : "";

  // ── 축 1: 마커 규율 — 개수·패밀리·표면·라벨 순서 ──────────────────────
  if (markers.length !== 5) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `마커가 ${markers.length}개 — 발화 마킹은 선지 1:1 대응을 위해 정확히 5개여야 합니다`,
    );
  }
  for (const m of markers) {
    const family = typeof m.family === "string" ? m.family : "";
    const label = typeof m.label === "string" ? m.label : "";
    if (family !== "KOR_CIRCLED") {
      add(
        "error",
        "ko-marker-option-mismatch",
        `마커 ${label || "(라벨 없음)"} 의 family 가 ${family || "(없음)"} — 발화 마킹은 KOR_CIRCLED(㉠~㉤)만 허용`,
      );
    }
    if (m.targetSurface !== "stimulus") {
      add(
        "error",
        "ko-marker-unresolved",
        `마커 ${label || "(라벨 없음)"} 의 targetSurface 가 "stimulus" 가 아닙니다 — 이 유형은 지문이 아니라 대화 자료를 마킹합니다`,
      );
    }
  }
  const markerLabels = markers.map((m) => (typeof m.label === "string" ? m.label : ""));
  const expectedSeq = KOR_CIRCLED_LABELS.slice(0, 5).join("");
  if (markers.length === 5 && markerLabels.join("") !== expectedSeq) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `마커 라벨이 ${expectedSeq} 순서가 아닙니다: ${markerLabels.join("")}`,
    );
  }

  // ── 축 2: 선지-마커 1:1 순서 대응 (①=㉠ — KO_LIT_PHRASE 미러) ─────────
  for (let i = 0; i < Math.min(options.length, 5); i++) {
    const text = typeof options[i].text === "string" ? (options[i].text as string) : "";
    const optionLabel = typeof options[i].label === "string" ? (options[i].label as string) : "";
    const markerLabel = MARKER_LABELS_5[i];
    if (text && !text.includes(markerLabel)) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `${optionLabel} 선지가 ${markerLabel} 를 지시하지 않습니다 — 선지-마커 1:1 순서 대응(①=㉠) 위반`,
      );
    }
  }

  // ── 축 3: 기능 풀 대조 ────────────────────────────────────────────────
  if (utteranceFunctions.length !== 5) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `utteranceFunctions 가 ${utteranceFunctions.length}개 — ㉠~㉤ 발화별 실제 기능 5개를 선언해야 합니다`,
    );
  } else {
    const ufLabels = utteranceFunctions.map((u) => u.label).join("");
    if (ufLabels !== expectedSeq) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `utteranceFunctions 라벨이 ㉠~㉤ 순서가 아닙니다: ${ufLabels}`,
      );
    }
    for (const u of utteranceFunctions) {
      if (!KO_SP_FUNCTION_BY_ID.has(u.functionId)) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${u.label} 의 기능 "${u.functionId}" 가 담화 기능 풀 밖입니다 (허용: ${KO_SP_FUNCTION_POOL.map((f) => f.id).join("/")})`,
        );
      }
    }
  }
  if (claimedFunctionId && !KO_SP_FUNCTION_BY_ID.has(claimedFunctionId)) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `answerClaimedFunctionId "${claimedFunctionId}" 가 담화 기능 풀 밖입니다`,
    );
  }

  if (utteranceFunctions.length === 5 && options.length === 5 && answerIdx >= 0) {
    const trueFnOfAnswer = utteranceFunctions[answerIdx]?.functionId ?? "";

    // 정답(왜곡) 선지의 주장 기능이 실제 기능과 같으면 — 왜곡이 성립하지 않아
    // 정답이 참 선지가 되는 단일정답성 붕괴 (결정론 차단).
    if (claimedFunctionId && trueFnOfAnswer && claimedFunctionId === trueFnOfAnswer) {
      add(
        "error",
        "ko-solver-mismatch",
        `정답 선지(${correctAnswer})의 주장 기능(${functionLabelOf(claimedFunctionId)})이 ${MARKER_LABELS_5[answerIdx]} 의 실제 기능과 동일합니다 — 왜곡 오답이 성립하지 않습니다`,
      );
    }

    for (let i = 0; i < 5; i++) {
      const text = typeof options[i].text === "string" ? (options[i].text as string) : "";
      if (!text) continue;
      const isAnswer = i === answerIdx;
      const declaredFn = isAnswer ? claimedFunctionId : utteranceFunctions[i].functionId;
      if (!declaredFn || !KO_SP_FUNCTION_BY_ID.has(declaredFn)) continue;
      // 선지 문면 ↔ 선언 기능 대조: 선지에 해당 기능의 검출 키워드가 있어야 한다.
      if (!containsFunctionKeyword(text, declaredFn)) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${OPTION_LABELS[i]} 선지 문면에서 선언 기능 '${functionLabelOf(declaredFn)}' 의 표현을 찾을 수 없습니다 — 기능 풀 표준구를 그대로 포함하세요: "${text.slice(0, 40)}"`,
        );
      }
      // 정답 선지에 실제 기능의 용어가 함께 들어가면 왜곡이 흐려진다(복수정답 위험).
      if (
        isAnswer &&
        trueFnOfAnswer &&
        trueFnOfAnswer !== declaredFn &&
        containsFunctionKeyword(text, trueFnOfAnswer)
      ) {
        add(
          "error",
          "ko-solver-mismatch",
          `정답 선지(${correctAnswer}) 문면에 실제 기능 '${functionLabelOf(trueFnOfAnswer)}' 의 표현이 함께 들어 있습니다 — 왜곡이 불명확해 복수정답 위험`,
        );
      }
    }
  }

  // ── 담화 자료 형식 (결손 자체는 공통 게이트 ko-stimulus-missing 이 차단) ──
  const blocks = readKoStimulusBlocks(question.koStimulus);
  if (blocks.length > 0) {
    const allLines = blocks.flatMap((b) => b.lines);
    const speakers = new Set<string>();
    let utteranceLineCount = 0;
    for (const line of allLines) {
      const m = SPEAKER_LINE_RE.exec(line);
      if (m) {
        speakers.add(m[1].trim());
        utteranceLineCount += 1;
      }
    }
    if (speakers.size < 2) {
      add(
        "warning",
        "ko-stimulus-kind",
        `대화 자료의 화자 라벨이 ${speakers.size}명 — '사회자:'/'학생 1:' 형식의 화자 최소 2인이 필요합니다`,
      );
    }
    if (utteranceLineCount < 6) {
      add(
        "warning",
        "ko-stimulus-kind",
        `화자 라벨 발화 행이 ${utteranceLineCount}개 — 담화 흐름 판정이 가능하려면 발화 10개 내외가 필요합니다`,
      );
    }
    // 선언된 화자가 자료에 실재하는지
    for (const u of utteranceFunctions) {
      if (u.speaker && speakers.size > 0 && !speakers.has(u.speaker.trim())) {
        add(
          "warning",
          "ko-stimulus-kind",
          `${u.label} 의 화자 "${u.speaker}" 가 자료의 화자 라벨(${[...speakers].join("/")})에 없습니다`,
        );
      }
    }
    // 마커가 발화(행) 경계를 넘는지 — 발화 단위 마킹 위반
    const stimText = blocks
      .map((b) => [b.title ?? "", ...b.lines].filter(Boolean).join("\n"))
      .join("\n");
    for (const m of markers) {
      const span = typeof m.spanText === "string" ? m.spanText : "";
      const label = typeof m.label === "string" ? m.label : "";
      if (!span) continue;
      const occurrenceIndex = typeof m.occurrenceIndex === "number" ? m.occurrenceIndex : 0;
      const match = ctx.koText.findSpanKo(stimText, span, occurrenceIndex);
      if (match && match.sourceText.includes("\n")) {
        add(
          "warning",
          "ko-marker-hierarchy",
          `마커 ${label} 의 스팬이 발화(행) 경계를 넘습니다 — 발화 단위로 마킹하세요: "${span.slice(0, 30)}…"`,
        );
      }
    }

    // ── 순서 환각 검사(결정론): 해설의 '앞서/이전에 ~가 언급한' 순서 주장 ↔
    //    자료 행 순서 대조. 마커·화자 행 인덱스가 해소될 때만 판정(불가면 침묵).
    const squashKo = (s: string) => ctx.koText.normalizeKo(s).replace(/\s+/g, "");
    const markerLineIdxOf = new Map<string, number>(); // 마커 라벨 → 자료 행 인덱스
    for (const m of markers) {
      const label = typeof m.label === "string" ? m.label : "";
      const span = typeof m.spanText === "string" ? squashKo(m.spanText) : "";
      if (!label || !span) continue;
      const idx = allLines.findIndex((line) => squashKo(line).includes(span));
      if (idx >= 0) markerLineIdxOf.set(label, idx);
    }
    const speakerFirstLineOf = new Map<string, number>(); // 화자 라벨 → 첫 발화 행
    allLines.forEach((line, idx) => {
      const m = SPEAKER_LINE_RE.exec(line);
      if (m) {
        const name = m[1].trim();
        if (!speakerFirstLineOf.has(name)) speakerFirstLineOf.set(name, idx);
      }
    });
    const ORDER_ADVERB_RE = /(앞서|앞에서|이전에|먼저)/;
    const checkOrderClaims = (anchorLabel: string, text: string, where: string) => {
      const anchorIdx = markerLineIdxOf.get(anchorLabel);
      if (anchorIdx === undefined || !text) return;
      for (const sentence of ctx.koText.splitSentencesKo(text)) {
        if (!ORDER_ADVERB_RE.test(sentence)) continue;
        // (a) 다른 마커 지칭: 지칭된 마커 발화가 실제로는 뒤 행이면 순서 환각
        for (const refLabel of MARKER_LABELS_5) {
          if (refLabel === anchorLabel || !sentence.includes(refLabel)) continue;
          const refIdx = markerLineIdxOf.get(refLabel);
          if (refIdx !== undefined && refIdx > anchorIdx) {
            add(
              "error",
              "ko-solver-mismatch",
              `${where}가 '앞서' 류 순서 부사와 함께 ${refLabel} 를 지칭하지만, ${refLabel} 발화는 자료에서 ${anchorLabel} 보다 뒤(행 ${refIdx + 1} > ${anchorIdx + 1})에 있습니다 — 발화 순서 환각`,
            );
          }
        }
        // (b) 인용 구절 지칭: '앞서 ~가 언급한 「…」' 의 인용 내용이 실제로는 앵커
        //     마커보다 뒤 행에 있으면 순서 환각(내용 수준 대조 — 판정 불가면 침묵)
        const quoteRe = /[‘'「“"]([^‘’'「」“”"]{6,80})[’'」”"]/g;
        let qm: RegExpExecArray | null;
        while ((qm = quoteRe.exec(sentence)) !== null) {
          const quoted = squashKo(qm[1]);
          if (quoted.length < 6) continue;
          const quotedIdx = allLines.findIndex((line) => squashKo(line).includes(quoted));
          if (quotedIdx >= 0 && quotedIdx > anchorIdx) {
            add(
              "error",
              "ko-solver-mismatch",
              `${where}가 '앞서' 류 순서 부사와 함께 인용한 발화("${qm[1].slice(0, 24)}…")는 자료에서 ${anchorLabel} 보다 뒤(행 ${quotedIdx + 1} > ${anchorIdx + 1})에 있습니다 — 발화 순서 환각`,
            );
          }
        }
        // (c) 화자 지칭: 그 화자의 첫 발화가 앵커 마커 행보다 뒤면 '앞서 언급'이 불성립
        const squashedSentence = squashKo(sentence);
        for (const [speaker, firstIdx] of speakerFirstLineOf) {
          if (!squashedSentence.includes(squashKo(speaker))) continue;
          if (firstIdx > anchorIdx) {
            add(
              "error",
              "ko-solver-mismatch",
              `${where}가 '앞서' 류 순서 부사와 함께 '${speaker}'의 발화를 지칭하지만, 자료에서 '${speaker}'는 ${anchorLabel} 발화(행 ${anchorIdx + 1}) 이전에 발화한 적이 없습니다 — 발화 순서 환각`,
            );
          }
        }
      }
    };
    const wrongExplanations = Array.isArray(question.wrongOptionExplanations)
      ? (question.wrongOptionExplanations as Record<string, unknown>[])
      : [];
    for (const w of wrongExplanations) {
      const label = typeof w.label === "string" ? w.label : "";
      const explanation = typeof w.explanation === "string" ? w.explanation : "";
      const optIdx = (OPTION_LABELS as readonly string[]).indexOf(label);
      if (optIdx >= 0 && optIdx < 5) {
        checkOrderClaims(MARKER_LABELS_5[optIdx], explanation, `${label} 오답 해설`);
      }
    }
    if (answerIdx >= 0 && answerIdx < 5 && typeof question.explanation === "string") {
      checkOrderClaims(MARKER_LABELS_5[answerIdx], question.explanation, "정답 해설");
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_SP_FUNC: KoTypeModule = {
  meta: {
    typeId: "KO_SP_FUNC",
    area: KO_SP_AREA as KoTypeMeta["area"],
    label: "대화 발화 기능(㉠~㉤)",
    formatCategory: "객관식",
    uiGroup: KO_SP_UI_GROUP as KoTypeMeta["uiGroup"],
    answerFormat: "MC5",
    includesPassage: false, // 담화(koStimulus)가 몸통 — 사용자 지문은 소재 참고만
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    usesStimulus: "required",
    stimulusKinds: ["DIALOGUE"],
    markerFamilies: ["KOR_CIRCLED"],
    optionEnding: "strategy", // 담화 전략형 '~하고 있다' (카탈로그 §4.2)
    needsSolverGate: false,
    lockedOptionOrder: true, // 선지-마커 1:1 순서 대응 — 셔플 제외
    description:
      "자체 생성 대화·대담 자료에 ㉠~㉤ 발화를 마킹하고 각 발화의 담화 기능(종합·재진술·화제 전환·동의 표명·의문 제기·사례 요청·요약)을 1:1 선지로 판정하는 화법 유형 — 오답은 인접 기능 바꿔치기",
    setSlot: "화작 융합 세트(38~42) 앞쪽 — (가) 담화의 발화 기능 슬롯, 2점",
    studentTask: "대화의 흐름을 따라가며 ㉠~㉤ 각 발화의 담화 기능 진술에서 인접 기능으로 바꿔친 하나를 고릅니다.",
    bestFor: [
      "정보·시사 화제의 대담(사회자·전문가) 담화 훈련",
      "학교 활동 화제의 학생 간 대화 담화 훈련",
      "화작 융합 세트 대비 발화 기능 판정 연습",
    ],
    outputUi: ["㉠~㉤ 마킹 대화 자료", "5지선다(1:1 대응, '~하고 있다')", "발화별 기능 근거 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "discourseForm",
        label: "담화 형태",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(소재 특성)" },
          { value: "PANEL", label: "대담 (사회자·전문가)" },
          { value: "STUDENTS", label: "대화 (학생 간)" },
          { value: "INTERVIEW", label: "면접 (면접자·지원자)" },
        ],
        defaultValue: "AUTO",
        description: "수능 융합 세트 관행은 대화·대담·면접 — 소재에 맞는 형태를 고릅니다",
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
      includesPassage: false,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "마커 발화에 담화 표지('그러니까', '예를 들면', '그런데')를 남겨 기능이 문면에서 드러나게 하라. 왜곡은 극성이 뚜렷한 원거리 기능(의문 제기↔동의 표명)으로.",
    INTERMEDIATE:
      "담화 표지를 걷어내고 앞뒤 2~3발화의 관계로만 기능이 판정되게 하라. 왜곡은 인접 기능 바꿔치기(재진술↔요약, 동의 표명↔종합)로, 참 선지의 [무엇에 대해] 부분도 담화 내용과 정밀 대응시켜라.",
    KILLER:
      "마커 발화 하나가 두 기능을 겹쳐 수행하게 하고(동의 표명 후 화제 전환 등) 실제 기능은 담화 목적상 지배적인 쪽으로 선언하라. 왜곡 선지는 부수 기능을 지배 기능처럼 진술하는 '절반 참'으로, 나머지 참 선지도 발화 위치·대상까지 정확해야 성립하는 진술로 구성해 전수 검증을 강제하라.",
  },
};
