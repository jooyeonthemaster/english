import type { AnnotationKind } from "./annotation-marks";

export const HERO_PASSAGE =
  "In the digital age, attention has become the most valuable currency. Every notification, every scroll, every swipe demands a fragment of our consciousness, and what we choose to engage with shapes the architecture of our thinking.";

/**
 * Annotation timeline for the hero typewriter scene.
 * Each entry maps a substring to a mark kind, sequenced for choreography.
 */
export const HERO_ANNOTATIONS: Array<{
  match: string;
  kind: AnnotationKind;
  memo: string;
}> = [
  { match: "attention", kind: "vocab", memo: "핵심 어휘 — 학생들이 놓치는 명사형 추상어" },
  { match: "has become", kind: "grammar", memo: "현재완료 — 결과 용법" },
  {
    match: "Every notification, every scroll, every swipe",
    kind: "syntax",
    memo: "병렬 구조 3회 반복 — 리듬",
  },
  {
    match: "what we choose to engage with shapes the architecture of our thinking",
    kind: "sentence",
    memo: "주제문 — 'shapes' 가 술어",
  },
  { match: "the most valuable currency", kind: "examPoint", memo: "비유 표현 — 출제 1순위" },
];

export const ANALYSIS_LINES: Array<{
  label: string;
  count?: string;
  body: string;
  kind: AnnotationKind;
}> = [
  { label: "어휘", count: "3", body: "attention · currency · consciousness", kind: "vocab" },
  { label: "문법", count: "2", body: "현재완료(has become) · 관계대명사(what)", kind: "grammar" },
  { label: "구문", count: "1", body: "병렬 구조 3개 반복 (Every X, every Y, every Z)", kind: "syntax" },
  { label: "핵심 문장", body: "what we choose to engage with shapes...", kind: "sentence" },
  { label: "출제 포인트", body: "the most valuable currency (비유 표현)", kind: "examPoint" },
];

export type QuestionCategory = "객관식" | "서술형" | "어휘";

export const QUESTION_TYPES: Array<{
  no: string;
  name: string;
  category: QuestionCategory;
}> = [
  { no: "01", name: "빈칸추론", category: "객관식" },
  { no: "02", name: "어법오류", category: "객관식" },
  { no: "03", name: "어휘추론", category: "객관식" },
  { no: "04", name: "순서배열", category: "객관식" },
  { no: "05", name: "문장삽입", category: "객관식" },
  { no: "06", name: "주제요지", category: "객관식" },
  { no: "07", name: "제목", category: "객관식" },
  { no: "08", name: "지시대상", category: "객관식" },
  { no: "09", name: "일치불일치", category: "객관식" },
  { no: "10", name: "무관한문장", category: "객관식" },
  { no: "11", name: "조건영작", category: "서술형" },
  { no: "12", name: "문장전환", category: "서술형" },
  { no: "13", name: "핵심빈칸", category: "서술형" },
  { no: "14", name: "요약완성", category: "서술형" },
  { no: "15", name: "단어배열", category: "서술형" },
  { no: "16", name: "문법교정", category: "서술형" },
  { no: "17", name: "문맥의미", category: "어휘" },
  { no: "18", name: "동의어", category: "어휘" },
  { no: "19", name: "반의어", category: "어휘" },
];

export const CATEGORY_TINT: Record<QuestionCategory, { bg: string; border: string; text: string }> = {
  객관식: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1d4ed8" },
  서술형: { bg: "#EEF2FF", border: "#C7D2FE", text: "#4338ca" },
  어휘: { bg: "#ECFDF5", border: "#A7F3D0", text: "#047857" },
};

