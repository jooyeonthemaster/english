/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import type React from "react";
import type { Highlight, NoteCategory } from "./types";

export const DIFF_LABELS: Record<string, { label: string; cls: string }> = {
  basic: { label: "기본", cls: "bg-emerald-100 text-emerald-700" },
  intermediate: { label: "심화", cls: "bg-blue-100 text-blue-700" },
  advanced: { label: "고난도", cls: "bg-red-100 text-red-700" },
};

export const TYPE_PRIORITY: Record<Highlight["type"], number> = {
  exam: 4,
  grammar: 3,
  syntax: 2,
  vocab: 1,
};

export const CATEGORY_META: Record<NoteCategory, {
  label: string;
  title: string;
  dot: string;
  text: string;
  soft: string;
  border: string;
  active: string;
  ring: string;
}> = {
  vocab: {
    label: "어휘",
    title: "어휘 정리본",
    dot: "bg-blue-500",
    text: "text-blue-600",
    soft: "bg-blue-50",
    border: "border-blue-200",
    active: "bg-blue-50 border-blue-200 text-blue-700",
    ring: "ring-blue-300",
  },
  grammar: {
    label: "어법",
    title: "어법/문법 포인트",
    dot: "bg-violet-500",
    text: "text-violet-600",
    soft: "bg-violet-50",
    border: "border-violet-200",
    active: "bg-violet-50 border-violet-200 text-violet-700",
    ring: "ring-violet-300",
  },
  syntax: {
    label: "읽기포인트",
    title: "문장별 읽기 포인트",
    dot: "bg-cyan-500",
    text: "text-cyan-600",
    soft: "bg-cyan-50",
    border: "border-cyan-200",
    active: "bg-cyan-50 border-cyan-200 text-cyan-700",
    ring: "ring-cyan-300",
  },
  key: {
    label: "핵심문장",
    title: "핵심문장 정리본",
    dot: "bg-green-500",
    text: "text-green-600",
    soft: "bg-green-50",
    border: "border-green-200",
    active: "bg-green-50 border-green-200 text-green-700",
    ring: "ring-green-300",
  },
  exam: {
    label: "출제포인트",
    title: "출제포인트 정리본",
    dot: "bg-yellow-500",
    text: "text-yellow-600",
    soft: "bg-yellow-50",
    border: "border-yellow-200",
    active: "bg-yellow-50 border-yellow-200 text-yellow-700",
    ring: "ring-yellow-300",
  },
};

export const FOCUS_STYLES: Record<NoteCategory, React.CSSProperties> = {
  vocab: {
    background: "linear-gradient(to top, #bfdbfe 78%, transparent 78%)",
    boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.38), 0 0 0 7px rgba(59, 130, 246, 0.12)",
    borderRadius: 4,
  },
  grammar: {
    background: "rgba(237, 233, 254, 0.92)",
    boxShadow: "0 0 0 2px rgba(139, 92, 246, 0.4), 0 0 0 7px rgba(139, 92, 246, 0.12)",
    borderRadius: 4,
  },
  syntax: {
    background: "rgba(207, 250, 254, 0.92)",
    boxShadow: "0 0 0 2px rgba(8, 145, 178, 0.4), 0 0 0 7px rgba(8, 145, 178, 0.12)",
    borderRadius: 4,
  },
  key: {
    background: "rgba(220, 252, 231, 0.9)",
    boxShadow: "0 0 0 2px rgba(34, 197, 94, 0.42), 0 0 0 7px rgba(34, 197, 94, 0.12)",
    borderRadius: 6,
  },
  exam: {
    background: "linear-gradient(to top, #fde68a 82%, transparent 82%)",
    boxShadow: "0 0 0 2px rgba(234, 179, 8, 0.45), 0 0 0 7px rgba(234, 179, 8, 0.14)",
    borderRadius: 4,
  },
};
