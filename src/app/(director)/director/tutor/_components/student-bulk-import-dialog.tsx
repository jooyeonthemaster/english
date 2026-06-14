"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { bulkCreateStudents } from "@/actions/students";

const MAX_ROWS = 200;

interface ParsedRow {
  row: number;
  name: string;
  grade: number;
  error?: string;
}

function parseLines(raw: string): ParsedRow[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_ROWS + 1)
    .map((line, i) => {
      // Tab-first (Excel paste), else comma. Reject extra columns so an
      // "이름,학교,학년" paste doesn't silently drop the grade into column 3.
      const cells = (line.includes("\t") ? line.split("\t") : line.split(","))
        .map((s) => s.trim());
      const name = cells[0] ?? "";
      const gradeRaw = cells[1] ?? "";
      const gradeDigits = gradeRaw.replace(/[^\d]/g, "");
      const grade = gradeDigits ? parseInt(gradeDigits, 10) : 1;
      let error: string | undefined;
      if (!name) error = "이름 없음";
      else if (name.length > 50) error = "이름 50자 초과";
      else if (cells.length > 2) error = "열은 이름·학년만";
      else if (gradeRaw && !gradeDigits) error = "학년은 숫자";
      else if (![1, 2, 3].includes(grade)) error = "학년 1~3만";
      return { row: i + 1, name, grade, error };
    });
}

export function StudentBulkImportDialog({
  open,
  onOpenChange,
  academyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academyId: string;
}) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    codes: { name: string; code: string }[];
    errors: { name: string; reason: string }[];
  } | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (open) {
      setRaw("");
      setResult(null);
    }
  }, [open]);

  const parsed = useMemo(() => parseLines(raw), [raw]);
  const valid = parsed.filter((p) => !p.error && p.row <= MAX_ROWS);
  const errorCount = parsed.filter((p) => p.error).length;
  const overflow = parsed.length > MAX_ROWS;

  function submit() {
    if (inFlight.current || valid.length === 0) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const res = await bulkCreateStudents(
          academyId,
          valid.map((p) => ({ name: p.name, grade: p.grade })),
        );
        if (res.created > 0) {
          toast.success(`${res.created}명을 등록했어요.`);
          setResult({ codes: res.codes, errors: res.errors });
          router.refresh();
        } else {
          toast.error(res.error || "등록에 실패했어요.");
        }
      } finally {
        inFlight.current = false;
      }
    });
  }

  function copyAll() {
    if (!result) return;
    const text = result.codes.map((c) => `${c.name}\t${c.code}`).join("\n");
    void navigator.clipboard?.writeText(text);
    toast.success("이름·코드를 복사했어요.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[6vh] max-h-[88vh] translate-y-0 overflow-y-auto rounded-xl sm:max-w-2xl">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-[#191F28]">등록 완료</DialogTitle>
              <DialogDescription className="text-sm font-medium text-[#8B95A1]">
                {result.codes.length}명 등록됨{result.errors.length > 0 && ` · ${result.errors.length}명 실패`}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-[#E5E8EB]">
              <table className="w-full text-sm">
                <tbody>
                  {result.codes.map((c, i) => (
                    <tr key={i} className="border-b border-[#F2F4F6] last:border-0">
                      <td className="px-3 py-2 font-bold text-[#191F28]">{c.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-[#3182F6]">{c.code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.errors.length > 0 && (
              <p className="text-xs font-medium text-[#F04452]">
                실패: {result.errors.map((e) => `${e.name}(${e.reason})`).join(", ")}
              </p>
            )}
            <div className="flex justify-between gap-2 pt-1">
              <Button
                variant="outline"
                onClick={copyAll}
                className="h-10 rounded-lg border-[#E5E8EB] font-bold text-[#4E5968]"
              >
                <Copy className="size-4" />
                코드 전체 복사
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setResult(null)}
                  className="h-10 rounded-lg border-[#E5E8EB] font-bold text-[#4E5968]"
                >
                  더 등록
                </Button>
                <Button
                  onClick={() => onOpenChange(false)}
                  className="h-10 rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700"
                >
                  <Check className="size-4" />
                  완료
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-[#191F28]">학생 대량 등록</DialogTitle>
              <DialogDescription className="text-sm font-medium text-[#8B95A1]">
                한 줄에 한 명. 이름 뒤에 탭/쉼표로 학년 구분 (예: 홍길동,1). 학년 생략 시 1학년.
              </DialogDescription>
            </DialogHeader>

            <Textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={8}
              placeholder={"홍길동, 1\n김영희, 1\n이재훈, 2"}
              className="resize-none rounded-lg font-mono text-sm"
            />

            {parsed.length > 0 && (
              <div className="max-h-[32vh] overflow-y-auto rounded-xl border border-[#E5E8EB]">
                <table className="w-full text-sm">
                  <tbody>
                    {parsed.slice(0, MAX_ROWS).map((p) => (
                      <tr key={p.row} className="border-b border-[#F2F4F6] last:border-0">
                        <td className="w-8 px-2 py-1.5 text-center text-[11px] text-[#AEB5BC]">{p.row}</td>
                        <td className="px-2 py-1.5 font-bold text-[#191F28]">{p.name || "—"}</td>
                        <td className="w-16 px-2 py-1.5 text-[#4E5968]">{p.grade}학년</td>
                        <td className="w-24 px-2 py-1.5 text-right">
                          {p.error ? (
                            <span className="text-[11px] font-bold text-[#F04452]">{p.error}</span>
                          ) : (
                            <Check className="ml-auto size-4 text-[#15B86F]" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs font-medium text-[#6B7684]">
                <span className="font-bold text-[#15B86F]">{valid.length}명</span> 등록 가능
                {errorCount > 0 && <span className="text-[#F04452]"> · {errorCount}명 오류</span>}
                {overflow && <span className="text-[#F04452]"> · 최대 {MAX_ROWS}명</span>}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="h-10 rounded-lg border-[#E5E8EB] font-bold text-[#4E5968]"
                  disabled={isPending}
                >
                  취소
                </Button>
                <Button
                  onClick={submit}
                  disabled={isPending || valid.length === 0}
                  className={cn("h-10 rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-700")}
                >
                  {isPending && <Loader2 className="size-4 animate-spin" />}
                  {valid.length}명 일괄 등록
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
