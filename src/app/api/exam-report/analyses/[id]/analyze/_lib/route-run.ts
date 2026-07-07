// ============================================================================
// analyze 라우트 실행 셋업 — 신규/재개 실행권 확보·과금·이미지 로드·E1a 추출.
// route.ts 슬림화용 분할. 펜싱/체크포인트/과금 프리미티브는 route-db.ts.
// ============================================================================

import { after, NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { downloadAsBuffer } from "@/lib/supabase-storage";
import type { AtlasChatImageInput } from "@/lib/atlas-chat-rest";
import { extractExamMap } from "@/lib/exam-report/exam-analyze-direct";
import { prepareLlmImages } from "@/lib/exam-report/llm-images";
import type { ExamReportMeta } from "@/lib/exam-report/prompts";
import { EXAM_REPORT_JOB_DOMAIN } from "@/lib/exam-report/types";
import type { ExamMap } from "@/lib/exam-report/types";
import {
  acquireResumeFence,
  chargeNewRun,
  inProgressResponse,
  yieldJobFence,
  type JobFence,
} from "./route-db";
import {
  rawObject,
  readNumberField,
  readStringArrayField,
  toJson,
  type RunPlan,
} from "./route-helpers";

/** E1a 무과금 프로브 재시도 상한(B2) — 문항 인식 실패 이미지로 원가 무한 누적 차단. */
const PROBE_RUN_LIMIT = 5;

/** 서버 자가연쇄 폭주 가드 — 한 논리 실행(신규 진입 시 0 리셋)당 최대 재개 라운드. */
export const AUTO_RESUME_MAX_ROUNDS = 20;

/**
 * 서버 자가연쇄(self-chaining): 미종결 yield 직후 자기 자신에게 재개 POST 를 발사해
 * 클라이언트 탭이 닫혀도 분석을 완주시킨다. after() 라 응답 반환 후 실행되고, 펜스
 * (acquireResumeFence)가 이중 실행을 차단하므로 중복 발사는 202 로 무해하다.
 * 요청이 발사되기만 하면 자식 인보케이션은 독립 실행된다(재개 경로는 잡 config
 * 스냅샷 복원이라 body 무관) — 8s 타임아웃/네트워크 실패는 무시(클라 감시견·
 * "이어서 분석" CTA 가 폴백으로 잇는다).
 */
export function scheduleSelfResume(req: NextRequest, analysisId: string): void {
  const origin = req.nextUrl.origin;
  const cookie = req.headers.get("cookie") ?? "";
  after(async () => {
    await fetch(`${origin}/api/exam-report/analyses/${analysisId}/analyze`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8_000),
    }).catch(() => {});
  });
}

/** 실행 파라미터 묶음 — 신규/재개 셋업이 공통으로 라우트에 넘겨준다. */
export interface RunSetup {
  fence: JobFence;
  creditTxId: string | null;
  runTargetNumbers?: string[];
  runForceNumbers: string[];
  runFreeKeys: Set<string>;
}

/**
 * 신규 실행: 잡 생성 + config 스냅샷 저장 + (cost>0) 선차감. 실패 시 status 원복
 * + 402/500 응답을 반환한다(chargeNewRun 계승). 성공 시 펜스·creditTxId·실행 대상 반환.
 */
