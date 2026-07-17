# 영어 25유형별 감사·공예 행렬 v0.1

목적: 전 유형 sentinel과 holdout을 같은 총점 하나로 뭉개지 않고, 유형별로 문항 성립성·지름길·공예를 독립 검증한다. 이 문서는 생성 프롬프트가 아니라 **사후 blind audit 계약**이다. 규칙을 프롬프트에 전부 복사하지 않으며, 어떤 규칙을 생성 모델에 노출할지는 별도 요인으로 실험한다.

## 공통 판정 단위

- `fatal`: V1~V5 중 하나라도 실패. 출하율·공예 점수와 분리한다.
- `shortcut`: 정답 지식 없이 길이, 극성, 품사, 라벨, 접속사 첫 단어, 원문 복사, 힌트 역번역 등으로 답이 좁혀지는 경로.
- `intent coverage`: 각 선지/조건/마커가 어떤 오개념 또는 사고 단계를 겨냥하는지 중복 없이 설명 가능한 비율.
- `beautiful`: `RUBRIC.md` A등급에 더해 아래 유형별 beauty 조건을 만족한 문항.
- 결정론 검사는 **필요조건 게이트**다. 의미 적합성·매력도·유일성의 최종 판정은 blind human-style audit을 대체하지 않는다.

## 수능·모의고사 선택형 14유형

