"use client";

// 화면 아무 데나 파일을 끌어 오면 — 「원하는 칸에 놓으세요!」 세 칸이 화면을 꽉 채운다. 놓으면 그 칸에 바로 올라간다.
// 칸 밖에 놓으면 브라우저가 파일을 열어 페이지를 떠나므로, 창 전체의 dragover/drop 막기는 덮개를 못 띄울 때(DB 창·접수 뒤)도 늘 건다.

import { useEffect, useRef, useState, type DragEvent } from "react";
import { FF_SLOTS, type FfSlotKey } from "@/lib/free-forecast/constants";
import s from "./free-forecast.module.css";
import u from "./ff-upload.module.css";

const hasFiles = (e: globalThis.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function FfDropOverlay({ onFiles, disabled }: { onFiles: (slot: FfSlotKey, list: FileList) => void; disabled: boolean }) {
  const [show, setShow] = useState(false);
  const [hover, setHover] = useState<FfSlotKey | null>(null);
  const depth = useRef(0);
  const watchdog = useRef<number | null>(null);

  // ① 늘: 칸 밖 드롭으로 페이지를 떠나지 않게
  useEffect(() => {
    const over = (e: globalThis.DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: globalThis.DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  // ② 덮개 — 끌어 오는 동안만. dragleave 없이 끝나는 드래그도 있어 감시 타이머·blur·Esc·클릭으로도 닫는다.
  //    감시 1500ms — 커서를 멈춘 드래그는 dragover 가 350±200ms 간격으로만 와서, 450ms 면 커서 밑에서 덮개가 사라져 놓은 파일이 버려졌다(2차 검수)
  useEffect(() => {
    if (disabled) return;
    const close = () => {
      depth.current = 0;
      setShow(false);
      setHover(null);
    };
    const arm = () => {
      if (watchdog.current) window.clearTimeout(watchdog.current);
      watchdog.current = window.setTimeout(close, 1500);
    };
    const enter = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setShow(true);
      arm();
    };
    const leave = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) close();
    };
    const over = (e: globalThis.DragEvent) => {
      if (hasFiles(e)) arm();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", close);
    window.addEventListener("keydown", esc);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", close);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("blur", close);
      if (watchdog.current) window.clearTimeout(watchdog.current);
    };
  }, [disabled]);

  if (!show || disabled) return null;
  const dismiss = () => {
    depth.current = 0;
    setShow(false);
    setHover(null);
  };
  return (
    <div className={`${u.overlay} flex flex-col p-[clamp(12px,2vw,40px)]`} role="dialog" aria-label="파일을 넣을 칸 고르기" onClick={dismiss}>
      <p className={`${s.display} text-center text-[clamp(28px,4vw,96px)] text-white`}>
        원하는 칸에 <span className="text-[var(--ff-yellow)]">놓으세요!</span>
      </p>
      <p className={`${s.tSmall} mt-[8px] text-center font-bold text-[var(--ff-dim)]`}>Esc · 바깥 클릭으로 닫기</p>
      <div className="mt-[clamp(14px,2vw,40px)] grid min-h-0 flex-1 grid-cols-1 gap-[clamp(10px,1.4vw,28px)] sm:grid-cols-3">
        {FF_SLOTS.map((d) => (
          <div
            key={d.key}
            onClick={(e) => e.stopPropagation()}
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setHover(d.key);
            }}
            onDragLeave={() => setHover((h) => (h === d.key ? null : h))}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              e.stopPropagation();
              dismiss();
              if (e.dataTransfer.files?.length) onFiles(d.key, e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center rounded-[var(--radius)] border-[length:var(--bw)] border-dashed p-[16px] text-center transition-colors ${
              hover === d.key ? "border-black bg-[var(--ff-yellow)] text-[var(--ff-ink)]" : "border-[var(--ff-yellow)] bg-white/5 text-white"
            }`}
          >
            <span className={`${s.display} text-[clamp(56px,7vw,180px)] ${hover === d.key ? "text-[var(--ff-red-ink)]" : "text-[var(--ff-yellow)]"}`}>{d.no}</span>
            <span className={`${s.display} mt-[0.3em] text-[clamp(22px,2.4vw,60px)] ${s.lhTight}`}>{d.title}</span>
            <span className={`${s.tSmall} mt-[8px] font-black`}>여기에 놓기</span>
          </div>
        ))}
      </div>
    </div>
  );
}
