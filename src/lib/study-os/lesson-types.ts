// ============================================================================
// SMOAT 학습 OS — 인터랙티브 레슨 타입 정본
//
// 1개념 = 1레슨 = LessonBlock[]. 플레이어는 블록을 한 번에 하나씩 세워 보여준다.
// 규범 문서: docs/study-os-spec.md §3 (블록 카탈로그 16종)
//
// 텍스트 마크업은 어법 드릴과 동일한 규약을 쓴다(src/lib/grammar-drill/markup.ts):
//   {{blank}}                 빈칸 슬롯
//   [[u:token]]               단일 밑줄
//   [[1:token]]~[[5:token]]   번호 밑줄
//   **word**                  강조(판단 포인트)
// ============================================================================

/** 1 기초(초·중 도입) · 2 표준(적용) · 3 심화(수능 판별) */
export type LessonTier = 1 | 2 | 3;

/** 판별 5렌즈 — docs/study-os-spec.md §2.5 */
export type JudgeLens = "L1" | "L2" | "L3" | "L4" | "L5";

export interface LessonExample {
  /** 영어 예문 — **강조** 마크업으로 판단 포인트 표시 */
  en: string;
  ko: string;
  /** 한 줄 구조 주석 (예: "본동사 carries가 이미 있음 → 분사") */
  note?: string;
  /** 어법상 틀린 문장을 일부러 보여주는 자리면 true (오답 예시) */
  wrong?: boolean;
}

// ── 문장 구조 필기(DIAGRAM) ─────────────────────────────────────────────────

/** 구문 역할 — 색·괄호 표기의 축 */
export type SyntaxRole =
  | "S" // 주어
  | "V" // 본동사
  | "O" // 목적어
  | "C" // 보어
  | "M" // 수식어(전치사구·관계절·분사구 등)
  | "CONJ" // 접속사
  | "REL" // 관계사
  | "VERBAL" // 준동사(-ing / to-V / p.p.)
  | "X"; // 역할 없음(관사·기능어 등 중립 토큰)

export interface SyntaxToken {
  /** 토큰 표면형 (공백 없이 이어붙이면 원문이 되도록 저작) */
  t: string;
  role: SyntaxRole;
}

export interface DiagramLayer {
  /** 레이어 이름 (예: "① 수식어를 괄호로 걷어냅니다") */
  label: string;
  /** 이 레이어에서 강조되는 역할들 */
  roles: SyntaxRole[];
  /** 학생이 읽을 한 줄 설명 — 합니다체 */
  note: string;
}

// ── 레슨 내 문항(CHECK / RECAP) ─────────────────────────────────────────────
// GrammarItem 호환 부분집합. scripts/build-lesson-items.ts 가 드릴 뱅크로 추출한다.

export interface LessonChoiceItem {
  /** "{conceptId}-ls-001" */
  id: string;
  type: "CHOICE";
  difficulty: 1 | 2 | 3 | 4;
  /** {{blank}} 슬롯 1개를 포함한 영어 문장 */
  stem: string;
  options: string[];
  /** 정답 options 인덱스 */
  answer: number;
  translation: string;
  explanation: string;
  trapTags?: string[];
}

export interface LessonOxItem {
  id: string;
  type: "OX";
  difficulty: 1 | 2 | 3 | 4;
  /** [[u:...]] 밑줄 1개를 포함한 영어 문장 */
  sentence: string;
  isCorrect: boolean;
  /** isCorrect=false 일 때 바른 형태 */
  correction?: string;
  translation: string;
  explanation: string;
  trapTags?: string[];
}

export type LessonItem = LessonChoiceItem | LessonOxItem;

// ── 블록 16종 ───────────────────────────────────────────────────────────────

interface BlockBase {
  /** 레슨 내 유일 — "b1", "b2" … */
  id: string;
  tier: LessonTier;
  /** 블록 제목 — 없으면 타입 기본 라벨을 쓴다 */
  title?: string;
}

