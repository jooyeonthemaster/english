// ============================================================================
// 학생 시험 리포트 v3 — 시험 직접분석 (E1a examMap 추출 + E1b 문항분석 + E1c 종합)
//
// v3 원칙: 구조화 렌더 없이 소넷 5가 시험지 사진을 직접 본다.
//   E1a extractExamMap: 전 페이지 1콜 → examMap(소넷이 직접 풀어 정답 도출).
//        완료 시점에 문항수 확정 → 라우트가 과금 후 E1b/E1c 를 이어간다.
//   E1b analyzeExamDirect: 8문항/배치. 이미지 재전송 + prompt cache(system+마지막 이미지).
//        배치1 단독 선실행(캐시 쓰기) → 잔여 배치 동시 2 팬아웃(캐시 히트).
//   E1c: 전 문항 판정 완료 시 텍스트 콜 1회(이미지 불요).
// 체크포인트/재개/lease 펜싱 구조는 v2 analyze.ts 를 그대로 계승 — 라우트가 증분 저장.
// ============================================================================

import type { z } from "zod";
import type { AtlasChatImageInput } from "@/lib/atlas-chat-rest";
import {
  examLevelAnalysisSchema,
  examMapExtractionSchema,
  normalizeChoiceToken,
  questionAnalysisBatchSchema,
} from "./schemas";
import type {
  Confidence,
  ExamAnalysisResult,
  ExamLevelAnalysis,
  ExamMap,
  ExamMapAnswer,
  ExamMapEntry,
  QuestionAnalysis,
} from "./types";
import {
  buildAnalysisSystemPrompt,
  buildAnalysisUserPrompt,
  buildExamMapDigest,
  buildExamMapSystemPrompt,
  buildExamMapUserPrompt,
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  type ExamReportMeta,
} from "./prompts";
import {
  callExamReportJson,
  createExamReportUsage,
  type ExamReportLlmUsage,
} from "./llm";
import { reconcileBatchAnswers } from "./answer-consistency";

// v3.1: E1b 가 문항 분석에 더해 "정답 도출(풀이)"까지 맡으므로(E1a 에서 이관), 배치당
// 작업량이 늘었다. 콜당 지연·출력(12000 토큰 캡)에 여유를 두려고 8 → 6 으로 낮춘다.
const BATCH_SIZE = 6;
const FANOUT_CONCURRENCY = 2;
/**
 * D1-b: 새 배치를 시작하기 전 잔여 마감 예산 가드. E1b 배치 실측이 ~80s 이므로,
 * 마감(270s)까지 이 예산 미만이면 새 배치를 시작하지 않고 그 시점 체크포인트로 종결
 * (resume 신호 반환). 30s 처럼 좁게 잡으면 마감 직전 시작한 배치가 잘린 타임아웃으로
 * 도살되며 배치 전 문항 FAILED 를 양산한다(라우트 270s 에서만 재현된 원인).
 */
const MIN_BATCH_BUDGET_MS = 110_000;
/** 마감까지 이 예산 이상 남아야 E1c 종합을 시도한다(동일 가드). */
const SYNTH_MIN_REMAINING_MS = MIN_BATCH_BUDGET_MS;

type BatchAnalyses = z.infer<typeof questionAnalysisBatchSchema>["analyses"];

// ── E1a: examMap 추출 ────────────────────────────────────────────────────────

export interface ExtractExamMapResult {
  examMap: ExamMap;
  usage: ExamReportLlmUsage;
}

/**
 * E1a: 시험지 사진 전체 1콜로 examMap 추출(소넷이 직접 풀어 정답 도출).
 * pageCount 는 코드가 이미지 수로 부여한다(LLM 산출 아님). order 로 안정 정렬.
 */
