"use client";

import { Clock, Loader2, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminTabs, type AdminTab } from "@/components/admin/kit";
import { cn } from "@/lib/utils";
import {
  AUDIENCE_LABELS,
  BANNER_TEMPLATES,
  DISMISS_MODES,
  type BannerTemplateMeta,
} from "@/lib/site-banners/templates";
import type { BannerDraft } from "./banner-editor-draft";
import { Field, SectionLabel, ToggleRow } from "./editor-widgets";

export type SettingsTab = "edit" | "settings";

const PANEL_TABS: ReadonlyArray<AdminTab<SettingsTab>> = [
  { key: "edit", label: "편집" },
  { key: "settings", label: "설정" },
];

/** 앱 배너 편집기 오른쪽 패널 — 편집(문구·이미지·링크) / 설정(템플릿·대상·닫기·기간·토글) 탭. */
export function BannerSettingsPanel({
  draft,
  template,
  tab,
  onTab,
  patch,
  patchContent,
  selectTemplate,
  uploading,
  onPickFile,
  onOpenTargetPicker,
}: {
  draft: BannerDraft;
  template: BannerTemplateMeta | undefined;
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  patch: (p: Partial<BannerDraft>) => void;
  patchContent: (key: string, value: string) => void;
  selectTemplate: (key: string) => void;
  uploading: boolean;
  onPickFile: () => void;
  onOpenTargetPicker: () => void;
}) {
  const showLowCreditOption = draft.audiences.includes("DIRECTOR");

  return (
    <aside className="flex w-full shrink-0 flex-col border-t border-gray-100 bg-white md:w-[360px] md:border-l md:border-t-0">
      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
        <AdminTabs size="sm" tabs={PANEL_TABS} value={tab} onChange={onTab} ariaLabel="배너 편집 패널" />
        <p className="mt-2 truncate text-[11px] font-medium text-gray-400">
          {draft.type === "IMAGE" ? "이미지 배너" : (template?.name ?? "템플릿")} ·{" "}
          {draft.audiences.map((a) => AUDIENCE_LABELS[a]).join("·") || "대상 없음"} · 우선순위{" "}
          {draft.priority}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {tab === "edit" ? (
          <>
            {draft.type === "TEMPLATE" ? (
              template?.fields.map((field) => (
                <Field
                  key={field.key}
                  label={
                    <>
                      {field.label}
                      {field.required && <span className="text-rose-500"> *</span>}
                    </>
                  }
                  hint={field.help}
                >
                  {field.type === "textarea" ? (
                    <Textarea
                      value={draft.content[field.key] ?? ""}
                      onChange={(e) => patchContent(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="min-h-[80px] resize-y text-[13px]"
                    />
                  ) : (
                    <Input
                      value={draft.content[field.key] ?? ""}
                      onChange={(e) => patchContent(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="text-[13px]"
                    />
                  )}
                </Field>
              ))
            ) : (
              <>
                <div>
                  <SectionLabel>이미지</SectionLabel>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={onPickFile} disabled={uploading}>
                      {uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      {draft.imageUrl ? "이미지 교체" : "이미지 업로드"}
                    </Button>
                    {draft.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.imageUrl}
                        alt=""
                        className="size-11 rounded-md border border-gray-200 object-cover"
                      />
                    )}
                  </div>
                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-500">
                    <p className="font-semibold text-gray-600">권장 이미지 크기</p>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                      <li>
                        가로 <b className="text-gray-700">960px</b> 내외 (실제 표시 480px · 2배 해상도로
                        선명하게)
                      </li>
                      <li>세로/정사각형 권장 · 세로가 너무 길면 잘릴 수 있어요 (가로:세로 ≈ 4:5 ~ 1:1)</li>
                      <li>JPG·PNG·WebP·GIF, 5MB 이하</li>
                    </ul>
                  </div>
                </div>
                <Field label="대체 텍스트 (접근성)">
                  <Input
                    value={draft.imageAlt}
                    onChange={(e) => patch({ imageAlt: e.target.value })}
                    placeholder="이미지 설명"
                    className="text-[13px]"
                  />
                </Field>
              </>
            )}

            <Field label={<>클릭 링크 {draft.type === "TEMPLATE" && "(선택)"}</>}>
              <Input
                value={draft.linkUrl}
                onChange={(e) => patch({ linkUrl: e.target.value })}
                placeholder="https://…"
                className="text-[13px]"
              />
            </Field>
          </>
        ) : (
          <>
            {draft.type === "TEMPLATE" && (
              <div>
                <SectionLabel>템플릿</SectionLabel>
                <div className="grid gap-2">
                  {BANNER_TEMPLATES.map((tpl) => {
                    const selected = draft.templateKey === tpl.key;
                    return (
                      <Button
                        key={tpl.key}
                        variant="outline"
                        onClick={() => selectTemplate(tpl.key)}
                        aria-pressed={selected}
                        className={cn(
                          "h-auto w-full flex-col items-start gap-0.5 whitespace-normal px-3 py-2.5 text-left",
                          selected && "border-blue-300 bg-blue-50 hover:bg-blue-50",
                        )}
                      >
                        <span
                          className={cn(
                            "text-[12.5px] font-bold",
                            selected ? "text-blue-700" : "text-gray-900",
                          )}
                        >
                          {tpl.name}
                        </span>
                        <span className="text-[11px] font-normal leading-snug text-gray-500">
                          {tpl.description}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 노출 대상 — 역할 + 범위(전체/특정)를 한 곳에서 설정 */}
            <div>
              <SectionLabel>
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3" />
                  노출 대상
                </span>
              </SectionLabel>
              <Button
                variant="outline"
                onClick={onOpenTargetPicker}
                className="h-auto w-full justify-between gap-2 whitespace-normal px-3 py-2.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold text-gray-800">
                    {draft.audiences.map((a) => AUDIENCE_LABELS[a]).join(" · ") || "역할 미선택"}
                  </span>
                  <span className="mt-0.5 block text-[12px] font-normal text-gray-400">
                    {draft.targetMode === "ALL"
                      ? "전체 학원에 노출"
                      : `특정 ${draft.targetAcademyIds.length}명에게 노출`}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] font-bold text-blue-600">설정</span>
              </Button>
              {draft.audiences.length === 0 && (
                <p className="mt-1.5 text-[11px] leading-snug text-amber-600">
                  역할이 선택되지 않아 아무에게도 노출되지 않아요.
                </p>
              )}
              {draft.targetMode === "SPECIFIC" && draft.targetAcademyIds.length === 0 && (
                <p className="mt-1.5 text-[11px] leading-snug text-amber-600">
                  선택된 대상이 없어 아무에게도 노출되지 않아요.
                </p>
              )}
            </div>

            <div>
              <SectionLabel>닫기 방식</SectionLabel>
              <div className="grid grid-cols-2 gap-1.5">
                {DISMISS_MODES.map((m) => {
                  const selected = draft.dismissMode === m.value;
                  return (
                    <Button
                      key={m.value}
                      variant="outline"
                      size="sm"
                      onClick={() => patch({ dismissMode: m.value })}
                      title={m.description}
                      aria-pressed={selected}
                      className={cn(
                        "h-auto min-h-9 whitespace-normal px-1.5 py-1.5 text-[11px] font-semibold leading-tight",
                        selected
                          ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-50 hover:text-blue-700"
                          : "text-gray-500",
                      )}
                    >
                      {m.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <Field label="우선순위 (낮을수록 먼저)">
              <Input
                type="number"
                min={0}
                value={draft.priority}
                onChange={(e) => patch({ priority: Number(e.target.value) })}
                className="text-[13px] tabular-nums"
              />
            </Field>

            <div>
              <SectionLabel>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  노출 기간 (선택)
                </span>
              </SectionLabel>
              <div className="grid grid-cols-1 gap-2">
                <Field label="시작">
                  <Input
                    type="datetime-local"
                    value={draft.startsAt}
                    onChange={(e) => patch({ startsAt: e.target.value })}
                    className="text-[13px]"
                  />
                </Field>
                <Field label="종료">
                  <Input
                    type="datetime-local"
                    value={draft.endsAt}
                    onChange={(e) => patch({ endsAt: e.target.value })}
                    className="text-[13px]"
                  />
                </Field>
              </div>
            </div>

            <div className="space-y-2">
              <ToggleRow
                label="'오늘 하루 보지 않기' 버튼 표시"
                desc="끄면 우측 상단 X·바깥 클릭으로만 닫을 수 있어요. (닫기 방식은 그대로 적용)"
                checked={draft.showDismissButton}
                onChange={(v) => patch({ showDismissButton: v })}
              />
              <ToggleRow
                label="지금 활성화"
                desc="켜면 노출 기간·대상 조건을 만족하는 사용자에게 바로 뜹니다."
                checked={draft.isActive}
                onChange={(v) => patch({ isActive: v })}
              />
              {showLowCreditOption && (
                <ToggleRow
                  label="저크레딧 시 자동 노출"
                  desc="원장의 크레딧 잔액이 낮으면 닫았어도 다시 띄웁니다."
                  checked={draft.autoOpenOnLowCredit}
                  onChange={(v) => patch({ autoOpenOnLowCredit: v })}
                />
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
