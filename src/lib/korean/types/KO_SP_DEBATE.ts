// ============================================================================
// KO_SP_DEBATE — 화법: 토론(입론·반대 신문·반론)  【자체자료(DEBATE) 필수 유형】
// ============================================================================
// 카탈로그 §2.3 KO_SP_DEBATE 사양의 전면 구현. 지문(Passage)을 동봉하지 않고
// (includesPassage=false — 사용자 지문은 논제·소재 참고로만), 반대신문식 토론
// 담화를 koStimulus(kind="DEBATE") 로 자체 생성해 문항에 동봉한다.
//
// 실측 근거(2026.3 고1 학평 4~6번, 논제: 동물실험):
//   발문: "찬성 1과 반대 1의 입론에 대한 설명으로 가장 적절한 것은?"
//   토론 트리오 — ①입론 말하기 방식(대칭 선지) ②쟁점×양측 주장 매트릭스 1칸 왜곡
//   ③<보기> 자료 기반 반론 적절성. 오답 = 주장 방향 반전 · 근거-주장 연결 조작 · 반쪽 참.
//   빈도: 평가원 선택과목 확인분(2023 6월~2026 수능 9회) 미출제 — 교육청 학평·내신·
//   EBS 중심. 신체제 고1 학평에서 부활 → 2028학년도 공통 '화법과 언어'(화법 5문항)
//   대비 필수 유형 (단 평가원 재출제 가능성 0 하드코딩 금지 — 미확인 5회차 존재).
//
// ⚠ 계약 갭 캐스팅(조립 단계 해소 대상 — 이 파일은 type-module.ts 를 수정하지 않는다):
//   - KoArea 에 화법 영역 값이 없다 → "SPEECH" 를 이중 캐스팅으로 기입.
//   - KoTypeMeta.uiGroup 유니온에 "국어 화법·작문·매체" 가 없다 → 동일 캐스팅.
//   type-module.ts(+question-type-ui.ts QuestionTypeCategory) 유니온 확장 시
//   아래 SPEECH_AREA / SPEECH_UI_GROUP 캐스팅을 제거할 것.
// ============================================================================

import { z } from "zod";
import { koMc5Envelope, koStimulusBlockSchema } from "../registry/envelope-schema";
import {
  buildDefaultKoRenderModel,
  readKoStimulusBlocks,
  type KoRenderModel,
  type KoRenderStimulusBlock,
} from "../core/render-model";
import { koStimulusPlainText } from "../quality/common";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeMeta,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// 계약 갭 캐스팅 (파일 헤더 ⚠ 참조 — 유니온 확장 후 리터럴 직접 기입으로 교체)
const SPEECH_AREA = "SPEECH" as unknown as KoTypeMeta["area"];
const SPEECH_UI_GROUP = "국어 화법·작문·매체" as unknown as KoTypeMeta["uiGroup"];

const schema = koMc5Envelope({
  koStimulus: z
    .array(koStimulusBlockSchema)
    .min(1)
    .describe(
      "토론 담화 — kind='DEBATE' 블록 1개 필수. 첫 행은 반드시 \"논제: ~\" 이고, 이후 행은 '사회자: …'/'찬성 1: …'/'반대 1: …' 화자 라벨 발언(행당 1발언, 반대신문식 절차)",
    ),
  debateFocus: z
    .enum(["STRATEGY", "MATRIX", "REBUT"])
    .describe(
      "출제 모드 — STRATEGY: 입론 말하기 방식 대칭 선지('찬성 1은 ~, 반대 1은 ~'), MATRIX: 쟁점×양측 주장 정오(1칸 왜곡), REBUT: <보기> 자료 기반 반론 적절성(bogi 필수)",
    ),
  debateIssues: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe(
      "토론의 쟁점 목록 2~4개(명사구, 예: '동물실험의 과학적 신뢰성') — 입론·반론 발언이 실제로 다루는 쟁점만. MATRIX 모드 필수, 그 외 권장",
    )
    .optional(),
  distortionPrinciple: z
    .enum(["CLAIM_FLIP", "LINK_FABRICATION", "HALF_TRUE"])
    .describe(
      "정답(왜곡) 선지에 사용한 오답 원리: CLAIM_FLIP=주장 방향 반전(주장을 반대 측에 귀속·극성 반전), LINK_FABRICATION=근거-주장 연결 조작(실재 근거를 다른 주장에 접합), HALF_TRUE=반쪽 참(대칭 선지의 한쪽 절만 참 — 킬러 표준)",
    ),
});

