"use client";

// ── 읽는 법 시트 ───────────────────────────────────────────────────────────
// 숙달 지도의 부호(레슨 배지 · 드릴 숙달 4티어)를 학생 말로 풀어 주는 온탭 하단
// 시트. 표면에는 아이콘·숫자만 두고 설명은 여기에 모은다(정보 계층화).

import { X } from "lucide-react";
import { L, LowConfidenceBadge, M, type MKey } from "./mastery-tiers";

const LESSON_ROWS: [keyof typeof L, string][] = [
  ["todo", "아직 레슨을 열지 않았습니다"],
  ["doing", "블록 m개 중 몇 개까지 봤는지 표시합니다"],
  ["done", "레슨을 끝까지 마쳤습니다"],
];
const MASTERY_ROWS: [MKey, string][] = [
  ["mastered", "85점 이상 — 완성한 개념입니다"],
  ["learning", "50~84점 — 익히는 중입니다"],
  ["weak", "50점 미만 — 더 훈련해야 합니다"],
  ["new", "아직 풀지 않은 개념입니다"],
];

export function MasteryLegendSheet({ onClose }: { onClose: () => void }) {
  return (
    <>
      <button type="button" aria-label="닫기" className="gd-sheet-backdrop" onClick={onClose} />
      <div className="gd-sheet gd-app gd-safe-b" role="dialog" aria-modal="true">
        <div className="gd-sheet-grip" />
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <p className="gd-t-md font-bold">숙달 지도 읽는 법</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ color: "var(--gd-ink-3)" }}
            aria-label="닫기"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="gd-scroll min-h-0 flex-1 px-5 pb-6">
          <p className="gd-prose-2 break-keep">
            개념마다 두 가지를 함께 봅니다.{" "}
            <strong style={{ color: "var(--gd-ink)" }}>배지</strong>는 개념 학습(레슨) 진행이고,{" "}
            <strong style={{ color: "var(--gd-ink)" }}>숫자는 0~100 드릴 숙달도</strong>입니다.
          </p>

          <p className="gd-label mb-1 mt-4">개념 학습</p>
          <div className="flex flex-col gap-1">
            {LESSON_ROWS.map(([k, desc]) => {
              const Ic = L[k].Icon;
              return (
                <div key={k} className="flex items-center gap-3 py-1.5">
                  <Ic size={18} strokeWidth={2} className="shrink-0" style={{ color: L[k].color }} />
                  <span className="gd-t-sm w-20 shrink-0 font-bold" style={{ color: L[k].color }}>
                    {L[k].label}
                  </span>
                  <span className="gd-t-xs break-keep" style={{ color: "var(--gd-ink-2)" }}>
                    {desc}
                  </span>
                </div>
              );
            })}
            <div className="flex items-center gap-3 py-1.5">
              <span className="shrink-0">
                <LowConfidenceBadge />
              </span>
              <span className="gd-t-xs break-keep" style={{ color: "var(--gd-ink-2)" }}>
                레슨 끝에서 스스로 &lsquo;자신 없다&rsquo;고 답한 개념입니다. 숙달도가 높아도 한 번
                더 봅니다.
              </span>
            </div>
          </div>

          <p className="gd-label mb-1 mt-4">드릴 숙달도</p>
          <div className="flex flex-col gap-1">
            {MASTERY_ROWS.map(([k, desc]) => {
              const Ic = M[k].Icon;
              return (
                <div key={k} className="flex items-center gap-3 py-1.5">
                  <Ic size={18} strokeWidth={2} className="shrink-0" style={{ color: M[k].color }} />
                  <span className="gd-t-sm w-20 shrink-0 font-bold" style={{ color: M[k].color }}>
                    {M[k].label}
                  </span>
                  <span className="gd-t-xs break-keep" style={{ color: "var(--gd-ink-2)" }}>
                    {desc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
