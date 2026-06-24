"use client";

// ============================================================================
// 회원 목록 → 엑셀(CSV) 내보내기 버튼.
//   · "전체 회원 엑셀" : 허수/내부 계정 뺀 전체 회원 (상세 15컬럼, Y/N + 사유 포함)
//   · "정보성 발송 CSV": 전화번호 있는 활성 회원 전체(동의 무관). 크레딧 소멸 등 안내용
//   · "광고성 발송 CSV": 마케팅 동의자만. 추가증정·이벤트 등 홍보용(법적 사전동의 필수)
//   정보성/광고성 모두 뿌리오 업로드 양식(이름,휴대폰,[*1*]~[*4*])으로 바로 다운된다.
// 서버 액션이 CSV 문자열(BOM 포함)을 돌려주면 브라우저에서 Blob 다운로드한다.
// ============================================================================

import { useState } from "react";
import { Loader2, Users, Send, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportMembers } from "@/actions/admin-members";
import type { ExportMode } from "@/actions/admin-members/export-members";

function triggerDownload(filename: string, contentBase64: string, mimeType: string) {
  // 서버가 base64로 인코딩한 파일 바이트(발송용=CP949, 전체=UTF-8)를 그대로 복원.
  const bin = atob(contentBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
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
  const [pending, setPending] = useState<ExportMode | null>(null);

  async function run(mode: ExportMode) {
    if (pending) return;
    setPending(mode);
    try {
      const res = await exportMembers({ mode });
      if (!res.contentBase64 || res.totalRows === 0) {
        toast.message(
          mode === "ad"
            ? "마케팅 동의한 광고 발송대상이 없습니다"
            : "내보낼 회원이 없습니다",
        );
        return;
      }
      triggerDownload(res.filename, res.contentBase64, res.mimeType);
      toast.success(
        mode === "info"
          ? `정보성 발송대상 ${res.totalRows}명 내보내기 완료`
          : mode === "ad"
            ? `광고성 발송대상 ${res.totalRows}명 내보내기 완료`
            : `회원 ${res.totalRows}명 내보내기 완료 (광고발송 가능 ${res.smsTargetRows}명)`,
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
        onClick={() => run("info")}
        disabled={pending !== null}
        title="크레딧 소멸 안내 등 정보성 — 마케팅 동의 없이도 발송 가능"
      >
        {pending === "info" ? (
          <Loader2 className="size-3.5 mr-1.5 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Send className="size-3.5 mr-1.5" strokeWidth={2} aria-hidden />
        )}
        정보성 발송 CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-[12px] border-amber-300 text-amber-700 hover:bg-amber-50"
        onClick={() => run("ad")}
        disabled={pending !== null}
        title="추가증정·이벤트 등 광고성 — 마케팅 수신동의자에게만 발송"
      >
        {pending === "ad" ? (
          <Loader2 className="size-3.5 mr-1.5 animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Megaphone className="size-3.5 mr-1.5" strokeWidth={2} aria-hidden />
        )}
        광고성 발송 CSV
      </Button>
    </div>
  );
}
