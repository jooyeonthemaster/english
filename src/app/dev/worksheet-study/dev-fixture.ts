// ============================================================================
// 학습지 스터디 모드 — dev 하네스 전용 증강 픽스처
//
// RECALL_RECOGNITION_FIXTURE(디자인 검증용 원본)를 깊은 복제 후 증강해,
// compileStudyPlan(mode:"intense") 시 11개 스테이지(reading·vocab-flash·
// vocab-quiz·vocab-match·chunk·grammar·cloze·order·translation·reproduction·
// exam) 전부가 생성되도록 만든 known-good 데이터.
//   1. passage: 문장별 직독직해 chunks(gloss/role/emphasis) — chunk·order 재료
//   2. grammar: example/exampleWrong/exampleCorrect — 어법 OX 재료
//   3. vocabulary: antonyms 보강 — 반의어 매칭 재료(synonyms 는 원본에 전부 있음)
//   4. learning-worksheet 섹션 신설 — 어법 택일·어순 배열·어휘 빈칸·수능추론 재료
//   (self-check 는 원본에 이미 있으므로 그대로 유지 — 실전 문제 스테이지 재료)
//
// ★ dev 전용 — 운영 코드에서 절대 import 금지 (src/app/dev/** 밖에서 참조 금지).
//    원본 fixture.ts 는 수정하지 않는다. 증강 결과는 analysisReportSchema 를
//    safeParse 로 통과한다(빌드 게이트에서 검증됨).
// ============================================================================

import type {
  AnalysisReport,
  LearningWorksheetSection,
  PassageSection,
} from "@/lib/passage-report/analysis-report/schema";
import { RECALL_RECOGNITION_FIXTURE } from "@/lib/passage-report/analysis-report/fixture";

type PassageChunk = NonNullable<PassageSection["sentences"][number]["chunks"]>[number];

