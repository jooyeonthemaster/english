"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  FileJson,
  X,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImportResult {
  message: string;
  success: number;
  failed: number;
  total: number;
  errors: { row: number; reason: string }[];
}

interface PassageImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SAMPLE_CSV = `제목,본문,학년,학기,단원,출판사,난이도,출처,태그
The Power of Habits,"Many people want to change their lives, but they often try to make big changes all at once. This approach usually fails because it is too difficult to maintain. Instead, research shows that small habits can lead to remarkable results over time.",2,1학기,Lesson 1,능률,중급,교과서,"습관,자기계발"
Global Warming Effects,"Climate change is one of the most pressing issues facing our planet today. Rising temperatures are causing ice caps to melt, sea levels to rise, and weather patterns to become more extreme.",2,1학기,Lesson 3,비상,중급,교과서,"환경,기후변화"`;

const SAMPLE_JSON = JSON.stringify(
  {
    passages: [
      {
        title: "The Power of Habits",
        content:
          "Many people want to change their lives, but they often try to make big changes all at once. This approach usually fails because it is too difficult to maintain.",
        grade: 2,
        semester: "1학기",
        unit: "Lesson 1",
        publisher: "능률",
        difficulty: "중급",
        tags: "습관,자기계발",
      },
    ],
  },
  null,
  2
);

export function PassageImportDialog({
  open,
  onOpenChange,
}: PassageImportDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [format, setFormat] = useState<"csv" | "tsv" | "json">("csv");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setResult(null);
    // Auto-detect format
    const name = file.name.toLowerCase();
    if (name.endsWith(".json")) setFormat("json");
    else if (name.endsWith(".tsv") || name.endsWith(".txt")) setFormat("tsv");
    else setFormat("csv");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleImport = async () => {
    if (!selectedFile) return;

    setImporting(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("format", format);

      const res = await fetch("/api/passages/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "가져오기에 실패했습니다.");
        setResult({ message: data.error, success: 0, failed: 0, total: 0, errors: [] });
        return;
      }

      setResult(data);

      if (data.success > 0) {
        toast.success(data.message);
        router.refresh();
      }
    } catch {
      toast.error("서버 연결에 실패했습니다.");
    } finally {
      setImporting(false);
    }
  };

  const downloadSample = (type: "csv" | "json") => {
    const content = type === "csv" ? SAMPLE_CSV : SAMPLE_JSON;
    const mimeType = type === "csv" ? "text/csv;charset=utf-8;" : "application/json;charset=utf-8;";
    const blob = new Blob(["\uFEFF" + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = type === "csv" ? "지문_샘플.csv" : "지문_샘플.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetState = () => {
    setSelectedFile(null);
    setResult(null);
    setImporting(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetState();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[18px] font-bold text-gray-900">
            지문 일괄 등록
          </DialogTitle>
          <p className="text-[13px] text-gray-400 mt-1">
            CSV, TSV, JSON 파일로 여러 지문을 한 번에 등록합니다.
          </p>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5">
          {/* Sample download */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50/60 border border-blue-100/60">
            <Download className="size-4 text-blue-500 shrink-0" />
            <span className="text-[13px] text-blue-700 font-medium flex-1">
              샘플 파일을 참고하세요
            </span>
            <button
              type="button"
              onClick={() => downloadSample("csv")}
              className="text-[12px] font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-100/60 transition-colors"
            >
              CSV 샘플
            </button>
            <button
              type="button"
              onClick={() => downloadSample("json")}
              className="text-[12px] font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-100/60 transition-colors"
            >
              JSON 샘플
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center h-[160px] rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
              dragOver
                ? "border-blue-400 bg-blue-50/50"
                : selectedFile
                ? "border-green-300 bg-green-50/30"
                : "border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.json,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />

            {selectedFile ? (
              <>
                <div className="flex items-center gap-3">
                  {format === "json" ? (
                    <FileJson className="size-8 text-green-500" />
                  ) : format === "tsv" ? (
                    <FileText className="size-8 text-green-500" />
                  ) : (
                    <FileSpreadsheet className="size-8 text-green-500" />
                  )}
                  <div>
                    <p className="text-[14px] font-semibold text-gray-900">
                      {selectedFile.name}
                    </p>
                    <p className="text-[12px] text-gray-400">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setResult(null);
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </>
            ) : (
              <>
                <Upload className="size-8 text-gray-300 mb-2" />
                <p className="text-[14px] font-medium text-gray-500">
                  파일을 드래그하거나 클릭하여 선택
                </p>
                <p className="text-[12px] text-gray-300 mt-1">
                  CSV, TSV, JSON 지원 (UTF-8)
                </p>
              </>
            )}
          </div>

          {/* Format selector */}
          {selectedFile && (
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-gray-500">파일 형식:</span>
              <div className="flex gap-1">
                {(["csv", "tsv", "json"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                      format === f
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Column guide */}
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
            <p className="text-[12px] font-semibold text-gray-500 mb-2">
              지원 컬럼 (한글/영문 모두 인식)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
              <span className="text-gray-600">
                <strong className="text-gray-900">제목</strong> / title
                <span className="text-red-400 ml-0.5">*</span>
              </span>
              <span className="text-gray-600">
                <strong className="text-gray-900">본문</strong> / content
                <span className="text-red-400 ml-0.5">*</span>
              </span>
              <span className="text-gray-400">학년 / grade</span>
              <span className="text-gray-400">학기 / semester (1, 2)</span>
              <span className="text-gray-400">단원 / unit</span>
              <span className="text-gray-400">출판사 / publisher</span>
              <span className="text-gray-400">난이도 / difficulty</span>
              <span className="text-gray-400">출처 / source</span>
              <span className="text-gray-400">학교 / school</span>
              <span className="text-gray-400">태그 / tags (쉼표 구분)</span>
            </div>
          </div>

          {/* Import result */}
          {result && (
            <div
              className={`p-4 rounded-xl border ${
                result.success > 0
                  ? "bg-green-50/60 border-green-100"
                  : "bg-red-50/60 border-red-100"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {result.success > 0 ? (
                  <CheckCircle2 className="size-4 text-green-500" />
                ) : (
                  <AlertCircle className="size-4 text-red-500" />
                )}
                <span className="text-[14px] font-semibold text-gray-900">
                  {result.message}
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="mt-2 max-h-[120px] overflow-y-auto space-y-1">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-[12px] text-red-600">
                      행 {err.row}: {err.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                resetState();
                onOpenChange(false);
              }}
              className="h-10 px-5 rounded-xl text-[13px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!selectedFile || importing}
              className="h-10 px-6 rounded-xl text-[13px] font-bold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
                boxShadow: importing
                  ? "none"
                  : "0 4px 12px rgba(59, 130, 246, 0.25)",
              }}
            >
              {importing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  가져오는 중...
                </>
              ) : (
                <>
                  <Upload className="size-4" />
                  가져오기
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