/** 1. 사전 인출 — 설명 전에 먼저 물어본다 */
export interface HookBlock extends BlockBase {
  type: "HOOK";
  /** 질문 — 합니다체 (예: "둘 중 어법상 옳은 문장은 무엇입니까?") */
  prompt: string;
  /** 후보 2개 (영어 문장) */
  options: string[];
  answer: number;
  /** 정답 공개 후 한 줄 — "왜 그런지는 이 레슨을 마치면 말할 수 있습니다" 류 */
  afterText: string;
}

/** 2. 오개념 직면 */
export interface MisconceptionBlock extends BlockBase {
  type: "MISCONCEPTION";
  /** 학생이 흔히 믿는 잘못된 명제 */
  myth: string;
  /** 사실 */
  truth: string;
  /** 반례 — myth 를 무너뜨리는 예문 */
  counterExample: LessonExample;
}

/** 3. 규칙 카드 */
export interface RuleBlock extends BlockBase {
  type: "RULE";
  rule: string;
  examples: LessonExample[];
}

/** 4. 문장 구조 필기 */
export interface DiagramBlock extends BlockBase {
  type: "DIAGRAM";
  tokens: SyntaxToken[];
  ko: string;
  /** 단계별로 켜지는 레이어 (2~4개) */
  layers: DiagramLayer[];
  /** 필기가 끝난 뒤의 결론 한 줄 */
  conclusion: string;
}

/** 5. 판별 절차 */
export interface AlgorithmBlock extends BlockBase {
  type: "ALGORITHM";
  steps: { text: string; applyNote: string }[];
  /** 절차를 적용해 볼 예문 */
  example: LessonExample;
}

/** 6. 워크드 예제 — 한 스텝씩 드러난다 */
export interface WorkedBlock extends BlockBase {
  type: "WORKED";
  /** 지시문 — 합니다체 */
  question: string;
  /** 영어 문제 본문(마크업 허용) */
  stem: string;
  steps: { title: string; body: string }[];
  answer: string;
  ko: string;
}

/** 7. 완성 문제 — 마지막 판단만 학생 몫 */
export interface CompletionBlock extends BlockBase {
  type: "COMPLETION";
  stem: string;
  /** 이미 풀려 있는 앞 단계들 */
  givenSteps: string[];
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
}

/** 8. 미세 확인 문항 */
export interface CheckBlock extends BlockBase {
  type: "CHECK";
  items: LessonItem[];
}

/** 9. 대조표 */
export interface ContrastBlock extends BlockBase {
  type: "CONTRAST";
  /** 두 열의 이름 (예: ["what", "that / which"]) */
  columns: [string, string];
  rows: { criterion: string; a: string; b: string }[];
  examples: LessonExample[];
}

/** 10. 분류 — 칩을 바구니로 (탭 방식, 드래그 금지) */
export interface SortBlock extends BlockBase {
  type: "SORT";
  instruction: string;
  buckets: { id: string; label: string }[];
  chips: { text: string; bucketId: string; why: string }[];
}

/** 11. 함정 */
export interface TrapBlock extends BlockBase {
  type: "TRAP";
  trapTitle: string;
  body: string;
  example: LessonExample;
}

/** 12. 시험 포인트 */
export interface ExamBlock extends BlockBase {
  type: "EXAM";
  scenes: {
    scope: "SCHOOL" | "CSAT";
    /** 이 개념이 그 시험에서 어떤 형태로 나오는가 */
    how: string;
    sample: { en: string; ask: string; answer: string };
  }[];
}

/** 13. 자기설명 유도 */
export interface SelfExplainBlock extends BlockBase {
  type: "SELF_EXPLAIN";
  question: string;
  options: { text: string; correct: boolean; feedback: string }[];
}

/** 14. 내 필기 — 저장되며 교사가 본다 */
export interface NoteBlock extends BlockBase {
  type: "NOTE";
  prompt: string;
  /** 입력 도우미 — 빈칸 뼈대 (예: "본동사가 ___면 밑줄은 ___이다") */
  scaffold?: string;
}

/** 15. 요약 노트 */
export interface SummaryBlock extends BlockBase {
  type: "SUMMARY";
  bullets: string[];
  keySentence: LessonExample;
}

/** 16. 마무리 3문항 */
export interface RecapBlock extends BlockBase {
  type: "RECAP";
  items: LessonItem[];
}

