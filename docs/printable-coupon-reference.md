# 인쇄형 쿠폰(오프라인 쿠폰) 발급·인쇄·등록 메커니즘 참고 명세서

> **이 문서의 용도**
> 이 문서는 AC'SCENT 서비스에 이미 구현되어 있는 "관리자 실물 쿠폰 발급 → 인쇄 → 고객 등록 → 결제 시 할인" 메커니즘을
> **다른 사이트(크레딧을 돈 주고 충전/구매하는 사이트)에 그대로 이식**하기 위한 참고 명세이자, AI 에이전트/개발자에게 넘겨줄 수 있는 프롬프트다.
>
> 원본은 "실물 상품을 파는" 커머스 사이트다. 대상 사이트는 **크레딧을 판매하는 사이트**이므로,
> "상품 주문 시 할인" 부분을 **"크레딧 충전(구매) 시 할인"** 또는 **"무료 크레딧 지급"** 으로 바꾸는 것이 핵심 차이다.
> (아래 §9 "크레딧 사이트 이식 가이드" 참고)

---

## 0. 대상 에이전트를 위한 지시문 (프롬프트)

> 아래 명세를 읽고, 우리 크레딧 판매 사이트의 관리자 페이지에 **인쇄 가능한 쿠폰 발급 기능**을 구현하라.
> 관리자가 쿠폰 조건(할인/지급 크레딧, 수량, 만료일)을 입력하면, 시스템이 고유 코드 + QR이 박힌 실물 쿠폰을 배치로 생성하고,
> A4 용지에 인쇄할 수 있어야 한다. 인쇄된 쿠폰을 받은 사용자는 QR 스캔 또는 코드 입력으로 자기 계정에 쿠폰을 등록하고,
> 크레딧을 구매(충전)할 때 할인받거나 무료 크레딧을 지급받는다.
> 아래 데이터 모델, 코드 생성 로직, 인쇄 레이아웃, 등록/사용 플로우, 보안 규칙을 그대로 따르되,
> "상품 주문" 도메인은 "크레딧 충전" 도메인으로 치환하라. §9의 이식 가이드를 반드시 반영하라.

---

## 1. 전체 흐름 개요

```
[관리자]
   │  쿠폰 조건 입력 (이름, 할인방식, 할인값/지급크레딧, 수량, 만료일)
   ▼
[발급 API]  ── 배치(batch) 단위로 N장 생성
   │   · 쿠폰 템플릿 1건 생성 (coupons)
   │   · 각 장마다 고유 8자리 코드 + QR 토큰 생성 (offline_coupon_codes)
   │   · QR 이미지(Base64) + serial code 반환
   ▼
[인쇄]  ── 브라우저 window.print() → A4에 카드형 쿠폰 (2열 x 5행 = 10장/페이지)
   │
   ▼   (오프라인 배포: 매장/행사/DM 등)
   │
[사용자]  ── QR 스캔(토큰) 또는 코드 8자리 입력
   ▼
[등록 API]  ── 코드/토큰 검증 → 사용자 계정에 개인 쿠폰(user_coupons) 지급
   │            offline_coupon_codes.status: active → claimed
   ▼
[크레딧 구매/충전]  ── 결제 시 쿠폰 적용 → 할인 or 무료 크레딧 지급
                     status: claimed → used
```

**상태 전이 (핵심)**

```
active   발급됨, 아직 아무도 등록 안 함 (등록 가능)
  ↓  (사용자가 QR/코드로 등록)
claimed  특정 사용자 계정에 귀속됨 (등록 완료, 아직 미사용)
  ↓  (크레딧 구매 결제 완료)
used     사용 완료
  ─  (관리자 삭제)
void     무효화됨
```

---

## 2. 데이터 모델 (DB 스키마)

원본은 PostgreSQL(Supabase) 기준. 다른 DB(Prisma/MySQL 등)로 옮겨도 구조는 동일하게 유지할 것.

### 2.1 `coupons` — 쿠폰 템플릿 (한 배치 = 한 템플릿)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID PK | |
| `code` | VARCHAR UNIQUE | 템플릿 식별 코드 (예: `OFF...`) |
| `type` | VARCHAR | 쿠폰 종류 (`offline`, `welcome`, `referral` 등) |
| `discount_type` | TEXT | `percent`(정률) \| `fixed_amount`(정액). **크레딧 사이트: `credit_grant`(무료 크레딧 지급) 추가 권장** |
| `discount_percent` | INT (0~100) | 정률 할인 % |
| `discount_amount` | INT | 정액 할인 금액(원). **크레딧 지급형이면 지급 크레딧 수로 재해석** |
| `title` | VARCHAR | 쿠폰 이름 (인쇄에 노출) |
| `description` | TEXT | 설명 (인쇄에 노출) |
| `valid_from` | TIMESTAMPTZ | 사용 시작일 (nullable) |
| `valid_until` | TIMESTAMPTZ | 만료일 (nullable) |
| `is_active` | BOOL | false면 신규 등록·사용 즉시 차단(관리자 킬스위치) |
| `created_at` | TIMESTAMPTZ | |

