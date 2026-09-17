// ============================================================================
// analysis-boost 라우트의 synthOnly(0 cr) 경로 + 게이트 실패 응답 (v4)
//
// body `{ synthOnly: true }` 로 들어왔고 살아있는 문항 전부가 이미 boostedNumbers 에
// 있을 때 라우트가 여기로 넘긴다: 잡·과금·배치 없이 examLevel 종합만 다시 한다.
// 「문항은 다 됐는데 총평만 실패」(boost.synthFailed)를 N cr 재과금 없이 복구하는
// 유일한 경로. RUNNING 게이트는 정상 경로와 같은 CAS 로 잡되 progress 는 N/N.
// 종료는 항상 DONE — perQuestion 은 멀쩡하므로 FAILED 로 강등하면 카드가 재과금
// 경로를 권한다. 종합 실패면 synthFailed:true 유지 + 502 SYNTH_FAILED.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createExamReportUsage } from "@/lib/exam-report/llm";
import type { ExamReportMeta } from "@/lib/exam-report/prompts-shared";
import {
  acquireBoostGate,
  asRecord,
  carryPriorBoost,
  writeBoostResult,
  type BoostGateResult,
} from "./boost-store";
import { synthesizeBoostExamLevel } from "./boost-synth";

/** 게이트 실패 → 응답(409 진행중 / 503 경합 / 500 행 없음). */
export function gateFailureResponse(gate: Exclude<BoostGateResult, { ok: true }>): NextResponse {
  switch (gate.code) {
    case "ALREADY_RUNNING":
      return NextResponse.json(
        { error: "이미 AI 분석이 진행 중입니다.", code: "ALREADY_RUNNING" },
        { status: 409 },
      );
    case "GATE_CONFLICT":
      return NextResponse.json(
        { error: "잠시 후 다시 시도해 주세요", code: "GATE_CONFLICT" },
        { status: 503 },
      );
    case "NOT_FOUND":
      return NextResponse.json(
        { error: "시험지 내부 분석 레코드가 없습니다.", code: "INTERNAL_ANALYSIS_MISSING" },
        { status: 500 },
      );
  }
}

/** body `{ synthOnly: true }` 만 읽는다 — 빈 body·비 JSON 은 기본({}). */
export async function readSynthOnlyFlag(req: NextRequest): Promise<boolean> {
  try {
    const body: unknown = await req.json();
    return asRecord(body).synthOnly === true;
  } catch {
    return false;
  }
}

export async function runSynthOnly(opts: {
  analysisId: string;
  academyId: string;
  staffId: string;
  priorBoost: Record<string, unknown>;
  questionCount: number;
  examMeta: ExamReportMeta;
  requestStartedAt: number;
  routeDeadlineAt: number;
}): Promise<NextResponse> {
  const carried = carryPriorBoost(opts.priorBoost);
  const progress = { completed: opts.questionCount, total: opts.questionCount };
  const gate = await acquireBoostGate({
    analysisId: opts.analysisId,
    academyId: opts.academyId,
    running: {
      ...carried,
      status: "RUNNING",
      startedAt: opts.requestStartedAt,
      staffId: opts.staffId,
      progress,
      synthOnly: true,
    },
  });
  if (!gate.ok) return gateFailureResponse(gate);

  let synthFailed = true;
  let saved = false;
  try {
    const synth = await synthesizeBoostExamLevel({
      analysisId: opts.analysisId,
      academyId: opts.academyId,
      newAnalyses: [],
      examMeta: opts.examMeta,
      routeDeadlineAt: opts.routeDeadlineAt,
      usage: createExamReportUsage(),
    });
    synthFailed = synth.synthFailed;
    saved = await writeBoostResult({
      analysisId: opts.analysisId,
      academyId: opts.academyId,
      analyses: [],
      boost: {
        ...carried,
        status: "DONE",
        startedAt: opts.requestStartedAt,
        staffId: opts.staffId,
        completedAt: Date.now(),
        progress,
        synthOnly: true,
        ...(synthFailed ? { synthFailed: true } : {}),
      },
      examLevel: synth.examLevel,
    });
    if (!saved) console.error("[analysis-boost] synthOnly DONE write did not land");
  } catch (err) {
    console.error("[analysis-boost] synthOnly failed", err);
    try {
      const closed = await writeBoostResult({
        analysisId: opts.analysisId,
        academyId: opts.academyId,
        analyses: [],
        boost: {
          ...carried,
          status: "DONE",
          startedAt: opts.requestStartedAt,
          staffId: opts.staffId,
          completedAt: Date.now(),
          progress,
          synthOnly: true,
          synthFailed: true,
        },
      });
      if (!closed) console.error("[analysis-boost] synthOnly gate close did not land");
    } catch (writeErr) {
      console.error("[analysis-boost] synthOnly gate close threw", writeErr);
    }
  }

  const boostedCount = carried.boostedCount ?? opts.questionCount;
  if (synthFailed || !saved) {
    return NextResponse.json(
      {
        ok: false,
        boostedCount,
        failedNumbers: [],
        chargedCredits: 0,
        synthOnly: true,
        error: "시험 총평 생성에 실패했습니다. 문항 분석은 그대로 보존되었습니다. 잠시 후 다시 시도해주세요.",
        code: "SYNTH_FAILED",
      },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    boostedCount,
    failedNumbers: [],
    chargedCredits: 0,
    synthOnly: true,
  });
}
