# Bank Notify Signature Proxy (선택 — 하드닝용)

> **이 프록시는 필수가 아니다.** 기본(권장) 방식은 폰이 SMOAT를 직접 호출하는 것
> (`BANK_NOTIFY_INGEST_TOKEN` Bearer 토큰, docs/BANK-DEPOSIT-AUTO-CREDIT.md 참고).
> 토큰을 폰에 두기 싫거나 HMAC 변조방지를 더 원할 때만 이 프록시를 쓴다.

안드로이드 SMS 포워더와 SMOAT 사이에 두는 얇은 서명 프록시(Cloudflare Worker).
폰은 단순 Bearer 토큰으로 인증하고, 워커가 본문을 `BANK_NOTIFY_RELAY_SECRET`으로
HMAC-SHA256 서명해 `/api/credits/top-ups/bank-notify`로 전달한다.

```
[은행 입금알림 SMS]
      ↓ (안드로이드 SMS 포워더, MacroDroid 등)
POST https://<worker>.workers.dev/   Authorization: Bearer <INGEST_TOKEN>
      ↓ (Cloudflare Worker — 본문 HMAC 서명 부착)
POST https://smoat.co.kr/api/credits/top-ups/bank-notify
      x-bank-notify-signature: sha256=<hex>
```

## 배포

```bash
npm i -g wrangler
wrangler login
cd tools/bank-notify-proxy

# SMOAT 의 BANK_NOTIFY_RELAY_SECRET 과 동일한 값
wrangler secret put RELAY_SECRET

# 폰 → 워커 인증용 임의 토큰 (openssl rand -hex 16)
wrangler secret put INGEST_TOKEN

# wrangler.toml 의 TARGET_URL 을 실제 배포 도메인으로 수정한 뒤
wrangler deploy
```

## 폰 세팅 (MacroDroid) — 단계별

> 폰은 **문자 원문만 그대로** 보내면 된다. JSON 조립은 Worker가 하므로
> 줄바꿈/따옴표 걱정이 없다.

### 0. 사전 준비
1. 전용(또는 여분) 안드로이드 폰 1대. 이 폰 번호로 **은행 입금알림 문자**가 오게
   해둔다(거래은행 앱/콜센터에서 해당 계좌 "입금내역 SMS 알림" 신청 — 본인계좌라 즉시).
2. Play 스토어에서 **MacroDroid** 설치 → 실행 → 권한 요청에서 **SMS 읽기 허용**.
3. 설정 → 배터리 → MacroDroid를 **배터리 최적화 제외**(백그라운드 종료 방지).
   가능하면 폰을 충전기에 꽂아 상시 켜둔다. Wi‑Fi/데이터 연결 유지.

### 1. 매크로 생성
- MacroDroid 홈 → **매크로 추가(+)** → 이름: `입금알림 → SMOAT`

### 2. 트리거(Trigger)
- **트리거 추가** → 카테고리 **`SMS/통화`** → **`SMS 수신`**
- 설정:
  - 발신자: 은행 알림 번호를 알면 그 번호로 지정(노이즈 차단). 모르면 `모든 연락처`.
  - 내용 필터: `메시지 내용 포함` = `입금` (선택이지만 권장).

### 3. 액션(Action) — HTTP 요청
- **액션 추가** → 카테고리 **`연결(Connectivity)`** → **`HTTP 요청(HTTP Request)`**
- 설정:
  - 방식(Method): **POST**
  - URL: `https://<worker-subdomain>.workers.dev/`
  - **헤더(Headers)** 추가:
    - `Authorization` = `Bearer <INGEST_TOKEN>`
  - **본문(Body / Content)**: 아래 한 줄만. 매직텍스트 `{}` 버튼 → `SMS` →
    `메시지 내용`을 골라 `{sms_message}`를 삽입한다.
    ```
    {sms_message}
    ```
    즉 본문은 JSON이 아니라 **문자 원문 그 자체**. (Worker가 `{"text": ...}`로 감싼다.)
  - 콘텐츠 타입(Content-Type) 항목이 있으면 `text/plain` 또는 비워둔다.
    (`application/json`으로 두지 말 것 — 그러면 원문을 JSON으로 오인한다.)
  - (선택) 중복 방지를 더 확실히 하려면 헤더 `x-external-id` = `{sms_message}` 의
    해시 대신, MacroDroid 매직텍스트 `{systemtime}` 등을 넣어도 된다. 보통은
    불필요(서버가 문자 내용으로 중복을 걸러낸다).

### 4. 저장 후 테스트
- 매크로 저장 → 본인에게 테스트 문자를 보내거나 소액 실입금으로 확인.
- 관리자 화면 **무통장입금 검토**에서 수신 여부 확인 가능.

## 로컬 테스트

```bash
wrangler dev
# 다른 터미널에서:
curl -X POST http://localhost:8787/ \
  -H "Authorization: Bearer <INGEST_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"text":"[Web발신] 신한 입금 19,837원 홍길동 잔액1,234,567","externalId":"t1"}'
```

프록시 없이 직접 SMOAT를 호출해 검증하려면 `tools/bank-notify-proxy/sign-and-post.sh` 참고.
