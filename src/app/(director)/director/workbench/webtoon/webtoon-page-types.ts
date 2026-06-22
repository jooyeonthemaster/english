export const WEBTOON_STYLES = [
  {
    id: "KOREAN_WEBTOON",
    label: "한국 웹툰",
    description: "현대 한국 교육 웹툰 느낌",
  },
  {
    id: "PIXAR_3D",
    label: "3D 애니",
    description: "밝고 입체적인 애니메이션 스타일",
  },
  {
    id: "GHIBLI",
    label: "수채 애니",
    description: "따뜻한 손그림 애니메이션 분위기",
  },
  {
    id: "MANHWA_ROMANCE",
    label: "로맨스 만화",
    description: "섬세하고 부드러운 순정만화 톤",
  },
  {
    id: "REALISTIC",
    label: "실사풍",
    description: "영화적인 조명과 사실적인 표현",
  },
] as const;

export type WebtoonStyleId = (typeof WEBTOON_STYLES)[number]["id"];

// ── 언어(대사·나레이션) 옵션 ──
// 프롬프트 빌더(webtoon-prompts.ts)가 각 모드를 말풍선/캡션 지시로 변환한다.
export const WEBTOON_LANGUAGES = [
  {
    id: "KO",
    label: "한글 전용",
    short: "한글",
    description: "대사·나레이션 모두 한국어",
  },
  {
    id: "KO_EN",
    label: "한글 + 영어 병기",
    short: "한+영",
    description: "영어 말풍선 + 한글 번역 캡션",
  },
  {
    id: "EN",
    label: "영어 전용",
    short: "영어",
    description: "지문 원문 그대로 영어",
  },
  {
    id: "EN_KO_GLOSS",
    label: "대사 영어 + 해설 한글",
    short: "영(대사)·한(설명)",
    description: "대사는 영어, 장면 설명·나레이션은 한글",
  },
] as const;

export type WebtoonLanguageId = (typeof WEBTOON_LANGUAGES)[number]["id"];

export const DEFAULT_WEBTOON_LANGUAGE: WebtoonLanguageId = "KO";

export type WebtoonStatus = "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";

export interface WebtoonRow {
  id: string;
  passageId: string;
  passage: { id: string; title: string; content?: string };
  style: WebtoonStyleId;
  language: WebtoonLanguageId;
  customPrompt: string | null;
  status: WebtoonStatus;
  /** 강사 검수완료 상태(검수완료 토글). */
  approved: boolean;
  imageUrl: string | null;
  /** Re-typeset export from the in-browser 자막 편집기 (preferred for display when present). */
  editedImageUrl?: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  createdBy: { id: string; name: string };
}

export function styleLabel(id: WebtoonStyleId): string {
  return WEBTOON_STYLES.find((s) => s.id === id)?.label ?? id;
}

export function languageLabel(id: WebtoonLanguageId): string {
  return WEBTOON_LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

export function isWebtoonLanguageId(value: unknown): value is WebtoonLanguageId {
  return (
    typeof value === "string" &&
    WEBTOON_LANGUAGES.some((l) => l.id === value)
  );
}

export function isActiveStatus(status: WebtoonStatus): boolean {
  return status === "PENDING" || status === "GENERATING";
}
