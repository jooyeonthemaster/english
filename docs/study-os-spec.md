# SMOAT 학습 OS — 세계관 · 설계 정본 (v2, 2026-07-15)

> 이 문서는 **규범(normative)** 이다. 학습 OS를 만지는 모든 에이전트·작업자는 이 문서를 먼저 읽고,
> 여기 적힌 계약(ID·타입·클래스·톤·금지사항)을 어기지 않는다.
> 문서와 코드가 충돌하면 **문서를 고친 뒤** 코드를 고친다(스펙 착지 원칙).
> 리포 루트: `D:\Desktop\2026project\nara` (세션 cwd가 아닐 수 있음 — 절대경로로 접근할 것)

---

## 0. 한 줄 정의

**학생이 손에 쥔 태블릿·폰이 곧 교실이 되는 학습 OS.**
교재가 종이에서 하던 모든 것(개념 설명·필기·예제·연습·시험 대비)을 화면으로 이식하되,
종이가 못 하던 것(즉시 판정·개인화 서빙·교사 원격 관찰)을 얹는다.

경쟁 기준선: 천일문·어법끝 같은 베스트셀러 교재 + 학교 AI 디지털교과서.
**우리가 이기는 지점은 "설명의 양"이 아니라 "판단 절차의 이식"이다.**
교재는 규칙을 나열하지만, 우리는 학생의 눈이 문장을 훑는 **순서 자체**를 훈련시킨다.

---

## 1. 트랙 유니버스 (4트랙)

학습 OS는 4개 트랙을 갖는다. 트랙은 **동일한 학습 문법**(단원 → 개념 레슨 → 훈련 → 시험 → 숙달)을 공유하고,
콘텐츠 도메인만 다르다. 트랙 레지스트리는 `src/lib/study-os/tracks.ts` 가 정본이다.

| 트랙 | id | 상태 | 학습 단위 | 이번 릴리스 범위 |
|---|---|---|---|---|
| 어법 | `grammar` | **LIVE** | 유닛 → 개념 레슨 → 드릴/실전/서술형/테스트 | 전면 재구축(이 문서의 주제) |
| 듣기 | `listening` | PREPARING | 회차 → 유형 레슨 → 듣기 드릴 → 실전 | 뼈대·안내 화면만 |
| 어휘 | `vocab` | PREPARING | 어휘장 → 배치 → 테스트 → 간격반복 | 뼈대·안내 화면만 |
| 내신 | `school` | PREPARING | 학교·시험범위 → 자료 → 예상문제 → 리허설 | 뼈대·안내 화면만 |

**PREPARING 트랙 규칙**: 홈·탭에 정식 카드로 노출하되, 진입하면 "무엇이 준비되고 있는지 + 언제 열리는지 +
지금 대신 할 것(어법 CTA)"을 보여준다. **죽은 링크·빈 화면·'준비 중입니다' 한 줄 금지.**
트랙 카드는 `TrackCard` 단일 컴포넌트로만 렌더한다(4장 전부 동일 규격).

---

## 2. 어법 트랙 — 커리큘럼 백본 v2

### 2.1 무회귀 원칙 (절대)

- 기존 유닛 `u01`~`u12`, 개념 `u01-c1`~`u12-c4`(47), 문항 1,650개의 **ID는 불변**이다.
  학생의 `grammar_drill_mastery` / `attempts` 가 이 문자열에 soft-ref 로 매달려 있다.
- 기존 유닛의 **순차잠금 곡선을 바꾸지 않는다**(u01 항상 열림, uN 은 u(N-1) drillDoneAt 필요).
- PART 0 신설 유닛은 **별도 해금 그룹**(`unlockGroup: "BASIC"`)이다. b01 은 항상 열리고 b02~b07 은 그룹 내 순차.
  즉 기초를 안 해도 기존 학생은 그대로 u01 을 계속 푼다.

### 2.2 파트 구성

| 파트 | 이름 | 유닛 | 성격 |
|---|---|---|---|
| **0** | 기초 골격 | `b01`~`b07` (28개념) | **신설.** 초3~중3 도입 문법. "문장이 어떻게 생겼는가" |
| 1 | 골격기 | `u01`~`u05` (20개념) | 기존. 판별 — 문장의 뼈대 |
| 2 | 연결기 | `u06`~`u09` (15개념) | 기존. 판별 — 절과 절의 관계 |
| 3 | 정밀기 | `u10`~`u12` (12개념) | 기존. 판별 — 형태·호응의 미세 판단 |

총 **19유닛 · 75개념 · 75레슨**.

### 2.3 PART 0 신설 유닛 (근거: 2015 개정 [별책14] 별표4 언어형식 ● 표기 + 천일문 중등/고등 목차)

