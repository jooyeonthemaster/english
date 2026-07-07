"use client";

// ============================================================================
// 원본 페이지 이미지 뷰어 — 강사가 사진 원본과 대조하며 확인할 때 사용.
// (v3: structure/ 에서 exam-report 루트로 이동 — 정오표/판독 화면 재사용)
//
// extraction-sources 버킷은 비공개(서명 URL 필수)이므로 자체 GET 서명 라우트를
// 만들지 않고, 서명 URL 배치 라우트
//   POST /api/exam-report/analyses/[id]/source-urls  body {paths:string[]} → {urls:string[]}
// 를 소비한다. 라우트가 없으면(404) 안내 상태로 우아하게 강등한다.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ImageOff, Loader2 } from "lucide-react";
import type { ExamSourceFile } from "./ui-contracts";

interface SourceImageViewerProps {
  analysisId: string;
  sourceFiles: ExamSourceFile[];
}

type Phase = "loading" | "ready" | "unavailable" | "empty";

export function SourceImageViewer({
  analysisId,
  sourceFiles,
}: SourceImageViewerProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [urls, setUrls] = useState<string[]>([]);

  const load = useCallback(async () => {
    const paths = sourceFiles.map((f) => f.path).filter(Boolean);
    if (paths.length === 0) {
      setPhase("empty");
      return;
    }
    setPhase("loading");
    try {
      const res = await fetch(
        `/api/exam-report/analyses/${analysisId}/source-urls`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths }),
        },
      );
      if (!res.ok) {
        setPhase("unavailable");
        return;
      }
      const data = (await res.json()) as { urls?: string[] };
      const list = Array.isArray(data.urls) ? data.urls.filter(Boolean) : [];
      if (list.length === 0) {
        setPhase("unavailable");
        return;
      }
      setUrls(list);
      setPhase("ready");
    } catch {
      setPhase("unavailable");
    }
  }, [analysisId, sourceFiles]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === "loading") {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center text-slate-400">
        <ImageOff className="h-6 w-6" />
        <p className="text-xs">등록된 원본 이미지가 없습니다.</p>
      </div>
    );
  }

  if (phase === "unavailable") {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center text-slate-400">
        <AlertCircle className="h-6 w-6" />
        <p className="text-xs">원본 이미지를 불러올 수 없습니다.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {urls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={url}
          alt={`원본 페이지 ${i + 1}`}
          loading="lazy"
          className="w-full rounded-md border border-slate-200"
        />
      ))}
    </div>
  );
}
