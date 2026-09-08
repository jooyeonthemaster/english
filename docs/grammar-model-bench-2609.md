# 어법 킬러 문항 3자 벤치 — Gemini 3.8 Flash · 3.7 Flash · Opus 5 vs 2027학년도 9월 모평 29번 (26-09-03)

> 정본. 작업장 `.tmp-grammar-bench-2609/`(생성물·심사 JSON·풀이 JSON·패킷·하네스 전부). 숫자는 전부 실측이며 출처 파일을 병기한다.

## 0. 결론

| 조 | 심사 n | 천장 대비 점수(5점) | 실물감 | 최상 자리 적중 | 정답 유효 | 미끼 무결 | 천장 | 거의근접 | 한단계↓ | 두단계↓ | 못쓸수준 | 1위 횟수 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Opus 5 에이전트** | 9 | **4.33** | 4.11 | **100%** | **100%** | **100%** | **56%** | 22% | 22% | 0 | 0 | **5/9** |
| Gemini 3.7 Flash 2회차 | 9 | 4.22 | 4.44 | 56% | 100% | 100% | 22% | 78% | 0 | 0 | 0 | 2/9 |
| Gemini 3.8 Flash 30k 예산 | 6 | 3.83 | 3.33 | 50% | 100% | 100% | 0 | 83% | 17% | 0 | 0 | 0 |
| Gemini 3.8 Flash 1회차(14k) | 9 | 3.56 | 3.67 | 56% | 89% | 100% | 0 | 78% | 11% | 0 | 11% | 1/9 |
| Gemini 3.8 Flash 2회차(14k) | 6 | 3.50 | 4.17 | 50% | 100% | 100% | 33% | 0 | 50% | 17% | 0 | 1/9 |
| Gemini 3.7 Flash 1회차 | 9 | 2.89 | 3.11 | 22% | 89% | **67%** | 0 | 44% | 22% | 22% | 11% | 1/9(공유 문항) |
| **평가원 실물 29번** | 3 | **2.67** | 2.67 | **100%** | 100% | 100% | 0 | 0 | 67% | 33% | 0 | 0/3 |

모델별 합산(런 구분 없이): **Opus 4.33(n9) > 3.8 Flash 30k 3.83(n6) > 3.7 Flash 3.56(n18) ≈ 3.8 Flash 14k 3.53(n15) > 실물 2.67(n3)**. **⚠ 이 표와 §0-1·§0-3 은 Claude 심사관 값이다 — §13 외부 심사(Gemini·GPT)에서 오푸스 우세와 실물 최하가 뒤집혔다. 품질 서열은 판정 불가로 정정.**

1. **오푸스 5 에이전트가 가장 좋다.** 9심사 중 천장 5회, 정답 무효·복수정답·단어 수 변화·문장 중복 0건. 지문 B는 심사관 3명 전원 5점(유일한 만장일치 천장).
2. **3.8 Flash는 3.7 Flash보다 좋지 않다 — 그리고 지금 프로덕션 예산에선 쓸 수 없다.** 품질 3.53 vs 3.56은 잡음이고, 14k 공유 예산에서 **6런 중 5런이 절단**(reasoning 토큰만 13,436~13,440)돼 파서(오답해설 4개 필요)가 전부 반려한다. 30k로 올리면 비용 2배($0.10/문항)·지연 100~170s, 그나마 지문 A는 **3회 연속 업스트림 오류**(finish=error, 토큰 0).
3. **평가원 실물 29번이 킬러 잣대에서 최하위인 이유는 정답 자리가 아니라 미끼다.** 심사관 3명 전원이 문항을 보기 전에 봉인한 「이 지문의 천장 자리」가 실물 정답 자리(`Listening to the needs of employees enable`)와 정확히 일치했다. 그러나 미끼 4개 중 dead 7/12 — `simply`(경쟁 형태 없음)·`maintaining`(of 가 강제)·`that`(선행사 인접) — 라 「정동사 밑줄 하나 찾기」로 붕괴한다는 판정. 이것은 평가원 29번이 애초 중난도 문항이라는 사실과 정합한다(잣대가 킬러다).
4. **블라인드 심사관 9명 중 실물을 알아본 사람은 0명.** 지문 A에서 3명 전원이 생성 문항을 평가원으로 지목했다(오푸스 1·제미나이 공통 문항 2).
5. **제미나이는 수렴한다.** 지문 A에서 3.7 1회차·3.7 2회차·3.8 1회차가 **바이트 단위로 동일한 문항**을 냈고, 3.8 2회차는 **평가원 실물과 정답 자리·오형이 정확히 같은** 문항(enable→enables, 미끼 that 공유)을 냈다. 지문 B에선 제미나이 5문항 중 4문항이 같은 `to balance` 자리를 골랐다.
6. **제미나이 공통 결함 = 단어 수 규칙 위반.** 지문 B에서 `to balance → balance/balancing`(2단어→1단어) 3건. 기출 140건 실측(정답 오형/원형 단어 수 100% 일치, `docs/grammar-generation-redesign.md` §10)을 어긴다. 프로덕션 킬러 v2 프롬프트엔 이 규칙이 없다(비킬러 프롬프트 v7엔 있음). 오푸스는 설계메모에서 같은 자리를 「to 를 지우면 단어 수가 줄어 답 자리에서 내린다」고 스스로 기각했다.

## 1. 설계

- **지문 3개** (`passages.json`): A = 9월 모평 **29번 원문**(163어, 실물과 정면 대결) · B = 30번 지문(174어, 복원본) · C = 33번 지문(163어, 복원본). 복원본은 `.tmp-mock-v4/passages.json`(`restore-forms.mjs` 산출, 어휘 정정 반영).
- **생성 조건 동일**: 프로덕션 킬러 레인의 프롬프트를 그대로 사용 — `buildGrammarKillerV2Prompt(passage)`(`src/lib/md-qgen/grammar-killer-v2.ts`)를 `build-prompts.ts`로 조립한 8.5KB 지시서. 제미나이는 프로덕션 md-stream과 같은 파라미터(user 단일 메시지·`max_tokens 14000`·`reasoning effort high`·temperature 미지정)로 OpenRouter 직접 호출(`or-gen.mjs`, `or-gen2.mjs`). 오푸스는 Claude Code 서브에이전트(model opus)에 같은 지시서 파일만 읽게 하고 다른 파일·검색 금지.
- **런 구성**: 3.7 Flash 2회차 × 3지문 = 6, 3.8 Flash 14k 2회차 × 3 = 6, 3.8 Flash 30k 1회차 × 3(A는 3회 오류로 결번) = 2, 오푸스 1회차 × 3 = 3, 실물 1 → 문항 **18개**(절단으로 문항 자체가 없는 3.8r2-B 제외).
- **심사(정본 잣대 = 재설계 문서 §13 「지문별 천장 대비」)**: 지문마다 심사관 3명(Opus 2 + Fable 1)이 ① 지문만 읽고 최상 자리를 **봉인 파일에 먼저 저장** → ② 문항 묶음(갑/을/병…, 결정론 셔플, 해설·설계메모 제거, 동일 문항은 한 코드로 병합)을 열어 정답 유효·미끼 무결·자리 깊이·미끼 4개 저울질·쌍둥이·누설·경계·배치·천장 대비·실물감·순위·**실물 지목**을 JSON으로 저장. 규약 `judge/RUBRIC.md`, 결과 `judge/J{1..3}-{A,B,C}.json`, 집계 `agg.py`.
- **해설 사실검증**(비블라인드): 지문별 Opus 1기가 해설·오답·설계메모·포인트 코드를 지문 실물과 대조(`judge/FACT-*.json`).
- **풀이**: 소넷 솔버가 문항당 2회, 「진지하게 검토한 선택지 수」 기록(`solve/`). 34런.
- **결정론 검사**(`check.mjs`): 마커 5·복원 일치·단어 수·문장 분산·정답 위치·밑줄 폭·공짜 칸.

## 2. 생성 런 원장 (`out/runs-summary.md`)

