/* eslint-disable no-console */
/**
 * 학생 시험 리포트 v3 — 실측 하니스 (E1a → E1b/E1c → E2 실LLM 파이프라인).
 *
 * v3 원칙: 구조화/OCR 폐기. 소넷 5가 학생 시험지 사진을 직접 보고 분석한다.
 * 이 하니스는 DB 없이 이미지 폴더만으로 엔진 함수(exam-analyze-direct / student-read)를
 * 라우트를 우회해 직접 호출하고, 콜/단계별 토큰·시간·비용과 판독 전량을 콘솔에 찍는다.
 *
 *   npx tsx scripts/_exam-report-llm-verify.ts                 # 전체(E1a+E1+E2)
 *   npx tsx scripts/_exam-report-llm-verify.ts --only=e1a      # examMap 추출만
 *   npx tsx scripts/_exam-report-llm-verify.ts --only=e1       # E1a + 문항분석/종합
 *   npx tsx scripts/_exam-report-llm-verify.ts --only=e2       # E1a + 답안 판독
 *   npx tsx scripts/_exam-report-llm-verify.ts --dir=<폴더>    # 이미지 폴더 오버라이드
 *   npx tsx scripts/_exam-report-llm-verify.ts --model=<id>    # 모델 오버라이드
 *   npx tsx scripts/_exam-report-llm-verify.ts --help          # 인자·사용법(LLM 콜 없음)
 *
 * 결과 JSON: 스크래치패드 exam-report/measure-v3-result.json.
 */
