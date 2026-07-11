# 어법 드릴 출제 매뉴얼 (저작 에이전트 계약서)

SMOAT 모바일 어법 학습 툴의 콘텐츠 뱅크를 저작하기 위한 정본 계약이다.
모든 저작 에이전트는 이 문서 전체 + `src/lib/grammar-drill/types.ts` +
`src/lib/grammar-drill/curriculum.ts` 를 읽고 나서 작업한다.
산출물은 `npx tsx scripts/verify-grammar-drill-bundle.ts <unitId>` 를 통과해야 한다.

## 0. 사명과 품질 기준

- 대상: 한국 고등학생(수능·내신). 수능 29번(어법) 대비가 최종 목표.
- **모든 영어 문장은 신규 창작**한다. 어법끝·기출 문장을 복제하지 않는다.
  기출의 "함정 구조"는 재현하되 표면(소재·어휘)은 완전히 새로 쓴다.
- 문장 품질은 평가원 급: 학술적·중립적 소재(과학·심리·사회·역사·예술·환경·
  경제·기술), 자연스러운 영어, 한 문장 안에서 판단이 완결되는 명백한 단일 정답.
- **복수 정답 시비가 생길 표면은 절대 금지** (아래 §6 금지 변형 목록).
- 한국어(해설·힌트·번역·근거)는 전부 **합니다체**. 해요체 금지.
- 영어 필드에 한글·전각문자 혼입 금지. 아포스트로피는 `'`(ASCII) 사용.

## 1. 파일 계약

에이전트당 정확히 1개 파일을 `src/data/grammar-drill/` 아래에 Write 한다.
JSON은 UTF-8(BOM 없음), 최상위 래퍼 형식은 아래와 같다.

### concepts/uNN.json — 개념 카드 (유닛당 1파일)
```json
{
  "unitId": "u01",
  "concepts": [ { GrammarConcept }, ... ]   // 백본 스켈레톤과 같은 ID·순서
}
```

### items/uNN-choice.json — CHOICE 뱅크
```json
{ "unitId": "u01", "bank": "choice", "items": [ { ChoiceItem }, ... ] }
```
개념당 12문항(난이도 1×4, 2×4, 3×4). 4개념 유닛 = 48문항.

### items/uNN-support.json — OX·서술형 뱅크
```json
{ "unitId": "u01", "bank": "support", "items": [ ... ] }
```
개념당 OX 8(난이도 2×4, 3×4) + WRITE_FORM 6(난이도 1×2, 2×2, 3×2)
+ WRITE_CORRECT 4(난이도 2×2, 3×2) = 18문항. 4개념 유닛 = 72문항.

### items/uNN-reading.json — 독해형 뱅크
```json
{ "unitId": "u01", "bank": "reading", "items": [ ... ] }
```
유닛당 MULTI_UNDERLINE 12(난이도 2×4, 3×5, 4×3) + PASSAGE 8(난이도 3×4, 4×4).

### mixed/set1.json · set2.json · final.json — 누적 복합 세트
```json
{ "setId": "set1", "title": "복합 세트 Ⅰ — 골격기 총정리",
  "unitScope": ["u01","u02","u03","u04","u05"], "items": [ { PassageItem }×10 ] }
```
set1=10문항(정답 유닛은 u01~u05에서 고르게), set2=10문항(u01~u09, 정답의
과반은 u06~u09), final=12문항(전 유닛, 1부:2·3부 = 7:5 배분).

## 2. ID 규약

- 유닛 문항: `u01-c1-ch-001` (유닛-개념-유형-일련). 유형 코드:
  ch=CHOICE, ox=OX, wf=WRITE_FORM, wc=WRITE_CORRECT, mu=MULTI_UNDERLINE, ps=PASSAGE.
- mu·ps 는 유닛 소속이므로 대표 개념의 conceptId 를 지정하되 ID는
  `u01-c1-mu-001` 형식을 유지한다(개념은 정답 포인트가 속한 개념).
