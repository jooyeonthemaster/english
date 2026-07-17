# Latest production Jul-16 focus audit A v1

## Verdict

`FAIL_BLOCKERS`

지정된 최신 프로덕션 6문항은 모두 `F`다. 저장 정답을 판정 근거로 삼지 않고 문항을 다시 풀었을 때, 독립 정답이 저장값과 일치한 문항도 출하 가능한 문항이라는 뜻은 아니었다. 빈칸 3문항은 지문/마커 손상, 비문 선지, 극성 반전 위주의 허술한 오답군, 과도하게 느슨한 패러프레이즈가 겹쳤다. 어법 3문항 중 `j9i10h`는 의도한 (E)가 합법적인 분사 후치수식으로 재분석될 수 있고, `aiqijc`는 (C)의 `do`와 `will`이 모두 문법적으로 성립한다. 따라서 두 문항은 저장키와 무관하게 정답 유일성이 깨진다.

이 평가는 “오류가 없으면 통과”가 아니라, 오류가 없는 것을 최소 전제로 하고 선지마다 의도적 유혹과 단일 결정 결함이 있는지를 본다. 이 표본에서는 아름다운 문제나 킬러 문항은 0/6이었다.

## Scope and immutable source

- read-only script: `scripts/_audit-jul16-latest-content.ts`
- script SHA-256: `1920ccf6065222158b1526fdd3acda1c24fb7b6f2b4d399ad167c3a0258fa1f6`
- UTC window: `[2026-07-16T06:36:00.000Z, 2026-07-16T06:42:00.000Z)`
- exact row count: `12`
- exact 12-row content SHA-256: `1f63bd340521da8a76ce13529834c8523fc3a0e79a4763aa3b68c16c0acd9f7b`
- audited focus: `BLANK_INFERENCE` 3, `GRAMMAR_ERROR` 1, `GRAMMAR_CHOICE_COMBO` 2
- DB writes: `0`
- provider/API/model calls: `0`
- full-question candidate budget consumed: `0`
- network/provider generation: `0`

개별 판정에는 기존 연구노트의 해당 문항 판정을 사용하지 않았다. DB 출력에는 저장 답과 해설이 함께 있었지만, 최종 답은 각 선택지를 독립적으로 완성문에 넣어 문법성과 의미를 다시 판정한 결과다.

이번 감사에서 쓰는 축은 다음과 같다.

- V1: 실제 정답 집합의 유일성 및 학생 노출 문장의 문법성
- V2: 지문, blank/marker, 원문 복원 표면의 무결성
- V3: 선지 공예, 선언 난이도, 함정의 의도성과 경쟁력
- V4: 해설의 통사·문법·사실·선지별 논리 정확성
- V5: options, answer, marker, explanation, structured/top-level 필드 동기화

## Lineage boundary

- generation-quality commit `448488cae9abe95e0895f10a35d86fed297ddcbb`는 deployment commit `8151305c490732e39f9cb3d243788045cbc2e670`의 ancestor다.
- deployment commit `8151305c490732e39f9cb3d243788045cbc2e670`의 parent는 현재 로컬 `HEAD`인 `467c6d107137a91088d3eba1620ba4036a63d709`다.
- 이 평가는 위 두 lineage 사실 외의 과거 코드 상태를 문항 내용 판정의 대리 지표로 쓰지 않았다.

## Aggregate

| metric | result |
|---|---:|
| audited | 6 |
| A / B / C / F | 0 / 0 / 0 / 6 |
| V1 pass | 2 / 6 |
| V2 pass | 1 / 6 |
| V3 pass | 0 / 6 |
| V4 pass | 0 / 6 |
| V5 pass | 4 / 6 |
| independently unique and stored-key-matching | 4 / 6 |
| no unique answer/error | 2 / 6 |
| beautiful/KILLER | 0 / 6 |

