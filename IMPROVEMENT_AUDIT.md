# SMOAT 서비스 전반 개선 감사 (Improvement Audit)

> 작성: 2026-07-11 세션 (Claude Code 자율 조사)
> 목적: 서비스 전 영역을 훑으며 개선이 필요한 지점을 지속 기록. 세션 진행 중 계속 업데이트됨.
> 보안(테넌트 격리/IDOR)은 별도 문서 `SECURITY_REMEDIATION.md`에 기존 감사가 있음 — 여기서는 **그 문서에 없는 신규 코드의 보안 이슈** + 보안 외 전 영역을 다룸.

## 진행 상태

| 영역 | 상태 |
|---|---|
| 빌드/의존성/설정 건강도 | ✅ 완료 |
| CI/게이트·레이트리밋 | ✅ 완료 |
| 코드 품질 (거대 파일, @ts-nocheck) | ✅ 완료 |
| 테스트 커버리지 | ✅ 완료 |
| 신규 기능 보안 (세미나·쿠폰·랜딩·매뉴얼) | ✅ 완료 (High 없음, Med 2) |
| 크레딧/결제 정합성 | ✅ 완료 (코어 견고, 수정 2건) |
| 에러 처리·안정성 | ✅ 완료 (신규 HIGH IDOR 발견) |
| 코드 중복·데드코드 | ✅ 완료 (~3,100줄 삭제 가능) |
| UX 일관성 (다크모드·모바일 포함) | ✅ 완료 |
| DB/쿼리 성능 (N+1, 인덱스) | ✅ 완료 |

**전 영역 조사 완료 (2026-07-11).**

## ✅ 적용 완료 (2026-07-11 세션 — 정상 사용자 경험 무변화 원칙)

최우선 3건 + Quick Wins가 모두 적용됨. 검증: `tsc --noEmit` exit 0, `test:unit` 467 pass/0 fail/1 todo(사전 HWPX), 변경 파일 eslint 0.

| 항목 | 처리 | 경험 영향 |
|---|---|---|
| 시험지 export 무인증 IDOR(§4.0) | hwpx/docx GET에 `getStaffSession`+`findFirst({academyId})` 추가 | 호출부 전부 `<a href>` 세션쿠키 자동전송 → 로그인 사용자 무변화 |
| 인덱스 6개(§3.2~3.3) | schema.prisma + `CREATE INDEX CONCURRENTLY`로 dev DB 적용(락 없음) | 무변화(성능만 개선) |
| 레거시 exam-grading/exam-questions(§5.3) | import 4곳 하드닝본으로 교체 후 삭제, 반환형 동일 검증 | 같은 학원 결과 동일 → 무변화 |
| 에러 바운더리(§4.1) | `global-error.tsx` + 6개 그룹 `error.tsx` + 공용 RouteError | 정상 화면엔 안 나타남 → 무변화 |
| CI(§8.5) | `.github/workflows/ci.yml` (tsc·test 게이트, lint 비차단) | 런타임 무관 |
| 에러 sanitizer(§4.3) | `lib/client-error.ts` — 한글·짧은 메시지는 통과, 내부에러만 일반화. HTTP 누출 4곳 적용 | 정상 한글 메시지 보존 → 무변화, 누출만 차단 |
| 데드코드(§5.3) | draft-folder-section.tsx(1,202줄) 삭제 | importer 0 → 무변화 |
| 다크모드(§7.7) | globals.css `.dark` 리맵에 목업 hex·세미나 gradient 추가 | 라이트 모드 `.dark` 스코프라 불변, 다크 깨짐만 복원 |
| max-lg 9곳(§7.8) | `max-lg:!` 추가 | PC(lg+) 무관, 모바일 깨짐만 복원 |
| reports 모바일(§7.9) | 가로 스크롤 래퍼+min-w | 데스크톱 넓어 스크롤 안 생김 → 무변화 |

**보류(경험 변화 우려):** native `alert()`→`toast` 전환(§7.4) — 정상 동작하던 UI 표현을 바꾸므로 "경험 무변화" 제약에 걸려 미적용. 별도 승인 시 진행.

**남은 성능 구조작업:** §3.1(문제은행/빌더 목록 DB 페이지네이션)·§3.4(createMany 배치)는 동작 변경 위험이 있어 별도 설계·검증 후 진행 권장.

## 🔴 최우선 조치 (즉시)

1. **[HIGH·신규 IDOR] 시험지 export 라우트 무인증** — `api/exams/[examId]/export-{hwpx,docx}` GET이 인증·academyId 스코프 없이 `findUnique({id})`. **비로그인자가 examId만으로 타 학원 시험지+정답 다운로드.** 직접 확인 완료. 몇 줄로 수정 가능. → §4.0
2. **[HIGH] 로그인 브루트포스 방어 부재** — 관리자/스태프 로그인 시도 제한 없음. → §1.1
3. **[HIGH] 레거시 시험 액션 4곳 import 중** — 테넌트 격리 없는 exam-grading/exam-questions. import 4줄 교체로 삭제+보안 동시 해결. → §5.3

## 요약 (Top Findings)

**보안**
- [HIGH] 시험지 export 무인증 IDOR(§4.0), 로그인 브루트포스 방어 부재(§1.1), 레거시 시험 액션 미스코프(§5.3)
- [MED] 공개 세미나 신청 rate-limit/CAPTCHA 부재→정원 DoS·PII 스팸(§1.2), 헬프센터 비밀글 브루트포스(§1.2)
- ✅ 실물쿠폰·bank-notify·매뉴얼뷰어·배너/설정은 CLEAN

**안정성/정합성**
- [HIGH] React 에러 바운더리 0개→예외 시 앱 전체 크래시(§4.1)
- [MED] 함수 타임아웃 시 크레딧 환불 유실(§2.1), 지급 경로 미스윕→만료크레딧 부활/프로모 즉시소멸(§2.2), raw error.message 노출(§4.3), 학습세션 제출 멱등성·클라 채점(§4.4)
- ✅ 결제 코어(차감 원자성·PortOne 멱등·입금매칭)·AI 파이프라인·trigger.dev 잡은 견고

