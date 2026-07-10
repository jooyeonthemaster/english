"use client";

// 랜딩 Step1 데모 — 워크벤치의 실제 크롭 보드(InlineCropBoard)를 그대로 임베드한다.
// 방문자가 샘플 교재 페이지에서 지문 영역을 실제로 드래그해 잘라 보고, '추출하기'를
// 누르면 미리 준비된 추출 결과(같은 지문 텍스트)가 나타난다. 서버 업로드·AI 호출 없음
// (buildPassageSlots 미호출 — 추출은 canned).
import { useEffect, useRef, useState } from "react";
import { Loader2, ScanText, Undo2, Wand2 } from "lucide-react";
import {
  InlineCropBoard,
  type InlineCropBoardCounts,
} from "@/app/(director)/director/workbench/passages/import/_components/intake/crop/inline-crop-board";
import type { ClientPageSlot } from "@/lib/extraction/types";
import { DemoShell } from "../demo-shell";
import { DEMO_PASSAGE } from "../fixtures/passage";
import { createSampleSlots } from "./sample-slots";

const EMPTY_COUNTS: InlineCropBoardCounts = {
  regionCount: 0,
  passageCount: 0,
  uncroppedCount: 0,
  totalPassages: 0,
};

type Phase = "crop" | "extracting" | "done";

export default function Step1CropDemo() {
  const [slots, setSlots] = useState<ClientPageSlot[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [counts, setCounts] = useState<InlineCropBoardCounts>(EMPTY_COUNTS);
  const [phase, setPhase] = useState<Phase>("crop");
  const [boardKey, setBoardKey] = useState(0);
  const [addNotice, setAddNotice] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    createSampleSlots()
      .then((created) => {
        if (!cancelled) setSlots(created);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [boardKey]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const startExtract = () => {
    if (counts.totalPassages <= 0 || phase !== "crop") return;
    setPhase("extracting");
    timerRef.current = window.setTimeout(() => setPhase("done"), 1200);
  };

  const reset = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setPhase("crop");
    setCounts(EMPTY_COUNTS);
    setSlots(null);
    setBoardKey((k) => k + 1);
  };

  const showAddNotice = () => {
    setAddNotice(true);
    window.setTimeout(() => setAddNotice(false), 3200);
  };

  return (
    <DemoShell
      label="실제 크롭 도구 — 지문 영역을 드래그해 잘라보세요"
      onReset={reset}
    >
      {addNotice ? (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[12px] font-semibold text-amber-700">
          데모는 예시 페이지로 진행돼요 — 내 교재·PDF는 가입 후 바로 올릴 수 있어요.
        </div>
      ) : null}

      <div
        className="relative flex min-h-0 flex-col"
        style={{ height: "var(--demo-h, max(400px, calc(100svh - 270px)))" }}
      >
        {phase === "done" ? (
          // ── 추출 결과 패널 ──
          <div className="min-h-0 flex-1 overflow-y-auto bg-white p-5">
            <div className="mx-auto max-w-[720px]">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                  <ScanText className="size-3.5" aria-hidden="true" />
                  텍스트 추출 완료
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200">
                  <Wand2 className="size-3.5" aria-hidden="true" />
                  잘린 문장 AI 복원
                </span>
              </div>
              <h4 className="text-[16px] font-extrabold text-slate-900">
                {DEMO_PASSAGE.title}
              </h4>
              <p className="mt-3 text-[14px] leading-[1.8] text-slate-700">
                {DEMO_PASSAGE.text.slice(0, DEMO_PASSAGE.text.lastIndexOf("Which instigates"))}
                <mark className="rounded bg-blue-100/80 px-1 py-0.5 text-blue-900">
                  {DEMO_PASSAGE.text.slice(DEMO_PASSAGE.text.lastIndexOf("Which instigates"))}
                </mark>
              </p>
              <p className="mt-2 text-[11.5px] font-medium text-slate-400">
                <mark className="rounded bg-blue-100/80 px-1">파란 부분</mark>은
                페이지 경계에서 잘렸던 문장을 AI가 이어 복원한 구간입니다.
              </p>
              <button
                type="button"
                onClick={reset}
                className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <Undo2 className="size-3.5" aria-hidden="true" />
                다시 크롭하기
              </button>
            </div>
          </div>
        ) : slots === null ? (
          <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50">
            {loadError ? (
              <p className="text-[13px] font-semibold text-slate-400">
                샘플 페이지를 준비하지 못했어요 — 새로고침 후 다시 시도해 주세요.
              </p>
            ) : (
              <Loader2 className="size-6 animate-spin text-blue-400" aria-hidden="true" />
            )}
          </div>
        ) : (
          <div className="smoat-crop-demo min-h-0 flex-1">
            {/* 데모 전용 정리 — 워크벤치 크롭보드 자체는 건드리지 않고, 데모 문맥에서
                불필요한 안내/부가 UI(파일 추가·패널폭 핸들·합치기 힌트 문구)만 숨긴다. */}
            <style>{`
              .smoat-crop-demo button[aria-label="검수 패널 폭 조절"] { display: none; }
              .smoat-crop-demo div:has(> label input[type="file"]) { display: none; }
              .smoat-crop-demo aside span.leading-snug { display: none; }
              /* 문제·선지/Shift 코치 팝오버 — 데모 라벨과 중복되는 설명이라 숨김 */
              .smoat-crop-demo div[role="status"] { display: none; }
            `}</style>
            <InlineCropBoard
              key={boardKey}
              images={slots}
              onAddFiles={showAddNotice}
              onRemoveImage={() => showAddNotice()}
              onReorderImages={() => {}}
              maxPassages={4}
              onCountChange={setCounts}
              outputMode="restored"
              footer={
                <button
                  type="button"
                  onClick={startExtract}
                  aria-disabled={counts.totalPassages <= 0 || phase === "extracting"}
                  className={
                    "flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[13.5px] font-bold transition " +
                    (counts.totalPassages > 0 && phase !== "extracting"
                      ? "cursor-pointer bg-blue-600 text-white hover:bg-blue-700"
                      : "cursor-not-allowed bg-slate-100 text-slate-400")
                  }
                >
                  {phase === "extracting" ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      추출 중…
                    </>
                  ) : counts.totalPassages > 0 ? (
                    <>
                      <ScanText className="size-4" aria-hidden="true" />
                      지문 {counts.totalPassages}개 추출하기
                    </>
                  ) : (
                    "지문 영역을 드래그하세요"
                  )}
                </button>
              }
            />
          </div>
        )}
      </div>
    </DemoShell>
  );
}