/**
 * 17. 생성 — 어절 타일을 탭 순서대로 배열해 문장을 만든다.
 * 근거: 생성 효과 메타분석(Bertsch et al. 2007, 86연구·445 ES, 평균 ≈ .40).
 * 드래그가 아니라 **탭 배열**이다(모바일 신뢰성).
 */
export interface GenerateBlock extends BlockBase {
  type: "GENERATE";
  /** 무엇을 만들라는 것인지 — 합니다체 */
  instruction: string;
  /** 한국어 뜻(목표 문장의 의미) */
  ko: string;
  /** 정답 문장의 어절 순서 — tiles 의 인덱스 배열이 아니라 어절 문자열 자체 */
  answer: string[];
  /** 화면에 흩어 놓을 타일(정답 어절 + 오답 미끼 1~2개, 셔플은 렌더러가 한다) */
  tiles: string[];
  explanation: string;
}

/**
 * 18. 오류 사냥 — 틀린 단어를 직접 지목하고 고친다(수능 어법 문항과 가장 가까운 형태).
 * 문장은 [[u:token]] 마크업으로 후보들을 표시하고, 그중 하나가 오류다.
 */
export interface ErrorHuntBlock extends BlockBase {
  type: "ERROR_HUNT";
  instruction: string;
  /** [[1:...]]~[[5:...]] 번호 밑줄을 포함한 문장·단락 */
  text: string;
  /** 틀린 밑줄 번호(1-based) */
  answer: number;
  correction: string;
  /** 밑줄별 판단 근거 — index 0 = ① */
  rationales: string[];
  ko: string;
}

/**
 * 19. 전이 — 실제 지문 문맥 안에서 이 구조를 찾아낸다.
 * "앱 안에서만 잘하는 학생"을 막는 마지막 방어선.
 */
export interface TransferBlock extends BlockBase {
  type: "TRANSFER";
  /** 3~5문장의 짧은 지문 — 목표 구조가 들어 있는 문장에 [[u:...]] 밑줄 */
  passage: string;
  instruction: string;
  /** 목표 구조가 들어 있는 문장의 해설 */
  found: string;
  gist: string;
}

// ── v2 필기노트 패밀리 (docs/study-os-spec.md §11.1) ────────────────────────
// 벽글 금지의 실행 수단 — "개념 하나 = 시각 단위 하나"로 강제 분해한다.

/**
 * 20. 용어 첫 대면 — "○○가 무엇입니까?"에 전제 지식 0으로 답한다.
 * 모든 레슨의 두 번째 블록(HOOK 다음) 권장. 용어를 모르는 학생이 기준선이다.
 */
export interface ConceptIntroBlock extends BlockBase {
  type: "CONCEPT_INTRO";
  /** 이 레슨이 여는 용어 (예: "품사") */
  term: string;
  /** 학생의 속마음 질문 (예: "품사가 대체 무엇입니까?") */
  question: string;
  /** 전제 0 정의 — 2줄 이내, 이 문장만 읽어도 뜻이 선다 */
  plain: string;
  /** 생활 비유 — 용어를 몸에 있는 것에 건다 */
  analogy: string;
  /** 이걸 알면 무엇이 되는가 — 배우는 이유 */
  whyItMatters: string;
}

/** NOTEBOOK 항목 핀 — 노트 여백의 표시 */
export type NotebookPin = "암기" | "주의" | "팁";

/**
 * 21. 필기노트 — 문제집 여백 필기의 이식. 항목(entry) 하나 = 개념 하나.
 * 좌측 노트줄 + 번호 + 핀 배지로 렌더된다. body 는 2문장 이내.
 */
export interface NotebookBlock extends BlockBase {
  type: "NOTEBOOK";
  /** 노트 도입 한 줄 (선택) */
  intro?: string;
  entries: {
    /** 소제목 (예: "명사 — 이름을 대는 말") */
    head: string;
    /** 설명 2문장 이내 */
    body: string;
    example?: LessonExample;
    pin?: NotebookPin;
  }[];
}

