import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import {
  buildPortOnePaymentId,
  buildTopUpOrderName,
  getAllowedPortOneTopUpPayMethods,
  getPortOnePgProvider,
  getPortOneRuntimeConfig,
  isPortOneTopUpPayMethod,
  PortOneTopUpError,
  preRegisterPortOnePayment,
  type PortOnePgProvider,
  type PortOneTopUpPayMethod,
} from "@/lib/portone-credit-topups";
import { getActiveCreditTopUpProductByCredits } from "@/lib/credit-top-up-products";
import { BUSINESS_INFO } from "@/lib/legal/business-info";

const prepareSchema = z.object({
  credits: z.number().int().positive(),
  payMethod: z.string().optional(),
  easyPayProvider: z.string().optional(),
});

const EASY_PAY_PROVIDERS = [
  "KAKAOPAY",
  "NAVERPAY",
  "TOSSPAY",
  "PAYCO",
] as const;

type EasyPayProvider = (typeof EASY_PAY_PROVIDERS)[number];

type PaymentCustomer = {
  customerId: string;
  fullName: string;
  phoneNumber: string;
  email: string;
};

type PortOneV2PaymentRequest = {
  storeId: string;
  channelKey: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  currency: "KRW";
  payMethod: PortOneTopUpPayMethod;
  redirectUrl: string;
  customData: Record<string, unknown>;
  customer: PaymentCustomer;
  productType: "DIGITAL";
  products: Array<{
    id: string;
    name: string;
    amount: number;
    quantity: number;
  }>;
  easyPay?: {
    easyPayProvider: EasyPayProvider;
  };
  virtualAccount?: {
    accountExpiry: {
      validHours: number;
    };
  };
  mobile?: Record<string, never>;
  bypass?: {
    kcp_v2?: {
      shop_user_id: string;
    };
    inicis_v2?: {
      noeasypay?: string;
      P_MNAME?: string;
      P_RESERVED?: string[];
    };
  };
};

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

type PaymentRequest = PortOneV2PaymentRequest | DanalLegacyPaymentRequest;

