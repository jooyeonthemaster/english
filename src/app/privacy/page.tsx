import { LandingHeader } from "@/components/landing/landing-header";
import {
  BrowserCookieGuide,
  ThirdPartyAnalyticsTools,
} from "@/components/legal/privacy-analytics-notice";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { BUSINESS_INFO } from "@/lib/legal/business-info";
import {
  CREDIT_TOP_UP_CARD_ONLY,
  CREDIT_TOP_UP_PAY_METHODS_TEXT,
  CREDIT_TOP_UP_REFUND_ACCOUNT_TEXT,
  PAYMENT_PG_NAME,
} from "@/lib/legal/payment-processor";

const SUBSCRIPTION_BILLING_ENABLED = FEATURE_FLAGS.SHOW_SUBSCRIPTION_BILLING;
const BANK_DEPOSIT_ENABLED =
  process.env.NEXT_PUBLIC_BANK_DEPOSIT_ENABLED === "true";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  alternates: { canonical: "/privacy" },
  description:
    "SMOAT의 개인정보 수집, 이용, 보관, 위탁, 결제 및 환불 처리, 쿠키·행태정보 처리 기준을 안내합니다.",
};

/** 공고일 = 방침 개정을 안내한 날, 시행일 = 개정 내용이 적용되는 날(13항). */
const ANNOUNCED_AT = "2026년 9월 18일";
const EFFECTIVE_AT = "2026년 10월 2일";

type PolicyRevision = { effectiveAt: string; announcedAt?: string; summary: string };

/** 개정 이력 — 최신 순. */
const REVISION_HISTORY: PolicyRevision[] = [
  {
    effectiveAt: EFFECTIVE_AT,
    announcedAt: ANNOUNCED_AT,
    summary:
      "쿠키 등 자동 수집 장치와 행태정보의 수집·이용 및 거부(10항), 외부 분석·광고 도구 및 국외 이전(11항)을 신설했습니다. 이에 맞추어 1·2·5·6항에 방문 분석 관련 내용을 보탰고, 기존 10항(개인정보 보호책임자)과 11항(방침 변경)은 12항·13항으로 번호가 바뀌었습니다.",
  },
  {
    effectiveAt: "2026년 6월 9일",
    summary: "직전 개인정보처리방침(방문 분석·외부 분석 도구 관련 조항 없음).",
  },
];

type PrivacySection = {
  /** 다른 화면에서 링크할 수 있는 앵커(/privacy#id) */
  id?: string;
  title: string;
  body: string[];
  /** 본문 목록 아래에 붙는 보조 블록(표·안내) */
  extra?: ReactNode;
};

