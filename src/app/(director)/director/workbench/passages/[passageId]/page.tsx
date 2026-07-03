import { redirect, notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth";
import { getWorkbenchPassage } from "@/actions/workbench";
import { PassageDetailClient } from "@/components/workbench/passage-detail-client";

interface PageProps {
  params: Promise<{ passageId: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}

export default async function PassageDetailPage({ params, searchParams }: PageProps) {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const { passageId } = await params;
  const sp = await searchParams;
  const passage = await getWorkbenchPassage(passageId);

  // Academy guard — even if the action doesn't scope by tenant internally,
  // the detail page refuses to render passages that don't belong to the
  // current staff's academy so deep-linked ids from other tenants 404 out.
  if (!passage || passage.academyId !== staff.academyId) notFound();

  // 과목 게이트 — 국어 지문(subject='KOREAN')은 국어 상세로 보낸다. 이 화면의
  // 도구(AI 지문 분석·PRIME 학습지·시험 추가)는 전부 영어 파이프라인이라 국어
  // 지문에 노출되면 안 된다. 영어/기존(subject null) 지문은 기존 동작 그대로.
  if (passage.subject === "KOREAN") {
    redirect(`/director/korean/passages/${passageId}`);
  }

  return (
    <PassageDetailClient
      passage={passage}
      academyId={staff.academyId}
      autoAnalyze={sp.autoAnalyze === "true"}
      initialPrompt={sp.prompt}
      initialFocus={sp.focus?.split(",").filter(Boolean)}
      initialLevel={sp.level}
    />
  );
}
