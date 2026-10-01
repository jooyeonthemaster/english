// 학교별 내신 적중 예측 팩(exam-forecast) — 데이터 계약.
//
// 한 팩 = 한 학교·한 시험(예: 한광고 2학년 2학기 1차). 지문(범위) → 문항(기출 원본 reference +
// 예측 forecast) → 봉투 모의고사 세트. DB 테이블은 prisma/migrations-manual/20261001_exam_forecast.sql.
//
// 문항 본문은 ForecastQBody(JSON) 하나로 렌더한다. 지문 마크업 문법은 markup.tsx 참고:
//   <u>밑줄</u> <b>굵게</b> <i>기울임</i> · [[BLANK]] · [[BLANK:A]] · [[SLOT:3]] · 빈 줄(\n\n)=새 문단

export type ForecastKind = "MC" | "ESSAY";

export type ForecastQType =
  // 대의 파악
  | "TOPIC_KO"
  | "TOPIC_EN"
  | "TITLE_EN"
  | "GIST_EN"
  | "GIST_KO"
  | "CLAIM_KO"
  // 세부 내용
  | "MISMATCH_KO"
  | "MISMATCH_EN"
  | "MATCH_EN"
  | "REFERENCE"
  // 연결어
  | "CONNECTIVE_ABC"
  // 어법
  | "GRAMMAR_WRONG"
  | "GRAMMAR_RIGHT_COMBO"
  | "GRAMMAR_CHOICE_ABC"
  | "GRAMMAR_COUNT"
  // 어휘
  | "VOCAB_WRONG"
  | "VOCAB_CHOICE_ABC"
  | "VOCAB_PHRASE_AWKWARD"
  // 추론
  | "BLANK"
  | "BLANK_AB"
  | "IMPLICATION"
  // 간접 쓰기
  | "ORDER"
  | "IRRELEVANT"
  | "INSERTION"
  | "SUMMARY"
  // 논술형(서술형)
  | "ESSAY_SUMMARY_ARRANGE"
  | "ESSAY_TOPIC_ARRANGE"
  | "ESSAY_BLANK_ARRANGE_FIX"
  | "ESSAY_GRAMMAR_FIX"
  | "ESSAY_SENTENCE_ARRANGE"
  | "ESSAY_SUMMARY_WRITE"
  | "ESSAY_WORD_FILL";

export type ForecastOptionLayout =
  /** 한 줄에 하나 (기본) */
  | "list"
  /** 2열 격자 ①② / ③④ / ⑤ — 순서 배열 선지 */
  | "grid2"
  /** 3열 격자 ①②③ / ④⑤ — (a),(b) 조합 선지 */
  | "grid3"
  /** (A) … (B) … (C) 머리행 + 행 5개 — 연결어·네모 어휘·요약문 */
  | "table"
  /** 선지마다 (A) 줄 / (B) 줄을 쌓는다 — 빈칸 (A),(B) */
  | "stack";

export interface ForecastBox {
  /** 상자 머리말 — 「해석」「요약문」「보기」 (괄호는 렌더러가 붙인다) */
  label: string;
  /** 마크업 */
  text: string;
  align?: "center" | "left";
}

export interface ForecastAnswerLine {
  /** "(A)" 처럼 줄 앞 라벨. 비우면 라벨 없이 밑줄만 */
  label: string;
  points?: number;
  /** 답안 밑줄 줄 수(기본 1) */
  lines?: number;
}

export interface ForecastQBody {
  /** 발문 — 번호·배점 제외. 「않은」 처럼 밑줄 강조는 <u> 로 */
  stem: string;
  /**
   * 묶음 발문 — 〔10~11〕 처럼 여러 문항이 공유하는 지시문(번호 범위 제외).
   * 같은 groupKey 를 가진 연속 문항은 첫 문항 앞에 한 번만 찍고, 각 문항은 「번호. 〔배점〕」만 남는다.
   */
  groupStem?: string;
  groupKey?: string;
  /** 상자 안 주어진 글/주어진 문장 */
  givenBox?: string;
  /** 지문 본문 마크업 */
  passage: string;
  /** 요약문 상자(↓ 화살표 뒤) */
  summaryBox?: string;
  /** 논술형 상자들: [해석] [요약문] [보기] */
  boxes?: ForecastBox[];
  /** 선지 마크업(최대 5). stack 레이아웃은 "(A) …\n(B) …" */
  options?: string[];
  optionLayout?: ForecastOptionLayout;
  /** table 레이아웃용 — headers 예: ["(A)","(B)","(C)"], rows 5행 */
  optionTable?: { headers: string[]; rows: string[][] };
  /** 논술형 답란 */
  answerLines?: ForecastAnswerLine[];
  /** 각주 "* word: 뜻" */
  footnotes?: string[];
}

