# Latest production Jul-16 all-types independent content audit B

- 판정 시각: 2026-07-16T17:15:47+09:00
- 역할: 독립 내용 평가자 B
- 판정 대상: `scripts/_audit-jul16-latest-content.ts --summary`가 고정한 12개 최신 프로덕션 문항
- 시간 창: `2026-07-16T06:36:00.000Z` 이상, `2026-07-16T06:42:00.000Z` 미만
- exact row count: `12`
- exact content SHA-256: `1f63bd340521da8a76ce13529834c8523fc3a0e79a4763aa3b68c16c0acd9f7b`
- DB 접근: 읽기 전용 `findMany`만 사용
- DB write / API call / model call / provider call: 모두 `0`
- 독립성: 기존 연구노트와 다른 평가자의 판정은 열람하지 않았다.

## 최종 판정

`FAIL_REJECT`

12문항 중 A는 0개이고, B 2개, C 2개, F 8개다. 즉 바로 사용할 수 있는 B 이상은 2/12(16.7%)뿐이고, 즉시 반려해야 하는 F가 8/12(66.7%)다. 정답만 맞는가를 넘어서 학생에게 실제로 제시 가능한가를 기준으로 보면 이 묶음은 프로덕션 품질 게이트를 통과하지 못한다.

특히 다음은 단순한 “조금 쉬움”이 아니라 문항 무효 또는 반려 사유다.

1. 원문이 심하게 손상되고 고아 따옴표까지 남은 빈칸 문항 `vy6wtk`
2. 선지에 `to spent`라는 명백한 비문이 들어간 빈칸 문항 `mjxpe6`
3. 해설이 `MCing(lapping)`이라고 오기하고 DJ 기술이 MCing을 낳았다고 인과를 뭉갠 주제 문항 `q9yrh7`
4. `taking`을 목적격보어로만 단정했지만 실제로는 `a friend taking ...`이라는 축약 관계절 분석이 가능한 어법 문항 `j9i10h`
5. ③뿐 아니라 ④에도 자연스럽게 들어가며, 오답 해설 네 개가 실제 위치와 체계적으로 어긋난 문장 삽입 `pdekjt`
6. 정답을 넣으면 주어가 `Herc's party`인데 `his performance`를 제한하지 않았다는 매달린 수식이 되는 빈칸 `uelp2h`
7. 정답 선지 자체에 `Commmunity` 오타가 있고 “힙합이 평화의 촉매”였다는 인과를 과장한 주제 문항 `m53vfp`
8. `Never again do they use ...`도 문법적으로 가능해 1번과 2번이 모두 성립하고, (B) 해설의 선행사 분석까지 틀린 네모 어법 `aiqijc`

## 평가 기준

- A: 정답이 유일하고, 표면·선지·난이도·해설까지 그대로 출제 가능한 수준
- B: 정답과 해설이 안전하며 사소한 난이도/표현 보정만 필요한 수준
- C: 풀 수는 있으나 선지 매력도·난이도·표현 또는 해설을 실질적으로 고쳐야 하는 수준
- F: 복수정답/무정답 위험, 비문, 사실·문법 오분석, 심한 원문 손상, 정답 선지 오류 등으로 반려해야 하는 수준

축 약어는 다음과 같다.

- U: 정답 유일성
- S: source/render integrity
- D: distractor craft
- K: difficulty calibration
- E: explanation truth/conciseness
- W: wrong-option explanation mapping
- G: typo/grammar
- P: passage clustering

P는 배치 다양성 축이다. 이 축 하나만으로 개별 문항의 총점을 자동 F로 만들지는 않았지만, 배치 릴리스 게이트에는 별도로 적용했다.

## 문항별 등급표

