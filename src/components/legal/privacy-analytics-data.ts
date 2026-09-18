// ============================================================================
// 개인정보처리방침 10·11항 고지 데이터 — 외부 분석·광고 도구, 브라우저 차단 안내.
// 표시는 privacy-analytics-notice.tsx 가 맡는다(이 파일은 값만 가진다).
//
// 기재 항목은 개인정보 처리방침 작성지침 15항(제3자 자동 수집 장치) 권장 6항목을 따른다:
//   ① 장치 명칭 ② 종류 ③ 수집해가는 사업자 ④ 수집해가는 행태정보 ⑤ 목적
//   ⑥ 거부 방법(웹브라우저·모바일 기기) — docs/analytics/research-2609.md §7.3
// 국외 이전 고지(개인정보 보호법 §28의8)를 위해 ⑦ 이전받는 자의 연락처와
// ⑧ 보유·이용 기간을 함께 싣는다.
//
// 사실 근거(26-09-18 원문 확인):
//   - GA4 이벤트 데이터 보존 선택지 2개월·14개월 (support.google.com/analytics/answer/7667196)
//   - GA4 쿠키 _ga·_ga_<id> 2년 (support.google.com/analytics/answer/11397207)
//   - Meta 비즈니스 도구 약관 「이벤트 데이터를 최대 2년간 보유」 (facebook.com/legal/terms/businesstools)
//   - Clarity 레코딩 30일(즐겨찾기·표본 최대 9개월)·히트맵 9개월, 기본 마스킹 모드 Balanced
//     (learn.microsoft.com/clarity/faq, /setup-and-installation/clarity-masking)
//   - TikTok 한국 방침의 처리자 TikTok Pte. Ltd.(싱가포르)·국내대리인 바이트댄스 유한책임회사,
//     한국 보충 약관의 법정 보유 기간(방문 기록 3개월·광고 표시 기록 6개월)
//     (tiktok.com/legal/page/kr/privacy-policy/ko)
//   - Google 한국어 방침의 문의 이메일 googlekrsupport@google.com (policies.google.com/privacy?hl=ko)
//   - 로드 범위: docs/analytics/analytics-spec.md §8.4 + §14 D13(Clarity 는 원장·강사 화면 제외)
// ============================================================================

export interface ExternalLinkItem {
  label: string;
  href: string;
}

export interface AnalyticsTool {
  /** ① 자동 수집 장치 명칭 */
  name: string;
  /** ② 종류(스크립트·쿠키 이름) */
  kind: string;
  /** ③ 수집해가는 사업자 */
  operator: string;
  country: string;
  /** ④ 수집해가는 행태정보 */
  collects: string;
  /** ⑤ 이용 목적 */
  purpose: string;
  /** ⑧ 보유·이용 기간 */
  retention: string;
  /** ⑦ 이전받는 자 연락처(공식 문의 창구) */
  contact: ExternalLinkItem;
  /** 국내대리인 등 보조 연락처 */
  contactNote?: string;
  /** 기본 로드 범위와 다른 도구만 표시 */
  scope?: string;
  /** 수집 정보에 대한 주석(마스킹 수준 등) */
  note?: string;
  /** ⑥ 거부 방법(웹) */
  links: ExternalLinkItem[];
  /** 거부 링크 이용 시 주의 */
  linksNote?: string;
}

/** 모든 카드에 함께 싣는 모바일 기기 차단 방법(작성지침 15항 ⑥). */
export const MOBILE_OPT_OUT_TEXT =
  "모바일 기기: iOS는 설정 > 개인정보 보호 및 보안 > 추적에서 「앱이 추적을 요청하도록 허용」 끄기, Android는 설정 > 개인 정보 보호 > 광고에서 광고 ID 삭제 또는 재설정";