| 런 | 예산 | finish | 초 | reasoning 토큰 | 비용 $ | 문항 |
|---|---|---|---|---|---|---|
| 3.7 A/B/C 1회차 | 14k | stop×3 | 33 / 93 / 51 | 4,272 / 10,939 / 7,906 | 0.022 / 0.047 / 0.036 | 완전 |
| 3.7 A/B/C 2회차 | 14k | stop×3 | 43 / 70 / 54 | 5,298 / 5,491 / 7,993 | 0.026 / 0.027 / 0.036 | 완전 |
| 3.8 A/B/C 1회차 | 14k | **length / stop / length** | 123 / 108 / 132 | 13,436 / 11,341 / 13,440 | 0.056 / 0.049 / 0.056 | A·C 오답 절 소실 |
| 3.8 A/B/C 2회차 | 14k | **length×3** | 140 / 150 / 144 | 13,439 ×3 | 0.056 ×3 | A·C 오답 소실, **B는 문항 없음**(설계 잡담만 1,337자) |
| 3.8 A 30k·30k·24k | 30k | **error×3** | 160 / 115 / 126 | 0 | 0 | 없음 |
| 3.8 B/C 30k | 30k | stop×2 | 169 / 101 | 27,488 / 25,299 | 0.109 / 0.101 | 완전 |

- 3.7 Flash 평균 $0.032·57s, 절단 0/6. 3.8 Flash 14k 평균 $0.055·133s, 절단 5/6. 3.8 30k 평균 $0.105·135s.
- 프로덕션 md-stream은 `finish=length`를 「출력 예산 절단」으로 표식만 붙이고(`route.ts` O223) 파서의 `오답해설 N개 필요`가 반려 → 재생성. 3.8 Flash를 그대로 꽂으면 킬러 어법의 재생성률이 ~80%가 된다.
- 3.8 2회차 B는 사고를 content 채널에 쏟았다(「학생이 무엇으로 잘못 고치고 싶어지는가?」 항목이 본문에 노출된 채 절단). 절단 위험이 있는 모델은 설계메모 지시가 본문 폭주를 부른다.

## 3. 결정론 검사 (`out/check-summary.md`)

| 문항 | 정답 | 오형→원형 | 축 | 복원 일치 | 단어 수 | 문장 분산 | 정답 위치 | 결함 |
|---|---|---|---|---|---|---|---|---|
| 실물 | ③ | enable→enables | 수일치 | O | 163→163 | 5/5 | 문장5/9 | — |
| opus-A | ③ | enabling→enables | 정동사결손 | O | 163→163 | 5/5 | 문장5/9 | — |
| g37-A = g37r2-A = g38-A | ⑤ | are→is | 수일치 | O | 163→163 | 5/5 | 문장8/9 | 동일 문항 3회 |
| g38r2-A | ③ | enable→enables | 수일치 | O | 163→163 | 5/5 | 문장5/9 | 실물과 정답 동일 |
| opus-B | ⑤ | attempt→attempting | 정동사결손 | O | 174→174 | 5/5 | 문장7/7 | — |
| g37-B | ② | what→that | 접속사 | O | 174→174 | 5/5 | 문장3/7 | ③ `wave after wave of pests are` 논쟁 밑줄 |
| g37r2-B / g38-B / g38x30-B | ④ | balance·balancing→to balance | 목적격보어 | O | **174→173** | 5/5 | 문장6/7 | **단어 수 감소 3건** |
| opus-C | ⑤ | inspecting→inspects | 정동사결손 | O | 163→163 | 5/5 | 문장5/6 | — |
| g38-C / g38x30-C | ④/⑤ | inspecting→inspects | 정동사결손 | O | 163→163 | 5/5 | 문장5/6 | — |
| g37r2-C | ④ | inspecting→inspects | 정동사결손 | O | 163→163 | **4/5** | 문장5/6 | 같은 문장 밑줄 2개 |
| g37-C | ⑤ | is→would | 대동사 | O | 163→163 | 5/5 | 문장5/6 | 정답 유효 논쟁(§5) |
| g38r2-C | ④ | walked→walking | 병렬 | O | 163→163 | **4/5** | 문장5/6 | 같은 문장 밑줄 2개 |

공짜 칸(2단어+ 밑줄 재등장) 0건. 정답 ① 0건. 첫 문장 정답 0건.

## 4. 블라인드 심사 — 지문별 점수 매트릭스 (`judge/J*-*.json`)

| 지문 | 심사관 | 실물 | Opus | 3.7 1회차 | 3.7 2회차 | 3.8 1회차 | 3.8 2회차 | 3.8 30k | 1위 |
|---|---|---|---|---|---|---|---|---|---|
| A | J1(Opus) | 3 | **5** | 4* | 4* | 4* | 5 | — | Opus |
| A | J2(Opus) | 3 | 3 | 4* | 4* | 4* | **5** | — | 3.8 2회차 |
| A | J3(Fable) | 2 | 4 | **4*** | 4* | 4* | 3 | — | 제미나이 공통 |
| B | J1 | — | **5** | 2(복수정답) | 4 | 4 | 문항 없음 | 3 | Opus |
| B | J2 | — | **5** | 2(복수정답) | 4 | **1(무효)** | 문항 없음 | 4 | Opus |
| B | J3 | — | **5** | 3(복수정답) | 4 | 4 | 문항 없음 | 4 | Opus |
| C | J1 | — | **5** | **1(무효)** | 4 | 4 | 2 | 4 | Opus |
| C | J2 | — | 4 | 2 | **5** | 3 | 3 | 4 | 3.7 2회차 |
| C | J3 | — | 3 | 4 | **5** | 4 | 3 | 4 | 3.7 2회차 |

\* 지문 A의 3.7 1회차·3.7 2회차·3.8 1회차는 동일 문항이라 한 코드로 심사됐다(점수 공유).
지문별 모델 평균: **A** 3.7F 4.00 · 3.8F 4.17 · Opus 4.00 · 실물 2.67 / **B** 3.7F 3.17 · 3.8F 14k 3.00 · 3.8F 30k 3.67 · **Opus 5.00** / **C** 3.7F 3.50 · 3.8F 14k 3.17 · 3.8F 30k 4.00 · Opus 4.00.

미끼 등급 합산(문항당 4개 × 심사): 실물 dead 7/weak 4/live 1/strong 0 · Opus dead 5/weak 5/live 15/strong 11 · 3.7 1회차 dead 4/weak 6/live 16/strong 10 · 3.7 2회차 dead 2/weak 7/live 18/strong 9 · 3.8 1회차 dead 5/weak 8/live 15/strong 8.

## 5. 지문별 해부

### 5.1 지문 A — 실물 29번과의 정면 대결

- **봉인 판단 3/3 일치**: 세 심사관 모두 문항을 보기 전에 `Listening to the needs of employees ▶enables◀`(동명사 주어 + 복수 유인자 employees 인접, 왼쪽 5~6단어 되짚기, 오른쪽 단서 0)를 천장으로 봉인했다. 2순위는 `a leader's failure to empathize with talented workers ▶is◀`(전원 공통).
- **실물(을)**: 자리·오형 모두 천장인데 미끼가 비었다. J1: 「② simply 는 경쟁 형태가 사실상 없고 ④ maintaining 은 바로 왼쪽 of 가 동명사를 강제한다 … 실제로 저울질이 서는 칸은 ⑤ that 하나뿐」. J3: 「유일한 정동사 밑줄이 정답이라 문항이 〈동사 하나 찾기〉로 붕괴」. 세 명 모두 「쌍둥이 자리 `talented workers is`·`Utilized`·`themselves` 를 전부 버렸다」고 지적.
- **오푸스(정)**: 같은 자리를 잡되 오형을 `enabling`(정동사 결손)으로 올리고, 봉인 2순위(`is`)와 4순위(`Utilized`)를 미끼로 회수, 동형 -ing(`focusing`)까지 깔았다. J1 5점(천장): 「학생이 최상급 자리 두 곳을 되짚고도 정답이 아님을 확인하게 만든다」. 그러나 J2는 3점: 「enabling 은 밑줄 자체가 준동사라 학습자가 가장 먼저 의심하는 표지 … ⑤ is 가 같은 축의 옳은 예를 밑줄로 노출해 대조 경로를 연다」. **같은 문항이 5점과 3점 — 「정동사 결손이 수일치보다 깊다」는 §13 명제에 심사관 이견이 있다.**
- **제미나이 공통(갑, 3런 동일)**: 2순위 자리 `workers ▶are◀`를 정답으로. 미끼(known/approachable/what/themselves)는 dead 0으로 이 묶음 최고 품질이나 천장 자리를 밑줄 없이 흘려보냈다. J2·J3가 **이 문항을 평가원 실물로 지목**(확신 50·65) — 「5축이 고르게 흩어지고 dead 가 없는 평가원 전형」.
- **3.8 2회차(병)**: 실물과 정답 자리·오형 동일 + 미끼 `known/being/Utilized/that`. J1·J2 5점, J3 3점(쌍둥이 `is` 미사용).