| suffix | subtype | 독립 풀이 | 총점 | U | S | D | K | E | W | G | P | fatal domain |
|---|---|---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| `vy6wtk` | BLANK_INFERENCE | ⑤ | F | A | F | F | F | C | A | F | A | source/render, typo/grammar |
| `mjxpe6` | BLANK_INFERENCE | ② | F | A | C | F | C | B | A | F | F | typo/grammar, distractor craft |
| `o42a1y` | TITLE | 5 | C | A | C | C | C | C | A | B | F | 없음 |
| `1l55a0` | GRAMMAR_CHOICE_COMBO | 5 | B | A | C | B | C | B | A | B | F | 없음 |
| `34lxl9` | VOCAB_CHOICE | 4 | C | A | C | C | C | B | A | B | F | 없음 |
| `q9yrh7` | TOPIC | 2 | F | A | C | B | B | F | C | F | F | explanation truth, typo/grammar |
| `j9i10h` | GRAMMAR_ERROR | intended (E), 유일하지 않음 | F | F | C | F | F | F | B | F | F | answer uniqueness, grammar analysis |
| `pdekjt` | SENTENCE_INSERT | intended ③, ④도 가능 | F | F | B | F | F | B | F | A | F | answer uniqueness, wrong-option mapping |
| `uelp2h` | BLANK_INFERENCE | intended ④, 완성문 비문 | F | A | F | F | C | C | A | F | F | keyed completion grammar |
| `bcuwuy` | SENTENCE_ORDER | 3 | B | A | A | B | B | A | A | A | F | 없음 |
| `m53vfp` | TOPIC | intended 2 | F | C | A | C | C | C | A | F | C | typo/grammar, answer semantic fidelity |
| `aiqijc` | GRAMMAR_CHOICE_COMBO | intended 2, 1도 가능 | F | F | A | F | F | F | C | F | C | answer uniqueness, explanation truth |

## 문항별 직접 풀이·감사

### 1. `vy6wtk` — BLANK_INFERENCE — F

정답 의미는 “라임이 리듬/flow를 만든다”이므로 ⑤가 유일하다. 그러나 문제의 바탕 지문과 렌더가 이미 무너졌다.

- `word.Most`처럼 문장 사이 공백이 없다.
- `Most often ... / Let's look ...` 두 문장이 그대로 중복된다.
- `rhyme.ry reading`은 `Try`의 첫 글자가 잘린 형태다.
- 예문과 설명이 `aloud.My house ... dropThe two ...`처럼 붙어 있다.
- 원문 표현을 빈칸으로 바꾼 뒤 `it _____.”`가 되어 여는 따옴표 없이 닫는 따옴표만 남는다.
- 오답 네 개는 모두 “감정 상실/혼란/고립/약화”라는 노골적인 부정 방향이라 ⑤와 경쟁하지 않는다.

해설의 핵심 뜻은 맞지만 “원초적이고 음악적인 생성 작용”, “학술적으로 재진술” 같은 장식이 많고, 손상된 표면을 전혀 문제 삼지 않는다. 정답 유일성만으로 살릴 수 없는 source/render fatal이다.

### 2. `mjxpe6` — BLANK_INFERENCE — F

독립 풀이 정답은 ②다. 두 장의 레코드를 번갈아 사용해 LP 교체 시 춤이 끊기지 않았다는 원문과 의미가 대응한다.

반려 사유는 선지 표면과 함정 설계다.

- ① `force the host to spent`는 `to spend`가 되어야 하는 명백한 비문이다.
- ①의 `demonstrating techniques instead of LPs`도 비교 대상이 맞지 않아 의미가 붕괴한다.
- ③과 ④는 무대에 올라 레코드 교체를 돕거나 파티 일정을 취소한다는 지문 밖 상황이다.
- ⑤는 정반대 극성이라 즉시 소거된다.
- 따라서 ②만 정상적인 영어 문장이고 나머지는 정답과 같은 의미 축에서 경쟁하지 않는다.

해설과 오답 해설의 라벨 매핑은 맞지만, “완벽하게 치환”이라는 표현은 과장이다. source에도 `culture.DJs` 공백 손상이 남아 있다.

### 3. `o42a1y` — TITLE — C

⑤ `From Street Clashes to Creative Beats: The Birth of Hip-Hop Culture`가 글 전체를 가장 잘 포괄한다. 정답은 명확하다.

그러나 보기 매력도는 낮다.

- ①은 한 지역의 한 평화 협정을 “역사 속 위대한 평화 협정들”로 과확장한다.
- ②는 본문에 없는 MC의 경제적 성공을 넣는다.
- ③은 DJ 기술을 LP 제작/녹음 기술로 바꾼다.
- ④는 폭력이 줄고 예술로 대체되는 방향을 정반대로 뒤집는다.

