# 슈퍼어드민 콘솔 지표 전수 감사 (26-09-17)

> 읽기 전용 감사 에이전트 보고 → 감독이 실DB로 핵심 수치 대조. **수리 결정은 `analytics-spec.md` §9.2(F1~F18, D1~D6)가 정본**이고, 이 문서는 근거 원장이다.
> 판정 SUSPECT 는 "의심" — 수리 유닛은 반드시 코드·실DB 로 재현 확인 후 고치고, 틀렸으면 근거를 들어 반려한다.

## 0. 핵심 결론 — "결제 대기 건이 매출에 잡힌다"

- 원인: `getAdminCreditTopUpStats()` 의 `today` 집계(`src/lib/admin-credit-topups.ts:181-189`)
  - 상태 필터 **없음** → PENDING·WAITING_FOR_DEPOSIT·FAILED·CANCELLED·REFUNDED 전부 합산
  - 기준 시각이 결제 시각이 아니라 주문 생성(`createdAt`)
  - 자정 계산 `new Date(new Date().setHours(0,0,0,0))` — 서버 로컬 시간대(UTC 런타임이면 KST 09:00 경계)
- 화면: `/admin/credit-plans`(결제 관리) **「오늘 결제」** 카드(`credit-topups-admin-client.tsx:726-732`). 같은 함수를 페이지(`credit-plans/page.tsx:22-27`)·API(`api/admin/credits/top-ups/route.ts:23-27`)·3초 SSE 스트림(`.../top-ups/stream/route.ts:22-25`)이 호출.
- PENDING 이 쌓이는 이유: 카드 결제 주문은 결제창 여는 시점에 `PENDING` 으로 생성(`api/credits/top-ups/prepare/route.ts:185-211`), 이탈해도 PortOne 매핑상 PENDING 유지(`src/lib/portone-credit-topups.ts:1288`), 만료 배치 없음.
- 감독 실측(26-09-17): PENDING 51건 3,999,400원 · WAITING 14건 693,000원 — **전부 생성 1시간 초과**. COMPLETED 34건 1,710,600원. REFUNDED 2건(19,800×2, 당일 환불). 부분취소 0. 학원 TRIAL 293 / ACTIVE 14. 구독 결제 0건.
- 대시보드 「오늘 매출」·원가 분석 매출은 COMPLETED 만 세므로 PENDING 누출은 없음 — 대신 아래 다른 결함.

## 1. 결제 관련 모델·상태값 (schema.prisma 에 enum 없음 — 전부 String)

| 모델 | 상태값 | 금액 필드 | 실결제 판정 |
|---|---|---|---|
| CreditTopUp (`credit_top_ups`) | PENDING(기본, 미결제) · WAITING_FOR_DEPOSIT(무통장·가상계좌) · COMPLETED · FAILED · CANCELLED(결제 전 취소·가상계좌 말소) · REFUNDED(완료 후 전액 환불). 부분취소는 COMPLETED 유지(`portone-credit-topups.ts:1032-1033,1123`) | `price`(주문금액), `paidAmount`(실결제), `creditAmount`(보너스 포함) | status COMPLETED, 시각 `paidAt`/`completedAt` |
| paymentMethod | CARD · TRANSFER · VIRTUAL_ACCOUNT · EASY_PAY · MOBILE · BANK_TRANSFER(무통장, 스키마 주석 누락) | 무통장은 paymentId 없음 | |
| SubscriptionPayment | PENDING · SCHEDULED · PAID · FAILED · CANCELLED · REFUNDED | amount, paidAmount | PAID, paidAt |
| BankDepositNotification | UNMATCHED · MATCHED · MANUAL_GRANT(시스템 밖 수동지급 실입금) · AMBIGUOUS · IGNORED · FAILED | amount | MANUAL_GRANT 만 별도 매출 |
| CreditTransaction.type | ALLOCATION · CONSUMPTION · TOP_UP · ADJUSTMENT · REFUND · RESET · ROLLOVER · EXPIRATION | amount(±) | 크레딧 원장(금액 아님) |
| Academy.status | ACTIVE · TRIAL · SUSPENDED · DEACTIVATED — **소셜 가입은 TRIAL 로 생성**(`api/auth/onboarding/route.ts:145`) 후 ACTIVE 전환 경로 없음 | | |

공통 문제: (1) 매출 집계에서 내부/테스트 계정 미제외(`admin-members/_shared.ts:81-115` 는 SMS 내보내기에만) (2) 무통장 주문은 시스템 내 환불 불가인데 목록 「환불 처리」 버튼 활성(`credit-topups-admin-client.tsx:1251`) (3) 전액 환불이 원 결제일 매출을 소급 삭제 (4) 금액은 VAT·PG 수수료 포함 총액.

## 2. 대시보드 `/admin` (`src/actions/admin/dashboard.ts`)

