// Step2 분석 데모 fixture — 워크벤치 분석 리포트 스키마(AnalysisReport) 그대로
// 수제 작성. 렌더는 실제 ReportPages(순수 렌더러)가 담당한다.
// 필드 구성은 known-good 예시(src/lib/passage-report/analysis-report/fixture.ts)를 따른다.
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";

// 7문장 전체 지문(①–⑦) — 학습지 문항들이 공유하는 원문 평문.
const MAGI_PASSAGE =
  "One dollar and eighty-seven cents. That was all. And sixty cents of it was in pennies. Pennies saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher until one's cheeks burned with the silent imputation of parsimony that such close dealing implied. Three times Della counted it. One dollar and eighty-seven cents. And the next day would be Christmas. There was clearly nothing to do but flop down on the shabby little couch and howl. So Della did it. Which instigates the moral reflection that life is made up of sobs, sniffles, and smiles, with sniffles predominating.";

// 함축의미 문항용 — ⑦의 핵심 구절에 밑줄 마킹(__ __).
const MAGI_PASSAGE_UNDERLINED = MAGI_PASSAGE.replace(
  "life is made up of sobs, sniffles, and smiles, with sniffles predominating",
  "__life is made up of sobs, sniffles, and smiles, with sniffles predominating__",
);

// 빈칸추론 문항용 — ⑥의 귀결 행동을 빈칸 처리.
const MAGI_PASSAGE_BLANKED = MAGI_PASSAGE.replace(
  "flop down on the shabby little couch and howl",
  "________________________",
);