import { config } from "dotenv";
import { resolve, join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";

// ── 상수 ─────────────────────────────────────────────────────────────────────

const SCRATCH =
  "C:/Users/jooye/AppData/Local/Temp/claude/c--Users-jooye-Desktop-2026project-nara/044aea34-e6a0-4bff-a367-2074437fe8ac/scratchpad/exam-report";
const DEFAULT_DIR = join(SCRATCH, "fixtures-real");
const RESULT_PATH = join(SCRATCH, "measure-v3-result.json");

/** 실측 대상(한영고 영어I): 22 객관 + 6 서답 = 28문항 / 100점. */
const EXPECTED_QUESTIONS = 28;
const EXPECTED_POINTS = 100;

/** sonnet-5(ATLAS_PREMIUM) 단가 (USD / 1M tokens). 실측·책정 근거로 명시한다. */
const PRICE_PER_MTOK = { in: 3, out: 15 } as const;

/** 각 단계에 넉넉한 마감(로컬 실측 — 라우트 벽시계 제약 없음). */
const E1A_DEADLINE_MS = 300_000;
const ANALYZE_DEADLINE_MS = 900_000;
const READ_DEADLINE_MS = 300_000;

const EXAM_META = {
  title: "영어I",
  schoolName: "한영고등학교",
  grade: "고2",
  examType: "MIDTERM" as const,
};

// ── 인자 파싱 ────────────────────────────────────────────────────────────────

interface CliArgs {
  help: boolean;
  dir: string;
  only: string[]; // ["e1a","e1","e2"] 중 부분집합
  model?: string;
  /** 이전 결과 JSON(examMapMerged 포함) 경로 — 지정 시 E1a 스킵하고 재사용 */
  map?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const help = argv.includes("--help") || argv.includes("-h");
  const dirArg = argv.find((a) => a.startsWith("--dir="));
  const onlyArg = argv.find((a) => a.startsWith("--only="));
  const modelArg = argv.find((a) => a.startsWith("--model="));
  const mapArg = argv.find((a) => a.startsWith("--map="));

  const dir = dirArg ? dirArg.slice("--dir=".length) : DEFAULT_DIR;
  const onlyRaw = onlyArg ? onlyArg.slice("--only=".length) : "";
  const only = onlyRaw
    ? onlyRaw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : ["e1a", "e1", "e2"];
  const model = modelArg ? modelArg.slice("--model=".length).trim() : undefined;
  const map = mapArg ? mapArg.slice("--map=".length).trim() : undefined;

  return { help, dir, only, model, map };
}

function printHelp(args: CliArgs): void {
  console.log(`시험 리포트 v3 실측 하니스 — 인자·사용법

  --dir=<폴더>     시험지 이미지 폴더 (기본: ${DEFAULT_DIR})
  --only=<단계>    e1a | e1 | e2 콤마구분 (기본: 전체). e1/e2 는 examMap 위해 E1a 를 항상 선행.
  --model=<id>     EXAM_REPORT_{ANALYSIS,READ}_MODEL 오버라이드 (기본: ATLAS_PREMIUM_MODEL_ID=sonnet-5)
  --map=<json>     이전 결과 JSON 경로 — examMapMerged(없으면 examMap)를 재사용하고 E1a 스킵
  --help, -h       이 도움말(LLM 콜 없음)

[현재 파싱된 인자]
  dir   = ${args.dir}
  only  = ${args.only.join(", ")}
  model = ${args.model ?? "(기본 sonnet-5)"}

[출력]
  콘솔: ① examMap 구조(E1a, 정답없음) + 정합 체크(${EXPECTED_QUESTIONS}문항/${EXPECTED_POINTS}점 기대)
        ①-b E1b 병합 후 정답 표(정답은 E1b 가 도출)
        ② E1b 문항분석 요약  ③ E2 판독 전량 + uncertainties
        ④ 콜/단계별 토큰·시간·비용(sonnet-5 in $${PRICE_PER_MTOK.in}/M · out $${PRICE_PER_MTOK.out}/M)
  파일: ${RESULT_PATH}`);
}

// ── 유틸 ─────────────────────────────────────────────────────────────────────

interface UsageLike {
  promptTokens: number;
  completionTokens: number;
  calls: number;
}

function usdCost(u: { promptTokens: number; completionTokens: number }): number {
  return (
    (u.promptTokens / 1_000_000) * PRICE_PER_MTOK.in +
    (u.completionTokens / 1_000_000) * PRICE_PER_MTOK.out
  );
}

function pad(value: unknown, width: number): string {
  const s = value == null ? "" : String(value);
  return s.length >= width ? s.slice(0, width) : s.padEnd(width);
}

function oneLine(value: unknown, max = 60): string {
  const s = (value == null ? "" : String(value)).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

async function main(args: CliArgs): Promise<void> {
  // 모델 오버라이드는 model-config 가 env 를 읽기 전에 주입해야 한다(엔진 import 이전).
  if (args.model) {
    process.env.EXAM_REPORT_ANALYSIS_MODEL = args.model;
    process.env.EXAM_REPORT_READ_MODEL = args.model;
  }

  if (!existsSync(args.dir)) {
    throw new Error(`이미지 폴더가 없습니다: ${args.dir}`);
  }
  const files = readdirSync(args.dir)
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort();
  if (files.length === 0) {
    throw new Error(`이미지가 없습니다(jpg/png): ${args.dir}`);
  }

  // 파일명순으로 로드(섞여 있어도 엔진이 인쇄 페이지번호로 정렬한다는 전제).
  const images = files.map((f) => ({
    mimeType: f.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
    base64: readFileSync(join(args.dir, f)).toString("base64"),
  }));
  console.log(`이미지 ${images.length}장 로드: ${files.join(", ")}\n`);

  // 엔진 동적 import(모델 오버라이드 env 주입 이후).
  const { extractExamMap, analyzeExamDirect } = await import(
    "../src/lib/exam-report/exam-analyze-direct"
  );
  const { readStudentPaper } = await import("../src/lib/exam-report/student-read");
  const { getExamReportAiConfig } = await import("../src/lib/exam-report/model-config");

  const analysisModel = getExamReportAiConfig("examAnalysis").model;
  const readModel = getExamReportAiConfig("studentRead").model;
  console.log(`모델 — examAnalysis: ${analysisModel} / studentRead: ${readModel}\n`);

  const runAll = args.only.length === 0 || args.only.includes("all");
  const wantAnalyze = runAll || args.only.includes("e1");
  const wantRead = runAll || args.only.includes("e2");
  // e1a/e1/e2 모두 examMap 이 필요하므로 E1a 는 항상 실행.

  const result: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    dir: args.dir,
    files,
    models: { examAnalysis: analysisModel, studentRead: readModel },
    price: PRICE_PER_MTOK,
  };
  const stages: {
    stage: string;
    calls: number;
    promptTokens: number;
    completionTokens: number;
    ms: number;
    usd: number;
  }[] = [];

  // ── E1a: examMap 추출 (또는 --map 재사용) ──────────────────────────────────
  let examMap: ExamMapT;
  if (args.map) {
    const prior = JSON.parse(readFileSync(args.map, "utf-8")) as Record<string, unknown>;
    const reused = (prior.examMapMerged ?? prior.examMap) as ExamMapT | undefined;
    if (!reused?.questions?.length) {
      throw new Error(`--map 파일에 examMapMerged/examMap 이 없습니다: ${args.map}`);
    }
    examMap = reused;
    console.log(`=== E1a 스킵 — examMap 재사용 (${args.map}, 문항 ${examMap.questions.length}) ===`);
  } else {
    console.log("=== E1a: examMap 추출 (vision 1콜) ===");
    const e1aT0 = Date.now();
    const extracted = await extractExamMap({
      images,
      examMeta: EXAM_META,
      deadlineAt: Date.now() + E1A_DEADLINE_MS,
    });
    examMap = extracted.examMap;
    const e1aUsage = extracted.usage;
    stages.push({
      stage: "E1a examMap",
      calls: e1aUsage.calls,
      promptTokens: e1aUsage.promptTokens,
      completionTokens: e1aUsage.completionTokens,
      ms: Date.now() - e1aT0,
      usd: usdCost(e1aUsage),
    });
    printExamMapTable(examMap);
  }
  result.examMap = examMap;
  // E1b 병합 후 정답을 담을 examMap(판독은 이걸 컨텍스트로 씀). E1b 미실행 시엔
  // 정답 없는 구조 그대로 — read 는 정답 부재를 허용(E1 진행 중 판독 케이스).
  let examMapForRead: ExamMapT = examMap;

  // ── E1b/E1c: 문항분석 + 종합 ───────────────────────────────────────────────
  if (wantAnalyze) {
    console.log("\n=== E1b/E1c: 문항 심층분석 + 시험 종합 ===");
    const anT0 = Date.now();
    const outcome = await analyzeExamDirect({
      examMap,
      images,
      examMeta: EXAM_META,
      deadlineAt: Date.now() + ANALYZE_DEADLINE_MS,
      onBatchComplete: async (cp) => {
        const ok = cp.perQuestion.filter((p) => p.analysisStatus === "OK").length;
        console.log(`  배치 체크포인트: ${ok}/${examMap.questions.length} OK`);
      },
    });
    const anMs = Date.now() - anT0;
    stages.push({
      stage: "E1b/E1c 분석",
      calls: outcome.usage.calls,
      promptTokens: outcome.usage.promptTokens,
      completionTokens: outcome.usage.completionTokens,
      ms: anMs,
      usd: usdCost(outcome.usage),
    });
    result.analysis = outcome.checkpoint;
    result.analyzeMeta = {
      finished: outcome.finished,
      synthPending: outcome.synthPending,
      synthFailed: outcome.synthFailed,
      failedNumbers: outcome.failedNumbers,
    };
    printAnalysisSummary(outcome.checkpoint, examMap.questions.length, outcome);
    // E1b 도출 정답을 examMap 에 병합 → 정답 표 + 판독 컨텍스트로 사용.
    examMapForRead = mergeAnswers(examMap, outcome.checkpoint.answers);
    result.examMapMerged = examMapForRead;
    printAnswerTable(examMapForRead);
  }

  // ── E2: 답안 판독 ──────────────────────────────────────────────────────────
  if (wantRead) {
    console.log("\n=== E2: 학생 답안 판독 (vision 1콜) ===");
    const rdT0 = Date.now();
    const read = await readStudentPaper(images, examMapForRead, {
      deadlineAt: Date.now() + READ_DEADLINE_MS,
    });
    const rdMs = Date.now() - rdT0;
    const rdUsage: UsageLike = {
      promptTokens: read.aiMeta.promptTokens ?? 0,
      completionTokens: read.aiMeta.completionTokens ?? 0,
      calls: read.aiMeta.calls ?? 0,
    };
    stages.push({
      stage: "E2 판독",
      calls: rdUsage.calls,
      promptTokens: rdUsage.promptTokens,
      completionTokens: rdUsage.completionTokens,
      ms: rdMs,
      usd: usdCost(rdUsage),
    });
    result.read = read;
    printReadResult(read);
  }

  // ── ④ 토큰/시간/비용 집계 ──────────────────────────────────────────────────
  printCostSummary(stages);
  result.stages = stages;
  result.totals = stages.reduce(
    (acc, s) => ({
      calls: acc.calls + s.calls,
      promptTokens: acc.promptTokens + s.promptTokens,
      completionTokens: acc.completionTokens + s.completionTokens,
      ms: acc.ms + s.ms,
      usd: acc.usd + s.usd,
    }),
    { calls: 0, promptTokens: 0, completionTokens: 0, ms: 0, usd: 0 },
  );
  result.finishedAt = new Date().toISOString();

  // ── ⑤ 결과 JSON 저장 ───────────────────────────────────────────────────────
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), "utf8");
  console.log(`\n결과 JSON 저장: ${RESULT_PATH}`);
}

