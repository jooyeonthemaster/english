// ============================================================================
// KO_WR_PLAN — 작문: 글쓰기 계획 반영 (작문 세트 1슬롯, 43번대)
// ============================================================================
// 카탈로그 §2.4 KO_WR_PLAN 사양의 전면 구현. KO_SP_PLAN(발표 계획 반영)의
// 초고(작문) 대상 미러 — 자체자료(koStimulus) 2블록이 문항의 몸통이다:
//   [PLAN_NOTE] 글쓰기 계획 메모 — '~해야겠어' 종결 계획 정확히 5항
//   [DRAFT]     학생 초고 — 3~4문단 (문단 = lines 원소 1개)
// 발문: "초고에 반영된 글쓰기 계획으로 적절하지 않은 것은?" (부정발문 고정)
// 선지 = 계획 5항을 순서 그대로 옮긴 문장(1:1, lockedOptionOrder). 정답 =
// 초고에 반영되지 않은 계획 1개 — 표준 함정은 **부분 실행**(개념·소재는
// 밝혔으나 계획의 핵심 행위는 안 함: "장단점을 비교해야겠어" → 장점만 서술).
// 결정론 게이트: 계획 5항·선지 1:1 정합 / 반영 근거의 초고 verbatim /
// 문단 라벨("n문단") 언급 선지의 문단 수 정합 / 극성-근거관계 정합.
// ============================================================================

import { z } from "zod";
import { koMc5Envelope, koStimulusBlockSchema } from "../registry/envelope-schema";
import {
  buildDefaultKoRenderModel,
  readKoStimulusBlocks,
  type KoRenderModel,
} from "../core/render-model";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

const schema = koMc5Envelope({
  koStimulus: z
    .array(koStimulusBlockSchema)
    .length(2)
    .describe(
      "자체자료 정확히 2개 — 첫째 kind=PLAN_NOTE(글쓰기 계획 메모: 작문 상황 1행 + '~해야겠어' 종결 계획 5항), 둘째 kind=DRAFT(학생 초고 3~4문단, 문단마다 lines 원소 1개). 이 유형의 필수 요소",
    ),
  trapPrinciple: z
    .enum(["PARTIAL_EXECUTION", "QUALIFIER_DROP", "NOT_EXECUTED"])
    .describe(
      "정답(미반영) 계획에 사용한 함정 원리: PARTIAL_EXECUTION=부분 실행(개념·소재는 초고에 밝혔으나 계획의 핵심 행위는 실행 안 함 — 표준), QUALIFIER_DROP=한정어 미충족(행위는 실행했으나 계획의 한정 조건(수량·순서·방식·비교 대상)이 미충족 — 최고난도), NOT_EXECUTED=미실행(계획의 행위가 초고에 없음 — 저난도)",
    ),
  trapAnchor: z.object({
    baitSpan: z
      .string()
      .min(4)
      .describe(
        "초고에서 그대로 복사한 함정의 미끼 구절 (verbatim) — 정답 계획의 소재·개념이 언급된 대목. NOT_EXECUTED 면 가장 가까운 관련 구절",
      ),
    missingElement: z
      .string()
      .describe(
        "정답 계획 중 초고에서 실행되지 않은 행위·조건 요소 (예: '장단점 비교 중 단점 서술', '두 사례의 순차 제시')",
      ),
  }),
});

