import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTutorStatus } from "@/lib/tutor/ui-copy";
import { TutorPublishForm } from "./tutor-publish-form";

export default async function TutorProgramBuilderPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const staff = await requireStaffAuth("DIRECTOR");
  const { programId } = await params;
  const program = await prisma.tutorProgram.findFirst({
    where: { id: programId, academyId: staff.academyId },
    include: {
      lessons: {
        orderBy: { orderNum: "asc" },
        include: {
          lesson: {
            include: {
              passage: { include: { analysis: true } },
              activities: {
                where: { status: { in: ["APPROVED", "PUBLISHED"] } },
                orderBy: { orderNum: "asc" },
              },
            },
          },
        },
      },
      assignments: { include: { recipients: true } },
    },
  });
  if (!program) notFound();

  const [classes, students, schools, schoolGradeGroups, activeStudentCount] = await Promise.all([
    prisma.class.findMany({
      where: { academyId: staff.academyId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, _count: { select: { enrollments: { where: { status: "ENROLLED" } } } } },
    }),
    prisma.student.findMany({
      where: { academyId: staff.academyId, status: "ACTIVE" },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      select: { id: true, name: true, grade: true, school: { select: { name: true } } },
    }),
    prisma.school.findMany({
      where: { academyId: staff.academyId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { students: { where: { status: "ACTIVE" } } } } },
    }),
    prisma.student.groupBy({
      by: ["schoolId", "grade"],
      where: { academyId: staff.academyId, status: "ACTIVE", schoolId: { not: null } },
      _count: { _all: true },
      orderBy: [{ grade: "asc" }],
    }),
    prisma.student.count({ where: { academyId: staff.academyId, status: "ACTIVE" } }),
  ]);
  const schoolNameById = new Map(schools.map((school) => [school.id, school.name]));
  const schoolGradeTargets = schoolGradeGroups
    .filter((group) => group.schoolId)
    .map((group) => ({
      id: `${group.schoolId}:${group.grade}`,
      label: `${schoolNameById.get(group.schoolId ?? "") ?? "학교"} ${group.grade}학년`,
      count: group._count._all,
    }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-blue-600">프로그램 빌더</p>
            <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">
              {formatTutorStatus(program.status)}
            </Badge>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">{program.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {program.lessons.length}개 지문 ·{" "}
            {program.lessons.reduce((sum, link) => sum + link.lesson.activities.length, 0)}개 활동
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/director/tutor/programs/${program.id}/monitor`}>현황 보기</Link>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">학습 커버리지</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {program.lessons.map((link) => {
              const lesson = link.lesson;
              const sentences = parseSentenceCount(lesson.passage.analysis?.analysisData);
              const dimensions = ["해석", "암기", "순서", "어휘", "어법", "전이"];
              return (
                <div key={lesson.id} className="rounded-xl border border-slate-200">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-bold text-slate-900">{lesson.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{lesson.activities.length}개 활동</p>
                  </div>
                  <div className="overflow-x-auto p-3">
                    <div className="grid min-w-[620px] gap-1" style={{ gridTemplateColumns: `72px repeat(6, 1fr)` }}>
                      <div />
                      {dimensions.map((dimension) => (
                        <div key={dimension} className="rounded-md bg-slate-50 px-2 py-1 text-center text-xs font-semibold text-slate-500">
                          {dimension}
                        </div>
                      ))}
                      {Array.from({ length: Math.max(1, sentences) }).map((_, index) => (
                        <MatrixRow key={index} sentenceIndex={index} activities={lesson.activities} />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <TutorPublishForm
            programId={program.id}
            disabled={false}
            activeStudentCount={activeStudentCount}
            classes={classes.map((item) => ({
              id: item.id,
              label: item.name,
              count: item._count.enrollments,
            }))}
            students={students.map((item) => ({
              id: item.id,
              label: `${item.name} · ${item.school?.name ?? "학교 미지정"} · ${item.grade}학년`,
            }))}
            schools={schools.map((item) => ({
              id: item.id,
              label: item.name,
              count: item._count.students,
            }))}
            schoolGrades={schoolGradeTargets}
          />

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">문항 미리보기</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {program.lessons.map((link) => (
                <div key={link.lessonId} className="space-y-2 rounded-xl border border-slate-200 p-3">
                  <div className="border-b border-slate-100 pb-2">
                    <p className="line-clamp-1 text-sm font-bold text-slate-950">{link.lesson.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{link.lesson.activities.length}개 문항</p>
                  </div>
                  <div className="space-y-2">
                    {link.lesson.activities.map((activity) => (
                      <div key={activity.id} className="rounded-lg bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-sm font-bold text-slate-900">{activity.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                              {describeActivityPayload(activity.type, activity.payload)}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0 border-blue-100 bg-blue-50 text-blue-700">
                            {formatMode(activity.mode)}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                            {formatActivityType(activity.type)}
                          </Badge>
                          <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                            {activity.maxScore}점
                          </Badge>
                          <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                            약 {Math.ceil(activity.estimatedSec / 60)}분
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatMode(mode: string) {
  const labels: Record<string, string> = {
    interpret: "해석",
    memorize: "암기",
    order: "순서",
    vocab: "어휘",
    grammar: "어법",
    transfer: "전이",
    mastery: "마스터리",
  };
  return labels[mode] ?? mode;
}

function formatActivityType(type: string) {
  const labels: Record<string, string> = {
    sentence_translate: "직독직해",
    gist_select: "주제 선택",
    paraphrase_mc: "바꿔쓰기",
    first_letter_recall: "첫 글자 암기",
    progressive_cloze: "빈칸 복원",
    sentence_rebuild: "문장 조립",
    chunk_rebuild: "구문 조립",
    sentence_order: "문장 순서",
    insertion_point: "문장 삽입",
    vocab_choice: "뜻 선택",
    vocab_spell: "철자 쓰기",
    vocab_match: "어휘 매칭",
    contextual_meaning: "문맥 뜻",
    collocation_select: "연어 선택",
    grammar_binary: "어법 판단",
    grammar_find: "어법 찾기",
    grammar_correct: "어법 고치기",
    structure_transform: "구문 전환",
  };
  return labels[type] ?? type;
}

function describeActivityPayload(type: string, raw: unknown) {
  const payload = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const prompt = String(
    payload.prompt ??
      payload.statement ??
      payload.stem ??
      payload.meaning ??
      payload.targetSentence ??
      payload.source ??
      "",
  ).trim();
  if (type === "vocab_match") {
    const count = Array.isArray(payload.leftItems) ? payload.leftItems.length : 0;
    return `${count}개 영단어와 한국어 뜻을 연결하는 매칭 활동`;
  }
  if (type === "sentence_order") {
    const count = Array.isArray(payload.shuffled) ? payload.shuffled.length : 0;
    return `${count}개 문장을 논리 흐름에 맞게 배열`;
  }
  if (type === "sentence_rebuild" || type === "chunk_rebuild") {
    const count = Array.isArray(payload.chunks) ? payload.chunks.length : 0;
    return `${count}개 조각으로 원문 문장 조립`;
  }
  const optionCount = Array.isArray(payload.options) ? payload.options.length : 0;
  return [prompt || "문항 프롬프트", optionCount ? `선택지 ${optionCount}개` : ""].filter(Boolean).join(" · ");
}

function parseSentenceCount(raw?: string | null) {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.sentences) ? parsed.sentences.length : 0;
  } catch {
    return 0;
  }
}

function MatrixRow({
  sentenceIndex,
  activities,
}: {
  sentenceIndex: number;
  activities: Array<{ coverageRefs: unknown }>;
}) {
  type CoverageRef = { sentenceIndex: number; dimension: string; weight?: number };
  const isCoverageRef = (value: unknown): value is CoverageRef => {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return typeof record.sentenceIndex === "number" && typeof record.dimension === "string";
  };
  const dims = ["interpret", "memorize", "order", "vocab", "grammar", "transfer"];
  return (
    <>
      <div className="rounded-md bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-500">문장 {sentenceIndex + 1}</div>
      {dims.map((dim) => {
        const score = activities.reduce((sum, activity) => {
          const refs = Array.isArray(activity.coverageRefs) ? activity.coverageRefs.filter(isCoverageRef) : [];
          return (
            sum +
            refs
              .filter((ref) => ref.sentenceIndex === sentenceIndex && ref.dimension === dim)
              .reduce((inner, ref) => inner + Number(ref.weight ?? 0), 0)
          );
        }, 0);
        const pct = Math.min(100, Math.round(score * 100));
        return (
          <div
            key={dim}
            className="rounded-md px-2 py-2 text-center text-xs font-bold"
            style={{
              backgroundColor: pct >= 70 ? "#EFF6FF" : pct >= 30 ? "#F8FAFC" : "#FFFFFF",
              color: pct >= 70 ? "#2563EB" : pct >= 30 ? "#64748B" : "#CBD5E1",
              border: "1px solid #E2E8F0",
            }}
          >
            {pct}%
          </div>
        );
      })}
    </>
  );
}
