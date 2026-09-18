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

정의의 **단일 진실원은 `src/lib/admin-revenue.ts`** 다(계약 `docs/analytics/analytics-spec.md`
I9). 관리자 콘솔(대시보드·결제 관리·`/admin/costs`·BEP)이 전부 그 헬퍼를 쓰고,
피드도 금액·매출 인식 시각을 **그 헬퍼를 호출해서** 만든다 — 조건을 베껴 두면
한쪽만 고쳐질 때 숫자가 갈린다.

| 종류 | 조건 | 금액 | 인식 시각 |
| --- | --- | --- | --- |
| 크레딧 충전 | `COMPLETED` | `topUpAmount()` = `paidAmount ?? price` | `topUpPaidAt()` = `paidAt ?? completedAt` |
| 정기구독 | `PAID` | `paidAmount ?? amount` | `subscriptionPaidAt()` |
| 무통장 수기 | `MANUAL_GRANT` | `amount` | `manualGrantAt()` = `occurredAt ?? receivedAt` |

**부분 취소는 뺀다.** 부분 취소는 `status` 가 `COMPLETED` 인 채로 남기 때문에
(`portone-credit-topups.ts` 의 `nextStatus`) 상태만 보면 매출에 그대로 남는다.
피드는 PortOne 응답 원본의 `amount.cancelled` 를 읽어 취소액을 함께 보낸다.
(실DB 26-09-18 기준 부분취소 0건.)

### 아직 남은 차이 하나 — 환불된 충전

I9 는 「결제일에는 매출이었다」를 지켜 `REFUNDED` 도 **결제일 gross 에 넣고
환불일에 뺀다**(소급 삭제 금지). 피드는 그 줄을 `revenue:false,
excluded:"refunded"` 로 보낸다. 환불이 결제와 **같은 달**이면 두 정의가 같은
값을 내고, 달을 넘기면 갈린다.

26-09-18 실DB 대조 — `REFUNDED` 2건(6/9→6/10, 7/15→7/15) 모두 같은 달이라
**월별·최근 30일·이번 달 전 구간 차이 0원**(합계 1,770,000원 일치).

고치려면 `revenue` 의 뜻이 바뀌므로 `FEED_VERSION` 을 3 으로 올리고 ERP 저장소의
`lib/neander/sync/contract.ts` 를 **함께** 배포해야 한다. 한쪽만 바꾸면 ERP 가
동기화를 멈춘다.

## 피드 부르는 법

```
GET /api/erp/feed?after=<cursorKey>&limit=300   바뀐 충전·구독 (커서는 updatedAt ISO|id)
                                                + 처리된 무통장 알림 전부 + 월별 원가
GET /api/erp/feed?costs=only                    월별 원가만
```

무통장 알림(`bank_deposit_notifications`)에는 수정 시각이 없어서 커서로 보내지
않고 **매번 통째로** 보낸다. 수기 지급이 나중에 충전에 연결되면(MATCHED) ERP 가
수기 지급 줄을 지워야 같은 돈이 두 번 잡히지 않는다.

월별 원가의 달 경계는 KST 다. 이 DB 의 시각 열은 시간대 없는 `TIMESTAMP(3)` 에
UTC 를 담으므로 `(col AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul'` 로 두 번 건다.

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