V2 실패 5건은 독립 source defect 5개를 뜻하지 않는다. `mjxpe6`, `uelp2h`, `j9i10h`, `1l55a0` 네 문항은 같은 passage `3ab42p`의 `culture.DJs` 결함을 공유한다. 즉 item fatal은 5/6이고, 관측된 passage-defect cluster는 `mdez51`, `3ab42p` 두 개다. 반대로 하나의 source defect가 여러 문항으로 증폭된다는 점이 production 위험이다.

## Item adjudications

### `vy6wtk` — BLANK_INFERENCE — grade F

- independent answer: `⑤`
- stored key comparison after adjudication: match
- validity: V1 fail, V2 fail, V3 fail, V4 fail, V5 fail
- item content SHA-256: `5a77a4b0b37aff7253b0aa064e940c1129b5de9f176bc213ac123867b81e3261`

`⑤ establishes a structured movement of sound`만이 `creates a rhythmic pattern or “flow”`의 방향을 보존하므로 최선 답은 유일하다. 그러나 완성 표면은 `it establishes ... sound.”`가 되어 대응하는 여는 따옴표 없이 닫는 따옴표가 남는다. 지문 자체에도 `word.Most`, 동일 두 문장 중복, `rhyme.ry reading`, `aloud.My`, `top Don’t`, `dropThe`가 있다. 이는 난이도나 문체 문제가 아니라 학생 노출 본문 손상이다.

선지별 판정:

- ① 문법적이지만 바로 뒤의 `evokes emotions`를 정반대로 뒤집는다. 유혹 근거가 사실상 없다.
- ② 문법적이지만 긍정적인 flow와 listener reach를 일반적인 “semantic confusion”으로 반전한다.
- ③ 문법적이지만 첫 문단의 `musical effect`를 그대로 부정한다.
- ④ 문법적이지만 마지막 문장의 `make your voice stronger`를 그대로 부정한다.
- ⑤ 문법적이고 의미 방향은 맞지만 `structured movement of sound`는 원문의 자연스러운 `rhythmic pattern or flow`보다 추상적이고 덜 관용적이다.

오답 네 개가 모두 노골적인 부정 극성이고, 정답만 긍정 극성이다. 학생은 빈칸의 정확한 논리를 추적하지 않고도 정답을 찾는다. 해설의 “학술적으로 재진술”, “원초적이고 음악적인 생성 작용”은 근거 없는 격상 표현이며, 손상된 마커와 지문은 전혀 다루지 않는다. `surroundingText`는 깨끗한 마침표 구조를 암시하지만 `passageWithBlank`와 `questionText`에는 고아 닫는 따옴표가 남아 표현 표면도 일치하지 않는다.

### `mjxpe6` — BLANK_INFERENCE — grade F

- independent answer: `②`, 단 원문의 조건을 느슨하게 축약한 “best available” 답
- stored key comparison after adjudication: match
- validity: V1 fail, V2 fail, V3 fail, V4 fail, V5 pass
- item content SHA-256: `0ee86675bd2df9be0f08491d6a37129812cc2265ad73409f2a6e039158049f92`

선지별 판정:

- ① `to spent`는 `to spend`여야 한다. 또한 `demonstrating techniques instead of LPs`는 비교 대상도 맞지 않는다. 의미추론 문항에 의도하지 않은 비문 선지가 들어갔다.
- ② 문법적이며 유일한 최선 답이다. 다만 원문의 `while the DJ changed the LP disc`라는 조건을 지우고 `when the song ended`로 넓혀 “완벽한 치환”은 아니다.
- ③ 문법적이나 무대에 올라 음반 교체를 돕는다는 사건은 전혀 제시되지 않았다.
- ④ 문법적으로 성립하나 `No party hosts`, `their schedule`가 어색하고 일정 취소는 핵심 기술과 무관하다.
- ⑤ 문법적이지만 원문의 춤 연속성을 정반대로 뒤집는다.

