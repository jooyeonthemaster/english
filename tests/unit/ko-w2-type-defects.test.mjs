import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// W2 — 판정단(소넷) FAIL/major 수정 + 저수율 유형 게이트 보정의 결정론 검증.
// 대상: KO_NS_EXTRACT(문장 경계) · KO_SP_FUNC(발화 순서 환각) · KO_SP_PLAN(bogi 금지) ·
//       KO_WR_METHOD(전 근거 초고 표면) · KO_WR_REVISE(원문자 하드코딩) ·
//       KO_GR_ELEMENT(매트릭스 자기모순) · KO_GR_MORPH(매칭형 재사용 오탐 완화) ·
//       KO_WR_COND(대안 종결 오차단 해소) · KO_LIT_FACT(고아 마커) · 프롬프트 보강 존재.
const harnessSource = `
import koTextMod from "@/lib/korean/core/ko-text";
import nsExtractMod from "@/lib/korean/types/KO_NS_EXTRACT";
import spFuncMod from "@/lib/korean/types/KO_SP_FUNC";
import spPlanMod from "@/lib/korean/types/KO_SP_PLAN";
import wrMethodMod from "@/lib/korean/types/KO_WR_METHOD";
import wrReviseMod from "@/lib/korean/types/KO_WR_REVISE";
import grElementMod from "@/lib/korean/types/KO_GR_ELEMENT";
import grMorphMod from "@/lib/korean/types/KO_GR_MORPH";
import wrCondMod from "@/lib/korean/types/KO_WR_COND";
import litFactMod from "@/lib/korean/types/KO_LIT_FACT";
import rdCritMod from "@/lib/korean/types/KO_RD_CRIT";
import rdVocabMod from "@/lib/korean/types/KO_RD_VOCAB";
import grNormMod from "@/lib/korean/types/KO_GR_NORM";
import grHistMod from "@/lib/korean/types/KO_GR_HIST";
import litCompareMod from "@/lib/korean/types/KO_LIT_COMPARE";
import grApplyMod from "@/lib/korean/types/KO_GR_APPLY";
import grPhonoMod from "@/lib/korean/types/KO_GR_PHONO";

const koText = koTextMod;
const { KO_NS_EXTRACT } = nsExtractMod;
const { KO_SP_FUNC } = spFuncMod;
const { KO_SP_PLAN } = spPlanMod;
const { KO_WR_METHOD } = wrMethodMod;
const { KO_WR_REVISE } = wrReviseMod;
const { KO_GR_ELEMENT } = grElementMod;
const { KO_GR_MORPH } = grMorphMod;
const { KO_WR_COND } = wrCondMod;
const { KO_LIT_FACT } = litFactMod;
const { KO_RD_CRIT } = rdCritMod;
const { KO_RD_VOCAB } = rdVocabMod;
const { KO_GR_NORM } = grNormMod;
const { KO_GR_HIST } = grHistMod;
const { KO_LIT_COMPARE } = litCompareMod;
const { KO_GR_APPLY } = grApplyMod;
const { KO_GR_PHONO } = grPhonoMod;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}
function ctxFor(passage) {
  return { passage, passageKind: null, examMode: "SUNEUNG", difficulty: "INTERMEDIATE", koText };
}
function issuesOf(mod, question, passage) {
  return mod.validate(question, ctxFor(passage));
}
function errorsOf(mod, question, passage) {
  return issuesOf(mod, question, passage).filter((i) => i.severity === "error");
}

// ════════════════════════════════════════════════════════════════════════════
// 1) KO_NS_EXTRACT — firstLastMode 정답의 실제 문장 경계 결정론 검증
// ════════════════════════════════════════════════════════════════════════════
const extractPassage = [
  "은행은 예금의 일부만 남기고 대출한다.",
  "다만 최종 대부자 기능은 상환 능력이 있는 은행의 일시적 위기에 한해 작동하는 것이 원칙인데, 부실 은행까지 구제할 경우 도덕적 해이가 유발될 수 있기 때문이다.",
  "예금자 보호 제도는 별개의 장치다.",
].join(" ");

function extractQuestion(answerSpan, correctAnswer) {
  return {
    direction: "필자의 주장이 직접 드러난 문장을 찾아 첫 어절과 끝 어절을 순서대로 쓰시오.",
    extractSpec: { answerSpan, firstLastMode: true },
    correctAnswer,
  };
}

// (a) 쉼표 절만 발췌(판정단 critical 재현) → 문장 경계 불일치 error
const clauseErrors = errorsOf(
  KO_NS_EXTRACT,
  extractQuestion("부실 은행까지 구제할 경우 도덕적 해이가 유발될 수 있기 때문이다.", "부실, 때문이다."),
  extractPassage,
);
check(
  "NS_EXTRACT: 쉼표 절 발췌 → 문장 경계 error",
  clauseErrors.some((e) => e.code === "ko-correct-answer-invalid" && e.message.includes("문장 경계")),
);
check(
  "NS_EXTRACT: 문장 경계 error 가 실제 첫 어절(다만)을 안내",
  clauseErrors.some((e) => e.message.includes('"다만"')),
);

// (b) 마침표 단위 문장 전체 발췌 → 0 error
check(
  "NS_EXTRACT: 문장 전체 발췌 통과(무오탐)",
  errorsOf(
    KO_NS_EXTRACT,
    extractQuestion(
      "다만 최종 대부자 기능은 상환 능력이 있는 은행의 일시적 위기에 한해 작동하는 것이 원칙인데, 부실 은행까지 구제할 경우 도덕적 해이가 유발될 수 있기 때문이다.",
      "다만, 때문이다.",
    ),
    extractPassage,
  ).length === 0,
);

// (c) 두 문장에 걸친 발췌 → error
check(
  "NS_EXTRACT: 문장 경계 걸침 발췌 차단",
  errorsOf(
    KO_NS_EXTRACT,
    extractQuestion("은행은 예금의 일부만 남기고 대출한다. 다만", "은행은, 다만"),
    extractPassage,
  ).some((e) => e.message.includes("걸칩니다")),
);

// (d) 운문 갈래에서는 침묵(오탐 억제) — passageKind 를 시로 지정
{
  const versePassage = "바람이 분다, 그리운 이름 하나 강둑에 남아";
  const q = extractQuestion("그리운 이름 하나 강둑에 남아", "그리운, 남아");
  const issues = KO_NS_EXTRACT.validate(q, {
    passage: versePassage,
    passageKind: "LIT_MODERN_POEM",
    examMode: "NAESIN",
    difficulty: "BASIC",
    koText,
  });
  check(
    "NS_EXTRACT: 운문 갈래는 문장 경계 검사 침묵",
    !issues.some((i) => i.message.includes("문장 경계") || i.message.includes("걸칩니다")),
  );
}

check("NS_EXTRACT: 프롬프트에 마침표 규약 명시", KO_NS_EXTRACT.prompt.includes("마침표"));

// ════════════════════════════════════════════════════════════════════════════
// 2) KO_SP_FUNC — 오답 해설의 발화 순서 주장('앞서 …') 결정론 대조
// ════════════════════════════════════════════════════════════════════════════
const dialogueLines = [
  "사회자: 오늘은 신용 창조의 원리에 대해 이야기해 보겠습니다.",
  "전문가 1: 은행은 예금 일부만 남기고 대출합니다.",
  "학생 1: 바꾸어 말하면 예금이 대출로 이어진다는 뜻이군요.",
  "사회자: 다수의 예금자가 동시에 인출을 요구하면 은행이 흔들릴 수 있다는 말씀이시죠.",
  "전문가 1: 그래서 예금자 보호 제도가 마련되어 있습니다.",
];
const spFuncMarkers = dialogueLines.map((line, i) => ({
  family: "KOR_CIRCLED",
  label: ["㉠", "㉡", "㉢", "㉣", "㉤"][i],
  spanText: line.split(": ")[1],
  targetSurface: "stimulus",
}));
function spFuncQuestion(wrongOptionExplanations) {
  return {
    direction: "대화의 흐름을 고려할 때, ㉠~㉤에 대한 설명으로 적절하지 않은 것은?",
    koStimulus: [{ kind: "DIALOGUE", lines: dialogueLines }],
    markers: spFuncMarkers,
    utteranceFunctions: [
      { label: "㉠", functionId: "TOPIC_SHIFT", speaker: "사회자", rationale: "화제 도입" },
      { label: "㉡", functionId: "SUMMARIZE", speaker: "전문가 1", rationale: "설명" },
      { label: "㉢", functionId: "RESTATE", speaker: "학생 1", rationale: "재진술" },
      { label: "㉣", functionId: "SYNTHESIZE", speaker: "사회자", rationale: "종합" },
      { label: "㉤", functionId: "AGREE", speaker: "전문가 1", rationale: "마무리" },
    ],
    answerClaimedFunctionId: "SUMMARIZE",
    correctAnswer: "③",
    options: [
      { label: "①", text: "㉠: '사회자'가 새로운 내용으로 화제를 전환하고 있다." },
      { label: "②", text: "㉡: '전문가 1'이 앞선 발화의 내용을 요약하고 있다." },
      { label: "③", text: "㉢: '학생 1'이 앞선 발화의 내용을 요약하고 있다." },
      { label: "④", text: "㉣: '사회자'가 앞선 발화들의 내용을 종합하고 있다." },
      { label: "⑤", text: "㉤: '전문가 1'이 상대의 의견에 동의를 표명하고 있다." },
    ],
    wrongOptionExplanations,
  };
}

// (a) 순서 환각: ㉡(2행) 해설이 '앞서' + 3행 발화 인용 → error
const orderBad = issuesOf(
  KO_SP_FUNC,
  spFuncQuestion([
    {
      label: "②",
      explanation:
        "㉡에서 전문가 1은 앞서 사회자가 언급한 '다수의 예금자가 동시에 인출을 요구하면'을 재진술하고 있다.",
    },
    { label: "①", explanation: "㉠에서 사회자는 앞서 ㉣에서 제기된 우려를 종합하고 있다." },
  ]),
  "참고 지문",
);
check(
  "SP_FUNC: '앞서'+뒤 행 인용 → 순서 환각 error",
  orderBad.some(
    (i) => i.severity === "error" && i.code === "ko-solver-mismatch" && i.message.includes("발화 순서 환각") && i.message.includes("② 오답 해설"),
  ),
);
check(
  "SP_FUNC: '앞서'+뒤 마커(㉣) 지칭 → 순서 환각 error",
  orderBad.some(
    (i) => i.severity === "error" && i.message.includes("발화 순서 환각") && i.message.includes("㉣"),
  ),
);

// (b) 실제로 앞 행 발화를 지칭하면 침묵(무오탐)
const orderGood = issuesOf(
  KO_SP_FUNC,
  spFuncQuestion([
    {
      label: "②",
      explanation:
        "㉡에서 전문가 1은 앞서 전문가 1이 언급한 '은행은 예금 일부만 남기고 대출합니다'를 요약하고 있다.",
    },
  ]),
  "참고 지문",
);
check(
  "SP_FUNC: 앞 행 인용 순서 주장 통과(무오탐)",
  !orderGood.some((i) => i.message.includes("발화 순서 환각")),
);
check("SP_FUNC: 프롬프트에 순서 서술 주의 존재", KO_SP_FUNC.prompt.includes("발화 순서"));

// ════════════════════════════════════════════════════════════════════════════
// 3) KO_SP_PLAN — bogi 금지 (스키마 omit + validate 이중 방어)
// ════════════════════════════════════════════════════════════════════════════
check("SP_PLAN: 스키마에서 bogi 제거(omit)", KO_SP_PLAN.schema.shape.bogi === undefined);
check(
  "SP_PLAN: bogi 존재 시 validate error",
  errorsOf(
    KO_SP_PLAN,
    {
      direction: "다음은 위 발표를 하기 위해 학생이 세운 계획이다. 발표에 반영되지 않은 것은?",
      bogi: { label: "보기", lines: ["발표 내용과 계획을 대조하여 (전문가 인용 등) 누락을 판정한다."] },
    },
    "지문",
  ).some((e) => e.code === "ko-answer-leak" && e.message.includes("bogi")),
);
check(
  "SP_PLAN: bogi 없으면 해당 error 없음",
  !errorsOf(
    KO_SP_PLAN,
    { direction: "다음은 위 발표를 하기 위해 학생이 세운 계획이다. 발표에 반영되지 않은 것은?" },
    "지문",
  ).some((e) => e.message.includes("bogi")),
);
check("SP_PLAN: 프롬프트에 bogi 생성 금지 명시", KO_SP_PLAN.prompt.includes("bogi(<보기>) 필드 생성 절대 금지"));

// ════════════════════════════════════════════════════════════════════════════
// 4) KO_WR_METHOD — 전 관계(evidence) 초고 표면 강제 + 해설 인용 지문 누출 차단
// ════════════════════════════════════════════════════════════════════════════
const methodPassage =
  "다만 이는 대출된 돈이 전부 은행으로 되돌아온다고 가정할 때에만 성립하는 이론적 상한이다.";
function methodQuestion(evidence, wrongOptionExplanations) {
  return {
    direction: "윗글(초고)에 활용된 글쓰기 방식으로 가장 적절한 것은?",
    stemPolarity: "POSITIVE",
    koStimulus: [
      {
        kind: "DRAFT",
        lines: ["뱅크 런은 왜 위험할까? 예금자 보호 제도가 필요하다.", "우리는 은행 제도를 신뢰해야 한다."],
      },
    ],
    usedMethods: ["QUESTION_ANSWER"],
    optionDesigns: [
      { label: "①", method: "QUESTION_ANSWER", target: "뱅크 런의 위험", status: "VALID" },
      { label: "②", method: "CONTRAST", target: "은행 제도", status: "METHOD_ABSENT" },
      { label: "③", method: "ANALOGY", target: "예금자 보호", status: "METHOD_ABSENT" },
      { label: "④", method: "STATISTIC_CITATION", target: "신뢰도", status: "METHOD_ABSENT" },
      { label: "⑤", method: "REBUTTAL", target: "제도 개선", status: "METHOD_ABSENT" },
    ],
    correctAnswer: "①",
    options: [
      { label: "①", text: "묻고 답하는 방식으로 뱅크 런의 위험을 드러내고 있다." },
      { label: "②", text: "두 제도의 차이를 대조하여 은행 제도를 설명하고 있다." },
      { label: "③", text: "제도를 다른 대상에 빗대어 예금자 보호를 설명하고 있다." },
      { label: "④", text: "통계 수치를 인용하여 신뢰도를 강조하고 있다." },
      { label: "⑤", text: "예상되는 반론을 제시하고 반박하며 제도 개선을 주장하고 있다." },
    ],
    evidence,
    wrongOptionExplanations,
  };
}

const methodBad = errorsOf(
  KO_WR_METHOD,
  methodQuestion(
    [
      { optionLabel: "①", relation: "SUPPORTS", spanText: "뱅크 런은 왜 위험할까?" },
      {
        optionLabel: "②",
        relation: "NOT_MENTIONED",
        spanText: "대출된 돈이 전부 은행으로 되돌아온다고 가정할 때에만",
      },
    ],
    [
      {
        label: "③",
        explanation: "③은 '되돌아온다고 가정할 때에만 성립하는 이론적 상한'을 근거로 들었으나 초고에 그런 비유가 없다.",
      },
    ],
  ),
  methodPassage,
);
check(
  "WR_METHOD: NOT_MENTIONED 근거의 지문 통복사 차단",
  methodBad.some(
    (e) => e.code === "ko-evidence-not-in-passage" && e.message.includes("NOT_MENTIONED") && e.message.includes("초고"),
  ),
);
check(
  "WR_METHOD: 오답 해설의 지문 인용 누출 차단",
  methodBad.some((e) => e.code === "ko-evidence-not-in-passage" && e.message.includes("해설의 인용")),
);
const methodGood = errorsOf(
  KO_WR_METHOD,
  methodQuestion(
    [
      { optionLabel: "①", relation: "SUPPORTS", spanText: "뱅크 런은 왜 위험할까?" },
      { optionLabel: "②", relation: "NOT_MENTIONED", spanText: "우리는 은행 제도를 신뢰해야 한다." },
    ],
    [{ label: "③", explanation: "③은 '예금자 보호 제도가 필요하다'는 초고 문장을 비유로 오인했다." }],
  ),
  methodPassage,
);
check(
  "WR_METHOD: 초고 표면 근거·인용 통과(무오탐)",
  !methodGood.some((e) => e.code === "ko-evidence-not-in-passage"),
);

// ════════════════════════════════════════════════════════════════════════════
// 5) KO_WR_REVISE — 초고 lines 원문자 하드코딩 차단
// ════════════════════════════════════════════════════════════════════════════
function reviseQuestion(lines) {
  return {
    direction: "㉠~㉤을 고쳐 쓰기 위한 방안으로 적절하지 않은 것은?",
    reviseMode: "LOCAL",
    koStimulus: [{ kind: "DRAFT", title: "초고", lines }],
    markers: [],
    options: [],
  };
}
check(
  "WR_REVISE: 초고 행 원문자 하드코딩 → error",
  errorsOf(
    KO_WR_REVISE,
    reviseQuestion(["㉠따라서 은행이 파산하면 예금자는 돈을 잃는다.", "예금은 소중하다."]),
    "지문",
  ).some((e) => e.code === "ko-marker-unresolved" && e.message.includes("원문자")),
);
check(
  "WR_REVISE: 원문자 없는 초고는 해당 error 없음",
  !errorsOf(KO_WR_REVISE, reviseQuestion(["은행이 파산하면 예금자는 돈을 잃는다."]), "지문").some((e) =>
    e.message.includes("원문자"),
  ),
);
check("WR_REVISE: 프롬프트에 원문자 직접 표기 금지", KO_WR_REVISE.prompt.includes("원문자를 직접 쓰지 마라"));

// ════════════════════════════════════════════════════════════════════════════
// 6) KO_GR_ELEMENT — optionAnalyses 자기모순 결정론 차단
// ════════════════════════════════════════════════════════════════════════════
function elementQuestion(optionThreeText, wrongOptionExplanations) {
  return {
    direction: "<보기>의 ㉠~㉢을 모두 충족하는 예로 가장 적절한 것은?",
    bogi: {
      label: "보기",
      lines: ["㉠ 주체 높임이 실현됨.", "㉡ 객체 높임이 실현됨.", "㉢ 미래 시제가 실현됨."],
    },
    bogiConditions: [
      { label: "㉠", text: "주체 높임이 실현됨.", feature: "SUBJECT_HONORIFIC" },
      { label: "㉡", text: "객체 높임이 실현됨.", feature: "OBJECT_HONORIFIC" },
      { label: "㉢", text: "미래 시제가 실현됨.", feature: "FUTURE_TENSE" },
    ],
    correctAnswer: "①",
    options: [
      { label: "①", text: "할머니께서 선생님을 모시고 공원에 가시겠다." },
      { label: "②", text: "누나가 할머니께 선물을 드리겠다." },
      { label: "③", text: optionThreeText },
      { label: "④", text: "아버지께서 할아버지를 모시고 서울에 가셨다." },
      { label: "⑤", text: "할아버지께서 내일 대전에 가시겠다." },
    ],
    optionAnalyses: [
      { optionLabel: "①", satisfiedConditions: ["㉠", "㉡", "㉢"], markerForms: ["께서", "모시고", "-겠-"] },
      { optionLabel: "②", satisfiedConditions: ["㉡", "㉢"], missingCondition: "㉠", markerForms: ["드리-", "-겠-"] },
      { optionLabel: "③", satisfiedConditions: ["㉠", "㉢"], missingCondition: "㉡", markerForms: ["께서"] },
      { optionLabel: "④", satisfiedConditions: ["㉠", "㉡"], missingCondition: "㉢", markerForms: ["께서", "모시고"] },
      { optionLabel: "⑤", satisfiedConditions: ["㉠", "㉢"], missingCondition: "㉡", markerForms: ["께서", "-겠-"] },
    ],
    wrongOptionExplanations,
  };
}

// (a) ③ 이 미래 시제(㉢) 충족을 선언했으나 예문에 표지 부재 → error(자기모순)
const elementBad = issuesOf(
  KO_GR_ELEMENT,
  elementQuestion("어머니께서 병원에 다녀오셨다.", [
    { label: "④", explanation: "④는 ㉡ 객체 높임이 실현되지 않았다." },
  ]),
  "",
);
check(
  "GR_ELEMENT: 충족 선언 조건의 표지 부재(STRICT) → 자기모순 error",
  elementBad.some(
    (i) =>
      i.severity === "error" &&
      i.code === "ko-solver-mismatch" &&
      i.message.includes("③") &&
      i.message.includes("자기모순"),
  ),
);
// (b) ④ 매트릭스는 ㉡ 충족 선언인데 해설은 ㉡ 결여 진술 → error(매트릭스-해설 모순)
check(
  "GR_ELEMENT: 매트릭스-해설 자기모순 error",
  elementBad.some(
    (i) => i.severity === "error" && i.message.includes("매트릭스-해설 자기모순") && i.message.includes("④"),
  ),
);
// (c) 정합 문항(③에 -겠- 실재 + 해설이 missing 조건만 부정) → 두 검사 모두 침묵
const elementGood = issuesOf(
  KO_GR_ELEMENT,
  elementQuestion("어머니께서 병원에 다녀오시겠다.", [
    { label: "④", explanation: "④는 ㉢ 미래 시제가 실현되지 않았다." },
  ]),
  "",
);
check(
  "GR_ELEMENT: 정합 문항 무오탐",
  !elementGood.some((i) => i.message.includes("자기모순")),
);
// (d) 조건 변별 기여 검사(기존 게이트) 무회귀 — 모든 조건이 결여로 쓰여 warning 없음
check(
  "GR_ELEMENT: 조건 변별 분산 시 장식용 조건 warning 없음",
  !elementGood.some((i) => i.message.includes("변별에 기여하지")),
);

// ════════════════════════════════════════════════════════════════════════════
// 7) KO_GR_MORPH — 매칭형 선지 간 단어 재사용 허용(오탐 완화)
// ════════════════════════════════════════════════════════════════════════════
function morphQuestion(optionTexts, judgments) {
  return {
    direction: "<보기>의 ㉠~㉢에 해당하는 예로 가장 적절한 것은?",
    bogi: {
      label: "보기",
      lines: [
        "㉠ 어근과 어근이 결합하되 일반적인 문장 구성 방식에 어긋나게 결합한 단어",
        "㉡ 어근 앞에 접사가 붙어 만들어진 단어",
        "㉢ 어근 뒤에 접사가 붙어 만들어진 단어",
      ],
    },
    conceptSlots: [
      { label: "㉠", categoryKey: "COMPOUND_ASYNTACTIC", definition: "어근과 어근이 결합하되 일반적인 문장 구성 방식에 어긋나게 결합한 단어" },
      { label: "㉡", categoryKey: "DERIVED_PREFIX", definition: "어근 앞에 접사가 붙어 만들어진 단어" },
      { label: "㉢", categoryKey: "DERIVED_SUFFIX", definition: "어근 뒤에 접사가 붙어 만들어진 단어" },
    ],
    correctAnswer: "①",
    options: optionTexts.map((text, i) => ({ label: ["①", "②", "③", "④", "⑤"][i], text })),
    exampleJudgments: judgments,
  };
}
const morphJudgments = [
  { conceptLabel: "㉠", word: "덮밥", fits: true, analysis: "덮-(어간)+밥 — 비통사적 합성" },
  { conceptLabel: "㉠", word: "첫사랑", fits: false, analysis: "관형사+명사 — 통사적 합성" },
  { conceptLabel: "㉡", word: "맨손", fits: true, analysis: "맨-(접두사)+손" },
  { conceptLabel: "㉡", word: "부슬비", fits: false, analysis: "부사성 어근+명사 — 합성" },
  { conceptLabel: "㉢", word: "비웃음", fits: true, analysis: "비웃-+-음" },
  { conceptLabel: "㉢", word: "코웃음", fits: false, analysis: "코+웃음 — 합성" },
];
const morphReuse = issuesOf(
  KO_GR_MORPH,
  morphQuestion(
    [
      "㉠: 덮밥, ㉡: 맨손, ㉢: 비웃음",
      "㉠: 첫사랑, ㉡: 맨손, ㉢: 비웃음",
      "㉠: 덮밥, ㉡: 부슬비, ㉢: 비웃음",
      "㉠: 덮밥, ㉡: 맨손, ㉢: 코웃음",
      "㉠: 첫사랑, ㉡: 부슬비, ㉢: 비웃음",
    ],
    morphJudgments,
  ),
  "",
);
check(
  "GR_MORPH: 매칭형 선지 간 단어 재사용 무경고(오탐 해소)",
  !morphReuse.some((i) => i.message.includes("중복 사용")),
);
check("GR_MORPH: 정상 매칭형 문항 error 0", morphReuse.every((i) => i.severity !== "error"));

// 같은 선지 안 중복은 warning 유지
const morphSameOption = issuesOf(
  KO_GR_MORPH,
  morphQuestion(
    [
      "㉠: 덮밥, ㉡: 맨손, ㉢: 비웃음",
      "㉠: 첫사랑, ㉡: 맨손, ㉢: 비웃음",
      "㉠: 덮밥, ㉡: 부슬비, ㉢: 비웃음",
      "㉠: 덮밥, ㉡: 맨손, ㉢: 코웃음",
      "㉠: 첫사랑, ㉡: 부슬비, ㉢: 첫사랑",
    ],
    [...morphJudgments, { conceptLabel: "㉢", word: "첫사랑", fits: false, analysis: "합성어 — 접미 파생 아님" }],
  ),
  "",
);
check(
  "GR_MORPH: 같은 선지 내 단어 중복 warning 유지",
  morphSameOption.some((i) => i.severity === "warning" && i.message.includes("⑤ 선지 안에서")),
);
// 선지 간 조합 완전 동일 → error
const morphDupCombo = issuesOf(
  KO_GR_MORPH,
  morphQuestion(
    [
      "㉠: 덮밥, ㉡: 맨손, ㉢: 비웃음",
      "㉠: 첫사랑, ㉡: 맨손, ㉢: 비웃음",
      "㉠: 첫사랑, ㉡: 맨손, ㉢: 비웃음",
      "㉠: 덮밥, ㉡: 맨손, ㉢: 코웃음",
      "㉠: 첫사랑, ㉡: 부슬비, ㉢: 비웃음",
    ],
    morphJudgments,
  ),
  "",
);
check(
  "GR_MORPH: 사례 조합 완전 동일 선지 차단",
  morphDupCombo.some((i) => i.severity === "error" && i.message.includes("완전히 동일")),
);
check("GR_MORPH: 프롬프트에 매칭형 재사용 허용 명시", KO_GR_MORPH.prompt.includes("같은 선지 안에서 단어 중복 금지"));

// ════════════════════════════════════════════════════════════════════════════
// 8) KO_WR_COND — 종결 조건 대안 병기('~하자' 또는 '~합시다') 오차단 해소
// ════════════════════════════════════════════════════════════════════════════
function condQuestion(optionTexts, matrix) {
  return {
    direction: "<보기>의 조건에 따라 [A]에 들어갈 마지막 문장으로 가장 적절한 것은?",
    slotForm: "LAST_SENTENCE",
    koStimulus: [
      {
        kind: "DRAFT",
        label: "[초고]",
        lines: [
          "[작문 상황] 신용 창조에 대해 주장하는 글을 학교 신문에 실으려 함.",
          "은행의 신용 창조는 경제를 움직이는 힘이지만 위험도 함께 지닌다.",
          "따라서 우리는 금융을 바르게 이해해야 한다. [A]",
        ],
      },
    ],
    bogi: {
      label: "보기",
      lines: ["글의 중심 내용이 드러나게 쓸 것.", "'~하자' 또는 '~합시다'로 끝맺을 것."],
    },
    correctAnswer: "①",
    options: optionTexts.map((text, i) => ({ label: ["①", "②", "③", "④", "⑤"][i], text })),
    conditionAnalysis: matrix,
  };
}
const condIssues = errorsOf(
  KO_WR_COND,
  condQuestion(
    [
      "신용 창조의 힘과 위험을 함께 살피며 균형 잡힌 금융 생활을 실천합시다.",
      "신용 창조의 혜택만 누리면 충분하다.",
      "은행의 신뢰를 지키는 첫걸음을 함께 내딛자.",
      "신용 창조를 이해하고 현명하게 대출을 관리하자.",
      "금융의 미래는 언제나 밝을 것이다.",
    ],
    [
      { label: "①", metConditions: [1, 2], missedConditions: [] },
      { label: "②", metConditions: [1], missedConditions: [2] },
      { label: "③", metConditions: [2], missedConditions: [1] },
      { label: "④", metConditions: [2], missedConditions: [1] },
      { label: "⑤", metConditions: [2], missedConditions: [1] },
    ],
  ),
  "지문",
);
check(
  "WR_COND: 대안 종결('합시다') 정답 오차단 해소",
  !condIssues.some((e) => e.message.includes("종결 조건") && e.message.includes("정답 ①")),
);
check(
  "WR_COND: 청유형 '-자'('내딛자'/'관리하자') met 선지 오차단 해소",
  !condIssues.some((e) => e.message.includes("종결 조건") && (e.message.includes("③") || e.message.includes("④"))),
);
check(
  "WR_COND: 종결 미충족('것이다') met 표기 desync 는 여전히 차단",
  condIssues.some((e) => e.code === "ko-condition-rubric-mismatch" && e.message.includes("⑤") && e.message.includes("종결 조건")),
);
check("WR_COND: 프롬프트에 대안 병기 지침 존재", KO_WR_COND.prompt.includes("허용 형태를 전부 병기"));

// ════════════════════════════════════════════════════════════════════════════
// 9) KO_LIT_FACT — 고아 마커(발문·선지 미지칭) 차단
// ════════════════════════════════════════════════════════════════════════════
function litFactQuestion(direction, markers) {
  return {
    direction,
    stemPolarity: "NEGATIVE",
    correctAnswer: "②",
    markers,
    options: [
      { label: "①", text: "만복 영감은 지게를 내려놓았다." },
      { label: "②", text: "아들은 아버지에게 공장 처리를 부탁했다." },
      { label: "③", text: "영감은 굴뚝을 바라보았다." },
      { label: "④", text: "아들은 트럭 문 이야기를 꺼냈다." },
      { label: "⑤", text: "영감은 대꾸하지 않았다." },
    ],
  };
}
check(
  "LIT_FACT: 발문·선지 미지칭 마커 → 고아 마커 error",
  errorsOf(
    KO_LIT_FACT,
    litFactQuestion("윗글에 대한 이해로 적절하지 않은 것은?", [
      { family: "KOR_CIRCLED", label: "㉠", spanText: "만복 영감은 지게를 내려놓고" },
    ]),
    "지문",
  ).some((e) => e.code === "ko-marker-option-mismatch" && e.message.includes("고아")),
);
check(
  "LIT_FACT: 발문이 지칭하는 마커는 error 아님(warning 완화)",
  !errorsOf(
    KO_LIT_FACT,
    litFactQuestion("㉠을 중심으로 윗글을 이해한 내용으로 적절하지 않은 것은?", [
      { family: "KOR_CIRCLED", label: "㉠", spanText: "만복 영감은 지게를 내려놓고" },
    ]),
    "지문",
  ).some((e) => e.message.includes("고아")),
);
check(
  "LIT_FACT: 마커 없으면 침묵",
  !issuesOf(KO_LIT_FACT, litFactQuestion("윗글에 대한 이해로 적절하지 않은 것은?", []), "지문").some((i) =>
    i.message.includes("마커"),
  ),
);
check("LIT_FACT: 프롬프트에 markers 금지 명시", KO_LIT_FACT.prompt.includes("markers 필드 사용"));

// ════════════════════════════════════════════════════════════════════════════
// 10) 저수율 유형 프롬프트 보강 — 실제 반려 문구 기반 금지 목록 존재
// ════════════════════════════════════════════════════════════════════════════
check("RD_CRIT: criticSubject '윗글' 금지 명시", KO_RD_CRIT.prompt.includes("'윗글'/'지문'/'필자'"));
check("RD_CRIT: 스키마 describe 에도 '윗글' 금지", String(KO_RD_CRIT.schema.shape.criticSubject.description).includes("윗글"));
check("RD_VOCAB: 지문 단어 바꿔치기 금지 명시", KO_RD_VOCAB.prompt.includes("바꿔치기"));
check("RD_VOCAB: 치환어=원어 반려 명시", KO_RD_VOCAB.prompt.includes("치환 불성립"));
check("GR_NORM: goldmap 정오 반전 금지 명시", KO_GR_NORM.prompt.includes("정오 반전") || KO_GR_NORM.prompt.includes("절대 어긋나면 안 된다"));
check("GR_HIST: lines 복사-붙여넣기 지시", KO_GR_HIST.prompt.includes("복사-붙여넣기"));
check("GR_HIST: 지문 인용 금지 재강조", KO_GR_HIST.prompt.includes("어떤 표면에서도 인용 금지"));
check("LIT_COMPARE: 파트별 SUPPORTS 커버리지 지시", KO_LIT_COMPARE.prompt.includes("파트마다"));
check("LIT_COMPARE: 운문 '/' 삽입 금지", KO_LIT_COMPARE.prompt.includes("행 구분 기호"));
check("GR_APPLY: 실세계 사실 날조 금지", KO_GR_APPLY.prompt.includes("실세계 사실 날조"));
check("GR_PHONO: 해설 수학 기호 금지", KO_GR_PHONO.prompt.includes("수학 기호"));

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-w2-type-defects-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
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

const summary = runHarness();

test("korean W2 type-defect fixes (sentence boundary/order hallucination/bogi ban/evidence surface/self-contradiction/reuse relaxation): all cases pass", () => {
  assert.equal(summary.failed, 0, `ko-w2-type-defects failures: ${JSON.stringify(summary.failures)}`);
  assert.ok(summary.passed >= 30, `expected ≥30 checks, got ${summary.passed}`);
});