const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: "1. 개인정보 처리 목적",
    body: [
      "회사는 회원 가입, 본인 식별, 학원 계정 운영, 서비스 제공, 고객지원, 결제 및 환불 처리, 부정 이용 방지, 법령상 의무 이행을 위해 개인정보를 처리합니다.",
      "AI 문제 생성, 학습지 생성, 텍스트 추출 등 서비스 기능 제공을 위해 회원이 입력하거나 업로드한 자료와 사용 로그를 처리할 수 있습니다.",
      "서비스 개선, 방문·가입 유입 경로 분석, 광고 성과 측정을 위해 웹사이트 방문·이용 기록(행태정보)을 처리할 수 있습니다(10항·11항 참고).",
      SUBSCRIPTION_BILLING_ENABLED
        ? "결제 내역은 구독 갱신, 크레딧 지급, 결제 검증, 환불 처리, 세무·회계 증빙, 분쟁 대응, 부정 결제 탐지를 위해 보관·이용합니다."
        : "결제 내역은 크레딧 지급, 결제 검증, 환불 처리, 세무·회계 증빙, 분쟁 대응, 부정 결제 탐지를 위해 보관·이용합니다.",
      ...(BANK_DEPOSIT_ENABLED
        ? [
            "무통장입금(계좌이체) 결제 시 입금 사실 확인과 크레딧 자동 지급을 위해 회원이 입력한 입금자명과 입금 내역(입금금액, 입금시각, 입금은행)을 처리합니다.",
          ]
        : []),
    ],
  },
  {
    title: "2. 처리하는 개인정보 항목",
    body: [
      "계정 정보: 이름, 이메일, 전화번호, 소속 학원, 직책 또는 역할, 로그인 식별자",
      "학원 정보: 학원명, 주소, 사업자등록번호, 담당자 연락처, 서비스 이용 계약 및 운영에 필요한 정보",
      "서비스 이용 정보: 접속 로그, 기기 및 브라우저 정보, IP 주소, 쿠키, 이용 기능, 크레딧 사용 내역, 생성·분석 요청 기록",
      "방문 분석 정보: 방문자 식별자(무작위 값), 방문 페이지와 유입 경로, 기기·브라우저 정보, 접속 지역 추정값(국가·시도·도시), 체류 시간·스크롤·클릭 이벤트 등(10항 참고)",
      SUBSCRIPTION_BILLING_ENABLED
        ? "결제 정보: 결제금액, 결제수단, 결제일시, 주문명, 구독 이용 기간 및 다음 갱신일, 포트원 결제 ID, PG 거래 ID, 빌링키 식별 정보, 결제 상태, 영수증 URL, 취소·환불 내역"
        : "결제 정보: 결제금액, 결제수단, 결제일시, 주문명, 포트원 결제 ID, PG 거래 ID, 결제 상태, 영수증 URL, 취소·환불 내역",
      "환불 처리 정보: 환불 사유, 예금주, 은행명, 계좌번호, 환불 확인을 위한 연락처 등 환불 처리에 필요한 최소 정보",
      ...(BANK_DEPOSIT_ENABLED
        ? [
            "무통장입금 정보: 입금자명, 입금금액, 입금시각, 입금은행 등 무통장입금(계좌이체) 입금 사실 확인 및 주문 대조에 필요한 정보",
          ]
        : []),
      "고객지원 정보: 문의 내용, 첨부자료, 처리 결과, 상담 이력",
    ],
  },
  {
    title: "3. 결제 처리 및 수탁 업체",
    body: [
      SUBSCRIPTION_BILLING_ENABLED
        ? "회사는 구독 요금제 및 크레딧 결제와 결제 검증을 위해 포트원(PortOne) 결제 연동 서비스를 이용합니다."
        : "회사는 크레딧 결제와 결제 검증을 위해 포트원(PortOne) 결제 연동 서비스를 이용합니다.",
      CREDIT_TOP_UP_CARD_ONLY
        ? `${PAYMENT_PG_NAME}는 신용카드 PG 결제 승인, 매입, 취소, 환불 처리를 수행합니다.`
        : `${PAYMENT_PG_NAME}는 ${CREDIT_TOP_UP_PAY_METHODS_TEXT} 결제 등 PG 결제 처리를 수행할 수 있습니다.`,
      ...(SUBSCRIPTION_BILLING_ENABLED
        ? [
            "신용카드 정기결제를 등록하는 경우 포트원이 발급한 빌링키와 등록·삭제 상태, 다음 결제 예약 정보를 저장하여 30일 단위 구독 갱신과 해지를 처리합니다.",
          ]
        : []),
      "회사는 원칙적으로 카드번호, 유효기간, CVC 등 민감한 결제수단 원문 정보를 직접 저장하지 않으며, 결제 처리에 필요한 정보는 포트원 및 PG사가 관련 법령과 보안 기준에 따라 처리합니다.",
      ...(BANK_DEPOSIT_ENABLED
        ? [
            "무통장입금(계좌이체)은 포트원 및 PG사를 거치지 않고, 회사가 지정한 입금 계좌로의 입금 사실을 회사가 직접 확인하여 크레딧을 지급합니다. 이 과정에서 입금 알림 정보(입금자명, 입금금액, 입금시각, 입금은행)와 회원이 입력한 입금자명을 대조하며, 해당 정보는 입금 확인과 회계 증빙 목적으로 회사가 보관합니다.",
          ]
        : []),
      SUBSCRIPTION_BILLING_ENABLED
        ? CREDIT_TOP_UP_CARD_ONLY
          ? "신용카드 결제 상태 확인, 영수증 확인, 결제 취소, 환불, 정기결제 예약·해지를 위해 포트원 결제 ID, PG 거래 ID, 빌링키 식별 정보, 결제 상태, 금액, 결제수단, 영수증 정보 등을 저장합니다."
          : "결제 상태 확인, 영수증 확인, 결제 취소, 환불, 가상계좌 입금 확인, 정기결제 예약·해지를 위해 포트원 결제 ID, PG 거래 ID, 빌링키 식별 정보, 결제 상태, 금액, 결제수단, 영수증 정보 등을 저장합니다."
        : CREDIT_TOP_UP_CARD_ONLY
          ? "신용카드 결제 상태 확인, 영수증 확인, 결제 취소, 환불을 위해 포트원 결제 ID, PG 거래 ID, 결제 상태, 금액, 결제수단, 영수증 정보 등을 저장합니다."
          : "결제 상태 확인, 영수증 확인, 결제 취소, 환불, 가상계좌 입금 확인을 위해 포트원 결제 ID, PG 거래 ID, 결제 상태, 금액, 결제수단, 영수증 정보 등을 저장합니다.",
    ],
  },
  {
    title: "4. 개인정보 처리 위탁",
    body: [
      SUBSCRIPTION_BILLING_ENABLED
        ? "포트원(PortOne): 결제 연동, 빌링키 발급·삭제, 정기결제 예약, 결제 상태 조회, 웹훅 전송, 결제 취소 및 환불 연동"
        : "포트원(PortOne): 결제 연동, 결제 상태 조회, 웹훅 전송, 결제 취소 및 환불 연동",
      CREDIT_TOP_UP_CARD_ONLY
        ? `${PAYMENT_PG_NAME}: 신용카드 PG 결제 승인, 매입, 취소, 환불, 영수증 및 거래 확인`
        : `${PAYMENT_PG_NAME}: PG 결제 승인, 매입, 취소, 환불, 가상계좌 입금 처리, 영수증 및 거래 확인`,
      "클라우드 및 데이터베이스 제공업체: 서비스 인프라 운영, 데이터 저장, 백업, 보안 관리",
      "이메일·알림 발송 서비스 제공업체: 서비스 안내, 고객지원, 가입 및 운영 관련 알림 발송",
      "회사는 위탁 계약 또는 서비스 이용 조건을 통해 수탁자가 개인정보를 안전하게 처리하도록 관리·감독합니다.",
    ],
  },
  {
    title: "5. 보유 및 이용 기간",
    body: [
      "계정 정보는 회원 탈퇴 또는 계약 종료 시까지 보관합니다. 단, 관계 법령상 보관 의무가 있거나 분쟁 대응에 필요한 경우 해당 기간 동안 보관할 수 있습니다.",
      "계약 또는 청약철회 등에 관한 기록은 5년, 대금 결제 및 크레딧 지급에 관한 기록은 5년, 소비자 불만 또는 분쟁 처리에 관한 기록은 3년 동안 보관합니다.",
      "환불계좌 정보는 환불 처리 완료 후 원칙적으로 지체 없이 파기합니다. 다만 환불 분쟁, 회계 증빙, 법령상 보관 의무가 있는 경우 해당 목적에 필요한 기간 동안 분리 보관합니다.",
      "서비스 이용 로그와 보안 로그는 부정 이용 방지, 장애 대응, 보안 점검을 위해 최대 1년 동안 보관 후 파기 또는 익명화합니다. 법령상 별도 보관 의무가 있는 접속 기록은 해당 법정 기간을 따릅니다.",
      "방문 분석 기록(행태정보)은 수집일로부터 최대 1년 동안 보관 후 파기 또는 익명화하며, 방문자 식별 쿠키(smoat_vid)는 마지막 방문일로부터 2년이 지나면 만료됩니다.",
      "AI 기능 처리 과정에서 생성된 입력·출력 기록은 서비스 제공, 품질 개선, 장애 대응, 고객지원에 필요한 범위에서 보관하며, 회원 요청 또는 계약 종료 시 관계 법령과 내부 정책에 따라 삭제 또는 비식별 처리합니다.",
    ],
  },
  {
    title: "6. 개인정보의 제3자 제공",
    body: [
      "회사는 정보주체의 동의, 법령상 의무, 수사기관의 적법한 요청 등 관계 법령에서 허용하는 경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다.",
      `결제 처리 과정에서 포트원 및 ${PAYMENT_PG_NAME}가 처리하는 정보는 결제 대행 및 정산 목적의 위탁 처리이며, 회사는 결제와 환불에 필요한 최소 정보를 연동합니다.`,
      "외부 분석·광고 도구 사업자가 이용자의 브라우저에서 행태정보를 직접 수집하는 사항과 그에 따른 국외 이전은 11항에서 안내합니다.",
    ],
  },
  {
    title: "7. 개인정보 파기",
    body: [
      "회사는 개인정보 보유기간의 경과, 처리 목적 달성, 회원 탈퇴 등 개인정보가 불필요하게 되었을 때 지체 없이 해당 개인정보를 파기합니다.",
      "전자적 파일은 복구 또는 재생되지 않도록 안전한 방법으로 삭제하며, 종이 문서는 분쇄 또는 소각합니다.",
      "법령상 보관이 필요한 정보는 별도 저장 공간에 분리하여 보관하고, 보관 목적 외로 이용하지 않습니다.",
    ],
  },
  {
    title: "8. 정보주체의 권리",
    body: [
      "회원은 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지, 동의 철회를 요청할 수 있습니다.",
      "권리 행사는 고객센터 이메일 또는 서비스 내 문의 채널을 통해 접수할 수 있으며, 회사는 관계 법령에 따라 지체 없이 조치합니다.",
      "다만 법령상 보관 의무가 있거나 계약 이행, 결제·환불·분쟁 처리에 필요한 정보는 요청이 제한될 수 있습니다.",
    ],
  },
  {
    title: "9. 안전성 확보 조치",
    body: [
      "회사는 개인정보 접근 권한 관리, 암호화, 접속 기록 보관, 보안 업데이트, 내부 접근 통제 등 개인정보 보호를 위한 기술적·관리적 조치를 시행합니다.",
      "결제 정보는 포트원 및 PG사의 결제 보안 체계를 통해 처리되며, 회사는 결제수단 원문 정보를 직접 저장하지 않도록 설계합니다.",
      CREDIT_TOP_UP_CARD_ONLY
        ? "관리자 기능은 권한에 따라 접근을 제한하며, 결제 취소, 환불 등 고위험 작업은 관리자 권한을 확인한 뒤 처리합니다."
        : "관리자 기능은 권한에 따라 접근을 제한하며, 결제 취소, 환불, 가상계좌 말소 등 고위험 작업은 관리자 권한을 확인한 뒤 처리합니다.",
    ],
  },
  {
    id: "behavioral-data",
    title: "10. 쿠키 등 자동 수집 장치와 행태정보의 수집·이용 및 거부",
    body: [
      "회사는 서비스 개선과 유입 경로 분석을 위해 이용자가 SMOAT 웹사이트를 방문·이용한 기록(행태정보)을 자동으로 수집합니다. 로그인하지 않은 방문은 이름·이메일·연락처 없이 브라우저에 부여한 무작위 식별자로만 구분합니다.",
      "수집 대상 화면: 서비스 소개·요금 안내 등 공개 화면뿐 아니라 학생·학부모용 화면(단어 훈련 포함), 시험 응시·리포트 공유 링크 화면을 포함한 모든 서비스 화면에서 수집합니다(회사 관리자 화면은 수집하지 않습니다). 다만 학생·학부모용 화면의 방문 기록은 학생의 이름·연락처 등 개인정보와 연결하지 않으며, 그 화면에서는 11항의 외부 분석·광고 도구를 사용하지 않습니다.",
      "수집 항목: 방문 페이지 경로(주소에 포함된 접근 토큰은 가림 처리)·페이지 제목·직전 페이지, 유입 경로(이전 사이트의 도메인·경로, UTM 등 캠페인·광고 클릭 식별 파라미터), 기기 종류·운영체제·브라우저와 버전·인앱 브라우저 여부, 화면 크기·언어·시간대, 접속 IP 주소로 추정한 국가·시도·도시, 방문 시각·체류 시간·스크롤 비율, 버튼·외부 링크·파일 다운로드 클릭 이벤트, 가입·결제 완료 여부",
      "IP 주소 원문, 유입 사이트 주소에 포함된 검색어 등 쿼리 문자열, 허용된 캠페인 파라미터 외의 주소 파라미터(이메일·토큰 등)는 방문 분석 기록에 저장하지 않으며, 민감정보는 수집하지 않습니다.",
      "수집 방법: 웹사이트 화면에 포함된 스크립트가 방문·이용 시 기록을 자동으로 전송합니다. 방문자 식별자는 쿠키(smoat_vid, 마지막 방문일로부터 2년간 유지)와 브라우저 저장소(localStorage의 smoat_vid)에, 방문(세션) 정보는 브라우저 저장소(localStorage의 smoat_ses)에 저장합니다. 수집을 거부하면 거부 상태를 쿠키(smoat_analytics_optout, 2년간 유지)에 기억하고, 외부 도구를 사용하는 경우 같은 전환이 중복 전송되지 않도록 탭 저장소(sessionStorage의 smoat_px_conv)에 전송 여부를 기록합니다. 캠페인용 링크(/go/…)를 클릭하면 서버가 유입 도메인·기기 종류·운영체제·인앱 브라우저 여부·국가 및 시도를 기록합니다.",
      "원장·강사 등 학원 계정으로 로그인하면 해당 브라우저의 방문 기록(로그인 이전 방문 포함)이 학원 및 계정 식별자와 연결되며, 이 경우 해당 기록은 서비스 이용 정보로서 개인정보로 처리합니다. 법적 근거는 개인정보 보호법 제15조 제1항 제6호(개인정보처리자의 정당한 이익)이며, 이용 목적은 계약한 서비스의 제공과 이용 현황 확인, 고객지원, 부정 이용 방지입니다. 연결을 원하지 않으면 아래 거부 방법으로 수집을 거부할 수 있고, 거부하면 로그인한 뒤에도 방문 기록이 수집되거나 계정과 연결되지 않습니다.",
      "이용 목적: 서비스 화면 개선과 이용 통계, 방문·가입 유입 경로(검색·SNS·광고·공유 링크 등) 분석, 광고·마케팅 성과 측정",
      "보유 기간: 방문 분석 기록은 수집일로부터 최대 1년 동안 보관한 뒤 파기 또는 익명화합니다(5항).",
      "거부 방법 ① 아래 「방문 분석 거부」 버튼을 누르면 이 브라우저에서 방문 분석과 11항의 외부 분석·광고 도구가 실행되지 않습니다(거부 상태는 쿠키 smoat_analytics_optout에 2년간 기억되며, 쿠키를 삭제하면 초기화됩니다). ② 브라우저의 Global Privacy Control(GPC) 신호를 켜도 같은 효과가 적용됩니다. ③ 브라우저 설정에서 SMOAT 사이트의 쿠키와 사이트 데이터 저장을 모두 차단해도 수집이 실행되지 않습니다.",
      "저장된 쿠키·사이트 데이터를 삭제하기만 하면 수집은 계속되고 이전 방문 기록과의 연결만 끊어집니다(다음 방문에 새 식별자가 만들어집니다). 거부하더라도 SMOAT 서비스 이용에는 제한이 없으나, 모든 쿠키를 차단하면 로그인 등 일부 서비스 이용이 어려울 수 있습니다.",
    ],
    extra: <BrowserCookieGuide />,
  },
  {
    id: "third-party-analytics",
    title: "11. 외부 분석·광고 도구 및 국외 이전",
    body: [
      "회사는 이용 통계 분석, 광고 성과 측정 및 맞춤형 광고를 위해 아래 외부 분석·광고 도구 중 운영에 필요한 도구를 선택하여 사용할 수 있습니다. 도구를 사용하는 동안 각 사업자는 이용자의 브라우저에서 자체 쿠키·스크립트로 행태정보를 직접 수집합니다.",
      "외부 도구는 서비스 소개·요금 안내 등 공개 화면, 회원가입·로그인 화면, 원장·강사용 화면에서만 사용합니다. 학생·학부모용 화면(단어 훈련 포함), 시험 응시·리포트 공유 링크 화면, 인증 처리 화면, 쿠폰·프로모션 화면에서는 외부 도구로 페이지 방문 정보를 전송하지 않으며, 만 14세 미만 아동의 행태정보를 맞춤형 광고 목적으로 이용하지 않습니다.",
      "화면 재생·히트맵 도구(Microsoft Clarity)는 화면에 표시된 내용이 그대로 기록되므로, 학생의 이름·성적이 표시될 수 있는 원장·강사용 화면에서는 사용하지 않고 공개 화면과 회원가입·로그인 화면에서만 사용합니다.",
      "회사가 외부 도구로 전송하는 전환 정보는 가입 완료 여부와 결제 완료 여부·결제 금액이며, 도구에 따라 결제 건 번호가 함께 전송됩니다.",
      "국외 이전: Google LLC(미국), Meta Platforms, Inc.(미국), Microsoft Corporation(미국), TikTok Pte. Ltd.(싱가포르)의 도구를 사용하는 경우, 아래 표의 수집·전송 정보는 이용자가 해당 화면을 이용하는 시점에 정보통신망을 통해 각 사업자가 운영하는 국외 서버로 전송되어 저장·처리될 수 있습니다. 이전받는 자의 명칭과 연락처, 이전하는 항목, 이전 목적, 보유·이용 기간, 거부 방법은 아래 표에 도구별로 적었습니다.",
      "거부 방법: 10항의 「방문 분석 거부」 버튼을 누르거나 브라우저의 Global Privacy Control(GPC)을 켜면 아래 외부 도구도 실행되지 않습니다. 맞춤형 광고만 따로 거부하려면 아래 각 사업자의 광고 설정 페이지를 이용하고, 웹브라우저 또는 모바일 기기에서 차단하려면 아래 표와 10항의 안내를 따르십시오. 거부하더라도 SMOAT 서비스 이용에는 제한이 없으나, 모든 쿠키를 차단하면 로그인 등 일부 기능 이용이 어려울 수 있습니다.",
    ],
    extra: <ThirdPartyAnalyticsTools />,
  },
  {
    title: "12. 개인정보 보호책임자 및 문의",
    body: [
      "개인정보 보호책임자: SMOAT 운영팀",
      `이메일: ${BUSINESS_INFO.email}`,
      "개인정보 처리, 결제 내역, 환불계좌 정보, 권리 행사와 관련한 문의는 위 연락처로 접수할 수 있습니다.",
    ],
  },
  {
    id: "revision-history",
    title: "13. 방침 변경",
    body: [
      "회사는 법령, 서비스, 위탁사, 결제수단, 개인정보 처리 방식 변경에 따라 본 개인정보처리방침을 개정할 수 있습니다.",
      "중요한 변경 사항은 시행 전 서비스 화면 또는 공지사항을 통해 안내하며, 공고일과 시행일을 함께 표시합니다.",
      `이번 개정은 ${ANNOUNCED_AT}에 공고하여 ${EFFECTIVE_AT}부터 시행하며, 10항의 방문 분석과 11항의 외부 분석·광고 도구는 시행일부터 사용합니다.`,
    ],
    extra: <RevisionHistory />,
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 pt-20 text-slate-950">
      <LandingHeader showNav={false} />
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <nav className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-[14px] font-black tracking-widest">
            SMOAT
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/terms"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
            >
              이용약관
            </Link>
            <Link
              href="/refund-policy"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
            >
              환불 정책
            </Link>
          </div>
        </nav>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-blue-600">
            Privacy Policy
          </p>
          <h1 className="mt-3 text-[30px] font-black tracking-tight text-slate-950 sm:text-[40px]">
            SMOAT 개인정보처리방침
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-slate-600">
            본 방침은 SMOAT가 서비스 제공, 크레딧 결제, 환불 처리, 고객지원,
            방문 분석 과정에서 개인정보와 행태정보를 어떻게 처리하고 보호하는지
            안내합니다.
          </p>
          <div className="mt-5 space-y-1 text-[12px] font-medium text-slate-500">
            <p>공고일: {ANNOUNCED_AT}</p>
            <p>
              시행일: {EFFECTIVE_AT}
              <span className="ml-1 text-slate-400">
                (시행일 전까지는 {REVISION_HISTORY[1].effectiveAt} 시행 방침이 적용됩니다)
              </span>
            </p>
            <p className="pt-1 text-slate-400">
              이번 개정 요약: 쿠키·행태정보의 수집과 거부 방법(10항), 외부 분석·광고 도구와 국외 이전(11항)을
              신설했습니다. 전체 이력은{" "}
              <Link href="#revision-history" className="underline underline-offset-2">
                13항 개정 이력
              </Link>
              에서 확인할 수 있습니다.
            </p>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <SummaryCard title="결제 위탁" body={`PortOne, ${PAYMENT_PG_NAME}`} />
          {SUBSCRIPTION_BILLING_ENABLED ? (
            <SummaryCard title="정기결제" body="포트원 빌링키로 30일 갱신" />
          ) : (
            <SummaryCard title="결제정보" body="카드 원문 정보 미저장" />
          )}
          <SummaryCard
            title="환불계좌"
            body={
              CREDIT_TOP_UP_CARD_ONLY
                ? "예외적 계좌 환불 시만 수집"
                : "환불 처리 목적에 한해 수집"
            }
          />
        </section>

        <section className="mt-5 space-y-4">
          {PRIVACY_SECTIONS.map((section) => (
            <article
              key={section.title}
              id={section.id}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <h2 className="text-[17px] font-bold text-slate-950">
                {section.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {section.body.map((line) => (
                  <li
                    key={line}
                    className="flex gap-2 text-[14px] leading-7 text-slate-600"
                  >
                    <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              {section.extra}
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-[13px] leading-6 text-blue-900">
          <h2 className="font-bold">결제 및 환불 정보 처리 안내</h2>
          <p className="mt-2">
            SMOAT는 결제수단 원문 정보를 직접 저장하지 않고, 포트원 및{" "}
            {PAYMENT_PG_NAME}를 통해 크레딧 결제 승인·취소·환불 상태를 확인합니다.
            환불계좌 정보는 {CREDIT_TOP_UP_REFUND_ACCOUNT_TEXT}
            필요한 최소 범위로 수집합니다.
            {BANK_DEPOSIT_ENABLED
              ? " 무통장입금(계좌이체)은 PG사를 거치지 않고 회사가 지정 계좌의 입금 사실을 직접 확인하며, 입금자명과 입금 내역은 입금 확인·회계 증빙 목적으로만 처리합니다."
              : ""}
          </p>
        </section>

      </div>
    </main>
  );
}

function RevisionHistory() {
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-[13px] font-bold text-slate-800">개정 이력</h3>
      <ul className="mt-2 space-y-2">
        {REVISION_HISTORY.map((rev) => (
          <li key={rev.effectiveAt} className="text-[13px] leading-6 text-slate-600">
            <span className="font-semibold text-slate-800">{rev.effectiveAt} 시행</span>
            {rev.announcedAt ? <span className="ml-1 text-slate-400">({rev.announcedAt} 공고)</span> : null}
            <span className="mx-1 text-slate-300">·</span>
            <span className="break-keep">{rev.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SummaryCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-[12px] font-bold text-blue-600">{title}</div>
      <div className="mt-2 text-[14px] font-semibold leading-6 text-slate-800">
        {body}
      </div>
    </div>
  );
}