**무결성 제약** (정률/정액 동시 사용 금지):
```sql
CHECK (
  (discount_type = 'percent'       AND discount_percent > 0 AND discount_amount = 0)
  OR
  (discount_type = 'fixed_amount'  AND discount_percent = 0 AND discount_amount > 0)
  -- 크레딧 사이트 확장:
  -- OR (discount_type = 'credit_grant' AND discount_percent = 0 AND discount_amount > 0)  -- discount_amount = 지급 크레딧 수
)
```

### 2.2 `offline_coupon_codes` — 인쇄되는 개별 쿠폰 코드 (핵심)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID PK | |
| `coupon_id` | UUID FK → coupons | 어떤 템플릿의 쿠폰인지 |
| `batch_id` | UUID | 같은 발급 건 묶음 |
| `batch_name` | TEXT | 예: `"신규가입 쿠폰 2026.07.07"` |
| `serial_number` | VARCHAR(32) UNIQUE | **종이에 인쇄되는 8자리 코드** (사람이 입력) |
| `token_hash` | TEXT UNIQUE | **QR에 담긴 토큰의 SHA-256 해시** (원본 토큰은 저장 안 함) |
| `status` | VARCHAR | `active` \| `claimed` \| `used` \| `void` |
| `claimed_by_user_id` | UUID | 등록한 사용자 |
| `user_coupon_id` | UUID FK → user_coupons | 등록 시 생성된 개인 쿠폰 |
| `claimed_at` | TIMESTAMPTZ | 등록 시각 |
| `printed_at` | TIMESTAMPTZ | 인쇄(발급) 시각 |
| `expires_at` | TIMESTAMPTZ | 개별 만료일(템플릿 만료일 오버라이드용) |
| `issued_by_admin_email` | TEXT | 발급한 관리자 |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### 2.3 `user_coupons` — 사용자에게 귀속된 개인 쿠폰

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID PK | |
| `user_id` | UUID | |
| `coupon_id` | UUID FK → coupons | |
| `claimed_at` | TIMESTAMPTZ | 받은 시각 |
| `used_at` | TIMESTAMPTZ | 사용 시각 |
| `used_order_id` | UUID | **사용한 주문/충전 ID** (크레딧 사이트: 크레딧 결제/충전 트랜잭션 ID) |
| `is_used` | BOOL | |
| `discount_type` / `discount_percent` / `discount_amount` | | **할인값 스냅샷** — 발급 당시 값을 고정해, 나중에 템플릿을 바꿔도 소급되지 않게 함. NULL이면 템플릿 값 실시간 적용 |
| — | | `UNIQUE(user_id, coupon_id)` — 같은 템플릿 중복 등록 방지 |

> **스냅샷 규칙**: `discount_type = NULL` → 템플릿 값 실시간 반영(소급 O). `discount_type != NULL` → 발급 당시 값 고정(소급 X). 관리자가 "기존 미사용분에도 소급할지"를 선택할 수 있게 함.

---

## 3. 코드 & QR 생성 로직

### 3.1 사람이 읽고 입력하는 8자리 코드 (`serial_number`)

혼동 문자(I, O, 0, 1) 제외한 알파벳/숫자만 사용, 충돌 시 재생성:

```ts
import { randomBytes } from 'crypto'

const READABLE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // I, O, 0, 1 제외
const READABLE_CODE_LENGTH = 8

function createReadableCode(usedCodes: Set<string>): string {
  let code = ''
  do {
    const bytes = randomBytes(READABLE_CODE_LENGTH)
    code = Array.from(bytes)
      .map((b) => READABLE_CODE_ALPHABET[b % READABLE_CODE_ALPHABET.length])
      .join('')
  } while (usedCodes.has(code)) // 배치 내 중복 방지
  usedCodes.add(code)
  return code
}
```

### 3.2 QR 토큰 + 해시 저장 (보안 포인트)

- QR에는 **랜덤 토큰**(예: `randomBytes(24).toString('base64url')`)을 담고,
- DB에는 **원본 토큰이 아니라 SHA-256 해시(`token_hash`)만** 저장한다.
- 등록 시 사용자가 제시한 토큰을 다시 해시해서 대조 → DB 유출 시에도 토큰 위조 불가.
- 토큰(QR)을 잃어도 `serial_number`(인쇄된 8자리)로 대체 등록 가능.

