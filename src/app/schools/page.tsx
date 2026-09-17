import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { MarketingHeader } from "@/components/seo/marketing-header";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbSchema } from "@/lib/seo/structured-data";
import {
  sidoCounts,
  publishedSchools,
  schoolPath,
  sidoPath,
  SCHOOL_HUB,
} from "@/lib/seo/schools-content";

/** /schools — 학교별 내신 허브. 전 학교로 가는 최상위 크롤 진입점. */
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: SCHOOL_HUB.title,
    description: SCHOOL_HUB.description,
    path: SCHOOL_HUB.path,
  });
}

export default async function Page() {
  const [counts, recent] = await Promise.all([sidoCounts(), publishedSchools()]);
  const total = counts.reduce((n, c) => n + c.count, 0);

  return (
    <div className="bg-white">
      <MarketingHeader />
      <JsonLd
        id="ld-schools-hub"
        data={[
          breadcrumbSchema([
            { name: "스모트 SMOAT", url: "/" },
            { name: SCHOOL_HUB.label, url: SCHOOL_HUB.path },
          ]),
        ]}
      />

      <header className="bg-slate-950 px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-balance text-[30px] font-black leading-tight tracking-tight text-white sm:text-[42px]">
            {SCHOOL_HUB.title}
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-slate-300">
            {SCHOOL_HUB.description}
          </p>
          <p className="mt-4 font-mono text-[13px] font-bold text-blue-300">{total}개 학교 수록</p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <h2 className="text-[20px] font-black tracking-tight text-slate-900">지역별로 찾기</h2>
        <ul className="mt-5 flex flex-wrap gap-2.5">
          {counts.map((c) => (
            <li key={c.sido}>
              <Link
                href={sidoPath(c.sido)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
              >
                {c.sido}
                <span className="font-mono text-[12px] font-black text-slate-400">{c.count}</span>
              </Link>
            </li>
          ))}
        </ul>

        <h2 className="mt-12 text-[20px] font-black tracking-tight text-slate-900">최근 갱신</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {recent.slice(0, 24).map((sc) => (
            <li key={`${sc.sido}-${sc.slug}`}>
              <Link
                href={schoolPath(sc)}
                className="flex flex-col rounded-2xl border border-slate-200 p-5 transition hover:border-blue-300"
              >
                <span className="text-[15.5px] font-black text-slate-900">{sc.officialName}</span>
                <span className="mt-1 text-[12.5px] font-bold text-slate-500">
                  {[sc.sido, sc.schoolType, sc.publisher].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