| id | 제목 | 부제(판단 본질) | 개념 |
|---|---|---|---|
| `b01` | 품사와 문장성분 | 단어의 신분증과 문장 속 배역 | b01-c1 8품사 / b01-c2 문장성분 4종 / b01-c3 구와 절 / b01-c4 수식어 걷어내기 |
| `b02` | 문장의 다섯 형식 | 동사가 문장의 모양을 결정한다 | b02-c1 SV·SVC / b02-c2 SVO / b02-c3 SVOO / b02-c4 SVOC와 목적격보어 |
| `b03` | 동사와 시제의 기본 | 언제 일어난 일인가 | b03-c1 be동사·일반동사 / b03-c2 현재·과거·미래 / b03-c3 진행형 / b03-c4 현재완료 / b03-c5 시간·조건 부사절의 현재시제 |
| `b04` | 조동사 | 동사에 태도를 얹는다 | b04-c1 can·will·must·should / b04-c2 조동사+have p.p. / b04-c3 제안·요구 that절의 동사원형 |
| `b05` | 명사·관사·대명사 | 무엇을 가리키는가 | b05-c1 가산·불가산과 관사 / b05-c2 인칭·지시대명사 / b05-c3 재귀대명사 / b05-c4 부정대명사(one·another·the other) |
| `b06` | 형용사·부사·비교 | 무엇을 꾸미고, 무엇과 견주는가 | b06-c1 형용사와 부사의 자리 / b06-c2 원급·비교급·최상급 / b06-c3 비교 관용표현 / b06-c4 수량형용사 |
| `b07` | 전치사·접속사·절 | 문장을 잇는 부품 | b07-c1 전치사의 목적어 / b07-c2 등위·상관접속사 / b07-c3 명사절(that·whether·의문사) / b07-c4 부사절 |

`frequency`(수능 출제율 별점)는 PART 0 유닛에서 **`null`** 이다.
**출처 없는 빈도 숫자를 지어내는 것은 critical 결함이다**(리서치 결론: 평가원 공식 빈도표는 공개 1차 자료로 확인 불가).
대신 각 개념에 `csatLink`(수능 판별과의 연결: 어느 판별 유닛으로 이어지는가)를 단다.

### 2.4 학년 이중 스탬프 (필수)

같은 개념이 **도입 학년**과 **판별 학년**을 따로 갖는다(리서치 핵심 비대칭: 문법의 55%는 중학교에서 *시작*되지만,
수능 어법 판별 대상은 대부분 고등에서 처음 *판별*된다).

```ts
gradeStamp: {
  introduced: "초3" | ... | "고3";   // 이 개념을 처음 배우는 학교급 (근거: 별표4 ● / 교재 레벨)
  judged: "중3" | "고1" | ... | null; // 어법 판별 대상이 되는 시점 (아니면 null)
  csatPoints: string[];               // 어법끝 5.0 TESTING POINT 번호 (예: ["TP01","TP04"])
  sourceRefs: string[];               // 근거 (예: ["별표4 #32(고 ●)", "천일문고등 CH08"])
}
```

### 2.5 판별 5렌즈 (cross-cutting, 유닛 아님)

수능 어법의 실제 알고리즘은 문법 라벨이 아니라 **절차**다. 5개 렌즈를 전 개념에 태그한다.
`src/lib/study-os/lenses.ts` 정본.

| id | 이름 | 한 줄 |
|---|---|---|
| `L1` | 절의 완전성 | 주어·목적어·보어 중 빠진 자리가 있는가 |
| `L2` | 동사 자리 카운팅 | 동사 개수 = 접속사·관계사 개수 + 1 |
| `L3` | 의미상 주어 대조 | 이 준동사의 주인은 누구이고, 하는가 당하는가 |
| `L4` | 병렬 축 찾기 | and/or/but 이 무엇과 무엇을 잇는가 |
| `L5` | 핵 주어 추출 | 수식어를 걷어내면 진짜 주어는 무엇인가 |

학생 화면에서는 훈련 탭의 **"판별 5도구"** 로 노출되고, 오답 진단·취약점 리포트의 축이 된다.

---

## 3. 인터랙티브 레슨 (이 프로젝트의 심장)

### 3.1 왜 지금 것이 부족한가

현재 개념 카드 = `oneLiner` + `algorithm[4]` + `rules[2]` + `traps[2]` 를 **스크롤 한 장**으로 읽히는 정적 문서.
인터랙션 0, 필기 0, 단계 0, 학년 구분 0, 자기 점검 0. 교재의 요약 페이지를 옮긴 것이지 교재를 이식한 것이 아니다.

### 3.2 레슨 = 블록의 시퀀스

**1개념 = 1레슨.** 레슨은 `LessonBlock[]` 이며, 플레이어는 블록을 **한 번에 하나씩** 세워 보여준다(카드 스택).
각 블록은 `tier`(1 기초 / 2 표준 / 3 심화·수능)를 갖고, 학생이 고른 난이도 렌즈에 따라 켜고 끈다.

**블록 카탈로그 (16종)** — `src/lib/study-os/lesson-types.ts` 가 타입 정본.