| 지표 | 위치 | 판정 |
|---|---|---|
| 미확인 입금 | :125-127 (UNMATCHED, AMBIGUOUS) | SUSPECT — 링크 목록 `?status=ACTION` 은 FAILED 포함(`api/admin/credits/bank-deposits/route.ts:18-20,62-63`) → 숫자 불일치 |
| 입금 대기 | :128-130 (WAITING + BANK_TRANSFER, 경과시간 무제한) | SUSPECT — 매칭 불가능해진 만료 주문 영구 잔존 |
| 가입 승인 대기·미답변 문의·세미나 | :131-135 | OK |
| 오늘 매출(+어제) | :137-140, :335-366 | SUSPECT — PENDING 누출은 없음. 환불 소급 삭제·원가분석과 기준 상이(대시보드 completedAt·price / 원가 paidAt·paidAmount, 입금 receivedAt vs occurredAt)·MANUAL_GRANT 이중집계 위험 |
| 신규 학원 | :141-144 | OK(내부 계정 포함) |
| 생성 문제 | :145-153 | 경미 — 수동·추출 문항 포함 |
| 크레딧 소모 | :154-155, :369-375 | SUSPECT — 실패 자동환불(REFUND, referenceType CREDIT_TRANSACTION, `src/lib/credits.ts:258-269`) 미차감 |
| 활동 학원(오늘) | :156-159 | SUSPECT — `/admin/activity` 의 정의(9소스 합집합)와 다름 |
| 전체 활성 | :160 (status ACTIVE) | **SUSPECT(강)** — TRIAL 293곳 누락 → 14 표시 |
| 이번 달 매출 | :162-163 | 오늘 매출과 동일 문제 |
| AI 원가 | :164-167 | 경미 — 원가분석은 조회 전 sync 수행, 대시보드는 안 함 |
| 마진 | :315 / page.tsx:123-126 | SUSPECT — 원가분석 「손익」(변동+고정비)과 정의 상이, 같은 라벨 |
| 오늘 오류 | :169-180 | OK |
| 14일 추이 | :182-193, :266-292 | 매출 부분 동일 문제 |
| 크레딧 소진 임박 | :195-205 (a.status='ACTIVE') | SUSPECT — TRIAL 전부 누락 |
| 체험 종료 임박 | :206-214 | SUSPECT — 소셜 가입 체험이 전부 2026-07-01 종료(`onboarding/route.ts:12,177-186`) → 항상 빈 목록 |

## 3. 결제 관리 `/admin/credit-plans` (`src/lib/admin-credit-topups.ts`)

| 지표 | 위치 | 판정 |
|---|---|---|
| **오늘 결제** | :181-189, UI :726-732 | **SUSPECT(신고 원인)** — COMPLETED·paidAt·KST 자정·SUM(COALESCE(paidAmount,price)) 로 |
| 충전 완료 | :193-197, UI :733-739 | 경미 — 기간 라벨 없음, 부분취소 미차감 |
| 대기 | :190-192, UI :740-746 | SUSPECT — 이탈 PENDING·만료 WAITING 영구 누적 |
| 확인 필요 | :198-200, UI :747-753 | SUSPECT — 사용자 취소·처리된 환불까지 셈, 보조문구 「최근 {날짜}」는 카드 숫자와 무관(:438-441) |
| 표 「결제금액」 | :42-76, UI :1097-1099 | 경미 — 미결제 건도 price 를 결제금액처럼 표시 |
| 결제 상세 「누적 사용」 | :157-175 | 경미 — REFUND 미차감 |
| 환불 버튼 | UI :1251 | 무통장(paymentId 없음)은 API 가 반드시 실패(`portone-credit-topups.ts:369-374`) |
| SSE 스트림 | stream/route.ts:26-29 | 경미 — 목록 시그니처만 감시 |

## 4. 무통장입금 `/admin/credits/bank-deposits`

| 항목 | 위치 | 판정 |
|---|---|---|
| 탭 카운트 | `bank-deposits/route.ts:53-63` | OK |
| 입금 대기 주문 N건 | :40-52 (`take: 100`), UI `bank-deposits-admin-client.tsx:170` | SUSPECT — 100건 절단 무표시, 만료 포함 |
| MANUAL_GRANT 전환 → 매출 | `bank-deposits/[id]/route.ts:62-80` | SUSPECT — MATCHED 외 모든 상태에서 전환 가능. 완료 주문의 중복입금 AMBIGUOUS(`bank-notify/route.ts:211-220`)·세미나 보증금 AMBIGUOUS(:275-289)를 전환하면 매출 이중집계 / 보증금이 크레딧 매출로 (결정 D4: 보고만) |

## 5. 원가 분석 `/admin/costs`