### 5.2 지문 B — 오푸스 만장일치 천장

- 봉인 1순위 3/3 일치: `Immediately ▶attempting◀ to remove a new pest entirely from your garden will only further`(동명사 주어를 원형 attempt 로 → 명령문으로 읽혀 앞 6단어가 무흠, 정동사 will 까지 오른쪽 9~10단어). **오푸스만 이 자리를 잡았다**(5·5·5). 2순위 `pests ▶to balance◀ out`(allow 목적격보어, 지배어까지 8~9단어)을 strong 미끼로 회수.
- 제미나이 5문항 중 4문항이 2순위 `to balance`를 정답으로 썼고, 그중 3문항이 `balance`/`balancing`으로 **단어 수를 줄였다**. J2는 3.8 1회차의 `balancing`을 **정답 무효**로: 「`the annoying pests balancing out` 을 현재분사 후치수식(축약관계절)으로 읽으면 allow 는 명사구 목적어만 취하는 정상 용법 … 이의신청이 들어오면 방어할 논거가 없다」. `balance`(원형)를 쓴 두 문항은 무효 위험 0으로 판정.
- 3.7 1회차는 `remember ▶what◀`(오른쪽 5단어에 목적어)을 정답으로 하고 `wave after wave of pests ▶are◀`를 미끼로 걸어 **3/3 복수정답 위험**: 「of 구를 걷어내고 핵명사에 일치하는 수능 규칙으로는 wave after wave 단수 → is」. 사실검증도 이 오답 해설(「복수 주어」)을 major로 잡았다.
- J2의 실물 지목 「없음(65)」 근거: 「감탄부호·축약형 it's·문두 So 반복 — 평가원 편집을 통과한 지문이 아니다」. (맞다 — 이 지문은 어휘 문항 30번 지문이다.)

### 5.3 지문 C — 「the narrator inspecting」 수렴

- 봉인 1순위: J1·J3 `the narrator ▶inspects◀ the building … as would a real estate agent`(주절 정동사 삭제, 분사구 4개·as 도치절을 끝까지 읽어야 결손 확정, 33~38단어), J2는 `▶bringing◀`(분사구문→정동사).
- 6문항 중 4문항(오푸스·3.7 2회차·3.8 1회차·3.8 30k)이 `inspecting`을 정답으로 — 모델 무관 수렴. 갈린 것은 미끼: **3.7 2회차**가 옳은 정동사(`is`)와 옳은 -ing 두 개(`bringing`·`walking`)를 모두 깔아 J2·J3 5점(「죽은 미끼가 하나도 없는 유일한 문항」). 오푸스는 `capture`(조동사 옆 dead)·`proposed`(by 인접 weak)로 J2 4·J3 3(J1은 5).
- **3.7 1회차 `as ▶is◀ a real estate agent`(→would)**: J1 **무효** — 「`as is a real estate agent (walking from room to room)` 즉 진행형 술부 생략+도치로 읽히고 선접 단수 is 와 수일치까지 맞는다. 정답 근거가 문법 위반이 아니라 〈원문은 would 였다〉는 복원에 의존」. J2 2점(「대동사 회복 논쟁」+ ③⑤ 동일 어형 is 중복 밑줄). 사실검증은 유효로 봤다(pro-form be 는 lexical VP 를 대신할 수 없음). **논쟁 자리 = 출하 불가**가 이 캠페인의 규칙(재설계 §12.2 「다른 해석으로 성립하면 정답이 없는 문항」).
- **3.8 2회차 `and ▶walked◀`(→walking)**: J1 2점 「단서(entering)가 5단어 안이라 나열 붕괴가 즉시 보인다」. 게다가 `inspects … and walked` 정동사 등위로도 읽혀 사실검증 major.

## 6. 해설 사실검증 (`judge/FACT-*.json`)

critical(틀린 문법을 가르침·정답 무효) **전 문항 0**. major:

| 조 | major 건수 | 내용 |
|---|---|---|
| Opus | A1 · B0 · C2 = 3 | 단서 거리 6 vs 실측 5 / C 해설 「문장에 정동사가 하나도 남지 않는다」(When절 describes·as절 would 실재 — 「주절 정동사」로 한정했어야) / 거리 33 vs 38 |
| 3.7 1회차 | A0 · B1 · C0 = 1 | B 오답(C) 「복수 주어 wave after wave of pests」(핵 일치 규칙 역행) |
| 3.7 2회차 | B1 · C1 = 2 | 단어 수 감소 / 거리 28 vs 38 |
| 3.8 1회차 | A2 · B1 · C2 = 5 | 절단 2건 / 해설 「to부정사구의 수식을 받는 workers」(포함 관계 역전) / 단어 수 감소 / 거리 35 vs 39 |
| 3.8 2회차 | A1 · C3 = 4 | 절단 2건 / 「다른 통사 해석이 완전히 차단됨」 거짓(inspects and walked 등위) / would 에 수일치 코드 d 오배정 |
| 3.8 30k | B1 · C2 = 3 | 단어 수 감소 / trace 를 「동사원형」 오명명 / 거리 33 vs 38 |

**단서 거리 단어 수는 전 모델이 틀린다**(오푸스 포함). 설계메모의 거리 수치는 계기로 쓰지 말 것(과거 `cuedist.mjs` 폐기 결정과 정합).

## 7. 풀이 — 살아있는 선택지 (`solve/agg-solve.json`)

소넷 솔버 34런 **전 문항 정답률 100%**(포화 — 킬러 캠페인의 「LLM 으로 어법 난도 측정 불가」 재확인). 진지하게 검토한 선택지 수: 실물 1.50 · 오푸스 2.00 · 3.7 2.17/2.50 · 3.8 2.17/2.00/2.25. 변별 없음. 참고로만 둔다.

## 8. 실물 지목 (튜링)

9심사관 × 「이 묶음에 평가원 문항이 있다면?」: 지문 A(실물 포함) **적중 0/3** — J1→오푸스(40), J2→제미나이 공통(50), J3→제미나이 공통(65). 지문 B·C(실물 없음): 오푸스 2회·3.7 2회차 2회·「없음」 1회(J2-B, 지문 편집 흔적으로 정확히 추론). 근거는 한결같이 「5축 분산 + dead 미끼 없음 = 평가원식」인데, 실물 29번이 바로 그 기준에서 떨어졌다.

## 9. 판정과 운영 시사점

1. **3.8 Flash 도입 보류.** (a) 14k 예산에서 절단 5/6 → 재생성 폭주, (b) 30k에서도 지문 A 3연속 오류, (c) 비용 1.7~3.3배·지연 2.3배, (d) 그 대가로 얻는 품질 차이 0.03점(잡음). `ATLAS_PREMIUM_QGEN_MODEL_ID`는 3.7 유지.
2. **킬러 v2 프롬프트에 「단어 수 보존」 규칙 이식.** 제미나이 B 3/5 위반, 오푸스는 스스로 회피. v7(비킬러)의 문구(「오류는 형태를 바꾸는 것이지 단어를 넣거나 빼는 것이 아니다 … 140건 100%」)를 `grammar-killer-v2.ts` 검산 절에 추가하고, 파서 게이트에 정답 오형/원형 단어 수 불일치 반려를 넣으면 결정론으로 막힌다(`check.mjs`의 `answerWordDelta` 로직 그대로).
3. **논쟁 미끼 게이트 후보**: `X after X of Ys` 수일치 밑줄(3/3 복수정답 판정), 동일 어형 중복 밑줄(is·is). 기존 죽은 미끼 게이트 4신호에 없다.
4. **오푸스급이 필요한 건 「자리 조사」가 아니라 「미끼 회수」다.** 정답 자리는 제미나이도 4/6 지문에서 천장을 잡았다. 갈린 것은 2순위 자리를 미끼로 회수하고 동형 미끼를 까는 단계이며, 3.7 2회차 C(5·5·4)처럼 제미나이도 되는 날이 있다 — 분산이 크다(3.7 1회차 2.89 vs 2회차 4.22). n=1 생성으로 출하하는 현 구조에선 **하한 게이트**가 답이다(킬러 캠페인 결론과 동일).
5. **제미나이 문항 다양성 결여**: 같은 지문에 재생성해도 같은 문항이 나온다(A 3/4 동일, B 4/5 동일 자리). 「재생성 = 다른 문항」이라는 운영 가정은 어법 킬러에선 성립하지 않는다.

