import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 학생 안전 페이로드(student-safe) 누출 게이트 — TS + `@/` 앨리어스라 tsx 하니스
// (exam-report-answer-entry.test.mjs / exam-scoring-engine.test.mjs 패턴 미러).
// 최우선 계약(설계문서 §3.4·§6-1):
//  - 전 26 영어 유형 fixture(정답 필드에 실값/카나리 포함)의 buildStudentSafeQuestion·
//    buildAnswerUiSpec 산출물 직렬화본에 (a) 금지 키 전부 부재, (b) 정답 카나리 문자열
//    ("CANARY_" 접두) 미등장을 강제한다.
//  - 화이트리스트 필드는 실제로 통과해야 한다(과잉 차단으로 렌더 결손 방지).
const harnessSource = `
import studentSafeMod from "@/lib/exam-scoring/student-safe";
import answerSpecMod from "@/lib/exam-scoring/answer-spec";
const { buildStudentSafeQuestion, buildAnswerUiSpec } =
  studentSafeMod as unknown as typeof import("@/lib/exam-scoring/student-safe");
const { buildAnswerSpec } =
  answerSpecMod as unknown as typeof import("@/lib/exam-scoring/answer-spec");

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: unknown) {
  if (cond) passed += 1;
  else failures.push(name);
}

// 정답 카나리 — 산출물 직렬화본에 이 접두가 한 글자라도 나오면 누출.
// (선지 토큰 "3" 같은 정답은 문자열 검색이 불가능하므로 키 부재 검사로 커버)
const C = (t: string, f: string) => "CANARY_" + t + "_" + f;

// 금지 키 전집 — 과업 명세 + AnswerSpec 정답축 + 스키마 🔒비밀 컨테이너.
const FORBIDDEN_KEYS = [
  "correctAnswer", "correctAnswers", "answer", "answers",
  "acceptableVariants", "requiredLemmas", "lemmas", "modelAnswer",
  "scoringCriteria", "scoringMode", "textMode", "correctChoices",
  "isError", "correction", "errorExpression", "errorPart", "errorParts",
  "correctedPart", "correctedParts", "correctedSentence", "sentenceWithError",
  "isInappropriate", "betterWord", "originalWord", "substituteWord",
  "correctExpression", "wrongExpression", "slotValues",
  "isIncorrectPair", "correctAntonym", "antonym",
  "irrelevantIndex", "incorrectIndex",
  "explanation", "wrongOptionExplanations", "keyPoints", "answerLogic",
  "impliedMeaning", "reasoningGap", "evidenceChain", "surfaceMeaning",
  "originalExpression", "objectiveAnswerTexts", "translation", "evidence",
  "wordBankDistractors", "blankGlosses",
  "markedExpressions", "markedWords", "slots",
  "sourceText", "difficulty", "tags", "points", "partialCredit",
];

function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}

const SAFE_TOP_KEYS = new Set([
  "id", "subType", "questionText", "questionImage", "direction",
  "passageContent", "options", "safeData",
]);

const opts = (labels: string[]) =>
  labels.map((label, i) => ({ label, text: "option text " + (i + 1) }));
const o5 = () => opts(["①", "②", "③", "④", "⑤"]);

type Fixture = { name: string; q: any; verify?: (safe: any, ui: any) => void };

const fixtures: Fixture[] = [
  // ── 1. 빈칸 추론 ──
  {
    name: "BLANK_INFERENCE",
    q: {
      id: "q-bi", type: "MULTIPLE_CHOICE", subType: "BLANK_INFERENCE", points: 4,
      // 실환경 재현(CRITICAL 누출): buildGeneratedQuestionText 가 DB questionText 에
      // '[빈칸 정답] (A) …' 답키를 구워 넣는다 → 학생 페이로드로 새면 안 됨.
      questionText:
        "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.\\n\\n" +
        "The core insight is that _____ shapes every outcome.\\n\\n" +
        "[빈칸 정답] (A) " + C("BI", "blankAns"),
      options: JSON.stringify(o5()), // DB options 컬럼(JSON 문자열) 경로 검증
      correctAnswer: "3",
      structuredData: {
        direction: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
        passageWithBlank: "The core insight is that _____ shapes every outcome.",
        originalExpression: C("BI", "orig"), answerLogic: C("BI", "logic"),
        blankAnswerMode: "PARAPHRASE", correctAnswer: "3",
        explanation: C("BI", "exp"),
        wrongOptionExplanations: { "①": C("BI", "wrong1") },
        keyPoints: [C("BI", "kp")], translation: C("BI", "tr"), evidence: C("BI", "ev"),
        options: o5(),
      },
    },
    verify: (safe, ui) => {
      check("BI: passageWithBlank 통과", safe.safeData?.passageWithBlank?.includes("_____"));
      check("BI: 선지 5개(JSON 문자열 파싱)", safe.options?.length === 5);
      check("BI: direction 통과", typeof safe.direction === "string" && safe.direction.includes("빈칸"));
      check("BI: ui SINGLE 5지", ui.inputKind === "SINGLE_CHOICE" && ui.optionCount === 5);
      // CRITICAL 누출 게이트: [빈칸 정답] 답키 라인 제거(발문·지문 본문은 보존)
      check("BI: [빈칸 정답] 답키 라인 제거", !safe.questionText.includes("[빈칸 정답]"));
      check("BI: 발문·빈칸 지문 보존", safe.questionText.includes("가장 적절한") && safe.questionText.includes("_____"));
    },
  },

  // ── 2. 어법 판단 — 복수정답·가변 7지·마커 전용(선지 리스트 미노출) ──
  {
    name: "GRAMMAR_ERROR",
    q: {
      id: "q-ge", type: "MULTIPLE_CHOICE", subType: "GRAMMAR_ERROR", points: 5,
      questionText: "다음 글의 밑줄 친 부분 중 어법상 틀린 것을 모두 고르시오.",
      options: opts(["(A)", "(B)", "(C)", "(D)", "(E)", "(F)", "(G)"]),
      correctAnswer: "(B), (E)",
      structuredData: {
        passageWithMarkers:
          "He said __(A) that__ the results __(B) were__ surprising, __(C) which__ made everyone __(D) rethink__ the model __(E) carefully__ before __(F) publishing__ it __(G) widely__.",
        markedExpressions: [
          { label: "(A)", expression: "that", isError: false },
          { label: "(B)", expression: C("GE", "exprB"), isError: true, correction: C("GE", "corrB"), errorExpression: "were" },
          { label: "(E)", expression: C("GE", "exprE"), isError: true, correction: C("GE", "corrE"), errorExpression: "carefully" },
        ],
        correctAnswers: ["(B)", "(E)"],
        explanation: C("GE", "exp"), wrongOptionExplanations: { "(A)": C("GE", "wrongA") },
        keyPoints: [C("GE", "kp")],
      },
    },
    verify: (safe, ui) => {
      check("GE: 마커 전용 — 선지 리스트 미노출", safe.options === undefined);
      check("GE: passageWithMarkers 통과", safe.safeData?.passageWithMarkers?.includes("__(A) that__"));
      check("GE: ui MULTI 7지 selectCount 2", ui.inputKind === "MULTI_CHOICE" && ui.optionCount === 7 && ui.selectCount === 2);
    },
  },

  // ── 3. 네모 어법 — 지문 네모·선지 조합은 노출물, slots/slotValues 는 금지 ──
  {
    name: "GRAMMAR_CHOICE_COMBO",
    q: {
      id: "q-gcc", type: "MULTIPLE_CHOICE", subType: "GRAMMAR_CHOICE_COMBO", points: 4,
      questionText: "(A), (B), (C)의 각 네모 안에서 어법에 맞는 표현으로 가장 적절한 것을 고르시오.",
      options: [
        { label: "①", text: "helps - being - what", slotValues: [C("GCC", "sv1a"), C("GCC", "sv1b"), C("GCC", "sv1c")] },
        { label: "②", text: "helps - been - that", slotValues: [C("GCC", "sv2a"), C("GCC", "sv2b"), C("GCC", "sv2c")] },
        { label: "③", text: "helping - being - that" },
        { label: "④", text: "helping - been - what" },
        { label: "⑤", text: "helps - being - that" },
      ],
      correctAnswer: "2",
      structuredData: {
        passageWithMarkers:
          "Regular practice (A) [helps / helping] the team, and having (B) [being / been] tested, the plan proved (C) [that / what] we expected.",
        slots: [
          { label: "(A)", correctExpression: C("GCC", "ceA"), wrongExpression: C("GCC", "weA") },
          { label: "(B)", correctExpression: C("GCC", "ceB"), wrongExpression: C("GCC", "weB") },
          { label: "(C)", correctExpression: C("GCC", "ceC"), wrongExpression: C("GCC", "weC") },
        ],
        correctAnswer: "2", explanation: C("GCC", "exp"),
        wrongOptionExplanations: { "①": C("GCC", "w1") }, keyPoints: [C("GCC", "kp")],
      },
    },
    verify: (safe, ui) => {
      check("GCC: 선지 텍스트(조합) 통과", safe.options?.length === 5 && safe.options[0].text.includes("helps"));
      check("GCC: 네모 지문 통과", safe.safeData?.passageWithMarkers?.includes("[helps / helping]"));
      check("GCC: ui SINGLE 5지", ui.inputKind === "SINGLE_CHOICE" && ui.optionCount === 5);
    },
  },

  // ── 4. 어휘 적절성 — 마커 전용, markedWords 미노출 ──
  {
    name: "VOCAB_CHOICE",
    q: {
      id: "q-vc", type: "VOCAB", subType: "VOCAB_CHOICE", points: 3,
      questionText: "문맥상 낱말의 쓰임이 적절하지 않은 것을 고르시오.",
      options: opts(["(a)", "(b)", "(c)", "(d)", "(e)"]),
      correctAnswer: "(a)",
      structuredData: {
        passageWithMarkers:
          "Cities __(a) expand__ when jobs __(b) attract__ workers who __(c) settle__ near __(d) transit__ and __(e) invest__ locally.",
        markedWords: [
          { label: "(a)", word: "expand", isInappropriate: true, betterWord: C("VC", "better"), originalWord: C("VC", "orig"), substituteWord: C("VC", "sub") },
          { label: "(b)", word: "attract", isInappropriate: false },
        ],
        correctAnswers: ["(a)"],
        explanation: C("VC", "exp"), keyPoints: [C("VC", "kp")],
      },
    },
    verify: (safe, ui) => {
      check("VC: 마커 전용 — 선지 리스트 미노출", safe.options === undefined);
      check("VC: passageWithMarkers 통과", safe.safeData?.passageWithMarkers?.includes("__(a) expand__"));
      check("VC: ui SINGLE 5지", ui.inputKind === "SINGLE_CHOICE" && ui.optionCount === 5);
    },
  },

  // ── 5. 글의 순서 ──
  {
    name: "SENTENCE_ORDER",
    q: {
      id: "q-so", type: "MULTIPLE_CHOICE", subType: "SENTENCE_ORDER", points: 4,
      questionText: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것을 고르시오.",
      options: [
        { label: "①", text: "(A)-(B)-(C)" }, { label: "②", text: "(A)-(C)-(B)" },
        { label: "③", text: "(B)-(A)-(C)" }, { label: "④", text: "(B)-(C)-(A)" },
        { label: "⑤", text: "(C)-(B)-(A)" },
      ],
      correctAnswer: "3",
      structuredData: {
        givenSentence: "A new policy changed how schools plan lessons.",
        paragraphs: [
          { label: "(A)", text: "As a result, teachers gained more freedom. They redesigned units." },
          { label: "(B)", text: "At first, many districts resisted the shift. Budgets were tight." },
          { label: "(C)", text: "Eventually, students reported higher engagement across subjects." },
        ],
        correctAnswer: "3", explanation: C("SO", "exp"),
        wrongOptionExplanations: { "①": C("SO", "w1") }, keyPoints: [C("SO", "kp")],
      },
    },
    verify: (safe, ui) => {
      check("SO: givenSentence 통과", safe.safeData?.givenSentence?.includes("new policy"));
      check("SO: paragraphs 3개(label/text)", safe.safeData?.paragraphs?.length === 3 && safe.safeData.paragraphs[0].label === "(A)");
      check("SO: 선지 5개 통과", safe.options?.length === 5);
      check("SO: ui SINGLE", ui.inputKind === "SINGLE_CHOICE");
    },
  },

  // ── 6. 문장 삽입 — 마커 전용 ──
  {
    name: "SENTENCE_INSERT",
    q: {
      id: "q-si", type: "MULTIPLE_CHOICE", subType: "SENTENCE_INSERT", points: 4,
      questionText: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오.",
      options: o5(),
      correctAnswer: "(C)",
      structuredData: {
        givenSentence: "This tension, however, produced an unexpected benefit.",
        passageWithMarkers: "Growth slowed. ① Firms cut costs. ② Workers adapted. ③ New roles emerged. ④ Cities recovered. ⑤",
        correctAnswer: "3", explanation: C("SI", "exp"), keyPoints: [C("SI", "kp")],
      },
    },
    verify: (safe, ui) => {
      check("SI: 마커 전용 — 선지 리스트 미노출", safe.options === undefined);
      check("SI: givenSentence 통과", safe.safeData?.givenSentence?.includes("unexpected benefit"));
      check("SI: 마커 지문 통과", safe.safeData?.passageWithMarkers?.includes("①"));
      check("SI: ui SINGLE(전용 정규화 (C)→3)", ui.inputKind === "SINGLE_CHOICE");
    },
  },

  // ── 7~10. 원문 참조 유형(주제/요지/주제+요지/제목) — passageContent + 선지만 ──
  {
    name: "TOPIC",
    q: {
      id: "q-tp", type: "MULTIPLE_CHOICE", subType: "TOPIC", points: 3,
      questionText: "다음 글의 주제로 가장 적절한 것을 고르시오.",
      options: o5(), correctAnswer: "1",
      structuredData: { correctAnswer: "1", explanation: C("TP", "exp"), keyPoints: [C("TP", "kp")], translation: C("TP", "tr") },
      passage: { content: "Original passage body for topic inference." },
    },
    verify: (safe, ui) => {
      check("TP: passageContent 통과", safe.passageContent === "Original passage body for topic inference.");
      check("TP: ui SINGLE 5지", ui.inputKind === "SINGLE_CHOICE" && ui.optionCount === 5);
    },
  },
  {
    name: "MAIN_IDEA",
    q: {
      id: "q-mi", type: "MULTIPLE_CHOICE", subType: "MAIN_IDEA", points: 3,
      questionText: "다음 글의 요지로 가장 적절한 것을 고르시오.",
      options: o5(), correctAnswer: "2",
      structuredData: { correctAnswer: "2", explanation: C("MI", "exp"), keyPoints: [C("MI", "kp")] },
      passage: { content: "Original passage body for main idea." },
    },
    verify: (safe) => {
      check("MI: 선지 통과", safe.options?.length === 5);
    },
  },
  {
    name: "TOPIC_MAIN_IDEA",
    q: {
      id: "q-tmi", type: "MULTIPLE_CHOICE", subType: "TOPIC_MAIN_IDEA", points: 3,
      questionText: "다음 글의 주제(요지)로 가장 적절한 것을 고르시오.",
      options: o5(), correctAnswer: "4",
      structuredData: { correctAnswer: "4", explanation: C("TMI", "exp") },
    },
  },
  {
    name: "TITLE",
    q: {
      id: "q-tt", type: "MULTIPLE_CHOICE", subType: "TITLE", points: 3,
      questionText: "다음 글의 제목으로 가장 적절한 것을 고르시오.",
      options: o5(), correctAnswer: "5",
      structuredData: { correctAnswer: "5", explanation: C("TT", "exp"), wrongOptionExplanations: { "②": C("TT", "w2") } },
    },
  },

  // ── 11. 함축 의미 — 복수정답 케이스 + 추론 분석 필드 전부 금지 ──
  {
    name: "IMPLIED_MEANING",
    q: {
      id: "q-im", type: "MULTIPLE_CHOICE", subType: "IMPLIED_MEANING", points: 4,
      questionText: "밑줄 친 부분이 의미하는 바로 가장 적절한 것을 고르시오.",
      options: o5(), correctAnswer: "2, 4",
      structuredData: {
        passageWithUnderline: "Progress came with __the hidden cost__ nobody itemized.",
        underlinedExpression: "the hidden cost",
        surfaceMeaning: C("IM", "surface"), impliedMeaning: C("IM", "implied"),
        reasoningGap: C("IM", "gap"), evidenceChain: [C("IM", "ev1"), C("IM", "ev2")],
        correctAnswers: ["2", "4"], explanation: C("IM", "exp"),
      },
    },
    verify: (safe, ui) => {
      check("IM: 밑줄 지문·표현 통과", safe.safeData?.passageWithUnderline?.includes("__the hidden cost__") && safe.safeData?.underlinedExpression === "the hidden cost");
      check("IM: ui MULTI selectCount 2", ui.inputKind === "MULTI_CHOICE" && ui.selectCount === 2);
    },
  },

  // ── 12. 지칭 추론 ──
  {
    name: "REFERENCE",
    q: {
      id: "q-rf", type: "MULTIPLE_CHOICE", subType: "REFERENCE", points: 3,
      questionText: "밑줄 친 부분이 가리키는 대상으로 가장 적절한 것을 고르시오.",
      options: o5(), correctAnswer: "4",
      structuredData: {
        passageWithUnderline: "The founders met the investors, and __they__ signed first.",
        underlinedPronoun: "they",
        correctAnswer: "4", explanation: C("RF", "exp"),
      },
    },
    verify: (safe) => {
      check("RF: underlinedPronoun 통과", safe.safeData?.underlinedPronoun === "they");
    },
  },

  // ── 13. 내용 일치 — 12지 가변 + 복수정답 ──
  {
    name: "CONTENT_MATCH",
    q: {
      id: "q-cm", type: "MULTIPLE_CHOICE", subType: "CONTENT_MATCH", points: 4,
      // SF1 계약: 발문 끝의 [type: …](matchType 힌트 누출) 라인은 표시 단계에서
      // 제거돼야 하고, [Table: …](도표 캡션 — 실제 표시 콘텐츠)는 보존돼야 한다.
      questionText:
        "다음 도표의 내용과 일치하지 않는 것을 모두 고르시오.\\n\\n" +
        "[Table: Renewable Energy Share by Country (2020)]\\n" +
        "① Country A recorded the highest hydroelectric share.\\n\\n" +
        "[type: 불일치]",
      options: opts(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]),
      correctAnswer: "2, 7",
      structuredData: {
        matchType: "불일치", correctAnswers: ["2", "7"],
        objectiveAnswerTexts: [C("CM", "objTexts")],
        explanation: C("CM", "exp"), wrongOptionExplanations: { "1": C("CM", "w1") },
      },
      passage: { content: "Original passage for content match." },
    },
    verify: (safe, ui) => {
      check("CM: matchType 통과", safe.safeData?.matchType === "불일치");
      check("CM: 선지 12개 통과", safe.options?.length === 12);
      check("CM: ui MULTI 12지 selectCount 2", ui.inputKind === "MULTI_CHOICE" && ui.optionCount === 12 && ui.selectCount === 2);
      // SF1: [type: …] 메타 태그 라인 표시 제거
      check("CM: [type:] 메타 태그 라인 제거(표시 전용)", !safe.questionText.toLowerCase().includes("[type:"));
      check("CM: 발문·[Table:] 캡션 보존", safe.questionText.includes("일치하지 않는") && safe.questionText.includes("[Table: Renewable Energy Share by Country (2020)]"));
    },
  },

  // ── 14. 요약문 완성(객관식) — 서버 마스킹 + blankValues 노출 ──
  {
    name: "SUMMARY_COMPLETE_MC",
    q: {
      id: "q-scmc", type: "MULTIPLE_CHOICE", subType: "SUMMARY_COMPLETE_MC", points: 4,
      questionText: "다음 글의 내용을 한 문장으로 요약할 때, 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
      options: [
        { label: "①", text: "diversity … resilience", blankValues: [{ label: "(A)", value: "diversity" }, { label: "(B)", value: "resilience" }] },
        { label: "②", text: "uniformity … fragility", blankValues: [{ label: "(A)", value: "uniformity" }, { label: "(B)", value: "fragility" }] },
        { label: "③", text: "scale … speed" }, { label: "④", text: "cost … risk" }, { label: "⑤", text: "growth … decline" },
      ],
      correctAnswer: "1",
      structuredData: {
        // 모델이 요약문에 정답을 인라인으로 남긴 최악 케이스 — 서버 마스킹으로 제거돼야 함
        summaryWithBlanks: "Research shows that (A) " + C("SCMC", "ansA") + " strengthens systems, leading to (B).",
        blanks: [
          { label: "(A)", answer: C("SCMC", "ansA") },
          { label: "(B)", answer: C("SCMC", "ansB") },
        ],
        correctAnswer: "1", explanation: C("SCMC", "exp"),
      },
    },
    verify: (safe, ui) => {
      check("SCMC: 요약문 마스킹+빈칸선", safe.safeData?.summaryWithBlanks?.includes("(A) _____"));
      check("SCMC: blankValues 통과", safe.options?.[0]?.blankValues?.length === 2 && safe.options[0].blankValues[0].label === "(A)");
      check("SCMC: ui SINGLE 5지", ui.inputKind === "SINGLE_CHOICE" && ui.optionCount === 5);
    },
  },

  // ── 15. 무관한 문장 — 마커 전용 ──
  {
    name: "IRRELEVANT",
    q: {
      id: "q-ir", type: "MULTIPLE_CHOICE", subType: "IRRELEVANT", points: 3,
      questionText: "다음 글에서 전체 흐름과 관계 없는 문장을 고르시오.",
      options: o5(), correctAnswer: "3",
      structuredData: {
        passageWithNumbers: "① Rivers shape trade. ② Ports grow near deltas. ③ My cat sleeps often. ④ Merchants follow currents. ⑤ Cities inherit these routes.",
        irrelevantIndex: 3, incorrectIndex: 3,
        correctAnswer: "3", explanation: C("IR", "exp"), wrongOptionExplanations: { "①": C("IR", "w1") },
      },
    },
    verify: (safe, ui) => {
      check("IR: 마커 전용 — 선지 리스트 미노출", safe.options === undefined);
      check("IR: passageWithNumbers 통과", safe.safeData?.passageWithNumbers?.includes("③"));
      check("IR: ui SINGLE", ui.inputKind === "SINGLE_CHOICE");
    },
  },

  // ── 16~18. 어휘 3종 ──
  {
    name: "CONTEXT_MEANING",
    q: {
      id: "q-ctx", type: "VOCAB", subType: "CONTEXT_MEANING", points: 3,
      questionText: "밑줄 친 단어와 문맥상 의미가 가장 가까운 것을 고르시오.",
      options: o5(), correctAnswer: "2",
      structuredData: {
        passageWithUnderline: "Her approach was strikingly __novel__ for the field.",
        underlinedWord: "novel",
        correctAnswer: "2", explanation: C("CTX", "exp"),
      },
    },
    verify: (safe) => {
      check("CTX: underlinedWord 통과", safe.safeData?.underlinedWord === "novel");
    },
  },
  {
    name: "SYNONYM",
    q: {
      id: "q-syn", type: "VOCAB", subType: "SYNONYM", points: 2,
      questionText: "밑줄 친 단어와 의미가 가장 가까운 것을 고르시오.",
      options: o5(), correctAnswer: "5",
      structuredData: {
        // passageWithUnderline 부재 — contextSentence 파생 경로 검증
        targetWord: "crucial", contextSentence: "It is crucial to act before the deadline.",
        correctAnswer: "5", explanation: C("SYN", "exp"),
      },
    },
    verify: (safe) => {
      check("SYN: 파생 밑줄 지문", safe.safeData?.passageWithUnderline?.includes("__crucial__"));
      check("SYN: targetWord/contextSentence 통과", safe.safeData?.targetWord === "crucial" && typeof safe.safeData?.contextSentence === "string");
    },
  },
  {
    name: "ANTONYM",
    q: {
      id: "q-ant", type: "VOCAB", subType: "ANTONYM", points: 2,
      questionText: "단어와 반의어의 연결이 적절하지 않은 것을 고르시오.",
      options: [
        { label: "①", text: "rise - fall" }, { label: "②", text: "gain - loss" },
        { label: "③", text: "expand - contract" }, { label: "④", text: "accept - reject" },
        { label: "⑤", text: "vivid - dull" },
      ],
      correctAnswer: "1",
      structuredData: {
        passageWithMarkers: "Prices __(A) rise__ while savings __(B) gain__ value over time.",
        markedWords: [
          { label: "(A)", word: "rise", antonym: "fall", isIncorrectPair: true, correctAntonym: C("ANT", "correctAnt") },
          { label: "(B)", word: "gain", antonym: "loss", isIncorrectPair: false },
        ],
        correctAnswer: "1", explanation: C("ANT", "exp"),
      },
    },
    verify: (safe, ui) => {
      check("ANT: passageWithMarkers 통과", safe.safeData?.passageWithMarkers?.includes("__(A) rise__"));
      check("ANT: 선지(단어쌍) 통과", safe.options?.length === 5);
      check("ANT: ui SINGLE", ui.inputKind === "SINGLE_CHOICE");
    },
  },

  // ── 19~20. 자유영작 2종 — MANUAL_ONLY ──
  {
    name: "CONDITIONAL_WRITING",
    q: {
      id: "q-cw", type: "ESSAY", subType: "CONDITIONAL_WRITING", points: 10,
      questionText: "조건에 맞게 영작하시오.",
      correctAnswer: C("CW", "ca"),
      structuredData: {
        referenceSentence: "내가 그것을 알았더라면 너를 도왔을 것이다.",
        conditions: ["가정법 과거완료를 사용할 것", "10단어 이내로 쓸 것"],
        modelAnswer: C("CW", "model"), scoringCriteria: [C("CW", "crit")],
        correctAnswer: C("CW", "ca2"), explanation: C("CW", "exp"), translation: C("CW", "tr"),
      },
    },
    verify: (safe, ui) => {
      check("CW: referenceSentence 통과", safe.safeData?.referenceSentence?.includes("도왔을"));
      check("CW: conditions 통과", safe.safeData?.conditions?.length === 2);
      check("CW: ui MANUAL_ONLY+사유", ui.inputKind === "MANUAL_ONLY" && typeof ui.manualReason === "string");
    },
  },
  {
    name: "SENTENCE_TRANSFORM",
    q: {
      id: "q-st", type: "ESSAY", subType: "SENTENCE_TRANSFORM", points: 8,
      questionText: "조건에 맞게 문장을 전환하시오.",
      correctAnswer: C("ST", "ca"),
      structuredData: {
        originalSentence: "She wrote the final report.",
        conditions: ["수동태로 전환할 것"],
        modelAnswer: C("ST", "model"), scoringCriteria: [C("ST", "crit")],
        correctAnswer: C("ST", "ca2"), explanation: C("ST", "exp"),
      },
    },
    verify: (safe, ui) => {
      check("ST: originalSentence 통과", safe.safeData?.originalSentence?.includes("final report"));
      check("ST: ui MANUAL_ONLY", ui.inputKind === "MANUAL_ONLY");
    },
  },

  // ── 21. 핵심 표현 빈칸 ──
  {
    name: "FILL_BLANK_KEY",
    q: {
      id: "q-fbk", type: "SHORT_ANSWER", subType: "FILL_BLANK_KEY", points: 3,
      questionText: "빈칸에 들어갈 핵심 표현을 쓰시오.",
      correctAnswer: C("FBK", "ca"),
      structuredData: {
        sentenceWithBlank: "He succeeded _____ sheer persistence.",
        answer: C("FBK", "answer"),
        correctAnswer: C("FBK", "ca2"), explanation: C("FBK", "exp"),
      },
    },
    verify: (safe, ui) => {
      check("FBK: sentenceWithBlank → passageWithBlank 폴백", safe.safeData?.passageWithBlank?.includes("_____"));
      check("FBK: ui TEXT_SINGLE 필드 key/label만", ui.inputKind === "TEXT_SINGLE" && ui.fields?.length === 1 && ui.fields[0].key === "answer" && JSON.stringify(Object.keys(ui.fields[0]).sort()) === JSON.stringify(["key", "label"]));
    },
  },

  // ── 22. 요약문 완성(서답형) — blanks 라벨만 통과 ──
  {
    name: "SUMMARY_COMPLETE",
    q: {
      id: "q-sc", type: "SHORT_ANSWER", subType: "SUMMARY_COMPLETE", points: 6,
      // 실환경 재현(CRITICAL 누출): [요약문] 표시 라인은 보존, [빈칸 정답] 답키
      // 라인은 제거돼야 한다(설계 §6-1). 349건 SUMMARY_COMPLETE 정면 케이스.
      questionText:
        "요약문의 빈칸을 채우시오.\\n\\n" +
        "[요약문] The study links (A) to (B) across regions.\\n\\n" +
        "[빈칸 정답] (A) " + C("SC", "qtA") + ", (B) " + C("SC", "qtB"),
      correctAnswer: "(A) " + C("SC", "caA"),
      structuredData: {
        summaryWithBlanks: "The study links (A) to (B) across regions.",
        blanks: [
          { label: "(A)", answer: C("SC", "ansA") },
          { label: "(B)", answer: C("SC", "ansB") },
        ],
        correctAnswer: C("SC", "ca"), explanation: C("SC", "exp"),
      },
    },
    verify: (safe, ui) => {
      check("SC: 요약문 빈칸선 부착", safe.safeData?.summaryWithBlanks?.includes("(A) _____"));
      check("SC: blanks 라벨만", safe.safeData?.blanks?.length === 2 && JSON.stringify(Object.keys(safe.safeData.blanks[0])) === JSON.stringify(["label"]));
      check("SC: ui TEXT_MULTI 2필드", ui.inputKind === "TEXT_MULTI" && ui.fields?.length === 2);
      // CRITICAL 누출 게이트: [빈칸 정답] 답키 라인 제거 / [요약문] 표시 라인 보존
      check("SC: [빈칸 정답] 답키 라인 제거", !safe.questionText.includes("[빈칸 정답]"));
      check("SC: [요약문] 표시 라인 보존", safe.questionText.includes("[요약문]"));
    },
  },

  // ── 23. 요약문 영작 — firstLetter 슬롯 파생 + 미끼 보기 + 비밀 전량 차단 ──
  {
    name: "SUMMARY_WRITING",
    q: {
      id: "q-sw", type: "ESSAY", subType: "SUMMARY_WRITING", points: 8,
      questionText: "요약문의 빈칸을 영작하시오.",
      correctAnswer: C("SW", "ca"),
      structuredData: {
        summaryWithBlanks: "People who (A) tend to (B) over time.",
        koreanGloss: "쉽게 포기하는 사람들은 시간이 지나며 집중력을 잃는 경향이 있습니다.",
        blankGlosses: [{ label: "(A)", gloss: C("SW", "blankGloss") }],
        wordBank: ["gives", "up", "easily", "decoyword"],
        wordBankDistractors: ["decoyword"],
        clueMode: "firstLetter", scoringMode: "EXACT",
        blanks: [
          { label: "(A)", answer: "gives up easily", acceptableVariants: [C("SW", "varA")], requiredLemmas: [C("SW", "lemA")], firstLetterHint: "g u e", targetWordCount: 3 },
          { label: "(B)", answer: C("SW", "ansB") },
        ],
        modelAnswer: C("SW", "model"), acceptableVariants: [C("SW", "var")],
        scoringCriteria: [C("SW", "crit")], correctAnswer: C("SW", "ca2"), explanation: C("SW", "exp"),
      },
    },
    verify: (safe, ui) => {
      check("SW: firstLetter 슬롯 파생(정답 미노출)", safe.safeData?.summaryWithBlanks?.includes("g____ u____ e____"));
      check("SW: koreanGloss 통과", typeof safe.safeData?.koreanGloss === "string" && safe.safeData.koreanGloss.includes("경향"));
      check("SW: 미끼 포함 보기 칩", safe.safeData?.wordBank?.includes("decoyword") && safe.safeData?.wordBank?.length === 4);
      check("SW: blanks 단서만(hint/count)", safe.safeData?.blanks?.[0]?.firstLetterHint === "g u e" && safe.safeData?.blanks?.[0]?.targetWordCount === 3);
      check("SW: ui TEXT_MULTI 필드 (A)(B)", ui.inputKind === "TEXT_MULTI" && JSON.stringify(ui.fields?.map((f: any) => f.key)) === JSON.stringify(["(A)", "(B)"]));
    },
  },

  // ── 24. 배열 영작 — 미끼 칩 포함·식별 불가 ──
  {
    name: "WORD_ORDER",
    q: {
      id: "q-wo", type: "SHORT_ANSWER", subType: "WORD_ORDER", points: 4,
      questionText: "단어를 배열하여 문장을 완성하시오.",
      correctAnswer: C("WO", "ca"),
      structuredData: {
        scrambledWords: ["did", "truth", "she", "realize", "the", "zebra"],
        wordBankDistractors: ["zebra"],
        contextHint: "도치 구문에 유의하십시오.",
        modelAnswer: C("WO", "model"), correctAnswer: C("WO", "ca2"), explanation: C("WO", "exp"),
      },
    },
    verify: (safe, ui) => {
      check("WO: 칩에 미끼 포함(원순서 보존)", JSON.stringify(safe.safeData?.scrambledWords) === JSON.stringify(["did", "truth", "she", "realize", "the", "zebra"]));
      check("WO: contextHint 통과", safe.safeData?.contextHint?.includes("도치"));
      check("WO: ui TEXT_SINGLE", ui.inputKind === "TEXT_SINGLE");
    },
  },

  // ── 25. 주제문 영작(cloze) ──
  {
    name: "TOPIC_SENTENCE_WRITING",
    q: {
      id: "q-tsw-c", type: "ESSAY", subType: "TOPIC_SENTENCE_WRITING", points: 6,
      questionText: "주제문의 빈칸을 완성하시오.",
      correctAnswer: C("TSWC", "ca"),
      structuredData: {
        mode: "cloze", topicForm: "sentence",
        koreanGloss: "도시 확장의 원인을 설명하는 주제문입니다.",
        summaryWithBlanks: "Modern cities (A) because transit shapes settlement.",
        wordBank: ["expand", "rapidly", "shrinkbait"],
        wordBankDistractors: ["shrinkbait"],
        blanks: [{ label: "(A)", answer: C("TSWC", "ansA"), firstLetterHint: "e r" }],
        modelAnswer: C("TSWC", "model"), acceptableVariants: [C("TSWC", "var")],
        scoringCriteria: [C("TSWC", "crit")], correctAnswer: C("TSWC", "ca2"), explanation: C("TSWC", "exp"),
      },
    },
    verify: (safe, ui) => {
      check("TSW-cloze: mode/topicForm 통과", safe.safeData?.mode === "cloze" && safe.safeData?.topicForm === "sentence");
      check("TSW-cloze: 마스킹 주제문", safe.safeData?.summaryWithBlanks?.includes("(A) _____"));
      check("TSW-cloze: 보기 칩(미끼 포함)", safe.safeData?.wordBank?.includes("shrinkbait"));
      check("TSW-cloze: ui TEXT_SINGLE(1빈칸)", ui.inputKind === "TEXT_SINGLE" && ui.fields?.[0]?.key === "(A)");
    },
  },

  // ── 25b. 주제문 영작(scrambled) — 동일 subType 의 배열 모드 ──
  {
    name: "TOPIC_SENTENCE_WRITING#scrambled",
    q: {
      id: "q-tsw-s", type: "ESSAY", subType: "TOPIC_SENTENCE_WRITING", points: 6,
      questionText: "제시어를 배열하여 주제문을 완성하시오.",
      correctAnswer: C("TSWS", "ca"),
      structuredData: {
        mode: "scrambled", topicForm: "nounPhrase",
        koreanGloss: "기술 수용의 사회적 조건에 대한 주제입니다.",
        scrambledWords: ["adoption", "of", "technology", "social", "trust", "boguschip"],
        wordBankDistractors: ["boguschip"],
        modelAnswer: C("TSWS", "model"), acceptableVariants: [C("TSWS", "var")],
        correctAnswer: C("TSWS", "ca2"), explanation: C("TSWS", "exp"),
      },
    },
    verify: (safe, ui) => {
      check("TSW-scr: 칩 통과(미끼 포함)", safe.safeData?.scrambledWords?.includes("boguschip"));
      check("TSW-scr: ui TEXT_SINGLE", ui.inputKind === "TEXT_SINGLE");
    },
  },

  // ── 26. 문법 오류 수정 — 서버 조립 questionText + displayedText 파생 ──
  {
    name: "GRAMMAR_CORRECTION",
    q: {
      id: "q-gc", type: "SHORT_ANSWER", subType: "GRAMMAR_CORRECTION", points: 4,
      questionText: "다음 글의 밑줄 친 부분에서 어법상 틀린 곳을 찾아 바르게 고치시오.",
      correctAnswer: C("GC", "ca"),
      structuredData: {
        direction: "다음 글의 밑줄 친 부분에서 어법상 틀린 곳을 찾아 바르게 고치시오.",
        passageWithUnderline: "__They has been working__ since dawn, and the __buildings which was built__ remain.",
        underlinedSegments: [
          { label: "(A)", sourceText: "They have been working", displayedText: "They has been working", isError: true, errorPart: "has", correctedPart: C("GC", "corrA") },
          // displayedText 부재 — correctedPart→errorPart 치환 파생 경로 검증
          { label: "(B)", sourceText: "buildings which were built", isError: true, errorPart: "was", correctedPart: "were" },
        ],
        errorParts: ["has", "was"], correctedParts: [C("GC", "cpA"), "were"],
        correctedSentence: C("GC", "cs"), correctAnswer: C("GC", "ca2"), explanation: C("GC", "exp"), keyPoints: [C("GC", "kp")],
      },
    },
    verify: (safe, ui) => {
      check("GC: questionText 서버 조립(마킹+답란)", safe.questionText.includes("__") && safe.questionText.includes("_____"));
      check("GC: 세그먼트 표시형만", safe.safeData?.underlinedSegments?.length === 2 && JSON.stringify(Object.keys(safe.safeData.underlinedSegments[0]).sort()) === JSON.stringify(["displayedText", "label"]));
      check("GC: displayedText 파생(정답형 미노출)", safe.safeData?.underlinedSegments?.[1]?.displayedText === "buildings which was built" && !safe.safeData.underlinedSegments[1].displayedText.includes("were"));
      check("GC: ui TEXT_MULTI seg 키", ui.inputKind === "TEXT_MULTI" && JSON.stringify(ui.fields?.map((f: any) => f.key)) === JSON.stringify(["seg-1", "seg-2"]));
    },
  },

  // ── 미지 유형 폴백 — structuredData 미복사(최소 노출) ──
  {
    name: "CUSTOM_NEW_TYPE(폴백)",
    q: {
      id: "q-cu", type: "MULTIPLE_CHOICE", subType: "CUSTOM_NEW_TYPE", points: 3,
      questionText: "커스텀 문항 발문.",
      options: o5(), correctAnswer: "2",
      structuredData: {
        correctAnswer: "2", explanation: C("CU", "exp"), secretField: C("CU", "secret"),
        modelAnswer: C("CU", "model"),
      },
    },
    verify: (safe) => {
      check("CU: safeData 미생성(미지 유형 최소 노출)", safe.safeData === undefined);
      check("CU: 선지 label/text 만", safe.options?.length === 5);
    },
  },
];

// ── 실행: 유형별 (a) 금지 키 부재 (b) 카나리 부재 (c) top-level 화이트리스트 ──
const coveredSubTypes = new Set<string>();
for (const fx of fixtures) {
  const safe = buildStudentSafeQuestion(fx.q);
  const spec = buildAnswerSpec(fx.q);
  const ui = buildAnswerUiSpec(spec);
  const payload = { safe, ui };
  const serialized = JSON.stringify(payload);
  const keys = collectKeys(payload);

  const leakedKeys = FORBIDDEN_KEYS.filter((k) => keys.has(k));
  check(fx.name + ": 금지 키 전부 부재" + (leakedKeys.length ? " [누출: " + leakedKeys.join(",") + "]" : ""), leakedKeys.length === 0);
  check(fx.name + ": 정답 카나리 부재", !serialized.includes("CANARY"));
  check(fx.name + ": top-level 화이트리스트", Object.keys(safe).every((k) => SAFE_TOP_KEYS.has(k)));
  check(fx.name + ": id/subType 보존", safe.id === fx.q.id && safe.subType === fx.q.subType);

  coveredSubTypes.add(fx.q.subType);
  if (fx.verify) fx.verify(safe, ui);
}

// 전 26 영어 유형 커버 확인(정본 목록 — 하나라도 빠지면 게이트 무효)
const REQUIRED_26 = [
  "BLANK_INFERENCE", "GRAMMAR_ERROR", "GRAMMAR_CHOICE_COMBO", "VOCAB_CHOICE",
  "SENTENCE_ORDER", "SENTENCE_INSERT", "TOPIC", "MAIN_IDEA", "TOPIC_MAIN_IDEA",
  "TITLE", "IMPLIED_MEANING", "REFERENCE", "CONTENT_MATCH", "SUMMARY_COMPLETE_MC",
  "IRRELEVANT", "CONTEXT_MEANING", "SYNONYM", "ANTONYM",
  "CONDITIONAL_WRITING", "SENTENCE_TRANSFORM", "FILL_BLANK_KEY", "SUMMARY_COMPLETE",
  "SUMMARY_WRITING", "WORD_ORDER", "TOPIC_SENTENCE_WRITING", "GRAMMAR_CORRECTION",
];
const missingTypes = REQUIRED_26.filter((t) => !coveredSubTypes.has(t));
check("커버리지: 전 26유형" + (missingTypes.length ? " [누락: " + missingTypes.join(",") + "]" : ""), missingTypes.length === 0);

// ── 방어 강등: 조립 실패에도 throw 금지 + 최소 안전 필드 ──
const degraded = buildStudentSafeQuestion({
  id: "q-bad", subType: "SUMMARY_WRITING", questionText: "발문만 남은 문항.",
  structuredData: "not-json{{{", options: "also-broken[[",
} as any);
check("방어: 파손 데이터 → 최소 필드 강등", degraded.id === "q-bad" && degraded.questionText === "발문만 남은 문항." && degraded.safeData === undefined);

console.log(JSON.stringify({ passed, failures }));
`;

test("exam-scoring student-safe — 전 26유형 누출 게이트(금지 키·카나리 부재) + 화이트리스트 충실도", () => {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-scoring-student-safe-harness.mts");
  let raw;
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(harnessPath, { force: true });
  }
  const lastLine = raw.trim().split("\n").at(-1);
  const summary = JSON.parse(lastLine);
  assert.deepEqual(summary.failures, [], `실패 케이스: ${summary.failures?.join(" | ")}`);
  assert.ok(summary.passed >= 100, `통과 수 이상(${summary.passed})`);
});
