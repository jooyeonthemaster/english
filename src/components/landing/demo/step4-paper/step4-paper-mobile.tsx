"use client";

// 랜딩 Step4(시험지) 모바일 시트 데모 — PC 와 같은 조판 엔진(useDemoPagination +
// PreviewPages)을 쓰되, ①문항 구성 → ②미리보기 → ③다운로드 3스텝으로 나눈다.
// 서버 액션 경로는 임포트하지 않는다(전부 canned/클라이언트).
import { useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Plus, Printer, X } from "lucide-react";
import { PreviewPages } from "@/components/exams/exam-paper-builder-client-parts/preview-pages";
import { PrintStyles } from "@/components/exams/paper-builder/components/print-styles";
import { usePrintPortal } from "@/components/exams/paper-builder/hooks/use-print-portal";
import { EMPTY_ANSWER_KEY_LAYOUT } from "@/components/exams/paper-builder/answer-key-layout";
import { DEFAULT_PAPER_COVER } from "@/components/exams/paper-builder/types";
import type { DropPlacement } from "@/components/exams/paper-builder/types";
import { PREVIEW_PAGE_WIDTH } from "@/components/exams/paper-builder/constants";
import {
  MobileStepHeader,
  type MobileFlowStep,
} from "@/components/workbench/mobile-step-flow";
import { DemoShell } from "../demo-shell";
import { DemoZoomControls } from "../demo-zoom-controls";
import { useDemoZoom } from "../use-demo-zoom";
import { DEMO_BUILDER_QUESTIONS } from "../fixtures/builder-questions";
import { useDemoPagination } from "./use-demo-pagination";

const noop = () => {};
const STEPS: MobileFlowStep[] = [
  { key: "compose", label: "구성 · 미리보기" },
  { key: "download", label: "다운로드" },
];
const INITIAL_HEADER = {
  title: "실전 대비 모의고사",
  subtitle: "영어 영역 — SMOAT 데모",
  instructions: "",
  studentNameLabel: "이름",
};

const SUBTYPE_LABEL: Record<string, string> = {
  TITLE: "제목",
  TOPIC: "주제",
  MAIN_IDEA: "요지",
};

