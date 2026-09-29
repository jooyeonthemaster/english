import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 그림 묘사 필드(composition/action/setting/mood)로 새어 든 글자·수치 — 26-09-30 벤치에서 콘티가
// action 에 "'Cost Reduction: -80%' highlighted on screen" 을 써 이미지에 지문에 없는 수치가
// 찍혔다. 검증기(수리 라운드 유도)와 컴파일러 소독(최후 방어선) 두 겹의 회귀 테스트.

const CASES = {
  quotedSingle: "A robotic data stream with 'Cost Reduction: -80%' highlighted on screen.",
  quotedDouble: 'A poster that says "Study Hard" on the wall.',
  bigNumber: "Processing 10,000,000+ chemical compounds on a monitor.",
  percentOnly: "A graph dropping by 45% toward the corner.",
  possessive: "Sally's hands grip the violin while the teacher's glasses glint.",
  plain: "Minji on the left, Junho on the right, eye lines crossing.",
  // 26-09-30 새 눈 검수가 찾은 오탐 — 글자 지시가 아닌 따옴표·프레이밍 퍼센트.
  emphasis: "Minji gives an 'I told you so' look to Junho.",
  framing: "Minji fills 70% of the frame, city lights behind.",
  nameTag: 'A girl wearing a name tag reading "MINJI" on her blazer.',
};

const harnessSource = `
import vt from "@/lib/webtoon-storyboard/visual-text";
import cm from "@/lib/webtoon-storyboard/compile";
const { hasVisualText } = vt;
const { sanitizeVisual } = cm;
const CASES = ${JSON.stringify(CASES)};
const out = {};
for (const [k, v] of Object.entries(CASES)) {
  out[k] = { flagged: hasVisualText(v), sanitized: sanitizeVisual(v) };
}
process.stdout.write(JSON.stringify(out));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, `.webtoon-visual-text-harness-${process.pid}.mts`);
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try { rmSync(harnessPath); } catch { /* ignore */ }
  }
}

const R = runHarness();

test("검증기: 따옴표 글자·퍼센트·큰 숫자를 잡는다", () => {
  for (const k of ["quotedSingle", "quotedDouble", "bigNumber", "percentOnly"]) {
    assert.equal(R[k].flagged, true, k);
  }
});

test("검증기: 소유격 아포스트로피·평범한 묘사는 통과(음성 대조군)", () => {
  assert.equal(R.possessive.flagged, false);
  assert.equal(R.plain.flagged, false);
});

test("검증기: 강조 따옴표·프레이밍 퍼센트는 글자 지시가 아니다 / 이름표 글자는 잡는다", () => {
  assert.equal(R.emphasis.flagged, false);
  assert.equal(R.framing.flagged, false);
  assert.equal(R.nameTag.flagged, true);
});

test("컴파일 소독: 강조 따옴표는 따옴표만 벗기고, 프레이밍은 'most of', 이름표 글자는 아이콘", () => {
  assert.equal(R.emphasis.sanitized, "Minji gives an I told you so look to Junho.");
  assert.equal(R.framing.sanitized, "Minji fills most of the frame, city lights behind.");
  assert.ok(!/MINJI/.test(R.nameTag.sanitized), R.nameTag.sanitized);
});

test("컴파일 소독: 벤치 실사례의 가짜 수치가 프롬프트에서 사라진다", () => {
  const s = R.quotedSingle.sanitized;
  assert.ok(!/80|%|Cost Reduction/.test(s), s);
  assert.ok(!/10,000,000/.test(R.bigNumber.sanitized), R.bigNumber.sanitized);
  assert.ok(!/45|%/.test(R.percentOnly.sanitized), R.percentOnly.sanitized);
  assert.ok(!/Study Hard/.test(R.quotedDouble.sanitized), R.quotedDouble.sanitized);
});

test("컴파일 소독: 정상 묘사는 바이트 그대로", () => {
  assert.equal(R.possessive.sanitized, CASES.possessive);
  assert.equal(R.plain.sanitized, CASES.plain);
});
