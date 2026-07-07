"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn, datetimeLocalToIso, isoToDatetimeLocal } from "@/lib/utils";
import {
  ANNOUNCEMENT_CATEGORIES,
  CATEGORY_LABELS,
  ALL_ANNOUNCEMENT_ROLES,
  ROLE_LABELS,
  parseAnnouncementAudiences,
  type AnnouncementCategory,
  type AnnouncementRole,
  type AnnouncementStatus,
} from "@/lib/announcements/shared";
import {
  createAnnouncement,
  updateAnnouncement,
  type AdminAnnouncementDto,
} from "@/actions/admin-announcements";
import { AnnouncementBody } from "@/components/announcements/announcement-body";

interface Draft {
  title: string;
  content: string;
  category: AnnouncementCategory;
  status: AnnouncementStatus;
  isPinned: boolean;
  audiences: AnnouncementRole[];
  publishedAt: string; // datetime-local 문자열
}

function emptyDraft(): Draft {
  return {
    title: "",
    content: "",
    category: "UPDATE",
    status: "DRAFT",
    isPinned: false,
    audiences: [], // 빈 배열 = 전체
    publishedAt: "",
  };
}

function fromDto(dto: AdminAnnouncementDto): Draft {
  const roles = parseAnnouncementAudiences(dto.audiences);
  return {
    title: dto.title,
    content: dto.content,
    category: (dto.category as AnnouncementCategory) ?? "UPDATE",
    status: (dto.status as AnnouncementStatus) ?? "DRAFT",
    isPinned: dto.isPinned,
    // "ALL"(전체)이면 편집기에선 아무 것도 체크 안 함 상태로 표시.
    audiences: roles.length === ALL_ANNOUNCEMENT_ROLES.length ? [] : roles,
    publishedAt: dto.publishedAt ? isoToDatetimeLocal(dto.publishedAt) : "",
  };
}

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

export function AnnouncementEditorModal({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AdminAnnouncementDto | null;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(editing ? fromDto(editing) : emptyDraft());
      setShowPreview(false);
    }
  }, [open, editing]);

  const isRelease = editing?.sourceType === "RELEASE";

  const audienceSummary = useMemo(() => {
    if (draft.audiences.length === 0) return "전체 이용자";
    return draft.audiences.map((r) => ROLE_LABELS[r]).join(", ");
  }, [draft.audiences]);

  function toggleAudience(role: AnnouncementRole) {
    setDraft((d) => ({
      ...d,
      audiences: d.audiences.includes(role)
        ? d.audiences.filter((r) => r !== role)
        : [...d.audiences, role],
    }));
  }

  async function handleSave() {
    if (!draft.title.trim()) {
      toast.error("제목을 입력하세요.");
      return;
    }
    if (!draft.content.trim()) {
      toast.error("본문을 입력하세요.");
      return;
    }
    setSaving(true);
    const payload = {
      title: draft.title.trim(),
      content: draft.content,
      category: draft.category,
      status: draft.status,
      isPinned: draft.isPinned,
      audiences: draft.audiences,
      publishedAt: draft.publishedAt ? datetimeLocalToIso(draft.publishedAt) : "",
    };
    const res = editing
      ? await updateAnnouncement(editing.id, payload)
      : await createAnnouncement(payload);
    setSaving(false);
    if (res.success) {
      toast.success(editing ? "공지를 수정했어요." : "공지를 만들었어요.");
      onOpenChange(false);
      onSaved();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <DialogTitle className="text-[15px] font-bold text-gray-900">
            {editing ? "공지 수정" : "새 공지 작성"}
          </DialogTitle>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {showPreview ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
            {showPreview ? "편집" : "미리보기"}
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {isRelease && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
              배포 시 자동 생성된 소식입니다. 원문은 릴리즈 노트 파일에서 관리되며,
              여기서 고친 내용은 다음 자동 발행 때 덮어써지지 않습니다.
            </p>
          )}

          {showPreview ? (
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <p className="mb-1 text-[11px] font-semibold text-blue-600">
                {CATEGORY_LABELS[draft.category]}
              </p>
              <h3 className="mb-3 text-[17px] font-bold text-slate-900">
                {draft.title || "제목 없음"}
              </h3>
              <AnnouncementBody
                content={draft.content || "_본문이 비어 있습니다._"}
                className="text-[13px] text-slate-600"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* 제목 */}
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                  제목
                </label>
                <input
                  className={inputCls}
                  value={draft.title}
                  maxLength={200}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="예) 문제집 사진만 올리면 지문이 자동으로 정리돼요"
                />
              </div>

              {/* 카테고리 · 상태 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                    카테고리
                  </label>
                  <select
                    className={inputCls}
                    value={draft.category}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        category: e.target.value as AnnouncementCategory,
                      }))
                    }
                  >
                    {ANNOUNCEMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                    상태
                  </label>
                  <select
                    className={inputCls}
                    value={draft.status}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        status: e.target.value as AnnouncementStatus,
                      }))
                    }
                  >
                    <option value="DRAFT">초안 (숨김)</option>
                    <option value="PUBLISHED">발행 (이용자에게 노출)</option>
                    <option value="ARCHIVED">보관 (숨김)</option>
                  </select>
                </div>
              </div>

              {/* 본문 */}
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                  본문
                </label>
                <textarea
                  className={cn(inputCls, "min-h-[180px] resize-y font-mono leading-relaxed")}
                  value={draft.content}
                  onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                  placeholder={"핵심 요약 한 문장을 먼저 쓰고,\n\n- 불릿으로 달라진 점을\n- 2~5개 정도 적어주세요\n\n**굵게**, ## 소제목 도 쓸 수 있어요."}
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  줄바꿈·불릿(-)·**굵게**·## 소제목 을 지원합니다. 개발 용어 없이
                  이용자가 얻는 것 위주로 써주세요.
                </p>
              </div>

              {/* 노출 대상 */}
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                  노출 대상{" "}
                  <span className="font-normal text-gray-400">({audienceSummary})</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ANNOUNCEMENT_ROLES.map((role) => {
                    const active = draft.audiences.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleAudience(role)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-[12px] font-medium transition",
                          active
                            ? "border-blue-500 bg-blue-50 text-blue-600"
                            : "border-gray-200 text-gray-500 hover:bg-gray-50",
                        )}
                      >
                        {ROLE_LABELS[role]}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-gray-400">
                  아무 것도 고르지 않으면 전체 이용자에게 노출됩니다.
                </p>
              </div>

              {/* 게시일 · 고정 */}
              <div className="grid grid-cols-2 items-end gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-gray-700">
                    게시일 (소급 입력 가능)
                  </label>
                  <input
                    type="datetime-local"
                    className={inputCls}
                    value={draft.publishedAt}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, publishedAt: e.target.value }))
                    }
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    비워두고 발행하면 지금 시각으로 게시됩니다.
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 pb-6 text-[13px] font-medium text-gray-700">
                  <input
                    type="checkbox"
                    className="size-4 accent-blue-600"
                    checked={draft.isPinned}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, isPinned: e.target.checked }))
                    }
                  />
                  목록 상단에 고정
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            저장
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
