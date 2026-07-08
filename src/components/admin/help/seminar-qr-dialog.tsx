"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { groupSeminarBrowseLink } from "@/lib/help-center";
import { toast } from "sonner";
import { X, Copy, Download, ExternalLink, QrCode } from "lucide-react";

/** 세미나 모집 글로 바로 진입하는 QR + 딥링크를 보여주는 모달. QR은 클라이언트에서 렌더. */
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

  // ESC로 닫기.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Head */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <QrCode className="size-4" />
            </span>
            <div>
              <div className="text-[14px] font-bold text-gray-900">모집 QR 코드</div>
              <div className="text-[12px] text-gray-400 line-clamp-1">{seminar.title}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 inline-flex items-center justify-center"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* QR */}
        <div className="mt-4 flex flex-col items-center">
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
          <p className="mt-2 text-[12px] text-gray-400 text-center">
            스캔하면 원장이 이 세미나 모집 글로 바로 들어옵니다.
          </p>
        </div>

        {!isOpen && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
            현재 상태가 &quot;모집중(OPEN)&quot;이 아니라 원장 화면에 노출되지 않습니다. QR을 배포하려면
            먼저 상태를 모집중으로 바꿔 주세요.
          </p>
        )}

        {/* Link */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-slate-50 px-3 py-2">
            <span className="flex-1 truncate text-[12px] text-gray-500">{url}</span>
            <ExternalLink className="size-3.5 shrink-0 text-gray-300" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={copyLink}
              className="h-9 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 inline-flex items-center justify-center gap-1.5"
            >
              <Copy className="size-3.5" />
              링크 복사
            </button>
            <button
              onClick={downloadQr}
              disabled={!dataUrl}
              className="h-9 rounded-xl bg-blue-600 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              <Download className="size-3.5" />
              QR 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
