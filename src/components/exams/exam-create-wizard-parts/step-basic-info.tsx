"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClassOption, SchoolOption } from "./types";

// ---------------------------------------------------------------------------
// STEP 1: 기본 정보 입력
// ---------------------------------------------------------------------------

interface StepBasicInfoProps {
  title: string;
  setTitle: (value: string) => void;
  examType: string;
  setExamType: (value: string) => void;
  classId: string;
  setClassId: (value: string) => void;
  schoolId: string;
  setSchoolId: (value: string) => void;
  grade: string;
  setGrade: (value: string) => void;
  semester: string;
  setSemester: (value: string) => void;
  examSubType: string;
  setExamSubType: (value: string) => void;
  examDate: string;
  setExamDate: (value: string) => void;
  duration: string;
  setDuration: (value: string) => void;
  totalPoints: string;
  setTotalPoints: (value: string) => void;
  classes: ClassOption[];
  schools: SchoolOption[];
}

export function StepBasicInfo({
  title,
  setTitle,
  examType,
  setExamType,
  classId,
  setClassId,
  schoolId,
  setSchoolId,
  grade,
  setGrade,
  semester,
  setSemester,
  examSubType,
  setExamSubType,
  examDate,
  setExamDate,
  duration,
  setDuration,
  totalPoints,
  setTotalPoints,
  classes,
  schools,
}: StepBasicInfoProps) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-[#191F28]">기본 정보</h2>

      <div className="space-y-2">
        <Label htmlFor="title">시험명 *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 중2 1학기 중간고사 대비"
          className="border-[#E5E8EB]"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>시험 유형 *</Label>
          <Select value={examType} onValueChange={setExamType}>
            <SelectTrigger className="border-[#E5E8EB]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OFFLINE">오프라인</SelectItem>
              <SelectItem value="ONLINE">온라인</SelectItem>
              <SelectItem value="VOCAB">단어 시험</SelectItem>
              <SelectItem value="MOCK">모의고사</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>반 (선택)</Label>
          <Select value={classId || "__none__"} onValueChange={(v) => setClassId(v === "__none__" ? "" : v)}>
            <SelectTrigger className="border-[#E5E8EB]">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">전체</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>학교 (선택)</Label>
          <Select value={schoolId || "__none__"} onValueChange={(v) => setSchoolId(v === "__none__" ? "" : v)}>
            <SelectTrigger className="border-[#E5E8EB]">
              <SelectValue placeholder="미지정" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">미지정</SelectItem>
              {schools.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>학년</Label>
          <Select value={grade || "__none__"} onValueChange={(v) => setGrade(v === "__none__" ? "" : v)}>
            <SelectTrigger className="border-[#E5E8EB]">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">선택</SelectItem>
              {[1, 2, 3].map((g) => (
                <SelectItem key={g} value={String(g)}>
                  {g}학년
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>학기</Label>
          <Select value={semester || "__none__"} onValueChange={(v) => setSemester(v === "__none__" ? "" : v)}>
            <SelectTrigger className="border-[#E5E8EB]">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">선택</SelectItem>
              <SelectItem value="FIRST">1학기</SelectItem>
              <SelectItem value="SECOND">2학기</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>시험 종류</Label>
          <Select value={examSubType || "__none__"} onValueChange={(v) => setExamSubType(v === "__none__" ? "" : v)}>
            <SelectTrigger className="border-[#E5E8EB]">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">선택</SelectItem>
              <SelectItem value="MIDTERM">중간고사</SelectItem>
              <SelectItem value="FINAL">기말고사</SelectItem>
              <SelectItem value="QUIZ">쪽지시험</SelectItem>
              <SelectItem value="MOCK">모의고사</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="examDate">시험일</Label>
          <Input
            id="examDate"
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            className="border-[#E5E8EB]"
          />
        </div>
        {examType === "ONLINE" && (
          <div className="space-y-2">
            <Label htmlFor="duration">시간 제한 (분)</Label>
            <Input
              id="duration"
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="60"
              className="border-[#E5E8EB]"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="totalPoints">총점</Label>
          <Input
            id="totalPoints"
            type="number"
            min={1}
            value={totalPoints}
            onChange={(e) => setTotalPoints(e.target.value)}
            className="border-[#E5E8EB]"
          />
        </div>
      </div>
    </div>
  );
}
