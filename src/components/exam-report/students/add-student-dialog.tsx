"use client";

// ============================================================================
// 학생 시험 리포트 — 학생 추가 다이얼로그 (students-tab 에서 분리)
//
// 플로우 개편(26-07-08): 사진 업로드 경로 폐기. 이름 + 입력 주체 선택만 받는다.
//   ㉠ 학생이 직접 입력(기본) — 추가와 동시에 답안 링크(/a/{token})를 발급하고
//      다이얼로그 안에서 링크 + 복사 버튼 + 전달 안내를 즉시 보여준다.
//   ㉡ 선생님이 직접 입력 — 추가 후 정오표(학생 워크스페이스)로 안내한다.
// "한 명 더 추가"로 다건 등록 흐름을 잇는다(입력 주체 선택은 유지).
// ============================================================================

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ClipboardList, Copy } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { OptionRadioCard } from "@/components/workbench/shared/option-radio-card";
import { addExamStudents, enableAnswerLink } from "@/actions/exam-report";
import type { ExamAnalysisStudentRow } from "../ui-contracts";
import { examReportBasePrefix } from "../grading/grading-shared";

interface AddStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysisId: string;
  onAdded: (row: ExamAnalysisStudentRow) => void;
}

/** 입력 주체 — student: 학생이 링크로 직접 입력(기본) / teacher: 선생님이 정오표에 직접 입력 */
type EntryMode = "student" | "teacher";

/** 추가 완료 화면에 필요한 스냅샷 — 폼이 리셋돼도 안내가 유지되게 분리 보관. */
interface AddedResult {
  studentId: string;
  studentName: string;
  mode: EntryMode;
  /** ㉠에서 발급된 답안 링크 전체 URL — 발급 실패 시 null */
  answerUrl: string | null;
}

export function AddStudentDialog({
  open,
  onOpenChange,
  analysisId,
  onAdded,
}: AddStudentDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const base = examReportBasePrefix(pathname ?? "");

  const [name, setName] = useState("");
  const [mode, setMode] = useState<EntryMode>("student");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AddedResult | null>(null);
  const [copied, setCopied] = useState(false);

  function resetAll() {
    setName("");
    setMode("student");
    setResult(null);
    setCopied(false);
  }

  function handleClose(next: boolean) {
    if (busy) return;
    if (!next) resetAll();
    onOpenChange(next);
  }

  /** "한 명 더 추가" — 입력 주체 선택은 유지한 채 폼으로 되돌린다. */
  function handleAddAnother() {
    setName("");
    setResult(null);
    setCopied(false);
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

      // ㉠ 학생 직접 입력 — 추가와 동시에 답안 링크 발급(실패해도 추가는 성공 처리).
      let answerToken: string | null = null;
      let answerUrl: string | null = null;
      if (mode === "student") {
        try {
          const { token } = await enableAnswerLink(student.id);
          answerToken = token;
          answerUrl = `${window.location.origin}/a/${token}`;
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
        sourceFileCount: 0,
        answerToken,
        answerEnabled: answerToken != null,
        answerSubmittedAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      toast.success(`${student.studentName} 학생을 추가했습니다.`);
      setResult({
        studentId: student.id,
        studentName: student.studentName,
        mode,
        answerUrl,
      });
      setName("");
      setCopied(false);
    } catch {
      toast.error("학생 추가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("답안 입력 링크를 복사했어요. 학생에게 전달하세요.");
    } catch {
      toast.error("복사에 실패했습니다. 링크를 길게 눌러 직접 복사해 주세요.");
    }
  }

  function goToVerdict(studentId: string) {
    resetAll();
    onOpenChange(false);
    // ?step=verdict — 무응답 학생의 기본 착지는 '답안 수집'(deriveInitialStep)이라
    // "정오표에서 답안 입력" 라벨 약속대로 정오표 스텝에 바로 착지시킨다.
    router.push(
      `${base}/workbench/exam-report/${analysisId}/students/${studentId}?step=verdict`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        {result == null ? (
          <>
            <DialogHeader>
              <DialogTitle>학생 추가</DialogTitle>
              <DialogDescription>
                학생 이름을 입력하고, 답안을 누가 입력할지 선택하세요.
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void handleSubmit();
                    }
                  }}
                  placeholder="김민준"
                  disabled={busy}
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  답안 입력 방식
                </label>
                <div
                  role="radiogroup"
                  aria-label="답안 입력 방식"
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  <OptionRadioCard
                    checked={mode === "student"}
                    onSelect={() => setMode("student")}
                    title="학생이 직접 입력"
                    description="답안 링크를 바로 발급해 학생에게 보내면, 학생이 휴대폰으로 전 문항을 입력합니다."
                    badge="추천"
                    disabled={busy}
                  />
                  <OptionRadioCard
                    checked={mode === "teacher"}
                    onSelect={() => setMode("teacher")}
                    title="선생님이 직접 입력"
                    description="시험지를 보고 채점 화면에서 문항별 선지를 선생님이 직접 입력합니다."
                    disabled={busy}
                  />
                </div>
              </div>
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
                {busy
                  ? "추가 중…"
                  : mode === "student"
                    ? "추가하고 링크 발급"
                    : "추가"}
              </Button>
            </DialogFooter>
          </>
        ) : result.mode === "student" ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {result.answerUrl != null
                  ? `${result.studentName} 학생의 답안 링크가 준비됐어요`
                  : `${result.studentName} 학생을 추가했습니다`}
              </DialogTitle>
              <DialogDescription>
                {result.answerUrl != null
                  ? "이 링크를 학생에게 보내주세요. 학생이 전 문항을 입력하면 제출됨 표시가 뜹니다."
                  : "답안 링크 발급에 실패했습니다. 학생 목록의 링크 복사 버튼으로 다시 발급할 수 있습니다."}
              </DialogDescription>
            </DialogHeader>

            {result.answerUrl != null && (
              <div className="space-y-2.5">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    답안 입력 링크
                  </label>
                  <Input
                    readOnly
                    value={result.answerUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-mono text-[12px] text-slate-600"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void handleCopy(result.answerUrl as string)}
                  className="h-11 w-full bg-blue-600 text-[13.5px] font-semibold hover:bg-blue-700"
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? "복사됨 — 학생에게 보내주세요" : "링크 복사"}
                </Button>
                <p className="text-[12px] leading-relaxed text-slate-500">
                  학생이 링크에서 전 문항을 입력해 제출하면 목록의 답안 수집
                  상태가 <span className="font-medium text-emerald-600">제출됨</span>
                  으로 바뀝니다.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleAddAnother}>
                한 명 더 추가
              </Button>
              <Button
                type="button"
                onClick={() => handleClose(false)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                완료
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{result.studentName} 학생을 추가했습니다</DialogTitle>
              <DialogDescription>
                채점 화면에서 문항별 선지를 직접 입력해주세요. 입력한 답은 자동으로
                채점됩니다.
              </DialogDescription>
            </DialogHeader>

            <Button
              type="button"
              onClick={() => goToVerdict(result.studentId)}
              className="h-11 w-full bg-blue-600 text-[13.5px] font-semibold hover:bg-blue-700"
            >
              <ClipboardList className="h-4 w-4" />
              채점에서 답안 입력
            </Button>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleAddAnother}>
                한 명 더 추가
              </Button>
              <Button
                type="button"
                onClick={() => handleClose(false)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                완료
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
