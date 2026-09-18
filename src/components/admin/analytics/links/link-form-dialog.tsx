"use client";

// 추적 링크 만들기·수정 Dialog — 이름·slug(라벨에서 자동 제안)·목적지·프리셋·UTM·미리보기.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TrackedLinkRow } from "@/lib/analytics/reports/links";
import {
  LINK_DESTINATION_MAX,
  LINK_LABEL_MAX,
  LINK_NOTE_MAX,
  LINK_SLUG_MAX,
  LINK_UTM_MAX,
  absoluteSiteUrl,
  linkRedirectPath,
  shortLinkUrl,
  stripControlChars,
  suggestSlug,
  validateLinkCreate,
  type LinkFieldErrors,
  type TrackedLinkInput,
} from "@/lib/analytics/tracked-links";
import { cn } from "@/lib/utils";
import { copyText, LinkApiError, useLinkMutations } from "./link-api";
import {
  ClassificationHint,
  FormField,
  INPUT_CLASS,
  PresetChips,
  UrlLine,
  applyPreset,
  matchPreset,
  type UtmDraft,
} from "./link-form-parts";

interface Draft extends UtmDraft {
  label: string;
  slug: string;
  destination: string;
  note: string;
}

function initialDraft(link: TrackedLinkRow | null): Draft {
  return {
    label: link?.label ?? "",
    slug: link?.slug ?? "",
    destination: link?.destination ?? "/",
    utmSource: link?.utmSource ?? "",
    utmMedium: link?.utmMedium ?? "",
    utmCampaign: link?.utmCampaign ?? "",
    utmContent: link?.utmContent ?? "",
    utmTerm: link?.utmTerm ?? "",
    note: link?.note ?? "",
  };
}

