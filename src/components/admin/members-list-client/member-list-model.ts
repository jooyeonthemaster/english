// 회원 목록의 클라이언트 필터·정렬·학원 묶기 — 순수 함수. 화면은 use-member-list-model 로 쓴다.

import type {
  ActiveFilter,
  MemberListItem,
  MemberSortKey,
  ProviderFilter,
  SortOrder,
} from "@/actions/admin-members";
import type { OperationalFilters } from "./filter-model";
import { normalizeToKSTMidnight } from "@/lib/date-utils";

// 저잔고 기준 — member-row 의 BalanceCell 강조 임계값과 동일하게 맞춘다.
export const LOW_BALANCE_THRESHOLD = 50;

export interface ClientFilters {
  provider: ProviderFilter;
  active: ActiveFilter;
  sortKey: MemberSortKey | null; // null = 해제(기본 정렬)
  sortOrder: SortOrder;
}

// 정렬은 헤더 클릭 시 오름차순 → 내림차순 → 해제(기본순) 3단계로 순환한다.
// 해제 상태(sortKey=null)에서는 가입일 최신순으로 정렬되고 활성 컬럼 표시가 없다.
export const INITIAL_FILTERS: ClientFilters = {
  provider: "all",
  active: "all",
  sortKey: null,
  sortOrder: "desc",
};

/**
 * 학원별 보기 전용 행 모델 — 한 학원과 거기 소속된 회원(원장)들.
 * 학원(크레딧·플랜·소멸시효의 실제 단위)을 앞·강조로, 소속 회원을 옆에 약하게.
 */
export interface AcademyGroup {
  academyId: string;
  academyName: string;
  slug: string;
  status: string;
  memo: string | null;
  latestPurchase: MemberListItem["latestPurchase"];
  creditBalance: MemberListItem["creditBalance"];
  members: MemberListItem[];
}

// 문자 상태 순위: 내부(0) → 발송 제외(1) → 발송 가능(2).
function smsRank(m: { isInternal: boolean; smsOptOut: boolean }): number {
  if (m.isInternal) return 0;
  if (m.smsOptOut) return 1;
  return 2;
}

/** "YYYY-MM-DD"(date input 값) → 그 날 KST 00:00 의 epoch ms. 빈 값·잘못된 값은 null. */
function kstDayStartTs(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  // "YYYY-MM-DD" 는 UTC 자정으로 파싱된다(KST 09:00) → 같은 KST 날짜의 자정으로 정규화.
  const utcMidnight = new Date(ymd);
  if (Number.isNaN(utcMidnight.getTime())) return null;
  return normalizeToKSTMidnight(utcMidnight).getTime();
}

