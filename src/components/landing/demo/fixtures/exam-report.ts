// 랜딩 데모 fixture — 학생 시험 리포트(StudentReportDoc) 스키마 그대로 수제 작성.
// 렌더는 실제 exam-report 문서 렌더러가 담당한다.
//
// 시나리오: 김민준 학생이 "3월 학력평가 대비 모의고사 (영어)"를 치른 성적 상담
// 리포트. 시험은 The Gift of the Magi 지문 기반(랜딩의 다른 데모와 세계관 공유) —
// 20문항 100점 만점, 득점 82점(정답 16문항·정답률 80%), 반평균 74점.
// 오답 4문항: 9번(제목 추론·4점), 12번(어법·4점), 18번(빈칸 추론·4점),
// 20번(빈칸 추론·6점) — 실점 합계 18점.
import type { StudentReportDoc } from "@/lib/exam-report/report-schema";

export const LANDING_EXAM_REPORT: StudentReportDoc = {
  version: 1,
  themeId: "indigo-consult",
  cover: {
    templateId: "gradient-band",
    title: "학생 시험 분석 리포트",
    subtitle: "3월 학력평가 대비 · 유형별 성취 분석과 다음 3주 학습 처방",
    studentName: "김민준",
    examLabel: "3월 학력평가 대비 모의고사 · 영어",
    academyName: "SMOAT 영어학원",
    dateLabel: "2026년 3월",
  },
  sections: [
    {
      id: "sec-score-overview",
      type: "scoreOverview",
      heading: "성적 개요",
      narrative:
        "반평균을 8점 앞선 82점, 정답률 80%로 상위권 진입 문턱에 선 시험입니다.\n\n" +
        "내용 일치·주제 추론처럼 지문을 정확히 읽어내는 유형은 전부 지켜냈고, 실점 18점은 빈칸 추론과 어법 두 갈래에 집중되어 있습니다. 약점의 위치가 이렇게 선명하게 잡힌 성적표는 오히려 좋은 신호입니다 — 다음 3주 동안 손댈 곳이 분명하기 때문입니다.",
      data: {
        score: 82,
        maxScore: 100,
        correctRate: 80,
        classAverage: 74,
        unknownCount: 0,
        correctCount: 16,
        wrongCount: 4,
        partialCount: 0,
      },
    },
    {
      id: "sec-type-performance",
      type: "typePerformance",
      heading: "유형별 성취",
      narrative:
        "내용 일치·주제 추론·순서 배열은 만점으로 정복했습니다. 반면 배점이 가장 큰 빈칸 추론(24점)에서 10점을 잃어 전체 실점의 절반 이상이 한 유형에 몰려 있고, 어법과 제목 추론이 각각 4점씩 뒤를 따릅니다. 빈칸 하나를 잡으면 성적대가 바뀌는 구조입니다.",
      data: {
        rows: [
          {
            typeLabel: "내용 일치",
            total: 4,
            correct: 4,
            wrong: 0,
            unknown: 0,
            points: 16,
            earnedPoints: 16,
          },
          {
            typeLabel: "주제 추론",
            total: 3,
            correct: 3,
            wrong: 0,
            unknown: 0,
            points: 15,
            earnedPoints: 15,
          },
          {
            typeLabel: "제목 추론",
            total: 3,
            correct: 2,
            wrong: 1,
            unknown: 0,
            points: 15,
            earnedPoints: 11,
          },
          {
            typeLabel: "어법",
            total: 3,
            correct: 2,
            wrong: 1,
            unknown: 0,
            points: 13,
            earnedPoints: 9,
          },
          {
            typeLabel: "순서 배열",
            total: 3,
            correct: 3,
            wrong: 0,
            unknown: 0,
            points: 17,
            earnedPoints: 17,
          },
          {
            typeLabel: "빈칸 추론",
            total: 4,
            correct: 2,
            wrong: 2,
            unknown: 0,
            points: 24,
            earnedPoints: 14,
          },
        ],
      },
    },
    {
      id: "sec-difficulty-matrix",
      type: "difficultyMatrix",
      heading: "난이도별 정오표",
      narrative:
        "최고 난도(★5)였던 17번 빈칸을 맞힌 것이 이번 시험의 백미입니다 — 어려운 문제를 풀 근력은 이미 있습니다. 다만 난이도 2의 12번 어법을 놓친 것은 실력이 아닌 확인 습관의 문제로, 쉬운 문항 검산 루틴만 들이면 바로 회수되는 점수입니다.",
      data: {
        cells: [
          { number: "1", difficulty: 1, status: "CORRECT", points: 4 },
          { number: "2", difficulty: 1, status: "CORRECT", points: 4 },
          { number: "3", difficulty: 2, status: "CORRECT", points: 4 },
          { number: "4", difficulty: 2, status: "CORRECT", points: 4 },
          { number: "5", difficulty: 2, status: "CORRECT", points: 4 },
          { number: "6", difficulty: 3, status: "CORRECT", points: 5 },
          { number: "7", difficulty: 3, status: "CORRECT", points: 6 },
          { number: "8", difficulty: 3, status: "CORRECT", points: 5 },
          { number: "9", difficulty: 3, status: "WRONG", points: 4 },
          { number: "10", difficulty: 3, status: "CORRECT", points: 6 },
          { number: "11", difficulty: 2, status: "CORRECT", points: 4 },
          { number: "12", difficulty: 2, status: "WRONG", points: 4 },
          { number: "13", difficulty: 3, status: "CORRECT", points: 5 },
          { number: "14", difficulty: 3, status: "CORRECT", points: 5 },
          { number: "15", difficulty: 3, status: "CORRECT", points: 5 },
          { number: "16", difficulty: 4, status: "CORRECT", points: 7 },
          { number: "17", difficulty: 5, status: "CORRECT", points: 7 },
          { number: "18", difficulty: 4, status: "WRONG", points: 4 },
          { number: "19", difficulty: 4, status: "CORRECT", points: 7 },
          { number: "20", difficulty: 5, status: "WRONG", points: 6 },
        ],
        easyMistakes: ["12"],
        hardWins: ["16", "17", "19"],
      },
    },
    {
      id: "sec-trap-analysis",
      type: "trapAnalysis",
      heading: "함정 선지 분석",
      narrative:
        "오답 3건 중 2건이 출제자가 설계한 매력 오답에 정확히 걸렸습니다. 지문의 단어를 그대로 재활용한 선지에 손이 가는 패턴이 반복되고 있어, '본문 단어가 보이면 일단 의심'하는 소거 습관을 들일 시점입니다.",
      data: {
        items: [
          {
            number: "18",
            chosenChoice: "③",
            trapWhy:
              "빈칸 문장의 'sacrifice'와 표면상 짝이 되는 'giving up hope(희망을 포기하다)'를 골랐습니다. 델라가 머리카락을 판 것은 희망의 포기가 아니라 사랑을 위한 맞바꿈인데, 지문에 등장한 단어(giving up)가 그대로 보이자 문맥 검증 없이 선택한 전형적인 어휘 재활용 함정입니다.",
            wasDesignedTrap: true,
          },
          {
            number: "20",
            chosenChoice: "②",
            trapWhy:
              "결말의 반어(irony)를 묻는 빈칸에서 'their gifts were wasted(선물이 헛되었다)'를 골랐습니다. 표면 사건(시계도 머리카락도 사라짐)만 보면 맞는 말처럼 느껴지지만, 화자는 두 사람을 'the wisest(가장 지혜로운 이들)'라 부르며 정반대의 평가를 내립니다. 서술자의 논평을 놓치면 걸리도록 설계된 함정입니다.",
            wasDesignedTrap: true,
          },
          {
            number: "9",
            chosenChoice: "④",
            trapWhy:
              "제목 추론에서 'A Poor Couple's Christmas(가난한 부부의 크리스마스)'를 골랐습니다. 내용상 틀린 말은 아니지만 소재만 나열한 너무 좁은 제목으로, 희생과 사랑이라는 주제 층위까지 끌어올린 정답 선지와의 '범위 차이'를 가르지 못했습니다.",
            wasDesignedTrap: false,
          },
        ],
        trapSusceptibility: "MID",
      },
    },
    {
      id: "sec-wrong-deep-dive",
      type: "wrongDeepDive",
      heading: "오답 심층 분석",
      narrative:
        "네 문항의 오답을 뜯어 보면 원인은 세 갈래로 정리됩니다. 빈칸 두 문항은 '단서 문장 확보 전에 선지부터 본' 순서의 문제, 어법은 수일치 확인 누락, 제목은 정답 후보 간 범위 비교 생략입니다. 각각 교정 포인트가 분명해 반복 훈련으로 충분히 닫을 수 있는 격차입니다.",
      data: {
        items: [
          {
            number: "9",
            typeLabel: "제목 추론",
            whatHappened:
              "지문 내용과 어긋나지 않는 선지 두 개가 남았을 때, 글 전체를 덮는 제목인지 일부만 가리키는 제목인지 비교하지 않고 먼저 눈에 들어온 쪽을 골랐습니다.",
            fixPoint:
              "제목 후보가 둘 남으면 '이 제목으로 못 덮는 문단이 있는가'를 마지막 관문으로 두세요. 소재 나열형 제목은 대개 좁은 오답입니다.",
            conceptTags: ["제목의 포괄 범위", "주제 vs 소재"],
          },
          {
            number: "12",
            typeLabel: "어법",
            whatHappened:
              "'The value of the combs and the watch chain ___' 구조에서 수식어구(of the combs and the watch chain)에 끌려 복수 동사 were를 골랐습니다. 진짜 주어는 단수 명사 value입니다.",
            fixPoint:
              "동사 문제는 풀기 전에 주어에 밑줄부터 긋는 습관을 고정하세요. 전치사구·관계절은 괄호로 묶어 지우면 수일치 실수가 사라집니다.",
            conceptTags: ["주어-동사 수일치", "수식어구 소거"],
          },
          {
            number: "18",
            typeLabel: "빈칸 추론",
            whatHappened:
              "빈칸 앞뒤 두 문장만 읽고 선지로 직행했습니다. 정답의 단서는 세 문장 뒤 델라의 대사('내 머리카락은 다시 자라요')에 있었는데, 단서 문장을 확보하기 전에 어휘가 겹치는 선지를 골랐습니다.",
            fixPoint:
              "빈칸 문제는 '빈칸 문장 → 재진술 문장 찾기 → 선지 대조'의 3단 순서를 강제하세요. 단서 문장을 손가락으로 짚기 전에는 선지를 보지 않는 훈련이 필요합니다.",
            conceptTags: ["빈칸 추론", "재진술(paraphrase) 탐색"],
          },
          {
            number: "20",
            typeLabel: "빈칸 추론",
            whatHappened:
              "결말 단락의 반어적 논평을 사건 요약으로 오독했습니다. '선물이 쓸모없어졌다'는 표면 사실에 머물러, 서술자가 두 사람을 동방박사에 빗대 칭송하는 어조 전환을 놓쳤습니다.",
            fixPoint:
              "마지막 단락에서 서술자의 평가 어휘(wise, foolish 등)가 나오면 어조가 사건과 같은 방향인지 반대인지 먼저 판정하세요. 반어는 수능 빈칸의 단골 장치입니다.",
            conceptTags: ["반어(irony)", "서술자의 어조", "빈칸 추론"],
          },
        ],
      },
    },
    {
      id: "sec-concept-map",
      type: "conceptMap",
      heading: "개념 지도",
      narrative:
        "강점과 약점이 뚜렷하게 갈리는 지도입니다. 사실 관계를 정확히 짚는 독해 기본기는 이미 자산이 되었고, 이제 남은 과제는 글쓴이의 의도·어조까지 읽어내는 추론 한 층입니다. 약점 개념 세 가지가 모두 '행간 읽기'라는 같은 뿌리에서 나온다는 점에 주목하세요.",
      data: {
        weak: [
          { concept: "빈칸 추론 — 재진술 단서 탐색", weight: 3, relatedNumbers: ["18", "20"] },
          { concept: "반어·어조의 전환 읽기", weight: 2, relatedNumbers: ["20"] },
          { concept: "주어-동사 수일치(수식어구 개입)", weight: 2, relatedNumbers: ["12"] },
          { concept: "제목의 포괄 범위 판정", weight: 1, relatedNumbers: ["9"] },
        ],
        strong: [
          { concept: "세부 정보 파악(내용 일치)", weight: 3, relatedNumbers: ["1", "2", "3", "4"] },
          { concept: "글의 순서·응집성(연결어 추적)", weight: 2, relatedNumbers: ["14", "15", "16"] },
          { concept: "중심 내용(주제) 파악", weight: 2, relatedNumbers: ["5", "6", "7"] },
        ],
      },
    },
    {
      id: "sec-strength-weakness",
      type: "strengthWeakness",
      heading: "강점과 약점",
      narrative:
        "강점은 '정확하게 읽는 힘', 약점은 '읽은 것 너머를 미는 힘'으로 요약됩니다. 기본기가 단단하기 때문에 약점 훈련의 효율이 높은 시기입니다 — 같은 노력으로 가장 크게 오를 수 있는 구간에 서 있습니다.",
      data: {
        strengths: [
          "사실 관계를 지문과 1:1로 대조하는 내용 일치 유형을 4문항 전부 지켜냈습니다 — 정확한 독해라는 기본기가 완성 단계입니다.",
          "연결어와 대명사를 추적해 글의 흐름을 재구성하는 순서 배열을 최고 배점(7점) 문항까지 포함해 만점 처리했습니다.",
          "최고 난도(★5) 17번 빈칸을 정면 돌파했습니다 — 어려운 문제를 끝까지 밀어붙이는 집중력과 근력이 확인되었습니다.",
        ],
        weaknesses: [
          "빈칸 추론에서 단서 문장을 확보하기 전에 선지부터 보는 습관이 있어, 지문 어휘를 재활용한 매력 오답에 2회 걸렸습니다.",
          "반어·어조 전환 등 서술자의 평가가 개입하는 대목에서 표면 사건 요약에 머무르는 경향이 있습니다(20번).",
          "수식어구가 주어와 동사 사이에 끼면 수일치 확인을 건너뛰는 실수가 나옵니다 — 난이도 2 문항의 4점을 그대로 내준 아까운 실점입니다(12번).",
        ],
      },
    },
    {
      id: "sec-study-plan",
      type: "studyPlan",
      heading: "3주 학습 계획",
      narrative:
        "실점의 뿌리인 빈칸 추론을 1주차에 정면으로 다루고, 2주차에 어법 루틴과 어조 읽기를 얹은 뒤, 3주차에 실전 모의로 마감하는 3주 처방입니다. 매주 과제는 하루 30~40분 분량으로 설계했으니 체크박스를 채워 가며 진행 상황을 눈으로 확인하세요.",
      data: {
        weeks: [
          {
            label: "1주차",
            focus: "빈칸 추론 3단 루틴 장착 — 단서 먼저, 선지는 마지막",
            tasks: [
              "빈칸 기출 12문항: 선지를 가린 채 빈칸에 들어갈 말을 우리말로 먼저 적고 나서 선지 대조하기",
              "오답 18·20번 지문(The Gift of the Magi) 재독: 재진술 단서 문장에 형광펜 표시 후 풀이 재구성",
              "매력 오답 노트 시작 — '지문 단어 재활용형' 함정 선지를 만날 때마다 채록(주 5개 목표)",
            ],
          },
          {
            label: "2주차",
            focus: "어법 검산 루틴 + 서술자의 어조 읽기",
            tasks: [
              "수일치·태 집중 어법 20문항: 동사 문제마다 주어에 밑줄 긋고 수식어구를 괄호로 지우는 절차 고정",
              "반어·유머가 있는 단편 2편(오 헨리 단편 추천) 결말 단락 정독 — 서술자의 평가 어휘에 동그라미",
              "1주차 매력 오답 노트 복습 + 빈칸 신규 8문항으로 3단 루틴 유지 점검",
            ],
          },
          {
            label: "3주차",
            focus: "실전 모의 2회로 마무리 재점검",
            tasks: [
              "실전 모의고사 2회분을 시험 시간 그대로 풀고, 빈칸·어법 문항은 풀이 직후 루틴 준수 여부 자가 채점",
              "오답 4문항 유형(빈칸·어법·제목)만 모은 맞춤 세트 20문항으로 최종 확인",
              "매력 오답 노트 전체 복습 — 함정 패턴 5개를 자기 말로 요약해 상담 때 가져오기",
            ],
          },
        ],
      },
    },
    {
      id: "sec-teacher-comment",
      type: "teacherComment",
      heading: "선생님 한마디",
      narrative:
        "이번 리포트의 결론을 담임 강사의 육성으로 정리했습니다. 다음 상담(3월 넷째 주)에서 3주 계획의 진행 상황을 함께 점검합니다.",
      data: {
        comment:
          "민준아, 이번 시험에서 가장 반가웠던 건 82점이라는 숫자보다 네가 가장 어려운 17번 빈칸을 끝까지 붙들어 맞혀냈다는 사실이야. 어려운 문제 앞에서 물러서지 않는 힘은 가르쳐서 생기는 게 아닌데, 너는 이미 갖고 있더라. 지금 너를 막고 있는 건 실력이 아니라 순서야 — 단서를 찾기 전에 선지부터 보는 습관, 그것 하나만 고치면 빈칸에서 잃은 10점은 반드시 돌아온다. 3주 계획의 체크박스를 하나씩 채워 가면서, 델라와 짐이 그랬듯 지금 들이는 정성이 결코 헛되지 않다는 걸 다음 시험에서 확인하자. 선생님은 네가 다음 모의고사에서 90점의 벽을 넘는 걸 의심하지 않아.",
      },
    },
  ],
};
