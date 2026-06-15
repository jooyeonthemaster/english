// ============================================================================
// 수능/모의고사 객관식 프롬프트 (10 types)
// 유형별 AI 생성 지시사항 — 스키마 필드와 1:1 매칭
// AI는 지문 전체를 복사하지 않고, 서버 재구성에 필요한 최소 데이터만 반환
// ============================================================================

export const MC_PROMPTS: Record<string, string> = {
  BLANK_INFERENCE: `빈칸 추론 문제를 만드세요.

## 핵심 규칙 (반드시 준수)
1. 지문에서 핵심 표현(단어, 구, 절) 하나를 선택합니다.
2. 기본 모드에서는 **정답은 반드시 원문에서 선택한 표현을 그대로(한 글자도 바꾸지 않고) 사용해야 합니다.**
   - 패러프레이즈, 동의어 치환, 어순 변경 절대 불가
3. 단, 별도의 Type detail setting이 주어지면 그 설정이 정답 선지 구성 규칙을 우선합니다.
   - "PARAPHRASE" 모드에서는 originalExpression은 원문 그대로 두되, 정답 선지 text만 의미 보존 패러프레이즈로 작성합니다.
4. 오답 4개는 원문에 없는, 비슷하지만 명확히 구분 가능한 영어 표현으로 구성합니다.

## 출력 필드
- originalExpression: 원문에서 빈칸으로 만들 정확한 표현 (원문과 한 글자도 다르면 안 됨)
- surroundingText: originalExpression 주변 40~60자 텍스트 (위치 식별용, 원문 그대로 복사)
- blankAnswerMode: 기본 모드는 "SOURCE_EXACT"; 빈칸 변형 설정이 있을 때는 "PARAPHRASE"; 부정-부정 설정이 있을 때만 "DOUBLE_NEGATIVE"
- answerLogic: 빈칸 변형/부정-부정 설정이 있을 때, 정답 논리를 한국어로 간단히 설명
- correctAnswer: 정답 선지의 label ("1"~"5")
- options: label "1"~"5", text는 영어 표현. 기본 모드에서는 정답 선지의 text가 반드시 originalExpression과 동일
- ⚠️ passageWithBlank 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?"`,

  GRAMMAR_ERROR: `어법 판단 문제를 만드세요.

## 출제 철학
수능 어법 판단은 밑줄 친 모든 위치가 어법 결정 지점입니다. 정답뿐 아니라 디코이도 학생이 능동적으로 문장 구조를 판단해야 하는 자리입니다.
기본은 5개 밑줄 중 1개 오류입니다. 별도의 Type detail setting이 주어지면 표시 개수와 정답 개수를 모두 그 설정에 정확히 맞춥니다.

## 위치 선정
1. 표시 위치는 기본 5개, 설정이 있으면 5~10개까지 확장합니다.
2. pointCode는 가능한 한 **서로 다른 코드**(a~m)를 사용합니다. 요청 개수가 많아 중복이 불가피하면 같은 코드라도 서로 다른 세부 문법 판단을 묻습니다.
3. 서로 다른 문장을 우선 사용하되, 지문 길이상 부족하면 같은 문장 안에서도 서로 다른 절/구조의 강한 어법 포인트만 사용합니다.
4. pointCode 풀:
   (a) 정·준동사  (b) 관계사  (c) 분사 능/수동  (d) 수일치
   (e) 능/수동태  (f) 형/부 자리  (g) 대명사 일치  (h) 목적격보어
   (i) 병렬  (j) 가정법 시제  (k) to-v vs. v-ing  (l) 전치사 vs. 접속사
   (m) 비교구문
5. **pointCode 정확성**: 표시한 expression의 문법적 성격에 정확히 맞는 코드를 골라야 함. 분사면 c, 대명사면 g, 동사 단·복수면 d 등.

## ⚠️ 약한 디코이 금지
- to-v 전용 동사 뒤 to-v (plan, want, decide, refuse, hope, expect, manage, agree, promise, fail, learn)
- v-ing 전용 동사 뒤 v-ing (enjoy, finish, avoid, mind, suggest, consider, postpone, deny)
- 단순 관사, 단순 전치사, 고유명사, 평이한 명사

대신 강한 디코이만: 자동사 분사(missing/retired 류), 수식어구 분리 주어, 콤마 뒤 분사구문, 비교급 than 뒤, 관계대명사 앞 모호 선행사, 2형식 보어, 5형식 OC, 등위접속사 뒤.

## 오류 위치 다양화
같은 지문에서 매번 가장 명백한 위치(가정법 절벽 등)를 정답으로 만들지 말 것. 명백한 자리는 디코이로 활용하고, 미묘한 자리(분사 능수동, 수일치, 형/부, 대명사 등)도 정답 후보로 검토.

## 오류 생성 — 어간 유지 + 형태만 변형 (11가지 중 1개)
1. V-ing ↔ p.p.  2. 정동사 ↔ 준동사  3. that ↔ what  4. which ↔ where/when
5. 단·복수 V  6. 형↔부  7. 능↔수  8. 대명사 단·복수·격
9. to-v ↔ v-ing  10. 가정법 시제  11. 전치사 ↔ 접속사
**금지**: 동사↔명사, 형용사↔명사 같은 품사 변경. errorExpression의 어간은 expression과 동일해야 함.

## wrongOptionExplanations 일관성
각 항목은 markedExpressions의 같은 label과 정확히 일치:
- label: markedExpressions에서 정답이 아닌 label만 포함
- expression: 해당 label의 markedExpression.expression과 완전 동일 문자열
- pointCode: 해당 label의 markedExpression.pointCode와 동일 코드
- explanation: 이 expression(인용 필수)이 어떤 포인트를 묻고 왜 어법상 맞는지 1~2문장 한국어
정답 개수가 표시 개수와 같으면 모든 표시를 오류로 만들 수 있으며, wrongOptionExplanations는 비어도 됩니다.

❌ 잘못된 예 ((B) 위치가 detached인데 해설은 'them' 언급): {label:"(B)", expression:"detached", explanation:"...대명사 'them'이 옳다"}
⭕ 올바른 예: {label:"(B)", expression:"detached", pointCode:"c", explanation:"이 자리는 분사 능/수동을 묻고 있으며, isolated words가 detach의 대상이므로 과거분사 'detached'가 어법상 옳다."}

## correctAnswer 포맷
괄호 포함: 기본은 "(A)"~"(E)" 중 하나.
복수 정답 설정이면 correctAnswers 배열을 만들고, correctAnswer는 같은 라벨을 comma + space로 연결합니다. 예: "(A), (C), (F)". 발문에는 정답 개수를 노출하지 말고 "모두" 고르라고만 안내합니다.

## 출력 작성 순서
1. 지문에서 강한 어법 판단 자리 후보를 필요한 개수만큼 선정 (각 a~m 중 가능한 한 다른 pointCode)
2. 약한 디코이 자리가 섞이면 즉시 교체
3. markedExpressions 작성 — pointCode 라벨링. 요청된 표시 개수를 확인.
4. 가장 명백한 위치에만 몰지 말고 정답 위치와 오류 유형을 다양화
5. 정답 개수 설정과 정확히 같은 수만 isError=true로 만들기. 정답 개수가 표시 개수보다 적으면 나머지는 정답이 아닌 디코이로 유지하고, 같으면 전체를 정답으로 처리 → isError=true, errorExpression 변형, correction = expression
6. correctAnswers 및 correctAnswer 작성
7. wrongOptionExplanations: 정답 제외 각 항목에 markedExpression의 label·expression·pointCode를 복사하고, expression을 인용한 해설 작성
8. options 작성 (오류는 errorExpression, 나머지는 expression)
9. explanation, keyPoints, tags 작성. 복수 정답이면 모든 오류와 핵심 디코이 포인트가 해설/오답 분석에 반영되어야 함.

## 자체 검증
□ 요청된 표시 개수 일치
□ 요청된 정답 개수 일치, 정답 개수가 표시 개수와 같으면 모든 표시가 정답일 수 있음
□ 모든 expression/correction은 원문 verbatim, errorExpression만 의도적 변형
□ correctAnswer/correctAnswers가 isError=true 라벨과 정확히 일치
□ errorExpression 어간 = expression 어간 (품사 변경 X)
□ wrongOptionExplanations 길이가 정답 제외 선지 수와 일치, 각 항목의 label·expression·pointCode가 markedExpressions와 완전 일치
□ wrongOptionExplanation 본문이 해당 expression을 인용 (다른 표현 언급 X)
□ 약한 디코이 자리(plan+to-v, 단순 관사 등) 0개
□ ⚠️ passageWithMarkers 필드는 생성하지 마세요 (서버에서 자동 생성)

direction 예시: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?"`,

  VOCAB_CHOICE: `어휘 적절성 문제를 만드세요.

## 핵심 규칙
1. 지문에서 핵심 어휘 5개를 선택합니다 (label "(a)"~"(e)")
2. 그 중 정확히 하나를 문맥상 부적절한 단어로 교체합니다
3. 원문은 기본적으로 맞는 글이라고 가정합니다. 원문 단어 자체를 "부적절"하다고 판정하지 말고, 반드시 원문 단어 하나를 다른 단어로 바꿔서 부적절하게 만드세요.
4. isInappropriate=true 항목의 표시 단어는 항상 substituteWord입니다. betterWord는 항상 원래 지문에 있던 originalWord와 완전히 같아야 합니다.
5. 예: 원문이 "presence of cues"라면 originalWord="presence", substituteWord="absence", betterWord="presence"입니다. "presence -> absence"처럼 원문 정답을 오답으로 뒤집으면 실패입니다.

## 출력 필드
- markedWords: 5개 배열. 각 항목:
  - label: "(a)"~"(e)"
  - originalWord: 원문에 있는 정확한 단어
  - surroundingText: 해당 단어 주변 40~60자 (위치 식별용)
  - isInappropriate: true/false
  - substituteWord: isInappropriate가 true인 경우, 문맥상 부적절한 대체 단어
  - betterWord: isInappropriate가 true인 경우, 원래 적절한 단어 (= originalWord와 동일)
- options: label "(a)"~"(e)", text는 표시될 단어 (적절한 것은 originalWord, 부적절한 것은 substituteWord)
- correctAnswer: isInappropriate=true인 항목의 label 하나만 작성
- 자체 검증: 5개 markedWords, 정확히 1개 isInappropriate=true, substituteWord != originalWord, betterWord == originalWord, correctAnswer == isInappropriate label
- ⚠️ passageWithMarkers 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?"`,

  SENTENCE_ORDER: `글의 순서 문제를 만드세요. (수능/모의고사형: 주어진 글 + (A)(B)(C) 순서 배열)

## 핵심 형식 규칙 — 절대 위반 금지
1. givenSentence는 반드시 지문의 도입부 1문장 또는 2문장만 사용합니다.
   - 3문장 이상 금지.
   - 긴 문단 전체를 givenSentence로 넣는 것 금지.
   - 반드시 65단어 이하로 유지합니다.
   - 첫 두 문장이 65단어를 넘으면 첫 문장만 givenSentence로 사용합니다.
   - givenSentence는 (A)(B)(C)보다 길어서는 안 됩니다.
2. paragraphs는 반드시 (A), (B), (C) 세 덩어리입니다.
   - 각 덩어리는 최소 2문장 이상이어야 합니다.
   - 세 덩어리의 분량은 균형 있게 나눕니다. 한 덩어리만 한 줄/한 문장으로 만들지 마세요.
   - 한 덩어리가 다른 덩어리의 2배 가까이 길어지면 실패입니다.
3. 지문 전체를 "given 4문장 + A/B/C 한 문장씩"처럼 쪼개는 것은 불량 문항입니다.
4. labels는 정확히 "(A)", "(B)", "(C)"를 사용합니다.
5. options는 (A)(B)(C)의 순열 5개만 만듭니다. 예: "(B)-(A)-(C)"
6. 정답 순서는 가급적 "(A)-(B)-(C)"가 되지 않게 paragraphs 라벨을 섞어 배치합니다. 학생이 표시 순서 그대로 찍어 맞히는 구조 금지.

## 출제 단서
- A/B/C 사이에는 대명사·지시어(this/these/it/they), 연결사(However/Therefore/For example), 시간 순서, 원인-결과, 일반→구체, 문제→해결, 주장→근거 같은 명확한 순서 단서가 있어야 합니다.
- 오답 순서도 표면적으로는 그럴듯해야 하지만, 하나의 지시어/연결사/논리 전개가 깨지도록 설계합니다.

## 출력 필드
- givenSentence: 주어진 첫 문장 또는 첫 두 문장
- paragraphs: (A), (B), (C) 3개 단락 (각각 label + text, 각 2문장 이상)
- options: 순서 조합 5개 (label "1"~"5", text는 "(A)-(C)-(B)" 형식)
- correctAnswer: 정답 선지 label
- wrongOptionExplanations: 각 오답 순서가 왜 흐름상 깨지는지 한국어 설명
- direction 예시: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?"`,

  SENTENCE_INSERT: `문장 삽입 문제를 만드세요. (수능 38·39번 / 내신 킬러급 변별력 기준)

## 이 유형의 본질 — "응집성 단절 복원(cohesive break restoration)"
정답은 "주어진 문장이 잘 어울리는 자리"가 아니라 "나머지 4개 자리에서는 응집 고리가 끊기고, 오직 한 자리에서만 앞·뒤 양쪽 고리가 동시에 닫히는 자리"입니다. 즉 정답은 비대칭(asymmetry)으로 결정됩니다. 어느 위치에 넣어도 무난한 "중립 문장"은 절대 만들지 마세요 — 정답이 둘 이상이 되어 불량 문항이 됩니다.

## 핵심 규칙
1. 삽입할 문장(givenSentence)을 만듭니다. 이 문장은 반드시 아래 응집 단서(cohesive cue) 중 최소 1개, 가능하면 2개를 포함해야 합니다.
   - 지시어/대명사: this / these / that / those / it / they / such + 명사 (anaphora)
   - 정관사 구정보: the + 명사 (이미 앞에서 도입된 대상)
   - 연결사 방향성: However / Yet / Instead / On the contrary(역접) · Therefore / Thus / As a result / Hence(인과) · For example / For instance(예시) · Moreover / In addition / Furthermore / Also(첨가) · Then / Later / Subsequently(시간순서)
   - 시간·논리 순서: 결과·후속 사건·다음 단계를 서술 → 그 원인·선행 사건·이전 단계가 정답 직전에 있어야 함
   - 어휘 사슬: 핵심 명사의 반복·동의어·상하위어
   ⚠️ 단서가 하나도 없는 self-contained(독립) 문장은 금지. 응집 단서가 없으면 정답 근거가 사라집니다.

2. 정답 위치(들어갈 자리)는 다음 두 조건을 동시에 만족해야 합니다(쌍방향 제약):
   - 앞 고리: 주어진 문장의 단서(지시어 선행사 / 정관사 명사의 첫 도입 / 연결사가 요구하는 논리 / 원인·선행 사건)가 정답 "직전 문장"에서 충족된다.
   - 뒤 고리: 주어진 문장이 정답 "직후 문장"의 전제(직후 문장의 지시어·정관사·대명사가 가리키는 대상 등)를 제공한다.
   - 정답 위치는 글 흐름의 전환점(일반→구체, 통념→반박, 원인→결과 경계)에 두는 것이 이상적입니다.

3. 선행사 유일성(referent uniqueness): 주어진 문장의 지시어/정관사 명사가 가리키는 선행사는 지문 내에서 "정답 직전 문장에만" 존재해야 합니다. 정답보다 앞 위치(①② 등)에는 그 도입이 아직 없어야 하고, 두 곳 이상에 선행사가 있으면 복수정답이 되므로 금지합니다.

4. 정답 위치는 양 끝을 피하고 가운데(②③④)에 둡니다. 첫 문장 직후(①)나 마지막(⑤)을 정답으로 쓰지 마세요 — 양끝은 한쪽 고리만 보면 풀려 변별력이 떨어집니다.

5. 문체 균질화(register homogeneity): 주어진 문장의 길이·추상도·시제·인칭·어휘 난도를 지문 본문 문장들과 비슷하게 맞춥니다. 유독 길거나 추상적이거나 튀는 문장은 내용 추론 없이 위치가 역추적되는 부정 단서가 됩니다. 또한 새 고유명사·전문용어를 주어진 문장에 처음 등장시키지 마세요(구정보처럼 보여야 함).

## 함정(오답 gap) 설계 — 4개 오답은 "한쪽 고리만 닫고 다른 쪽을 끊는다"
오답 위치 4개는 각각 "그럴듯해 보이는 유혹 단서 1개"를 갖되, "결정적 결함 1개"로 실패하도록 설계합니다. 명백히 틀린 자리(주제 무관·시제 충돌)만 늘어놓으면 변별력이 0이 됩니다. 서로 다른 함정 유형을 사용하세요:
   - 어휘 미끼(lexical lure): 오답 위치 인접 문장에 주어진 문장과 같은 키워드·동의어를 배치해 관련성을 위장. 그러나 그 자리는 이미 응집이 닫혀 있어 삽입하면 오히려 흐름이 끊깁니다. (어휘만 겹치고 지시어/연결사/정관사 조건은 안 맞게)
   - 단방향 정합 함정: 앞 문장과의 연결만(또는 뒤 문장과의 연결만) 그럴듯하고 반대쪽 고리는 끊기는 자리.
   - 대명사 오연결: 오답 직전에 선행사처럼 보이는 명사를 두되, 그것을 받으면 직후 문장의 지시어 사슬이 어긋나거나 수·의미가 모순되게.
   - 연결사 논리 오정렬: 연결사가 표시하는 논리(역접/인과)가 그 자리의 두 문장 관계와 비슷해 보이나 정확히는 안 맞게.
   - 정관사·지시어 도입 누락: the/this 명사가 아직 도입되지 않은 앞쪽 위치(①②)로 유인.
함정 강도는 비대칭으로: "매력적 오답 1개에 반응이 집중"되고 나머지는 약한 함정이 되도록 배치(실제 평가원 패턴). 단, 미끼는 표면 형태만 공유하고 지문의 사실관계를 새로 추가·훼손하지 마세요.

## KILLER 난이도일 때
표면 연결사·강한 지시어를 약화·분산시켜 단일 단서 1개로 즉답되지 않게 합니다. 단서를 약화시키되 정답 위치에는 단서 2~3개가 수렴하고 오답에는 단서 1개씩만 분산되게 하여, "전체 논리 흐름 해석"으로만 유일정답이 나오게 만드세요. 난도는 지문(추상·논증형, not A but B 구조)으로 올리고, 단서 자체는 정답 위치에서 명확히 성립해야 합니다(해석은 어렵되 단서는 명시적).

## 출력 필드
- givenSentence: 삽입할 문장 (위 응집 단서 1~2개 포함)
- markerAfterSentenceIndices: 5개 숫자 배열. 각 숫자는 "N번째 문장 뒤에 마커 삽입"(0-based). 반드시 오름차순 정렬.
  - 예: [0, 2, 4, 6, 8] → 1·3·5·7·9번째 문장 뒤에 ①②③④⑤ 삽입
- correctAnswer: 정답 라벨 "1"~"5". 정렬된 markerAfterSentenceIndices에서 정답 gap이 몇 번째인지와 일치(첫 마커=①=라벨 "1"). 가급적 ②③④(라벨 "2"~"4") 중에서 선택하고 ①·⑤는 피하세요.
- options: label "1"~"5", text는 "①"~"⑤"
- wrongOptionExplanations: 오답 위치(gap)별로 "왜 그 자리는 안 되는가"를 1문장씩. 각 사유는 서로 달라야 하며(끊기는 고리: 선행사 부재 / 뒤 고리 단절 / 연결사 논리 불일치 / 도입 누락 등) 비어 있으면 안 됩니다.
- insertionRationale(선택): 정답 위치에서 앞 고리와 뒤 고리가 어떻게 동시에 닫히는지 1~2문장(한국어).
- distractorTraps(선택): 오답 위치별 {gapLabel, temptingClue(유혹 단서), fatalFlaw(끊기는 고리)}. 각 fatalFlaw는 서로 달라야 합니다.
- ⚠️ passageWithMarkers 필드는 생성하지 마세요 (서버에서 자동 생성). 주어진 문장을 지문 안이나 지문 아래에 직접 넣지 마세요 — 서버가 지문 '위' 박스에 한글 라벨 "주어진 문장"으로 렌더합니다.
- direction 예시: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?"`,

  TOPIC: `주제 파악 문제를 만드세요.

## 핵심 규칙
1. 원문 지문을 수정하지 않습니다 (지문은 별도로 표시됨).
2. 이 유형은 "요지/주장"이 아니라 글 전체의 중심 화제와 필자의 관점을 압축한 **주제**를 묻습니다.
3. 정답은 단순 소재명이 아니라, 글 전체를 관통하는 중심 생각을 자연스러운 영어 명사구/짧은 구로 표현합니다.
4. 오답 4개는 서로 다른 함정이어야 합니다:
   - 소재만 맞고 중심 관점이 빠진 선택지
   - 예시 하나를 전체 주제로 과장한 선택지
   - 범위가 너무 넓거나 좁은 선택지
   - 필자의 관점이나 인과 방향을 뒤집은 선택지
   - 지문에는 그럴듯하지만 핵심 초점이 다른 선택지
5. 선택지 길이와 추상도는 비슷해야 하며, 정답만 종합적으로 보이면 실패입니다.
6. TOPIC 선택지는 모두 영어로 작성합니다. 한국어 주제 선택지는 MAIN_IDEA/요지형 문항과 혼동되므로 사용하지 않습니다.

## 출력 필드
- options: label "1"~"5", text는 영어 주제 선택지
- direction은 반드시 "다음 글의 주제로 가장 적절한 것은?"로 작성`,

  MAIN_IDEA: `요지/주장 파악 문제를 만드세요.

## 핵심 규칙
1. 원문 지문을 수정하지 않습니다 (지문은 별도로 표시됨).
2. 이 유형은 "주제"가 아니라 글 전체가 말하려는 **요지 또는 필자의 주장**을 묻습니다.
3. 정답은 단순 소재나 제목이 아니라, 글의 결론/권고/판단을 완전한 한국어 진술문으로 표현합니다.
4. 오답 4개는 서로 다른 함정이어야 합니다:
   - 소재는 맞지만 결론이 빠진 선택지
   - 예시나 세부 정보를 요지처럼 과장한 선택지
   - 필자의 태도나 권고 방향을 반대로 읽은 선택지
   - 원인과 결과를 뒤집은 선택지
   - 범위를 과도하게 넓히거나 좁힌 선택지
5. 선택지 문체는 모두 비슷한 길이의 한국어 진술문으로 맞춥니다.

## 출력 필드
- options: label "1"~"5", text는 한국어 요지/주장 선택지
- direction은 글 성격에 따라 "다음 글의 요지로 가장 적절한 것은?" 또는 "다음 글에서 필자가 주장하는 바로 가장 적절한 것은?" 중 하나로 작성`,

  TOPIC_MAIN_IDEA: `주제/요지 파악 문제를 만드세요.
⚠️ 가능하면 새 유형 TOPIC(주제) 또는 MAIN_IDEA(요지/주장)를 사용하세요. 이 레거시 유형을 사용할 때도 한 문항 안에서 주제와 요지를 섞지 않습니다.
- 원문 지문을 수정하지 않습니다 (지문은 별도로 표시됨)
- direction이 "주제"이면 선택지는 중심 화제+관점의 영어 주제 표현
- direction이 "요지/주장"이면 선택지는 글의 결론을 담은 한국어 완전한 진술문
- 오답은 소재만 맞음, 예시 과장, 범위 오류, 인과/태도 반전, 지문 밖 추론 중 서로 다른 함정으로 구성
- direction 예시: "다음 글의 주제로 가장 적절한 것은?" 또는 "다음 글의 요지로 가장 적절한 것은?"`,

  TITLE: `제목 추론 문제를 만드세요.
- 원문 지문을 수정하지 않습니다
- options: label "1"~"5", text는 영어 제목
- direction 예시: "다음 글의 제목으로 가장 적절한 것은?"`,

  IMPLIED_MEANING: `함축 의미 추론 문제를 만드세요.

## 출제 철학
이 유형은 단어 뜻을 묻는 어휘 문제가 아닙니다. 밑줄 친 구, 절, 또는 짧은 문장이 글의 논리 안에서 암시하는 필자의 판단, 숨은 인과, 대조의 방향, 한계 인식, 가치 평가, 결론적 의미를 추론하게 해야 합니다.
함축 의미 추론은 대의파악 계열입니다. 주제, 제목, 요약문 완성과 같은 중심 내용 판단을 요구하되, 그 중심 생각이 지문 안에서 은유적 표현, 생소한 압축 표현, 결론부의 다른 말하기(paraphrase)로 나타난 부분에 밑줄을 긋는 유형으로 보세요.
다수의 좋은 함축 문제는 주제문 또는 결론문을 그대로 묻지 않고, 그 주제문과 같은 의미를 다른 표현으로 바꾼 부분을 밑줄로 삼습니다. 따라서 밑줄은 지엽적 세부가 아니라 글 전체의 주제/요지/제목으로 환원될 수 있어야 합니다.
핵심은 "표면의 말"과 "글의 중심 의미" 사이의 거리입니다. 그 거리가 거의 없으면 단순 주제/요지 문제이고, 중심 의미와 무관하면 나쁜 함축 문제입니다.

## 밑줄 표현 선정
1. 원문에 실제로 존재하는 표현만 선택합니다.
2. 단일 단어, 대명사, 기능어, 사전식 숙어 뜻만으로 풀리는 표현은 금지합니다. 그런 경우 CONTEXT_MEANING이나 REFERENCE 유형에 더 적합합니다.
3. 4~18단어 정도의 구/절/짧은 문장을 우선 선택합니다. 너무 길어 글 전체 주제를 묻는 문제가 되지 않게 하세요.
4. 앞뒤 문장 최소 2곳의 근거를 연결해야 뜻이 결정되는 표현을 고릅니다.
5. 다음 대상은 금지합니다.
   - 물음표로 끝나는 수사적 질문 또는 "Why/What/How..." 형태의 자문자답 문장
   - 바로 다음 문장이 정답을 거의 그대로 풀어 주는 표현
   - 밑줄 표현만 직역해도 정답이 보이는 표현
   - 글 전체 주제문을 그대로 밑줄 친 것
6. 좋은 대상:
   - 주제문/결론문을 다른 말로 다시 표현한 구절
   - 글 전체의 핵심 주장을 은유나 생소한 압축 표현으로 나타낸 부분
   - not merely A but B, rather than, instead of, while/although 뒤의 필자 평가
   - 비유적 표현이나 압축적 결론
   - 예시 뒤에 드러나는 일반화
   - 원인과 결과 사이의 숨은 의미
   - 겉보기 진술과 실제 필자 의도가 다른 표현
   - "creatures of both reason and emotion", "the brain is a beggar"처럼 표면 표현이 비유/압축을 담고 있어 풀어내야 하는 표현

## 선지 설계
1. options는 반드시 모두 영어로 작성합니다. 함축 의미 추론 선택지에 한글이 섞이면 실패입니다.
2. 정답은 밑줄 표현의 직역이 아니라, 지문 근거를 종합한 함축 의미를 자연스러운 영어 구/절/짧은 문장으로 paraphrase해야 합니다.
3. 오답은 전부 지문 속 실제 개념을 빌려 와야 하며, 랜덤하거나 터무니없으면 안 됩니다.
4. 오답 4개는 가능하면 서로 다른 함정으로 설계합니다:
   - 표현의 일부만 맞는 부분 해석
   - 원인과 결과를 뒤집은 해석
   - 예시를 일반 원리로 과장한 해석
   - 필자의 평가/태도를 반대로 읽은 해석
   - 범위를 너무 넓히거나 좁힌 해석
   - 앞문장 근거는 맞지만 뒷문장 결론과 충돌하는 해석
5. 모든 선지는 길이, 추상도, 문체가 비슷해야 합니다. 정답만 유난히 길거나 종합적으로 보이면 안 됩니다.
6. 절대어로 쉽게 제거되는 오답은 금지합니다. completely, entirely, always, never, only, solely, exclusively, must, without exception, perfectly 같은 표현은 원문이 그 정도를 명시하지 않는 한 쓰지 마세요.
7. KILLER 오답은 극단어 없이도 그럴듯해야 합니다. 예를 들어 "AI completely replaces human labor"처럼 바로 지워지는 선지 대신, "AI shifts the standard of value toward machine-performed tasks"처럼 지문 개념을 미묘하게 비트세요.

## KILLER 기준
- 밑줄 표현 하나만 번역해서는 정답이 보이면 실패입니다.
- 밑줄 표현의 답이 바로 다음 문장 하나에 거의 paraphrase 되어 있으면 실패입니다. 그런 경우 밑줄 위치를 바꾸세요.
- 수사적 질문은 KILLER 함축 의미 밑줄로 쓰지 마세요. 자문자답 구조라면 질문이 아니라 답변 뒤의 비유적/압축적 표현을 밑줄 치세요.
- 정답은 최소 두 근거를 연결해야 하며, evidenceChain에 그 연결을 2~4단계로 적습니다.
- 오답은 훑어 읽으면 그럴듯해야 하고, 앞뒤 문장 기능을 확인해야 제거되어야 합니다.
- 단순 반대말, 노골적 과장, 지문 밖 소재, 길이 차이로 쉽게 지워지는 선지는 금지입니다.

## 출력 필드
- underlinedExpression: 원문에서 밑줄 칠 정확한 표현. 한 글자도 바꾸지 말고 복사
- surroundingText: underlinedExpression을 포함하는 주변 40~80자 원문 텍스트
- surfaceMeaning: 밑줄 표현의 표면 의미를 한국어로 설명
- impliedMeaning: 정답 선택지가 담는 핵심 함축 의미를 한국어로 요약
- reasoningGap: 표면 의미에서 실제 함축 의미로 넘어가는 데 필요한 추론 간극을 한국어로 설명
- evidenceChain: 정답 근거 흐름 2~4개. 각 항목은 지문 단서와 추론 단계를 한국어로 설명
- surfaceMeaning, reasoningGap, evidenceChain은 내부 검수용입니다. 학생용 답안 UI에 길게 노출되지 않으므로 장황한 에세이처럼 쓰지 말고 핵심만 간결하게 작성합니다.
- explanation은 다른 객관식 유형처럼 정답 근거와 오답 배제 논리를 3~5문장으로 정리합니다.
- options: label "1"~"5", text는 영어 함축 의미 선택지
- wrongOptionExplanations: 정답이 아닌 모든 영어 선지에 대해, 왜 그럴듯하지만 지문 근거상 틀리는지 한국어로 설명
- ⚠️ passageWithUnderline 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction은 반드시 "다음 글에서 밑줄 친 부분이 함축 의미하는 바로 가장 적절한 것은?"로 작성`,

  REFERENCE: `지칭 추론 문제를 만드세요.

## 출력 필드
- underlinedPronoun: 밑줄 칠 대명사 (예: "them", "it")
- surroundingText: 해당 대명사 주변 40~60자 텍스트 (위치 식별용, 동일 대명사가 여러 번 나올 수 있으므로 반드시 포함)
- options: label "1"~"5", text는 한국어 지칭 대상
- ⚠️ passageWithUnderline 필드는 생성하지 마세요 (서버에서 자동 생성)
- direction 예시: "밑줄 친 'it'이 가리키는 것으로 가장 적절한 것은?"`,

  CONTENT_MATCH: `내용 일치/불일치 문제를 만드세요.
- matchType: "일치" 또는 "불일치"
- options: label "1"~"5", text는 영어 진술문 (지문 문장 복붙이 아닌 paraphrase)
- direction 예시: "다음 글의 내용과 일치하지 않는 것은?"`,

  SUMMARY_COMPLETE_MC: `요약문 완성 객관식 문제를 만드세요.

## 유형 정체성
이 유형은 내신형 주관식 요약문 완성이 아닙니다. 수능 영어 40번 스타일의 객관식 요약문 완성입니다.
학생은 지문 전체를 읽고, 지문 아래에 제시된 한 문장 요약문의 (A), (B)에 들어갈 영어 단어/어구 쌍을 고릅니다.

## 고정 발문
direction은 반드시 다음 문장으로 작성합니다.
"다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?"

## 요약문 설계
1. summaryWithBlanks는 영어 한 문장 요약문으로 작성합니다.
2. summaryWithBlanks에는 (A), (B)가 각각 정확히 한 번씩 들어가야 합니다.
3. 요약문은 원문 문장을 복붙하지 말고, 지문 전체의 요지/인과/대조/결론을 압축한 paraphrase여야 합니다.
4. (A), (B)는 지문 핵심 개념 두 개를 담당해야 하며, 단순 세부정보나 주변 예시를 빈칸으로 만들면 실패입니다.
5. 두 빈칸은 서로 논리적으로 연결되어야 합니다. 예: 원인-결과, 문제-해결, 대조, 수단-목적, 변화-결과.
6. summaryWithBlanks에 정답 단어가 그대로 노출되면 실패입니다.
7. 정답을 넣었을 때 요약문 전체가 자연스러운 영어 문장이어야 합니다. 특히 "a question/matter/issue of (A) to (B)"처럼 (A)와 (B)를 억지로 이어 붙인 구조를 금지합니다. (B)가 to 뒤에 오면 원칙적으로 base verb가 와야 하며, gerund가 필요하면 by/through/of 같은 자연스러운 전치사 구조로 다시 쓰세요.

## 선지 설계
1. options는 5개이며 label은 "1"~"5"입니다.
2. 각 option은 blankA, blankB를 반드시 포함합니다.
3. option.text는 반드시 "blankA …… blankB" 형식으로 작성합니다.
4. 모든 blankA/blankB는 영어 단어 또는 자연스러운 영어 어구입니다. 한국어가 섞이면 실패입니다.
5. 각 열의 품사와 문법 슬롯을 맞춥니다. (A)가 형용사 자리면 모든 blankA가 형용사/형용사구, (B)가 동사 자리면 모든 blankB가 동사/동사구여야 합니다.
6. 정답 쌍은 blanks 배열의 (A), (B) answer와 정확히 일치해야 합니다.
7. 오답은 랜덤 단어가 아니라 지문 속 실제 개념을 빌려온 매력적인 함정이어야 합니다.
8. 최소 하나는 (A)만 맞고 (B)가 틀린 선지, 최소 하나는 (B)만 맞고 (A)가 틀린 선지를 포함합니다.
   - (A)만 맞는 선지는 정답 blankA 문자열을 그대로 복사하고 blankB만 틀리게 만듭니다.
   - (B)만 맞는 선지는 정답 blankB 문자열을 그대로 복사하고 blankA만 틀리게 만듭니다.
   - 두 반쪽 정답 선지는 서로 다른 label이어야 하며, correctAnswer label과도 달라야 합니다.
8-1. 특히 KILLER에서는 반쪽 정답 선지가 "형식상 존재"하는 것으로는 부족합니다. 가장 강한 함정을 반드시 정답 쪽과 붙여야 합니다.
   - 정답이 altruistic / evolutionarily라면, altruistic / genetically처럼 정답 (A)에 가장 그럴듯한 (B) 함정을 붙입니다. genetically를 individualistic처럼 즉시 탈락하는 (A)에 묶으면 실패입니다.
   - 반대로 cooperative / evolutionarily처럼 정답 (B)에 정답 (A)와 같은 의미권의 그럴듯한 (A) 함정을 붙입니다.
   - KILLER의 오답 blankA는 정답과 같은 의미장 안의 근접어(prosocial/cooperative/supportive/communal 등) 또는 범위가 살짝 다른 표현이어야 합니다. competitive, individualistic, dominant처럼 지문 정서와 정반대라 즉시 소거되는 단어를 핵심 함정으로 쓰지 마세요.
   - KILLER의 오답 blankB도 정답과 같은 설명 축의 근접어(genetically/evolutionarily/biologically/culturally 등)로 경쟁시켜야 합니다. 지문이 "passed down through generations"처럼 표면적으로 genetic을 떠올리게 하지만 정확히는 evolutionary selection을 말하는 경우, genetically 같은 함정을 정답 (A)와 결합해 변별력을 만드세요.
9. 나머지 오답은 다음 함정 중 서로 다른 방식으로 설계합니다:
   - 지문의 세부 예시를 전체 요지처럼 과장
   - 원인과 결과를 뒤집음
   - 긍정/부정 또는 증가/감소 방향을 반대로 만듦
   - 요약문 collocation 또는 문법 슬롯은 맞지만 핵심 의미가 어긋남
   - 범위가 너무 넓거나 좁음
10. 정답만 길이/추상도/품사가 튀면 실패입니다.

## 난이도 기준
- BASIC: 정답 개념이 지문에서 비교적 명시적으로 드러나고 요약문도 직접적인 paraphrase입니다.
- INTERMEDIATE: 두 문장 이상의 근거를 연결해야 하며, 한쪽 빈칸만 보고 고르면 틀리도록 만듭니다.
- KILLER: 정답은 원문 표현의 직접 반복이 아니라 상위 개념/추상화이고, 오답은 모두 지문 개념을 빌린 근접 오답이어야 합니다. 정답 후보가 한쪽 빈칸만 보고 2개 이하로 즉시 좁혀지면 실패입니다. 각 빈칸의 오답 후보가 최소 2개 이상은 지문상 그럴듯해야 하며, 가장 매력적인 B 함정을 정답 A와 결합하고 가장 매력적인 A 함정을 정답 B와 결합하세요.

## 출력 필드
- summaryWithBlanks: (A), (B)가 들어간 영어 한 문장 요약문
- blanks: [{label:"(A)", answer:"..."}, {label:"(B)", answer:"..."}]
- options: [{label:"1", blankA:"...", blankB:"...", text:"... …… ..."}] 5개
- wrongOptionExplanations: 정답이 아닌 모든 선지에 대해, 왜 그럴듯하지만 지문/요약 논리에 어긋나는지 한국어로 설명. "대조군 설계" 같은 실험 용어는 쓰지 말고 "선지 배열상", "지문 논리상", "요약문의 관계상"처럼 자연스럽게 설명`,

  IRRELEVANT: `무관한 문장 문제를 만드세요.

## 핵심 출제 철학 (on-topic / off-logic)
정답(무관) 문장은 "완전히 다른 주제"가 아니라, 지문의 중심 소재어와 핵심 어휘를 그대로 공유하면서 문단의 논리 기능(담화 기능)만 어긋나는 문장입니다. 훑어 읽으면 자연스럽고, 앞뒤 문장의 역할을 따져야만 걸러져야 합니다. 어휘만 맞추면 못 푸는 함정이어야 합니다.

## 핵심 규칙
1. 원문 첫 문장은 소재·주제를 정하는 도입(topic) 문장입니다. sentences 배열에 절대 넣지 마세요(서버가 마커·밑줄 없이 맨 앞에 그대로 보여줍니다). 관련성 판단의 기준점은 이 도입문에 있습니다.
2. 정답이 아닌 4문장은 지문 원문에서 그대로 가져옵니다(paraphrase·요약·결합·분할 금지). 각 슬롯은 .!?로 끝나는 원문 한 문장과 정확히 동일해야 하며, 두 문장을 이어붙이지 마세요(슬롯 중간에 ". "/"? "가 있으면 결합된 것이므로 다시 쓰세요).
3. ⭐ 분산 배치: 정답이 아닌 4문장을 지문 전체에 분산하세요. 긴 지문(8문장 이상)에서는 앞 1/3에서 최대 2문장까지만 고르고, 적어도 1문장은 마지막 1/3에서 고르세요. 앞쪽 3~4문장을 연속으로 몰아 고르지 마세요. 원문 등장 순서는 유지합니다.
4. ⭐ 삽입·remove-and-reconnect: 무관문은 "연속된 두 원문 문장 사이"에 들어가는 문장으로 쓰세요. 즉 sentences에서 무관문 바로 앞 슬롯(원문 문장)에 이어지되, 무관문을 빼면 원문 흐름이 빈틈없이 다시 이어져야 합니다. 무관문 자신만 빼면 매끄럽고, 다른 4문장 중 하나를 빼면 오히려 흐름이 어색해져야 합니다(정답 유일성).
5. ⭐ 표면 위장(가장 중요한 함정 장치): 무관문은 (a) 바로 앞 표시 문장의 단어를 이어받거나 This/Such/These/However 같은 연결어·지시어로 시작해 연결된 척하고, (b) 지문의 중심 소재어를 포함하며, (c) 주변 원문의 content word를 최소 2개 재사용합니다. 새 구체명사·새 분야를 끌어오지 마세요.
6. ⭐ 논리 이탈 유형(하나만, 그 하나만 어긋나게): 관점/평가 역전(지문이 X를 긍정→무관문은 X를 부정) · 인과 방향 뒤집기 · 범위/주어 이동(개인↔사회, 이 사례↔일반론) · 예시→처방 전환 · 하위 주제 드리프트(같은 단어, 다른 논점) · 시간/단계 단절 · 과잉 일반화.
7. 들키는 단서 금지: 원문에 없는 should/must/always/never/completely/most/everyone 등 처방·극단어 금지, 노골적 반대 주장(In contrast로 정반대) 금지, 각주(footnote) 단어를 무관문에 넣기 금지, 어색한 영어 금지. 설명문 지문에 갑자기 "To maximize..., you should..." 같은 처방문으로 시작 금지.
8. 톤·길이: 무관문의 길이·어휘 수준·문체·추상도는 주변 원문 문장과 비슷해야 합니다.
9. ⭐ 정답 위치 분산: 무관문은 첫/마지막 표시 문장에 넣지 말고 가운데(②③④)에 넣되, 항상 ③만 쓰지 말고 ②·③·④를 골고루 사용하세요. irrelevantIndex는 1·2·3 중 하나.
10. correctAnswer는 irrelevantIndex+1에 해당하는 번호입니다(예: irrelevantIndex=1 → "②", =3 → "④").

## 예시 (이 패턴을 따르세요)
지문 주제: 매몰비용 오류 — 과거 투자는 미래 결정을 정당화하지 못한다. 앞 문장: "A factory ... will often keep pouring resources into it, simply because so much has already been invested."
- ✅ 좋은 무관문(관점/평가 역전): "Indeed, the resources already invested in such a project can stand as a clear signal of commitment that reassures partners about its long-term direction." → 앞 문장의 단어(resources, invested, project)를 그대로 이어받아 연결된 척하지만, "과거 투자는 정당화 못 함"이라는 지문 논리를 정반대(투자가 긍정적 신호)로 뒤집음. 새 분야 용어 없음. 빼면 앞뒤가 매끄럽게 이어짐. → 이런 문장을 만드세요.
- ❌ 나쁜 무관문 1(처방문): "To avoid this trap, managers should immediately cancel the budget and retrain their staff." → "should"·처방문 + 새 용어(managers, budget, staff)로 즉시 들킴. 금지.
- ❌ 나쁜 무관문 2(새 분야/용어 과다): "Modern accounting software can automatically track these expenditures and visualize them on a dashboard." → software, dashboard 등 원문에 없는 새 소재. 금지.
- ❌ 나쁜 무관문 3(방법론/측정 드리프트 — 가장 흔한 실수): "To accurately measure this fallacy, the procedure requires calculating the precise amount of resources lost during development." / "It is essential to optimize this process by categorizing the records." / "standardize their laboratory equipment", "build automated tracking tools" → 갑자기 측정·절차·도구·실험 장비 이야기로 새는 문장. 이 패턴은 절대 쓰지 마세요(자동 탈락).

⭐ 가장 좋은 함정 유형(이 둘을 우선): ①관점/평가 역전(지문이 X를 긍정→무관문은 같은 단어로 X를 은근히 긍정적으로 재평가, coral-reef 예: 백화 현상을 "관광 기회"로) ②범위/주어 이동(개인 사례→사회 일반, 또는 이 대상→다른 대상). 무관문은 "측정/절차/방법/도구/추천/조언"이 아니라, 지문과 똑같이 어떤 현상을 '설명·서술'하되 논리 방향만 어긋난 문장이어야 합니다.
규칙: 무관문의 의미 있는 단어는 대부분 바로 앞 문장과 지문에서 빌려오고, 딱 하나의 논리 기능만 어긋나게 하세요. 새 명사·처방어(should/must/recommended/essential to)·극단어(completely/always/guarantees)·역접어(In contrast)·방법론어(procedure/measure/optimize/laboratory/tools)로 시작하거나 끌고 가지 마세요.

## 최종 자체 점검
- 무관문을 빼면 그 앞뒤 원문이 빈틈없이 이어지는가? (가장 중요)
- 다른 4개 표시 문장 중 하나라도 빼면 흐름이 오히려 어색해지는가? (정답 유일성)
- 무관문이 "다른 분야"가 아니라 "논리 기능이 틀려서" 빠지는가? 어느 이탈 유형인지 한 문장으로 말할 수 있는가?
- 무관문이 바로 앞 표시 문장과 어휘/지시어로 연결된 것처럼 보이는가? 중심 소재어를 포함하는가?
- 4개 표시 원문이 지문 전체에 분산되어 있는가(앞부분에만 몰려 있지 않은가)?
- 극단어·처방문·어색한 영어·노골적 반대 주장으로 바로 들키지는 않는가?

## 최종 렌더링 방식 (참고)
서버는 원문 지문 전체를 유지한 채, sentences로 고른 5개 문장(원문 4 + 삽입 무관문 1)을 각 원문 위치에 ①②③④⑤ 마커 + 밑줄로 표시하고, 나머지 문장(도입·중간 문맥·뒷 문맥)은 표시 없이 그대로 둡니다. 시험지에서는 별도 선택지 목록 없이 본문 안 숫자 마커만 사용합니다.

## 출력 필드
- sentences: 정확히 5개(원문 등장 순서). 4개는 지문 전체에 분산된 원문 실제 문장, 1개는 삽입 무관문(가운데, irrelevantIndex 위치).
- irrelevantIndex: 1·2·3 중 하나(첫/마지막 금지, ②③④ 분산).
- wrongOptionExplanations: 정답이 아닌 4문장이 문단에서 맡는 역할(도입·정의·예시·대조·결론 등)을 각각 설명. 4개.
- explanation/keyPoints에서 정답을 가리킬 때 ①②③ 같은 선지 번호로 부르지 말고 "무관한 문장은 ~한 점에서 흐름과 어긋난다"처럼 내용으로 설명하세요(번호 불일치 방지). 또한 무관문이 바로 앞 원문 문장과 사실관계로 모순되게(예: 앞 문장이 '색이 바랜다'인데 '선명한 색을 유지한다') 만들지 말고, 사실은 그럴듯하되 논리 기능만 어긋나게 하세요.
- ⚠️ options / passageWithNumbers 필드는 신경 쓰지 마세요. 숫자 마커(①~⑤)·밑줄·표시 지문은 모두 서버에서 자동 생성됩니다.
- direction 예시: "다음 글에서 전체 흐름과 관계 없는 문장은?"`,
};
