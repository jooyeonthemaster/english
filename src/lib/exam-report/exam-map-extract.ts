// ============================================================================
// 시험 직접분석 E1a — examMap 구조 추출 (v4 페이지 청크 호출)
// exam-analyze-direct.ts 에서 분할(파일 500줄 상한). 공개 이름(extractExamMap ·
// ExtractExamMapResult)은 exam-analyze-direct 가 재export 해 호출부(route-run) 무변경.
//
// v4(docs/exam-analysis-v4-spec.md §3 U1-4): 사진을 ≤6장 청크로 나눠 동시 2 호출하고
// 청크별 지도를 병합한다(exam-page-batching.mergeExamMapChunks). 각 문항에 발문 시작
// 장 page(전역 1-based)가 붙어 E1b 페이지 국소 배치의 재료가 된다. 6장 이하면 콜
// 1회(종전과 동일)지만 page 는 요청한다.
//
// 청크 실패 처리: 청크 콜이 throw 하면 같은 입력으로 정확히 1회 재호출한 뒤에야 전체를
// reject 한다(부분 지도 금지 계약은 그대로 — 재시도까지 실패하면 라우트가 EXTRACT_FAILED
// 로 원복하고 PROBE_RUN_LIMIT 1회를 소모). 알려진 한계: 한 청크가 최종 실패해도 동시
// 진행 중인 형제 청크 콜은 취소되지 않고 끝까지 돈다(결과는 버려짐 = 고아 콜 원가).
// llm.ts callExamReportJson 에 AbortSignal 배관이 없어 지금은 취소 불가 — 시그니처
// 변경은 범위 밖, 후속 과제로 남긴다.
// ============================================================================

import type { z } from "zod";
import type { AtlasChatImageInput } from "@/lib/atlas-chat-rest";
import { examMapExtractionSchema } from "./schemas";
import type { ExamMap } from "./types";
import {
  buildExamMapSystemPrompt,
  buildExamMapUserPrompt,
  type ExamReportMeta,
} from "./prompts";
import {
  callExamReportJson,
  createExamReportUsage,
  type ExamReportLlmUsage,
} from "./llm";
import {
  EXAM_MAP_CHUNK_CONCURRENCY,
  EXAM_MAP_CHUNK_PAGES,
  mergeExamMapChunks,
  type ExamMapChunkResult,
} from "./exam-page-batching";

type ExtractedQuestion = z.infer<typeof examMapExtractionSchema>["questions"][number];

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/** 인덱스 순서를 보존하는 동시 실행 맵 — 한 항목 실패는 전체 reject(청크 계약). */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker()),
  );
  return results;
}

export interface ExtractExamMapResult {
  examMap: ExamMap;
  usage: ExamReportLlmUsage;
}

/**
 * E1a: 시험지 사진을 ≤6장 청크로 나눠 examMap 구조를 추출한다(문제를 풀지 않는다).
 * 청크 하나라도 실패하면 throw — 부분 지도는 과금 분모(문항 수)를 조용히 줄이므로
 * 허용하지 않는다(라우트가 EXTRACT_FAILED 로 원복). pageCount 는 코드가 이미지 수로
 * 부여한다(LLM 산출 아님).
 */
export async function extractExamMap(opts: {
  images: AtlasChatImageInput[];
  examMeta: ExamReportMeta;
  deadlineAt?: number;
  usage?: ExamReportLlmUsage;
}): Promise<ExtractExamMapResult> {
  const usage = opts.usage ?? createExamReportUsage();
  const totalPages = opts.images.length;
  const chunks = chunk(opts.images, EXAM_MAP_CHUNK_PAGES);
  const results = await mapWithConcurrency(
    chunks,
    EXAM_MAP_CHUNK_CONCURRENCY,
    async (images, index): Promise<ExamMapChunkResult<ExtractedQuestion>> => {
      const offset = index * EXAM_MAP_CHUNK_PAGES;
      const callChunk = () =>
        callExamReportJson({
          stage: "examAnalysis",
          systemPrompt: buildExamMapSystemPrompt(),
          userPrompt: buildExamMapUserPrompt({
            pageCount: images.length,
            examMeta: opts.examMeta,
            pageOffset: offset,
            totalPages,
          }),
          images,
          schema: examMapExtractionSchema,
          deadlineAt: opts.deadlineAt,
          cacheImages: true,
          usage,
        });
      // 청크 단위 1회 재시도(같은 입력) — 청크 4개 중 하나의 일시 오류가 프로브 전체를
      // 실패시키고 PROBE_RUN_LIMIT 를 소모하는 것을 막는다. 마감이 이미 지났으면 재시도
      // 없이 전파(즉시 TIMEOUT 만 낳는다). 부분 지도 금지 계약은 유지된다.
      const extracted = await callChunk().catch(async (err: unknown) => {
        if (opts.deadlineAt != null && Date.now() >= opts.deadlineAt) throw err;
        return callChunk();
      });
      return {
        offset,
        pageCount: images.length,
        questions: extracted.questions,
        totalPoints: extracted.totalPoints,
      };
    },
  );
  const merged = mergeExamMapChunks(results);
  const examMap: ExamMap = {
    questions: merged.questions,
    totalPoints: merged.totalPoints,
    pageCount: totalPages,
  };
  return { examMap, usage };
}