/** 관리자 설정으로 켤 수 있는 외부 도구 전체(analytics-spec §8.1). */
export const ANALYTICS_TOOLS: AnalyticsTool[] = [
  {
    name: "Google 애널리틱스(GA4)",
    kind: "웹페이지에 삽입되는 자바스크립트와 쿠키(_ga, _ga_<측정ID> 등, 유효기간 2년)",
    operator: "Google LLC",
    country: "미국",
    collects:
      "방문 페이지 주소(허용된 유입 파라미터만 포함)·제목, 기기·브라우저 정보, Google 쿠키 식별자, 가입·결제 완료 이벤트(결제 금액·결제 건 번호)",
    purpose: "이용 통계, 유입 경로 분석",
    retention:
      "회사는 Google 애널리틱스의 이벤트·사용자 데이터 보존 기간을 선택 가능한 최대치인 14개월로 설정하며, 그 이후 개별 기록은 삭제되고 집계 통계만 남습니다. 쿠키는 마지막 방문일로부터 2년이 지나면 만료됩니다.",
    contact: {
      label: "googlekrsupport@google.com",
      href: "mailto:googlekrsupport@google.com",
    },
    contactNote: "Google 개인정보 문의 양식: support.google.com/policies/contact/general_privacy_form",
    links: [
      { label: "Google 애널리틱스 차단 부가기능", href: "https://tools.google.com/dlpage/gaoptout?hl=ko" },
      {
        label: "Google의 파트너 사이트 정보 사용 방식",
        href: "https://policies.google.com/technologies/partner-sites?hl=ko",
      },
    ],
  },
  {
    name: "Google 태그 관리자",
    kind: "웹페이지에 삽입되는 자바스크립트(태그 관리자 자체는 쿠키를 저장하지 않고, 아래 도구의 스크립트를 대신 실행합니다)",
    operator: "Google LLC",
    country: "미국",
    collects: "분석·광고 도구 실행을 위한 페이지 방문 및 가입·결제 완료 이벤트",
    purpose: "분석·광고 태그 관리",
    retention:
      "태그 관리자가 실행한 각 도구의 보유 기간을 따릅니다(실행 대상은 이 목록의 도구로 한정합니다).",
    contact: {
      label: "googlekrsupport@google.com",
      href: "mailto:googlekrsupport@google.com",
    },
    links: [
      { label: "Google 내 광고 센터", href: "https://myadcenter.google.com/" },
      { label: "Google 개인정보처리방침", href: "https://policies.google.com/privacy?hl=ko" },
    ],
    linksNote: "내 광고 센터는 Google 계정 로그인 후 이동합니다.",
  },
  {
    name: "Google Ads 전환 추적",
    kind: "웹페이지에 삽입되는 자바스크립트와 광고 전환 쿠키(_gcl_au 등)",
    operator: "Google LLC",
    country: "미국",
    collects: "광고 클릭 식별값, 가입·결제 완료 이벤트(결제 금액), Google 쿠키 식별자",
    purpose: "광고 성과 측정, 맞춤형 광고",
    retention:
      "광고 전환 쿠키는 저장일로부터 최대 90일간 유지되며, 전환 기록은 Google 광고 계정의 데이터 보존 정책에 따라 보관됩니다.",
    contact: {
      label: "googlekrsupport@google.com",
      href: "mailto:googlekrsupport@google.com",
    },
    links: [{ label: "Google 내 광고 센터", href: "https://myadcenter.google.com/" }],
    linksNote: "Google 계정 로그인 후 이동합니다.",
  },
  {
    name: "Meta 픽셀",
    kind: "웹페이지에 삽입되는 자바스크립트와 쿠키(_fbp, _fbc 등)",
    operator: "Meta Platforms, Inc.",
    country: "미국",
    collects: "방문 페이지 주소, 가입·결제 완료 이벤트(결제 금액), 기기·브라우저 정보, Meta 쿠키 식별자",
    purpose: "광고 성과 측정, 맞춤형 광고(Facebook·Instagram)",
    retention:
      "Meta 비즈니스 도구 약관에 따라 이벤트 데이터를 최대 2년간 보유합니다(회사가 만든 광고 타겟은 회사가 삭제할 때까지).",
    contact: { label: "Meta 개인정보 문의 센터", href: "https://help.meta.com/support/privacy" },
    note: "회사는 이메일·전화번호를 해시로 전송하는 자동 고급 매칭을 사용하지 않습니다.",
    links: [{ label: "Meta 광고 기본 설정", href: "https://accountscenter.facebook.com/ad_preferences" }],
    linksNote: "Facebook·Instagram 계정 로그인 후 이동합니다.",
  },
  {
    name: "네이버 애널리틱스·검색광고 전환 추적",
    kind: "웹페이지에 삽입되는 자바스크립트(wcslog·wcs.trans)와 네이버 쿠키",
    operator: "네이버 주식회사",
    country: "대한민국",
    collects: "방문 페이지 주소, 유입 경로, 가입·결제 완료 이벤트(결제 금액), 기기·브라우저 정보",
    purpose: "이용 통계, 검색광고 성과 측정",
    retention: "네이버 주식회사의 개인정보 처리방침에 따릅니다(국내 사업자로 본 항의 국외 이전 대상이 아닙니다).",
    contact: { label: "네이버 개인정보보호", href: "https://privacy.naver.com/" },
    links: [{ label: "네이버 맞춤형 광고 안내", href: "https://gam.naver.com/optout/main" }],
  },
  {
    name: "카카오 픽셀",
    kind: "웹페이지에 삽입되는 자바스크립트와 카카오 광고 쿠키",
    operator: "주식회사 카카오",
    country: "대한민국",
    collects: "방문 페이지, 가입·결제 완료 이벤트(결제 금액), 기기·브라우저 정보, 광고 쿠키 식별자",
    purpose: "광고 성과 측정, 맞춤형 광고",
    retention: "주식회사 카카오의 개인정보 처리방침에 따릅니다(국내 사업자로 본 항의 국외 이전 대상이 아닙니다).",
    contact: { label: "카카오 개인정보처리방침", href: "https://www.kakao.com/policy/privacy?lang=ko" },
    links: [{ label: "Kakao 맞춤형 광고 안내", href: "https://info.ds.kakao.com/optout.do" }],
  },
  {
    name: "TikTok 픽셀",
    kind: "웹페이지에 삽입되는 자바스크립트와 TikTok 쿠키",
    operator: "TikTok Pte. Ltd.",
    country: "싱가포르",
    collects: "방문 페이지, 가입·결제 완료 이벤트(결제 금액), 기기·브라우저 정보, 쿠키 식별자",
    purpose: "광고 성과 측정, 맞춤형 광고",
    retention:
      "TikTok 한국 개인정보 처리방침 기준으로 서비스 제공에 필요한 기간 동안 보유하며, 같은 방침의 한국 보충 약관은 법정 보유 기간으로 웹사이트 방문 기록 3개월, 광고·표시 기록 6개월을 명시하고 있습니다.",
    contact: { label: "TikTok 개인정보 문의", href: "https://www.tiktok.com/legal/report/privacy" },
    contactNote:
      "국내대리인(개인정보 보호법): 바이트댄스 유한책임회사 · 서울특별시 강남구 학동로 343 더피나클강남 3층 · 02-909-8817 · privacykr@tiktok.com",
    links: [
      { label: "TikTok 한국 개인정보처리방침", href: "https://www.tiktok.com/legal/page/kr/privacy-policy/ko" },
    ],
    linksNote: "앱에서는 프로필 > 설정 및 개인정보 > 광고에서 「광고 개인 맞춤설정」을 끌 수 있습니다.",
  },
  {
    name: "Microsoft Clarity",
    kind: "웹페이지에 삽입되는 자바스크립트와 쿠키(_clck, _clsk, MUID 등)",
    operator: "Microsoft Corporation",
    country: "미국",
    collects:
      "화면에 표시된 내용의 재생 기록(세션 리플레이 — 페이지가 그려진 모습과 클릭·스크롤·마우스 이동), 히트맵 집계, 기기·브라우저 정보, Clarity 쿠키 식별자",
    purpose: "화면 사용성 분석·개선",
    retention:
      "Microsoft 안내 기준으로 재생 기록은 30일(즐겨찾기·표본 추출된 일부는 최대 9개월), 히트맵 등 집계 데이터는 최대 9개월 보관됩니다.",
    contact: { label: "Microsoft 개인정보 문의", href: "https://www.microsoft.com/ko-kr/concern/privacy" },
    scope:
      "서비스 소개·요금 안내 등 공개 화면과 회원가입·로그인 화면에서만 사용하며, 학생 정보가 표시되는 원장·강사용 화면에서는 사용하지 않습니다.",
    note: "입력창과 선택 메뉴에 입력된 값은 모든 마스킹 모드에서 가려지며, 그 밖의 화면 텍스트는 마스킹 설정 수준에 따라 가려집니다(기본 설정은 숫자·이메일을 가리는 Balanced 모드).",
    links: [
      {
        label: "Clarity 쿠키 안내",
        href: "https://learn.microsoft.com/ko-kr/clarity/setup-and-installation/clarity-cookies",
      },
      { label: "Microsoft 개인정보처리방침", href: "https://www.microsoft.com/ko-kr/privacy/privacystatement" },
    ],
  },
];