| # | type | 학생이 보는 것 | 학생이 하는 것 | 교수설계 근거 |
|---|---|---|---|---|
| 1 | `HOOK` | 두 문장 중 어법상 맞는 것은? (설명 전) | 탭 → 즉시 정오 + "이 레슨을 마치면 이유를 말할 수 있습니다" | 사전 인출(pretesting effect) |
| 2 | `MISCONCEPTION` | "많은 학생이 이렇게 압니다 ✕ → 사실은 ○" | 오개념을 탭해 반박문 펼치기 | 오개념 직면(refutation text) |
| 3 | `RULE` | 규칙 1줄 + 예문 1~2 + 구조 주석 | 예문의 판단 포인트 탭 → 하이라이트 | 이중부호화 |
| 4 | `DIAGRAM` | **문장 필기** — 주어/동사/수식어를 색·괄호·슬래시·화살표로 해부 | 레이어를 단계별로 켜기(수식어 걷기 → 핵 주어 → 동사) | 시각적 구조화 · 이중부호화 |
| 5 | `ALGORITHM` | 판별 절차 ①②③ | 각 단계를 탭하면 그 단계가 예문에 적용되는 것을 본다 | 절차적 지식 · 인지부하 분산 |
| 6 | `WORKED` | 워크드 예제 — 문제 하나를 처음부터 끝까지 | 탭할 때마다 **한 스텝씩** 풀이가 드러남(다 보여주지 않음) | worked example effect |
| 7 | `COMPLETION` | 절반 풀린 예제 — 마지막 판단만 학생 몫 | 빈 단계 채우기 | completion problem(스캐폴딩 소거) |
| 8 | `CHECK` | 미세 확인 문항(1~2문항) | 풀고 즉시 판정 + 해설 | 인출연습 · 즉시 피드백 |
| 9 | `CONTRAST` | A vs B 대조표(what vs that 등) | 행을 탭하면 예문 대조 | 변별 학습 |
| 10 | `SORT` | 칩 6~8개 + 바구니 2~3개 | 칩을 탭해 바구니로 분류(드래그 아님 — 모바일 신뢰성) | 생성 효과 |
| 11 | `TRAP` | 함정 카드 — 왜 틀리는가 | 함정 문장 탭 → 오답 경로 재현 | 오류 예방 |
| 12 | `EXAM` | 시험 포인트 — 내신 서술형 / 수능 밑줄에서 이렇게 나온다 | 실제 출제 형태 미리보기 | 전이(transfer) |
| 13 | `SELF_EXPLAIN` | "왜 그렇게 골랐습니까?" 이유 선택지 | 이유 고르기 → 맞는 이유/그럴듯한 오답 이유 판정 | 자기설명 유도 |
| 14 | `NOTE` | 내 필기 — 이 개념을 내 말로 | 텍스트 입력(저장 → **교사가 본다**) | 생성 효과 · 교사 관찰창 |
| 15 | `SUMMARY` | 요약 필기 노트(접어서 다시 볼 카드) | 저장/즐겨찾기 | 인출 단서 |
| 16 | `RECAP` | 레슨 마무리 3문항 | 풀이 → 레슨 완료 판정 + 다음 단계 안내 | 간격반복 진입점 |

**필수 블록 (모든 레슨)**: `HOOK` → `RULE`(≥2) → `DIAGRAM`(≥1) → `ALGORITHM` → `WORKED`(≥1) → `CHECK`(≥2) → `TRAP`(≥1) → `SUMMARY` → `RECAP`.
**선택 블록**: MISCONCEPTION, COMPLETION, CONTRAST, SORT, EXAM, SELF_EXPLAIN, NOTE (개념 성격에 맞게).
**레슨 1개의 최소 분량: 블록 12개 이상, 예문 10개 이상.** 이보다 얇으면 저작 미달로 반려한다.

### 3.3 CHECK/RECAP 블록은 드릴 문항이다

`CHECK`·`RECAP` 블록의 문항은 **`GrammarItem` 호환 스키마**(CHOICE·OX 만 허용)로 쓴다.
`scripts/build-lesson-items.ts` 가 레슨에서 문항을 추출해 `src/data/grammar-drill/items/{unit}-lesson.json` 뱅크를 생성한다.
→ **PART 0 기초 유닛도 별도 문항 저작 없이 드릴이 돈다.** 문항 ID 규약: `{conceptId}-ls-{nnn}` (예: `b01-c1-ls-001`).

### 3.4 톤 · 문체 (위반 시 게이트 실패)

- 한국어는 **합니다체**. "~해요/~하자/~해봐" 금지. (`feedback_hamnida_tone`)
- 영어 예문에 한글 혼입 금지, 한국어 필드에 영어 문장 통째 금지.
- 학생을 가르치되 **얕보지 않는다**. 감탄사·이모지·"짜잔" 류 금지.
- 한 문단 3줄 이내. **주절주절 금지** — 화면은 종이가 아니다.
- 예문은 **수능·모의고사 문체의 학술 산문**(기존 문항 뱅크와 같은 결). 유치한 예문("I like pizza") 금지.
  단, PART 0 tier1 은 기초 학습자를 위해 짧고 평이한 문장 허용(그래도 유치하지 않게).

---

## 4. 네비게이션 척추 — "학생은 언제나 다음 한 수를 안다"

