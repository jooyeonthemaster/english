// O201 S3i 이식 결정형 게이트 3종 단위 검증 — 실험 러너(hg5-runner.mjs gateCheck)의
// 판정과 프로덕션 이식본이 동치인지, 그리고 실측 오탐 이력(중략 인용 조각 분할)이
// 재발하지 않는지 고정한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import spanCarve from "@/lib/question-quality/validators/blank/span-carve";
import quoted from "@/lib/question-quality/validators/explanation-quoted-tokens";

const { findBlankSentenceSwallowIssue, findBlankTrailingDependentIssue } = spanCarve;
const { findExplanationQuotedTokenIssue } = quoted;

const passage =
  "Technology reshapes how students learn in modern classrooms. " +
  "Teachers who adapt their methods to new tools often discover unexpected benefits for every learner. " +
  "However, the core of education remains unchanged.";

const out = {
  // (1) 문장삼킴 88%: 호스트 문장 거의 전부를 스팬으로 → 발화.
  swallowFires: findBlankSentenceSwallowIssue(
    passage,
    "Teachers who adapt their methods to new tools often discover unexpected benefits for every learner",
  )?.code ?? null,
  // 짧은 구 스팬 → 미발화.
  swallowQuiet: findBlankSentenceSwallowIssue(
    passage,
    "unexpected benefits for every learner",
  )?.code ?? null,
  // 스팬이 지문에 없으면 판정 불가(null) — ORIGINAL_NOT_VERBATIM 게이트의 몫.
  swallowAbsent: findBlankSentenceSwallowIssue(passage, "totally invented span")?.code ?? null,

  // (2) 빈칸 직후 의존 잔여: ", which" → 발화.
  trailingWhich: findBlankTrailingDependentIssue(
    "Some ideas _____, which never happens in practice.",
  )?.code ?? null,
  trailingInWhich: findBlankTrailingDependentIssue(
    "The lab is a place _____ in which nothing is wasted.",
  )?.code ?? null,
  trailingNor: findBlankTrailingDependentIssue(
    "He could not read _____, nor could he write.",
  )?.code ?? null,
  // 정상 이음새 → 미발화.
  trailingQuiet: findBlankTrailingDependentIssue(
    "Some ideas _____ and become mainstream later.",
  )?.code ?? null,
  // 다중 빈칸은 판정 제외(null).
  trailingMulti: findBlankTrailingDependentIssue(
    "A _____ and B _____, which is fine.",
  )?.code ?? null,

  // (3) 해설 인용 실재: 지문·선지 어디에도 없는 12자+ 영어 인용 → 발화.
  quotedHallucination: findExplanationQuotedTokenIssue(
    {
      options: [{ label: 1, text: "adapting teaching methods" }],
      explanation:
        "지문의 'completely fabricated expression'이라는 표현이 근거입니다.",
      wrongOptionExplanations: { "2": "오답입니다." },
      keyPoints: ["포인트"],
    },
    passage,
  )?.code ?? null,
  // 실재 인용(지문 축자) → 미발화.
  quotedReal: findExplanationQuotedTokenIssue(
    {
      options: [{ label: 1, text: "adapting teaching methods" }],
      explanation:
        "지문의 'the core of education remains unchanged'가 결정적 근거입니다.",
    },
    passage,
  )?.code ?? null,
  // 선지 표면 인용 → 미발화 (허용 코퍼스에 문항 전 필드 포함).
  quotedFromOption: findExplanationQuotedTokenIssue(
    {
      options: [{ label: 1, text: "adapting teaching methods" }],
      explanation: "정답 'adapting teaching methods'는 교수법 적응을 뜻합니다.",
    },
    passage,
  )?.code ?? null,
  // 중략(…) 인용: 두 조각이 모두 실재하면 미발화 (O201 오탐 이력 봉합 재현).
  quotedEllipsis: findExplanationQuotedTokenIssue(
    {
      options: [],
      explanation:
        "'Technology reshapes how students … benefits for every learner'의 흐름이 근거입니다.",
    },
    passage,
  )?.code ?? null,
  // 12자 미만 조각만 있는 인용 → 검사 제외(미발화).
  quotedShort: findExplanationQuotedTokenIssue(
    { options: [], explanation: "'fake word'라는 짧은 인용." },
    passage,
  )?.code ?? null,
};
console.log(JSON.stringify(out));
`;

test("S3i deterministic gates: sentence swallow, trailing dependent, quoted token", () => {
  const tmpDir = path.join(repoRoot, "tests", ".tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".s3i-gates-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const r = JSON.parse(raw);

    assert.equal(r.swallowFires, "blank-span-sentence-swallow");
    assert.equal(r.swallowQuiet, null);
    assert.equal(r.swallowAbsent, null);

    assert.equal(r.trailingWhich, "blank-trailing-dependent");
    assert.equal(r.trailingInWhich, "blank-trailing-dependent");
    assert.equal(r.trailingNor, "blank-trailing-dependent");
    assert.equal(r.trailingQuiet, null);
    assert.equal(r.trailingMulti, null);

    assert.equal(r.quotedHallucination, "explanation-quoted-token-missing");
    assert.equal(r.quotedReal, null);
    assert.equal(r.quotedFromOption, null);
    assert.equal(r.quotedEllipsis, null);
    assert.equal(r.quotedShort, null);
  } finally {
    rmSync(harnessPath, { force: true });
  }
});