export async function extractExamMap(opts: {
  images: AtlasChatImageInput[];
  examMeta: ExamReportMeta;
  deadlineAt?: number;
  usage?: ExamReportLlmUsage;
}): Promise<ExtractExamMapResult> {
  const usage = opts.usage ?? createExamReportUsage();
  const extracted = await callExamReportJson({
    stage: "examAnalysis",
    systemPrompt: buildExamMapSystemPrompt(),
    userPrompt: buildExamMapUserPrompt({
      pageCount: opts.images.length,
      examMeta: opts.examMeta,
    }),
    images: opts.images,
    schema: examMapExtractionSchema,
    deadlineAt: opts.deadlineAt,
    cacheImages: true,
    usage,
  });

  const questions = [...extracted.questions].sort((a, b) => a.order - b.order);
  const examMap: ExamMap = {
    questions,
    totalPoints: extracted.totalPoints,
    pageCount: opts.images.length,
  };
  return { examMap, usage };
}

// ── E1b/E1c: 문항 분석 + 종합 ────────────────────────────────────────────────

export interface AnalyzeCheckpoint {
  perQuestion: QuestionAnalysis[];
  examLevel: ExamLevelAnalysis | null;
  /**
   * E1b 가 이번 실행에서 도출한 정답 패치 — 라우트가 structure(examMap)로 병합한다.
   * perQuestion(분석 컬럼)과 별도 채널: 정답은 examMap 소유이므로 분석엔 담지 않는다.
   */
  answers: ExamMapAnswer[];
}

export interface AnalyzeOutcome {
  checkpoint: AnalyzeCheckpoint;
  /** 종결 여부 — 전 문항 판정 완료 + (examLevel 확보 또는 종합 불능=OK 0). false = 재개 필요. */
  finished: boolean;
  /** 전 문항 판정은 끝났으나 E1c 종합만 남음 — 라우트 재개 루프가 종합 전용 라운드를 돈다. */
  synthPending: boolean;
  /** 이번 실행에서 E1c 를 시도했고 실패함 — 라우트의 연속 실패 카운트(2회 종결) 재료. */
  synthFailed: boolean;
  failedNumbers: string[];
  usage: ExamReportLlmUsage;
}

function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

/**
 * 이번 실행의 분석 대상 키(공백 제거 number) 선정 — analyze 와 라우트 과금/병합이
 * 반드시 같은 규칙을 쓰도록 단일 소스로 export 한다.
 * - targetNumbers 지정(문항단위): 그 문항 전부(OK 여도 재분석).
 * - 미지정(전체): prior OK 제외 + forceNumbers(강제 재분석)는 OK 라도 포함.
 */
/**
 * 문항별 자동 재분석 시도 상한(라이브락 방지). 전체(자동) 실행에서 계속 실패하는
 * 문항을 이 횟수만큼 시도한 뒤에는 "종결 실패"로 확정하고 재선택에서 제외한다 —
 * 그러지 않으면 매 재개 라운드가 도돌이표 실패 문항을 재실행해 데드라인을 소진하고
 * allBatchesRun 이 영영 true 가 되지 못해 분석이 15/15 에서 완료로 넘어가지 못한다.
 * 강사가 특정 문항을 명시 재분석(targetNumbers)하면 이 상한과 무관하게 재시도한다.
 */
export const MAX_QUESTION_ATTEMPTS = 2;

export function selectAnalysisTargetKeys(opts: {
  questionNumbers: string[];
  priorPerQuestion: { number: string; analysisStatus: QuestionAnalysis["analysisStatus"] }[];
  targetNumbers?: string[];
  forceNumbers?: string[];
  /**
   * 종결 실패로 확정된 키(자동 실행에서만 제외) — 명시 재분석(targetNumbers)·강제
   * (forceNumbers)에는 영향 없다. 라이브락 종료용.
   */
  excludeKeys?: ReadonlySet<string>;
}): Set<string> {
  const okKeys = new Set(
    opts.priorPerQuestion
      .filter((q) => q.analysisStatus === "OK")
      .map((q) => numberKey(q.number)),
  );
  const targetKeys = opts.targetNumbers
    ? new Set(opts.targetNumbers.map(numberKey))
    : null;
  const forceKeys = new Set((opts.forceNumbers ?? []).map(numberKey));
  const excludeKeys = opts.excludeKeys;
  const selected = new Set<string>();
  for (const number of opts.questionNumbers) {
    const key = numberKey(number);
    const autoSelect =
      (!okKeys.has(key) && !(excludeKeys?.has(key) ?? false)) || forceKeys.has(key);
    if (targetKeys ? targetKeys.has(key) : autoSelect) {
      selected.add(key);
    }
  }
  return selected;
}