export function filterMembers(
  members: MemberListItem[],
  filters: Pick<ClientFilters, "provider" | "active">,
  op: OperationalFilters,
  searchQuery: string,
): MemberListItem[] {
  const q = searchQuery.trim().toLowerCase();
  // 가입일 범위 — KST 달력일 기준(브라우저 시간대 무관). from 은 그 날 KST 00:00 이상,
  // to 는 다음 날 KST 00:00 미만(그 날 포함). setHours 는 브라우저 로컬 자정이라 쓰지 않는다.
  const fromTs = kstDayStartTs(op.signupFrom);
  const toTs = kstDayStartTs(op.signupTo);
  const toExclusiveTs = toTs === null ? null : toTs + 86_400_000;

  return members.filter((m) => {
    if (filters.provider !== "all") {
      if (filters.provider === "google" && m.authProvider !== "google") return false;
      if (filters.provider === "kakao" && m.authProvider !== "kakao") return false;
      if (
        filters.provider === "other" &&
        (m.authProvider === "google" || m.authProvider === "kakao")
      )
        return false;
    }
    if (filters.active === "active" && !m.isActive) return false;
    if (filters.active === "inactive" && m.isActive) return false;

    // 구입: "has"=구입 있음, "none"=구입 없음, 그 외는 최근 구입 상품명 일치
    if (op.purchase === "has") {
      if (!m.latestPurchase) return false;
    } else if (op.purchase === "none") {
      if (m.latestPurchase) return false;
    } else if (op.purchase !== "all") {
      if (m.latestPurchase?.name !== op.purchase) return false;
    }
    if (op.lowBalance) {
      if ((m.creditBalance?.balance ?? 0) >= LOW_BALANCE_THRESHOLD) return false;
    }
    if (op.marketing === "consented" && !m.marketingConsent) return false;
    if (op.marketing === "none" && m.marketingConsent) return false;
    if (op.sms === "excluded" && !m.smsOptOut) return false;
    if (op.sms === "included" && m.smsOptOut) return false;
    if (fromTs !== null || toExclusiveTs !== null) {
      const created = new Date(m.createdAt).getTime();
      if (fromTs !== null && created < fromTs) return false;
      if (toExclusiveTs !== null && created >= toExclusiveTs) return false;
    }

    if (q) {
      const hay =
        `${m.name} ${m.email} ${m.academy.name} ${m.academy.memo ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortMembers(
  filtered: MemberListItem[],
  key: MemberSortKey | null,
  sortOrder: SortOrder,
): MemberListItem[] {
  const arr = [...filtered];
  const dir = sortOrder === "asc" ? 1 : -1;
  arr.sort((a, b) => {
    switch (key) {
      case "balance":
        return ((a.creditBalance?.balance ?? 0) - (b.creditBalance?.balance ?? 0)) * dir;
      case "lastActiveAt":
        return (
          ((a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0) -
            (b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0)) *
          dir
        );
      case "name":
        return a.name.localeCompare(b.name, "ko") * dir;
      case "academyName":
        return a.academy.name.localeCompare(b.academy.name, "ko") * dir;
      case "plan": {
        // "최근 구입 상품" — 최근 구입일 기준(구입 이력 없으면 맨 뒤).
        const av = a.latestPurchase ? new Date(a.latestPurchase.purchasedAt).getTime() : 0;
        const bv = b.latestPurchase ? new Date(b.latestPurchase.purchasedAt).getTime() : 0;
        return (av - bv) * dir;
      }
      case "expiresAt": {
        // 소멸일 없음(무기한 취급)은 항상 맨 뒤로.
        const av = a.creditBalance?.expiresAt
          ? new Date(a.creditBalance.expiresAt).getTime()
          : Infinity;
        const bv = b.creditBalance?.expiresAt
          ? new Date(b.creditBalance.expiresAt).getTime()
          : Infinity;
        if (av === bv) return 0;
        if (av === Infinity) return 1;
        if (bv === Infinity) return -1;
        return (av - bv) * dir;
      }
      case "sms":
        return (smsRank(a) - smsRank(b)) * dir;
      default:
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    }
  });
  return arr;
}

// 학원별 보기 = 학원(크레딧·플랜의 실제 단위)을 앞·강조로 두고 소속 회원(원장)을
// 그 옆에 약하게 나열한다. 필터+정렬된 순서를 유지하며 academyId로 묶는다.
export function groupByAcademy(sorted: MemberListItem[]): AcademyGroup[] {
  const map = new Map<string, AcademyGroup>();
  for (const m of sorted) {
    let g = map.get(m.academy.id);
    if (!g) {
      g = {
        academyId: m.academy.id,
        academyName: m.academy.name,
        slug: m.academy.slug,
        status: m.academy.status,
        memo: m.academy.memo,
        latestPurchase: m.latestPurchase,
        creditBalance: m.creditBalance,
        members: [],
      };
      map.set(m.academy.id, g);
    }
    g.members.push(m);
  }
  return [...map.values()];
}

export interface MemberCounts {
  total: number;
  google: number;
  kakao: number;
  other: number;
  active: number;
  inactive: number;
}

export function countMembers(members: MemberListItem[]): MemberCounts {
  const total = members.length;
  const google = members.filter((m) => m.authProvider === "google").length;
  const kakao = members.filter((m) => m.authProvider === "kakao").length;
  const other = total - google - kakao;
  const active = members.filter((m) => m.isActive).length;
  const inactive = total - active;
  return { total, google, kakao, other, active, inactive };
}