지문에는 `culture.DJs`가 남아 있다. 세 오답은 기술의 인과를 정교하게 비튼 것이 아니라 무대 도움, 일정 취소 같은 임의 사건을 발명했고, ⑤만 단순 극성 반전이다. 해설은 ②를 “완벽하게 치환”한다고 단정하며 조건 손실을 숨기고, ①의 명백한 비문은 논리 이탈로만 처리한다.

### `uelp2h` — BLANK_INFERENCE — grade F

- independent answer: `④`
- stored key comparison after adjudication: match
- validity: V1 pass, V2 fail, V3 fail, V4 fail, V5 pass
- item content SHA-256: `8ad9b01d1141679678c632d69a828527fc722bec78d5ceabb8dc41eed40100d2`

선지별 판정:

- ① 문법적이지만 `without failing to keep ... quiet and calm`은 결국 군중을 조용하게 유지했다는 뜻이어서 본문의 흥분과 춤에 반한다.
- ② 문법적이지만 dancer formation 통제는 제시되지 않았다.
- ③ 문법적이지만 vocal element 포함 여부는 break 연장 기술의 원인이 아니다.
- ④ 문법적이며 두 음반 사이를 오가며 단일 재생에 묶이지 않았다는 유일한 인과적 후보다. 다만 `his performance`와 `a single playback`은 원문보다 느슨한 추상화다.
- ⑤ 문법적으로 성립한다. `switched between them`을 엄밀한 동시 재생이 아니라고 읽으면 부분적으로 참일 수도 있어, 오답의 결정 결함은 “두 디스크를 동시에 돌리지 않았다” 자체보다 그것이 파티를 발상지로 만든 원인을 설명하지 못한다는 데 있다.

지문은 같은 `culture.DJs` 결함을 갖는다. ⑤는 최소한 scope 함정이지만, ①~③은 핵심 인과와 너무 멀고 ④도 `because of his new DJ technique`를 정확히 복원하는 표현은 아니다. 해설은 ②가 자유로운 배틀 분위기와 “상반”한다고 단정하지만, formation을 깨지 않게 했다는 진술은 미언급이지 논리적 반대가 아니다. ①도 목적과 사실을 구분하지 않고 “목적을 지녔다”고 서술한다.

### `j9i10h` — GRAMMAR_ERROR — grade F

- independent answer: `NO_UNIQUE_ERROR`
- intended/stored answer: `(E)`
- stored key comparison after adjudication: mismatch
- validity: V1 fail, V2 fail, V3 fail, V4 fail, V5 fail
- item content SHA-256: `bf829b0513ee2ba140f88561f417706e3f28a8329abb3bd606869fed00a501a0`

site별 판정:

- (A) `who`: DJ Kool Herc를 선행사로 하는 계속적 주격 관계대명사로 적법하다.
- (B) `known`: `the drum section [which is] known as the break`의 축약으로 적법하다.
- (C) `dancing`: `stop V-ing`가 “춤추는 것을 멈추다”를 나타내므로 적법하다.
- (D) `their`: 복수 `People`의 소유격으로 적법하다.
- (E) `taking`: 의도된 원문 의미라면 `asked a friend to take`가 맞다. 그러나 실제 표시 문장은 `a friend taking the role ...`를 `a friend [who was taking the role ...]`라는 분사 후치수식으로 합법적으로 분석할 수 있다. `ask a friend` 자체도 문맥적으로 목적어를 취한 완전한 동사구가 될 수 있다. 어색한 의미와 비문은 동일하지 않으므로 (E)를 유일한 문법 오류라고 확정할 수 없다.

해설은 가능한 분사 수식 분석을 검토하지 않고 처음부터 `ask + O + OC`로 고정한다. `ask`를 “요구·허용 동사”라고 묶은 것도 부정확하다. `markedExpressions[(E)].expression`은 학생에게 표시된 `taking`이 아니라 교정형 `to take`를 담고, 별도 `errorExpression`만 `taking`을 담는다. A~D의 `expression`은 표시형이라는 점과도 불일치한다. 지문에는 `culture.DJs`가 남아 있다.

### `1l55a0` — GRAMMAR_CHOICE_COMBO — grade F

