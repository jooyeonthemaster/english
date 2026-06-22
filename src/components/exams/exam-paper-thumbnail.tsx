"use client";

import { useEffect, useRef, useState } from "react";
import { getExamPreviewData } from "@/actions/exams";
import { cn } from "@/lib/utils";
import { ExamFirstPagePreview } from "./exam-detail-paper-preview";
import type { ExamDetail } from "./exam-detail-client-parts/types";

// ---------------------------------------------------------------------------
// 시험지 카드 좌측의 "첫 장" 실제 렌더 미리보기.
//   - 목록 페이로드에는 문항 본문이 없으므로, 카드가 화면에 보일 때 examId 별로
//     getExamPreviewData 를 lazy 호출해 실제 시험지 데이터를 받아온다.
//   - 받아온 데이터를 ExamFirstPagePreview(상세 미리보기와 동일 파이프라인)로
//     첫 페이지 한 장만 렌더해, 부모 칸의 폭에 맞춰 위→아래로 채운다.
// ---------------------------------------------------------------------------

export function ExamCardPaperPreview({
  examId,
  className,
}: {
  examId: string;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "empty">("idle");
  // 한 카드당 단 한 번만 fetch — 아래 effect 가 setState("loading")으로 자기 자신을
  // 재실행시켜 in-flight 요청을 취소하던 버그를 막는다.
  const startedRef = useRef(false);

  // 칸 폭 측정 — A4 비율 렌더 폭의 기준이 된다.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 뷰포트 진입 시에만 데이터를 불러온다(목록 27장 동시 요청 방지).
  useEffect(() => {
    const el = hostRef.current;
    if (!el || visible) return;
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

  useEffect(() => {
    if (!visible || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    setState("loading");
    getExamPreviewData(examId)
      .then((data) => {
        if (cancelled) return;
        if (!data || data.questions.length === 0) {
          setState("empty");
          return;
        }
        setExam(data as unknown as ExamDetail);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("empty");
      });
    return () => {
      cancelled = true;
    };
  }, [visible, examId]);

  return (
    <div
      ref={hostRef}
      className={cn(
        "absolute inset-0 flex items-start justify-center overflow-hidden bg-white",
        className,
      )}
    >
      {state === "ready" && exam && width > 0 ? (
        <ExamFirstPagePreview exam={exam} width={width} />
      ) : state === "empty" ? (
        <div className="flex h-full w-full items-center justify-center text-[11px] text-slate-300">
          미리보기 없음
        </div>
      ) : (
        // idle/loading 스켈레톤
        <div className="h-full w-full animate-pulse bg-gradient-to-b from-slate-50 to-slate-100" />
      )}
    </div>
  );
}
