import type {
  WebtoonStyleId,
  WebtoonLanguageId,
} from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";

export interface WebtoonImagePromptInput {
  passageTitle: string;
  passageContent: string;
  style: WebtoonStyleId;
  language?: WebtoonLanguageId;
  customPrompt?: string;
}

/** 화풍별 아트 디렉션 — 이미지 모델에 전달할 그림체 지시. */
const STYLE_DIRECTION: Record<WebtoonStyleId, string> = {
  KOREAN_WEBTOON:
    "현대 한국 웹툰(연재 웹툰) 스타일. 깔끔하고 또렷한 라인, 부드러운 셀 채색, 감정 표현이 풍부한 인물. 밝고 친근한 교육 웹툰 톤.",
  PIXAR_3D:
    "픽사/디즈니풍 3D 애니메이션. 입체적이고 부드러운 라이팅, 둥글고 친근한 캐릭터 디자인, 생동감 있는 표정.",
  GHIBLI:
    "지브리풍 수채 손그림 애니메이션. 따뜻하고 은은한 색감, 정감 있는 배경, 손맛이 느껴지는 부드러운 선.",
  MANHWA_ROMANCE:
    "섬세한 순정만화체. 가늘고 부드러운 선, 화사한 파스텔 톤, 큰 눈망울의 감성적인 인물.",
  REALISTIC:
    "영화적인 사실풍 일러스트. 사실적인 명암과 디테일한 배경, 시네마틱한 조명과 구도.",
};

/** 언어 모드별 말풍선·자막 지시. */
const LANGUAGE_DIRECTION: Record<WebtoonLanguageId, string> = {
  KO: "모든 말풍선과 나레이션 박스를 자연스럽고 정확한 한국어로 표기한다. 영어 단어는 꼭 필요한 고유명사가 아니면 쓰지 않는다.",
  KO_EN:
    "각 말풍선에는 지문의 영어 원문 문장을 그대로 넣고, 그 말풍선 바로 아래(또는 컷 하단 자막 띠)에 같은 뜻의 한국어 번역을 작게 병기한다. 영어 문장과 한국어 번역이 1:1로 대응되도록 배치한다.",
  EN: "모든 말풍선과 나레이션을 지문의 영어 원문(또는 자연스러운 영어 대사)으로만 표기한다. 한국어 텍스트는 넣지 않는다.",
  EN_KO_GLOSS:
    "인물의 대사 말풍선은 영어로 표기하고, 장면을 설명하는 나레이션/캡션 박스는 한국어로 표기한다. 대사=영어, 설명=한국어로 명확히 구분한다.",
};

/**
 * 지문 한 편을 세로형 교육용 웹툰 한 장(여러 컷 통합)으로 그리기 위한 이미지 생성 프롬프트.
 * 화풍(style)·언어(language)·추가 지시(customPrompt)를 모두 반영한다.
 */
export function buildWebtoonImagePrompt(input: WebtoonImagePromptInput): string {
  const styleDirection =
    STYLE_DIRECTION[input.style] ?? STYLE_DIRECTION.KOREAN_WEBTOON;
  const languageDirection =
    LANGUAGE_DIRECTION[input.language ?? "KO"] ?? LANGUAGE_DIRECTION.KO;
  const custom = (input.customPrompt ?? "").trim();
  const title = (input.passageTitle ?? "").trim();

  const lines = [
    title ? `제목: ${title}` : null,
    "",
    input.passageContent.trim(),
    "",
    "위 영어 지문의 내용과 흐름을 한 장의 세로형(9:16) 교육용 웹툰으로 그려줘. 한국 웹툰처럼 위에서 아래로 읽는 6~8컷을 한 이미지에 통합 배치한다.",
    `· 화풍: ${styleDirection}`,
    `· 대사/자막: ${languageDirection}`,
    "· 컷 사이는 여백이나 가는 구분선으로 자연스럽게 나누고, 인물의 표정·동작과 배경으로 지문의 핵심 사건이 한눈에 이해되도록 구성한다.",
    "· 글자는 또렷하고 읽기 쉽게, 철자 오류 없이 정확하게 쓴다. 말풍선/자막이 그림을 가리지 않도록 배치한다.",
    custom ? `· 추가 지시사항: ${custom}` : null,
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}