### 4.1 NextStep 엔진 (단일 정본)

`src/lib/study-os/next-step.ts` 의 `computeNextStep(state) → NextStep` 이 **앱 전체에서 유일한 "다음에 뭘 하지"의 답**이다.

```ts
interface NextStep {
  label: string;      // "u01 개념 2 — 준동사는 본동사가 될 수 없다" (구체적으로)
  reason: string;     // "개념 학습을 절반 마쳤습니다" (왜 이것인가)
  href: string;
  kind: "LESSON" | "DRILL" | "READING" | "WRITTEN" | "TEST" | "REVIEW" | "ASSIGNMENT" | "MIXED";
  urgency: "DUE" | "NORMAL";   // 마감 임박 과제는 항상 최우선
}
```

- 홈 최상단 **원포인트 CTA**, 유닛 허브 하단 바, 레슨 종료 화면, 드릴 요약 화면이 **전부 이 함수 하나**를 쓴다.
  화면마다 다른 추천을 하면 안 된다.
- 우선순위: ① 마감 임박 과제 → ② 진행 중인 유닛의 다음 단계 → ③ 취약 개념 복습 → ④ 다음 유닛 개념 학습 → ⑤ 복합 세트.

### 4.2 뒤로가기 계약

- **모든 몰입 화면(레슨·드릴)의 좌상단은 `BackBar` 컴포넌트 하나**로 통일한다.
  좌: `←` (부모로) / 중: 현재 위치(유닛명 · 진행) / 우: 종료(`×`, 진행 저장 후 유닛 허브).
- 부모 경로는 명시적: 레슨 → 유닛 허브 → 훈련 탭 → 홈. **`router.back()` 금지**(딥링크 진입 시 앱 밖으로 나감).
- 레슨 이탈 시 진행률(마지막 블록 index)을 저장하고, 재진입 시 **"이어서 볼까요 / 처음부터"** 를 묻는다.

### 4.3 라우팅 지도

```
/g                      로그인
/g/home                 홈 — 오늘의 한 수(NextStep) · 트랙 4장 · 과제 · 계기판
/g/track/[trackId]      트랙 허브 (grammar=유닛맵 / 나머지=준비 안내)
/g/unit/[unitId]        유닛 허브 — 개념 레슨 리스트 + 단계 스테퍼
/g/unit/[unitId]/lesson/[conceptId]   ★ 인터랙티브 레슨 플레이어 (신규)
/g/drill                드릴 플레이어 (기존)
/g/tools                판별 5도구 (신규, 참조 화면)
/g/tasks /g/q /g/w /g/x 통합 과제 (기존 — 건드리지 않는다)
/g/me                   내 기록 (기존 MasteryMap + 레슨 진도 추가)
```
`/g/unit/[unitId]/learn` 은 **신규 레슨 라우트로 서버 리다이렉트(307)**(기존 링크 보존).
영구(301) 금지 — 목적지가 세션·잠금 상태에 따라 달라지므로 브라우저가 캐시하면
잠긴 상태에서 한 번 접근한 학생이 해금 후에도 계속 튕긴다.

**트랙 허브·홈·과제·내 기록은 탭 루트다 — 반드시 `GShell` 로 감싼다.**
감싸지 않으면 학생이 탭바 없는 화면에 갇힌다.

---

## 5. 디자인 시스템 — "시험지 × 계기판" 확장

기존 `src/app/g/gd.css` 를 **갈아엎지 않고 확장**한다. 팔레트·타이포·버튼·시트 프리미티브는 유지.

### 5.1 반드시 지키는 것 (기존 계약)

- 타이포는 **rem 기반 `.gd-*` 클래스로만**. Tailwind `text-*` 사용 금지 —
  루트 `body.smoat-large-ui` 가 `text-*` 를 `!important` 로 20px 계열로 리맵해 삼켜버린다.
- `bg-white` 금지 → `background: var(--gd-card)`. (전역 `.dark .bg-white` 규칙이 /g 표면을 검게 칠한다.)
- 터치 타깃 최소 44px(`.gd-btn`, `.gd-option`).
- `word-break: keep-all` 유지 — 한국어 줄바꿈이 어절 중간에서 끊기지 않게. 영어는 `.gd-en`(세리프).

### 5.2 이번에 새로 넣는 것

1. **태블릿 분기** — `gd.css` 에 `@media (min-width: 768px)` 신설. Tailwind `sm:`/`md:` 는 `.gd-*` 커스텀 클래스에 붙지 않는다(기존 `sm:gd-t-lg` 5곳은 죽은 코드였다).
   - 컨테이너: `.gd-page`(모바일 max 28rem → 태블릿 44rem), `.gd-page-wide`(레슨: 모바일 100% → 태블릿 2컬럼 그리드).
   - 레슨 플레이어는 태블릿에서 **좌: 블록 본문 / 우: 진행·필기 사이드레일** 2컬럼.