## 10. 계기 한계 (정직하게)

- **n이 작다**: 지문 3개·모델당 3~6문항·심사 9건. 조 간 0.3점 차이는 판정 불가(재설계 §12.2 「n=5는 판정 불가(±0.8)」). 확실한 것은 오푸스 > 제미나이(+0.8, 9/9 심사에서 오푸스가 3.7 1회차 이상)와 3.8 ≈ 3.7 뿐.
- **심사관이 전부 Claude 계열**(Opus 2·Fable 1). 블라인드이지만 오푸스 문항의 문체 선호가 섞였을 수 있다. 반증: J2-A는 오푸스에 3점(4개 중 공동 최하), J3-C 3점.
- **같은 문항에 5점과 3점**(오푸스 A)이 나왔다 — 「정동사 결손 vs 수일치」의 깊이 서열은 심사관 합의가 없다. §13.4-7의 「가장 깊은 축」 명제는 재검증 대상.
- **실물 29번은 킬러가 아니다.** 평가원 29번은 통상 중난도이고 이 벤치의 잣대는 「킬러 천장」이다. 실물 2.67은 「평가원이 못 만든다」가 아니라 「평가원은 미끼를 일부러 비운다」로 읽어야 한다. 다만 **정답 자리 선택은 평가원 = 심사관 봉인 = 오푸스 = 3.8 2회차**로 전원 일치했다는 사실은 잣대와 무관하게 남는다.
- 실물엔 해설이 없어 심사 패킷은 전 문항 해설을 제거했다(형식 통일). 해설 품질은 §6에서만 본다.
- 지문 B·C는 어법 문항용으로 편집된 지문이 아니다(30번 어휘·33번 빈칸). 감탄부호·축약형 등이 그대로다.
- 3.8 Flash 30k 지문 A 결번(3회 오류)은 원인 불명(OpenRouter `finish=error`, 업스트림 토큰 0). 재시도해도 같다.

## 11. 재현

```
node .tmp-grammar-bench-2609/or-gen.mjs                       # 3.7·3.8 × A/B/C, 14k
node .tmp-grammar-bench-2609/or-gen2.mjs x30 30000 g38 A,B,C  # 3.8 30k
npx tsx .tmp-grammar-bench-2609/build-prompts.ts               # 프로덕션 킬러 프롬프트 재조립
node .tmp-grammar-bench-2609/check.mjs                         # 결정론 검사
python .tmp-grammar-bench-2609/mkpackets.py                    # 블라인드 패킷(갑을병…)
python .tmp-grammar-bench-2609/agg.py                          # 심사 집계
python .tmp-grammar-bench-2609/aggsolve.py                     # 풀이 집계
```
오푸스 생성·심사·사실검증·풀이는 Claude Code Agent(문항 생성 opus 3기 · 심사 opus 6 + fable 3 · 사실검증 opus 3 · 풀이 sonnet 34). OpenRouter 호출은 사용자 지시 범위(3.7/3.8 생성)로 한정, 총 $0.99.

## 12. 2차 실험 — 3.8 Flash 를 살리려고 해 본 것 (26-09-03 후반)

사용자 요청 「3.8 Flash 를 잘 써볼 수 있도록 이것저것 시도」. 같은 3지문에 **6개 설정 × 3지문 = 18런 + 스트리밍 재시도 3런 = 21런, $0.56**(`or-sweep.mjs`, 원시 응답 `out/g38*.raw.json`). 심사는 1차와 같은 규약·같은 심사관 구성(지문당 Opus 2 + Fable 1), 패킷 `packets2/`, 결과 `judge2/`, 집계 `agg2.py 2`. 앵커로 오푸스(전 지문)와 실물(A)을 같은 패킷에 넣어 1차 척도와 맞췄다.

### 12.1 설정과 운영 결과

| 설정 | 프롬프트 | 사고 | 예산 | A | B | C | 절단/오류 |
|---|---|---|---|---|---|---|---|
| high·40k | 킬러 v2 | high | 40k | stop 208s 17.1k $0.070 | stop 130s 12.4k $0.053 | **504 timeout 226s** | 1/3 |
| high·40k 스트리밍 | 킬러 v2 | high | 40k | — | — | **504 timeout 233s** | 1/1 |
| medium·14k | 킬러 v2 | medium | 14k | stop 73s 5.6k $0.027 | stop 40s 5.0k $0.025 | **length 156s 13.4k** | 1/3 |
| low·14k | 킬러 v2 | low | 14k | stop 8s **0** $0.006 | stop 14s 0 $0.006 | stop 12s 0 $0.007 | 0/3 |
| 사고 8k 캡·14k | 킬러 v2 | max_tokens 8000 | 14k | stop 50s 3.7k $0.020 | stop 62s 4.6k $0.023 | **length 114s 13.4k(캡 무시)** | 1/3 |
| v7·medium | v7(자리 조사 선행) | medium | 14k | stop 78s 6.4k $0.032 | stop 79s 5.8k $0.030 | **length 66s 13.4k(문항 없음)** | 1/3 |
| v7·high 30k | v7 | high | 30k | stop 231s 22.3k $0.092 | **504 203s** | **504 161s** | 2/3 |
| v7·high 40k 스트리밍 | v7 | high | 40k | — | **504 211s** | **504 314s** | 2/2 |

확정된 사실:
- **high 효율은 약 200초를 넘는 순간 예외 없이 `504 Upstream idle timeout`** — 8회 중 8회(1차 A 3회 포함), 스트리밍(`stream:true`, 프로덕션과 동일)으로도 같다. 1차의 「지문 A 원인 불명 오류」는 이것이었다. 3.8 high 는 OpenRouter 경유로는 어려운 지문에서 **완주 자체가 불가능**하다.
- **`reasoning.max_tokens 8000` 캡을 3.8 은 지키지 않는다**(지문 C 13,441). effort medium 도 지문 C 에서는 13.4k 로 튀어 14k 예산을 절단한다. 사고량은 설정이 아니라 **지문 난도가 결정**하고, 지문 C 가 그 임계다.
- **low 는 사고 0토큰(thinking 완전 off)** — 8~14초·$0.006. 3.8 의 「low」는 3.7 의 low 와 다르게 무사고 모드다.

### 12.2 품질 (2차 심사 9건, 천장 대비 5점)

| 조 | A | B | C | 전체 | 정답 유효 | 천장 |
|---|---|---|---|---|---|---|
| **Opus 5 에이전트(앵커)** | 4.67 | 4.33 | 4.33 | **4.44** (n9) | 100% | 44% |
| **3.8F medium·14k** | 4.00 | 4.33 | 3.67 | **4.00** (n9) | 100% | 33% |
| 3.8F v7·high 30k | 4.00 | — | — | 4.00 (n3) | 100% | 0 |
| 3.8F 사고 8k 캡·14k | 4.00 | 3.33 | 3.00 | 3.44 (n9) | 89% | 11% |
| 3.8F v7·medium | 4.00 | 2.67 | — | 3.33 (n6) | 100% | 0 |
| 3.8F high·40k | 3.33 | 3.00 | — | 3.17 (n6) | 83% | 0 |
| 3.8F low(무사고) | 2.33 | 1.00 | 3.00 | **2.11** (n9) | **67%** | 0 |
| 평가원 실물(앵커) | 2.67 | — | — | 2.67 (n3) | 100% | 0 |

