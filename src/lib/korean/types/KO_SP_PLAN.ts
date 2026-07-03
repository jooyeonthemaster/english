// ============================================================================
// KO_SP_PLAN — 화법: 발표 계획·메모 반영 여부  (v2 화법·작문·매체 팬아웃)
// ============================================================================
// 카탈로그 §2.3 KO_SP_PLAN 사양의 전면 구현. 자체자료(koStimulus) 2블록
// (PLAN_NOTE 계획 메모 + SPEECH_SCRIPT 실제 발표문)을 문항에 동봉하고,
// 계획 5항목 중 정확히 1개만 발표에 미반영되도록 역설계한다.
//
// 실측 근거(2025.10 고1 전국연합 학평 2번 — '고맥락 문화' 발표):
//   발문: "다음은 위 발표를 하기 위해 학생이 세운 계획이다. 발표에 반영되지
//         않은 것은?"
//   메모: [도입]/[전개]/[정리] 구획 + '◦ ~해야겠어.' 종결 계획 5항목.
//   정답(④): "관계 중심적인 특징을 장단점을 중심으로 분석해야겠어." — 발표는
//   관계 중심적 특징을 '설명'했으나 '장단점 중심 분석'은 하지 않음
//   = **부분 실행 함정**(소재는 겹치되 계획한 행위 미실행)의 정석.
//
// ⚠ 계약 갭 2건 — 조립(레지스트리 등록) 단계에서 해소 필요:
//   1) core/ko-text.ts NEGATIVE_STEM_RE 에 '반영되지 않은' 미등록 — 공통 게이트
//      stemGrammarIssueKo 가 본 유형의 정격 발문을 ko-direction-grammar(error)로
//      차단한다. 등록 전까지 본 유형은 relaxed 경로에서도 출하 불가.
//   2) registry/type-module.ts KoArea / KoTypeMeta.uiGroup 유니언에 화법 축
//      ("SPEECH" / "국어 화법·작문·매체") 미등록 — 아래 meta 는 국소 캐스트로
//      통과시킨다(런타임 소비처는 uiGroup 문자열 그룹핑뿐 — index.ts §80).
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
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

// bogi 는 스키마에서 제거(omit) — 이 유형의 자료는 계획 메모+발표문 2블록이 전부다.
// 생성 모델이 bogi 를 채점 지시문·정답 힌트('(전문가 인용 등)') 톤으로 만들어 <보기>
// 박스로 노출하면 문항이 파훼된다(판정단 critical). validate 의 존재 검사와 이중 방어.
const schema = koMc5Envelope({
  speechTopic: z
    .string()
    .min(2)
    .describe(
      "발표 화제 — 참고 지문의 소재를 학생 발표 주제로 변환한 것 (예: '고맥락 문화', '남생이의 생태')",
    ),
  trapDesign: z
    .enum(["MATERIAL_OVERLAP", "QUALIFIER_UNMET", "ACTION_SUBSTITUTED"])
    .describe(
      "정답(미반영 계획) 설계 방식: MATERIAL_OVERLAP=소재는 발표문에 등장하되 계획한 행위 미실행(부분 실행 함정 — 표준), QUALIFIER_UNMET=행위는 실행됐으나 한정 조건(방식·순서·수량) 미충족('두 사진을 순차적으로' 류 — 킬러), ACTION_SUBSTITUTED=계획한 행위 대신 다른 행위로 대체",
    ),
}).omit({ bogi: true });

// ---------------------------------------------------------------------------
// 결정론 헬퍼 — 계획 메모 행·선지 정규형
// ---------------------------------------------------------------------------

