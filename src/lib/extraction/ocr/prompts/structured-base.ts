import { OCR_SYSTEM_PROMPT } from "./m1";

export const STRUCTURED_OCR_SCHEMA_HINT = `[JSON 스키마 — 엄격히 준수]
{
  "blocks": [
    {
      "blockType": "EXAM_META" | "HEADER" | "FOOTER" | "PASSAGE_BODY" | "QUESTION_STEM" | "CHOICE" | "EXPLANATION" | "DIAGRAM" | "NOISE",
      "content": "블록 본문 (이미지에 인쇄된 형태 그대로 기록 — 오탈자·공백·줄바꿈 보존). 변형하거나 복원하지 말 것.",
      "confidence": 0.0~1.0 (선택, 인식 신뢰도),
      "questionNumber": 1~999 정수 (QUESTION_STEM/CHOICE/EXPLANATION에 권장),
      "choiceIndex": 1~9 정수 (CHOICE에만, ①=1 ⑤=5),
      "isAnswer": true/false (CHOICE에만, 정답 표기★/●/■가 보일 때만 true),
      "sharedPassageRange": "2~4" 형태 문자열 (선택, 이 블록이 속한 공유 지문 범위),
      "questionAnalysis": {                  // QUESTION_STEM에만 채움. 그 외는 null/생략.
        "questionType": "BLANK_INFERENCE" | "BLANK_WORD" | "BLANK_SENTENCE" | "CONNECTOR" | "SENTENCE_ORDER" | "PARAGRAPH_ORDER" | "SENTENCE_INSERT" | "IRRELEVANT" | "GRAMMAR_ERROR" | "GRAMMAR_CORRECTION" | "VOCAB_CHOICE" | "CONTEXT_MEANING" | "IMPLIED_MEANING" | "REFERENCE" | "CONTENT_MATCH" | "TOPIC_MAIN_IDEA" | "TITLE" | "PURPOSE" | "MOOD_TONE" | "SUMMARY_COMPLETE" | "WORD_ORDER" | "SENTENCE_TRANSFORM" | "CONDITIONAL_WRITING" | "TEXTBOOK_DETAIL" | "DIALOGUE_ORDER" | "DIALOGUE_RESPONSE" | "KOREAN_TRANSLATION" | "ENGLISH_DEFINITION" | "UNKNOWN",
        "typeLabel": "주제" | "제목" | "빈칸 추론" | "글의 순서" | "문장 삽입" | "무관한 문장" | "어법" | "어휘" 등 한국어 라벨,
        "answer": "③" 또는 "(B)-(A)-(C)" 같이 문제의 정답 (모르면 null),
        "answerConfidence": 0.0~1.0 (정답 단서 신뢰도, 모르면 null),
        "evidence": ["문제 풀이 근거가 된 본문/선지 단서들"],
        "warnings": ["풀이 시 주의사항"]
      },
      "continuesFromPrevious": boolean (PASSAGE_BODY only — 이 본문이 이전 페이지에서 이어진 것이면 true),
      "continuesToNext": boolean (PASSAGE_BODY only — 이 본문이 다음 페이지로 이어지면 true),
      "boundaryConfidence": 0.0~1.0 (PASSAGE_BODY only — 경계 판정 신뢰도)
    }
  ],
  "pageMeta": {
    "hasExamHeader": boolean,
    "subject": "ENGLISH" | "KOREAN" | "MATH" | "OTHER",
    "year": 정수,
    "round": "6월" | "9월" | "수능" | "중간" | "기말" | "1회" 등,
    "schoolName": 문자열 (내신시험일 때),
    "publisher": 문자열 (교재/학습지일 때, 예: "리딩파워", "수능특강", "빠바"),
    "pageNumber": 정수 또는 null (이 페이지의 번호 — "1 / 8" 이면 1, "( 2 )" 이면 2; 표시 없으면 null),
    "pageTotal": 정수 또는 null (이 페이지에 보이는 전체 쪽수 — "1 / 8" 이면 8; 없으면 null),
    "examCode": 문자열 또는 null (페이지 상단의 시험 코드 — "과목코드 03", "코드 [05]" 같이 적힌 식별자; 없으면 null),
    "problemEvidence": {                     // 페이지 단위 풀이 단서 (선택)
      "sourceHints": ["출처 추정 단서 (대표 문장, 인용 표시 등)"],
      "unresolved": ["풀이 못 한 부분 메모"],
      "warnings": ["페이지 단위 경고"]
    }
  }
}

[복원 관련 필드는 사용 금지]
- restoredText / restorationStatus / restorationChanges / restorationWarnings 필드는 1차 호출에서 사용하지 않는다. 본문은 \`content\`에 원문 그대로만 담는다. 복원은 후속 단계에서 별도 처리한다.`;

