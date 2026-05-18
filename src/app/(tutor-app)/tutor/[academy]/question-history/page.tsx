import Link from "next/link";
import { MessageCircleQuestion, MessagesSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTutorRouteSession } from "@/lib/tutor/route-auth";

export default async function TutorQuestionHistoryPage({
  params,
}: {
  params: Promise<{ academy: string }>;
}) {
  const { academy: rawAcademy } = await params;
  const { academy, session } = await requireTutorRouteSession(rawAcademy);
  const conversations = await prisma.tutorConversation.findMany({
    where: { academyId: session.academyId, studentId: session.studentId },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 md:px-8">
      <section className="rounded-[28px] border border-blue-100 bg-blue-50 p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="size-5 text-blue-600" />
          <p className="text-sm font-black text-blue-700">질문</p>
        </div>
        <h1 className="mt-2 text-3xl font-black text-slate-950">질문 내역</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          공부하다 물어본 내용은 다시 열어 복습 자료처럼 사용할 수 있습니다.
        </p>
      </section>

      <div className="space-y-3">
        {conversations.map((conversation) => (
          <Link
            key={conversation.id}
            href={
              conversation.programId
                ? `/tutor/${academy}/study/${conversation.programId}/units/${conversation.lessonId}/ask`
                : `/tutor/${academy}/question-history`
            }
            className="block rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40"
          >
            <p className="line-clamp-1 text-sm font-black text-slate-950">{conversation.title}</p>
            <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-slate-500">{conversation.messages[0]?.content ?? "대화 없음"}</p>
            <p className="mt-3 text-[11px] font-bold text-slate-400">{conversation.updatedAt.toLocaleString("ko-KR")}</p>
          </Link>
        ))}
        {conversations.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-14 text-center">
            <MessagesSquare className="mx-auto size-10 text-blue-600" />
            <p className="mt-3 text-base font-black text-slate-800">아직 질문 내역이 없습니다.</p>
            <p className="mt-1 text-sm font-medium text-slate-500">지문 학습 랩에서 질문하면 이곳에 자동 저장됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