| 지표 | 위치 | 판정 |
|---|---|---|
| 기간 매출·손익 표 | `operations-cost.ts:99-128,198-229` | SUSPECT — 환불 소급·MANUAL_GRANT 위험(PENDING 누출 없음) |
| N개 활성 구독 · MRR | `operations-cost.ts:162-165,325-328`, page :279 | **SUSPECT(강)** — 만료 TRIAL 포함 가짜 MRR |
| 크레딧 사용 | `operations-cost.ts:149-161,294-318` | SUSPECT — REFUND 에 충전 환불 회수분(CREDIT_TOP_UP_REFUND) 섞임 → 사용량 과소, UNKNOWN 작업 |
| 기능별 마진 | `feature-margin.ts:165-203`, `credit-costs.ts:77-82` | SUSPECT — 하드코딩 TOP_UP_PACKS 단가(DB 상품·프로모 미반영) |
| BEP 유료 매출 | `free-credit-bep.ts:89-92,115-131` | SUSPECT — MANUAL_GRANT 제외(대시보드·원가는 포함), paidCredits 에 무료 보너스 포함 |
| BEP 무료 지급 원가 | `free-credit-bep.ts:80-88,128` | SUSPECT — `NOT referenceType='CREDIT_TOP_UP'` 이 NULL 행(가입 지급)을 제외할 수 있음(**실데이터 검증 필요**) |
| BEP 평균 원가/크레딧 | :76-79 | SUSPECT — REFUND 미차감 |
| BEP 전환율 | :93-105,134-135 | SUSPECT — 분모에 테스트·해지 포함, 재구매도 전환 |

## 6. 회원 목록·상세

| 지표 | 위치 | 판정 |
|---|---|---|
| 가입일 필터 | `members-list-client.tsx:211-212` | 경미 — 브라우저 로컬 기준 |
| CSV 내보내기 날짜 | `export-members.ts:29-39,246` | SUSPECT — timeZone 미지정 |
| 누적 충전 / 보너스 | `member-detail-client.tsx:109-112,173-183` | SUSPECT(라벨) — totalAllocated 에 무료·유료 혼재, bonusCredits 는 유료 충전에서도 증가 |
| 최근 30일 사용·스파크라인 | `get-member-detail.ts:78-93` (:85) | **SUSPECT** — `"createdAt" AT TIME ZONE 'Asia/Seoul'` 단일 변환(timestamp without tz → −9h). `AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'` 이어야 함 |
| 거래 유형 라벨 | `src/lib/admin-members-labels.ts:28-37` | SUSPECT — ALLOCATION=「월 정기 지급」인데 실제 가입 무료 지급, TOP_UP 에 추천·미션·쿠폰 무료 지급 혼재 |

## 7. 추천·쿠폰·프로모션·활동

| 지표 | 위치 | 판정 |
|---|---|---|
| 추천 총 전환 | `referrals.ts:171-174,189` | 라벨 — 「추천 가입」 |
| 추천 지급 완료 | `referrals.ts:190` | SUSPECT — APPROVED 누락 |
| 실물 쿠폰 | `printable-coupons.ts:364-379` | OK |
| 프로모션 모니터링 | `credit-promotion-monitoring.ts:152-323` | 경미 — 20,000건 무음 절단, 익명 visitorKey 가 날짜 해시라 다일 범위 고유방문자 과대 |
| 활동 분석 분모 | `admin-activity/analytics/_compute.ts:341-380` | SUSPECT — 내부·테스트·해지 포함, 로그인 1회로 「활성화」 |
| 플랜 분포 | `_query.ts:165-181` | SUSPECT — 만료 TRIAL 유효 취급 |

## 8. 수정 우선순위(감사자 제안)
1. 「오늘 결제」 COMPLETED·paidAt·KST
2. 오래된 PENDING/WAITING 분리(만료 배치 또는 경과시간 조건)
3. 매출 정의 단일화(결제일·환불일·MANUAL_GRANT·내부계정)
4. MANUAL_GRANT 전환 검증
5. 학원 상태 필터(ACTIVE-only 누락 / TRIAL 을 MRR 에)
6. REFUND 차감 대상 한정
7. 회원 상세 시간대 버그
8. 라벨 정정(거래 유형·보너스·추천 지급 완료·확인 필요)

## 9. D4 보고 — 무통장 수동지급 전환·재연결의 이중집계 (26-09-18, 표시 수정만 집행)

결정 D4 대로 **실행 흐름·DB 상태는 바꾸지 않았다**. 아래는 보고와, 화면에서 막은 범위다.

### 9.1 MANUAL_GRANT 2건 — 매출 이중집계 없음(확인 완료)

