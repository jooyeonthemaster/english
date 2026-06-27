"use client";

import dynamic from "next/dynamic";

import type { GenerateTourVariant } from "./generate-tour-video";

export const GenerateTourPlayer = dynamic<{ variant?: GenerateTourVariant }>(
  () => import("./generate-tour-player").then((m) => m.GenerateTourPlayer),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-video w-full items-center justify-center rounded-[10px] bg-slate-950 text-[11px] font-bold text-slate-400">
        튜토리얼 준비 중...
      </div>
    ),
  },
);
