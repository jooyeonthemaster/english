import type { Metadata } from "next";
import { SITE } from "@/lib/seo/config";

/**
 * 공개 페이지 메타데이터 빌더(DRY).
 * title 은 bare 로 전달 — 루트 layout 의 title.template("%s | SMOAT")이 접미사를 붙인다.
 * canonical/openGraph/twitter 를 일관되게 채운다.
 */
export function buildMetadata(opts: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
}): Metadata {
  const ogTitle = `${opts.title} | SMOAT`;
  return {
    title: opts.title,
    description: opts.description,
    ...(opts.keywords && opts.keywords.length
      ? { keywords: opts.keywords }
      : {}),
    alternates: { canonical: opts.path },
    openGraph: {
      type: "website",
      locale: SITE.locale,
      siteName: "SMOAT",
      title: ogTitle,
      description: opts.description,
      url: opts.path,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: opts.description,
    },
  };
}
