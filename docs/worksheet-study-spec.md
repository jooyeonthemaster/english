# 학습지 스터디 모드 (Worksheet Study Mode) — 설계 정본 v1 (2026-07-20)

> 이 문서는 **규범(normative)** 이다. 이 기능을 만지는 모든 에이전트·작업자는 이 문서를 먼저 읽고,
> 여기 적힌 계약(타입·ID·클래스·톤·금지사항)을 어기지 않는다.
> 문서와 코드가 충돌하면 **문서를 고친 뒤** 코드를 고친다(스펙 착지 원칙).
> 리포 루트: `D:\Desktop\2026project\nara`

---

## 0. 한 줄 정의

**배포된 학습지(WORKSHEET 과제) 한 장을, 추가 AI 호출 0으로, 학생 폰·태블릿에서
단계별 인터랙티브 학습 코스로 변환한다** — 어휘 시험 → 직독직해 → 어법 → 빈칸 복원 →
어순/문장 배열 → 해석/영작 → 실전 문제 → 취약점 리포트까지.
원본 A4 뷰어는 그대로 유지하고(`/doc`), 그 위에 학습 레이어를 얹는다.

핵심 원천: `PassageReport.pages` 에 저장된 `AnalysisReport` JSON —
문장별 en/ko/청크(gloss·role), 어휘(tier·동의어·반의어), 어법 포인트(함정 예문),
셀프체크 퀴즈, 실전 학습지(cloze/drills/workbookSet/inferenceSet)가 이미 전부 구조화되어 있다.

---

## 1. 목표 / 비목표

**목표**
- G1. 학습지 1장 = 단계별 학습 코스. 학생은 스테이지를 순서대로(혹은 자유롭게) 완료.
- G2. 모든 문항은 기존 생성 데이터의 **결정론적 순수함수 파생**(AI 콜 0, seed 재현성).
- G3. 문항 단위 응답 로그 → 스킬축·문장·단어·어법코드 단위 취약점 분석(학생·교사 양면).
- G4. 모바일(390px)·태블릿(768px+) 각각에 강박적으로 최적화된 터치 UX(gd.css 체계).
- G5. 무회귀: 기존 뷰어·완료 플로우·이미 배포된 과제의 동작 보존.

**비목표 (v1)**
- 국어 학습지(`PRIME_KO`)와 Phase2(pages/blocks) 문서 → 스터디 모드 미지원, 기존 뷰어로 폴백.
- 서버측 재채점(부정 방지) — 어법 드릴·내신링고 선례와 동일하게 클라이언트 판정 신뢰.
- XP/랭킹 연동, 간격 반복(SRS), 오프라인 큐 — v2 훅만 남긴다.

---

## 2. 아키텍처 지도 (파일 소유권)

```
src/lib/worksheet-study/            ← 신설. 플레인 모듈(클라 공유 가능, 서버 전용 아님)
  types.ts        [본체]  타입 계약 정본 (StudyPlan/StudyStage/StudyItem/이벤트/상태)
  presets.ts      [본체]  프리셋(light/standard/intense)·스테이지 카탈로그 메타
  compile.ts      [본체]  AnalysisReport → StudyPlan 컴파일러 (순수·seed 결정론)
  grade.ts        [본체]  정답 정규화·비교·워드디프·점수·취약점 롤업 (순수)
  server.ts       [본체]  서버 전용: 상태 load-or-create·이벤트 반영·태스크 완료 연동

src/app/g/w/[taskId]/
  page.tsx        [본체]  허브 서버 페이지 (기존 파일 개편 — 문서판별·스터디 가용성 분기)
  hub-client.tsx  [U-hub] 허브 클라이언트 (스테이지 맵·이어하기·원본 CTA)
  doc/page.tsx    [본체]  원본 A4 뷰어 라우트 (기존 로직 이동)
  doc/…           [본체]  w-viewer-client.tsx 는 그대로 재사용(이동 없음, import 만)
  study/[stageId]/page.tsx        [본체]  스테이지 서버 페이지(가드+컴파일+상태)
  report/page.tsx      [본체]  리포트 서버 페이지(plan 에서 문장·단어뜻 파생 조립)
  report/report-client.tsx [U-report] 학생 결과·취약점 리포트 클라이언트

src/components/worksheet-study/     ← 렌더러는 라우트가 아닌 공용 컴포넌트로 (dev 하네스 공유)
  player-client.tsx   [본체·견본] 플레이어 셸(상태머신·재도전 큐·이벤트 플러시)
  item-registry.tsx   [본체]  type → 렌더러 매핑 (공유 파일)
  item-shared.tsx     [본체]  ItemRendererProps 계약·공유 프리미티브
  item-mc.tsx         [본체·견본] 4지선다 공용(어휘 퀴즈·셀프체크·수능추론)
  item-read.tsx       [U-read]   지문 통독 카드(문장·청크 직독직해 토글)
  item-flash.tsx      [U-flash]  어휘 플래시카드(3D 플립)
  item-match.tsx      [U-match]  매칭 그리드(동의어·반의어, 청크↔뜻)
  item-order.tsx      [U-order]  타일 어순 배열 + 문장 순서 카드
  item-cloze.tsx      [U-cloze]  빈칸 복원(단어은행 칩)
  item-grammar.tsx    [U-grammar] 어법 OX·인라인 택일
  item-production.tsx [U-prod]   해석 쓰기(자기채점)·백지 영작(타이핑+워드디프)

src/app/api/g/study/[taskId]/events/route.ts  [U-api] 이벤트 배치 수신 POST

src/actions/study-assignments/study-stats.ts  [U-director] 교사면 학습 현황 서버액션
src/components/study-assignments/study-report-tab.tsx [U-director] 과제 상세 학습 현황 탭
src/components/study-assignments/composer-config-form.tsx [본체] WORKSHEET 스터디 설정 추가

src/app/dev/worksheet-study/page.tsx [U-harness] 검증 하네스(픽스처, 무인증)

prisma/schema.prisma                 [본체] 모델 2종 추가 (relation-free)
prisma/migrations-manual/20260720_worksheet_study.sql [본체] surgical CREATE

tests/unit/worksheet-study-compile.test.mjs [U-test] 컴파일러 계약 테스트
tests/unit/worksheet-study-grade.test.mjs   [U-test] 채점 계약 테스트
```