실질적인 근접 오답이 없다. 해설의 “폭력을 긍정적 예술 문화로 공존시켰다”도 본문의 `replaced`와 맞지 않는 어색한 설명이다. 정답은 안전하지만 INTERMEDIATE 수준의 날카로운 제목 문항은 아니다.

### 4. `1l55a0` — GRAMMAR_CHOICE_COMBO — B

정답은 5번 `that - is - to take`로 유일하다.

- (A) `the gangs`라는 선행사가 있고 관계절 주어가 필요하므로 `that`
- (B) 핵심 주어가 단수 `party`이므로 `is`
- (C) 의도된 “친구에게 역할을 맡아 달라고 요청하다”는 `ask + O + to-V`

각 오류가 서로 다른 축이고 조합 선지도 정상적으로 작동한다. 다만 세 포인트가 모두 매우 교과서적이며 `what/that`, `is/are`, `take/to take`가 표면적으로 쉽게 갈려 INTERMEDIATE 중에서도 낮은 난도다. 해설의 `dynamic verb`, `준사역` 같은 명명은 불필요하지만 핵심 판정은 맞다. 지문에는 `culture.DJs` 공백 손상이 남아 있다.

### 5. `34lxl9` — VOCAB_CHOICE — C

정답은 4번 `unwelcome`이다. 바로 뒤에서 사람들이 break를 기다리고 춤 솜씨를 뽐내므로 원문의 `anticipated`와 정반대인 `unwelcome`이 부적절하다.

정답은 유일하지만 함정이 얕다. 나머지 네 단어는 원문을 그대로 유지했고 모두 해당 문장의 핵심 명사·동사라 거의 자동으로 적절하다. `anticipated ↔ unwelcome`의 직접 반의만 찾으면 되어 중간 난도로 보기 어렵다. 해설과 오답 해설은 사실에 맞고 매핑도 정확하다.

### 6. `q9yrh7` — TOPIC — F

정답 자체는 2번 `The emergence of hip-hop culture and its early musical development`가 가장 포괄적이다. 1번과 4번은 부분적으로 매력적인 과협소 오답이고, 보기 설계만 보면 TITLE보다 낫다.

하지만 학생용 해설은 반려 대상이다.

- `MCing(lapping)`은 명백히 `rapping`의 오기다.
- DJ Kool Herc의 break 연장 기술이 breakdancing뿐 아니라 MCing의 시초까지 직접 만들었다고 한 문장으로 묶지만, 본문은 MCing의 기원을 DJ들의 리드미컬한 외침과 별도 MC 역할의 분화로 설명한다.
- 오답 해설은 매번 `선택지는 ①는`, `선택지는 ③는`처럼 문장 성분이 겹친다.

정답 라벨은 맞더라도 해설이 잘못 가르치는 문항은 프로덕션에 둘 수 없다.

### 7. `j9i10h` — GRAMMAR_ERROR — F

시스템의 의도 정답은 (E)이고, 의도한 원문은 `asked a friend to take the role`이다. 그러나 생성된 `asked a friend taking the role ...`를 반드시 비문이라고 단정할 수 없다.

`a friend taking the role ...`은 `a friend who was taking the role ...`의 축약 관계절로 분석할 수 있다. 영어에서 `They asked a student sitting in the front row`처럼 `ask + 사람 명사구`도 문법적으로 가능하다. 이 경우 뜻은 원문과 달라지고 문맥상 어색하지만, “어법상 틀린 것”이 요구하는 단일한 통사 오류는 아니다.

해설은 `taking`을 무조건 목적격보어라고 전제하고 이 대체 분석을 차단하지 못한다. 나머지 밑줄 `who / known / dancing / their`는 지나치게 평이하다. 따라서 명백한 오류 하나를 찾는 문항으로서는 유일성이 없다.

### 8. `pdekjt` — SENTENCE_INSERT — F

원문의 실제 삭제 위치인 ③은 매우 자연스럽다. 두 턴테이블로 break를 연장한 원인 뒤에 “더 이상 LP 교체 때 춤을 멈출 필요가 없었다”는 결과가 오고, 다음에 스타일의 영향력이 이어진다.

그러나 ④도 충분히 성립한다.

> Kool Herc's style of DJing quickly became influential ...  
> No longer did people have to stop dancing ...  
> The break section became the most anticipated part ...