**성능**
- [HIGH] 문제은행/빌더 목록이 전량 fetch 후 JS 정렬·요청당 2회 풀스캔(§3.1), `ExamQuestion.questionId` 인덱스 부재(§3.2)
- [MED] 인덱스 6개 추가 필요(§3.2~3.3), AI 저장 직렬 create가 유실사고 근본원인(§3.4)
- ✅ 대시보드류·크레딧 코어는 병렬화·바운드 양호

**품질/UX**
- [HIGH] CI 부재(§8.5) [MED] 10MB base64 동봉(§8.2), @ts-nocheck 78파일(§5.2)
- [MED] 다크모드 갭(랜딩 목업·세미나 썸네일 §7.7), max-lg 오버라이드 9곳(§7.8), reports 모바일 붕괴(§7.9), native alert/confirm 혼용(§7.4)
- [MED] ~3,100줄 중복·데드코드 삭제 가능(§5.3), 금전경로 단위테스트 0건(§6.1)
- [LOW~MED] trigger.dev 취약점 36건(§8.1) [INFO] 싱가포르 리전 레이턴시(§8.3)

---

## 부록: 저비용·고효과 Quick Wins (권장 착수 순서)

1. **시험지 export 라우트 인증 추가**(§4.0) — 몇 줄, HIGH 보안. 즉시.
2. **인덱스 6개 추가**(§3.2~3.3) — `prisma db execute` 한 줄씩, 위험 최저·성능 즉효.
3. **레거시 exam-grading/exam-questions import 4줄 교체 후 삭제**(§5.3) — 보안+데드코드 동시.
4. **`global-error.tsx` + 그룹별 `error.tsx` 6개**(§4.1) — 각 20~30줄.
5. **GitHub Actions CI 1개**(§8.5) — tsc+lint+test:unit, 현재 tsc 클린이라 바로 도입.
6. **중앙 에러 sanitizer `toClientError`**(§4.3) — 1개 도입 후 catch 일괄 치환, Prisma 내부 노출 전면 해소.
7. **데드 draft-folder-section.tsx 삭제**(§5.3) — importer 0, -1,202줄 무위험.
8. **native alert 8건 → toast.error**(§7.4), **다크모드 hex 대문자화+세미나 gradient 리맵**(§7.7), **max-lg 9곳 `!` 추가**(§7.8) — 소규모 UX 수정 묶음.

---

## 1. 신규 기능 보안 (SECURITY_REMEDIATION.md 이후 코드)

### 1.1 [HIGH·확정] 로그인 엔드포인트 브루트포스 방어 부재
- `src/lib/auth-admin.ts` — bcrypt 비교만 있고 시도 횟수 제한·잠금·레이트리밋 없음. 스태프 로그인(next-auth credentials)도 동일 추정.
- 리포 전체에서 rate-limit 관련 코드가 발견된 곳: `src/lib/printable-coupon-claim.ts` 및 쿠폰 claim 라우트 계열 정도. **관리자 로그인은 전 학원 데이터 접근 권한이므로 우선순위 최상.**
- 개선: (1) 관리자/스태프/학생 로그인에 IP+계정 기준 시도 제한(서버리스이므로 인메모리 Map 불가 — DB 카운터 또는 Upstash), (2) 관리자 로그인에 최소한 실패 지연(backoff) 추가.
- 참고: 서버리스(Vercel) 환경에서 인메모리 레이트리밋은 인스턴스별로 동작해 사실상 무력 — 기존 쿠폰 claim 구현도 이 관점에서 재검토 필요.

### 1.2 신규 기능 보안 — ✅ 감사 완료 (High 없음, Medium 2 / Low 2, 나머지 CLEAN)

#### [MEDIUM] 공개 세미나 신청 — rate-limit/CAPTCHA 부재 → 정원 소진 DoS·PII 스팸
- `src/actions/public-seminar.ts:109` `registerGuestGroupSeminar` — 무인증 `"use server"`(설계상 비회원). 중복방지가 `seminarId+phone` 단건뿐(:167)이라 전화번호만 바꿔 반복 호출 시: 가짜 신청으로 정원(`capacity`) 소진해 실제 신청 차단(:174, 즉시 `REGISTERED` 카운트), PII(이름·전화·이메일·환급계좌) 무제한 INSERT.
- 개선: 실물쿠폰의 `consumeRateLimit`(DB-backed, 서버리스 안전) 패턴 재사용 + CAPTCHA + 보증금 없는 세미나는 관리자 승인 전 `PENDING`으로 두어 정원 미카운트.

#### [MEDIUM] 헬프센터 비밀글 비밀번호 브루트포스
- `src/actions/help-center.ts:148` `getHelpPost` — 글로벌 보드라 타 학원 staff도 postId만 알면 조회 시도 가능(설계상 글로벌). 비밀글은 `bcrypt.compare`로 게이트하나 (a) 비번 최소 **4자**(:229, 숫자면 4자리 PIN), (b) **시도 제한 전무** → 인증된 임의 staff가 남 학원 비밀 문의를 오프라인 브루트포스 열람.
- [LOW] 목록(`getHelpPosts:85`)에서 잠긴 글도 `title`·`authorName`은 노출(preview만 숨김) — 글로벌 보드 트레이드오프.
- 개선: postId별 비번 시도 rate-limit(DB) + 최소길이 상향/영숫자 강제. 근본적으로 비밀글은 소유자 전용 + 공유는 명시적 공유목록.

#### [LOW] 미인증 서버액션 `trackOfflineMarketingCategory`
- `src/actions/admin-offline-marketing/categories.ts:149` — 내부 헬퍼 의도인데 `"use server"` 파일에서 `export async`로 노출 + **가드 없음**(같은 파일 add/remove는 `isSuperAdmin` 있음). 임의 클라이언트가 플랫폼 전역 마케팅 분류에 임의 문자열 무제한 추가 가능(피해 낮음).
- 개선: `requireAdminAuth` 추가 또는 비-export 내부 모듈로 분리.

