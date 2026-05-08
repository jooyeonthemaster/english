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

export type WebtoonStatus = "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";

export interface WebtoonRow {
  id: string;
  passageId: string;
  passage: { id: string; title: string };
  style: WebtoonStyleId;
  customPrompt: string | null;
  status: WebtoonStatus;
  imageUrl: string | null;
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

export function isActiveStatus(status: WebtoonStatus): boolean {
  return status === "PENDING" || status === "GENERATING";
}
