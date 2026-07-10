// Step3 문제생성 데모 fixture — 워크벤치 StructuredQuestionRenderer 의 raw 생성
// 출력(shape A) 계약을 따른다. "한 지문(The Gift of the Magi) → 전 유형" 데모라
// QUESTION_TYPE_GROUPS 의 모든 영어 유형에 대해 게이트 필드(hasStructuredFields,
// question-renderers.tsx:695)를 충족하는 예시 문제를 제공한다.
import { DEMO_PASSAGE } from "./passage";

export type DemoQuestionTypeId =
  // 수능/모의고사 객관식
  | "BLANK_INFERENCE"
  | "GRAMMAR_ERROR"
  | "GRAMMAR_CHOICE_COMBO"
  | "VOCAB_CHOICE"
  | "SENTENCE_ORDER"
  | "SENTENCE_INSERT"
  | "TOPIC"
  | "MAIN_IDEA"
  | "TITLE"
  | "IMPLIED_MEANING"
  | "REFERENCE"
  | "CONTENT_MATCH"
  | "SUMMARY_COMPLETE_MC"
  | "IRRELEVANT"
  // 내신 서술형
  | "CONDITIONAL_WRITING"
  | "SENTENCE_TRANSFORM"
  | "FILL_BLANK_KEY"
  | "SUMMARY_COMPLETE"
  | "SUMMARY_WRITING"
  | "WORD_ORDER"
  | "TOPIC_SENTENCE_WRITING"
  | "GRAMMAR_CORRECTION"
  // 어휘
  | "CONTEXT_MEANING"
  | "SYNONYM"
  | "ANTONYM";

export const DEMO_QUESTION_TYPE_IDS: DemoQuestionTypeId[] = [
  "BLANK_INFERENCE",
  "GRAMMAR_ERROR",
  "GRAMMAR_CHOICE_COMBO",
  "VOCAB_CHOICE",
  "SENTENCE_ORDER",
  "SENTENCE_INSERT",
  "TOPIC",
  "MAIN_IDEA",
  "TITLE",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "IRRELEVANT",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE",
  "SUMMARY_WRITING",
  "WORD_ORDER",
  "TOPIC_SENTENCE_WRITING",
  "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING",
  "SYNONYM",
  "ANTONYM",
];

const OPT = (label: string, text: string) => ({ label, text });