/**
 * 22. 개념 정리표 — 축이 2개 이상인 목록·비교는 표가 정답이다(8품사 표 등).
 * 행을 탭하면 예문이 열린다.
 */
export interface TableBlock extends BlockBase {
  type: "TABLE";
  /** 열 이름 2~4개 (예: ["품사", "하는 일", "예"]) */
  columns: string[];
  rows: {
    /** columns 와 같은 길이 */
    cells: string[];
    example?: LessonExample;
  }[];
  /** 표를 다 본 뒤의 한 줄 정리 */
  takeaway?: string;
}

/**
 * 23. 암기 카드 — 왜 외우는가부터 말하고, 외우는 장치를 주고, 셀프 리허설을 시킨다.
 * device 는 위트 허용 필드(§11.4).
 */
export interface MnemonicBlock extends BlockBase {
  type: "MNEMONIC";
  /** 외울 것 (예: "8품사의 이름") */
  target: string;
  /** 왜 외워야 하는가 — 암기의 존재 이유 */
  why: string;
  /** 암기 장치 — 두문자·리듬·연상 (위트 허용, 반말·이모지 금지) */
  device: string;
  /** 셀프 리허설 카드 — cue 를 보고 answer 를 떠올린 뒤 뒤집는다 */
  items: { cue: string; answer: string }[];
}

// ── v2 게임 패밀리 (docs/study-os-spec.md §11.2) ────────────────────────────
// 전부 탭 조작. 정답 공개 전 시도 필수. 모든 게임은 해설로 끝난다.

/**
 * 24. 암기 관문 — MNEMONIC 뒤에 배치해 암기를 검증한다.
 * 실패해도 강제 잠금은 없다("그래도 넘어가기" 상시 제공 — 자율성 보존).
 */
export interface MemoryGateBlock extends BlockBase {
  type: "MEMORY_GATE";
  /** 무엇을 확인하는 관문인가 */
  mission: string;
  /** SET: 순서 무관 전부 선택 / ORDER: 순서대로 탭 */
  mode: "SET" | "ORDER";
  /** 선택지 풀(정답 + 미끼). ORDER 모드는 미끼 없이 answers 만 섞어 놓아도 된다 */
  pool: string[];
  /** 정답 집합(SET) 또는 정답 순서(ORDER) — pool 의 부분집합 */
  answers: string[];
  /** 통과 문구 (위트 허용) */
  passText: string;
  /** 재도전 문구 (위트 허용, 비난 금지) */
  retryText: string;
}

/**
 * 25. 스피드 판정 — 제한시간 내 ○× 연타. 콤보가 쌓인다.
 * 판단의 자동화(유창성)를 노리는 블록 — 이분 판별 개념에 배치한다.
 */
export interface SpeedOxBlock extends BlockBase {
  type: "SPEED_OX";
  /** 게임 안내 한 줄 */
  instruction: string;
  /** 라운드당 제한시간(초) */
  timeLimitSec: number;
  rounds: {
    /** 판정 대상 — 영어 문장(마크업 허용) 또는 한국어 명제 */
    statement: string;
    isTrue: boolean;
    /** 한 줄 해설 */
    why: string;
  }[];
}

/**
 * 26. 문장 속 사냥 — 문장 어절 토큰을 탭해 대상 전부를 찾는다.
 * (예: "이 문장에서 명사를 전부 탭하십시오")
 */
export interface WordHuntBlock extends BlockBase {
  type: "WORD_HUNT";
  instruction: string;
  /** 사냥 대상의 이름 (예: "명사") — HUD 에 "명사 2/3" 로 표시 */
  hitLabel: string;
  /** 문장 어절 토큰 — hit=true 가 사냥 대상 */
  tokens: { t: string; hit: boolean }[];
  ko: string;
  /** 전부 찾은 뒤의 해설 */
  explain: string;
}

/**
 * 27. 짝 맞추기 — 좌·우 카드를 탭해 연결한다(용어↔정의, 예문↔분류).
 */
export interface PairMatchBlock extends BlockBase {
  type: "PAIR_MATCH";
  instruction: string;
  pairs: {
    a: string;
    b: string;
    /** 맞춘 뒤 보여줄 근거(선택) */
    why?: string;
  }[];
}