// ── 1. 직독직해 청크 — text 를 순서대로 이어붙이면 en 과 정확히 일치(공백 포함) ──
const CHUNKS_BY_SENTENCE: Record<number, PassageChunk[]> = {
  1: [
    { text: "To understand memory, ", gloss: "기억을 이해하려면", role: "부사구(목적)" },
    { text: "imagine your brain ", gloss: "당신의 뇌를 상상해 보라", role: "동사구", emphasis: "core" },
    { text: "as a vast digital archive.", gloss: "거대한 디지털 기록보관소로", role: "전치사구" },
  ],
  2: [
    { text: "Accessing this data ", gloss: "이 데이터에 접근하는 것은", role: "주어(동명사구)" },
    { text: "depends on ", gloss: "~에 달려 있다", role: "동사구", emphasis: "core" },
    { text: "two primary methods: ", gloss: "두 가지 주된 방식에", role: "목적어" },
    { text: "Recall and Recognition.", gloss: "회상과 재인", role: "동격" },
  ],
  3: [
    { text: "Recall is ", gloss: "회상은 ~이다", role: "주어+동사" },
    { text: "like being asked ", gloss: "요구받는 것과 같다", role: "전치사구", emphasis: "core" },
    { text: "to write an essay ", gloss: "에세이를 쓰라고", role: "to부정사구" },
    { text: "on a blank page.", gloss: "백지 위에", role: "전치사구" },
  ],
  4: [
    { text: "You must search ", gloss: "당신은 뒤져야 한다", role: "주어+동사" },
    { text: "your internal 'hard drive' ", gloss: "내부의 '하드드라이브'를", role: "목적어" },
    { text: "and reconstruct information ", gloss: "그리고 정보를 재구성해야 한다", role: "병렬 동사구", emphasis: "core" },
    { text: "from scratch ", gloss: "맨 처음부터", role: "부사구" },
    { text: "without any hints.", gloss: "아무 단서도 없이", role: "전치사구" },
  ],
  5: [
    { text: "This requires ", gloss: "이것은 요구한다", role: "주어+동사" },
    { text: "significant cognitive effort, ", gloss: "상당한 인지적 노력을", role: "목적어", emphasis: "core" },
    { text: "which is why ", gloss: "그것이 ~한 이유다", role: "관계절(계속)" },
    { text: "short-answer questions or remembering a friend's phone number ", gloss: "단답형 문제나 친구 전화번호 떠올리기가", role: "주어(병렬)" },
    { text: "can feel like 'mental heavy lifting.'", gloss: "'정신적 중노동'처럼 느껴질 수 있다", role: "동사구" },
  ],
  6: [
    { text: "Recognition, ", gloss: "재인은", role: "주어" },
    { text: "on the other hand, ", gloss: "반면에", role: "연결어" },
    { text: "is like scrolling ", gloss: "넘겨보는 것과 같다", role: "동사구", emphasis: "core" },
    { text: "through a photo gallery ", gloss: "사진 갤러리를", role: "전치사구" },
    { text: "to find a specific image.", gloss: "특정 이미지를 찾으려고", role: "to부정사구(목적)" },
  ],
  7: [
    { text: "The information is already ", gloss: "정보는 이미 있다", role: "주어+동사" },
    { text: "in front of you: ", gloss: "당신 눈앞에", role: "전치사구" },
    { text: "you simply need to identify ", gloss: "당신은 확인만 하면 된다", role: "주어+동사", emphasis: "core" },
    { text: "whether it matches ", gloss: "그것이 일치하는지를", role: "whether절" },
    { text: "a previous memory.", gloss: "이전 기억과", role: "목적어" },
  ],
  8: [
    { text: "This is why ", gloss: "이것이 ~한 이유다", role: "주어+동사" },
    { text: "multiple-choice questions are easier ", gloss: "객관식 문제가 더 쉬운", role: "보어절" },
    { text: "— you don't have to create the answer, ", gloss: "답을 만들 필요가 없다", role: "부연", emphasis: "core" },
    { text: "just find it ", gloss: "그저 찾기만 하면 된다", role: "동사구" },
    { text: "among the options.", gloss: "선택지들 중에서", role: "전치사구" },
  ],
  9: [
    { text: "The main distinction ", gloss: "핵심적인 차이는", role: "주어" },
    { text: "is based on ", gloss: "~에 근거한다", role: "동사구", emphasis: "core" },
    { text: "the presence of cues.", gloss: "단서의 유무에", role: "목적어" },
  ],
  10: [
    { text: "While recognition provides ", gloss: "재인이 제공하는 반면", role: "부사절" },
    { text: "plenty of context, ", gloss: "풍부한 맥락을", role: "목적어" },
    { text: "recall forces the brain ", gloss: "회상은 뇌를 강요한다", role: "주어+동사", emphasis: "core" },
    { text: "to work in a vacuum.", gloss: "진공 속에서 작동하도록", role: "목적격보어" },
  ],
  11: [
    { text: "In learning, ", gloss: "학습에서", role: "부사구" },
    { text: "being able to recognize a word in a textbook ", gloss: "교과서의 단어를 알아볼 수 있는 것은", role: "주어(동명사구)" },
    { text: "is only the first step: ", gloss: "첫 단계일 뿐이다", role: "동사+보어" },
    { text: "true mastery is ", gloss: "진정한 숙달은 ~이다", role: "주어+동사", emphasis: "core" },
    { text: "the ability to recall it ", gloss: "그것을 회상해 내는 능력", role: "보어" },
    { text: "when no hints are provided.", gloss: "아무 단서도 주어지지 않을 때", role: "시간 부사절" },
  ],
};

// ── 2. 어법 함정 예문 — example 안에 exampleWrong 토큰이 글자 그대로 포함 ──
const GRAMMAR_EXAMPLES: Record<
  number,
  { example: string; exampleWrong: string; exampleCorrect: string }
