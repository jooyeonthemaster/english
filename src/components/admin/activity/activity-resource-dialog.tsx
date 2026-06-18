"use client";

// ============================================================================
// ActivityResourceDialog — 타임라인 행이 가리키는 실제 자료 뷰어.
// 추출 페이지 이미지(서명 URL)·추출 텍스트·지문 원문·잡 설정/결과·시험지
// 다운로드까지, 관리자가 SQL 없이 유저가 올리고 만든 것을 직접 본다.
// ============================================================================

import { useEffect, useState, useTransition } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getActivityResourceDetail,
  type ResourceDetail,
} from "@/actions/admin-activity";
import { ExamBuilderQuestions } from "./exam-builder-questions";
import {
  examTypeLabel,
  extractionModeLabel,
  ocrEngineLabel,
  pagePathLabel,
  statusLabel,
  workbenchDomainLabel,
} from "@/lib/admin-activity-labels";

/** 실행 위치 표기: 한글 페이지명 + (추정) 마커 */
function originText(
  origin: { path: string; source: "recorded" | "inferred" } | null,
): string {
  if (!origin) return "—";
  const label = pagePathLabel(origin.path);
  return origin.source === "inferred" ? `${label} (추정)` : label;
}

interface ActivityResourceDialogProps {
  /** `${source}:${rowId}` — null이면 닫힘 */
  itemId: string | null;
  itemTitle: string;
  onClose: () => void;
}