export default function Step4PaperMobileDemo() {
  const {
    items,
    removed,
    pages,
    overflowItemIds,
    singlePageHeight,
    previewContentHeight,
    removeItem,
    restoreItem,
    updateItem,
    updateGroupPassage,
    moveItemToDropTarget,
    reset,
  } = useDemoPagination(DEMO_BUILDER_QUESTIONS);

  const [stepKey, setStepKey] = useState("compose");
  const [header, setHeader] = useState(INITIAL_HEADER);
  const updateHeader = (patch: Partial<typeof INITIAL_HEADER>) =>
    setHeader((prev) => ({ ...prev, ...patch }));

  usePrintPortal("A4");

  // PreviewPages 상호작용 상태(드래그는 모바일 미사용 — 로컬 소유).
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragOverPartKey, setDragOverPartKey] = useState<string | null>(null);
  const [dragPlacement, setDragPlacement] = useState<DropPlacement>("after");

  // 시트 안 → 폭 맞춤. A4 세로비를 넘겨도 시트에선 폭 기준으로만 맞춘다.
  const zoomCtl = useDemoZoom(
    PREVIEW_PAGE_WIDTH,
    Math.round(PREVIEW_PAGE_WIDTH * (297 / 210)),
  );

  const resetAll = () => {
    reset();
    setHeader(INITIAL_HEADER);
    setActiveItemId(null);
    setStepKey("compose");
  };

  return (
    <DemoShell label="문항을 빼고 넣으면 즉시 재조판됩니다" onReset={resetAll}>
      <PrintStyles paperSize="A4" />
      <div className="flex h-full min-h-0 flex-col bg-slate-50/60">
        <div className="shrink-0 px-3 pt-3">
          <MobileStepHeader
            steps={STEPS}
            currentKey={stepKey}
            onSelect={setStepKey}
          />
        </div>

        {/* ── ① 문항 구성 + 미리보기 (한 화면) ── */}
        {stepKey === "compose" ? (
          <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
            <label className="mb-3 block">
              <span className="mb-1 block text-[12px] font-bold text-slate-500">
                시험지 제목
              </span>
              <input
                value={header.title}
                onChange={(e) => updateHeader({ title: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="시험지 제목"
              />
            </label>

            <p className="mb-1.5 text-[12px] font-bold text-slate-500">
              담긴 문항 · 탭하면 빼기 — 아래 미리보기가 즉시 재조판됩니다
            </p>
            <div className="flex flex-wrap gap-1.5">
              {items.map((item) => (
                <button
                  key={item.localId}
                  type="button"
                  onClick={() => removeItem(item.localId)}
                  className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-2.5 pr-1.5 text-[12px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200"
                >
                  {item.orderNum}. {SUBTYPE_LABEL[item.sourceQuestion.subType ?? ""] ?? "내용일치"}
                  <X className="size-3.5 text-slate-400" aria-hidden="true" />
                </button>
              ))}
              {items.length === 0 ? (
                <span className="text-[12px] font-medium text-slate-400">
                  모든 문항을 뺐어요 — 아래에서 다시 넣어보세요
                </span>
              ) : null}
              {removed.map((item) => (
                <button
                  key={item.localId}
                  type="button"
                  onClick={() => restoreItem(item.localId)}
                  title={item.questionText}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-1 pl-1.5 pr-2.5 text-[12px] font-bold text-blue-700"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  {SUBTYPE_LABEL[item.sourceQuestion.subType ?? ""] ?? "내용일치"} 넣기
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* ── 미리보기 (항상 마운트: 다운로드 스텝에서 인쇄해도 내용이 있도록.
            usePrintPortal 이 인쇄 시 #exam-paper-print-root 를 body 포털로 옮긴다) */}
        <div
          className={
            "relative min-h-0 flex-1 " + (stepKey === "compose" ? "" : "hidden")
          }
        >
            <DemoZoomControls ctl={zoomCtl} />
            <div
              id="exam-paper-print-root"
              ref={zoomCtl.scrollerRef}
              className="h-full min-h-0 overflow-auto bg-slate-100/70 px-3 py-4"
            >
              <PreviewPages
                paperItems={items}
                paperPages={pages}
                overflowItemIds={overflowItemIds}
                previewBaseWidth={PREVIEW_PAGE_WIDTH}
                previewZoom={zoomCtl.zoom}
                previewContentHeight={previewContentHeight}
                singlePageHeight={singlePageHeight}
                title={header.title}
                subtitle={header.subtitle}
                instructions={header.instructions}
                studentNameLabel={header.studentNameLabel}
                academyLogoDataUrl={null}
                template="clean"
                columns={2}
                density="comfortable"
                passageStyle="plain"
                showAnswerSpace
                showPassageTitle
                showQuestionMeta={false}
                paperSize="A4"
                cover={DEFAULT_PAPER_COVER}
                updateCover={noop}
                activeItemId={activeItemId}
                setActiveItemId={setActiveItemId}
                lineCaret={null}
                setLineCaret={noop}
                updateHeader={updateHeader}
                updateItem={updateItem}
                updateGroupPassage={updateGroupPassage}
                moveItemToDropTarget={moveItemToDropTarget}
                removeItem={removeItem}
                ungroupItem={noop}
                regroupByPassage={noop}
                tryToggleKeepWithPrev={noop}
                draggingItemId={draggingItemId}
                setDraggingItemId={setDraggingItemId}
                dragOverItemId={dragOverItemId}
                setDragOverItemId={setDragOverItemId}
                dragOverPartKey={dragOverPartKey}
                setDragOverPartKey={setDragOverPartKey}
                dragPlacement={dragPlacement}
                setDragPlacement={setDragPlacement}
                schools={[]}
                classes={[]}
                schoolId=""
                classId=""
                examDate=""
                readOnly={false}
                answerKey={EMPTY_ANSWER_KEY_LAYOUT}
              />
            </div>
        </div>

        {/* ── ③ 다운로드 ── */}
        {stepKey === "download" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <p className="mb-1 text-[15px] font-black text-slate-900">
              지금 이 시험지를 파일로 받기
            </p>
            <p className="mb-4 text-[13px] text-slate-500">
              실제 내보내기 엔진으로 생성된 파일입니다.
            </p>
            <div className="flex flex-col gap-2.5">
              <a
                href="/landing/demo/smoat-demo-exam.docx"
                download
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-[14px] font-bold text-slate-700"
              >
                <FileDown className="size-4" aria-hidden="true" />
                워드(DOCX) 내려받기
              </a>
              <a
                href="/landing/demo/smoat-demo-exam.hwpx"
                download
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-[14px] font-bold text-slate-700"
              >
                <FileDown className="size-4" aria-hidden="true" />
                한글(HWPX) 내려받기
              </a>
              <button
                type="button"
                onClick={() => {
                  const style = document.createElement("style");
                  style.textContent = "@page{size:210mm 297mm;margin:0}";
                  document.body.appendChild(style);
                  window.addEventListener("afterprint", () => style.remove(), {
                    once: true,
                  });
                  window.print();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-[14px] font-bold text-white"
              >
                <Printer className="size-4" aria-hidden="true" />
                PDF로 인쇄 / 저장
              </button>
            </div>
          </div>
        ) : null}

        {/* 하단 고정 이동 바 — 파란 '다음으로' CTA (마지막 스텝은 이전만) */}
        <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
          {stepKey === "compose" ? (
            <button
              type="button"
              onClick={() => setStepKey("download")}
              className="inline-flex h-11 w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 text-[13.5px] font-bold text-white transition active:scale-[0.99]"
            >
              다음으로 — 파일로 받기
              <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepKey("compose")}
              className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              구성 · 미리보기
            </button>
          )}
        </div>
      </div>
    </DemoShell>
  );
}
