"use client";

// ============================================================================
// 학생 마킹 시험지 사진 뷰어 — 정오표에서 강사가 사진을 보며 판독을 정정한다.
//
// students 버킷은 비공개(서명 URL 필수)이므로 학생 전용 서명 라우트
//   POST /api/exam-report/students/[studentId]/source-urls  {paths} → {urls}
// 를 소비한다(경로 화이트리스트·앵커드 검증은 서버). 미가용(404/403)이면
// 우아하게 강등한다. 읽기 스텝 썸네일과 정오표 우측 뷰어가 공유한다.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // 서명 만료 재발급 가드 — 동시 1회 + pathsKey 당 상한(진짜 404 무한 루프 방지).
  const reissueBusyRef = useRef(false);
  const reissueCountRef = useRef(0);

  // 경로 '내용' 키 — 상위가 detail/student 를 통째로 갈아끼워 sourceFiles 참조가
  // 바뀌어도(내용 동일) 재페치하지 않는다(source-image-viewer 와 동일 계약).
  const pathsKey = useMemo(
    () =>
      sourceFiles
        .map((f) => f.path)
        .filter(Boolean)
        .join("\n"),
    [sourceFiles],
  );

  const load = useCallback(async () => {
    const paths = pathsKey === "" ? [] : pathsKey.split("\n");
    if (paths.length === 0) {
      setPhase("empty");
      return;
    }
    // 재발급/경로 변경 재페치 시 이미 그려진 사진은 유지 — 최초 로드만 스피너.
    setPhase((cur) => (cur === "ready" ? "ready" : "loading"));
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
        setPhase((cur) => (cur === "ready" ? "ready" : "unavailable"));
        return;
      }
      const data = (await res.json()) as { urls?: string[] };
      const list = Array.isArray(data.urls) ? data.urls.filter(Boolean) : [];
      if (list.length === 0) {
        setPhase((cur) => (cur === "ready" ? "ready" : "unavailable"));
        return;
      }
      setUrls(list);
      setPhase("ready");
    } catch {
      setPhase((cur) => (cur === "ready" ? "ready" : "unavailable"));
    }
  }, [studentId, pathsKey]);

  useEffect(() => {
    reissueCountRef.current = 0;
    void load();
  }, [load]);

  // 서명 URL(30분) 만료 후 lazy 노출된 사진이 깨지면 조용히 재발급.
  const handleImageError = useCallback(() => {
    if (reissueBusyRef.current || reissueCountRef.current >= 2) return;
    reissueBusyRef.current = true;
    reissueCountRef.current += 1;
    void load().finally(() => {
      reissueBusyRef.current = false;
    });
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
            onError={handleImageError}
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
          onError={handleImageError}
          className="w-full rounded-md border border-slate-200"
        />
      ))}
    </div>
  );
}
