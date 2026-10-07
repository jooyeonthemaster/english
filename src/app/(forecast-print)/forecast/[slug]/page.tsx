import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getStaffSession } from "@/lib/auth";
import {
  getForecastPack,
  getForecastPassages,
  getForecastQuestionSummaries,
  getForecastSets,
  isForecastPackPublic,
} from "@/lib/exam-forecast/queries";
import { ForecastDashboard } from "@/components/exam-forecast/dashboard/forecast-dashboard";

// 공개 팩 대시보드(앱 셸 없음) — 비원장이 /director/exam-forecast/<slug> 를 열면 proxy 가 여기로 보낸다.
// 링크 공유용이라 검색 노출은 막아 둔다. 비공개 팩이면 예전 경로의 로그인·권한 흐름으로 되돌린다.

export const metadata: Metadata = { title: "내신 적중 예측", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PublicExamForecastPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pack = await getForecastPack(slug);
  if (!pack || !isForecastPackPublic(pack)) {
    const staff = await getStaffSession();
    if (!staff) redirect(`/login?callbackUrl=/director/exam-forecast/${slug}`);
    if (staff.role !== "DIRECTOR") redirect("/teacher");
    if (!pack) notFound();
    redirect(`/director/exam-forecast/${slug}`);
  }
  const [passages, sets] = await Promise.all([getForecastPassages(pack.id), getForecastSets(pack.id)]);
  const questions = await getForecastQuestionSummaries(pack.id, sets);
  return <ForecastDashboard pack={pack} passages={passages} sets={sets} questions={questions} />;
}
