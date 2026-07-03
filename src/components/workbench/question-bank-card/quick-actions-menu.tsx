"use client";

// 문제 카드 하단 날짜줄 오른쪽의 "내보내기" 트리거(⋯) → 액션 매트릭스 팝오버.
//   행: 복사 / 한글(HWP) / 워드(Word)   ×   열: 문제 / 문제＋해설
// 각 칸이 하나의 액션(6개). 복사는 즉시 클립보드, 한글·워드는 단일 문항 export API 다운로드.
// 카드의 클릭/선택·드래그와 충돌하지 않도록 트리거·콘텐츠 모두 이벤트 전파를 막고
// data-*-ignore 를 단다(카드 클릭 핸들러의 shouldIgnoreCardSelectionClick 게이트와 호환).

import React, { useState } from "react";
import { MoreHorizontal, Copy, Download, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { QuestionBankItem } from "./types";
import {
  buildQuestionClipboardText,
  buildQuestionClipboardHtml,
} from "./build-clipboard-text";

type Variant = "question" | "full"; // 문제만 / 문제＋해설
type Row = "copy" | "hwpx" | "docx";
type CellKey = `${Row}:${Variant}`;
type CellState = "idle" | "busy" | "done";

const COLUMNS: { key: Variant; label: string }[] = [
  { key: "question", label: "문제" },
  { key: "full", label: "문제＋해설" },
];

const ROWS: { key: Row; label: string }[] = [
  { key: "copy", label: "복사" },
  { key: "hwpx", label: "한글(HWP)" },
  { key: "docx", label: "워드(Word)" },
];

// Content-Disposition: attachment; filename*=UTF-8''<encoded> → 원본 파일명 복원.
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      return null;
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain?.[1] ?? null;
}

// 서식(볼드·밑줄) 유지 복사 — text/html + text/plain 을 함께 실어 한글/워드 붙여넣기에
// 서식이 유지되게 한다. ClipboardItem 미지원 환경은 평문으로 폴백한다.
async function copyRich(text: string, html: string): Promise<void> {
  if (
    typeof ClipboardItem !== "undefined" &&
    navigator.clipboard?.write
  ) {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // 비보안 컨텍스트 폴백 — 서식 유지(contenteditable) + execCommand.
  const holder = document.createElement("div");
  holder.setAttribute("contenteditable", "true");
  holder.style.position = "fixed";
  holder.style.opacity = "0";
  holder.style.pointerEvents = "none";
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  document.execCommand("copy");
  sel?.removeAllRanges();
  holder.remove();
}

async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const blob = await res.blob();
  const name =
    filenameFromDisposition(res.headers.get("content-disposition")) ||
    fallbackName;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function QuestionQuickActionsMenu({ q }: { q: QuestionBankItem }) {
  // 칸별 독립 상태(cell 키 → state) — 동시에 여러 칸이 진행/완료 표시를 가질 수 있어,
  // 한 다운로드의 완료 플래시가 아직 진행 중인 다른 다운로드의 busy(비활성)를 지우지 않는다.
  const [states, setStates] = useState<Partial<Record<CellKey, CellState>>>({});

  const cellState = (cell: CellKey): CellState => states[cell] ?? "idle";

  const setCell = (cell: CellKey, state: CellState) =>
    setStates((prev) => ({ ...prev, [cell]: state }));

  const clearCell = (cell: CellKey) =>
    setStates((prev) => {
      if (!(cell in prev)) return prev;
      const next = { ...prev };
      delete next[cell];
      return next;
    });

  const flash = (cell: CellKey) => {
    setCell(cell, "done");
    window.setTimeout(() => clearCell(cell), 1400);
  };

  const runCopy = async (variant: Variant) => {
    const cell: CellKey = `copy:${variant}`;
    const includeAnswer = variant === "full";
    try {
      const text = buildQuestionClipboardText(q, { includeAnswer });
      if (!text) {
        toast.error("복사할 내용이 없습니다.");
        return;
      }
      const html = buildQuestionClipboardHtml(q, { includeAnswer });
      await copyRich(text, html);
      flash(cell);
      toast.success(
        includeAnswer ? "문제＋해설을 복사했습니다." : "문제를 복사했습니다.",
      );
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  };

  const runDownload = async (row: "hwpx" | "docx", variant: Variant) => {
    const cell: CellKey = `${row}:${variant}`;
    const includeAnswer = variant === "full";
    setCell(cell, "busy");
    try {
      const url = `/api/questions/${q.id}/export-${row}?answers=${includeAnswer}`;
      const ext = row === "hwpx" ? "hwpx" : "docx";
      await downloadFile(url, `문항${includeAnswer ? "_정답포함" : ""}.${ext}`);
      flash(cell);
    } catch {
      clearCell(cell);
      toast.error("다운로드에 실패했습니다.");
    }
  };

  const handleCell = (row: Row, variant: Variant) => {
    if (row === "copy") void runCopy(variant);
    else void runDownload(row, variant);
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-card-click-ignore="true"
          data-drag-select-ignore="true"
          onClick={stop}
          aria-label="복사·다운로드"
          title="복사·다운로드"
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={6}
        collisionPadding={12}
        onClick={stop}
        data-card-click-ignore="true"
        className="w-60 p-2.5"
      >
        <p className="mb-2 px-0.5 text-[11px] font-semibold text-slate-500">
          내보내기
        </p>
        <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-1.5 gap-y-1.5">
          {/* 열 헤더 */}
          <span aria-hidden="true" />
          {COLUMNS.map((col) => (
            <span
              key={col.key}
              className="text-center text-[10px] font-semibold text-slate-400"
            >
              {col.label}
            </span>
          ))}

          {/* 행 */}
          {ROWS.map((row) => (
            <React.Fragment key={row.key}>
              <span className="whitespace-nowrap pr-1 text-[11px] font-semibold text-slate-600">
                {row.label}
              </span>
              {COLUMNS.map((col) => {
                const state = cellState(`${row.key}:${col.key}`);
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => handleCell(row.key, col.key)}
                    disabled={state === "busy"}
                    title={`${col.label} ${row.key === "copy" ? "복사" : "다운로드"}`}
                    aria-label={`${col.label} ${row.label} ${row.key === "copy" ? "복사" : "다운로드"}`}
                    className="flex h-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {state === "done" ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : state === "busy" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : row.key === "copy" ? (
                      <Copy className="size-3.5" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
