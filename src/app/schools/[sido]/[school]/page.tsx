import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { SchoolPageShell } from "@/components/seo/school-page-shell";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { absoluteUrl } from "@/lib/seo/config";
import { articleSchema, breadcrumbSchema, faqSchema } from "@/lib/seo/structured-data";
import {
  getSchoolPage,
  prerenderSchools,
  schoolPath,
  sidoPath,
  siblingsByPublisher,
  siblingsBySido,
  SCHOOL_HUB,
} from "@/lib/seo/schools-content";

/**
 * /schools/[sido]/[school] — 학교별 영어 내신 출제 경향 페이지.
 *
 * 전량 정적 생성이 아니라 상위 N 건만 프리렌더하고 나머지는 ISR 로 만든다.
 * 학교가 수백~수천 개로 늘어나면 빌드타임이 병목이 되기 때문이다.
 * (기존 /types·/guides 는 dynamicParams=false 지만 여기서만 true 로 뒤집는다.)
 */
export const dynamicParams = true;
export const revalidate = 86400; // 24h

export async function generateStaticParams() {
  const rows = await prerenderSchools(300);
  return rows.map((r) => ({ sido: r.sido, school: r.slug }));
}

type Props = { params: Promise<{ sido: string; school: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sido, school } = await params;
  const page = await getSchoolPage(decodeURIComponent(sido), decodeURIComponent(school));
  if (!page) return {};
  return buildMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: schoolPath(page),
    keywords: page.keywords,
  });
}

export default async function Page({ params }: Props) {
  const { sido, school } = await params;
  const page = await getSchoolPage(decodeURIComponent(sido), decodeURIComponent(school));
  if (!page) notFound();

  const [sibPub, sibSido] = await Promise.all([
    page.publisher ? siblingsByPublisher(page.publisher, page.slug, 6) : Promise.resolve([]),
    siblingsBySido(page.sido, page.slug, 6),
  ]);

  const path = schoolPath(page);

  return (
    <>
      <JsonLd
        id={`ld-school-${page.sido}-${page.slug}`}
        data={[
          articleSchema({
            headline: page.h1,
            description: page.metaDescription,
            url: absoluteUrl(path),
            datePublished: page.updatedAt.toISOString().slice(0, 10),
          }),
          breadcrumbSchema([
            { name: "스모트 SMOAT", url: "/" },
            { name: SCHOOL_HUB.label, url: SCHOOL_HUB.path },
            { name: page.sido, url: sidoPath(page.sido) },
            { name: page.officialName, url: path },
          ]),
          ...(page.faq.length > 0 ? [faqSchema(page.faq)] : []),
        ]}
      />
      <SchoolPageShell page={page} siblingsPublisher={sibPub} siblingsSido={sibSido} />
    </>
  );
}
