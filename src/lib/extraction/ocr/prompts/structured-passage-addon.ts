/**
 * Additional rules appended to the structured OCR system prompt when the
 * extraction mode is `PASSAGE_ONLY` (자료 라이브러리 import). This addon
 * covers question-type classification, vocab-blank worksheets, pure passage
 * pages, and shared-passage stem handling — all behaviours that are scoped
 * to the PASSAGE_ONLY mode and don't apply to full-exam extraction.
 */
export const PASSAGE_ONLY_STRUCTURED_ADDON = `
[PASSAGE_ONLY 추가 규칙 — 1차 호출의 책임]

이 페이지에서 1차 호출이 책임지는 일은 다음 두 가지뿐이다.

1) 이미지에 인쇄된 형태대로 텍스트 기록
   - 본문 블록(PASSAGE_BODY)·문제 번호·지시문·선지 모두 시험지 이미지에 보이는 모습대로 \`content\`에 담는다.
   - ① ~ ⑤ 마커, 빈칸 ___, (A)(B)(C) 라벨, [3점] 같은 배점 표기, 박스 sentence 등 문제 형태도 같이 기록한다.
   - "복원"은 시도하지 않는다. restoredText / restorationStatus / restorationChanges 등 복원 관련 필드는 사용하지 않는다.
   - 한 페이지에 여러 문제가 있으면 각각 분리해서 블록으로 출력하되, 본문 자체는 이미지의 형태를 유지한다.

2) 문제별 풀이 + 유형 분류
   - 각 QUESTION_STEM 블록에 \`questionAnalysis\` 필드를 채운다.
     * questionType: 아래 [유형 매핑 표] 의 한국어 stem 키워드를 보고 enum 값을 결정한다. 키워드가 명확하면 반드시 그 type을 사용 — UNKNOWN으로 도피하지 말 것. 진짜로 어느 패턴도 매칭 안 되는 드문 케이스만 "UNKNOWN".
     * typeLabel: 그 type에 대응되는 한국어 라벨 (아래 표 참고).
     * answer: 본문/선지로부터 추론한 정답 ("③", "(B)-(A)-(C)", "after the third sentence" 등). 자신 없으면 null.
     * answerConfidence: 0.0~1.0. 자신 없으면 null.
     * evidence: 풀이의 근거가 된 본문/선지 발췌 (string[]).
     * warnings: 풀이 시 주의사항 (string[]).
   - 페이지 전체에 걸친 출처 단서(인용 표시, 대표 문장)는 pageMeta.problemEvidence.sourceHints 에 담는다.

[유형 매핑 표 — 한국어 stem 키워드 → questionType]

같은 의미의 변형 (띄어쓰기·조사·문장부호 차이)도 모두 동일 type 으로 매핑하라. 두 패턴이 동시 매칭하면 더 구체적인 (= 본문 수정이 더 명확한) type 을 우선 선택.

A. 본문 수정 / 보강이 필요한 유형 ← 복원 단계에서 본문 자체를 손봐야
  * "빈칸에 들어갈 말로 가장 적절한" + 빈칸이 1개 단어 후보 → BLANK_WORD ("빈칸 단어")
  * "빈칸에 들어갈 말로 가장 적절한" + 빈칸이 1개 문장 후보 → BLANK_SENTENCE ("빈칸 문장")
  * "빈칸에 들어갈 말로 가장 적절한" + 빈칸이 2개~3개 ((A)(B) / (A)(B)(C)) → BLANK_WORD ("빈칸 단어·어구", 복수 빈칸)
  * "빈칸에 들어갈 말로 가장 적절한" + 단순 추론 (위 세 가지 어디에도 명확히 안 들어가는 일반 빈칸) → BLANK_INFERENCE ("빈칸 추론")
  * "빈칸에 들어갈 연결사" / "빈칸에 들어갈 연결어" → CONNECTOR ("연결사")
  * "주어진 글 다음에 이어질 글의 순서로 가장 적절한" → PARAGRAPH_ORDER ("단락 순서")
  * "다음 글의 (A), (B), (C)의 순서로 가장 적절한" / "글의 순서로 가장 적절한" → SENTENCE_ORDER ("글의 순서")
  * "흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳" → SENTENCE_INSERT ("문장 삽입")
  * "전체 흐름과 관계 없는 문장" / "전체 흐름과 무관한 문장" → IRRELEVANT ("무관한 문장")
  * "어법상 적절하지 않은" / "어법상 틀린" / "어법상 어색한" → GRAMMAR_ERROR ("어법")
  * "어법상 올바른 형태로 쓰시오" / "어법에 맞게 고치시오" (서답형) → GRAMMAR_CORRECTION ("어법 수정")
  * "문맥상 낱말의 쓰임이 적절하지 않은" / "문맥상 어색한 단어" → VOCAB_CHOICE ("어휘")
  * "보기의 (A)~(I) 중 밑줄 친 단어의 동의어가 문맥상 적절하지 않은 것" / "동의어/유의어가 적절하지 않은" → VOCAB_CHOICE ("어휘 — 동의어 적합성")
  * "요약문의 빈칸에 들어갈 말로 가장 적절한 것끼리 짝지어진 것" → SUMMARY_COMPLETE ("요약문 완성")
  * "한 문장으로 요약하고자 한다. 빈칸 (A), (B) ... 에 들어갈 말" (서답형) → SUMMARY_COMPLETE ("서답형 요약")
  * "박스 안에 주어진 단어를 모두 이용하여 의미와 어순에 맞게" / "단어들을 의미에 맞게 배열" → WORD_ORDER ("어순 배열")
  * "문장을 ~로 바꿔 쓰시오" / "문장을 ~ 형태로 변환하시오" → SENTENCE_TRANSFORM ("문장 변환")
  * "조건에 맞게 영작하시오" / "조건에 맞게 서술하시오" → CONDITIONAL_WRITING ("조건 작문")
  * "다음 글을 읽고, 밑의 질문에 대한 답으로 가장 적절한 '완전한 한 문장'을 본문에서 찾아 그대로 쓰시오" → TEXTBOOK_DETAIL ("본문 문장 찾기 — 서답형")
  * "다음 대화의 순서로 가장 적절한" → DIALOGUE_ORDER ("대화 순서")

B. 본문 수정 불필요 유형 ← 복원 단계에서 본문 그대로 emit + 마커만 strip
  * "글의 제목으로 가장 적절한" → TITLE ("제목")
  * "글의 주제로 가장 적절한" → TOPIC_MAIN_IDEA ("주제")
  * "글의 요지로 가장 적절한" → TOPIC_MAIN_IDEA ("요지")
  * "글의 목적으로 가장 적절한" → PURPOSE ("글의 목적")
  * "필자의 심경 / 분위기로 가장 적절한" / "I'의 심경 변화" → MOOD_TONE ("심경 / 분위기")
  * "글의 내용과 일치하지 않는" / "글의 내용과 일치하는" → CONTENT_MATCH ("내용 일치")
  * "도표의 내용과 일치하지 않는" / "표의 내용과 일치하지 않는" → CONTENT_MATCH ("도표 일치", 본문이 도표)
  * "안내문의 내용과 일치하지 않는" / "안내문에 관한 설명으로 일치하지 않는" → CONTENT_MATCH ("안내문 일치")
  * "밑줄 친 ~ 가 다음 글에서 의미하는 바로 가장 적절한" → CONTEXT_MEANING ("함축적 의미")
  * "밑줄 친 ~ 가 가리키는 대상이 / 지칭하는 것이 다른" → REFERENCE ("지칭 추론")
  * "다음 대화의 빈칸에 들어갈 응답으로 가장 적절한" → DIALOGUE_RESPONSE ("대화 응답")
  * 영어 단어의 의미를 한국어로 번역하는 문제 → KOREAN_TRANSLATION ("한국어 번역")
  * 영어 단어의 영영풀이 (definition) 선택 → ENGLISH_DEFINITION ("영영풀이")

C. 한국어 지시문 없는 영어 어휘 빈칸 워크시트
  * 이 페이지는 QUESTION_STEM 자체를 만들지 않으므로 매핑 표가 적용되지 않는다. 페이지 전체를 PASSAGE_BODY 1개로 출력 — 자세한 규칙은 [빈칸 어휘 워크시트 처리] 섹션 참고.

D. 매핑 안 되는 경우만 → UNKNOWN
  * 위 어느 패턴에도 매칭 안 됨 — 새로운 형태이거나 stem 이 너무 짧아서 판별 불가
  * UNKNOWN 으로 분류했어도 evidence 와 answer 는 가능한 한 채워야 한다

[정밀도 규칙]
  * 비슷한 두 type 중 헷갈리면 본문 수정이 더 명확한 쪽 선택 (A 그룹 우선)
  * "빈칸" + "연결사" 동시 매칭 → CONNECTOR 우선
  * "빈칸" + "요약문" 동시 매칭 → SUMMARY_COMPLETE 우선
  * UNKNOWN 으로 도피하지 말 것. 위 매핑 표의 키워드가 stem 에 부분이라도 나타나면 그 type 으로 결정.
    UNKNOWN 은 "[N~M] 다음 글을 읽고 물음에 답하시오" 같은 ANCHOR-only stem 처럼 본문 수정 지시 자체가 없는 케이스에만 사용한다.

[빈칸 어휘 워크시트 처리 (CRITICAL — 한국어 stem 없는 어휘 빈칸 자료)]
  강사가 어휘 빈칸 채우기 워크시트를 업로드하는 케이스. 페이지에 한국어 지시문 (예: "다음 빈칸에 알맞은 말을 고르시오") 이 없고, 각 줄이 다음 패턴을 따른다:
  - 글머리표 (-, •, ·) 로 시작
  - 영어 한 문장
  - 그 문장 안에 "(A) ___", "(B) ___" 형태의 letter-라벨 빈칸 1개 이상
  - 선지 (① ② ③ ④ ⑤) 없음 (free-response)
  - 학생이 손글씨/연필로 빈칸 옆 또는 위에 정답 후보를 적어둔 경우도 있음

  예시:
    -There is a strong (A) ______ between income and education level.
    -Reading classical texts often (B) ______ moments of self-reflection.
    -Our perceptions can be (C) misleading because our senses sometimes make mistakes.

  처리 규칙 (한 워크시트 = 한 자료):
  1) 페이지 전체를 **하나의 PASSAGE_BODY 블록** 으로 출력. 12줄이면 12줄 모두 동일 블록 안에 담는다.
  2) PASSAGE_BODY.content = 줄바꿈으로 연결된 영어 본문. 글머리표 (-, •, ·) 는 제거, 빈칸 마커 "(A) ______" 는 유지.
     - 손글씨 정답이 빈칸 위에 적혀 있어도 content 에는 절대 포함하지 말 것. 빈칸 마커 그대로.
  3) QUESTION_STEM 블록을 만들지 말 것. (한국어 지시문 부재 = 풀이 대상 stem 없음. 각 줄을 별도 stem 으로 분해하지 마라 — 워크시트 한 장이 한 자료다.)
  4) CHOICE 블록을 만들지 말 것. (free-response 라 선지 없음.)
  5) confidence: 일반 PASSAGE_BODY 와 동일 기준으로 0~1.

  [순수 지문 페이지 처리] 와의 구분:
  - 글머리표 + (Letter) ___ 빈칸 패턴이 1줄이라도 보이면 vocab blank worksheet 로 처리 (위 규칙).
  - 그렇지 않고 영어 문단만 있으면 [순수 지문 페이지 처리] 로.

[순수 지문 페이지 처리 (CRITICAL — 문제 stem 없는 자료)]
  강사가 시험지가 아닌 "지문만 모아둔 자료" (학원 reading 자료, 교과서 단원 본문 모음, EBS 본문 발췌 등) 를 업로드하는 경우가 있다. 이 페이지에는 QUESTION_STEM (문제 번호 + 한국어 지시문) 이 전혀 없다. 처리 원칙:

  1) 페이지에 QUESTION_STEM 블록을 하나도 만들지 않을 것 (없는 stem 을 억지로 만들지 말 것).
  2) 본문을 의미 단위 (passage 단위) 로 분리해서 각각 별도 PASSAGE_BODY 블록으로 출력:
     - 문서 안에 명시적 헤더 ("PASSAGE 01", "Passage 1", "지문 1", "## Title", 큰 fonts 의 단락 제목 등) 가 있으면 각 헤더가 새 passage 의 시작.
     - 헤더가 없으면 큰 단락 break (빈 줄 2개 이상, 혹은 명확한 구분선) 를 passage 경계로 사용.
     - 헤더도 없고 큰 단락 break 도 없으면 페이지 전체를 하나의 PASSAGE_BODY 로.
  3) 각 PASSAGE_BODY 블록의 passageMeta.title 에 passage 의 제목을 채운다 (있으면).
     - 예: "PASSAGE 01 / The Architecture of Attention" → title="The Architecture of Attention"
     - 제목 없으면 첫 문장의 첫 5~10 단어를 title 로.
  4) PASSAGE_BODY 의 content 에는 본문만 담는다 ("PASSAGE 01" 같은 navigation 라벨은 빼되, 제목 자체 ("The Architecture of Attention") 는 본문 앞 줄에 포함 가능).
  5) 같은 페이지에 일부 영역은 stem + 본문 묶음이고 다른 영역은 stem 없는 순수 passage 인 hybrid 케이스도 가능. 그 경우 두 영역 모두 위 규칙에 따라 출력 (한 페이지 안에 STEM 묶음 + orphan PASSAGE_BODY 혼재).

  Downstream 그루핑이 이 PASSAGE_BODY 들을 자동으로 단독 draft 로 만든다 — stem 없이도 자료 라이브러리에 적재 가능하다.

[공유 지문 stem 처리 (CRITICAL — 그루핑에 영향)]
  하나의 공유 지문에 N번 ~ M번 문제가 묶이는 시험지 패턴 ("[N~M] 다음 글을 읽고 물음에 답하시오" + 그 아래 "N. [...점]", "N+1. [...점]" 같은 개별 stem) 처리는 다음과 같이 통일한다.

  1) ANCHOR stem (공유 지시문) 출력:
     - 별도 QUESTION_STEM 블록으로 출력하되 questionNumber 는 비운다 (number=null).
     - sharedPassageRange="N~M" 으로 명시.
     - questionAnalysis 는 비운다 (questionType=null, answer=null). 이 stem 자체는 지시문일 뿐 풀이 대상이 아님.

  2) 개별 numbered stem 출력:
     - 각 번호 (N, N+1, ..., M) 마다 별도 QUESTION_STEM 블록으로 출력.
     - questionNumber=정수.
     - sharedPassageRange="N~M" 동일하게 명시.
     - questionAnalysis 는 그 번호 stem 의 한국어 키워드를 매핑 표에 따라 채운다 (TITLE / VOCAB_CHOICE / BLANK_* / IRRELEVANT / SENTENCE_INSERT 등). UNKNOWN 금지.

  3) 한 번호가 두 ANCHOR 그룹에 동시 등장 금지:
     - 시험지 page-break 등으로 N번이 "[8~9]" ANCHOR 와 "[9~10]" ANCHOR 둘 다 가깝게 보여도, N번 stem 블록은 한 번만 출력한다 (가장 가까운 ANCHOR 한 곳에 sharedPassageRange 매핑).
     - 두 ANCHOR 가 실제 시험지에 둘 다 인쇄되어 있어도 stem 본문 (예: "9. [3.1점] ...") 자체는 시험지에서 한 번만 등장하므로 한 블록만 출력하면 된다.

  4) ANCHOR 없이 sub-passage 라벨 ([I], [II], (A), (B) 등) 로 묶이는 케이스:
     - 한 numbered stem 안의 sub-passage 표지는 PASSAGE_BODY 블록의 일부로 처리. 별도 stem 블록 만들지 말 것.

  이 규칙을 위반하면 후속 그루핑이 한 문제를 두 draft 로 분리하거나 그 반대로 합치는 오류가 발생한다.

[블록 분리 원칙]
- 한 문항 = QUESTION_STEM + (필요하면 박스 sentence 같은 보조 블록) + (있으면) PASSAGE_BODY + CHOICE×N.
- 각 선지 ① ~ ⑤는 반드시 5개 독립 CHOICE 블록.
- 본문이 페이지 경계에서 잘리면 continuesFromPrevious / continuesToNext 표시.
- 한 페이지에 본문 없는 문제(어법 5문장 비교 등)가 있으면 PASSAGE_BODY 없이 QUESTION_STEM + CHOICE만 출력.
- 박스로 둘러싼 sentence(삽입형 정답 후보)는 DIAGRAM이 아니라 별도의 PASSAGE_BODY 블록(혹은 그 문제의 일부 컨텍스트)으로 출력하라. 박스 외형은 시각 요소가 아니라 문제 본문의 일부다.
- 동일 페이지 안에 여러 문제·여러 본문이 있으면 reading order(좌→우, 상→하) 그대로 블록을 나열한다.

[제외할 것]
- 시험지 헤더(시험명·학교·학년·출판사) → EXAM_META 블록.
- 페이지 번호·저작권·"다음 장으로" → HEADER / FOOTER.
- 필기·낙서·형광펜 → NOISE 또는 제외.
`;