**철칙**: 팬아웃 에이전트는 **자기 소유 파일만** 생성/수정한다. 공유 파일(types.ts, gd.css,
page.tsx, schema.prisma, composer)은 본체(감독) 소관. 렌더러는 `types.ts` 계약만 의존하고
서로 import 금지(공용 헬퍼가 필요하면 `items/item-shared.tsx` — 본체가 견본과 함께 제공).

---

## 3. 데이터 계약 (types.ts 정본 — 요지)

아래 형태를 `src/lib/worksheet-study/types.ts` 가 그대로 export 한다. 렌더러·API·DB가 전부
이 계약으로 통신한다. **여기 없는 필드를 임의 추가하는 것은 critical 위반.**

```ts
// ── 설정 (StudyAssignment.payload.study — WorksheetAssignmentPayload 확장) ──
export type StudyMode = "off" | "light" | "standard" | "intense";
export interface WorksheetStudyConfig {
  mode: StudyMode;          // off = 원본 뷰어만 (legacy 동작)
  required: boolean;        // true = 필수 스테이지 완료가 과제 완료 조건
}
// payload.study 부재(기배포 과제) → { mode: "standard", required: false } 로 해석:
// 스터디는 제공하되 완료는 기존 "다 확인했습니다" 버튼 유지(무회귀).

// ── 스테이지 ──
export type StudyStageId =
  | "reading" | "vocab-flash" | "vocab-quiz" | "vocab-match"
  | "chunk" | "grammar" | "cloze" | "order"
  | "translation" | "reproduction" | "exam";

export type StudySkill =
  | "vocab" | "chunk" | "grammar" | "cloze" | "order" | "production" | "comprehension";

export interface StudyStage {
  id: StudyStageId;
  title: string;            // "어휘 시험" 등 (합니다체 아님 — 명사형)
  subtitle: string;         // 한 줄 설명 (합니다체)
  skill: StudySkill;        // 대표 스킬축
  items: StudyItem[];       // 1아이템 = 1화면
  estMin: number;           // 예상 소요(분) — ceil(items × 유형별 초 / 60)
  graded: boolean;          // false = reading/flash (완료만 기록)
}

export interface StudyPlan {
  planVersion: 1;
  taskId: string;
  reportTitle: string;
  planHash: string;         // sha1(report.contentHash|seedKey|mode) — 드리프트 감지용
  seedKey: number;          // hash(taskId) — 학생별 결정론 셔플
  mode: Exclude<StudyMode, "off">;
  stages: StudyStage[];     // 콘텐츠가 없는 스테이지는 컴파일 단계에서 제외됨
  totalItems: number;
  vocabMeanings: Record<string, string>; // 표제어→뜻 — 리포트 취약 단어장용
}

// ── 아이템 (discriminated union — 렌더러 계약) ──
interface ItemBase {
  key: string;              // `${stageId}:${builder}:${n}` — 로그 조인 키 (plan 내 유일)
  skill: StudySkill;
  sentenceNo?: number;      // 취약 문장 히트맵용
  wordKey?: string;         // 어휘 표제어 (취약 단어장용)
  grammarCode?: string;     // 어법 포인트 코드 a–m
}
export type StudyItem =
  | (ItemBase & { type: "read"; n: number; en: string; ko: string;
      chunks?: { text: string; gloss?: string; role?: string }[] })
  | (ItemBase & { type: "flash"; front: string; back: string; sub?: string;   // sub=발음/tier
      extra?: { synonyms?: string; antonyms?: string } })
  | (ItemBase & { type: "mc"; prompt: string; promptEn?: boolean;             // promptEn=세리프 렌더
      passage?: string; choices: { label: string; text: string }[];
      answerLabel: string; explanation?: string })
  | (ItemBase & { type: "match"; leftHead: string; rightHead: string;
      left: string[]; right: string[]; answer: number[] })                    // answer[i]=left i의 right 인덱스
  | (ItemBase & { type: "order"; ko?: string; tiles: string[]; answer: string })
  | (ItemBase & { type: "sentence-order";
      given?: { en: string; ko?: string };
      cards: { label: string; en: string; ko?: string }[]; answer: string })  // answer="B-A-C"
  | (ItemBase & { type: "cloze"; segments: ({ t: string } | { blank: number })[];
      bank: string[]; answerKey: string[]; cue?: string })                    // blank=answerKey 인덱스
  | (ItemBase & { type: "ox"; statement: string; wrong: boolean;             // wrong=문장에 오류 있음
      fixFrom?: string; fixTo?: string; explanation: string })
  | (ItemBase & { type: "inline-choice"; before: string; after: string;
      options: string[]; answer: string; explanation?: string })
  | (ItemBase & { type: "self-grade"; en: string; modelKo: string })
  | (ItemBase & { type: "typing"; promptKo: string; answer: string;
      scaffold: "none" | "firstLetter" | "wordSlots"; hint?: string });

// ── 이벤트 (클라 → POST /api/g/study/[taskId]/events) ──
export interface StudyItemEvent {
  itemKey: string; skill: StudySkill;
  sentenceNo?: number; wordKey?: string; grammarCode?: string;
  attempt: number;              // 1=첫 시도, 2=재도전 큐
  correct?: boolean;            // 채점형
  selfGrade?: "O" | "D" | "X";  // 자기채점형(D=세모)
  response?: string;            // 학생 응답 요약(≤500자로 절단)
  timeMs: number;
  hintUsed: boolean;
}
export interface StudyEventsRequest {
  stageId: StudyStageId;
  planHash: string;
  events: StudyItemEvent[];
  /** 스테이지 완주 시. score=첫 시도 정답률(0~100), timeMs=스테이지 벽시계,
   *  firstCorrect/firstTotal=StudyStageState 파생용 원자료(가중 평균 숙달도 계산) */
  stageDone?: { score: number; timeMs: number; firstCorrect: number; firstTotal: number };
}
export interface StudyEventsResponse {
  ok: boolean;
  taskDone: boolean;            // 이번 플러시로 과제가 DONE 됐는지
  summary: StudyStateSummary;
}

// ── 상태 (서버 → 허브/플레이어) ──
export interface StudyStageState {
  status: "todo" | "in-progress" | "done";
  score?: number; timeMs?: number; completedAt?: string;
  firstCorrect?: number; firstTotal?: number;
}
export interface StudyStateSummary {
  stages: Partial<Record<StudyStageId, StudyStageState>>;
  masteryPct: number | null;    // 필수 채점 스테이지 첫시도 정답률 가중 평균
  totalTimeMs: number;
  weakness: StudyWeakness | null;
  requiredDone: boolean;
}
export interface StudyWeakness {
  skills: Partial<Record<StudySkill, { correct: number; total: number }>>;
  sentences: Record<string, { correct: number; total: number }>; // key=String(sentenceNo)
  words: { word: string; wrong: number; total: number }[];       // wrong>0 만, wrong desc 정렬
  grammar: Record<string, { correct: number; total: number }>;   // key=pointCode
}
```

