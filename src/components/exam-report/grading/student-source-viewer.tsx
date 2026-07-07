"use client";

// ============================================================================
// 학생 마킹 시험지 사진 뷰어 — 정오표에서 강사가 사진을 보며 판독을 정정한다.
//
// students 버킷은 비공개(서명 URL 필수)이므로 학생 전용 서명 라우트
//   POST /api/exam-report/students/[studentId]/source-urls  {paths} → {urls}
// 를 소비한다(경로 화이트리스트·앵커드 검증은 서버). 미가용(404/403)이면
// 우아하게 강등한다. 읽기 스텝 썸네일과 정오표 우측 뷰어가 공유한다.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ImageOff, Loader2 } from "lucide-react";
import type { ExamSourceFile } from "../ui-contracts";

interface StudentSourceViewerProps {
  studentId: string;
  sourceFiles: ExamSourceFile[];
  /** 컴팩트 = 썸네일 그리드(읽기 스텝) / 기본 = 세로 스택(정오표 뷰어). */
  variant?: "stack" | "grid";
}

type Phase = "loading" | "ready" | "unavailable" | "empty";

export function StudentSourceViewer({
  studentId,
  sourceFiles,
  variant = "stack",
}: StudentSourceViewerProps) {
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
        `/api/exam-report/students/${studentId}/source-urls`,
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
  }, [studentId, sourceFiles]);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === "loading") {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-6 text-center text-slate-400">
        <ImageOff className="h-6 w-6" />
        <p className="text-xs">등록된 학생 시험지 사진이 없습니다.</p>
      </div>
    );
  }

  if (phase === "unavailable") {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-6 text-center text-slate-400">
        <AlertCircle className="h-6 w-6" />
        <p className="text-xs">사진을 불러올 수 없습니다.</p>
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

  if (variant === "grid") {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {urls.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt={`학생 시험지 ${i + 1}`}
            loading="lazy"
            className="aspect-[3/4] w-full rounded-md border border-slate-200 object-cover"
          />
        ))}
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
          alt={`학생 시험지 ${i + 1}`}
          loading="lazy"
          className="w-full rounded-md border border-slate-200"
        />
      ))}
    </div>
  );
}
