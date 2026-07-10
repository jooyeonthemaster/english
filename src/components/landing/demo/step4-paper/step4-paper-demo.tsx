"use client";

// 랜딩 Step4 데모 — 워크벤치의 실제 시험지 미리보기 렌더러(PreviewPages)를 그대로
// 임베드한다. 문항을 빼고 다시 넣으면 실제 2단 조판이 즉시 재페이지네이션된다.
// 서버 액션 경로(ExamDetailPaperPreview·빌더 클라이언트)는 절대 import 하지 않는다.
import { useState } from "react";
import { FileDown, Plus, Printer, X } from "lucide-react";
import { PreviewPages } from "@/components/exams/exam-paper-builder-client-parts/preview-pages";
import { PrintStyles } from "@/components/exams/paper-builder/components/print-styles";
import { usePrintPortal } from "@/components/exams/paper-builder/hooks/use-print-portal";
import { EMPTY_ANSWER_KEY_LAYOUT } from "@/components/exams/paper-builder/answer-key-layout";
import { DEFAULT_PAPER_COVER } from "@/components/exams/paper-builder/types";
import type { DropPlacement } from "@/components/exams/paper-builder/types";
import { PREVIEW_PAGE_WIDTH } from "@/components/exams/paper-builder/constants";
import { DemoShell } from "../demo-shell";
import { DemoZoomControls } from "../demo-zoom-controls";
import { useDemoZoom } from "../use-demo-zoom";
import { DEMO_BUILDER_QUESTIONS } from "../fixtures/builder-questions";
import { useDemoPagination } from "./use-demo-pagination";

const noop = () => {};

const INITIAL_HEADER = {
  title: "실전 대비 모의고사",
  subtitle: "영어 영역 — SMOAT 데모",
  instructions: "",
  studentNameLabel: "이름",
};

export default function Step4PaperDemo() {
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

  // 시험지 헤더(제목/부제/안내문) — 실제 빌더처럼 클릭해 인라인 편집.
  const [header, setHeader] = useState(INITIAL_HEADER);
  const updateHeader = (patch: Partial<typeof INITIAL_HEADER>) =>
    setHeader((prev) => ({ ...prev, ...patch }));

  // PDF = 실제 빌더와 동일한 인쇄 포털 — 지금 편집한 시험지 그대로 인쇄(PDF 저장).
  usePrintPortal("A4");

  // PreviewPages 가 요구하는 상호작용 상태(활성 문항·드래그) — 로컬 소유.
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dragOverPartKey, setDragOverPartKey] = useState<string | null>(null);
  const [dragPlacement, setDragPlacement] = useState<DropPlacement>("after");

  // 기본값 = A4 한 장이 통째로 보이는 contain 맞춤. 우측 상단 컨트롤로 확대·축소.
  const zoomCtl = useDemoZoom(
    PREVIEW_PAGE_WIDTH,
    Math.round(PREVIEW_PAGE_WIDTH * (297 / 210)),
  );

  return (
    <DemoShell
      label="실제 조판 엔진 — 문항을 빼고 넣거나, 제목·발문을 클릭해 직접 고쳐보세요"
      onReset={() => {
        reset();
        setHeader(INITIAL_HEADER);
        setActiveItemId(null);
      }}
    >
      {/* 빠진 문항 복원 칩 */}
      {removed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-blue-50 bg-blue-50/40 px-4 py-2">
          <span className="text-[11.5px] font-bold text-slate-500">
            빠진 문항:
          </span>
          {removed.map((item) => (
            <button
              key={item.localId}
              type="button"
              onClick={() => restoreItem(item.localId)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-50"
            >
              <Plus className="size-3" aria-hidden="true" />
              {item.questionText.slice(0, 18)}…
            </button>
          ))}
        </div>
      ) : null}

      {/* 문항 토글 바 + 다운로드 — 실제 파일로 받아보기 */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-blue-50 px-4 py-2">
        <div className="order-last ml-auto flex shrink-0 items-center gap-1.5">
          <a
            href="/landing/demo/smoat-demo-exam.docx"
            download
            title="이 데모 시험지의 워드(DOCX) 파일 — 실제 내보내기 엔진으로 생성"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px] font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
          >
            <FileDown className="size-3.5" aria-hidden="true" />
            워드
          </a>
          <a
            href="/landing/demo/smoat-demo-exam.hwpx"
            download
            title="이 데모 시험지의 한글(HWPX) 파일 — 실제 내보내기 엔진으로 생성"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px] font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
          >
            <FileDown className="size-3.5" aria-hidden="true" />
            한글
          </a>
          <button
            type="button"
            onClick={() => {
              // 같은 페이지의 리포트 print CSS(@page margin 12mm)가 시험지 인쇄의
              // margin 0 을 덮지 않도록, 인쇄 동안만 최우선 @page 규칙을 주입한다.
              const style = document.createElement("style");
              style.textContent = "@page{size:210mm 297mm;margin:0}";
              document.body.appendChild(style);
              window.addEventListener("afterprint", () => style.remove(), {
                once: true,
              });
              window.print();
            }}
            title="지금 화면의 시험지를 그대로 인쇄(PDF 저장) — 편집 내용 반영"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11.5px] font-bold text-blue-700 transition hover:bg-blue-100"
          >
            <Printer className="size-3.5" aria-hidden="true" />
            PDF
          </button>
        </div>
        {items.map((item) => (
          <span
            key={item.localId}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-[11px] font-bold text-slate-600"
          >
            {item.orderNum}. {item.sourceQuestion.subType === "TITLE"
              ? "제목"
              : item.sourceQuestion.subType === "TOPIC"
                ? "주제"
                : item.sourceQuestion.subType === "MAIN_IDEA"
                  ? "요지"
                  : "내용일치"}
            <button
              type="button"
              onClick={() => removeItem(item.localId)}
              aria-label={`${item.orderNum}번 문항 빼기`}
              className="inline-flex size-4 cursor-pointer items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        {items.length === 0 ? (
          <span className="text-[12px] font-medium text-slate-400">
            모든 문항을 뺐어요 — 위 칩으로 다시 넣어보세요
          </span>
        ) : null}
      </div>

      {/* 실제 A4 조판 미리보기 (스크롤 영역).
          flex-1 금지 — basis 가 height 를 눌러 컨테이너가 콘텐츠 높이로 자란다.
          id=exam-paper-print-root — usePrintPortal 이 인쇄 시 body 포털로 옮겨
          실제 빌더와 동일하게 A4 물리 용지에 1:1 인쇄한다. */}
      <PrintStyles paperSize="A4" />
      <div className="relative min-h-0">
        <DemoZoomControls ctl={zoomCtl} />
        <div
          id="exam-paper-print-root"
          ref={zoomCtl.scrollerRef}
          className="min-h-0 overflow-auto bg-slate-100/70 px-3 py-4"
          style={{ height: "var(--demo-h, max(360px, calc(100svh - 344px)))" }}
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
    </DemoShell>
  );
}