export interface BrowserGuide {
  browser: string;
  path: string;
  help: ExternalLinkItem;
}

/** 브라우저별 쿠키 설정 경로 — 각 공식 도움말 문구(26-09-17 확인) 기준. */
export const BROWSER_GUIDES: BrowserGuide[] = [
  {
    browser: "Chrome (PC)",
    path: "오른쪽 상단 더보기 > 설정 > 개인 정보 보호 및 보안 > 서드 파티 쿠키 (저장된 사이트 데이터 삭제는 같은 화면의 「모든 사이트 데이터 및 권한 보기」)",
    help: { label: "Chrome 고객센터", href: "https://support.google.com/chrome/answer/95647?hl=ko" },
  },
  {
    browser: "Chrome (Android)",
    path: "오른쪽 상단 더보기 > 설정 > 사이트 설정 > 서드 파티 쿠키 (현재 사이트 데이터 삭제는 주소창 왼쪽 페이지 정보 > 쿠키 및 사이트 데이터)",
    help: {
      label: "Chrome 고객센터",
      href: "https://support.google.com/chrome/answer/95647?hl=ko&co=GENIE.Platform%3DAndroid",
    },
  },
  {
    browser: "Microsoft Edge",
    path: "설정 > 개인 정보, 검색 및 서비스 > 쿠키 — 「타사 쿠키 차단」을 켜거나, 「사이트에서 쿠키 데이터를 저장하고 읽을 수 있도록 허용(권장)」을 끄면 모든 쿠키가 차단됩니다.",
    help: {
      label: "Microsoft 지원",
      href: "https://support.microsoft.com/ko-kr/edge/manage-cookies-in-microsoft-edge-view-allow-block-delete-and-use",
    },
  },
  {
    browser: "Safari (iPhone)",
    path: "설정 > 앱 > Safari > 고급 > 「모든 쿠키 차단」",
    help: { label: "Apple 지원", href: "https://support.apple.com/ko-kr/105082" },
  },
  {
    browser: "Safari (Mac)",
    path: "Safari > 설정 > 개인정보 보호에서 쿠키 및 웹사이트 데이터를 관리·삭제",
    help: { label: "Apple 지원", href: "https://support.apple.com/ko-kr/guide/safari/sfri11471/mac" },
  },
];
