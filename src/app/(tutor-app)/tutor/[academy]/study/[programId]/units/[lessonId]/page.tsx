import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { openTutorAssignmentWhere } from "@/lib/tutor/access";
import { parsePassageAnalysis } from "@/lib/tutor/passage-analysis";
import { requireTutorRouteSession } from "@/lib/tutor/route-auth";
import { sanitizeTutorActivityPayload } from "@/lib/tutor/sanitize-activity";
import { LessonLabClient } from "./lesson-lab-client";

type CoverageRef = {
  sentenceIndex: number;
  dimension: "interpret" | "memorize" | "order" | "vocab" | "grammar" | "transfer";
  weight?: number;
};

const coverageDimensions = new Set(["interpret", "memorize", "order", "vocab", "grammar", "transfer"]);

export default async function TutorLessonLabPage({
  params,
}: {
  params: Promise<{ academy: string; programId: string; lessonId: string }>;
}) {
  const { academy: rawAcademy, programId, lessonId } = await params;
  const { academy, session } = await requireTutorRouteSession(rawAcademy);
  const now = new Date();
  const openAssignment = openTutorAssignmentWhere({
    academyId: session.academyId,
    studentId: session.studentId,
    now,
  });
  const assignment = await prisma.tutorAssignment.findFirst({
    where: { ...openAssignment, programId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!assignment) notFound();

  const lesson = await prisma.tutorLesson.findFirst({
    where: {
      id: lessonId,
      academyId: session.academyId,
      programLinks: {
        some: {
          programId,
          program: {
            assignments: {
              some: openAssignment,
            },
          },
        },
      },
    },
    include: {
      passage: { include: { analysis: true } },
      activities: { where: { status: { in: ["APPROVED", "PUBLISHED"] } }, orderBy: { orderNum: "asc" } },
    },
  });
  if (!lesson) notFound();

  const attemptItems = await prisma.tutorAttemptItem.findMany({
    where: {
      academyId: session.academyId,
      attempt: {
        assignmentId: assignment.id,
        studentId: session.studentId,
        lessonId: lesson.id,
        deletedAt: null,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      activityId: true,
      isCorrect: true,
      scoreEarned: true,
      scoreMax: true,
    },
  });

  const bestByActivity = new Map<string, (typeof attemptItems)[number]>();
  for (const item of attemptItems) {
    const current = bestByActivity.get(item.activityId);
    if (!current || item.scoreEarned > current.scoreEarned) {
      bestByActivity.set(item.activityId, item);
    }
  }

  const analysis = parsePassageAnalysis(lesson.passage.analysis?.analysisData);
  const sentences =
    analysis?.sentences.map((sentence) => ({
      index: sentence.index,
      english: sentence.english,
      korean: sentence.korean,
    })) ?? fallbackSentences(lesson.passage.content);

  return (
    <LessonLabClient
      academy={academy}
      programId={programId}
      lessonId={lesson.id}
      title={lesson.title}
      passage={lesson.passage.content}
      sentences={sentences}
      analysis={{
        mainIdea: analysis?.structure?.mainIdea ?? "",
        purpose: analysis?.structure?.purpose ?? "",
        keyPoints: analysis?.structure?.keyPoints ?? [],
        flow:
          analysis?.structure?.logicFlow?.map((item) => ({
            role: item.role,
            summary: item.summary,
            sentenceIndices: item.sentenceIndices,
          })) ?? [],
        vocabCount: analysis?.vocabulary.length ?? 0,
        grammarCount: analysis?.grammarPoints.length ?? 0,
      }}
      activities={lesson.activities.map((activity) => {
        const attemptItem = bestByActivity.get(activity.id);
        return {
          id: activity.id,
          mode: activity.mode,
          type: activity.type,
          title: activity.title,
          instructions: activity.instructions,
          payload: sanitizeTutorActivityPayload(activity.payload),
          maxScore: activity.maxScore,
          estimatedSec: activity.estimatedSec,
          coverageRefs: parseCoverageRefs(activity.coverageRefs),
          answered: Boolean(attemptItem),
          isCorrect: attemptItem?.isCorrect ?? null,
          scoreEarned: attemptItem?.scoreEarned ?? 0,
          scoreMax: attemptItem?.scoreMax ?? activity.maxScore,
        };
      })}
    />
  );
}

function parseCoverageRefs(raw: unknown): CoverageRef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => typeof item.sentenceIndex === "number" && typeof item.dimension === "string")
    .filter((item) => coverageDimensions.has(String(item.dimension)))
    .map((item) => ({
      sentenceIndex: Number(item.sentenceIndex),
      dimension: item.dimension as CoverageRef["dimension"],
      weight: typeof item.weight === "number" ? item.weight : undefined,
    }));
}

function fallbackSentences(content: string) {
  const matches = content.match(/[^.!?]+[.!?]+/g) ?? [content];
  return matches.map((english, index) => ({
    index,
    english: english.trim(),
    korean: "",
  }));
}