> = {
  1: {
    example: "To understand memory, imagine your brain like a vast digital archive.",
    exampleWrong: "like",
    exampleCorrect: "as",
  },
  3: {
    example: "Recall is like asking to write an essay on a blank page.",
    exampleWrong: "asking",
    exampleCorrect: "being asked",
  },
  4: {
    example: "You must search your internal 'hard drive' and reconstructing information from scratch.",
    exampleWrong: "reconstructing",
    exampleCorrect: "reconstruct",
  },
  5: {
    example: "This requires significant cognitive effort, that is why remembering a phone number can feel like 'mental heavy lifting.'",
    exampleWrong: "that",
    exampleCorrect: "which",
  },
  9: {
    example: "The main distinction is based in the presence of cues.",
    exampleWrong: "based in",
    exampleCorrect: "based on",
  },
  11: {
    example: "Being able to recognize a word in a textbook are only the first step.",
    exampleWrong: "are",
    exampleCorrect: "is",
  },
};

// ── 3. 반의어 보강 (synonyms 는 원본 22행 전부 보유 — antonyms 만 채운다) ──
const ANTONYMS_BY_HEADWORD: Record<string, string> = {
  vast: "tiny, narrow",
  primary: "secondary",
  significant: "trivial, negligible",
  presence: "absence",
};

