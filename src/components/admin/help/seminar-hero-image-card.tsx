"use client";

// ============================================================================
// 원장 "1:1 세미나 신청" 히어로 이미지 관리 — 업로드는 단체 세미나 커버 업로드
// API(공개 버킷)를 재사용하고, URL은 PlatformSetting에 저장한다. SUPER_ADMIN 전용.
// ============================================================================

import { useRef, useState, useTransition } from "react";
import { setSeminarHeroImage } from "@/actions/admin-settings";
import { toast } from "sonner";
import { ImagePlus, Presentation, Trash2 } from "lucide-react";

export function SeminarHeroImageCard({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function save(next: string | null) {
    startTransition(async () => {
      const res = await setSeminarHeroImage(next);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setUrl(res.url);
      toast.success(res.url ? "히어로 이미지를 설정했어요." : "히어로 이미지를 제거했어요.");
    });
  }

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있어요.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/group-seminars/upload", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!res.ok || !data?.url) {
        toast.error(data?.error ?? "이미지 업로드에 실패했습니다.");
        return;
      }
      save(data.url);
    } catch {
      toast.error("이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading || isPending;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center">
      {/* Preview — 원장 페이지 플레이스홀더와 동일 톤 */}
      <div className="relative h-20 w-full shrink-0 overflow-hidden rounded-xl border border-gray-100 sm:w-40">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="1:1 세미나 히어로 이미지"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 text-slate-300">
            <Presentation className="size-5" strokeWidth={1.6} />
            <span className="text-[10px] font-semibold text-slate-400">기본 플레이스홀더</span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-gray-900">원장 페이지 히어로 이미지</div>
        <p className="mt-0.5 text-[12px] text-gray-400">
          1:1 세미나 신청 화면 오른쪽에 노출됩니다. 미설정 시 기본 플레이스홀더가
          보입니다. (JPG/PNG/WebP/GIF · 5MB 이하 · 가로형 권장)
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
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
          <ImagePlus className="size-3.5" />
          {uploading ? "업로드 중..." : "이미지 업로드"}
        </button>
        {url && (
          <button
            onClick={() => save(null)}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 text-[13px] font-medium text-gray-500 hover:bg-gray-50 hover:text-rose-600 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            제거
          </button>
        )}
      </div>
    </div>
  );
}