| 유형 | 치명 유효성 조건 | beautiful 공예 | 대표 지름길·가짜 난도 | 결정론/구조 검사 | 독립 의미 감사 |
|---|---|---|---|---|---|
| `BLANK_INFERENCE` | 원문 span/blank 좌표 보존, 선언된 빈칸 수, 모든 선지의 동일 slot 문법 적합, 정답 의미 유일 | 정답은 두 개 이상 논리 단서의 필연적 종합이고 오답 4개가 scope shift·causal reversal·half-truth·actor swap·condition loss 중 서로 다른 의도 | suffix/prefix 문법 소거, 정답만 긴 추상어, 극성·절대어, 원문 고유어 복사 | 다섯 완성문 seam, 품사/수일치/관사/중복 접속사, 길이·극성·lexical-overlap outlier | 각 선지의 source anchor·tempting overlap·single decisive flaw, 정답 paraphrase fidelity |
| `GRAMMAR_ERROR` | 선언한 정답 개수, source-correct→displayed-wrong 최소대립, 교정 시 원문 복원, 모든 비정답 밑줄 정문 | KILLER 정답은 구조 의존 고가치 포인트이고 4개 decoy도 서로 다른 실제 판단 지점 | 비단어·철자, 인접 단순 수일치, 밑줄 길이, same-point 쉬운 decoy, 논쟁적 valency/태 | 원문 diff, marker/label 정렬, retained-object passive·POS 변화·gibberish·pointCode/교정형 불변식 | 각 밑줄의 governing rule, displayed form grammaticality, 대안 분석, 해설 통사 정확성 |
| `GRAMMAR_CHOICE_COMBO` | A/B/C 각각 한 표현만 정문, 세 판단 독립, 정확히 한 option이 올바른 조합, 해설이 각 슬롯 구조와 일치 | 서로 다른 세 포인트, single-slot·multi-slot 함정 혼합, 강한 오표현이 모든 슬롯에 존재 | 한 슬롯 답이 다른 슬롯 공개, 시제 취향, `that/what` 상투 오칭, 옵션 조합 누락 | slot source exactness, 2³ 조합 coverage, key 조합 재계산, pointCode 중복/해설 용어 lint | 각 쌍을 문장에 삽입한 독립 문법 판정과 조합 선지별 탈락 이유 |
| `VOCAB_CHOICE` | 표시 5개 순서/좌표 일치, 선언한 한 단어만 문맥 부적합, betterWord가 실제 문맥 복원 | collocation·stance·causality·register를 겨냥한 near-neighbor 교체와 4개 의미 있는 정답 decoy | 단순 반의어, 품사/굴절 불일치, 유일한 부정어, marker 순서 뒤집힘 | marker surface/순서, 품사·굴절, 원문 diff, 극성/빈도 outlier | 다섯 단어 각각의 local+global context 적합성과 substitute 유일성 |
| `SENTENCE_ORDER` | 원문 문장 전부 정확히 한 번, 올바른 순서 유일, given/ABC 경계·정답 라벨 동기화 | local cohesion과 global argument의 두 독립 단서가 수렴하고 모든 permutation이 표면상 경쟁 | `However/This`로 시작하는 블록 즉시 소거, 한 블록만 매우 짧음, 정답 ABC 그대로 | 문장 multiset 보존, 블록 길이/문장수 균형, option permutation 완전성, 첫 토큰 anaphor 경고 | 각 인접쌍의 backward/forward link와 전체 논리, 대안 순서의 결정적 파손점 |
| `SENTENCE_INSERT` | 생략 source sentence와 given 일치, 각 gap 삽입 표면 복원, 한 위치만 양방향 응집 | 정답 gap에는 2~3개 단서, 오답 gap마다 서로 다른 하나의 유혹 단서와 하나의 파손 이유 | 정답만 명백한 지시어 선행사, 첫/끝 고정, 문체·길이 이질성, 한쪽 연결만 확인 | omission/reinsertion round-trip, gap/label 수, answer 위치 분포, token-level referent 후보 | 모든 gap의 pre-link/post-link, 선행사 유일성, 논리·정보구조 비대칭 |
| `TOPIC` | 정답이 중심 화제+통제 관점을 포괄하고 다른 선지는 전체 범위를 충족하지 않음 | 다섯 영어 명사구가 같은 추상도에서 scope/stance만 정교하게 갈림 | 정답만 지문 반복어 2개, 오답은 아예 다른 주제, 요지 문장과 혼동 | 언어·형식·길이 평행성, overlap/고유어 outlier, option 중복 | 전체 문장 coverage와 controlling viewpoint, 예시/부분/과대·과소 범위 판정 |
| `MAIN_IDEA` | 정답이 글의 결론·주장·권고를 완전한 한국어 진술로 정확히 표현 | 실제 개념을 보존한 채 결론·인과·범위·태도만 바꾼 경쟁 오답 | 제목형 명사구, 정답만 당위 표현, 오답이 지문에 전혀 없음 | 언어/문장형, 길이·극성·당위어 outlier, 정답/해설 label | 주장 구조, 필자 태도, 조건·양보 보존 및 모든 오답의 왜곡 좌표 |
| `TITLE` | 정답이 글 전체의 중심 긴장/전개/결과를 대표하고 과장하지 않음 | 모든 영어 제목이 출판 가능한 수준이며 controlling idea의 차이로만 갈림 | 정답만 콜론·비유·질문형, 오답은 단순 단어, 표면 키워드 최다 | 형식·대문자·길이 평행성, punctuation template outlier, lexical overlap | 제목이 설명부·반전·결말을 얼마나 포괄하는지와 stance fidelity |
| `IMPLIED_MEANING` | 밑줄 좌표 정확, 표면 뜻과 숨은 뜻에 실제 간극, 정답이 중심 논리를 유일하게 paraphrase | 전후 두 개 이상 단서를 연결하고 오답은 local/global·scope·cause·stance near-miss | 다음 문장이 그대로 답, 수사 질문 자기답, 단일어 어휘문제, 정답만 추상적 | underline/source exactness, 다음 문장 n-gram 누출, target 길이·품사, option overlap | evidence chain의 각 링크와 target의 글 전체 역할, 모든 near-miss 판정 |
| `REFERENCE` | 독립 token인 지시어, surroundingText에 정확한 occurrence, 실제 지칭 대상과 key/해설 일치 | 문법 수·담화역할·의미를 함께 풀며 nearest-NP와 parallel-NP가 경쟁 | 밑줄이 다른 단어 내부, 수 일치 하나로 즉시 결정, invented option | token boundary, surrounding occurrence, options가 passage NP인지, number/person agreement | 담화 중심·통사 결속·의미 가능성으로 후보별 배제, 동일지칭 paraphrase |
| `CONTENT_MATCH` | 발문의 일치/불일치 극성과 key 일치, 모든 option이 특정 원문 명제에 trace, 정확히 선언 수만 정답 | degree·조건·시간·비교·인과를 한 축씩 미세 변형한 passage-grounded 선지 | 오답이 완전 창작, 숫자/고유명사만 바꿈, 부정어 하나로 노출 | matchType/key polarity, named entity/number trace, negation·quantifier outlier | option→source proposition mapping과 변형 축, 함의/상식 개입 여부 |
| `SUMMARY_COMPLETE_MC` | 완성 요약문이 자연스럽고 전체 글에 충실, A/B 각각 동일 통사 slot, 유일한 pair | strongest A-only-correct·B-only-correct half trap이 있고 global relation mapping 필요 | 정답 pair만 품사 일치, 좋은 함정이 즉시 틀린 partner와 결합, 어색한 bridge | 10개 slot 삽입 문법, pair 조합/key, correct-A/B coverage, overlap/품사 | 완성된 다섯 요약문의 fidelity·관계·collocation, half-correct 강도 |
| `IRRELEVANT` | 비정답 4문장은 source verbatim, 정답 제거 시 흐름 복원, 다른 문장 제거 시 손상, 한 답 | intruder가 동일 주제·문체·어휘로 국소 연결되지만 담화 기능 하나만 어긋남 | 외부 랜덤 사실, 노골적 반대 표지, 정답 1/5 고정, 문체 이질 | source multiset, numbering, answer-position 분포, topic/length/style outlier | 각 문장의 담화 역할과 remove-and-reconnect test, 대안 제거 비교 |