- **가장 좋은 3.8 설정은 medium·14k(4.00)** — 1차 3.7 Flash 평균 3.56(1회차 2.89·2회차 4.22)과 같은 띠에 있고, 오푸스(4.44)에는 못 미친다. 지문 B 에서 J2 가 5점(천장)을 줬으나 그 문항이 1차에서 J2 자신이 「정답 무효」로 판정한 `balancing` 오형과 같은 자리·같은 형태다(심사관 간·회차 간 편차 — §10 한계의 재확인). 지문 C 에선 절단.
- **v7 프롬프트는 3.8 을 살리지 못했다.** 1차 3.7 벤치에서 3.81 까지 올렸던 프롬프트인데 3.8 에서는 지문 B 가 봉인 상위 3자리를 모두 비켜 갔고(2.67), medium 에서도 지문 C 절단. 3.8 은 「자리 조사 선행」 지시를 받으면 사고가 더 길어져 절단 위험이 커진다.
- **high·40k 는 더 나쁘다(3.17)** — 지문 B 정답 `prolongs` 가 정동사 등위로 읽혀 J3 무효, `an area that existed` 미끼가 지문 내 무밑줄 `that` 과 대조돼 공짜 칸. 사고를 많이 시킬수록 좋아지지 않았다.
- **low(무사고)는 못 쓴다(2.11)** — 지문 B 는 `wave after wave of pests is`(규범상 오히려 정당)를 정답으로 지정해 3/3 무효, 지문 A 는 `to [connect]` 처럼 to 를 밖에 두고 동사만 밑줄 치는 경계 파손 + `feel hearing`(사역 옆 즉답형). 사실검증 critical 1(2차 전체 유일).
- 정답 유효·복수정답 위험이 3.8 설정 전반에 남아 있다: low B 3/3 무효, high·40k B 1/3, 8k 캡 B 1/3. 오푸스는 0.
- 실물 지목: 지문 A 심사관 3명 **또 0/3**(J1·J2→high·40k, J3→v7·medium). 두 라운드 합계 **0/6**.

### 12.3 「3.8 Flash = Opus 5 급」 인가

이 과제·이 프롬프트·이 심사 잣대에서는 **아니다.** 최선 설정(medium·14k)이 오푸스와 0.44점 차이(9심사 중 오푸스가 3.8 medium 이상인 것이 7건), 3.7 Flash 와는 구별되지 않는다. 그리고 3.8 이 사고를 많이 할수록 좋아지지 않고(high·40k 3.17 < medium 4.00), 사고량을 밖에서 통제할 수도 없다(캡 무시·200초 504). 오푸스와의 차이는 §9-4 그대로 「미끼 회수」에서 난다 — 3.8 medium 의 dead 미끼 3/36 대 오푸스 1/36 은 비슷하나, 봉인 최상 자리 적중률 44% 대 67%, 무효·논쟁 자리 회피에서 갈린다.

### 12.4 그래도 3.8 을 쓰려면

1. `reasoning.effort = "medium"`, `max_tokens 14000` 유지 — 3.7 과 같은 예산·비용($0.025~0.03)·지연(40~80s)에서 같은 품질. **단 어려운 지문에서 1/3 절단**은 남으므로 절단 시 3.7 폴백이 필요하다.
2. high 는 어떤 예산·스트리밍이든 금지(504). low 는 금지(무사고 = 무효 문항).
3. 단어 수 보존 규칙·논쟁 미끼(`X after X`) 게이트는 모델과 무관하게 필요(§9-2·3) — 3.8 medium 도 지문 B 에서 `balancing` 을 냈다.
4. 결론은 1차와 같다: **모델 교체로 얻을 것이 없고, 프롬프트 규칙 2줄 + 게이트가 훨씬 싸다.**

## 13. 심사관 편향 검증 — 같은 패킷을 제미나이·GPT 에게 블라인드로 (26-09-03 후반)

사용자 지적: 「평가자가 클로드(오푸스)라 자기 채점 아니냐」. 맞는 의심이었다. §4·§12 와 **동일한 패킷·동일한 규약**을 외부 모델 3종에 다시 심사시켰다 — Gemini 3.8 Flash, Gemini 3.7 Flash(둘 다 medium), GPT-5.6-luna. 봉인 2단계는 호출 2회로 재현(1회: 지문만 → 봉인, 2회: 지문+봉인+문항 → JSON). 하네스 `or-judge.mjs`, 결과 `judgeX/`(1차 패킷)·`judgeX2/`(2차 패킷), 비교 `compare-judges.py`. 외부 심사 20회 ≈ $0.37. 심사관당 패킷 1회라 외부 n 은 계열별 3(지문 3개)이다 — Claude 의 9 보다 작다.

### 13.1 결과 — 오푸스 1위는 Claude 심사관에서만 나온다

| 라운드 1 (실물·오푸스·3.7·3.8 문항) | Claude 3인 (n9) | Gemini 3.8 (n3) | Gemini 3.7 (n3) | GPT-luna (n3) | 외부 합산 |
|---|---|---|---|---|---|
| Opus 5 | **4.33** (1위 5) | 4.00 | 3.30 | 3.67 | 3.66 (4위) |
| 3.7F 2회차 | 4.22 | 4.33 | 3.27 | 3.00 | 3.60 |
| 3.8F 30k | 3.83 | 3.50 | 3.50 | 3.00 | 3.33 |
| 3.8F 1회차 | 3.56 | **4.67** | 3.93 | 2.50 | 3.85 (2위) |
| 3.8F 2회차 | 3.50 | 2.50 | **4.65** | 4.00 | 3.72 |
| 3.7F 1회차 | 2.89 | 3.33 | 2.60 | 1.50 | 2.60 (최하) |
| 평가원 실물 | 2.67 | 3.00 | 3.60 | **5.00** | **3.87 (1위)** |

| 라운드 2 (3.8 설정 스윕) | Claude 3인 | Gemini 3.8 | Gemini 3.7 | GPT-luna | 외부 합산 |
|---|---|---|---|---|---|
| Opus 5 | **4.44** (1위 7) | 3.67 | 4.00 | 3.00 | 3.56 (5위) |
| 3.8F medium·14k | 4.00 | 4.00 | 3.67 | 3.67 | 3.78 (2위) |
| 3.8F high·40k | 3.17 | 4.50 | 4.00 | 4.00 | **4.17 (1위)** |
| 3.8F 8k 캡 | 3.44 | 3.33 | 3.33 | 4.33 | 3.67 |
| 3.8F v7·high | 4.00 | 3.00 | 3.00 | 4.00 | 3.33 |
| 3.8F v7·medium | 3.33 | 1.50 | 1.50 | 3.50 | 2.17 |
| 3.8F low(무사고) | 2.11 | 1.33 | 1.67 | 1.33 | **1.44 (최하)** |
| 평가원 실물 | 2.67 | 3.00 | 4.00 | 4.00 | 3.67 |

문항 단위 점수 상관(같은 문항에 대한 계열 평균끼리): Claude–Gemini 3.8 **r=0.64/0.58**, Claude–GPT 0.27/0.35, Claude–Gemini 3.7 **−0.04**/0.48. 심사관 계열 간 합의가 낮다.

### 13.2 무엇이 뒤집혔고 무엇이 살아남았나

**뒤집힌 것**
1. **「오푸스 > 제미나이 +0.8」은 Claude 심사관의 산물이다.** 외부 합산에서 오푸스는 1차 4위(3.66)·2차 5위(3.56)로 3.8 Flash 문항들과 같은 띠다. §0-1·§9-4·§12.3 의 「오푸스 우세」 결론은 **철회**한다. 지문 B 의 「오푸스 만장일치 천장」도 외부에선 G38·LUNA 만 1위, G37 은 3.8 1회차를 1위로 봤다.
2. **실물 29번 최하위도 Claude 심사관의 산물이다.** 외부 합산 1차 **1위(3.87)**, GPT-luna 는 5점(천장). 「미끼가 비어 문항이 붕괴한다」는 Claude 판정을 외부 심사관은 그만큼 감점하지 않았다. §0-3 은 「Claude 계열 잣대에서 최하」로 한정한다.
3. **3.8 Flash 심사관은 3.8 Flash 문항을 최고로 본다**(1차 3.8 1회차 4.67·2차 high·40k 4.50). 자기 선호는 오푸스만의 문제가 아니라 **모든 모델 심사관의 문제**다. 그래서 「제미나이로 심사」도 정답이 아니다 — 심사관 3계열 합산 또는 제3사(GPT)만이 그나마 중립이다.

