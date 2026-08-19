/**
 * 함대가 생성한 학교별 경향분석 JSON → SchoolSeoPage 시드.
 *
 * 입력: scratchpad/smoat/schools_v2.json (워크플로 wf_87cd8d7d-9e0 산출)
 * 실행: npx tsx scripts/_seed-school-seo-pages.ts [--publish] [--file <path>]
 *
 *   --publish 없으면 status=DRAFT 로만 넣는다(사이트맵·허브에 안 나온다).
 *   재실행 안전: (sido, slug) upsert 라 몇 번 돌려도 중복이 안 생긴다.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_FILE = path.join(
  "C:/Users/jooye/AppData/Local/Temp/claude/d--Desktop-2026project-nara",
  "a0b5cf51-f112-4d06-ae07-63565295c7b7/scratchpad/smoat/schools_v2.json",
);

/** 지역 문자열 → URL 1단 시·도. NEIS 표기 흔들림까지 흡수한다. */
function sidoOf(region: string): string {
  const r = (region ?? "").trim();
  const table: [RegExp, string][] = [
    [/^서울/, "서울"], [/^부산/, "부산"], [/^대구/, "대구"], [/^인천/, "인천"],
    [/광주/, "광주"], [/^대전/, "대전"], [/^울산/, "울산"], [/^세종/, "세종"],
    [/^경기/, "경기"], [/^강원/, "강원"],
    [/충청북도|^충북/, "충북"], [/충청남도|^충남/, "충남"],
    [/전라북도|^전북/, "전북"], [/전라남도|^전남/, "전남"],
    [/경상북도|^경북/, "경북"], [/경상남도|^경남/, "경남"],
    [/^제주/, "제주"],
  ];
  for (const [re, name] of table) if (re.test(r)) return name;
  return "기타";
}

/** 차트 basis 중 「공시」 근거 비율(0~100). 품질 지표이자 발행 우선순위 정렬 키. */
function citedRatioOf(charts: { basis?: string }[]): number {
  if (!charts?.length) return 0;
  const cited = charts.filter((c) => (c.basis ?? "").includes("공시")).length;
  return Math.round((cited / charts.length) * 100);
}

/**
 * 교재 문자열 배열에서 대표 출판사를 뽑는다.
 * /textbooks 아티클 9종과 조인하는 키이므로 그 표기에 맞춘다.
 */
const PUBLISHERS: [RegExp, string][] = [
  [/능률|NE\s?능률|엔이능률/i, "NE능률"],
  [/YBM|와이비엠/i, "YBM"],
  [/천재/, "천재교육"],
  [/비상/, "비상교육"],
  [/동아/, "동아출판"],
  [/지학/, "지학사"],
  [/미래엔/, "미래엔"],
];
function publisherOf(textbooks: string[]): string | null {
  const blob = (textbooks ?? []).join(" ");
  for (const [re, name] of PUBLISHERS) if (re.test(blob)) return name;
  return null;
}

type Incoming = {
  school: string;
  officialName?: string;
  region?: string;
  schoolType?: string;
  homepage?: string;
  dataRichness?: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro?: string[];
  sections?: unknown[];
  charts?: { basis?: string }[];
  comparisonTable?: unknown;
  timeline?: unknown[];
  checklist?: unknown[];
  faq?: unknown[];
  textbooks?: string[];
  ctaTitle?: string;
  ctaBody?: string;
  relatedKeywords?: string[];
  sourcesUsed?: string[];
  notes?: string[];
};

async function main() {
  const argv = process.argv.slice(2);
  const publish = argv.includes("--publish");
  const fileIdx = argv.indexOf("--file");
  const file = fileIdx >= 0 ? argv[fileIdx + 1] : DEFAULT_FILE;

  if (!fs.existsSync(file)) {
    console.error(`입력 파일 없음: ${file}`);
    process.exitCode = 1;
    return;
  }

  const rows = JSON.parse(fs.readFileSync(file, "utf8")) as Incoming[];
  console.log(`입력 ${rows.length}건 · 상태 ${publish ? "PUBLISHED" : "DRAFT"}\n`);

  let ok = 0;
  const skipped: string[] = [];

  for (const r of rows) {
    if (!r?.school || !r.metaTitle || !r.h1) {
      skipped.push(`${r?.school ?? "(이름없음)"} — 필수 필드 누락`);
      continue;
    }
    const region = r.region ?? "";
    const sido = sidoOf(region);
    const slug = r.school.trim();
    const charts = r.charts ?? [];
    const textbooks = (r.textbooks ?? []).map(String);

    const data = {
      sido,
      slug,
      officialName: r.officialName ?? r.school,
      region,
      schoolType: r.schoolType ?? null,
      homepage: r.homepage ?? null,
      metaTitle: r.metaTitle,
      metaDescription: r.metaDescription ?? "",
      h1: r.h1,
      publisher: publisherOf(textbooks),
      keywords: r.relatedKeywords ?? [],
      intro: (r.intro ?? []) as object,
      sections: (r.sections ?? []) as object,
      charts: charts as object,
      comparisonTable: (r.comparisonTable ?? null) as object | null,
      timeline: (r.timeline ?? []) as object,
      checklist: (r.checklist ?? []) as object,
      faq: (r.faq ?? []) as object,
      textbooks,
      ctaTitle: r.ctaTitle ?? null,
      ctaBody: r.ctaBody ?? null,
      richness: r.dataRichness ?? "보통",
      citedRatio: citedRatioOf(charts),
      status: publish ? "PUBLISHED" : "DRAFT",
      sourcesUsed: (r.sourcesUsed ?? []).map(String).slice(0, 12),
      notes: (r.notes ?? []).map(String),
      sourceRunId: "wf_87cd8d7d-9e0",
      publishedAt: publish ? new Date() : null,
    };

    await prisma.schoolSeoPage.upsert({
      where: { sido_slug: { sido, slug } },
      create: data,
      update: data,
    });

    ok += 1;
    console.log(
      `  ✓ /schools/${sido}/${slug}  ${String(data.richness).padEnd(3)} ` +
        `차트${charts.length} 공시${String(data.citedRatio).padStart(3)}% ` +
        `${data.publisher ?? "출판사미상"}`,
    );
  }

  console.log(`\n적재 ${ok}건 / 건너뜀 ${skipped.length}건`);
  for (const s of skipped) console.log(`  ✗ ${s}`);

  const byStatus = await prisma.schoolSeoPage.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log("\n테이블 현황:");
  for (const b of byStatus) console.log(`  ${b.status}: ${b._count._all}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