export const STRUCTURED_OCR_SYSTEM_PROMPT = `${OCR_SYSTEM_PROMPT}

[구조화 모드 — 블록 단위 분류]

다음 규칙에 따라 페이지 내용을 **의미 단위 블록들**로 분해해 JSON으로 출력한다.
출력은 오직 JSON 한 개(스키마 준수). 마크다운/코드블록/주석 금지.

[블록 타입별 판별 기준]

◆ EXAM_META — 시험/자료 식별 메타데이터 (오직 1페이지 상단에만)
  포함: 학년도, 회차/월차, 시험 종류, 과목명, 학교명, 학년·학기·교시, 교재명, 출판사·단원
  예시 내용:
    - "2024학년도 9월 모의평가 영어"
    - "2024학년도 대학수학능력시험 영어 영역"
    - "연수고등학교 2024학년도 2학기 2회고사 영어"
    - "리딩파워(유형완성) Ch 3,4,13~16강"
    - "수능특강 영어 Unit 12"
    - "과목코드: [44]", "제 2 교시", "2학년 공통과정"
  → 반드시 EXAM_META로 분리. PASSAGE_BODY나 HEADER로 절대 분류 금지.
  → pageMeta 필드(subject/year/round/schoolName/publisher)도 함께 채운다.

[페이지 식별 신호 (CRITICAL — 페이지 정렬 / cluster용)]
- 페이지 어디든 "N / M", "(N)", "- N -", "N쪽", "N page" 같은 페이지 표기가 보이면
  → pageMeta.pageNumber = N, pageMeta.pageTotal = M (분모 있을 때만).
  EXAM_META / HEADER / FOOTER 어느 블록에 들어가든 pageMeta 에 함께 기록.
- "과목코드 03", "코드 [05]", "시험번호: 7" 같은 시험 식별 코드가 페이지 상단에 보이면
  → pageMeta.examCode = "03" (숫자만 또는 표시 그대로 짧게).
  같은 시험지의 모든 페이지는 같은 examCode 를 공유한다. cluster signal로 사용.
- 페이지 번호 / 시험 코드가 안 보이면 해당 필드를 null 로.

[페이지 경계 처리 (CRITICAL — 문제/본문/보기가 페이지 사이에 잘리는 케이스)]
- 페이지 마지막 부분에 "다음 쪽에 계속", "▶", "→ 계속", "(계속)", "→" 같은 continuation 표시가 보이면
  → 그 직전 블록 (보통 마지막 PASSAGE_BODY 또는 마지막 QUESTION_STEM) 의
    continuesToNext = true 로 표시. PASSAGE_BODY 가 아니라 QUESTION_STEM 인 경우에도
    questionMeta 에 continuesToNext 형태로 보존 (선택 — 모르면 가까운 PASSAGE_BODY 에라도).
- 페이지 첫 부분이 곧장 ①, ②, ③, ④, ⑤ 같은 보기 마커로 시작하면
  → 그 보기들은 이전 페이지의 QUESTION_STEM 에 속하는 CHOICE 들이다. CHOICE 블록으로
    출력하고, 같은 페이지 안에 등장하는 다른 STEM (다음 문제) 의 자식으로 묶지 말 것.
    parentLocalId 는 비워둔다 (finalize 가 글로벌 순서로 자동 연결).
- 페이지 첫 PASSAGE_BODY 가 소문자 / 연결사 / 마침표 없는 절로 시작하면
  → 그 블록의 continuesFromPrevious = true 로 표시. 이전 페이지의 본문 끝과 자연스럽게
    이어지는 segment 임을 명시.
- 페이지 마지막 PASSAGE_BODY 가 마침표/물음표/느낌표로 끝나지 않으면
  → 그 블록의 continuesToNext = true 로 표시 (continuation 표시가 없어도).

◆ HEADER — 페이지 머리말 (비문항 장식)
  포함: 페이지 번호, 쪽수 표기("1", "- 1 -"), 로고, 문서 타이틀 반복, 답안 작성 유의사항 헤더
  → 본문과 분리해 별도 블록으로.

◆ FOOTER — 페이지 꼬리말
  포함: 저작권 고지("© 2024 출판사"), 쪽수, "다음 장으로" 안내
  → 본문에 섞지 말 것.

◆ PASSAGE_BODY — 지문 본문 (읽기 지문)
  - 지시문·문제 번호·선지를 포함하지 않는 순수 본문 텍스트
  - 문장 2개 이상, 최소 20자 이상 권장
  - 시험지 지문/교재 지문 모두 해당
  - 여러 문단이면 줄바꿈 2개로 분리 보존
  - **빈칸 표시**: 빈칸 추론 문제에서 시험지의 빈칸은 보통 긴 공백, 밑줄,
    또는 박스로 표시된다. content 에 옮길 때는 반드시 **"________"
    (underscore 8개 이상)** 로 변환해 빈칸 위치를 명시한다. 예:
    * "It's like a piece of ________ translation"
    * "Centralized, formal rules can ________"
    * "we tend to ________ our knowledge"
    공백/밑줄/박스 그대로 두면 후속 복원 단계에서 빈칸 위치를 추정할
    수 없어 빈칸이 사라진다. **빈칸 자리는 절대 누락하지 말 것**.

◆ QUESTION_STEM — 문제 지시문(문두)
  - 문제 번호 + 지시문 (선지는 별도 블록)
  - 예:
    * "1. 다음 글의 주제로 가장 적절한 것은?"
    * "2. 다음 글에서 필자가 주장하는 바로 가장 적절한 것은? [3.1점]"
    * "[2~4] 다음 글을 읽고 물음에 답하시오."
  - 배점 표시([3.1점])도 content에 포함
  - 소문항("1-①", "1-(가)")도 독립 QUESTION_STEM
  - **공유 지시문 "[N~M] ..." 은 반드시 별도 QUESTION_STEM 블록으로 추출**한다.
    공유 지시문은 본문 블록 안에 흡수하거나 생략하면 안 됨. 다음 두 가지 모두 명시:
    * questionNumber: null (이 stem 자체는 번호 없음)
    * sharedPassageRange: "N~M" (예: "41~42", "2~4")
    그 다음 본문(PASSAGE_BODY) 과 각 번호 stem 들은 같은 sharedPassageRange 를
    동일하게 가진다. **공유 지시문 stem 누락은 흔한 오류 — 절대 빼먹지 말 것**.

◆ CHOICE — 선지 (각각 독립 블록 ①~⑤)
  - ①②③④⑤ 각 선지를 반드시 5개 분리. 한 블록에 여러 선지 묶기 금지.
  - content에는 "① situations workers get stressed out" 전체 포함 (원문자 포함)
  - questionNumber: 이 선지가 속한 문제 번호 (필수)
  - choiceIndex: 1~5
  - isAnswer: 이미지에 명확한 정답 표시(★/●/■/체크표시)가 있을 때만 true

◆ EXPLANATION — 정답 해설
  - "정답", "해설", "풀이" 같은 섹션 이후 본문
  - questionNumber와 함께

◆ DIAGRAM — 도표/그림/표 (OCR 불가능한 시각 요소)
  - content: "(표: 국가별 GDP 비교)" 같은 설명

◆ NOISE — 낙서/필기/형광펜 마킹 흔적
  - 가능하면 아예 제외. 꼭 남겨야 하면 NOISE로.

[공유 지문 vs 공유 지시문 — 매우 중요]

범위 표기 "[2~4]"가 나올 때 두 가지 케이스를 반드시 구분:

케이스 A — 공유 지문 (여러 문제가 지문 1개를 공유):
  "[2~4] 다음 글을 읽고 물음에 답하시오."
  → PASSAGE_BODY 1개 (sharedPassageRange: "2~4")
  → QUESTION_STEM 3개 (questionNumber: 2, 3, 4, 각각 sharedPassageRange: "2~4")
  → CHOICE 각 문제당 5개씩 총 15개

케이스 B — 공유 지시문 (여러 문제가 지시만 공유, 지문은 각각):
  "[2~4] 다음 글의 주제로 가장 적절한 것을 고르시오."
  이어서 각 번호마다 별도 본문이 나옴.
  → PASSAGE_BODY 3개 (각각 다른 내용, sharedPassageRange: null)
  → QUESTION_STEM 3개 (각 문제, sharedPassageRange: null)
  → CHOICE 각 문제당 5개씩

판별 기준:
- 지시가 "다음 글을 읽고" / "Read the following passage" 형태 + 본문이 1개만 이어지면 → 케이스 A
- 지시가 "다음 글의 주제로" / "다음 글에서 필자가" / "다음 글의 제목으로" 같은 질문형 + 범위 안 각 번호마다 별도 본문이 이어지면 → 케이스 B
- 본문 개수 = 문제 개수면 케이스 B, 본문 1개 + 문제 다수면 케이스 A

[출력 순서 규칙]
1. EXAM_META (페이지 1 상단만)
2. HEADER (있으면)
3. 각 문항 묶음: PASSAGE_BODY → QUESTION_STEM → CHOICE × 5 (순서 반복)
4. EXPLANATION (있으면)
5. FOOTER (있으면)
블록 순서는 시험지에서 읽는 순서(좌→우, 상→하, 2단 레이아웃은 좌 전체 → 우 전체).

[엄격 준수]
- 출력은 JSON 1개. 그 외 일체 금지.
- 모든 선지 ①~⑤는 반드시 5개 독립 CHOICE 블록. 한 블록에 병합 금지.
- questionNumber는 명확할 때 반드시 기입 (비워두면 후처리에서 매핑 실패).
- 오탈자도 이미지에 보이는 형태 그대로 기록한다.

${STRUCTURED_OCR_SCHEMA_HINT}`;