export const DEMO_QUESTIONS: Record<DemoQuestionTypeId, Record<string, unknown>> = {
  // ── 수능/모의고사 객관식 ──────────────────────────────────────────────
  BLANK_INFERENCE: {
    _typeId: "BLANK_INFERENCE",
    _typeLabel: "빈칸 추론",
    difficulty: "중급",
    direction: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
    passageWithBlank:
      "One dollar and eighty-seven cents. That was all. And sixty cents of it was in pennies. Pennies saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher until one's cheeks burned with the silent imputation of parsimony that such close dealing implied. Three times Della counted it. And the next day would be Christmas. There was clearly nothing to do but flop down on the shabby little couch and howl. So Della did it. Which instigates the moral reflection that life is made up of ________, with sniffles predominating.",
    options: [
      OPT("①", "endless celebrations and grand feasts"),
      OPT("②", "sobs, sniffles, and smiles"),
      OPT("③", "hard work and steady rewards"),
      OPT("④", "wealth, comfort, and leisure"),
      OPT("⑤", "silence, patience, and prayer"),
    ],
    correctAnswer: "②",
    explanation:
      "델라가 돈을 세고 흐느끼는 장면 뒤에 이어지는 '인생에 대한 성찰'은 흐느낌(sobs)·훌쩍임(sniffles)·미소(smiles)로 인생이 이루어져 있다는 것입니다. 빈칸 뒤의 'with sniffles predominating(그중 훌쩍임이 우세하다)'이 결정적 단서입니다.",
  },
  GRAMMAR_ERROR: {
    _typeId: "GRAMMAR_ERROR",
    _typeLabel: "어법 판단",
    difficulty: "중급",
    direction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
    passageWithMarkers:
      "One dollar and eighty-seven cents. That was all. And sixty cents of it ① <u>was</u> in pennies. Pennies ② <u>saved</u> one and two at a time by bulldozing the grocer until one's cheeks burned with the silent imputation of parsimony ③ <u>that</u> such close dealing implied. Three times Della counted ④ <u>them</u>. There was clearly nothing to do but ⑤ <u>flop</u> down on the shabby little couch and howl.",
    correctAnswer: "④",
    explanation:
      "④의 대상은 앞의 단수 명사구 'One dollar and eighty-seven cents(돈의 총액)'이므로 them 이 아니라 it 이어야 합니다. ①은 sixty cents(금액 단수 취급), ②는 과거분사 후치수식, ③은 목적격 관계대명사, ⑤는 nothing to do but+원형으로 모두 적절합니다.",
  },
  GRAMMAR_CHOICE_COMBO: {
    _typeId: "GRAMMAR_CHOICE_COMBO",
    _typeLabel: "네모 어법",
    difficulty: "중급",
    direction: "(A), (B), (C)의 각 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?",
    passageWithMarkers:
      "Pennies (A) [saved / saving] one and two at a time by bulldozing the grocer and the vegetable man and the butcher until one's cheeks burned with the silent imputation of parsimony that such close dealing (B) [implied / implying]. There was clearly nothing to do but flop down on the shabby little couch and howl, which instigates the moral reflection that life (C) [is made / making] up of sobs, sniffles, and smiles.",
    options: [
      OPT("①", "saved — implied — is made"),
      OPT("②", "saved — implying — making"),
      OPT("③", "saving — implied — is made"),
      OPT("④", "saving — implying — is made"),
      OPT("⑤", "saved — implied — making"),
    ],
    correctAnswer: "①",
    explanation:
      "(A) 페니는 '모아지는' 대상이므로 수동의 과거분사 saved, (B) that절의 동사 자리이므로 implied, (C) 「be made up of(~로 구성되다)」 수동 표현이므로 is made 가 적절합니다.",
  },
  VOCAB_CHOICE: {
    _typeId: "VOCAB_CHOICE",
    _typeLabel: "어휘 적절성",
    difficulty: "중급",
    direction: "다음 글의 밑줄 친 낱말 중, 문맥상 쓰임이 적절하지 않은 것은?",
    passageWithMarkers:
      "One dollar and eighty-seven cents. That was all. Pennies ① <u>saved</u> one and two at a time by bulldozing the grocer and the vegetable man and the butcher until one's cheeks ② <u>burned</u> with the silent imputation of parsimony that such close dealing implied. Three times Della ③ <u>counted</u> it. And the next day would be Christmas. There was clearly nothing to do but flop down on the ④ <u>luxurious</u> little couch and howl. So Della did it, which instigates the moral ⑤ <u>reflection</u> that life is made up of sobs, sniffles, and smiles.",
    correctAnswer: "④",
    explanation:
      "가난한 델라의 형편을 그리는 문맥이므로 소파는 '호화로운(luxurious)'이 아니라 '낡은(shabby)'이어야 합니다. 나머지 낱말은 모두 문맥에 자연스럽습니다.",
  },
  SENTENCE_ORDER: {
    _typeId: "SENTENCE_ORDER",
    _typeLabel: "글의 순서",
    difficulty: "중급",
    direction: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?",
    givenSentence: "One dollar and eighty-seven cents. That was all.",
    paragraphs: [
      {
        label: "(A)",
        text: "So Della flopped down on the shabby little couch and howled — which instigates the moral reflection that life is made up of sobs, sniffles, and smiles, with sniffles predominating.",
      },
      {
        label: "(B)",
        text: "And sixty cents of it was in pennies, saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher until one's cheeks burned with the silent imputation of parsimony.",
      },
      {
        label: "(C)",
        text: "Three times Della counted it. One dollar and eighty-seven cents. And the next day would be Christmas. There was clearly nothing to do but cry.",
      },
    ],
    options: [
      OPT("①", "(A) - (B) - (C)"),
      OPT("②", "(B) - (A) - (C)"),
      OPT("③", "(B) - (C) - (A)"),
      OPT("④", "(C) - (A) - (B)"),
      OPT("⑤", "(C) - (B) - (A)"),
    ],
    correctAnswer: "③",
    explanation:
      "돈의 구성(B: 페니로 모은 과정) → 돈을 세고 절망함(C) → 그래서 울었고 그에 대한 성찰(A)의 흐름이 자연스럽습니다. (A)의 So 와 성찰이 결말 신호입니다.",
  },
  SENTENCE_INSERT: {
    _typeId: "SENTENCE_INSERT",
    _typeLabel: "문장 삽입",
    difficulty: "중급",
    direction: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오.",
    givenSentence: "So Della did it.",
    passageWithMarkers:
      "One dollar and eighty-seven cents. That was all. ( ① ) And sixty cents of it was in pennies. ( ② ) Pennies saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher until one's cheeks burned with the silent imputation of parsimony that such close dealing implied. ( ③ ) Three times Della counted it. And the next day would be Christmas. ( ④ ) There was clearly nothing to do but flop down on the shabby little couch and howl. ( ⑤ ) Which instigates the moral reflection that life is made up of sobs, sniffles, and smiles, with sniffles predominating.",
    correctAnswer: "⑤",
    explanation:
      "주어진 문장의 it 은 '소파에 엎드려 흐느끼는 것'을 가리킵니다. 따라서 그 행동이 제시된 문장 바로 뒤인 ⑤ 가 가장 자연스럽습니다.",
  },
  TOPIC: {
    _typeId: "TOPIC",
    _typeLabel: "주제 추론",
    difficulty: "중급",
    direction: "다음 글의 주제로 가장 적절한 것은?",
    options: [
      OPT("①", "the difficulty of managing household finances"),
      OPT("②", "a devoted wife's desperation over a meager Christmas fund"),
      OPT("③", "effective strategies for negotiating with grocers"),
      OPT("④", "the commercialization of Christmas traditions"),
      OPT("⑤", "the psychological benefits of crying"),
    ],
    correctAnswer: "②",
    explanation:
      "한 푼씩 아껴 모았지만 크리스마스 선물을 사기엔 부족한 1달러 87센트 앞에서 무너지는 델라의 절박함이 글의 중심 내용이므로 주제는 ②입니다.",
  },
  MAIN_IDEA: {
    _typeId: "MAIN_IDEA",
    _typeLabel: "요지 추론",
    difficulty: "중급",
    direction: "다음 글의 요지로 가장 적절한 것은?",
    options: [
      OPT("①", "절약은 생활의 안정을 가져다주는 최고의 미덕이다."),
      OPT("②", "가난 속에서도 사랑하는 이를 위한 마음은 꺾이지 않는다."),
      OPT("③", "상인과의 흥정은 생활비 절감에 필수적이다."),
      OPT("④", "충동적인 감정 표현은 문제 해결에 도움이 되지 않는다."),
      OPT("⑤", "명절 소비 문화는 서민의 삶을 어렵게 만든다."),
    ],
    correctAnswer: "②",
    explanation:
      "볼이 화끈거리는 흥정까지 견디며 돈을 모은 이유가 사랑하는 사람의 선물이라는 점에서, 글의 요지는 ②가 가장 적절합니다.",
  },
  TITLE: {
    _typeId: "TITLE",
    _typeLabel: "제목 추론",
    difficulty: "중급",
    direction: "다음 글의 제목으로 가장 적절한 것은?",
    options: [
      OPT("①", "The True Value of Saving Money"),
      OPT("②", "Christmas Shopping on a Tight Budget"),
      OPT("③", "One Dollar and Eighty-Seven Cents: A Portrait of Devotion"),
      OPT("④", "How to Bargain with Local Merchants"),
      OPT("⑤", "The Economics of Holiday Gift-Giving"),
    ],
    correctAnswer: "③",
    explanation:
      "반복 강조되는 '1달러 87센트'는 부족한 액수 자체가 아니라 그 돈에 담긴 헌신을 상징합니다. 이 함축을 담은 ③이 제목으로 가장 적절합니다.",
  },
  IMPLIED_MEANING: {
    _typeId: "IMPLIED_MEANING",
    _typeLabel: "함축 의미",
    difficulty: "중급",
    direction: "밑줄 친 부분이 의미하는 바로 가장 적절한 것은?",
    passageWithUnderline:
      "Pennies saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher until <u>one's cheeks burned with the silent imputation of parsimony</u> that such close dealing implied. Three times Della counted it. One dollar and eighty-seven cents. And the next day would be Christmas.",
    options: [
      OPT("①", "Della felt proud of her careful spending habits"),
      OPT("②", "the merchants openly praised Della's thriftiness"),
      OPT("③", "Della felt ashamed of being seen as stingy while bargaining"),
      OPT("④", "the cold weather made Della's face turn red"),
      OPT("⑤", "Della was angry at the merchants for overcharging her"),
    ],
    correctAnswer: "③",
    explanation:
      "'뺨이 화끈거렸다'는 것은 지독한 흥정(close dealing)이 '인색하다(parsimony)'는 무언의 비난을 암시해 수치심을 느꼈다는 뜻입니다. 따라서 ③이 적절합니다.",
  },
  REFERENCE: {
    _typeId: "REFERENCE",
    _typeLabel: "지칭 추론",
    difficulty: "중급",
    direction: "밑줄 친 it[It]이 가리키는 대상이 나머지 넷과 다른 것은?",
    passageWithUnderline:
      "One dollar and eighty-seven cents. That was all. And sixty cents of ① <u>it</u> was in pennies. Three times Della counted ② <u>it</u>. ③ <u>It</u> was still one dollar and eighty-seven cents, and the next day would be Christmas. There was clearly nothing to do but flop down on the shabby little couch and howl, and Della knew ④ <u>it</u> was not enough for a gift. So Della did ⑤ <u>it</u> — she flopped down and howled.",
    options: [
      OPT("①", "①"),
      OPT("②", "②"),
      OPT("③", "③"),
      OPT("④", "④"),
      OPT("⑤", "⑤"),
    ],
    correctAnswer: "⑤",
    explanation:
      "①~④는 모두 '1달러 87센트(모은 돈)'를 가리키지만, ⑤의 it 은 '소파에 엎드려 흐느끼는 행동'을 가리킵니다.",
  },
  CONTENT_MATCH: {
    _typeId: "CONTENT_MATCH",
    _typeLabel: "내용 일치",
    difficulty: "중급",
    direction: "윗글의 내용과 일치하지 않는 것은?",
    options: [
      OPT("①", "델라가 모은 돈의 60센트는 페니(1센트 동전)였다."),
      OPT("②", "델라는 식료품상, 채소 장수, 정육점 주인과 흥정을 했다."),
      OPT("③", "델라는 돈을 세 번 세어 보았다."),
      OPT("④", "다음 날은 크리스마스였다."),
      OPT("⑤", "델라는 돈을 세고 나서 기쁨의 환호성을 질렀다."),
    ],
    correctAnswer: "⑤",
    explanation:
      "돈을 센 뒤 델라는 낡은 소파에 엎드려 흐느꼈다고 했으므로 ⑤는 글의 내용과 일치하지 않습니다.",
  },
  SUMMARY_COMPLETE_MC: {
    _typeId: "SUMMARY_COMPLETE_MC",
    _typeLabel: "요약문 완성(객관식)",
    difficulty: "중급",
    direction: "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
    summaryWithBlanks:
      "Despite the (A) ________ she endured while saving every penny, Della was driven to (B) ________ when she realized her savings were far too small for a Christmas gift.",
    options: [
      OPT("①", "(A) humiliation — (B) despair"),
      OPT("②", "(A) pleasure — (B) laughter"),
      OPT("③", "(A) humiliation — (B) triumph"),
      OPT("④", "(A) comfort — (B) despair"),
      OPT("⑤", "(A) praise — (B) regret"),
    ],
    correctAnswer: "①",
    explanation:
      "뺨이 화끈거리는 수치(humiliation)를 견디며 돈을 모았고, 크리스마스를 앞두고 절망(despair)해 흐느꼈다는 내용이므로 ①이 적절합니다.",
  },
  IRRELEVANT: {
    _typeId: "IRRELEVANT",
    _typeLabel: "무관한 문장",
    difficulty: "중급",
    direction: "다음 글에서 전체 흐름과 관계 없는 문장은?",
    passageWithNumbers:
      "One dollar and eighty-seven cents. That was all. ① And sixty cents of it was in pennies, saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher. ② Three times Della counted it, and the next day would be Christmas. ③ In the nineteenth century, the American economy grew rapidly thanks to the expansion of railroads. ④ There was clearly nothing to do but flop down on the shabby little couch and howl. ⑤ So Della did it, which instigates the moral reflection that life is made up of sobs, sniffles, and smiles.",
    correctAnswer: "③",
    explanation:
      "글은 크리스마스를 앞둔 델라의 절박한 상황을 그리는데, ③은 19세기 미국 경제 성장이라는 무관한 일반 정보이므로 흐름을 깨뜨립니다.",
  },

  // ── 내신 서술형 ─────────────────────────────────────────────────────
  CONDITIONAL_WRITING: {
    _typeId: "CONDITIONAL_WRITING",
    _typeLabel: "조건부 영작",
    difficulty: "중급",
    direction: "윗글의 내용을 참고하여, <조건>에 맞게 델라의 상황을 한 문장의 영어로 서술하시오.",
    referenceSentence:
      "There was clearly nothing to do but flop down on the shabby little couch and howl.",
    conditions: [
      "nothing to do but + 동사원형 구문을 사용할 것",
      "주어는 Della 로 할 것",
      "10단어 내외로 쓸 것",
    ],
    modelAnswer: "Della had nothing to do but cry on the shabby couch.",
    correctAnswer: "Della had nothing to do but cry on the shabby couch.",
    explanation:
      "「nothing to do but+동사원형」(~하는 것 외엔 할 일이 없다) 구문을 델라를 주어로 활용하면 됩니다.",
  },
  SENTENCE_TRANSFORM: {
    _typeId: "SENTENCE_TRANSFORM",
    _typeLabel: "문장 전환",
    difficulty: "중급",
    direction: "다음 문장을 <조건>에 맞게 바꿔 쓰시오.",
    originalSentence: "Three times Della counted it.",
    conditions: ["수동태 문장으로 바꿀 것", "by Della 를 포함할 것"],
    modelAnswer: "It was counted three times by Della.",
    correctAnswer: "It was counted three times by Della.",
    explanation:
      "목적어 it 을 주어로 올리고 「be+과거분사」로 바꾼 뒤 행위자 by Della 를 덧붙입니다.",
  },
  FILL_BLANK_KEY: {
    _typeId: "FILL_BLANK_KEY",
    _typeLabel: "핵심 표현 빈칸",
    difficulty: "중급",
    direction: "윗글의 내용에 맞게 빈칸에 들어갈 한 단어를 본문에서 찾아 쓰시오.",
    sentenceWithBlank:
      "Della's cheeks burned with the silent imputation of ________ that such close dealing implied.",
    answer: "parsimony",
    correctAnswer: "parsimony",
    explanation:
      "지독한 흥정이 암시하는 '인색함'이라는 무언의 비난 — 본문의 parsimony 가 정답입니다.",
  },
  SUMMARY_COMPLETE: {
    _typeId: "SUMMARY_COMPLETE",
    _typeLabel: "요약문 완성",
    difficulty: "중급",
    direction: "윗글을 요약한 아래 문장의 빈칸 (A), (B)에 들어갈 단어를 본문에서 찾아 쓰시오.",
    summaryWithBlanks:
      "Della saved (A) ________ one and two at a time through painful bargaining, but the total was so small that she could only (B) ________ on the shabby couch.",
    blanks: [
      { label: "(A)", answer: "pennies" },
      { label: "(B)", answer: "howl" },
    ],
    correctAnswer: "(A) pennies (B) howl",
    explanation:
      "델라는 페니(pennies)를 한 푼 두 푼 모았고, 절망해 소파에서 흐느꼈다(howl)는 내용입니다.",
  },
  SUMMARY_WRITING: {
    _typeId: "SUMMARY_WRITING",
    _typeLabel: "요약문 영작",
    difficulty: "중급",
    direction: "윗글의 내용을 요약한 문장이 되도록 <보기>의 단어를 활용하여 빈칸을 완성하시오.",
    koreanGloss:
      "고통스러운 절약에도 불구하고, 델라의 저축은 선물을 사기에 너무 부족해서 그녀는 울음을 터뜨렸다.",
    summaryWithBlanks:
      "Despite her painful saving, Della's money was (A) ________ for a gift, so she (B) ________ into tears.",
    blanks: [
      { label: "(A)", answer: "too small" },
      { label: "(B)", answer: "burst" },
    ],
    wordBank: ["too", "small", "burst", "enough", "laughed", "into"],
    correctAnswer: "(A) too small (B) burst",
    explanation:
      "「too+형용사(너무 ~한)」와 「burst into tears(울음을 터뜨리다)」 표현을 활용합니다. enough·laughed 는 미끼입니다.",
  },
  WORD_ORDER: {
    _typeId: "WORD_ORDER",
    _typeLabel: "단어 배열 영작",
    difficulty: "중급",
    direction: "우리말과 같은 뜻이 되도록 주어진 단어를 모두 한 번씩 사용하여 문장을 완성하시오.",
    contextHint: "낡은 소파에 엎드려 우는 것 외에는 할 일이 없었다.",
    scrambledWords: ["nothing", "was", "there", "do", "to", "but", "cry", "on", "the", "couch"],
    modelAnswer: "There was nothing to do but cry on the couch.",
    correctAnswer: "There was nothing to do but cry on the couch.",
    explanation:
      "「There was nothing to do but+동사원형」 구문으로 배열합니다.",
  },
  TOPIC_SENTENCE_WRITING: {
    _typeId: "TOPIC_SENTENCE_WRITING",
    _typeLabel: "주제문 영작",
    difficulty: "중급",
    direction: "윗글의 주제문이 되도록 주어진 단어를 모두 한 번씩 사용하여 문장을 완성하시오.",
    mode: "scrambled",
    koreanGloss: "인생은 흐느낌, 훌쩍임, 그리고 미소로 이루어져 있다.",
    scrambledWords: ["life", "is", "made", "up", "of", "sobs,", "sniffles,", "and", "smiles"],
    modelAnswer: "Life is made up of sobs, sniffles, and smiles.",
    correctAnswer: "Life is made up of sobs, sniffles, and smiles.",
    explanation:
      "「be made up of(~로 구성되다)」 표현을 활용해 글의 결말 성찰을 주제문으로 완성합니다.",
  },
  GRAMMAR_CORRECTION: {
    _typeId: "GRAMMAR_CORRECTION",
    _typeLabel: "문법 오류 수정",
    difficulty: "중급",
    direction: "다음 글의 밑줄 친 부분 중 어법상 틀린 것을 찾아 바르게 고치시오.",
    passageWithUnderline:
      "And sixty cents of it <u>was</u> in pennies. Three times Della counted <u>them</u>. There was clearly nothing to do but <u>flop</u> down on the shabby little couch and howl.",
    underlinedSegments: [
      { text: "was", isError: false },
      { text: "them", isError: true, errorPart: "them", correctedPart: "it" },
      { text: "flop", isError: false },
    ],
    errorPart: "them",
    correctedPart: "it",
    correctAnswer: "them → it",
    explanation:
      "센 대상은 단수 명사구 'One dollar and eighty-seven cents(돈의 총액)'이므로 them 이 아니라 it 이어야 합니다.",
  },

  // ── 어휘 ────────────────────────────────────────────────────────────
  CONTEXT_MEANING: {
    _typeId: "CONTEXT_MEANING",
    _typeLabel: "문맥 속 의미",
    difficulty: "중급",
    direction: "밑줄 친 close 와 같은 의미로 쓰인 것은?",
    passageWithUnderline:
      "Pennies saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher until one's cheeks burned with the silent imputation of parsimony that such <u>close</u> dealing implied.",
    options: [
      OPT("①", "Please close the door before you leave."),
      OPT("②", "The library is close to my house."),
      OPT("③", "He is known as a close negotiator who never wastes a cent."),
      OPT("④", "They have been close friends since childhood."),
      OPT("⑤", "The race was too close to call."),
    ],
    correctAnswer: "③",
    explanation:
      "본문의 close 는 '인색한, 한 푼도 허투루 쓰지 않는'의 뜻입니다. 같은 의미로 쓰인 것은 ③입니다.",
  },
  SYNONYM: {
    _typeId: "SYNONYM",
    _typeLabel: "동의어",
    difficulty: "중급",
    direction: "밑줄 친 parsimony 와 의미가 가장 가까운 것은?",
    targetWord: "parsimony",
    contextSentence:
      "One's cheeks burned with the silent imputation of parsimony that such close dealing implied.",
    passageWithUnderline:
      "One's cheeks burned with the silent imputation of <u>parsimony</u> that such close dealing implied.",
    options: [
      OPT("①", "generosity"),
      OPT("②", "stinginess"),
      OPT("③", "diligence"),
      OPT("④", "honesty"),
      OPT("⑤", "patience"),
    ],
    correctAnswer: "②",
    explanation:
      "parsimony(인색함)와 가장 가까운 말은 stinginess 입니다. generosity(관대함)는 반의어입니다.",
  },
  ANTONYM: {
    _typeId: "ANTONYM",
    _typeLabel: "반의어",
    difficulty: "중급",
    direction: "다음 글의 밑줄 친 단어와 그 반의어의 연결이 적절하지 않은 것은?",
    passageWithMarkers:
      "Pennies ① <u>saved</u> one and two at a time by bulldozing the grocer until one's cheeks burned with the silent imputation of ② <u>parsimony</u>. There was clearly nothing to do but flop down on the ③ <u>shabby</u> little couch and ④ <u>howl</u>. Which instigates the moral reflection that life is made up of sobs, sniffles, and smiles, with sniffles ⑤ <u>predominating</u>.",
    options: [
      OPT("①", "saved — spent"),
      OPT("②", "parsimony — generosity"),
      OPT("③", "shabby — worn"),
      OPT("④", "howl — laugh"),
      OPT("⑤", "predominating — yielding"),
    ],
    correctAnswer: "③",
    explanation:
      "shabby(낡은)의 반의어는 new/neat 이며, worn(낡은)은 오히려 동의어이므로 ③의 연결이 적절하지 않습니다.",
  },
};