- mixed: `mx1-c?-ps-001` 이 아니라 `mx1-ps-001` ~ 형식 — 단 conceptId/unitId
  필드는 **정답 포인트의 실제 유닛·개념**을 가리킨다.
- 일련번호는 001부터 파일 내 연속.

## 3. 난이도 루브릭

| 난이도 | 이름 | 정의 |
|---|---|---|
| 1 | 기초 | 개념 직결. 판단 거리 0(주어-동사 인접 등). 단문 8~14단어 |
| 2 | 표준 | 간섭 1겹(수식어구 1개 삽입, 거리 1절). 12~20단어 |
| 3 | 심화 | 간섭 2겹(관계절 안 전명구, 삽입절 통과). 18~28단어 |
| 4 | 킬러 | 기출 최고난도 재현 — 장거리 의존·프레임 결합·'옳지만 틀려 보이는' 미끼 동반 |

난이도는 **문장 길이가 아니라 판단 거리**로 조절한다. 같은 규칙이라도
주어와 동사 사이에 낀 반대 수 명사의 개수, 걷어내야 할 수식어 겹수로 올린다.

## 4. 유형별 설계 규칙

### CHOICE (괄호 택일)
- `stem` 에 `{{blank}}` 1개. `options` 는 2개(예외적으로 3개 허용).
- 오답 옵션은 해당 개념의 **대표 오개념**이어야 한다(무작위 어형 금지).
- `translation` 은 자연스러운 한국어 완역.
- 정답 인덱스는 개념 12문항 안에서 0/1이 5:7~7:5 로 섞여야 한다.

### OX (밑줄 정오)
- `sentence` 에 `[[u:토큰]]` 1개. 밑줄은 1~3단어.
- isCorrect=true(옳은 밑줄) 4 : false(틀린 밑줄) 4 비율. true 문항의 밑줄은
  "틀려 보이지만 옳은" 미끼 성격이어야 학습 효과가 있다.
- false 문항은 `correction` 에 바른 표면형.

### MULTI_UNDERLINE (미니 29번)
- 1~3문장, 밑줄 3~5개(`underlineCount` 와 일치). 틀린 것 정확히 1개.
- 나머지 밑줄은 전부 어법상 옳아야 하며, 같은 유닛 또는 **기학습 유닛**
  (더 낮은 번호 유닛) 포인트만 사용한다.
- `rationales` 는 ①부터 순서대로, 각 1문장(합니다체).

### PASSAGE (수능 29번 실전)
- 90~170단어(스키마: 80~190), 한 문단, 학술 소재. 지시문은 기본
  "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?".
- 밑줄 5개 중 틀린 것 1개(= 이 유닛 포인트), 옳은 밑줄 4개는 **기학습 유닛
  포인트 위주**(underlineUnits 에 유닛 ID 기록 — u01 지문이면 5개 전부 u01 허용,
  u07 지문이면 u01~u07 혼합).
- 옳은 밑줄 4개 중 최소 1개는 "옳지만 틀려 보이는" 고난도 미끼(예: 자동사의
  능동, 완전한 절 앞의 that, 지각동사+원형).
- 유닛 8문항의 정답 번호는 ①~⑤에서 최소 4종, 같은 번호 3연속 금지.
- `gist` 는 지문 요지 1문장(한국어).

### WRITE_FORM (서술형 어형 변형)
- `stem` 의 `{{blank}}` 에 `given`(기본형)을 어법에 맞게 변형해 넣는 문제.
- 정답이 형태상 유일해야 한다. 시제 중의성이 있으면 문장 안에 시간 부사로
  고정한다(예: last year → 과거형 유일).
- `acceptedAnswers` 에 대표답 + 표기 변형(축약형 등)을 나열한다.

