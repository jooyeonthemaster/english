import type { Metadata } from "next";
import { MarketingHeader } from "@/components/seo/marketing-header";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/page-metadata";
import { breadcrumbSchema } from "@/lib/seo/structured-data";
import { GUIDES, guidePath } from "@/lib/seo/guides-content";
import { articlesByCategory, articlePath } from "@/lib/seo/articles-content";
import {
  HubCardGrid,
  HubCrossLinks,
  HubCtaBand,
  HubHero,
  type HubCard,
  type HubHeroMetaItem,
} from "@/components/seo/hub-index-shell";

/**
 * 가이드 허브 인덱스(서버 컴포넌트) — 잉크 에디토리얼.
 * 랜딩형 가이드(초기 8종) + 아티클형 가이드를 하나의 카드 목록으로 합친다.
 * 히어로·피처드 그리드·교차 허브·CTA 밴드는 hub-index-shell 블록을 그대로 공유한다.
 */

const GUIDE_ARTICLES = articlesByCategory("guides");

const GUIDE_CARDS: HubCard[] = [
  ...GUIDES.map((g) => ({
    href: guidePath(g.slug),
    eyebrow: g.content.eyebrow,
    title: g.content.h1,
    description: g.metaDescription,
  })),
  ...GUIDE_ARTICLES.map((a) => ({
    href: articlePath(a),
    eyebrow: a.eyebrow,
    title: a.h1,
    description: a.metaDescription,
  })),
];

export const metadata: Metadata = buildMetadata({
  title: "영어 문제·시험지 제작 가이드",
  description:
    "EBS 변형문제, 내신 서술형, 빈칸추론, Word 시험지 제작까지 — 영어 문제와 시험지를 AI로 만드는 실전 가이드 모음입니다. 영어학원 AI 올인원 스모트(SMOAT).",
  path: "/guides",
  keywords: [
    "영어 문제 만들기",
    "영어 변형문제 제작",
    "영어 시험지 제작",
    "영어 문제 제작 가이드",
    "스모트 가이드",
  ],
});

export default function GuidesIndexPage() {
  const latestUpdatedAt = GUIDE_ARTICLES.reduce(
    (max, a) => (a.updatedAt > max ? a.updatedAt : max),
    "",
  );

  const metaItems: HubHeroMetaItem[] = [
    { label: "가이드", value: `${GUIDE_CARDS.length}편` },
    ...(latestUpdatedAt
      ? [
          {
            label: "최근 업데이트",
            value: latestUpdatedAt.replaceAll("-", "."),
          },
        ]
      : []),
    { label: "전체", value: "무료 열람" },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <MarketingHeader />
      <JsonLd
        id="ld-guides-index"
        data={breadcrumbSchema([
          { name: "스모트 SMOAT", url: "/" },
          { name: "가이드", url: "/guides" },
        ])}
      />
      <main className="pt-20">
        <HubHero
          crumbLabel="가이드"
          kicker="제작 가이드"
          headline="영어 문제·시험지 제작 가이드"
          lede="EBS 변형문제부터 내신 서술형, 빈칸추론, Word 시험지 제작까지 — 영어 문제와 시험지를 AI로 만드는 방법을 실전 중심으로 정리했습니다. 모든 과정은 영어학원 AI 올인원 스모트(SMOAT)로 바로 실행할 수 있습니다."
          metaItems={metaItems}
        />
        <HubCardGrid
          cards={GUIDE_CARDS}
          featuredBadge="대표 가이드"
          emptyText="가이드를 준비 중입니다."
        />
        <HubCrossLinks exclude="guides" />
        <HubCtaBand
          title="가이드에서 읽은 그대로, 오늘 바로 만들어집니다"
          body="지문만 붙여넣으면 스모트 AI가 가이드의 제작 워크플로 그대로 변형문제·서술형·Word 시험지를 완성합니다. 지금 무료로 시작해 보시기 바랍니다."
        />
      </main>
    </div>
  );
}
