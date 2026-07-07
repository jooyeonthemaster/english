# 외부 피드백 전수 감사 루프 (26-07-06, 총괄=Fable)

## 입력
유저가 생성한 16문항(어법 8·빈칸 8, 지문 4종: Paul Grice/tourism/Confucian/Statistics)에 대한
외부 모델 검수 9건. 모델 배치 지시: 분석·총괄·난제 수정=Fable, QA·기본 수정=Opus,
Opus 결과에 대한 사고 반전 개입=Fable.

## DB 실물 대조 (Fable 인라인, 판정의 전제)
- **16문항 전부 KILLER 요청** (questions.difficulty=KILLER) — "전형적 패턴" 지적의 전제 성립.
- 15/16 strict-clean 출하(qmode null·notice 없음). 유일한 구제 출하(cmr8gfj5g, relaxed+notice)가
  외부 평가 최고점("탄탄한 킬러" what→that) — 구제≠저품질의 반례이자,
  strict 게이트가 "전형성"을 못 거른다는 직접 증거.
- 결함 빈칸 실물 확정: cmr8gb2v0(STANDARD KILLER PARAPHRASE) —
  originalExpression="he was excellent at cricket and chess"(주어 있는 완전절),
  선지 5개 전부 주어 없는 VP(①②⑤ "were" 시작). 복원 시 전부 비문.
  기존 F급 슬롯 게이트는 빈칸 앞 지배어(to/by/전치사)에만 반응 — 앞이 쉼표면 무검사(사각지대).

## 피드백별 판정 (Fable)
| # | 지적 | 판정 | 원인 가설 | 조치 |
|---|---|---|---|---|
| 1 | One of+복수 수일치가 킬러로 | 정당(KILLER 실증) | killer-thin 게이트가 "개재 수식어 있으면 깊다"고 오판 — 과훈련 패턴 목록 부재 | craft 게이트(Opus)+코퍼스 빈도 확인 |
| 2 | 빈칸 선지 주어리스+수 혼재 | **정당·심각(F급)** | 슬롯 게이트가 지배어 토큰에만 반응, 절-주어 슬롯 무검사 | **신설 F급 게이트(Fable)** + 재발성 스캔 |
| 3 | individually 눈에 띔 | 정당(PREMIUM KILLER 실증) | -ly+명사 형태 이질성 무게이트 | craft(1과 통합) |
| 4 | (칭찬) 선지 병렬 통일 | 보존 | — | 게이트가 이 패턴 안 깨게 FP 캘리브레이션 |
| 5 | importantly (외부 분석 없음) | 자체 검증 | — | Opus 스캔에 포함 |
| 6 | does exist 함정 약함+해설 용어 | 정당 | 인접 아닌 2~3단어 거리 수일치 무게이트 + 용어 렉시콘 미포함 | craft+렉시콘(Opus) |
| 7·8 | (칭찬) 킬러급 빈칸 | 보존 | 프리미엄+어제 함정 4원칙 효과 | — |
| 9 | 해설이 병렬구조 힌트 누락 | 정당(개선) | 해설 템플릿에 "최속 풀이 단서" 항목 없음 | 프롬프트 한 줄(Opus) |

## 패턴 통찰 (Fable)
- 결함 2(주어리스)는 STANDARD, 칭찬 4·7·8은 PREMIUM — 빈칸 선지 병렬성은 플랜 격차 가설.
  코퍼스 스캔으로 STANDARD 재발율 확인 중.
- "전형성" 지적 3건은 양 플랜 공통 — 게이트 사각지대(패턴 목록형)이지 모델 문제 아님.
- 외부 검수 자체도 오류 가능함을 전제로 함: 1번에서 검수자의 "(C) published가 오답 후보로
  안 쓰임" 지적은 유효하나, 검수자가 난이도 라벨을 모른 채 평가 — DB 대조로 보정 완료.

## 실행 계획
1. Workflow#1 진단(Opus×3): 게이트 사각지대 정밀 지도 / 빈칸 코퍼스 250행 재발성+FP 캘리브레이션 /
   어법 코퍼스 250행 과훈련 버킷+16문항 개별 판정+용어 스캔 — 진행 중.
2. Fix: 절-주어 슬롯 F급 게이트+선지 정합 검사=Fable 직접. 과훈련 킬러 craft 게이트·
   용어 렉시콘·해설 힌트 프롬프트=Opus(소유권 분리).
