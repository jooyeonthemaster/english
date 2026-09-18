"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Eye, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AdminDialog, FilterChip } from "@/components/admin/kit";
import { datetimeLocalToIso, isoToDatetimeLocal } from "@/lib/utils";
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

function emptyDraft(category: AnnouncementCategory = "UPDATE"): Draft {
  return {
    title: "",
    content: "",
    category,
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

/** 카테고리별 제목·본문 예시(placeholder). 유형에 맞는 톤·구성을 안내한다. */
const PLACEHOLDERS: Record<AnnouncementCategory, { title: string; body: string }> = {
  UPDATE: {
    title: "예) 문제집 사진만 올리면 지문이 정리돼요",
    body:
      "이번에 이런 점이 좋아졌어요!\n\n- 새로 할 수 있게 된 것을\n- 2~5개 불릿으로 적어주세요\n\n**굵게**, ## 소제목 도 쓸 수 있어요.",
  },
  MAINTENANCE: {
    title: "예) 0월 0일 밤, 잠깐 점검이 있어요",
    body:
      "더 안정적인 서비스를 위해 잠시 점검을 진행합니다.\n\n- 일시: 0월 0일 00시 ~ 00시\n- 이 시간에는 잠시 이용이 어려울 수 있어요\n\n이용에 참고해 주세요.",
  },
  EVENT: {
    title: "예) 첫 충전하면 크레딧을 더 드려요!",
    body:
      "기간 한정 이벤트를 준비했어요!\n\n- 혜택: 무엇을 받을 수 있는지\n- 기간: 언제부터 언제까지인지\n- 참여 방법: 어떻게 하면 되는지",
  },
  GENERAL: {
    title: "예) 고객센터 운영 시간을 안내드려요",
    body: "안내드릴 소식이 있어요.\n\n- 알려드릴 내용을\n- 간단히 적어주세요",
  },
};

/** 라벨 · 입력 · 도움말 한 칸 */
function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1 text-[12px] font-semibold text-gray-600">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

export function AnnouncementEditorModal({
  open,
  onOpenChange,
  editing,
  onSaved,
  initialCategory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AdminAnnouncementDto | null;
  onSaved: () => void;
  /** 새 공지 작성 시 기본 카테고리(목록 필터에서 넘어옴). editing 이 있으면 무시. */
  initialCategory?: AnnouncementCategory;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(editing ? fromDto(editing) : emptyDraft(initialCategory));
      setShowPreview(false);
    }
  }, [open, editing, initialCategory]);

  const isRelease = editing?.sourceType === "RELEASE";
  const isAuto = editing?.sourceType === "AUTO";
  const placeholder = PLACEHOLDERS[draft.category] ?? PLACEHOLDERS.UPDATE;

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
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={editing ? "공지 수정" : "새 공지 작성"}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            저장
          </Button>
        </>
      }
    >
      <div className="mb-3 flex items-center justify-end">
        <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
          {showPreview ? "편집" : "미리보기"}
        </Button>
      </div>

      {isRelease && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
          배포 시 자동 생성된 소식입니다. 원문은 릴리즈 노트 파일에서 관리되며, 여기서 고친
          내용은 다음 자동 발행 때 덮어써지지 않습니다.
        </p>
      )}
      {isAuto && (
        <p className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-[12px] text-violet-700">
          AI가 이번 배포의 변경사항을 요약해 만든 초안입니다. 내용을 확인·수정한 뒤 발행하면
          이용자에게 노출됩니다.
        </p>
      )}

      {showPreview ? (
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <p className="mb-1 text-[11px] font-semibold text-blue-600">
            {CATEGORY_LABELS[draft.category]}
          </p>
          <h3 className="mb-3 text-[17px] font-bold text-gray-900">{draft.title || "제목 없음"}</h3>
          <AnnouncementBody
            content={draft.content || "_본문이 비어 있습니다._"}
            className="text-[13px] text-gray-600"
          />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {/* 좌측: 설정 */}
          <div className="space-y-4">
            <Field label="제목">
              <Input
                value={draft.title}
                maxLength={200}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder={placeholder.title}
                className="text-[13px]"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="카테고리">
                <Select
                  value={draft.category}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, category: v as AnnouncementCategory }))
                  }
                >
                  <SelectTrigger className="w-full text-[13px]" aria-label="카테고리">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="이용자 노출">
                <div className="flex h-9 items-center gap-2">
                  <Switch
                    checked={draft.status === "PUBLISHED"}
                    onCheckedChange={(checked) =>
                      setDraft((d) => ({ ...d, status: checked ? "PUBLISHED" : "ARCHIVED" }))
                    }
                    aria-label={draft.status === "PUBLISHED" ? "노출 끄기" : "노출 켜기"}
                  />
                  <span className="text-[13px] text-gray-600">
                    {draft.status === "PUBLISHED" ? "노출 중" : "미노출"}
                  </span>
                </div>
              </Field>
            </div>

            <Field
              label={
                <>
                  노출 대상 <span className="font-normal text-gray-400">({audienceSummary})</span>
                </>
              }
              hint="아무 것도 고르지 않으면 전체 이용자에게 노출됩니다."
            >
              <div className="flex flex-wrap gap-1.5">
                {ALL_ANNOUNCEMENT_ROLES.map((role) => (
                  <FilterChip
                    key={role}
                    active={draft.audiences.includes(role)}
                    onClick={() => toggleAudience(role)}
                    label={ROLE_LABELS[role]}
                  />
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 items-end gap-3">
              <Field label="게시일 (소급 입력 가능)" hint="비워두고 발행하면 지금 시각으로 게시됩니다.">
                <Input
                  type="datetime-local"
                  value={draft.publishedAt}
                  onChange={(e) => setDraft((d) => ({ ...d, publishedAt: e.target.value }))}
                  className="text-[13px]"
                />
              </Field>
              <Label className="cursor-pointer gap-2 pb-6 text-[13px] font-medium text-gray-700">
                <Checkbox
                  checked={draft.isPinned}
                  onCheckedChange={(checked) =>
                    setDraft((d) => ({ ...d, isPinned: checked === true }))
                  }
                />
                목록 상단에 고정
              </Label>
            </div>
          </div>

          {/* 우측: 본문 — 좌측 높이에 맞춰 늘어나 스크롤 없이 한눈에 */}
          <div className="flex min-h-[300px] flex-col md:min-h-0">
            <Label className="mb-1 text-[12px] font-semibold text-gray-600">본문</Label>
            <Textarea
              value={draft.content}
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
              placeholder={placeholder.body}
              className="min-h-[240px] flex-1 resize-none font-mono text-[13px] leading-relaxed"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              줄바꿈·불릿(-)·**굵게**·## 소제목 을 지원합니다. 개발 용어 없이 이용자가 얻는 것
              위주로 써주세요.
            </p>
          </div>
        </div>
      )}
    </AdminDialog>
  );
}
