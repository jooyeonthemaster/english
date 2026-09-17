// 관리자 화면 공용 "호버=상세 팝오버 / 클릭=상세 팝업" 데이터 모델. 순수 모듈 —
// 서버(상세 조회 액션)와 클라이언트(목록 행에서 직접 조립) 양쪽이 import 한다.

export type AdminDetailColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  /** 긴 글(제목·오류 내용 등) — 말줄임 대신 줄바꿈해 보여주고 폭을 넉넉히 준다. */
  wide?: boolean;
};

export type AdminDetailSection = {
  title?: string;
  columns: AdminDetailColumn[];
  /** 값은 표시용 문자열로 포맷해 넣는다. 행 버튼 대상 id 는 DETAIL_ROW_ID_KEY 에 넣는다. */
  rows: Record<string, string>[];
  emptyText?: string;
  /**
   * 행마다 붙는 처리 버튼(예: 실패 결제 "확인"). 여기엔 문구만 두고, 실제 동작은
   * 화면이 AdminHoverDetail 의 onRowAction 으로 넘긴다(서버 데이터엔 함수를 못 담으므로).
   * 클릭 팝업에서만, DETAIL_ROW_ID_KEY 값이 있는 행에만 보인다.
   */
  rowAction?: AdminDetailRowAction;
};

export type AdminDetailRowAction = {
  label: string;
  /** 처리 후 행에 남는 문구(되돌리기 버튼과 함께 표시) */
  doneLabel: string;
};

/** rows 안에서 행 버튼 대상 id 를 담는 예약 키(표 칸으로는 그려지지 않는다). */
export const DETAIL_ROW_ID_KEY = "__rowId";

/** 행 버튼 동작. done=true 면 처리, false 면 되돌리기. 실패 시 throw. */
export type AdminDetailRowActionHandler = (rowId: string, done: boolean) => Promise<void>;

/** 단건 상세(행 하나)의 "항목: 값" 목록. */
export type AdminDetailField = {
  label: string;
  value: string;
  /** 긴 값 — 팝업에서 한 줄 전체 폭을 쓴다. */
  wide?: boolean;
};

export type AdminDetail = {
  title: string;
  subtitle?: string;
  summary?: { label: string; value: string }[];
  fields?: AdminDetailField[];
  sections?: AdminDetailSection[];
  link?: { label: string; href: string };
};

/** 호버 팝오버에 보여줄 표 행 수. 나머지는 클릭 팝업에서 본다. */
export const DETAIL_PREVIEW_ROWS = 5;
/** 호버 팝오버에 보여줄 항목 수. */
export const DETAIL_PREVIEW_FIELDS = 8;

type FieldInput = [label: string, value: string | number | null | undefined | false, wide?: boolean];

/** 빈 값(null·undefined·false·"")은 건너뛰고 항목 목록을 만든다. */
export function detailFields(entries: FieldInput[]): AdminDetailField[] {
  return entries
    .filter(([, value]) => value !== null && value !== undefined && value !== false && value !== "")
    .map(([label, value, wide]) => ({ label, value: String(value), wide }));
}
