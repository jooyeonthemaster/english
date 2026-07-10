"use client";

// ============================================================================
// 홍보물 파일 등록/수정 모달.
//   - 신규(upload): 특정 홍보(campaignId)에 PDF 업로드(서명 URL로 브라우저 직접 업로드).
//   - 수정(edit):   파일 이름·설명만 변경(파일 교체 없음).
// 전단지 등 큰 PDF(>4.5MB)를 Vercel serverless 본문 상한 없이 올리기 위해
// 서명 업로드 URL로 Supabase에 직접 PUT 한다.
// ============================================================================

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, FileUp, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createOfflineMarketingUpload,
  createOfflineMarketingAsset,
  updateOfflineMarketingAsset,
  type OfflineMarketingAssetDto,
} from "@/actions/admin-offline-marketing";
import { formatBytes } from "./shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 신규 업로드 대상 홍보 id (신규 모드에서 필수). */
  campaignId: string | null;
  /** 값이 있으면 파일 메타 수정 모드. */
  asset: OfflineMarketingAssetDto | null;
  onSaved: () => void;
}

/** 브라우저에서 PDF 페이지 수를 읽는다(실패해도 무시). */
async function readPdfPageCount(buffer: ArrayBuffer): Promise<number | null> {
  try {
    // @ts-expect-error - /public 에서 런타임 로드(빌드 시 TS가 해석하지 않음)
    const pdfjs = (await import(/* webpackIgnore: true */ "/pdf.min.mjs")) as
      typeof import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: buffer.slice(0) }).promise;
    const n = doc.numPages;
    await doc.destroy();
    return n;
  } catch {
    return null;
  }
}

export function FileEditorModal({
  open,
  onOpenChange,
  campaignId,
  asset,
  onSaved,
}: Props) {
  const isEdit = !!asset;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(asset?.title ?? "");
    setDescription(asset?.description ?? "");
    setFile(null);
    setProgress(null);
  }, [open, asset]);

  function pickFile(f: File) {
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast.error("PDF 파일만 업로드할 수 있어요.");
      return;
    }
    if (f.size > 30 * 1024 * 1024) {
      toast.error("PDF는 30MB 이하만 가능해요.");
      return;
    }
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.pdf$/i, ""));
  }

  async function handleCreate() {
    if (!campaignId) {
      toast.error("대상 홍보를 찾을 수 없습니다.");
      return;
    }
    if (!file) {
      toast.error("PDF 파일을 선택하세요.");
      return;
    }
    if (!title.trim()) {
      toast.error("파일 이름을 입력하세요.");
      return;
    }
    setUploading(true);
    try {
      setProgress("업로드 준비 중...");
      const target = await createOfflineMarketingUpload(file.name);
      if (!target.success) {
        toast.error(target.error);
        return;
      }

      setProgress("업로드 중...");
      const buffer = await file.arrayBuffer();
      const put = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: { "content-type": "application/pdf", "x-upsert": "true" },
        body: buffer,
      });
      if (!put.ok) {
        toast.error("파일 업로드에 실패했습니다.");
        return;
      }

      setProgress("저장 중...");
      const pageCount = await readPdfPageCount(buffer);
      const res = await createOfflineMarketingAsset({
        campaignId,
        title: title.trim(),
        description: description.trim() || null,
        storagePath: target.storagePath,
        fileName: file.name,
        fileSize: file.size,
        pageCount,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("파일을 추가했어요.");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  function handleUpdate() {
    if (!asset) return;
    if (!title.trim()) {
      toast.error("파일 이름을 입력하세요.");
      return;
    }
    startTransition(async () => {
      const res = await updateOfflineMarketingAsset(asset.id, {
        title: title.trim(),
        description: description.trim() || null,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("수정했어요.");
      onSaved();
      onOpenChange(false);
    });
  }

  const busy = uploading || isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-gray-100 px-5 py-4">
          <DialogTitle className="text-[16px] font-bold text-gray-900">
            {isEdit ? "파일 수정" : "홍보물 파일 추가"}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
          {!isEdit && (
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-gray-600">
                PDF 파일 <span className="text-rose-500">*</span>
              </label>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                  e.target.value = "";
                }}
              />
              {file ? (
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
                  <FileText className="size-5 shrink-0 text-blue-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-gray-800">
                      {file.name}
                    </div>
                    <div className="text-[11px] text-gray-400">{formatBytes(file.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    disabled={busy}
                    className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50/50 py-6 text-[13px] font-medium text-gray-500 hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-600 disabled:opacity-50"
                >
                  <FileUp className="size-4" />
                  PDF 파일 선택 (30MB 이하)
                </button>
              )}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-gray-600">
              파일 이름 <span className="text-rose-500">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 2027 영어 실전모의고사 문제지"
              disabled={busy}
              maxLength={150}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-gray-600">
              설명 · 메모 <span className="text-gray-300">(선택)</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="버전, 용도 등 내부 메모"
              disabled={busy}
              maxLength={1000}
              rows={2}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-9 rounded-xl border border-gray-200 px-4 text-[13px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={isEdit ? handleUpdate : handleCreate}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {busy ? (progress ?? "저장 중...") : isEdit ? "저장" : "추가"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
