import type { Metadata } from "next";
import Link from "next/link";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { BUSINESS_INFO } from "@/lib/legal/business-info";

const SUBSCRIPTION_BILLING_ENABLED = FEATURE_FLAGS.SHOW_SUBSCRIPTION_BILLING;

export const metadata: Metadata = {
  title: "개인정보처리방침 | SMOAT",
  description:
    "SMOAT의 개인정보 수집, 이용, 보관, 위탁, 결제 및 환불 처리 기준을 안내합니다.",
};

const UPDATED_AT = "2026년 5월 27일";

const PRIVACY_SECTIONS = [
  {
    title: "1. 개인정보 처리 목적",
    body: [
      "회사는 회원 가입, 본인 식별, 학원 계정 운영, 서비스 제공, 고객지원, 결제 및 환불 처리, 부정 이용 방지, 법령상 의무 이행을 위해 개인정보를 처리합니다.",
      "AI 문제 생성, 지문 분석, 텍스트 추출 등 서비스 기능 제공을 위해 회원이 입력하거나 업로드한 자료와 사용 로그를 처리할 수 있습니다.",
      SUBSCRIPTION_BILLING_ENABLED
        ? "결제 내역은 구독 갱신, 크레딧 지급, 결제 검증, 환불 처리, 세무·회계 증빙, 분쟁 대응, 부정 결제 탐지를 위해 보관·이용합니다."
        : "결제 내역은 크레딧 지급, 결제 검증, 환불 처리, 세무·회계 증빙, 분쟁 대응, 부정 결제 탐지를 위해 보관·이용합니다.",
    ],
  },
  {
    title: "2. 처리하는 개인정보 항목",
    body: [
      "계정 정보: 이름, 이메일, 전화번호, 소속 학원, 직책 또는 역할, 로그인 식별자",
      "학원 정보: 학원명, 주소, 사업자등록번호, 담당자 연락처, 서비스 이용 계약 및 운영에 필요한 정보",
      "서비스 이용 정보: 접속 로그, 기기 및 브라우저 정보, IP 주소, 쿠키, 이용 기능, 크레딧 사용 내역, 생성·분석 요청 기록",
      SUBSCRIPTION_BILLING_ENABLED
        ? "결제 정보: 결제금액, 결제수단, 결제일시, 주문명, 구독 이용 기간 및 다음 갱신일, 포트원 결제 ID, PG 거래 ID, 빌링키 식별 정보, 결제 상태, 영수증 URL, 취소·환불 내역"
        : "결제 정보: 결제금액, 결제수단, 결제일시, 주문명, 포트원 결제 ID, PG 거래 ID, 결제 상태, 영수증 URL, 취소·환불 내역",
      "환불 처리 정보: 환불 사유, 예금주, 은행명, 계좌번호, 환불 확인을 위한 연락처 등 환불 처리에 필요한 최소 정보",
      "고객지원 정보: 문의 내용, 첨부자료, 처리 결과, 상담 이력",
    ],
  },
  {
    title: "3. 결제 처리 및 수탁 업체",
    body: [
      SUBSCRIPTION_BILLING_ENABLED
        ? "회사는 구독 요금제 및 크레딧 결제와 결제 검증을 위해 포트원(PortOne) 결제 연동 서비스를 이용합니다."
        : "회사는 크레딧 결제와 결제 검증을 위해 포트원(PortOne) 결제 연동 서비스를 이용합니다.",
      "NHN KCP는 카드, 간편결제, 계좌이체, 가상계좌, 휴대폰 결제 등 PG 결제 처리를 수행할 수 있습니다.",
      ...(SUBSCRIPTION_BILLING_ENABLED
        ? [
            "신용카드 정기결제를 등록하는 경우 포트원이 발급한 빌링키와 등록·삭제 상태, 다음 결제 예약 정보를 저장하여 30일 단위 구독 갱신과 해지를 처리합니다.",
          ]
        : []),
      "회사는 원칙적으로 카드번호, 유효기간, CVC 등 민감한 결제수단 원문 정보를 직접 저장하지 않으며, 결제 처리에 필요한 정보는 포트원 및 PG사가 관련 법령과 보안 기준에 따라 처리합니다.",
      SUBSCRIPTION_BILLING_ENABLED
        ? "결제 상태 확인, 영수증 확인, 결제 취소, 환불, 가상계좌 입금 확인, 정기결제 예약·해지를 위해 포트원 결제 ID, PG 거래 ID, 빌링키 식별 정보, 결제 상태, 금액, 결제수단, 영수증 정보 등을 저장합니다."
        : "결제 상태 확인, 영수증 확인, 결제 취소, 환불, 가상계좌 입금 확인을 위해 포트원 결제 ID, PG 거래 ID, 결제 상태, 금액, 결제수단, 영수증 정보 등을 저장합니다.",
    ],
  },
  {
    title: "4. 개인정보 처리 위탁",
    body: [
      SUBSCRIPTION_BILLING_ENABLED
        ? "포트원(PortOne): 결제 연동, 빌링키 발급·삭제, 정기결제 예약, 결제 상태 조회, 웹훅 전송, 결제 취소 및 환불 연동"
        : "포트원(PortOne): 결제 연동, 결제 상태 조회, 웹훅 전송, 결제 취소 및 환불 연동",
      "NHN KCP: PG 결제 승인, 매입, 취소, 환불, 가상계좌 입금 처리, 영수증 및 거래 확인",
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
      "AI 기능 처리 과정에서 생성된 입력·출력 기록은 서비스 제공, 품질 개선, 장애 대응, 고객지원에 필요한 범위에서 보관하며, 회원 요청 또는 계약 종료 시 관계 법령과 내부 정책에 따라 삭제 또는 비식별 처리합니다.",
    ],
  },
  {
    title: "6. 개인정보의 제3자 제공",
    body: [
      "회사는 정보주체의 동의, 법령상 의무, 수사기관의 적법한 요청 등 관계 법령에서 허용하는 경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다.",
      "결제 처리 과정에서 포트원 및 NHN KCP가 처리하는 정보는 결제 대행 및 정산 목적의 위탁 처리이며, 회사는 결제와 환불에 필요한 최소 정보를 연동합니다.",
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
      "관리자 기능은 권한에 따라 접근을 제한하며, 결제 취소, 환불, 가상계좌 말소 등 고위험 작업은 관리자 권한을 확인한 뒤 처리합니다.",
    ],
  },
  {
    title: "10. 개인정보 보호책임자 및 문의",
    body: [
      "개인정보 보호책임자: SMOAT 운영팀",
      `이메일: ${BUSINESS_INFO.email}`,
      "개인정보 처리, 결제 내역, 환불계좌 정보, 권리 행사와 관련한 문의는 위 연락처로 접수할 수 있습니다.",
    ],
  },
  {
    title: "11. 방침 변경",
    body: [
      "회사는 법령, 서비스, 위탁사, 결제수단, 개인정보 처리 방식 변경에 따라 본 개인정보처리방침을 개정할 수 있습니다.",
      "중요한 변경 사항은 시행 전 서비스 화면 또는 공지사항을 통해 안내합니다.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
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
            본 방침은 SMOAT가 서비스 제공, 크레딧 결제, 환불 처리, 고객지원
            과정에서 개인정보를 어떻게 처리하고 보호하는지
            안내합니다.
          </p>
          <p className="mt-5 text-[12px] font-medium text-slate-400">
            최종 업데이트: {UPDATED_AT}
          </p>
        </section>

        <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <SummaryCard title="결제 위탁" body="PortOne, NHN KCP" />
          {SUBSCRIPTION_BILLING_ENABLED ? (
            <SummaryCard title="정기결제" body="포트원 빌링키로 30일 갱신" />
          ) : (
            <SummaryCard title="결제정보" body="카드 원문 정보 미저장" />
          )}
          <SummaryCard title="환불계좌" body="환불 처리 목적에 한해 수집" />
        </section>

        <section className="mt-5 space-y-4">
          {PRIVACY_SECTIONS.map((section) => (
            <article
              key={section.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
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
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-[13px] leading-6 text-blue-900">
          <h2 className="font-bold">결제 및 환불 정보 처리 안내</h2>
          <p className="mt-2">
            SMOAT는 결제수단 원문 정보를 직접 저장하지 않고, 포트원 및 NHN
            KCP를 통해 크레딧 결제 승인·취소·환불 상태를 확인합니다.
            환불계좌 정보는 가상계좌·계좌이체 등 계좌 환불이 필요한 경우에만
            최소 범위로 수집합니다.
          </p>
        </section>

      </div>
    </main>
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
