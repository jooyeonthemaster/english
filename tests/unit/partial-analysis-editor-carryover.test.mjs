import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// ============================================================================
// 부분 분석 병합 — 편집기 자산 캐리오버 계약 (E23 FX-MERGE)
// 대상: partial-analysis.ts mergeReportPreservingExtras 보존 (d)
//
// 결함 배경: 병합이 `{ ...generated, sections: [...] }` 로 조립돼 previousFresh 의
// customBlocks·blockMeta·blockOrder·hiddenSections·vocabTestOnly(교사 편집 자산)가
// 전부 소거 — 교사가 기본 학습지에 넣은 활동·웹툰 블록이 부분 분석 1회에 전멸했다.
// 생성기는 이 5필드를 만들지 않으므로 previousFresh 값 우선, 부재 시 generated 값.
// blockOrder 의 stale id 는 렌더 시 applyBlockOrder(editor-mutations.ts)가 자연 id
// 대조로 걸러내므로 통째 캐리가 안전하다(이 파일 실물 확인 완료).
//
// 하네스 관례는 studio-module-sections.test.mjs 를 따른다: TS 하네스를 임시 .mts 로
// 쓰고 npx tsx 로 실행, NODE_OPTIONS 에 react-server 조건(서버 전용 모듈 해소).
// ============================================================================

function runHarness(source, name) {
  const tmpDir = path.join(repoRoot, "tests", ".tmp-partial-analysis-carryover");
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

const carryoverHarnessSource = `
import paMod from "@/lib/passage-report/analysis-report/partial-analysis";
const { mergeReportPreservingExtras } = paMod as any;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}
const J = (v: unknown) => JSON.stringify(v);

// ── 픽스처 — 스키마 유효 형태 유지(customBlockSchema: activity·image) ─────────
const meta = { titleKo: "부분 분석", titleEn: "partial", category: "", theme: "", difficulty: 3, solveTime: "", examTypes: "" };
const mkReport = (sections: any[], extra: any = {}) => ({ schemaVersion: 1, brand: "T", themeId: "black-white", meta, sections, ...extra });
const passageOld = { kind: "passage", sentences: [{ n: 1, en: "Old passage sentence.", ko: "옛 문장." }], keywords: [] };
const passageNew = { kind: "passage", sentences: [{ n: 1, en: "New passage sentence.", ko: "새 문장." }], keywords: [] };
const vocabNew = { kind: "vocabulary", rows: [{ headword: "newword", meaning: "새 뜻" }] };
const selfCheckSec = { kind: "self-check", questions: [{ no: 1, type: "빈칸", prompt: "Q1" }], answers: [{ no: 1, answer: "A1" }] };

// 교사 삽입 활동 블록(keyword-cloze) + 웹툰 이미지 블록 — 부분 분석 1회에 전멸하던 자산.
const activityBlock = {
  kind: "activity",
  id: "c-act1",
  activityKind: "keyword-cloze",
  title: "키워드 빈칸",
  params: {},
  seed: 1,
  payload: { items: [{ no: 1, prompt: "Old ___ sentence.", answer: "passage" }] },
  answersHidden: true,
};
const imageBlock = {
  kind: "image",
  id: "c-img1",
  imageUrl: "https://example.supabase.co/webtoon/w1.png",
  webtoonId: "w1",
  widthPct: 70,
  align: "center",
};
const blockMeta = { "c-act1": { breakBefore: true }, "s0-p1": { hidden: true } };
// stale id("c-gone") 포함 — 렌더 시 applyBlockOrder 가 자연 id 대조로 걸러낸다.
const blockOrder = ["s0-p1", "c-act1", "c-img1", "c-gone"];
const hiddenSections = ["summary"];

const prevReport = mkReport([passageOld, selfCheckSec], {
  customBlocks: [activityBlock, imageBlock],
  blockMeta,
  blockOrder,
  hiddenSections,
  vocabTestOnly: true,
});
const genReport = mkReport([passageNew, vocabNew]);
const prevSnapshot = J(prevReport);
const genSnapshot = J(genReport);

// ── 캐리오버 — 5필드 전부 생존(previousFresh 값 그대로) ──────────────────────
const merged = mergeReportPreservingExtras(genReport, prevReport);
check("CARRY: customBlocks 2개(activity+image) 생존", J(merged.customBlocks) === J([activityBlock, imageBlock]));
check("CARRY: blockMeta 생존", J(merged.blockMeta) === J(blockMeta));
check("CARRY: blockOrder 생존(stale id 포함 통째 캐리)", J(merged.blockOrder) === J(blockOrder));
check("CARRY: hiddenSections 생존", J(merged.hiddenSections) === J(hiddenSections));
check("CARRY: vocabTestOnly 생존", merged.vocabTestOnly === true);

// ── 기존 3중 보존과의 공존 — 캐리오버가 섹션 병합 의미론을 건드리지 않는다 ────
check("CARRY: 분석 섹션은 여전히 generated 가 이김", merged.sections.find((s: any) => s.kind === "passage")?.sentences?.[0]?.en === "New passage sentence.");
check("CARRY: 비분석 섹션(self-check) 여전히 보존", merged.sections.some((s: any) => s.kind === "self-check"));
check("CARRY: 입력 비변이(순수 함수)", J(prevReport) === prevSnapshot && J(genReport) === genSnapshot);

// ── 부재 시 generated 값 — undefined 키를 새로 심지 않는다 ───────────────────
const prevBare = mkReport([passageOld]);
const genWithFields = mkReport([passageNew], { vocabTestOnly: false, hiddenSections: ["grammar"] });
const mergedBare = mergeReportPreservingExtras(genWithFields, prevBare);
check("FALLBACK: previousFresh 부재 필드는 generated 값 유지", mergedBare.vocabTestOnly === false && J(mergedBare.hiddenSections) === J(["grammar"]));
check("FALLBACK: 양측 부재 필드는 키 자체가 없다(undefined 미각인)", !("customBlocks" in mergedBare) && !("blockMeta" in mergedBare) && !("blockOrder" in mergedBare));

// ── previousFresh=null — 기존 단락 무회귀 ────────────────────────────────────
const mergedNull = mergeReportPreservingExtras(genReport, null);
check("NULL: previous=null → generated 그대로", J(mergedNull) === J(genReport));

console.log(JSON.stringify({ passed, failures }));
`;

test("부분 분석 병합 — 편집기 자산 5필드 캐리오버 (E23 FX-MERGE)", () => {
  const result = runHarness(carryoverHarnessSource, ".carryover-harness.mts");
  assert.deepEqual(result.failures, [], `실패한 검증: ${result.failures.join(", ")}`);
  assert.ok(result.passed >= 11, `검증 수가 비정상적으로 적습니다: ${result.passed}`);
});