### WRITE_CORRECT (서술형 오류 수정)
- `sentence` 의 `[[u:틀린표면]]` 을 바르게 고쳐 쓰는 문제. `wrong` = 밑줄 토큰.
- 고친 결과가 유일해야 한다. 두 가지 이상으로 고칠 수 있는 자리는 금지.

### 힌트 2단계 (전 유형 공통)
- `hints[0]` (구조 힌트): 어디를 보라는 지시 — 정답은 말하지 않는다.
  예: "동사처럼 보이는 단어가 이 문장에 몇 개인지 세어 보십시오."
- `hints[1]` (규칙 힌트): 판단 규칙 자체 — 역시 정답 단어는 말하지 않는다.
  예: "접속사가 없다면 한 문장에 본동사는 하나뿐입니다."
- **힌트에 정답 표면형이 등장하면 반려된다.**

### 해설 (전 유형 공통)
- 2~4문장. ① 구조 근거에 이름 붙이기(진짜 주어·삽입 관계절·의미상 주어 등)
  → ② 판단 → ③ 오답이 왜 틀렸는지. 합니다체.

## 5. trapTags 어휘 (분석 축 — 소문자 케밥)

수일치: `the-number-of` `a-number-of` `one-of` `partitive` `each-every`
`gerund-subject` `clause-subject` `inverted-subject` `intervening-clause`
`intervening-pp`
동사/준동사: `no-main-verb` `double-verb` `inserted-clause` `ed-ambiguity`
`semicolon-clause`
태/분사: `passive-with-object` `relative-gap` `intransitive-passive`
`emotion-participle` `intransitive-participle` `with-absolute` `dangling-subject`
`conjunction-retained` `perfect-participle`
관계사: `that-vs-what` `which-vs-where` `abstract-antecedent` `prep-rel`
`comma-which` `conj-that`
병렬: `coord-pair` `correlative` `shared-aux` `prep-gerund` `distant-parallel`
접속/전치: `while-during` `despite-although` `because-of` `clause-vs-np`
형부/대명사: `linking-verb` `ly-adjective` `confusable-adverb` `that-those`
`reflexive` `it-they`
준동사 목적어: `gerund-verb` `to-verb` `meaning-shift` `prep-to`
대동사/시제: `do-vs-be` `since-perfect` `past-marker`
도치/가정/비교/어순: `negative-inversion` `so-neither` `subjunctive` `without-butfor`
`as-as` `the-comparative` `double-comparative` `indirect-question` `enough-order`

필요하면 같은 형식으로 새 태그를 만들어도 된다(케밥 소문자).

## 6. 금지 변형 (복수 정답 시비 — 절대 금지)

1. 지각동사 뒤 원형↔V-ing 교체(둘 다 정문).
2. 자동사 수동화를 **정답**으로 출제(*be appeared — 즉답이라 변별 0).
   자동사 자리는 "옳은 능동에 밑줄" 미끼로만 쓴다.
3. 명사+what 직결(N what...) 을 정답 변형으로 사용 — 즉답 비문.
4. little↔a little, few↔a few, some↔any, less↔fewer 등 의미 토글(둘 다 정문).
5. very+과거분사(very surprised)·very+최상급 — very 가 정문인 자리를 much 로
   바꿔 정답 만들기 금지.
6. 시제 중의성: 시간 부사 없이 과거↔현재완료 교체 금지.
7. that↔which(제한 용법, 둘 다 가능) 교체 금지 — 콤마 뒤 계속 용법만 대조 가능.
8. 미국/영국 용법 차이(collective noun 수일치 등)에 걸리는 자리 금지.

## 7. 콤마·밑줄 배치 규칙

- 밑줄 토큰(`[[n:...]]`)은 1~4단어. 판단 대상 어형만 정확히 감싼다.
  구두점은 밑줄 밖에 둔다.
