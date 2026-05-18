import type { Registration } from "./types";

export const SEOUL_DISTRICTS = [
  "강남구", "강동구", "강북구", "강서구", "관악구",
  "광진구", "구로구", "금천구", "노원구", "도봉구",
  "동대문구", "동작구", "마포구", "서대문구", "서초구",
  "성동구", "성북구", "송파구", "양천구", "영등포구",
  "용산구", "은평구", "종로구", "중구", "중랑구",
];

export const DISTRICT_CAPACITY = 100;
export const CAMPAIGN_PLAN = "FREE_MAY_2026";

export const STATUS_TABS = [
  { value: "ALL", label: "전체" },
  { value: "PENDING", label: "대기 중" },
  { value: "APPROVED", label: "승인됨" },
  { value: "REJECTED", label: "거절됨" },
];

export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: "대기 중", className: "bg-blue-50 text-blue-600 border-0" },
  APPROVED: { label: "승인됨", className: "bg-emerald-50 text-emerald-600 border-0" },
  REJECTED: { label: "거절됨", className: "bg-red-50 text-red-600 border-0" },
  CANCELLED: { label: "취소됨", className: "bg-gray-100 text-gray-500 border-0" },
};

/** Pull district from explicit field or from address/message prefix fallback. */
export function getDistrict(r: Registration): string | null {
  if (r.district) return r.district;
  if (r.address) {
    for (const d of SEOUL_DISTRICTS) if (r.address.includes(d)) return d;
  }
  if (r.message) {
    const m = r.message.match(/__DISTRICT__:([^\s|]+)/);
    if (m) return m[1];
  }
  return null;
}