export async function createRunJobAndCharge(opts: {
  analysisId: string;
  academyId: string;
  staffId: string;
  title: string;
  priorStatus: string;
  plan: RunPlan;
  questionCount: number;
}): Promise<{ ok: true; setup: RunSetup } | { ok: false; response: NextResponse }> {
  const { plan } = opts;
  const token = new Date();
  const job = await prisma.workbenchAiJob.create({
    data: {
      academyId: opts.academyId,
      createdById: opts.staffId,
      domain: EXAM_REPORT_JOB_DOMAIN,
      status: "PROCESSING",
      title: opts.title,
      startedAt: token,
      // 잡 카드 진행률 분모(successCount/requestedCount) — 이번 실행 시도 대상 수.
      requestedCount: plan.attemptedKeys.length,
      config: toJson({
        fastPath: true,
        examAnalysisId: opts.analysisId,
        targetNumbers: plan.targetNumbers ?? null,
        forceNumbers: plan.forceNumbers,
        freeNumberKeys: plan.freeKeys,
      }),
    },
    select: { id: true },
  });
  const fence: JobFence = { jobId: job.id, token };

  let creditTxId: string | null = null;
  if (plan.cost > 0) {
    const charged = await chargeNewRun({
      jobId: job.id,
      analysisId: opts.analysisId,
      academyId: opts.academyId,
      staffId: opts.staffId,
      priorStatus: opts.priorStatus,
      cost: plan.cost,
      metadata: {
        examAnalysisId: opts.analysisId,
        targetNumbers: plan.targetNumbers ?? null,
        forceNumbers: plan.forceNumbers,
        attemptedCount: plan.attemptedKeys.length,
        questionCount: opts.questionCount,
        creditCost: plan.cost,
        fastPath: true,
      },
    });
    if (!charged.ok) return { ok: false, response: charged.response };
    creditTxId = charged.creditTxId;
  }

  return {
    ok: true,
    setup: {
      fence,
      creditTxId,
      runTargetNumbers: plan.targetNumbers,
      runForceNumbers: plan.forceNumbers,
      runFreeKeys: new Set(plan.freeKeys),
    },
  };
}

/**
 * 재개 실행: 기존 PROCESSING 잡 펜싱 게이트(A3) 통과 후, 잡 config 스냅샷에서
 * 실행 대상을 복원한다(요청 body 와 어긋나도 청구 범위를 마저 실행). examMap 이
 * 없으면(좀비) 반납 + status FAILED 로 즉시 재시작 가능 상태로 만든다.
 */
export async function setupResume(opts: {
  analysisId: string;
  academyId: string;
  hasExamMap: boolean;
  existingJob:
    | { id: string; creditTxId: string | null; updatedAt: Date; startedAt: Date | null; config: unknown }
    | null;
}): Promise<{ ok: true; setup: RunSetup } | { ok: false; response: NextResponse }> {
  const gate = await acquireResumeFence(opts.existingJob);
  if (gate.kind === "conflict") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "이미 분석이 진행 중이거나 상태가 변경되었습니다. 새로고침 해주세요.",
          code: "CONFLICT",
        },
        { status: 409 },
      ),
    };
  }
  if (gate.kind === "inProgress") return { ok: false, response: inProgressResponse() };

  const fence = gate.fence;
  if (!opts.hasExamMap) {
    await yieldJobFence(fence);
    await prisma.examAnalysis
      .updateMany({
        where: { id: opts.analysisId, academyId: opts.academyId, status: "ANALYZING" },
        data: { status: "FAILED", version: { increment: 1 } },
      })
      .catch(() => {});
    return {
      ok: false,
      response: NextResponse.json(
        { error: "분석 상태가 손상되었습니다. 다시 시작해 주세요.", code: "MAP_MISSING" },
        { status: 409 },
      ),
    };
  }

  const cfg = opts.existingJob!.config;
  return {
    ok: true,
    setup: {
      fence,
      creditTxId: opts.existingJob!.creditTxId,
      runTargetNumbers: readStringArrayField(cfg, "targetNumbers") ?? undefined,
      runForceNumbers: readStringArrayField(cfg, "forceNumbers") ?? [],
      runFreeKeys: new Set(readStringArrayField(cfg, "freeNumberKeys") ?? []),
    },
  };
}

/** sourceFiles(page 순) 시험지 페이지를 다운로드해 vision 이미지 입력으로 변환. */
export async function loadExamImages(
  pages: { path: string; page: number }[],
): Promise<AtlasChatImageInput[]> {
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  const buffers = await Promise.all(sorted.map((p) => downloadAsBuffer(p.path)));
  // 총량 예산 재압축 — 전 페이지 1콜 페이로드의 게이트웨이 502 방지
  return prepareLlmImages(buffers);
}

