export type BusinessInfo = {
  companyName: string;
  brandName: string;
  representativeName: string;
  businessRegistrationNumber: string;
  mailOrderSalesNumber: string;
  address: string;
  phone: string;
  email: string;
  hostingProvider: string;
  businessInfoVerifyUrl: string;
};

const MISSING_VALUE = "심사 제출 전 입력 필요";
const DEFAULT_BUSINESS_REGISTRATION_NUMBER = "683-86-02812";

function publicEnv(value: string | undefined, fallback = MISSING_VALUE) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export const BUSINESS_INFO: BusinessInfo = {
  companyName: publicEnv(
    process.env.NEXT_PUBLIC_BUSINESS_COMPANY_NAME,
    "주식회사 네안데르",
  ),
  brandName: publicEnv(process.env.NEXT_PUBLIC_BUSINESS_BRAND_NAME, "SMOAT"),
  representativeName: publicEnv(
    process.env.NEXT_PUBLIC_BUSINESS_REPRESENTATIVE,
    "유재영, 이동주",
  ),
  businessRegistrationNumber: publicEnv(
    process.env.NEXT_PUBLIC_BUSINESS_REGISTRATION_NUMBER,
    DEFAULT_BUSINESS_REGISTRATION_NUMBER,
  ),
  mailOrderSalesNumber: publicEnv(
    process.env.NEXT_PUBLIC_BUSINESS_MAIL_ORDER_NUMBER,
    "2023-서울서대문-1558",
  ),
  address: publicEnv(
    process.env.NEXT_PUBLIC_BUSINESS_ADDRESS,
    "서울 마포구 독막로36길 10-6, 1층(대흥동)",
  ),
  phone: publicEnv(process.env.NEXT_PUBLIC_BUSINESS_PHONE, "02-336-3368"),
  email: publicEnv(
    process.env.NEXT_PUBLIC_BUSINESS_EMAIL,
    "info@neander.co.kr",
  ),
  hostingProvider: publicEnv(
    process.env.NEXT_PUBLIC_BUSINESS_HOSTING_PROVIDER,
    "",
  ),
  businessInfoVerifyUrl: publicEnv(
    process.env.NEXT_PUBLIC_BUSINESS_INFO_VERIFY_URL,
    `https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${digitsOnly(
      DEFAULT_BUSINESS_REGISTRATION_NUMBER,
    )}`,
  ),
};

export const BUSINESS_INFO_FIELDS = [
  { label: "상호", value: BUSINESS_INFO.companyName },
  { label: "서비스명", value: BUSINESS_INFO.brandName },
  { label: "대표자", value: BUSINESS_INFO.representativeName },
  { label: "사업자등록번호", value: BUSINESS_INFO.businessRegistrationNumber },
  { label: "통신판매업신고번호", value: BUSINESS_INFO.mailOrderSalesNumber },
  { label: "사업장 소재지", value: BUSINESS_INFO.address },
  { label: "전화번호", value: BUSINESS_INFO.phone },
  { label: "이메일", value: BUSINESS_INFO.email },
  ...(BUSINESS_INFO.hostingProvider
    ? [{ label: "호스팅 제공자", value: BUSINESS_INFO.hostingProvider }]
    : []),
  { label: "사업자정보 확인", value: BUSINESS_INFO.businessInfoVerifyUrl },
] as const;

export function hasMissingBusinessInfo() {
  return BUSINESS_INFO_FIELDS.some((field) => field.value === MISSING_VALUE);
}
