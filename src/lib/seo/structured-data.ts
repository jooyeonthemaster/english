/**
 * JSON-LD 구조화데이터 빌더 모음.
 *
 * 모든 빌더는 평범한 객체를 반환하며, <JsonLd data={...}/> 로 주입한다.
 * 가짜 데이터 금지 원칙: aggregateRating/review 는 실제 검증 가능한 사용자
 * 평가가 쌓이기 전까지 절대 넣지 않는다(구글 수동조치 → 전 사이트 리치스니펫 제거 리스크).
 */

import { SITE, absoluteUrl } from "@/lib/seo/config";
import { BUSINESS_INFO } from "@/lib/legal/business-info";

const ORG_ID = `${SITE.url}/#organization`;
const WEBSITE_ID = `${SITE.url}/#website`;

/** "02-336-3368" → "+82-2-336-3368" (E.164 근사). 미상이면 undefined. */
function toIntlPhone(local: string | undefined): string | undefined {
  if (!local) return undefined;
  const digits = local.replace(/[^\d]/g, "");
  if (!digits || digits.length < 8) return undefined;
  return `+82-${digits.replace(/^0/, "")}`;
}

function postalAddress() {
  const full = BUSINESS_INFO.address;
  if (!full || full.includes("입력 필요")) return undefined;
  return {
    "@type": "PostalAddress",
    addressCountry: "KR",
    addressRegion: "서울",
    streetAddress: full,
  };
}

/**
 * Organization — 회사/브랜드 엔터티. 지식패널·브랜드 신뢰 신호.
 * 로고는 최소 112x112, 순백 배경에서 정상으로 보이는 크롤가능 이미지여야 함.
 */
export function organizationSchema() {
  const phone = toIntlPhone(BUSINESS_INFO.phone);
  const email =
    BUSINESS_INFO.email && !BUSINESS_INFO.email.includes("입력 필요")
      ? BUSINESS_INFO.email
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.name,
    legalName: BUSINESS_INFO.companyName,
    alternateName: SITE.nameKo,
    url: SITE.url,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/smoat-logo.png"),
      width: 500,
      height: 500,
    },
    image: absoluteUrl(SITE.ogImage.path),
    description: SITE.defaultDescription,
    ...(SITE.sameAs.length ? { sameAs: SITE.sameAs } : {}),
    ...(postalAddress() ? { address: postalAddress() } : {}),
    ...(phone || email
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer support",
            ...(phone ? { telephone: phone } : {}),
            ...(email ? { email } : {}),
            areaServed: "KR",
            availableLanguage: ["Korean"],
          },
        }
      : {}),
  } as const;
}

/**
 * WebSite — 사이트 엔터티 + 내부검색 액션(SearchAction).
 * 사이트링크 검색박스 리치결과는 2024-11 폐기됐으나, 사이트명/AI 에이전트 신호로 유지.
 */
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE.url,
    name: SITE.name,
    alternateName: SITE.nameKo,
    inLanguage: "ko-KR",
    publisher: { "@id": ORG_ID },
  } as const;
}

/**
 * SoftwareApplication — 영어학원 AI 올인원 제품 엔터티.
 * aggregateRating 은 의도적으로 제외(실 사용자 평가 인프라 확보 후 추가).
 */
export function softwareApplicationSchema(opts?: {
  name?: string;
  description?: string;
  url?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: opts?.name ?? SITE.name,
    alternateName: SITE.nameKo,
    applicationCategory: "EducationalApplication",
    applicationSubCategory: "영어학원 AI ERP·문제 생성",
    operatingSystem: "Web",
    url: opts?.url ?? SITE.url,
    image: absoluteUrl(SITE.ogImage.path),
    inLanguage: "ko-KR",
    description: opts?.description ?? SITE.defaultDescription,
    publisher: { "@id": ORG_ID },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "KRW",
      description: "무료 체험 후 크레딧/구독 이용",
      url: absoluteUrl("/credits/products"),
    },
    featureList: [
      "지문 텍스트 기반 AI 심층 분석(직독직해·구문·어휘)",
      "내신·수능 19유형 영어 문제 자동 생성",
      "Word(.docx) 시험지·정답지·해설지 자동 조판",
      "추출 자료·문항·시험지 클라우드 관리",
      "학생·강사·학부모 앱과 학원 운영 통합",
    ],
  } as const;
}

export type BreadcrumbItem = { name: string; url: string };

/** BreadcrumbList — 최소 2단계. 마지막 항목의 item(URL)도 채워 일관성 유지. */
export function breadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url.startsWith("http") ? it.url : absoluteUrl(it.url),
    })),
  } as const;
}

/**
 * Product + Offer — 크레딧/구독 상품. 디지털재라 itemCondition 생략(권장이지 필수 아님).
 * 할인은 레거시 ListPrice 대신 별도 표기 없이 현재가만 노출(과대표기 회피).
 */
export function productSchema(opts: {
  name: string;
  description?: string;
  price: number | string;
  priceCurrency?: string;
  url?: string;
  availability?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    brand: { "@type": "Brand", name: SITE.name },
    offers: {
      "@type": "Offer",
      price: String(opts.price),
      priceCurrency: opts.priceCurrency ?? "KRW",
      availability: opts.availability ?? "https://schema.org/InStock",
      url: opts.url ?? absoluteUrl("/credits/products"),
    },
  } as const;
}

export type FaqItem = { question: string; answer: string };

/**
 * FAQPage — 리치결과는 2026-05 폐기됐으나 페이지 이해·AI 검색(LLM) 신호로 유지 가능.
 * 우선순위 낮음(필요 페이지에만).
 */
export function faqSchema(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  } as const;
}