- independent answer: `5`
- stored key comparison after adjudication: match
- validity: V1 pass, V2 fail, V3 fail, V4 fail, V5 pass
- item content SHA-256: `8fc355849910a85d4616327211d809006e917f60c2c77664af2a515c03a8fa61`

site별 판정:

- (A) `that`: 선행사 `the gangs` 뒤에서 관계절의 주어이므로 `that`; `what`은 불가하다.
- (B) `is`: 긴 주어의 핵은 단수 `party`다.
- (C) `to take`: `ask + O + to-infinitive`; bare `take`는 불가하다.

따라서 5만 완전한 조합이다. 다만 1은 세 군데 모두 틀리고, 2/3/4는 각각 A/C/B 한 군데만 틀리며, 5는 전부 맞는 기계적인 조합이다. 세 포인트 모두 표면 단서가 강한 교과서형이고 상호작용이 없어 `INTERMEDIATE` 상단이나 킬러 공예와 거리가 멀다. 같은 passage에서 불과 직전에 생성된 `j9i10h`가 동일한 `asked a friend to take`를 오류 지점으로 재사용하므로 batch 내 포인트 다양성도 낮다.

해설의 A/B/C 결론은 맞지만 `ask`를 “준사역의 의미를 가지는” 동사라고 한 것은 잘못된 분류다. `ask + O + to-V`는 요청/요구 보문 구조로 설명하면 충분하다. 지문에는 `culture.DJs`가 남아 있다.

### `aiqijc` — GRAMMAR_CHOICE_COMBO — grade F

- independent answer: at least `1` and `2`
- stored key: `2`
- stored key comparison after adjudication: mismatch because cardinality is not one
- validity: V1 fail, V2 pass, V3 fail, V4 fail, V5 pass
- item content SHA-256: `4884babb9bfa5d6c92bf5ed67a2f1ec7aad80d9602f188366d0f56403fb42193`

site별 판정:

- (A) `called`는 의도 의미에 맞다. 그러나 `a gang calling the Ghetto Brothers`도 “Ghetto Brothers를 부르는 한 갱단”이라는 다른 의미의 문법적 분사구가 될 수 있다. 문맥상 열등하지만 순수 어법 오답으로는 안전하지 않다.
- (B) `which`가 맞고 `what`은 불가하다. 실제 선행사는 `a gang called the Ghetto Brothers`이며, `which`는 `is respected`의 주어다.
- (C) `will`은 미래의 서약을 나타내며 원문에 맞다. 그러나 `Never again do they use violence ...`도 문법적으로 완전한 단순현재 부정 도치다. 주변 서술이 `leaders ... sign`, `This is the Bronx`라는 역사적 현재이므로 문맥상으로도 배제되지 않는다.

따라서 `called - which - do`인 1과 `called - which - will`인 2가 모두 문법적으로 성립한다. 5도 (A)를 다른 의미로 허용하면 문법 형태 자체는 성립할 여지가 있다.

해설은 (B)의 선행사를 뒤에 놓인 `its free meal and medical care programs`라고 잘못 지목한다. 그 명사구는 `because of`의 목적어이고 관계대명사 뒤에 있으므로 선행사가 될 수 없다. 같은 해설의 오답 3 설명은 다시 `gang`을 선행사로 적어 내부적으로도 모순된다. (C)에서는 `do`를 어법상 틀렸다고 단정하지만 실제 차이는 문법성보다 시제·담화 선택이다. 이는 해설 문구 다듬기 문제가 아니라 정답 cardinality와 통사 분석이 함께 틀린 치명 결함이다.

## Blocker taxonomy

### `LPJ16-A-B01_NONUNIQUE_GRAMMAR_SITE`

- affected: `j9i10h`, `aiqijc`
- evidence: 합법적 분사 후치수식 재분석, `Never again do/will`의 복수 문법형
- production rule: “원문 복원형과 다르다”를 문법 오류로 간주하지 말고, 모든 후보의 대체 통사 분석과 시제 해석을 열거한 뒤 하나라도 합법적이면 site를 폐기한다.