```ts
import { createHash, randomBytes } from 'crypto'

function createToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return { token, tokenHash }
}
```

### 3.3 QR 이미지 생성 (`qrcode` 라이브러리)

QR이 가리키는 URL은 **등록 페이지 + 토큰**. 예: `https://그사이트/coupon/register?t=<token>`

```ts
import QRCode from 'qrcode'

async function createQrImageDataUrl(claimUrl: string, size = 220): Promise<string> {
  return QRCode.toDataURL(claimUrl, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  })
}
```

---

## 4. 발급(생성) API

**`POST /api/admin/offline-coupons`** (관리자 인증 필수)

요청:
```jsonc
{
  "title": "신규가입 크레딧 쿠폰",
  "description": "충전 시 사용 가능한 5,000원 할인권",
  "discountType": "fixed_amount",   // "percent" | "fixed_amount" | (크레딧지급형: "credit_grant")
  "discountValue": 5000,            // % 또는 원 (credit_grant면 지급할 크레딧 수)
  "quantity": 50,                    // 1~100장
  "validUntil": "2026-12-31"        // nullable, 입력 시 23:59:59(+09:00)로 변환
}
```

처리 순서:
1. 입력 검증 — 정률 1~100(정수), 정액 100~1,000,000(100원 단위), 수량 1~100.
2. `coupons` 템플릿 1건 생성.
3. `quantity`만큼 반복:
   - `serial_number` = `createReadableCode()`
   - `{ token, tokenHash }` = `createToken()`
   - `claimUrl` = 등록 URL + token
   - `qrImageUrl` = `createQrImageDataUrl(claimUrl)`
   - `offline_coupon_codes` insert (status=`active`, token_hash 저장)
4. 응답으로 배치 정보 + 생성된 쿠폰 배열(serial + QR Base64) 반환 → 프론트가 인쇄 프리뷰 렌더.

응답:
```jsonc
{
  "success": true,
  "batchId": "uuid",
  "batchName": "신규가입 크레딧 쿠폰 2026.07.07",
  "coupons": [
    {
      "id": "uuid",
      "serialNumber": "A7K9M2PQ",
      "qrImageUrl": "data:image/png;base64,....",
      "title": "신규가입 크레딧 쿠폰",
      "discountType": "fixed_amount",
      "discountAmount": 5000,
      "validUntil": "2026-12-31T23:59:59+09:00"
    }
  ]
}
```

**보조 엔드포인트**
- `GET /api/admin/offline-coupons` — 최근 발급 내역 + 배치별 통계(발급/등록/사용/삭제 수).
- `DELETE /api/admin/offline-coupons` — 특정 배치/코드 무효화(status=`void`).

---

## 5. 인쇄(Print) 구현

핵심: **별도 PDF 라이브러리 없이 브라우저 `window.print()` + CSS `@media print`** 로 처리한다.

- 화면에서는 숨기고(`hidden print:block`), 인쇄 시에만 렌더되는 전용 섹션을 둔다.
- A4 세로(210mm × 297mm), 페이지 여백 0.
- 카드 1장 = **신용카드 크기 102mm × 57mm**, A4당 **2열 × 5행 = 10장**.
- 카드 좌측: 쿠폰명 / 할인문구 / 8자리 코드 / 만료일. 우측: QR + "스캔 후 코드 입력" 안내.
- 색상 유지: `-webkit-print-color-adjust: exact; print-color-adjust: exact;`
- 카드가 페이지 경계에서 잘리지 않게: `page-break-inside: avoid;`, 페이지 분리 `break-after: page;`

인쇄 트리거:
```ts
const handlePrint = () => window.print()

// 특정 배치만 인쇄: 인쇄 대상 state 세팅 후 다음 프레임에 print
const handlePrintBatch = (rows) => {
  setPrintCoupons(rows.filter(r => r.status === 'active'))
  requestAnimationFrame(() => window.print())
}
```

핵심 CSS 골격:
```css
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .offline-coupon-page {
    width: 210mm; height: 297mm;
    display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 57mm;
    break-after: page;
  }
  .offline-coupon-card { width: 102mm; height: 57mm; page-break-inside: avoid; }
}
```

