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
