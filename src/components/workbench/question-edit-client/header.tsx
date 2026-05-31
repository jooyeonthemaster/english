// @ts-nocheck
"use client";

import React from "react";
import {
  CheckCircle2,
  Layers,
  Loader2,
  Save,
  Trash2,
  X,
  XCircle,
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

interface Props {
  isModal: boolean;
  onClose?: () => void;
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
  onSave: () => void;
  saving: boolean;
  deleting: boolean;
}

export function EditHeader({
  isModal,
  onClose,
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
  onSave,
  saving,
  deleting,
}: Props) {
  const diffConfig = DIFFICULTY_OPTIONS.find((d) => d.value === difficulty);

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-[17px] font-bold tracking-tight text-slate-900">문제 수정</span>
        {approved ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" />승인
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
            <XCircle className="w-3.5 h-3.5" />미승인
          </span>
        )}
        {aiGenerated && (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
            <Layers className="w-3.5 h-3.5" />AI
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
          <SelectTrigger className={`h-9 w-[88px] text-[13px] font-semibold ${diffConfig?.color || ""}`}><SelectValue /></SelectTrigger>
          <SelectContent>{DIFFICULTY_OPTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="h-6 w-px bg-slate-200" />
        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 h-9 text-[13px] px-3 font-medium" onClick={onDelete} disabled={deleting}>
          <Trash2 className="w-4 h-4 mr-1.5" />삭제
        </Button>
        {!approved && (
          <Button variant="ghost" size="sm" className="text-emerald-700 hover:bg-emerald-50 h-9 text-[13px] px-3 font-medium" onClick={onApprove}>
            <CheckCircle2 className="w-4 h-4 mr-1.5" />승인
          </Button>
        )}
        <Button className="bg-blue-600 hover:bg-blue-700 h-9 text-[13px] px-5 font-semibold shadow-sm" size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}저장
        </Button>
        {/* 닫기 버튼 — 저장 버튼과 충분한 거리를 두어 오클릭을 방지 */}
        <div className="h-6 w-px bg-slate-200 ml-3" />
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          title="닫기"
          className="w-9 h-9 ml-2 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
}