/**
 * 28. 이단아 찾기 — 넷 중 결이 다른 하나를 찾는다(분류 감각).
 */
export interface OddOneOutBlock extends BlockBase {
  type: "ODD_ONE_OUT";
  instruction: string;
  rounds: {
    words: string[];
    /** 이단아 index (0-based) */
    odd: number;
    why: string;
  }[];
}

/**
 * 29. 보스전 — 레슨 최종 관문. 하트 3개, 문항 수 = 보스 HP.
 * 정답 = 보스에게 일격 / 오답 = 하트 1 소실. 패배해도 재도전 무한.
 * bossName·intro·winText·loseText 는 위트 허용 필드(§11.4).
 */
export interface BossBlock extends BlockBase {
  type: "BOSS";
  /** 보스 이름 (예: "수식어 미궁의 문지기") */
  bossName: string;
  /** 등장 대사 — 개념을 조롱하는 게 아니라 개념으로 도발한다 */
  intro: string;
  questions: {
    /** 문제 — 영어 문장(마크업 허용) 또는 한국어 물음 */
    prompt: string;
    options: string[];
    answer: number;
    why: string;
  }[];
  winText: string;
  loseText: string;
}

export type LessonBlock =
  | HookBlock
  | MisconceptionBlock
  | RuleBlock
  | DiagramBlock
  | AlgorithmBlock
  | WorkedBlock
  | CompletionBlock
  | CheckBlock
  | ContrastBlock
  | SortBlock
  | TrapBlock
  | ExamBlock
  | SelfExplainBlock
  | NoteBlock
  | SummaryBlock
  | RecapBlock
  | GenerateBlock
  | ErrorHuntBlock
  | TransferBlock
  | ConceptIntroBlock
  | NotebookBlock
  | TableBlock
  | MnemonicBlock
  | MemoryGateBlock
  | SpeedOxBlock
  | WordHuntBlock
  | PairMatchBlock
  | OddOneOutBlock
  | BossBlock;

export type LessonBlockType = LessonBlock["type"];

// ── 레슨 ────────────────────────────────────────────────────────────────────

export type SchoolGrade =
  | "초3" | "초4" | "초5" | "초6"
  | "중1" | "중2" | "중3"
  | "고1" | "고2" | "고3";

export interface GradeStamp {
  /** 이 개념을 처음 배우는 학교급 */
  introduced: SchoolGrade;
  /** 어법 판별 대상이 되는 시점 — 판별 대상이 아니면 null */
  judged: SchoolGrade | null;
  /** 어법끝 5.0 TESTING POINT 번호 (예: ["TP01"]) — 없으면 빈 배열 */
  csatPoints: string[];
  /** 근거 (예: "별표4 #32(고 ●)", "천일문고등 CH08") */
  sourceRefs: string[];
}

export interface GrammarLesson {
  /** conceptId 와 동일 ("u01-c1", "b03-c2") */
  id: string;
  unitId: string;
  order: number;
  title: string;
  /** 개념 한 줄 요약 — 드릴 힌트 시트 상단에도 노출 */
  oneLiner: string;
  gradeStamp: GradeStamp;
  /** 이 개념이 훈련하는 판별 렌즈 */
  lenses: JudgeLens[];
  /** 자주 헷갈리는 개념 ID */
  confusableWith: string[];
  /** 예상 학습 시간(분) */
  estimatedMinutes: number;
  blocks: LessonBlock[];
}

// ── 저작 계약 (verify-lessons.ts 가 강제) ───────────────────────────────────

/** 모든 레슨에 반드시 있어야 하는 블록 타입 (v2: 노트·게임 필수화 — §11.3) */
export const REQUIRED_BLOCK_TYPES: LessonBlockType[] = [
  "HOOK",
  "CONCEPT_INTRO",
  "NOTEBOOK",
  "RULE",
  "DIAGRAM",
  "ALGORITHM",
  "WORKED",
  "CHECK",
  "TRAP",
  "BOSS",
  "SUMMARY",
  "RECAP",
];

