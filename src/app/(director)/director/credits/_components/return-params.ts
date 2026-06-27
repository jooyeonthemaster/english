const CREDIT_PAYMENT_RETURN_PARAMS = [
  "paymentId",
  "merchant_uid",
  "imp_uid",
  "imp_success",
  "success",
  "error_code",
  "error_msg",
  "code",
  "message",
] as const;

export function clearCreditPaymentReturnParams() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of CREDIT_PAYMENT_RETURN_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) {
    window.history.replaceState(null, "", url.toString());
  }
}
