export const ANALYSIS_TONE_IDS = ["standard", "friendly", "playful"] as const;

export type AnalysisTone = (typeof ANALYSIS_TONE_IDS)[number];

export const DEFAULT_ANALYSIS_TONE: AnalysisTone = "standard";

export const ANALYSIS_TONE_OPTIONS: Array<{
  id: AnalysisTone;
  label: string;
  description: string;
}> = [
  {
    id: "standard",
    label: "기본",
    description: "교사용 정리처럼 깔끔하게 설명",
  },
  {
    id: "friendly",
    label: "친절",
    description: "학생 눈높이로 풀어서 설명",
  },
  {
    id: "playful",
    label: "병맛",
    description: "드립 섞어서 웃기게, 그래도 핵심은 정확하게",
  },
];

export function normalizeAnalysisTone(value: unknown): AnalysisTone {
  return ANALYSIS_TONE_IDS.includes(value as AnalysisTone)
    ? (value as AnalysisTone)
    : DEFAULT_ANALYSIS_TONE;
}

/** 분석 리포트 전체 섹션 수 — module-sections.FULL_ANALYSIS_SECTIONS 와 동수(단위 테스트가 잠금). */
const FULL_ANALYSIS_SECTION_COUNT = 6;

/**
 * 폐지된 섹션 kind — 마커 계수에서 제외한다(26-08-21 '지문 논리 구조 분석' 폐지).
 * 폐지 전 저장된 `_partialSections` 는 이 kind 를 포함한 채로 남아 있어, 그대로 세면
 * "6개 중 learning-worksheet 1개 + 실제 5개"인 부분 데이터가 완료로 오판된다.
 */
const RETIRED_SECTION_KINDS: ReadonlySet<string> = new Set(["learning-worksheet"]);

/**
 * 부분 분석 마커(§3.4.1-7) 판정 — 섹션 종량제가 만든 파생 analysisData 는
 * `_partialSections`(보유 kind 목록)를 갖는다. 6종 미만이면 "완료 캐시"가 아니다.
 *
 * shouldUseCachedAnalysis 는 3벌 복제본(fast 라우트 · trigger 태스크 · 레거시 라우트)이
 * 있다 — 반드시 셋 다 이 헬퍼를 첫 판정으로 호출한다(검수 M2: 1벌만 고치면 나머지
 * 표면이 부분 데이터를 완료 캐시로 서빙한다). 마커 없는 기존 데이터는 항상 false(무회귀).
 */
export function isPartialAnalysisData(cached: unknown): boolean {
  if (!cached || typeof cached !== "object") return false;
  const partialSections = (cached as Record<string, unknown>)._partialSections;
  if (!Array.isArray(partialSections)) return false;
  const live = partialSections.filter((k) => typeof k === "string" && !RETIRED_SECTION_KINDS.has(k));
  return live.length < FULL_ANALYSIS_SECTION_COUNT;
}

export function getAnalysisTonePrompt(tone: AnalysisTone): string {
  switch (tone) {
    case "friendly":
      return [
        "Tone: friendly tutor mode.",
        "- Explain like you are helping a real student who gets scared by grammar terms.",
        "- Start hard points with plain Korean first, then add the grammar term in parentheses if needed.",
        "- Use short sentences and concrete '여기서는...' explanations.",
      ].join("\n");
    case "playful":
      return [
        "Tone: high-energy playful Korean study-note mode.",
        "- Make the explanation noticeably funny and memorable, like a clever student-friendly cram note.",
        "- Use playful metaphors and school-safe slang often: '문법 보스몹', '함정 카드', '여기서 낚이면 슬픔', '주어 찾기 숨은그림찾기', '수식어는 잠깐 옆으로 치워두기'.",
        "- Prefer punchy Korean sentences with a little comic timing. Example style: '주어는 One입니다. 뒤에 복수명사 군단이 우르르 나와도 속지 마세요.'",
        "- For vocabulary, include funny memory hooks when possible, but keep the actual meaning clear.",
        "- For grammar and reading points, use the joke to help the student remember the rule, not to replace the rule.",
        "- Do not use profanity, insults, sexual content, or content that targets any person or group.",
        "- Avoid bathroom humor, body-prank humor, and jokes about disability, appearance, gender, race, nationality, poverty, religion, illness, or real people.",
        "- Keep each joke short, but make the overall tone clearly more playful than friendly mode.",
      ].join("\n");
    case "standard":
    default:
      return [
        "Tone: standard teacher-ready mode.",
        "- Be clear, concise, and instructional.",
        "- Prefer plain Korean over jargon, but keep exam-useful labels.",
      ].join("\n");
  }
}
