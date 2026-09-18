// 필터 칩 표시명 — 키 이름과 값의 한국어 라벨.

import {
  areaLabel,
  browserLabel,
  channelLabel,
  countryLabel,
  deviceLabel,
  inAppLabel,
  regionLabel,
  sourceLabel,
} from "@/lib/analytics/channels";
import type { FilterKey } from "./use-analytics-params";

export const FILTER_KEY_LABELS: Record<FilterKey, string> = {
  channel: "채널",
  source: "소스",
  medium: "매체",
  campaign: "캠페인",
  device: "기기",
  browser: "브라우저",
  os: "OS",
  inApp: "인앱",
  country: "국가",
  region: "지역",
  entry: "진입 페이지",
  page: "본 페이지",
  area: "영역",
  loggedIn: "로그인",
  referrerHost: "참조 도메인",
  link: "추적 링크",
};

export function filterValueLabel(key: FilterKey, value: string, all: Partial<Record<FilterKey, string>> = {}): string {
  if (value === "(none)") return "(없음)";
  switch (key) {
    case "channel":
      return channelLabel(value);
    case "source":
      return sourceLabel(value);
    case "device":
      return deviceLabel(value);
    case "browser":
      // 수집기는 인앱을 "인앱:<앱>" 으로 저장한다 → 표 라벨과 같은 자구로 보인다.
      return browserLabel(value);
    case "inApp":
      return inAppLabel(value);
    case "country":
      return countryLabel(value);
    case "region":
      // 도시·시도 행 클릭이 country 를 늘 함께 걸지는 않는다 → 국가를 모르면 KR 로 단정하지 않는다.
      return regionLabel(all.country ?? null, value);
    case "area":
      return areaLabel(value);
    case "loggedIn":
      return value === "yes" ? "로그인 사용자" : "비로그인 방문자";
    default:
      return value;
  }
}
