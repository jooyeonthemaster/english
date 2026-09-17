# 본사 ERP 매출 피드

본사 ERP(NEANDER)가 SMOAT 결제를 **자동으로** 가져갑니다. ERP 의 매출
워크스페이스에 「SMOAT」 화면이 생기고, 누가 어떤 팩을 샀는지·AI 원가를 뺀
공헌이익·아직 안 쓰인 크레딧(선수금)이 거기 나옵니다.

전체 설계·켜는 순서는 ERP 저장소의 `docs/sales-auto-sync.md` 에 있습니다.
이 문서는 **이 서비스 쪽에서 알아야 할 것**만 적습니다.

## 추가된 것

| 파일 | 하는 일 |
| --- | --- |
| `src/app/api/erp/feed/route.ts` | 읽기 전용 피드. 결제 줄 + 월별 AI 원가·크레딧 |
| `src/lib/erp/feed-auth.ts` | Bearer 토큰 검사 (bank-notify 와 같은 방식) |
| `src/lib/erp/feed-contract.ts` | ERP 와의 계약 사본 |
| `src/lib/erp/signal.ts` | 결제 확정·환불 직후 ERP 에 빈 신호 |

신호를 보내는 자리 (셋):

- `src/lib/portone-credit-topups.ts` — 크레딧 충전 확정 (`notifyTopUpPaid` 옆)
- `src/app/api/admin/credits/top-ups/[topUpId]/cancel/route.ts` — 충전 환불
- `src/app/api/admin/credits/bank-deposits/[id]/route.ts` — 무통장 수기 지급

## 무엇이 매출인가

`/admin/costs` (`src/actions/admin/operations-cost.ts`) 와 **같은 판정**을 쓴다:

| 종류 | 조건 | 금액 |
| --- | --- | --- |
| 크레딧 충전 | `COMPLETED` | `paidAmount ?? price` |
| 정기구독 | `PAID` | `paidAmount ?? amount` |
| 무통장 수기 | `MANUAL_GRANT` | `amount` |

**다른 점 하나 — 환불을 뺀다.** 부분 취소는 `status` 가 `COMPLETED` 인 채로
남기 때문에(`portone-credit-topups.ts` 의 `nextStatus`), 상태만 보면 부분 환불이
매출에 그대로 남는다. 피드는 PortOne 응답 원본의 `amount.cancelled` 를 읽어
취소액을 함께 보낸다. `/admin/costs` 와 ERP 의 숫자가 다르면 ERP 쪽이 맞다.

## 환경변수

```
ERP_FEED_TOKEN       ERP 가 피드를 읽을 때 제시하는 토큰 (비우면 피드가 닫힘)
ERP_SYNC_SIGNAL_URL  https://<ERP 도메인>/api/neander/sync/signal
ERP_SIGNAL_TOKEN     신호에 붙이는 토큰
```

## 지키는 것

- **읽기 전용.** 피드 라우트는 아무것도 쓰지 않는다.
- **개인정보 없음.** 원장(Staff)의 이름·이메일·전화를 보내지 않는다. 학원 이름까지만.
- **신호는 결제를 막지 않는다.** await 하지 않고, 실패해도 throw 하지 않는다.

## 계약을 바꿀 때

`FEED_VERSION` 을 올리고 ERP 쪽 `lib/neander/sync/contract.ts` 를 **함께** 고쳐
배포한다. 판이 어긋나면 ERP 가 동기화를 멈추고 화면에 붉게 띄운다.