export interface ForecastTransform {
  /** 원문 대비 바꾼 곳(단어 교체·문장 삽입/삭제·어순) */
  baseChanges: string[];
  /** 빈칸·밑줄·네모·삽입 위치를 왜 거기에 뒀는지 */
  targetRationale?: string;
  /** 오답 선지 설계(매력도·함정 유형) */
  distractorDesign?: string;
}

/** 문항 1건(직렬화 형태 — DB exam_forecast_questions 행과 1:1) */
export interface ForecastQuestion {
  id: string;
  code: string;
  passageCode: string;
  /** reference = 실제 기출 원본, forecast = 예측 문항 */
  role: "reference" | "forecast";
  qtype: ForecastQType;
  kind: ForecastKind;
  /** 1(쉬움)~5(최상) */
  difficulty: number;
  points: number | null;
  body: ForecastQBody;
  /** MC: "①".."⑤" · ESSAY: 모범답안 */
  answer: string;
  /** 해설(한국어) */
  explanation: string;
  /** 출제 예측 근거 — 이 선생님이 왜 이 지문을 이 유형으로 낼 것인가 */
  rationale: string;
  transform: ForecastTransform;
  tags: string[];
  sortOrder: number;
}

export interface ForecastSetItem {
  /** 1..27 = 선택형, 101.. = 논술형 1.. */
  number: number;
  questionId: string;
  points: number;
}

export interface ForecastSet {
  id: string;
  no: number;
  title: string;
  /** 난이도 단계 라벨 */
  tier: string;
  description: string;
  items: ForecastSetItem[];
  /** 저장소 경로(비공개 버킷) — paper=문제지, answers=정답·해설 */
  pdfPaths: { paper?: string; answers?: string };
}

export interface ForecastPassage {
  id: string;
  code: string;
  /** "학평" | "올림포스" | "교과서" | "기출" */
  sourceGroup: string;
  sourceLabel: string;
  sortOrder: number;
  titleKo: string;
  titleEn: string | null;
  text: string;
  sentences: string[];
  footnotes: string[];
  /** 지문 분석(논리 흐름·어법 포인트·핵심 어휘·원 문항) */
  analysis: Record<string, unknown>;
  /** 유형별 출제 예측(확률·근거) */
  prediction: Record<string, unknown>;
}

export interface ForecastQTypeMeta {
  label: string;
  short: string;
  kind: ForecastKind;
  family: "대의" | "세부" | "연결어" | "어법" | "어휘" | "추론" | "간접쓰기" | "논술형";
  /** 기출(한광고 2026-1학기 1차)에서 이 유형이 쓰인 문항 번호 */
  seenIn: string[];
  defaultStem: string;
  defaultLayout?: ForecastOptionLayout;
}

