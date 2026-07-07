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
  Send,
  Trash2,
  Archive,
  Undo2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  CATEGORY_LABELS,
  CATEGORY_BADGE_CLASS,
  STATUS_LABELS,
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

const STATUS_PILLS = [
  { value: "ALL", label: "전체 상태" },
  { value: "PUBLISHED", label: "발행됨" },
  { value: "DRAFT", label: "초안" },
  { value: "ARCHIVED", label: "보관됨" },
];

function audienceLabel(audiences: string): string {
  const roles = parseAnnouncementAudiences(audiences);
  if (roles.length === ALL_ANNOUNCEMENT_ROLES.length) return "전체";
  return roles.map((r) => ROLE_LABELS[r]).join("·");
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "PUBLISHED":
      return "bg-emerald-50 text-emerald-600";
    case "ARCHIVED":
      return "bg-slate-100 text-slate-500";
    default:
      return "bg-amber-50 text-amber-700";
  }
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
      if (status !== "ALL" && a.status !== status) return false;
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

  async function handleStatus(a: AdminAnnouncementDto, next: string) {
    const res = await setAnnouncementStatus(a.id, next);
    if (res.success) {
      toast.success(
        next === "PUBLISHED"
          ? "발행했어요."
          : next === "ARCHIVED"
            ? "보관했어요."
            : "초안으로 되돌렸어요.",
      );
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
            {STATUS_PILLS.map((s) => (
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
              <li key={a.id} className="flex items-start gap-3 px-4 py-3.5">
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
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                        statusBadgeClass(a.status),
                      )}
                    >
                      {STATUS_LABELS[a.status as keyof typeof STATUS_LABELS] ?? a.status}
                    </span>
                    {a.sourceType === "RELEASE" && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">
                        <Sparkles className="size-2.5" />
                        자동 발행
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[13.5px] font-semibold text-gray-900">
                    {a.title}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-gray-400">
                    노출 {audienceLabel(a.audiences)}
                    {a.publishedAt
                      ? ` · 게시 ${formatDateTime(a.publishedAt)}`
                      : " · 게시일 미정"}
                  </p>
                </div>

                {/* 액션 */}
                <div className="flex shrink-0 items-center gap-0.5">
                  {a.status !== "PUBLISHED" ? (
                    <IconBtn title="발행" onClick={() => handleStatus(a, "PUBLISHED")}>
                      <Send className="size-3.5" />
                    </IconBtn>
                  ) : (
                    <IconBtn title="보관" onClick={() => handleStatus(a, "ARCHIVED")}>
                      <Archive className="size-3.5" />
                    </IconBtn>
                  )}
                  {a.status === "ARCHIVED" && (
                    <IconBtn title="초안으로" onClick={() => handleStatus(a, "DRAFT")}>
                      <Undo2 className="size-3.5" />
                    </IconBtn>
                  )}
                  <IconBtn
                    title={a.isPinned ? "고정 해제" : "상단 고정"}
                    onClick={() => handlePin(a)}
                  >
                    {a.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
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
