import type { WebtoonImagePlanId } from "@/lib/webtoon-models";
import type {
  WebtoonLanguageId,
  WebtoonStyleId,
} from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";

// ============================================================================
// 지문 웹툰 모달(webtoon-picker-modal) 공용 타입·순수 함수·목록 조회.
// 상태를 갖지 않는다 — 조회 함수는 응답을 검증해 돌려주기만 하고, 상태 반영은
// 호스트가 한다.
// ============================================================================

/** 보관함 목록 한 행 — GET /api/webtoons/list 응답에서 이 모달이 읽는 필드만. */
export interface WebtoonListItem {
  id: string;
  passageId: string;
  style: WebtoonStyleId;
  language: WebtoonLanguageId;
  imageUrl: string | null;
  editedImageUrl?: string | null;
  status: string;
  /** 생성 등급(스펙 §4 목록 계약). 레거시 행은 null, 구버전 응답은 미전달. */
  plan?: WebtoonImagePlanId | null;
  passage: { id: string; title: string };
}

/** 진행 중(생성/대기) 웹툰을 갤러리 상단에 자리표시자로 보여주기 위한 최소 행. */
export interface TrackedItem {
  id: string;
  status: "PENDING" | "GENERATING" | "FAILED" | "COMPLETED";
  passageTitle: string;
  /** 생성 등급 — 진행 배너의 예상 소요 시간을 등급에 맞춘다. 모르면 null. */
  plan: WebtoonImagePlanId | null;
}

export function isTrackingActive(t: TrackedItem): boolean {
  return t.status === "PENDING" || t.status === "GENERATING";
}

export const LIST_ERROR_MESSAGE = "웹툰 목록을 불러오지 못했습니다.";

/** Prefer the re-typeset export when the webtoon's text has been edited. */
export function pickWebtoonUrl(it: WebtoonListItem): string | null {
  return it.editedImageUrl || it.imageUrl;
}

/** 선택 시점에 정확한 가로/세로 비율을 디코드해 읽는다(지연 로드 썸네일 의존 제거). */
export async function decodeRatio(url: string): Promise<number | undefined> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth > 0) return img.naturalHeight / img.naturalWidth;
  } catch {
    /* ignore — 렌더러가 16/9 로 폴백 */
  }
  return undefined;
}

/**
 * 완료 웹툰 목록(이미지가 있는 행만). `query` 는 "&scope=…&passageId=…" 꼴의 추가
 * 파라미터. 응답이 계약과 다르면 throw — 호스트가 오류 패널/배너로 보여 준다.
 */
export async function fetchCompletedWebtoons(
  query: string,
): Promise<WebtoonListItem[]> {
  const res = await fetch(
    `/api/webtoons/list?status=COMPLETED&limit=100${query}`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    items?: WebtoonListItem[];
  };
  if (!res.ok || !data.ok || !Array.isArray(data.items)) {
    throw new Error(LIST_ERROR_MESSAGE);
  }
  return data.items.filter((it) => pickWebtoonUrl(it));
}

/** 진행 중(PENDING/GENERATING) 웹툰 — 보조 조회라 실패해도 빈 배열로 넘어간다. */
export async function fetchActiveWebtoons(
  query: string,
): Promise<WebtoonListItem[]> {
  return fetch(`/api/webtoons/list?status=active&limit=50${query}`, {
    credentials: "include",
    cache: "no-store",
  })
    .then((r) => r.json())
    .then((d: { ok?: boolean; items?: WebtoonListItem[] }) =>
      d?.ok && Array.isArray(d.items) ? d.items : [],
    )
    .catch(() => [] as WebtoonListItem[]);
}