카드 마크업(요약):
```tsx
<article className="offline-coupon-card flex bg-white p-[4mm] text-slate-950">
  <div className="flex-1">
    <div className="inline-flex rounded-full bg-slate-950 px-[3mm] py-[1mm] text-[8pt] font-black text-white">
      크레딧 쿠폰
    </div>
    <h3 className="text-[13pt] font-black">{coupon.title}</h3>
    <div className="text-[19pt] font-black">{discountLabel(coupon)} 할인권</div>
    <p className="text-[6.8pt] text-slate-600">{coupon.description}</p>
    <div className="text-[5.8pt] text-slate-400">쿠폰 코드</div>
    <div className="font-mono text-[14pt] font-black tracking-[0.08em]">{coupon.serialNumber}</div>
    <div className="text-[6.5pt] text-slate-500">만료일 {formatDate(coupon.validUntil)}</div>
  </div>
  <div className="w-[28mm] flex flex-col items-center">
    <img src={coupon.qrImageUrl} className="h-[23mm] w-[23mm]" alt="QR" />
    <div className="text-[5.8pt] font-black">스캔 후 코드 입력</div>
    <div className="bg-yellow-300 text-[6pt] font-black rounded-full w-full text-center">쿠폰 등록</div>
  </div>
</article>
```

---

## 6. 사용자 등록(Claim) API

**`POST /api/coupons/offline/claim`** (로그인 필수)

요청: `{ "token": "<QR토큰>" }` 또는 `{ "code": "A7K9M2PQ" }`

처리:
1. **인증 확인** — 로그인 사용자만.
2. **코드 조회**
   - token으로: `WHERE token_hash = sha256(token)`
   - code로: `WHERE serial_number = code.toUpperCase()`
3. **검증**: `status='active'`, `coupon.is_active=true`, 미만료, 이미 같은 템플릿 보유 안 함.
4. **원자적 잠금 등록** (경쟁 조건 방지):
   ```sql
   UPDATE offline_coupon_codes
      SET status='claimed', claimed_by_user_id=:uid, claimed_at=now()
    WHERE id=:id AND status='active' AND claimed_by_user_id IS NULL;  -- 0행이면 이미 선점됨
   ```
5. `user_coupons` insert → 그 id를 `offline_coupon_codes.user_coupon_id`에 연결.
6. 응답: 등록 성공 메시지 + 지급된 쿠폰 정보.

---

## 7. 결제(사용/Redeem) 로직

원본(상품 커머스)에서는 **주문 생성 시** 쿠폰을 적용하고, 결제 완료 시 사용 처리한다.

주문 생성 시 검증(서버에서 반드시 재검증 — 클라이언트 금액 신뢰 금지):
1. 쿠폰 존재 확인
2. **소유권** 확인 (`user_coupons.user_id === 요청자`)
3. 미사용 확인 (`is_used=false`, 다른 주문에서 점유 안 됨)
4. 템플릿 활성 확인 (`coupons.is_active=true`)
5. 만료 확인

할인 계산:
```ts
function calculateCouponDiscount(subtotal: number, c: CouponDiscountFields): number {
  if (c.discount_type === 'fixed_amount')
    return Math.min(subtotal, Math.max(0, Math.floor(c.discount_amount || 0)))
  const pct = Math.max(0, Math.min(100, c.discount_percent || 0))
  return Math.floor(subtotal * (pct / 100))
}
// 클라이언트가 보낸 discountAmount와 서버 계산값 차이가 1원 초과면 거부
```

효과적 할인값 결정(스냅샷 우선):
```ts
const effective = snapshot?.discount_type != null ? snapshot : template
```

결제 완료 후 사용 처리 (멱등):
```sql
UPDATE user_coupons
   SET is_used=true, used_at=now(), used_order_id=:orderId
 WHERE id=:userCouponId AND is_used=false;   -- 0행이면 이미 처리됨

-- 인쇄 코드도 사용 표시
UPDATE offline_coupon_codes
   SET status='used', updated_at=now()
 WHERE user_coupon_id=:userCouponId AND status='claimed';
```

결제 실패/취소 시엔 `is_used`, `used_at`, `used_order_id`를 되돌리고 `offline_coupon_codes.status`를 `claimed`로 롤백.

---

## 8. 보안·안정성 체크리스트

- [ ] 발급/삭제 API는 **관리자 인증** 필수.
- [ ] 등록 API는 **로그인 사용자** 필수.
- [ ] QR 토큰 원본은 저장하지 않고 **SHA-256 해시만** 저장.
- [ ] serial_number는 혼동문자 제외 + 충돌 재생성으로 유일성 보장, UNIQUE 제약.
- [ ] 등록은 **조건부 UPDATE(status='active'인 행만)** 로 동시 등록 경쟁 방지.
- [ ] 결제 시 **할인 금액을 서버에서 재계산·검증** (클라이언트 값 신뢰 금지).
- [ ] 사용 처리는 **멱등**(`is_used=false`인 행만 UPDATE)하게, 웹훅 중복 호출 대비.
- [ ] `is_active=false` 킬스위치로 유출·오발급 시 즉시 전체 차단 가능.
- [ ] 만료일은 서버 기준 시간으로 검증.

