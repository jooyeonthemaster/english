# PortOne Danal Switch Checklist

This checklist tracks the active SMOAT credit top-up payment migration from NHN
KCP/KG Inicis to Danal through PortOne without changing the product or review
scope.

## Current Review Scope

- Product: SMOAT credit top-up digital goods
- Payment method: credit card one-time payment only
- Subscription billing: excluded from the current PG/card review
- Public payment pages must not mention subscription billing while
  `NEXT_PUBLIC_SHOW_SUBSCRIPTION_BILLING=false`.

## Current Decision

- Proceed with Danal TPay (`danal_tpay`) for the PG review channel.
- Keep the existing PortOne server-side payment verification and webhook flow.
- Danal test checkout may be a PortOne V1 checkout channel. If the channel
  cannot be invoked through the V2 browser SDK, set the PortOne V1 customer code
  (`imp...`) so the page uses `IMP.request_pay` for the Danal card checkout.
- Keep KG Inicis and KCP code paths available behind `inicis_v2` / `kcp_v2` so
  we can roll back by changing environment variables if needed.

## Code Readiness

- Default PG provider and public PG name are `danal_tpay` / `다날`.
- Credit top-up UI is limited to `CARD` when
  `NEXT_PUBLIC_PORTONE_TOP_UP_PAY_METHODS=CARD`.
- Credit top-up payment requests include customer name, phone, email, and
  customer ID because Korean PG checkout flows can require buyer information.
- Danal V1 checkout support is enabled when `PORTONE_V1_CUSTOMER_CODE` or
  `NEXT_PUBLIC_PORTONE_V1_CUSTOMER_CODE` is configured.
- Public product, terms, privacy, and refund pages describe credit-card one-time
  top-up review scope when the public pay-method env is `CARD`.

## Manual PortOne Setup

1. In the PortOne console, apply for or create a Danal general card payment
   channel for `https://www.smoat.co.kr`.
2. Copy the live/review `storeId`, Danal `channelKey`, API secret, and webhook
   secret.
3. If the Danal channel is shown as 결제창 V1, copy the PortOne V1 customer code
   that starts with `imp`.
4. Register the production webhook URL after the channel/store change. For both
   V2 and V1 notification settings, use
   `https://www.smoat.co.kr/api/portone/webhook`.
5. Run the PortOne webhook test before submitting the PG review.

## Vercel Variables for Danal

Set these in Production and redeploy:

```env
PORTONE_API_SECRET="..."
PORTONE_WEBHOOK_SECRET="..."
PORTONE_STORE_ID="store-..."
PORTONE_CHANNEL_KEY="channel-key-..."
NEXT_PUBLIC_PORTONE_STORE_ID="store-..."
NEXT_PUBLIC_PORTONE_CHANNEL_KEY="channel-key-..."
PORTONE_PG_PROVIDER="danal_tpay"
NEXT_PUBLIC_PORTONE_PG_PROVIDER="danal_tpay"
NEXT_PUBLIC_PAYMENT_PG_NAME="다날"
PORTONE_V1_CUSTOMER_CODE="imp..."
NEXT_PUBLIC_PORTONE_V1_CUSTOMER_CODE="imp..."
PORTONE_V1_REST_API_KEY="..."      # Danal V1 admin cancellation fallback
PORTONE_V1_REST_API_SECRET="..."   # Danal V1 admin cancellation fallback
PORTONE_TOP_UP_PAY_METHODS="CARD"
NEXT_PUBLIC_PORTONE_TOP_UP_PAY_METHODS="CARD"
NEXT_PUBLIC_SHOW_SUBSCRIPTION_BILLING=false
```

Rotate/recreate the webhook secret after the PortOne channel/store changes, then
update `PORTONE_WEBHOOK_SECRET` in Vercel Production and redeploy.

## Verification

1. Confirm PortOne webhook call test returns HTTP 200.
2. Confirm unsigned webhook POST still returns `400 invalid_webhook`.
3. Login with the PG review account.
4. Open `/director/credits`.
5. Confirm only the card payment method is visible.
6. Complete one Danal test card top-up.
7. Confirm the credit balance increases.
8. Confirm the top-up row is `COMPLETED` and PortOne status is `PAID`.
9. Confirm public pages show `다날` in the privacy policy.
10. Confirm public pages still do not mention subscription billing.

## Submission Notes

- Service URL: `https://www.smoat.co.kr`
- Product info: `https://www.smoat.co.kr/credits/products`
- Terms: `https://www.smoat.co.kr/terms`
- Privacy: `https://www.smoat.co.kr/privacy`
- Refund policy: `https://www.smoat.co.kr/refund-policy`
- Payment path: login -> credit management -> select credit product -> card
  payment
