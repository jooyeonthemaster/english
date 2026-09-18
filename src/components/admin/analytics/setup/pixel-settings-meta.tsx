"use client";

// 유입 분석 › 설정 › 픽셀 패널의 상수·표 데이터·공용 조각. 계약 §8.1~§8.4·§14 D13·D14
// 폼은 pixel-settings-panel.tsx, 매핑표·설치 확인은 pixel-settings-guide.tsx 가 쓴다.

import { ExternalLink } from "lucide-react";
import type { PixelIdField } from "@/lib/analytics/pixels-common";
import { cn } from "@/lib/utils";

export const API = "/api/admin/analytics/pixels";
export const QUERY_KEY = ["admin-analytics", "pixels"] as const;

export type Link = { href: string; label: string };
export type FieldMeta = { field: PixelIdField; label: string; desc: string; link?: Link };

export const GROUPS: Array<{ title: string; fields: FieldMeta[]; note?: string }> = [
  {
    title: "Google",
    fields: [
      { field: "ga4Id", label: "GA4 측정 ID", desc: "Google 애널리틱스 › 관리 › 데이터 스트림(웹)의 측정 ID", link: { href: "https://analytics.google.com/", label: "Google 애널리틱스" } },
      { field: "gtmId", label: "GTM 컨테이너 ID", desc: "태그를 Google 태그 관리자 안에서 직접 관리할 때", link: { href: "https://tagmanager.google.com/", label: "태그 관리자" } },
      { field: "googleAdsId", label: "Google Ads 태그 ID", desc: "Google Ads › 목표 › 전환 › 태그 설정의 AW- 로 시작하는 ID", link: { href: "https://ads.google.com/", label: "Google Ads" } },
      { field: "googleAdsSignupLabel", label: "Ads 가입 전환 라벨", desc: "가입 전환 액션 이벤트 스니펫 send_to 의 「/」 뒤 값" },
      { field: "googleAdsPurchaseLabel", label: "Ads 결제 전환 라벨", desc: "구매 전환 액션 이벤트 스니펫 send_to 의 「/」 뒤 값" },
    ],
  },
  {
    title: "Meta (Facebook·Instagram)",
    fields: [{ field: "metaPixelId", label: "Meta 픽셀 ID", desc: "이벤트 관리자 › 데이터 소스의 픽셀(데이터세트) ID", link: { href: "https://business.facebook.com/events_manager2", label: "이벤트 관리자" } }],
  },
  {
    title: "네이버",
    note: "애널리틱스 발급ID 와 광고 공통키는 서로 다른 값입니다. 둘 다 넣으면 방문 로그가 2개 나가는 것이 정상이고, 가입·결제 전환은 광고 공통키로만 집계됩니다.",
    fields: [
      {
        field: "naverAnalyticsId",
        label: "네이버 애널리틱스 발급ID",
        desc: "방문 통계용 — 애널리틱스 › 사이트 및 권한 관리 › 사이트 등록의 발급ID",
        link: { href: "https://analytics.naver.com/", label: "네이버 애널리틱스" },
      },
      {
        field: "naverAdsConversionId",
        label: "네이버 광고 공통키 (전환)",
        desc: "검색광고·GFA 전환용 — 광고 시스템의 공통키(보통 s_ 로 시작). 이 칸이 비면 가입·결제 전환이 네이버로 전달되지 않습니다",
        link: { href: "https://searchad.naver.com/", label: "네이버 검색광고" },
      },
    ],
  },
  {
    title: "카카오",
    fields: [{ field: "kakaoPixelId", label: "카카오 픽셀 Track ID", desc: "카카오비즈니스 › 픽셀 & SDK 의 Track ID", link: { href: "https://business.kakao.com/", label: "카카오비즈니스" } }],
  },
  {
    title: "TikTok",
    fields: [{ field: "tiktokPixelId", label: "TikTok 픽셀 ID", desc: "TikTok 광고 관리자 › 도구 › 이벤트 관리자의 웹 픽셀 ID", link: { href: "https://ads.tiktok.com/", label: "TikTok 광고 관리자" } }],
  },
  {
    title: "Microsoft Clarity",
    note: "마케팅·로그인·가입 화면에서만 녹화합니다 — 원장·강사 화면(학생 이름·성적이 보이는 화면)에서는 로드하지 않습니다.",
    fields: [{ field: "clarityId", label: "Clarity 프로젝트 ID", desc: "세션 녹화·히트맵 — 설정 › 개요의 프로젝트 ID", link: { href: "https://clarity.microsoft.com/", label: "Clarity" } }],
  },
];

