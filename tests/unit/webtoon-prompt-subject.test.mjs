import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// buildWebtoonImagePrompt 는 TS + `@/...` 앨리어스 → tsx 하니스로 실행해 JSON 요약을
// 뽑는다 (ko-text-core.test.mjs 하니스 패턴 미러).
//
// 핵심 계약:
//  1) 영어 경로 byte 무회귀 — subject 도입 전(2026-07-02) 원본 빌더로 캡처한
//     288케이스(스타일 6 × 언어 6 × 제목 2 × 추가지시 4) 결합 SHA-256 스냅샷과
//     subject 미지정/null/"ENGLISH" 출력이 전부 일치해야 한다.
//  2) subject === "KOREAN" 이면 "위 국어 지문" 문구 + 대사 기본 한국어(영어 전제
//     언어 모드는 국어 지시로 강등)여야 한다.
const harnessSource = `
// tsx runs these .ts modules as CommonJS (no "type":"module"), so Node's ESM
// interop only exposes the default export — destructure the named exports off it.
import { createHash } from "node:crypto";
import wp from "@/lib/webtoon-prompts";
const { buildWebtoonImagePrompt } = wp;

// subject 필드 도입 전 원본 buildWebtoonImagePrompt 로 캡처한 스냅샷
// (tmp/.webtoon-prompt-baseline.mts, 2026-07-02 — 288케이스 결합 SHA-256).
const BASELINE_COMBINED =
  "7e1dc2f05c190d55287c9c5d470c067abb6f1b3d0b09c804f4bc58a51754fd89";

const styles = [
  "KOREAN_WEBTOON",
  "PIXAR_3D",
  "GHIBLI",
  "MANHWA_ROMANCE",
  "REALISTIC",
  "BOGUS_STYLE",
];
const languages = [undefined, "KO", "KO_EN", "EN", "EN_KO_GLOSS", "BOGUS_LANG"];
const titles = ["", "  The Ant and the Grasshopper  "];
const customs = [undefined, "", "   ", "밝은 톤으로, 인물은 2명만"];
const content =
  "  Once upon a time, there was an ant.\\nIt worked hard all summer while the grasshopper sang.  ";

function combinedHash(subjectMode) {
  const hashes = [];
  for (const style of styles) {
    for (const language of languages) {
      for (const title of titles) {
        for (const custom of customs) {
          const input = {
            passageTitle: title,
            passageContent: content,
            style: style,
            language: language,
            customPrompt: custom,
          };
          if (subjectMode !== "OMIT") input.subject = subjectMode;
          const prompt = buildWebtoonImagePrompt(input);
          hashes.push(createHash("sha256").update(prompt, "utf8").digest("hex"));
        }
      }
    }
  }
  return createHash("sha256").update(hashes.join("\\n"), "utf8").digest("hex");
}

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}

// ── 1) 영어 경로 byte 무회귀 (스냅샷) ──
check("english snapshot: subject omitted", combinedHash("OMIT") === BASELINE_COMBINED);
check("english snapshot: subject null", combinedHash(null) === BASELINE_COMBINED);
check("english snapshot: subject ENGLISH", combinedHash("ENGLISH") === BASELINE_COMBINED);

const english = buildWebtoonImagePrompt({
  passageTitle: "Sample Title",
  passageContent: "Hello world passage.",
  style: "KOREAN_WEBTOON",
  language: "KO_EN",
  customPrompt: "귀엽게",
});
check("english: '위 영어 지문' intro", english.includes("위 영어 지문의 내용과 흐름을"));
check(
  "english: KO_EN direction intact",
  english.includes("각 말풍선에는 지문의 영어 원문 문장을 그대로 넣고"),
);

// ── 2) 국어 경로 ──
const koPassage = "옛날 옛적, 개미 한 마리가 살았다.\\n개미는 여름 내내 부지런히 일했다.";
const korean = buildWebtoonImagePrompt({
  passageTitle: "개미와 베짱이",
  passageContent: koPassage,
  style: "GHIBLI",
  language: "KO",
  customPrompt: "따뜻한 색감으로",
  subject: "KOREAN",
});
check("korean: '위 국어 지문' intro", korean.includes("위 국어 지문의 내용과 흐름을"));
check("korean: no '영어' anywhere", !korean.includes("영어"));
check(
  "korean: korean dialogue direction",
  korean.includes("지문 속 표현과 어휘를 살려 대사를 구성"),
);
check("korean: style direction kept", korean.includes("· 화풍: 지브리풍 수채"));
check("korean: custom prompt kept", korean.includes("· 추가 지시사항: 따뜻한 색감으로"));
check("korean: title kept", korean.includes("제목: 개미와 베짱이"));
check("korean: passage body kept", korean.includes("개미는 여름 내내 부지런히 일했다."));
check(
  "korean: layout/legibility directions kept",
  korean.includes("컷 사이는 여백이나 가는 구분선으로") &&
    korean.includes("글자는 또렷하고 읽기 쉽게"),
);

// 영어 전제 언어 모드는 국어 지시로 강등 (대사 기본 한국어)
for (const lang of [undefined, "KO_EN", "EN", "EN_KO_GLOSS"]) {
  const p = buildWebtoonImagePrompt({
    passageTitle: "",
    passageContent: koPassage,
    style: "KOREAN_WEBTOON",
    language: lang,
    subject: "KOREAN",
  });
  check(
    "korean lang=" + String(lang) + ": degrades to korean direction",
    p.includes("지문 속 표현과 어휘를 살려 대사를 구성") &&
      !p.includes("영어 원문") &&
      !p.includes("한국어 텍스트는 넣지 않는다"),
  );
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".webtoon-prompt-subject-harness.mts");
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

test("webtoon prompt subject: english byte-identical + korean parameterized", () => {
  assert.equal(
    summary.failed,
    0,
    `webtoon-prompt-subject failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 15, `expected ≥15 checks, got ${summary.passed}`);
});
