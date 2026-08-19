import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { MarketingHeader } from "@/components/seo/marketing-header";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbSchema } from "@/lib/seo/structured-data";
import {
  schoolsBySido,
  sidoCounts,
  schoolPath,
  sidoPath,
  SCHOOL_HUB,
} from "@/lib/seo/schools-content";

/** /schools/[sido] — 시도별 학교 인덱스. 학교 상세로 가는 크롤 경로를 만든다(고아 방지). */
export const dynamicParams = true;
export const revalidate = 86400;

export async function generateStaticParams() {
  const rows = await sidoCounts();
  return rows.map((r) => ({ sido: r.sido }));
}

type Props = { params: Promise<{ sido: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sido } = await params;
  const s = decodeURIComponent(sido);
  return buildMetadata({
    title: `${s} 고등학교 영어 내신 출제 경향 모음`,
    description: `${s} 지역 고등학교별 영어 내신 시험 일정, 서술형 배점 구조, 교과서·부교재 정보를 정리했습니다. 학원 강사용 대비 자료 제작 가이드를 학교별로 제공합니다.`,
    path: sidoPath(s),
  });
}

export default async function Page({ params }: Props) {
  const { sido } = await params;
  const s = decodeURIComponent(sido);
  const schools = await schoolsBySido(s);
  if (schools.length === 0) notFound();

  return (
    <div className="bg-white">
      <MarketingHeader />
      <JsonLd
        id={`ld-sido-${s}`}
        data={[
          breadcrumbSchema([
            { name: "스모트 SMOAT", url: "/" },
            { name: SCHOOL_HUB.label, url: SCHOOL_HUB.path },
            { name: s, url: sidoPath(s) },
          ]),
        ]}
      />

      <header className="bg-slate-950 px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <nav aria-label="위치" className="flex flex-wrap gap-1.5 text-[12px] font-bold text-slate-400">
            <Link href="/" className="hover:text-white">스모트</Link>
            <span aria-hidden>/</span>
            <Link href={SCHOOL_HUB.path} className="hover:text-white">{SCHOOL_HUB.label}</Link>
            <span aria-hidden>/</span>
            <span className="text-slate-200">{s}</span>
          </nav>
          <h1 className="mt-4 text-[30px] font-black tracking-tight text-white sm:text-[38px]">
            {s} 고등학교 영어 내신 출제 경향
          </h1>
          <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-slate-300">
            {s} 지역 {schools.length}개 학교의 시험 일정과 서술형 배점 구조, 교과서·부교재 정보를 정리했습니다.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <ul className="grid gap-3 sm:grid-cols-2">
          {schools.map((sc) => (
            <li key={sc.slug}>
              <Link
                href={schoolPath(sc)}
                className="flex h-full flex-col rounded-2xl border border-slate-200 p-5 transition hover:border-blue-300 hover:shadow-[0_20px_50px_-40px_rgba(15,23,42,0.5)]"
              >
                <span className="text-[16px] font-black text-slate-900">{sc.officialName}</span>
                <span className="mt-1 text-[12.5px] font-bold text-slate-500">
                  {[sc.schoolType, sc.region, sc.publisher].filter(Boolean).join(" · ")}
                </span>
                <span className="mt-2.5 line-clamp-2 text-[13.5px] leading-relaxed text-slate-600">
                  {sc.metaDescription}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
