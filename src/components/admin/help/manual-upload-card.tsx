"use client";

// ============================================================================
// 사용 매뉴얼 PDF 관리 — 관리자가 원장 헬프센터에 노출할 매뉴얼 PDF를 업로드한다.
// 업로드는 공개 버킷 API(/api/admin/manual/upload)를 쓰고, URL은 PlatformSetting에
// 저장한다. 미설정 시 원장 페이지는 "준비 중"으로 표시된다. SUPER_ADMIN 전용.
// ============================================================================

import { useRef, useState, useTransition } from "react";
import { setManualPdfUrl } from "@/actions/admin-settings";
import { toast } from "sonner";
import { BookOpen, ExternalLink, FileUp, Trash2 } from "lucide-react";

export function ManualUploadCard({
  initialUrl,
  initialUpdatedAt,
}: {
  initialUrl: string | null;
  initialUpdatedAt: string | null;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function save(next: string | null) {
    startTransition(async () => {
      const res = await setManualPdfUrl(next);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setUrl(res.url);
      setUpdatedAt(res.url ? new Date().toISOString() : null);
      toast.success(res.url ? "매뉴얼을 업데이트했어요." : "매뉴얼을 제거했어요.");
    });
  }

  async function upload(file: File) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast.error("PDF 파일만 업로드할 수 있어요.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/manual/upload", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!res.ok || !data?.url) {
        toast.error(data?.error ?? "PDF 업로드에 실패했습니다.");
        return;
      }
      save(data.url);
    } catch {
      toast.error("PDF 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading || isPending;
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center">
      {/* Status */}
      <div
        className={`relative flex h-20 w-full shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border sm:w-40 ${
          url
            ? "border-blue-100 bg-blue-50 text-blue-600"
            : "border-gray-100 bg-gradient-to-br from-slate-50 to-gray-50 text-slate-300"
        }`}
      >
        <BookOpen className="size-5" strokeWidth={1.7} />
        <span className={`text-[10px] font-semibold ${url ? "text-blue-500" : "text-slate-400"}`}>
          {url ? "게시 중" : "미게시 (준비 중)"}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-gray-900">사용 매뉴얼 PDF</div>
        <p className="mt-0.5 text-[12px] text-gray-400">
          원장 <span className="font-medium text-gray-500">고객 센터 → 사용 매뉴얼</span> 화면에
          노출됩니다. 업로드 전까지는 원장에게 &ldquo;준비 중&rdquo;으로 안내됩니다. (PDF · 30MB 이하)
        </p>
        {url && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {updatedLabel && (
              <span className="text-gray-400">최근 업데이트 · {updatedLabel}</span>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
            >
              <ExternalLink className="size-3" />
              현재 매뉴얼 열기
            </a>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <FileUp className="size-3.5" />
          {uploading ? "업로드 중..." : url ? "매뉴얼 교체" : "매뉴얼 업로드"}
        </button>
        {url && (
          <button
            onClick={() => save(null)}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 text-[13px] font-medium text-gray-500 hover:bg-gray-50 hover:text-rose-600 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            내리기
          </button>
        )}
      </div>
    </div>
  );
}
