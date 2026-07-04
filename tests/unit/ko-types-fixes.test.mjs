import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// KO 유형 모듈은 TS + `@/...` 앨리어스 → tsx 하니스로 실행해 JSON 요약을 뽑는다
// (ko-text-core.test.mjs 하니스 패턴 미러).
// 대상: KO-2(음운 분배 서술 오차단) · KO-4(보기 언급 가짜 게이트) ·
//       KO-LEAK-1(BLANK 지문 정답 노출) · KO-RENDER-3(마커 멀티라인 __ 불균형) ·
//       하니스 픽스처 갈래 커버리지.
const harnessSource = `
// tsx runs these .ts modules as CommonJS (no "type":"module"), so Node's ESM
// interop only exposes the default export — destructure the named exports off it.
import koTextMod from "@/lib/korean/core/ko-text";
import phonoMod from "@/lib/korean/types/KO_GR_PHONO";
import applyMod from "@/lib/korean/types/KO_RD_APPLY";
import clozeMod from "@/lib/korean/types/KO_NS_CLOZE";
import markersMod from "@/lib/korean/core/markers";
import fixturesMod from "@/lib/korean/fixtures/sample-passages";
import registryMod from "@/lib/korean/registry";

const koText = koTextMod;
const { containsSpanKo } = koTextMod;
const { KO_GR_PHONO } = phonoMod;
const { KO_RD_APPLY } = applyMod;
const { KO_NS_CLOZE } = clozeMod;
const { buildKoMarkedPassage } = markersMod;
const { KO_SAMPLE_PASSAGES } = fixturesMod;
const { KO_TYPE_REGISTRY, KO_TYPE_IDS } = registryMod;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}
function ctxFor(passage) {
  return { passage, passageKind: null, examMode: "SUNEUNG", difficulty: "INTERMEDIATE", koText };
}
function errorsOf(mod, question, passage) {
  return mod.validate(question, ctxFor(passage)).filter((i) => i.severity === "error");
}

// ════════════════════════════════════════════════════════════════════════════
// KO-2 — KO_GR_PHONO: 분배 서술 참 선지 오차단 제거 + 실제 오귀속 차단 유지
// ════════════════════════════════════════════════════════════════════════════
function phonoQuestion(optionOneText) {
  return {
    direction: "<보기>의 ㄱ, ㄴ에 대한 설명으로 가장 적절한 것은?",
    bogi: { label: "보기", lines: ["ㄱ. 좋은[조은]", "ㄴ. 놓고[노코]"] },
    cases: [
      { itemLabel: "ㄱ", word: "좋은", pronunciation: "조은", changes: ["ㅎ 탈락"], phonemeCountDelta: -1 },
      { itemLabel: "ㄴ", word: "놓고", pronunciation: "노코", changes: ["거센소리되기"], phonemeCountDelta: -1 },
    ],
    correctAnswer: "①",
    options: [
      { label: "①", text: optionOneText },
      { label: "②", text: "ㄱ에서는 음운의 첨가가 일어난다." },
      { label: "③", text: "ㄴ에서는 음운의 교체가 일어난다." },
      { label: "④", text: "ㄱ에서는 구개음화가 일어난다." },
      { label: "⑤", text: "ㄴ에서는 유음화가 일어난다." },
    ],
  };
}

// 1) 분배 서술(대분류): 수능 관행 문형의 참 선지 — 오차단 0 이어야 한다
check(
  "PHONO: 분배 서술(탈락/축약) 참 선지 통과",
  errorsOf(KO_GR_PHONO, phonoQuestion("ㄱ에서는 음운의 탈락이, ㄴ에서는 축약이 일어난다."), "").length === 0,
);
// 2) 분배 서술(세부 변동): 참 선지 통과
check(
  "PHONO: 분배 서술(ㅎ 탈락/거센소리되기) 참 선지 통과",
  errorsOf(KO_GR_PHONO, phonoQuestion("ㄱ에서는 ㅎ 탈락이, ㄴ에서는 거센소리되기가 일어난다."), "").length === 0,
);
// 3) 단일 앵커 오귀속은 여전히 차단
check(
  "PHONO: 단일 앵커 대분류 오귀속 차단 유지",
  errorsOf(KO_GR_PHONO, phonoQuestion("ㄱ에서는 음운의 축약이 일어난다."), "").some(
    (e) => e.code === "ko-correct-answer-invalid" && e.message.includes("모순"),
  ),
);
// 4) 다앵커 × 단일 주장('모두 ~')도 여전히 차단
check(
  "PHONO: 다앵커 단일 주장 오귀속 차단 유지",
  errorsOf(KO_GR_PHONO, phonoQuestion("ㄱ과 ㄴ에서는 모두 음운의 탈락이 일어난다."), "").some(
    (e) => e.code === "ko-correct-answer-invalid",
  ),
);
// 5) 단일 앵커 × 다주장(복합 변동 나열)은 여전히 판정 — 참이면 통과
const complexQ = phonoQuestion("ㄱ에서는 ㄴ 첨가가 일어난 뒤 비음화가 일어난다.");
complexQ.bogi.lines = ["ㄱ. 색연필[생년필]", "ㄴ. 놓고[노코]"];
complexQ.cases = [
  { itemLabel: "ㄱ", word: "색연필", pronunciation: "생년필", changes: ["ㄴ 첨가", "비음화"], phonemeCountDelta: 1 },
  { itemLabel: "ㄴ", word: "놓고", pronunciation: "노코", changes: ["거센소리되기"], phonemeCountDelta: -1 },
];
check("PHONO: 단일 앵커 복합 변동 참 선지 통과", errorsOf(KO_GR_PHONO, complexQ, "").length === 0);
// 6) 음운 개수 검사 무회귀: 거짓 개수 주장 차단
check(
  "PHONO: 개수 증감 오판 차단 유지",
  errorsOf(KO_GR_PHONO, phonoQuestion("ㄱ에서는 음운의 개수에 변화가 없다."), "").some(
    (e) => e.code === "ko-correct-answer-invalid",
  ),
);

// ════════════════════════════════════════════════════════════════════════════
// KO-4 — KO_RD_APPLY: '에서/하였' 조각 매칭 가짜 게이트 제거
// ════════════════════════════════════════════════════════════════════════════
const applyQuestion = {
  direction: "윗글을 바탕으로 <보기>를 이해한 내용으로 적절하지 않은 것은?",
  stemPolarity: "NEGATIVE",
  correctAnswer: "①",
  trapDesign: [{ label: "①", principle: "PROPORTION_FLIP" }],
  bogi: {
    label: "보기",
    lines: [
      "실험 A에서는 온도를 20℃로 유지하였다.",
      "실험 B에서는 온도를 60℃로 올렸다.",
      "(단, 다른 조건은 고려하지 않음.)",
    ],
  },
  options: [
    { label: "①", text: "A는 B보다 온도가 낮으므로 팽창 폭이 더 크겠군." },
    // ② 는 <보기>의 어떤 요소도 언급하지 않는 자기부정 선지 — 종전엔 '에서' 조각 매칭으로 통과
    { label: "②", text: "이 이론은 관찰 명제에서 성립하겠군." },
    { label: "③", text: "온도가 높아질수록 부피 변화가 커지겠군." },
    { label: "④", text: "B는 A보다 부피 변화가 크겠군." },
    { label: "⑤", text: "60℃에서는 팽창이 관찰되겠군." },
  ],
};
const applyErrors = errorsOf(KO_RD_APPLY, applyQuestion, "지문 본문");
check(
  "APPLY: 보기 미언급 선지(②) 반려",
  applyErrors.some((e) => e.code === "ko-bogi-missing" && e.message.includes("②")),
);
check(
  "APPLY: 기호 언급 선지(①④) 통과",
  !applyErrors.some((e) => e.code === "ko-bogi-missing" && (e.message.includes("①") || e.message.includes("④"))),
);
check(
  "APPLY: 내용어 스템 언급 선지(③ 온도) 통과",
  !applyErrors.some((e) => e.code === "ko-bogi-missing" && e.message.includes("③")),
);
check(
  "APPLY: 수치 언급 선지(⑤ 60) 통과",
  !applyErrors.some((e) => e.code === "ko-bogi-missing" && e.message.includes("⑤")),
);
check("APPLY: 그 외 오탐 error 없음", applyErrors.length === 1);

// ════════════════════════════════════════════════════════════════════════════
// KO-LEAK-1 — KO_NS_CLOZE: BLANK 렌더 지문 정답 마스킹 (FIND 무변경)
// ════════════════════════════════════════════════════════════════════════════
// 자체 창작 운문 — 정답 구간이 수미상관으로 2회 반복(전역 마스킹 검증)
const clozePassage = [
  "바람이 분다 그리운 이름 하나",
  "강둑에 앉아 나는 기다린다",
  "",
  "바람이 분다 그리운 이름 하나",
  "물결 위에 겹겹이 번져 간다",
].join("\\n");

const blankQuestion = {
  direction: "빈칸에 들어갈 시구를 쓰시오.",
  clozeMode: "BLANK",
  clozeSpec: {
    sourceExcerpt: "바람이 분다 그리운 이름 하나\\n강둑에 앉아 나는 기다린다",
    answerSpan: "그리운 이름 하나",
  },
  correctAnswer: "그리운 이름 하나",
  bogi: { label: "보기", lines: ["바람이 분다 (        )", "강둑에 앉아 나는 기다린다"] },
};

const blankModel = KO_NS_CLOZE.toRenderModel(blankQuestion, { passage: clozePassage });
const blankParts = blankModel.passage ? blankModel.passage.parts : [];
check("CLOZE/BLANK: 지문 파트 유지", blankParts.length === 1);
check(
  "CLOZE/BLANK: 렌더 지문에 정답 부재",
  blankParts.length === 1 && !containsSpanKo(blankParts[0].text, "그리운 이름 하나"),
);
check(
  "CLOZE/BLANK: 반복 출현 전부 빈칸 치환(2회)",
  blankParts.length === 1 && (blankParts[0].text.match(/\\(\\s{2,}\\)/g) ?? []).length === 2,
);
check(
  "CLOZE/BLANK: 비정답 행은 보존",
  blankParts.length === 1 && blankParts[0].text.includes("물결 위에 겹겹이 번져 간다"),
);
check("CLOZE/BLANK: 정합 문항 validate 0 error", errorsOf(KO_NS_CLOZE, blankQuestion, clozePassage).length === 0);

// FIND 모드 — 지문 노출이 본질: 무변경
const findQuestion = {
  direction: "윗글에서 '겹겹이 번져 간다'와 호응하는 시구를 찾아 쓰시오.",
  clozeMode: "FIND",
  clozeSpec: { sourceExcerpt: "물결 위에 겹겹이 번져 간다", answerSpan: "물결 위에" },
  correctAnswer: "물결 위에",
};
const findModel = KO_NS_CLOZE.toRenderModel(findQuestion, { passage: clozePassage });
const findParts = findModel.passage ? findModel.passage.parts : [];
check(
  "CLOZE/FIND: 지문 원문 유지(정답 포함·빈칸 없음)",
  findParts.length === 1 &&
    containsSpanKo(findParts[0].text, "물결 위에") &&
    !/\\(\\s{2,}\\)/.test(findParts[0].text),
);
check("CLOZE/FIND: validate 0 error", errorsOf(KO_NS_CLOZE, findQuestion, clozePassage).length === 0);

// 마스킹 불가(스팬 부재) → 지문 생략 안전 강등
const orphanQuestion = {
  ...blankQuestion,
  clozeSpec: { sourceExcerpt: "바람이 분다", answerSpan: "쓸쓸한 뒷모습" },
  correctAnswer: "쓸쓸한 뒷모습",
};
const orphanModel = KO_NS_CLOZE.toRenderModel(orphanQuestion, { passage: clozePassage });
check("CLOZE/BLANK: 마스킹 불가 시 지문 생략(안전 강등)", orphanModel.passage === undefined);

// 마커 밑줄이 첫 출현을 가로질러 마스킹이 부분 실패 → 렌더는 지문 생략 + validate 차단
const markerClashQuestion = {
  ...blankQuestion,
  markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "분다 그리운" }],
};
const clashModel = KO_NS_CLOZE.toRenderModel(markerClashQuestion, { passage: clozePassage });
check("CLOZE/BLANK: 마커 간섭 잔존 시 지문 생략", clashModel.passage === undefined);
check(
  "CLOZE/BLANK: 마스킹 실패를 validate 결정론 게이트가 차단",
  errorsOf(KO_NS_CLOZE, markerClashQuestion, clozePassage).some(
    (e) => e.code === "ko-answer-leak" && e.message.includes("마스킹"),
  ),
);

// ════════════════════════════════════════════════════════════════════════════
// KO-RENDER-3 — buildKoMarkedPassage: 개행 걸침 스팬은 행마다 __ 여닫기
// ════════════════════════════════════════════════════════════════════════════
const versePassage = "달빛이 강물 위에\\n잘게 부서져 흐른다\\n밤은 오래 깊었다";
const multilineMarked = buildKoMarkedPassage(versePassage, [
  { family: "KOR_CIRCLED", label: "㉠", spanText: "강물 위에 잘게 부서져" },
]);
check(
  "MARKER: 개행 걸침 마킹 후 각 행의 __ 짝수(밸런스)",
  multilineMarked.split("\\n").every((line) => ((line.match(/__/g) ?? []).length % 2) === 0),
);
check(
  "MARKER: 행별 여닫기 형태 정확",
  multilineMarked === "달빛이 ㉠__강물 위에__\\n__잘게 부서져__ 흐른다\\n밤은 오래 깊었다",
);
check(
  "MARKER: 단일 행 마킹은 종전과 byte 동일(무회귀)",
  buildKoMarkedPassage(versePassage, [{ family: "KOR_CIRCLED", label: "㉡", spanText: "밤은 오래" }]) ===
    "달빛이 강물 위에\\n잘게 부서져 흐른다\\n㉡__밤은 오래__ 깊었다",
);

// ════════════════════════════════════════════════════════════════════════════
// 픽스처 — 갈래별 자작 지문 + 하니스 pickPassage 커버리지 보장
// ════════════════════════════════════════════════════════════════════════════
const kinds = new Set(KO_SAMPLE_PASSAGES.map((p) => p.kind));
check(
  "FIXTURE: 신규 갈래 5종 존재",
  ["LIT_MODERN_POEM", "LIT_CLASSIC_POEM", "LIT_MODERN_NOVEL", "MIXED", "GRAMMAR_CONCEPT"].every((k) => kinds.has(k)),
);
check(
  "FIXTURE: 운문 픽스처는 행 구분(\\\\n) 보존",
  KO_SAMPLE_PASSAGES.filter((p) => p.kind === "LIT_MODERN_POEM" || p.kind === "LIT_CLASSIC_POEM").every(
    (p) => p.content.includes("\\n"),
  ),
);
const mixedFixture = KO_SAMPLE_PASSAGES.find((p) => p.kind === "MIXED");
check(
  "FIXTURE: MIXED 는 (가)(나) 파트 라벨 보유",
  !!mixedFixture && mixedFixture.content.includes("(가)") && mixedFixture.content.includes("(나)"),
);
check(
  "FIXTURE: 전 KO 유형이 호환 픽스처 1개 이상 보유(하니스 명시 에러 0)",
  // passageKinds=[] 는 무제약(플래닝 prompts/planning.ts 와 동일 해석 — 자료
  // 몸통 유형 KO_SP_AUD 등은 어떤 지문 갈래와도 호환)이라 픽스처 요건이 없다.
  KO_TYPE_IDS.every(
    (id) =>
      KO_TYPE_REGISTRY[id].meta.passageKinds.length === 0 ||
      KO_SAMPLE_PASSAGES.some((p) => KO_TYPE_REGISTRY[id].meta.passageKinds.includes(p.kind)),
  ),
);

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-types-fixes-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    // Run through a shell so Windows resolves `npx` (only exists as npx.cmd).
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

test("korean type fixes (KO-2/KO-4/KO-LEAK-1/marker multiline/fixtures): all cases pass", () => {
  assert.equal(
    summary.failed,
    0,
    `ko-types-fixes failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 20, `expected ≥20 checks, got ${summary.passed}`);
});
