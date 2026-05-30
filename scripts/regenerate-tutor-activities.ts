// 기존 튜터 프로그램의 활동을 v2(rule-based)로 일괄 재생성하는 유틸.
// 사용: npx tsx scripts/regenerate-tutor-activities.ts <programId>
// (신규로 생성하는 프로그램은 이미 v2이므로, 과거 v1 데이터 갱신용 보너스 도구)

import { prisma } from "@/lib/prisma";
import { parsePassageAnalysis } from "@/lib/tutor/passage-analysis";
import { buildRuleBasedTutorDrafts } from "@/lib/tutor/generate-activities";
import { requiresAiGrade } from "@/lib/tutor/activity-types";
import { sha256Json } from "@/lib/tutor/crypto";

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

async function main() {
  const programId = process.argv[2];
  if (!programId) {
    console.error("Usage: npx tsx scripts/regenerate-tutor-activities.ts <programId>");
    process.exit(1);
  }

  const links = await prisma.tutorProgramLesson.findMany({
    where: { programId },
    include: { lesson: { include: { passage: { include: { analysis: true } } } } },
    orderBy: { orderNum: "asc" },
  });
  if (links.length === 0) {
    console.error("No lessons found for program", programId);
    process.exit(1);
  }

  let totalCreated = 0;
  for (const link of links) {
    const lesson = link.lesson;
    const analysis = parsePassageAnalysis(lesson.passage.analysis?.analysisData);
    if (!analysis) {
      console.warn(`- ${lesson.title}: 분석 데이터 없음, 건너뜀`);
      continue;
    }
    const drafts = buildRuleBasedTutorDrafts(analysis);
    await prisma.$transaction(async (tx) => {
      await tx.tutorActivity.deleteMany({ where: { lessonId: lesson.id } });
      await tx.tutorActivity.createMany({
        data: drafts.map((draft, orderNum) => ({
          academyId: lesson.academyId,
          lessonId: lesson.id,
          mode: draft.mode,
          type: draft.type,
          orderNum,
          title: draft.title,
          instructions: draft.instructions ?? null,
          payload: asJson(draft.payload),
          payloadHash: sha256Json(draft.payload),
          payloadSchemaVersion: 2,
          analysisSnapshotHash: sha256Json(analysis),
          itemCount: draft.itemCount,
          maxScore: draft.maxScore,
          estimatedSec: draft.estimatedSec,
          requiresAiGrade: requiresAiGrade(draft.type),
          coverageRefs: asJson(draft.coverageRefs),
          sourceAnalysisVersion: lesson.passage.analysis?.version,
          createdBy: "system",
          status: "APPROVED",
        })),
      });
      await tx.tutorLesson.update({
        where: { id: lesson.id },
        data: {
          activityCount: drafts.length,
          totalMaxScore: drafts.reduce((sum, draft) => sum + draft.maxScore, 0),
        },
      });
    });
    totalCreated += drafts.length;
    console.log(`- ${lesson.title}: ${drafts.length}개 v2 활동 재생성`);
  }
  console.log(`\n완료: ${links.length}개 지문, 총 ${totalCreated}개 활동`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
