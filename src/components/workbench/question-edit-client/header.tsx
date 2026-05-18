// @ts-nocheck
"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Layers,
  Loader2,
  Save,
  Trash2,
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
    <div className="flex items-center justify-between px-5 py-2 border-b border-slate-200 bg-white shrink-0">
      <div className="flex items-center gap-3">
        {isModal ? (
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
        ) : (
          <Link href="/director/questions">
            <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
              <ArrowLeft className="w-4 h-4 text-slate-500" />
            </button>
          </Link>
        )}
        <span className="text-[15px] font-bold text-slate-900">문제 편집</span>
        {approved ? (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" />승인
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" />미승인
          </span>
        )}
        {aiGenerated && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            <Layers className="w-3 h-3" />AI
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8 w-[90px] text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>{TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
        <Input value={subType} onChange={(e) => setSubType(e.target.value)} placeholder="세부유형" className="h-8 w-[120px] text-[12px]" />
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger className={`h-8 w-[75px] text-[12px] ${diffConfig?.color || ""}`}><SelectValue /></SelectTrigger>
          <SelectContent>{DIFFICULTY_OPTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="h-5 w-px bg-slate-200" />
        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 text-[12px] px-2.5" onClick={onDelete} disabled={deleting}>
          <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
        </Button>
        {!approved && (
          <Button variant="ghost" size="sm" className="text-emerald-600 hover:bg-emerald-50 h-8 text-[12px] px-2.5" onClick={onApprove}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />승인
          </Button>
        )}
        <Button className="bg-blue-600 hover:bg-blue-700 h-8 text-[12px] px-4" size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}저장
        </Button>
      </div>
    </div>
  );
}