## 내신 서술형 8유형

서술형은 model answer 일치율이 아니라 **정답 경계의 완전성**을 감사한다. 각 문항은 독립 평가자가 최소 3개 정답·3개 경계 오답을 만들고 채점기가 이를 의도대로 분리하는지 확인한다.

| 유형 | 치명 유효성 조건 | beautiful 공예 | 대표 지름길·가짜 난도 | 결정론/채점 검사 | 독립 의미 감사 |
|---|---|---|---|---|---|
| `CONDITIONAL_WRITING` | 한국어 의미, 모든 명시 조건, model answer, 채점 기준이 상호 일치; 자연스러운 동치답 허용 | 의미 관계와 문법/어휘 조건 2개 이상이 실제로 상호작용하며 부분점수 축이 분리 | 한국어를 그대로 번역하면 조건 자동 충족, 조건끼리 모순, 특정 단어만 확인 | condition token/structure assertions, model answer 조건 충족, adversarial accepted/rejected set | 의미 보존, 자연스러움, 조건 위반의 중요도와 부분점수 경계 |
| `SENTENCE_TRANSFORM` | 원문 의미·시제·지시·초점 보존, 요구 구조 충족, 원문 자체가 변환 대상에 적합 | 두 변환이 상호작용해 구조 이해를 요구하되 의미가 완전히 보존 | 단순 단어 치환, 조건만 만족하고 초점/부정 scope 변화, 복수 자연답 미수용 | source/model semantic anchors, required pattern, tense/reference diff, round-trip checks | 여러 자연스러운 변환과 의미 변질 경계, 담화 초점 보존 |
| `FILL_BLANK_KEY` | blank 복원 시 원문/의도 문장 완전, 허용 굴절·동치표현과 exactness 정책 명시 | 핵심 collocation/논리 표현을 회수하며 문법만으로 추측 불가 | 첫 글자·길이·주변 문법이 답 노출, 지엽 단어 암기, 답이 지문 바로 옆 반복 | blank round-trip, hint leakage, normalized accepted variants, seam grammar | 핵심성·문맥 의존성, 허용해야 할 paraphrase와 금지해야 할 의미 변화 |
| `SUMMARY_COMPLETE` | 완성 요약문 자연성·전체 충실성, 각 blank가 별도 핵심개념, 허용 답안 집합 | 두 blank가 관계 매핑과 추상화를 나눠 요구하고 서로 답을 누설하지 않음 | 한국어/보기 역번역, 두 blank 동의어 반복, 품사만으로 결정 | placeholder 수, 모든 answer insertion, 답 누출·중복·품사, 채점 variants | 요약 coverage, relation fidelity, 각 blank 대안 답의 경계 |
| `SUMMARY_WRITING` | 보기·힌트·한국어 gloss·model answer·채점 rubric 동기화, 자연 동치 영작 허용 | 글 전체 추상화와 어순/굴절 운용을 함께 요구하고 decoy가 실제 confusable form | gloss가 1:1 번역, word bank에 답 순서, distractor 빈 배열, exact-match 채점 | answer leakage/back-translation, chip multiset, inflection, accepted variants | 요약 의미와 문장 자연성, paraphrase 허용 범위, decoy의 오개념 |
| `WORD_ORDER` | 정답 chip multiset이 model answer를 정확히 재구성, distractor 처리와 복수 어순 정책 명시 | source 문장 복사가 아닌 의미보존 구조변환이며 chip 선택+어순 두 판단 필요 | 지문에서 그대로 찾기, 이미 정답 순서, 구두점 단독 chip, 유일한 품사 배열 | token multiset, pre-sorted detection, punctuation, distractor use, alternate linearizations | 자연스러운 복수 어순·강조 차이, source meaning 보존, distractor 타당성 |
| `TOPIC_SENTENCE_WRITING` | mode별 필드 배타성, model/correct 동기화, 주제 정확성, 길이 계약, 동치 주제문 채점 | 핵심 관점의 추상화와 문장/명사구 형식을 동시에 만족하며 힌트 누출 없음 | passage 한 문장 복사, Korean hint 역번역, chips 정렬, 정답 phrase가 cloze에 잔존 | mode invariant, placeholders, length/tokens, leakage, chip reconstruction | topic+controlling viewpoint, 여러 자연 주제문, 과대/과소 범위 경계 |
| `GRAMMAR_CORRECTION` | 선언한 오류 수, 넓은 underline 안 실제 오류, source-correct/displayed-wrong/교정형 일치, 허용 동치교정 | 고가치 구조를 찾아 최소 수정하며 부분점수로 위치와 form을 분리 | 틀린 단어 자체만 밑줄, 철자/관사, 여러 오류 잠복, 문장 전체 재작성 허용 | exact diff, error cardinality, underline containment, correction round-trip, risk patterns | 오류 진단·최소 교정·대안 교정의 문법성과 의미 보존 |

