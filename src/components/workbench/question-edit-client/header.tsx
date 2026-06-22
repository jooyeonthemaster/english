// @ts-nocheck
"use client";

import React from "react";
import {
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DIFFICULTY_OPTIONS, TYPE_OPTIONS } from "./constants";
import { EditViewToggle } from "./edit-view-toggle";
import { QUESTION_TYPE_META } from "@/lib/question-schemas";

interface Props {
  isModal: boolean;
  onClose?: () => void;
  /** 상세 보기에서 들어온 경우에만 전달 — 좌측 상단에 '뒤로' 버튼을 노출한다. */
  onBack?: () => void;
  approved: boolean;
  aiGenerated: boolean;
  type: string;
  setType: (v: string) => void;
  subType: string;
  setSubType: (v: string) => void;
  difficulty: string;
  setDifficulty: (v: string) => void;
  onDelete: () => void;
  onApprove: () => void;
  onUnapprove?: () => void;
  onSave: () => void;
  saving: boolean;
  deleting: boolean;
  /** AI 문제 수정 오버레이 열기 — 전달되면 헤더에 눈에 띄는 진입 버튼 노출. */
  onOpenAiEdit?: () => void;
}

export function EditHeader({
  isModal,
  onClose,
  onBack,
  approved,
  aiGenerated,
  type,
  setType,
  subType,
  setSubType,
  difficulty,
  setDifficulty,
  onDelete,
  onApprove,
  onUnapprove,
  onSave,
  saving,
  deleting,
  onOpenAiEdit,
}: Props) {
  const diffConfig = DIFFICULTY_OPTIONS.find((d) => d.value === difficulty);
  // AI 수정 헤더와 동일한 유형 뱃지(예: 빈칸추론) — subType → 유형 라벨.
  const typeLabel = (subType && QUESTION_TYPE_META[subType]?.label) || subType || "";

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white shrink-0">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="상세로 돌아가기"
            title="상세로 돌아가기"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
          >
            <ArrowLeft className="w-4 h-4" />
            뒤로
          </button>
        )}
        <span className="text-[17px] font-bold tracking-tight text-slate-900">문제 수정</span>
        {/* 토글 — AI 수정 헤더와 동일 위치(타이틀 바로 옆)에 고정: 뷰 전환 시 위치가 바뀌지 않도록 뱃지보다 앞에 둔다. */}
        {onOpenAiEdit && (
          <EditViewToggle active="manual" onAi={onOpenAiEdit} onManual={() => {}} />
        )}
        {typeLabel && (
          <span className="inline-flex shrink-0 items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[12px] font-semibold text-blue-700">
            {typeLabel}
          </span>
        )}
        {aiGenerated && (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold border px-2.5 py-1 rounded-md border-sky-200 bg-sky-50 text-sky-700">
            <svg
              viewBox="0 0 24 24"
              className="w-3.5 h-3.5"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M8 8.5A5 5 0 0 1 11.5 5.7" />
            </svg>
            일반 생성
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-[104px] text-[13px] font-medium"><SelectValue /></SelectTrigger>
          <SelectContent>{TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
        <Input value={subType} onChange={(e) => setSubType(e.target.value)} placeholder="세부유형" className="h-9 w-[140px] text-[13px]" />
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger className={`h-7! w-[88px] text-[13px] font-semibold ${diffConfig?.color || ""}`}><SelectValue /></SelectTrigger>
          <SelectContent>{DIFFICULTY_OPTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-px bg-slate-200" />
        <Button className="bg-blue-600 hover:bg-blue-700 h-7 text-[11px] px-3 font-semibold shadow-sm" size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}저장
        </Button>
        <Button variant="ghost" size="sm" className="border border-red-200 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-300 h-7 text-[11px] px-2.5 font-semibold" onClick={onDelete} disabled={deleting}>
          <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
        </Button>
        {/* 닫기 버튼 — 저장 버튼과 충분한 거리를 두어 오클릭을 방지 */}
        <div className="h-5 w-px bg-slate-200 ml-3" />
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          title="닫기"
          className="w-7 h-7 ml-2 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
