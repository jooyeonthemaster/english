// ============================================================================
// 학생 시험 리포트 v3 — 시험 직접분석 (E1a examMap 추출 + E1b 문항분석 + E1c 종합)
//
// v3 원칙: 구조화 렌더 없이 vision 모델이 시험지 사진을 직접 본다.
// v4(26-09-02, docs/exam-analysis-v4-spec.md §1-5·§3 U1) — 콜당 이미지를 줄인다:
//   E1a extractExamMap: 사진을 ≤6장 청크로 나눠 동시 2 호출 → 청크별 지도를
//        병합(exam-page-batching.mergeExamMapChunks). 각 문항에 발문 시작 장
//        page(전역 1-based)가 붙는다. 완료 시점에 문항수 확정 → 라우트가 과금.
//   E1b analyzeExamDirect: 대상 문항을 page 국소 배치(≤6문항·페이지 폭 ≤3장)로
//        자르고 그 배치의 페이지 ±1(최대 6장)만 첨부. 동시 3. page 없는 구 지도는
//        전 페이지 폴백(종전 배치1 선실행 + 팬아웃 시퀀스 유지 — 무회귀).
//   E1c: 전 문항 판정 완료 시 synthesis.synthesizeExamLevel 1콜(이미지 0). 난이도
//        프로필·유형 분포는 코드 결정론, LLM 은 prose 3필드 — 보강 라우트와 공용.
//
// 이미지 세트 2벌(중요): opts.images 는 콜당 ≤6장 전제(장당 1.5MB 상한)라 전 페이지를
//   한 콜에 실으면 12장 18MB·20장 30MB 로 총량 예산(llm-images 12MB)을 넘긴다.
//   pages:null 배치는 반드시 opts.fallbackImages(분모=전체 장수, 지연·메모)를 쓴다.
// 복구 사다리(국소 미스 → 전 페이지 재분석): 프롬프트가 「창(±1)에 안 보이는 문항은
//   생략」을 지시하므로 E1a 가 잘못 붙인 page(첫 청크 우선 병합이 지문 꼬리만 본 청크를
//   남긴 경우 등)는 국소 배치에서 FAILED 로 떨어진다. 저장된 page 로 다시 짜면 같은
//   창이 나와 영원히 실패하므로 ①같은 실행 안에서 국소 배치의 FAILED 문항을 모아
//   pages:null 그룹 1회 추가 실행(시도 횟수 소모 없음) ②재개·명시 재분석에서는
//   prior FAILED ∪ targetNumbers 키를 forceUnpaged 로 전 페이지 배치에 태운다.
// 체크포인트/재개/lease 펜싱 구조는 v2 analyze.ts 를 그대로 계승 — 라우트가 증분 저장.
// ============================================================================

import type { z } from "zod";
import type { AtlasChatImageInput } from "@/lib/atlas-chat-rest";
import { normalizeChoiceToken, questionAnalysisBatchSchema } from "./schemas";
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
  type AnalysisImageWindow,
  type ExamReportMeta,
} from "./prompts";
import {
  callExamReportJson,
  createExamReportUsage,
  type ExamReportLlmUsage,
} from "./llm";
import { reconcileBatchAnswers } from "./answer-consistency";
import { synthesizeExamLevel } from "./synthesis";
import { planPageLocalBatches, type PageLocalBatch } from "./exam-page-batching";

// E1a 는 exam-map-extract.ts 로 분할(500줄 상한) — 호출부(route-run) 호환 재export.
export { extractExamMap, type ExtractExamMapResult } from "./exam-map-extract";

/** E1b 배치 동시 실행 수 — v4: 2 → 3(배치당 이미지가 ≤6장으로 줄어 게이트웨이 부담 감소). */
const FANOUT_CONCURRENCY = 3;
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

function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

