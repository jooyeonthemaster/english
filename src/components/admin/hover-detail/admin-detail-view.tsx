"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DETAIL_PREVIEW_FIELDS,
  DETAIL_PREVIEW_ROWS,
  DETAIL_ROW_ID_KEY,
  type AdminDetail,
  type AdminDetailField,
  type AdminDetailRowActionHandler,
  type AdminDetailSection,
} from "@/lib/admin-detail-types";

type Props = {
  detail: AdminDetail | null;
  loading: boolean;
  error: string | null;
  /** true = 호버 팝오버(요약 + 항목 일부 + 첫 표 상위 N행), false = 팝업 전체 */
  preview?: boolean;
  /** 팝오버 하단 "클릭하면…" 안내 — 클릭이 기존 동작(이동·편집)인 곳에선 끈다. */
  showClickHint?: boolean;
  /** 표의 rowAction 버튼 동작. 팝업(preview=false)에서만 쓰인다. */
  onRowAction?: AdminDetailRowActionHandler;
};

export function AdminDetailView({
  detail,
  loading,
  error,
  preview = false,
  showClickHint = true,
  onRowAction,
}: Props) {
  if (error) {
    return <p className="py-6 text-center text-[12.5px] text-rose-600">{error}</p>;
  }
  if (!detail) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-gray-400">
        <Loader2 className="size-4 animate-spin" />
        불러오는 중
      </div>
    );
  }

  const summary = detail.summary ?? [];
  const fields = detail.fields ?? [];
  const sections = detail.sections ?? [];
  const shownSections = preview ? sections.slice(0, 1) : sections;
  const hasMore =
    preview &&
    (fields.length > DETAIL_PREVIEW_FIELDS ||
      sections.length > 1 ||
      sections.some((s) => s.rows.length > DETAIL_PREVIEW_ROWS));

  return (
    <div className={cn("space-y-4", loading && "opacity-60")}>
      {summary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.map((s) => (
            <div key={s.label} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-[11px] text-gray-400">{s.label}</div>
              <div className="text-[14px] font-semibold text-gray-900">{s.value}</div>
            </div>
          ))}
        </div>
      )}
      {/* 클릭 상세가 없는(기존 클릭 유지) 팝오버는 항목을 자르지 않는다 — 더 볼 곳이 없으므로. */}
      {fields.length > 0 && (
        <FieldList fields={fields} preview={preview} limit={preview && showClickHint} />
      )}
      {shownSections.map((section, i) => (
        <DetailTable
          key={section.title ?? i}
          section={section}
          preview={preview}
          onRowAction={preview ? undefined : onRowAction}
        />
      ))}
      {preview && showClickHint && (
        <p className="text-[11px] text-gray-400">
          {hasMore ? "클릭하면 전체 내역을 볼 수 있어요" : "클릭하면 크게 볼 수 있어요"}
        </p>
      )}
      {!preview && detail.link && (
        <Link
          href={detail.link.href}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:underline"
        >
          {detail.link.label} <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

function FieldList({
  fields,
  preview,
  limit,
}: {
  fields: AdminDetailField[];
  preview: boolean;
  limit: boolean;
}) {
  const shown = limit ? fields.slice(0, DETAIL_PREVIEW_FIELDS) : fields;
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-2 text-[12.5px]",
        preview ? "grid-cols-[auto_minmax(0,1fr)]" : "sm:grid-cols-2",
      )}
    >
      {shown.map((f) =>
        preview ? (
          <div key={f.label} className="contents">
            <dt className="whitespace-nowrap text-gray-400">{f.label}</dt>
            <dd className="line-clamp-2 break-keep text-gray-800">{f.value}</dd>
          </div>
        ) : (
          <div
            key={f.label}
            className={cn("rounded-lg bg-gray-50/70 px-3 py-2", f.wide && "sm:col-span-2")}
          >
            <dt className="text-[11px] text-gray-400">{f.label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words text-gray-800">{f.value}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

function DetailTable({
  section,
  preview,
  onRowAction,
}: {
  section: AdminDetailSection;
  preview: boolean;
  onRowAction?: AdminDetailRowActionHandler;
}) {
  const rows = preview ? section.rows.slice(0, DETAIL_PREVIEW_ROWS) : section.rows;
  const hidden = section.rows.length - rows.length;
  const rowAction = onRowAction ? section.rowAction : undefined;
  // 처리한 행은 팝업을 닫을 때까지 흐리게 남겨 되돌릴 수 있게 한다.
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runRowAction = async (rowId: string, done: boolean) => {
    if (!onRowAction) return;
    setPendingId(rowId);
    setActionError(null);
    try {
      await onRowAction(rowId, done);
      setDoneIds((prev) => {
        const next = new Set(prev);
        if (done) next.add(rowId);
        else next.delete(rowId);
        return next;
      });
    } catch {
      setActionError("처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div>
      {section.title && (
        <h4 className="mb-1.5 text-[12px] font-semibold text-gray-500">{section.title}</h4>
      )}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-[12px] text-gray-400">
          {section.emptyText ?? "내역이 없습니다"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50/70 text-gray-400">
              <tr>
                {section.columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap px-3 py-2 font-medium",
                      c.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {c.label}
                  </th>
                ))}
                {rowAction && (
                  <th className="px-3 py-2">
                    <span className="sr-only">처리</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, i) => {
                const rowId = row[DETAIL_ROW_ID_KEY];
                const done = rowId ? doneIds.has(rowId) : false;
                return (
                  <tr key={rowId ?? i}>
                    {section.columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-3 py-2 align-top text-gray-700",
                          done && "opacity-40",
                          c.align === "right" && "text-right font-medium tabular-nums",
                          c.wide
                            ? "min-w-[180px] whitespace-normal break-keep leading-5"
                            : "whitespace-nowrap",
                        )}
                      >
                        {/* 팝오버는 높이를 지키려 긴 글만 2줄까지, 팝업은 전부 보여준다. */}
                        <div className={cn(c.wide && preview && "line-clamp-2")}>
                          {row[c.key] ?? "—"}
                        </div>
                      </td>
                    ))}
                    {rowAction && (
                      <td className="whitespace-nowrap py-1.5 pl-1 pr-3 text-right align-top">
                        {rowId &&
                          (done ? (
                            <div className="inline-flex h-7 items-center gap-0.5">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                                <Check className="size-3" strokeWidth={2.5} />
                                {rowAction.doneLabel}
                              </span>
                              <button
                                type="button"
                                disabled={pendingId === rowId}
                                onClick={() => void runRowAction(rowId, false)}
                                title="되돌리기"
                                aria-label="되돌리기"
                                className="inline-flex size-6 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                              >
                                <Undo2 className="size-3.5" strokeWidth={2} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={pendingId === rowId}
                              onClick={() => void runRowAction(rowId, true)}
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 px-2 text-[11px] font-semibold text-gray-500 transition hover:bg-gray-50 disabled:opacity-50"
                            >
                              {pendingId === rowId ? (
                                <Loader2 className="size-3 animate-spin" strokeWidth={2} />
                              ) : (
                                <Check className="size-3" strokeWidth={2} />
                              )}
                              {rowAction.label}
                            </button>
                          ))}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {actionError && <p className="mt-1.5 text-[11px] text-rose-600">{actionError}</p>}
      {hidden > 0 && <p className="mt-1.5 text-[11px] text-gray-400">외 {hidden}건</p>}
    </div>
  );
}