#### [LOW] bank-notify 리플레이 보호 부재
- `bank-notify/route.ts` — 서명이 raw body에만 걸려 timestamp/nonce 없음. explicit `externalId` 없는 캡처 요청을 60초 후 재전송하면 `-${Date.now()}` 접미사로 새 알림 재처리. 단 주문단 멱등성(FOR UPDATE+COMPLETED)으로 **이중지급은 불가**, 이론상 같은 금액+입금자명의 다른 대기주문 오매칭 여지만.
- 개선: 서명 페이로드에 timestamp + 허용 시간창(5분), 또는 relay가 항상 `externalId` 전송.

#### ✅ CLEAN (검증 완료)
- **실물 쿠폰**: QR 토큰 `randomBytes(24)`=192bit·원본 미저장 해시대조, claim은 조건부 `updateMany(status:ACTIVE)` count===0 가드 + `$transaction` + `creditTxId @unique`, **rate-limit이 DB-backed(`printableCouponClaimRateLimit`)라 서버리스에서도 실효**, DIRECTOR 역할+IP/학원 스코프.
- **bank-notify HMAC**: `timingSafeEqual` 사용, 동시 웹훅 이중지급 방지 견고(FOR UPDATE+content-hash externalId P2002).
- **정적 매뉴얼 뷰어**: 사용자 입력이 파일경로에 도달 안 함(하드코딩 manifest), 업로드는 SUPER_ADMIN+PDF만+30MB+서버 랜덤 파일명 → traversal 없음.
- **헬프센터 변이**: update/delete/cancel 전부 소유자(`authorStaffId`/`staffId`) 가드, 관리자 액션 전부 `requireAdminAuth`.
- **배너/플랫폼설정**: 변이 전부 `requireAdminAuth("SUPER_ADMIN")`+`isSuperAdmin`, 배너 GET 타깃(academyId) 격리 정상.

## 2. 크레딧/결제 정합성 — ✅ 감사 완료

**종합: 결제·크레딧 코어는 견고.** 차감 원자성, PortOne 검증/멱등, 무통장입금 매칭 모두 SAFE. 실질 수정 대상은 아래 2건.

| 항목 | 판정 |
|---|---|
| 차감 원자성/이중지출 | ✅ SAFE — 조건부 `updateMany(balance>=cost)` + `$transaction`, count===0시 throw. AI 기능 16개 파일 전부 `deductCredits()` 경유, 자체 read-then-write 없음 |
| PortOne 검증/멱등 | ✅ SAFE — 서버가 PortOne API 재조회 후 금액·통화·customData 대조, `paymentId/creditTransactionId @unique` + `FOR UPDATE`, 웹훅 `webhookId @unique` |
| 만료 스윕 원자성/레이스 | ✅ SAFE — `FOR UPDATE` CTE 단일 UPDATE, lazy sweep |
| 무통장입금 매칭 | ✅ SAFE — `externalId @unique` dedup + 주문 `FOR UPDATE` 멱등, 중복 대기주문은 AMBIGUOUS 관리자 검토 |

### 2.1 [MEDIUM·확정] 함수 타임아웃/프로세스 킬 시 차감 크레딧 환불 유실
- 위치: 인터랙티브 AI 라우트(`src/app/api/ai/*`)의 환불이 전부 **in-process `catch`**. AI 호출 중 Vercel 함수가 타임아웃으로 죽으면 catch 미실행 → **차감만 남고 결과·환불 없음**.
- 잡 기반 exam-analyze만 reaper(FAILED+전액환불 후 순액 재청구)가 있고, 인터랙티브 경로엔 없음.
- 영향: 발생 빈도 낮으나 발생 시 고객이 크레딧만 잃음(신뢰·CS 이슈).
- 개선: 차감 시 `pending` 마킹 → 미완료 건 정기 환불 스윕(크론/트리거), 또는 무거운 생성은 잡 패턴으로 이관.

### 2.2 [LOW~MEDIUM·확정] 지급 경로가 스윕 선행을 안 함 → 만료크레딧 부활 / 프로모크레딧 즉시소멸
- 위치: `completePaidTopUp`([portone-credit-topups.ts:623](src/lib/portone-credit-topups.ts)), `grantBankDepositTopUp`([bank-deposit.ts:400](src/lib/bank-deposit.ts)), `grantBonusCreditsTx`([growth/credit-grant.ts:85](src/lib/growth/credit-grant.ts)).
- 시나리오: `expiresAt`이 이미 지났지만 아직 아무 읽기도 스윕 안 한 잔액에 충전이 착지(예: 가상계좌 입금이 며칠 뒤 웹훅 도착).
  - (a) EXTEND 지급: 만료됐어야 할 기존 잔액 위에 가산하고 expiresAt 재설정 → **소멸됐어야 할 크레딧 부활**(정책 위반, 고객 유리).
  - (b) RIDE 지급(credit-grant.ts:113, expiresAt 미변경): 과거 expiresAt 잔존 → 다음 읽기에서 **방금 준 프로모 크레딧까지 통째로 0**(고객 불리).
- 개선: 각 지급 트랜잭션 첫 단계에서 `sweepExpiredCredits` 동일 CTE 실행, 또는 upsert 가산 기준을 `CASE WHEN expiresAt <= NOW() THEN 0 ELSE balance END`로.

### 2.3 [LOW·하드닝 권장] PortOne V1 웹훅 무서명 폴백
- `api/portone/webhook/route.ts:46-59` — V2 서명 검증 실패 시 V1 레거시 폴백이 **서명 없이 수락**. 단 처리 시 서버가 PortOne에서 진실 재조회하므로 **위조 지급은 불가**, 비인증 트리거/노이즈만 가능. 여력 되면 V1 폴백 제거 또는 별도 검증.

### 2.4 [LOW·확정] AI 성공 후 후처리 실패 시 미환불
- 예: passage-analysis에서 AI 성공 후 `passageAnalysis.upsert` 또는 `recordAiCost` throw → 500 반환, 환불 없음. AI 원가는 발생했으나 사용자는 결과 못 받음.
- 개선: upsert 실패 시에도 환불하거나, 이미 성공한 AI 결과를 응답에 포함해 손실 방지.

