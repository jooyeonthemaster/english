import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 국어 표면 배선(B1c) 계약 검증 — TS + `@/...` 앨리어스 모듈이라 tsx 하니스로
// 실행해 JSON 요약을 뽑는다(collection-subject-scope.test.mjs 패턴 미러).
//
// 계약:
//  1. isKoAnalysisReportShape — 보고서 JSON 의 과목 판별 게이트.
//     루트 subject="KOREAN" 또는 KO 섹션 kind 가 하나라도 있으면 KO.
//     영어 보고서(subject 없음·영어 kind만)는 항상 false → 영어 경로 무회귀.
//     이 게이트가 편집기(영어 활동 팔레트/실전 학습지 비노출)와 미리보기 파싱
//     분기를 모두 구동한다.
//  2. parseAnalysisReportForPreview — 미리보기 파싱: KO 모양이면 ko 스키마,
//     아니면 기존 영어 스키마. KO 보고서가 영어 스키마 직파싱으로 empty 가
//     되는 갭(learning-sheet-preview-modal)을 막는 공용 게이트.
const harnessSource = `
// tsx runs these .ts modules as CommonJS (no "type":"module"), so Node's ESM
// interop only exposes the default export — destructure the named exports off it.
import detectMod from "@/lib/passage-report/analysis-report/ko-report-detect";
const { isKoAnalysisReportShape } = detectMod;
import previewParseMod from "@/lib/passage-report/analysis-report/preview-parse";
const { parseAnalysisReportForPreview } = previewParseMod;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}

// ── 최소 유효 영어 보고서 (schema 기본값이 나머지를 채움) ──
const enReport = {
  meta: {
    titleKo: "기억의 두 얼굴",
    titleEn: "Two Faces of Memory",
    category: "비문학",
    theme: "인지심리",
    difficulty: 3,
    solveTime: "3분",
    examTypes: "빈칸·어법",
  },
  sections: [
    { kind: "passage", sentences: [{ n: 1, en: "Hello.", ko: "안녕." }] },
  ],
};

// ── 최소 유효 KO 보고서 (subject 는 스키마 기본값 "KOREAN") ──
const koReport = {
  meta: { titleKo: "산유화" },
  sections: [{ kind: "ko-passage", text: "산에는 꽃 피네 꽃이 피네" }],
};

// ── 1. KO 판별 게이트 ──
check("detect: 루트 subject=KOREAN → KO", isKoAnalysisReportShape({ subject: "KOREAN" }) === true);
check("detect: KO 섹션 kind(ko-passage)만으로도 KO", isKoAnalysisReportShape(koReport) === true);
check("detect: 영어 보고서는 false (무회귀 핵심)", isKoAnalysisReportShape(enReport) === false);
check("detect: null/원시값/빈객체 안전",
  isKoAnalysisReportShape(null) === false &&
  isKoAnalysisReportShape("KOREAN") === false &&
  isKoAnalysisReportShape({}) === false);
check("detect: sections 가 배열이 아니면 false", isKoAnalysisReportShape({ sections: "x" }) === false);
check("detect: 섹션 원소가 null 이어도 안전", isKoAnalysisReportShape({ sections: [null, { kind: "ko-overview" }] }) === true);

// ── 2. 미리보기 파싱 게이트 ──
const enParsed = parseAnalysisReportForPreview(enReport);
check("preview: 영어 보고서 → 영어 스키마로 파싱 성공", !!enParsed && enParsed.sections[0].kind === "passage");
check("preview: 영어 파싱 결과에 subject 판별자 없음(영어 스키마 경유)", !!enParsed && enParsed.subject === undefined);

const koParsed = parseAnalysisReportForPreview(koReport);
check("preview: KO 보고서 → ko 스키마 분기로 파싱 성공(프리뷰 empty 갭 해소)", !!koParsed && koParsed.sections[0].kind === "ko-passage");
check("preview: KO 파싱이 subject=KOREAN 판별자를 채움", !!koParsed && koParsed.subject === "KOREAN");
check("preview: KO 메타 보존", !!koParsed && koParsed.meta.titleKo === "산유화");

// KO 모양이지만 무효(ko-passage.text 누락) → 영어 스키마로 새지 않고 null
const koInvalid = { subject: "KOREAN", meta: { titleKo: "t" }, sections: [{ kind: "ko-passage" }] };
check("preview: KO 모양+무효 → null (영어 스키마로 폴스루 금지)", parseAnalysisReportForPreview(koInvalid) === null);

check("preview: 쓰레기 입력 → null",
  parseAnalysisReportForPreview(null) === null &&
  parseAnalysisReportForPreview({ hello: 1 }) === null);

// ── 3. 파싱 결과가 다시 판별 게이트와 일관 (편집기 게이트 구동 경로) ──
check("round-trip: KO 파싱 결과 → 편집기 게이트 true", isKoAnalysisReportShape(koParsed) === true);
check("round-trip: 영어 파싱 결과 → 편집기 게이트 false", isKoAnalysisReportShape(enParsed) === false);

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-passage-surface-wiring-harness.mts");
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

const summary = runHarness();

test("ko passage surface wiring: PRIME_KO 판별·미리보기 파싱 게이트", () => {
  assert.equal(
    summary.failed,
    0,
    `ko-passage-surface-wiring failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 12, `expected ≥12 checks, got ${summary.passed}`);
});