## 어휘 3유형

| 유형 | 치명 유효성 조건 | beautiful 공예 | 대표 지름길·가짜 난도 | 결정론/구조 검사 | 독립 의미 감사 |
|---|---|---|---|---|---|
| `CONTEXT_MEANING` | target occurrence·좌표 정확, 문맥상 한 sense가 지배, options 품사/형식 평행 | 실제 polysemy·register·metaphor를 묻고 최소 두 오답이 같은 semantic field | 투명 동의어, 정답만 같은 품사, 랜덤 뜻, 지문 없이 풀이 가능 | token/source exactness, POS·length, option duplication, dictionary-sense metadata 존재 | 각 option이 가능한 sense인지와 현재 문맥의 선택 이유, 미세 뉘앙스 |
| `SYNONYM` | target과 정답이 해당 문맥·register·collocation에서 교체 가능, 나머지는 불가 | 가까운 의미 4개가 semantic dimension 하나씩 어긋나며 fine-grained 판단 필요 | 초급 반대말/무관어, 품사 불일치, 정답만 빈도 높음 | POS/inflection/length, target substitution surface, duplicate stems | 실제 문장 치환 자연성, connotation·degree·selectional restriction |
| `ANTONYM` | 현재 계약이 wrong-pair형이면 정확히 한 pair만 잘못, 나머지 네 pair는 동일 semantic axis의 clean antonym, correctAntonym 정확 | 틀린 pair가 다른 sense에서는 그럴듯하지만 현재 축에서는 명백히 어긋남 | 논쟁적 연상쌍, 품사/굴절 mismatch, 명백한 동의어, 설명과 pair 불일치 | pair cardinality, POS/inflection, forbidden contestable list는 경고로만, key/correction sync | 다섯 pair의 sense·semantic axis·context, 대안 반의 관계 가능성 |

## 유형별 리뷰 산출물 추가 필드

공통 `RUBRIC.md` JSON에 다음을 추가한다.

```json
{
  "questionFamily": "selection|closed_constructed|open_constructed|correction",
  "declaredAnswerCardinality": 1,
  "independentlyValidAnswers": [],
  "shortcutAudit": [
    {"signal": "length|polarity|grammar|label|copy|hint|other", "predicts": "...", "material": false}
  ],
  "lineageAudit": {"sourceRoundTrip": true, "surfaceRoundTrip": true, "scoringRoundTrip": true},
  "constructedResponseAudit": {
    "acceptedExamples": [],
    "boundaryRejectedExamples": [],
    "normalizationPolicyVerified": true,
    "partialCreditVerified": true
  },
  "typeSpecificEvidence": []
}
```

`constructedResponseAudit`는 선택형에서 생략한다. `independentlyValidAnswers`는 라벨 또는 정규화된 응답을 기록하며, 저장 key를 보기 전에 작성한다.
