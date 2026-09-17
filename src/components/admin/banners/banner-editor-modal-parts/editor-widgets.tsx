"use client";

import type { ComponentProps, ReactNode } from "react";
import { Eye, Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// 배너 편집기 세 종류(앱 배너·랜딩 헤더·랜딩 팝업)가 같이 쓰는 폼·미리보기 부품.

/** 라벨 · 입력 · 도움말 한 칸 */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 text-[12px] font-semibold text-gray-600">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

/** 설정 패널의 작은 구역 제목 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
      {children}
    </p>
  );
}

/** 라벨·설명이 있는 스위치 줄 */
export function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 transition-colors hover:bg-gray-50">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-gray-800">{label}</span>
        {desc && <span className="mt-0.5 block text-[12px] leading-snug text-gray-400">{desc}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

/**
 * 미리보기 캔버스 — 상단 줄(미리보기 · 실제로 보기) + 확대/축소 툴바 + 가운데 정렬된 축소판.
 * 편집기 본문의 왼쪽을 차지하고, 오른쪽엔 폼 패널(aside)이 붙는다.
 */
export function PreviewCanvas({
  zoom,
  baseZoom,
  onZoom,
  onLive,
  liveLabel,
  frameClassName,
  frameProps,
  children,
}: {
  zoom: number;
  /** "원래 크기" 로 돌아갈 배율 */
  baseZoom: number;
  onZoom: (zoom: number) => void;
  onLive: () => void;
  liveLabel: string;
  /** 축소판 프레임의 폭 등 */
  frameClassName?: string;
  /** 드래그&드롭 등 프레임에 붙일 속성 */
  frameProps?: ComponentProps<"div">;
  children: ReactNode;
}) {
  const step = (dir: -1 | 1) =>
    onZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(zoom + dir * ZOOM_STEP).toFixed(2))));

  return (
    <section className="relative flex min-h-[240px] min-w-0 flex-1 flex-col bg-gray-100/70">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white/70 px-4 py-2 backdrop-blur-sm">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-500">
          <Eye className="size-3.5" />
          미리보기
        </span>
        <Button
          variant="ghost"
          size="xs"
          onClick={onLive}
          className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
        >
          <Maximize2 className="size-3.5" />
          {liveLabel}
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto">
        {/* 확대/축소 */}
        <div className="pointer-events-auto absolute right-4 top-4 z-20 inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white/95 p-1 shadow-md backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => step(-1)}
            disabled={zoom <= ZOOM_MIN}
            aria-label="축소"
            title="축소"
          >
            <Minus />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onZoom(baseZoom)}
            disabled={zoom === baseZoom}
            title="원래 크기"
            className="min-w-[44px] tabular-nums"
          >
            {Math.round(zoom * 100)}%
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => step(1)}
            disabled={zoom >= ZOOM_MAX}
            aria-label="확대"
            title="확대"
          >
            <Plus />
          </Button>
        </div>

        <div className="flex min-h-full items-start justify-center p-8">
          <div
            {...frameProps}
            className={cn("transition-transform duration-150", frameClassName, frameProps?.className)}
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