// ── 출력 헬퍼 ────────────────────────────────────────────────────────────────

type ExamMapT = Awaited<
  ReturnType<typeof import("../src/lib/exam-report/exam-analyze-direct").extractExamMap>
>["examMap"];
type CheckpointT = Awaited<
  ReturnType<typeof import("../src/lib/exam-report/exam-analyze-direct").analyzeExamDirect>
>["checkpoint"];
type AnswerT = CheckpointT["answers"][number];
type OutcomeT = Awaited<
  ReturnType<typeof import("../src/lib/exam-report/exam-analyze-direct").analyzeExamDirect>
>;
type ReadT = Awaited<
  ReturnType<typeof import("../src/lib/exam-report/student-read").readStudentPaper>
>;

// v3.1: E1a 는 구조(정답 없음)만 낸다. 정답 표는 E1b 병합 후 printAnswerTable 로.
function printExamMapTable(examMap: ExamMapT): void {
  console.log(
    `\n① examMap 구조(E1a, 정답 없음) — 문항 ${examMap.questions.length}개 / pageCount ${examMap.pageCount} / totalPoints ${examMap.totalPoints ?? "null"}`,
  );
  console.log(`${pad("번호", 8)}${pad("종류", 8)}${pad("배점", 6)}${pad("발문요약", 34)}유형라벨`);
  console.log("-".repeat(84));
  let pointsSum = 0;
  for (const q of examMap.questions) {
    if (typeof q.points === "number") pointsSum += q.points;
    console.log(
      `${pad(q.number, 8)}${pad(q.kind, 8)}${pad(q.points ?? "-", 6)}${pad(oneLine(q.brief, 32), 34)}${oneLine(q.typeLabel, 20)}`,
    );
  }
  console.log("-".repeat(84));

  // 정합 체크(구조)
  const qCount = examMap.questions.length;
  const totalPoints = examMap.totalPoints ?? pointsSum;
  const mcCount = examMap.questions.filter((q) => q.kind === "MC").length;
  const shortCount = examMap.questions.filter((q) => q.kind === "SHORT").length;
  const essayCount = examMap.questions.filter((q) => q.kind === "ESSAY").length;
  // E1a 는 정답을 내지 않아야 한다 — 유출 여부를 검증(전량 비어 있어야 정상).
  const leakedAnswers = examMap.questions.filter(
    (q) => q.correctAnswer != null && q.correctAnswer !== "",
  ).length;
  console.log(
    `정합: 문항수 ${qCount} (기대 ${EXPECTED_QUESTIONS}, ${qCount === EXPECTED_QUESTIONS ? "OK" : "불일치"}) / ` +
      `배점합 ${pointsSum}·표기총점 ${examMap.totalPoints ?? "null"} (기대 ${EXPECTED_POINTS}, ${totalPoints === EXPECTED_POINTS ? "OK" : "불일치"})`,
  );
  console.log(
    `구성: MC ${mcCount} · SHORT ${shortCount} · ESSAY ${essayCount} / E1a 정답유출 ${leakedAnswers} (0 이어야 정상)`,
  );
}

