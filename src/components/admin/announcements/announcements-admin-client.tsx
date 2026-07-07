"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Megaphone,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  Sparkles,
  MonitorUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  CATEGORY_LABELS,
  CATEGORY_BADGE_CLASS,
  parseAnnouncementAudiences,
  ROLE_LABELS,
  ALL_ANNOUNCEMENT_ROLES,
  type AnnouncementCategory,
} from "@/lib/announcements/shared";
import {
  deleteAnnouncement,
  setAnnouncementStatus,
  toggleAnnouncementPinned,
  type AdminAnnouncementDto,
} from "@/actions/admin-announcements";
import { AnnouncementEditorModal } from "./announcement-editor-modal";

const PAGE_SIZE = 10;

const CATEGORY_PILLS: { value: "ALL" | AnnouncementCategory; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "UPDATE", label: CATEGORY_LABELS.UPDATE },
  { value: "MAINTENANCE", label: CATEGORY_LABELS.MAINTENANCE },
  { value: "EVENT", label: CATEGORY_LABELS.EVENT },
  { value: "GENERAL", label: CATEGORY_LABELS.GENERAL },
];

// 노출 체계: 이용자에게 보이면 "노출 중"(PUBLISHED), 아니면 "미노출"(DRAFT·ARCHIVED).
const VISIBILITY_PILLS = [
  { value: "ALL", label: "전체" },
  { value: "VISIBLE", label: "노출 중" },
  { value: "HIDDEN", label: "미노출" },
];

/** 이용자에게 노출되는 상태인지. */
function isVisible(status: string): boolean {
  return status === "PUBLISHED";
}

function audienceLabel(audiences: string): string {
  const roles = parseAnnouncementAudiences(audiences);
  if (roles.length === ALL_ANNOUNCEMENT_ROLES.length) return "전체";
  return roles.map((r) => ROLE_LABELS[r]).join("·");
}

