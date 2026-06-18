"use client";

// ============================================================================
// 회원 목록 → 엑셀(CSV) 내보내기 버튼.
//   · "전체 회원": 허수/내부 계정을 뺀 전체 회원 (SMS발송대상 Y/N + 사유 컬럼 포함)
//   · "SMS 발송대상": 전화번호가 있고 제외되지 않은 회원만 (대량발송 업로드용)
// 서버 액션이 CSV 문자열(BOM 포함)을 돌려주면 브라우저에서 Blob 다운로드한다.
// ============================================================================

import { useState } from "react";
import { Loader2, Users, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportMembers } from "@/actions/admin-members";

function triggerDownload(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function MembersExportButtons() {
  const [pending, setPending] = useState<"all" | "targets" | null>(null);

  async function run(kind: "all" | "targets") {
    if (pending) return;
    setPending(kind);
    try {
      const res = await exportMembers({ onlyTargets: kind === "targets" });
      if (!res.csv || res.totalRows === 0) {
        toast.message("내보낼 회원이 없습니다");
        return;
      }
      triggerDownload(res.filename, res.csv);
      toast.success(
        kind === "targets"
          ? `SMS 발송대상 ${res.smsTargetRows}명 내보내기 완료`
          : `회원 ${res.totalRows}명 내보내기 완료 (발송대상 ${res.smsTargetRows}명)`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "내보내기에 실패했습니다",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-[12px]"
        onClick={() => run("all")}
        disabled={pending !== null}
      >
        {pending === "all" ? (
          <Loader2 className="size-3.5 mr-1.5 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Users className="size-3.5 mr-1.5" strokeWidth={2} aria-hidden />
        )}
        전체 회원 엑셀
      </Button>
      <Button
        size="sm"
        className="h-8 text-[12px] bg-blue-600 hover:bg-blue-700"
        onClick={() => run("targets")}
        disabled={pending !== null}
      >
        {pending === "targets" ? (
          <Loader2 className="size-3.5 mr-1.5 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Send className="size-3.5 mr-1.5" strokeWidth={2} aria-hidden />
        )}
        SMS 발송대상 엑셀
      </Button>
    </div>
  );
}
