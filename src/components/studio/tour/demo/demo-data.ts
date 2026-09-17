// ============================================================================
// 투어 데모 캔드 데이터 — 단일 소스 (.tmp-studio-tour/spec.md §3)
//
// 전부 목업 전용 정적 데이터다. 서버·DB 와 무관하며, 실 화면과 자구가 겹치는
// 항목은 출처를 주석으로 명기한다(자구 드리프트 방지). 이모지 금지(§10).
// ============================================================================

/** 데모 지문 — 수능풍 짧은 학술 지문(자체 작성 캔드). */
export const DEMO_PASSAGE_TITLE = "2026 6월 모평 유형 · Attention and Memory";

export const DEMO_PASSAGE_SENTENCES: readonly string[] = [
  "Attention is often described as the gateway to memory.",
  "When learners divide their focus between two tasks, the information they encode becomes shallow and fragmented.",
  "In one experiment, students who studied while monitoring messages recalled far fewer key terms than those who studied without interruption.",
  "What matters is not the total time spent studying but the quality of engagement during that time.",
  "Deep processing, in which new ideas are linked to prior knowledge, produces memories that survive the pressure of an exam.",
  "Teachers can therefore help students most not by extending study hours but by protecting the conditions for undivided attention.",
];

/** 데모 단어 — 단어 시험지·어휘 데모용. */
export const DEMO_WORDS: readonly { word: string; meaning: string }[] = [
  { word: "gateway", meaning: "관문, 입구" },
  { word: "encode", meaning: "부호화하다, 기억에 저장하다" },
  { word: "fragmented", meaning: "단편적인, 조각난" },
  { word: "recall", meaning: "회상하다, 기억해 내다" },
  { word: "engagement", meaning: "몰입, 참여" },
  { word: "prior", meaning: "이전의, 사전의" },
  { word: "survive", meaning: "견뎌 내다, 살아남다" },
  { word: "undivided", meaning: "분산되지 않은, 온전한" },
];

export interface DemoQuestion {
  /** 유형 라벨(화면 표기) */
  type: string;
  difficulty: "기본" | "중급" | "킬러";
  stem: string;
  choices: readonly string[];
  /** 정답 번호(1-base) */
  answer: number;
  explanation: string;
}

/** 데모 문제 — 문제 생성 결과·조판·시험지 데모 공용. */
// 유형 라벨은 실 정본(src/lib/constants.ts QUESTION_TYPES label) 자구 그대로 —
// 실 화면에 없는 이름을 데모가 가르치면 안 된다(적대검수 확정 major).
export const DEMO_QUESTIONS: readonly DemoQuestion[] = [
  {
    type: "어법 판단",
    difficulty: "중급",
    stem: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
    choices: [
      "① described as the gateway",
      "② the information they encode",
      "③ recalled far fewer key terms",
      "④ not the total time spending",
      "⑤ linked to prior knowledge",
    ],
    answer: 4,
    explanation:
      "「the total time spent studying」의 spent 는 time 을 수식하는 과거분사가 되어야 합니다. spending 은 능동 관계가 되어 어법상 틀립니다.",
  },
  {
    type: "빈칸 추론",
    difficulty: "킬러",
    stem: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?",
    choices: [
      "① the length of each study session",
      "② the quality of engagement during that time",
      "③ the number of tasks completed at once",
      "④ the difficulty of the material itself",
      "⑤ the amount of information reviewed",
    ],
    answer: 2,
    explanation:
      "글 전체가 「시간의 총량이 아니라 몰입의 질」을 대비하고 있으므로 빈칸에는 the quality of engagement during that time 이 들어가야 합니다.",
  },
  {
    type: "제목 추론",
    difficulty: "기본",
    stem: "다음 글의 제목으로 가장 적절한 것은?",
    choices: [
      "① Why Longer Study Hours Always Win",
      "② Undivided Attention: The Real Key to Memory",
      "③ How Messages Improve Recall",
      "④ The Hidden Cost of Prior Knowledge",
      "⑤ Exams Reward Shallow Processing",
    ],
    answer: 2,
    explanation:
      "주의 집중이 기억의 관문이며 몰입 조건을 지켜 주는 것이 핵심이라는 요지를 담은 ②가 제목으로 가장 적절합니다.",
  },
  {
    type: "주제 추론",
    difficulty: "기본",
    stem: "다음 글의 주제로 가장 적절한 것은?",
    choices: [
      "① benefits of multitasking in classrooms",
      "② importance of focused attention for deep memory",
      "③ methods of extending study hours efficiently",
      "④ risks of linking new ideas to old knowledge",
      "⑤ ways to monitor students during exams",
    ],
    answer: 2,
    explanation:
      "분산된 주의가 얕은 기억을 만들고, 온전한 집중이 깊은 기억을 만든다는 대비가 글의 주제입니다.",
  },
];