2. **포커스 링** — `.gd-btn:focus-visible`, `.gd-option:focus-visible` 등 전 인터랙티브 요소(현재 0건).
3. **확대 허용** — `layout.tsx` viewport 의 `userScalable:false`, `maximumScale:1` 제거(저시력 접근성).
4. **본문 밀도 상향** — 레슨 본문 기본 `--gd-fs-md`(15px) 이상. 10~11px 은 라벨·메타에만.
5. **레슨 블록 스타일 토큰** — `.gd-block`(블록 카드), `.gd-block-head`(블록 타입 배지), `.gd-syntax-*`(구문 필기 색: 주어=파랑 / 동사=빨강 / 목적어·보어=초록 / 수식어=회색 점선), `.gd-step`(단계 리빌).
6. **버튼 어휘 통일** — 기존 3분열(gd-btn / ToolButton 칩 / learn 임시 버튼)을 `.gd-btn` + `.gd-btn-chip` 2종으로 수렴.

### 5.3 미학 규범

- 아이콘: lucide, `strokeWidth 1.75`. **Sparkles·이모지 금지. 주황/앰버 색 금지.**(`feedback_no_sparkles_icon`, `feedback_no_orange_icons`)
- 여백은 4의 배수 리듬. 카드 간 `gap-2.5`(10px), 섹션 간 `mt-6`(24px)로 통일 — 현재 mt-2/3/4/6/7 산발을 정리한다.
- 불필요한 여백 금지: 화면 첫 픽셀부터 정보가 있어야 한다. 빈 상태에도 반드시 **다음 행동**이 있다.
- 줄바꿈: 제목은 `truncate` 또는 2줄 클램프, 본문은 `keep-all`. **한 단어가 홀로 다음 줄로 떨어지는 것(고아 어절)을 허용하지 않는다** — 짧게 쓰라.

---

## 6. 데이터 계약

### 6.1 신규 테이블 (surgical SQL — `prisma db execute` 만. `migrate`/`db push` 금지)

```sql
-- 레슨 진행 (개념 1개 = 행 1개)
grammar_drill_lesson_progress(
  id, academyId, studentId, unitId, conceptId,
  blocksSeen INT,          -- 본 블록 수
  blocksTotal INT,
  lastBlockIndex INT,      -- 이어보기 지점
  checkTotal INT,          -- 레슨 내 CHECK/RECAP 문항 수
  checkCorrect INT,
  confidence INT,          -- 학생 자기평가 1~3 (레슨 끝 "이해했습니까")
  note TEXT,               -- NOTE 블록 필기 (교사가 본다)
  secondsSpent INT,
  startedAt, completedAt, updatedAt,
  UNIQUE(studentId, conceptId)
)
```
- Student 와 **relation-free**(FK 없음, 명시 조인). 기존 grammar_drill_* 규약과 동일.
- 기존 5테이블은 **컬럼 추가도 하지 않는다**(병렬 세션 충돌 회피).

### 6.2 스테이지 승급 (변경)

- `CONCEPT` 단계 승급 조건이 바뀐다: 기존 = concept_check 큐를 끝까지 넘기면 무조건 통과(정답률 무관).
  **신규 = 유닛의 모든 개념 레슨이 `completedAt != null`** 이면 `markConceptDone`.
  - 레슨 완료 조건: 필수 블록 전량 열람 + RECAP 문항 제출.
  - 기존 학생 보호: `conceptDoneAt` 이 이미 있으면 그대로 통과 상태 유지(백필 불필요, 재잠금 금지).

### 6.3 교사 연계 (`/director/students/[id]?tab=grammar`)

기존 어법 탭에 **"개념 학습" 서브뷰**를 추가한다(현재 서브뷰: 분석/시도기록/질문로그).

- 개념 19유닛 × 개념 진행 매트릭스: 미시작 / 진행 중(블록 n/m) / 완료(체크 정답률) / 자신 없음(confidence=1)
- **학생 필기(NOTE) 열람** — 개념별 학생이 자기 말로 쓴 설명. 교사가 오개념을 육안으로 잡는 창.
- 학원 전체 뷰(`/director/grammar-lab`): 개념별 평균 이해도·필기 미작성률.
- 배정: 기존 통합 과제(StudyAssignment kind=GRAMMAR)에 **`LESSON` 종류 추가는 하지 않는다**(이번 범위 밖).

---

## 7. 저작 규범 (레슨 팬아웃 에이전트 필독)

1. **1에이전트 = 1레슨 파일**. 다른 파일 금지. 파일은 **전면 교체**로 쓴다(멱등).
2. 파일 경로: `src/data/grammar-drill/lessons/{conceptId}.json` (예: `u01-c1.json`, `b03-c2.json`).
3. 스키마: `src/lib/study-os/lesson-types.ts` + zod `src/lib/study-os/lesson-schema.ts`. **zod 통과가 최소 조건.**
4. 견본: `src/data/grammar-drill/lessons/u01-c1.json` — **이 파일의 밀도·톤·정확도가 기준선이다.**
5. 문법적 사실은 **틀리면 critical**. 확신이 없으면 그 규칙을 쓰지 말고 확실한 규칙을 더 깊게 파라.
6. **출처 없는 통계 금지**("수능에 90% 출제됩니다" 류). 빈도 주장은 `csatPoints`(어법끝 TP 번호)로만 한다.
7. 예문은 전부 **문법적으로 옳아야** 한다(오답 예시는 `wrong: true` 플래그가 붙은 자리에만).
8. 모든 CHECK/RECAP 문항은 정답이 유일해야 한다(중의성 = critical).

