type DanalLegacyPaymentRequest = {
  sdkVersion: "v1";
  userCode: string;
  channelKey: string;
  pg: "danal_tpay";
  pay_method: "card";
  merchant_uid: string;
  name: string;
  amount: number;
  buyer_name: string;
  buyer_tel: string;
  buyer_email: string;
  m_redirect_url: string;
  custom_data: Record<string, unknown>;
};

export type DanalLegacyPaymentParams = Omit<
  DanalLegacyPaymentRequest,
  "sdkVersion" | "userCode"
>;

export type DanalLegacyPaymentResponse = {
  success?: boolean;
  imp_uid?: string;
  merchant_uid?: string;
  error_code?: string;
  error_msg?: string;
};

const PORTONE_V1_SDK_URL = "https://cdn.iamport.kr/v1/iamport.js";

let portOneV1SdkPromise: Promise<void> | null = null;

export function isDanalLegacyPaymentRequest(
  value: unknown,
): value is DanalLegacyPaymentRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { sdkVersion?: unknown }).sdkVersion === "v1" &&
    (value as { pg?: unknown }).pg === "danal_tpay" &&
    typeof (value as { userCode?: unknown }).userCode === "string" &&
    typeof (value as { merchant_uid?: unknown }).merchant_uid === "string"
  );
}

export async function requestDanalLegacyPayment(request: DanalLegacyPaymentRequest) {
  await loadPortOneV1Sdk();
  const imp = window.IMP;
  if (!imp) {
    throw new Error("다날 결제창 SDK를 불러오지 못했습니다.");
  }

  imp.init(request.userCode);

  const paymentParams: DanalLegacyPaymentParams = {
    channelKey: request.channelKey,
    pg: request.pg,
    pay_method: request.pay_method,
    merchant_uid: request.merchant_uid,
    name: request.name,
    amount: request.amount,
    buyer_name: request.buyer_name,
    buyer_tel: request.buyer_tel,
    buyer_email: request.buyer_email,
    m_redirect_url: request.m_redirect_url,
    custom_data: request.custom_data,
  };

  return new Promise<{ paymentId: string }>((resolve, reject) => {
    imp.request_pay(paymentParams, (response) => {
      if (response.success) {
        resolve({ paymentId: response.merchant_uid || request.merchant_uid });
        return;
      }
      reject(new Error(getDanalLegacyErrorMessage(response)));
    });
  });
}

function loadPortOneV1Sdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저에서만 결제창을 호출할 수 있습니다."));
  }
  if (window.IMP) return Promise.resolve();
  if (portOneV1SdkPromise) return portOneV1SdkPromise;

  portOneV1SdkPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${PORTONE_V1_SDK_URL}"]`,
    );

    const handleLoad = () => {
      if (window.IMP) {
        resolve();
      } else {
        portOneV1SdkPromise = null;
        reject(new Error("다날 결제창 SDK 초기화에 실패했습니다."));
      }
    };
    const handleError = () => {
      portOneV1SdkPromise = null;
      reject(new Error("다날 결제창 SDK를 불러오지 못했습니다."));
    };

    if (existingScript) {
      if (window.IMP) {
        resolve();
        return;
      }
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = PORTONE_V1_SDK_URL;
    script.async = true;
    script.onload = handleLoad;
    script.onerror = handleError;
    document.head.appendChild(script);
  });

  return portOneV1SdkPromise;
}

function getDanalLegacyErrorMessage(response: DanalLegacyPaymentResponse) {
  if (response.error_msg) return response.error_msg;
  if (response.error_code) {
    return `결제가 완료되지 않았습니다. (${response.error_code})`;
  }
  return "결제가 완료되지 않았습니다.";
}