/**
 * E1a: examMap 이 아직 없는 첫 실행에서 시험지 사진을 직접 분석해 examMap 을
 * 도출·저장한다(무과금 프로브). 성공 시 structure 컬럼에 저장하고 examMap 반환.
 * 실패(추출 오류·문항 0)면 ANALYZING → priorStatus 원복 + 에러 응답을 반환한다.
 * 과금은 여기서 하지 않는다 — 라우트가 반환된 문항 수로 max(15,N) 를 선차감한다.
 */
export async function extractAndSaveExamMap(opts: {
  analysisId: string;
  academyId: string;
  images: AtlasChatImageInput[];
  examMeta: ExamReportMeta;
  deadlineAt: number;
  priorStatus: string;
}): Promise<{ ok: true; examMap: ExamMap } | { ok: false; response: NextResponse }> {
  const revert = async () => {
    await prisma.examAnalysis
      .updateMany({
        where: { id: opts.analysisId, academyId: opts.academyId, status: "ANALYZING" },
        data: { status: opts.priorStatus, version: { increment: 1 } },
      })
      .catch(() => {});
  };

  // B2: E1a 무과금 프로브 abuse 가드 — probeRuns 를 선증가 기록한 뒤 상한 초과면
  // 프로브(원가 LLM 콜) 자체를 막고 429 로 반환한다. probeRuns 는 ExamAiMeta 스키마
  // 밖 확장 필드(소유자=types.ts)라 raw JSON 병합으로만 안전 확장한다.
  const current = await prisma.examAnalysis.findFirst({
    where: { id: opts.analysisId, academyId: opts.academyId },
    select: { aiMeta: true },
  });
  const nextProbeRuns = readNumberField(current?.aiMeta, "probeRuns") + 1;
  await prisma.examAnalysis
    .updateMany({
      where: { id: opts.analysisId, academyId: opts.academyId },
      data: {
        aiMeta: toJson({ ...rawObject(current?.aiMeta), probeRuns: nextProbeRuns }),
        version: { increment: 1 },
      },
    })
    .catch(() => {});
  if (nextProbeRuns > PROBE_RUN_LIMIT) {
    await revert();
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "문항 인식 재시도 횟수를 초과했습니다. 시험지 사진을 다시 올린 뒤 재시도해 주세요.",
          code: "PROBE_LIMIT",
        },
        { status: 429 },
      ),
    };
  }

  try {
    const { examMap } = await extractExamMap({
      images: opts.images,
      examMeta: opts.examMeta,
      deadlineAt: opts.deadlineAt,
    });
    if (examMap.questions.length === 0) {
      await revert();
      return {
        ok: false,
        response: NextResponse.json(
          { error: "시험지에서 문항을 찾지 못했습니다. 사진을 확인해 주세요.", code: "NO_QUESTIONS" },
          { status: 400 },
        ),
      };
    }
    await prisma.examAnalysis.update({
      where: { id: opts.analysisId },
      data: {
        structure: toJson(examMap),
        // E1a 성공 시 프로브 카운터 리셋 — 이후 실패가 과거 실패 누적으로 조기에
        // PROBE_LIMIT 락아웃되지 않게 한다(성공=정상 이미지로 examMap 확정된 상태).
        aiMeta: toJson({ ...rawObject(current?.aiMeta), probeRuns: 0 }),
        version: { increment: 1 },
      },
    });
    return { ok: true, examMap };
  } catch {
    await revert();
    return {
      ok: false,
      response: NextResponse.json(
        { error: "시험지 분석(문항 추출)에 실패했습니다. 다시 시도해 주세요.", code: "EXTRACT_FAILED" },
        { status: 500 },
      ),
    };
  }
}
