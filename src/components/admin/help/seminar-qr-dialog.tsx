"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AdminDialog } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { groupSeminarBrowseLink } from "@/lib/help-center";

/** 세미나 모집 글로 바로 진입하는 QR + 딥링크 팝업. QR은 클라이언트에서 렌더. */
export function SeminarQrDialog({
  seminar,
  onClose,
}: {
  seminar: { id: string; title: string; status: string };
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState("");

  // NEXT_PUBLIC_APP_URL(프로덕션 도메인) 우선 — 인쇄된 QR은 외부에서 스캔되므로.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const url = `${origin}${groupSeminarBrowseLink(seminar.id)}`;

  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [url]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("링크를 복사했습니다.");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  }

  function downloadQr() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `seminar-qr-${seminar.id}.png`;
    a.click();
  }

  const isOpen = seminar.status === "OPEN";

  return (
    <AdminDialog
      open
      onOpenChange={(next) => !next && onClose()}
      size="sm"
      title="모집 QR 코드"
      description={seminar.title}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={copyLink}>
            <Copy className="size-3.5" strokeWidth={2} />
            링크 복사
          </Button>
          <Button type="button" size="sm" onClick={downloadQr} disabled={!dataUrl}>
            <Download className="size-3.5" strokeWidth={2} />
            QR 저장
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col items-center">
          <div className="rounded-xl border border-gray-100 bg-white p-3">
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dataUrl} alt="세미나 모집 QR 코드" width={200} height={200} />
            ) : (
              <div className="flex size-[200px] items-center justify-center text-[12px] text-gray-300">
                QR 생성 중...
              </div>
            )}
          </div>
          <p className="mt-2 text-center text-[12px] text-gray-400">
            스캔하면 원장이 이 세미나 모집 글로 바로 들어옵니다.
          </p>
        </div>

        {!isOpen && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
            현재 상태가 &quot;모집중(OPEN)&quot;이 아니라 원장 화면에 노출되지 않습니다. QR을 배포하려면
            먼저 상태를 모집중으로 바꿔 주세요.
          </p>
        )}

        <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <span className="flex-1 truncate text-[12px] text-gray-500">{url}</span>
          <ExternalLink className="size-3.5 shrink-0 text-gray-300" strokeWidth={2} aria-hidden />
        </div>
      </div>
    </AdminDialog>
  );
}