/** E1b 정답 도출을 examMap 에 병합(라우트 mergeAnswersIntoExamMap 규칙의 하니스판). */
function mergeAnswers(examMap: ExamMapT, answers: AnswerT[]): ExamMapT {
  const byKey = new Map(answers.map((a) => [a.number.replace(/\s+/g, ""), a]));
  return {
    ...examMap,
    questions: examMap.questions.map((q) => {
      const ans = byKey.get(q.number.replace(/\s+/g, ""));
      if (!ans) return q;
      return {
        ...q,
        correctAnswer: ans.correctAnswer ?? q.correctAnswer,
        answerConfidence: ans.answerConfidence,
      };
    }),
  };
}

/** E1b 병합 후 정답 표 — 번호/유형/정답/확신도 + 정합(정답미도출·LOW확신). */
function printAnswerTable(examMap: ExamMapT): void {
  console.log(`\n①-b examMap 정답(E1b 병합 후) — ${examMap.questions.length}문항`);
  console.log(`${pad("번호", 8)}${pad("종류", 8)}${pad("정답", 24)}${pad("확신도", 8)}유형라벨`);
  console.log("-".repeat(80));
  for (const q of examMap.questions) {
    console.log(
      `${pad(q.number, 8)}${pad(q.kind, 8)}${pad(oneLine(q.correctAnswer, 22), 24)}${pad(q.answerConfidence ?? "-", 8)}${oneLine(q.typeLabel, 20)}`,
    );
  }
  console.log("-".repeat(80));
  const noAnswer = examMap.questions.filter((q) => !q.correctAnswer).length;
  const lowConf = examMap.questions.filter((q) => q.answerConfidence === "LOW").length;
  console.log(`정답: 도출완료 ${examMap.questions.length - noAnswer}/${examMap.questions.length} · 미도출 ${noAnswer} · LOW확신 ${lowConf}`);
}

