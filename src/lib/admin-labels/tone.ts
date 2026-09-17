// 관리자 화면 상태 색조(tone). 뱃지·통계 카드·아이콘 박스가 같은 어휘를 쓴다.
// 의미: gray=중립/비활성, blue=진행·정보, emerald=성공·완료, amber=주의·대기,
// rose=실패·위험, violet=예약·특수, sky=보조 진행, teal=수동 처리.
export type Tone =
  | "gray"
  | "blue"
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "teal";

export type StatusMeta = { label: string; tone: Tone };
export type StatusMap = Record<string, StatusMeta>;

/** 맵에 없는 값은 원문을 회색으로 — 새 enum 이 생겨도 UI 가 깨지지 않고 누락이 눈에 띈다. */
export function statusOf(
  map: StatusMap,
  value: string | null | undefined,
  fallback: StatusMeta = { label: value ?? "—", tone: "gray" },
): StatusMeta {
  if (!value) return { label: "—", tone: "gray" };
  return map[value] ?? fallback;
}

export function labelOf(map: StatusMap, value: string | null | undefined): string {
  return statusOf(map, value).label;
}
