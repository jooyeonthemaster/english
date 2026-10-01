import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getStaffSession } from "@/lib/auth";
import { listForecastPacks } from "@/lib/exam-forecast/queries";

export const metadata: Metadata = { title: "내신 적중 예측", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ExamForecastIndexPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login?callbackUrl=/director/exam-forecast");
  if (staff.role !== "DIRECTOR") redirect("/teacher");
  const packs = await listForecastPacks(staff.academyId);
  return (
    <div className="min-h-full bg-[#f6f2e9] px-6 py-10 text-[#1c1a17]">
      <div className="mx-auto max-w-4xl">
        <p className="text-[12px] font-semibold tracking-[0.18em] text-[#b3261e]">EXAM FORECAST</p>
        <h1 className="mt-2 font-['Nanum_Myeongjo',serif] text-[30px] font-extrabold">내신 적중 예측</h1>
        <p className="mt-2 text-[14px] text-[#6b645a]">학교 기출을 해부해 이번 시험을 예측한 자료 모음입니다.</p>
        <ul className="mt-8 space-y-3">
          {packs.map((p) => (
            <li key={p.slug}>
              <Link href={`/director/exam-forecast/${p.slug}`} className="block rounded-xl border border-[#d8d1c2] bg-[#fffdf8] px-5 py-4 transition hover:border-[#b3261e] hover:shadow-sm">
                <div className="text-[12px] text-[#6b645a]">{p.schoolName}</div>
                <div className="mt-0.5 text-[17px] font-bold">{p.title}</div>
                {p.subtitle ? <div className="mt-1 text-[13px] text-[#6b645a]">{p.subtitle}</div> : null}
              </Link>
            </li>
          ))}
          {packs.length === 0 ? <li className="text-[14px] text-[#6b645a]">아직 자료가 없습니다.</li> : null}
        </ul>
      </div>
    </div>
  );
}