// ── 4. 실전 학습지 섹션 (원본에 없음 → 신설) ──
const LEARNING_WORKSHEET: LearningWorksheetSection = {
  kind: "learning-worksheet",
  title: "실전 학습지",
  note: "※ dev 증강 데이터 — 어법 택일·어순 배열·어휘 빈칸·수능추론 스테이지 재료입니다.",
  logicRows: [
    { sentenceNo: 1, functionLabel: "도입 · 비유 제시", keyPoint: "뇌를 거대한 디지털 기록보관소에 비유하며 화제를 엽니다." },
    { sentenceNo: 2, functionLabel: "분류 제시", keyPoint: "기억 인출을 회상(Recall)과 재인(Recognition) 두 방식으로 나눕니다." },
    { sentenceNo: 9, functionLabel: "핵심 대조", keyPoint: "두 방식의 결정적 차이가 단서(cue)의 유무임을 밝힙니다." },
    { sentenceNo: 11, functionLabel: "결론 · 주제", keyPoint: "단서 없이 회상해 내는 능력이 진정한 숙달이라고 결론짓습니다." },
  ],
  drills: {
    grammarChoices: [
      {
        no: 1,
        sentenceNo: 4,
        text: "You must search your internal 'hard drive' and [reconstruct / reconstructing] information from scratch.",
        choices: ["reconstruct", "reconstructing"],
        answer: "reconstruct",
        explanation: "조동사 must 뒤의 search 와 and 로 병렬 연결된 자리이므로 동사원형 reconstruct 가 맞습니다.",
      },
      {
        no: 2,
        sentenceNo: 7,
        text: "You simply need to identify [whether / that] it matches a previous memory.",
        choices: ["whether", "that"],
        answer: "whether",
        explanation: "일치하는지 '여부'를 확인하는 문맥이므로 whether 가 맞습니다. that 절은 '~인지'의 의미를 담지 못합니다.",
      },
      {
        no: 3,
        sentenceNo: 11,
        text: "Being able to recognize a word in a textbook [are / is] only the first step.",
        choices: ["are", "is"],
        answer: "is",
        explanation: "주어가 동명사구(Being able to ~)이므로 단수 취급하여 is 가 맞습니다.",
      },
    ],
    wordOrders: [
      {
        no: 1,
        sentenceNo: 3,
        korean: "회상은 백지에 에세이를 쓰라는 요구를 받는 것과 같다.",
        chunks: ["to write an essay", "Recall is like", "on a blank page.", "being asked"],
        answer: "Recall is like being asked to write an essay on a blank page.",
      },
      {
        no: 2,
        sentenceNo: 10,
        korean: "재인은 풍부한 맥락을 제공하는 반면, 회상은 뇌가 진공 상태에서 작동하도록 강요한다.",
        chunks: ["recall forces the brain", "While recognition provides", "to work in a vacuum.", "plenty of context,"],
        answer: "While recognition provides plenty of context, recall forces the brain to work in a vacuum.",
      },
    ],
  },
  workbookSet: {
    title: "유형별 워크북 훈련",
    topicGist: {
      title: "주제 / 요지",
      topicTitle: "Recall vs. Recognition : Why True Mastery Demands Retrieval Without Cues",
      gist: "단서가 주어지는 재인은 학습의 첫 단계일 뿐이며, 단서 없이 스스로 회상해 내는 능력이 진정한 숙달이라는 것이 글쓴이의 결론입니다.",
    },
    grammarSelection: {
      title: "어법 선택",
      passage:
        "To understand memory, imagine your brain (1) [as / like] a vast digital archive. Accessing this data depends on two primary methods: Recall and Recognition. Recall is like (2) [being asked / asking] to write an essay on a blank page. You must search your internal 'hard drive' and reconstruct information from scratch without any hints. This requires significant cognitive effort, (3) [that / which] is why short-answer questions or remembering a friend's phone number can feel like 'mental heavy lifting.' Recognition, on the other hand, is like scrolling through a photo gallery to find a specific image. The information is already in front of you: you simply need to identify whether it matches a previous memory. This is why multiple-choice questions are easier — you don't have to create the answer, just find it among the options. The main distinction is based on the presence of cues. While recognition provides plenty of context, recall forces the brain to work in a vacuum. In learning, being able to recognize a word in a textbook (4) [are / is] only the first step: true mastery is the ability to recall it when no hints are provided.",
      choices: [
        { no: 1, options: ["as", "like"], answer: "as", explanation: "「imagine A as B」 구문이므로 as 가 맞습니다." },
        { no: 2, options: ["being asked", "asking"], answer: "being asked", explanation: "'요구받는' 수동 의미이므로 수동형 동명사 being asked 가 맞습니다." },
        { no: 3, options: ["that", "which"], answer: "which", explanation: "콤마 뒤 계속적 용법 자리이므로 which 가 맞습니다. that 은 계속적 용법으로 쓸 수 없습니다." },
        { no: 4, options: ["are", "is"], answer: "is", explanation: "동명사구 주어는 단수 취급하므로 is 가 맞습니다." },
      ],
    },
    vocabularyCloze: {
      title: "어휘 빈칸 완성",
      passage:
        "Your brain stores memories like a vast digital (1) __________. Pulling out information with no hints at all is called (2) __________, which demands significant cognitive (3) __________. In contrast, (4) __________ only asks you to check whether the information in front of you (5) __________ a previous memory. The core distinction between the two lies in the presence of (6) __________.",
      blanks: [
        { no: 1, answer: "archive", meaning: "기록보관소" },
        { no: 2, answer: "recall", meaning: "회상" },
        { no: 3, answer: "effort", meaning: "노력" },
        { no: 4, answer: "recognition", meaning: "재인" },
        { no: 5, answer: "matches", meaning: "~와 일치하다" },
        { no: 6, answer: "cues", meaning: "단서" },
      ],
    },
    wordOrders: [
      {
        no: 1,
        korean: "진정한 숙달은 아무 단서도 주어지지 않을 때 그것을 회상해 내는 능력이다.",
        chunks: ["the ability to recall it", "True mastery is", "are provided.", "when no hints"],
        answer: "True mastery is the ability to recall it when no hints are provided.",
      },
      {
        no: 2,
        korean: "이 둘의 핵심적인 차이는 단서의 유무에 근거한다.",
        chunks: ["is based on", "The main distinction", "of cues.", "the presence"],
        answer: "The main distinction is based on the presence of cues.",
      },
    ],
  },
  inferenceSet: {
    title: "수능추론 문제",
    questions: [
      {
        no: 1,
        type: "주제",
        typeLabel: "주제 추론",
        prompt: "다음 글의 주제로 가장 적절한 것은?",
        choices: [
          { label: "①", text: "two ways of retrieving memory and the condition for true mastery" },
          { label: "②", text: "the role of sleep in consolidating long-term memories" },
          { label: "③", text: "advantages of multiple-choice tests over essay tests" },
          { label: "④", text: "how digital archives replace human memory in modern life" },
          { label: "⑤", text: "techniques for memorizing phone numbers quickly" },
        ],
        answerLabel: "①",
        answerText: "two ways of retrieving memory and the condition for true mastery",
        explanation: "글은 회상과 재인이라는 두 인출 방식을 대조한 뒤, 단서 없이 회상하는 능력이 진정한 숙달이라고 결론짓습니다. 따라서 ①이 주제로 가장 적절합니다.",
        distractors: [
          { label: "②", type: "근거 없음", reason: "수면과 기억 응고는 본문에 전혀 언급되지 않습니다." },
          { label: "③", type: "범위 축소", reason: "객관식이 쉬운 이유는 재인을 설명하는 예시일 뿐 글 전체의 논지가 아닙니다." },
          { label: "④", type: "핵심어 왜곡", reason: "디지털 아카이브는 뇌를 설명하는 비유일 뿐 대체 관계가 아닙니다." },
          { label: "⑤", type: "부분 일치", reason: "전화번호는 회상의 인지 부담을 보여 주는 지엽적 예시에 불과합니다." },
        ],
      },
      {
        no: 2,
        type: "제목",
        typeLabel: "제목 추론",
        prompt: "다음 글의 제목으로 가장 적절한 것은?",
        choices: [
          { label: "①", text: "Sleep: The Hidden Key to Memory" },
          { label: "②", text: "Two Doors to Memory: Why Recall Outweighs Recognition" },
          { label: "③", text: "How to Design Better Multiple-Choice Tests" },
          { label: "④", text: "The Vanishing Art of Handwritten Essays" },
          { label: "⑤", text: "Digital Archives: The Future of Data Storage" },
        ],
        answerLabel: "②",
        answerText: "Two Doors to Memory: Why Recall Outweighs Recognition",
        explanation: "두 인출 방식의 대조와 '회상이 진정한 숙달'이라는 결론을 모두 담은 ②가 제목으로 가장 적절합니다.",
        distractors: [
          { label: "①", type: "근거 없음", reason: "수면은 본문에 등장하지 않습니다." },
          { label: "③", type: "범위 축소", reason: "객관식 시험은 재인의 예시일 뿐 글의 목적이 아닙니다." },
          { label: "④", type: "근거 없음", reason: "손글씨 에세이의 쇠퇴는 본문과 무관합니다." },
          { label: "⑤", type: "핵심어 왜곡", reason: "디지털 아카이브는 비유이지 저장 기술 논의가 아닙니다." },
        ],
      },
      {
        no: 3,
        type: "함축",
        typeLabel: "함축 의미",
        prompt: "밑줄 친 work in a vacuum 이 다음 글에서 의미하는 바로 가장 적절한 것은?",
        passage: "While recognition provides plenty of context, recall forces the brain to work in a vacuum.",
        choices: [
          { label: "①", text: "to retrieve information without any external cues" },
          { label: "②", text: "to memorize facts in a perfectly quiet room" },
          { label: "③", text: "to process information faster than usual" },
          { label: "④", text: "to depend heavily on the options given" },
          { label: "⑤", text: "to erase unnecessary memories completely" },
        ],
        answerLabel: "①",
        answerText: "to retrieve information without any external cues",
        explanation: "바로 앞 절의 '재인은 풍부한 맥락을 제공한다'와의 대조로, 진공은 '단서가 전혀 없는 상태'를 뜻합니다. 따라서 ①이 맞습니다.",
        distractors: [
          { label: "②", type: "문자적 오독", reason: "물리적 정숙 환경이 아니라 단서 부재의 비유입니다." },
          { label: "③", type: "반대 방향", reason: "회상은 오히려 더 큰 인지 노력을 요구합니다." },
          { label: "④", type: "반대 방향", reason: "선택지에 의존하는 것은 재인의 특징입니다." },
          { label: "⑤", type: "근거 없음", reason: "기억 삭제는 본문에 언급되지 않습니다." },
        ],
      },
      {
        no: 4,
        type: "빈칸",
        typeLabel: "빈칸 추론",
        prompt: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
        passage: "The main distinction is based on the presence of __________.",
        choices: [
          { label: "①", text: "cues" },
          { label: "②", text: "effort" },
          { label: "③", text: "options" },
          { label: "④", text: "images" },
          { label: "⑤", text: "storage" },
        ],
        answerLabel: "①",
        answerText: "cues",
        explanation: "이어지는 문장이 '재인은 맥락이 풍부하고 회상은 진공에서 작동한다'고 부연하므로, 대조축은 단서(cues)의 유무입니다.",
        distractors: [
          { label: "②", type: "부분 일치", reason: "인지적 노력은 회상 쪽 특징일 뿐 두 방식을 가르는 축이 아닙니다." },
          { label: "③", type: "범위 축소", reason: "선택지는 재인의 한 예시(객관식)에만 해당합니다." },
          { label: "④", type: "핵심어 왜곡", reason: "사진은 갤러리 비유의 표면 어휘일 뿐입니다." },
          { label: "⑤", type: "근거 없음", reason: "저장 용량 문제는 본문에 없습니다." },
        ],
      },
      {
        no: 5,
        type: "요약",
        typeLabel: "요약문 완성",
        prompt: "다음 글의 내용을 한 문장으로 요약할 때, 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
        passage: "Whereas recognition merely requires (A) __________ presented information, recall demands (B) __________ it without any hints.",
        choices: [
          { label: "①", text: "identifying — reconstructing" },
          { label: "②", text: "creating — matching" },
          { label: "③", text: "identifying — copying" },
          { label: "④", text: "storing — reconstructing" },
          { label: "⑤", text: "ignoring — memorizing" },
        ],
        answerLabel: "①",
        answerText: "identifying — reconstructing",
        explanation: "재인은 눈앞의 정보가 기억과 일치하는지 식별(identify)만 하면 되고, 회상은 단서 없이 처음부터 재구성(reconstruct)해야 한다는 본문 그대로입니다.",
        distractors: [
          { label: "②", type: "원인-결과 전도", reason: "만들어 내는 쪽은 회상, 대조하는 쪽은 재인으로 방향이 뒤집혔습니다." },
          { label: "③", type: "부분 일치", reason: "(A)는 맞지만 회상은 베끼기가 아니라 재구성입니다." },
          { label: "④", type: "핵심어 왜곡", reason: "저장(storing)은 인출 방식의 대조와 무관합니다." },
          { label: "⑤", type: "근거 없음", reason: "무시(ignoring)는 본문에 근거가 없습니다." },
        ],
      },
    ],
  },
  questions: [],
  hiddenAnswers: false,
};

