import Link from "next/link";
import { ArrowLeft, ClipboardList, Download, Loader2, Printer, Save } from "lucide-react";

interface BuilderHeaderBarProps {
  dirty: boolean;
  isPending: boolean;
  hasItems: boolean;
  onGoToManage: () => void;
  onPrint: () => void;
  onDownloadDocx: () => void;
  onSave: () => void;
}

export function BuilderHeaderBar({
  dirty,
  isPending,
  hasItems,
  onGoToManage,
  onPrint,
  onDownloadDocx,
  onSave,
}: BuilderHeaderBarProps) {
  return (
    <div className="no-print flex shrink-0 items-center gap-4 border-b border-slate-200/80 bg-white px-8 py-4">
      <Link
        href="/director/workbench"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 transition-all hover:border-slate-300 hover:bg-slate-50"
      >
        <ArrowLeft className="h-4.5 w-4.5 text-slate-600" />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50">
          <ClipboardList className="h-4.5 w-4.5 text-indigo-600" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[18px] font-bold tracking-tight text-slate-900">시험지 생성</h1>
          <p className="text-[12px] text-slate-400">
            문제 은행에서 고르고, 용지 미리보기에서 편집한 뒤 바로 저장합니다.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {dirty && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            저장 안 됨
          </span>
        )}
        <button
          onClick={onGoToManage}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          시험지 관리
        </button>
        <button
          onClick={onPrint}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          <Printer className="h-3.5 w-3.5" />
          인쇄
        </button>
        <button
          onClick={onDownloadDocx}
          disabled={isPending || !hasItems}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          DOCX
        </button>
        <button
          onClick={onSave}
          disabled={isPending || !hasItems}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[12px] font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          저장
        </button>
      </div>
    </div>
  );
}