/** 정격 발문(부정형) — "…발표에 반영되지 않은 것은?" 종결 고정. */
const PLAN_STEM_RE = /반영되지\s*않은\s*것은\?$/;
/**
 * 계획 항목 종결 어미 — '-아/어야겠어(다)' 활용 전반(해야겠어·끌어야겠어·높여야겠어·
 * 도와야겠어·다뤄야겠다)을 포괄한다. [KO-TYPES-2] 종전 /해야겠(다|어)$/ 은 '하다' 활용만
 * 통과시켜 정상 계획 항목("신뢰를 높여야겠어.")을 ko-marker-option-mismatch(blocking)로
 * 오차단했다 — 자매 유형 KO_WR_PLAN 의 PLAN_ENDING_RE(L158)와 동일 정규식으로 정렬.
 * planLineCore/optionCore 는 [.…]+$ 만 박리하므로 '!'·닫는따옴표 꼬리까지 완전형으로 수용.
 */
const PLAN_ENDING_RE = /야겠(어|다)[.!]?['"’”]?$/;

/**
 * 계획 메모 행에서 판정 대상 계획 문장을 추출한다.
 * [도입]/[전개]/[정리] 구획 태그·불릿(◦ 등)·말줄임 리더·원문자 꼬리를 걷어낸 뒤
 * '~해야겠다/어' 종결이면 그 정규형을, 아니면(구획 헤더 행 등) null 을 돌려준다.
 */
function planLineCore(line: string): string | null {
  let t = line
    .trim()
    .replace(/^\[[^\]]{1,8}\]\s*/, "")
    .replace(/^[◦·•○∘\-–—]\s*/, "");
  t = t
    .replace(/[\s·⋯…]*[①②③④⑤]?\s*$/, "")
    .replace(/[.…]+$/, "")
    .trim();
  return PLAN_ENDING_RE.test(t) ? t : null;
}

/** 선지 텍스트 정규형 — 종결 부호만 걷어낸다(계획 행과의 1:1 대조용). */
function optionCore(text: string): string {
  return text.trim().replace(/[.…]+$/, "").trim();
}

/** kind 별 자료 블록의 검증용 평문 (title 행 + 본문 행). */
function stimulusTextOfKind(blocks: KoRenderStimulusBlock[], kind: KoRenderStimulusBlock["kind"]): string {
  return blocks
    .filter((b) => b.kind === kind)
    .map((b) => [b.title ?? "", ...b.lines].filter(Boolean).join("\n"))
    .join("\n");
}

// ---------------------------------------------------------------------------
// 생성 프롬프트
// ---------------------------------------------------------------------------