/** 타입별 최소 개수 */
export const MIN_BLOCK_COUNT: Partial<Record<LessonBlockType, number>> = {
  RULE: 2,
  DIAGRAM: 1,
  WORKED: 1,
  CHECK: 2,
  TRAP: 1,
  CONCEPT_INTRO: 1,
  NOTEBOOK: 1,
  BOSS: 1,
};

/** v2 게임 블록 타입 집합 — 레슨당 3개 이상, 서로 다른 타입 2개 이상(§11.3) */
export const GAME_BLOCK_TYPES: LessonBlockType[] = [
  "MEMORY_GATE",
  "SPEED_OX",
  "WORD_HUNT",
  "PAIR_MATCH",
  "ODD_ONE_OUT",
  "BOSS",
];

/** 레슨당 게임 블록 하한 (BOSS 포함) */
export const MIN_GAME_BLOCKS = 3;
/** 게임 블록 타입 다양성 하한 */
export const MIN_GAME_TYPES = 2;
/** RULE 벽글 상한 — 초과분은 NOTEBOOK/TABLE 로 구조화한다(§11.3) */
export const MAX_RULE_CHARS = 180;

/** 레슨 1개의 최소 블록 수 */
export const MIN_BLOCKS_PER_LESSON = 12;

/** RECAP 문항 수(고정) */
export const RECAP_ITEM_COUNT = 3;

export const BLOCK_LABEL: Record<LessonBlockType, string> = {
  HOOK: "먼저 판단해 봅니다",
  MISCONCEPTION: "흔한 오해",
  RULE: "규칙",
  DIAGRAM: "문장 해부",
  ALGORITHM: "판단 절차",
  WORKED: "예제 풀이",
  COMPLETION: "마무리 판단",
  CHECK: "확인 문항",
  CONTRAST: "대조",
  SORT: "분류",
  TRAP: "함정",
  EXAM: "시험에서는",
  SELF_EXPLAIN: "이유 말하기",
  NOTE: "내 필기",
  SUMMARY: "요약 노트",
  RECAP: "마무리 점검",
  GENERATE: "직접 만들기",
  ERROR_HUNT: "오류 찾기",
  TRANSFER: "지문에서 찾기",
  CONCEPT_INTRO: "용어부터 엽니다",
  NOTEBOOK: "필기노트",
  TABLE: "정리표",
  MNEMONIC: "암기 카드",
  MEMORY_GATE: "암기 관문",
  SPEED_OX: "스피드 판정",
  WORD_HUNT: "문장 속 사냥",
  PAIR_MATCH: "짝 맞추기",
  ODD_ONE_OUT: "이단아 찾기",
  BOSS: "보스전",
};

/**
 * 학년(tier)별 블록 정책 — UX 리서치 근거.
 * - tier 1(기초): MISCONCEPTION 을 끈다(오개념 반박 문헌은 중등 이상에 적합).
 *   산출은 GENERATE(타일)로만. TRANSFER 없음.
 * - tier 2(표준): 전 블록 사용.
 * - tier 3(심화·수능): WORKED/COMPLETION 은 줄이고 ERROR_HUNT·TRANSFER 를 필수로 본다.
 */
export const TIER_BLOCK_POLICY: Record<
  LessonTier,
  { discouraged: LessonBlockType[]; emphasized: LessonBlockType[] }
> = {
  1: {
    discouraged: ["MISCONCEPTION", "TRANSFER"],
    emphasized: ["RULE", "WORKED", "COMPLETION", "GENERATE"],
  },
  2: { discouraged: [], emphasized: ["DIAGRAM", "CHECK", "SELF_EXPLAIN"] },
  3: {
    discouraged: [],
    emphasized: ["ERROR_HUNT", "TRANSFER", "TRAP", "EXAM"],
  },
};

export const TIER_LABEL: Record<LessonTier, string> = {
  1: "기초",
  2: "표준",
  3: "심화",
};

export const SYNTAX_ROLE_LABEL: Record<SyntaxRole, string> = {
  S: "주어",
  V: "본동사",
  O: "목적어",
  C: "보어",
  M: "수식어",
  CONJ: "접속사",
  REL: "관계사",
  VERBAL: "준동사",
  X: "",
};
