import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// ============================================================================
// 클래스 스튜디오 — 모듈 단위 분석(섹션 종량제) 계약 검증 (U4)
// 규범: docs/class-studio-spec.md §3.4(2026-08-10 전면 개정) · §3.4.1
//
//  1) 정본 일치: module-sections.FULL_ANALYSIS_SECTIONS ===
//     resilient-generate.ALL_SECTION_KINDS (순서 포함). 두 값 복제본이 표류하면
//     가격·스킵 판정이 서로 다른 목록을 보게 된다 — 불일치 = 게이트 RED.
//  2) 가격: min(부족 섹션 수 × 1, 5캡) + missingSections 의 FULL 순서 보존.
//  3) moduleSectionStates: 보유 집합 → 6모듈 ready/missing/creditCost.
//     순차 구매 총액 = 일괄 총액 불변식(모듈 우주 ≤4섹션이라 캡이 물리지 않음).
//  4) partial-analysis.ts (U1 공유 계약): computePartialAnalysisPlan ·
//     mergeReportPreservingExtras · buildSeedCheckpoint. U1 이 병렬 작업 중이라
//     파일이 아직 없으면 그 테스트만 skip("파일 대기") — 감독이 배리어 후 재실행.
//  5) 부분 리포트 컴파일 가용성: passage+vocabulary 만으로 vocab-quiz 성립,
//     grammar 섹션 부재 = 어법 모듈 자연 비활성(빈 스테이지 강등 계약 재확인).
//
// 하네스 관례는 worksheet-study-compile.test.mjs 를 따른다: TS 하네스를 임시
// .mts 로 쓰고 npx tsx 로 실행, default import 후 구조분해. NODE_OPTIONS 에
// react-server 조건을 얹는 이유: resilient-generate → question-generation-llm
// 체인이 서버 전용 모듈을 만나도 empty.js 로 해소되게(grammar-engine 관례).
// ============================================================================

function runHarness(source, name) {
  const tmpDir = path.join(repoRoot, "tests", ".tmp-studio-module-sections");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, name);
  let raw;
  try {
    writeFileSync(harnessPath, source, "utf8");
    raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --conditions=react-server`.trim(),
      },
    });
  } finally {
    rmSync(harnessPath, { force: true });
  }
  const lines = raw.trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}

const contractHarnessSource = `
import msMod from "@/lib/studio/module-sections";
import rgMod from "@/lib/passage-report/analysis-report/resilient-generate";
import compileMod from "@/lib/worksheet-study/compile";
import fixtureMod from "@/lib/passage-report/analysis-report/fixture";
import paoMod from "@/lib/passage-analysis-options";

const {
  FULL_ANALYSIS_SECTIONS,
  MODULE_REQUIRED_SECTIONS,
  missingSections,
  partialAnalysisCreditCost,
  moduleSectionStates,
  isSectionKind,
} = msMod as any;
const { ALL_SECTION_KINDS } = rgMod as any;
const { compileStudyPlan } = compileMod as any;
const { RECALL_RECOGNITION_FIXTURE } = fixtureMod as any;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}
const J = (v: unknown) => JSON.stringify(v);

// ── 1. 정본 일치 — 값 복제본의 표류 감지(불일치 = RED) ──────────────────────
check("정본 일치: FULL_ANALYSIS_SECTIONS === ALL_SECTION_KINDS(순서 포함)", J(FULL_ANALYSIS_SECTIONS) === J(ALL_SECTION_KINDS));
check("정본: 6종·중복 없음", FULL_ANALYSIS_SECTIONS.length === 6 && new Set(FULL_ANALYSIS_SECTIONS).size === 6);
// 26-08-21 '지문 논리 구조 분석' 폐지 — 생성 섹션 정본에서 빠졌는지 잠근다(부활 = RED).
check("정본: learning-worksheet 폐지(생성 대상 아님)", !(FULL_ANALYSIS_SECTIONS as string[]).includes("learning-worksheet") && !isSectionKind("learning-worksheet"));
check("isSectionKind: 정본 전원 양성", (FULL_ANALYSIS_SECTIONS as string[]).every((k) => isSectionKind(k)));
check("isSectionKind: 비분석 kind·비문자열 음성", !isSectionKind("self-check") && !isSectionKind("structure-map") && !isSectionKind("") && !isSectionKind(42) && !isSectionKind(null));

