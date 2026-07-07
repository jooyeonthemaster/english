"use client";

// ============================================================================
// 학생 마킹 시험지 사진 업로드 패널 (읽기 스텝, 사진 누락 시)
//
// 파일 선택 → 다운스케일(hub/upload-helpers.downscaleForUpload 재사용) →
// 학생 키 서명 URL 발급(upload-urls, studentId 지정) → 직접 PUT →
// setStudentSources 로 sourceFiles 확정. 완료 후 onUploaded(pages) 로 상위에
// 알려 학생 상세를 리로드하게 한다. hub intake 와 별개(학생 전용 키 발급).
// ============================================================================

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

import { setStudentSources } from "@/actions/exam-report";
import { downscaleForUpload } from "../hub/upload-helpers";

interface PhotoUploadProps {
  analysisId: string;
  studentId: string;
  /** 업로드+저장 성공 시 호출 — 상위가 학생 상세를 리로드한다. */
  onUploaded: () => void;
}

interface Slot {
  id: string;
  blob: Blob;
  previewUrl: string;
  name: string;
}

interface UploadTarget {
  index: number;
  uploadUrl: string;
  path: string;
}

const MAX_PAGES = 12;

/** 학생 마킹 사진을 다운스케일 → 학생 키 서명URL PUT → sourceFiles 배열 반환. */
async function uploadStudentPhotos(opts: {
  analysisId: string;
  studentId: string;
  slots: Slot[];
  onProgress: (uploaded: number, total: number) => void;
}): Promise<{ path: string; page: number }[]> {
  const { analysisId, studentId, slots, onProgress } = opts;

  // 메모리 안전: 순차 다운스케일(모바일 다중 12MP 동시 디코드 방지).
  const prepared: { blob: Blob; index: number }[] = [];
  for (let i = 0; i < slots.length; i++) {
    prepared.push({ blob: await downscaleForUpload(slots[i].blob), index: i });
  }

  const res = await fetch("/api/exam-report/upload-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      analysisId,
      studentId,
      pages: prepared.map((p) => ({
        index: p.index,
        contentType: p.blob.type || "image/jpeg",
      })),
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "업로드 URL 발급에 실패했습니다.");
  }
  const { targets } = (await res.json()) as { targets: UploadTarget[] };
  const byIndex = new Map(targets.map((t) => [t.index, t] as const));

  let uploaded = 0;
  for (const item of prepared) {
    const target = byIndex.get(item.index);
    if (!target) throw new Error(`페이지 ${item.index + 1} 업로드 대상이 없습니다.`);
    const put = await fetch(target.uploadUrl, {
      method: "PUT",
      body: item.blob,
      headers: { "Content-Type": item.blob.type || "image/jpeg", "x-upsert": "true" },
    });
    if (!put.ok) throw new Error(`페이지 ${item.index + 1} 업로드 실패 (${put.status})`);
    uploaded += 1;
    onProgress(uploaded, prepared.length);
  }

  return targets
    .map((t) => ({ path: t.path, page: t.index + 1 }))
    .sort((a, b) => a.page - b.page);
}

export function PhotoUpload({ analysisId, studentId, onUploaded }: PhotoUploadProps) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSlots((prev) => {
      const room = Math.max(0, MAX_PAGES - prev.length);
      const picked = Array.from(files)
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, room)
        .map((f) => ({
          id: `${f.name}-${f.size}-${crypto.randomUUID()}`,
          blob: f,
          previewUrl: URL.createObjectURL(f),
          name: f.name,
        }));
      return [...prev, ...picked];
    });
  }, []);

  const removeSlot = useCallback((id: string) => {
    setSlots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const handleUpload = useCallback(async () => {
    if (slots.length === 0 || busy) return;
    setBusy(true);
    setProgress({ done: 0, total: slots.length });
    try {
      const pages = await uploadStudentPhotos({
        analysisId,
        studentId,
        slots,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const result = await setStudentSources(studentId, pages);
      if (!result.ok) {
        toast.error(
          result.error === "INVALID_PATH"
            ? "업로드 경로 검증에 실패했습니다."
            : "사진 저장에 실패했습니다. 다시 시도해 주세요.",
        );
        return;
      }
      slots.forEach((s) => URL.revokeObjectURL(s.previewUrl));
      setSlots([]);
      toast.success("학생 시험지 사진을 저장했습니다.");
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [analysisId, studentId, slots, busy, onUploaded]);

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {slots.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex min-h-[180px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
        >
          <ImagePlus className="h-8 w-8" />
          <span className="text-sm font-semibold">학생이 푼 시험지 사진을 올리세요</span>
          <span className="text-xs text-slate-400">최대 {MAX_PAGES}장 · 마킹·채점 표기가 보이게</span>
        </button>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <div key={s.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.previewUrl}
                  alt={s.name}
                  className="aspect-[3/4] w-full rounded-md border border-slate-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeSlot(s.id)}
                  disabled={busy}
                  aria-label="사진 제거"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {slots.length < MAX_PAGES && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-[11px] font-medium">추가</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              {progress
                ? `업로드 중 ${progress.done}/${progress.total}`
                : `${slots.length}장 선택됨`}
            </p>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={busy || slots.length === 0}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              사진 업로드
            </button>
          </div>
        </>
      )}
    </div>
  );
}