스타일의 영향력을 먼저 요약하고 그 구체적 효용을 제시한 뒤 break의 인기로 넘어가는 흐름은 문법·지시·인과 면에서 깨지지 않는다. 주어진 문장에는 명시적 지시어/연결사가 없으며 저장 데이터도 `sentence-insert-neutral-given` 경고를 갖고 있다. 따라서 ③이 원문 위치라는 사실과 “③만 가능하다”는 것은 다르다.

더 심각한 문제는 오답 해설의 위치 매핑이다.

- 1번 해설은 실제 ① 위치가 아니라 ② 부근의 “1973년 생일 파티/새 DJ 기술”을 설명한다.
- 2번 해설은 실제로 정답 ③ 앞에 있는 “두 장의 레코드로 break 연장”을 자기 위치의 앞 고리처럼 설명한다.
- 4번 해설은 실제 ⑤의 `People ... / Kool Herc named ... / These people ...` 지시 사슬을 설명한다.
- 5번 해설은 선택지에 존재하지 않는, street battle culture 뒤 MCing 전환 위치를 설명한다.

`distractorTraps`도 같은 방향으로 밀려 있다. 네 오답에 대한 해설/함정이 네 실제 gap과 1:1 대응하지 않는다. 이는 해설 표현의 사소한 문제를 넘어 학생에게 틀린 위치 논리를 가르치는 fatal이다.

### 9. `uelp2h` — BLANK_INFERENCE — F

의도 정답은 ④지만, 이를 대입한 완성문은 다음과 같다.

> Herc's party ... is now known as the birthplace of hip-hop music **by not restricting his performance to a single playback**.

주어는 `Herc's party`인데 `his performance`를 제한하지 않은 행위자는 Herc여야 한다. `by not restricting ...`이 주절 주어에 매달려 파티가 Herc의 공연을 제한하지 않은 것처럼 읽히는 dangling/illogical modifier다. `single playback`도 두 턴테이블과 두 레코드를 번갈아 재생한 기술을 자연스럽게 지칭하지 못한다.

나머지 보기는 조용한 관객, 댄서 대형, 보컬 요소, 두 LP 미사용 등 지문과 동떨어지거나 반대여서 ④가 상대적으로 골라질 뿐이다. “가장 덜 나쁜 비문”을 정답으로 삼은 문항이다.

### 10. `bcuwuy` — SENTENCE_ORDER — B

정답은 3번 `(B)-(C)-(A)`로 유일하고 안전하다.

- 주어진 글의 `block parties`를 (B)의 `these parties`가 직접 받는다.
- (B)가 `DJ Kool Herc`를 처음 완전한 이름으로 소개한다.
- (C)는 이후 `Herc's party`로 줄여 받고 새 기술을 구체화한다.
- (A)는 `Kool Herc's style`과 break의 인기로 결과를 정리한다.

오답 해설도 실제 조합과 정확히 대응한다. 단서가 세 겹으로 강해 난도는 중간 이하이지만, 이 12개 중 유일성·표면·해설이 함께 안정적인 두 문항 중 하나다.

### 11. `m53vfp` — TOPIC — F

2번이 다른 보기보다 가장 가깝지만 정답 선지에 두 문제가 있다.

- `Commmunity`는 `Community`의 명백한 오타다.
- 본문은 평화 조약이 먼저 체결되고 힙합이 “새로운 평화 문화의 주요 부분”으로 태어났다고 한다. 정답의 `hip-hop as a catalyst for peace`는 힙합이 평화를 촉발했다는 더 강한 인과를 부여한다.

나머지 보기는 무료 급식/의료라는 세부, 세계적 지배력, 경제 불평등, 본문에 없는 교육 프로그램 붕괴로 멀리 떨어져 있어, 부정확한 2번이 상대적으로 정답이 된다. 정답 선지 자체의 오타와 인과 과장은 반려 사유다.

### 12. `aiqijc` — GRAMMAR_CHOICE_COMBO — F

의도 정답은 2번 `called - which - will`이지만 어법 문제로는 유일하지 않다.

