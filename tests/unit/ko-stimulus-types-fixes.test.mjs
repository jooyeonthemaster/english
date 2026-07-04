import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// ============================================================================
// F3-stimulus-types 적대검수 확정결함 수정 회귀 고정 (2차 감사)
// ============================================================================
// KO-TYPES-1: stimulus 마커 검증 표면 = 렌더 표면 (resolveKoStimulusMarkers 공유,
//             블록별 lines 전용·title 제외·occurrence 클램프 금지) — 재현 3케이스
//             (title 겹침 occ 시프트 / title 전용 span / 복수블록 클램프)가 게이트에서 차단.
// KO-TYPES-2: KO_SP_PLAN PLAN_ENDING_RE 를 '-아/어야겠(다|어)' 활용 전반으로 확장
//             (KO_WR_PLAN 과 동일 정규식) — 끌어야겠어·높여야겠어·도와야겠어 통과.
// KO-TYPES-3: KO_SP_DEBATE MATRIX 쟁점명 인용-verbatim 충돌 해소 — 프롬프트가 쟁점명을
//             담화에 verbatim 강제 + validate 가 debateIssues 실재를 결정론 검사.
// KO-TYPES-4: sets/leakage readKoEnvelopeMarkers 의 targetSurface 보존 — 공유지문
//             병합·패밀리/겹침/같은문장 검사는 지문 마커만, 노출면 스캔에 koStimulus 합류.
// ============================================================================

