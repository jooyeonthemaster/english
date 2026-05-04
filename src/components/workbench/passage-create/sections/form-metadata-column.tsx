"use client";

import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PUBLISHERS } from "../constants";

interface FormMetadataColumnProps {
  schools: Array<{ id: string; name: string; type: string; publisher: string | null }>;
  schoolId: string;
  setSchoolId: (v: string) => void;
  grade: string;
  setGrade: (v: string) => void;
  semester: string;
  setSemester: (v: string) => void;
  unit: string;
  setUnit: (v: string) => void;
  source: string;
  setSource: (v: string) => void;
  publisher: string;
  setPublisher: (v: string) => void;
  publisherCustom: string;
  setPublisherCustom: (v: string) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  tags: string[];
  addTag: () => void;
  removeTag: (tag: string) => void;
}

export function FormMetadataColumn({
  schools,
  schoolId,
  setSchoolId,
  grade,
  setGrade,
  semester,
  setSemester,
  unit,
  setUnit,
  source,
  setSource,
  publisher,
  setPublisher,
  publisherCustom,
  setPublisherCustom,
  tagInput,
  setTagInput,
  tags,
  addTag,
  removeTag,
}: FormMetadataColumnProps) {
  return (
    <div className="bg-slate-50/70 rounded-xl border border-slate-200 p-5 flex flex-col min-h-0 overflow-y-auto">
      <h3 className="text-[14px] font-semibold text-slate-700 mb-3 shrink-0">지문 정보</h3>

      <div className="space-y-3 flex-1">
        {/* 학교 */}
        <div>
          <Label className="text-[11px] text-slate-500 mb-1 block">학교</Label>
          <Select value={schoolId} onValueChange={setSchoolId}>
            <SelectTrigger className="w-full h-9"><SelectValue placeholder="학교 선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">선택 안함</SelectItem>
              {schools.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] text-slate-500 mb-1 block">학년</Label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger className="w-full h-9"><SelectValue placeholder="학년" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1학년</SelectItem>
                <SelectItem value="2">2학년</SelectItem>
                <SelectItem value="3">3학년</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-slate-500 mb-1 block">학기</Label>
            <Select value={semester} onValueChange={setSemester}>
              <SelectTrigger className="w-full h-9"><SelectValue placeholder="학기" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FIRST">1학기</SelectItem>
                <SelectItem value="SECOND">2학기</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] text-slate-500 mb-1 block">단원</Label>
            <Input placeholder="Lesson 3" value={unit} onChange={(e) => setUnit(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-[11px] text-slate-500 mb-1 block">출처</Label>
            <Input placeholder="2025 기말" value={source} onChange={(e) => setSource(e.target.value)} className="h-9" />
          </div>
        </div>

        <div>
          <Label className="text-[11px] text-slate-500 mb-1 block">출판사</Label>
          <Select value={publisher} onValueChange={setPublisher}>
            <SelectTrigger className="w-full h-9"><SelectValue placeholder="출판사" /></SelectTrigger>
            <SelectContent>
              {PUBLISHERS.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
              <SelectItem value="__CUSTOM__">직접 입력</SelectItem>
            </SelectContent>
          </Select>
          {publisher === "__CUSTOM__" && (
            <Input placeholder="출판사명 입력" value={publisherCustom} onChange={(e) => setPublisherCustom(e.target.value)} className="mt-1.5 h-9" />
          )}
        </div>

        <div>
          <Label className="text-[11px] text-slate-500 mb-1 block">태그</Label>
          <div className="flex gap-1.5">
            <Input
              placeholder="입력 후 Enter"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              className="flex-1 h-9"
            />
            <Button variant="outline" size="icon" onClick={addTag} className="shrink-0 h-9 w-9">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px] pr-1 flex items-center gap-0.5">
                {tag}
                <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