export const EXAM_QUESTIONS: Array<{
  no: number;
  type: string;
  stem: string;
  options?: string[];
}> = [
  {
    no: 1,
    type: "빈칸추론",
    stem: "다음 빈칸에 들어갈 말로 가장 적절한 것은?\n   In the digital age, attention has become the most valuable ______.",
    options: ["resource", "currency", "obstacle", "memory", "tradition"],
  },
  {
    no: 2,
    type: "어법오류",
    stem: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?\n   Every notification, every scroll, every swipe ① demand a fragment of our ② consciousness...",
    options: ["①", "②", "③", "④", "⑤"],
  },
  {
    no: 3,
    type: "주제요지",
    stem: "다음 글의 요지로 가장 적절한 것은?",
    options: [
      "디지털 환경은 사고 구조를 형성한다.",
      "주의력은 더 이상 가치가 없다.",
      "알림은 무시해야 한다.",
      "기술은 의식을 확장한다.",
      "현대인은 집중을 잃었다.",
    ],
  },
  {
    no: 4,
    type: "조건영작",
    stem: "다음 우리말과 같은 뜻이 되도록, [조건]에 맞게 영작하시오.\n   우리가 무엇에 관여하기로 선택하느냐가 우리 사고의 구조를 형성한다.",
  },
];

export type FolderNode = {
  id: string;
  name: string;
  kind: "folder" | "doc";
  meta?: string;
  accent?: "객관식" | "서술형" | "어휘";
  children?: FolderNode[];
};

export const FOLDER_TREE: FolderNode[] = [
  {
    id: "school-1",
    name: "한영고등학교",
    kind: "folder",
    children: [
      {
        id: "y26-1",
        name: "2026학년도 1학기",
        kind: "folder",
        children: [
          {
            id: "g3",
            name: "3학년",
            kind: "folder",
            children: [
              {
                id: "mid",
                name: "중간고사",
                kind: "folder",
                children: [
                  { id: "doc-1", name: "빈칸추론_세트A", kind: "doc", meta: "15문항", accent: "객관식" },
                  { id: "doc-2", name: "어법오류_세트B", kind: "doc", meta: "10문항", accent: "객관식" },
                ],
              },
              { id: "fin", name: "기말고사", kind: "folder" },
            ],
          },
          { id: "g2", name: "2학년", kind: "folder" },
        ],
      },
      { id: "y25-2", name: "2025학년도 2학기", kind: "folder" },
    ],
  },
  { id: "school-2", name: "한영여자고등학교", kind: "folder" },
  { id: "school-3", name: "청담고등학교", kind: "folder" },
];

// ============================================================================
// LIVE GENERATION THEATER — Sample content for each of the 19 question types
// ============================================================================
// Each entry drives the main-stage typewriter in <QuestionBurstScene />.
// Stems are intentionally short (~40-60 chars) so they type within ~600ms.
// ============================================================================

export type QuestionSampleShape =
  | "mcq"        // numbered ①~⑤ options with a correct index
  | "ordering"  // (A)/(B)/(C) paragraphs + ordering choices
  | "insert"    // 5 position markers ①~⑤
  | "write"     // written-answer style (단문)
  | "blanks"    // labelled blanks (A), (B)
  | "arrange"   // chips to rearrange
  | "correct";  // wrong → correct pair

export type QuestionSample = {
  no: string;
  name: string;
  category: QuestionCategory;
  shape: QuestionSampleShape;
  stem: string;
  // mcq / insert
  options?: string[];
  // ordering
  paragraphs?: Array<{ label: string; body: string }>;
  // write / correct
  prompt?: string;
  given?: string;
  // arrange
  chips?: string[];
  // blanks
  blanks?: Array<{ label: string; value: string }>;
  // the correct answer — displayed on reveal (e.g., "②", "(A) focus, (B) shape")
  answer: string;
  // Substrings of HERO_PASSAGE that this question type "extracts" — lights up live in the source panel
  sourceTokens?: string[];
};

