"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

import { HERO_PASSAGE } from "../shared/mock-data";
import type { Phase } from "./types";

export function PassageSource({
  tokens,
  active,
  runKey,
  reduced,
}: {
  tokens: string[];
  active: boolean;
  runKey: number;
  reduced: boolean;
}) {
  const segments = useMemo(
    () => buildPassageSegments(HERO_PASSAGE, tokens),
    [tokens],
  );

  return (
    <div className="px-4 sm:px-7 lg:px-10 pt-4 sm:pt-5 pb-4 bg-gradient-to-b from-[#F8FAFC] to-white border-b border-blue-50 relative">
      <div className="flex items-center gap-3 mb-2.5">
        <span className="text-[10px] uppercase tracking-[0.2em] font-extrabold text-blue-500">
          분석된 원문
        </span>
        <span className="h-px flex-1 bg-blue-100" />
        <div className="flex items-center gap-1.5">
          {!reduced && active && (
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-blue-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-[#3B82F6]" />
            </span>
          )}
          <span className="text-[10px] font-bold text-blue-600 font-mono tracking-wider">
            {/* 생성 완료(또는 모바일 정적 상태)에는 진행형 문구를 쓰지 않는다 */}
            {active && !reduced ? "EXTRACTING" : "ANALYZED"} · {tokens.length}
          </span>
        </div>
      </div>
      <p className="text-[13px] lg:text-[14px] leading-[1.7] text-gray-600 font-serif">
        {segments.map((seg, i) =>
          seg.highlighted ? (
            <PassageToken
              key={`${runKey}-${i}`}
              text={seg.text}
              delay={seg.tokenIndex * 220}
              reduced={reduced}
            />
          ) : (
            <span key={`${runKey}-${i}`}>{seg.text}</span>
          ),
        )}
      </p>
    </div>
  );
}

function PassageToken({
  text,
  delay,
  reduced,
}: {
  text: string;
  delay: number;
  reduced: boolean;
}) {
  return (
    <motion.span
      initial={{ backgroundColor: "rgba(219, 234, 254, 0)", color: "#4B5563" }}
      animate={
        reduced
          ? { backgroundColor: "#DBEAFE", color: "#1E3A8A" }
          : {
              backgroundColor: ["rgba(219, 234, 254, 0)", "#BFDBFE", "#DBEAFE"],
              color: ["#4B5563", "#1E3A8A", "#1E40AF"],
              boxShadow: [
                "0 0 0 0 rgba(59, 130, 246, 0)",
                "0 0 0 4px rgba(59, 130, 246, 0.18)",
                "0 0 0 0 rgba(59, 130, 246, 0)",
              ],
            }
      }
      transition={{
        duration: reduced ? 0 : 0.9,
        delay: reduced ? 0 : delay / 1000,
        ease: "easeOut",
      }}
      className="px-1 py-[1px] mx-[1px] rounded font-bold border-b-2 border-[#3B82F6]"
    >
      {text}
    </motion.span>
  );
}

function buildPassageSegments(passage: string, tokens: string[]) {
  if (tokens.length === 0) return [{ text: passage, highlighted: false, tokenIndex: -1 }];
  const lower = passage.toLowerCase();
  const ranges: Array<{ start: number; end: number; tokenIndex: number }> = [];
  tokens.forEach((tok, idx) => {
    if (!tok) return;
    const at = lower.indexOf(tok.toLowerCase());
    if (at >= 0) ranges.push({ start: at, end: at + tok.length, tokenIndex: idx });
  });
  ranges.sort((a, b) => a.start - b.start);
  // Merge overlaps
  const merged: typeof ranges = [];
  ranges.forEach((r) => {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  });
  const out: Array<{ text: string; highlighted: boolean; tokenIndex: number }> = [];
  let cursor = 0;
  merged.forEach((r) => {
    if (r.start > cursor) {
      out.push({ text: passage.slice(cursor, r.start), highlighted: false, tokenIndex: -1 });
    }
    out.push({ text: passage.slice(r.start, r.end), highlighted: true, tokenIndex: r.tokenIndex });
    cursor = r.end;
  });
  if (cursor < passage.length) {
    out.push({ text: passage.slice(cursor), highlighted: false, tokenIndex: -1 });
  }
  return out;
}

export function ConnectionBeam({
  phase,
  reduced,
}: {
  phase: Phase;
  reduced: boolean;
}) {
  const visible = phase !== "done";
  return (
    <div className="relative h-7 bg-gradient-to-b from-white to-[#F8FAFC] border-b border-blue-50 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center gap-3">
        <span className="text-[10px] uppercase tracking-[0.18em] font-extrabold text-blue-400">
          GENERATE
        </span>
        <div className="relative w-[180px] h-[2px] bg-blue-100 rounded-full overflow-hidden">
          {!reduced && visible && (
            <motion.span
              key={phase}
              className="absolute inset-y-0 w-[40px] rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, #3B82F6 50%, transparent 100%)",
              }}
              initial={{ left: "-40px" }}
              animate={{ left: "180px" }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </div>
        <svg width="14" height="10" viewBox="0 0 14 10" className="text-blue-500" fill="currentColor">
          <path
            d="M0 5 L11 5 M7 1 L11 5 L7 9"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