/** 유형 카탈로그 — 발문은 한광고 기출 자구 그대로(띄어쓰기·쉼표 포함). 제작 규칙의 정본은 docs/hanguang-2610/generation-recipes-*.md */
export const FORECAST_QTYPES: Record<ForecastQType, ForecastQTypeMeta> = {
  TOPIC_KO: { label: "주제(한글 선지)", short: "주제", kind: "MC", family: "대의", seenIn: ["1"], defaultStem: "다음 글의 주제로 가장 적절한 것은?" },
  TOPIC_EN: { label: "주제(영어 선지)", short: "주제", kind: "MC", family: "대의", seenIn: ["8"], defaultStem: "다음 글의 주제로 가장 적절한 것은?" },
  TITLE_EN: { label: "제목", short: "제목", kind: "MC", family: "대의", seenIn: ["6"], defaultStem: "다음 글의 제목으로 가장 적절한 것은?" },
  GIST_EN: { label: "요지(영어 선지)", short: "요지", kind: "MC", family: "대의", seenIn: ["7"], defaultStem: "다음 글의 요지로 가장 적절한 것은?" },
  GIST_KO: { label: "요지(한글 선지)", short: "요지", kind: "MC", family: "대의", seenIn: [], defaultStem: "다음 글의 요지로 가장 적절한 것은?" },
  CLAIM_KO: { label: "주장", short: "주장", kind: "MC", family: "대의", seenIn: [], defaultStem: "다음 글에서 필자가 주장하는 바로 가장 적절한 것은?" },
  MISMATCH_KO: { label: "내용 불일치(한글 선지)", short: "불일치", kind: "MC", family: "세부", seenIn: ["2"], defaultStem: "다음 글의 내용과 일치하지 <u>않는</u> 것은?" },
  MISMATCH_EN: { label: "내용 불일치(영어 선지)", short: "불일치", kind: "MC", family: "세부", seenIn: ["26"], defaultStem: "다음 글의 내용과 일치하지 <u>않는</u> 것은?" },
  MATCH_EN: { label: "내용 일치(영어 선지)", short: "일치", kind: "MC", family: "세부", seenIn: [], defaultStem: "다음 글의 내용과 일치하는 것은?" },
  REFERENCE: { label: "지칭 대상", short: "지칭", kind: "MC", family: "세부", seenIn: [], defaultStem: "밑줄 친 (a)~(e) 중에서 가리키는 대상이 나머지 넷과 <u>다른</u> 것은?" },
  CONNECTIVE_ABC: { label: "연결어 (A)(B)(C)", short: "연결어", kind: "MC", family: "연결어", seenIn: ["3"], defaultStem: "다음 빈칸 (A),(B),(C) 에 들어갈 말로 가장 적절한 것은?", defaultLayout: "table" },
  GRAMMAR_WRONG: { label: "어법 — 틀린 것", short: "어법", kind: "MC", family: "어법", seenIn: ["4", "9"], defaultStem: "다음 글의 밑줄 친 부분 중, 어법상 <u>틀린</u> 것은?" },
  GRAMMAR_RIGHT_COMBO: { label: "어법 — 맞는 것끼리 짝", short: "어법조합", kind: "MC", family: "어법", seenIn: ["10", "11"], defaultStem: "다음 밑줄 친 (a)~(e)중 어법상 맞는 것끼리만 짝지은 것을 고르시오.", defaultLayout: "grid3" },
  GRAMMAR_CHOICE_ABC: { label: "어법 — 네모 (A)(B)(C)", short: "어법네모", kind: "MC", family: "어법", seenIn: [], defaultStem: "(A), (B), (C)의 각 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?", defaultLayout: "table" },
  GRAMMAR_COUNT: { label: "어법 — 틀린 개수", short: "어법개수", kind: "MC", family: "어법", seenIn: [], defaultStem: "다음 글의 밑줄 친 부분 중, 어법상 <u>틀린</u> 것의 개수는?" },
  VOCAB_WRONG: { label: "어휘 — 적절하지 않은 낱말", short: "어휘", kind: "MC", family: "어휘", seenIn: ["13", "14"], defaultStem: "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 <u>않은</u> 것을 고르시오." },
  VOCAB_CHOICE_ABC: { label: "어휘 — (A)(B)(C) 택일", short: "어휘택일", kind: "MC", family: "어휘", seenIn: ["12"], defaultStem: "밑줄 친 (A),(B),(C)에서 문맥에 맞는 낱말로 바르게 짝지어진 것은?", defaultLayout: "table" },
  VOCAB_PHRASE_AWKWARD: { label: "어휘 — 어색한 구", short: "어휘(구)", kind: "MC", family: "어휘", seenIn: ["15"], defaultStem: "다음 글의 밑줄 친 부분 중 문맥상 낱말의 쓰임이 <u>어색한</u> 것은?" },
  BLANK: { label: "빈칸", short: "빈칸", kind: "MC", family: "추론", seenIn: ["16"], defaultStem: "다음 빈칸에 들어갈 말로 가장 적절한 것은?" },
  BLANK_AB: { label: "빈칸 (A),(B)", short: "빈칸AB", kind: "MC", family: "추론", seenIn: ["17", "18"], defaultStem: "다음 빈칸 (A),(B)에 들어갈 말로 가장 적절한 것을 고르시오.", defaultLayout: "stack" },
  IMPLICATION: { label: "함축 의미", short: "함축", kind: "MC", family: "추론", seenIn: ["19", "20"], defaultStem: "밑줄 친 부분이 다음 글에서 의미하는 바로 가장 적절한 것을 고르시오." },
  ORDER: { label: "글의 순서", short: "순서", kind: "MC", family: "간접쓰기", seenIn: ["5", "21"], defaultStem: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?", defaultLayout: "grid2" },
  IRRELEVANT: { label: "무관한 문장", short: "무관", kind: "MC", family: "간접쓰기", seenIn: ["22", "23"], defaultStem: "다음 글에서 전체 흐름과 관계 <u>없는</u> 문장을 고르시오." },
  INSERTION: { label: "문장 삽입", short: "삽입", kind: "MC", family: "간접쓰기", seenIn: ["24", "25"], defaultStem: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오." },
  SUMMARY: { label: "요약문", short: "요약", kind: "MC", family: "간접쓰기", seenIn: ["27"], defaultStem: "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈 칸 (A), (B)에 들어갈 말로 가장 적절한 것을 고르면?", defaultLayout: "table" },
  ESSAY_SUMMARY_ARRANGE: { label: "논술형 — 요약문 [보기] 배열", short: "서술:요약배열", kind: "ESSAY", family: "논술형", seenIn: ["논술형 1"], defaultStem: "다음 글의 내용을 한 문장으로 요약하고자 한다. 주어진 〔해석〕에 맞게 〔요약문〕을 완성할 때 〔요약문〕의 빈 칸 (A)를 완성하시오(단, 〔보기〕의 단어를 변형없이 한 번씩만 모두 사용하여 17단어의 영어로 논술할 것.)" },
  ESSAY_TOPIC_ARRANGE: { label: "논술형 — 주제 [보기] 배열", short: "서술:주제배열", kind: "ESSAY", family: "논술형", seenIn: ["논술형 2"], defaultStem: "〔보기〕의 단어를 변형없이 한 번씩만 모두 사용하여 다음 글의 주제를 15단어의 영어로 논술하시오." },
  ESSAY_BLANK_ARRANGE_FIX: { label: "논술형 — 빈칸 배열+어법 수정", short: "서술:빈칸수정", kind: "ESSAY", family: "논술형", seenIn: ["논술형 3"], defaultStem: "다음 글의 빈칸 (A), (B)를 각각 8단어씩의 영어로 완성하시오. ( 단, 〔보기〕에 주어진 단어만을 한번씩만 모두 사용하여야 하고 그 중 어법상 <u>틀린</u> 두 곳은 수정하여 답안을 작성할 것.)" },
  ESSAY_GRAMMAR_FIX: { label: "논술형 — 어법 오류 고치기", short: "서술:어법수정", kind: "ESSAY", family: "논술형", seenIn: [], defaultStem: "다음 글의 밑줄 친 부분 중 어법상 틀린 것을 모두 찾아 바르게 고쳐 쓰시오." },
  ESSAY_SENTENCE_ARRANGE: { label: "논술형 — 문장 배열 영작", short: "서술:배열영작", kind: "ESSAY", family: "논술형", seenIn: [], defaultStem: "다음 글의 밑줄 친 우리말 의미가 되도록 [보기]의 단어를 모두 한 번씩만 사용하여 영작하시오." },
  ESSAY_SUMMARY_WRITE: { label: "논술형 — 요약문 빈칸 쓰기", short: "서술:요약쓰기", kind: "ESSAY", family: "논술형", seenIn: [], defaultStem: "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 알맞은 말을 본문에서 찾아 쓰시오." },
  ESSAY_WORD_FILL: { label: "논술형 — 빈칸 낱말 쓰기", short: "서술:낱말", kind: "ESSAY", family: "논술형", seenIn: [], defaultStem: "다음 글의 빈칸에 들어갈 알맞은 낱말을 주어진 철자로 시작하여 쓰시오." },
};

export const FORECAST_FAMILIES = ["대의", "세부", "연결어", "어법", "어휘", "추론", "간접쓰기", "논술형"] as const;

export function isEssayNumber(n: number): boolean {
  return n > 100;
}

export function essayLabel(n: number): string {
  return `논술형 ${n - 100}`;
}