3. Workflow#2 검증(Fable): 신설 게이트를 코퍼스 250행 리플레이(FP 0 요구)+적대 반증+유닛.
4. 실LLM 재측정: 결함 재현 지문(Paul Grice)로 빈칸 KILLER 재생성.

## 시도 기록

### [Fable] 검수 패널 30기 집계 (소넷5, 문항당 독립)
- FATAL 4건/3문항: SW 보기조립불가(along 부재+the 부족, 새벽) · 빈칸 aux삼킴 수일치(새벽 PREM) ·
  빈칸 주어리스(아침 STD, 유저 발견 그 문항 — 패널도 30점 BROKEN).
- MAJOR 최다축 = 함정변별력 11건(어법 KILLER 과훈련 패턴). 용어("계사" 14건·"보문 명사") 실증.
- 아침(개편후) 어법 avg 68 vs 새벽 83 — 표본 소, 과훈련 지적은 양 배치 공통.
- 칭찬 7건(92~94): 빈칸 프리미엄 위주. 유저 검수와 패널 판정 수렴 — 검수 방법론 자체 신뢰 확보.

### [Fable] Fix 1 — 슬롯 복원 무결성 F급 게이트 3종 (inference.ts, 모드 불문)
- [A] blank-slot-subject-swallowed: 스팬이 "주어+정동사" 완전절 → 全선지 주어 복원 요구.
  술어 감지 = 정동사/조동사/be형 시작 ∪ "-ed+한정사" 시작(타동사 과거 "transcended the" vs
  분사형용사 NP "Educated people" 구별). 등위접속사 직전 예외(VP 등위 정당).
- [B] blank-slot-aux-agreement-broken: 스팬 조동사 시작 + 캐리어 동명사 주어(항상 단수,
  쉼표 무개입 조건으로 분사 전치수식 배제) + 조동사/-s 시작 선지 전무 → 집합 전체 수일치 비문.
- [C] blank-slot-double-verb-option: 코퓰러 잔존(부사 1개 허용) + 정동사 시작 선지(오답 포함).
- RELAXED_BLOCKING 등재(F급)·SALVAGE 비등재. 유닛 7/7(실측 3건 차단 + 통과 6종: 주어복원/
  코퓰러스팬/등위/-s존재/분사전치/보어) + never-fail 상호작용 그린.
- **코퍼스 249행 리플레이: 5발화 = 표적 4 + 신규 진짜결함 1(cmr1q6qni "is ___"+"is rarely..."
  이중코퓰러 — 진단 스캔도 놓친 것을 게이트가 발굴), 오탐 0.**
- 한계 기록: [C]는 어휘 -s 동사 시작 오답("disappears once...")은 미검출(복수/소유격 명사
  보어와 구별 불가) — 단 동일 문항이 다른 선지로 이미 차단되므로 문항 단위 효과는 동일.

### [Fable] Opus 분배
- fix-grammar-opus: grammar-killer-overdrilled-answer(craft, KILLER 한정: one-of/±ly/that-what/
  인접수일치) + 용어 렉시콘(계사·보문명사·술어부골격) + 해설 최속단서 프롬프트.
- fix-sw-opus: sw-answer-not-buildable-from-wordbank(F급, 멀티셋 부분집합) + TSW 미러 검토.
- 등재(constants)는 Fable 이 일괄 수행(소유권).

### [Fable] Opus 산출물 적대검증 — 개입 3건 (전부 실측으로 확정)
1. **SW 매처 불규칙 활용 오탐**: 칩=기본형·정답=활용형 계약에서 규칙 굴절만 흡수 →
   made/took/brought 오탐(F급이라 오탐=생성실패 위험). 불규칙→기본형 폐쇄 맵(~80형)
   추가로 경화. (Opus 의 기능어 정확일치·미끼 초과 허용·대체정답 구제 설계는 우수 — 유지)
2. **(d) 다어절 사각**: "does exist↔do exist"가 isNumberAgreementFlip 공백 가드에
   전멸 — 단일 토큰 차이 추출로 다어절 플립 지원. 문맥 탐색도 expression/errorExpression
   양방향 시도(표시형만 지문에 실재하는 케이스에서 보수적 미발화가 오히려 미탐이었음).