function remainingMs(deadlineAt: number): number {
  return deadlineAt - Date.now();
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function failedAnalysis(number: string): QuestionAnalysis {
  return {
    number,
    analysisStatus: "FAILED",
    typeLabel: "",
    difficulty: 3,
    difficultyRationale: "",
    explanation: "",
    intent: "",
    examPoint: "",
    keyConcepts: [],
    solvingStrategy: "",
  };
}

/** 한 배치 결과 — 분석(analysis 컬럼)과 정답(structure 컬럼) 두 채널로 분리. */
interface BatchResult {
  analyses: QuestionAnalysis[];
  answers: ExamMapAnswer[];
}

/** LLM 배치 항목의 정답 필드를 ExamMapEntry(kind 인지)에 맞춰 ExamMapAnswer 로. */
function buildAnswer(
  entry: ExamMapEntry,
  rawAnswer: string | undefined,
  confidence: Confidence | undefined,
): ExamMapAnswer {
  // MC 정답은 "1".."5" 로 정규화(서답형 모범답안은 원문 유지). 정규화 실패 시 원문.
  const correctAnswer =
    rawAnswer != null && entry.kind === "MC"
      ? normalizeChoiceToken(rawAnswer) ?? rawAnswer
      : rawAnswer;
  // 정답을 냈으면 확신도 기본 MEDIUM, 못 냈으면 LOW(강사 확인 유도 뱃지).
  const answerConfidence = confidence ?? (correctAnswer ? "MEDIUM" : "LOW");
  return { number: entry.number, correctAnswer, answerConfidence };
}

function mapBatchToAnalyses(
  llm: BatchAnalyses,
  batchEntries: ExamMapEntry[],
): BatchResult {
  const byKey = new Map(llm.map((analysis) => [numberKey(analysis.number), analysis]));
  const analyses: QuestionAnalysis[] = [];
  const answers: ExamMapAnswer[] = [];
  for (const q of batchEntries) {
    const found = byKey.get(numberKey(q.number));
    if (!found) {
      // 배치 실패 문항 — 정답 패치를 내지 않아 기존 examMap 정답(있으면)을 보존한다.
      analyses.push(failedAnalysis(q.number));
      continue;
    }
    // 정답 필드는 QuestionAnalysis(분석)에 남기지 않고 examMap 으로 분리한다.
    const { correctAnswer, answerConfidence, ...analysis } = found;
    analyses.push({ ...analysis, number: q.number, analysisStatus: "OK" });
    answers.push(buildAnswer(q, correctAnswer, answerConfidence));
  }
  return { analyses, answers };
}

function upsertAnalysis(list: QuestionAnalysis[], analysis: QuestionAnalysis): void {
  const key = numberKey(analysis.number);
  const index = list.findIndex((item) => numberKey(item.number) === key);
  if (index >= 0) list[index] = analysis;
  else list.push(analysis);
}

function upsertAnswer(list: ExamMapAnswer[], answer: ExamMapAnswer): void {
  const key = numberKey(answer.number);
  const index = list.findIndex((item) => numberKey(item.number) === key);
  if (index >= 0) list[index] = answer;
  else list.push(answer);
}

function collectFailed(list: QuestionAnalysis[]): string[] {
  return list.filter((analysis) => analysis.analysisStatus === "FAILED").map((a) => a.number);
}

/**
 * 한 배치 분석(vision). 이미지 전체를 재전송하되 소넷이 배치 문항만 찾아 분석한다.
 * system(digest)+마지막 이미지 캐시로 배치 간 이미지 토큰 비용을 절감한다.
 * 실패 시 1회 재시도, 최종 실패면 배치 전 문항 FAILED.
 * 성공 시 정답-해설 정합 게이트로 correctAnswer 전사 결함을 교정한다(무판정 통과 계약).
 */
async function analyzeBatch(
  batchEntries: ExamMapEntry[],
  images: AtlasChatImageInput[],
  digest: string,
  deadlineAt: number,
  usage: ExamReportLlmUsage,
): Promise<BatchResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callExamReportJson({
        stage: "examAnalysis",
        systemPrompt: buildAnalysisSystemPrompt(digest),
        userPrompt: buildAnalysisUserPrompt(batchEntries),
        images,
        schema: questionAnalysisBatchSchema,
        deadlineAt,
        cacheSystem: true,
        cacheImages: true,
        usage,
      });
      const mapped = mapBatchToAnalyses(result.analyses, batchEntries);
      // 정답-해설 정합 게이트(26-07-17 심판단 실측: 해설은 정답을 옳게 도출하고
      // correctAnswer 필드만 틀리는 전사 결함이 두 모델 공통 최다 오답 원인).
      // 게이트의 어떤 실패도 배치 재시도(고가 vision 콜)를 유발하면 안 된다 — 원본 통과.
      const reconciled = await reconcileBatchAnswers({
        batchEntries,
        answers: mapped.answers,
        explanationByKey: new Map(
          mapped.analyses.map((a) => [numberKey(a.number), a.explanation]),
        ),
        deadlineAt,
        usage,
      }).catch(() => ({ answers: mapped.answers, corrected: [] as string[] }));
      if (reconciled.corrected.length > 0) {
        console.info(
          "[exam-report] 정합 게이트 교정:",
          reconciled.corrected.join(", "),
        );
      }
      return { analyses: mapped.analyses, answers: reconciled.answers };
    } catch {
      if (attempt === 1) break;
    }
  }
  // 배치 전량 실패 — 정답 패치 없음(기존 examMap 정답 보존).
  return { analyses: batchEntries.map((q) => failedAnalysis(q.number)), answers: [] };
}

