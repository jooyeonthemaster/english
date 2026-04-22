"use client";

import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  queueLength: number;
  pendingCount: number;
  doneCount: number;
  errorCount: number;
  onOpenImport: () => void;
}

export function Header({
  queueLength,
  pendingCount,
  doneCount,
  errorCount,
  onOpenImport,
}: HeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
      <div className="flex items-center gap-3">
        <Link href="/director/workbench/passages">
          <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            지문 등록
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            지문을 연속으로 등록하고, 백그라운드에서 AI 분석을 실행합니다
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Queue status badges */}
        {queueLength > 0 && (
          <div className="flex items-center gap-2 mr-2">
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-200">
                <Loader2 className="w-3 h-3 animate-spin" />
                분석 중 {pendingCount}
              </span>
            )}
            {doneCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                완료 {doneCount}
              </span>
            )}
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-200">
                <AlertTriangle className="w-3 h-3" />
                오류 {errorCount}
              </span>
            )}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenImport}
          className="h-9 text-[13px] gap-1.5"
        >
          <Upload className="w-3.5 h-3.5" />
          일괄 등록 (CSV/JSON)
        </Button>
      </div>
    </div>
  );
}
