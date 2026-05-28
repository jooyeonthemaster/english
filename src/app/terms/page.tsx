import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS_INFO } from "@/lib/legal/business-info";

export const metadata: Metadata = {
  title: "이용약관 | SMOAT",
  description:
    "SMOAT 서비스 이용, 구독 요금제, 크레딧 구매와 사용, 계정 해지 및 제한 기준을 안내합니다.",
};

const UPDATED_AT = "2026년 5월 27일";

const TERMS_SECTIONS = [
  {
    title: "제1조 목적",
    body: [
      `본 약관은 ${BUSINESS_INFO.companyName}가 제공하는 SMOAT 서비스의 이용 조건, 절차, 회원과 회사의 권리·의무 및 책임 사항을 정합니다.`,
      "SMOAT는 영어학원 운영, 학습 데이터 관리, AI 기반 문제 생성·지문 분석·텍스트 추출 등 디지털 기능을 제공하는 SaaS 서비스입니다.",
    ],
  },
  {
    title: "제2조 용어의 정의",
    body: [
      "회원은 본 약관에 동의하고 회사가 제공하는 서비스를 이용하는 학원, 원장, 강사, 관리자 및 기타 이용자를 말합니다.",
      "크레딧은 SMOAT 내부 AI 기능을 이용하기 위해 서비스 내에서 차감되는 디지털 서비스 이용권을 말합니다.",
      "유료 크레딧은 회원이 결제수단을 통해 대금을 지급하고 구매한 크레딧을 말합니다.",
      "무료 크레딧은 체험, 이벤트, 보너스, 프로모션, 관리자 보정 등 대가 없이 지급된 크레딧을 말합니다.",
      "AI 기능은 문제 생성, 자동 출제, 지문 분석, 텍스트 추출, 해설 생성, 문제 수정, AI 튜터링 등 크레딧을 차감하여 제공되는 디지털 기능을 말합니다.",
      "신용카드 정기결제는 회원이 등록한 카드에 대해 포트원이 발급한 빌링키를 이용하여 30일마다 구독 요금이 자동 청구되는 결제 방식을 말합니다.",
      "빌링키는 정기결제를 위해 포트원이 발급하는 결제 식별 정보이며, 회사는 카드번호, 유효기간, CVC 등 신용카드 원문 정보를 직접 저장하지 않습니다.",
    ],
  },
  {
    title: "제3조 서비스 이용 및 계정 관리",
    body: [
      "회원은 계정 정보를 정확하게 등록하고 최신 상태로 유지해야 하며, 계정과 비밀번호 관리 책임은 회원에게 있습니다.",
      "회원은 계정을 제3자에게 양도, 대여, 공유하거나 회사의 사전 동의 없이 영리 목적으로 재판매할 수 없습니다.",
      "회사는 서비스 안정성, 보안, 법령 준수, 기능 개선을 위해 필요한 경우 사전 공지 후 서비스 일부를 변경하거나 중단할 수 있습니다.",
    ],
  },
  {
    title: "제4조 크레딧의 성격",
    body: [
      "크레딧은 SMOAT 내부 AI 기능 이용을 위한 디지털 서비스 이용권이며, 현금, 전자화폐, 선불전자지급수단 또는 외부 결제수단이 아닙니다.",
      "크레딧은 현금 환전, 양도, 판매, 담보 제공, 제3자 상품·서비스 결제에 사용할 수 없습니다.",
      "크레딧은 회원의 계정 또는 학원 계정에 귀속되며, 회사가 명시적으로 허용한 경우를 제외하고 다른 계정으로 이전할 수 없습니다.",
      "구매 상품별 1C당 원화 단가는 다를 수 있으나, 동일한 AI 기능 실행 시 차감되는 크레딧 수는 구매 상품 또는 할인 여부와 관계없이 동일하게 적용됩니다.",
    ],
  },
  {
    title: "제5조 유료 크레딧과 무료 크레딧의 구분",
    body: [
      "유료 크레딧은 결제 승인 또는 가상계좌 입금 완료 등 회사가 결제 상태를 확인한 후 지급됩니다.",
      "무료 크레딧은 회사의 정책에 따라 지급·회수·소멸될 수 있으며, 현금 환불 대상에 포함되지 않습니다.",
      "서비스 화면의 총 잔액은 유료 크레딧과 무료 크레딧을 합산하여 표시될 수 있으며, 환불 산정 시에는 결제 내역과 사용 내역을 기준으로 유료 크레딧과 무료 크레딧을 구분합니다.",
    ],
  },
  {
    title: "제6조 크레딧 사용 순서",
    body: [
      "크레딧 사용 및 환불 산정은 무료·보너스 크레딧, 월 배정 크레딧, 유료 크레딧 순서로 차감된 것으로 봅니다.",
      "위 사용 순서는 미사용 유료 크레딧을 명확히 산정하고 회원의 환불 가능 범위를 보호하기 위한 기준입니다.",
      "별도 계약, 프로모션, 이벤트에서 다른 사용 순서를 명시한 경우 해당 조건이 우선 적용될 수 있습니다.",
    ],
  },
  {
    title: "제7조 크레딧 유효기간",
    body: [
      "현재 유료 크레딧은 계정이 정상 유지되는 동안 별도의 사용 유효기간을 두지 않습니다.",
      "무료 크레딧은 지급 시 고지한 조건에 따라 유효기간 또는 사용 제한이 적용될 수 있습니다.",
      "회사가 향후 유료 크레딧 유효기간을 도입하거나 변경하는 경우 적용 대상, 시행일, 잔여 크레딧 처리 기준을 사전에 고지합니다.",
    ],
  },
  {
    title: "제8조 구독 요금제와 30일 갱신",
    body: [
      "구독 요금제는 SMOAT SaaS 기능 이용과 약정된 월 배정 크레딧 제공을 포함하는 디지털 서비스 상품입니다.",
      "구독 기간은 결제 승인일 또는 회사가 별도로 승인한 이용 개시일을 기준으로 시작하며, 기본 갱신 주기는 시작일로부터 30일입니다.",
      "회원이 구독을 유지하는 경우 다음 갱신일은 직전 결제일 또는 이용 개시일로부터 30일마다 도래하며, 서비스 화면 또는 결제 안내에서 현재 이용 기간과 다음 갱신 기준일을 확인할 수 있습니다.",
      "회원이 신용카드 정기결제 조건에 동의하고 카드를 등록하면 포트원 빌링키로 첫 30일 이용 요금이 결제되고, 다음 이용 기간 결제가 예약됩니다.",
      "회원은 서비스 화면에서 다음 자동갱신을 해지할 수 있으며, 해지 시 예약된 다음 결제와 빌링키 사용이 중단됩니다. 이미 결제된 현재 이용 기간은 종료일까지 유지됩니다.",
      "월 배정 크레딧은 각 30일 이용 기간 단위로 제공되며, 이월 정책이 명시된 요금제를 제외하고 갱신 시 미사용 월 배정 크레딧은 초기화될 수 있습니다.",
      "요금제명, 제공 크레딧, 결제금액, 할인 또는 프로모션 기간은 결제 전 화면에 표시된 조건을 기준으로 하며, 회사가 요금제 조건을 변경하는 경우 기존 회원에게 불리한 변경은 사전 안내 또는 동의 절차를 거칩니다.",
    ],
  },
  {
    title: "제9조 결제 및 환불",
    body: [
      "구독 요금제 및 크레딧 결제는 포트원 및 PG사를 통해 처리되며, 결제수단별 승인, 취소, 환불 처리 기간은 카드사·은행·PG사 정책에 따라 달라질 수 있습니다.",
      "신용카드 정기결제는 회원의 사전 동의와 카드 등록 완료 후에만 적용되며, 자동갱신 예정일, 결제금액, 이용 기간은 서비스 화면에서 확인할 수 있습니다.",
      "크레딧 상품은 더 큰 단위로 구매할수록 1C당 구매 단가가 낮아지는 구조로 제공될 수 있으며, 결제 전 상품명, 지급 크레딧 수, 결제금액, 1C당 단가를 확인할 수 있습니다.",
      "유료 크레딧의 청약철회, 부분 환불, 환불 제한, 가상계좌 입금 전 취소 등 세부 기준은 별도 크레딧 환불 정책을 따릅니다.",
      "구독 요금제 환불 또는 해지는 결제일, 이용 기간, 제공된 디지털 서비스 및 배정 크레딧 사용 여부를 확인하여 관계 법령과 환불 정책에 따라 처리합니다.",
      "회원은 구독 또는 크레딧 구매 전 상품명, 가격, 지급 크레딧, 기능별 차감 기준, 갱신 주기, 환불 정책을 확인해야 합니다.",
    ],
    link: { href: "/refund-policy", label: "환불 정책 보기" },
  },
  {
    title: "제10조 계정 해지 시 잔여 크레딧 처리",
    body: [
      "회원은 고객센터 또는 서비스 내 절차를 통해 계정 해지를 요청할 수 있습니다.",
      "계정 해지 시 미사용 무료 크레딧은 소멸하며 환불되지 않습니다.",
      "미사용 유료 크레딧이 남아 있는 경우 회사는 환불 정책 및 관계 법령에 따라 환불 가능 금액을 산정하고, 환불 처리 후 계정을 해지할 수 있습니다.",
      "법령상 보관 의무가 있는 결제·환불·분쟁 처리 기록은 계정 해지 후에도 정해진 기간 동안 보관될 수 있습니다.",
    ],
  },
  {
    title: "제11조 금지행위 및 이용 제한",
    body: [
      "회원은 타인의 결제수단 무단 사용, 비정상적 자동화 요청, 서비스 취약점 악용, 크레딧 부정 취득, AI 결과물의 불법 목적 이용을 해서는 안 됩니다.",
      "회원은 서비스를 역설계하거나 회사의 사전 동의 없이 대량 스크래핑, 모델 학습, 재판매, 경쟁 서비스 구축 목적으로 사용할 수 없습니다.",
      "회사는 부정 사용, 결제 도용, 약관 위반, 법령 위반이 의심되는 경우 사전 통지 없이 결제, 크레딧 사용, 계정 접근, 환불 처리를 일시 제한할 수 있습니다.",
      "부정 사용으로 지급되었거나 보전된 크레딧은 회수될 수 있으며, 회사에 손해가 발생한 경우 회원은 그 손해를 배상해야 합니다.",
    ],
  },
  {
    title: "제12조 AI 결과물 및 데이터",
    body: [
      "AI 기능으로 생성된 문제, 해설, 분석, 추출 결과는 입력 데이터와 모델 특성에 따라 오류가 포함될 수 있으며, 회원은 교육 현장 사용 전 결과를 검토해야 합니다.",
      "회원은 저작권, 개인정보, 초상권, 학습자료 이용 권한 등 제3자의 권리를 침해하는 자료를 업로드하거나 처리해서는 안 됩니다.",
      "회사는 서비스 제공, 장애 대응, 품질 개선, 보안 점검을 위해 필요한 범위에서 입력·출력 데이터 및 사용 로그를 처리할 수 있습니다.",
    ],
  },
  {
    title: "제13조 개인정보 보호",
    body: [
      "회사는 개인정보보호법 등 관계 법령을 준수하며, 개인정보 처리 기준은 별도 개인정보처리방침에 따릅니다.",
      "결제, 환불, 고객지원 과정에서 필요한 개인정보는 목적 달성에 필요한 최소 범위에서 처리합니다.",
    ],
    link: { href: "/privacy", label: "개인정보처리방침 보기" },
  },
  {
    title: "제14조 책임 제한",
    body: [
      "회사는 천재지변, 통신망 장애, 클라우드 장애, PG사 장애, 회원 귀책 사유 등 회사의 합리적 통제 범위를 벗어난 사유로 인한 손해에 대해 책임을 지지 않습니다.",
      "회사는 무료로 제공되는 기능, 무료 크레딧, 베타 기능에 대해 관계 법령이 허용하는 범위 내에서 보증 책임을 제한할 수 있습니다.",
      "회사의 책임이 인정되는 경우에도 회사의 손해배상 책임은 관계 법령상 달리 정함이 없는 한 해당 손해와 직접 관련된 최근 결제금액 범위로 제한됩니다.",
    ],
  },
  {
    title: "제15조 약관 변경",
    body: [
      "회사는 법령 변경, 서비스 변경, 운영 정책 변경이 필요한 경우 본 약관을 개정할 수 있습니다.",
      "중요한 약관 변경은 적용일 전 서비스 화면 또는 공지사항으로 안내합니다.",
      "회원이 변경 약관 적용일 이후 서비스를 계속 이용하는 경우 변경 약관에 동의한 것으로 봅니다. 단, 회원에게 불리하거나 중대한 변경은 관계 법령에 따른 동의 절차를 거칩니다.",
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <nav className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-[14px] font-black tracking-widest">
            SMOAT
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/privacy"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
            >
              개인정보처리방침
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
            Terms of Service
          </p>
          <h1 className="mt-3 text-[30px] font-black tracking-tight text-slate-950 sm:text-[40px]">
            SMOAT 이용약관
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-slate-600">
            본 약관은 SMOAT 서비스 이용과 구독 요금제, 크레딧
            구매·사용·환불·계정 해지 기준을 설명합니다. 결제 전 본 약관과
            환불 정책을 확인해 주세요.
          </p>
          <p className="mt-5 text-[12px] font-medium text-slate-400">
            최종 업데이트: {UPDATED_AT}
          </p>
        </section>

        <section className="mt-5 space-y-4">
          {TERMS_SECTIONS.map((section) => (
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
              {section.link && (
                <Link
                  href={section.link.href}
                  className="mt-4 inline-flex rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  {section.link.label}
                </Link>
              )}
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-[13px] leading-6 text-slate-600 shadow-sm">
          <h2 className="font-bold text-slate-900">문의</h2>
          <p className="mt-2">
            서비스 이용, 결제, 크레딧, 약관 관련 문의는{" "}
            <a
              href={`mailto:${BUSINESS_INFO.email}`}
              className="font-semibold text-blue-700"
            >
              {BUSINESS_INFO.email}
            </a>
            로 접수해 주세요.
          </p>
        </section>

      </div>
    </main>
  );
}