---

## 4. 스테이지 카탈로그 · 파생 규칙 (compile.ts)

컴파일러는 `parseAnalysisReportForPreview`(preview-parse.ts)가 파싱한 `AnalysisReport` +
`extractGenContext`(study-activities.ts)의 `GenContext` 를 입력으로 받아 아래 규칙으로 스테이지를
만든다. **모든 셔플·선택은 `mulberry32(seedKey ^ 스테이지 해시)` 결정론.** 원천 데이터가 빈
스테이지는 조용히 제외(빈 items 스테이지 금지).

| id | 제목 | skill | 원천 → 파생 | 프리셋 |
|---|---|---|---|---|
| `reading` | 지문 통독 | comprehension | passage.sentences → read 아이템(문장 1개=1카드). 첫 카드 앞에 structure-map·summary 요약 read 카드 1장(en=thesisEn, ko=요약 3문장 결합, n=0) | 전부 |
| `vocab-quiz` | 어휘 시험 | vocab | rows를 seeded 셔플 후 cap(light 16/std 24/intense 40). 아이템 절반 word→meaning, 절반 meaning→word MC. 오답 3개=같은 학습지의 다른 rows meaning/headword(중복·동일값 제거, 부족 시 그 방향 아이템 스킵). challenge tier 는 intense 에서 typing(scaffold firstLetter) 으로 승격. **어휘 카드(vocab-flash) 단계는 코스에서 제외** — 학생은 이미 수업을 들었다는 전제이므로 암기 없이 바로 시험으로 진단한다(렌더러·타입은 유지, 프리셋 미포함) | 전부 |
| `vocab-match` | 동의어·반의어 | vocab | synonyms/antonyms 있는 rows → match 아이템(6쌍 그리드, syn 우선·부족분 ant). `derangement` 로 우측 셔플. 쌍<3 이면 스테이지 제외 | std+ |
| `chunk` | 직독직해 | chunk | chunksFull 있는 문장(우선순위: §4.1) cap(light 6/std 10/intense 전체). 문장당 아이템 2종 교차: (a) match — left=청크 en, right=gloss 셔플, (b) cloze — `generateActivityPayload("chunk-gloss-cloze")` 항목을 cloze 아이템으로 변환(bank=빈칸 청크 셔플) | 전부 |
| `grammar` | 어법 | grammar | (a) grammar.rows 중 example+exampleWrong+exampleCorrect 있는 행 → ox 아이템: 행마다 60% 확률(seeded)로 오류 문장(wrong=true, statement=example, fixFrom/To), 40% 확률로 교정 문장(wrong=false, exampleWrong→exampleCorrect 치환; 치환 실패 시 오류 문장 폴백). (b) learning-worksheet.drills.grammarChoices → inline-choice 택일. workbookSet.grammarSelection 은 v1 보류(지문 전역 인라인 마커 발췌가 취약 — v2 후보). cap: light 제외/std 12/intense 20 | std+ |
| `cloze` | 빈칸 복원 | cloze | `generateActivityPayload("keyword-cloze", density 30, wordBank)` → 문장당 cloze 아이템. intense 는 추가로 nested 2라운드(밀도 55) 아이템 뒤에 붙임. workbookSet.vocabularyCloze 는 뜻 단서(cue) 포함 cloze 로 뒤에 추가(cap 8) | 전부 |
| `order` | 어순 배열 | order | (a) `generateActivityPayload("chunk-scramble")` 우선순위 문장 cap(light 제외/std 8/intense 12) → order 아이템(tiles=chips, ko 표시). (b) drills.wordOrders/workbookSet.wordOrders → order 아이템(ko=korean, tiles=chunks 셔플). (c) 문장 ≥4 이면 sentence-order 1문항(`generateActivityPayload("sentence-order")` 의 order 레이아웃, anchor first) | std+ |
| `translation` | 해석 쓰기 | production | 우선순위 문장 cap(std 5/intense 8) → self-grade 아이템(en → 모범 ko 공개 후 O/△/X) | std+ |
| `reproduction` | 백지 영작 | production | 우선순위 문장 cap(intense 6) → typing 아이템(promptKo=ko, answer=en, scaffold: 1~2번째 wordSlots, 이후 firstLetter→none 사다리) | intense |
| `exam` | 실전 문제 | comprehension | (a) self-check.questions(choices 있는 것만) + answers 조인 → mc. (b) learning-worksheet.inferenceSet.questions(5) → mc(passage 포함). (c) workbookSet.topicGist → mc 1문항(주제 고르기: 정답=topicTitle, 오답=exam-focus type 들에서 파생 불가 시 스킵). light 는 (a)만 | 전부 |

