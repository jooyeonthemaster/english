-- 학교별 SEO 페이지(공개 롱테일 유입용) 테이블 신설.
--
-- 안전성:
--   · 신규 테이블 1개만 생성한다. 기존 테이블·컬럼·인덱스를 일절 변경하지 않는다.
--   · 외래키가 없어 기존 데이터와 물리적으로 분리된다.
--   · 특히 `schools`(academyId 스코프 고객 데이터)와는 무관하다 — 공개 페이지가
--     고객 테넌트 데이터를 참조하지 않도록 의도적으로 격리했다.

-- CreateTable
CREATE TABLE "school_seo_pages" (
    "id" TEXT NOT NULL,
    "sido" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "officialName" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "schoolType" TEXT,
    "homepage" TEXT,
    "neisCode" TEXT,
    "metaTitle" TEXT NOT NULL,
    "metaDescription" TEXT NOT NULL,
    "h1" TEXT NOT NULL,
    "publisher" TEXT,
    "keywords" TEXT[],
    "intro" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "charts" JSONB NOT NULL,
    "comparisonTable" JSONB,
    "timeline" JSONB NOT NULL,
    "checklist" JSONB NOT NULL,
    "faq" JSONB NOT NULL,
    "textbooks" TEXT[],
    "related" JSONB,
    "ctaTitle" TEXT,
    "ctaBody" TEXT,
    "richness" TEXT NOT NULL DEFAULT '보통',
    "citedRatio" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourcesUsed" TEXT[],
    "notes" TEXT[],
    "sourceRunId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_seo_pages_pkey" PRIMARY KEY ("id")
);

-- URL 유일성. 동명이교는 sido 로 갈린다(광문고 서울·경기, 세화고 서울·경북·제주).
-- CreateIndex
CREATE UNIQUE INDEX "school_seo_pages_sido_slug_key" ON "school_seo_pages"("sido", "slug");

-- NEIS 표준학교코드 중복 적재 방지.
-- CreateIndex
CREATE UNIQUE INDEX "school_seo_pages_neisCode_key" ON "school_seo_pages"("neisCode");

-- sitemap·허브 목록: 발행분 최신순.
-- CreateIndex
CREATE INDEX "school_seo_pages_status_publishedAt_idx" ON "school_seo_pages"("status", "publishedAt");

-- 시도 인덱스 페이지(/schools/[sido]).
-- CreateIndex
CREATE INDEX "school_seo_pages_sido_status_idx" ON "school_seo_pages"("sido", "status");

-- /textbooks 상호링크: 같은 출판사 학교 모으기(고아 페이지 방지).
-- CreateIndex
CREATE INDEX "school_seo_pages_publisher_status_idx" ON "school_seo_pages"("publisher", "status");

-- 발행 우선순위 큐: 자료 풍부한 것부터 프리렌더.
-- CreateIndex
CREATE INDEX "school_seo_pages_status_richness_idx" ON "school_seo_pages"("status", "richness");