function printAnalysisSummary(cp: CheckpointT, total: number, outcome: OutcomeT): void {
  const ok = cp.perQuestion.filter((p) => p.analysisStatus === "OK");
  const failed = cp.perQuestion.filter((p) => p.analysisStatus === "FAILED");
  console.log(
    `\n② 문항분석 — OK ${ok.length}/${total} · FAILED ${failed.length} · examLevel ${cp.examLevel ? "생성" : "미생성"} · finished ${outcome.finished}`,
  );
  console.log(`${pad("번호", 8)}${pad("상태", 8)}${pad("난이도", 8)}유형라벨`);
  console.log("-".repeat(70));
  for (const a of cp.perQuestion) {
    console.log(
      `${pad(a.number, 8)}${pad(a.analysisStatus, 8)}${pad(a.difficulty, 8)}${oneLine(a.typeLabel, 40)}`,
    );
  }
  if (outcome.failedNumbers.length > 0) {
    console.log(`실패 문항: ${outcome.failedNumbers.join(", ")}`);
  }
  if (cp.examLevel) {
    console.log(`\n종합 총평: ${oneLine(cp.examLevel.overview, 120)}`);
  }
}

function printReadResult(read: ReadT): void {
  if (read.failed) {
    console.log("③ 판독 실패(failed:true) — 전량 UNKNOWN 폴백. LLM 콜 자체 실패.");
    return;
  }
  console.log(`\n③ E2 판독 — ${read.responses.length}문항`);
  console.log(
    `${pad("번호", 8)}${pad("학생답", 16)}${pad("상태", 10)}${pad("확신도", 8)}근거`,
  );
  console.log("-".repeat(90));
  for (const r of read.responses) {
    const studentAns =
      r.chosenChoice ?? r.aiRead?.writtenAnswer ?? r.aiRead?.chosenChoice ?? "-";
    console.log(
      `${pad(r.number, 8)}${pad(oneLine(studentAns, 14), 16)}${pad(r.status, 10)}${pad(r.aiRead?.confidence ?? "-", 8)}${oneLine(r.aiRead?.evidence, 44)}`,
    );
  }
  const counts = read.responses.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `상태 집계: ${Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ")}`,
  );

  console.log(`\n확인 요청(uncertainties) ${read.uncertainties.length}건:`);
  for (const u of read.uncertainties) {
    console.log(`  [${u.number}·${u.kind}] ${oneLine(u.question, 90)}`);
  }
}

function printCostSummary(
  stages: {
    stage: string;
    calls: number;
    promptTokens: number;
    completionTokens: number;
    ms: number;
    usd: number;
  }[],
): void {
  console.log(
    `\n④ 토큰/시간/비용 (sonnet-5 in $${PRICE_PER_MTOK.in}/M · out $${PRICE_PER_MTOK.out}/M)`,
  );
  console.log(
    `${pad("단계", 16)}${pad("콜", 5)}${pad("in tok", 10)}${pad("out tok", 10)}${pad("초", 8)}비용`,
  );
  console.log("-".repeat(64));
  const totals = { calls: 0, promptTokens: 0, completionTokens: 0, ms: 0, usd: 0 };
  for (const s of stages) {
    totals.calls += s.calls;
    totals.promptTokens += s.promptTokens;
    totals.completionTokens += s.completionTokens;
    totals.ms += s.ms;
    totals.usd += s.usd;
    console.log(
      `${pad(s.stage, 16)}${pad(s.calls, 5)}${pad(s.promptTokens, 10)}${pad(s.completionTokens, 10)}${pad((s.ms / 1000).toFixed(1), 8)}${usd(s.usd)}`,
    );
  }
  console.log("-".repeat(64));
  console.log(
    `${pad("합계", 16)}${pad(totals.calls, 5)}${pad(totals.promptTokens, 10)}${pad(totals.completionTokens, 10)}${pad((totals.ms / 1000).toFixed(1), 8)}${usd(totals.usd)}`,
  );
}

// ── 엔트리 ───────────────────────────────────────────────────────────────────

const cliArgs = parseArgs(process.argv.slice(2));
if (cliArgs.help) {
  // --help 는 env·엔진 로드 없이 즉시 출력하고 종료(LLM 콜 없음 — 스모크 안전).
  printHelp(cliArgs);
  process.exit(0);
}

// .env.local → .env 순으로 로드(help 경로엔 불필요하므로 실행 경로에서만).
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

main(cliArgs).catch((err) => {
  console.error("VERIFY FAILED:", err);
  process.exit(1);
});
