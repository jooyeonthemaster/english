"use client";

// 추적 링크 목록 표 — 이름·짧은 URL 복사·목적지·UTM 배지·기간 클릭·유입 세션·가입·매출·활성 토글·수정·삭제.
// 행을 누르면 펼쳐져 일별 클릭 차트와 「이 링크 유입 방문 보기」가 나온다.
//
// - canEdit(SUPER_ADMIN) 이 아니면 활성 토글·수정·삭제 열을 아예 그리지 않는다(눌러도 403 만 나던 컨트롤).
// - 비활성 링크는 기본으로 접는다 — 통계 보존 때문에 실삭제되지 않고 영구히 쌓이는 목록이라(D9)
//   활성 링크가 그 아래로 밀리면 운영자가 쓰는 링크를 못 찾는다.
// - clicksUnfiltered: 상단 공용 필터가 클릭 열에는 안 걸린다는 표시(흐리게 + 열 제목에 명시).

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, EyeOff, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TrackedLinkRow } from "@/lib/analytics/reports/links";
import { fmtInt, fmtKrw } from "@/lib/analytics/format";
import { shortLinkUrl } from "@/lib/analytics/tracked-links";
import { cn } from "@/lib/utils";
import { LinkApiError, useLinkMutations } from "./link-api";
import { deleteMode, LinkDeleteDialog } from "./link-delete-dialog";
import { CopyIconButton } from "./link-form-parts";
import { LinkRowDetail } from "./link-row-detail";

interface WrapState {
  width: number | null;
  scrollable: boolean;
  atStart: boolean;
  atEnd: boolean;
}

const INITIAL_WRAP: WrapState = { width: null, scrollable: false, atStart: true, atEnd: true };