- 한 문장에서 밑줄과 밑줄 사이에는 최소 3단어 간격을 둔다(PASSAGE).
- PASSAGE 밑줄은 지문 전체에 고르게 분산(첫 문장과 마지막 문장에도 배치 가능).

## 8. 유닛별 출제 브리프 (28년 기출 빈도 데이터 증류)

### u01 동사 vs 준동사 — 최우선 유닛
- 핵심 판단: 동사 수 = (접속사+관계사) 수 + 1. 삽입절(I think/believe)을 빼고 센다.
- 함정: 과거형=p.p. 동형 동사의 후치 수식(The proposal agreed upon that night...),
  세미콜론·접속부사(thus/however) 뒤 새 본동사 필요.
- 킬러: 주어와 (없는) 본동사 사이에 관계절+분사구 2겹.

### u02 수일치
- 진짜 주어 핵과 동사 사이에 **반대 수 명사가 실재하는 자리**만 정답으로 쓴다
  (인접 수일치는 난이도 1에서만).
- the number of(단수)/a number of(복수)/one of+복수N+단수V/부분표현(percent·
  most·half of → of 뒤 명사)/동명사구·that절 주어 단수/There·장소구 도치.
- 미끼로 쓸 때도 간섭 명사가 실재해야 한다.

### u03 태
- 대표 함정: 관계절에서 목적어가 gap 으로 빠져 "목적어가 안 보여도 능동 유지".
- 4형식·5형식 수동(수동 뒤 명사 잔류)은 난이도 4 전용.
- be used to-V(용도) vs be used to V-ing(익숙) vs used to-V(과거 습관) 대조 가능.

### u04 분사
- 감정동사: 유발 -ing / 느낌 p.p. (boring lecturer vs bored students).
- 자동사 분사 예외(u04-c4): a sleeping baby(진행 -ing), fallen leaves(완료 p.p.)
  — '목적어 없으면 p.p.' 암기의 반례. 이 개념 문항은 이 대조에 집중.
- with+O+분사는 u09 와 겹치므로 여기서는 명사 수식·보어 자리 중심.

### u05 병렬
- A and [부사구] B 처럼 거리가 먼 병렬이 고난도 축.
- to부정사 병렬의 두 번째 to 생략형은 **옳은 미끼**로만.
- 비교 병렬(than/as 양쪽 형태 일치), from A to B 짝.

### u06 관계사① what vs that/which — 오답 선택 1위 유닛
- 정답 대조는 "명사절 슬롯의 that↔what"에서만: explain 뒤 완전/불완전.
- 선행사 직결 N what 은 금지(§6). 콤마+which(앞 절 전체 선행) → that/what 불가.
- 관계대명사 that(불완전) vs 접속사 that(완전) 대조는 u06-c4.

### u07 관계사② 관계대명사 vs 관계부사
- 판단은 오직 절의 완전성. 선행사 의미(장소니까 where)로 찍게 만드는 함정 —
  추상 선행사(point·case·situation·stage)+where 를 적극 활용.
- 전치사+관계대명사(in which/for which/by which)는 완전한 절 앞.
- live 류 자동사 완전절(The house in which they live) 대조.

### u08 접속사 vs 전치사
- 밑줄 바로 뒤 절/명사구만 보면 되는 유형 — 난이도는 뒤 구조를 길게 꾸며 올린다
  (동명사구가 명사구임을 간파해야 하는 자리 등).
- while/during, although·though/despite·in spite of, because/because of,
  unless·once·now that.

### u09 분사구문
- 의미상 주어 = 주절 주어 복원이 핵심. 문두 분사구문 + 멀리 있는 주어.
- 접속사 잔류(if eaten, when asked, if left untreated) 기출 빈출.
- with+O+분사(O가 의미상 주어), 독립분사구문(주어 잔류), Having p.p.(선행 시간).

### u10 형용사 vs 부사 · 대명사
- 보어 자리 형용사: be/remain/keep/stay/become/seem/look/sound/feel +
  5형식 OC(make/find/keep/leave+O+형), 가목적어 구문의 보어.