export function AnnouncementsAdminClient({
  initialAnnouncements,
}: {
  initialAnnouncements: AdminAnnouncementDto[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialAnnouncements);
  const [, startTransition] = useTransition();
  const [category, setCategory] = useState<"ALL" | AnnouncementCategory>("ALL");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAnnouncementDto | null>(null);

  useEffect(() => {
    setItems(initialAnnouncements);
  }, [initialAnnouncements]);

  // 필터 변경 시 첫 페이지로.
  useEffect(() => {
    setPage(1);
  }, [category, status, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((a) => {
      if (category !== "ALL" && a.category !== category) return false;
      if (status === "VISIBLE" && !isVisible(a.status)) return false;
      if (status === "HIDDEN" && isVisible(a.status)) return false;
      if (q && !(`${a.title} ${a.content}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, category, status, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }
  function openEdit(a: AdminAnnouncementDto) {
    setEditing(a);
    setEditorOpen(true);
  }

  async function toggleVisible(a: AdminAnnouncementDto) {
    const next = isVisible(a.status) ? "ARCHIVED" : "PUBLISHED";
    const res = await setAnnouncementStatus(a.id, next);
    if (res.success) {
      toast.success(next === "PUBLISHED" ? "이용자에게 노출했어요." : "노출을 껐어요.");
      refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handlePin(a: AdminAnnouncementDto) {
    const res = await toggleAnnouncementPinned(a.id, !a.isPinned);
    if (res.success) refresh();
    else toast.error(res.error);
  }

  // 공지 본문을 배너 문구용으로 정리(마크다운 기호 제거, 앞 몇 줄만).
  function bannerBodyFromContent(content: string): string {
    return content
      .split("\n")
      .map((l) =>
        l
          .replace(/^\s*[-*•]\s+/, "· ")
          .replace(/^#{1,6}\s+/, "")
          .replace(/\*\*/g, "")
          .trim(),
      )
      .filter(Boolean)
      .slice(0, 4)
      .join("\n")
      .slice(0, 300);
  }

  function openAsBanner(a: AdminAnnouncementDto) {
    const params = new URLSearchParams({
      prefill: "announcement",
      title: a.title,
      eyebrow: CATEGORY_LABELS[a.category as AnnouncementCategory] ?? "공지",
      heading: a.title,
      body: bannerBodyFromContent(a.content),
    });
    router.push(`/admin/banners?${params.toString()}`);
  }

  async function handleDelete(a: AdminAnnouncementDto) {
    if (!confirm(`"${a.title}" 공지를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    const res = await deleteAnnouncement(a.id);
    if (res.success) {
      toast.success("삭제했어요.");
      refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORY_PILLS.map((p) => (
            <button
              key={p.value}
              onClick={() => setCategory(p.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-medium transition",
                category === p.value
                  ? "bg-slate-900 text-white"
                  : "bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] text-gray-600 outline-none focus:border-blue-400"
          >
            {VISIBILITY_PILLS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목·내용 검색"
              className="h-9 w-48 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[12px] outline-none focus:border-blue-400"
            />
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />새 공지
          </Button>
        </div>
      </div>

      {/* 목록 */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
            <Megaphone className="size-10 opacity-30" />
            <p className="text-[13px]">표시할 공지가 없습니다</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {paged.map((a) => (
              <li
                key={a.id}
                onClick={() => openEdit(a)}
                className="flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    {a.isPinned && (
                      <Pin className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                    )}
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                        CATEGORY_BADGE_CLASS[a.category as AnnouncementCategory] ??
                          "bg-slate-100 text-slate-600",
                      )}
                    >
                      {CATEGORY_LABELS[a.category as AnnouncementCategory] ?? a.category}
                    </span>
                    {a.sourceType === "RELEASE" && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">
                        <Sparkles className="size-2.5" />
                        자동 발행
                      </span>
                    )}
                    {a.sourceType === "AUTO" && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">
                        <Sparkles className="size-2.5" />
                        AI 초안
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[13.5px] font-semibold text-gray-900">
                    {a.title}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-gray-400">
                    대상 {audienceLabel(a.audiences)}
                    {a.publishedAt
                      ? ` · 게시 ${formatDateTime(a.publishedAt)}`
                      : " · 게시일 미정"}
                  </p>
                </div>

                {/* 액션 — 행 클릭(수정 열기)과 분리 */}
                <div
                  className="flex shrink-0 items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 노출 상태 텍스트 + ON/OFF 스위치 */}
                  <span
                    className={cn(
                      "text-[11.5px] font-semibold",
                      isVisible(a.status) ? "text-blue-600" : "text-slate-400",
                    )}
                  >
                    {isVisible(a.status) ? "노출 중" : "미노출"}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isVisible(a.status)}
                    onClick={() => toggleVisible(a)}
                    title={isVisible(a.status) ? "노출 중 · 끄기" : "미노출 · 켜기"}
                    aria-label={isVisible(a.status) ? "노출 끄기" : "노출 켜기"}
                    className={cn(
                      "relative mr-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                      isVisible(a.status) ? "bg-blue-600" : "bg-slate-300",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                        isVisible(a.status) ? "translate-x-[22px]" : "translate-x-0.5",
                      )}
                    />
                  </button>
                  <IconBtn
                    title={a.isPinned ? "고정 해제" : "상단 고정"}
                    onClick={() => handlePin(a)}
                  >
                    {a.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                  </IconBtn>
                  <IconBtn title="배너로 띄우기" onClick={() => openAsBanner(a)}>
                    <MonitorUp className="size-3.5" />
                  </IconBtn>
                  <IconBtn title="수정" onClick={() => openEdit(a)}>
                    <Pencil className="size-3.5" />
                  </IconBtn>
                  <IconBtn title="삭제" danger onClick={() => handleDelete(a)}>
                    <Trash2 className="size-3.5" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
        <AdminPagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      <AnnouncementEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        initialCategory={category !== "ALL" ? category : undefined}
        onSaved={refresh}
      />
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100",
        danger ? "hover:bg-red-50 hover:text-red-500" : "hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}
