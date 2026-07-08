import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookOpen, Download, ExternalLink, Wrench } from "lucide-react";
import { getStaffSession } from "@/lib/auth";
import { getManualPdf } from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "사용 매뉴얼",
};

export const dynamic = "force-dynamic";

export default async function ManualPage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  const manual = await getManualPdf();

  // 매뉴얼 미게시 — 관리자가 업로드할 때까지 "준비 중"으로 안내한다.
  if (!manual) {
    return (
      <div className="bg-card rounded-2xl border border-border shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BookOpen className="size-5" strokeWidth={1.9} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">사용 매뉴얼</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              스모트의 모든 기능을 한 문서로 안내합니다
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
            <Wrench className="size-6" strokeWidth={1.7} />
          </span>
          <p className="mt-4 text-base font-semibold text-slate-700">
            사용 매뉴얼을 준비하고 있어요
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            더 정확하고 친절한 안내서를 만들고 있습니다. 곧 이 화면에서 열람하실 수 있어요.
          </p>
        </div>
      </div>
    );
  }

  const manualUrl = manual.url;
  const updatedLabel = new Date(manual.updatedAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BookOpen className="size-5" strokeWidth={1.9} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">사용 매뉴얼</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              스모트의 모든 기능을 한 문서로 안내합니다 · 최근 업데이트 {updatedLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={manualUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:text-blue-600"
          >
            <ExternalLink className="size-4" />
            새 탭으로 열기
          </a>
          <a
            href={manualUrl}
            download="스모트-사용매뉴얼.pdf"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Download className="size-4" />
            다운로드
          </a>
        </div>
      </div>

      {/* Desktop: 내장 미리보기 */}
      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <iframe
            src={`${manualUrl}#view=FitH`}
            title="스모트 사용 매뉴얼 미리보기"
            className="h-[78vh] w-full"
          />
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          미리보기가 보이지 않으면 위의 <span className="font-medium">새 탭으로 열기</span> 또는{" "}
          <span className="font-medium">다운로드</span>를 이용하세요.
        </p>
      </div>

      {/* Mobile: 내장 미리보기가 불안정하므로 다운로드/새 탭 중심 */}
      <div className="lg:hidden">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <BookOpen className="size-6" strokeWidth={1.8} />
          </span>
          <p className="mt-3 text-sm font-medium text-slate-700">
            모바일에서는 새 탭 열기 또는 다운로드로 보시는 것을 권장합니다
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF 문서라 큰 화면(PC)에서 보시면 더 편합니다.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <a
              href={manualUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <ExternalLink className="size-4" />
              새 탭으로 열기
            </a>
            <a
              href={manualUrl}
              download="스모트-사용매뉴얼.pdf"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-blue-200 hover:text-blue-600"
            >
              <Download className="size-4" />
              다운로드
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