---

## 8. 검증 게이트

| 게이트 | 명령 | 통과 기준 |
|---|---|---|
| 번들 구조 | `npx tsx scripts/verify-grammar-drill-bundle.ts` | 오류 0 |
| 레슨 스키마·규범 | `npx tsx scripts/verify-lessons.ts` | 오류 0 (블록 최소치·합니다체·한글혼입·정답유일성) |
| 타입 | `npx tsc --noEmit` | 에러 0 |
| 린트 | `npx eslint src/app/g src/lib/study-os src/components/study-os` | 에러 0 |
| 렌더 | Playwright 3뷰포트(390 / 768 / 1024) 스크린샷 | 가로 스크롤 0, 텍스트 잘림 0, 탭바 겹침 0 |
| 행동 | Playwright 레슨 1회 완주(블록 전진·체크 제출·이탈/재개) | 상태 전이 정상 |

---

## 9. 이번 릴리스에서 **하지 않는 것** (범위 방어)

- 듣기·어휘·내신 트랙의 실제 콘텐츠·엔진 (뼈대·안내 화면만).
- 기존 12유닛 문항 뱅크(1,650) 재저작.
- 통합 과제(StudyAssignment) 체계 개편.
- 어법 배정에 `dueAt` 추가 등 기존 테이블 스키마 변경.

---

# v2 증보 — 필기노트 블록 · 게임 블록 · 상태창/칭호 (2026-07-15)

> v1 위에 얹는 증보다. v1 계약(ID 불변·무회귀·톤·디자인 토큰)은 그대로 유효하며,
> 충돌 시 이 증보(§10~§16)가 우선한다.

## 10. v2 가 고치는 것 — 진단

1. **벽글(wall-of-text)**: `RULE.rule` 하나에 개념 여덟 개를 욱여넣은 문단이 존재한다
   (실사례: b01-c1 "8품사와 각자의 일" — 8품사 전부를 한 문단으로 설명).
   학생은 시각 구조 없는 줄글에서 개념 경계를 못 찾는다. → **필기노트 블록 4종** 신설, RULE 은 "규칙 1개=1줄" 로 제한.
2. **전제 지식 구멍**: "품사가 무엇인지" 모르는 학생에게 "8품사는…"부터 시작한다.
   → 모든 레슨은 **용어 최초 대면 블록(CONCEPT_INTRO)** 으로 용어 자체를 먼저 연다.
3. **암기의 방치**: 외워야 도구가 되는 목록(8품사·5형식·인칭대명사 표…)을 "읽고 지나가게" 둔다.
   → **MNEMONIC(암기 카드) + MEMORY_GATE(암기 확인 관문)** 신설. 왜 외워야 하는지부터 말한다.
4. **재미 0**: 인터랙션은 있으나 놀이가 없다. → **게임 블록 6종** 신설, 레슨당 3개 이상·중복 최소화.
5. **성취의 비가시성**: 레슨을 마쳐도 "내가 강해졌다"는 신호가 없다.
   → **어법 스텟·레벨·칭호·상태창**(게임 소설의 상태창 문법) 신설.

## 11. 신규 블록 카탈로그 (10종 — 총 29종)

타입 정본: `src/lib/study-os/lesson-types.ts` · zod: `src/lib/study-os/lesson-schema.ts`.
렌더러: 노트 4종 `src/components/study-os/lesson-blocks-notebook.tsx`,
게임 6종 `lesson-blocks-game-core.tsx`(MEMORY_GATE·SPEED_OX·WORD_HUNT) ·
`lesson-blocks-game-arena.tsx`(PAIR_MATCH·ODD_ONE_OUT·BOSS).

### 11.1 필기노트 패밀리 (교과서의 "필기"를 이식)

| type | 학생이 보는 것 | 계약 요점 |
|---|---|---|
| `CONCEPT_INTRO` | 용어 첫 대면 — "○○가 무엇입니까?"에 답부터 | `term`(용어)·`question`·`plain`(전제 0 정의, 2줄 이내)·`analogy`(생활 비유)·`whyItMatters`(이걸 알면 무엇이 되는가) |
| `NOTEBOOK` | 필기노트 — 개념 1개 = 항목 1개, 좌측 노트줄 + 번호 | `intro?` + `entries[3..8]`: `{head, body, example?, pin?("암기"\|"주의"\|"팁")}` — body 는 2문장 이내 |
| `TABLE` | 개념 정리표 (예: 8품사 표) | `columns[2..4]` + `rows[2..9]`: `{cells[], example?}` — 행 탭 시 예문 공개 |
| `MNEMONIC` | 암기 카드 — 왜 외우는가 → 어떻게 외우는가 | `target`(외울 것)·`why`(암기의 존재 이유)·`device`(두문자·리듬·연상 — 위트 허용)·`items[]{cue, answer}` (셀프 리허설) |