**살아남은 것(전 심사관 계열 일치)**
1. **3.8 low(무사고)는 못 쓴다** — 4계열 전부 최하(1.33~2.11), 정답 유효 33~67%.
2. **3.7 1회차 문항의 무효·논쟁 자리**(`wave after wave of pests are` 미끼, `as is a real estate agent` 정답)는 외부에서도 잡혔다(유효 50~67%). 정답 유효성 판정은 심사관 계열과 무관하게 일치한다.
3. **3.8 ≈ 3.7** — 어느 계열도 3.8 이 3.7 보다 체계적으로 낫다고 보지 않았다(Gemini 3.8 심사관만 예외, 자기 문항).
4. **3.8 medium·14k 가 가장 안정적** — 4계열 모두 3.67~4.00(편차 최소). 운영상 결함(절단 1/3·504)은 심사와 무관한 실측이라 그대로다.
5. **운영 결론은 바뀌지 않는다**: 3.8 도입 보류(§9-1·§12.4)는 품질이 아니라 **예산·타임아웃·재생성률**로 결정된 것이고, 그 근거는 심사관과 무관하다.

### 13.3 정정된 결론

- 품질 서열: **판정 불가**. 심사관 계열마다 1위가 다르고(Claude→오푸스, G3.8→3.8, G3.7→3.8 2회차, GPT→실물), 문항 단위 상관 0.0~0.6, 계열당 n=3. 「오푸스 5 급인가」에 대한 정직한 답은 「이 계기로는 오푸스와 3.8 을 가를 수 없다」이다.
- 확실한 것만 남긴다: ① 3.8 은 프로덕션 예산·게이트웨이에서 완주가 안 된다(§2·§12.1) ② low 는 무효 문항을 낸다 ③ 단어 수 보존 규칙·논쟁 미끼 게이트는 모델과 무관하게 필요하다 ④ 제미나이는 재생성해도 같은 문항을 낸다.
- **계기 교훈(재발 금지)**: 모델 비교 벤치의 심사관은 **비교 대상 모델 계열을 전부 배제하거나 전부 포함**해야 한다. 이번 1·2차는 Claude 만 썼고, 그 결과 오푸스 +0.8 이라는 가짜 격차를 정본에 적었다가 사용자 지적으로 철회했다. [[grammar-redesign-2608]] §13 의 「Opus 천장 4.94~5.00」도 Opus 심사관이 매긴 값이라 같은 의심을 받아야 한다.

## 14. 잣대 보정 — 평가원 기출 어법 40문항을 같은 규약으로 (26-09-03 후반)

사용자 요청 「DB의 기출 어법 문제들로 평가」. 목적은 두 가지 — ① 이 규약(킬러 천장 대비)이 **금표준(평가원 실물)** 에 어떤 점수를 주는지 보정하고, ② 심사관 3계열이 같은 금표준을 얼마나 다르게 매기는지 재는 것.

**표본** `gichul/KEY.json`: 평가원 40문항 = 수능 13 · 6월 14 · 9월 13 (2005~2027학년도). 밑줄 폭 정확 4(forms 파일: 2026_06·2026_09·2027_06·2027_09) + 근사 36(`problems.json` 5단어 앵커 → 첫 1~2단어, 정답 자리·오형은 `gichul-pairs.json` diff 로 정확). 근사 문항은 심사관에게 「경계 항목 평가 제외」를 지시. 앵커가 지문에 1회 매칭되지 않은 6문항·미복원 2문항 제외. 빌더 `gichul/build.py`.
**심사** 문항당 단일 패킷(비교 대상 없음, 코드 갑), 봉인 2단계 동일. Claude(Opus) 40기 · Gemini 3.7(medium) 40 · GPT-5.6-luna 40(외부 80쌍 $0.86). 결과 `gichul/judge/`, `gichul/judgeX/`, 집계 `gichul/agg.py`.

### 14.1 금표준에 대한 계열별 점수

| 심사관 | n | 평균 | 중앙 | 분포 1/2/3/4/5 | 최상 자리 적중 | 정답 유효 | 천장 | 거의근접 | 1↓ | 2↓ | 못쓸 | 미끼 dead |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Claude(Opus) | 40 | **3.58** | 4 | 0/5/13/16/6 | 32% | **100%** | 15% | 40% | 32% | 12% | 0 | 10% |
| Gemini 3.7 | 40 | **4.30** | 4 | 0/0/5/18/17 | 35% | **100%** | 35% | 25% | 35% | 5% | 0 | 0% |
| GPT-luna | 39 | **3.36** | 3 | 4/8/8/8/11 | 33% | **92%** | 33% | 13% | 26% | 21% | 8% | 19% |

문항 단위 상관: **Claude–Gemini 3.7 r=0.75**, Claude–GPT 0.23, Gemini–GPT 0.36.
최상 자리 적중 시 vs 미적중 시 평균: Claude 4.38 vs 3.19 · Gemini 5.00 vs 3.92 · GPT 4.62 vs 2.73.
세 계열 모두 봉인 천장 = 평가원 정답 자리였던 문항 7개: 2010 수능 · 2012 수능 · 2015 수능 · 2023 9월 · 2024 6월 · 2026 수능 · **2027 9월**.
Claude 기준 시대별 3.62(~2015) / 3.67(2016~21) / 3.69(2022~27) — 평평. 시험별 수능 3.83(적중 50%) > 9월 3.62 > 6월 3.54.

### 14.2 보정에서 확정된 것

1. **규약은 금표준에서 안정적으로 작동한다(Claude·Gemini).** 정답 유효 40/40, 미끼 무결 40/40, 「못쓸수준」 0. 평가원 문항은 킬러 잣대에서 **평균 「거의근접~한단계아래」(3.6)** 에 놓이고, 정답 자리가 심사관 봉인 천장과 같으면 +1.2점 뛴다. 즉 이 잣대의 3.5~3.7은 「평가원 평균급」이다.
2. **평가원은 모델이 고른 「천장 자리」를 3번에 1번만 쓴다**(3계열 일치 32~35%). 나머지 2/3는 더 얕은 자리를 정답으로 두고 깊은 자리를 미끼로 소비하거나 비워 둔다(2027_06: 1순위 `Allowed … were used` 를 미끼로, `styles what were` 정답 / 2020 수능: 1·2순위 둘 다 미끼). 「최상 자리 적중」은 **킬러성** 지표이지 **평가원다움** 지표가 아니다.
3. **심사관 계열 간 절대 수준이 다르다.** 같은 40문항에 Gemini는 Claude보다 +0.7, GPT는 −0.2이며 GPT는 분산이 가장 크다(1점 4건·5점 11건). **절대 점수의 계열 간 비교는 무의미**하고 계열 안에서만 비교해야 한다.
4. **GPT-luna는 금표준 정답을 8% 「무효」로 판정했다**(2010 수능 `to place`·2018 수능 `what→whether`·2023 수능 `them→themselves`) — 평가원 정답이 무효일 리 없으므로 이것은 심사관의 오탐률이다. §13에서 GPT-luna가 낸 생성 문항 무효 판정(low 설정 등)은 이 오탐률을 감안해 읽어야 한다. Claude·Gemini 오탐 0.
5. **Claude–Gemini 3.7 은 금표준에서 r=0.75로 합의한다**; GPT-luna는 둘 모두와 약하게만 상관한다(0.23·0.36). §13의 「외부 심사가 뒤집었다」는 결론 중 **GPT-luna 축은 가장 잡음 큰 심사관의 값**이었고, Gemini 3.8 축은 자기 문항 선호였다. 남는 신뢰 가능한 외부 축은 Gemini 3.7 하나이며, 그 축에서도 1차 오푸스는 1위가 아니었다(3.30, 4위) — **품질 서열 판정 불가**라는 §13.3 결론은 유지된다.
6. **같은 Claude 잣대로 놓으면**: 평가원 40 평균 3.58 · 오푸스 생성 4.33 · 3.7F 3.56 · 3.8F 3.53 · **2027_09 실물 3(단일)/2.67(비교)**. 제미나이 생성물은 평가원 평균과 같은 띠이고, 오푸스는 그 위이나 이것은 Claude 심사관 값(§13). 2027학년도 9월 29번은 40문항 중 하위 30%(2점 5건·3점 13건 중 하나)이며, 같은 해 6월(2점)이 더 낮다.
7. **미끼**: 평가원 40문항 중 Claude 기준 dead 미끼 0개가 29문항, 2개 이상은 4문항뿐. 2027_09(dead 2)는 드문 쪽이다 — 「평가원은 미끼를 일부러 비운다」(§10)는 일반화는 과했다. 평가원 미끼는 대체로 살아 있고, 정답 자리를 얕게 두는 쪽으로 난도를 조절한다.

