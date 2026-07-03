// ============================================================================
// KO 스팬 매칭 — PDF 붙여넣기 지문의 단어-중간 개행(whitespace-agnostic) 회귀 고정
// ----------------------------------------------------------------------------
// 실사고(26-07-03): PDF 복사 지문은 원문에 공백이 없는 자리에 개행이 박힌다
// ("조정\n(朝廷)의"). 구식 매칭(공백 1칸 접기)은 모델의 연속 인용
// ("조정(朝廷)의")을 못 찾아 ko-evidence-not-in-passage 로 전 시도 반려 →
// 워크벤치 국어 생성 0건. squash(공백 전제거) 매칭으로 해소 — 이 테스트가
// 그 계약을 고정한다. (어절 카운트·발문 검사는 canonical 유지 — 함께 고정)
// ============================================================================
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import { containsSpanKo, findSpanKo, eojeolCount, isNegativeStemKo } from "@/lib/korean/core/ko-text";

const failures: string[] = [];
const ok = (cond: boolean, label: string) => { if (!cond) failures.push(label); };
const NL = String.fromCharCode(10);

// PDF 하드랩 지문: 단어 중간 개행(공백 없음) + 어절 사이 개행 혼재
const passage = [
  "서양 해부학이 야기하는 윤리적 문제도 서양 의학의",
  "영향력을 제한하는 요인으로 작용하였으며, 서학에 대한 조정",
  "(朝廷)의 금지 조치도 걸림돌이었다. 그러던 중 19세기 실학자",
  "최한기는 신기를 신체 운동의 원인으로 규정",
  "하여 이 문제를 해결하려 하였다.",
].join(NL);

// 1) 모델의 연속 인용(개행 없음)이 지문의 단어-중간 개행을 넘어 매칭
ok(containsSpanKo(passage, "서학에 대한 조정(朝廷)의 금지 조치도 걸림돌이었다."), "단어중간 개행 containsSpanKo");
const m1 = findSpanKo(passage, "조정(朝廷)의 금지 조치");
ok(m1 !== null, "단어중간 개행 findSpanKo 해소");
ok(m1 !== null && passage.slice(m1.sourceStart, m1.sourceEnd).includes("조정"), "sourceStart 원문 좌표");

// 2) 역방향: 인용에 공백이 있고 지문이 붙어 있는 경우도 매칭
ok(containsSpanKo("신기를신체운동의 원인으로", "신기를 신체 운동의 원인으로"), "공백 유무 역방향");

// 3) 어절 사이 개행(정상 랩)도 여전히 매칭 — 규정+개행+하여
ok(containsSpanKo(passage, "신기를 신체 운동의 원인으로 규정하여"), "규정(개행)하여 매칭");

// 4) verbatim 엄격성 유지 — 조사/글자 변형은 불허
ok(!containsSpanKo(passage, "서학에 대한 조정(朝廷)이 금지 조치"), "조사 변형 불허");

// 5) canonical 소비자 무회귀: 어절 카운트·부정발문 판정은 공백 유지 폼
ok(eojeolCount("서학에 대한 조정") === 3, "어절 카운트 유지");
ok(isNegativeStemKo("윗글의 내용과 일치하지 않는 것은?"), "부정발문 판정 유지");

if (failures.length > 0) {
  console.log(JSON.stringify(failures));
  process.exit(1);
}
console.log("OK");
`;

test("ko span matching: PDF hard-wrap whitespace-agnostic contract", () => {
  const dir = path.join(repoRoot, ".tmp-ko-span-test");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "harness.ts");
  writeFileSync(file, harnessSource);
  try {
    const out = execSync(`npx tsx "${file}"`, { cwd: repoRoot, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    assert.ok(out.includes("OK"), `harness output: ${out}`);
  } catch (error) {
    const e = error;
    assert.fail(`ko-span-pdf-wrap failures: ${e.stdout || ""} ${e.stderr || ""}`.slice(0, 800));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