export function LinksTable({
  links,
  shortBase,
  sharedQuery,
  highlightSlug,
  canEdit,
  clicksUnfiltered,
  onEdit,
}: {
  links: TrackedLinkRow[];
  shortBase: string;
  sharedQuery: string;
  highlightSlug?: string;
  canEdit: boolean;
  clicksUnfiltered: boolean;
  onEdit: (link: TrackedLinkRow) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TrackedLinkRow | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const { update, remove } = useLinkMutations();

  const inactive = useMemo(() => links.filter((l) => !l.isActive), [links]);
  // 필터로 지목된 링크가 비활성이면 접어 두면 안 된다(빈 표처럼 보인다).
  const forceShowInactive = !!highlightSlug && inactive.some((l) => l.slug === highlightSlug);
  const inactiveShown = showInactive || forceShowInactive;
  const visible = useMemo(() => (inactiveShown ? links : links.filter((l) => l.isActive)), [links, inactiveShown]);
  const cols = canEdit ? 11 : 8;

  async function toggleActive(link: TrackedLinkRow) {
    try {
      await update.mutateAsync({ id: link.id, patch: { isActive: !link.isActive } });
      toast.success(link.isActive ? "링크를 껐습니다 — 클릭 시 홈으로 이동합니다" : "링크를 다시 켰습니다");
    } catch (err) {
      toast.error(err instanceof LinkApiError ? err.message : "변경하지 못했습니다");
    }
  }

  async function confirmDelete() {
    const target = deleting;
    if (!target) return;
    try {
      const res = await remove.mutateAsync({ id: target.id });
      toast.success(res.result === "deleted" ? "추적 링크를 삭제했습니다" : "클릭 기록이 있어 비활성으로 전환했습니다(통계 보존)");
      if (openId === target.id && res.result === "deleted") setOpenId(null);
    } catch (err) {
      toast.error(err instanceof LinkApiError ? err.message : "삭제하지 못했습니다");
    } finally {
      setDeleting(null);
    }
  }

  const togglingId = update.isPending ? update.variables?.id : null;

  // 펼침 상세는 가로 스크롤 표 안에 있어도 보이는 폭(스크롤 컨테이너 폭)에 맞춰 고정한다(모바일 390px).
  // 같은 관측으로 「가로로 더 있다」 단서도 만든다 — 표가 960px 고정이라 390px 에서는 클릭·가입·매출이
  // 통째로 화면 밖인데, 단서가 없으면 운영자는 열이 원래 이것뿐이라고 읽는다.
  // (감독의 공용 <ScrollableX> 가 들어오면 이 블록을 그것으로 교체한다 — 계약 속성은 같게 둔다.)
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrap, setWrap] = useState<WrapState>(INITIAL_WRAP);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      const next: WrapState = {
        width: el.clientWidth,
        scrollable: max > 1,
        atStart: el.scrollLeft <= 1,
        atEnd: el.scrollLeft >= max - 1,
      };
      setWrap((prev) =>
        prev.width === next.width && prev.scrollable === next.scrollable && prev.atStart === next.atStart && prev.atEnd === next.atEnd
          ? prev
          : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [visible.length, openId]);

  return (
    <>
      <div className="relative -mx-5">
      <div ref={wrapRef} data-scrollable-x="" className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left">
          <thead>
            <tr className="border-b border-gray-100 text-[11px] font-semibold text-gray-400">
              <th className="w-8 py-2 pl-5" aria-label="펼치기" />
              <th className="py-2 pr-3 font-semibold">이름 · 짧은 주소</th>
              <th className="px-2 py-2 font-semibold">목적지</th>
              <th className="px-2 py-2 font-semibold">UTM</th>
              <th
                className={cn("px-2 py-2 text-right font-semibold whitespace-nowrap", clicksUnfiltered && "text-gray-300")}
                title={clicksUnfiltered ? "상단 필터가 적용되지 않는 값(전체 클릭)" : undefined}
              >
                기간 클릭{clicksUnfiltered ? " (필터 미적용)" : ""}
              </th>
              <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">유입 세션</th>
              <th className="px-2 py-2 text-right font-semibold">가입</th>
              <th className="px-2 py-2 text-right font-semibold">매출</th>
              {canEdit && (
                <>
                  <th className="px-2 py-2 text-center font-semibold">활성</th>
                  <th className="py-2 pr-5 text-right font-semibold" colSpan={2}>
                    관리
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((link) => {
              const open = openId === link.id;
              const shortUrl = shortLinkUrl(shortBase, link.slug);
              return (
                <Fragment key={link.id}>
                  <tr
                    onClick={() => setOpenId(open ? null : link.id)}
                    className={cn(
                      "cursor-pointer border-b border-gray-50 align-middle transition-colors hover:bg-blue-50/40",
                      open && "bg-blue-50/30",
                      highlightSlug === link.slug && "bg-amber-50/60",
                      !link.isActive && "text-gray-400",
                    )}
                  >
                    <td className="py-2.5 pl-5">
                      {/* 클릭은 행(tr)으로 버블링돼 펼침을 토글한다 — 버튼은 키보드 접근용 */}
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={open ? `${link.label} 접기` : `${link.label} 펼치기`}
                        className="inline-flex size-6 items-center justify-center rounded-md hover:bg-white"
                      >
                        <ChevronRight
                          className={cn("size-4 text-gray-300 transition-transform", open && "rotate-90 text-blue-500")}
                          aria-hidden
                        />
                      </button>
                    </td>
                    <td className="max-w-[240px] py-2.5 pr-3">
                      <div
                        className={cn("truncate text-[13px] font-semibold", link.isActive ? "text-gray-800" : "text-gray-400")}
                        title={link.label}
                      >
                        {link.label}
                        {!link.isActive && <span className="ml-1.5 text-[11px] font-medium text-gray-400">(꺼짐)</span>}
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1">
                        <code className="truncate font-mono text-[11.5px] text-blue-600" title={shortUrl}>
                          /go/{link.slug}
                        </code>
                        <CopyIconButton text={shortUrl} message="짧은 주소를 복사했습니다" className="size-6" />
                      </div>
                    </td>
                    <td className="max-w-[160px] px-2 py-2.5">
                      <code className="block truncate font-mono text-[12px] text-gray-600" title={link.destination}>
                        {link.destination}
                      </code>
                    </td>
                    <td className="max-w-[220px] px-2 py-2.5">
                      <UtmBadges link={link} />
                    </td>
                    <td className={cn("px-2 py-2.5 text-right tabular-nums", clicksUnfiltered && "opacity-45")}>
                      <div className="text-[13px] font-semibold text-gray-800">{fmtInt(link.periodClicks)}</div>
                      <div className="text-[11px] text-gray-400">누적 {fmtInt(link.totalClicks)}</div>
                    </td>
                    <td className="px-2 py-2.5 text-right text-[13px] tabular-nums text-gray-700">{fmtInt(link.sessions)}</td>
                    <td className="px-2 py-2.5 text-right text-[13px] tabular-nums text-gray-700">{fmtInt(link.signups)}</td>
                    <td className="px-2 py-2.5 text-right text-[13px] tabular-nums text-gray-700 whitespace-nowrap">
                      {link.revenue ? fmtKrw(link.revenue) : "-"}
                    </td>
                    {canEdit && (
                      <>
                        <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <ActiveSwitch
                            checked={link.isActive}
                            pending={togglingId === link.id}
                            onChange={() => void toggleActive(link)}
                            label={`${link.label} 활성`}
                          />
                        </td>
                        <td className="py-2.5 pr-1 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onEdit(link)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            aria-label={`${link.label} 수정`}
                            title="수정"
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </button>
                        </td>
                        <td className="py-2.5 pr-5 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setDeleting(link)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`${link.label} ${deleteMode(link) === "delete" ? "삭제" : "비활성"}`}
                            title={deleteMode(link) === "delete" ? "삭제" : "비활성(통계 보존)"}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                  {open && (
                    <tr className="border-b border-gray-100 bg-gray-50/40">
                      <td colSpan={cols} className="px-5 py-4">
                        <div className="sticky left-5" style={wrap.width ? { width: Math.max(260, wrap.width - 40) } : undefined}>
                          <LinkRowDetail
                            link={link}
                            shortBase={shortBase}
                            sharedQuery={sharedQuery}
                            clicksUnfiltered={clicksUnfiltered}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={cols} className="px-5 py-6 text-center text-[12.5px] text-gray-400">
                  켜져 있는 추적 링크가 없습니다 — 아래에서 비활성 링크를 펼쳐 볼 수 있습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
        {wrap.scrollable && !wrap.atStart && (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent" aria-hidden />
        )}
        {wrap.scrollable && !wrap.atEnd && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent" aria-hidden />
        )}
      </div>

      {wrap.scrollable && (
        <p data-scroll-hint="" className="pt-1.5 text-[11px] text-gray-400">
          ↔ 좌우로 밀어 더 보기 — 클릭·유입 세션·가입·매출은 오른쪽에 있습니다(행을 누르면 한눈에 볼 수 있습니다)
        </p>
      )}

      {inactive.length > 0 && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            disabled={forceShowInactive}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-60"
          >
            <EyeOff className="size-3.5" aria-hidden />
            {forceShowInactive
              ? `비활성 ${fmtInt(inactive.length)}개 표시 중(필터로 지목됨)`
              : inactiveShown
                ? `비활성 ${fmtInt(inactive.length)}개 숨기기`
                : `비활성 ${fmtInt(inactive.length)}개 보기`}
          </button>
        </div>
      )}

      <LinkDeleteDialog
        link={deleting}
        pending={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

function UtmBadges({ link }: { link: TrackedLinkRow }) {
  const items: Array<[string, string | null]> = [
    ["source", link.utmSource],
    ["medium", link.utmMedium],
    ["campaign", link.utmCampaign],
    ["content", link.utmContent],
    ["term", link.utmTerm],
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {items
        .filter((x): x is [string, string] => !!x[1])
        .map(([k, v]) => (
          <span
            key={k}
            title={`utm_${k}=${v}`}
            className={cn(
              "inline-flex max-w-[140px] items-center truncate rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
              k === "source" || k === "medium"
                ? "border-blue-100 bg-blue-50 text-blue-700"
                : "border-gray-100 bg-gray-50 text-gray-600",
            )}
          >
            {v}
          </span>
        ))}
    </div>
  );
}

function ActiveSwitch({
  checked,
  pending,
  onChange,
  label,
}: {
  checked: boolean;
  pending: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={pending}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
        checked ? "bg-blue-600" : "bg-gray-200",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
