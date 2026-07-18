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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ImageOff, Loader2 } from "lucide-react";
import type { ExamSourceFile } from "./ui-contracts";

interface SourceImageViewerProps {
  analysisId: string;
  sourceFiles: ExamSourceFile[];
  /** 이미지 폭 배율(1 = 컨테이너 폭 맞춤). 분할 패널의 줌 컨트롤이 내려준다. */
  zoom?: number;
}

type Phase = "loading" | "ready" | "unavailable" | "empty";

export function SourceImageViewer({
  analysisId,
  sourceFiles,
  zoom,
}: SourceImageViewerProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [urls, setUrls] = useState<string[]>([]);
  // 서명 만료 재발급 가드 — 동시 1회 + pathsKey 당 상한(진짜 404 무한 루프 방지).
  const reissueBusyRef = useRef(false);
  const reissueCountRef = useRef(0);

  // 경로 '내용' 키 — 분석 폴링이 detail 을 통째로 갈아끼워 sourceFiles 참조가
  // 5초마다 바뀌어도(내용 동일) 재페치하지 않는다. 참조 기반 deps 였을 때는
  // ANALYZING 내내 스피너 리셋 + 서명 URL·이미지 전량 재요청이 반복됐다.
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
    // 재발급/경로 변경 재페치 시 이미 그려진 이미지는 유지(스크롤 보존) —
    // 아무것도 없는 최초 로드만 스피너.
    setPhase((cur) => (cur === "ready" ? "ready" : "loading"));
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
  }, [analysisId, pathsKey]);

  useEffect(() => {
    reissueCountRef.current = 0;
    void load();
  }, [load]);

  // 서명 URL(30분) 만료 후 lazy 로드로 처음 노출된 페이지가 깨지면 조용히
  // 재발급해 src 를 교체한다 — 상시 분할 패널에서는 30분 초과 체류가 통상.
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
          // 손바닥 팬(분할 패널) 중 네이티브 이미지 드래그 고스트 차단.
          draggable={false}
          onError={handleImageError}
          className="w-full rounded-md border border-slate-200"
          // 확대(>100%) 시 컨테이너를 넘겨 상위 스크롤러의 가로 스크롤로 흡수.
          style={
            zoom && zoom !== 1
              ? { width: `${zoom * 100}%`, maxWidth: "none" }
              : undefined
          }
        />
      ))}
    </div>
  );
}