### 4.1 우선순위 문장 선택 (결정론)

production/order/chunk 계열 cap 적용 시 문장 선택 순서:
1. grammar.rows·learning-worksheet.logicRows·parsing.items 가 참조하는 sentenceNo (중요 문장)
2. chunksFull 에 emphasis "core" 청크가 있는 문장
3. 나머지 — 단어 수 내림차순
동률은 seeded 셔플. 선택 후 **문장 번호 오름차순으로 재정렬**해 출제(지문 흐름 유지).

### 4.2 아이템 수 가드

- 스테이지당 items ≤ 48(STAGE_ITEM_CAP — reading 40문장+인트로 수용), plan 전체 ≤ 300(PLAN_ITEM_CAP).
- 문장 캡(프리셋): chunk light 6/std 10/intense 16 · cloze light 8/std 14/intense 20(+고밀도 2회차 8).
- MC 오답 후보가 3개 미만이면 그 아이템 스킵(엉터리 보기 금지).
- cloze bank 는 정답 + 같은 스테이지 다른 정답에서 디코이 ≤ 2 (bank ≤ 12칩).

### 4.3 예상 소요(estMin)

유형별 초당 추정: read 12s, flash 6s, mc 15s, match 30s, order 25s, cloze 30s,
ox 12s, inline-choice 12s, self-grade 25s, typing 60s, sentence-order 60s.
`estMin = max(1, ceil(Σ초/60))`.

---

## 5. 채점 규칙 (grade.ts)

```ts
export function normalizeEn(s: string): string
// lowercase → 스마트따옴표/대시 정규화 → 구두점 제거(하이픈·아포스트로피는 유지) → 공백 축약
export function gradeTyped(input: string, answer: string): { correct: boolean; diff: WordDiff[] }
// 정답 판정 = normalizeEn 완전 일치. diff = 단어 단위 LCS(same|missing|extra|typo)
// typo = 편집거리 1 이내 단어 매칭 — 판정은 오답이되 UI 가 "거의 맞았습니다" 표시
export function gradeOrder(picked: string[], answer: string): boolean   // normalizeEn(join) 일치
export function gradeCloze(inputs: string[], answerKey: string[]): boolean[]
export function selfGradeScore(g: "O" | "D" | "X"): number              // 1 / 0.5 / 0
```