// ── 2. 모듈 → 필요 섹션 표(스펙 §3.4 정본) 잠금 ─────────────────────────────
check("표: vocab = passage+vocabulary", J(MODULE_REQUIRED_SECTIONS.vocab) === J(["passage", "vocabulary"]));
check("표: reading = passage+summary", J(MODULE_REQUIRED_SECTIONS.reading) === J(["passage", "summary"]));
check("표: grammar = passage+grammar", J(MODULE_REQUIRED_SECTIONS.grammar) === J(["passage", "grammar"]));
check("표: cloze·order·production = passage 만", J(MODULE_REQUIRED_SECTIONS.cloze) === J(["passage"]) && J(MODULE_REQUIRED_SECTIONS.order) === J(["passage"]) && J(MODULE_REQUIRED_SECTIONS.production) === J(["passage"]));
check("표: exam 은 섹션 종량제 대상 아님(키 부재)", !("exam" in MODULE_REQUIRED_SECTIONS));

// ── 3. 가격 = min(부족 × 1, 5 − min(보유, 5)) — 지문 누적 상한(검수 L1-F4 개정) ──
check("가격: (0,0) → 0(과금·LLM 없음)", partialAnalysisCreditCost(0, 0) === 0);
check("가격: (1,0) → 1", partialAnalysisCreditCost(1, 0) === 1);
check("가격: (2,0) → 2", partialAnalysisCreditCost(2, 0) === 2);
check("가격: (5,0) → 5", partialAnalysisCreditCost(5, 0) === 5);
check("가격: (6,0) → 5(캡)", partialAnalysisCreditCost(6, 0) === 5);
check("가격: (7,0) → 5(캡 = 기존 일괄가)", partialAnalysisCreditCost(7, 0) === 5);
check("가격: 음수 부족 → 0(방어)", partialAnalysisCreditCost(-3, 0) === 0);
check("가격: (5,2) → 3(부분 뒤 남은 전체 — 누적 5 상한)", partialAnalysisCreditCost(5, 2) === 3);
check("가격: (1,6) → 0(누적 상한 소진 = 무료 보수)", partialAnalysisCreditCost(1, 6) === 0);
check("가격: (3,4) → 1(잔여 상한 1)", partialAnalysisCreditCost(3, 4) === 1);
check("가격: 음수 보유 → 보유 0 취급", partialAnalysisCreditCost(2, -1) === 2);
check("누적 불변식: 부분(2) + 남은 전체(5부족·2보유) = 일괄 5", partialAnalysisCreditCost(2, 0) + partialAnalysisCreditCost(5, 2) === partialAnalysisCreditCost(7, 0));

// ── 4. missingSections — FULL 순서 보존·보유 차감 ───────────────────────────
check("missing: 입력이 역순이어도 FULL 순서로 정규화", J(missingSections(["vocabulary", "grammar", "passage"], new Set())) === J(["passage", "grammar", "vocabulary"]));
check("missing: 보유분 차감", J(missingSections(["passage", "vocabulary"], new Set(["passage"]))) === J(["vocabulary"]));
check("missing: 전부 보유 → 빈 배열", missingSections(["passage", "vocabulary"], new Set(["passage", "vocabulary"])).length === 0);

// ── 5. moduleSectionStates — 보유 집합별 카드 상태·가격 ─────────────────────
const statesOf = (present: string[]) => {
  const map: Record<string, any> = {};
  for (const s of moduleSectionStates(new Set(present))) map[s.moduleId] = s;
  return map;
};
const empty = statesOf([]);
check("상태(빈 보유): vocab 2크레딧·missing=[passage,vocabulary]", empty.vocab.ready === false && J(empty.vocab.missing) === J(["passage", "vocabulary"]) && empty.vocab.creditCost === 2);
check("상태(빈 보유): reading·grammar 2크레딧", empty.reading.creditCost === 2 && empty.grammar.creditCost === 2);
check("상태(빈 보유): cloze·order·production 1크레딧·missing=[passage]", ["cloze", "order", "production"].every((m) => J(empty[m].missing) === J(["passage"]) && empty[m].creditCost === 1 && empty[m].ready === false));
const withPassage = statesOf(["passage"]);
check("상태({passage}): cloze·order·production ready·0크레딧", ["cloze", "order", "production"].every((m) => withPassage[m].ready === true && withPassage[m].creditCost === 0 && withPassage[m].missing.length === 0));
check("상태({passage}): vocab 1크레딧·missing=[vocabulary]", withPassage.vocab.ready === false && J(withPassage.vocab.missing) === J(["vocabulary"]) && withPassage.vocab.creditCost === 1);
check("상태({passage}): reading·grammar 1크레딧", withPassage.reading.creditCost === 1 && withPassage.grammar.creditCost === 1);
const withVocab = statesOf(["passage", "vocabulary"]);
check("상태({passage,vocabulary}): vocab ready·0크레딧", withVocab.vocab.ready === true && withVocab.vocab.creditCost === 0 && withVocab.vocab.missing.length === 0);
const allStates = [...moduleSectionStates(new Set()), ...moduleSectionStates(new Set(["passage"])), ...moduleSectionStates(new Set(["passage", "vocabulary"]))];
check("상태 일관성: ready ⇔ missing=빈 ⇔ cost=0", allStates.every((s: any) => s.ready === (s.missing.length === 0) && (s.ready ? s.creditCost === 0 : s.creditCost > 0)));