- `Never again do they use violence to solve their disputes`는 강조 도치가 적용된 문법적인 현재시제 문장이다. 역사적 현재로 서술되는 앞 문맥에서 “그들은 이제 다시는 폭력을 쓰지 않는다”는 정책/습관으로도 읽힌다.
- 따라서 (A), (B)가 의도대로일 때 1번 `called - which - do`와 2번 `called - which - will`이 모두 문법적으로 가능하다.
- (A)의 `calling`도 “Ghetto Brothers에게 전화를 거는/부르는 한 갱단”이라는 다른 의미의 현재분사 수식으로 통사적으로는 성립할 여지가 있어, 순수 어법 대조로 안전하지 않다.

해설의 (B) 분석도 명백히 틀렸다. `which`의 선행사는 `its free meal and medical care programs`가 아니라 `a gang called the Ghetto Brothers`이고, `which`는 `is respected`의 주어다. `because of its free meal ...`은 존경받는 이유를 나타내는 전치사구일 뿐이다.

정답 유일성과 문법 해설이 동시에 무너진다.

## 유형별 종합

### 빈칸 추론

3개 모두 F다.

- `vy6wtk`: 원문/렌더 파손 + 고아 따옴표 + 전부 노골적 부정 오답
- `mjxpe6`: `to spent` 비문 + 무관한 오답
- `uelp2h`: 정답 대입문 자체가 dangling modifier

현재 묶음에서는 “패러프레이즈 모드”나 “부정 구조”가 난도를 높인 것이 아니라, 정상 영어와 비정상 영어를 구분하는 문제로 변질됐다.

### 어법

네모 어법 두 개 중 `1l55a0`만 B다. `aiqijc`는 `do/will`을 문법 정오로 만들 수 없고 (B) 해설도 틀렸다. 어법 오류 찾기 `j9i10h`는 `taking`의 축약 관계절 분석을 배제하지 못한다.

즉, 현재 실패는 “어려운 문법을 못 골랐다”가 아니라 **의도한 분석만 가능하다고 가정하고 다른 합법적 통사 분석을 닫지 못한 것**이다.

### TITLE / TOPIC / VOCAB

- TITLE `o42a1y`: 정답은 좋지만 네 오답이 너무 멀어 C
- TOPIC `q9yrh7`: 선지 경쟁은 비교적 낫지만 해설 오기/인과 오류로 F
- VOCAB `34lxl9`: 원문 `anticipated`의 직접 반의어 하나만 바꿔 C
- TOPIC `m53vfp`: 정답 오타와 `catalyst` 인과 과장으로 F

보기의 표면 길이는 비슷하지만, “길이 균형”이 “매력도 균형”으로 이어지지 않는다. 좋은 오답은 지문 일부를 정확히 잡되 범위·인과·초점 하나만 틀려야 하는데, 다수 보기는 본문 밖 경제·녹음·교육 프로그램을 넣거나 극성을 정반대로 뒤집는다.

### SENTENCE_INSERT / SENTENCE_ORDER

- SENTENCE_ORDER `bcuwuy`: B, 정답 유일성과 해설 정합 모두 양호
- SENTENCE_INSERT `pdekjt`: F, ④ 복수정답 가능성과 4/4 오답 해설 위치 불일치

삽입 문제는 “원문 삭제 위치를 복원할 수 있음”만으로 유일성이 증명되지 않는다. 다른 gap에 넣어도 양방향 고리가 유지되는지 실제로 대입 검증해야 한다.

## passage clustering

12문항은 3개 지문에만 묶여 있다.

| passage suffix | 문항 수 | 비율 | 포함 유형 |
|---|---:|---:|---|
| `3ab42p` | 9 | 75.0% | BLANK 2, TITLE, GRAMMAR_COMBO, VOCAB, TOPIC, GRAMMAR_ERROR, SENTENCE_INSERT, SENTENCE_ORDER |
| `7uxjzk` | 2 | 16.7% | TOPIC, GRAMMAR_COMBO |
| `mdez51` | 1 | 8.3% | BLANK |

배치 clustering 등급은 F다. 단일 지문이 75%를 차지해 유형별 품질을 독립 표본처럼 볼 수 없고, 동일한 Kool Herc/break/MCing 문장이 선지와 해설에서 반복된다. 이 12개는 “여러 유형의 최신 품질”을 보여 주기보다 한 지문을 여러 형태로 변환한 worksheet에 가깝다.

## Git lineage 재검증