### 14.3 한계
- 근사 밑줄 36문항: 밑줄 시작 위치·오형은 정확하나 폭은 첫 1~2단어 근사. 경계 항목을 제외시켰지만 미끼 저울질 판정에 폭이 영향을 줄 수 있다. 정확 4문항(3.00)이 근사(3.64)보다 낮은데 n=4라 판정 불가(전부 2026~27 최신 문항이라 시대 효과와 분리 안 됨).
- 심사관당 문항 1회(n=1). 같은 문항을 3회 매기면 ±1 흔들리는 것을 §5.1(오푸스 A 5점/3점)에서 봤다.
- 단일 패킷(비교 대상 없음)과 §4·§12의 비교 패킷은 형식이 달라 절대 점수를 그대로 잇지 못한다(2027_09: 단일 3 vs 비교 2.67).

## 부록 — 문항 전문

### 지문 A — 9월 모평 29번 원문

**평가원 실물 29번** — 정답 ③ (enable → enables)

> Leaders come in all shapes and sizes, but successful leaders tend to have one thing in common: the ability to share someone else’s feelings, known as empathy. While empathy forms in everyone to some degree, effective leaders know how to develop this emotional guidance system **① to connect** with others’ feelings and perspectives. However, empathy in leaders is more than **② simply** being kind to employees, clients, and customers. Empathetic people seem more approachable, focusing on the words of others. Listening to the needs of employees **③ enable** leaders to clearly identify what makes them feel heard. Utilized in this way, empathy can be considered a crucial part of **④ maintaining** employee satisfaction. Leaders who are unable to surround themselves with competent employees will not be successful. Indeed, a leader’s failure to empathize with talented workers is one of the main situations **⑤ that** could lead them to leave an organization. In this case, the organization must spend precious time and money to find suitable replacements for them.

**Opus 5 에이전트** — 정답 ③ (enabling → enables)

> Leaders come in all shapes and sizes, but successful leaders tend to have one thing in common: the ability to share someone else’s feelings, known as empathy. While empathy forms in everyone to some degree, effective leaders know **① how** to develop this emotional guidance system to connect with others’ feelings and perspectives. However, empathy in leaders is more than simply being kind to employees, clients, and customers. Empathetic people seem more approachable, **② focusing** on the words of others. Listening to the needs of employees **③ enabling** leaders to clearly identify what makes them feel heard. **④ Utilized** in this way, empathy can be considered a crucial part of maintaining employee satisfaction. Leaders who are unable to surround themselves with competent employees will not be successful. Indeed, a leader’s failure to empathize with talented workers **⑤ is** one of the main situations that could lead them to leave an organization. In this case, the organization must spend precious time and money to find suitable replacements for them.

**Gemini 3.7 Flash 1회차** — 정답 ⑤ (are → is)

> Leaders come in all shapes and sizes, but successful leaders tend to have one thing in common: the ability to share someone else’s feelings, **① known** as empathy. While empathy forms in everyone to some degree, effective leaders know how to develop this emotional guidance system to connect with others’ feelings and perspectives. However, empathy in leaders is more than simply being kind to employees, clients, and customers. Empathetic people seem more **② approachable**, focusing on the words of others. Listening to the needs of employees enables leaders to clearly identify **③ what** makes them feel heard. Utilized in this way, empathy can be considered a crucial part of maintaining employee satisfaction. Leaders who are unable to surround **④ themselves** with competent employees will not be successful. Indeed, a leader’s failure to empathize with talented workers **⑤ are** one of the main situations that could lead them to leave an organization. In this case, the organization must spend precious time and money to find suitable replacements for them.

**Gemini 3.7 Flash 2회차** — 정답 ⑤ (are → is)

> Leaders come in all shapes and sizes, but successful leaders tend to have one thing in common: the ability to share someone else’s feelings, **① known** as empathy. While empathy forms in everyone to some degree, effective leaders know how to develop this emotional guidance system to connect with others’ feelings and perspectives. However, empathy in leaders is more than simply being kind to employees, clients, and customers. Empathetic people seem more **② approachable**, focusing on the words of others. Listening to the needs of employees enables leaders to clearly identify **③ what** makes them feel heard. Utilized in this way, empathy can be considered a crucial part of maintaining employee satisfaction. Leaders who are unable to surround **④ themselves** with competent employees will not be successful. Indeed, a leader’s failure to empathize with talented workers **⑤ are** one of the main situations that could lead them to leave an organization. In this case, the organization must spend precious time and money to find suitable replacements for them.

**Gemini 3.8 Flash 1회차(14k, 절단)** — 정답 ⑤ (are → is)

> Leaders come in all shapes and sizes, but successful leaders tend to have one thing in common: the ability to share someone else’s feelings, **① known** as empathy. While empathy forms in everyone to some degree, effective leaders know how to develop this emotional guidance system to connect with others’ feelings and perspectives. However, empathy in leaders is more than simply being kind to employees, clients, and customers. Empathetic people seem more **② approachable**, focusing on the words of others. Listening to the needs of employees enables leaders to clearly identify **③ what** makes them feel heard. Utilized in this way, empathy can be considered a crucial part of maintaining employee satisfaction. Leaders who are unable to surround **④ themselves** with competent employees will not be successful. Indeed, a leader’s failure to empathize with talented workers **⑤ are** one of the main situations that could lead them to leave an organization. In this case, the organization must spend precious time and money to find suitable replacements for them.

**Gemini 3.8 Flash 2회차(14k, 절단)** — 정답 ③ (enable → enables)

> Leaders come in all shapes and sizes, but successful leaders tend to have one thing in common: the ability to share someone else’s feelings, **① known** as empathy. While empathy forms in everyone to some degree, effective leaders know how to develop this emotional guidance system to connect with others’ feelings and perspectives. However, empathy in leaders is more than simply **② being** kind to employees, clients, and customers. Empathetic people seem more approachable, focusing on the words of others. Listening to the needs of employees **③ enable** leaders to clearly identify what makes them feel heard. **④ Utilized** in this way, empathy can be considered a crucial part of maintaining employee satisfaction. Leaders who are unable to surround themselves with competent employees will not be successful. Indeed, a leader’s failure to empathize with talented workers is one of the main situations **⑤ that** could lead them to leave an organization. In this case, the organization must spend precious time and money to find suitable replacements for them.


### 지문 B — 9월 모평 30번 지문

**Opus 5 에이전트** — 정답 ⑤ (attempt → attempting)

> There **① is** good news about pests and medicinal herbs: Most herbs either repel pests or attract beneficial insects that help keep pest populations in check. So the more herbs you grow, the more you will attract pollinators and “good” bugs that like to eat the more destructive pests, **② which** will lead to a more successful garden! When it comes to managing pests in the garden, it’s important to remember **③ that** you are altering the ecosystem of an area that existed on its own before you planted anything into it. So the first couple years in a new garden can feel like wave after wave of pests are overtaking your plants. This is normal. The goal of a long-term healthy garden is to work with the environment you are trying to cultivate to allow the plants, pollinators, and even the annoying pests **④ to balance** out. Immediately **⑤ attempt** to remove a new pest entirely from your garden will only further these initial imbalances and prolong the process of helping your garden grow better on its own.

**Gemini 3.7 Flash 1회차** — 정답 ② (what → that)