// ── 6. 순차 구매 총액 = 일괄 총액(스펙 §3.4) ────────────────────────────────
// 모듈 우주의 필요 섹션 합집합은 4종뿐이라 캡(5)이 물리지 않는다 — 캡이 물리는
// 것은 전체 분석(7섹션)뿐이고 그때는 순차 경로 자체가 없다(단일 요청).
const buyOrder = ["vocab", "reading", "grammar", "cloze", "order", "production"];
const acc = new Set<string>();
let sequentialTotal = 0;
for (const m of buyOrder) {
  const miss = missingSections(MODULE_REQUIRED_SECTIONS[m], acc);
  sequentialTotal += partialAnalysisCreditCost(miss.length, acc.size);
  for (const k of miss) acc.add(k);
}
const unionAll: string[] = [];
for (const m of buyOrder) for (const k of MODULE_REQUIRED_SECTIONS[m]) if (!unionAll.includes(k)) unionAll.push(k);
const batchTotal = partialAnalysisCreditCost(missingSections(unionAll as any, new Set()).length, 0);
check("순차 구매 총액 = 일괄 총액(전 모듈 = 4크레딧)", sequentialTotal === batchTotal && batchTotal === 4);
// 모듈 순차 구매 뒤 「남은 전체」까지 — 누적 총액이 일괄 캡 5를 절대 넘지 않는다(검수 L1-F4)
const fullAfterModules = partialAnalysisCreditCost(missingSections(FULL_ANALYSIS_SECTIONS, acc).length, acc.size);
check("모듈 전부(4) + 남은 전체(1) = 일괄 캡 5", sequentialTotal + fullAfterModules === 5);

// ── 7. 부분 리포트 컴파일 가용성 — 섹션 부재 = 모듈 자연 비활성 ─────────────
const partialReport = {
  ...RECALL_RECOGNITION_FIXTURE,
  sections: RECALL_RECOGNITION_FIXTURE.sections.filter((s: any) => s.kind === "passage" || s.kind === "vocabulary"),
};
const plan = compileStudyPlan({ report: partialReport, mode: "standard", taskId: "task-a", reportTitle: "t" });
const vocabQuiz = plan.stages.find((s: any) => s.id === "vocab-quiz");
check("부분 리포트: vocab-quiz 아이템 ≥1", !!vocabQuiz && vocabQuiz.items.length >= 1);
check("부분 리포트: grammar 스테이지 아이템 0(자연 비활성)", (plan.stages.find((s: any) => s.id === "grammar")?.items.length ?? 0) === 0);
check("부분 리포트: passage 원천 모듈(cloze)은 성립", plan.stages.some((s: any) => s.id === "cloze"));

// ── 8. 캐시 완료 가드 공용 헬퍼(스펙 §3.4.1-7, 검수 M2) ─────────────────────
const { isPartialAnalysisData } = paoMod as any;
check("가드: 마커 6종 미만 → 부분(캐시 재사용 금지)", isPartialAnalysisData({ _partialSections: ["passage", "vocabulary"] }) === true);
check("가드: 마커 6종 전부 → 완료 취급", isPartialAnalysisData({ _partialSections: [...FULL_ANALYSIS_SECTIONS] }) === false);
// 폐지 kind 는 계수에서 빠진다 — 옛 마커(5개 실섹션 + learning-worksheet)를 완료로 오판하지 않는다.
check("가드: 레거시 마커의 learning-worksheet 는 미계수", isPartialAnalysisData({ _partialSections: ["passage", "learning-worksheet", "summary", "grammar", "exam-focus", "vocabulary"] }) === true);
check("가드: 레거시 완료 마커(7종) → 완료 취급", isPartialAnalysisData({ _partialSections: ["passage", "learning-worksheet", ...FULL_ANALYSIS_SECTIONS] }) === false);
check("가드: 마커 부재(기존 데이터) → false(무회귀)", isPartialAnalysisData({ sentences: [] }) === false && isPartialAnalysisData(null) === false && isPartialAnalysisData("x") === false);