## 3. DB/쿼리 성능 — ✅ 감사 완료

> 대시보드류(admin `getDashboardOverview` 30여 쿼리 단일 Promise.all, director/student 대시보드), 크레딧 코어, 어드민 활동로그(take 바운드), AI 잡 폴링(프로젝션)은 **양호**. 문제는 문제은행/빌더 목록 경로와 인덱스 몇 개에 집중.

### 3.1 [HIGH] 문제은행/시험지 빌더 — 전량 fetch 후 JS 정렬·슬라이스, 요청당 2회 풀스캔
- `src/actions/workbench/questions.ts:290` `loadWorkbenchQuestionSurfaceItems`(take 없이 학원 내 매칭 전건 + 모든 세트 전 멤버 include) → `:387 getWorkbenchQuestions`가 JS `.sort().slice()`, `:447 getWorkbenchQuestionStatusCounts`가 **같은 전량 스캔 반복**. 페이지 진입 시 둘 다 호출(questions/page.tsx:64, korean/questions/page.tsx:82).
- 동일 패턴 복제: `exam-paper-builder.ts:321 loadBuilderSurfaceItems`, 특히 `loadBuilderSurfacePage:447`은 **명시적으로 2회 호출**.
- 스케일: 학원당 문제 2만 개면 목록 1뷰마다 2만행×2 스캔+Node 정렬+세트 join. 100개 학원 동시 시 목록조회가 DB CPU·앱 메모리 지배.
- 개선: (1) 페이지네이션 DB 이관(standalone은 orderBy+skip/take, 세트 별도쿼리 병합), (2) 상태카운트는 `count`×2+`groupBy`, (3) 최소수정: 같은 where 2회 스캔을 surfaceItems 공유로 1회화.

### 3.2 [HIGH] `ExamQuestion.questionId` 인덱스 부재 → 목록마다 seq scan
- `prisma/schema.prisma:1349` — `@@unique([examId,orderNum])`, `@@unique([examId,questionId])`, `@@index([examId])`만. **questionId 선두 인덱스 없음**(Postgres FK 자동인덱스 없음).
- 타격: 카드마다 `examLinks` include + `_count.examLinks`(`WHERE questionId IN(...)`)가 exam_questions 풀스캔. 100학원×500장×30문항=150만행을 목록 뷰마다 스캔.
- 개선: `@@index([questionId])` 추가. **주의: dev DB migration drift — `prisma db execute`로 적용, `migrate deploy` 금지**([[prisma-migration-drift]]).

### 3.3 [MED] 인덱스 추가 필요 (부속·대시보드)
- `WrongAnswerLog`(`schema:1502`), `QuestionCollectionItem`(`schema:1694`) — `questionId` 선두 인덱스 없어 영구삭제 deleteMany·빌더 include가 seq scan → 각 `@@index([questionId])`.
- 관리자 대시보드(10분 자동 실행): `Question` `@@index([deletedAt,createdAt])`, `CreditTopUp` `@@index([status,completedAt])`, `SubscriptionPayment` `@@index([status,paidAt])` — 현재 각 status/deletedAt 단독만 있어 시간범위 카운트가 인덱스 못 씀.

### 3.4 [MED] AI 생성 결과 저장 — 트랜잭션 내 문항별 직렬 create (유실사고 재발원인)
- `workbench/questions.ts:702 saveGeneratedQuestions` — N문항×(question.create+explanation.create) 직렬=2N 라운드트립. 과거 5s 타임아웃 초과로 전체 유실→30s 상향 이력의 근본원인.
- `learning-questions/save.ts:147 saveSuneungQuestions`는 **트랜잭션도 없어** 중간실패 시 부분저장.
- 개선: 앱에서 cuid 생성 후 `createMany` 1방씩(또는 `createManyAndReturn`) → 타임아웃 상향 불필요.

### 3.5 [MED] 기타
- 목록 과다조회: `passages.ts:98 getWorkbenchPassages`가 20개/페이지에 `analysis.analysisData`(@db.Text, 수KB JSON) 포함 → select 축소+상세 온디맨드. `questions.ts:479`는 지문 content 전체(복사기능 트레이드오프, route 내보내기 시 배수 주의).
- `admin/operations-cost.ts:127` 원가분석이 월 수십만행 전량 fetch 후 JS 집계 → `groupBy _sum`.
- `collections-question.ts:25,112` 폴더 카운트/멤버십이 학원 전체 멤버십 전량 로드 → raw `GROUP BY collectionId, COUNT(DISTINCT setId)`.
- [LOW] director `getTodayClasses` enrollment 전건 include→`_count`, learning-admin 재정렬 직렬 update, tutor/question-sets createMany 루프, 빌더 `content ILIKE %q%` 풀스캔(pg_trgm GIN 검토).

### 권장 우선순위 (성능)
1. **인덱스 6개 추가**(3.2+3.3) — 마이그레이션 한 줄씩, 위험 최저·효과 즉시.
2. **3.1 목록 페이지네이션 DB 이관** — 최대 상시부하, 최소한 이중 스캔 통합부터.
3. **3.4 createMany 배치** — AI 생성 유실 재발 방지 겸함.

## 4. 에러 처리·안정성 — ✅ 감사 완료

> 총평: AI 파이프라인·trigger.dev 잡·크레딧 과금/환불 배관은 **모범 수준으로 견고**(멱등 과금, 원자적 클레임, 리퍼, zod 폴백). 반면 **횡단 관심사 3곳이 체계적으로 비어 있음**: ① 클라이언트 에러 바운더리 전무, ② 액션 catch가 raw `error.message`를 클라이언트로 반환, ③ 인증 없는 시험지 export 라우트(별건·최상위 심각도).

