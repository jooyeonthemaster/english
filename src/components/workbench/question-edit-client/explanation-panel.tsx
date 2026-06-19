// @ts-nocheck
"use client";

import React, { useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";

interface Option {
  label: string;
  text: string;
}

interface Props {
  explanation: string;
  setExplanation: (v: string) => void;
  keyPoints: string[];
  setKeyPoints: (v: string[]) => void;
  options: Option[];
  correctAnswer: string;
  wrongExplanations: Record<string, string>;
  setWrongExplanations: (v: Record<string, string>) => void;
}

export function ExplanationPanel({
  explanation,
  setExplanation,
  keyPoints,
  setKeyPoints,
  options,
  correctAnswer,
  wrongExplanations,
  setWrongExplanations,
}: Props) {
  // ── 핵심 포인트 드래그 정렬 ──
  const [kpDrag, setKpDrag] = useState<number | null>(null);
  const [kpOver, setKpOver] = useState<number | null>(null);

  function reorderKp(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const a = [...keyPoints];
    const [m] = a.splice(from, 1);
    a.splice(to, 0, m);
    setKeyPoints(a);
  }
  function updateKp(idx: number, v: string) {
    const a = [...keyPoints];
    a[idx] = v;
    setKeyPoints(a);
  }

  // ── 오답 해설 ──
  // 저장된 해설이 있으면 그 순서를, 없으면 정답이 아닌 선지 번호를 기준으로 렌더.
  // 편집/추가/삭제/정렬 시 record 전체를 다시 만들어 일관성을 유지한다(마운트 시
  // 빈 값 주입으로 인한 거짓 '변경됨' 상태를 피하려고 effect 시딩은 쓰지 않음).
  const recordKeys = Object.keys(wrongExplanations);
  const wrongLabels =
    recordKeys.length > 0
      ? recordKeys
      : options.filter((o) => o.label !== correctAnswer).map((o) => o.label);

  const [weDrag, setWeDrag] = useState<number | null>(null);
  const [weOver, setWeOver] = useState<number | null>(null);

  function materializeWrong(labels: string[], overrides: Record<string, string> = {}) {
    const next: Record<string, string> = {};
    labels.forEach((l) => {
      next[l] = l in overrides ? overrides[l] : wrongExplanations[l] ?? "";
    });
    setWrongExplanations(next);
  }
  function updateWrong(label: string, v: string) {
    materializeWrong(wrongLabels, { [label]: v });
  }
  function removeWrong(label: string) {
    materializeWrong(wrongLabels.filter((l) => l !== label));
  }
  function reorderWrong(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const labels = [...wrongLabels];
    const [m] = labels.splice(from, 1);
    labels.splice(to, 0, m);
    materializeWrong(labels);
  }
  function addWrong() {
    const used = new Set(wrongLabels);
    let n = 1;
    while (used.has(String(n))) n++;
    materializeWrong([...wrongLabels, String(n)]);
  }

  return (
    <div className="w-[580px] shrink-0 border-l border-slate-200 bg-slate-50 flex min-h-0 flex-col overflow-hidden">
      {/* Header */}
      {/* Content */}
      <div className="flex-1 min-h-0 p-5 flex flex-col gap-5 overflow-y-auto">
        {/* Explanation textarea */}
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-slate-700">정답 해설</label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="w-full min-h-[260px] px-4 py-3 text-[14px] leading-[1.75] rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 resize-y placeholder:text-slate-400 text-slate-800 shadow-sm"
            placeholder="해설을 입력하세요..."
          />
        </div>

        {/* Key points */}
        <div className="flex flex-col gap-2 shrink-0">
          <label className="text-[13px] font-semibold text-slate-700">핵심 포인트</label>
          <div className="flex flex-col gap-2">
            {keyPoints.map((kp, idx) => (
              <div
                key={idx}
                onDragOver={(e) => {
                  if (kpDrag === null) return;
                  e.preventDefault();
                  setKpOver(idx);
                }}
                onDrop={(e) => {
                  if (kpDrag === null) return;
                  e.preventDefault();
                  reorderKp(kpDrag, idx);
                  setKpDrag(null);
                  setKpOver(null);
                }}
                className={`rounded-xl border px-3 py-2 transition-colors border-slate-200 bg-white hover:border-slate-300 ${
                  kpDrag === idx ? "opacity-50" : ""
                } ${kpOver === idx && kpDrag !== idx ? "ring-2 ring-blue-300" : ""}`}
              >
                {/* 헤더 — 손잡이 + 표식 ··· 닫기 */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      draggable
                      onDragStart={(e) => {
                        setKpDrag(idx);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setKpDrag(null);
                        setKpOver(null);
                      }}
                      className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0"
                      title="드래그하여 순서 변경"
                    >
                      <GripVertical className="w-4 h-4" />
                    </span>
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setKeyPoints(keyPoints.filter((_, i) => i !== idx))}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                    title="핵심 포인트 삭제"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={kp}
                  onChange={(e) => updateKp(idx, e.target.value)}
                  rows={2}
                  className="w-full min-h-9 text-[13.5px] leading-[1.6] px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 shadow-sm resize-y break-words"
                  placeholder="핵심 포인트..."
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setKeyPoints([...keyPoints, ""])}
              className="flex h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white text-[12.5px] font-semibold text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 mt-1"
            >
              <Plus className="h-4 w-4" />핵심 포인트 추가
            </button>
          </div>
        </div>

        {/* Wrong explanations */}
        <div className="flex flex-col gap-2 shrink-0">
          <label className="text-[13px] font-semibold text-slate-700">오답 해설</label>
          <div className="flex flex-col gap-2">
            {wrongLabels.map((label, idx) => (
              <div
                key={label}
                onDragOver={(e) => {
                  if (weDrag === null) return;
                  e.preventDefault();
                  setWeOver(idx);
                }}
                onDrop={(e) => {
                  if (weDrag === null) return;
                  e.preventDefault();
                  reorderWrong(weDrag, idx);
                  setWeDrag(null);
                  setWeOver(null);
                }}
                className={`rounded-xl border px-3 py-2 transition-colors border-slate-200 bg-white hover:border-slate-300 ${
                  weDrag === idx ? "opacity-50" : ""
                } ${weOver === idx && weDrag !== idx ? "ring-2 ring-blue-300" : ""}`}
              >
                {/* 헤더 — 손잡이 + 선지번호 ··· 닫기 */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      draggable
                      onDragStart={(e) => {
                        setWeDrag(idx);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setWeDrag(null);
                        setWeOver(null);
                      }}
                      className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0"
                      title="드래그하여 순서 변경"
                    >
                      <GripVertical className="w-4 h-4" />
                    </span>
                    <span className="w-6 h-6 aspect-square leading-none rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 bg-slate-200 text-slate-600">
                      {label}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeWrong(label)}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                    title="오답 해설 삭제"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={wrongExplanations[label] || ""}
                  onChange={(e) => updateWrong(label, e.target.value)}
                  placeholder="오답 이유..."
                  rows={3}
                  className="w-full min-h-9 text-[13.5px] leading-[1.6] px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400 shadow-sm resize-y break-words"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={addWrong}
              className="flex h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white text-[12.5px] font-semibold text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 mt-1"
            >
              <Plus className="h-4 w-4" />오답 해설 추가
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
