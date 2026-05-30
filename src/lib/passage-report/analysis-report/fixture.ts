import type { AnalysisReport } from "./schema";

/**
 * 레퍼런스 픽스처 — 사용자가 제공한 "VERITAS PRIME ANALYSIS No.037"
 * (Recall vs. Recognition) 의 내용을 새 스키마로 옮긴 것.
 *
 * 용도: AI 파이프라인을 붙이기 전에 렌더러 품질을 PDF와 1:1로 비교하기 위한
 *      known-good 데이터. (디자인 검증 전용 — 운영 데이터 아님)
 */
export const RECALL_RECOGNITION_FIXTURE: AnalysisReport = {
  schemaVersion: 1,
  brand: "VERITAS ENGLISH",
  docNo: "No.037",
  themeId: "veritas-navy",
  meta: {
    eyebrow: "PRIME PASSAGE ANALYSIS · 심층 지문 분석",
    titleKo: "기억의 두 얼굴 : 회상 vs. 재인",
    titleEn: "Recall vs. Recognition — Two Doors to Memory",
    category: "비문학 · 설명문",
    theme: "인지심리 · 기억 인출",
    difficulty: 3,
    difficultyNote: "(수능 3점)",
    solveTime: "3분 30초",
    examTypes: "빈칸추론·어법·요약",
  },
  sections: [
    {
      kind: "passage",
      note: "※ 문장 번호 ①–⑪는 본 자료 전체에서 상호 참조됩니다.",
      sentences: [
        { n: 1, en: "To understand memory, imagine your brain as a vast digital archive.", ko: "기억을 이해하려면, 당신의 뇌를 거대한 디지털 기록보관소라고 상상해 보라." },
        { n: 2, en: "Accessing this data depends on two primary methods: Recall and Recognition.", ko: "이 데이터에 접근하는 방식은 크게 두 가지 — 회상(Recall)과 재인(Recognition) — 에 달려 있다." },
        { n: 3, en: "Recall is like being asked to write an essay on a blank page.", ko: "회상은 백지에 에세이를 쓰라는 요구를 받는 것과 같다." },
        { n: 4, en: "You must search your internal 'hard drive' and reconstruct information from scratch without any hints.", ko: "당신은 내부의 '하드드라이브'를 뒤져, 아무 단서도 없이 처음부터 정보를 재구성해야 한다." },
        { n: 5, en: "This requires significant cognitive effort, which is why short-answer questions or remembering a friend's phone number can feel like 'mental heavy lifting.'", ko: "이는 상당한 인지적 노력을 요하는데, 바로 그 때문에 단답형 문제나 친구의 전화번호를 떠올리는 일이 '정신적 중노동'처럼 느껴진다." },
        { n: 6, en: "Recognition, on the other hand, is like scrolling through a photo gallery to find a specific image.", ko: "반면에 재인은, 특정 사진을 찾으려고 사진 갤러리를 넘겨보는 것과 같다." },
        { n: 7, en: "The information is already in front of you: you simply need to identify whether it matches a previous memory.", ko: "정보가 이미 눈앞에 있어서, 그것이 이전 기억과 일치하는지만 확인하면 된다." },
        { n: 8, en: "This is why multiple-choice questions are easier — you don't have to create the answer, just find it among the options.", ko: "객관식 문제가 더 쉬운 이유가 바로 이것이다 — 답을 만들어 낼 필요 없이, 선택지 중에서 찾기만 하면 된다." },
        { n: 9, en: "The main distinction is based on the presence of cues.", ko: "이 둘의 핵심적인 차이는 단서(cue)의 유무에 근거한다." },
        { n: 10, en: "While recognition provides plenty of context, recall forces the brain to work in a vacuum.", ko: "재인은 풍부한 맥락을 제공하는 반면, 회상은 뇌가 진공 상태에서 작동하도록 강요한다." },
        { n: 11, en: "In learning, being able to recognize a word in a textbook is only the first step: true mastery is the ability to recall it when no hints are provided.", ko: "학습에서 교과서의 단어를 알아보는 것(재인)은 첫 단계일 뿐이며, 진정한 숙달은 아무 단서도 주어지지 않을 때 그것을 회상해 내는 능력이다." },
      ],
      keywords: ["Recall", "Recognition", "cues", "memory", "reconstruct", "identify", "mastery", "blank page", "in front of you"],
    },
    {
      kind: "structure-map",
      variant: "compare",
      note: "※ 도입(비유) → 두 인출 방식 제시 → 핵심 대조(단서) → 결론(회상=숙달)의 4단 구조.",
      intro: { eyebrow: "DIGITAL ARCHIVE · 도입부 비유", label: "뇌 = 거대한 디지털 기록보관소(archive)" },
      branchLabel: "기억 인출(Retrieval)의 두 갈래",
      columns: [
        {
          titleEn: "RECALL",
          titleKo: "회상 · 回想",
          bullets: ["백지에 에세이 쓰기 (blank page)", "처음부터 정보를 재구성(reconstruct)", "단서(cue) 없음 — 진공 상태", "높은 인지 부하 (mental heavy lifting)"],
          footer: "주관식 · 단답형 시험",
        },
        {
          titleEn: "RECOGNITION",
          titleKo: "재인 · 再認",
          bullets: ["사진 갤러리 넘겨보기 (gallery)", "정보가 이미 눈앞에 존재", "일치 여부만 식별(identify)하면 끝", "낮은 인지 부하 — 맥락(context) 풍부"],
          footer: "객관식 · 선다형 시험",
        },
      ],
      coreDistinction: {
        eyebrow: "THE CORE DISTINCTION · 핵심 대조축",
        label: "단서(CUE)의 유무",
        detail: "단서 없음 ◀ RECALL ┃ RECOGNITION ▶ 단서 풍부",
      },
      conclusion: {
        eyebrow: "CONCLUSION · 글의 주제",
        text: "재인(recognition)은 학습의 '첫 단계'일 뿐이고, ★ 회상(recall)이야말로 진정한 숙달(true mastery)",
      },
      logicFlow: "뇌=디지털 아카이브 ▶ 인출의 두 방식(회상·재인) ▶ 결정적 차이는 '단서(cue)의 유무' ▶ 진정한 학습 = '단서 없는 회상'.",
    },
    {
      kind: "summary",
      sentences: [
        "기억 인출에는 회상(recall)과 재인(recognition) 두 가지 방식이 있다.",
        "회상은 단서 없이 백지에서 정보를 재구성(주관식)하고, 재인은 주어진 선택지에서 일치 여부만 확인(객관식)한다.",
        "둘의 핵심 차이는 단서(cue)의 유무이며, 진정한 숙달은 단서 없이 회상해 내는 능력이다.",
      ],
      thesisEn: "True mastery in learning is the ability to recall information without cues — not merely to recognize it.",
    },
    {
      kind: "grammar",
      note: "※ ⚠ 표시는 어법·서술형에서 실제로 출제되는 함정 포인트입니다.",
      rows: [
        { sentenceNo: 1, point: "명령문 + 「imagine A as B」", explanation: "'A를 B로 상상하다' 구조. 문두 To understand memory는 '~하기 위해'의 목적의 to부정사(부사적 용법).", trap: "as 자리에 like / for를 넣는 오답에 주의 — 「imagine+O+as+명사」가 정답 틀." },
        { sentenceNo: 3, point: "전치사 like + 동명사(수동형)", explanation: "like는 '~처럼'의 전치사 → 뒤에 동명사 being asked. be asked(요구받다)의 수동형 동명사다.", trap: "to ask · asking 오답 — '요구받는' 수동 의미이므로 being asked만 적절." },
        { sentenceNo: 4, point: "조동사 must + 동사원형 병렬", explanation: "must search ... and (must) reconstruct : and로 두 동사원형이 병렬. from scratch='처음부터'(숙어).", trap: "reconstructing(X) → 앞의 search와 병렬이므로 원형 reconstruct(O)." },
        { sentenceNo: 5, point: "계속적 용법 관계대명사 which", explanation: "「, which」가 앞 절 전체(this requires…effort)를 선행사로 받음. which is why='그래서 ~하다'. feel like+명사(보어).", trap: "콤마 뒤에는 that 불가 → which. 주어가 A or B(remembering 동명사 포함)인 점도 수일치 포인트." },
        { sentenceNo: 6, point: "to부정사의 부사적 용법(목적)", explanation: "to find a specific image='~을 찾기 위해'(목적). on the other hand=대조 연결어.", trap: "글의 순서·문장 삽입에서 on the other hand가 '앞=Recall' 신호로 쓰임." },
        { sentenceNo: 7, point: "whether 명사절(타동사의 목적어)", explanation: "identify whether it matches…: whether절이 identify의 목적어. 콜론(:)은 앞 문장의 부연.", trap: "if도 가능하나 전치사 뒤·to부정사 앞·격식체에서는 whether만 가능." },
        { sentenceNo: 8, point: "don't have to + 병렬구조", explanation: "don't have to create='만들 필요가 없다'(불필요). create … (just) find 병렬. 대시(—)는 부연.", trap: "must not(=금지)과 의미가 다름! '불필요(don't have to)'와 '금지(must not)' 구분." },
        { sentenceNo: 9, point: "수동태 숙어 be based on", explanation: "「be based on+명사」='~에 근거하다'. 전치사 on 고정.", trap: "basing/bases on(X). 빈칸 the presence of ___ → cues 단골 출제." },
        { sentenceNo: 10, point: "대조의 접속사 While", explanation: "While='~인 반면'(Whereas 류). 「While+S+V, S+V」 두 절을 대조. forces the brain to work(목적격보어 to부정사).", trap: "While(접속사) ↔ During(전치사) 구별. 뒤에 절이 오면 While." },
        { sentenceNo: 11, point: "동명사구 주어 수일치 + 시간부사절 수동", explanation: "Being able to recognize…(동명사구 주어→단수) is. the ability to recall(형용사적). when no hints are provided(수동).", trap: "주어가 동명사구이므로 are(X) → is(O). recognize ↔ recall 대조가 글의 주제." },
      ],
    },
    {
      kind: "exam-focus",
      rows: [
        { type: "빈칸추론", asks: "핵심 대조어 · 결론부 어휘", strategy: "논리축인 '단서(cue)의 유무'를 묻는 ⑨·⑪이 1순위. 예) \"…based on the presence of ____.\" → cues." },
        { type: "어법성 판단", asks: "밑줄형 어법", strategy: "being asked / reconstruct / which / whether / based / is(동명사 주어) — §04의 함정이 그대로 출제된다." },
        { type: "무관한 문장", asks: "글의 통일성", strategy: "비유(아카이브·갤러리)·대조와 무관한 정보가 정답. 예) \"Sleep helps consolidate long-term memory.\" 같은 문장이 삽입되면 오답 문장." },
        { type: "순서 · 삽입", asks: "연결어 · 지시어", strategy: "on the other hand(⑥), This is why(⑧), The main distinction(⑨)이 연결 고리. 대명사 it·this 지칭 확인." },
        { type: "주제 · 제목", asks: "요지 파악", strategy: "제목 예) \"Recall vs. Recognition: Two Doors to Memory\" / \"Why True Mastery Demands Recall.\" 전화번호 등 지엽적 예시는 함정." },
        { type: "함축 · 지칭", asks: "비유 해석", strategy: "work in a vacuum(⑩)=단서 없이 고립된 인출, mental heavy lifting(⑤)=큰 인지 부하. 비유의 함의를 우리말로 환원." },
      ],
    },
    {
      kind: "vocabulary",
      rows: [
        { headword: "vast", pos: "a.", meaning: "광대한, 막대한", synonyms: "immense, enormous" },
        { headword: "archive", pos: "n.", meaning: "기록보관소, 자료 저장고", synonyms: "repository, records" },
        { headword: "depend on", pos: "phr.", meaning: "~에 달려 있다, 좌우되다", synonyms: "rely on, hinge on" },
        { headword: "primary", pos: "a.", meaning: "주된, 일차적인", synonyms: "main, principal" },
        { headword: "recall", pos: "n./v.", meaning: "회상(하다), 기억해 냄", synonyms: "recollect, retrieve" },
        { headword: "recognition", pos: "n.", meaning: "재인, 알아봄, 인식", synonyms: "identification" },
        { headword: "reconstruct", pos: "v.", meaning: "재구성하다, 복원하다", synonyms: "rebuild, piece together" },
        { headword: "from scratch", pos: "idiom", meaning: "맨 처음부터, 무에서", synonyms: "from the beginning" },
        { headword: "cognitive", pos: "a.", meaning: "인지의, 인식의", synonyms: "mental, intellectual" },
        { headword: "significant", pos: "a.", meaning: "상당한, 중요한", synonyms: "considerable, substantial" },
        { headword: "effort", pos: "n.", meaning: "노력, 수고", synonyms: "exertion, endeavor" },
        { headword: "identify", pos: "v.", meaning: "식별하다, 알아보다", synonyms: "recognize, pinpoint" },
        { headword: "match", pos: "v./n.", meaning: "일치하다, 부합(물)", synonyms: "correspond, fit" },
        { headword: "distinction", pos: "n.", meaning: "구별, 차이(점)", synonyms: "difference, contrast" },
        { headword: "based on", pos: "phr.", meaning: "~에 근거한, 기반한", synonyms: "grounded on, founded on" },
        { headword: "presence", pos: "n.", meaning: "존재, 있음 (↔ absence)", synonyms: "existence" },
        { headword: "cue", pos: "n.", meaning: "단서, 신호, 실마리", synonyms: "hint, clue, prompt" },
        { headword: "plenty of", pos: "det.", meaning: "충분한, 많은", synonyms: "abundant, ample" },
        { headword: "context", pos: "n.", meaning: "맥락, 문맥, 정황", synonyms: "background, setting" },
        { headword: "vacuum", pos: "n.", meaning: "진공; (in a~) 고립 상태", synonyms: "void, isolation" },
        { headword: "mastery", pos: "n.", meaning: "숙달, 통달", synonyms: "command, proficiency" },
        { headword: "provide", pos: "v.", meaning: "제공하다, 주다", synonyms: "supply, offer, furnish" },
      ],
    },
    {
      kind: "parsing",
      items: [
        {
          sentenceNo: 5,
          en: "This requires significant cognitive effort, which is why short-answer questions or remembering a friend's phone number can feel like 'mental heavy lifting.'",
          parts: [
            { label: "[주절]", text: "This(S) / requires(V) / significant cognitive effort(O)" },
            { label: "[, which]", text: "계속적 용법 — 선행사 = 앞 절 전체" },
            { label: "[why 절 주어]", text: "short-answer questions or remembering … (A or B, 동명사 remembering 포함)" },
            { label: "[why 절 동사]", text: "can feel like + 명사 (보어)" },
          ],
          translation: "이는 상당한 인지적 노력을 요하며, 그 때문에 단답형 문제·전화번호 떠올리기가 '정신적 중노동'처럼 느껴진다.",
        },
        {
          sentenceNo: 11,
          en: "In learning, being able to recognize a word in a textbook is only the first step: true mastery is the ability to recall it when no hints are provided.",
          parts: [
            { label: "[부사구]", text: "In learning," },
            { label: "[주어]", text: "Being able to recognize a word … (동명사구 → 단수)" },
            { label: "[동사·보어]", text: "is only the first step" },
            { label: "[콜론(:)]", text: "앞 내용을 부연 · 대조" },
            { label: "[주어2/동사2/보어2]", text: "true mastery / is / the ability to recall it (to부정사 형용사적)" },
            { label: "[시간 부사절]", text: "when no hints are provided (수동태)" },
          ],
          translation: "학습에서 단어를 알아보는 것은 첫 단계일 뿐, 진정한 숙달은 단서가 없을 때 그것을 회상하는 능력이다.",
        },
      ],
    },
    {
      kind: "self-check",
      note: "※ '재인'을 넘어 '회상'으로 — 단서 없이 떠올릴 수 있는지 스스로 확인하세요.",
      questions: [
        { no: 1, type: "빈칸", prompt: "The main distinction is based on the presence of ______.", choices: ["cues", "options", "effort", "context"] },
        { no: 2, type: "어법", prompt: "밑줄 중 어색한 것? Recall is ⓐbeing asked to write an essay, so you must ⓑreconstruct it, ⓒwhich is why it ⓓfeel like heavy lifting." },
        { no: 3, type: "주제", prompt: "글의 주제로 가장 적절한 것?", choices: ["수면과 기억", "회상·재인의 차이와 숙달의 조건", "객관식의 장점", "디지털 기기 활용"] },
        { no: 4, type: "영영", prompt: "\"a hint or signal that helps you remember\" = ______" },
        { no: 5, type: "요약", prompt: "Whereas recognition only requires (A)______ an answer, recall demands (B)______ it from scratch." },
      ],
      answers: [
        { no: 1, answer: "① cues" },
        { no: 2, answer: "ⓓ (feel → feels, 주어 it 단수)" },
        { no: 3, answer: "②" },
        { no: 4, answer: "cue" },
        { no: 5, answer: "(A) identifying  (B) reconstructing" },
      ],
    },
  ],
};