const prompt = `### 유형: 화법 — 발표 계획·메모 반영 여부

**발문 템플릿** (정확히 이 형태로 — 부정형 고정):
- "다음은 발표 전 계획이다. 발표에 반영되지 않은 것은?"
- 변형 허용: "다음은 위 발표를 하기 위해 학생이 세운 계획이다. 발표에 반영되지 않은 것은?"
- 반드시 "…반영되지 않은 것은?" 으로 종결하라. 긍정발문 전환 금지.

**자료(koStimulus) 구성 — 정확히 2블록, 이 순서로**:
1. koStimulus[0] = kind "PLAN_NOTE", title "발표 전 계획".
   - '◦ ' 불릿 + '~해야겠어.' (또는 '~해야겠다.') 종결의 계획 항목 **정확히 5행**.
   - [도입] / [전개] / [정리] 구획 헤더를 별도 행으로 두고 항목을 배분하라
     (도입 1 · 전개 3 · 정리 1 권장). 행 안에 ①~⑤ 번호·말줄임 리더는 넣지 말 것.
   - 각 항목 = [소재] + [행위] 구조: "‘고맥락 문화’의 개념을 ‘저맥락 문화’와
     비교하여 제시해야겠어." 처럼 무엇을(소재) 어떻게(행위·방식·순서·수량 한정)
     다룰지가 한 문장에 담겨야 한다.
2. koStimulus[1] = kind "SPEECH_SCRIPT", title "발표문".
   - 학생 구어체 발표 전문 600~900자: 인사·화제 제시(선정 동기) → 전개(개념
     설명·예시·자료 제시) → 마무리(요약·당부). 문단 단위로 행을 나눠라.
   - 정형 발표 관행을 살려라: 청중 질문("~을 알고 계셨나요?"), 괄호 지시문
     "(대답을 듣고)", "(자료를 가리키며)", 예고("오늘은 ~에 대해 발표하겠습니다").
   - 참고용 지문이 주어지면 **발표 화제의 소재로만** 활용하라 — 지문 문장을
     복사하지 말고 학생 발표 담화로 완전히 새로 써라.

**핵심 메커니즘 — 계획 5항목 중 정확히 1개만 미반영**:
- 오답 4개(반영된 계획): 발표문에 실행 흔적이 **명시적 구절**로 존재해야 한다.
  계획 문장을 그대로 복사하지 말고, 계획한 행위가 실제 수행된 발화로 구현하라.
- 정답 1개(미반영 계획)는 trapDesign 방식으로 설계하라:
  - MATERIAL_OVERLAP(표준): **소재는 발표문에 등장하되 계획한 행위가 미실행**.
    실측 예 — 계획 "관계 중심적인 특징을 장단점을 중심으로 분석해야겠어" ↔
    발표는 관계 중심적 특징을 '예를 들어 설명'만 하고 장단점 분석은 하지 않음.
    소재가 아예 없는 항목은 너무 쉽다 — 반드시 소재를 겹치게 하라.
  - QUALIFIER_UNMET(킬러): 행위 자체는 수행됐으나 한정 조건이 미충족.
    예 — 계획 "두 사진을 순차적으로 제시해야겠어" ↔ 발표는 사진 한 장만 제시.
  - ACTION_SUBSTITUTED: 계획한 행위 대신 인접한 다른 행위 수행.
    예 — 계획 "전문가 인터뷰를 인용해야겠어" ↔ 발표는 통계 자료를 제시.

**선지 구성 — 계획 항목과 1:1 순서 고정**:
- 선지 ①~⑤ 는 PLAN_NOTE 의 계획 5항목과 **완전히 동일한 문장**(불릿·구획
  헤더 제외)을 **메모 등장 순서 그대로** 담는다. 재진술·요약 금지.
- 따라서 정답 위치는 미반영 항목의 메모 내 위치로 결정된다 — 도입·정리
  항목만 정답으로 삼지 말고 전개 항목에도 고르게 배치하라.

**근거앵커(evidence) 작성 — 채점 가능성의 심장**:
- 오답(반영) 선지 4개: relation=SUPPORTS + **발표문에서 그대로 복사한** 실행
  근거 구절(8~60자). 계획 메모가 아니라 반드시 발표문 구절이어야 한다.
- 정답(미반영) 선지: relation=NOT_MENTIONED + 발표문에서 소재가 스치는 가장
  가까운 구절. QUALIFIER_UNMET/ACTION_SUBSTITUTED 면 relation=DISTORTS 또는
  CONTRADICTS + 불완전 실행이 확인되는 구절.

**금지**:
- **bogi(<보기>) 필드 생성 절대 금지** — 이 유형의 자료는 계획 메모(PLAN_NOTE)와
  발표문(SPEECH_SCRIPT) 2블록이 전부다. '~로 판정한다' 류 채점 지시문·정답 힌트가
  <보기> 박스로 학생에게 노출되면 문항이 파훼된다(시스템이 존재 자체를 반려한다).
- 계획 문장('~해야겠어' 종결문)을 발표문 안에 그대로 복사하는 것.
- 미반영 항목이 2개 이상이 되는 것(오답 4개 전부에 실행 흔적을 심어 검산하라).
- 발표문을 읽지 않아도 배제되는 황당한 계획 항목(발표 화제와 무관한 소재).
- 지시문·청중 반응 등 괄호 표기를 계획 항목의 유일한 근거로 삼는 것 — 그건
  말하기 방식(KO_SP_STRAT) 유형의 몫이다. 본 유형의 근거는 발화 내용이다.`;