export function ActivityResourceDialog({
  itemId,
  itemTitle,
  onClose,
}: ActivityResourceDialogProps) {
  const [detail, setDetail] = useState<ResourceDetail | null>(null);
  const [isPending, startTransition] = useTransition();

  // 다른 항목으로 전환되는 동안엔 isPending이 로더를 띄우므로 stale 상세가
  // 보일 틈이 없다 — 닫을 때 굳이 리셋하지 않는다.
  useEffect(() => {
    if (!itemId) return;
    startTransition(async () => {
      const res = await getActivityResourceDetail(itemId);
      setDetail(res);
    });
  }, [itemId]);

  return (
    <Dialog open={itemId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-gray-900 pr-8 break-all">
            {itemTitle}
          </DialogTitle>
        </DialogHeader>

        {isPending || !detail ? (
          <div className="py-16 flex items-center justify-center text-gray-400">
            <Loader2 className="size-5 animate-spin" strokeWidth={2} aria-hidden />
          </div>
        ) : (
          <DetailBody detail={detail} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ detail }: { detail: ResourceDetail }) {
  switch (detail.kind) {
    case "forbidden":
      return (
        <Notice text="자료 열람은 SUPER_ADMIN 권한이 필요합니다." />
      );
    case "not_found":
      return <Notice text="자료를 찾을 수 없습니다. (삭제되었을 수 있음)" />;
    case "extraction":
      return <ExtractionDetail detail={detail} />;
    case "passage":
      return (
        <div className="space-y-3">
          <MetaRow
            entries={[
              ["학년", detail.grade ? `${detail.grade}학년` : "—"],
              ["등록일", formatDateTime(detail.createdAt)],
              ["길이", `${detail.content.length.toLocaleString("ko-KR")}자`],
              ["문제", `${detail.questions.length}개`],
            ]}
          />
          <SectionLabel>지문 원문</SectionLabel>
          <TextBox text={detail.content} maxHeight="max-h-56" />
          <SectionLabel>문제 · 시험지 만들기</SectionLabel>
          <ExamBuilderQuestions
            questions={detail.questions}
            defaultTitle={detail.title}
          />
        </div>
      );
    case "workbench":
      return (
        <div className="space-y-3">
          <MetaRow
            entries={[
              ["종류", workbenchDomainLabel(detail.domain)],
              ["상태", statusLabel(detail.status)],
              ["실행 위치", originText(detail.origin)],
              ["지문", detail.passageTitle ?? "—"],
              ["문제", `${detail.questions.length}개`],
            ]}
          />
          {detail.errorMessage && (
            <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 text-[12px] text-rose-700">
              {detail.errorMessage}
            </div>
          )}
          {detail.passageContent && (
            <>
              <SectionLabel>지문 원문</SectionLabel>
              <TextBox text={detail.passageContent} maxHeight="max-h-48" />
            </>
          )}
          <SectionLabel>문제 · 시험지 만들기</SectionLabel>
          <ExamBuilderQuestions
            questions={detail.questions}
            defaultTitle={detail.passageTitle || detail.title}
          />
        </div>
      );
    case "report":
      return (
        <MetaRow
          entries={[
            ["상태", statusLabel(detail.status)],
            ["페이지", `${detail.pageCount}p`],
            ["템플릿", detail.templateId ?? "—"],
            ["버전", `v${detail.version}`],
            [
              "발행일",
              detail.publishedAt ? formatDateTime(detail.publishedAt) : "—",
            ],
            ["지문", detail.passageTitle ?? "—"],
          ]}
        />
      );
    case "exam":
      return (
        <div className="space-y-4">
          <MetaRow
            entries={[
              ["유형", examTypeLabel(detail.type)],
              ["상태", statusLabel(detail.status)],
              ["문항 수", `${detail.questionCount}문항`],
              ["출력 횟수", `${detail.printCount}회`],
              ["생성일", formatDateTime(detail.createdAt)],
            ]}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              asChild
              size="sm"
              className="h-9 text-[12px] bg-blue-600 hover:bg-blue-700"
            >
              <a
                href={`/admin/exam-print?examId=${detail.examId}`}
                target="_blank"
                rel="noreferrer"
              >
                <Printer className="size-4 mr-1.5" strokeWidth={2} aria-hidden />
                시험지 보기·인쇄
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 text-[12px]">
              <a
                href={`/admin/exam-print?examId=${detail.examId}&answers=1`}
                target="_blank"
                rel="noreferrer"
              >
                정답 포함 보기
              </a>
            </Button>
          </div>
          <p className="text-[11px] text-gray-400">
            새 탭에서 시험지를 보고 인쇄(또는 PDF 저장)·DOCX 다운로드할 수 있어요.
          </p>
        </div>
      );
  }
}

// ─── 추출 잡 상세 ────────────────────────────────────────────────────────────

function ExtractionDetail({
  detail,
}: {
  detail: Extract<ResourceDetail, { kind: "extraction" }>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <MetaRow
          entries={[
            ["파일", detail.fileName],
            ["모드", extractionModeLabel(detail.mode)],
            ["상태", statusLabel(detail.status)],
            ["실행 위치", originText(detail.origin)],
            ["페이지", `${detail.totalPages}p`],
            [
              "크레딧",
              `사용 ${detail.creditsConsumed} · 환불 ${detail.creditsRefunded}`,
            ],
          ]}
        />
        {detail.originalUrl && (
          <Button asChild variant="outline" size="sm" className="h-8 text-[12px]">
            <a href={detail.originalUrl} target="_blank" rel="noreferrer">
              <Download className="size-3.5 mr-1.5" strokeWidth={2} aria-hidden />
              원본 파일
            </a>
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {detail.pages.map((p) => (
          <div
            key={p.pageIndex}
            className="rounded-lg border border-gray-100 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/60 border-b border-gray-100">
              <span className="text-[12px] font-semibold text-gray-700">
                {p.pageIndex + 1}페이지
              </span>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] font-medium border-0 px-1.5",
                  p.status === "SUCCESS"
                    ? "bg-emerald-50 text-emerald-700"
                    : p.status === "DEAD"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-gray-100 text-gray-600",
                )}
              >
                {statusLabel(p.status)}
              </Badge>
              <span className="text-[11px] text-gray-400 tabular-nums">
                {p.imageBytes !== null
                  ? `${(p.imageBytes / 1024).toFixed(1)}KB`
                  : ""}
                {p.modelUsed ? ` · ${ocrEngineLabel(p.modelUsed)}` : ""}
                {` · 시도 ${p.attemptCount}회`}
              </span>
            </div>

            {p.errorCode && (
              <div className="px-3 py-2 bg-rose-50/60 border-b border-rose-100 text-[11px] text-rose-700">
                <span className="font-mono font-semibold">{p.errorCode}</span>
                {p.errorMessage ? ` — ${p.errorMessage}` : null}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              <div className="p-3 flex items-start justify-center bg-slate-50/50">
                {p.imageUrl ? (
                  <a href={p.imageUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.imageUrl}
                      alt={`${p.pageIndex + 1}페이지 업로드 이미지`}
                      className="max-h-64 w-auto max-w-full rounded border border-gray-200 bg-white"
                    />
                  </a>
                ) : (
                  <span className="text-[11px] text-gray-400 py-8">
                    이미지 없음
                  </span>
                )}
              </div>
              <div className="p-3">
                {p.text ? (
                  <>
                    <div className="text-[10px] text-gray-400 mb-1">
                      추출 텍스트 ({p.textLength.toLocaleString("ko-KR")}자
                      {p.textLength > p.text.length ? ", 일부 표시" : ""})
                    </div>
                    <TextBox text={p.text} maxHeight="max-h-56" />
                  </>
                ) : (
                  <span className="text-[11px] text-gray-400">
                    추출된 텍스트 없음
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {detail.pagesTruncated && (
          <div className="text-center text-[11px] text-gray-400">
            페이지가 많아 앞 30페이지만 표시합니다
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 공용 조각 ───────────────────────────────────────────────────────────────

function Notice({ text }: { text: string }) {
  return (
    <div className="py-12 text-center text-[12px] text-gray-400">{text}</div>
  );
}

function MetaRow({ entries }: { entries: Array<[string, string]> }) {
  return (
    <dl className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px]">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-1.5 min-w-0">
          <dt className="text-gray-400">{k}</dt>
          <dd className="text-gray-700 font-medium truncate max-w-[260px]">
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TextBox({
  text,
  maxHeight,
}: {
  text: string;
  maxHeight?: string;
}) {
  return (
    <pre
      className={cn(
        "rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-[11px] text-gray-700 whitespace-pre-wrap break-all overflow-y-auto font-sans",
        maxHeight ?? "max-h-64",
      )}
    >
      {text}
    </pre>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="text-[11px] text-gray-400 font-medium pt-1">{children}</div>
  );
}

function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