- **스테이지 점수** = 첫 시도 기준: `round(100 × Σ(첫시도 정답 or selfGradeScore) / 채점 아이템 수)`.
- **재도전 큐(완전학습)**: 오답 아이템은 스테이지 말미에 1회 재출제(attempt=2). 재도전 결과는
  점수에 미반영, 로그에는 기록(개선 추적). 재도전에서도 틀리면 정답·해설을 보여주고 통과.
- **masteryPct** = 필수 채점 스테이지 score 의 아이템 수 가중 평균.
- **취약점 롤업**: 첫 시도(attempt=1)만 집계. self-grade 는 O=정답, △/X=오답으로 카운트.

---

## 6. DB (relation-free, surgical SQL)

`prisma/schema.prisma` 에 추가 — FK 없는 soft-ref(하우스 스타일), 적용은
`npx prisma db execute --file prisma/migrations-manual/20260720_worksheet_study.sql`.
**`prisma migrate` / `db push` 금지.**

```prisma
/// 학습지 스터디 모드 — 학생×태스크 상태 (태스크당 1행, plan 은 저장하지 않고 매 로드 재컴파일)
model WorksheetStudyState {
  id           String    @id @default(cuid())
  academyId    String
  taskId       String    @unique // StudyAssignmentTask soft-ref
  assignmentId String
  studentId    String
  reportId     String    // PassageReport soft-ref
  planHash     String?   // 마지막 플러시 시점 plan 해시(정보용 — v2: 거절 사유로 쓰지 않음)
  stageStates  Json      @default("{}") // Record<StudyStageId, StudyStageState>
  weakness     Json?     // StudyWeakness 캐시(플러시마다 재계산)
  masteryPct   Int?
  totalTimeMs  Int       @default(0)
  startedAt    DateTime?
  completedAt  DateTime? // 필수 스테이지 전부 done 된 시각
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([academyId, assignmentId])
  @@index([studentId, updatedAt])
  @@map("worksheet_study_states")
}

/// 문항 단위 응답 로그 (append-only, GrammarDrillAttempt 선례)
model WorksheetStudyItemLog {
  id          String   @id @default(cuid())
  academyId   String
  stateId     String   // WorksheetStudyState soft-ref
  studentId   String
  stageId     String
  itemKey     String
  skill       String
  sentenceNo  Int?
  wordKey     String?
  grammarCode String?
  attempt     Int      @default(1)
  correct     Boolean?
  selfGrade   String?  // "O" | "D" | "X"
  response    String?  @db.Text
  timeMs      Int?
  hintUsed    Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@unique([stateId, stageId, itemKey, attempt]) // 중복 플러시 멱등(skipDuplicates)
  @@index([stateId, createdAt])
  @@index([academyId, studentId, createdAt])
  @@map("worksheet_study_item_logs")
}
```

SQL 파일은 20260711_study_assignments.sql 의 형식(따옴표 camelCase, IF NOT EXISTS,
인덱스 포함)을 그대로 따른다.

---

## 7. 서버 런타임 (server.ts + events API)

- `loadStudyContext(taskId, studentId, academyId)` — task(WORKSHEET 확인)·report 로드,
  문서판별(PRIME 영어만), config 해석, `compileStudyPlan` 호출, state upsert(없으면 생성 +
  startedAt), `{ task, plan, summary, lockState }` 반환. 허브/플레이어 페이지 공용.
- `applyStudyEvents(...)` — events POST 처리: 소유 검증 → CLOSED/잠금이면 403(단, DONE 태스크의
  복습 플레이는 로그만 허용하되 stageStates 는 갱신하지 않음… 아니, 단순화: CLOSED 또는
  availableFrom 미래만 403. DONE 이후 복습은 로그·상태 갱신 허용하되 completedAt/DONE 은 불변) →
  `createMany(skipDuplicates)` 로그 → stageStates 병합(stageDone 오면 done 승격, score 는 최초
  완료값 유지=첫 학습 정직성, 이후 재학습은 bestScore 로 갱신하지 않음) → weakness/mastery 재계산
  (로그 재조회 없이 stageStates.first* 누적 + 이벤트 증분) → 필수 스테이지 전부 done 이고
  config.required 이고 태스크가 DONE 아니면 `status="DONE", completedAt` 마킹(complete 라우트와
  동일 잠금 규칙) → summary 반환.
- 취약점 재계산은 **이벤트 증분 방식**: state.weakness 에 attempt=1 이벤트만 누적 합산.
  (로그 테이블 풀스캔 금지 — 교사면 통계는 로그 테이블에서 직접 groupBy.)

### 7.1 이벤트 무거절 원칙 (v2 — 2026-07-20 개정, 정본)

- **planHash 불일치로 이벤트를 거절하지 않는다.** v1 의 409 PLAN_DRIFT 거절은 코드
  배포·학습지 편집 시 진행 중인 모든 학생 세션의 답안을 통째로 유실시켰다(실측 재현:
  17:50 마지막 수신 → 17:52 컴파일러 수정 → 이후 어휘 스테이지 전체 답안 소실).
- 서버는 planHash 가 달라도 로그 append·스테이지 병합·취약점 누적을 전부 수행한다
  (stageId 카탈로그는 코드 버전 간 안정). 응답에 `planStale: boolean` 을 실어 클라가
  "다음 입장 시 새 구성" 안내만 하게 한다 — 기록은 계속 저장된다.
