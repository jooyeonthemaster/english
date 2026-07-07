# 실물(인쇄형) 쿠폰 발급·인쇄·등록 메커니즘 — smoat 이식 기획서

> **이 문서의 용도**
> `docs/printable-coupon-reference.md`(AC'SCENT 원본 명세)를 **smoat(학원용 크레딧 판매 플랫폼)에 실제로 이식하기 위한 설계서**다.
> 원본은 "개인 사용자 커머스" 기준이지만, smoat는 **크레딧 잔액이 학원(Academy) 단위**이고,
> 크레딧을 원자적·멱등적으로 지급하는 인프라·코드생성·어드민 규약·인쇄 라우트 선례가 이미 있다.
> 파일 경로는 모두 리포 루트 기준 실제 경로다.

---

## 0. 한 줄 요약

관리자가 **쿠폰 효과(할인형 / 크레딧 지급형)와 조건을 발급 시점에 선택**하면, 시스템이 고유 **8자리 코드 + QR**이 박힌 실물 쿠폰을 배치로 생성하고 A4로 인쇄한다. 인쇄물을 받은 **원장(DIRECTOR)** 이 QR 스캔·코드 입력으로 등록하면,
- **크레딧 지급형** → 그 자리에서 학원 크레딧이 즉시 지급되고(교환권),
- **할인형** → 학원 계정에 "보유 쿠폰"으로 들어갔다가 **다음 크레딧 충전 결제 때 할인**된다.

지급은 기존 `grantBonusCreditsTx` + 크레딧 만료 파이프라인을, 할인은 기존 충전 프리페어/결제완료 경로를 그대로 재사용한다.

---

## 1. 쿠폰 효과 모델 — 발급 시 선택 ⭐

배치(발급 건)마다 `effectType` 하나를 고른다. 셋은 상호배타(한 배치는 한 효과).

| `effectType` | 설명 | 값 필드 | 등록 시 | 상태 흐름 |
|---|---|---|---|---|
| `CREDIT_GRANT` | 등록 즉시 **무료 크레딧 지급**(교환권, 구매 불필요) | `grantCredits`, `grantExpiryDays?` | 크레딧 즉시 적립 | `ACTIVE → USED` (1단계) |
| `DISCOUNT_AMOUNT` | 충전 결제 시 **N원 할인** | `discountAmount` | 학원에 "보유 쿠폰"으로 귀속 | `ACTIVE → CLAIMED → USED` (2단계) |
| `DISCOUNT_PERCENT` | 충전 결제 시 **N% 할인** | `discountPercent` (1~100) | 〃 | 〃 |

> **확장 여지:** 배치가 `effectType` 문자열이라, 나중에 `PURCHASE_BONUS`(구매 시 추가 크레딧, 기존 프로모 bonus와 동일) 등을 무마이그레이션에 가깝게 추가 가능. 본 기획 범위는 위 3종.

**무결성(발급 검증에서 강제 — Prisma CHECK 대신 zod/앱단):**
- `CREDIT_GRANT` → `grantCredits > 0`, `discountAmount/Percent = null`
- `DISCOUNT_AMOUNT` → `discountAmount ≥ 100`(100원 단위), 나머지 null
- `DISCOUNT_PERCENT` → `1 ≤ discountPercent ≤ 100`, 나머지 null

---

## 2. 원본 레퍼런스 ↔ smoat 차이

| 원본(AC'SCENT) | → | smoat |
|---|---|---|
| 크레딧/쿠폰 = **개인 사용자** | → | 크레딧 잔액 = **학원**(`CreditBalance.academyId @unique`). 쿠폰은 원장이 등록 → **학원**에 귀속 |
| 쿠폰 3테이블(`coupons`+`offline_coupon_codes`+`user_coupons`) | → | **2테이블**. 코드가 이미 학원 단위라, `PrintableCouponCode` 한 행이 "인쇄 코드 + 학원 보유 쿠폰"을 겸함 → 개인쿠폰 조인 테이블 불필요 |
| 결제 시 상품금액 할인 / 신규 지급로직 | → | 할인은 **기존 충전 프리페어·결제완료 경로**, 지급은 **`grantBonusCreditsTx`** 재사용 |
| 새 코드/토큰 생성 | → | 패턴 있음: `randomBytes(...).toString("base64url")`(`src/actions/admin/credit-products.ts:271`), 혼동문자 제외 알파벳 + 충돌재생성(`src/lib/growth/referral.ts:30`) |
| 새 어드민 UI | → | 규약 있음: 서버액션 + `ActionResult<T>`/`fail()`, `AdminPagination`, `FilterPill`, `datetimeLocalToIso` |
| PDF 라이브러리 | → | 불필요. `window.print()` + `@media print`. 인쇄전용 라우트 선례: `src/app/(admin-bare)/admin/exam-print/page.tsx` |
| `qrcode` | → | **없음 → 추가 필요**(유일한 신규 의존성) |
| 할인값 스냅샷 테이블 | → | **불필요**. 인쇄된 종이 = 확정 조건. `PrintableCouponBatch`는 발급 후 조건 불변(freeze)으로 취급 → 배치 값을 그대로 신뢰 |

**왜 2테이블로 충분한가:** 할인형도 코드 1장은 학원 1곳에만 귀속된다(1코드=1학원). 그래서 별도 `user_coupons` 조인 없이 `PrintableCouponCode`에 `claimedByAcademyId`·`status`·`usedTopUpId`만 두면 "보유→사용" 생명주기가 그 행 안에서 완결된다.

---

## 3. 전체 흐름

```
[관리자(SUPER_ADMIN)]
   │  effectType 선택 + 조건 입력
   │   · CREDIT_GRANT : 지급 크레딧, 크레딧 유효기간(일)
   │   · DISCOUNT_*   : 할인 금액(원) 또는 할인율(%)
   │  공통: 제목·설명·수량·등록마감일·학원당 한도
   ▼
[발급 서버액션 issuePrintableCouponBatch]
   │   · PrintableCouponBatch 1건
   │   · 장마다 8자리 serialNumber + QR토큰(원본 미저장, SHA-256 tokenHash만)
   │   · QR Data URL 응답(인쇄용, DB 미저장)
   ▼
[인쇄]  ── (admin-bare) /admin/coupons/print → A4 2열×5행 = 10장/쪽, window.print()
   │
   ▼   (오프라인 배포)
   │
[원장(DIRECTOR)]  ── QR 스캔 or 코드 8자리 입력  →  /coupon/register?t=<token>
   ▼
[등록 POST /api/coupons/printable/claim]
   ├─ CREDIT_GRANT →  1 트랜잭션: 조건부 UPDATE(ACTIVE→USED) + grantBonusCreditsTx + creditTxId
   │                   → 학원 크레딧 +N 즉시
   └─ DISCOUNT_*   →  조건부 UPDATE(ACTIVE→CLAIMED, claimedByAcademyId)
                       → "보유 쿠폰"으로 대기
                          ▼ (원장이 크레딧 충전할 때)
                       [충전 프리페어]  보유 쿠폰 선택 → 서버 재계산 할인가 → CreditTopUp.customData에 couponCodeId
                          ▼ (결제 완료)
                       [결제완료 훅]  조건부 UPDATE(CLAIMED→USED, usedTopUpId)  ※멱등, 실패 시 CLAIMED 롤백
```

---

## 4. 데이터 모델 (Prisma)

`prisma/schema.prisma` "22. CREDIT SYSTEM" 섹션에 추가. id는 `String @id @default(cuid())`, enum 없이 String + 주석(기존 규약).

### 4.1 `PrintableCouponBatch` — 쿠폰 템플릿(한 배치 = 한 발급 건, 발급 후 조건 불변)

```prisma
model PrintableCouponBatch {
  id                 String   @id @default(cuid())
  batchName          String   // 관리자용 라벨 "신규가입 쿠폰 2026.07.07"
  title              String   // 인쇄 카드 쿠폰명
  description        String?  @db.Text

  effectType         String   @default("CREDIT_GRANT") // "CREDIT_GRANT" | "DISCOUNT_AMOUNT" | "DISCOUNT_PERCENT"
  // CREDIT_GRANT 전용
  grantCredits       Int?     // 지급 크레딧 수
  grantExpiryDays    Int?     // 지급 크레딧 유효기간(일). null/0=RIDE, >0=EXTEND
  // DISCOUNT 전용 (효과에 맞는 하나만 채움)
  discountAmount     Int?     // 원 (DISCOUNT_AMOUNT)
  discountPercent    Int?     // 1~100 (DISCOUNT_PERCENT)

  validUntil         DateTime? // 쿠폰 "등록" 마감일 (nullable)
  quantity           Int       // 발급 장수 (1~500)
  perAcademyLimit    Int      @default(1) // 한 학원이 이 배치에서 등록 가능한 최대 장수
  isActive           Boolean  @default(true) // 킬스위치
  createdByAdminId   String?
  createdByAdminEmail String?
  createdAt          DateTime @default(now())

  codes PrintableCouponCode[]

  @@index([createdAt])
  @@map("printable_coupon_batches")
}
```

### 4.2 `PrintableCouponCode` — 인쇄 코드 + 학원 보유 쿠폰(핵심)

```prisma
model PrintableCouponCode {
  id                 String   @id @default(cuid())
  batchId            String
  serialNumber       String   @unique @db.VarChar(16) // 종이 인쇄 8자리(사람 입력)
  tokenHash          String   @unique                 // QR 토큰 SHA-256 (원본 미저장)
  status             String   @default("ACTIVE")       // "ACTIVE" | "CLAIMED" | "USED" | "VOID"

  claimedByAcademyId String?                           // 등록한 학원
  claimedByStaffId   String?                           // 등록 실행 원장
  claimedAt          DateTime?

  // CREDIT_GRANT: 지급 시 채움 / DISCOUNT: 충전 결제 사용 시 채움
  creditTxId         String?  @unique                  // 지급 원장 링크(CREDIT_GRANT 멱등 증빙)
  usedTopUpId        String?  @unique                  // 사용된 충전(CreditTopUp) 링크(DISCOUNT)
  usedAt             DateTime?

  expiresAt          DateTime?                          // 개별 등록마감 오버라이드(옵션)
  printedAt          DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  batch PrintableCouponBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@index([batchId, status])
  @@index([claimedByAcademyId, status])
  @@map("printable_coupon_codes")
}
```

**멱등성 설계:** smoat의 `CreditTransaction`엔 유니크 제약이 없고 멱등성은 "같은 트랜잭션의 가드 행"으로 보장(`credit-grant.ts:8`, 참조 `AcademyMissionClaim`). 여기서는 **조건부 상태전이(WHERE status=…)가 곧 가드**다. 한 코드는 각 전이를 한 번만 통과하므로 이중지급/이중할인이 원천 차단된다. `creditTxId`/`usedTopUpId @unique`가 2차 안전장치.

---

## 5. 코드 & QR 생성

### 5.1 8자리 코드 — `src/lib/growth/referral.ts` 패턴 차용
```ts
import { randomBytes } from "node:crypto"
const READABLE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // I,O,0,1 제외
function createReadableCode(used: Set<string>): string {
  let code = ""
  do {
    const bytes = randomBytes(8)
    code = Array.from(bytes).map((b) => READABLE_ALPHABET[b % READABLE_ALPHABET.length]).join("")
  } while (used.has(code))
  used.add(code); return code
}
```
전역 유일성: `serialNumber @unique` + insert 충돌 시 재생성.

### 5.2 QR 토큰 + 해시 (원본 미저장)
```ts
import { createHash, randomBytes } from "node:crypto"
function createToken() {
  const token = randomBytes(24).toString("base64url")
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") }
}
```

### 5.3 QR 이미지 — 신규 의존성 `qrcode`
`pnpm add qrcode && pnpm add -D @types/qrcode`. `claimUrl = ${origin}/coupon/register?t=${token}`.
```ts
import QRCode from "qrcode"
const qrImageUrl = await QRCode.toDataURL(claimUrl, {
  width: 220, margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#FFFFFF" },
})
```

---

## 6. 발급(생성) — 어드민 서버액션

`src/actions/admin/printable-coupons.ts` (규약: `src/actions/admin-members/adjust-member-credits.ts`).

```ts
"use server"
// issuePrintableCouponBatch(input): SUPER_ADMIN
// input: { batchName, title, description?, effectType,
//          grantCredits?, grantExpiryDays?, discountAmount?, discountPercent?,
//          validUntil?(datetime-local), quantity, perAcademyLimit? }
```
1. `requireAdminAuth("SUPER_ADMIN")` (`src/lib/auth-admin.ts:92`).
2. **effectType별 zod 분기 검증**(§1 무결성). `validUntil`은 `datetimeLocalToIso`(`src/lib/utils.ts:71`)로 ISO 변환.
3. `PrintableCouponBatch` 1건 생성.
4. `quantity`만큼 `{serialNumber, tokenHash}` → `createMany`로 `PrintableCouponCode` 일괄 insert(ACTIVE). serial 충돌(P2002) 시 해당 장 재생성.
5. **QR Data URL은 DB 미저장**, 발급 응답에만 담아 인쇄 프리뷰로 반환.
6. `revalidatePath("/admin/coupons")`.

**보조 액션:** `listPrintableCouponBatches({page,pageSize,search?})`(배치별 `groupBy status` 카운트, 서버 페이지네이션), `voidPrintableCoupons/{batchId|codeId}`(→VOID, ACTIVE인 것만), `setBatchActive({batchId,isActive})`.

> **재인쇄:** 원본 QR 토큰은 미저장(보안) → 재생성 불가. **MVP는 "발급 직후 인쇄, 실패 시 배치 VOID→재발급"** 권장. 재인쇄 필수면 QR에 서명 토큰(`jose` HMAC, payload=serialNumber)을 넣어 결정적 재생성(유출 위조 위험↑, 서명키 관리 필요) — §12 열린 결정.

---

## 7. 인쇄(Print)

bare 그룹(사이드바 밖). 선례 `src/app/(admin-bare)/admin/exam-print/page.tsx`.
- 라우트 `src/app/(admin-bare)/admin/coupons/print/page.tsx`(+client). 발급 직후 넘긴 코드배열(serial+qrImageUrl) 렌더 후 `window.print()`.
- A4 세로 210×297mm 여백0, 카드 102×57mm, **2열×5행=10장/쪽**, 색유지·잘림방지.
- 문구는 effectType별로: `CREDIT_GRANT`="무료 크레딧 {grantCredits} 지급권", `DISCOUNT_AMOUNT`="{amount}원 할인권", `DISCOUNT_PERCENT`="{percent}% 할인권". 카드 우측 QR + "스캔 후 코드 입력 · 쿠폰 등록".

```css
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .coupon-page { width: 210mm; height: 297mm; display: grid;
    grid-template-columns: 1fr 1fr; grid-auto-rows: 57mm; break-after: page; }
  .coupon-card { width: 102mm; height: 57mm; page-break-inside: avoid; }
}
```

---

## 8. 등록(Claim) — effectType 분기

`src/app/api/coupons/printable/claim/route.ts` (POST). 인증: 원장 세션(`getStaffSession`, 선례 `src/app/api/missions/[key]/claim/route.ts`). 요청 `{token}` 또는 `{code}`.

**공통 선검증:** 코드 존재, `status='ACTIVE'`, `batch.isActive=true`, 미만료(서버시간), `perAcademyLimit` 미초과.

### 8.1 `CREDIT_GRANT` — 즉시 지급 (1 트랜잭션)
```
a) UPDATE ... SET status='USED', claimedByAcademyId, claimedByStaffId, claimedAt=now(), usedAt=now()
     WHERE id=:id AND status='ACTIVE';                 -- 0행이면 선점 → throw
b) grantBonusCreditsTx(tx, { academyId, credits: batch.grantCredits, expiryDays: batch.grantExpiryDays,
     type:"TOP_UP", description:`실물쿠폰 ${batch.title}`, referenceType/Id: 코드id }) -> {transactionId, balanceAfter}
c) UPDATE ... SET creditTxId=:transactionId WHERE id=:id;
```
응답 `{ mode:"granted", granted, balanceAfter }`.

### 8.2 `DISCOUNT_*` — 보유 등록만 (지급 없음)
```
UPDATE ... SET status='CLAIMED', claimedByAcademyId, claimedByStaffId, claimedAt=now()
  WHERE id=:id AND status='ACTIVE';                    -- 0행이면 선점 → throw
```
응답 `{ mode:"claimed", coupon:{ effectType, discountAmount|discountPercent, validUntil } }`. 실제 할인은 §9 충전 시.

**만료 반영(CREDIT_GRANT):** `grantExpiryDays>0`이면 EXTEND, `0/null`이면 RIDE — 표준 `expiresAtConflictSql/expiresAtInsertSql`(`src/lib/credit-expiry.ts`) 사용.
> **주의:** 현재 `grantBonusCreditsTx`는 항상 RIDE(`credit-grant.ts:39`). 쿠폰 EXTEND 위해 **`grantBonusCreditsTx`에 선택적 `expiryDays` 파라미터 추가**(권장, 미션/추천엔 무해) 또는 portone raw upsert 패턴(`src/lib/portone-credit-topups.ts:600–691`) 복제.

---

## 9. 할인형 쿠폰의 충전 결제 적용

기존 충전 파이프라인에 "보유 쿠폰" 훅을 얹는다. 새 결제 로직을 만들지 않는다.

**보유 쿠폰 조회:** 학원의 `PrintableCouponCode WHERE claimedByAcademyId=:aid AND status='CLAIMED' AND batch.isActive AND 미만료`. `/director/credits` 충전 패널(`src/app/(director)/director/credits/_components/top-up-panel.tsx`)에 "보유 할인 쿠폰" 선택 UI 노출.

**프리페어(`src/app/api/credits/top-ups/prepare/route.ts`):**
1. `couponCodeId`를 옵션 입력으로 받아 **서버에서 소유권·상태·만료 재검증**(클라이언트 값 불신).
2. 할인 계산은 기존 스타일 재사용 — `calculateDiscountedPrice`(`src/lib/credit-top-up-products.ts:137`) 계열로 `price`에 반영. `DISCOUNT_AMOUNT`=`min(price, amount)`, `DISCOUNT_PERCENT`=`floor(price*pct/100)`.
3. `CreditTopUp.customData`에 `couponCodeId` 스냅샷 저장(현재 `productCode` 저장하는 자리, L172–205).
4. **프로모 링크 할인(`smoat_promo` 쿠키)과의 중첩 정책:** **비중첩 — 실물 쿠폰 할인가와 프로모 할인가를 각각 계산해 더 저렴한 쪽 하나만 적용**(확정). 프리페어에서 두 경로의 결과 `price`를 비교해 `min` 채택, 어느 것이 적용됐는지 `customData`에 기록. 미적용된 쿠폰은 CLAIMED 유지(소진 안 함).

**결제 완료(`completePortOneCreditTopUp` `src/lib/portone-credit-topups.ts:254`, 무통장 `src/lib/bank-deposit.ts`):**
- 크레딧 지급 성공 트랜잭션 안에서(멱등):
  ```
  UPDATE printable_coupon_codes SET status='USED', usedTopUpId=:topUpId, usedAt=now()
    WHERE id=:couponCodeId AND status='CLAIMED';       -- 0행이면 이미 처리
  ```
- **결제 실패/취소** 시 `status='CLAIMED'`로 롤백(`usedTopUpId`/`usedAt` 원복).

---

## 10. 어드민 UI + 내비게이션

- **페이지** `src/app/(admin)/admin/coupons/page.tsx` → `PrintableCouponsAdminClient`.
  - 발급 폼: **effectType 라디오** → 선택에 따라 지급 크레딧/유효기간 **또는** 할인 금액/율 입력칸 토글. 공통: 제목·설명·수량·등록마감일(datetime-local)·학원당 한도. 제출 → 성공 시 bare 인쇄 페이지로 코드 전달.
  - 배치 목록: `FilterPill`(효과·상태) + `useSearchDebounce`(250ms 라이브검색) + `AdminPagination`(`src/components/admin/admin-pagination.tsx`). 행마다 효과 배지, 발급/등록(claimed)/사용(used)/무효 카운트·등록률, [인쇄]·[무효화]·[활성토글].
- **내비:** `src/components/admin/admin-shell.tsx`의 `NAV_SECTIONS` 크레딧 그룹에 `{ label:"실물 쿠폰", icon: Ticket, href:"/admin/coupons" }` 한 줄 추가(렌더 자동).
- **원장 등록 UI:** `/coupon/register`(비로그인 시 `/login?callbackUrl=…`) 또는 `/director/credits` 내 "쿠폰 등록" 섹션. `?t=` 딥링크면 코드칸 자동 채움. 크레딧 표기는 `CreditCostChip`(`src/components/credits/credit-cost-chip.tsx`) 규약.

---

## 11. 보안·안정성 체크리스트

- [ ] 발급/무효화 = `requireAdminAuth("SUPER_ADMIN")`. 등록·충전 = 원장 세션.
- [ ] QR 원본 토큰 미저장, **SHA-256 `tokenHash`만**.
- [ ] `serialNumber` 혼동문자 제외 + `@unique` + 충돌 재생성.
- [ ] 모든 상태전이 = **조건부 UPDATE(WHERE status=…)** → 동시/이중클릭 차단. 지급/할인 사용은 같은 트랜잭션에서 원장·`creditTxId`/`usedTopUpId` 연결(멱등).
- [ ] 할인은 **프리페어·결제완료 서버에서 재계산·재검증**(클라이언트 금액 불신). `couponCodeId` 소유권 확인.
- [ ] `batch.isActive=false` 킬스위치로 신규 등록·미사용 보유 쿠폰 즉시 차단.
- [ ] `validUntil`·`expiresAt` **서버시간** 기준. datetime-local은 `datetimeLocalToIso`로 저장(memory: datetime-local-tz-convention — 서버 `new Date(raw)`는 프로덕션 9h 드리프트).
- [ ] `perAcademyLimit`로 학원 독식 방지.
- [ ] claim 엔드포인트 IP/학원당 **rate-limit**(코드 추측 방지).
- [ ] 지급 크레딧 만료는 표준 `credit-expiry.ts` 파이프라인만.

---

## 12. 재사용 매핑 (레퍼런스 → smoat 실제 파일)

| 레퍼런스(§11) | smoat 대응 |
|---|---|
| 관리자 발급/인쇄 UI | `src/app/(admin)/admin/coupons/page.tsx` + `src/app/(admin-bare)/admin/coupons/print/page.tsx` |
| 발급 API | `src/actions/admin/printable-coupons.ts` (규약: `adjust-member-credits.ts`) |
| 등록 API | `src/app/api/coupons/printable/claim/route.ts` (선례: `api/missions/[key]/claim/route.ts`) |
| 크레딧 지급 | `grantBonusCreditsTx()` `src/lib/growth/credit-grant.ts:39` + `src/lib/credit-expiry.ts` |
| 결제 시 쿠폰 조회 | 충전 프리페어 `src/app/api/credits/top-ups/prepare/route.ts` |
| 주문 생성(할인 적용) | 할인 계산 `src/lib/credit-top-up-products.ts:137`, 결제완료 `src/lib/portone-credit-topups.ts:254` / `bank-deposit.ts` |
| 코드/토큰 생성 | `node:crypto`(`credit-products.ts:271`), 알파벳/재생성(`growth/referral.ts:30`) |
| DB 마이그레이션 | §13 절차 |

---

## 13. 마이그레이션 절차 (드리프트 주의) ⚠️

memory: **prisma-migration-drift** — dev DB가 기록 마이그레이션보다 앞서 `migrate deploy` 실패. 따라서:
1. `prisma/schema.prisma`에 §4 두 모델 추가.
2. `CREATE TABLE printable_coupon_batches / printable_coupon_codes` DDL 수기 작성 → `npx prisma db execute --file …`.
3. `npx prisma generate`.
4. **`prisma migrate deploy` 금지.**

---

## 14. 단계별 구현 로드맵

- **Phase 0 — 스키마·의존성:** `qrcode`(+types) 추가, 2모델 추가 + `db execute`/`generate`.
- **Phase 1 — 발급·인쇄(MVP):** `issuePrintableCouponBatch`(effectType 분기) + 어드민 페이지 + bare 인쇄 + 내비.
- **Phase 2 — CREDIT_GRANT 등록·지급:** claim 라우트 + `grantBonusCreditsTx` EXTEND 확장 + 원장 등록 UI + rate-limit.
- **Phase 3 — DISCOUNT 충전 적용:** 보유 쿠폰 조회 UI + 프리페어 할인 훅 + 결제완료/취소 상태전이 + 프로모 중첩 정책.
- **Phase 4 — 운영:** 배치 통계(등록/사용률)·무효화·킬스위치·`perAcademyLimit`.

---

## 15. 열린 결정(착수 전 확정)

1. ~~프로모 링크 할인 ↔ 실물 할인 쿠폰 중첩~~ → **확정: 비중첩 — 더 큰 할인 하나만 적용**(§9 반영). 미적용 쿠폰은 소진하지 않음.
2. **재인쇄 정책:** 발급 즉시 인쇄+재발급(권장) vs 서명 토큰 재인쇄.
3. **등록 주체 범위:** DIRECTOR만 vs 학원 소속 staff 전체.
4. **`grantExpiryDays`·`validUntil` 기본값:** 지급 크레딧 무기한(RIDE) vs 기본 EXTEND(예 90일), 등록마감 기본값.
5. **할인 대상 금액:** 결제 `price`(원) 할인만 vs 지급 크레딧 수 보너스도 허용(`PURCHASE_BONUS` 확장).
