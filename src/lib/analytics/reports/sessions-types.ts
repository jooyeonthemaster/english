// ============================================================================
// 방문 여정 리포트의 응답 타입 — 서버(reports/sessions.ts)와 화면이 함께 쓴다.
// server-only 모듈을 쪼갠 것이라 런타임 코드가 없다(타입 전용).
// ============================================================================

export interface SessionListRow {
  id: string;
  visitorId: string;
  startedAt: string;
  lastSeenAt: string;
  engagedMs: number;
  pageviews: number;
  eventsCount: number;
  entryPath: string;
  exitPath: string | null;
  channel: string;
  source: string | null;
  campaign: string | null;
  referrerHost: string | null;
  deviceType: string | null;
  os: string | null;
  browser: string | null;
  inApp: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  isNewVisitor: boolean;
  hasConversion: boolean;
  /** 세션 academyId, 없으면 방문자 academyId */
  academyId: string | null;
  academyName: string | null;
}

export interface SessionListReport {
  total: number;
  page: number;
  pageSize: number;
  rows: SessionListRow[];
}

export interface SessionListParams {
  page: number;
  pageSize: number;
  academyId: string | null;
  /**
   * academyId 를 받았지만 형식·길이가 학원 id 가 아님.
   * 조용히 무필터(전체 목록)로 떨어뜨리면 「학원 방문 기록」 배너 아래에 남의 세션이 깔리므로 빈 결과를 돌려준다.
   */
  academyInvalid: boolean;
  /** academyId 가 있을 때만 의미 — 기간 무시 */
  allTime: boolean;
  /** 학원명 부분검색 */
  search: string | null;
}

export interface SessionDetail {
  id: string;
  visitorId: string;
  startedAt: string;
  lastSeenAt: string;
  engagedMs: number;
  pageviews: number;
  eventsCount: number;
  isNewVisitor: boolean;
  entryPath: string;
  entryTitle: string | null;
  exitPath: string | null;
  hostname: string | null;
  referrer: string | null;
  referrerHost: string | null;
  channel: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  clickIdType: string | null;
  trackedLink: string | null;
  landingQuery: string | null;
  deviceType: string | null;
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  inApp: string | null;
  screen: string | null;
  language: string | null;
  timezone: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  /** 세션 컬럼 원값(로그인 상태였던 방문만 채워짐) */
  academyId: string | null;
  staffId: string | null;
  isInternal: boolean;
  hasConversion: boolean;
  /** 세션 academyId, 없으면 방문자 academyId 기준 학원명 */
  academyName: string | null;
  /** 위 학원의 원장 Staff.id(회원 상세 라우트 id) */
  directorStaffId: string | null;
}

export interface SessionVisitor {
  id: string;
  firstSeenAt: string;
  sessionCount: number;
  pageviewCount: number;
  firstSessionId: string | null;
  firstChannel: string | null;
  firstSource: string | null;
  firstMedium: string | null;
  firstCampaign: string | null;
  firstReferrerHost: string | null;
  firstLandingPath: string | null;
  firstTrackedLink: string | null;
  academyId: string | null;
  linkedAt: string | null;
}

export interface SessionEventRow {
  id: string;
  type: string;
  name: string | null;
  path: string;
  title: string | null;
  prevPath: string | null;
  engagedMs: number | null;
  scrollPct: number | null;
  /** jsonb 원형(보통 객체) */
  props: unknown;
  createdAt: string;
}

export interface OtherSessionRow {
  id: string;
  startedAt: string;
  channel: string;
  source: string | null;
  pageviews: number;
  engagedMs: number;
  hasConversion: boolean;
}

export interface SessionDetailReport {
  session: SessionDetail;
  visitor: SessionVisitor | null;
  events: SessionEventRow[];
  otherSessions: OtherSessionRow[];
}