---

## 9. 크레딧 판매 사이트 이식 가이드 (원본과의 차이점) ⭐

원본은 "실물 상품 주문"이지만, 대상 사이트는 "크레딧 충전(구매)"이다. 아래만 치환하면 된다.

| 원본 (실물 커머스) | → | 크레딧 사이트 |
|---|---|---|
| 상품 주문(`orders`) | → | 크레딧 충전/결제 트랜잭션 (예: `credit_purchases`, `credit_transactions`) |
| `used_order_id` | → | 사용한 충전 트랜잭션 ID |
| "결제 시 상품 금액 할인" | → | "크레딧 구매(충전) 결제 금액 할인" |
| 배송/재고 로직 | → | (불필요) 제거 |

**쿠폰 효과 2가지 모델 — 사이트 정책에 맞게 선택(둘 다 지원해도 됨):**

1. **할인형 (discount)** — 크레딧을 살 때 결제 금액을 깎아준다.
   - `discount_type='percent'` → 충전 결제액의 N% 할인
   - `discount_type='fixed_amount'` → 충전 결제액에서 N원 할인
   - 위 §7 로직 그대로. `subtotal`을 "크레딧 구매 결제 금액"으로 해석.

2. **크레딧 지급형 (credit_grant)** — 등록/사용 즉시 무료 크레딧을 계정에 적립.
   - `discount_type='credit_grant'` 추가, `discount_amount`를 "지급 크레딧 수"로 재해석.
   - 이 경우 **결제 없이 등록(claim) 시점에 바로 크레딧을 적립**할 수도 있음(쿠폰 → 무료 크레딧 교환권 모델).
   - 크레딧 원장(ledger)에 `+N credits` 트랜잭션을 남기고, `user_coupons.is_used=true`, `offline_coupon_codes.status='used'` 처리.
   - 이중 지급 방지를 위해 반드시 멱등 처리 + 원장 유니크 제약(예: `source='coupon:'||user_coupon_id`) 사용.

**등록 URL**: `/coupon/register?t=<token>` — 크레딧 사이트의 마이페이지/충전 페이지 도메인으로 맞출 것.

**표시 문구**: 인쇄 카드의 "할인권" 문구를 지급형이면 "무료 크레딧 지급권"으로, "AC'SCENT ID COUPON" 배지는 대상 브랜드명으로 교체.

---

## 10. 필요한 라이브러리 / 스택

- 프레임워크: Next.js(App Router) 기준. 다른 스택이면 등가 라우팅/서버 액션으로 대체.
- DB: PostgreSQL(Supabase). Prisma/Drizzle/기타 ORM 무관 — 스키마·제약만 유지.
- `qrcode` — QR Data URL 생성.
- Node `crypto` (`randomBytes`, `createHash`) — 코드/토큰/해시.
- 인쇄: 브라우저 네이티브 `window.print()` + CSS `@media print` (외부 PDF 라이브러리 불필요).
- 스타일: Tailwind CSS (mm 단위 임의값 사용). 일반 CSS로도 동일 구현 가능.

---

## 11. 원본 구현 파일 참조 (AC'SCENT — 이식 시 코드 대조용)

| 기능 | 파일 |
|------|------|
| 관리자 발급/인쇄 UI | `src/app/admin/coupons/page.tsx` |
| 발급 API (코드·QR 생성) | `src/app/api/admin/offline-coupons/route.ts` |
| 등록(claim) API | `src/app/api/coupons/offline/claim/route.ts` |
| 등록 페이지 | `src/app/coupon/register/CouponRegisterClient.tsx` |
| 결제 시 쿠폰 조회 | `src/app/api/checkout/coupons/route.ts` |
| 주문 생성(할인 적용) | `src/app/api/orders/route.ts` |
| 사용 처리 유틸 | `src/lib/coupons/order-coupon-usage.ts` |
| 할인값 계산/타입 | `src/types/coupon.ts` |
| DB: 쿠폰 테이블 | `supabase/migrations/20260113_coupons.sql` |
| DB: 정액 할인 | `supabase/migrations/20260608_coupon_fixed_amount_discount.sql` |
| DB: 인쇄 코드 테이블 | `supabase/migrations/20260608_offline_coupon_codes.sql` |
| DB: 할인값 스냅샷 | `supabase/migrations/20260609_user_coupon_discount_snapshot.sql` |
