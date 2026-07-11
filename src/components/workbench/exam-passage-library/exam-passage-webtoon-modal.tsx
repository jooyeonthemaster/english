"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ImageIcon, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExamPassage } from "@/lib/exam-passages/types";
import { formatExamTitle } from "@/lib/exam-passages/format";
import {
  EXAM_PASSAGE_WEBTOON_LANGUAGES,
  type ExamPassageWebtoonAssetSummary,
} from "@/lib/exam-passages/webtoon-assets";
import {
  languageLabel,
  WEBTOON_LANGUAGES,
  type WebtoonLanguageId,
} from "@/app/(director)/director/workbench/webtoon/webtoon-page-types";

interface ExamPassageWebtoonModalProps {
  passage: ExamPassage | null;
  assets: ExamPassageWebtoonAssetSummary[];
  onClose: () => void;
  onAssetUpdated: (asset: ExamPassageWebtoonAssetSummary) => void;
}

export function ExamPassageWebtoonModal({
  passage,
  assets,
  onClose,
  onAssetUpdated,
}: ExamPassageWebtoonModalProps) {
  const firstLanguage =
    EXAM_PASSAGE_WEBTOON_LANGUAGES.find((lang) =>
      assets.some((asset) => asset.language === lang),
    ) ?? "KO";
  const [language, setLanguage] = useState<WebtoonLanguageId>(firstLanguage);
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null);
  const byLanguage = useMemo(
    () => new Map(assets.map((asset) => [asset.language, asset])),
    [assets],
  );
  useEffect(() => {
    setLanguage(firstLanguage);
  }, [firstLanguage, passage?.id]);

  const selected = byLanguage.get(language) ?? byLanguage.get(firstLanguage) ?? assets[0] ?? null;

  const handlePurchase = async () => {
    if (!selected || busyAssetId) return;
    setBusyAssetId(selected.id);
    try {
      const res = await fetch(`/api/exam-passages/webtoons/${selected.id}/purchase`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        asset?: ExamPassageWebtoonAssetSummary;
        balance?: number;
        required?: number;
      };
      if (res.status === 402) {
        toast.error(
          `크레딧이 부족합니다. 보유 ${data.balance ?? "?"} / 필요 ${data.required ?? selected.credits}`,
        );
        return;
      }
      if (!res.ok || !data.ok || !data.asset) {
        throw new Error(data.error || "구매에 실패했습니다.");
      }
      onAssetUpdated(data.asset);
      toast.success("기출 웹툰 다운로드가 열렸어요.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "구매에 실패했습니다.");
    } finally {
      setBusyAssetId(null);
    }
  };

  const handleDownload = () => {
    if (!selected) return;
    window.location.href = `/api/exam-passages/webtoons/${selected.id}/download`;
  };

  return (
    <Dialog open={!!passage} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[94vw] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        {passage ? (
          <>
            <DialogHeader className="shrink-0 space-y-2 border-b border-slate-100 px-5 py-4 pr-10">
              <DialogTitle className="text-[15px] font-bold text-slate-900">
                {formatExamTitle(passage)} 웹툰
              </DialogTitle>
              <DialogDescription className="sr-only">
                검수 완료된 기출 지문 웹툰 미리보기와 다운로드
              </DialogDescription>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {EXAM_PASSAGE_WEBTOON_LANGUAGES.map((lang) => {
                  const asset = byLanguage.get(lang);
                  const meta = WEBTOON_LANGUAGES.find((item) => item.id === lang);
                  const active = selected?.language === lang;
                  return (
                    <button
                      key={lang}
                      type="button"
                      disabled={!asset}
                      aria-pressed={active}
                      onClick={() => asset && setLanguage(lang)}
                      className={
                        "rounded-xl border px-3 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-45 " +
                        (active
                          ? "border-blue-400 bg-blue-50/70 ring-1 ring-blue-200"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50")
                      }
                    >
                      <span
                        className={
                          "block truncate text-[12.5px] font-bold " +
                          (active ? "text-blue-900" : "text-slate-800")
                        }
                      >
                        {meta?.short ?? languageLabel(lang)}
                      </span>
                      <span className="mt-0.5 line-clamp-2 min-h-[2.8em] break-keep text-[10.5px] leading-snug text-slate-500">
                        {asset
                          ? asset.purchased
                            ? "다운로드 가능"
                            : `${asset.credits}크레딧으로 열기`
                          : "준비 중"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-950/95 p-4">
              {selected?.imageUrl ? (
                <button
                  type="button"
                  onClick={selected.purchased ? handleDownload : handlePurchase}
                  className="group relative mx-auto block max-h-[70vh] max-w-full overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-2xl"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selected.imageUrl}
                    alt={`${formatExamTitle(passage)} ${languageLabel(selected.language)} 웹툰`}
                    className={
                      "max-h-[70vh] w-auto max-w-full object-contain transition " +
                      (selected.previewBlurred ? "blur-[2px] saturate-75" : "")
                    }
                  />
                  {!selected.purchased ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-slate-950/20">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-[13px] font-bold text-slate-900 shadow-lg">
                        <Lock className="size-4" />
                        {selected.credits}크레딧으로 원본 열기
                      </span>
                    </span>
                  ) : null}
                </button>
              ) : (
                <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 text-center text-white/70">
                  <ImageIcon className="size-8" />
                  <p className="text-[13px] font-semibold">아직 승인된 웹툰이 없습니다.</p>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
              {selected?.purchased ? (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[12.5px] font-bold text-white transition hover:bg-blue-700"
                >
                  <Download className="size-4" />
                  다운로드
                </button>
              ) : selected ? (
                <button
                  type="button"
                  onClick={handlePurchase}
                  disabled={busyAssetId === selected.id}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[12.5px] font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
                >
                  {busyAssetId === selected.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Lock className="size-4" />
                  )}
                  {selected.credits}크레딧으로 다운로드 열기
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
