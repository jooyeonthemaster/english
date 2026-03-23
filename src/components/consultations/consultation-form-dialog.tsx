"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CONSULTATION_TYPES,
  CONSULTATION_CHANNELS,
  CONSULTATION_STATUSES,
  CONSULTATION_CATEGORIES,
} from "@/lib/constants";
import {
  createConsultation,
  updateConsultation,
  getStaffList,
  searchStudents,
} from "@/actions/consultations";
import { toast } from "sonner";
import { Search } from "lucide-react";

interface ConsultationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultation?: {
    id: string;
    type: string;
    studentId: string | null;
    staffId: string | null;
    date: Date;
    channel: string | null;
    status: string;
    content: string | null;
    category: string | null;
    followUpDate: Date | null;
    followUpNote: string | null;
    student?: { id: string; name: string } | null;
    staff?: { id: string; name: string } | null;
  } | null;
}

export function ConsultationFormDialog({
  open,
  onOpenChange,
  consultation,
}: ConsultationFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [consultType, setConsultType] = useState(consultation?.type || "STUDENT");
  const [channel, setChannel] = useState(consultation?.channel || "");
  const [status, setStatus] = useState(consultation?.status || "SCHEDULED");
  const [category, setCategory] = useState(consultation?.category || "");
  const [staffList, setStaffList] = useState<{ id: string; name: string; role: string }[]>([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<{ id: string; name: string; grade: number }[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string;
    name: string;
  } | null>(consultation?.student || null);
  const [selectedStaff, setSelectedStaff] = useState(consultation?.staffId || "");

  const isEdit = !!consultation;

  useEffect(() => {
    if (open) {
      startTransition(async () => {
        const staff = await getStaffList();
        setStaffList(staff);
      });
    }
  }, [open]);

  useEffect(() => {
    if (consultation) {
      setConsultType(consultation.type);
      setChannel(consultation.channel || "");
      setStatus(consultation.status);
      setCategory(consultation.category || "");
      setSelectedStudent(consultation.student || null);
      setSelectedStaff(consultation.staffId || "");
    } else {
      setConsultType("STUDENT");
      setChannel("");
      setStatus("SCHEDULED");
      setCategory("");
      setSelectedStudent(null);
      setSelectedStaff("");
      setStudentQuery("");
      setStudentResults([]);
    }
  }, [consultation, open]);

  async function handleStudentSearch(query: string) {
    setStudentQuery(query);
    if (query.length >= 1) {
      const results = await searchStudents(query);
      setStudentResults(results);
    } else {
      setStudentResults([]);
    }
  }

  function handleSubmit(formData: FormData) {
    formData.set("type", consultType);
    formData.set("channel", channel);
    formData.set("status", status);
    formData.set("category", category);
    formData.set("staffId", selectedStaff);
    if (selectedStudent) {
      formData.set("studentId", selectedStudent.id);
    }

    startTransition(async () => {
      try {
        if (isEdit) {
          await updateConsultation(consultation.id, formData);
          toast.success("상담 기록이 수정되었습니다.");
        } else {
          await createConsultation(formData);
          toast.success("상담 기록이 등록되었습니다.");
        }
        onOpenChange(false);
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "상담 기록 수정" : "상담 기록"}
          </DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          {/* Type + Channel Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>상담 유형</Label>
              <Select value={consultType} onValueChange={setConsultType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSULTATION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>채널</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {CONSULTATION_CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Student Search (not required for NEW_INQUIRY) */}
          <div className="space-y-2">
            <Label>학생</Label>
            {selectedStudent ? (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <span className="text-sm font-medium">{selectedStudent.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setSelectedStudent(null);
                    setStudentQuery("");
                  }}
                >
                  변경
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="학생 이름 검색..."
                  value={studentQuery}
                  onChange={(e) => handleStudentSearch(e.target.value)}
                  className="pl-9"
                />
                {studentResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 border rounded-md bg-background shadow-lg max-h-40 overflow-y-auto">
                    {studentResults.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={() => {
                          setSelectedStudent({ id: s.id, name: s.name });
                          setStudentResults([]);
                          setStudentQuery("");
                        }}
                      >
                        {s.name}{" "}
                        <span className="text-muted-foreground">
                          ({s.grade}학년)
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {consultType === "NEW_INQUIRY" && (
              <p className="text-xs text-muted-foreground">
                신규 문의는 학생 선택이 필수가 아닙니다
              </p>
            )}
          </div>

          {/* Counselor + Date Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>상담자</Label>
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.role === "DIRECTOR" ? "원장" : "강사"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="consult-date">날짜/시간</Label>
              <Input
                id="consult-date"
                name="date"
                type="datetime-local"
                defaultValue={
                  consultation?.date
                    ? new Date(consultation.date).toISOString().slice(0, 16)
                    : new Date().toISOString().slice(0, 16)
                }
                required
              />
            </div>
          </div>

          {/* Status + Category Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>상태</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSULTATION_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>카테고리</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {CONSULTATION_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="consult-content">상담 내용</Label>
            <Textarea
              id="consult-content"
              name="content"
              placeholder="상담 내용을 기록하세요..."
              defaultValue={consultation?.content || ""}
              rows={5}
              className="resize-y"
            />
          </div>

          {/* Follow-up */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="consult-followup-date">후속 조치일</Label>
              <Input
                id="consult-followup-date"
                name="followUpDate"
                type="date"
                defaultValue={
                  consultation?.followUpDate
                    ? new Date(consultation.followUpDate)
                        .toISOString()
                        .slice(0, 10)
                    : ""
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consult-followup-note">후속 메모</Label>
              <Input
                id="consult-followup-note"
                name="followUpNote"
                placeholder="후속 조치 메모"
                defaultValue={consultation?.followUpNote || ""}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "저장 중..." : isEdit ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