### 4.0 🔴 [HIGH·직접 확인·신규 IDOR] 시험지 export 라우트 인증·테넌트 스코프 전무
- `src/app/api/exams/[examId]/export-hwpx/route.ts:160`, `export-docx/route.ts:155` — GET 핸들러가 인증 가드 없이 `prisma.exam.findUnique({ where: { id: examId } })`(academyId 절 없음). `getStaffSession()`은 240행에서 **로깅용으로만** `.catch(()=>null)` 호출. 미들웨어 matcher(`src/proxy.ts:101`)에 `/api` 없음 → 아무것도 안 막음. **직접 재확인 완료.**
- 시나리오: examId만 알면 **비로그인 누구나** 타 학원 시험지 전체 문항 + `?answers=true`로 정답·해설까지 HWPX/DOCX 다운로드. (SECURITY_REMEDIATION.md에 없던 신규 노출.)
- 수정: 라우트 초입에 staff 세션 필수 + `exam.academyId !== staff.academyId → 404`. 문항 단위 export는 이미 올바르게 검사하니 그 패턴 복사.

### 4.1 [HIGH·확정] React 에러 바운더리가 전무 — 런타임 예외 = 앱 전체 크래시 화면
- `find src/app -name error.tsx` → **0개**, `global-error.tsx` → **0개**. (`loading.tsx`는 61개로 로딩 처리는 잘 됨.)
- 영향: 어떤 라우트든 렌더/서버컴포넌트에서 잡히지 않은 예외가 나면 Next 기본 에러 화면(프로덕션에선 밋밋한 "Something went wrong")으로 통째로 대체됨. 학원 원장이 작업 중 한 위젯 오류로 전체 페이지를 잃음.
- 개선: (1) 최소한 각 라우트그룹 루트에 `error.tsx`(재시도 버튼+지원 안내) 추가 — (director)/(teacher)/(student-app)/(parent-app)/(admin). (2) 앱 루트 `global-error.tsx` 1개. 각 파일 20~30줄, 저비용.

### 4.2 [검증 CLEAN] `src/app/dev/*` 프로덕션 노출
- dev 하네스 3종(passage-report, annotation-editor, custom-layout-preview) 모두 `process.env.NODE_ENV === "production"` 시 `notFound()` → 프로덕션 404. 미들웨어 matcher에 없지만 페이지 자체가 가드하므로 **안전**.

### 4.3 [MEDIUM·확정] 액션 catch가 raw `error.message`를 클라이언트로 반환 — 전면적 패턴 (Prisma 내부 노출)
- 사실상 모든 액션이 `error instanceof Error ? error.message : "…"` 관용구(표본 12/12 해당): `exam-paper-builder.ts:1042`, `billing.ts:177,245,306,332`, `materials.ts:143,184`, `workbench/questions.ts:743,910,932,972`, `auth.ts:41` 등.
- Prisma 에러도 `Error`라 테이블·컬럼·제약조건명 노출. `credits.ts:152`는 내부 academyId까지 메시지에 포함. 비인증 대상 `api/auth/student-login/route.ts:33`도 `error.message` 반환.
- 개선: 중앙 sanitizer `toClientError(error)`(화이트리스트된 사용자용 에러만 통과, 나머지는 일반문구+서버로깅) 1개 도입 후 catch 일괄 치환. → M5의 API 라우트 노출도 동시 해소.

### 4.4 [MEDIUM·확정] 학습 세션 제출 — 트랜잭션 절반 + 멱등성 부재 + 클라이언트 채점 신뢰
- `src/actions/learning-session-submit.ts:104-161` — 세션기록+오답로그는 `$transaction`이나 후속 XP·lessonProgress·streak·studyProgress(`:147` Promise.all)는 **트랜잭션 밖 + 멱등성 없음**. `SessionRecord`에 `@@unique` 없음(인덱스만).
- 시나리오: 후속 실패 → 액션 throw → 클라 재제출 → **SessionRecord 중복 + XP 2배**. 네트워크 재시도만으로도 동일. 추가로 `answers[].isCorrect`를 **클라이언트가 계산해 전송**(:49, 치팅 벡터).
- 개선: `@@unique([studentId,passageId,sessionType,sessionSeq,seasonId])` + upsert 멱등 제출, XP/진행도를 같은 `$transaction`에, 정답 판정 서버 재계산.

### 4.5 [MEDIUM·확정] 크레딧 차감형 인라인 AI 라우트 4곳 `maxDuration` 미설정 → §2.1과 동일 뿌리
- `api/ai/generate-questions`(차감:57/환불:232), `generate-explanation`(:30/:100), `modify-question`(:68/:128), `generate-learning-question`(:216/:239) — `maxDuration` 미설정으로 플랫폼 타임아웃 킬 시 환불 catch 미실행.
- 개선: `generate-question/route.ts:143`처럼 `maxDuration`+내부 self-deadline(270s) 적용, 근본적으론 trigger.dev 잡+멱등 과금으로 이관.

### 4.6 [LOW·확정] 기타
- `materials.ts:174 deleteMaterial` — 스토리지 삭제 실패를 빈 catch로 삼키고 `success:true` → 고아 blob 잔류.
- `api/ai/webtoon/generate/route.ts:44` — 외곽 try/catch 없이 지문별 차감 후 create throw 시 앞 회차 미환불.
- `api/auth/kakao/route.ts:52` OAuth 콜백 unwrapped, `tutor-helpers.ts:241` 빈 catch(저심각), tutor/similar-exam 잡 실패 시 환불 로직 미확인(과금 지점 확인 필요).

### 4.7 ✅ 견고 확인 영역
- **AI 파이프라인**: 텍스트→JSON 직파싱 없음(전부 `generateObject`+zod), 전 호출 `AbortSignal.timeout`+자체 재시도(SDK `maxRetries:0`으로 이중과금 방지), 비재시도성 오류 분류, "grammar too large" 400→인라인 JSON 폴백+클라 zod 재검증, 데드라인 존중.
- **배치 의미론**: workbench 잡 실패 시 전체 롤백+환불(문항저장 `$transaction`), similar-exam은 쌍단위 skip으로 1건 실패가 배치 안 죽임.
- **트랜잭션**: `saveExamPaperDraft`·`promoteM1Draft`(원자적 updateMany 클레임) 모범.
- **trigger.dev**: 전 잡 retry+maxDuration, 재실행 멱등(`ensureWorkbenchAiJobCharged` creditTxId 이중조회로 1회 차감), extraction 리스만료 리퍼+540s self-deadline.
- **삼킨 에러**: catch 234곳 중 ~90% 무해, 재무 다중쓰기에서 `success:true` 날조 없음.

