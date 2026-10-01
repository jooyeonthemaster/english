import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getStaffSession } from "@/lib/auth";
import {
  canAccessForecastPack,
  getForecastPack,
  getForecastPassages,
  getForecastQuestionSummaries,
  getForecastSets,
} from "@/lib/exam-forecast/queries";
import { ForecastDashboard } from "@/components/exam-forecast/dashboard/forecast-dashboard";

export const metadata: Metadata = { title: "내신 적중 예측", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ExamForecastPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const staff = await getStaffSession();
  if (!staff) redirect(`/login?callbackUrl=/director/exam-forecast/${slug}`);
  if (staff.role !== "DIRECTOR") redirect("/teacher");
  const pack = await getForecastPack(slug);
  if (!pack || !canAccessForecastPack(pack, staff)) notFound();
  const [passages, sets] = await Promise.all([getForecastPassages(pack.id), getForecastSets(pack.id)]);
  const questions = await getForecastQuestionSummaries(pack.id, sets);
  return <ForecastDashboard pack={pack} passages={passages} sets={sets} questions={questions} />;
}