3. **(d) 얕음/깊음 판별 재설계**: 기존 hasLongDistanceAgreementBeforeTarget 이
   "presented by the committee" 미인식 → 양방향 오판. **수 대조 규칙**으로 교체 —
   인접 명사의 수가 정답 동사의 요구 주어 수와 일치=그 명사가 주어(얕음, 발화),
   불일치=교란 명사(진짜 KILLER, 통과). 프로브: shallow ✓ fire / deep(committee) ✓ pass.

### [Fable] 게이트 등재·배선 (오케스트레이터 소유분)
- dispatcher.ts: findGrammarKillerOverdrilledAnswer 배선(killer-thin 옆) +
  용어 검사를 shared.findNonstandardGrammarTerminology 로 교체(상위집합).
- constants: blank-slot-* 3종 + sw/tsw-answer-not-buildable = RELAXED(F급)·SALVAGE 비등재.
  grammar-killer-overdrilled-answer = RELAXED + SALVAGE(craft).

### [Fable] 2차 피드백 루프 (유저 검수 2라운드, 11:14 KST 생성분)
- 판정: what→that 재출현 = **내 과훈련 게이트 랜딩 전(11:14) 생성** — 현행 코드면 차단.
  "to be eaten it"(능수동+목적어 잔존)은 CORE-10 정격 킬러로 검수도 호평.
- **신규 구조 결함 확정: keyPoints 필러** — 검수 4문항 연속 "3번째(때론 2·3번째) 핵심
  포인트가 이 문항에 없는 문법 주제". RCA: 스키마가 "학습 포인트 3개 이상"으로 개수만
  요구, 라벨 연동 무강제 → 모델이 2개 실질+1개 일반론 필러 패턴.
- 수술(Fable 직접): ① 스키마 2곳(정적+빌더) — "정확히 3개, '(라벨) 포인트명 — 판별
  한 줄' 형식, 1번=정답 라벨" ② grammar-frames 프롬프트 규칙 2줄 ③ 게이트
  grammar-keypoint-choice-mismatch(라벨 실재+정답 선두+pointCode 키워드 주제 대조,
  craft) ④ **CORE-10 표적 강제**(유저 지시 "어법은 ~10개 핵심 포인트 겨냥"):
  카탈로그 GRAMMAR_CORE_ANSWER_CODES(a~i,k 10종)가 이미 존재 — 정답 pointCode 가
  j/l/m(가정법·전치사vs접속사·비교수량)이면 grammar-answer-point-not-core craft 거절
  (디코이 허용) + 프롬프트 명시. 유닛 5/5(실측 tend-being 필러 픽스처 차단), 회귀 423/424.
- 다지문 스윕1(20지문 풀·셀당 4런·32생성, grammar+blank×양플랜×INT/KILLER) 실행 중 —
  목적: ① 신설 게이트 실전 거동(생성률 100% 유지) ② STANDARD 반복 fatal 클러스터링
  (유저 지시: 모델 한계로 퉁치지 말 것) ③ 지문 다양성 로버스트니스.

### [Fable] 다지문 스윕1 결과 (32생성, grammar+blank×양플랜×INT/KILLER×4런)
- **생성 32/32(실패 0)** · 신설 게이트 실전 발화 4회(overdrilled 2·keypoint 1·not-core 1,
  전부 재시도/구제로 회복) · 주의: 지문 다양성이 4개에 그침(하니스 풀 선택 편중 — 후속 확인).
- **STANDARD fatal 클러스터 확정 (유저 지시 "모델 한계로 퉁치지 말 것"의 답)**:
  ① 빈칸 ST-INT(61, 최저): fatal 7/8 이 전부 "SOURCE_EXACT 가 정답을 원문 verbatim 으로
     강제(후처리) → 본문 대조만으로 풀림 + 해설은 패러프레이즈 서사(내적 모순)" — 모델
     한계가 아니라 **모드 설계 결함**.
  ② 빈칸 ST-KILLER(68): 지엽 세부/마지막 문장 인용부에 빈칸 + 직전 절 근접 재진술 +
     공유어 삼킨 꼬리 잔여구("to ___ of the ...").
  ③ 어법 ST-KILLER(63): 구제 3/4(설계대로) + 심사가 내부 메타(_qualityMode) 보고 감점
     (알려진 하니스 편향). 어법 ST-INT 는 82 로 건강.