**분업**: `RULE`=규칙 문장 1개(≤180자), `NOTEBOOK`=개념 여러 개의 구조화, `TABLE`=축이 2개 이상인 비교/목록,
`CONCEPT_INTRO`=용어 자체, `MNEMONIC`=목록 암기. 벽글이 필요해 보이면 블록을 쪼개는 것이 정답이다.

### 11.2 게임 패밀리 (전부 탭 조작·즉시 피드백·해설 필수)

| type | 게임 | 계약 요점 |
|---|---|---|
| `MEMORY_GATE` | 암기 관문 — 통과해야 다음(단, "그래도 넘어가기" 항상 제공) | `mission`·`mode:"SET"`(순서 무관 전부 선택)\|`"ORDER"`(순서대로)·`pool[]`(정답+미끼)·`answers[]`·`passText`·`retryText`. 오답 시 재도전 유도, 강제 잠금 금지 |
| `SPEED_OX` | 스피드 판정 — 제한시간 내 ○× 연타, 콤보 | `rounds[4..8]{statement, isTrue, why}`·`timeLimitSec(5..15)` — statement 는 영어 문장 또는 한국어 명제 |
| `WORD_HUNT` | 문장 속 사냥 — "이 문장에서 명사를 전부 탭" | `instruction`·`tokens[]{t, hit}`·`hitLabel`(사냥 대상 이름)·`explain` — 전부 찾으면 클리어 |
| `PAIR_MATCH` | 짝 맞추기 — 좌우 카드 매칭 | `pairs[3..6]{a, b, why?}` — a·b 는 용어↔정의·예문↔품사 등 |
| `ODD_ONE_OUT` | 이단아 찾기 — 넷 중 결이 다른 하나 | `rounds[2..4]{words[3..5], odd(index), why}` |
| `BOSS` | 보스전 — 레슨 최종 시험. 하트 3개, 문항 수 = 보스 HP | `bossName`(위트 허용)·`intro`·`questions[3..5]{prompt, options[2..4], answer, why}`·`winText`·`loseText`. 패배해도 재도전 무한, 원망 금지 |

**게임 상성 가이드**(저작 에이전트 필독): 목록 암기 개념 → MEMORY_GATE·PAIR_MATCH / 이분 판별 개념(동사vs준동사 등)
→ SPEED_OX·ODD_ONE_OUT / 문장 내 위치·식별 개념 → WORD_HUNT / 모든 레슨의 마무리 직전 → BOSS.

### 11.3 v2 필수 구성 (verify-lessons 게이트가 강제)

- 모든 레슨: `CONCEPT_INTRO` ≥1 (HOOK 바로 다음 권장) · `NOTEBOOK` ≥1 · **게임 블록 ≥3 (서로 다른 타입 ≥2)** · `BOSS` 정확히 1 (RECAP 직전 권장).
- PART 0(b유닛) 레슨: `MEMORY_GATE` ≥1 필수 (u유닛은 암기 목록이 있을 때 권장).
- `RULE.rule` ≤ 180자. 초과분은 NOTEBOOK/TABLE 로 구조화하라 — 게이트가 반려한다.
- 최소 블록 수 12 유지(게임 포함 시 실질 16+가 된다). 예문 하한 10 유지.
- CHECK·RECAP 문항은 **기존 파일의 것을 보존한다**(id·정답·문장 불변, 해설 오탈자 수정만 허용) —
  드릴 뱅크·숙달도(EWMA)가 문항 id 에 soft-ref 로 매달려 있다. **id 변경·삭제 = critical.**

### 11.4 톤 증보 (v1 §3.4 의 예외 신설)

기본은 여전히 **합니다체·비유아적**이다. 다만 다음 필드는 **게임 시스템 문자열**로 보고 위트를 허용한다
(반말 금지·이모지 금지·자기비하 강요 금지는 유지):
`BOSS.bossName/intro/winText/loseText` · `MNEMONIC.device` · 칭호 문자열(§13) · `MEMORY_GATE.passText/retryText`.
예: bossName "수식어 미궁의 문지기", passText "8품사가 손에 붙었습니다. 관문이 열립니다."

## 12. 어법 스텟 — XP·레벨·렌즈 축 (서버 정본: `src/lib/study-os/stats.ts`)

- **XP 원장**: 레슨 최초 완주 +80 / 재수련(2회차부터) +30 / CHECK·RECAP 정답 1개 +6 /
  게임 블록 클리어 +4·퍼펙트 +10 / BOSS 승리 +15. 전부 서버가 클램프(클라 신고는 힌트일 뿐).
