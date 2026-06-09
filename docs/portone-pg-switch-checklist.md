# PortOne KG Inicis Switch Checklist

This checklist tracks the active SMOAT credit top-up payment migration from NHN
KCP to KG Inicis through PortOne V2 without changing the product or review
scope.

## Current Review Scope

- Product: SMOAT credit top-up digital goods
- Payment method: credit card one-time payment only
- Subscription billing: excluded from the current PG/card review
- Public payment pages must not mention subscription billing while
  `NEXT_PUBLIC_SHOW_SUBSCRIPTION_BILLING=false`.

## Current Decision

- Proceed with KG Inicis V2 for the PG review channel.
- Keep the current PortOne V2 integration shape and replace only the channel,
  provider defaults, review copy, and environment values.
- Keep KCP code paths available behind `kcp_v2` so we can roll back by changing
  environment variables if needed.

## Code Readiness

- Default PG provider and public PG name are `inicis_v2` / `KG이니시스`.
- Credit top-up UI is limited to `CARD` when
  `NEXT_PUBLIC_PORTONE_TOP_UP_PAY_METHODS=CARD`.
- Credit top-up payment requests include customer name, phone, email, and
  customer ID because KG Inicis requires customer information for PC payments.
- Public product, terms, privacy, and refund pages describe credit-card one-time
  top-up review scope when the public pay-method env is `CARD`.

## Manual PortOne Setup

1. In the PortOne console, apply for or create a KG Inicis V2 general payment
   channel for `https://www.smoat.co.kr`.
2. Copy the live/review `storeId`, `channelKey`, API secret, and webhook secret.
3. Register the production webhook URL after the channel/store change.
4. Run the PortOne webhook test before submitting the PG review.

## Vercel Variables for KG Inicis

Set these in Production and redeploy:

```env
PORTONE_API_SECRET="..."
PORTONE_WEBHOOK_SECRET="..."
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