export async function POST(request: NextRequest) {
  try {
    const staff = await requireStaffAuth("DIRECTOR");
    const body = await request.json().catch(() => null);
    const parsed = prepareSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "충전 상품을 다시 선택해주세요." },
        { status: 400 },
      );
    }

    const product = await getActiveCreditTopUpProductByCredits(parsed.data.credits);
    if (!product) {
      return NextResponse.json(
        { error: "지원하지 않는 충전 상품입니다." },
        { status: 400 },
      );
    }

    const payMethod: PortOneTopUpPayMethod = isPortOneTopUpPayMethod(
      parsed.data.payMethod,
    )
      ? parsed.data.payMethod
      : "CARD";
    const allowedPayMethods = getAllowedPortOneTopUpPayMethods();
    if (!allowedPayMethods.includes(payMethod)) {
      return NextResponse.json(
        { error: "현재 PG 심사/계약 범위에서 지원하지 않는 결제수단입니다." },
        { status: 400 },
      );
    }

    const { storeId, channelKey } = getPortOneRuntimeConfig();
    const pgProvider = getPortOnePgProvider();
    const appUrl = getAppUrl();
    const paymentId = buildPortOnePaymentId();
    const orderName = buildTopUpOrderName(product.creditAmount);
    const staffProfile = await getStaffPaymentProfile(staff.id);
    const customer = buildPaymentCustomer({
      academyId: staff.academyId,
      academyName: staffProfile?.academy.name ?? staff.academyName,
      academyPhone: staffProfile?.academy.phone,
      staffId: staff.id,
      staffName: staffProfile?.name ?? staff.name,
      staffEmail: staffProfile?.email ?? staff.email,
      staffPhone: staffProfile?.phone,
    });

    const topUp = await prisma.creditTopUp.create({
      data: {
        academyId: staff.academyId,
        creditAmount: product.creditAmount,
        price: product.price,
        paymentMethod: payMethod,
        paymentId,
        orderName,
        storeId,
        channelKey,
        currency: "KRW",
        requestedBy: staff.id,
        customData: {
          topUpId: "",
          academyId: staff.academyId,
          staffId: staff.id,
          credits: product.creditAmount,
          price: product.price,
          productCode: product.code,
          basePrice: product.basePrice,
          discountRate: product.isPromotionActive ? product.discountRate : 0,
        },
      },
      select: { id: true },
    });

    const customData = {
      topUpId: topUp.id,
      academyId: staff.academyId,
      staffId: staff.id,
      credits: product.creditAmount,
      price: product.price,
      productCode: product.code,
      basePrice: product.basePrice,
      discountRate: product.isPromotionActive ? product.discountRate : 0,
    };

    await prisma.creditTopUp.update({
      where: { id: topUp.id },
      data: { customData },
    });

    if (!usesDanalLegacyCheckout({ pgProvider, payMethod })) {
      try {
        await preRegisterPortOnePayment({
          paymentId,
          totalAmount: product.price,
        });
      } catch (err) {
        const portOneErrorMessage = getPortOneErrorMessage(err);
        await prisma.creditTopUp.update({
          where: { id: topUp.id },
          data: {
            status: "FAILED",
            failureCode: "PRE_REGISTER_FAILED",
            failureMessage: portOneErrorMessage,
          },
        });
        console.error("[credits/top-ups/prepare] pre-register failed", {
          topUpId: topUp.id,
          paymentId,
          message: portOneErrorMessage,
          errorName: err instanceof Error ? err.name : undefined,
        });
        return NextResponse.json(
          { error: getPrepareErrorMessage(portOneErrorMessage) },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      topUpId: topUp.id,
      paymentRequest: buildPaymentRequest({
        storeId,
        channelKey,
        paymentId,
        orderName,
        totalAmount: product.price,
        pgProvider,
        payMethod,
        easyPayProvider: parsed.data.easyPayProvider,
        staffId: staff.id,
        redirectUrl: `${appUrl}/director/credits`,
        customData,
        productCode: product.code,
        customer,
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json(
        { error: "크레딧 충전 권한이 없습니다." },
        { status: 403 },
      );
    }

    if (err instanceof PortOneTopUpError && err.code === "CONFIG_MISSING") {
      return NextResponse.json(
        {
          error:
            "포트원 결제 설정이 아직 연결되지 않았습니다. API Secret, Store ID, Channel Key를 설정해주세요.",
          code: err.code,
        },
        { status: 503 },
      );
    }

    console.error("[credits/top-ups/prepare] failed", err);
    return NextResponse.json(
      { error: "결제 설정을 확인해주세요." },
      { status: 500 },
    );
  }
}

function buildPaymentRequest(params: {
  storeId: string;
  channelKey: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  pgProvider: PortOnePgProvider;
  payMethod: PortOneTopUpPayMethod;
  easyPayProvider?: string;
  staffId: string;
  redirectUrl: string;
  customData: Record<string, unknown>;
  productCode: string;
  customer: PaymentCustomer;
}): PaymentRequest {
  const legacyDanalRequest = buildDanalLegacyPaymentRequest(params);
  if (legacyDanalRequest) {
    return legacyDanalRequest;
  }

  const base: PortOneV2PaymentRequest = {
    storeId: params.storeId,
    channelKey: params.channelKey,
    paymentId: params.paymentId,
    orderName: params.orderName,
    totalAmount: params.totalAmount,
    currency: "KRW",
    payMethod: params.payMethod,
    redirectUrl: params.redirectUrl,
    customData: params.customData,
    customer: params.customer,
    productType: "DIGITAL",
    products: [
      {
        id: params.productCode,
        name: params.orderName,
        amount: params.totalAmount,
        quantity: 1,
      },
    ],
  };

  if (params.payMethod === "CARD" && params.pgProvider === "inicis_v2") {
    return {
      ...base,
      bypass: {
        inicis_v2: {
          noeasypay: "Y",
          P_MNAME: "SMOAT",
          P_RESERVED: ["noeasypay=Y"],
        },
      },
    };
  }

  if (params.payMethod === "EASY_PAY") {
    return {
      ...base,
      easyPay: {
        easyPayProvider: getEasyPayProvider(params.easyPayProvider),
      },
    };
  }

  if (params.payMethod === "VIRTUAL_ACCOUNT") {
    return {
      ...base,
      virtualAccount: {
        accountExpiry: {
          validHours: 24,
        },
      },
    };
  }

  if (params.payMethod === "MOBILE") {
    const request: PortOneV2PaymentRequest = {
      ...base,
      mobile: {},
    };
    if (params.pgProvider === "kcp_v2") {
      request.bypass = {
        kcp_v2: {
          shop_user_id: buildKcpShopUserId(params.staffId),
        },
      };
    }
    return request;
  }

  return base;
}

function buildDanalLegacyPaymentRequest(params: {
  channelKey: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  pgProvider: PortOnePgProvider;
  payMethod: PortOneTopUpPayMethod;
  redirectUrl: string;
  customData: Record<string, unknown>;
  customer: PaymentCustomer;
}): DanalLegacyPaymentRequest | null {
  if (
    !usesDanalLegacyCheckout({
      pgProvider: params.pgProvider,
      payMethod: params.payMethod,
    })
  ) {
    return null;
  }

  const userCode = getPortOneV1CustomerCode();
  if (!userCode) return null;

  return {
    sdkVersion: "v1",
    userCode,
    channelKey: params.channelKey,
    pg: "danal_tpay",
    pay_method: "card",
    merchant_uid: params.paymentId,
    name: params.orderName,
    amount: params.totalAmount,
    buyer_name: params.customer.fullName,
    buyer_tel: params.customer.phoneNumber,
    buyer_email: params.customer.email,
    m_redirect_url: params.redirectUrl,
    custom_data: params.customData,
  };
}

function usesDanalLegacyCheckout(params: {
  pgProvider: PortOnePgProvider;
  payMethod: PortOneTopUpPayMethod;
}) {
  return (
    params.pgProvider === "danal_tpay" &&
    params.payMethod === "CARD" &&
    Boolean(getPortOneV1CustomerCode())
  );
}

async function getStaffPaymentProfile(staffId: string) {
  return prisma.staff.findUnique({
    where: { id: staffId },
    select: {
      name: true,
      email: true,
      phone: true,
      academy: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
  });
}

function buildPaymentCustomer(params: {
  academyId: string;
  academyName: string;
  academyPhone?: string | null;
  staffId: string;
  staffName?: string | null;
  staffEmail?: string | null;
  staffPhone?: string | null;
}): PaymentCustomer {
  return {
    customerId: buildCustomerId(params.academyId, params.staffId),
    fullName:
      normalizeText(params.staffName) ??
      normalizeText(params.academyName) ??
      BUSINESS_INFO.brandName,
    phoneNumber:
      normalizePhone(params.staffPhone) ??
      normalizePhone(params.academyPhone) ??
      normalizePhone(BUSINESS_INFO.phone) ??
      "02-336-3368",
    email:
      normalizeEmail(params.staffEmail) ??
      normalizeEmail(BUSINESS_INFO.email) ??
      "info@neander.co.kr",
  };
}

function buildCustomerId(academyId: string, staffId: string) {
  const normalized = `${academyId}${staffId}`
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 18);
  return `sm${normalized || "customer"}`.slice(0, 20);
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizePhone(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "심사 제출 전 입력 필요") return undefined;
  return trimmed;
}

function normalizeEmail(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "심사 제출 전 입력 필요") return undefined;
  return trimmed;
}

function getAppUrl() {
  const appUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL;
  if (!appUrl) {
    throw new PortOneTopUpError(
      "CONFIG_MISSING",
      "App URL must be configured for PortOne redirectUrl.",
    );
  }
  return appUrl.replace(/\/+$/, "");
}

function getPortOneV1CustomerCode() {
  const raw =
    process.env.PORTONE_V1_CUSTOMER_CODE ??
    process.env.NEXT_PUBLIC_PORTONE_V1_CUSTOMER_CODE ??
    process.env.PORTONE_V1_MERCHANT_ID ??
    process.env.NEXT_PUBLIC_PORTONE_V1_MERCHANT_ID ??
    process.env.PORTONE_IMP_CODE ??
    process.env.NEXT_PUBLIC_PORTONE_IMP_CODE;

  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || null;
  }
  return trimmed;
}

