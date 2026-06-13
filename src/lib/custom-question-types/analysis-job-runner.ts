import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { analyzeForCustomType } from "./analysis-input";
import { compileCustomType } from "./compiler";
import { analyzeQuestionFormat, type FormatAnalysisResult } from "./format-analysis";
import { createCustomTypeWithClient } from "./persistence";

/**
 * 커스텀 유형 '유형 만들기' 분석 — 인-프로세스 백그라운드 워커(개발 서버 한정).
 *
 * 동형/생성 워커와 동일한 검증된 패턴(원자 클레임·펜싱·stale 복구). 한 잡 = 분석 1회라
 * M×N 동시성은 없다. 완료 시 분석→유형정의 컴파일→ACTIVE 커스텀 유형을 자동 생성한다.
 */

const MAX_CONCURRENT_JOBS = 2;
const STALE_PROCESSING_MS = 20 * 60 * 1000;
const RECOVER_THROTTLE_MS = 60 * 1000;

let activeJobs = 0;
let pumping = false;
let lastRecoverAt = 0;
const claimedJobIds = new Set<string>();

async function recoverStalledJobs(): Promise<void> {
  const now = Date.now();
  if (now - lastRecoverAt < RECOVER_THROTTLE_MS) return;
  lastRecoverAt = now;

  const cutoff = new Date(now - STALE_PROCESSING_MS);
  const activeIds = Array.from(claimedJobIds);
  await prisma.customTypeAnalysisJob
    .updateMany({
      where: {
        status: "PROCESSING",
        deletedAt: null,
        updatedAt: { lt: cutoff },
        // 이미 유형을 생성한 잡은 절대 재시도하지 않는다(중복 생성 방지 — 원자 트랜잭션의 방어선).
        createdTypeId: null,
        ...(activeIds.length > 0 ? { id: { notIn: activeIds } } : {}),
      },
      data: { status: "PENDING", startedAt: null },
    })
    .catch(() => undefined);
}

/** PENDING 분석 잡을 동시성 한도 안에서 꺼내 실행. enqueue 후 + 잡 종료 후 호출. */
export function kickCustomTypeAnalysisWorker(): void {
  void pump();
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    await recoverStalledJobs();
    while (activeJobs < MAX_CONCURRENT_JOBS) {
      const candidate = await prisma.customTypeAnalysisJob.findFirst({
        where: { status: "PENDING", deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!candidate) break;

      const claim = await prisma.customTypeAnalysisJob.updateMany({
        where: { id: candidate.id, status: "PENDING" },
        data: { status: "PROCESSING", startedAt: new Date() },
      });
      if (claim.count !== 1) continue;

      activeJobs += 1;
      claimedJobIds.add(candidate.id);
      void runJob(candidate.id).finally(() => {
        activeJobs -= 1;
        claimedJobIds.delete(candidate.id);
        void pump();
      });
    }
  } catch (err) {
    console.error("[custom-type-analysis-worker] pump error", err);
  } finally {
    pumping = false;
  }
}

async function runJob(jobId: string): Promise<void> {
  const job = await prisma.customTypeAnalysisJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  try {
    const image = {
      data: Buffer.from(job.referenceImage, "base64"),
      mediaType: job.referenceMediaType,
    };
    const analyzed = await analyzeForCustomType({
      images: [image],
      gradeInfo: job.gradeInfo ?? undefined,
      manualCropOnly: job.manualCrop,
    });

    // 2차 패스: 시각 포맷 해부(마커/배치/박스/빈칸/답란 + 좌표 어노테이션).
    // 실패해도 유형 생성은 진행한다(v1 평문 스펙으로 폴백 — format=null).
    let formatResult: FormatAnalysisResult | null = null;
    try {
      formatResult = await analyzeQuestionFormat({
        image,
        analysis: analyzed.primary,
        gradeInfo: job.gradeInfo ?? undefined,
        referenceText: analyzed.referenceText,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[custom-type-analysis-worker] format pass failed (continuing v1): ${detail}`);
    }

    const compiled = await compileCustomType(analyzed.primary, formatResult);

    // 버전 source 페이로드(v2): 내용 분석 + 해부 어노테이션 + 원본 이미지 잡 ID(해부 뷰 이미지 서빙용).
    const sourcePayload = {
      analysis: analyzed.primary,
      annotations: formatResult?.annotations ?? [],
      analysisJobId: jobId,
      analysisModel: analyzed.model,
    };

    // 원자 합성: 유형 생성 + 잡 COMPLETED 를 한 트랜잭션으로 → 중간에 죽어도 "유형은 생성됐는데
    // 잡은 PROCESSING" 상태가 안 생긴다(= stale 복구 재실행으로 유형이 중복 생성되는 사고 방지).
    await prisma.$transaction(async (tx) => {
      const created = await createCustomTypeWithClient(tx, {
        academyId: job.academyId,
        createdById: job.createdById,
        name: compiled.suggestedName,
        spec: compiled.spec,
        source: sourcePayload,
      });
      await tx.customTypeAnalysisJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          createdTypeId: created.id,
          suggestedName: compiled.suggestedName,
          resultSpec: compiled.spec as unknown as Prisma.InputJsonValue,
          sourceAnalysis: sourcePayload as unknown as Prisma.InputJsonValue,
          analysisModel: analyzed.model,
          errorMessage: null,
        },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "유형 분석 중 오류가 발생했습니다.";
    await prisma.customTypeAnalysisJob
      .update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: new Date(), errorMessage: message },
      })
      .catch(() => undefined);
  }
}