function remainingMs(deadlineAt: number): number {
  return deadlineAt - Date.now();
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

/**
 * 문항별 자동 재분석 시도 상한(라이브락 방지). 전체(자동) 실행에서 계속 실패하는
 * 문항을 이 횟수만큼 시도한 뒤에는 "종결 실패"로 확정하고 재선택에서 제외한다 —
 * 그러지 않으면 매 재개 라운드가 도돌이표 실패 문항을 재실행해 데드라인을 소진하고
 * allBatchesRun 이 영영 true 가 되지 못해 분석이 15/15 에서 완료로 넘어가지 못한다.
 * 강사가 특정 문항을 명시 재분석(targetNumbers)하면 이 상한과 무관하게 재시도한다.
 */
export const MAX_QUESTION_ATTEMPTS = 2;

/**
 * 이번 실행의 분석 대상 키(공백 제거 number) 선정 — analyze 와 라우트 과금/병합이
 * 반드시 같은 규칙을 쓰도록 단일 소스로 export 한다.
 * - targetNumbers 지정(문항단위): 그 문항 전부(OK 여도 재분석).
 * - 미지정(전체): prior OK 제외 + forceNumbers(강제 재분석)는 OK 라도 포함.
 */
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
 * 한 배치 분석(vision). v4: 첨부 이미지는 배치 페이지 창(±1, ≤6장)이며 imageWindow 로
 * 모델에 "전체 N장 중 a~b장"을 고지한다(null = 전 페이지 폴백).
 * 실패 시 1회 재시도, 최종 실패면 배치 전 문항 FAILED.
 * 성공 시 정답-해설 정합 게이트로 correctAnswer 전사 결함을 교정한다(무판정 통과 계약).
 */
async function analyzeBatch(
  batchEntries: ExamMapEntry[],
  images: AtlasChatImageInput[],
  imageWindow: AnalysisImageWindow | null,
  digest: string,
  deadlineAt: number,
  usage: ExamReportLlmUsage,
): Promise<BatchResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callExamReportJson({
        stage: "examAnalysis",
        systemPrompt: buildAnalysisSystemPrompt(digest),
        userPrompt: buildAnalysisUserPrompt(batchEntries, { imageWindow }),
        images,
        schema: questionAnalysisBatchSchema,
        deadlineAt,
        cacheSystem: true,
        // 이미지 캐시 브레이크포인트는 전 페이지 폴백(배치 간 이미지 공유)에서만 — 국소
        // 배치는 배치마다 이미지가 달라 쓰기 전용 낭비(Claude 경로에서만 유효한 플래그).
        cacheImages: imageWindow === null,
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
  /** 콜당 ≤6장 전제 세트 — 페이지 국소 배치(pages 있음)에만 실린다. */
  images: AtlasChatImageInput[];
  /**
   * 전 페이지 배치(pages:null)용 세트(분모=전체 장수, 총량 12MB 이내). 미제공 시 images
   * 로 폴백하지만 7장 이상이면 총량 예산을 넘기므로 라우트는 반드시 넘겨야 한다.
   */
  fallbackImages?: () => Promise<AtlasChatImageInput[]>;
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
  // v4: 페이지 국소 배치(page 있는 문항) + 전 페이지 폴백(page 없는 문항).
  // 복구 사다리(헤더 참조): 직전 실행에서 FAILED 였던 문항과 명시 재분석(targetNumbers)
  // 대상은 page 가 있어도 전 페이지 배치로 보낸다 — 국소 창이 틀렸던 문항을 같은 창으로
  // 다시 짜는 결정론적 재실패를 끊는다.
  const pageCount = opts.images.length;
  const retryKeys = new Set<string>([
    ...basePrior
      .filter((q) => q.analysisStatus === "FAILED")
      .map((q) => numberKey(q.number)),
    ...(opts.targetNumbers ?? []).map(numberKey),
  ]);
  const batches = planPageLocalBatches(targets, pageCount, (q) =>
    retryKeys.has(numberKey(q.number)),
  );

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
  // 국소 배치에서 FAILED 로 떨어진 문항 — 같은 실행 안 전 페이지 재분석 후보.
  const pagedMisses: ExamMapEntry[] = [];
  const runBatch = async (batch: PageLocalBatch<ExamMapEntry>): Promise<void> => {
    // pages:null 은 전 페이지 세트(총량 예산 분모=전체 장수) — opts.images 를 통째로
    // 실으면 콜당 예산을 넘긴다(헤더 「이미지 세트 2벌」).
    const images = batch.pages
      ? batch.pages.map((p) => opts.images[p - 1])
      : ((await opts.fallbackImages?.()) ?? opts.images);
    const imageWindow: AnalysisImageWindow | null = batch.pages
      ? {
          from: batch.pages[0],
          to: batch.pages[batch.pages.length - 1],
          total: pageCount,
        }
      : null;
    const result = await analyzeBatch(
      batch.entries,
      images,
      imageWindow,
      digest,
      opts.deadlineAt,
      usage,
    );
    if (batch.pages !== null) {
      const failedKeys = new Set(collectFailed(result.analyses).map(numberKey));
      for (const entry of batch.entries) {
        if (failedKeys.has(numberKey(entry.number))) pagedMisses.push(entry);
      }
    }
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
    if (batches.every((b) => b.pages === null)) {
      // 구 지도(page 없음) — 전 배치가 같은 이미지를 공유하므로 종전 시퀀스 유지:
      // 배치1 단독 선실행(anthropic 경로 캐시 쓰기) → 잔여 배치 팬아웃(캐시 히트).
      await runBatch(batches[0]);
      allBatchesRun = await runRemainingBatches(batches.slice(1), runBatch, opts.deadlineAt);
    } else {
      // 페이지 국소 배치 — 배치마다 이미지가 다르니 공유 캐시 전제가 없다. 바로 동시 3.
      allBatchesRun = await runRemainingBatches(batches, runBatch, opts.deadlineAt);
    }
  }
  await commitChain;

  // 복구 사다리 ①: 국소 배치 미스를 같은 실행 안에서 전 페이지 그룹 1회로 치유한다
  // (시도 횟수 소모 없음). 마감 여유가 없으면 건너뛴다 — 그 문항은 FAILED 로 남아
  // 재개 라운드의 forceUnpaged(사다리 ②)가 잇는다. allBatchesRun 은 건드리지 않는다:
  // 치유는 추가 시도이지 계획된 배치가 아니다(실패해도 판정은 이미 커밋돼 있다).
  if (pagedMisses.length > 0 && remainingMs(opts.deadlineAt) >= MIN_BATCH_BUDGET_MS) {
    const healBatches = planPageLocalBatches(pagedMisses, pageCount, () => true);
    await runRemainingBatches(healBatches, runBatch, opts.deadlineAt);
    await commitChain;
  }

  const allJudged = opts.examMap.questions.every((q) =>
    perQuestion.some((analysis) => numberKey(analysis.number) === numberKey(q.number)),
  );
  const judgedComplete = allBatchesRun && allJudged;
  const hasOk = perQuestion.some((q) => q.analysisStatus === "OK");

  // E1c 종합: 전 문항 판정 완료 + examLevel 미생성 + OK 1개 이상 + 시간 여유.
  // 실패/시간부족 시 finished:false(synthPending) — 라우트가 종합 전용 재개 라운드를
  // 돌리고, 연속 2회 실패면 종결한다(무한 루프 금지). v4: synthesis.ts 공용 모듈 —
  // 난이도 프로필·유형 분포는 결정론, LLM 은 prose 3필드만.
  let synthFailed = false;
  if (judgedComplete && examLevel === null && hasOk) {
    if (remainingMs(opts.deadlineAt) >= SYNTH_MIN_REMAINING_MS) {
      try {
        examLevel = await synthesizeExamLevel({
          examMap: opts.examMap,
          perQuestion,
          examMeta: opts.examMeta,
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

/** 배치 목록을 동시 FANOUT_CONCURRENCY 로 실행. 마감 근접 시 미시작 배치를 남기고 false 반환. */
async function runRemainingBatches(
  remaining: PageLocalBatch<ExamMapEntry>[],
  runBatch: (batch: PageLocalBatch<ExamMapEntry>) => Promise<void>,
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