- 요청 `progress: { answered, total, firstCorrect, firstTotal }` (선택) 를 in-progress
  스테이지 상태에 병합(answered 는 max 승격) → 디렉터 매트릭스가 부분 진행을 표기한다.
- `StudyPlanDriftError` 는 폐기한다.

라우트 가드는 기존 패턴 그대로: `getGrammarSession()` → `loadOwnedStudentTask` →
`FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL`. 학생 노출 문구는 전부 **합니다체**, 기술 스택 문구 금지.

---

## 8. 라우팅 · 화면 UX 스펙

### 8.1 `/g/w/[taskId]` — 허브 (기존 라우트 개편)

서버 분기:
1. task 없음/kind≠WORKSHEET → 기존 ViewerFallback.
2. 잠금(availableFrom 미래·CLOSED 미완료) → 기존 잠금 안내(현행 유지).
3. 문서가 PRIME 영어가 아니거나 `config.mode === "off"` 또는 컴파일 결과 채점 스테이지 < 2
   → **기존 뷰어 그대로 렌더**(WViewerClient — 현행과 픽셀 동일, 무회귀).
4. 그 외 → 허브 렌더.

허브 화면(모바일 1열, `.gd-page`):
- 헤더: 뒤로(`/g/tasks`)·"학습지" 라벨·제목·D-day 칩. 선생님 안내문 밴드(뷰어와 동일 규칙).
- 진행 히어로 카드(`.gd-card`): 원형 아님 — `.gd-meter` + "N/M 단계 완료 · 숙달도 NN%" +
  이어하기 CTA(`.gd-btn-primary` 전폭, 다음 미완료 스테이지로).
- 스테이지 리스트: 스테이지당 `.gd-card` 행 — 좌측 번호 배지(`.gd-step-n` 스타일), 제목·subtitle·
  `estMin분·N문항`, 우측 상태(todo=화살표 / in-progress=진행 % / done=점수 배지 `.gd-good`).
  순차 잠금 없음(자유 진입) — 단 표시 순서는 §4 표 순서.
- 하단 유틸 행: `원본 학습지 보기`(→ `/doc`, `.gd-btn-ghost`) · `결과 리포트`(done ≥1 부터 활성).
- legacy 완료(required=false) 과제: 리스트 하단에 기존 "다 확인했습니다" 버튼 유지
  (뷰어가 아닌 허브에서도 완료 가능해야 무회귀). required=true 면 완료 버튼 없음 —
  "필수 단계를 모두 완료하면 과제가 완료됩니다" 안내(`.gd-t-xs`, ink-2).
- DONE 태스크: 상단에 `확인 완료` 배지(`--gd-good`), 모든 스테이지 재도전 가능(복습 모드 라벨).

### 8.2 `/g/w/[taskId]/doc` — 원본 뷰어

기존 `WViewerClient` 를 그대로 렌더. 변경점 딱 하나: **스터디 활성(required=true) 과제에선
하단 완료 푸터 대신** "학습 단계를 완료하면 과제가 완료됩니다 · 학습으로 돌아가기" 버튼
(→ 허브). 그 외(off/legacy)는 현행 완료 버튼 유지. `initialDone` 등 props 계약 불변.
뒤로가기는 허브로(스터디 활성 시) / `/g/tasks`(off 시).

### 8.3 `/g/w/[taskId]/study/[stageId]` — 플레이어 (몰입 풀스크린, 셸 미적용)

구조 (100dvh flex-col, 뷰어와 동일 골격):
- 상단 크롬: 닫기(X → 허브, 미플러시 응답 있으면 `.gd-sheet` 확인시트 "저장하고 나가기/계속하기"),
  스테이지 제목(`.gd-t-sm` bold), `.gd-seg` 진행 세그먼트(아이템 수, done=good).
- 본문: 아이템 렌더러 1개(`.gd-page` 폭, 세로 스크롤 허용). 영어는 `.gd-en`(세리프),
  한글 keep-all. 지문 참조 아이템(passage 있는 mc)은 접이식 지문 카드(기본 접힘, 탭 펼침).
- 액션 배치: **"확인"은 렌더러 본문 하단**(입력 컨트롤 바로 아래 — 유효성·활성 조건이
  렌더러 소유라 셸로 끌어올리면 상태를 이중 관리해야 한다), **"다음"은 하단 고정 바**.
  하단 고정 바(`.gd-safe-b`)는 판정 전 "문제를 풀면 바로 채점됩니다" 안내,
  판정 후 `.gd-verdict` 배너(정답=good "정답입니다!" / 오답=bad) + "다음" 버튼.
  오답 해설은 `explanation` 있으면 항상 노출.
