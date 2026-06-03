# PortOne PG Switch Checklist

This checklist is for switching SMOAT credit top-up payments from NHN KCP to
KG Inicis through PortOne V2 without changing the product or review scope.

## Current Review Scope

- Product: SMOAT credit top-up digital goods
- Payment method: credit card one-time payment only
- Subscription billing: excluded from the current PG/card review
- Public payment pages must not mention subscription billing while
  `NEXT_PUBLIC_SHOW_SUBSCRIPTION_BILLING=false`.

## Keep KCP When

- KCP confirms the existing contract/site code can be reused.
- KCP confirms no additional setup fee is required for `https://www.smoat.co.kr`.
- The existing PortOne KCP channel can be promoted to the review/live channel.

## Switch to KG Inicis When

- KCP requires a new setup fee for the new SMOAT site.
- KG Inicis setup fee is still free in PortOne's current pricing table.
- KG Inicis can support the same review scope: credit card one-time payment.

## Vercel Variables for KG Inicis

Set these in Production and redeploy:

```env
PORTONE_STORE_ID="store-..."
PORTONE_CHANNEL_KEY="channel-key-..."
NEXT_PUBLIC_PORTONE_STORE_ID="store-..."
NEXT_PUBLIC_PORTONE_CHANNEL_KEY="channel-key-..."
PORTONE_PG_PROVIDER="inicis_v2"
NEXT_PUBLIC_PORTONE_PG_PROVIDER="inicis_v2"
NEXT_PUBLIC_PAYMENT_PG_NAME="KG이니시스"
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
6. Complete one test card top-up.
7. Confirm the credit balance increases.
8. Confirm the top-up row is `COMPLETED` and PortOne status is `PAID`.
9. Confirm public pages show `KG이니시스` in the privacy policy.
10. Confirm public pages still do not mention subscription billing.

## Submission Notes

- Service URL: `https://www.smoat.co.kr`
- Product info: `https://www.smoat.co.kr/credits/products`
- Terms: `https://www.smoat.co.kr/terms`
- Privacy: `https://www.smoat.co.kr/privacy`
- Refund policy: `https://www.smoat.co.kr/refund-policy`
- Payment path: login -> credit management -> select credit product -> card
  payment