const prompt = `### 유형: 작문 — 글쓰기 계획 반영 (작문 세트 1슬롯)

**발문 템플릿** (정확히 이 형태 — 부정발문 고정, 긍정발문 금지):
- 표준: "초고에 반영된 글쓰기 계획으로 적절하지 않은 것은?"
- 변형: "학생의 초고에 반영된 글쓰기 계획으로 적절하지 않은 것은?"

**자료(koStimulus) 설계 — 이 유형은 지문이 아니라 자체자료 2개가 문항의 몸통이다**:
1. [PLAN_NOTE] 글쓰기 계획 메모 (label "(가)", title "글쓰기 계획"):
   - 첫 행: 작문 상황 1행 — "작문 상황: 학교 신문에 ○○을 알리는 글을 쓰려 함." 처럼
     글의 목적·예상 독자·매체를 압축해 밝힌다.
   - 이어서 계획 정확히 **5항**, 각 항은 "○ " 불릿으로 시작하고 반드시 '-아/어야겠어'
     활용(예: "제시해야겠어." / "높여야겠어." / "다뤄야겠어.")으로 끝난다.
   - 각 계획은 [내용 요소]+[구체 행위]의 2단 구조로 쓴다: "전문가 인터뷰를 인용해 문제의
     심각성을 뒷받침해야겠어." / "1문단에서 ○○의 개념을 정의하며 화제를 제시해야겠어." /
     "○○의 장단점을 비교하여 균형 있게 다뤄야겠어." — 행위 어휘(정의·인용·통계 제시·사례
     열거·비교·문답·예상 반론 재반박·비유·당부)를 항마다 다르게 하라.
   - "내용을 충실히 써야겠어" 같은 추상 계획 금지 — 반영 여부가 초고 문면에서 판정
     가능한 구체 행위여야 한다.
2. [DRAFT] 학생 초고 (label "(나)", title "학생의 초고"):
   - **3~4문단**, 문단마다 lines 원소 1개 (문단을 여러 행으로 쪼개지 마라).
   - 계획 4개의 실행 흔적을 서로 다른 문단에 분산해 심어라 — 한 문단에 계획 3개 이상
     몰지 마라. 실행 흔적은 계획 문장의 복사가 아니라 실제 글로 자연스럽게 실현된 형태다.
   - 고등학생 교지·학교 신문 수준의 문체로, 완결된 한 편의 글로 읽히게 하라.
3. 사용자가 제공한 지문은 초고의 **화제·소재 참고용일 뿐**이다 — 지문 문장을 초고에
   복사하지 말고, 문항은 자료 2개만으로 자기완결이어야 한다.

**선지 구성 원리 (계획 5항 = 선지 5개, 1:1 순서 고정)**:
1. 선지 ①~⑤는 계획 메모의 5항을 **불릿만 떼고 순서 그대로** 옮긴 문장이다 — 한 글자도
   바꾸지 마라(이 유형은 정답 위치 셔플이 없다: 선지 순서 = 글의 전개 순서).
2. 4개 계획은 초고에 온전히 반영되고(오답), 정확히 1개만 반영되지 않는다(정답).
3. 정답(미반영) 계획은 trapPrinciple 하나를 정확히 적용하라:
   - PARTIAL_EXECUTION(표준·우선): 계획의 소재·개념은 초고에 등장하지만 핵심 행위가
     빠진다. (예: 계획 "장단점을 비교해야겠어" → 초고는 장점만 서술 / 계획 "전문가
     인터뷰를 인용해야겠어" → 초고는 전문가 견해를 언급만 하고 인용 없음)
   - QUALIFIER_DROP(최고난도): 행위 자체는 실행됐으나 계획의 한정 조건이 미충족.
     (예: 계획 "두 통계를 순차적으로 제시해야겠어" → 초고는 통계 1개만 제시)
   - NOT_EXECUTED(저난도): 행위가 초고에 아예 없다. 단 소재의 근접 언급은 1회 남겨
     "훑어 읽기"로는 반영된 듯 보이게 하라.
4. 함정은 **정확히 한 계획**에만 둔다 — 두 계획이 동시에 애매하면 복수정답 시비가 난다.
   나머지 4개 계획의 실행 흔적은 초고 문면에서 일의적으로 확인되어야 한다.
5. 두 계획이 초고의 같은 문장을 실행 근거로 공유하지 않게 하라.
6. 계획·선지에서 문단 위치를 언급하면("1문단에서 ~") 초고의 실제 문단 수·내용과
   정확히 맞아야 한다 — 존재하지 않는 문단 지시 금지.

**함정 앵커(trapAnchor) 작성**:
- baitSpan: 초고에서 정답 계획의 소재가 언급된 구절을 verbatim 복사 — 학생이 "반영됐다"고
  착각하게 만드는 미끼 지점이다. missingElement: 실행되지 않은 행위·조건을 한 구절로.

**근거앵커(evidence) 작성 — 반영 판정의 근거는 반드시 초고(DRAFT)에서**:
- 오답(반영된 계획) 4개: relation=SUPPORTS + 해당 계획의 실행 흔적인 초고 구절 verbatim.
  계획 메모 문장을 근거로 쓰지 마라 — 메모는 판정 대상이지 근거가 아니다.
- 정답(미반영 계획): PARTIAL_EXECUTION·QUALIFIER_DROP → relation=DISTORTS + 미끼 구절
  (baitSpan 과 동일 대목). NOT_EXECUTED → relation=NOT_MENTIONED + 가장 가까운 관련 구절.

**금지**:
- 정답 계획의 소재가 초고에 전혀 없는데 PARTIAL_EXECUTION 을 선언하는 것 (미끼 없는 함정).
- 계획 문장과 초고 문장이 그대로 겹치는 것 (초고는 계획의 '실행'이지 복사가 아니다).
- 선지 순서를 계획 메모와 다르게 재배열하는 것, 계획에 없는 선지를 창작하는 것.
- 초고 문단 수와 어긋나는 문단 지시, 상식만으로 반영 여부가 갈리는 계획.`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const trap = settings.trapPrinciple;
  if (trap === "QUALIFIER_DROP") {
    lines.push(
      "- 함정 원리: QUALIFIER_DROP 으로 출제하라 — 정답 계획의 행위는 초고에 실행하되 한정 조건(수량·순서·방식·비교 대상) 하나만 미충족시켜라.",
    );
  } else if (trap === "NOT_EXECUTED") {
    lines.push(
      "- 함정 원리: NOT_EXECUTED 로 출제하라 — 정답 계획의 행위를 초고에서 통째로 빼되, 소재의 근접 언급 1회는 남겨 baitSpan 으로 앵커하라.",
    );
  } else {
    lines.push(
      "- 함정 원리: PARTIAL_EXECUTION(표준)으로 출제하라 — 정답 계획의 소재·개념은 초고에 밝히되 핵심 행위(비교·인용·사례 제시 등)는 실행하지 마라.",
    );
  }
  const paragraphs = settings.draftParagraphs === "4" ? 4 : 3;
  lines.push(
    `- 초고는 정확히 ${paragraphs}문단으로 쓰고, 문단마다 DRAFT.lines 원소 1개로 담아라.`,
  );
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 작문 상황을 교과서 작문 단원 활동(건의문·소개하는 글·주장하는 글)에 맞추고, 계획 항목에 수업에서 다루는 조직 방식 용어(문제-해결, 예상 반론과 재반박, 처음-중간-끝)를 사용하라.",
    );
  } else {
    lines.push(
      "- 수능 모드: 화작 43번대 관행대로 학교 신문·교지 기고 상황으로 설정하고, 계획 5항이 글의 전개 순서(도입→전개→마무리)를 따라 배열되게 하라.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 결정론 검증 헬퍼
// ---------------------------------------------------------------------------

/**
 * 계획 항목의 관행 종결 — '-아/어야겠어(다)' 활용 전반(해야겠어·높여야겠어·
 * 다뤄야겠어·담아야겠다)을 포괄한다. 닫는 따옴표·문장부호 허용.
 */
const PLAN_ENDING_RE = /야겠(어|다)[.!]?['"’”]?$/;
/** 계획 행 머리 불릿 (○·•·◦·- 등) 박리. */
const PLAN_BULLET_RE = /^[○●•◦·\-–—▪]\s*/;
/** 문단 라벨 지시 ("1문단", "3 문단"). */
const PARAGRAPH_REF_RE = /([0-9]+)\s*문단/g;

function readOptions(question: Record<string, unknown>): { label: string; text: string }[] {
  if (!Array.isArray(question.options)) return [];
  return (question.options as Record<string, unknown>[])
    .filter((o) => !!o && typeof o === "object")
    .map((o) => ({
      label: typeof o.label === "string" ? o.label : "",
      text: typeof o.text === "string" ? o.text : "",
    }));
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const options = readOptions(question);

  // ── 발문: 부정발문 고정 + '초고/계획' 프레임 지시 ───────────────────────
  if (direction && !ctx.koText.isNegativeStemKo(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      "글쓰기 계획 반영은 부정발문('초고에 반영된 글쓰기 계획으로 적절하지 않은 것은?') 고정 유형입니다",
    );
  }
  if (direction && !(/초고/.test(direction) && /계획/.test(direction))) {
    add(
      "error",
      "ko-direction-grammar",
      `발문이 '초고'와 '글쓰기 계획'을 함께 지시하지 않습니다: "${direction.slice(0, 40)}"`,
    );
  }

  // ── 자료 구성: PLAN_NOTE 1 + DRAFT 1 (kind별 결손 판정) ─────────────────
  const blocks = readKoStimulusBlocks(question.koStimulus);
  const planNote = blocks.find((b) => b.kind === "PLAN_NOTE");
  const draft = blocks.find((b) => b.kind === "DRAFT");
  if (!planNote) {
    add("error", "ko-stimulus-missing", "PLAN_NOTE(글쓰기 계획 메모) 자료가 없습니다 — 이 유형의 필수 자료 2개 중 하나");
  }
  if (!draft) {
    add("error", "ko-stimulus-missing", "DRAFT(학생 초고) 자료가 없습니다 — 이 유형의 필수 자료 2개 중 하나");
  }
  const draftText = draft ? draft.lines.join("\n") : "";
  const draftParagraphs = draft ? draft.lines.filter((l) => l.trim().length > 0).length : 0;
  if (draft && draftParagraphs < 2) {
    add(
      "error",
      "ko-stimulus-missing",
      `초고가 ${draftParagraphs}문단 — 문단(lines 원소)이 최소 2개, 관행은 3~4문단이어야 합니다`,
    );
  }

  // ── 계획 항목: '~해야겠어' 종결 정확히 5항 ──────────────────────────────
  const planItems: string[] = [];
  if (planNote) {
    for (const line of planNote.lines) {
      const t = line.trim();
      if (PLAN_ENDING_RE.test(t)) planItems.push(t.replace(PLAN_BULLET_RE, ""));
    }
    if (planItems.length !== 5) {
      add(
        "error",
        "ko-stimulus-missing",
        `계획 메모의 '~해야겠어' 종결 계획 항목이 ${planItems.length}개 — 정확히 5항이어야 합니다`,
      );
    }
  }

  // ── 선지 ↔ 계획 1:1 순서 정합 (lockedOptionOrder — 선지 = 계획의 이기) ──
  if (planItems.length === 5 && options.length === 5) {
    for (let i = 0; i < 5; i++) {
      const optionText = options[i].text.trim();
      const planText = planItems[i];
      if (!optionText) continue;
      const same =
        ctx.koText.containsSpanKo(planText, optionText) &&
        ctx.koText.containsSpanKo(optionText, planText);
      if (!same) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${options[i].label} 선지가 계획 메모의 ${i + 1}번째 계획과 일치하지 않습니다 — 선지는 계획 5항을 불릿만 떼고 순서 그대로 옮겨야 합니다`,
        );
      }
    }
  }
  for (const o of options) {
    if (o.text && !PLAN_ENDING_RE.test(o.text.trim())) {
      add(
        "warning",
        "ko-option-ending",
        `${o.label} 선지가 계획 관행 종결('~해야겠어')이 아닙니다: "${o.text.slice(0, 40)}"`,
      );
      break; // 같은 지적 반복 방지 — 첫 위반만
    }
  }

  // ── 문단 라벨 정합: 선지의 "n문단" 지시는 초고 문단 수 이내여야 한다 ────
  if (draft && draftParagraphs > 0) {
    for (const o of options) {
      for (const m of o.text.matchAll(PARAGRAPH_REF_RE)) {
        const n = Number.parseInt(m[1], 10);
        if (n < 1 || n > draftParagraphs) {
          add(
            "error",
            "ko-evidence-not-in-passage",
            `${o.label} 선지가 지시한 ${n}문단이 초고(총 ${draftParagraphs}문단)에 없습니다 — 문단 수 정합 위반`,
          );
        }
      }
    }
  }

  // ── 근거 표면 정합: 반영 판정 근거는 초고(DRAFT)에서 verbatim ───────────
  //    (공통 게이트는 계획 메모 포함 자료 전체를 허용 표면으로 보므로,
  //     여기서 '계획 메모 앵커'를 차단해야 반영 증명이 성립한다)
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  const relationOf = new Map<string, Set<string>>();
  for (const e of evidence) {
    const label = typeof e.optionLabel === "string" ? e.optionLabel : "";
    const relation = typeof e.relation === "string" ? e.relation : "";
    const span = typeof e.spanText === "string" ? e.spanText : "";
    if (label && span.length >= 4 && draft && !ctx.koText.containsSpanKo(draftText, span)) {
      add(
        "error",
        "ko-evidence-not-in-passage",
        `${label} 근거 스팬이 초고(DRAFT)에 없습니다 — 반영 판정 근거는 계획 메모가 아니라 초고에서 앵커해야 합니다: "${span.slice(0, 40)}"`,
      );
    }
    if (!label || !relation) continue;
    const set = relationOf.get(label) ?? new Set<string>();
    set.add(relation);
    relationOf.set(label, set);
  }

  // ── 극성-근거관계 정합 (부정발문 고정: 정답=미반영, 나머지=SUPPORTS) ────
  const distortRelations = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    if (isCorrect && ![...relations].some((r) => distortRelations.has(r))) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 정답(미반영 계획)인데 근거 relation 이 미반영 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다 — 극성 모순`,
      );
    }
    if (!isCorrect && !relations.has("SUPPORTS")) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 반영된 계획(오답)인데 SUPPORTS 근거(초고의 실행 흔적)가 없습니다`,
      );
    }
  }

  // ── 함정 앵커: 미끼 구절이 초고에 실재해야 '부분 실행' 함정이 성립 ──────
  const trap =
    question.trapAnchor && typeof question.trapAnchor === "object"
      ? (question.trapAnchor as Record<string, unknown>)
      : undefined;
  const baitSpan = typeof trap?.baitSpan === "string" ? trap.baitSpan : "";
  if (draft && baitSpan.length >= 4 && !ctx.koText.containsSpanKo(draftText, baitSpan)) {
    add(
      "error",
      "ko-evidence-not-in-passage",
      `함정 미끼 구절(trapAnchor.baitSpan)이 초고에 없습니다(verbatim 위반) — 미끼 없는 함정은 부분 실행이 아니라 단순 미실행입니다: "${baitSpan.slice(0, 40)}"`,
    );
  }

  return issues;
}

export const KO_WR_PLAN: KoTypeModule = {
  meta: {
    typeId: "KO_WR_PLAN",
    // KoArea 에 화법·작문 축이 없어 2028 '독서와 작문' 통합 축(READING)에 귀속.
    area: "READING",
    label: "글쓰기 계획 반영",
    formatCategory: "객관식",
    // ⚠ 조립 게이트: "국어 화법·작문·매체" 는 KoTypeMeta.uiGroup 유니온(비소유
    // registry/type-module.ts)에 아직 없다 — 화작·매체 팬아웃 공통으로 조립 단계의
    // 유니온 확장이 필요하며, 확장 전까지 이 단언으로 계약 위반을 명시한다.
    uiGroup: "국어 화법·작문·매체" as unknown as KoTypeModule["meta"]["uiGroup"],
    answerFormat: "MC5",
    includesPassage: false,
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    usesStimulus: "required",
    stimulusKinds: ["PLAN_NOTE", "DRAFT"],
    markerFamilies: [],
    optionEnding: "any", // 계획 선지는 '~해야겠어' 종결 — 자체 게이트로 검사
    needsSolverGate: false,
    lockedOptionOrder: true, // 선지 = 계획 5항의 순서 그대로 (글의 전개 순서)
    description:
      "글쓰기 계획 메모('~해야겠어' 5항)와 학생 초고를 대조해 초고에 반영되지 않은 계획 하나를 판정하는 작문 유형 — 부분 실행 함정이 표준",
    setSlot: "작문 세트 1슬롯(43번대) — 조건 생성·자료 활용에 앞서는 세트 도입 문항",
    studentTask:
      "글쓰기 계획 5항을 초고와 대조해, 초고에 반영되지 않은(부분 실행에 그친) 계획 하나를 고릅니다.",
    bestFor: [
      "작문 세트 도입 훈련(계획-초고 대조)",
      "부분 실행·한정어 함정 판별 훈련",
      "내신 작문 단원(건의문·주장하는 글) 활동 변형",
    ],
    outputUi: ["글쓰기 계획 메모 박스", "학생 초고 박스(3~4문단)", "5지선다(계획 1:1)", "선지별 반영 근거 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "trapPrinciple",
        label: "미반영 함정 원리",
        kind: "select",
        options: [
          { value: "PARTIAL_EXECUTION", label: "부분 실행(개념만 밝히고 행위 미실행 — 표준)" },
          { value: "QUALIFIER_DROP", label: "한정어 미충족(행위는 했으나 조건 위반 — 킬러)" },
          { value: "NOT_EXECUTED", label: "미실행(행위 자체가 없음 — 기본)" },
        ],
        defaultValue: "PARTIAL_EXECUTION",
        description: "정답(미반영) 계획이 초고에서 어긋나는 방식 — 부분 실행이 수능 관행의 표준 함정입니다",
      },
      {
        key: "draftParagraphs",
        label: "초고 문단 수",
        kind: "select",
        options: [
          { value: "3", label: "3문단" },
          { value: "4", label: "4문단" },
        ],
        defaultValue: "3",
        description: "학생 초고의 문단 수 — 문단 라벨 언급 선지는 이 수와 정합해야 합니다",
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
      includesPassage: false, // 자체자료(계획+초고)가 몸통 — 사용자 지문은 소재 참고
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "NOT_EXECUTED 우선 — 정답 계획의 행위가 초고에 없고 소재 언급도 1회 이하로, 해당 문단만 봐도 판정되게 하라. 오답 4개의 실행 흔적은 계획 어휘와 표면적으로 겹치게(정직한 대응).",
    INTERMEDIATE:
      "PARTIAL_EXECUTION 표준 — 정답 계획의 소재·개념은 초고에 분명히 등장하되 핵심 행위(비교·인용·사례 제시)가 빠지게 하라. 판정에 두 문단의 대조가 필요하게 하고, 오답 1개의 실행 흔적은 계획과 어휘가 다른 재진술로.",
    KILLER:
      "QUALIFIER_DROP — 정답 계획의 행위는 대부분 실행되고 한정 조건(수량 '두 가지'·순서 '순차적으로'·방식 '문답으로'·비교 대상)만 미충족되게 하라. 오답 4개의 실행 흔적도 재진술 거리를 최대화해 계획 전 항의 전수 대조를 강제하라.",
  },
};
