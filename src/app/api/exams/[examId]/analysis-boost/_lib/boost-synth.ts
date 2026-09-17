// ============================================================================
// analysis-boost 라우트의 examLevel 종합 단계 (v4 — E1c 공용 모듈 호출부)
//
// 문항 배치가 끝난 뒤(또는 synthOnly 로 배치 없이) 병합본 perQuestion 으로
// synthesizeExamLevel 을 부른다. 계약:
//  - 입력은 **지금 DB 에 있는** analysis·structure 를 다시 읽는다(라우트 시작 시 잡은
//    스냅샷은 몇 분 전 것 — 그 사이 문항 편집 → sync 로 지도가 바뀌었을 수 있다.
//    결정론 집계(난이도 프로필·유형 분포)는 최신 지도와 맞아야 레일과 일치한다).
//  - 1회 재시도: 첫 콜이 실패(TIMEOUT/HTTP/PARSE)해도 라우트 마감까지 30s 이상 남아
//    있으면 한 번 더 부른다. 종합은 텍스트 1콜(≈수십 초)이라 재시도 1회로 대부분의
//    일시 실패를 흡수하고, 실패 시 강사가 N cr 재과금 경로로 몰리는 일을 줄인다.
//  - 절대 throw 하지 않는다 — { examLevel?, synthFailed } 로 수렴(과금 대상은 문항 분석,
//    종합은 덤 — 종합 실패가 perQuestion 저장·정산을 막으면 안 된다).
// ============================================================================

import { prisma } from "@/lib/prisma";
import { parseExamAnalysisResult, parseExamMap } from "@/lib/exam-report/schemas";
import type { ExamReportLlmUsage } from "@/lib/exam-report/llm";
import type { ExamLevelAnalysis, QuestionAnalysis } from "@/lib/exam-report/types";
import type { ExamReportMeta } from "@/lib/exam-report/prompts-shared";
import { synthesizeExamLevel } from "@/lib/exam-report/synthesis";
import { numberKey } from "./boost-store";

/** 재시도를 시작하기 위한 최소 잔여 마감 예산(종합 1콜 하한). */
const SYNTH_RETRY_MIN_MS = 30_000;

export interface BoostSynthResult {
  examLevel?: ExamLevelAnalysis;
  synthFailed: boolean;
}

/** 기존 perQuestion 에 이번 보강분을 병합(멱등 upsert — writeBoostResult 와 같은 규칙). */
export function mergePerQuestion(
  prior: QuestionAnalysis[],
  incoming: QuestionAnalysis[],
): QuestionAnalysis[] {
  const merged = prior.map((q) => ({ ...q }));
  for (const analysis of incoming) {
    const key = numberKey(analysis.number);
    const index = merged.findIndex((item) => numberKey(item.number) === key);
    if (index >= 0) merged[index] = analysis;
    else merged.push(analysis);
  }
  return merged;
}

export async function synthesizeBoostExamLevel(opts: {
  analysisId: string;
  academyId: string;
  /** 이번 실행의 성공 문항(synthOnly 면 []) — DB perQuestion 위에 병합해 종합한다 */
  newAnalyses: QuestionAnalysis[];
  examMeta: ExamReportMeta;
  /** 라우트 마감(epoch ms) — 종합 콜 타임아웃·재시도 판단 기준 */
  routeDeadlineAt: number;
  usage: ExamReportLlmUsage;
}): Promise<BoostSynthResult> {
  let examMap: ReturnType<typeof parseExamMap>;
  let merged: QuestionAnalysis[];
  try {
    const row = await prisma.examAnalysis.findFirst({
      where: { id: opts.analysisId, academyId: opts.academyId, deletedAt: null },
      select: { analysis: true, structure: true },
    });
    if (!row) throw new Error("분석 행 없음(삭제됨)");
    examMap = parseExamMap(row.structure);
    if (!examMap) throw new Error("INTERNAL structure 파스 실패");
    const prior = parseExamAnalysisResult(row.analysis) ?? { perQuestion: [], examLevel: null };
    merged = mergePerQuestion(prior.perQuestion, opts.newAnalyses);
  } catch (err) {
    console.error("[analysis-boost] examLevel synthesis input failed", err);
    return { synthFailed: true };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const examLevel = await synthesizeExamLevel({
        examMap,
        perQuestion: merged,
        examMeta: opts.examMeta,
        deadlineAt: opts.routeDeadlineAt,
        usage: opts.usage,
      });
      return { examLevel, synthFailed: false };
    } catch (synthErr) {
      const remaining = opts.routeDeadlineAt - Date.now();
      console.error(
        `[analysis-boost] examLevel synthesis failed (attempt ${attempt + 1}, remaining ${remaining}ms)`,
        synthErr,
      );
      if (attempt === 0 && remaining >= SYNTH_RETRY_MIN_MS) continue;
      break;
    }
  }
  return { synthFailed: true };
}