- 인터랙션 규칙(전부 **탭 기반**, 드래그 금지 — /g 하우스 스타일):
  - mc: `.gd-option` 리스트, 선택→하단 확인. 판정 후 correct/wrong data-state.
  - match: 2열 그리드 `.gd-match-card` — 좌 탭 → 우 탭 → 즉시 판정(맞으면 matched 고정,
    틀리면 shake 후 해제 + 해당 쌍 오답 1회 기록). 전 쌍 완료 시 아이템 판정 = 오답 0회 여부.
  - order: 상단 답안 슬롯 행 + 하단 `.gd-tile` 풀 — 탭하면 슬롯에 추가, 슬롯 탭하면 회수.
    전부 배치 후 확인. ko 힌트는 상단 상시 노출(params.koPosition 반영).
  - cloze: 문장 안 `.gd-blank` 슬롯(활성 슬롯 파랑 테두리) + 하단 단어은행 칩(`.gd-btn-chip`).
    칩 탭 → 활성 슬롯 채움 → 자동 다음 슬롯. 채운 슬롯 탭 → 회수. 전부 채우면 확인 활성.
  - ox: 큰 O/X 버튼 2개(정사각 `.gd-option`) + wrong=true 판정 시 fixFrom→fixTo 표시.
  - inline-choice: 문장 인라인 [A/B] 칩 택일.
  - self-grade: 1탭 = en 표시 + "해석을 떠올려 보세요" → 2탭 "정답 보기" → modelKo 공개 +
    O/△/X 3버튼(good/ink/bad 톤). 스스로 평가 안내 문구 필수.
  - typing: `<textarea>`(자동 높이, autocapitalize/autocorrect/spellcheck off) + scaffold 표시
    (wordSlots=글자수 ▁ 슬롯 줄, firstLetter=첫글자 힌트 줄). 판정 후 워드디프 렌더 —
    **missing(빠뜨린 정답 단어)=초록 굵게 + "빠짐" 표기, extra(학생이 더 쓴 단어)=빨강
    취소선, typo=파랑 밑줄 + "거의 맞았습니다"**. (취소선은 "지울 것", 초록은 "채울 것"
    이라는 교정 관습을 따른다.)
  - read: 문장 카드 — en(세리프, 크게) + ko 토글(기본 숨김, "해석 보기" 버튼), chunks 있으면
    "직독직해" 토글로 청크 세로 리스트(text + gloss + role 칩). 하단 "다음 문장".
  - flash: 카드 탭 = 뒤집기(CSS transform, reduced-motion 존중), 하단 "다음 카드".
- 스테이지 종료: 재도전 큐 소진 후 요약 화면(플레이어 내) — 점수 대형 숫자(`.gd-mono`),
  첫시도 정답 N/M, 소요 시간, 오답 아이템 리스트(문장번호·정답), CTA "다음 단계"(허브의
  다음 미완료 스테이지) / "허브로". 이때 stageDone 플러시.
- 이벤트 플러시 (v2 — 무손실 실시간 계약):
  - **채점 판정은 문항마다 즉시 플러시**, 무채점 전진은 1.2초 디바운스(연타 배칭).
  - stageDone 은 ref 로 보관 — 성공 응답까지 매 플러시에 동봉, 실패 시 4초 백오프 재시도.
  - 동시 플러시는 드롭이 아니라 **큐잉**(in-flight 종료 후 잔여 버퍼 재플러시).
  - 언마운트 시 keepalive fetch 플러시(SPA 내비는 pagehide 가 안 뜬다) + pagehide 는
    sendBeacon 유지. 버퍼는 localStorage 미러(taskId·stageId 키)로 탭 크래시 복원.
  - 서버 응답 `planStale` 시 부드러운 안내만(기록은 저장됨) — 이벤트 폐기 금지.
  - attempt 카운터는 아이템별 로컬 관리(불변).

### 8.4 `/g/w/[taskId]/report` — 학생 결과 리포트

`.gd-page` 1열: 종합 카드(masteryPct 대형, 총 학습 시간, 완료 스테이지) → 스킬축 바 차트
(recharts 금지 — `.gd-sys-bar` 유사 순수 CSS 바 7축) → 취약 문장 히트맵(문장번호 칩 그리드,
오답률로 good→bad 3단 톤) + 탭하면 해당 문장 en/ko 시트 → 취약 단어장(오답 단어 리스트,
word·meaning·오답 횟수) → 어법 취약 코드(있으면) → CTA "오답 다시 풀기"(오답 아이템만 모은
가상 스테이지 `review` — 플레이어 재사용, 로그 attempt=3+, 상태 비갱신).

### 8.5 태블릿(768px+)

- 허브: `.gd-page` 가 자동 44rem — 스테이지 리스트 `.gd-grid-2` 2열.
- 플레이어: 본문 max-width 44rem 중앙. match 그리드 2→3열(쌍 6개↑일 때), flash 카드 중앙 32rem.
- report: 히트맵·단어장 2열.
- 별도 브레이크포인트 추가 금지 — gd.css `@media (min-width: 768px)` 블록에만 추가.

### 8.6 신규 CSS

`src/app/g/gd.css` 말미에 `/* ── 학습지 스터디 모드 (docs/worksheet-study-spec.md §8) ── */`
섹션으로 본체가 추가한다. 클래스 접두 `gd-st-*` (예: gd-st-slot, gd-st-flash, gd-st-heat).
기존 클래스 재사용이 원칙 — 신규는 렌더러가 필요로 하는 최소만. 렌더러 에이전트는 gd.css 를
직접 수정하지 말고 필요한 클래스를 결과 보고에 명시(본체가 취합 반영).