/** 데모 유형 그룹 — 그룹 라벨 자구 출처: generation-config-panel-parts/constants.ts */
export const DEMO_TYPE_GROUPS: readonly {
  group: string;
  types: readonly { id: string; label: string }[];
}[] = [
  {
    group: "수능·모의고사 객관식",
    types: [
      { id: "grammar", label: "어법 판단" },
      { id: "blank", label: "빈칸 추론" },
      { id: "title", label: "제목 추론" },
      { id: "topic", label: "주제 추론" },
    ],
  },
  {
    group: "내신 서술형",
    types: [
      { id: "essay-order", label: "배열 영작" },
      { id: "essay-condition", label: "조건부 영작" },
    ],
  },
  {
    group: "어휘",
    types: [
      { id: "vocab-context", label: "문맥 속 의미" },
      { id: "vocab-synonym", label: "동의어" },
    ],
  },
];

/**
 * 학습 활동 라벨 — 자구 출처:
 * src/lib/passage-report/analysis-report/study-activities.ts labelKo(:1042-1053).
 * 원본 모듈이 무거워 자구만 복제한다(스펙 §3 승인 방식). 드리프트 감지는 검수 게이트.
 */
export const DEMO_ACTIVITY_TILES: readonly {
  kind: string;
  labelKo: string;
  category: "빈칸/복원" | "직독직해" | "어순/배열";
  desc: string;
}[] = [
  { kind: "keyword-cloze", labelKo: "키워드 빈칸", category: "빈칸/복원", desc: "핵심 단어를 비워 채우게 합니다" },
  { kind: "full-cloze", labelKo: "전지문 빈칸", category: "빈칸/복원", desc: "지문 전체를 빈칸 훈련지로 만듭니다" },
  { kind: "chunk-gloss-cloze", labelKo: "직독직해 빈칸", category: "빈칸/복원", desc: "의미 단위로 끊어 빈칸을 만듭니다" },
  { kind: "slash-compose", labelKo: "끊어읽기 + 영작", category: "직독직해", desc: "끊어읽기 훈련과 영작을 함께 합니다" },
  { kind: "reproduction", labelKo: "백지 영작 (한→영)", category: "직독직해", desc: "해석만 보고 원문을 복원합니다" },
  { kind: "chunk-scramble", labelKo: "어순 배열", category: "어순/배열", desc: "섞인 조각을 바른 어순으로 배열합니다" },
];

/** 단어 시험지 모드 — 자구 출처: vocab-test-options.tsx(:52-55). */
export const DEMO_VOCAB_MODES: readonly string[] = [
  "뜻 쓰기",
  "단어 쓰기",
  "동의어 쓰기",
  "반의어 쓰기",
];

/** 기출 브라우저 데모 행. */
export const DEMO_EXAM_ROWS: readonly {
  title: string;
  meta: string;
  passages: number;
}[] = [
  { title: "2026학년도 6월 모의평가", meta: "고3 · 영어 · 평가원", passages: 28 },
  { title: "한영고 2-1 중간고사", meta: "고2 · 영어 · 학교 기출", passages: 12 },
  { title: "2025학년도 대학수학능력시험", meta: "고3 · 영어 · 평가원", passages: 28 },
];

/**
 * 큐 스트림 데모 시퀀스 — 문구 계열 출처: queue-stream-line.tsx(:76-96)
 * (`[stage] tail▍` · 「모델이 생각하는 중…」 · 「생성을 준비하는 중…」).
 */
export const DEMO_QUEUE_STREAM: readonly { stage: string; tail: string }[] = [
  { stage: "준비", tail: "생성을 준비하는 중…" },
  { stage: "본문", tail: "지문을 문장 단위로 읽고 있습니다" },
  { stage: "어법", tail: "출제 포인트를 고르고 있습니다" },
  { stage: "어휘", tail: "핵심 어휘를 추리고 있습니다" },
  { stage: "구문", tail: "구문 분석을 정리하고 있습니다" },
  { stage: "마무리", tail: "페이지를 조판하고 있습니다" },
];

/** mm:ss 포맷 — queue-stream-line.tsx fmtElapsed 와 같은 표기 계약. */
export function demoFmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