| 알림 | 금액 | 입금 KST | 연결되는 대기 주문 | 원장 크레딧 | 판정 |
|---|---|---|---|---|---|
| `cmr7am6pq…` | 19,800 | 07-05 13:30 | 통쌤영어 `cmr7aks5x…`(07-05 13:29 생성, 225C, 지금도 WAITING_FOR_DEPOSIT) | ADJUSTMENT +225 「무통장입금 확인」 07-05 14:11 | 이중집계 없음 |
| `cmr7blsj0…` | 19,800 | 07-05 13:58 | 미래듀학원 `cmr7bko3d…`(07-05 13:57 생성, 225C, 지금도 WAITING_FOR_DEPOSIT) | ADJUSTMENT +225 「무통장 입금 확인」 07-05 14:10 | 이중집계 없음 |

두 학원 모두 같은 시기 COMPLETED/REFUNDED 충전이 0건이라 `topUpGrossWhere` 에 들어간 적이 없다.
즉 D1 이 `manualGrantRevenueWhere`(`admin-revenue.ts:81-90`)로 39,600원을 매출에 더하는 것은 옳다.

### 9.2 남은 위험 — 이 두 주문은 아직 「연결 가능」한 상태다

`bank-deposits/[id]/route.ts:82-115` 의 `match` 는 **금액 일치를 보지 않고** `status==='WAITING_FOR_DEPOSIT'` 이기만 하면
`grantBankDepositTopUp` 을 실행한다. 관리자가 새로 들어온 미매칭 입금을 실수로 이 두 주문에 연결하면
같은 19,800원이 `topUpGrossWhere` 로 한 번 더 매출에 잡히고 225C 가 재지급된다(클릭 1회).

집행(표시 계층만):
- `bank-deposits/route.ts` 가 각 대기 주문에 `settledDeposit` 을 붙인다 — **같은 금액 + 같은 정규화 입금자명이면서 어느 주문에도 연결되지 않은**(`matchedTopUpId IS NULL`) MANUAL_GRANT·MATCHED 알림이 있을 때만.
- 화면은 그 행에 「지급 완료 입금과 일치(추정) — 연결 시 재지급」 붉은 배지를 달고, 「주문 연결」 클릭 시 확인 다이얼로그를 강제한다(경고 문구 선두 표시). 확인은 모든 연결에 적용하고, 입금액≠주문금액이면 그 사실도 함께 알린다.
- 실측(26-09-18): 대기 주문 14건 중 **2건**만 걸린다(통쌤영어·미래듀학원). 「금액+이름」만 보는 규칙이면 10건이 걸리는데, 8건은 이미 자기 주문에 연결된 MATCHED 알림과 겹칠 뿐이라 재지급 위험이 아니다(네안데르이동주 7 · 카카오이동주 1) → `matchedTopUpId IS NULL` 조건으로 오탐 8건을 없앴다.

### 9.3 AMBIGUOUS → 수동지급 전환은 지금도 무방비 (서버 가드 미도입, 사용자 결정 대기)

`bank-deposits/[id]/route.ts:62-80` 의 `manual_grant` 는 **MATCHED 만 409 로 막고 AMBIGUOUS 는 통과**시킨다.
AMBIGUOUS 는 두 갈래로 생긴다.

| 갈래 | 생성 위치 | 「수동지급」으로 전환하면 |
|---|---|---|
| 완료 주문에 대한 중복 입금 | `bank-notify/route.ts:211-220` (note: 「매칭된 주문이 이미 처리됨 — 중복 입금 가능」) | 원 주문의 COMPLETED 결제액이 이미 매출인데 같은 돈이 `manualGrantRevenueWhere` 로 **한 번 더** 매출이 된다 |
| 동일 금액·입금자명 대기 주문 다수 | `:222-234` | 어느 주문의 돈인지 모르는 채 매출로 확정된다(주문은 WAITING 으로 남아 재연결 가능 — 9.2 와 같은 경로) |
| 세미나 보증금 중복 확정 | `:262-272` | 크레딧 매출이 아닌 **보증금**이 크레딧 충전 매출로 계상된다 |
| 세미나 보증금 대기 다수 | `:274-285` | 위와 같음 |

즉 지금 「수동지급」 버튼은 **크레딧 충전이 아닌 돈까지 D1 매출로 만들 수 있다**.
실DB 현재 AMBIGUOUS 0건이라 발생하지 않았지만 무통장·세미나 입금이 늘면 재현된다.

제안(사용자 결정 대기 — D4 유지 중이라 미집행):
1. `manual_grant` 가 AMBIGUOUS 도 409 로 막고, 이유(중복입금/세미나 보증금)를 그대로 돌려준다.
2. `match` 에 금액 일치 검사(또는 불일치 시 사유 필수)를 넣는다.
3. `BankDepositNotification` 에 `kind`(CREDIT / SEMINAR_DEPOSIT)를 두고 `manualGrantRevenueWhere` 가 CREDIT 만 세게 한다 — 세미나 보증금은 매출이 아니다.
