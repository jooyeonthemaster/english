import type { Prisma, PrismaClient } from "@prisma/client";

import { isKoreanSubject, readKoKindFromTags } from "@/lib/korean/core/passage-meta";

import { KO_PRIME_REPORT_MARKER, type KoAnalysisReport } from "./ko-schema";
import type { BuildKoAnalysisReportPromptInput } from "./ko-prompt";

/**
 * PRIME_KO 진입점 공용 팩토리 — 분석 진입점(prime 라우트 / worksheet 라우트 /
 * fast 라우트 / trigger 워커)이 전부 이 모듈로 과목을 판정·저장한다.
 * 한 곳이라도 게이트가 빠지면 국어 지문이 영어 분석기로 오염되므로(포트맵 위험 9위)
 * 판정 로직을 이 파일 하나에 모아 둔다. KO 는 derive-legacy(PassageAnalysis 파생)를
 * 절대 통과하지 않는다.
 */

export { KO_PRIME_REPORT_MARKER };

export interface KoGatePassage {
  subject?: string | null;
  tags?: unknown;
  content?: string | null;
  grade?: number | null;
}

/** 국어 지문인가 — 모든 분석 진입점의 단일 판정 함수. */
export function isKoreanPassage(passage: { subject?: string | null } | null | undefined): boolean {
  return !!passage && isKoreanSubject(passage.subject ?? null);
}

/** Passage → PRIME_KO 생성 입력 (갈래 태그 해석 포함). */
export function buildKoPromptInputFromPassage(passage: {
  content: string;
  tags?: unknown;
  grade?: number | null;
  schoolType?: "MIDDLE" | "HIGH" | null;
  customPrompt?: string;
}): BuildKoAnalysisReportPromptInput {
  return {
    passageContent: passage.content,
    koKind: readKoKindFromTags(passage.tags ?? null),
    schoolType: passage.schoolType ?? null,
    grade: passage.grade ?? null,
    customPrompt: passage.customPrompt,
  };
}

/** PrismaClient / TransactionClient 겸용. */
type PassageReportDb = Pick<PrismaClient, "passageReport"> | Pick<Prisma.TransactionClient, "passageReport">;

/**
 * PRIME_KO 보고서 저장/갱신 (passage 당 1개, 영어 PRIME 행과 완전 분리된 마커).
 * PassageAnalysis(derive-legacy 파생) 는 절대 만들지 않는다.
 */
export async function saveKoPrimeReport(
  db: PassageReportDb,
  args: { academyId: string; passageId: string; staffId: string; report: KoAnalysisReport },
): Promise<{ reportId: string }> {
  const { academyId, passageId, staffId, report } = args;
  const data = {
    title: report.meta.titleKo,
    status: "PUBLISHED",
    pages: report as never,
    theme: { themeId: report.themeId } as never,
    templateId: "prime-ko",
    generationPlan: KO_PRIME_REPORT_MARKER,
    lastEditedById: staffId,
    lastEditedAt: new Date(),
  };
  const existing = await db.passageReport.findFirst({
    where: { passageId, academyId, generationPlan: KO_PRIME_REPORT_MARKER, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    const u = await db.passageReport.update({
      where: { id: existing.id },
      data: { ...data, version: { increment: 1 } },
      select: { id: true },
    });
    return { reportId: u.id };
  }
  const c = await db.passageReport.create({
    data: { academyId, passageId, createdById: staffId, ...data },
    select: { id: true },
  });
  return { reportId: c.id };
}