// ---------------------------------------------------------------------------
// 세부옵션
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const trap = settings.trapDesign;
  if (trap === "MATERIAL_OVERLAP" || trap === "QUALIFIER_UNMET" || trap === "ACTION_SUBSTITUTED") {
    lines.push(`- trapDesign=${trap} 방식으로 미반영 항목을 설계하라 (프롬프트의 해당 정의를 따를 것).`);
  } else {
    lines.push(
      "- trapDesign 은 난이도에 맞게 스스로 선택하라: 기본은 MATERIAL_OVERLAP(부분 실행), 킬러는 QUALIFIER_UNMET(한정어 함정)을 우선 고려.",
    );
  }
  if (settings.planSections === false) {
    lines.push("- 계획 메모는 [도입]/[전개]/[정리] 구획 헤더 없이 '◦ ' 불릿 5행만으로 구성하라.");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 교과서 발표 담화 관행(단원 학습 내용 화제)을 따르고, 계획 항목에 수업 개념어(예상 청중 분석·매체 자료 활용 등)를 1개 이상 반영하라.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 유형 특화 검증 (결정론)
// ---------------------------------------------------------------------------

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });
  const { containsSpanKo } = ctx.koText;

  // 0) bogi 금지 — 스키마 omit 과 이중 방어. 생성물이 우회 경로로 bogi 를 실으면
  //    채점 지시문·정답 힌트가 <보기> 박스로 렌더돼 문항 파훼(판정단 critical).
  if (question.bogi && typeof question.bogi === "object") {
    add(
      "error",
      "ko-answer-leak",
      "이 유형은 <보기>(bogi)를 사용하지 않습니다 — 계획 메모·발표문 외 보조 박스는 채점 지시문/정답 힌트 노출 위험이므로 제거하세요",
    );
  }

  // 1) 발문 부정형 고정 — "…반영되지 않은 것은?"
  const direction = typeof question.direction === "string" ? question.direction : "";
  if (!PLAN_STEM_RE.test(direction.replace(/\s+/g, " ").trim())) {
    add(
      "error",
      "ko-direction-grammar",
      `발문은 '…발표에 반영되지 않은 것은?' 부정형으로 종결해야 합니다: "${direction}"`,
    );
  }

  // 2) 자료 2종(PLAN_NOTE + SPEECH_SCRIPT) 존재
  const blocks = readKoStimulusBlocks(question.koStimulus);
  const planText = stimulusTextOfKind(blocks, "PLAN_NOTE");
  const scriptText = stimulusTextOfKind(blocks, "SPEECH_SCRIPT");
  if (!planText) {
    add("error", "ko-stimulus-missing", "계획 메모(PLAN_NOTE) 자료 블록이 없습니다");
  }
  if (!scriptText) {
    add("error", "ko-stimulus-missing", "발표문(SPEECH_SCRIPT) 자료 블록이 없습니다");
  }
  if (!planText || !scriptText) return issues; // 이하 검사는 두 표면 전제

  // 3) 계획 항목 정확히 5행 + 선지 1:1 순서 대응
  const planCores = blocks
    .filter((b) => b.kind === "PLAN_NOTE")
    .flatMap((b) => b.lines)
    .map(planLineCore)
    .filter((c): c is string => c !== null);
  if (planCores.length !== 5) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `계획 메모의 '~해야겠다/어' 종결 항목이 ${planCores.length}개 — 선지 5개와 1:1 대응하도록 정확히 5개여야 합니다`,
    );
  }

  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[]).map((o) => ({
        label: typeof o.label === "string" ? o.label : "",
        text: typeof o.text === "string" ? o.text : "",
      }))
    : [];
  if (planCores.length === 5 && options.length === 5) {
    for (let i = 0; i < 5; i++) {
      const oCore = optionCore(options[i].text);
      const pCore = planCores[i];
      const matched =
        (containsSpanKo(pCore, oCore) || containsSpanKo(oCore, pCore)) && oCore.length > 0;
      if (!matched) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${options[i].label} 선지가 계획 메모 ${i + 1}번째 항목과 불일치합니다 — 선지는 계획 항목과 동일 문장·동일 순서여야 합니다`,
        );
      }
    }
    // 선지 어미: 계획 인용이므로 '~해야겠다/어.' 종결 (meta.optionEnding="any" 대체 게이트)
    for (const o of options) {
      if (!PLAN_ENDING_RE.test(optionCore(o.text))) {
        add(
          "warning",
          "ko-option-ending",
          `${o.label} 선지가 '~해야겠다/어.' 종결이 아닙니다: "${o.text.slice(0, 40)}"`,
        );
        break; // 첫 위반만
      }
    }
  }

  // 4) 극성-근거 정합 + 5) 오답 실행 근거의 발표문 실재
  //    정답(미반영) = NOT_MENTIONED/DISTORTS/CONTRADICTS 만, 오답(반영) 4개 =
  //    SUPPORTS 필수이며 그 스팬은 계획 메모가 아니라 **발표문**에 있어야 한다.
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  const distortRelations = new Set(["NOT_MENTIONED", "DISTORTS", "CONTRADICTS"]);
  const relationsOf = new Map<string, Set<string>>();
  const supportSpansOf = new Map<string, string[]>();
  for (const e of evidence) {
    const label = typeof e.optionLabel === "string" ? e.optionLabel : "";
    const relation = typeof e.relation === "string" ? e.relation : "";
    const span = typeof e.spanText === "string" ? e.spanText : "";
    if (!label || !relation) continue;
    const set = relationsOf.get(label) ?? new Set<string>();
    set.add(relation);
    relationsOf.set(label, set);
    if (relation === "SUPPORTS" && span) {
      const spans = supportSpansOf.get(label) ?? [];
      spans.push(span);
      supportSpansOf.set(label, spans);
    }
  }
  for (const o of options) {
    const relations = relationsOf.get(o.label) ?? new Set<string>();
    const isCorrect = o.label === correctAnswer;
    if (isCorrect) {
      const hasDistort = [...relations].some((r) => distortRelations.has(r));
      if (!hasDistort) {
        add(
          "error",
          "ko-evidence-missing",
          `${o.label} 선지는 미반영(정답) 계획인데 근거 relation 이 미반영 계열(NOT_MENTIONED/DISTORTS/CONTRADICTS)이 아닙니다 — 극성 모순`,
        );
      }
      if (relations.has("SUPPORTS")) {
        add(
          "error",
          "ko-evidence-missing",
          `${o.label} 선지는 미반영(정답) 계획인데 SUPPORTS(실행) 근거가 붙어 있습니다 — 극성 모순`,
        );
      }
    } else {
      if (!relations.has("SUPPORTS")) {
        add(
          "error",
          "ko-evidence-missing",
          `${o.label} 선지는 반영(오답) 계획인데 SUPPORTS 실행 근거가 없습니다 — 오답 4개 전부 발표문 실행 근거 필수`,
        );
        continue;
      }
      const spans = supportSpansOf.get(o.label) ?? [];
      const inScript = spans.some((s) => containsSpanKo(scriptText, s));
      if (!inScript) {
        add(
          "error",
          "ko-evidence-not-in-passage",
          `${o.label} 선지의 실행 근거 스팬이 발표문(SPEECH_SCRIPT)에 없습니다 — 계획 메모 인용은 실행 근거가 아닙니다`,
        );
      }
    }
  }

  // 6) 미반영(정답) 계획 문장의 발표문 verbatim 부재 — 계획 문장이 발표문에
  //    그대로 있으면 '반영되지 않은' 정답이 성립하지 않는다.
  if (planCores.length === 5 && options.length === 5) {
    const correctIdx = ["①", "②", "③", "④", "⑤"].indexOf(correctAnswer);
    if (correctIdx >= 0) {
      const core = planCores[correctIdx];
      if (core && containsSpanKo(scriptText, core)) {
        add(
          "error",
          "ko-correct-answer-invalid",
          `정답(미반영) 계획 문장이 발표문에 그대로 등장합니다 — 정답 불성립: "${core.slice(0, 40)}"`,
        );
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_SP_PLAN: KoTypeModule = {
  meta: {
    typeId: "KO_SP_PLAN",
    // ⚠ 계약 갭(파일 헤더 주석 2번): 화법 축이 KoArea/uiGroup 유니언에 미등록 —
    //    조립 단계에서 유니언 확장 후 이 캐스트는 무해한 no-op 이 된다.
    area: "SPEECH" as unknown as KoTypeMeta["area"],
    label: "발표 계획 반영 여부",
    formatCategory: "객관식",
    uiGroup: "국어 화법·작문·매체" as unknown as KoTypeMeta["uiGroup"],
    answerFormat: "MC5",
    // 화법 유형은 지문 미동봉 — 사용자 지문은 발표 화제 소재로만 프롬프트에 반영.
    includesPassage: false,
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    usesStimulus: "required",
    stimulusKinds: ["PLAN_NOTE", "SPEECH_SCRIPT"],
    markerFamilies: [],
    // 선지 어미는 계획 인용('~해야겠다/어.')이라 공통 plain 게이트와 어긋난다 —
    // "any" 선언 후 validate() 의 자체 어미 게이트(warning)로 대체.
    optionEnding: "any",
    needsSolverGate: false,
    // 선지 = 계획 메모 항목과 1:1 순서 대응 — 결정론 셔플 제외.
    lockedOptionOrder: true,
    description: "발표 전 계획 메모 5항목 중 실제 발표에 반영되지 않은 1개를 찾는 화법 유형",
    setSlot: "발표 세트(35~37) 2슬롯 — 자료 활용형(KO_SP_MAT)과 교대",
    studentTask: "계획 메모의 5항목을 발표문과 대조해 실행 흔적이 없는 하나를 고릅니다.",
    bestFor: ["발표 담화 자체 생성 훈련", "계획-실행 대조 독해", "내신 화법 단원 확인"],
    outputUi: ["계획 메모·발표문 2자료 동봉", "5지선다(계획 항목 1:1)", "선지별 실행 근거·오답 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "trapDesign",
        label: "미반영 함정 설계",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(난이도 연동)" },
          { value: "MATERIAL_OVERLAP", label: "부분 실행(소재 겹침·행위 미실행)" },
          { value: "QUALIFIER_UNMET", label: "한정어 미충족(방식·순서·수량)" },
          { value: "ACTION_SUBSTITUTED", label: "행위 대체(다른 행위로 수행)" },
        ],
        defaultValue: "AUTO",
        description: "정답(미반영 계획) 항목이 발표문을 비켜 가는 방식",
      },
      {
        key: "planSections",
        label: "계획 메모 구획([도입]/[전개]/[정리])",
        kind: "toggle",
        defaultValue: true,
        description: "끄면 구획 헤더 없이 불릿 5행 메모로 생성합니다",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    const model = buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: false,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
    // '반영되지 않은'은 ko-text 부정발문 사전에 없어 자동 밑줄이 걸리지 않는다 —
    // 표기 규약(부정어 밑줄)을 유형에서 복원한다. (사전 등록 시 negative=true 로
    // 들어오므로 이 분기는 자동 무력화 — 이중 밑줄 없음.)
    if (!model.stem.negative && /반영되지 않은 것은\?/.test(model.stem.text)) {
      model.stem.negative = true;
      model.stem.text = model.stem.text.replace("반영되지 않은", "반영되지 __않은__");
    }
    return model;
  },
  difficultyGuide: {
    BASIC:
      "미반영 항목의 소재가 발표문에서 한 번만 스치게 하고(행위 부재가 한 문단 안에서 확인), 오답 4개의 실행 구절은 계획 문장과 어휘가 겹치게 하라.",
    INTERMEDIATE:
      "부분 실행 함정(MATERIAL_OVERLAP)을 기본으로 하라 — 미반영 항목의 소재를 발표문에 뚜렷이 등장시키되 계획한 행위(비교·분석·인용 등)만 빠뜨려라. 오답 실행 구절은 계획과 어휘를 바꿔 재진술 거리를 벌려라.",
    KILLER:
      "한정어 함정(QUALIFIER_UNMET)을 우선 고려하라 — 계획 항목에 방식·순서·수량 한정('두 자료를 순차적으로', '전문가의 말을 직접 인용해')을 심고 발표문에서는 그 한정만 미충족되게 하라. 전 항목의 소재가 발표문에 등장해 전수 대조를 강제해야 한다.",
  },
};
