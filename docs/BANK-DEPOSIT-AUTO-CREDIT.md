# 무통장입금 자동확인 (Bank Deposit Auto-Credit)

PG 계약/심사 없이 **오늘 배포 가능한** 무통장입금 자동충전 경로. 사용자가 계좌로
입금하면, 은행 입금알림(SMS/푸시)을 서버로 중계해 **금액 + 입금자명 + 시간창**을
대조하여 매칭되는 주문에 크레딧을 즉시 지급한다. PortOne / 다날에 전혀 의존하지
않는다.

## 흐름

1. 원장(DIRECTOR)이 크레딧 관리 → "무통장입금" 선택 + 입금자명 입력 → 충전하기
   - `POST /api/credits/top-ups/bank-deposit/prepare`
   - `CreditTopUp(status=WAITING_FOR_DEPOSIT, paymentMethod=BANK_TRANSFER)` 생성
   - 회사 계좌 + 정확한 금액 + 입금자명 안내 카드 표시
2. 사용자가 안내된 계좌로 입금
3. 은행 입금알림 문자 → **안드로이드 SMS 포워더** → `POST /api/credits/top-ups/bank-notify`
4. 서버가 매칭 → `grantBankDepositTopUp()`으로 크레딧 지급, 주문 `COMPLETED`
   - 매칭 실패/모호건은 `bank_deposit_notifications`에 보관(관리자 확인용, 입금 유실 X)

## 설정 (.env)

```
NEXT_PUBLIC_BANK_DEPOSIT_ENABLED="true"
NEXT_PUBLIC_BANK_DEPOSIT_BANK_NAME="국민은행"
NEXT_PUBLIC_BANK_DEPOSIT_ACCOUNT_NUMBER="123456-78-901234"
NEXT_PUBLIC_BANK_DEPOSIT_ACCOUNT_HOLDER="네안데르(주)"
BANK_DEPOSIT_MATCH_WINDOW_MINUTES="30"
# 인증: 아래 둘 중 하나만 채우면 됨
BANK_NOTIFY_INGEST_TOKEN="<openssl rand -hex 24>"   # (A) 직접 방식 — 권장, Cloudflare 불필요
BANK_NOTIFY_RELAY_SECRET=""                          # (B) HMAC 프록시 방식 — 선택(하드닝)
```

또한 충전 UI 자체가 보이려면 `NEXT_PUBLIC_SHOW_CREDIT_TOP_UP="true"`.

## 매칭 규칙

대기 주문 중 다음을 **모두** 만족하고 후보가 **정확히 1건**이면 자동지급:

- `status = WAITING_FOR_DEPOSIT` 이고 `paymentMethod = BANK_TRANSFER`
- 입금 **금액 == 주문 금액(price)** (정확히 일치)
- 정규화된 **입금자명 일치** (공백/특수문자 제거, 대소문자 무시)
- 주문 생성 시각이 입금 시각 기준 **시간창(기본 30분) 이내**

후보 0건 → `UNMATCHED`, 2건 이상 → `AMBIGUOUS` (둘 다 관리자 확인 큐로).
멱등성은 `externalId`(relay 제공 id 또는 본문 해시)로 보장.

## 중계기 (A) 직접 방식 — 권장, Cloudflare 불필요

폰이 SMOAT 엔드포인트를 직접 호출한다. Bearer 토큰으로 인증하고, 문자 원문을
text/plain 본문으로 그대로 보낸다(서버가 안전하게 감싸 파싱).

전용 안드로이드 폰 1대에 은행 입금알림 문자 수신을 설정한 뒤 **MacroDroid**:

1. 트리거: `SMS 수신` (발신: 은행 알림 번호, 내용에 "입금" 포함)
2. 액션: `HTTP 요청 (POST)`
   - URL: `https://www.smoat.co.kr/api/credits/top-ups/bank-notify`
   - 헤더: `Authorization: Bearer <BANK_NOTIFY_INGEST_TOKEN>`
   - Content-Type: `text/plain` (또는 비움 — application/json 으로 두지 말 것)
   - Body(매직텍스트): `{sms_message}` ← 문자 원문 그 자체. JSON 아님.

### 요청 계약 (직접 방식)

`POST /api/credits/top-ups/bank-notify`

- 인증: `Authorization: Bearer <BANK_NOTIFY_INGEST_TOKEN>`
- 본문 중 하나:
  - text/plain: 입금알림 문자 원문 그대로 → 서버가 `{ text }`로 감싸 파싱
  - application/json: `{ "text": "...", "externalId"?: "..." }` 또는
    `{ "amount": 19837, "depositorName": "홍길동", "externalId"?: "..." }`

curl 예시:
```bash
curl -X POST https://www.smoat.co.kr/api/credits/top-ups/bank-notify \
  -H "Authorization: Bearer $BANK_NOTIFY_INGEST_TOKEN" \
  -H "Content-Type: text/plain" \
  --data '[Web발신] 신한 입금 19,837원 홍길동 잔액1,234,567'
```

## 중계기 (B) HMAC 프록시 방식 — 선택(하드닝)

토큰을 폰에 두기 싫거나 변조 방지를 강화하려면 Cloudflare Worker 프록시를 둔다.
폰은 단순 토큰으로 워커에 보내고, 워커가 `BANK_NOTIFY_RELAY_SECRET`으로 본문을
HMAC-SHA256 서명(`x-bank-notify-signature: sha256=<hex>`)해 SMOAT로 전달한다.
설치/배포는 `tools/bank-notify-proxy/README.md` 참고.

> 서버는 (A) Bearer 토큰 **또는** (B) HMAC 서명 중 하나만 통과하면 수용한다.
> 둘 중 설정된 것으로 동작하며, 둘 다 설정해도 무방하다.

## 운영 주의

- **신뢰성**: 폰이 켜져 있어야 하고 알림이 지연될 수 있다. 매칭 실패건은
  `bank_deposit_notifications`(status=UNMATCHED/AMBIGUOUS)에 남으므로 관리자가
  주기적으로 확인하고 필요 시 수동 지급(관리자 크레딧 조정)으로 처리한다.
- **보안**: 엔드포인트는 HMAC 서명 없이는 거부(401). 시크릿 유출 시 즉시 회전.
- **회계**: 현금 입금이므로 현금영수증/세금계산서 의무는 별도 처리.
- **다날 실연동 완료 후**: 가상계좌/실시간 계좌이체로 자연스럽게 이관 가능.
  본 경로는 그대로 두거나 비활성화(ENABLED=false)하면 된다.

## 관련 코드

- 라이브러리: `src/lib/bank-deposit.ts`
- 주문 생성: `src/app/api/credits/top-ups/bank-deposit/prepare/route.ts`
- 입금 수신/매칭/지급: `src/app/api/credits/top-ups/bank-notify/route.ts`
- UI: `src/app/(director)/director/credits/_components/top-up-panel.tsx`
  (`BankDepositGuide`), `use-credits-controller.tsx`
- 스키마: `BankDepositNotification` (`prisma/schema.prisma`)
- 마이그레이션: `prisma/migrations-manual/20260630_bank_deposit_notifications.sql`