export const QUESTION_SAMPLES: QuestionSample[] = [
  {
    no: "01",
    name: "빈칸추론",
    category: "객관식",
    shape: "mcq",
    stem: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
    given: "The most valuable currency in the digital age is ______.",
    options: ["attention", "memory", "wealth", "silence", "patience"],
    answer: "①",
    sourceTokens: ["the most valuable currency", "attention"],
  },
  {
    no: "02",
    name: "어법오류",
    category: "객관식",
    shape: "mcq",
    stem: "밑줄 친 부분 중, 어법상 틀린 것은?",
    given: "Attention ①has become the currency ②were demanding ③what we ④engage with ⑤shapes us.",
    options: ["①has become", "②were demanding", "③what we", "④engage with", "⑤shapes us"],
    answer: "②",
    sourceTokens: ["has become", "demands", "what we choose"],
  },
  {
    no: "03",
    name: "어휘추론",
    category: "객관식",
    shape: "mcq",
    stem: "밑줄 친 낱말의 쓰임이 적절하지 않은 것은?",
    given: "Every swipe ①demands focus, ②shaping habits and ③eroding our ④abundant ⑤patience daily.",
    options: ["①demands", "②shaping", "③eroding", "④abundant", "⑤patience"],
    answer: "④",
    sourceTokens: ["every swipe", "demands", "consciousness"],
  },
  {
    no: "04",
    name: "순서배열",
    category: "객관식",
    shape: "ordering",
    stem: "주어진 글 다음에 이어질 순서로 가장 적절한 것은?",
    given: "In the digital age, attention has become a scarce resource.",
    paragraphs: [
      { label: "A", body: "Every app competes aggressively for a slice of it." },
      { label: "B", body: "As a result, our focus fractures across many screens." },
      { label: "C", body: "Reclaiming it requires deliberate, daily practice." },
    ],
    options: ["(A)-(B)-(C)", "(A)-(C)-(B)", "(B)-(A)-(C)", "(B)-(C)-(A)", "(C)-(A)-(B)"],
    answer: "①",
    sourceTokens: ["In the digital age", "attention has become"],
  },
  {
    no: "05",
    name: "문장삽입",
    category: "객관식",
    shape: "insert",
    stem: "주어진 문장이 들어가기에 가장 적절한 곳은?",
    given: "But this abundance came at a hidden cost.",
    options: ["①", "②", "③", "④", "⑤"],
    answer: "③",
    sourceTokens: ["Every notification", "demands a fragment"],
  },
  {
    no: "06",
    name: "주제요지",
    category: "객관식",
    shape: "mcq",
    stem: "다음 글의 요지로 가장 적절한 것은?",
    options: [
      "디지털 환경은 사고 구조를 형성한다.",
      "주의력은 더 이상 가치가 없다.",
      "알림은 언제나 무시해야 한다.",
      "기술은 의식을 자동으로 확장한다.",
      "현대인은 집중력을 완전히 잃었다.",
    ],
    answer: "①",
    sourceTokens: ["shapes the architecture of our thinking"],
  },
  {
    no: "07",
    name: "제목",
    category: "객관식",
    shape: "mcq",
    stem: "다음 글의 제목으로 가장 적절한 것은?",
    options: [
      "Attention: The New Currency",
      "The Myth of Multitasking",
      "A History of Notifications",
      "Why Silence Is Priceless",
      "Shaping Thought with Tech",
    ],
    answer: "①",
    sourceTokens: ["attention", "the most valuable currency"],
  },
  {
    no: "08",
    name: "지시대상",
    category: "객관식",
    shape: "mcq",
    stem: "밑줄 친 it이 가리키는 대상으로 가장 적절한 것은?",
    given: "Attention shapes thought, and losing it fractures the self.",
    options: ["attention", "thought", "self", "notification", "currency"],
    answer: "①",
    sourceTokens: ["what we choose to engage with"],
  },
  {
    no: "09",
    name: "일치불일치",
    category: "객관식",
    shape: "mcq",
    stem: "다음 글의 내용과 일치하지 않는 것은?",
    options: [
      "주의력은 현대에 가치가 커졌다.",
      "알림은 의식의 일부를 요구한다.",
      "선택이 사고 구조를 형성한다.",
      "모든 앱은 주의력을 아껴 쓴다.",
      "디지털 환경은 집중을 분산시킨다.",
    ],
    answer: "④",
    sourceTokens: ["demands a fragment of our consciousness"],
  },
  {
    no: "10",
    name: "무관한문장",
    category: "객관식",
    shape: "mcq",
    stem: "전체 흐름과 관계 없는 문장은?",
    options: [
      "①주의력은 희소 자원이다.",
      "②앱은 주의력을 놓고 경쟁한다.",
      "③광고는 주의를 자극한다.",
      "④고래는 포유류에 속한다.",
      "⑤집중 복원은 훈련이 필요하다.",
    ],
    answer: "④",
    sourceTokens: ["the most valuable currency"],
  },
  {
    no: "11",
    name: "조건영작",
    category: "서술형",
    shape: "write",
    stem: "[조건] however를 포함, 9~11단어로 영작하시오.",
    prompt: "그러나 주의력은 여전히 우리가 지켜야 할 통화이다.",
    answer: "However, attention is still a currency we must protect.",
    sourceTokens: ["attention", "currency"],
  },
  {
    no: "12",
    name: "문장전환",
    category: "서술형",
    shape: "correct",
    stem: "주어진 문장을 수동태로 바꿔 쓰시오.",
    prompt: "People think that he is kind.",
    answer: "He is thought to be kind.",
    sourceTokens: ["shapes the architecture"],
  },
  {
    no: "13",
    name: "핵심빈칸",
    category: "서술형",
    shape: "write",
    stem: "빈칸에 들어갈 한 단어를 본문에서 찾아 쓰시오.",
    prompt: "Attention has become the most valuable ______ of the digital age.",
    answer: "currency",
    sourceTokens: ["the most valuable currency"],
  },
  {
    no: "14",
    name: "요약완성",
    category: "서술형",
    shape: "blanks",
    stem: "요약문의 (A), (B)에 들어갈 말을 쓰시오.",
    prompt: "What we (A)______ to focus on ultimately (B)______ our thinking.",
    blanks: [
      { label: "A", value: "choose" },
      { label: "B", value: "shapes" },
    ],
    answer: "(A) choose · (B) shapes",
    sourceTokens: ["what we choose to engage with shapes"],
  },
  {
    no: "15",
    name: "단어배열",
    category: "서술형",
    shape: "arrange",
    stem: "주어진 단어를 바른 순서로 배열하시오.",
    chips: ["has", "attention", "currency", "become", "the", "most", "valuable"],
    answer: "attention has become the most valuable currency",
    sourceTokens: ["attention has become the most valuable currency"],
  },
  {
    no: "16",
    name: "문법교정",
    category: "서술형",
    shape: "correct",
    stem: "밑줄 친 부분을 어법에 맞게 고쳐 쓰시오.",
    prompt: "Every notification demand a fragment of consciousness.",
    answer: "demand → demands",
    sourceTokens: ["Every notification", "demands"],
  },
  {
    no: "17",
    name: "문맥의미",
    category: "어휘",
    shape: "mcq",
    stem: "밑줄 친 shape의 문맥상 의미로 가장 적절한 것은?",
    given: "What we engage with shapes the architecture of our thinking.",
    options: ["forms", "breaks", "hides", "ignores", "copies"],
    answer: "①",
    sourceTokens: ["shapes the architecture"],
  },
  {
    no: "18",
    name: "동의어",
    category: "어휘",
    shape: "mcq",
    stem: "attention의 동의어로 가장 적절한 것은?",
    options: ["focus", "absence", "noise", "silence", "escape"],
    answer: "①",
    sourceTokens: ["attention"],
  },
  {
    no: "19",
    name: "반의어",
    category: "어휘",
    shape: "mcq",
    stem: "valuable의 반의어로 가장 적절한 것은?",
    options: ["priceless", "worthless", "precious", "treasured", "costly"],
    answer: "②",
    sourceTokens: ["the most valuable currency"],
  },
];

export const FOLDER_DOCS: Array<{
  title: string;
  meta: string;
  accent: "객관식" | "서술형" | "어휘";
  type: string;
}> = [
  { title: "빈칸추론_세트A", meta: "15문항 · 4월 8일", accent: "객관식", type: "객관식" },
  { title: "어법오류_세트B", meta: "10문항 · 4월 9일", accent: "객관식", type: "객관식" },
  { title: "조건영작_세트C", meta: "8문항 · 4월 10일", accent: "서술형", type: "서술형" },
  { title: "요약완성_세트D", meta: "6문항 · 4월 11일", accent: "서술형", type: "서술형" },
  { title: "동의어_세트E", meta: "20문항 · 4월 12일", accent: "어휘", type: "어휘" },
  { title: "문맥의미_세트F", meta: "12문항 · 4월 12일", accent: "어휘", type: "어휘" },
];
