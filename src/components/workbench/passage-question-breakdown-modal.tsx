"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FileText, Loader2, Copy, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getPassageQuestionTypeBreakdown,
  type PassageQuestionTypeBreakdown,
} from "@/actions/workbench";
import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";

interface PassageQuestionBreakdownModalProps {
  open: boolean;
  onClose: () => void;
  passageId: string;
  passageTitle: string;
}

function labelForSubType(subType: string): string {
  if (subType === "UNKNOWN") return "기타";
  return QUESTION_TYPE_UI[subType]?.label ?? subType;
}

/** 한 섹션(유형 지정 / 커스텀 유형 / 동형)의 행 묶음 */
function BreakdownSection({
  icon,
  title,
  accent,
  rows,
}: {
  icon: ReactNode;
  title: string;
  accent: string;
  rows: Array<{ key: string; label: string; count: number }>;
}) {
  if (rows.length === 0) return null;
  const sectionTotal = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className={`flex items-center gap-1.5 text-[12px] font-bold ${accent}`}>
          {icon}
          {title}
        </div>
        <span className="text-[11px] font-semibold text-slate-400">
          {sectionTotal}문제
        </span>
      </div>
      <div className="divide-y divide-slate-50">
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex items-center justify-between px-3 py-1.5"
          >
            <span className="min-w-0 truncate text-[12px] text-slate-700">
              {r.label}
            </span>
            <span className="ml-2 shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
              {r.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PassageQuestionBreakdownModal({
  open,
  onClose,
  passageId,
  passageTitle,
}: PassageQuestionBreakdownModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PassageQuestionTypeBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !passageId) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const res = await getPassageQuestionTypeBreakdown(passageId);
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setError("문제 현황을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, passageId]);

  const typeRows =
    data?.typeSpecified.map((t) => ({
      key: t.subType,
      label: labelForSubType(t.subType),
      count: t.count,
    })) ?? [];
  const customRows =
    data?.custom.map((c) => ({
      key: c.customTypeId,
      label: c.name,
      count: c.count,
    })) ?? [];
  const similarRows =
    data && data.similarCount > 0
      ? [{ key: "__similar__", label: "동형", count: data.similarCount }]
      : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-sm gap-3">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <FileText className="h-4 w-4 text-indigo-600" />
            생성된 문제 현황
          </DialogTitle>
          <p className="truncate text-[12px] text-slate-500">{passageTitle}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-[12px] text-rose-500">
            {error}
          </div>
        ) : !data || data.total === 0 ? (
          <div className="py-8 text-center text-[12px] text-slate-400">
            아직 생성된 문제가 없습니다.
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2">
              <span className="text-[12px] font-semibold text-indigo-700">
                총 문제
              </span>
              <span className="text-[14px] font-bold tabular-nums text-indigo-700">
                {data.total}개
              </span>
            </div>

            <BreakdownSection
              icon={<FileText className="h-3.5 w-3.5" />}
              title="유형 지정"
              accent="text-slate-700"
              rows={typeRows}
            />
            <BreakdownSection
              icon={<Sparkles className="h-3.5 w-3.5" />}
              title="커스텀 유형"
              accent="text-violet-600"
              rows={customRows}
            />
            <BreakdownSection
              icon={<Copy className="h-3.5 w-3.5" />}
              title="동형"
              accent="text-emerald-600"
              rows={similarRows}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
