import type { WebtoonStyleId } from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";

export interface WebtoonImagePromptInput {
  passageTitle: string;
  passageContent: string;
  style: WebtoonStyleId;
  customPrompt?: string;
}

export function buildWebtoonImagePrompt(input: WebtoonImagePromptInput): string {
  void input.passageTitle;
  void input.style;
  void input.customPrompt;

  return `${input.passageContent}

이 모든 맥락과 흐름을 이해할 수 있는 존나 유쾌한 한글 만화를 생성해줘. 존나 여자애들이 좋아하는 웹툰 스타일로 만들어줘. 진짜 샤방샤방이 아니라, 한국 웹툰 스타일로 화산귀한 느낌의 그림체로. 연애혁명의 그림체로.`;
}