const prompt = `### 유형: 화법 — 토론(입론·반대 신문·반론)

**이 유형의 위상**: 평가원 선택과목 체제 확인분(2023 6월~2026 수능 9회)에서는 미출제이나
교육청 학평·내신·EBS 의 화법 필수 유형이며, 2026.3 고1 학평(신체제) 4~6번에서 토론이
부활했다(논제: 동물실험). **2028학년도 공통 '화법과 언어'(화법 5문항) 대비 핵심 유형**이다.
따라서 담화·문항 모두 수능급 정합성으로 설계하라.

**토론 담화(koStimulus) 설계 — kind="DEBATE" 1블록 필수**:
1. 사용자 제공 지문이 있으면 **논제·소재 아이디어로만 참고**하고 지문 문장을 복사하지 마라.
   담화는 전부 자체 창작이다.
2. **첫 행은 반드시 "논제: ~"** 한 행이다. 정책 논제는 '~해야 한다.' 형으로 쓴다
   (예: "논제: 교내 일회용품 사용을 금지해야 한다.").
3. **반대신문식 구조**를 행 단위로 재현하라 — 표준 전개:
   사회자(논제 배경 소개 + "먼저 찬성 측이 입론해 주십시오." 식 절차 안내 — '입론'·
   '반대 신문' 절차어를 사회자 발언에 명시) → 찬성 1: 입론 → 반대 2: 반대 신문(확인 질문)
   → 찬성 1: 답변 → 반대 1: 입론 → 찬성 2: 반대 신문(확인 질문) → 반대 1: 답변
   (필요시 반론 단계까지 확장).
4. **화자 라벨 규격**: "사회자:", "찬성 1:", "찬성 2:", "반대 1:", "반대 2:" — 한 행에
   한 발언. 발언 도중 준언어·자료 제시는 괄호 지시문으로("(자료를 화면에 띄우며)").
5. **입론에는 판정 앵커를 심어라**: 쟁점별 주장 + 근거(구체적 수치의 통계, 연구·전문가
   견해 인용, 사례, 용어 정의) 를 양측 각각 2개 이상. 반대 신문은 상대 근거의 전제·출처·
   적용 범위를 겨냥한 확인 질문 + 상대의 답변으로 구성하라 — 선지의 정오가 담화 문면에서
   결정론적으로 판정되게 하는 장치다.
6. 분량: 발언 8~14행, 행당 1~3문장. 양측 발언 분량을 대등하게 하라(편향 금지).
7. 논제는 학생 생활·사회 이슈 중 찬반 근거가 모두 성립하는 것으로 — 특정 집단 비하·
   정치적 편향 단정 소재 금지.

**모드(debateFocus)별 발문·선지 설계**:

[STRATEGY — 입론 말하기 방식 (2026.3 고1 학평 4번형)]
- 발문: "'찬성 1'과 '반대 1'의 입론에 대한 설명으로 가장 적절한 것은?" 또는
  "위 토론 참가자들의 말하기 방식에 대한 설명으로 적절하지 않은 것은?"
- 선지는 **대칭 구조 고정**: "찬성 1은 ~하고 있고, 반대 1은 ~하고 있다." — 한 선지가
  양측 각각의 화행 판정 2개를 담는다(어미 '~하고 있다').
- 화행 판정 어휘 풀: 용어의 개념 정의로 논의 범위 한정 / 구체적 수치의 통계 인용 /
  전문가·기관의 견해 인용 / 사례 열거 / 예상 반론의 선제 차단 / 질문으로 청중의 동의 유도 /
  상대 발언 재진술 후 문제점 지적 / 기대 효과 제시 — 이 풀 안에서 쓰고 창작 개념어 금지.
- 오답은 HALF_TRUE(반쪽 참)가 표준: 한쪽 절은 담화와 정확히 일치, 다른 쪽 절만 부재
  화행이거나 화행 오귀속. 그 외 양측 화행 맞바꿈도 허용.

[MATRIX — 쟁점×양측 주장 정오 (학평 5번형)]
- 발문: "위 토론의 쟁점별 양측 주장을 정리한 내용으로 적절하지 않은 것은?"
- debateIssues 에 쟁점 2~4개를 기록하고, 입론·반론 발언이 그 쟁점을 실제로 다루게 하라.
- **쟁점명 verbatim 규칙(필수)**: debateIssues 의 각 쟁점명은 토론 담화 문면에 **글자
  그대로** 등장해야 한다 — 사회자의 쟁점 정리 발언에 전 쟁점명을 실어라(예: "사회자:
  오늘 토론의 쟁점은 '동물실험의 과학적 신뢰성'과 '대체 시험법의 실행 가능성'입니다.").
  선지가 작은따옴표로 인용하는 쟁점명은 담화 문면과 일치해야 검증(인용 verbatim 게이트)을
  통과한다 — 담화에 없는 요약 명사구를 선지에서 인용하면 문항 전체가 차단된다.
- 선지는 매트릭스 1칸 형식: "'[쟁점명]'에 대해 찬성 측은 ~고 주장하고, 반대 측은 ~고
  주장한다." — 5개 선지 중 정답 1개만 **한 칸(한쪽 주장)** 을 왜곡한다.
- 왜곡은 CLAIM_FLIP(주장 방향 반전: 찬성 주장을 반대 측에 귀속, 주장 극성 반전) 또는
  LINK_FABRICATION(그 측이 실제로 든 근거를 다른 주장에 접합) 중 하나를 정확히 한 지점에.
- 나머지 4개 선지의 양측 주장 8칸은 담화 발언과 전부 정합해야 한다.

[REBUT — <보기> 자료 기반 반론 적절성 (학평 6번형·3점 관행)]
- **<보기>(bogi) 필수**: 토론을 참관한 학생이 추가로 수집한 자료 — "ㄱ. …" / "ㄴ. …"
  (필요시 "ㄷ. …") 항목 형식으로 2~3개(연구 결과·통계·전문가 견해·사례). 자료에는
  구체적 출처 성격과 수치를 담아 반박 방향이 일의적으로 판정되게 하라.
- 발문: "<보기>는 토론을 참관한 학생이 수집한 자료이다. <보기>를 활용하여 찬성 측
  (또는 반대 측) 입론에 반론을 펼친다고 할 때, 그 내용으로 가장 적절한 것은?"
- 선지 형식: "ㄱ을 활용하여, ~라는 찬성 1의 주장에 대해 ~고 반박할 수 있다." —
  ①자료 항목 지시 ②반박 대상 주장 특정 ③반박 논지 3요소를 전 선지에 갖춰라.
- 오답 설계: 자료가 지지하지 않는 반박(LINK_FABRICATION — 인과 비약·적용 범위 초과) /
  반박 대상 주장을 반대 방향으로 오특정(CLAIM_FLIP) / 반박이 아니라 자기 측 주장
  강화에 그치는 진술 / 자료 내용의 극성 오독.
- 배점은 3점을 기본으로 하라(points=3 — 자료 결합형 3점 관행).

**오답 설계 3원리 (distortionPrinciple 하나를 정확히 적용)**:
- CLAIM_FLIP(주장 방향 반전): 찬성의 주장·근거를 반대 측에 귀속시키거나, 주장의 극성을
  반전한다(예: "제한적 허용" 주장을 "전면 금지" 주장으로).
- LINK_FABRICATION(근거-주장 연결 조작): 담화에 실재하는 근거를 그 근거가 뒷받침하지
  않는 다른 주장에 접합한다 — 근거도 주장도 실재하나 연결만 거짓(판정에 왕복 대조 강제).
- HALF_TRUE(반쪽 참): 대칭 선지의 한쪽 절은 담화와 정확히 일치시키고 다른 쪽 절만
  왜곡한다 — 전수 검증을 강제하는 킬러 표준.
왜곡은 **정확히 한 지점**이어야 한다. 두 군데 이상 비틀면 난도가 무너진다.

**근거앵커(evidence) 작성**:
- 모든 선지(①~⑤)에 근거를 앵커하라. spanText 는 **토론 담화(자료) 행에서 그대로 복사**
  (verbatim — 화자 라벨 뒤의 발언 본문에서). REBUT 모드는 <보기> 항목 원문도 근거로 쓸 수 있다.
- 참 선지: relation=SUPPORTS. 왜곡 선지: CLAIM_FLIP·LINK_FABRICATION·HALF_TRUE →
  relation=DISTORTS(또는 CONTRADICTS) + 왜곡 판정의 기준이 되는 발언 구절.
  담화에 없는 내용의 사실화면 NOT_MENTIONED + 가장 가까운 발언.

**금지**:
- 담화에 발언이 없는 화자('찬성 3' 등)를 지시하는 선지, 담화에 없는 발언의 인용.
- 사회자의 진행 발언을 화행 판정 대상으로 삼는 선지(사회자는 절차 안내자다).
- 두 개 이상의 선지가 같은 이유로 틀리는 구성, 상식만으로 판정되는 선지.
- 논제에 대한 출제자의 가치 판단 노출(해설 포함) — 판정 기준은 오직 담화 문면이다.`;

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const focus = settings.debateFocus;
  if (focus === "MATRIX") {
    lines.push(
      "- debateFocus=MATRIX 로 출제하라: 발문은 쟁점별 양측 주장 정리('~정리한 내용으로 적절하지 않은 것은?'), 선지는 \"'[쟁점]'에 대해 찬성 측은 ~고 주장하고, 반대 측은 ~고 주장한다.\" 매트릭스 형식, debateIssues 필수 기록, 정답은 1칸 왜곡. 각 쟁점명은 사회자의 쟁점 정리 발언에 담화 문면 그대로 등장시켜라(선지 인용 verbatim 성립 조건).",
    );
  } else if (focus === "REBUT") {
    lines.push(
      "- debateFocus=REBUT 로 출제하라: <보기>에 'ㄱ./ㄴ.' 항목 자료 2~3개를 동봉하고, 발문은 <보기> 활용 반론('<보기>를 활용하여 ~ 반론을 펼친다고 할 때, 그 내용으로 가장 적절한 것은?'), 전 선지가 자료 항목(ㄱ·ㄴ)을 지시. points=3(자료 결합형 3점 관행).",
    );
  } else {
    lines.push(
      "- debateFocus=STRATEGY 로 출제하라: 발문은 입론 말하기 방식('찬성 1'과 '반대 1'의 입론에 대한 설명), 전 선지가 \"찬성 n은 ~하고 있고, 반대 n은 ~하고 있다.\" 대칭 구조.",
    );
  }
  const topicType = settings.topicType;
  if (topicType === "FACT") {
    lines.push("- 논제 유형: 사실 논제 — '논제: ~이 사실이다/~이다.' 형으로, 검증 가능한 사실 판단을 다투게 하라.");
  } else if (topicType === "VALUE") {
    lines.push("- 논제 유형: 가치 논제 — '논제: ~은 바람직하다.' 형으로, 평가 기준의 우선순위를 다투게 하라.");
  } else {
    lines.push("- 논제 유형: 정책 논제(기본) — '논제: ~해야 한다.' 형. 필수 쟁점(문제의 심각성·방안의 실행 가능성·효과/부작용)이 입론에 드러나게 하라.");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 교과 개념을 결합하라 — 논제 유형(사실/가치/정책) 판별, 반대신문식 절차 명칭(입론→반대 신문→반론→최종 발언), 필수 쟁점 개념이 선지·해설에 등장해도 좋다(예: '반대 신문 단계에서 상대 근거의 출처를 확인하고 있다'). 담화는 교과서 토론 단원의 정형을 따르라.",
    );
  } else {
    lines.push(
      "- 수능(학평) 모드: 2028 공통 '화법과 언어' 대비 신체제 학평(2026.3 고1 4~6번) 정합 — 개념 암기가 아니라 담화 문면 판정만으로 정오가 갈리게 하라. 절차 명칭은 사회자 발언에 자연스럽게만 노출.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 결정론 검증 헬퍼 — 토론 담화 구조·화자 라벨·모드별 선지 형식
// ---------------------------------------------------------------------------

const TOPIC_LINE_RE = /^\s*논제\s*[:：]/;
const MODERATOR_LINE_RE = /^\s*사회자\s*[:：]/;
const SPEAKER_LINE_RE = /^\s*(찬성|반대)\s*([12])\s*[:：]/;
/** 선지·발문의 측 지시("찬성 1"·"찬성 측") — '반대 신문'·'반대한다'는 매칭되지 않는다. */
const PRO_MENTION_RE = /찬성\s*(?:측|[12])/;
const CON_MENTION_RE = /반대\s*(?:측|[12])/;
const NUMBERED_SPEAKER_RE = /(찬성|반대)\s*([0-9]+)(?=\D|$)/g;
const BOGI_ITEM_RE = /^\s*([ㄱㄴㄷㄹ])\s*[.．]/;

type DebateFocus = "STRATEGY" | "MATRIX" | "REBUT";

function readFocus(question: Record<string, unknown>): DebateFocus {
  return question.debateFocus === "MATRIX" || question.debateFocus === "REBUT"
    ? question.debateFocus
    : "STRATEGY";
}

function readDebateBlocks(question: Record<string, unknown>): KoRenderStimulusBlock[] {
  return readKoStimulusBlocks(question.koStimulus).filter((b) => b.kind === "DEBATE");
}

function readOptions(question: Record<string, unknown>): { label: string; text: string }[] {
  if (!Array.isArray(question.options)) return [];
  return (question.options as Record<string, unknown>[])
    .filter((o) => !!o && typeof o === "object")
    .map((o) => ({
      label: typeof o.label === "string" ? o.label : "",
      text: typeof o.text === "string" ? o.text : "",
    }));
}

function readBogiLines(question: Record<string, unknown>): string[] {
  if (!question.bogi || typeof question.bogi !== "object") return [];
  const lines = (question.bogi as Record<string, unknown>).lines;
  return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === "string") : [];
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const options = readOptions(question);
  const focus = readFocus(question);

  // ── 결정론 검사 ①: 토론 담화(DEBATE) 구조 ──────────────────────────────
  // 논제 행 + 사회자 + 양측 화자 라벨 + '입론' 절차 표지 — 반대신문식 토론의
  // 최소 구조. (자료 자체의 존재는 공통 게이트 ko-stimulus-missing 이 선차단하나,
  // kind 가 DEBATE 가 아닌 자료만 있는 경우까지 여기서 error 로 잡는다.)
  const blocks = readDebateBlocks(question);
  const speakers = new Set<string>();
  if (blocks.length === 0) {
    add(
      "error",
      "ko-stimulus-missing",
      "토론 담화(koStimulus kind='DEBATE')가 없습니다 — 이 유형의 필수 자료입니다",
    );
  } else {
    const lines = blocks.flatMap((b) => b.lines);
    if (!lines.some((l) => TOPIC_LINE_RE.test(l))) {
      add(
        "error",
        "ko-stimulus-missing",
        "토론 담화에 논제 행(\"논제: ~\")이 없습니다 — 첫 행 관행 위반",
      );
    }
    if (!lines.some((l) => MODERATOR_LINE_RE.test(l))) {
      add(
        "error",
        "ko-stimulus-missing",
        "토론 담화에 사회자 발언(\"사회자: …\")이 없습니다 — 절차 안내자가 필요합니다",
      );
    }
    for (const l of lines) {
      const m = l.match(SPEAKER_LINE_RE);
      if (m) speakers.add(`${m[1]} ${m[2]}`);
    }
    if (![...speakers].some((s) => s.startsWith("찬성"))) {
      add("error", "ko-stimulus-missing", "토론 담화에 찬성 측 발언(\"찬성 1: …\")이 없습니다");
    }
    if (![...speakers].some((s) => s.startsWith("반대"))) {
      add("error", "ko-stimulus-missing", "토론 담화에 반대 측 발언(\"반대 1: …\")이 없습니다");
    }
    if (!lines.join("\n").includes("입론")) {
      add(
        "error",
        "ko-stimulus-missing",
        "토론 담화에 '입론' 절차 표지가 없습니다 — 반대신문식 구조(입론·반대 신문)를 사회자 발언에 명시하세요",
      );
    }
  }

  // ── 결정론 검사 ②: 발문·선지가 지시한 번호 화자의 실존 ─────────────────
  // "찬성 3"처럼 담화에 발언이 없는 화자 지시는 고아 라벨 — 라벨-선지 대응 실패
  // 계열로 ko-marker-option-mismatch 를 재사용한다.
  if (speakers.size > 0) {
    const surfaces: { where: string; text: string }[] = [
      { where: "발문", text: direction },
      ...options.map((o) => ({ where: `${o.label} 선지`, text: o.text })),
    ];
    for (const s of surfaces) {
      if (!s.text) continue;
      NUMBERED_SPEAKER_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = NUMBERED_SPEAKER_RE.exec(s.text)) !== null) {
        const key = `${m[1]} ${m[2]}`;
        if (!speakers.has(key)) {
          add(
            "error",
            "ko-marker-option-mismatch",
            `${s.where}가 담화에 발언이 없는 화자 '${key}'를 지시합니다 — 화자 라벨과 담화가 일치해야 합니다`,
          );
        }
      }
    }
  }

  // ── 결정론 검사 ③: 모드-발문 정합 ──────────────────────────────────────
  if (direction) {
    if (focus === "STRATEGY" && !/(입론|말하기\s*방식|말하기\s*전략)/.test(direction)) {
      add(
        "error",
        "ko-direction-grammar",
        `STRATEGY 모드 발문이 입론·말하기 방식을 지시하지 않습니다: "${direction.slice(0, 40)}"`,
      );
    }
    if (focus === "MATRIX" && !/(쟁점|주장)/.test(direction)) {
      add(
        "error",
        "ko-direction-grammar",
        `MATRIX 모드 발문이 쟁점·주장 정리를 지시하지 않습니다: "${direction.slice(0, 40)}"`,
      );
    }
    if (focus === "REBUT") {
      if (!/보기/.test(direction)) {
        add(
          "error",
          "ko-direction-grammar",
          "REBUT 모드 발문이 <보기>를 지시하지 않습니다 — '<보기>를 활용하여 ~' 프레임이 필요합니다",
        );
      }
      if (!/(반론|반박)/.test(direction)) {
        add(
          "error",
          "ko-direction-grammar",
          "REBUT 모드 발문에 반론·반박 지시가 없습니다 — 자료 활용 반론 적절성 유형입니다",
        );
      }
    }
  }

  // ── 결정론 검사 ④: STRATEGY·MATRIX 대칭 선지(양측 동시 지시) ───────────
  if (focus === "STRATEGY" || focus === "MATRIX") {
    for (const o of options) {
      if (!o.text) continue;
      const pro = PRO_MENTION_RE.test(o.text);
      const con = CON_MENTION_RE.test(o.text);
      if (!pro || !con) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${o.label} 선지가 양측(찬성·반대)을 모두 지시하지 않습니다 — ${
            focus === "STRATEGY" ? "'찬성 n은 ~, 반대 n은 ~' 대칭 선지" : "쟁점×양측 매트릭스 선지"
          } 위반`,
        );
      }
    }
  }

  // ── 결정론 검사 ⑤: REBUT — <보기> 필수 + 자료 항목(ㄱ·ㄴ) 지시 ─────────
  if (focus === "REBUT") {
    const bogiLines = readBogiLines(question);
    if (bogiLines.length === 0) {
      add(
        "error",
        "ko-bogi-missing",
        "REBUT 모드는 <보기> 자료(ㄱ./ㄴ. 항목)가 필수인데 bogi 가 없습니다",
      );
    } else {
      const items = bogiLines
        .map((l) => l.match(BOGI_ITEM_RE)?.[1])
        .filter((it): it is string => typeof it === "string");
      if (items.length >= 2) {
        for (const o of options) {
          if (!o.text) continue;
          if (!items.some((it) => o.text.includes(it))) {
            add(
              "error",
              "ko-bogi-missing",
              `${o.label} 선지가 <보기> 자료 항목(${items.join("·")})을 하나도 지시하지 않습니다 — 자료 활용 반론 선지 3요소 위반`,
            );
          }
        }
      }
    }
    const points = typeof question.points === "number" ? question.points : 2;
    if (points < 3) {
      add(
        "warning",
        "ko-points-unusual",
        `<보기> 자료 기반 반론(REBUT)은 3점 관행입니다 (현재 ${points}점)`,
      );
    }
  }

  // ── 결정론 검사 ⑥: 모드별 선지 어미 (meta.optionEnding="any" — 여기서 판정) ─
  const endingKind = focus === "STRATEGY" ? "strategy" : "plain";
  for (const o of options) {
    if (!o.text) continue;
    const endingIssue = ctx.koText.optionEndingIssueKo(o.text, endingKind);
    if (endingIssue) {
      add("warning", "ko-option-ending", `${o.label} ${endingIssue}: "${o.text.slice(0, 40)}"`);
      break; // 같은 지적 반복 방지 — 첫 위반만
    }
  }

  // ── 결정론 검사 ⑦: 발문 극성 ↔ 근거 relation 정합 (KO_RD_FACT 미러) ────
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
  const distortRelations = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    const shouldBeDistorted = negativeStem ? isCorrect : !isCorrect;
    const hasSupport = relations.has("SUPPORTS");
    const hasDistort = [...relations].some((r) => distortRelations.has(r));
    if (shouldBeDistorted && !hasDistort) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 왜곡 선지인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다 — 극성 모순`,
      );
    }
    if (!shouldBeDistorted && !hasSupport) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 선지는 참 선지인데 SUPPORTS 근거가 없습니다 — 극성 모순`,
      );
    }
  }

  // ── 결정론 검사 ⑧: MATRIX — 쟁점명(debateIssues)의 담화 verbatim 실재 ────
  // [KO-TYPES-3] MATRIX 선지 정형("'[쟁점명]'에 대해 …")은 작은따옴표 인용이라
  // 공통 인용 게이트(quality/common.ts ko-quote-not-verbatim, blocking)가 지문∪
  // 보기∪자료 표면에서 verbatim 검사한다. 쟁점명이 담화 문면에 없으면 프롬프트가
  // 시킨 정격 출력 전체가 오차단되는 자기모순이 생기므로, 프롬프트가 쟁점명을
  // 담화(사회자 쟁점 정리 발언)에 verbatim 으로 싣게 강제하고 여기서 그 실재를
  // 결정론 검사한다 — debateIssues 를 인용 허용 표면(koStimulus)에 합류시키는
  // 정합 우세안(공통 게이트의 spanExists 와 동일한 koStimulusPlainText 합본 판정).
  // ko-stimulus-missing 은 KO_BLOCKING_CODES 등재 코드라 relaxed 폴백에서도 차단.
  if (focus === "MATRIX") {
    const debateIssues = Array.isArray(question.debateIssues)
      ? (question.debateIssues as unknown[]).filter(
          (v): v is string => typeof v === "string" && !!v.trim(),
        )
      : [];
    if (debateIssues.length < 2) {
      add(
        "error",
        "ko-stimulus-missing",
        `MATRIX 모드는 debateIssues(쟁점 2~4개)가 필수인데 ${debateIssues.length}개입니다`,
      );
    }
    const stimulusText = koStimulusPlainText(readKoStimulusBlocks(question.koStimulus));
    if (stimulusText) {
      for (const issue of debateIssues) {
        if (!ctx.koText.containsSpanKo(stimulusText, issue)) {
          add(
            "error",
            "ko-stimulus-missing",
            `쟁점명 '${issue.slice(0, 30)}' 이(가) 토론 담화 문면에 없습니다 — 사회자 쟁점 정리 발언 등에 verbatim 으로 등장해야 선지의 쟁점명 인용이 성립합니다`,
          );
        }
      }
    }
  }

  return issues;
}

export const KO_SP_DEBATE: KoTypeModule = {
  meta: {
    typeId: "KO_SP_DEBATE",
    area: SPEECH_AREA,
    label: "토론(입론·반대 신문·반론)",
    formatCategory: "객관식",
    uiGroup: SPEECH_UI_GROUP,
    answerFormat: "MC5",
    // 화법 유형 — 지문 미동봉(사용자 지문은 논제·소재 참고로만 프롬프트에 반영).
    includesPassage: false,
    // 소재 참고용 허용 갈래 — 사회 이슈·과학 쟁점 등 논제화 가능한 독서 계열 + 복합.
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "MIXED"],
    defaultPoints: 2,
    usesBogi: "optional", // REBUT 모드에서 필수 — validate 가 모드 조건부로 차단
    usesStimulus: "required",
    stimulusKinds: ["DEBATE"],
    markerFamilies: [],
    optionEnding: "any", // 모드별 상이(STRATEGY='~하고 있다', MATRIX/REBUT=평서형) — validate 가 판정
    needsSolverGate: false,
    description:
      "반대신문식 토론 담화(논제·사회자·찬성 1·2/반대 1·2)를 자체 생성하고, 입론 말하기 방식(대칭 선지)·쟁점×양측 주장 정오·<보기> 자료 반론 적절성을 판정하는 화법 유형 — 2028 공통 '화법과 언어' 대비",
    setSlot:
      "토론 3문항 트리오(STRATEGY→MATRIX→REBUT) — 평가원 선택과목 확인분 미출제, 교육청 학평(신체제 고1 4~6번 실증)·내신·EBS 중심, 2028 공통 대비 슬롯",
    studentTask:
      "토론 담화의 입론·반대 신문을 읽고, 양측의 말하기 방식·쟁점별 주장·<보기> 자료 반론의 정합을 판정합니다.",
    bestFor: [
      "2028 공통 '화법과 언어' 신체제 대비(고1·고2 학평 토론 세트)",
      "찬반 근거가 대등한 정책·가치 논제 훈련",
      "내신 화법 단원(논제 유형·반대신문식 절차) 결합 출제",
    ],
    outputUi: ["토론 담화 자료 박스", "5지선다(모드별 대칭/매트릭스/자료 반론 선지)", "REBUT 모드 〈보기〉 자료", "선지별 발언 근거 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "debateFocus",
        label: "출제 모드",
        kind: "select",
        options: [
          { value: "STRATEGY", label: "입론 말하기 방식(대칭 선지)" },
          { value: "MATRIX", label: "쟁점×양측 주장 정오" },
          { value: "REBUT", label: "〈보기〉 자료 반론 적절성(3점)" },
        ],
        defaultValue: "STRATEGY",
        description: "토론 트리오의 세 슬롯 — REBUT 은 〈보기〉 자료가 동봉되고 3점 관행입니다",
      },
      {
        key: "topicType",
        label: "논제 유형",
        kind: "select",
        options: [
          { value: "POLICY", label: "정책 논제(~해야 한다)" },
          { value: "FACT", label: "사실 논제(~이다)" },
          { value: "VALUE", label: "가치 논제(~은 바람직하다)" },
        ],
        defaultValue: "POLICY",
        description: "내신은 논제 유형 판별 개념까지 결합됩니다 (기본: 정책 논제)",
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
      includesPassage: false, // 화법 — 지문 미동봉(자료가 담화 본체)
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "쟁점 2개의 짧은 담화(발언 8행 내외). 왜곡은 CLAIM_FLIP(주장 방향 반전) 정면으로 — 한 발언과의 대조만으로 즉시 판정되게 하라. STRATEGY 는 화행 어휘를 담화 표지와 거의 일치시켜라.",
    INTERMEDIATE:
      "쟁점 2~3개, 반대 신문의 확인 질문-답변 교환을 담화에 넣어라. 왜곡은 LINK_FABRICATION(근거-주장 연결 조작) 위주 — 근거와 주장이 각각 실재해 두 발언의 왕복 대조가 필요하게. 참 선지 1개는 반대 신문 단계의 화행(전제 겨냥 질문)을 판정 대상으로.",
    KILLER:
      "HALF_TRUE 반쪽 참 대칭 선지를 정답으로 — 한쪽 절은 담화와 정확히 일치시키고 다른 쪽 절만 화행 오귀속으로 비틀어, 양쪽 절의 독립 검증을 강제하라. 참 선지들도 발언 표지의 재진술 거리를 최대화하고, 근거가 여러 발언에 분산된 주장을 판정 대상으로 삼아 전수 검증을 강제하라.",
  },
};
