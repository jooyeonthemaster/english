import Link from "next/link";
import { ManualSectionVisibilityCard } from "@/components/admin/help/manual-section-visibility-card";
import { getStaticManualManifest, STATIC_MANUAL_PUBLIC_BASE } from "@/lib/manual/static-manual";
import { getManualSectionVisibility } from "@/lib/platform-settings";

export const dynamic = "force-dynamic";

export default async function AdminManualPage() {
  const sectionVisibility = await getManualSectionVisibility();
  const staticManual = getStaticManualManifest();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">사용 매뉴얼 관리</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          원장 헬프센터에 노출할 사용 매뉴얼을 관리합니다.
        </p>
      </div>

      {staticManual ? (
        <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13px] font-bold text-blue-700">정적 목차형 매뉴얼 게시 중</p>
              <h2 className="mt-1 text-[18px] font-bold text-gray-950">
                {staticManual.groups.length}개 목차 · {staticManual.entries.length}장 슬라이드
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-blue-700/75">
                현재 원장 사용 매뉴얼 페이지는 이 정적 매뉴얼을 노출합니다.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href="/director/help/manual"
                className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-[12px] font-bold text-white hover:bg-blue-700"
              >
                사용자 페이지 보기
              </Link>
              <a
                href={`${STATIC_MANUAL_PUBLIC_BASE}/review.html`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center rounded-lg border border-blue-200 bg-white px-3 text-[12px] font-bold text-blue-700 hover:border-blue-300"
              >
                전체 보기
              </a>
            </div>
          </div>
        </section>
      ) : null}

      {staticManual ? (
        <ManualSectionVisibilityCard
          groups={staticManual.groups}
          initialVisibility={sectionVisibility}
        />
      ) : null}
    </div>
  );
}