export async function analyzeExamDirect(opts: {
  examMap: ExamMap;
  images: AtlasChatImageInput[];
  examMeta: ExamReportMeta;
  targetNumbers?: string[];
  /** 전체 실행에서 OK 라도 강제 재분석할 번호 — targetNumbers 지정 시 무시 */
  forceNumbers?: string[];
  /** 종결 실패 확정 키 — 자동 실행에서 재선택 제외(라이브락 종료). MAX_QUESTION_ATTEMPTS 참고. */
  excludeKeys?: ReadonlySet<string>;
  /** 직전 분석(분석 컬럼) — perQuestion/examLevel 만 승계. 정답은 structure 소유라 불요. */
  prior?: ExamAnalysisResult | null;
  deadlineAt: number;
  onBatchComplete?: (cp: AnalyzeCheckpoint) => Promise<void>;
}): Promise<AnalyzeOutcome> {
  const usage = createExamReportUsage();
  const digest = buildExamMapDigest(opts.examMap, opts.examMeta);

  const basePrior: QuestionAnalysis[] = (opts.prior?.perQuestion ?? []).map((q) => ({ ...q }));
  const targetKeySet = selectAnalysisTargetKeys({
    questionNumbers: opts.examMap.questions.map((q) => q.number),
    priorPerQuestion: basePrior,
    targetNumbers: opts.targetNumbers,
    forceNumbers: opts.forceNumbers,
    excludeKeys: opts.excludeKeys,
  });
  // 이번 실행 대상(강제 재분석 포함)의 기존 항목은 작업본에서 제거 — 체크포인트에는
  // 이번 실행의 신선한 결과만 실리게 해, 라우트의 attempted-병합이 병렬 편집분이나
  // 구식 스냅샷으로 DB 를 덮지 않게 한다.
  const perQuestion: QuestionAnalysis[] = basePrior.filter(
    (q) => !targetKeySet.has(numberKey(q.number)),
  );
  // 정답 패치는 이번 실행 도출분만 담는다(비-attempted 정답은 structure DB 가 보유).
  const answers: ExamMapAnswer[] = [];
  let examLevel: ExamLevelAnalysis | null = opts.prior?.examLevel ?? null;
  const snapshot = (): AnalyzeCheckpoint => ({
    perQuestion: perQuestion.map((q) => ({ ...q })),
    examLevel,
    answers: answers.map((a) => ({ ...a })),
  });

  const targets = opts.examMap.questions.filter((q) =>
    targetKeySet.has(numberKey(q.number)),
  );
  const batches = chunk(targets, BATCH_SIZE);

  // 직렬 커밋 뮤텍스: 병렬 write 금지 — 완료 순서대로 merge → onBatchComplete.
  let commitChain: Promise<void> = Promise.resolve();
  const commit = (result: BatchResult): Promise<void> => {
    commitChain = commitChain.then(async () => {
      for (const analysis of result.analyses) upsertAnalysis(perQuestion, analysis);
      for (const answer of result.answers) upsertAnswer(answers, answer);
      if (opts.onBatchComplete) await opts.onBatchComplete(snapshot());
    });
    return commitChain;
  };
  const runBatch = async (batchEntries: ExamMapEntry[]): Promise<void> => {
    const result = await analyzeBatch(
      batchEntries,
      opts.images,
      digest,
      opts.deadlineAt,
      usage,
    );
    await commit(result);
  };

  let allBatchesRun = true;
  if (batches.length > 0) {
    if (remainingMs(opts.deadlineAt) < MIN_BATCH_BUDGET_MS) {
      return {
        checkpoint: snapshot(),
        finished: false,
        synthPending: false,
        synthFailed: false,
        failedNumbers: collectFailed(perQuestion),
        usage,
      };
    }
    // 배치1 단독 선실행(캐시 쓰기) → 잔여 배치 동시 2 팬아웃(캐시 히트).
    await runBatch(batches[0]);
    allBatchesRun = await runRemainingBatches(batches.slice(1), runBatch, opts.deadlineAt);
  }
  await commitChain;

  const allJudged = opts.examMap.questions.every((q) =>
    perQuestion.some((analysis) => numberKey(analysis.number) === numberKey(q.number)),
  );
  const judgedComplete = allBatchesRun && allJudged;
  const hasOk = perQuestion.some((q) => q.analysisStatus === "OK");

  // E1c 종합: 전 문항 판정 완료 + examLevel 미생성 + OK 1개 이상 + 시간 여유.
  // 실패/시간부족 시 finished:false(synthPending) — 라우트가 종합 전용 재개 라운드를
  // 돌리고, 연속 2회 실패면 종결한다(무한 루프 금지).
  let synthFailed = false;
  if (judgedComplete && examLevel === null && hasOk) {
    if (remainingMs(opts.deadlineAt) >= SYNTH_MIN_REMAINING_MS) {
      try {
        examLevel = await callExamReportJson({
          stage: "examAnalysis",
          systemPrompt: buildSynthesisSystemPrompt(),
          userPrompt: buildSynthesisUserPrompt(digest, perQuestion),
          schema: examLevelAnalysisSchema,
          deadlineAt: opts.deadlineAt,
          usage,
        });
      } catch {
        synthFailed = true;
      }
    }
  }

  return {
    checkpoint: snapshot(),
    finished: judgedComplete && (examLevel !== null || !hasOk),
    synthPending: judgedComplete && examLevel === null && hasOk,
    synthFailed,
    failedNumbers: collectFailed(perQuestion),
    usage,
  };
}

/** 잔여 배치를 동시 2로 실행. 마감 근접 시 미시작 배치를 남기고 false 반환. */
async function runRemainingBatches(
  remaining: ExamMapEntry[][],
  runBatch: (batch: ExamMapEntry[]) => Promise<void>,
  deadlineAt: number,
): Promise<boolean> {
  if (remaining.length === 0) return true;
  let index = 0;
  let skipped = false;
  const worker = async (): Promise<void> => {
    for (;;) {
      if (remainingMs(deadlineAt) < MIN_BATCH_BUDGET_MS) {
        skipped = true;
        return;
      }
      const current = index;
      index += 1;
      if (current >= remaining.length) return;
      await runBatch(remaining[current]);
    }
  };
  const workers = Array.from({ length: Math.min(FANOUT_CONCURRENCY, remaining.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return !skipped;
}