console.log(JSON.stringify({ passed, failures }));
`;

test("스튜디오 모듈 섹션 계약 (정본 일치·가격·상태·부분 컴파일)", () => {
  const result = runHarness(contractHarnessSource, ".contract-harness.mts");
  assert.deepEqual(result.failures, [], `실패한 검증: ${result.failures.join(", ")}`);
  assert.ok(result.passed > 20, `검증 수가 비정상적으로 적습니다: ${result.passed}`);
});

// U1 공유 계약(작업 지시서 원문 시그니처) 기준 — 파일이 아직 없으면 pending 으로
// 끝내고 위 계약 테스트는 그대로 통과시킨다(감독이 배리어 후 재실행).
const partialHarnessSource = `
import msMod from "@/lib/studio/module-sections";
const { partialAnalysisCreditCost, FULL_ANALYSIS_SECTIONS } = msMod as any;

const raw = await import("@/lib/passage-report/analysis-report/partial-analysis").catch(() => null);
if (!raw) {
  console.log(JSON.stringify({ pending: true, passed: 0, failures: [] }));
  process.exit(0);
}
const pa: any = { ...(raw as any), ...(((raw as any).default ?? {}) as any) };
const { computePartialAnalysisPlan, mergeReportPreservingExtras, buildSeedCheckpoint } = pa;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}
const J = (v: unknown) => JSON.stringify(v);

// 최소 인라인 픽스처 — 스키마 유효 형태를 유지한다(buildSeedCheckpoint 시드는
// 생성기가 coerceAndValidate 로 재검증하므로, 검증 구현이 끼어들어도 통과해야 함).
const meta = { titleKo: "부분 분석", titleEn: "partial", category: "", theme: "", difficulty: 3, solveTime: "", examTypes: "" };
const mkReport = (sections: any[]) => ({ schemaVersion: 1, brand: "T", themeId: "black-white", meta, sections });
const passageOld = { kind: "passage", sentences: [{ n: 1, en: "Old passage sentence.", ko: "옛 문장." }], keywords: [] };
const passageNew = { kind: "passage", sentences: [{ n: 1, en: "New passage sentence.", ko: "새 문장." }], keywords: [] };
const vocabOld = { kind: "vocabulary", rows: [{ headword: "oldword", meaning: "옛 뜻" }] };
const vocabNew = { kind: "vocabulary", rows: [{ headword: "newword", meaning: "새 뜻" }] };
const vocabPrior = { kind: "vocabulary", rows: [{ headword: "priorword", meaning: "선행 잡 뜻" }] };
const grammarSec = { kind: "grammar", rows: [{ sentenceNo: 1, point: "병렬", explanation: "and 로 동사원형 병렬." }] };
const selfCheckSec = { kind: "self-check", questions: [{ no: 1, type: "빈칸", prompt: "Q1" }], answers: [{ no: 1, answer: "A1" }] };
const structureSec = { kind: "structure-map", intro: { label: "도입" } };

// ── computePartialAnalysisPlan ──────────────────────────────────────────────
const p1 = computePartialAnalysisPlan({ targetSections: ["vocabulary"], freshReport: null });
check("PLAN: passage 강제 포함(요청에 없어도)", J(p1.targets) === J(["passage", "vocabulary"]));
check("PLAN: 리포트 부재 → present 빈 배열", Array.isArray(p1.present) && p1.present.length === 0);
check("PLAN: 리포트 부재 → missing = targets 전부", J(p1.missing) === J(["passage", "vocabulary"]));
check("PLAN: 2섹션 부족 = 2크레딧(어휘 첫 구매)", p1.creditCost === 2);

const p2 = computePartialAnalysisPlan({ targetSections: ["vocabulary"], freshReport: mkReport([passageOld]) });
check("PLAN: 보유 passage 차감(1크레딧)", J(p2.present) === J(["passage"]) && J(p2.missing) === J(["vocabulary"]) && p2.creditCost === 1);

const p3 = computePartialAnalysisPlan({ targetSections: ["vocabulary", "summary", "passage", "vocabulary"], freshReport: null });
check("PLAN: FULL 순서 정규화·중복 제거", J(p3.targets) === J(["passage", "summary", "vocabulary"]));