/** [픽셀, 페이지 이동, 가입 완료, 결제 완료] */
export const MAPPING: Array<[string, string, string, string]> = [
  ["GA4", "page_view (정화된 page_location)", "sign_up", "purchase (transaction_id·value·KRW)"],
  ["Google Ads", "— (태그 로드)", "conversion (가입 라벨)", "conversion (결제 라벨·value·KRW)"],
  ["GTM dataLayer", "page_view", "sign_up", "purchase (ecommerce)"],
  ["Meta", "PageView", "CompleteRegistration", "Purchase (value·KRW·eventID)"],
  ["네이버 애널리틱스", "wcs_do() (발급ID)", "—", "—"],
  ["네이버 광고", "wcs_do() (공통키·inflow)", "wcs.trans sign_up", "wcs.trans purchase (id·value)"],
  ["카카오", "pageView()", "completeRegistration()", "purchase (total_price·KRW)"],
  ["TikTok", "ttq.page()", "CompleteRegistration", "Purchase (value·KRW·event_id)"],
  ["Clarity", "자동 녹화 (마케팅 화면만)", "—", "—"],
];

export const MAPPING_HEADS = ["픽셀", "페이지 이동", "가입 완료", "결제 완료"] as const;

export const CHECKS: Array<{ name: string; how: string; link?: Link }> = [
  { name: "GA4 · Google Ads · GTM", how: "Tag Assistant 에 사이트 주소를 넣고 태그 발사 확인 · GA4 실시간 보고서", link: { href: "https://tagassistant.google.com/", label: "Tag Assistant" } },
  { name: "Meta", how: "크롬 확장 Meta Pixel Helper · 이벤트 관리자 › 이벤트 테스트", link: { href: "https://business.facebook.com/events_manager2", label: "이벤트 관리자" } },
  { name: "네이버 애널리틱스", how: "발급ID 를 넣었다면 — 네이버 애널리틱스 실시간 방문 현황에서 내 방문 확인", link: { href: "https://analytics.naver.com/", label: "네이버 애널리틱스" } },
  { name: "네이버 광고", how: "공통키를 넣었다면 — 크롬 확장 「네이버 전환 스크립트 어시스턴트」 · 광고 시스템 전환 리포트", link: { href: "https://searchad.naver.com/", label: "네이버 검색광고" } },
  { name: "카카오", how: "크롬 확장 카카오 픽셀 도우미 · 픽셀 & SDK 이벤트 현황", link: { href: "https://business.kakao.com/", label: "카카오비즈니스" } },
  { name: "TikTok", how: "크롬 확장 TikTok Pixel Helper · 이벤트 관리자 테스트 이벤트", link: { href: "https://ads.tiktok.com/", label: "TikTok 광고 관리자" } },
  { name: "Clarity", how: "Clarity 대시보드 › 녹화 목록에 세션이 쌓이는지 확인", link: { href: "https://clarity.microsoft.com/", label: "Clarity" } },
];

/** 코드로는 끌 수 없어 각 매체 관리 화면에서 사람이 해야 하는 일(§14 D11·D13). */
export const OPERATOR_TODOS: Array<{ title: string; body: string; link?: Link }> = [
  {
    title: "GA4 — 「브라우저 기록 기반 페이지 변경」 끄기",
    body: "데이터 스트림 › 향상된 측정 › 페이지 조회 고급 설정. 켜 두면 페이지뷰가 중복되고, 로드 금지 경로(학생·공유 토큰 화면)로 이동한 URL 까지 GA4 로 전송됩니다.",
    link: { href: "https://analytics.google.com/", label: "Google 애널리틱스" },
  },
  {
    title: "Meta — 자동 고급매칭 끄기",
    body: "이벤트 관리자 › 데이터 소스 › 설정 › 자동 고급매칭. 켜 두면 픽셀이 페이지의 폼 입력값(이메일·전화)을 해시해 전송합니다. 코드에서도 끄지만(fbq set autoConfig false) 관리 화면 설정이 우선입니다.",
    link: { href: "https://business.facebook.com/events_manager2", label: "이벤트 관리자" },
  },
  {
    title: "Clarity — 마스킹 Strict 확인",
    body: "Settings › Masking 을 Strict 로 고정하세요. 원장·강사 화면에서는 아예 로드하지 않지만, 마케팅·가입 화면의 입력값도 녹화에 남지 않아야 합니다.",
    link: { href: "https://clarity.microsoft.com/", label: "Clarity" },
  },
  {
    title: "개인정보처리방침 사전 공지",
    body: "방침 개정을 스모트 소식으로 먼저 알리고, 공지한 시행일에 픽셀 ID 를 입력하세요(방침 13항이 「중요한 변경은 시행 전 안내」를 약속합니다).",
  },
];

export function ExtLink({ link, className }: { link: Link; className?: string }) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-blue-600 hover:underline", className)}
    >
      {link.label}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
