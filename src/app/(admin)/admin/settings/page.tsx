import Link from "next/link";
import { ArrowRight, BookOpen, Coins, Presentation } from "lucide-react";
import { requireAdminAuth } from "@/lib/auth-admin";
import {
  getSeminarHeroImageUrl,
  getSignupCredits,
} from "@/lib/platform-settings";
import { PageHeader, SectionCard } from "@/components/admin/kit";
import { SignupCreditSetting } from "@/components/admin/signup-credit-setting";
import { SeminarHeroImageCard } from "@/components/admin/help/seminar-hero-image-card";

export const dynamic = "force-dynamic";

/**
 * 플랫폼 설정 — 목록 화면 위에 흩어져 있던 운영 설정을 한곳에 모은다.
 * (기본 가입 크레딧은 회원 관리, 세미나 히어로 이미지는 1:1 세미나 화면에 있었다.)
 */
export default async function AdminSettingsPage() {
  await requireAdminAuth();
  const [signupCredits, heroImageUrl] = await Promise.all([
    getSignupCredits(),
    getSeminarHeroImageUrl(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="플랫폼 설정"
        description="가입 지급 크레딧, 고객 화면에 노출되는 이미지 등 운영 설정을 관리합니다"
      />

      <SectionCard
        title="기본 가입 크레딧"
        description="신규 원장이 자가 가입할 때 자동으로 지급되는 크레딧입니다. 저장 즉시 이후 가입부터 적용됩니다."
        icon={Coins}
      >
        <SignupCreditSetting initialAmount={signupCredits} />
      </SectionCard>

      <SectionCard
        title="1:1 세미나 히어로 이미지"
        description="원장 화면의 1:1 세미나 신청 페이지 오른쪽에 노출됩니다. 미설정 시 기본 이미지가 보입니다."
        icon={Presentation}
      >
        <SeminarHeroImageCard initialUrl={heroImageUrl} />
      </SectionCard>

      <SectionCard
        title="사용 매뉴얼"
        description="원장 헬프센터에 노출할 매뉴얼 목차와 공개 범위는 별도 화면에서 관리합니다."
        icon={BookOpen}
      >
        <Link
          href="/admin/manual"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:underline"
        >
          사용 매뉴얼로 이동 <ArrowRight className="size-3.5" />
        </Link>
      </SectionCard>
    </div>
  );
}