function getEasyPayProvider(value: unknown): EasyPayProvider {
  if (
    typeof value === "string" &&
    (EASY_PAY_PROVIDERS as readonly string[]).includes(value)
  ) {
    return value as EasyPayProvider;
  }
  return "KAKAOPAY";
}

function buildKcpShopUserId(staffId: string) {
  const normalized = staffId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 50);
  return normalized || "smoat_user";
}

function getPortOneErrorMessage(err: unknown) {
  const dataType = getPortOneErrorDataType(err);
  if (dataType) {
    return dataType;
  }
  if (isErrorWithDataMessage(err)) {
    return err.data.message;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "PortOne payment pre-registration failed.";
}

function getPortOneErrorDataType(err: unknown) {
  if (
    typeof err === "object" &&
    err !== null &&
    "data" in err &&
    typeof (err as { data?: unknown }).data === "object" &&
    (err as { data?: unknown }).data !== null &&
    "type" in ((err as { data: object }).data) &&
    typeof (err as { data: { type?: unknown } }).data.type === "string"
  ) {
    return (err as { data: { type: string } }).data.type;
  }
  return null;
}

function isErrorWithDataMessage(
  err: unknown,
): err is { data: { message: string } } {
  return (
    typeof err === "object" &&
    err !== null &&
    "data" in err &&
    typeof (err as { data?: unknown }).data === "object" &&
    (err as { data?: unknown }).data !== null &&
    "message" in ((err as { data: object }).data) &&
    typeof (err as { data: { message?: unknown } }).data.message === "string"
  );
}

function getPrepareErrorMessage(message: string) {
  if (/invalid api secret/i.test(message)) {
    return "포트원 API Secret이 올바르지 않습니다. API Keys 탭에서 발급한 V2 API Secret을 입력해주세요.";
  }
  if (/unauthorized/i.test(message)) {
    return "포트원 인증에 실패했습니다. 채널 관리의 PG상점아이디/사이트키가 아니라, 식별코드·API Keys 탭의 Store ID와 V2 API Secret을 입력해주세요.";
  }
  return "결제 준비 중 오류가 발생했습니다.";
}
