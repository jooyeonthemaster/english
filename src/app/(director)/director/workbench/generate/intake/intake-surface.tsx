"use client";

import { type ReactNode } from "react";
import { ClipboardPaste, FolderOpen, ImageUp } from "lucide-react";
import { MultiPassagePaste, type PastedPassageInput } from "./multi-passage-paste";

export type IntakeView = "intake" | "library";
export type IntakeTab = "paste" | "upload";

interface IntakeSurfaceProps {
  intakeView: IntakeView;
  setIntakeView: (v: IntakeView) => void;
  intakeTab: IntakeTab;
  setIntakeTab: (v: IntakeTab) => void;
  /** Count shown on the "내 지문 (N)" tab. */
  libraryCount: number;
  /** The existing PassageCardGrid, rendered as the "내 지문" library view. */
  library: ReactNode;
  /** Persist pasted rows → select. */
  onSubmitPastedRows: (
    rows: PastedPassageInput[],
  ) => boolean | void | Promise<boolean | void>;
  pasteSaving: boolean;
  /** Image/PDF extraction surface. Falls back to a placeholder. */
  upload?: ReactNode;
}

/**
 * Left-panel host for the generate page. A single tab row flattens intake +
 * library into one level: 직접 입력 · 이미지·PDF (add new) | 내 지문 (browse
 * existing). The library node is the unchanged PassageCardGrid.
 */
export function IntakeSurface({
  intakeView,
  setIntakeView,
  intakeTab,
  setIntakeTab,
  libraryCount,
  library,
  onSubmitPastedRows,
  pasteSaving,
  upload,
}: IntakeSurfaceProps) {
  const pasteActive = intakeView === "intake" && intakeTab === "paste";
  const uploadActive = intakeView === "intake" && intakeTab === "upload";
  const libraryActive = intakeView === "library";
  const controlRowClass =
    "flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-2.5";
  const controlLabelClass =
    "w-[64px] shrink-0 text-[11px] font-bold text-slate-600";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white">
      {/* Single tab row: 직접 입력 · 이미지·PDF | 내 지문 */}
      <div className={controlRowClass}>
        <span className={controlLabelClass}>입력 방식</span>
        <div className="flex min-w-0 items-center gap-1.5">
          <Tab
            active={pasteActive}
            onClick={() => {
              setIntakeView("intake");
              setIntakeTab("paste");
            }}
            icon={<ClipboardPaste className="h-3.5 w-3.5" />}
            label="직접 입력"
          />
          <Tab
            active={uploadActive}
            onClick={() => {
              setIntakeView("intake");
              setIntakeTab("upload");
            }}
            icon={<ImageUp className="h-3.5 w-3.5" />}
            label="이미지·PDF"
          />
          <span
            className="mx-1.5 h-5 w-px self-center bg-slate-200"
            aria-hidden="true"
          />
          <Tab
            active={libraryActive}
            onClick={() => setIntakeView("library")}
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            label={`내 지문 ${libraryCount > 0 ? `(${libraryCount})` : ""}`.trim()}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Upload stays mounted (hidden when inactive) so its in-flight extraction
            survives the auto-flip to 내 지문 right after 추출 시작. */}
        <div className={uploadActive ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          {upload ?? <UploadPlaceholder />}
        </div>
        {libraryActive ? (
          <div className="flex min-h-0 flex-1 flex-col">{library}</div>
        ) : pasteActive ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <MultiPassagePaste
              onSubmitRows={onSubmitPastedRows}
              saving={pasteSaving}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (active
          ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
          : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600")
      }
    >
      {icon}
      {label}
    </button>
  );
}

function UploadPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <ImageUp className="h-5 w-5" />
      </span>
      <p className="text-[13px] font-semibold text-slate-600">
        이미지·PDF에서 바로 추출
      </p>
      <p className="text-[11.5px] leading-relaxed text-slate-400">
        지문을 크롭·합성하고 필요하면 AI 원문 복원까지.
      </p>
    </div>
  );
}