- -ly 형용사(costly/friendly/lively/deadly/likely) 함정 — 오답 49회 최상위 카드.
- that/those 는 받는 명사의 수(the rules ... those of), 재귀(them↔themselves —
  오답 44회), it vs one.

### u11 to부정사 vs 동명사 · 대동사 · 시제
- enjoy/finish/avoid/mind/give up/keep + -ing, want/decide/hope/plan/promise + to-V.
- remember/forget/try/stop 의미 분화 — 문맥으로 시점을 고정한다.
- **전치사 to**(look forward to, be used to, object to, contribute to) + V-ing —
  부정사 to 와의 대조가 오답 최다 함정.
- 대동사: 일반동사 대신 do/does/did, be동사 대신 be. 시제: since+과거 →
  현재완료, ago·last year → 과거.

### u12 도치·가정법·비교·어순
- 부정어(Never/Rarely/Hardly/Not until/Only+부사구) 문두 → 조동사+주어.
- 가정법 과거·과거완료 동사 짝, if 생략 도치(Had/Were/Should+S), without/but for.
- 비교급 수식은 much/even/still/far(very 불가 — 단 §6-5 주의), as+원급+as,
  the 비교급 ~ the 비교급.
- 간접의문문 의문사+S+V(도치 금지), enough 어순(형·부+enough / enough+명사).

## 9. 견본 문항 (품질 기준점 — 이 수준 이상으로)

### CHOICE (난이도 3, u02-c1)
```json
{
  "id": "u02-c1-ch-009", "unitId": "u02", "conceptId": "u02-c1",
  "type": "CHOICE", "difficulty": 3,
  "trapTags": ["intervening-clause", "intervening-pp"],
  "stem": "The assumption that markets always correct the errors made by individual investors {{blank}} been challenged by decades of behavioral research.",
  "options": ["has", "have"],
  "answer": 0,
  "translation": "시장이 개별 투자자들의 오류를 항상 바로잡는다는 가정은 수십 년의 행동과학 연구로 도전받아 왔습니다.",
  "hints": [
    "동사 바로 앞의 명사가 아니라, 문장 맨 앞에서 주어 핵을 찾아 보십시오.",
    "that절과 전치사구는 괄호로 묶고 무시합니다 — 남는 주어의 수가 동사를 결정합니다."
  ],
  "explanation": "주어 핵은 단수 명사 The assumption이고, that markets ... investors는 동격 that절, made by individual investors는 분사 수식어입니다. 수식어를 걷어내면 The assumption ___ been challenged가 남으므로 단수 동사 has가 옳습니다. 바로 앞의 복수 명사 investors에 끌려 have를 고르면 안 됩니다."
}
```

### PASSAGE 밑줄 설계 예 (u03 지문이라면)
- 정답: 목적어가 버젓이 있는 타동사를 수동으로 뒤집은 자리(u03).
- 미끼 4개: 옳은 능동 자동사(u03) / 진짜 주어와 일치한 단수 동사(u02) /
  옳은 분사 수식(u01의 준동사 판단) / 옳은 병렬(u05는 미학습이므로 **금지** —
  u01·u02·u03 안에서만).

## 10. 저작 절차 (에이전트 체크리스트)

1. 이 문서 + `types.ts` + `curriculum.ts` + (있으면) 해당 유닛 concepts JSON 을 읽는다.
2. 배정된 파일 하나를 완성해 Write 한다(다른 파일 절대 수정 금지).
3. `npx tsx scripts/verify-grammar-drill-bundle.ts <unitId>` 를 실행해
   본인 파일 관련 오류 0을 확인한다(다른 파일의 "없음(저작 미완)" 경고는 무시).
4. 최종 텍스트로 "파일경로 · 문항수 · 검증결과"만 보고한다.
