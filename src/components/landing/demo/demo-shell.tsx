"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Maximize2, RotateCcw, Sparkles, X } from "lucide-react";
import { useDemoSheet } from "./demo-sheet-context";

// 모든 라이브 데모 공통 "닫기" 버튼 — 흰색 정사각 X. 모바일 풀스크린 시트 닫기와
// PC 크게보기(확대) 상태의 닫기를 동일한 모양으로 통일한다.
const CLOSE_BUTTON_CLASS =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700";

/**
 * 랜딩 인터랙티브 데모 공용 크롬.
 * - "LIVE DEMO" 배지 + (선택) 리셋 버튼 헤더, 하단 "내 자료로 직접 해보기" 가입 CTA.
 * - "크게 보기" — 같은 트리를 풀스크린 오버레이로 승격(상태 보존). 내부 스크롤
 *   영역은 height: var(--demo-h, <기본 clamp>) 를 읽으므로, 확대 시 이 변수만
 *   키워 문서를 크게 볼 수 있다. Esc/닫기로 복귀.
 * - 루트에 data-landing-demo — LandingSnap 이 이 안의 휠 이벤트를 스냅에서 제외.
 *
 * 여기 임베드되는 워크벤치 표면(수정 금지, props 계약만 사용):
 *   InlineCropBoard · ReportPages · StructuredQuestionRenderer · PreviewPages
 */
export function DemoShell({
  label,
  children,
  onReset,
  footerNote,
  expandable = true,
}: {
  /** 배지 옆 짧은 설명 (예: "실제 크롭 도구 — 그대로 잘라보세요"). */
  label: string;
  children: ReactNode;
  /** 있으면 헤더 우측에 리셋 버튼 노출. */
  onReset?: () => void;
  /** CTA 왼쪽의 안내 문구 오버라이드. */
  footerNote?: string;
  /** "크게 보기"(풀스크린 확대) 버튼 노출 여부. */
  expandable?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // 모바일 풀스크린 시트 안이면 컨텍스트가 존재 → 크게보기 대신 닫기(X), 루트를
  // 시트를 가득 채우는 flex 로. PC 경로에는 프로바이더가 없어 null → 무영향.
  const sheet = useDemoSheet();
  const inSheet = sheet !== null;

  // 확대 중 배경 페이지 스크롤 잠금 + Esc 로 닫기.
  useEffect(() => {
    if (!expanded) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  return (
    <div
      className={
        inSheet
          ? "flex h-full w-full flex-col"
          : expanded
            ? "fixed inset-0 z-[120] flex flex-col bg-slate-950/60 p-4 backdrop-blur-sm lg:p-8"
            : "contents"
      }
    >
      <div
        data-landing-demo
        className={
          "relative flex min-w-0 flex-col overflow-hidden bg-white" +
          (inSheet
            ? " h-full w-full"
            : " rounded-2xl border border-blue-100 shadow-[0_30px_80px_-30px_rgba(59,130,246,0.25)]") +
          (expanded ? " mx-auto h-full w-full max-w-[1400px]" : "")
        }
        style={
          expanded
            ? ({ "--demo-h": "calc(100svh - 250px)" } as CSSProperties)
            : undefined
        }
      >
        {/* 헤더 — LIVE DEMO 배지 + 확대/리셋 */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-blue-50 bg-[#F8FAFC] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-white">
              <Sparkles className="size-3" aria-hidden="true" />
              Live Demo
            </span>
            <span className="truncate text-[12px] font-semibold text-slate-500">
              {label}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onReset ? (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                <RotateCcw className="size-3" aria-hidden="true" />
                처음부터
              </button>
            ) : null}
            {inSheet ? (
              <button
                type="button"
                onClick={sheet.onClose}
                title="닫기"
                aria-label="닫기"
                className={CLOSE_BUTTON_CLASS}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : expandable ? (
              expanded ? (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  title="닫기 (Esc)"
                  aria-label="닫기"
                  className={CLOSE_BUTTON_CLASS}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  title="크게 보기"
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-[11px] font-bold text-blue-600 transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <Maximize2 className="size-3" aria-hidden="true" />
                  크게 보기
                </button>
              )
            ) : null}
          </div>
        </div>

        {/* 본문 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>

        {/* 푸터 — 가입 CTA */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-blue-50 bg-[#F8FAFC] px-4 py-2.5">
          <span className="text-[12px] font-medium text-slate-400">
            {footerNote ?? "예시 지문으로 체험 중 — 내 교재는 가입 후 바로"}
          </span>
          <Link
            href="/register"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-950 px-3.5 py-1.5 text-[12px] font-black text-white transition hover:bg-blue-600"
          >
            내 자료로 직접 해보기
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