const harnessSource = `
// tsx runs these .ts modules as CommonJS (no "type":"module"), so Node's ESM
// interop only exposes the default export — destructure the named exports off it.
import renderModelMod from "@/lib/korean/core/render-model";
import commonMod from "@/lib/korean/quality/common";
import koTextMod from "@/lib/korean/core/ko-text";
import planMod from "@/lib/korean/types/KO_SP_PLAN";
import debateMod from "@/lib/korean/types/KO_SP_DEBATE";
import leakageMod from "@/lib/korean/sets/leakage";
import paperMod from "@/lib/korean/sets/paper";

const { buildDefaultKoRenderModel, resolveKoStimulusMarkers } = renderModelMod;
const { validateKoCommon } = commonMod;
const koText = koTextMod;
const { KO_SP_PLAN } = planMod;
const { KO_SP_DEBATE } = debateMod;
const { readKoEnvelopeMarkers, readKoEnvelopeExposedTexts, scanKoSetForLeakage } = leakageMod;
const { buildKoSetSharedPassage } = paperMod;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}
const codesOf = (issues: any[]) => issues.map((i: any) => i.code);
const MARKER_CODES = ["ko-marker-unresolved", "ko-marker-overlap", "ko-marker-order"];
const markerIssuesOf = (issues: any[]) => issues.filter((i: any) => MARKER_CODES.includes(i.code));

const baseMeta = {
  typeId: "KO_SP_TEST",
  area: "NAESIN",
  label: "테스트",
  formatCategory: "객관식",
  uiGroup: "국어 독서",
  answerFormat: "MC5",
  includesPassage: false,
  passageKinds: [],
  defaultPoints: 2,
  usesBogi: "none",
  usesStimulus: "optional",
  markerFamilies: ["KOR_CIRCLED", "LATIN_CIRCLED"],
  optionEnding: "any",
  needsSolverGate: false,
  description: "",
  setSlot: "",
  studentTask: "",
  bestFor: [],
  outputUi: [],
} as any;
const ctx = { passage: "", passageKind: null, examMode: "SUNEUNG", difficulty: "INTERMEDIATE", koText } as any;

function mc5Boilerplate() {
  return {
    direction: "위 자료에 대한 설명으로 가장 적절한 것은?",
    options: [
      { label: "①", text: "o1 이다." },
      { label: "②", text: "o2 이다." },
      { label: "③", text: "o3 이다." },
      { label: "④", text: "o4 이다." },
      { label: "⑤", text: "o5 이다." },
    ],
    correctAnswer: "①",
    evidence: [
      { optionLabel: "①", spanText: "자료 검증용", relation: "SUPPORTS" },
      { optionLabel: "②", spanText: "자료 검증용", relation: "CONTRADICTS" },
      { optionLabel: "③", spanText: "자료 검증용", relation: "CONTRADICTS" },
      { optionLabel: "④", spanText: "자료 검증용", relation: "CONTRADICTS" },
      { optionLabel: "⑤", spanText: "자료 검증용", relation: "CONTRADICTS" },
    ],
  };
}

// ════════════════════════════════════════════════════════════════════════════
// KO-TYPES-1 — 검증 표면과 렌더 표면 통일
// ════════════════════════════════════════════════════════════════════════════

// (a) title 겹침 occurrence 시프트: 합본(title 포함) 기준 occurrenceIndex 는 통과했지만
//     렌더(lines 전용)에서는 클램프로 다른 위치에 찍히던 케이스 → 게이트가 차단해야 한다.
{
  const q = {
    ...mc5Boilerplate(),
    koStimulus: [
      {
        kind: "PLAN_NOTE",
        title: "독서 일지 작성 계획 메모",
        lines: ["책을 읽으며 독서 일지 작성 시점을 정하기로 한다.", "자료 검증용 문장이다."],
      },
    ],
    markers: [
      {
        family: "LATIN_CIRCLED",
        label: "ⓐ",
        spanText: "독서 일지 작성",
        occurrenceIndex: 1, // 합본 기준(title=occ0, 1행=occ1) — lines 전용 표면엔 occ0 하나뿐
        targetSurface: "stimulus",
      },
    ],
  };
  const issues = validateKoCommon(q, baseMeta, ctx);
  check(
    "TYPES-1(a): title 겹침 occ 시프트 → ko-marker-unresolved(error) 차단",
    issues.some((i: any) => i.code === "ko-marker-unresolved" && i.severity === "error"),
  );
}

// (b) title 에만 있는 스팬: 종전 게이트 통과 + 렌더 소실 → 게이트가 차단해야 한다.
{
  const q = {
    ...mc5Boilerplate(),
    koStimulus: [
      { kind: "PLAN_NOTE", title: "예습 계획 메모", lines: ["내일 배울 단원을 훑어본다.", "자료 검증용 문장."] },
    ],
    markers: [
      { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "예습 계획", targetSurface: "stimulus" },
    ],
  };
  const issues = validateKoCommon(q, baseMeta, ctx);
  check(
    "TYPES-1(b): title 전용 span → ko-marker-unresolved(error) 차단",
    issues.some((i: any) => i.code === "ko-marker-unresolved" && i.severity === "error"),
  );
  // 렌더 표면과의 정합 확인 — 렌더에도 ⓐ 는 없다(게이트가 이걸 이제 잡는다).
  const model = buildDefaultKoRenderModel({
    question: q,
    passage: "",
    includesPassage: false,
    answerFormat: "MC5",
    defaultPoints: 2,
  });
  const rendered = (model.stimulus ?? []).flatMap((b: any) => b.lines).join("\\n");
  check("TYPES-1(b): 렌더 lines 에 ⓐ 부재(검증-렌더 정합)", !rendered.includes("ⓐ"));
}

// (c) 복수 블록 클램프: 합본 기준 occurrenceIndex=1 이 (가) 블록에 클램프 오배치되던
//     케이스 → 게이트가 위치 모호로 차단해야 한다.
{
  const q = {
    ...mc5Boilerplate(),
    koStimulus: [
      { kind: "DIALOGUE", label: "(가)", lines: ["학생 1: 공통 문구가 첫 자료에 있다.", "자료 검증용 행."] },
      { kind: "DRAFT", label: "(나)", lines: ["공통 문구가 둘째 자료에 있다."] },
    ],
    markers: [
      {
        family: "KOR_CIRCLED",
        label: "㉠",
        spanText: "공통 문구",
        occurrenceIndex: 1, // 합본 기준 2번째 = (나) 의도 — (가) 표면엔 1회뿐(클램프 위치 모호)
        targetSurface: "stimulus",
      },
    ],
  };
  const issues = validateKoCommon(q, baseMeta, ctx);
  check(
    "TYPES-1(c): 복수블록 클램프 → ko-marker-unresolved(error) 차단",
    issues.some((i: any) => i.code === "ko-marker-unresolved" && i.severity === "error"),
  );
}

// (d) 정상 케이스: 같은 블록 lines 안에 2회 등장 + occurrenceIndex=1 → 게이트 통과,
//     렌더도 같은 표면 기준으로 2번째 등장(2행)에 병합 — 검증 행 = 렌더 행.
{
  const q = {
    ...mc5Boilerplate(),
    koStimulus: [
      {
        kind: "PLAN_NOTE",
        title: "메모",
        lines: ["독서 일지 작성 방법을 정리한다. 자료 검증용.", "책을 읽으며 독서 일지 작성 시점을 정한다."],
      },
    ],
    markers: [
      { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "독서 일지 작성", occurrenceIndex: 1, targetSurface: "stimulus" },
    ],
  };
  const issues = markerIssuesOf(validateKoCommon(q, baseMeta, ctx));
  check("TYPES-1(d): 유일 해소 마커는 무발화", issues.length === 0);
  const model = buildDefaultKoRenderModel({
    question: q,
    passage: "",
    includesPassage: false,
    answerFormat: "MC5",
    defaultPoints: 2,
  });
  const lines = model.stimulus?.[0]?.lines ?? [];
  check(
    "TYPES-1(d): 렌더도 2행(occ#1)에 병합 — 검증 표면과 동일",
    !String(lines[0]).includes("ⓐ") && String(lines[1]).includes("ⓐ__독서 일지 작성__"),
  );
}

// (e) 블록 간 라벨 순서 역전 → ko-marker-order 경고 (합본 검사가 하던 순서 감시 유지)
{
  const q = {
    ...mc5Boilerplate(),
    koStimulus: [
      { kind: "DIALOGUE", label: "(가)", lines: ["둘째로 마킹할 구절이 먼저 나온다."] },
      { kind: "DRAFT", label: "(나)", lines: ["첫째로 마킹할 구절이 나중에 나온다."] },
    ],
    markers: [
      { family: "KOR_CIRCLED", label: "㉠", spanText: "첫째로 마킹할 구절", targetSurface: "stimulus" },
      { family: "KOR_CIRCLED", label: "㉡", spanText: "둘째로 마킹할 구절", targetSurface: "stimulus" },
    ],
  };
  const issues = validateKoCommon(q, baseMeta, ctx);
  check(
    "TYPES-1(e): 블록순 라벨 역전 → ko-marker-order 경고",
    issues.some((i: any) => i.code === "ko-marker-order" && i.severity === "warning"),
  );
}

// (f) 공유 헬퍼 계약: 게이트/렌더가 같은 배정을 쓴다 — perBlock/unassigned 직접 검증
{
  const blocks = [
    { kind: "DIALOGUE", lines: ["여기에만 있는 구절."] },
    { kind: "DRAFT", title: "제목 전용 구절", lines: ["다른 내용."] },
  ] as any[];
  const markers = [
    { family: "KOR_CIRCLED", label: "㉠", spanText: "여기에만 있는 구절", targetSurface: "stimulus" },
    { family: "KOR_CIRCLED", label: "㉡", spanText: "제목 전용 구절", targetSurface: "stimulus" },
  ] as any[];
  const assignment = resolveKoStimulusMarkers(blocks as any, markers as any);
  check(
    "TYPES-1(f): 헬퍼 — lines 해소분은 배정, title 전용은 unassigned",
    assignment.perBlock[0].markers.length === 1 &&
      assignment.unassigned.length === 1 &&
      assignment.unassigned[0].label === "㉡",
  );
}

// ════════════════════════════════════════════════════════════════════════════
// KO-TYPES-2 — KO_SP_PLAN 계획 종결 활용 전반 수용
// ════════════════════════════════════════════════════════════════════════════

function spPlanQuestion() {
  const planItems = [
    "◦ 짧은 퀴즈로 청중의 주의를 끌어야겠어.",
    "◦ 조사 결과 수치로 내용의 신뢰를 높여야겠어.",
    "◦ 사진 자료로 청중의 이해를 도와야겠어.",
    "◦ 두 개념의 장단점을 비교하여 분석해야겠어.",
    "◦ 실천을 당부하며 발표를 마무리해야겠어.",
  ];
  return {
    direction: "다음은 발표 전 계획이다. 발표에 반영되지 않은 것은?",
    koStimulus: [
      { kind: "PLAN_NOTE", title: "발표 전 계획", lines: ["[도입]", planItems[0], "[전개]", planItems[1], planItems[2], planItems[3], "[정리]", planItems[4]] },
      {
        kind: "SPEECH_SCRIPT",
        title: "발표문",
        lines: [
          "여러분, 발표를 시작하기 전에 짧은 퀴즈 하나로 주의를 모아 보겠습니다. 아침을 거르는 학생이 얼마나 될까요?",
          "학생회 조사에 따르면 우리 학교 학생의 60퍼센트가 아침을 거른다고 합니다.",
          "(사진을 가리키며) 이 사진은 아침 식사를 준비하는 급식실의 모습입니다.",
          "끝으로 내일 아침부터 한 가지라도 실천해 보시기를 당부하며 발표를 마치겠습니다. 감사합니다.",
        ],
      },
    ],
    options: planItems.map((t, i) => ({ label: ["①", "②", "③", "④", "⑤"][i], text: t.replace(/^◦\\s*/, "") })),
    correctAnswer: "④",
    evidence: [
      { optionLabel: "①", relation: "SUPPORTS", spanText: "짧은 퀴즈 하나로 주의를 모아 보겠습니다" },
      { optionLabel: "②", relation: "SUPPORTS", spanText: "학생의 60퍼센트가 아침을 거른다고 합니다" },
      { optionLabel: "③", relation: "SUPPORTS", spanText: "이 사진은 아침 식사를 준비하는 급식실의 모습입니다" },
      { optionLabel: "④", relation: "NOT_MENTIONED", spanText: "아침을 거른다고 합니다" },
      { optionLabel: "⑤", relation: "SUPPORTS", spanText: "실천해 보시기를 당부하며" },
    ],
  };
}

{
  const q = spPlanQuestion();
  const issues = KO_SP_PLAN.validate!(q as any, ctx);
  const errors = issues.filter((i: any) => i.severity === "error");
  check("TYPES-2: 비'하다' 활용 3항(끌어야겠어·높여야겠어·도와야겠어) 계획 5항 인정 — error 0", errors.length === 0);
  check(
    "TYPES-2: 계획 개수 오차단(ko-marker-option-mismatch '정확히 5개') 미발화",
    !issues.some((i: any) => i.code === "ko-marker-option-mismatch" && String(i.message).includes("정확히 5개")),
  );
  check("TYPES-2: 선지 어미 경고(ko-option-ending) 오발 없음", !codesOf(issues).includes("ko-option-ending"));

  // 판별력 유지: 계획 종결이 아닌 행은 여전히 계상 제외 → 5항 미달 차단
  const broken = spPlanQuestion();
  (broken.koStimulus[0].lines as string[])[1] = "◦ 짧은 퀴즈로 청중의 주의를 끌어 볼래.";
  const brokenIssues = KO_SP_PLAN.validate!(broken as any, ctx);
  check(
    "TYPES-2: 비계획 종결('~볼래')은 여전히 5항 미달로 차단",
    brokenIssues.some((i: any) => i.code === "ko-marker-option-mismatch" && String(i.message).includes("정확히 5개")),
  );
}

// ════════════════════════════════════════════════════════════════════════════
// KO-TYPES-3 — KO_SP_DEBATE MATRIX 쟁점명 인용-verbatim 정합
// ════════════════════════════════════════════════════════════════════════════

function matrixDebateQuestion() {
  return {
    direction: "위 토론의 쟁점별 양측 주장을 정리한 내용으로 적절하지 않은 것은?",
    debateFocus: "MATRIX",
    debateIssues: ["자판기 설치의 건강 영향", "수익금 활용의 투명성"],
    distortionPrinciple: "CLAIM_FLIP",
    koStimulus: [
      {
        kind: "DEBATE",
        lines: [
          "논제: 교내 자판기 설치를 허용해야 한다.",
          "사회자: 오늘 토론의 쟁점은 '자판기 설치의 건강 영향'과 '수익금 활용의 투명성'입니다. 먼저 찬성 측이 입론해 주십시오.",
          "찬성 1: 자판기에 영양 성분 표시가 된 제품만 들이면 건강 영향은 관리할 수 있습니다. 또한 수익금 사용 내역을 매달 공개하면 투명성을 확보할 수 있습니다.",
          "반대 2: 영양 성분 표시만으로 고열량 음료의 섭취를 막을 수 있습니까?",
          "찬성 1: 표시와 함께 판매 품목을 제한하면 충분히 막을 수 있습니다.",
          "사회자: 다음으로 반대 측이 입론해 주십시오.",
          "반대 1: 자판기의 고열량 음료는 학생 건강을 해칩니다. 또한 수익금 관리 주체가 불분명해 투명성을 담보하기 어렵습니다.",
        ],
      },
    ],
    options: [
      { label: "①", text: "'자판기 설치의 건강 영향'에 대해 찬성 측은 관리할 수 있다고 주장하고, 반대 측은 건강을 해친다고 주장한다." },
      { label: "②", text: "'수익금 활용의 투명성'에 대해 찬성 측은 공개로 확보할 수 있다고 주장하고, 반대 측은 담보하기 어렵다고 주장한다." },
      { label: "③", text: "'자판기 설치의 건강 영향'에 대해 찬성 측은 건강을 해친다고 주장하고, 반대 측은 관리할 수 있다고 주장한다." },
      { label: "④", text: "'수익금 활용의 투명성'에 대해 찬성 측은 사용 내역 공개를 제안하고, 반대 측은 관리 주체의 불분명함을 지적한다." },
      { label: "⑤", text: "'자판기 설치의 건강 영향'에 대해 찬성 측은 품목 제한을 제안하고, 반대 측은 고열량 음료의 위험을 지적한다." },
    ],
    correctAnswer: "③",
    evidence: [
      { optionLabel: "①", relation: "SUPPORTS", spanText: "건강 영향은 관리할 수 있습니다" },
      { optionLabel: "②", relation: "SUPPORTS", spanText: "수익금 사용 내역을 매달 공개하면 투명성을 확보할 수 있습니다" },
      { optionLabel: "③", relation: "DISTORTS", spanText: "자판기의 고열량 음료는 학생 건강을 해칩니다" },
      { optionLabel: "④", relation: "SUPPORTS", spanText: "수익금 관리 주체가 불분명해 투명성을 담보하기 어렵습니다" },
      { optionLabel: "⑤", relation: "SUPPORTS", spanText: "판매 품목을 제한하면 충분히 막을 수 있습니다" },
    ],
    explanation: "③은 양측 주장을 맞바꾼 왜곡이다.",
  };
}

{
  // 정격(쟁점명이 사회자 발언에 verbatim): 유형 검증 + 공통 인용 게이트 모두 통과
  const q = matrixDebateQuestion();
  const typeIssues = KO_SP_DEBATE.validate!(q as any, ctx);
  check(
    "TYPES-3: 쟁점명 담화 verbatim 정격 → 유형 error 0",
    typeIssues.filter((i: any) => i.severity === "error").length === 0,
  );
  const commonIssues = validateKoCommon(q as any, KO_SP_DEBATE.meta as any, ctx);
  check(
    "TYPES-3: 공통 인용 게이트(ko-quote-not-verbatim) 미발화 — 충돌 해소",
    !codesOf(commonIssues).includes("ko-quote-not-verbatim"),
  );

  // 쟁점명이 담화 문면에 없으면 유형 검증이 결정론 차단(재생성 반려)
  const missing = matrixDebateQuestion();
  missing.debateIssues = ["자판기 설치의 교육적 효과", "수익금 활용의 투명성"];
  const missingIssues = KO_SP_DEBATE.validate!(missing as any, ctx);
  check(
    "TYPES-3: 담화에 없는 쟁점명 → ko-stimulus-missing(error) 차단",
    missingIssues.some(
      (i: any) => i.code === "ko-stimulus-missing" && i.severity === "error" && String(i.message).includes("쟁점명"),
    ),
  );

  // MATRIX 인데 debateIssues 누락 → 차단 (스키마 optional 탈주 방어)
  const noIssues = matrixDebateQuestion() as any;
  delete noIssues.debateIssues;
  check(
    "TYPES-3: MATRIX + debateIssues 누락 → error 차단",
    KO_SP_DEBATE.validate!(noIssues, ctx).some(
      (i: any) => i.code === "ko-stimulus-missing" && String(i.message).includes("debateIssues"),
    ),
  );

  // STRATEGY 모드는 쟁점명 인용 정형이 없어 무영향(무회귀)
  const strategy = matrixDebateQuestion() as any;
  strategy.debateFocus = "STRATEGY";
  strategy.direction = "'찬성 1'과 '반대 1'의 입론에 대한 설명으로 가장 적절한 것은?";
  strategy.debateIssues = ["담화에 없는 쟁점명이어도 무관"];
  check(
    "TYPES-3(무회귀): STRATEGY 모드는 쟁점명 검사 미적용",
    !KO_SP_DEBATE.validate!(strategy, ctx).some(
      (i: any) => i.code === "ko-stimulus-missing" && String(i.message).includes("쟁점명"),
    ),
  );

  // 프롬프트 계약: 쟁점명 verbatim 규칙이 프롬프트에 실림
  check("TYPES-3: 프롬프트에 쟁점명 verbatim 규칙 명시", String(KO_SP_DEBATE.prompt).includes("쟁점명 verbatim 규칙"));
}

// ════════════════════════════════════════════════════════════════════════════
// KO-TYPES-4 — 세트 계층의 stimulus 마커 분리 + 노출면에 koStimulus 합류
// ════════════════════════════════════════════════════════════════════════════

const setPassage =
  "그날 밤 나는 강가에서 어머니의 낡은 반짇고리를 오래도록 바라보았다. 달빛이 물결 위에 흩어졌다.";

{
  // readKoEnvelopeMarkers — targetSurface 보존
  const markers = readKoEnvelopeMarkers({
    markers: [
      { family: "KOR_CIRCLED", label: "㉠", spanText: "구절" },
      { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "반짇고리", targetSurface: "stimulus" },
      { family: "LATIN_CIRCLED", label: "ⓑ", spanText: "어휘", targetSurface: "junk" },
    ],
  });
  check(
    "TYPES-4: readKoEnvelopeMarkers targetSurface 보존(stimulus)·비규격 값은 undefined",
    markers.length === 3 &&
      markers[0].targetSurface === undefined &&
      markers[1].targetSurface === "stimulus" &&
      markers[2].targetSurface === undefined,
  );
}

{
  // 공유지문 병합 — stimulus 마커는 지문에 우연히 있어도 병합하지 않는다
  const memberA = {
    markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "어머니의 낡은 반짇고리를 오래도록" }],
  };
  const memberB = {
    markers: [{ family: "LATIN_CIRCLED", label: "ⓐ", spanText: "반짇고리", targetSurface: "stimulus" }],
  };
  const shared = buildKoSetSharedPassage(setPassage, [memberA, memberB]);
  check("TYPES-4: 공유지문에 지문 마커(㉠) 병합", shared.includes("㉠__어머니의 낡은 반짇고리를 오래도록__"));
  check("TYPES-4: stimulus 마커(ⓐ)는 공유지문에 미병합", !shared.includes("ⓐ"));

  // 무회귀: targetSurface 없는 마커는 종전 그대로 병합
  const legacy = buildKoSetSharedPassage(setPassage, [
    { markers: [{ family: "LATIN_CIRCLED", label: "ⓐ", spanText: "달빛" }] },
  ]);
  check("TYPES-4(무회귀): 지문 마커는 종전대로 병합", legacy.includes("ⓐ__달빛__"));
}

{
  // scanKoSetForLeakage — stimulus 마커는 패밀리 독점/예약·겹침·같은문장 계상 제외
  const scan = scanKoSetForLeakage(
    [
      {
        index: 0,
        typeId: "KO_RD_INFER",
        markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "어머니의 낡은 반짇고리를 오래도록" }],
        answerTexts: [],
        exposedTexts: [],
        allowedFamilies: ["KOR_CIRCLED"],
      },
      {
        index: 1,
        typeId: "KO_SP_FUNC",
        markers: [
          { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "반짇고리", targetSurface: "stimulus" } as any,
        ],
        answerTexts: [],
        exposedTexts: [],
        allowedFamilies: [], // 지문 마킹 금지 슬롯 — stimulus 마커는 예약 위반이 아니어야 한다
      },
    ],
    setPassage,
  );
  const scanCodes = scan.conflicts.map((c: any) => c.code);
  check(
    "TYPES-4: stimulus 마커는 family-forbidden/overlap/same-sentence 미계상 → OK",
    scan.status === "OK" &&
      !scanCodes.includes("ko-set-family-forbidden") &&
      !scanCodes.includes("ko-set-marker-overlap") &&
      !scanCodes.includes("ko-set-same-sentence"),
  );

  // 무회귀: 같은 마커가 지문 마커(targetSurface 생략)면 종전대로 차단된다
  const regression = scanKoSetForLeakage(
    [
      {
        index: 0,
        typeId: "KO_RD_INFER",
        markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "어머니의 낡은 반짇고리를 오래도록" }],
        answerTexts: [],
        exposedTexts: [],
        allowedFamilies: ["KOR_CIRCLED"],
      },
      {
        index: 1,
        typeId: "KO_RD_VOCAB",
        markers: [{ family: "LATIN_CIRCLED", label: "ⓐ", spanText: "반짇고리" }],
        answerTexts: [],
        exposedTexts: [],
        allowedFamilies: [],
      },
    ],
    setPassage,
  );
  const regCodes = regression.conflicts.map((c: any) => c.code);
  check(
    "TYPES-4(무회귀): 지문 마커 예약 위반·겹침은 종전대로 ERROR",
    regression.status === "CONFLICT" && regCodes.includes("ko-set-family-forbidden"),
  );
}

{
  // readKoEnvelopeExposedTexts — koStimulus title+lines 합류
  const exposed = readKoEnvelopeExposedTexts({
    direction: "발문이다.",
    koStimulus: [
      { kind: "DRAFT", title: "학생의 초고", lines: ["우리 마을의 전통 시장은 오랜 세월 동안 주민들의 삶과 함께해 왔다."] },
    ],
    explanation: "해설이다.",
  });
  check(
    "TYPES-4: 노출면에 koStimulus title+lines 포함",
    exposed.includes("학생의 초고") &&
      exposed.includes("우리 마을의 전통 시장은 오랜 세월 동안 주민들의 삶과 함께해 왔다."),
  );

  // 자료 표면의 세트 간 정답 verbatim 노출이 이제 스캔에 잡힌다
  const leakScan = scanKoSetForLeakage(
    [
      {
        index: 0,
        typeId: "KO_WR_PLAN",
        markers: [],
        answerTexts: [],
        exposedTexts: exposed,
      },
      {
        index: 1,
        typeId: "KO_NS_SHORT",
        markers: [],
        answerTexts: ["우리 마을의 전통 시장은 오랜 세월 동안 주민들의 삶과 함께해 왔다"],
        exposedTexts: ["발문 2"],
      },
    ],
    setPassage,
  );
  check(
    "TYPES-4: 자료 표면의 타 멤버 정답 verbatim → ko-set-answer-leak ERROR",
    leakScan.conflicts.some((c: any) => c.code === "ko-set-answer-leak" && c.severity === "ERROR"),
  );
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-stimulus-types-fixes-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    // Run through a shell so Windows resolves `npx` (only exists as npx.cmd);
    // execSync takes a single quoted command string (no DEP0190 args warning).
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

test("ko stimulus types fixes: KO-TYPES-1/2/3/4 repro blocked + no-regression", () => {
  const summary = runHarness();
  assert.equal(
    summary.failed,
    0,
    `ko-stimulus-types-fixes failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 18, `expected >=18 checks, got ${summary.passed}`);
});
