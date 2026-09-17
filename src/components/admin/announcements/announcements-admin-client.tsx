"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AdminEmptyState,
  FilterBar,
  FilterChipGroup,
  PageHeader,
  ResultCount,
  SearchInput,
  useConfirm,
} from "@/components/admin/kit";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import { useSearchDebounce } from "@/hooks/use-search-debounce";
import { CATEGORY_LABELS, type AnnouncementCategory } from "@/lib/announcements/shared";
import {
  deleteAnnouncement,
  setAnnouncementStatus,
  toggleAnnouncementPinned,
  type AdminAnnouncementDto,
} from "@/actions/admin-announcements";
import { AnnouncementEditorModal } from "./announcement-editor-modal";
import { announcementRowDetail } from "./announcements-admin-client-parts/announcement-hover-detail";
import { AnnouncementRow } from "./announcements-admin-client-parts/announcement-row";
import {
  CATEGORY_FILTERS,
  VISIBILITY_FILTERS,
  audienceLabel,
  bannerBodyFromContent,
  isVisible,
  type VisibilityFilter,
} from "./announcements-admin-client-parts/announcement-labels";

const PAGE_SIZE = 10;

export function AnnouncementsAdminClient({
  initialAnnouncements,
}: {
  initialAnnouncements: AdminAnnouncementDto[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = useState(initialAnnouncements);
  const [, startTransition] = useTransition();
  const [category, setCategory] = useState<"ALL" | AnnouncementCategory>("ALL");
  const [status, setStatus] = useState<VisibilityFilter>("ALL");
  // 검색은 타이핑 즉시 표시값 갱신 + 250ms 뒤 커밋(라이브 필터).
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const { schedule, flush } = useSearchDebounce(setSearch);
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

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<"ALL" | AnnouncementCategory, number>> = { ALL: items.length };
    for (const a of items) {
      const key = a.category as AnnouncementCategory;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((a) => {
      if (category !== "ALL" && a.category !== category) return false;
      if (status === "VISIBLE" && !isVisible(a.status)) return false;
      if (status === "HIDDEN" && isVisible(a.status)) return false;
      if (q && !`${a.title} ${a.content}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, category, status, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(value: string) {
    setSearchInput(value);
    if (value.trim() === "") flush("");
    else schedule(value);
  }

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
    const ok = await confirm({
      title: `"${a.title}" 공지를 삭제할까요?`,
      description: "삭제하면 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    const res = await deleteAnnouncement(a.id);
    if (res.success) {
      toast.success("삭제했어요.");
      refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="스모트 소식"
        description="전체 이용자에게 노출되는 플랫폼 공지를 작성·발행합니다. 배포 시 릴리즈 노트로 자동 발행되는 소식도 여기서 함께 관리합니다."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />새 공지
          </Button>
        }
      />

      <FilterBar
        right={<ResultCount total={filtered.length} page={page} totalPages={totalPages} />}
      >
        <SearchInput
          value={searchInput}
          onChange={handleSearch}
          placeholder="제목·내용 검색"
          ariaLabel="공지 검색"
        />
        <FilterChipGroup
          options={CATEGORY_FILTERS}
          value={category}
          onChange={setCategory}
          counts={categoryCounts}
          ariaLabel="카테고리"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as VisibilityFilter)}>
          <SelectTrigger size="sm" aria-label="노출 상태" className="text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITY_FILTERS.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
        {filtered.length === 0 ? (
          <AdminEmptyState
            icon={Megaphone}
            title="표시할 공지가 없습니다"
            description={
              items.length === 0
                ? "새 공지를 작성해 이용자에게 소식을 알려보세요."
                : "검색어나 필터를 바꿔보세요."
            }
          />
        ) : (
          <ul className="divide-y divide-gray-50">
            {paged.map((a) => (
              // 호버=본문 미리보기·날짜 등 상세, 클릭=기존 편집창 그대로
              <AdminHoverDetail
                key={a.id}
                title={a.title}
                detail={announcementRowDetail(a, {
                  visibility: isVisible(a.status) ? "노출 중" : "미노출",
                  audience: audienceLabel(a.audiences),
                })}
                click="none"
              >
                <AnnouncementRow
                  announcement={a}
                  onOpen={() => openEdit(a)}
                  onToggleVisible={() => toggleVisible(a)}
                  onPin={() => handlePin(a)}
                  onBanner={() => openAsBanner(a)}
                  onDelete={() => handleDelete(a)}
                />
              </AdminHoverDetail>
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
