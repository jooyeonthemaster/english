"use client";

// ============================================================================
// 분석 카드 좌측 썸네일 — 업로드한 시험지 사진 1쪽을 지연 로드해 보여준다.
//
// 시험지 카드의 ExamCardPaperPreview 패턴을 그대로 따른다(IntersectionObserver
// 로 뷰포트 진입 시에만 요청 + startedRef 로 1회 발사 고정). 다만 이쪽은 서버
// 액션이 아니라 source-urls 라우트로 '서명 URL'을 받아 <img> 로 그리므로,
// URL 확보(ready) 이후에도 이미지 디코드가 끝날 때까지 스켈레톤을 유지한다
// (안 그러면 흰 화면이 한 번 번쩍인다).
//
// 원본은 1MB+ 이므로 반드시 thumb:true(=서버 리사이즈 ~20KB)로 요청한다.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function AnalysisSourceThumbnail({
  analysisId,
  path,
  alt,
  className,
}: {
  analysisId: string;
  /** 1쪽 스토리지 경로(요약 API 의 thumbnailPath) */
  path: string;
  alt?: string;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // 뷰포트 진입 시에만 서명 요청(목록 50장 × 서명/이미지 낭비 방지).
  useEffect(() => {
    if (visible) return;
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  // 서명 URL 1회 발사. setState 가 이 이펙트를 재실행해 자기 요청을 취소하는
  // 것을 막기 위해 startedRef 로 고정한다(ExamCardPaperPreview 와 동일 이유).
  useEffect(() => {
    if (!visible || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/exam-report/analyses/${analysisId}/source-urls`,
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ paths: [path], thumb: true }),
          },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { urls?: string[] };
        const signed = data.urls?.[0];
        if (cancelled) return;
        if (signed) setUrl(signed);
        else setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, analysisId, path]);

  // 실패 시 아무것도 그리지 않는다 — 부모(StatusPanel)가 그대로 드러난다.
  if (failed) return null;

  return (
    <div ref={hostRef} className={cn("absolute inset-0", className)}>
      {url && (
        <img
          src={url}
          alt={alt ?? "업로드한 시험지 미리보기"}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "h-full w-full object-cover object-top transition-opacity duration-200",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {/* 디코드 완료 전까지 스켈레톤 유지(시험지 카드와 동일 그라데이션) */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-slate-50 to-slate-100" />
      )}
    </div>
  );
}
