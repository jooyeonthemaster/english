/**
 * 학교별 SEO 페이지 데이터 소스.
 *
 * articles-content.ts 가 JSON 단일 파일을 쓰는 것과 달리, 학교 페이지는 DB(SchoolSeoPage)에서 읽는다.
 * 이유: 학교 1개당 본문이 30KB 안팎이라 400개면 단일 JSON 이 13MB 를 넘어 빌드가 무너진다.
 *
 * ⚠️ 테넌트 격리 — prisma `School`(academyId 스코프 고객 데이터)을 이 모듈에서 절대 import 하지 않는다.
 *    공개 페이지는 SchoolSeoPage 만 읽는다.
 *
 * 질의 최적화 원칙:
 *   - 목록/사이트맵 경로는 본문 JSON 컬럼을 select 하지 않는다(SUMMARY_SELECT).
 *   - 상세 1건만 전체 컬럼을 읽는다.
 *   - 모든 조회 경로에 대응 인덱스가 schema.prisma 에 선언되어 있다.
 */
import { prisma } from "@/lib/prisma";

/** 막대/도넛 차트 1개. 값은 렌더 시 SVG 로 직접 그린다(외부 차트 라이브러리 없음). */
export type SchoolChart = {
  title: string;
  kind: "bar" | "donut" | "stacked" | "line";
  unit?: string;
  series: { label: string; value: number; note?: string }[];
  /** "학교 공시" | "후기 취합" | "일반고 관행" — 독자에게 근거 수준을 밝힌다. */
  basis?: string;
};

export type SchoolSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  callout?: string;
};

export type SchoolTimelineItem = {
  when: string;
  what: string;
  kind?: "중간고사" | "기말고사" | "모의고사" | "학력평가" | "기타";
};

export type SchoolChecklistItem = { item: string; when?: string };

export type SchoolComparisonTable = {
  title?: string;
  headers: string[];
  rows: string[][];
};

export type SchoolRelated = { href: string; label: string; description?: string };

/** 상세 페이지 렌더에 필요한 전체 엔트리. */
export type SchoolPageEntry = {
  sido: string;
  slug: string;
  officialName: string;
  region: string;
  schoolType: string | null;
  homepage: string | null;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  publisher: string | null;
  keywords: string[];
  intro: string[];
  sections: SchoolSection[];
  charts: SchoolChart[];
  comparisonTable: SchoolComparisonTable | null;
  timeline: SchoolTimelineItem[];
  checklist: SchoolChecklistItem[];
  faq: { question: string; answer: string }[];
  textbooks: string[];
  related: SchoolRelated[];
  ctaTitle: string | null;
  ctaBody: string | null;
  richness: string;
  citedRatio: number;
  sourcesUsed: string[];
  updatedAt: Date;
};

/** 목록·사이트맵용 경량 엔트리. 본문 JSON 을 읽지 않는다. */
export type SchoolSummary = {
  sido: string;
  slug: string;
  officialName: string;
  region: string;
  schoolType: string | null;
  metaDescription: string;
  publisher: string | null;
  richness: string;
  updatedAt: Date;
};

/** 허브 메타(아티클 CONTENT_HUBS 와 같은 역할). */
export const SCHOOL_HUB = {
  path: "/schools",
  label: "학교별 내신",
  title: "학교별 영어 내신 출제 경향과 대비 자료 만들기",
  description:
    "전국 고등학교별 영어 내신 출제 경향, 정기시험 일정, 서술형 배점 구조를 정리하고 학원 강사가 그대로 쓰는 대비 체크리스트를 제공합니다.",
} as const;

export function schoolPath(s: { sido: string; slug: string }): string {
  return `${SCHOOL_HUB.path}/${encodeURIComponent(s.sido)}/${encodeURIComponent(s.slug)}`;
}

export function sidoPath(sido: string): string {
  return `${SCHOOL_HUB.path}/${encodeURIComponent(sido)}`;
}

/** 목록 경로 공통 select — 무거운 JSON 컬럼 제외. */
const SUMMARY_SELECT = {
  sido: true,
  slug: true,
  officialName: true,
  region: true,
  schoolType: true,
  metaDescription: true,
  publisher: true,
  richness: true,
  updatedAt: true,
} as const;

/** 발행된 전 학교(사이트맵·generateStaticParams). 인덱스: [status, publishedAt] */
export async function publishedSchools(): Promise<SchoolSummary[]> {
  return prisma.schoolSeoPage.findMany({
    where: { status: "PUBLISHED" },
    select: SUMMARY_SELECT,
    orderBy: [{ publishedAt: "desc" }],
  });
}

/**
 * 프리렌더 대상만. 전량 정적 생성은 빌드가 폭증하므로 상위 N 건만 빌드타임에 만들고
 * 나머지는 dynamicParams=true 로 최초 요청 시 생성(ISR)한다.
 * 인덱스: [status, richness]
 */
