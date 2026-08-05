// ============================================================================
// 화면 문구 폭 예산 계약 — 팝오버 한 줄에 들어가는지 검사한다.
//
// 왜 있나: 26-07-26 오너 지적 — [예시] 드롭다운에서 문구 하나만 두 줄로 접혀
// 항목 높이가 들쭉날쭉했다. 코드 주석은 "340px 는 요청문이 접히지 않는 최소 폭"
// 이라고 **보장을 주장**하고 있었지만 그걸 강제하는 것이 아무것도 없었다.
// 주석은 규칙이 아니다 — 검사가 규칙이다.
//
// 이 테스트는 픽셀을 정확히 재지 않는다(폰트 메트릭은 환경마다 다르다).
// "누가 30자짜리 예시를 새로 적었다"를 잡는 것이 목적이므로 글자 수로 센다.
// ============================================================================
import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

/**
 * 예산 근거(passage-authoring-glossary 의 "한 줄 예산" 주석과 같은 값):
 * 팝오버 w-[340px] − p-1(8) − 항목 px-2(16) = 글자 폭 316px.
 * DESK.body 13px 기준 한글 ≈13px · 공백 ≈4px 이므로 20자 + 6칸 ≈ 284px 로
 * 32px 여유가 남는다. 여기에 맞춰 상한을 둔다.
 */
const MAX_NON_SPACE_CHARS = 20;
const MAX_TOTAL_GLYPHS = 26;

const harnessSource = `
import * as glossary from "@/lib/wording/passage-authoring-glossary";
const { INSTRUCTION_EXAMPLES } = glossary as any;

const rows = (INSTRUCTION_EXAMPLES as string[]).map((text) => ({
  text,
  nonSpace: text.replace(/\\s/g, "").length,
  glyphs: text.length,
}));
console.log(JSON.stringify(rows));
`;

test("passage-authoring instruction examples fit one popover line", () => {
  const tmpDir = path.join(repoRoot, "tests", ".tmp-authoring-copy");
  fs.mkdirSync(tmpDir, { recursive: true });
  const entry = path.join(tmpDir, "probe.ts");
  fs.writeFileSync(entry, harnessSource, "utf8");

  let stdout = "";
  try {
    stdout = execSync(`npx tsx "${entry}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 120_000,
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const lastLine = stdout.trim().split("\n").filter(Boolean).pop() ?? "[]";
  const rows = JSON.parse(lastLine);

  assert.ok(rows.length >= 4, `예시가 너무 적게 읽혔다(${rows.length}건)`);

  const tooLong = rows.filter(
    (r) => r.nonSpace > MAX_NON_SPACE_CHARS || r.glyphs > MAX_TOTAL_GLYPHS,
  );
  assert.deepEqual(
    tooLong.map((r) => `${r.text} (${r.nonSpace}자/${r.glyphs}글리프)`),
    [],
    `한 줄 예산 초과 — 팝오버에서 두 줄로 접힌다. 문구를 줄이거나(권장) 팝오버 폭을 먼저 늘려라`,
  );

  // 완결된 요청문 계약(글로서리 주석) — 조각이 아니라 문장이어야 한다.
  const notSentence = rows.filter((r) => !/(주세요|하세요)$/.test(r.text));
  assert.deepEqual(
    notSentence.map((r) => r.text),
    [],
    "예시는 완결된 요청문이어야 한다(조각은 다른 줄과 이어 붙으면 뜻이 무너진다)",
  );

  // 학년 신호 중복 금지 계약 — 학년은 설정 레일이 정한다.
  const mentionsGrade = rows.filter((r) => /(중\d|고\d|수능|학년)/.test(r.text));
  assert.deepEqual(
    mentionsGrade.map((r) => r.text),
    [],
    "예시가 학년을 말하면 한 요청에 학년 신호가 둘이 된다(spec.gradeBand 와 충돌)",
  );
});