---

## 9. 배포 컴포저 (디렉터면)

`composer-config-form.tsx` WORKSHEET 분기에 "모바일 학습 모드" 섹션 추가:
- 세그먼트: `원본만 / 가볍게 / 표준(기본) / 최대` (`StudyMode` off/light/standard/intense).
- 체크: "학습 단계 완료를 과제 완료 조건으로" (기본 on, mode=off 면 숨김).
- 미리보기 줄: 선택 모드의 스테이지 구성 요약("어휘 시험·직독직해·빈칸 복원 등 7단계 · 약 25분").
- `createStudyAssignment` input.worksheet 에 `study?: WorksheetStudyConfig` 전달 →
  payload 병합. 기존 호출부는 study 없이도 동작(옵셔널).

## 10. 과제 상세 학습 현황 (디렉터면)

`study-stats.ts` 서버액션:
- `getWorksheetStudyOverview(assignmentId)` → 학생별 행(스테이지 상태 매트릭스·masteryPct·
  총시간·완료시각) + 반 집계(스테이지별 평균 점수, 최다 오답 문장 top5, 최다 오답 단어 top10,
  어법 코드별 오답률) — 로그 테이블 groupBy 사용, academyId 스코프 필수.
`study-report-tab.tsx` — 과제 상세 모달의 **결과 분석 탭(WORKSHEET kind 내용)** 으로 렌더.
(개정 2026-07-21: 구 "조건부 '학습 현황' 탭 추가" 조항은 director-console-spec §3.1
"3탭 고정·kind별 조건부 탭 금지" 계약으로 대체됨 — 탭이 아니라 결과 분석 탭의 내용이다.)
매트릭스는 가로 스크롤 테이블(모바일 대응), 취약점은 칩·바 렌더. 데이터 없으면
"아직 학습을 시작한 학생이 없습니다" 빈상태.

---

## 11. 무회귀 보증 (검수 렌즈)

1. `config.mode==="off"` / PRIME_KO / PAGES 문서 → `/g/w/[taskId]` 는 **현행 뷰어와 픽셀 동일**.
2. 기배포 과제(payload.study 없음) → 뷰어·허브 어디서든 "다 확인했습니다" 로 완료 가능(현행 유지).
3. `WViewerClient` props·내부 로직 불변(이동 없이 import 경로만 doc/page.tsx 로 추가).
4. `/api/g/tasks/[taskId]/complete` 계약 불변.
5. `StudentTaskCard.actionHref` 는 계속 `/g/w/{taskId}` (허브가 뷰어 폴백을 겸하므로 변경 불필요).
6. **학생(/g) 표면의** 시험(EXAM)·문제(QUESTIONS)·어법(GRAMMAR) 플로우 무접촉.
   (개정 2026-07-21: 이 조항은 학습지 스터디 모드 구축 당시의 스코프 조항이며,
   디렉터면의 과제 관제 통합(director-console-spec §3, v3 design)은 이 조항의
   위반이 아니다. 서버 편성 로직(어법 assignment 큐 취약 가중)도 학생 시각
   결과물 무접촉이면 허용 — v3 design D2-4.)
7. schema.prisma 는 additive 만(기존 모델 수정 0줄).
8. `study-activities.ts`·`worksheet-surface.ts` 는 **읽기 전용 재사용**(수정 금지 — 인쇄 경로 공유).

## 12. 검증 게이트

1. `npx tsc --noEmit` (라운드마다) → `npm run lint` → `npm run build`(최종).
2. `node --test tests/unit/worksheet-study-*.test.mjs` — 컴파일러(스테이지 구성·cap·결정론
   seed 재현·빈 섹션 강등·itemKey 유일성)·채점(정규화·디프·cloze) 계약.
3. dev 하네스 `/dev/worksheet-study`: `RECALL_RECOGNITION_FIXTURE` 로 plan 컴파일 → 허브·
   플레이어(스테이지 셀렉터)·리포트를 무인증 렌더. Playwright 로 390×844 / 768×1024 / 1180×820
   3뷰포트 × 주요 화면 스크린샷 + 행동 테스트(MC 정답 탭→verdict, cloze 칩 채움, order 타일,
   flash 뒤집기). **스크린샷 표본 3장은 본체가 먼저 육안 검증 후 검수 함대 발사(계기 우선).**
4. 적대 검수 함대: 정확성(파생 데이터가 원본과 일치하는가)·UX(터치 타깃·오버플로·줄바꿈)·
   무회귀(§11 체크리스트)·전역 정합(문구 합니다체·라벨 일관) 4렌즈.

---

## 13. 문구·톤 규칙

- 학생 노출 문구 전부 **합니다체** ("정답입니다", "아쉽습니다 — 정답을 확인해 보세요").
- 두려움 조장 금지, 격려 톤. 오답 시 비난성 문구 금지.
- 영어 원문은 항상 `.gd-en` 세리프. 라벨은 `.gd-label` 소형캡.
- 아이콘은 lucide-react 만. 이모지 금지(gd 하우스 스타일).