export const LANDING_ANALYSIS_REPORT: AnalysisReport = {
  schemaVersion: 1,
  brand: "SMOAT ENGLISH",
  docNo: "DEMO·001",
  themeId: "veritas-navy",
  meta: {
    eyebrow: "PRIME PASSAGE ANALYSIS · 심층 지문 분석",
    titleKo: "델라의 1달러 87센트",
    titleEn: "The Gift of the Magi — A Portrait of Devotion",
    category: "문학 · 소설",
    theme: "희생 · 사랑 · 가난",
    difficulty: 3,
    difficultyNote: "(수능 3점)",
    solveTime: "3분",
    examTypes: "제목·주제·내용일치",
  },
  sections: [
    {
      kind: "passage",
      note: "※ 문장 번호 ①–⑦은 본 자료 전체에서 상호 참조됩니다.",
      sentences: [
        {
          n: 1,
          en: "One dollar and eighty-seven cents. That was all.",
          ko: "1달러 87센트. 그것이 전부였다.",
        },
        {
          n: 2,
          en: "And sixty cents of it was in pennies.",
          ko: "그리고 그중 60센트는 페니(1센트 동전)였다.",
          chunks: [
            { text: "And sixty cents of it", gloss: "그중 60센트는", role: "주어" },
            { text: "was", gloss: "~였다", role: "동사" },
            { text: "in pennies.", gloss: "페니로", role: "전치사구" },
          ],
        },
        {
          n: 3,
          en: "Pennies saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher until one's cheeks burned with the silent imputation of parsimony that such close dealing implied.",
          ko: "식료품상, 채소 장수, 정육점 주인을 몰아붙여 한 푼 두 푼 모은 페니 — 그런 지독한 흥정이 암시하는 '인색하다'는 무언의 비난에 뺨이 화끈거릴 때까지.",
        },
        {
          n: 4,
          en: "Three times Della counted it. One dollar and eighty-seven cents.",
          ko: "델라는 세 번이나 세어 보았다. 여전히 1달러 87센트.",
        },
        {
          n: 5,
          en: "And the next day would be Christmas.",
          ko: "그런데 다음 날은 크리스마스였다.",
        },
        {
          n: 6,
          en: "There was clearly nothing to do but flop down on the shabby little couch and howl. So Della did it.",
          ko: "낡고 작은 소파에 엎드려 흐느끼는 것 말고는 분명 할 수 있는 일이 없었다. 그래서 델라는 그렇게 했다.",
          chunks: [
            { text: "There was clearly nothing to do", gloss: "분명 할 일이 없었다", role: "There 구문", emphasis: "core" },
            { text: "but flop down on the shabby little couch and howl.", gloss: "엎드려 흐느끼는 것 외에는", role: "but(=except)+원형" },
            { text: "So Della did it.", gloss: "그래서 델라는 그렇게 했다", role: "결과" },
          ],
        },
        {
          n: 7,
          en: "Which instigates the moral reflection that life is made up of sobs, sniffles, and smiles, with sniffles predominating.",
          ko: "이는 인생이란 흐느낌과 훌쩍임과 미소로 이루어져 있으며, 그중 훌쩍임이 가장 많다는 도덕적 성찰을 불러일으킨다.",
        },
      ],
      keywords: ["pennies", "bulldozing", "parsimony", "Christmas", "howl", "sniffles"],
    },
    {
      kind: "structure-map",
      note: "※ 초라한 액수의 제시(①·②) → 수치를 견딘 절약 과정(③) → 절망(④–⑥) → 서술자의 성찰(⑦)로 압축되는 구조입니다.",
      variant: "compare",
      intro: {
        eyebrow: "INTRODUCTION",
        label: "반복 제시되는 초라한 액수 — 1달러 87센트 (One dollar and eighty-seven cents)",
      },
      branchLabel: "같은 돈을 바라보는 두 개의 시선",
      columns: [
        {
          titleEn: "MATERIAL POVERTY",
          titleKo: "물질적 현실 · 가난",
          bullets: [
            "전 재산 1달러 87센트, 그중 60센트는 페니 (sixty cents of it was in pennies)",
            "낡고 작은 소파 (the shabby little couch) — 궁핍한 살림의 상징",
            "다음 날이 크리스마스라는 시간 압박 (the next day would be Christmas)",
            "울음 말고는 할 수 있는 일이 없음 (nothing to do but … howl)",
          ],
          footer: "숫자와 사물로 드러나는 '겉'의 상황",
        },
        {
          titleEn: "INNER DEVOTION",
          titleKo: "내면의 헌신 · 사랑",
          bullets: [
            "한 푼 두 푼 모은 페니 (saved one and two at a time)",
            "'인색하다'는 무언의 비난에 뺨이 화끈거려도 흥정을 감수 (cheeks burned with the silent imputation of parsimony)",
            "세 번이나 다시 세어 보는 간절함 (Three times Della counted it)",
          ],
          footer: "행동으로 드러나는 '속'의 마음",
        },
      ],
      coreDistinction: {
        eyebrow: "CORE CRITERION",
        label: "돈의 '액수'가 아니라 돈에 담긴 '정성'이 대조의 축",
        detail: "초라한 액수 ◀ 현실 ┃ 헌신 ▶ 수치심까지 견딘 절약",
      },
      conclusion: {
        eyebrow: "CONCLUSION",
        text: "가난은 델라의 형편을 규정할 뿐, 사랑하는 이를 위한 헌신까지 꺾지는 못합니다.",
      },
      logicFlow:
        "초라한 액수 제시(①·②) ▶ 수치를 견딘 절약 과정(③) ▶ 세 번의 확인과 크리스마스 전날의 절망(④·⑤·⑥) ▶ 인생에 대한 서술자의 성찰(⑦)",
    },
    {
      kind: "summary",
      sentences: [
        "델라는 상인들과의 낯 뜨거운 흥정까지 견디며 한 푼 두 푼 1달러 87센트를 모았다.",
        "그러나 크리스마스를 하루 앞두고, 그 돈은 사랑하는 이의 선물을 사기에 턱없이 부족했다.",
        "낡은 소파에 엎드려 우는 델라의 모습은 가난 속에서도 꺾이지 않는 헌신적 사랑을 보여준다.",
      ],
      thesisEn:
        "Della's meager savings, counted three times before Christmas, reveal devotion that poverty cannot diminish.",
    },
    {
      kind: "grammar",
      note: "※ ⚠ 표시는 어법·서술형에서 실제로 출제되는 함정 포인트입니다.",
      rows: [
        {
          sentenceNo: 3,
          point: "과거분사 saved 의 후치 수식",
          explanation:
            "Pennies (which were) saved one and two at a time … : 「명사+과거분사구」 구조. saved 이하가 Pennies 를 뒤에서 수식한다.",
          trap: "saving(X) → 페니는 '모아지는' 대상이므로 수동의 과거분사 saved(O).",
        },
        {
          sentenceNo: 3,
          point: "until + 절 (시간 부사절)",
          explanation:
            "until one's cheeks burned … : '~할 때까지'. burn with ~ = '~으로 화끈거리다'.",
          trap: "until 뒤 절의 시제 — 과거 문맥이므로 burned. will burn(X).",
        },
        {
          sentenceNo: 6,
          point: "nothing to do but + 동사원형",
          explanation:
            "「nothing to do but+원형(flop … and howl)」= '~하는 것 외엔 할 일이 없다'. but 은 except 의 뜻.",
          trap: "but to flop 도 가능하지만, do 가 앞에 있으면 원형이 원칙 — flopping(X).",
        },
        {
          sentenceNo: 7,
          point: "with + 명사 + 분사 (부대상황)",
          explanation:
            "with sniffles predominating = '훌쩍임이 가장 많은 채로'. 명사와 분사가 능동 관계이므로 현재분사.",
          trap: "predominated(X) → sniffles 가 '지배하는' 주체이므로 predominating(O).",
        },
      ],
    },
    {
      kind: "exam-focus",
      rows: [
        {
          type: "제목 추론",
          asks: "이야기 전체를 관통하는 함축적 제목",
          strategy:
            "돈의 액수(1달러 87센트)가 반복 강조되는 이유 = '부족함 속의 정성'. 숫자 자체가 아닌 헌신에 초점을 둔 제목이 정답.",
        },
        {
          type: "주제 추론",
          asks: "중심 소재와 글의 태도",
          strategy: "절약 방법(지엽) vs 사랑하는 이를 위한 절박함(중심)을 구분한다.",
        },
        {
          type: "내용 일치",
          asks: "세부 정보 확인",
          strategy: "숫자(60센트·세 번)와 행동(흥정한 상인 3인, 소파에서 흐느낌)이 단골 선지.",
        },
        {
          type: "함축 의미",
          asks: "비유적 표현의 해석",
          strategy:
            "bulldozing(몰아붙이는 흥정) · cheeks burned(수치심) · sniffles predominating(삶의 애환) 의 함의를 우리말로 환원.",
        },
      ],
    },
    {
      kind: "vocabulary",
      rows: [
        { headword: "penny", pos: "n.", meaning: "페니(1센트 동전); 푼돈", synonyms: "cent" },
        { headword: "bulldoze", pos: "v.", meaning: "밀어붙이다, 강요하다", synonyms: "coerce, bully" },
        { headword: "grocer", pos: "n.", meaning: "식료품상", synonyms: "storekeeper" },
        { headword: "butcher", pos: "n.", meaning: "정육점 주인", synonyms: "meat seller" },
        { headword: "imputation", pos: "n.", meaning: "(무언의) 비난, 오명 씌우기", synonyms: "accusation" },
        { headword: "parsimony", pos: "n.", meaning: "인색함, 지나친 절약", synonyms: "stinginess" },
        { headword: "imply", pos: "v.", meaning: "암시하다, 내포하다", synonyms: "suggest, indicate" },
        { headword: "shabby", pos: "a.", meaning: "낡은, 허름한", synonyms: "worn, ragged" },
        { headword: "howl", pos: "v.", meaning: "울부짖다, 흐느끼다", synonyms: "wail, sob" },
        { headword: "predominate", pos: "v.", meaning: "우세하다, 가장 많다", synonyms: "prevail, dominate" },
      ],
    },
    {
      kind: "parsing",
      items: [
        {
          sentenceNo: 3,
          en: "Pennies saved one and two at a time by bulldozing the grocer and the vegetable man and the butcher until one's cheeks burned with the silent imputation of parsimony that such close dealing implied.",
          parts: [
            { label: "[핵심 명사]", text: "Pennies (페니들)" },
            { label: "[과거분사구 (수식)]", text: "saved one and two at a time (한 번에 한 푼 두 푼씩 모아진)" },
            {
              label: "[by 전치사구 (수단)]",
              text: "by bulldozing the grocer and the vegetable man and the butcher (식료품상·채소 장수·정육점 주인을 몰아붙여서)",
            },
            {
              label: "[until 부사절 (지속)]",
              text: "until one's cheeks burned with the silent imputation of parsimony (뺨이 '인색함'이라는 무언의 비난으로 화끈거릴 때까지)",
            },
            { label: "[관계대명사절 (수식)]", text: "that such close dealing implied (그런 지독한 흥정이 암시하는)" },
          ],
          translation:
            "→ 식료품상, 채소 장수, 정육점 주인을 몰아붙여 한 푼 두 푼 모은 페니들이에요 — 그런 지독한 흥정이 암시하는 '인색하다'는 무언의 비난에 뺨이 화끈거릴 때까지요.",
          layout: { band: "underchunk", priority: 1, anchorText: "saved one and two" },
        },
        {
          sentenceNo: 6,
          en: "There was clearly nothing to do but flop down on the shabby little couch and howl. So Della did it.",
          parts: [
            { label: "[There 구문 (주절)]", text: "There was clearly nothing to do (분명 할 수 있는 일이 아무것도 없었다)" },
            {
              label: "[but(=except)+동사원형]",
              text: "but flop down on the shabby little couch and howl (낡고 작은 소파에 엎드려 흐느끼는 것 외에는)",
            },
            { label: "[결과 문장]", text: "So Della did it (그래서 델라는 그렇게 했다)" },
          ],
          translation: "→ 낡고 작은 소파에 엎드려 흐느끼는 것 말고는 분명 할 수 있는 일이 없었고, 그래서 델라는 그렇게 했어요.",
          layout: { band: "underchunk", priority: 1, anchorText: "nothing to do but" },
        },
        {
          sentenceNo: 7,
          en: "Which instigates the moral reflection that life is made up of sobs, sniffles, and smiles, with sniffles predominating.",
          parts: [
            {
              label: "[관계대명사 (앞 내용 전체 수식)]",
              text: "Which instigates the moral reflection (이 장면이 도덕적 성찰을 불러일으킨다)",
            },
            {
              label: "[동격 that절]",
              text: "that life is made up of sobs, sniffles, and smiles (인생은 흐느낌·훌쩍임·미소로 이루어져 있다는)",
            },
            { label: "[with 부대상황]", text: "with sniffles predominating (훌쩍임이 가장 많은 채로)" },
          ],
          translation: "→ 이 장면은 인생이란 흐느낌과 훌쩍임과 미소로 이루어져 있고, 그중 훌쩍임이 가장 많다는 성찰을 불러일으켜요.",
          layout: { band: "underchunk", priority: 2, anchorText: "with sniffles predominating" },
        },
      ],
    },
    {
      kind: "learning-worksheet",
      title: "실전 학습지",
      note: "본 학습지는 크리스마스를 하루 앞두고 1달러 87센트가 전부인 델라의 모습을 그린 지문을 바탕으로 구성되었습니다. 일곱 문장(①–⑦)의 논리 흐름을 따라가며 핵심 어휘와 어법을 완벽히 정리해 봅시다.",
      hiddenAnswers: true,
      logicRows: [
        { sentenceNo: 1, functionLabel: "도입 (액수 제시)", keyPoint: "전 재산 1달러 87센트를 건조하게 제시해 델라의 궁핍한 처지를 단번에 각인" },
        { sentenceNo: 2, functionLabel: "세부 강화", keyPoint: "그중 60센트가 페니(1센트 동전)라는 사실로 돈의 초라함을 구체화" },
        { sentenceNo: 3, functionLabel: "과정 회상 (헌신)", keyPoint: "'인색하다'는 무언의 비난에 뺨이 화끈거릴 만큼 수치스러운 흥정을 견디며 한 푼 두 푼 모은 절약의 과정" },
        { sentenceNo: 4, functionLabel: "반복·확인", keyPoint: "세 번을 세어도 변하지 않는 1달러 87센트 — 절박함의 극대화" },
        { sentenceNo: 5, functionLabel: "시간 압박 (갈등 완성)", keyPoint: "다음 날이 크리스마스라는 사실이 '선물 살 돈이 없다'는 갈등을 완성" },
        { sentenceNo: 6, functionLabel: "절정 (반응)", keyPoint: "낡은 소파에 엎드려 흐느끼는 것 말고는 할 일이 없는 절망, 그리고 그것을 실행하는 델라" },
        { sentenceNo: 7, functionLabel: "서술자 성찰 (일반화)", keyPoint: "인생은 흐느낌·훌쩍임·미소로 이루어지며 훌쩍임이 가장 많다는 서술자의 담담한 성찰" },
      ],
      cloze: {
        title: "핵심어구 빈칸 + 한국어 해석",
        items: [
          {
            no: 1,
            sentenceNo: 3,
            text: "Pennies saved one and two at a time by (1) ________________________ the grocer and the vegetable man and the butcher.",
            translation: "식료품상, 채소 장수, 정육점 주인을 몰아붙여 한 푼 두 푼 모은 페니였다.",
            answers: ["bulldozing"],
          },
          {
            no: 2,
            sentenceNo: 3,
            text: "… until one's cheeks burned with the silent imputation of (2) ________________________ that such close dealing implied.",
            translation: "그런 지독한 흥정이 암시하는 '인색함'이라는 무언의 비난에 뺨이 화끈거릴 때까지.",
            answers: ["parsimony"],
          },
          {
            no: 3,
            sentenceNo: 4,
            text: "Three times Della (3) ________________________ it.",
            translation: "델라는 그것을 세 번이나 세어 보았다.",
            answers: ["counted"],
          },
          {
            no: 4,
            sentenceNo: 6,
            text: "There was clearly nothing to do but flop down on the (4) ________________________ little couch and howl.",
            translation: "낡고 작은 소파에 엎드려 흐느끼는 것 말고는 분명 할 수 있는 일이 없었다.",
            answers: ["shabby"],
          },
          {
            no: 5,
            sentenceNo: 7,
            text: "Which instigates the moral (5) ________________________ that life is made up of sobs, sniffles, and smiles.",
            translation: "이는 인생이 흐느낌, 훌쩍임, 미소로 이루어져 있다는 도덕적 성찰을 불러일으킨다.",
            answers: ["reflection"],
          },
          {
            no: 6,
            sentenceNo: 7,
            text: "… life is made up of sobs, sniffles, and smiles, with sniffles (6) ________________________.",
            translation: "인생은 흐느낌, 훌쩍임, 미소로 이루어져 있으며 그중 훌쩍임이 가장 많다.",
            answers: ["predominating"],
          },
        ],
        wordBank: ["counted", "predominating", "bulldozing", "reflection", "shabby", "parsimony"],
      },
      practice: {
        title: "빈칸 연습",
        items: [
          {
            no: 1,
            sentenceNo: 3,
            text: "Pennies saved one and two at a time by (1) ________________________ the grocer and the vegetable man and the butcher.",
            answers: ["bulldozing"],
          },
          {
            no: 2,
            sentenceNo: 3,
            text: "… until one's cheeks burned with the silent imputation of (2) ________________________ that such close dealing implied.",
            answers: ["parsimony"],
          },
          {
            no: 3,
            sentenceNo: 4,
            text: "Three times Della (3) ________________________ it.",
            answers: ["counted"],
          },
          {
            no: 4,
            sentenceNo: 6,
            text: "There was clearly nothing to do but flop down on the (4) ________________________ little couch and howl.",
            answers: ["shabby"],
          },
          {
            no: 5,
            sentenceNo: 7,
            text: "Which instigates the moral (5) ________________________ that life is made up of sobs, sniffles, and smiles.",
            answers: ["reflection"],
          },
          {
            no: 6,
            sentenceNo: 7,
            text: "… life is made up of sobs, sniffles, and smiles, with sniffles (6) ________________________.",
            answers: ["predominating"],
          },
        ],
        wordBank: ["shabby", "reflection", "parsimony", "counted", "bulldozing", "predominating"],
      },
      drills: {
        grammarChoices: [
          {
            no: 1,
            sentenceNo: 3,
            text: "Pennies [saved / saving] one and two at a time by bulldozing the grocer and the vegetable man and the butcher.",
            choices: ["saved", "saving"],
            answer: "saved",
            explanation:
              "페니는 '모아지는' 대상이므로 수동 의미의 과거분사 saved가 명사 Pennies를 뒤에서 수식해야 합니다. 「명사+과거분사구」 후치 수식 구조입니다.",
          },
          {
            no: 2,
            sentenceNo: 6,
            text: "There was clearly nothing to do but [flop / flopping] down on the shabby little couch and howl.",
            choices: ["flop", "flopping"],
            answer: "flop",
            explanation:
              "「nothing to do but+동사원형」 구문으로, but이 except의 뜻일 때 앞에 do가 있으면 뒤에는 동사원형이 옵니다. flop과 howl이 원형으로 병렬됩니다.",
          },
          {
            no: 3,
            sentenceNo: 7,
            text: "… life is made up of sobs, sniffles, and smiles, with sniffles [predominating / predominated].",
            choices: ["predominating", "predominated"],
            answer: "predominating",
            explanation:
              "「with+명사+분사」 부대상황 구문에서 sniffles가 '우세한(가장 많은)' 주체이므로 능동의 현재분사 predominating이 와야 합니다.",
          },
        ],
      },
      questions: [],
      workbookSet: {
        title: "EBS 워크북 유형 훈련",
        topicGist: {
          title: "주제 / 요지",
          topicTitle: "A Love Too Large for One Dollar and Eighty-Seven Cents",
          gist: "델라가 수치심까지 견디며 한 푼 두 푼 모은 1달러 87센트는 선물을 사기에 턱없이 부족하지만, 그 초라한 액수에 담긴 절박한 정성은 가난이 꺾을 수 없는 헌신적 사랑을 보여준다.",
        },
        grammarSelection: {
          title: "어법 선택",
          passage:
            "One dollar and eighty-seven cents. That was all. And sixty cents of it (1) [was / were] in pennies. Pennies (2) [saved / saving] one and two at a time by bulldozing the grocer and the vegetable man and the butcher until one's cheeks burned with the silent imputation of parsimony that such close dealing (3) [implied / implying]. Three times Della counted it. One dollar and eighty-seven cents. And the next day (4) [would / will] be Christmas. There was clearly nothing to do but (5) [flop / flopping] down on the shabby little couch and howl. So Della did it. Which instigates the moral reflection that life is made up of sobs, sniffles, and smiles, with sniffles (6) [predominating / predominated].",
          choices: [
            {
              no: 1,
              options: ["was", "were"],
              answer: "was",
              explanation:
                "sixty cents처럼 금액을 나타내는 표현은 하나의 덩어리로 보아 단수 취급하므로 단수 동사 was가 맞습니다.",
            },
            {
              no: 2,
              options: ["saved", "saving"],
              answer: "saved",
              explanation:
                "페니는 델라에 의해 '모아진' 대상이므로 수동 의미의 과거분사 saved가 명사 Pennies를 뒤에서 수식합니다.",
            },
            {
              no: 3,
              options: ["implied", "implying"],
              answer: "implied",
              explanation:
                "관계대명사 that절 안에서 주어 such close dealing에 대한 정동사가 필요하므로 implied가 와야 합니다. 분사 implying은 동사 자리를 채울 수 없습니다.",
            },
            {
              no: 4,
              options: ["would", "will"],
              answer: "would",
              explanation:
                "과거 시점에서 서술되는 이야기이므로 시제 일치에 따라 미래를 나타내는 조동사도 과거형 would를 써야 합니다.",
            },
            {
              no: 5,
              options: ["flop", "flopping"],
              answer: "flop",
              explanation:
                "「nothing to do but+동사원형」 구문입니다. but(=except) 앞에 do가 있으므로 뒤에는 동사원형 flop이 옵니다.",
            },
            {
              no: 6,
              options: ["predominating", "predominated"],
              answer: "predominating",
              explanation:
                "「with+명사+분사」 부대상황에서 sniffles가 '가장 많은' 능동의 주체이므로 현재분사 predominating이 맞습니다.",
            },
          ],
        },
        vocabularyCloze: {
          title: "어휘 빈칸 완성",
          passage:
            "One dollar and eighty-seven cents. That was all. And sixty cents of it was in pennies. Pennies saved one and two at a time by (1) __________ the grocer and the vegetable man and the butcher until one's cheeks burned with the silent (2) __________ of (3) __________ that such close dealing (4) __________. Three times Della (5) __________ it. One dollar and eighty-seven cents. And the next day would be Christmas. There was clearly nothing to do but flop down on the (6) __________ little couch and (7) __________. So Della did it. Which instigates the moral reflection that life is made up of sobs, sniffles, and smiles, with sniffles (8) __________.",
          blanks: [
            { no: 1, answer: "bulldozing", meaning: "밀어붙이기, 몰아붙이기", clue: "상인들을 밀어붙이며 값을 깎는 델라의 흥정 방식" },
            { no: 2, answer: "imputation", meaning: "(무언의) 비난", clue: "지독한 흥정이 불러온, 말 없는 비난" },
            { no: 3, answer: "parsimony", meaning: "인색함", clue: "그 비난의 내용 — 지나치게 아낀다는 것" },
            { no: 4, answer: "implied", meaning: "암시했다", clue: "그런 빡빡한 거래가 인색함을 넌지시 드러냈음" },
            { no: 5, answer: "counted", meaning: "세었다", clue: "델라가 돈을 상대로 세 번이나 반복한 행동" },
            { no: 6, answer: "shabby", meaning: "낡은, 허름한", clue: "델라가 엎드린 작은 소파의 허름한 상태" },
            { no: 7, answer: "howl", meaning: "흐느끼다, 울부짖다", clue: "소파에 엎드려 델라가 할 수 있었던 유일한 일" },
            { no: 8, answer: "predominating", meaning: "가장 많은, 우세한", clue: "인생에서 훌쩍임이 차지하는 압도적 비중" },
          ],
        },
        wordOrders: [
          {
            no: 1,
            korean: "델라는 그것을 세 번이나 세어 보았다.",
            chunks: ["counted", "Three times", "it", "Della"],
            answer: "Three times Della counted it",
          },
          {
            no: 2,
            korean: "낡고 작은 소파에 엎드려 흐느끼는 것 말고는 분명 할 수 있는 일이 없었다.",
            chunks: ["nothing to do", "There was", "and howl", "clearly", "on the shabby little couch", "but flop down"],
            answer: "There was clearly nothing to do but flop down on the shabby little couch and howl",
          },
        ],
      },
      inferenceSet: {
        title: "수능추론 문제",
        questions: [
          {
            no: 1,
            type: "main-idea",
            typeLabel: "주제 추론",
            prompt: "윗글의 주제로 가장 적절한 것은?",
            passage: MAGI_PASSAGE,
            choices: [
              { label: "①", text: "effective ways to save small amounts of money for the holidays" },
              { label: "②", text: "a poor woman's desperate devotion revealed through her tiny savings" },
              { label: "③", text: "the rudeness of neighborhood merchants toward poor customers" },
              { label: "④", text: "the growing commercial pressure of Christmas gift-giving" },
              { label: "⑤", text: "the emotional benefits of crying when life becomes difficult" },
            ],
            answerLabel: "②",
            answerText: "a poor woman's desperate devotion revealed through her tiny savings",
            explanation:
              "글은 1달러 87센트라는 초라한 액수를 반복 제시하면서, 그 돈이 수치심을 견딘 흥정으로 한 푼 두 푼 모은 것임을 보여줍니다(③문장). 크리스마스 전날 그 돈이 턱없이 부족해 우는 델라의 모습은 '가난 속에서도 꺾이지 않는 헌신'을 드러내므로 ②가 주제로 가장 적절합니다.",
            distractors: [
              { label: "①", type: "범위 왜곡", reason: "절약은 델라의 헌신을 보여주는 수단으로 언급될 뿐, 돈을 모으는 '방법'을 알려주는 글이 아닙니다." },
              { label: "③", type: "근거 없음", reason: "흥정에서 밀어붙인(bulldozing) 쪽은 오히려 델라이며, 상인들의 무례한 태도는 본문에 나타나지 않습니다." },
              { label: "④", type: "근거 없음", reason: "크리스마스는 시간적 배경일 뿐, 명절의 상업화에 대한 비판은 본문에 없습니다." },
              { label: "⑤", type: "지엽 확대", reason: "델라가 흐느끼는 장면은 절망의 표현이지, 울음의 '효용'을 말하려는 것이 아닙니다." },
            ],
          },
          {
            no: 2,
            type: "title",
            typeLabel: "제목 추론",
            prompt: "윗글의 제목으로 가장 적절한 것은?",
            passage: MAGI_PASSAGE,
            choices: [
              { label: "①", text: "One Dollar and Eighty-Seven Cents: The Price of Devotion" },
              { label: "②", text: "Smart Bargaining: How to Stretch Every Penny" },
              { label: "③", text: "The True History of the American Penny" },
              { label: "④", text: "Why Christmas Is the Most Expensive Holiday" },
              { label: "⑤", text: "Never Cry over Small Change" },
            ],
            answerLabel: "①",
            answerText: "One Dollar and Eighty-Seven Cents: The Price of Devotion",
            explanation:
              "반복 제시되는 액수(1달러 87센트)는 글 전체를 관통하는 상징으로, 그 안에 담긴 것은 수치심까지 견딘 델라의 정성입니다. 액수와 헌신을 함께 담아낸 ①이 제목으로 가장 적절합니다.",
            distractors: [
              { label: "②", type: "지엽 왜곡", reason: "흥정 장면은 헌신을 보여주는 소재일 뿐, 절약 요령을 알려주는 실용문이 아닙니다." },
              { label: "③", type: "무관", reason: "페니라는 동전 자체의 역사는 본문에서 전혀 다루지 않습니다." },
              { label: "④", type: "근거 없음", reason: "크리스마스 지출이 많다는 일반론은 본문의 초점이 아닙니다." },
              { label: "⑤", type: "반대 방향", reason: "본문은 델라의 울음을 나무라지 않으며, 오히려 그 절망을 인생에 대한 성찰로 감싸 안습니다." },
            ],
          },
          {
            no: 3,
            type: "implication",
            typeLabel: "함축의미 추론",
            prompt:
              "밑줄 친 __life is made up of sobs, sniffles, and smiles, with sniffles predominating__이 윗글에서 의미하는 바로 가장 적절한 것은?",
            passage: MAGI_PASSAGE_UNDERLINED,
            choices: [
              { label: "①", text: "Life brings far more small, everyday sorrows than great tragedies or great joys." },
              { label: "②", text: "People should learn to hide their sniffles behind a smile." },
              { label: "③", text: "A single great tragedy hurts more than a lifetime of small sorrows." },
              { label: "④", text: "Joy always returns to those who endure their sorrows patiently." },
              { label: "⑤", text: "Sharing one's tears with others makes sadness easier to bear." },
            ],
            answerLabel: "①",
            answerText: "Life brings far more small, everyday sorrows than great tragedies or great joys.",
            explanation:
              "sobs(큰 흐느낌)는 커다란 비극을, smiles(미소)는 기쁨을, sniffles(작은 훌쩍임)는 일상의 잔잔한 서러움을 나타냅니다. '훌쩍임이 가장 많다(predominating)'는 것은 인생의 대부분이 거창한 비극도 큰 기쁨도 아닌, 델라의 처지 같은 소소한 서러움으로 채워져 있다는 서술자의 성찰이므로 ①이 적절합니다.",
            distractors: [
              { label: "②", type: "교훈 왜곡", reason: "감정을 숨기라는 처세의 교훈이 아니라 삶의 구성에 대한 관찰입니다." },
              { label: "③", type: "반대 방향", reason: "밑줄은 큰 비극(sobs)이 아니라 작은 훌쩍임(sniffles)이 '가장 많다'고 말하므로 방향이 반대입니다." },
              { label: "④", type: "근거 없음", reason: "인내에 대한 보상이나 기쁨의 회복을 약속하는 내용은 본문에 없습니다." },
              { label: "⑤", type: "근거 없음", reason: "슬픔을 남과 나눈다는 내용은 본문 어디에도 나타나지 않습니다." },
            ],
          },
          {
            no: 4,
            type: "blank",
            typeLabel: "빈칸추론",
            prompt: "윗글의 빈칸에 들어갈 말로 가장 적절한 것은?",
            passage: MAGI_PASSAGE_BLANKED,
            choices: [
              { label: "①", text: "count the pennies one more time in hope" },
              { label: "②", text: "flop down on the shabby little couch and howl" },
              { label: "③", text: "ask the grocer to return her hard-earned pennies" },
              { label: "④", text: "go out and borrow money for a Christmas gift" },
              { label: "⑤", text: "sell the little couch to buy a better present" },
            ],
            answerLabel: "②",
            answerText: "flop down on the shabby little couch and howl",
            explanation:
              "델라는 이미 세 번이나 돈을 세어 액수가 변하지 않음을 확인했고(④문장), 다음 날은 크리스마스입니다(⑤문장). 빈칸 뒤 'So Della did it'이 가리킬 수 있는 하나의 행동이어야 하고, 이어지는 ⑦문장이 흐느낌(sobs, sniffles)에 대한 성찰이므로 절망의 행동인 ②가 들어가야 자연스럽습니다.",
            distractors: [
              { label: "①", type: "반대 방향", reason: "세 번을 세어도 액수가 변하지 않음을 이미 확인한 뒤이므로 '희망을 걸고 다시 센다'는 흐름과 어긋납니다." },
              { label: "③", type: "근거 없음", reason: "흥정으로 아낀 돈을 돌려달라는 요청은 본문 상황과 연결되지 않습니다." },
              { label: "④", type: "근거 없음", reason: "돈을 빌린다는 단서가 없고, 뒤에 이어지는 울음에 대한 성찰과도 연결되지 않습니다." },
              { label: "⑤", type: "비약", reason: "소파는 궁핍을 보여주는 배경 소재일 뿐, 이를 판다는 발상은 본문에서 끌어낼 수 없습니다." },
            ],
          },
          {
            no: 5,
            type: "summary",
            typeLabel: "요약문 완성",
            prompt: "윗글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
            passage:
              MAGI_PASSAGE +
              "\n\n[요약문] Della's tiny savings, gathered through (A) ________ bargaining that cost her own pride, show that her love is measured not by the amount of money but by the (B) ________ behind it.",
            choices: [
              { label: "①", text: "(A) casual / (B) wealth" },
              { label: "②", text: "(A) humiliating / (B) sacrifice" },
              { label: "③", text: "(A) humiliating / (B) luck" },
              { label: "④", text: "(A) generous / (B) sacrifice" },
              { label: "⑤", text: "(A) generous / (B) wealth" },
            ],
            answerLabel: "②",
            answerText: "(A) humiliating / (B) sacrifice",
            explanation:
              "상인들을 몰아붙이는 흥정 탓에 '인색하다는 무언의 비난에 뺨이 화끈거렸다'고 했으므로 (A)에는 수치스러운(humiliating)이 적절합니다. 글 전체가 초라한 액수가 아니라 그 돈을 모으기까지 견딘 정성을 조명하므로 (B)에는 sacrifice(희생)가 들어가야 합니다.",
            distractors: [
              { label: "①", type: "핵심어 왜곡", reason: "(A) casual은 뺨이 화끈거릴 만큼 치열했던 흥정과 반대이고, (B) wealth는 '액수가 아니라 정성'이라는 논지와 어긋납니다." },
              { label: "③", type: "핵심어 왜곡", reason: "(B) luck(운)은 본문 어디에서도 델라의 사랑을 설명하는 근거로 쓰이지 않았습니다." },
              { label: "④", type: "반대 방향", reason: "(A) generous(후한)는 값을 깎으려 상인들을 몰아붙인 델라의 흥정 방식과 정반대입니다." },
              { label: "⑤", type: "반대 방향", reason: "(A)와 (B) 모두 본문의 '수치를 견딘 절약'과 '정성'이라는 핵심을 벗어납니다." },
            ],
          },
        ],
      },
    },
  ],
};