// ── 증강 조립 — 원본을 깊은 복제 후 패치(원본 불변) ──
function buildDevStudyFixture(base: AnalysisReport): AnalysisReport {
  const report = structuredClone(base);
  for (const section of report.sections) {
    if (section.kind === "passage") {
      for (const s of section.sentences) {
        const chunks = CHUNKS_BY_SENTENCE[s.n];
        if (chunks) s.chunks = chunks;
      }
    } else if (section.kind === "grammar") {
      for (const row of section.rows) {
        const ex = GRAMMAR_EXAMPLES[row.sentenceNo];
        if (ex) Object.assign(row, ex);
      }
    } else if (section.kind === "vocabulary") {
      for (const row of section.rows) {
        const ant = ANTONYMS_BY_HEADWORD[row.headword];
        if (ant && !row.antonyms) row.antonyms = ant;
      }
    }
  }
  if (!report.sections.some((s) => s.kind === "learning-worksheet")) {
    report.sections.push(LEARNING_WORKSHEET);
  }
  return report;
}

/** dev 하네스 전용 — intense 컴파일 시 11개 스테이지 전부 생성되는 증강 픽스처. */
export const DEV_STUDY_FIXTURE: AnalysisReport = buildDevStudyFixture(RECALL_RECOGNITION_FIXTURE);