const p4 = computePartialAnalysisPlan({ targetSections: ["vocabulary"], freshReport: mkReport([passageOld, vocabOld]) });
check("PLAN: 전부 보유 → missing 빈·0크레딧(과금·LLM 없음)", p4.missing.length === 0 && p4.creditCost === 0);

const p5 = computePartialAnalysisPlan({ targetSections: [...FULL_ANALYSIS_SECTIONS], freshReport: null });
check("PLAN: 빈 지문 전체 6섹션 = 5크레딧(캡 = 기존 일괄가)", p5.missing.length === 6 && p5.creditCost === 5);
check("PLAN: creditCost ≡ partialAnalysisCreditCost(missing, present)", [p1, p2, p3, p4, p5].every((p: any) => p.creditCost === partialAnalysisCreditCost(p.missing.length, p.present.length)));
const p5b = computePartialAnalysisPlan({ targetSections: [...FULL_ANALYSIS_SECTIONS], freshReport: mkReport([passageOld, vocabOld]) });
check("PLAN: 부분(2보유) 뒤 남은 전체 = 3크레딧(누적 상한 — 순차 총액 5 유지)", p5b.creditCost === 3);

const p6 = computePartialAnalysisPlan({ targetSections: ["vocabulary"], freshReport: mkReport([selfCheckSec, passageOld]) });
check("PLAN: 비분석 섹션(self-check)은 present 에서 제외", J(p6.present) === J(["passage"]));

const p7 = computePartialAnalysisPlan({ targetSections: ["vocabulary"], freshReport: mkReport([grammarSec, passageOld]) });
check("PLAN: 보유 분석 섹션은 target 밖이어도 present 에(FULL 순서)", J(p7.present) === J(["passage", "grammar"]));
check("PLAN: target 밖 보유는 missing 불산입", J(p7.missing) === J(["vocabulary"]) && p7.creditCost === 1);

// ── mergeReportPreservingExtras ─────────────────────────────────────────────
const prevReport = mkReport([selfCheckSec, passageOld, structureSec, vocabOld]);
const genReport = mkReport([passageNew, vocabNew]);
const genSnapshot = J(genReport.sections);
const prevSnapshot = J(prevReport.sections);
const merged = mergeReportPreservingExtras(genReport, prevReport);
const mergedKinds = merged.sections.map((s: any) => s.kind);
const mergedPassage = merged.sections.find((s: any) => s.kind === "passage");
const mergedVocab = merged.sections.find((s: any) => s.kind === "vocabulary");
check("MERGE: 분석 섹션은 generated 가 이김(구본 잔존 금지)", mergedPassage?.sentences?.[0]?.en === "New passage sentence." && mergedVocab?.rows?.[0]?.headword === "newword");
check("MERGE: 같은 kind 중복 유입 없음", mergedKinds.filter((k: string) => k === "passage").length === 1 && mergedKinds.filter((k: string) => k === "vocabulary").length === 1);
check("MERGE: 비분석 섹션(self-check·structure-map) 보존", mergedKinds.includes("self-check") && mergedKinds.includes("structure-map"));
check("MERGE: 비분석 섹션은 뒤에 append·기존 상대 순서 유지", J(mergedKinds) === J(["passage", "vocabulary", "self-check", "structure-map"]));
check("MERGE: self-check 내용 무손실", J(merged.sections.find((s: any) => s.kind === "self-check")) === J(selfCheckSec));
check("MERGE: 입력 비변이(순수 함수)", J(genReport.sections) === genSnapshot && J(prevReport.sections) === prevSnapshot);
const mergedNoPrev = mergeReportPreservingExtras(genReport, null);
check("MERGE: previous=null → generated 섹션 그대로", J(mergedNoPrev.sections) === J(genReport.sections));

// (b) 되살림 — 생성기 산출에 없는 신선 보유 분석 섹션은 소실되지 않는다(검수 L5-4·L1-F7)
const prevWithGrammar = mkReport([passageOld, grammarSec, vocabOld]);
const genVocabOnly = mkReport([passageNew, vocabNew]);
const mergedRestore = mergeReportPreservingExtras(genVocabOnly, prevWithGrammar);
check("MERGE-되살림: gen 에 없는 보유 grammar 복원", !!mergedRestore.sections.find((s: any) => s.kind === "grammar"));
check("MERGE-되살림: FULL 순서 유지(passage→grammar→vocabulary)", J(mergedRestore.sections.map((s: any) => s.kind)) === J(["passage", "grammar", "vocabulary"]));

