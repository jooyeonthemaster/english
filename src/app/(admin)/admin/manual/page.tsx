import { getManualPdf } from "@/lib/platform-settings";
import { ManualUploadCard } from "@/components/admin/help/manual-upload-card";

export const dynamic = "force-dynamic";

export default async function AdminManualPage() {
  const manual = await getManualPdf();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">사용 매뉴얼 관리</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          원장 헬프센터에 노출할 사용 매뉴얼 PDF를 업로드·교체합니다. 업로드 즉시 반영됩니다.
        </p>
      </div>
      <ManualUploadCard
        initialUrl={manual?.url ?? null}
        initialUpdatedAt={manual?.updatedAt.toISOString() ?? null}
      />
    </div>
  );
}