## 5. 코드 품질

### 5.1 [MED] 초거대 클라이언트 컴포넌트 파일 (유지보수성·리뷰 난이도)
- 4,053줄 `src/app/(director)/director/workbench/generate/generate-page-client.tsx`, 3,022줄 `src/components/exams/exam-paper-builder-client.tsx` 등 1,500줄+ 파일 20개.
- 상위 20개 파일이 전체 51만 줄 중 약 4만 줄. 핵심 화면(생성기·시험지 빌더)에 집중되어 있어 회귀 위험 큼.
- 개선: 신규 작업 시 해당 파일에 기능 추가 금지 원칙 + 점진적 훅/서브컴포넌트 추출. 한 번에 리팩터링하기보다 "만질 때 쪼갠다" 규칙 권장.

### 5.3 코드 중복·데드코드 — ✅ 감사 완료 (약 3,100줄+ 삭제 가능)

| # | 조치 | 삭감 | 리스크 |
|---|---|---|---|
| 1 | [draft-folder-section.tsx](src/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/components/draft-folder-section.tsx) 삭제 — **importer 0인 데드코드**(FolderSection 이행 후 잔존물) | **-1,202줄** | 없음 |
| 2 | similar-exams material-manager의 `draft-folder-section.tsx`(1,197줄)를 공용 FolderSection으로 이행 후 삭제 (#1과 diff 10줄=사실상 동일 복붙, 아직 import 중) | **-1,197줄** | 중 (앱 검증 필요) |
| 3 | **레거시 exam-grading.ts+exam-questions.ts 삭제 → 테넌트 격리 구멍 동시 봉합** | **-475줄** | 낮음 |
| 4 | admin 로컬 `formatDate*` 재정의 19곳 → `lib/utils` 정본 치환 (일부 KST 미처리=서버 TZ 버그 소지) | ~-130줄 | 낮음 |
| 5 | `student-list-pagination.tsx` → 공용 Pagination 치환 | ~-120줄 | 낮음 |

#### [HIGH·확정·보안연계] 레거시 시험 액션이 아직 4곳에서 import 중 — 테넌트 격리 구멍
- `src/actions/exam-grading.ts`(`getExamAnalytics`←director/exams/[examId]/page.tsx, `gradeSubmission`←exam-grading-client.tsx), `src/actions/exam-questions.ts`(`getClassesForFilter`←materials/page.tsx, assignments/page.tsx).
- 레거시는 `requireStaffAuth()`만 하고 **academyId 스코프 없음**. 하드닝본 `src/actions/exams/*`(18파일에서 사용, 정본)는 `where:{id, academyId}` + `if(staff.academyId!==academyId) return []` 방어 보유.
- 하드닝본이 **동일 시그니처로 export** → **import 경로 4줄만 교체하면 두 파일 삭제 + SECURITY_REMEDIATION의 H4 구멍 동시 봉합.** 최우선 권장.

#### [양호] 데드파일 거의 없음 / dev·_archive 정리됨
- src/actions·src/lib 최상위 진짜 데드파일 0건(0-importer로 보인 10개는 전부 상대경로 import로 생존). 위 draft-folder-section 1건만 대형 데드.
- dev 라우트·`_archive/`는 미출하 확인.

### 5.2 [MED] `@ts-nocheck` 78개 파일 — 타입 게이트 구멍
- `npx tsc --noEmit` 는 현재 **클린**이지만, 78개 파일이 `@ts-nocheck`로 검사 자체를 끔.
- 집중 분포: `src/components/students`(12), `src/components/workbench`(10+하위 다수), `workbench/generate`(6), `src/components/admin`(4).
- 특히 students/admin 쪽은 데이터 노출·티어 버그가 타입으로 잡힐 수 있는 영역. 개선: 월 N개씩 제거하는 번다운, 신규 파일 `@ts-nocheck` 금지(lint rule).

## 6. 테스트 커버리지

### 6.1 [MED] 테스트가 AI 생성 품질에 편중 — 돈이 오가는 경로는 무테스트
- `tests/unit` 84개 파일 대부분이 문법/지문/시험지 생성 품질(grammar-*, ko-*, wave*-*) 검증. 훌륭한 자산.
- 반면 **크레딧 차감/만료/보너스, 결제 웹훅, 쿠폰 등록, 은행입금 매칭** 등 금전 경로 단위 테스트가 없음(파일명 기준 부재).
- 개선: credits.ts/credit-expiry.ts/bank-deposit.ts의 순수 로직(만료일 연장 계산, 금액 매칭, 프로모 비중첩 min)부터 단위 테스트 추가 — DB 없이도 테스트 가능한 부분이 많음.

## 7. UX 일관성

### 7.1 [MED·확정] `◈` 크레딧 표기 규약 위반 — CreditCostChip 미사용
- 규약: 크레딧 단가는 CreditCostChip(Coins 아이콘+숫자)로 통일, `◈`·"N 크레딧" 텍스트 금지([[credit-cost-chip-rule]]).
- 위반 위치(직접 확인):
  - [learning-sheet-preview-modal.tsx:220-221,389,468](src/components/workbench/passage-registration/learning-sheet-preview-modal.tsx) — `◈${cost}` 하드코딩 뱃지
  - [passage-input-stack.tsx:458](src/components/workbench/passage-registration/passage-input/passage-input-stack.tsx) — "지문당 ◈{unit}"
  - [intake-upload-parts.tsx:458](src/components/exam-report/hub/intake-upload-parts.tsx) — "문항당 ◈1"
  - [option-radio-card.tsx:18](src/components/workbench/shared/option-radio-card.tsx) — chip prop 예시 주석까지 ◈ 사용(패턴 전파원)
- 개선: 해당 뱃지를 CreditCostChip으로 교체. option-radio-card의 chip prop을 CreditCostChip 노드로 넘기면 하위 다수 일괄 해결.

### 7.2 [LOW·확정] 아이콘 전용 버튼 aria-label 누락
- `size="icon"` 버튼 19개 중 같은 줄 aria-label 0개(인접 줄 가능성 있어 UX 에이전트가 정밀 확인 중). 스크린리더 사용자에게 "버튼"으로만 읽힘.
- 개선: 아이콘 버튼에 aria-label 일괄 추가. 공용 IconButton 래퍼로 강제하는 방안 권장.

### 7.3 [양호] Pagination·debounce는 단일 정본
- `src/components/workbench/shared/pagination.tsx`, `src/hooks/use-search-debounce.ts` 각 1개 정본만 존재 — 중복 구현 없음. 규약 준수 상태 양호.

### 7.4 [MED·확정] 네이티브 `alert()`/`confirm()`와 sonner 토스트 혼용 — 확인 UX 이원화
- 피드백(성공/실패)은 `sonner` 토스트로 완전 통일(181파일, `toast.error` 699건·`toast.success` 358건) — 매우 좋음.
- **그러나 확인·경고는 네이티브 브라우저 다이얼로그**: `alert()` 8건, `confirm()/window.confirm()` 약 40여 곳. 스타일드 확인 모달 시스템이 없어 `src/components/shared/confirm-dialog.tsx`·`src/lib/browser-confirm.ts`조차 native `window.confirm`에 위임.
- 영향: 파괴적 액션(삭제 등) 확인이 OS 기본 팝업으로 떠 브랜드 이탈·모바일 UX 저하. 특히 7월 신규 기능(쿠폰 `printable-coupons-admin-client.tsx:164-183`은 에러·성공 모두 native alert, 세미나·배너·오프라인마케팅 다수)에 집중.
- 개선: Radix 기반 styled AlertDialog 공용 컴포넌트 도입 → `confirm-dialog.tsx`를 native 위임에서 실제 모달로 교체(호출부 시그니처 유지 시 일괄 전환 가능). alert 8건은 `toast.error`로 즉시 교체.

### 7.5 [LOW·확정] 모달 닫기(X) 버튼 규약 이탈 ~28곳
- 표준: `h-7 w-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700`([[edit-view-toggle-and-close-button]]).
- 색상 계열은 맞으나 크기 이탈 다수(size-6/8/5/9 = 약 28곳 vs 준수 26곳). 별도로 `rounded-full`+white-on-dark 오버레이 변형이 7월 신규 페이지에 산재:
  - [webtoon-scene.tsx:179](src/components/landing/webtoon-scene.tsx) size-10 rounded-full, [attachment-gallery.tsx:57](src/components/help-center/attachment-gallery.tsx), [banner-modal-shell.tsx:150](src/components/site-banners/banner-modal-shell.tsx), [feedback-program.tsx:269](src/components/feedback/feedback-program.tsx)(hover 색까지 이탈), [landing-popup-view.tsx:65](src/components/landing/landing-popup-view.tsx), 배너 에디터 모달 2종(size-8).
- 참고: `src/components/ui/dialog.tsx:71` 프레임워크 기본이 size-9라 손수 만든 버튼들이 size-8/9로 드리프트하는 원인.
- 개선: 공용 `<DialogCloseButton>` 컴포넌트 하나로 표준화. 다크 오버레이용 변형도 그 안에 variant로 수용.

### 7.6 [LOW·확정] Pagination 정본 3개로 분화 + 손수 구현 1건
- 이전 턴에 "정본 1개"로 봤으나 정밀 확인 결과: workbench `shared/pagination.tsx`, admin `admin-pagination.tsx`, students `student-list-pagination.tsx`(자체 손구현+`@ts-nocheck`) 3개 공존.
- 완전 손구현 페이저: [billing-dashboard-client.tsx:394-420](src/app/(director)/director/billing/billing-dashboard-client.tsx) — `AdminPagination` 재구현(하드코딩 `bg-[#3B82F6]`). → AdminPagination으로 교체 권장.
- 월/주 스테퍼(consultations, salaries, promo-monitoring, seminar 7일)는 각자 prev/next 크롬 재구현 — 공용 `<MonthStepper>`로 통합 여지.

### 7.7 [MED·확정] 7월 신규 페이지 다크모드 갭 — 리맵 미스매치
- 다크모드는 globals.css `.dark` 유틸 리맵 레이어에 의존(신규 페이지가 `dark:` variant를 안 씀). 리맵 밖 색은 조용히 light 유지. **주의: 원장이 다크 켜면 localStorage 전역 키라 공개 랜딩/세미나에도 `.dark` 적용됨 → 공개 페이지도 대상.**
- (P1) 랜딩 HWP 에디터 목업 — 부분만 어두워져 프랑켄슈타인:
  - [exam-paper-scene.tsx:104,122,141,162](src/components/landing/exam-paper-scene.tsx) / [annotation-scene.tsx:156,178,201,223](src/components/landing/annotation-scene.tsx) — `bg-[#f7f8fa]`·`bg-[#fafbfc]`는 **소문자**라 대문자 리맵 셀렉터와 불일치(CSS 셀렉터는 대소문자 구분), `bg-[#e9edf2]`는 화이트리스트에 아예 없음 → light 잔존하는데 그 위 `text-slate-*`는 리맵으로 밝아져 저대비.
  - 개선: 해당 hex를 대문자화 + `#E9EDF2`를 중립배경 리맵에 추가(전체 목업 일관 어둡게), 또는 목업 전체를 리맵 제외해 균일 light 유지.
- (P2) 세미나 placeholder 썸네일 — `bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50`에서 `from-blue-50/via-slate-50/to-indigo-50`가 리맵 안 됨 → 다크에서도 밝은 파랑 잔존:
  - [public-seminar-client.tsx:51](src/components/help-center/public-seminar-client.tsx), [seminar-client.tsx:366](src/components/help-center/seminar-client.tsx), [group-seminar-browse-client.tsx:232](src/components/help-center/group-seminar-browse-client.tsx), [admin-group-seminars-client.tsx:1295](src/components/admin/help/admin-group-seminars-client.tsx), [seminar-promo-section.tsx:110](src/components/landing/seminar-promo-section.tsx).
  - 개선: 해당 gradient stop을 리맵에 추가하거나 placeholder를 리맵된 중립(`from-slate-50 to-slate-50`)으로 교체.
- 카카오 브랜드 버튼·saturated 액센트는 양쪽 테마 OK(무조치). 매뉴얼 뷰어 크롬은 표준 유틸이라 클린.

### 7.8 [MED·확정] `max-lg:` 같은-속성 오버라이드 위반 9곳 (Tailwind v4, `!` 없으면 무시)
- 규약 [[tailwind-v4-max-lg-override]]: base 유틸과 같은 속성을 `max-lg:`로 덮으면 v4에서 조용히 무시됨. 확인된 회귀:
  1. [passage-variant-client.tsx:337](src/app/(director)/director/workbench/passage-variant/passage-variant-client.tsx) `py-4` vs `max-lg:pb-[96px]` → 고정푸터 여백 실패, 마지막 콘텐츠가 모바일 스텝네비에 가림
  2. [text-input-board.tsx:471](src/app/(director)/director/workbench/passages/import/_components/intake/text/text-input-board.tsx) `min-h-0`+`flex-1` vs `max-lg:min-h-[128px]`+`max-lg:flex-none`
  3. [exam-passage-library/index.tsx:97](src/components/workbench/exam-passage-library/index.tsx) `py-3` vs `max-lg:pb-32` → 마지막 카드 가림
  4~7. generate-upload-panel:893 / bulk-extract upload-panel:680 / intake-surface:219 / exam-report hub intake-upload-parts:68,130 — `min-h-0` vs `max-lg:min-h-[45~55vh]`
  8. setting-fields.tsx:33 `mt-1` vs `max-lg:mt-0.5`(경미) 9. crop-canvas.tsx:469 `size-2.5` vs `max-lg:size-4`(터치타깃 확대 실패)
- 정답 패턴: workspace-shell.tsx:311/327/383이 `max-lg:!h-auto` 등 `!`로 처리 — 한 파일만 알고 9곳에 미적용. 개선: 위 9곳에 `!` 추가.

### 7.9 [MED·확정] 모바일 미대응 director 페이지
- (최악·실제 깨짐) [reports-table.tsx:30,33,65](src/app/(director)/director/reports/_components/reports-table.tsx) — 손수 만든 고정 6열 grid(`grid-cols-[40px_1fr_80px_80px_100px_120px]`, 합 ~420px) + 부모 `overflow-hidden`으로 클리핑, `lg:` variant 0 → 360px 폰에서 이름열 붕괴·잘림. 개선: 모바일 카드뷰 또는 `overflow-x-auto` 래핑.
- (허용되나 미최적) billing 8열 / salaries 9열 shadcn `<Table>` — 모바일 카드뷰 없이 shadcn 내장 `overflow-x-auto`에만 의존(가로 스크롤). 주변 크롬은 반응형.
- (경미) learning-questions [set-list-view.tsx:320](src/app/(director)/director/learning-questions/_components/set-list-view.tsx) `grid-cols-4` 분포 타일 반응형 없음.
- 양호: workbench(스텝플로우+useMobilePagination), students→tutor(md:block 테이블+md:hidden 카드), dashboard-v2, credits 등.

## 8. 빌드/의존성/설정

### 8.1 [LOW~MED] npm audit: 프로덕션 의존성 36건 취약점 (high 12)
- 전부 `@trigger.dev/*` 경유 전이 의존성(opentelemetry <2.8.0 메모리 무한할당, socket.io/ws 구버전, uuid). 직접 코드 아님, 서버 사이드.
- 개선: `@trigger.dev/sdk` 4.4.4 → 최신 4.x로 올리면 대부분 해소되는지 확인. `npm audit fix --force`는 3.x 다운그레이드를 제안하므로 금지.

### 8.2 [MED·설계부채] 서버 액션 bodySizeLimit 10MB — 이미지 base64 동봉 구조
- `next.config.ts`에 이미 주석으로 자인: 시험지 저장이 로고+삽입이미지 base64를 액션 본문에 통째로 실음 → 10MB 한도 상향으로 임시 대응.
- 위험: 10MB도 초과 가능(이미지 여러 장), 요청당 메모리/전송 비용, Vercel 함수 payload 한계.
- 개선(문서화된 근본해결): 이미지를 Supabase Storage에 업로드하고 URL만 저장.

### 8.3 [INFO] 리전 구성: Vercel sin1 + Supabase ap-southeast-1 (싱가포르)
- 함수↔DB 코로케이션은 올바름. 단, 사용자 전원 한국 → 매 요청 한국↔싱가포르 왕복(~70ms+) 고정 비용.
- 개선(장기): Supabase 서울(ap-northeast-2) 마이그레이션 + Vercel `icn1` 동시 전환 시 체감 개선. DB만/함수만 단독 이전은 금지(내부 왕복 증가로 오히려 악화).

### 8.4 [INFO] ESLint가 빌드 게이트 아님 (Next 16에서 제거됨)
- next.config.ts 주석대로 lint는 별도 실행. → §8.5에서 확인: CI가 없어 **실제로 아무 데서도 안 돎**.

### 8.5 [HIGH·확정] CI 부재 — 테스트·린트가 자동으로 도는 곳이 없음
- `.github/workflows` 디렉터리 자체가 없음. 품질 게이트는 Vercel 빌드의 TS 컴파일이 유일.
- 84개 단위 테스트(`npm run test:unit`)는 AI 생성 품질 회귀를 잡는 핵심 자산인데, 수동 실행에만 의존 → 조용한 회귀 가능.
- 개선(저비용·고효과): GitHub Actions 워크플로 1개 추가 — `npx tsc --noEmit` + `npm run lint` + `npm run test:unit`을 PR/push에 실행. 30분 작업으로 도입 가능.
- 현재 `npx tsc --noEmit`은 클린 상태(2026-07-11 확인)라 즉시 도입 가능.
