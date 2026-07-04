import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getWorkbenchPassage } from "@/actions/workbench";
import { KoreanPassageDetailClient } from "./korean-passage-detail-client";

export const metadata: Metadata = { title: "국어 지문 상세" };

interface PageProps {
  params: Promise<{ passageId: string }>;
}

/**
 * 국어 지문 상세 — 영어 상세(/director/workbench/passages/[passageId]) 래퍼의
 * 국어 대칭 라우트. 동일한 세션/테넌트 가드를 미러하고, 과목 게이트를 추가한다:
 * subject !== 'KOREAN' 지문은 영어 상세로 돌려보낸다(영어 상세는 그 반대 방향
 * 게이트를 가진다 — 딥링크가 어느 쪽으로 오든 올바른 과목 화면에 착륙).
 */
export default async function KoreanPassageDetailPage({ params }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { passageId } = await params;
  const passage = await getWorkbenchPassage(passageId);

  // Academy guard — 영어 상세 페이지와 동일: 다른 테넌트의 id 는 404.
  if (!passage || passage.academyId !== staff.academyId) notFound();

  // 과목 게이트 — 영어(또는 subject 미기록=영어 간주) 지문은 영어 상세로.
  if (passage.subject !== "KOREAN") {
    redirect(`/director/workbench/passages/${passageId}`);
  }

  return (
    <KoreanPassageDetailClient
      passage={{
        id: passage.id,
        title: passage.title,
        content: passage.content,
        grade: passage.grade,
        semester: passage.semester,
        publisher: passage.publisher,
        tags: passage.tags,
        createdAt: passage.createdAt,
        school: passage.school
          ? { id: passage.school.id, name: passage.school.name }
          : null,
        questionCount: passage.questions.length,
      }}
    />
  );
}
