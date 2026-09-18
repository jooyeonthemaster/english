// ============================================================================
// 유입 채널·소스·인앱·지역 표시명 — 클라이언트/서버 공용(Prisma import 금지).
// 계약: docs/analytics/analytics-spec.md §4.1
// ============================================================================

export const CHANNELS = [
  "organic_search",
  "paid_search",
  "organic_social",
  "paid_social",
  "video",
  "community",
  "messenger",
  "ai",
  "email",
  "display",
  "referral",
  "direct",
] as const;

export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  organic_search: "검색(자연)",
  paid_search: "검색 광고",
  organic_social: "SNS",
  paid_social: "SNS 광고",
  video: "동영상",
  community: "블로그·카페·커뮤니티",
  messenger: "메신저 공유",
  ai: "AI 검색·어시스턴트",
  email: "이메일",
  display: "디스플레이 광고",
  referral: "외부 사이트",
  direct: "직접 방문",
};

/** 차트 색 — 채널 고정 매핑(보고서 간 같은 채널은 같은 색). */
export const CHANNEL_COLORS: Record<Channel, string> = {
  organic_search: "#2563eb",
  paid_search: "#1e40af",
  organic_social: "#db2777",
  paid_social: "#9d174d",
  video: "#dc2626",
  community: "#16a34a",
  messenger: "#ca8a04",
  ai: "#7c3aed",
  email: "#0891b2",
  display: "#ea580c",
  referral: "#64748b",
  direct: "#94a3b8",
};

export function isChannel(v: unknown): v is Channel {
  return typeof v === "string" && (CHANNELS as readonly string[]).includes(v);
}

export function channelLabel(v: string | null | undefined): string {
  if (!v) return "미상";
  return isChannel(v) ? CHANNEL_LABELS[v] : v;
}

/** 소스 코드 → 한국어 표시명. 없으면 원문(도메인·utm_source)을 그대로. */
export const SOURCE_LABELS: Record<string, string> = {
  google: "구글",
  naver: "네이버",
  daum: "다음",
  bing: "빙",
  yahoo: "야후",
  zum: "줌",
  duckduckgo: "덕덕고",
  ecosia: "에코시아",
  baidu: "바이두",
  yandex: "얀덱스",
  brave: "브레이브 검색",
  startpage: "스타트페이지",
  naver_blog: "네이버 블로그",
  naver_cafe: "네이버 카페",
  naver_post: "네이버 포스트",
  daum_cafe: "다음 카페",
  tistory: "티스토리",
  brunch: "브런치",
  velog: "벨로그",
  band: "밴드",
  everytime: "에브리타임",
  dcinside: "디시인사이드",
  clien: "클리앙",
  ppomppu: "뽐뿌",
  reddit: "레딧",
  medium: "미디엄",
  instagram: "인스타그램",
  facebook: "페이스북",
  threads: "스레드",
  x: "X(트위터)",
  tiktok: "틱톡",
  linkedin: "링크드인",
  pinterest: "핀터레스트",
  kakaostory: "카카오스토리",
  youtube: "유튜브",
  naver_tv: "네이버TV·치지직",
  vimeo: "비메오",
  kakaotalk: "카카오톡",
  kakao_channel: "카카오톡 채널",
  kakao_openchat: "카카오 오픈채팅",
  line: "라인",
  telegram: "텔레그램",
  discord: "디스코드",
  slack: "슬랙",
  chatgpt: "ChatGPT",
  perplexity: "퍼플렉시티",
  gemini: "제미나이",
  claude: "Claude",
  copilot: "코파일럿",
  wrtn: "뤼튼",
  deepseek: "딥시크",
  grok: "그록",
  you: "You.com",
  phind: "Phind",
  meta_ai: "Meta AI",
  poe: "Poe",
  liner: "라이너",
  naver_cue: "네이버 Cue:",
  naver_mail: "네이버 메일",
  gmail: "Gmail",
  daum_mail: "다음 메일",
  outlook: "아웃룩",
  naver_app: "네이버앱(referrer 없음)",
  daum_app: "다음앱(referrer 없음)",
  "(direct)": "직접 입력·북마크",
};

export function sourceLabel(v: string | null | undefined): string {
  if (!v) return "(없음)";
  return SOURCE_LABELS[v] ?? v;
}

export const IN_APP_LABELS: Record<string, string> = {
  kakaotalk: "카카오톡",
  naver: "네이버앱",
  instagram: "인스타그램",
  facebook: "페이스북",
  threads: "스레드",
  line: "라인",
  band: "밴드",
  daum: "다음앱",
  everytime: "에브리타임",
  tiktok: "틱톡",
  snapchat: "스냅챗",
  wechat: "위챗",
};

export function inAppLabel(v: string | null | undefined): string {
  if (!v) return "일반 브라우저";
  return IN_APP_LABELS[v] ?? v;
}

/**
 * 수집기는 인앱 브라우저를 `인앱:<앱>` 으로 저장한다 → 「인앱 · 카카오톡」.
 * 표(audience/tech-sections)와 필터 칩(shared/filter-labels)이 같은 자구를 쓰도록 여기에 둔다.
 */
export function browserLabel(v: string | null | undefined): string {
  if (!v) return "미상";
  return v.startsWith("인앱:") ? `인앱 · ${inAppLabel(v.slice(3))}` : v;
}

/** ISO 3166-2:KR 하위코드 → 시·도. 강원(42→51)·전북(45→52) 개편 코드 모두 수용. */
export const KR_REGION_LABELS: Record<string, string> = {
  "11": "서울",
  "26": "부산",
  "27": "대구",
  "28": "인천",
  "29": "광주",
  "30": "대전",
  "31": "울산",
  "50": "세종",
  "41": "경기",
  "42": "강원",
  "51": "강원",
  "43": "충북",
  "44": "충남",
  "45": "전북",
  "52": "전북",
  "46": "전남",
  "47": "경북",
  "48": "경남",
  "49": "제주",
};

export const COUNTRY_LABELS: Record<string, string> = {
  KR: "대한민국",
  US: "미국",
  JP: "일본",
  CN: "중국",
  VN: "베트남",
  CA: "캐나다",
  AU: "호주",
  SG: "싱가포르",
  GB: "영국",
  DE: "독일",
  PH: "필리핀",
  TW: "대만",
  HK: "홍콩",
  NZ: "뉴질랜드",
};

export function regionLabel(country: string | null | undefined, region: string | null | undefined): string {
  if (!region) return "미상";
  if (country === "KR") return KR_REGION_LABELS[region] ?? `KR-${region}`;
  return country ? `${country}-${region}` : region;
}

export function countryLabel(v: string | null | undefined): string {
  if (!v) return "미상";
  return COUNTRY_LABELS[v] ?? v;
}

export const DEVICE_LABELS: Record<string, string> = {
  mobile: "모바일",
  tablet: "태블릿",
  desktop: "데스크톱",
};

export function deviceLabel(v: string | null | undefined): string {
  if (!v) return "미상";
  return DEVICE_LABELS[v] ?? v;
}

export const AREA_LABELS: Record<string, string> = {
  marketing: "공개 페이지",
  auth: "로그인·가입",
  director: "원장 앱",
  teacher: "강사 앱",
  student: "학생 앱",
  parent: "학부모 앱",
  tutor: "과외 학생 앱",
  drill: "단어 훈련 앱",
};

export function areaLabel(v: string | null | undefined): string {
  if (!v) return "미상";
  return AREA_LABELS[v] ?? v;
}