### `LPJ16-A-B02_PASSAGE_OR_BLANK_SURFACE_CORRUPTION`

- affected: `vy6wtk`, `mjxpe6`, `uelp2h`, `j9i10h`, `1l55a0`
- evidence: 중복 문장, 탈락 문자, 붙은 문장, 고아 닫는 따옴표, `culture.DJs`
- production rule: 생성 전에 source admission gate, 생성 후 exact non-target preservation, blank 치환 전후 양방향 복원, 문장경계/인용부호 균형을 모두 hard fail로 둔다.

### `LPJ16-A-B03_UNINTENDED_UNGRAMMATICAL_DISTRACTOR`

- affected: `mjxpe6`
- evidence: `to spent`
- production rule: 의미 문항은 정답뿐 아니라 다섯 선지 각각을 독립 문법 검사하고, 의도하지 않은 비문이 하나라도 있으면 재생성이 아니라 해당 선지 국소 수정을 우선한다.

### `LPJ16-A-B04_EXPLANATION_SYNTACTIC_FALSEHOOD`

- affected: `j9i10h`, `1l55a0`, `aiqijc`; weaker unsupported-certainty instances in all three blanks
- evidence: alternate parse 누락, `ask`의 준사역/허용동사 오분류, 관계대명사 선행사 오지목, 문법적인 `do`를 비문 처리
- production rule: 해설은 선택된 parse tree, 선행사 span, 보문 형태, 대체 분석 배제 근거를 구조화해 생성하고 원문 문장과 다시 대조한다.

### `LPJ16-A-B05_FIELD_ROLE_DRIFT`

- affected: `vy6wtk`, `j9i10h`
- evidence: clean surroundingText와 고아 따옴표가 남은 visible blank 불일치; `(E).expression`에 표시형이 아닌 교정형 저장
- production rule: `displayExpression`, `errorExpression`, `correction` 역할을 분리하고 workbench/paper/scorer가 소비하는 모든 표면을 동일 fixture로 비교한다.

### `LPJ16-A-B06_NONCOMPETITIVE_DISTRACTOR_SET`

- affected: all 6
- evidence: 네 개의 노골적 극성 반전, 무관 사건 발명, 단일 표면단서, 문법적으로 살아남는 오답, 기계적인 one-error 조합
- production rule: 각 오답에 `source anchor`, `why tempting`, `single decisive flaw`를 요구한다. 정답만 다른 극성을 갖거나, 본문에 없는 actor/event를 발명하거나, 단일 단어로 즉시 제거되는 세트는 거부한다.

### `LPJ16-A-B07_WITHIN_PASSAGE_TARGET_REUSE`

- affected clusters: `mjxpe6` + `uelp2h`; `j9i10h` + `1l55a0`
- evidence: 같은 DJ 기술의 인접 문장을 두 번 빈칸화하고, 같은 `ask a friend to take` 포인트를 어법 두 유형에서 연속 재사용
- production rule: passage별 semantic target span, grammar point, governing token을 batch registry에 예약하고 중복/근접 재사용을 비용 없는 결정론 gate로 막는다.

## Required next gate

다음 생성 실험 전에 최소한 아래 회귀 fixture가 필요하다.

1. `Never again do/will they ...`를 둘 다 grammatical로 판정해 site를 거부한다.
2. `asked a friend taking ...`의 reduced-relative parse를 살아 있는 대안으로 검출한다.
3. `to spent` 같은 비문 오답을 의미 문항에서 hard fail한다.
4. blank 치환 후 인용부호 균형과 원문 역복원을 검사한다.
5. 관계대명사 해설이 실제 선행사 span을 가리키는지 검증한다.
6. 한 passage 안에서 동일 governing phrase/grammar point 재사용을 차단한다.

이 여섯 fixture가 실패하는 상태에서 새 API 표본을 늘리면 같은 결함의 관측 횟수만 늘고 원가만 소비한다.