- 수정 웨이브(Fable): ① **INT 빈칸 PARAPHRASE 강제 확장**(run-question-generation,
  BASIC 은 SOURCE_EXACT 유지) + **후보 블록 라우팅 정렬**(INT→paraphrase 블록 — 모드와
  블록이 어긋나면 자기모순) ② killer 블록 규칙 보강: 위치 금지 2종(직전 절 재진술·
  마지막 문장 인용부)+경계 규칙(전치사구 꼬리 잔여 금지). tsc 0·빈칸 계약 34/34.
- 재측정: multipassage-sweep2-blank(빈칸 4셀×4런) 실행 중.

### [Fable] 다지문 스윕2 재측정 (빈칸 4셀×4런, INT 강제 후) — 웨이브 성적표
| 셀 | 전→후 | verbatim-fatal |
|---|---|---|
| PREM INT | 76→**96**(96×4 균일) | 4→0 |
| PREM KILLER | 82→**97**(96~98) | — |
| **ST INT(표적)** | 61→**79**(+18) | **7→0 전멸** |
| ST KILLER | 68→73 | 잔여=위치 계열(직전 절 재진술, gemini 의 규칙 준수 편차) |
생성 16/16. **판정: INT PARAPHRASE 강제 채택 확정.** 잔여 백로그: ST-KILLER 위치
준수(단발 58 아웃라이어), 하니스 지문 풀 다양성(스윕1에서 4지문 편중), 심사 내부
메타 감점 편향. 최종 회귀 424(423p/f0/todo1)·tsc 0.
- 빈칸 249행: 5발화 = 표적 4 + 신규 진짜결함 1(cmr1q6qni "is is"), FP 0.
- 어법 250행(KILLER 58): overdrilled 22발화(38%) — what→that 8·±ly 6·인접수일치 6·
  one-of 1·does exist 1, **INT 오발 0**. 용어 렉시콘 6건 적발(계사 등).
- 유닛 전체 419: 418 pass·fail 0·todo 1(기존 HWPX). tsc 0.
- 실LLM 검증(blank/grammar/SW KILLER × 양플랜 × 2런) 진행 중 → feedback-fix-verify-20260706.

### [Fable] 어법 ST-KILLER 표적 웨이브 (유저 우선순위 재지정)
- 가설: gemini 병목=킬러 '설계' 능력 → 설계를 결정론으로 이관(5자리 지정: 정답=CORE-10
  첫 killer 후보 + 디코이 4=기출 오답률 순, 코드 중복 없음) + 시도 비대칭 수정
  (ST-K 만 strict 2회로 조여져 있던 것 → 다른 STANDARD 유형과 같은 4회로 정렬).
- **재측정(스윕3, 지정만 활성): 기각** — ST-K 63→56(38 아웃라이어), PREM-K 76→77.
  구제율 3/4→1/4 은 개선됐으나 판정 품질 하락. RCA: 후보 탐지기의 tier 라벨이 얕은
  자리(모호 대명사·전형 관계사)를 killer 로 태깅하면, 종전엔 모델이 회피하던 것을
  지정이 고정 → 재시도 전부 같은 나쁜 자리 → 구제 출하(38점 문항 = overdrilled 게이트가
  정상 차단했으나 구제 경로 출하, localIssues 로 확인 — 게이트 구멍 아님).
- 조치: 지정 설계 원복(함수+배선 제거, 사유 주석). **시도 정렬(2→4)은 유지** —
  스윕3에 미반영이었으므로 독립 효과를 스윕4(ST-K 단독 6런)로 측정 중.
- 교훈: 결정론 이관은 "결정론 쪽 신호 품질이 모델보다 높을 때"만 유효. 후보 탐지기
  tier 정밀도가 선행 과제(백로그) — 그 전까지는 톱다운 자유선택+게이트 압박이 우월.

### [Fable] 스윕4 판정 — 시도 정렬(2→4) 단독 효과: 채택
- ST GRAMMAR KILLER 6런: 생성 6/6 · avg 63→67 · **구제출하 3/4→1/6** · attempts 실소비(6/3/2…).
- 종합: 지정 설계 기각(56)·시도 정렬 채택(67, 구제율 대폭 개선). ST-K 잔여 상한 ~67 의
  다음 레버 = 후보 탐지기 tier 정밀화(중간 규모, 백로그 1순위).
- 최종 회귀 424(423 pass·fail 0·todo 1=기존 HWPX)·tsc 0. 전부 미커밋.
