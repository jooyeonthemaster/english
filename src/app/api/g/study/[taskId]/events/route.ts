// ============================================================================
// 학습지 스터디 모드 — 이벤트 배치 수신 API (spec §7)
//
// POST /api/g/study/[taskId]/events
// 플레이어(study/[stageId])가 문항 응답 로그를 배치 플러시하는 유일한 통로.
// 가드 순서는 하우스 패턴(complete 라우트)과 동일:
//   기능 플래그 → 세션 → 소유 태스크 → 바디 파스 → 스터디 컨텍스트 → 반영.
// sendBeacon(Content-Type 없는 text 바디) 대비 req.json() 실패 시 text 폴백.
// ============================================================================

import { NextResponse } from "next/server";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getGrammarSession } from "@/lib/grammar-drill/auth";
import { loadOwnedStudentTask } from "@/lib/study-assignments/student-runtime";
import {
  applyStudyEvents,
  loadStudyContext,
  parseEventsRequest,
} from "@/lib/worksheet-study/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 요청 바디 안전 파스 — clone 먼저 json 시도, 실패 시 원본 text → JSON.parse 폴백 */
async function readBody(req: Request): Promise<unknown> {
  try {
    return await req.clone().json();
  } catch {
    try {
      const text = await req.text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  try {
    if (!FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const session = await getGrammarSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { taskId } = await ctx.params;
    const task = await loadOwnedStudentTask(taskId, session.studentId, session.academyId);
    if (!task || task.kind !== "WORKSHEET") {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const parsed = parseEventsRequest(await readBody(req));
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    const studyCtx = await loadStudyContext(task, session.academyId);
    if (!studyCtx.plan) {
      return NextResponse.json({ ok: false, error: "STUDY_UNAVAILABLE" }, { status: 409 });
    }
    if (studyCtx.locked) {
      return NextResponse.json({ ok: false, error: "LOCKED" }, { status: 403 });
    }

    const { taskDone, planStale, summary } = await applyStudyEvents(
      studyCtx,
      session.academyId,
      session.studentId,
      parsed,
    );
    // 이벤트 무거절 원칙(spec §7.1) — plan 이 낡아도 기록은 저장하고 planStale 로만 알린다
    return NextResponse.json({ ok: true, taskDone, planStale, summary });
  } catch {
    // 학생에게 내부 오류 상세(스택)를 노출하지 않는다.
    return NextResponse.json({ ok: false, error: "INTERNAL" }, { status: 500 });
  }
}