> There is good news about pests and medicinal herbs: Most herbs either repel pests or attract beneficial insects that help **① keep** pest populations in check. So the more herbs you grow, the more you will attract pollinators and “good” bugs that like to eat the more destructive pests, which will lead to a more successful garden! When it comes to managing pests in the garden, it’s important to remember **② what** you are altering the ecosystem of an area that existed on its own before you planted anything into it. So the first couple years in a new garden can feel like wave after wave of pests **③ are** overtaking your plants. This is normal. The goal of a long-term healthy garden is to work with the environment you are trying to cultivate to allow the plants, pollinators, and even the annoying pests **④ to balance** out. Immediately attempting to remove a new pest entirely from your garden will only further these initial imbalances and **⑤ prolong** the process of helping your garden grow better on its own.

**Gemini 3.7 Flash 2회차** — 정답 ④ (balance → to balance)

> There is good news about pests and medicinal herbs: Most herbs either repel pests or attract beneficial insects that help **① keep** pest populations in check. So the more herbs you grow, the more you will attract pollinators and “good” bugs that like to eat the more destructive pests, **② which** will lead to a more successful garden! When it comes to managing pests in the garden, it’s important to remember that you are altering the ecosystem of an area that **③ existed** on its own before you planted anything into it. So the first couple years in a new garden can feel like wave after wave of pests are overtaking your plants. This is normal. The goal of a long-term healthy garden is to work with the environment you are trying to cultivate to allow the plants, pollinators, and even the annoying pests **④ balance** out. Immediately attempting to remove a new pest entirely from your garden will only further these initial imbalances and **⑤ prolong** the process of helping your garden grow better on its own.

**Gemini 3.8 Flash 1회차(14k, 절단)** — 정답 ④ (balancing → to balance)

> There is good news about pests and medicinal herbs: Most herbs either repel pests or attract beneficial insects that help **① keep** pest populations in check. So the more herbs you grow, the more you will attract pollinators and “good” bugs that like to eat the more destructive pests, **② which** will lead to a more successful garden! When it comes to **③ managing** pests in the garden, it’s important to remember that you are altering the ecosystem of an area that existed on its own before you planted anything into it. So the first couple years in a new garden can feel like wave after wave of pests are overtaking your plants. This is normal. The goal of a long-term healthy garden is to work with the environment you are trying to cultivate to allow the plants, pollinators, and even the annoying pests **④ balancing** out. Immediately attempting to remove a new pest entirely from your garden will only further these initial imbalances and **⑤ prolong** the process of helping your garden grow better on its own.

**Gemini 3.8 Flash 2회차(14k, 절단)** — 절단으로 문항 없음(설계메모만 출력)

**Gemini 3.8 Flash(30k 예산)** — 정답 ④ (balance → to balance)

> There is good news about pests and medicinal herbs: Most herbs either repel pests or attract beneficial insects that help keep pest populations in check. So the more herbs you grow, the more you will attract pollinators and “good” bugs that like to eat the more destructive pests, **① which** will lead to a more successful garden! When it comes to managing pests in the garden, it’s important to remember **② that** you are altering the ecosystem of an area that existed on its own before you planted anything into it. So the first couple years in a new garden can **③ feel** like wave after wave of pests are overtaking your plants. This is normal. The goal of a long-term healthy garden is to work with the environment you are trying to cultivate to allow the plants, pollinators, and even the annoying pests **④ balance** out. Immediately attempting to remove a new pest entirely from your garden will only **⑤ further** these initial imbalances and prolong the process of helping your garden grow better on its own.


### 지문 C — 9월 모평 33번 지문

**Opus 5 에이전트** — 정답 ⑤ (inspecting → inspects)

> While a picture transports the spectator almost instantly into a landscape, language can only describe it detail by detail, **① bringing** it slowly into the reader’s mind. How can a literary work **② capture** the feel of a place in both its atmosphere and its topography without losing the reader in a descriptive forest? One solution, **③ proposed** by Balzac, is to tie description to a moving body. Balzac’s novels open with detailed portrayals of the setting, but the descriptions never threaten the reader’s sense of orientation because **④ they** trace a precise path through the fictional world. When the novel describes a house, the narrator **⑤ inspecting** the building in a systematic manner, approaching it from the street, examining the garden and the front, entering through the main door, and walking from room to room, as would a real estate agent or a prospective resident. The reader ends up with a precise notion of the layout of the building, all the way down to the floor plan.

**Gemini 3.7 Flash 1회차** — 정답 ⑤ (is → would)

> While a picture transports the spectator almost instantly into a landscape, language can only describe it detail by detail, **① bringing** it slowly into the reader’s mind. How can a literary work capture the feel of a place in both its atmosphere and its topography without **② losing** the reader in a descriptive forest? One solution, proposed by Balzac, **③ is** to tie description to a moving body. Balzac’s novels open with detailed portrayals of the setting, but the descriptions never threaten the reader’s sense of orientation because **④ they** trace a precise path through the fictional world. When the novel describes a house, the narrator inspects the building in a systematic manner, approaching it from the street, examining the garden and the front, entering through the main door, and walking from room to room, as **⑤ is** a real estate agent or a prospective resident. The reader ends up with a precise notion of the layout of the building, all the way down to the floor plan.

**Gemini 3.7 Flash 2회차** — 정답 ④ (inspecting → inspects)

> While a picture transports the spectator almost instantly into a landscape, language can only describe it detail by detail, **① bringing** it slowly into the reader’s mind. How can a literary work capture the feel of a place in both its atmosphere and its topography without losing the reader in a descriptive forest? One solution, proposed by Balzac, **② is** to tie description to a moving body. Balzac’s novels open with detailed portrayals of the setting, but the descriptions never threaten the reader’s sense of orientation because **③ they** trace a precise path through the fictional world. When the novel describes a house, the narrator **④ inspecting** the building in a systematic manner, approaching it from the street, examining the garden and the front, entering through the main door, and **⑤ walking** from room to room, as would a real estate agent or a prospective resident. The reader ends up with a precise notion of the layout of the building, all the way down to the floor plan.

**Gemini 3.8 Flash 1회차(14k, 절단)** — 정답 ④ (inspecting → inspects)

> While a picture transports the spectator almost instantly into a landscape, language can only describe it detail by detail, **① bringing** it slowly into the reader’s mind. How can a literary work capture the feel of a place in both its atmosphere and its topography without losing the reader in a descriptive forest? One solution, **② proposed** by Balzac, is to tie description to a moving body. Balzac’s novels open with detailed portrayals of the setting, but the descriptions never **③ threaten** the reader’s sense of orientation because they trace a precise path through the fictional world. When the novel describes a house, the narrator **④ inspecting** the building in a systematic manner, approaching it from the street, examining the garden and the front, entering through the main door, and walking from room to room, as would a real estate agent or a prospective resident. The reader ends up with a **⑤ precise** notion of the layout of the building, all the way down to the floor plan.

**Gemini 3.8 Flash 2회차(14k, 절단)** — 정답 ④ (walked → walking)

> While a picture transports the spectator almost instantly into a landscape, language can only describe it detail by detail, **① bringing** it slowly into the reader’s mind. How can a literary work capture the feel of a place in both its atmosphere and its topography without losing the reader in a descriptive forest? One solution, **② proposed** by Balzac, is to tie description to a moving body. Balzac’s novels open with detailed portrayals of the setting, but the descriptions never threaten the reader’s sense of orientation because **③ they** trace a precise path through the fictional world. When the novel describes a house, the narrator inspects the building in a systematic manner, approaching it from the street, examining the garden and the front, entering through the main door, and **④ walked** from room to room, as **⑤ would** a real estate agent or a prospective resident. The reader ends up with a precise notion of the layout of the building, all the way down to the floor plan.

**Gemini 3.8 Flash(30k 예산)** — 정답 ⑤ (inspecting → inspects)

> While a picture transports the spectator almost instantly into a landscape, language can only describe it detail by detail, **① bringing** it slowly into the reader’s mind. How can a literary work capture the feel of a place in both **② its** atmosphere and its topography without losing the reader in a descriptive forest? One solution, proposed by Balzac, is **③ to tie** description to a moving body. Balzac’s novels open with detailed portrayals of the setting, but the descriptions never threaten the reader’s sense of orientation because **④ they** trace a precise path through the fictional world. When the novel describes a house, the narrator **⑤ inspecting** the building in a systematic manner, approaching it from the street, examining the garden and the front, entering through the main door, and walking from room to room, as would a real estate agent or a prospective resident. The reader ends up with a precise notion of the layout of the building, all the way down to the floor plan.