- **레벨**: `level = floor(sqrt(xp/60)) + 1`. 레벨업 임계는 `nextLevelXp = 60·level²`.
- **렌즈 스텟(5축)**: 레슨 완주 XP를 레슨의 `lenses` 에 균등 배분(L1~L5). 상태창의 5축 바.
- **파트 스텟(4축)**: unitId → 파트(기초골격/골격기/연결기/정밀기)로 완주 XP 적산.
- 저장: 신규 테이블 `grammar_drill_stats`(학생당 1행, §15). 기존 테이블 무변경.

## 13. 칭호 엔진 (정본: `src/lib/study-os/titles.ts` — 순수 함수)

`computeTitles(snapshot) → { active, unlocked[], nextHints[] }`. 저장 없이 **상태의 함수**로 결정된다
(unlocked 이력만 stats 테이블 JSON 에 적재 — "언제 얻었나"용).

- **조합 칭호**: `접두(행동 패턴, 40+) × 코어(최강 렌즈·파트, 20+) × 등급(레벨 구간, 8)` ⇒ 6,400+ 경우의 수.
  - 등급: Lv1 견습 → 3 초심자 → 6 수련생 → 10 유단자 → 15 숙련자 → 20 달인 → 27 고수 → 35 종결자.
  - 저레벨 칭호는 **하찮게**("아직 8품사를 손가락으로 세는 견습"), 고레벨은 서사적으로.
- **특별 칭호**(조건 충족 시 조합 칭호를 덮는다): 재수련 누적·보스 연승·콤보 기록·기초 7유닛 전 완주·
  전 렌즈 균형("오각형 인간") 등 30+ 종.
- active 선정: 특별 > 조합. 동순위면 최근 획득.

## 14. 상태창 (컴포넌트: `src/components/study-os/status-window.tsx`)

게임 소설의 "상태창" 문법 — **어디서든 소환**한다.

- 진입점 3곳: GShell 헤더(스탯 아이콘) · 레슨 플레이어 헤더 · 레슨 완료 화면("상태창 확인").
- 표면: 풀스크린 오버레이. /g 라이트 지면 위에 **딥 네이비 시스템 패널**(`--gd-sys-*` 토큰, gd.css §"상태창")
  — 이중 테두리·모노 숫자·스캔라인 없는 절제된 게임 UI. 이모지 금지, lucide 만.
- 내용(위에서부터): 칭호(active) → Lv·XP 게이지(다음 레벨까지) → 판별 5렌즈 5축 바 →
  파트 4축 진행 → 전적(완주·재수련·보스전적·최고 콤보) → 칭호 컬렉션(미획득은 실루엣+힌트) .
- 데이터: `GET /api/grammar-drill/stats` (단일 소스). 열 때마다 fetch, 로딩은 스켈레톤.
- 레슨 완료 시 서버가 `xpGained`·`levelUps`·`newTitles` 를 반환 → 완료 화면이 **스탯 상승 연출**
  (+XP 카운트업, 렌즈 바 증가, 새 칭호 배너)을 재생한다.

## 15. 데이터 계약 증보

```sql
-- 어법 스텟 (학생당 1행) — scripts/sql/grammar-drill-stats.sql, prisma db execute 만(migrate 금지)
grammar_drill_stats(
  id, academyId, studentId UNIQUE,
  xp INT, lessonsCompleted INT, replays INT,
  gamesPlayed INT, gamePerfects INT, bossWins INT, bossLosses INT,
  memoryGatePasses INT, bestCombo INT,
  lensXp JSONB,   -- {"L1":0,...,"L5":0}
  partXp JSONB,   -- {"p0":0,"p1":0,"p2":0,"p3":0}
  titles JSONB,   -- [{"key":"...","earnedAt":"ISO"}]
  gameLog JSONB,  -- {"<conceptId>:<blockId>": {"plays":n,"best":"perfect"|"done"}} — XP 중복 지급 방지
  lastStudyDate DATE, streakDays INT, createdAt, updatedAt
)
```
- 레슨 저장 API(`POST /api/grammar-drill/lesson/[conceptId]`) body 증보:
  `gameEvents[]{blockId, result:"done"|"perfect"}` — 서버가 레슨 파일에서 블록 존재·게임 타입 여부를 검증한 뒤
  `gameLog` 대조로 **최초 1회만** XP 지급(perfect 승급 차액은 지급). 응답에 `xpGained·levelUps·newTitles` 포함.
- `GET /api/grammar-drill/stats`: 상태창 페이로드(§14). mastery·lessonProgress·stats 3원 취합.

## 16. v2 파일 소유권 원장 (팬아웃 충돌 방지)

| 파일 | 소유 |
|---|---|
| lesson-types.ts · lesson-schema.ts · lesson-payload.ts · verify-lessons.ts · gd.css · stats.ts · titles.ts · prisma/SQL · API 라우트 · lesson-player.tsx · lesson-done-screen.tsx · g-shell.tsx · 견본 b01-c1.json | **감독(본체)** |
| lesson-blocks-notebook.tsx / lesson-blocks-game-core.tsx / lesson-blocks-game-arena.tsx / status-window.tsx | 토대 에이전트 4기(각 1파일) |
| lessons/{conceptId}.json (75) | 저작 에이전트 75기(각 1파일, **전면 교체·멱등**) |
