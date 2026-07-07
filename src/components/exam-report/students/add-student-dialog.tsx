"use client";

// ============================================================================
// 학생 시험 리포트 — 학생 추가 다이얼로그 (students-tab 에서 분리)
//
// 이름 + 마킹 사진(선택) 업로드 + "추가 후 답안 링크 바로 발급" 옵션.
// 링크 발급을 켜면 추가 직후 enableAnswerLink → /a/{token} 을 클립보드에 복사해
// 강사가 바로 학생에게 전달할 수 있게 한다(사진 없는 답안 수집 경로).
// ============================================================================

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  addExamStudents,
  enableAnswerLink,
  setStudentSources,
} from "@/actions/exam-report";
import type { ExamAnalysisStudentRow } from "../ui-contracts";
import {
  uploadStudentPages,
  type StudentUploadSlot,
} from "./student-image-upload";

interface AddStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysisId: string;
  onAdded: (row: ExamAnalysisStudentRow) => void;
}

export function AddStudentDialog({
  open,
  onOpenChange,
  analysisId,
  onAdded,
}: AddStudentDialogProps) {
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<StudentUploadSlot[]>([]);
  const [issueLink, setIssueLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setSlots((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.previewUrl));
      return [];
    });
    setName("");
    setIssueLink(false);
  }

  function handleClose(next: boolean) {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  }

  function handlePick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked: StudentUploadSlot[] = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f, i) => ({
        id: `${Date.now()}-${i}-${f.name}`,
        blob: f,
        previewUrl: URL.createObjectURL(f),
        name: f.name,
      }));
    setSlots((prev) => [...prev, ...picked]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeSlot(id: string) {
    setSlots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  async function handleSubmit() {
    const studentName = name.trim();
    if (!studentName) {
      toast.error("학생 이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const { students: created } = await addExamStudents(analysisId, [studentName]);
      const student = created[0];
      if (!student) {
        toast.error("학생 추가에 실패했습니다.");
        return;
      }
      let sourceFileCount = 0;
      if (slots.length > 0) {
        try {
          const pages = await uploadStudentPages({
            analysisId,
            studentId: student.id,
            slots,
          });
          const res = await setStudentSources(student.id, pages);
          if (res.ok) {
            sourceFileCount = pages.length;
          } else {
            toast.error("사진 저장에 실패했습니다. 학생 화면에서 다시 올려주세요.");
          }
        } catch {
          toast.error("사진 업로드에 실패했습니다. 학생 화면에서 다시 올려주세요.");
        }
      }
      // 옵션: 답안 링크 즉시 발급 + 클립보드 복사(실패해도 추가 자체는 성공 처리).
      let answerToken: string | null = null;
      if (issueLink) {
        try {
          const { token } = await enableAnswerLink(student.id);
          answerToken = token;
          try {
            await navigator.clipboard.writeText(
              `${window.location.origin}/a/${token}`,
            );
            toast.success("답안 입력 링크를 복사했어요. 학생에게 전달하세요.");
          } catch {
            toast.info("답안 링크를 만들었어요. 목록의 링크 복사로 전달하세요.");
          }
        } catch {
          toast.error("답안 링크 발급에 실패했습니다. 목록에서 다시 발급하세요.");
        }
      }
      const now = new Date().toISOString();
      onAdded({
        id: student.id,
        studentName: student.studentName,
        scoreSummary: null,
        gradingConfirmed: false,
        reportStatus: "NONE",
        shareEnabled: false,
        readState: { status: "NONE", readRuns: 0, uncertainties: [] },
        sourceFileCount,
        answerToken,
        answerEnabled: answerToken != null,
        answerSubmittedAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      toast.success(`${student.studentName} 학생을 추가했습니다.`);
      reset();
      onOpenChange(false);
    } catch {
      toast.error("학생 추가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>학생 추가</DialogTitle>
          <DialogDescription>
            학생 이름과 마킹된 시험지 사진을 등록하세요. 사진 없이 답안 링크나
            직접 입력으로도 채점할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              학생 이름
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="김민준"
              disabled={busy}
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              마킹 시험지 사진 (선택)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => handlePick(e.target.files)}
            />
            {slots.length > 0 && (
              <div className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => (
                  <div
                    key={s.id}
                    className="group relative aspect-[3/4] overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.previewUrl}
                      alt={s.name}
                      className="h-full w-full object-cover"
                    />
                    {!busy && (
                      <button
                        type="button"
                        onClick={() => removeSlot(s.id)}
                        aria-label="사진 제거"
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/60 text-white transition-colors hover:bg-slate-900/80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white text-[12.5px] font-semibold text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
              {slots.length > 0 ? "사진 더 추가" : "사진 선택"}
            </button>
          </div>

          <label className="flex cursor-pointer items-start gap-2">
            <Checkbox
              checked={issueLink}
              onCheckedChange={(v) => setIssueLink(v === true)}
              disabled={busy}
              className="mt-0.5"
            />
            <span className="text-[12.5px] leading-snug text-slate-600">
              추가 후 답안 링크 바로 발급
              <span className="block text-[11px] text-slate-400">
                학생이 휴대폰으로 본인 답을 입력하는 링크를 만들어 클립보드에
                복사합니다.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={busy}
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {busy ? "추가 중…" : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