export function LinkFormDialog({
  open,
  onOpenChange,
  link,
  shortBase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = 새로 만들기 */
  link: TrackedLinkRow | null;
  shortBase: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {/* 열릴 때마다 초기화되도록 key 로 재마운트 */}
        {open && <LinkForm key={link?.id ?? "new"} link={link} shortBase={shortBase} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({ link, shortBase, onDone }: { link: TrackedLinkRow | null; shortBase: string; onDone: () => void }) {
  const editing = !!link;
  const slugLocked = editing && link.totalClicks > 0;
  const [draft, setDraft] = useState<Draft>(() => initialDraft(link));
  const [slugTouched, setSlugTouched] = useState(editing);
  const [errors, setErrors] = useState<LinkFieldErrors>({});
  const { create, update } = useLinkMutations();
  const pending = create.isPending || update.isPending;

  const autoSlug = suggestSlug(draft.label, [draft.utmSource, draft.utmContent, draft.utmCampaign]);
  const slug = slugTouched ? draft.slug : autoSlug;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    // 붙여넣기로 들어온 줄바꿈·제어문자는 입력 단계에서 지운다(서버 검증과 같은 규칙).
    const clean = (typeof value === "string" ? stripControlChars(value) : value) as Draft[K];
    setDraft((d) => ({ ...d, [key]: clean }));
    if (errors[key as keyof LinkFieldErrors]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const payload = {
    label: draft.label,
    slug,
    destination: draft.destination,
    utmSource: draft.utmSource,
    utmMedium: draft.utmMedium,
    utmCampaign: draft.utmCampaign,
    utmContent: draft.utmContent,
    utmTerm: draft.utmTerm,
    note: draft.note,
    isActive: link?.isActive ?? true,
  };

  // slug 가 비면 미리보기는 자리표시자를 쓴다 — 죽은 주소라 복사는 막는다(U7-7).
  const slugReady = slug.length > 0;
  const previewSlug = slug || "<짧은주소>";
  const shortUrl = shortLinkUrl(shortBase, previewSlug);
  const landingUrl = absoluteSiteUrl(
    shortBase,
    linkRedirectPath({
      slug: previewSlug,
      destination: draft.destination.trim().startsWith("/") ? draft.destination.trim() : "/",
      utmSource: draft.utmSource.trim().toLowerCase(),
      utmMedium: draft.utmMedium.trim().toLowerCase(),
      utmCampaign: draft.utmCampaign,
      utmContent: draft.utmContent,
      utmTerm: draft.utmTerm,
    }),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateLinkCreate(payload);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    try {
      if (editing) {
        // 활성 여부는 표의 토글이 맡는다 — 폼 저장이 그 사이 바뀐 값을 덮지 않게 뺀다.
        const patch: Partial<TrackedLinkInput> = { ...v.value };
        delete patch.isActive;
        await update.mutateAsync({ id: link.id, patch });
        toast.success("추적 링크를 수정했습니다");
      } else {
        const res = await create.mutateAsync(v.value);
        const url = shortLinkUrl(shortBase, res.link.slug);
        toast.success("추적 링크를 만들었습니다", {
          description: url,
          action: { label: "주소 복사", onClick: () => void copyText(url, "짧은 주소를 복사했습니다") },
        });
      }
      onDone();
    } catch (err) {
      if (err instanceof LinkApiError) {
        setErrors(err.fieldErrors);
        toast.error(err.message);
      } else {
        toast.error("저장하지 못했습니다");
      }
    }
  }

  return (
    <form onSubmit={submit} className="min-w-0 space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle className="text-[16px]">{editing ? "추적 링크 수정" : "추적 링크 만들기"}</DialogTitle>
        <DialogDescription className="text-[12.5px] text-gray-500">
          인스타그램·카카오톡 인앱 브라우저는 유입 경로(referrer)를 지웁니다. 채널마다 다른 짧은 주소를 걸면 어디서 왔는지 정확히 잡힙니다.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="이름" htmlFor="tl-label" required error={errors.label} className="sm:col-span-2">
          <input
            id="tl-label"
            className={INPUT_CLASS}
            value={draft.label}
            maxLength={LINK_LABEL_MAX}
            placeholder="예) 인스타 프로필 링크 (9월)"
            aria-invalid={!!errors.label}
            onChange={(e) => set("label", e.target.value)}
            autoFocus
          />
        </FormField>

        <FormField
          label="짧은 주소"
          htmlFor="tl-slug"
          required
          error={errors.slug}
          hint={slugLocked ? "클릭이 쌓인 링크는 주소를 바꿀 수 없습니다" : "영문 소문자·숫자·하이픈 2~41자"}
        >
          <div className={cn("flex min-w-0 items-center rounded-lg border border-gray-200 pl-2.5 focus-within:border-blue-400", slugLocked ? "bg-gray-50" : "bg-white")}>
            <span className="shrink-0 font-mono text-[12px] text-gray-400">/go/</span>
            <input
              id="tl-slug"
              className={cn(INPUT_CLASS, "border-0 bg-transparent pl-1 font-mono focus:ring-0")}
              value={slug}
              maxLength={LINK_SLUG_MAX}
              placeholder="insta-bio"
              disabled={slugLocked}
              aria-invalid={!!errors.slug}
              onChange={(e) => {
                const next = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                // 비우면 다시 이름에서 자동 제안
                setSlugTouched(next !== "");
                set("slug", next);
              }}
            />
          </div>
        </FormField>

        <FormField label="목적지 경로" htmlFor="tl-dest" required error={errors.destination} hint="사이트 내부 경로 · 쿼리 가능 (예: /pricing?plan=pro)">
          <input
            id="tl-dest"
            className={cn(INPUT_CLASS, "font-mono")}
            value={draft.destination}
            maxLength={LINK_DESTINATION_MAX}
            placeholder="/"
            aria-invalid={!!errors.destination}
            onChange={(e) => set("destination", e.target.value)}
          />
        </FormField>
      </div>

      <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
        <p className="text-[12px] font-semibold text-gray-600">어디에 걸 링크인가요?</p>
        <PresetChips
          activeKey={matchPreset(draft)}
          onPick={(p) => {
            setDraft((d) => {
              const next = applyPreset(d, p);
              return d.label.trim() ? next : { ...next, label: p.label };
            });
            setErrors((e) => ({ ...e, utmSource: undefined, utmMedium: undefined, label: undefined }));
          }}
        />
        <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
          <FormField label="소스 (utm_source)" htmlFor="tl-src" required error={errors.utmSource}>
            <input id="tl-src" className={cn(INPUT_CLASS, "font-mono")} value={draft.utmSource} maxLength={LINK_UTM_MAX}
              placeholder="instagram" aria-invalid={!!errors.utmSource} onChange={(e) => set("utmSource", e.target.value)} />
          </FormField>
          <FormField label="매체 (utm_medium)" htmlFor="tl-med" required error={errors.utmMedium}>
            <input id="tl-med" className={cn(INPUT_CLASS, "font-mono")} value={draft.utmMedium} maxLength={LINK_UTM_MAX}
              placeholder="social" aria-invalid={!!errors.utmMedium} onChange={(e) => set("utmMedium", e.target.value)} />
          </FormField>
          <FormField label="캠페인 (utm_campaign)" htmlFor="tl-camp" error={errors.utmCampaign}>
            <input id="tl-camp" className={cn(INPUT_CLASS, "font-mono")} value={draft.utmCampaign} maxLength={LINK_UTM_MAX}
              placeholder="sept_mock_free" onChange={(e) => set("utmCampaign", e.target.value)} />
          </FormField>
          <FormField label="콘텐츠 (utm_content)" htmlFor="tl-cont" error={errors.utmContent}>
            <input id="tl-cont" className={cn(INPUT_CLASS, "font-mono")} value={draft.utmContent} maxLength={LINK_UTM_MAX}
              placeholder="bio" onChange={(e) => set("utmContent", e.target.value)} />
          </FormField>
          <FormField label="키워드 (utm_term)" htmlFor="tl-term" error={errors.utmTerm}>
            <input id="tl-term" className={cn(INPUT_CLASS, "font-mono")} value={draft.utmTerm} maxLength={LINK_UTM_MAX}
              placeholder="선택" onChange={(e) => set("utmTerm", e.target.value)} />
          </FormField>
          <FormField label="메모" htmlFor="tl-note" error={errors.note}>
            <input id="tl-note" className={INPUT_CLASS} value={draft.note} maxLength={LINK_NOTE_MAX}
              placeholder="어디에 올렸는지 등" onChange={(e) => set("note", e.target.value)} />
          </FormField>
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
        <UrlLine
          label="짧은 주소"
          url={shortUrl}
          copyMessage="짧은 주소를 복사했습니다"
          disabled={!slugReady}
          hint="짧은 주소를 입력하면 여기에 나옵니다"
        />
        <UrlLine
          label="도착 URL"
          url={landingUrl}
          copyMessage="도착 URL을 복사했습니다"
          muted
          disabled={!slugReady}
          hint="짧은 주소를 입력하면 여기에 나옵니다"
        />
        <div className="pl-[72px]">
          <ClassificationHint utm={draft} />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onDone}
          className="h-9 rounded-lg border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-600 hover:bg-gray-50">
          취소
        </button>
        <button type="submit" disabled={pending}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {editing ? "저장" : "만들기"}
        </button>
      </div>
    </form>
  );
}