- quality commit: `448488cae9abe95e0895f10a35d86fed297ddcbb`
- production deploy commit: `8151305c490732e39f9cb3d243788045cbc2e670`
- `git merge-base --is-ancestor 448488ca... 8151305c...`: PASS
- 두 커밋 사이 후속 커밋 수: 5
- 배포 커밋은 quality commit을 조상으로 포함한다.

질문 생성 품질 코어 범위에서는 diff가 0개였다.

- `src/app/api/ai/generate-questions-auto/**`
- `src/app/api/workbench/ai-jobs/question-generation/**`
- `src/lib/atlas-ai.ts`
- `src/lib/grammar-point-catalog.ts`
- `src/lib/question-generation-llm.ts`
- `src/lib/question-generation-plans.ts`
- `src/lib/question-generation-prompt-contract.ts`
- `src/lib/question-prompts-mc.ts`
- `src/lib/question-quality/**`

다만 “generation이라는 이름이 붙은 파일이 두 커밋 사이에 하나도 바뀌지 않았다”는 넓은 문장은 사실이 아니다. point-picker와 workbench generate UI, passage transform/suggest, 렌더 대화상자 등 이름 기준 17개 파일이 바뀌었다. 이 변경들은 생성 품질 코어의 prompt/model/validator 경로 변경은 아니지만, 입력 선택 UX에는 관여한다. 따라서 정확한 lineage 결론은 다음과 같다.

> `448488ca...`의 질문 생성 품질 코어는 `8151305c...`까지 byte-level diff 없이 포함되었다. 그러나 workbench 생성 UI/point-picker 계층까지 포함한 광의의 generation 경로는 변경되었다.

`src/lib/feature-flags.ts`도 바뀌었지만 변경 내용은 `SHOW_CREDIT_TOP_UP` 기본값을 false에서 true로 바꾼 것이며 문제 생성 품질과 무관하다.

## 재현용 단일 문항 digest

| suffix | one-row SHA-256 |
|---|---|
| `vy6wtk` | `5a77a4b0b37aff7253b0aa064e940c1129b5de9f176bc213ac123867b81e3261` |
| `mjxpe6` | `0ee86675bd2df9be0f08491d6a37129812cc2265ad73409f2a6e039158049f92` |
| `o42a1y` | `3ad467a3515b39d3c930711b79ed78f413e2f74ad117a88c2762dca6126f3cd3` |
| `1l55a0` | `8fc355849910a85d4616327211d809006e917f60c2c77664af2a515c03a8fa61` |
| `34lxl9` | `3d8eea49ae14866e058d226258872fafba07d312f23016996db66fcbfefe0f5b` |
| `q9yrh7` | `c7e6057d838719562dbf9e7e82c33febcbf62e7247fd6d3e5cfb324ab2d73ea1` |
| `j9i10h` | `bf829b0513ee2ba140f88561f417706e3f28a8329abb3bd606869fed00a501a0` |
| `pdekjt` | `4d4fdbfb16e87968bfe09cd8e78a65a7b81cbfaca386a94d1e2e83ecbbbabdad` |
| `uelp2h` | `8ad9b01d1141679678c632d69a828527fc722bec78d5ceabb8dc41eed40100d2` |
| `bcuwuy` | `1a5b67c261953d02ea5f6c8e6aba007c28e258344761309c3656dd6181be3922` |
| `m53vfp` | `3db886cc2aaeb8e7717824cd2dec959973d141b7726f5d375b920489b710a0b6` |
| `aiqijc` | `4884babb9bfa5d6c92bf5ed67a2f1ec7aad80d9602f188366d0f56403fb42193` |

## 결론

이 표본에는 “아름다운” A 문항이 없다. 가장 나은 것은 `1l55a0`, `bcuwuy` 두 B 문항이며, 둘 다 정답과 해설은 안전하지만 난도가 날카롭지는 않다.

현재 가장 먼저 막아야 할 것은 모델 교체보다 다음 세 가지 산출물 불변식이다.

1. 원문·빈칸 대입·모든 영어 선지에 대한 완전한 문법/표면 검사
2. 어법 문항에서 의도 분석 외의 합법적 통사 분석 존재 여부를 찾는 반례 검사
3. 문장 삽입에서 모든 gap 실제 대입과, postprocess 이후 gap별 해설 의미의 1:1 재검증

이 세 불변식을 통과하지 못한 문항은 비용이나 모델 등급과 무관하게 저장 전에 반려해야 한다.
