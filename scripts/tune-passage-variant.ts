/* eslint-disable no-console */
// ============================================================================
// AI 지문 "전체 변형" 파인튜닝 하니스 (개발용 — 배포 무관)
//
//   npx tsx scripts/tune-passage-variant.ts                 # 전 모드 × 두 모델
//   npx tsx scripts/tune-passage-variant.ts related         # 한 모드만
//   npx tsx scripts/tune-passage-variant.ts opposite lite   # 한 모드 × 한 모델
//
// .env 의 ATLASCLOUD_API_KEY 또는 OPENROUTER_API_KEY 로 Gemini 모델들을 실제로
// 호출해, 같은 입력에 대한 두 모델 결과를 나란히 출력한다(품질·지연 비교용).
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
  /* .env 없으면 시스템 env 사용 */
}

import { runWholePassageTransform } from "../src/lib/passage-transform/whole-passage";
import type {
  VariantDirection,
  WholePassageTransformMode,
} from "../src/lib/passage-transform/schema";

const QUALITY_MODEL = "google/gemini-3.5-flash";
const LITE_MODEL = "google/gemini-3.1-flash-lite";

const PASSAGE = {
  id: "memory",
  text: `To understand memory, imagine your brain as a vast digital archive. Accessing this data depends on two primary methods: recall and recognition. Recall is the retrieval of information without external cues, like answering an essay question from scratch. Recognition, by contrast, involves identifying previously learned information with the help of hints, such as choosing the right answer on a multiple-choice test. While recognition is a low-effort process of identifying information with the help of cues, recall demands the active reconstruction of knowledge. This is why students often feel they know material when reviewing it, yet struggle to produce it during an exam. Effective studying, therefore, should prioritize practices that strengthen recall rather than mere recognition.`,
};

interface Job {
  label: string;
  mode: WholePassageTransformMode;
  direction?: VariantDirection;
}

const JOBS: Job[] = [
  { label: "RELATED_TOPIC", mode: "RELATED_TOPIC" },
  { label: "OPPOSITE_TOPIC", mode: "OPPOSITE_TOPIC" },
  { label: "DIFFICULTY · EASIER", mode: "DIFFICULTY", direction: "EASIER" },
  { label: "DIFFICULTY · HARDER", mode: "DIFFICULTY", direction: "HARDER" },
  { label: "LENGTH · SHORTER", mode: "LENGTH", direction: "SHORTER" },
  { label: "LENGTH · LONGER", mode: "LENGTH", direction: "LONGER" },
];

const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;
const rule = (label: string) =>
  console.log(`\n${"═".repeat(74)}\n■ ${label}\n${"═".repeat(74)}`);

async function runOne(job: Job, modelId: string) {
  const t0 = Date.now();
  try {
    const r = await runWholePassageTransform({
      mode: job.mode,
      passageText: PASSAGE.text,
      direction: job.direction,
      modelId,
    });
    console.log(`\n  ── ${modelId} (${Date.now() - t0}ms, ${wc(r.passage)}w) ──`);
    console.log(`  [제목]   ${r.title}`);
    console.log(`  [요약]   ${r.summary}`);
    console.log(`  [지문]\n${r.passage.replace(/^/gm, "    ")}`);
  } catch (err) {
    console.log(`\n  ── ${modelId} (${Date.now() - t0}ms) ──`);
    console.error(`  [실패] ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  const modeArg = (process.argv[2] || "all").toLowerCase();
  const modelArg = (process.argv[3] || "both").toLowerCase();
  const models =
    modelArg === "quality"
      ? [QUALITY_MODEL]
      : modelArg === "lite"
        ? [LITE_MODEL]
        : [QUALITY_MODEL, LITE_MODEL];

  const jobs = JOBS.filter(
    (j) =>
      modeArg === "all" ||
      j.mode.toLowerCase().includes(modeArg) ||
      j.label.toLowerCase().includes(modeArg),
  );

  console.log(`원본 (${wc(PASSAGE.text)}단어):\n${PASSAGE.text}`);
  for (const job of jobs) {
    rule(job.label);
    for (const m of models) await runOne(job, m);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