export async function prerenderSchools(limit = 300): Promise<{ sido: string; slug: string }[]> {
  return prisma.schoolSeoPage.findMany({
    where: { status: "PUBLISHED" },
    select: { sido: true, slug: true },
    orderBy: [{ richness: "asc" }, { publishedAt: "desc" }], // "보통" < "풍부" < "희박" 정렬은 seed 에서 보정
    take: limit,
  });
}

/** 시도별 목록(/schools/[sido]). 인덱스: [sido, status] */
export async function schoolsBySido(sido: string): Promise<SchoolSummary[]> {
  return prisma.schoolSeoPage.findMany({
    where: { sido, status: "PUBLISHED" },
    select: SUMMARY_SELECT,
    orderBy: [{ officialName: "asc" }],
  });
}

/** 허브에서 쓰는 시도별 집계. groupBy 로 학교 목록을 끌어오지 않는다. */
export async function sidoCounts(): Promise<{ sido: string; count: number }[]> {
  const rows = await prisma.schoolSeoPage.groupBy({
    by: ["sido"],
    where: { status: "PUBLISHED" },
    _count: { _all: true },
    orderBy: { _count: { sido: "desc" } },
  });
  return rows.map((r) => ({ sido: r.sido, count: r._count._all }));
}

/**
 * 같은 교과서 출판사를 쓰는 다른 학교 — 내부링크 그래프용.
 * 고아 페이지 방지의 핵심 장치다. 인덱스: [publisher, status]
 */
export async function siblingsByPublisher(
  publisher: string,
  excludeSlug: string,
  limit = 6,
): Promise<SchoolSummary[]> {
  return prisma.schoolSeoPage.findMany({
    where: { publisher, status: "PUBLISHED", NOT: { slug: excludeSlug } },
    select: SUMMARY_SELECT,
    take: limit,
    orderBy: [{ richness: "asc" }],
  });
}

/** 같은 시도의 다른 학교 — 출판사 정보가 없을 때의 폴백 링크. */
export async function siblingsBySido(
  sido: string,
  excludeSlug: string,
  limit = 6,
): Promise<SchoolSummary[]> {
  return prisma.schoolSeoPage.findMany({
    where: { sido, status: "PUBLISHED", NOT: { slug: excludeSlug } },
    select: SUMMARY_SELECT,
    take: limit,
    orderBy: [{ richness: "asc" }],
  });
}

/** 상세 1건. 여기서만 전체 컬럼을 읽는다. 인덱스: @@unique([sido, slug]) */
export async function getSchoolPage(
  sido: string,
  slug: string,
): Promise<SchoolPageEntry | null> {
  const row = await prisma.schoolSeoPage.findUnique({
    where: { sido_slug: { sido, slug } },
  });
  if (!row || row.status !== "PUBLISHED") return null;

  return {
    sido: row.sido,
    slug: row.slug,
    officialName: row.officialName,
    region: row.region,
    schoolType: row.schoolType,
    homepage: row.homepage,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    h1: row.h1,
    publisher: row.publisher,
    keywords: row.keywords,
    intro: (row.intro as string[]) ?? [],
    sections: (row.sections as unknown as SchoolSection[]) ?? [],
    charts: (row.charts as unknown as SchoolChart[]) ?? [],
    comparisonTable: (row.comparisonTable as unknown as SchoolComparisonTable) ?? null,
    timeline: (row.timeline as unknown as SchoolTimelineItem[]) ?? [],
    checklist: (row.checklist as unknown as SchoolChecklistItem[]) ?? [],
    faq: (row.faq as unknown as { question: string; answer: string }[]) ?? [],
    textbooks: row.textbooks,
    related: (row.related as unknown as SchoolRelated[]) ?? [],
    ctaTitle: row.ctaTitle,
    ctaBody: row.ctaBody,
    richness: row.richness,
    citedRatio: row.citedRatio,
    sourcesUsed: row.sourcesUsed,
    updatedAt: row.updatedAt,
  };
}

/** 출판사 슬러그 매핑 — /textbooks 아티클과 상호링크. */
export const PUBLISHER_TO_TEXTBOOK_SLUG: Record<string, string> = {
  능률: "neungyul-english",
  "NE능률": "neungyul-english",
  "엔이능률": "neungyul-english",
  YBM: "ybm-english",
  와이비엠: "ybm-english",
  천재: "chunjae-english",
  천재교육: "chunjae-english",
  비상: "visang-english",
  비상교육: "visang-english",
  동아: "donga-english",
  동아출판: "donga-english",
  지학: "jihak-english",
  지학사: "jihak-english",
  미래엔: "miraen-english",
};

/** 출판사 문자열에서 /textbooks 링크를 찾는다. 표기 흔들림을 흡수한다. */
export function textbookHrefFor(publisher: string | null): string | null {
  if (!publisher) return null;
  for (const [key, slug] of Object.entries(PUBLISHER_TO_TEXTBOOK_SLUG)) {
    if (publisher.includes(key)) return `/textbooks/${slug}`;
  }
  return null;
}