// (c) 실전 학습지 필드 오버레이 — strip 이 소거한 +5크레딧 콘텐츠 복원(검수 M1 critical)
const lwWorksheetGrade = {
  kind: "learning-worksheet",
  logicRows: [{ sentenceNo: 1, functionLabel: "주제", keyPoint: "옛 논리행" }],
  workbookSet: { wordOrders: [{ korean: "우리말", chunks: ["a", "b", "c"], answer: "a b c" }] },
  inferenceSet: { questions: [{ no: 1, prompt: "추론?", choices: [{ label: "①", text: "x" }], answerLabel: "①" }] },
  drills: { grammarChoices: [{ sentenceNo: 1, text: "t", choices: ["A", "B"], answer: "A" }] },
};
// 26-08-21 '지문 논리 구조 분석' 폐지 이후: 기본/부분 분석은 learning-worksheet 를 아예
// 만들지 않는다. 따라서 lw 는 분석 섹션이 아니라 '비분석 extras'로 통째 보존된다
// (= 유료 실전 학습지가 부분 분석 1회로 파괴되지 않는다는 M1 critical 보장은 그대로).
const mergedLw = mergeReportPreservingExtras(
  mkReport([passageNew]),
  mkReport([passageOld, lwWorksheetGrade, selfCheckSec]),
);
const lwOut: any = mergedLw.sections.find((s: any) => s.kind === "learning-worksheet");
check("MERGE-오버레이: workbookSet·inferenceSet·drills 복원(실전 파괴 금지)", !!lwOut?.workbookSet && !!lwOut?.inferenceSet && !!lwOut?.drills);
check("MERGE: 폐지 섹션(lw)은 previous 본 그대로 보존", lwOut?.logicRows?.[0]?.keyPoint === "옛 논리행");
check("MERGE-오버레이: self-check 도 함께 보존", mergedLw.sections.some((s: any) => s.kind === "self-check"));

// ── buildSeedCheckpoint ─────────────────────────────────────────────────────
const cpNone = buildSeedCheckpoint({ freshReport: null, prior: null, contentHash: "hash-1" });
check("SEED: 재료 없음 → null(또는 빈 시드)", cpNone === null || (cpNone && Object.keys(cpNone.sections ?? {}).length === 0));

const cp1 = buildSeedCheckpoint({ freshReport: mkReport([passageOld, vocabOld, selfCheckSec]), prior: null, contentHash: "hash-1" });
check("SEED: 리포트 섹션 시드·contentHash 각인", !!cp1 && cp1.contentHash === "hash-1" && !!cp1.sections?.passage && !!cp1.sections?.vocabulary);
check("SEED: 비분석 섹션(self-check)은 시드 제외", !!cp1 && !("self-check" in (cp1.sections ?? {})));

const prior = {
  contentHash: "hash-1",
  meta: null,
  sections: { vocabulary: vocabPrior, grammar: grammarSec },
  errors: { summary: "이전 실패" },
  updatedAt: 1,
};
const cp2 = buildSeedCheckpoint({ freshReport: mkReport([passageOld, vocabOld]), prior: prior as any, contentHash: "hash-1" });
check("SEED: 겹치는 kind 는 report 우선(vocabulary=리포트본)", !!cp2 && cp2.sections?.vocabulary?.rows?.[0]?.headword === "oldword");
check("SEED: 리포트에 없는 prior 섹션(grammar) 보완 유지", !!cp2 && !!cp2.sections?.grammar);
check("SEED: passage 시드 존재", !!cp2 && !!cp2.sections?.passage);

const cp3 = buildSeedCheckpoint({ freshReport: null, prior: prior as any, contentHash: "hash-1" });
check("SEED: 리포트 부재·prior 만 → prior 이어받기(재시도, 스펙 §3.4.1-5)", !!cp3 && !!cp3.sections?.grammar);

console.log(JSON.stringify({ passed, failures }));
`;

test("partial-analysis 헬퍼 계약 (U1 공유 계약 시그니처 기준)", (t) => {
  const result = runHarness(partialHarnessSource, ".partial-harness.mts");
  if (result.pending) {
    t.skip("파일 대기: src/lib/passage-report/analysis-report/partial-analysis.ts (U1 작업 중) — 배리어 후 재실행");
    return;
  }
  assert.deepEqual(result.failures, [], `실패한 검증: ${result.failures.join(", ")}`);
  assert.ok(result.passed > 15, `검증 수가 비정상적으로 적습니다: ${result.passed}`);
});
