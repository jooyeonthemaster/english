// 랜딩 인터랙티브 데모 공용 샘플 지문 — 워크벤치 튜토리얼과 같은 소스(단일 정본).
// 4개 스텝(크롭→분석→문제생성→시험지)이 모두 이 한 지문으로 이어진다.
import {
  GENERATE_TOUR_SAMPLE_TEXT,
  GENERATE_TOUR_SAMPLE_TEXT_TITLE,
} from "@/lib/generate-tour-demo";

export const DEMO_PASSAGE = {
  title: GENERATE_TOUR_SAMPLE_TEXT_TITLE,
  text: GENERATE_TOUR_SAMPLE_TEXT,
} as const;
