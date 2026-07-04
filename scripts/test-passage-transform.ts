/* eslint-disable no-console */
// ============================================================================
// AI 지문 변형 프롬프트 실호출 검증 하니스 (개발용 — 배포와 무관)
//
//   npx tsx scripts/test-passage-transform.ts            # 전체 (paraphrase + prepend)
//   npx tsx scripts/test-passage-transform.ts paraphrase # 한 모드만
//
// .env 의 ATLASCLOUD_API_KEY 또는 OPENROUTER_API_KEY 를 사용해 flash-lite 를 실제 호출하고,
// 결과를 사람이 검수할 수 있게 출력한다.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// .env 수동 로드 (dotenv 미설치 — Next 외부 실행이므로 직접 파싱)
try {
  const envFile = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
} catch {
  // .env 없으면 시스템 env 사용
}

import {
  runParaphrase,
  runPrepend,
  TRANSFORM_MODEL_ID,
} from "../src/lib/passage-transform/generate";

// ─── 실전형 수능 스타일 테스트 지문 3종 ─────────────────────────────────────

const PASSAGES = [
  {
    id: "memory",
    text: `To understand memory, imagine your brain as a vast digital archive. Accessing this data depends on two primary methods: recall and recognition. Recall is the retrieval of information without external cues, like answering an essay question from scratch. Recognition, by contrast, involves identifying previously learned information with the help of hints, such as choosing the right answer on a multiple-choice test. While recognition is a low-effort process of identifying information with the help of cues, recall demands the active reconstruction of knowledge. This is why students often feel they know material when reviewing it, yet struggle to produce it during an exam. Effective studying, therefore, should prioritize practices that strengthen recall rather than mere recognition.`,
    paraphraseSpan:
      "Recall is the retrieval of information without external cues, like answering an essay question from scratch.",
  },
  {
    id: "science-creativity",
    text: `It is important to recognize that although science is a rule-based procedure, it is very much a creative process. A conjecture is a leap of imagination that goes beyond the available evidence. Scientific knowledge is not a static set of facts but a creative and dynamic process in which researchers imagine possibilities that no one has yet observed. Without such imaginative leaps, experiments would have no direction, and data would remain a meaningless collection of numbers. The greatest discoveries in history began not with measurement but with a bold guess about how the world might work.`,
    paraphraseSpan:
      "Without such imaginative leaps, experiments would have no direction, and data would remain a meaningless collection of numbers.",
  },
  {
    id: "reason-emotion",
    text: `A common but incorrect assumption is that we are creatures of reason when, in fact, we are creatures of both reason and emotion. We cannot get by on reason alone, since any decision involves weighing alternatives that ultimately matter to us emotionally. Human reasoning is not entirely independent but is ultimately grounded in and driven by feeling. When brain regions associated with emotion are damaged, patients do not become perfectly rational; instead, they become unable to decide even trivial matters, endlessly listing pros and cons without ever committing to a choice.`,
    paraphraseSpan:
      "We cannot get by on reason alone, since any decision involves weighing alternatives that ultimately matter to us emotionally.",
  },
];

const divider = (label: string) =>
  console.log(`\n${"═".repeat(70)}\n■ ${label}\n${"═".repeat(70)}`);

async function testParaphrase() {
  for (const p of PASSAGES) {
    divider(`PARAPHRASE — ${p.id}`);
    console.log(`[원문] ${p.paraphraseSpan}`);
    const t0 = Date.now();
    try {
      const r = await runParaphrase({
        passageText: p.text,
        selectedText: p.paraphraseSpan,
      });
      console.log(`[변형] ${r.rewrittenText}`);
      console.log(`[교체] ${r.changes.map((c) => `${c.before}→${c.after}`).join(" | ")}`);
      console.log(`[노트] ${r.note}`);
      console.log(`[시간] ${Date.now() - t0}ms`);

      // 재생성(avoid) 다양성 검증 — 1회만
      if (p.id === "memory") {
        const r2 = await runParaphrase({
          passageText: p.text,
          selectedText: p.paraphraseSpan,
          avoidTexts: [r.rewrittenText],
        });
        console.log(`[재생성] ${r2.rewrittenText}`);
        const same =
          r2.rewrittenText.trim().toLowerCase() ===
          r.rewrittenText.trim().toLowerCase();
        console.log(`[재생성 다양성] ${same ? "✗ 동일(문제!)" : "✓ 다름"}`);
      }
    } catch (err) {
      console.error(`[실패] ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function testPrepend() {
  for (const p of PASSAGES) {
    divider(`PREPEND — ${p.id}`);
    console.log(`[지문 첫 문장] ${p.text.split(". ")[0]}.`);
    const t0 = Date.now();
    try {
      const r = await runPrepend({ passageText: p.text });
      console.log(`[새 앞 문단] ${r.paragraph}`);
      console.log(`[노트] ${r.note}`);
      console.log(`[시간] ${Date.now() - t0}ms`);
      console.log(`[연결 미리보기]\n--- ${r.paragraph.split(". ").slice(-1)[0]} ${p.text.split(". ")[0]}. ---`);
    } catch (err) {
      console.error(`[실패] ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function main() {
  const target = (process.argv[2] || "all").toLowerCase();
  console.log(`모델: ${TRANSFORM_MODEL_ID}`);
  if (target === "all" || target === "paraphrase") await testParaphrase();
  if (target === "all" || target === "prepend") await testPrepend();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
