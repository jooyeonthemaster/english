"use client";

import { useRef, type ReactNode } from "react";
import { Image as ImageIcon, Plus, X } from "lucide-react";
import { FilterChipGroup } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { GROUP_SEMINAR_STATUSES } from "@/lib/help-center";
import { cn } from "@/lib/utils";
import type { FormState } from "./group-seminar-form";

const STATUS_OPTIONS = GROUP_SEMINAR_STATUSES.map((s) => ({ key: s.value, label: s.label }));
const INPUT_CLS = "text-[13px]";
const TEXTAREA_CLS = "resize-y text-[13px]";

/** 편집 폼 본문 — 좌(짧은 입력들) / 우(커버·상세·상태) 2단. 상태는 부모가 갖는다. */
export function GroupSeminarFormFields({
  form,
  set,
  uploading,
  onUploadCover,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  uploading: boolean;
  onUploadCover: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function setSessionDate(i: number, value: string) {
    set(
      "sessionDates",
      form.sessionDates.map((d, idx) => (idx === i ? value : d)),
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-3 lg:grid-cols-2">
      {/* 좌: 짧은 입력들 */}
      <div className="space-y-3">
        <Field label="제목" hint="엔터로 줄을 바꾸면 사용자 화면에도 그대로 줄바꿈되어 보입니다.">
          <Textarea
            className={cn(TEXTAREA_CLS, "min-h-14")}
            rows={2}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="예: 신규 원장 온보딩 단체 세미나"
          />
        </Field>
        <Field label="한 줄 소개">
          <Textarea
            className={cn(TEXTAREA_CLS, "min-h-14")}
            rows={2}
            value={form.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="제목 아래에 노출되는 짧은 소개 (엔터로 줄바꿈 가능)"
          />
        </Field>
        <Field
          label="참여자 혜택 (사용자 화면 상단 블록 · 비우면 숨김)"
          hint="줄바꿈으로 여러 혜택을 나열할 수 있습니다."
        >
          <Textarea
            className={cn(TEXTAREA_CLS, "min-h-20")}
            rows={3}
            value={form.benefit}
            onChange={(e) => set("benefit", e.target.value)}
            placeholder={"예:\n· 참석 원장님 전원에게 스모트 활용 가이드 & 실전 템플릿 제공\n· 현장 1:1 세팅 컨설팅\n· 다과·음료 제공"}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="강사·진행자">
            <Input className={INPUT_CLS} value={form.host} onChange={(e) => set("host", e.target.value)} />
          </Field>
          <Field label="대상">
            <Input
              className={INPUT_CLS}
              value={form.target}
              onChange={(e) => set("target", e.target.value)}
              placeholder="예: 신규 원장"
            />
          </Field>
        </div>
        <Field label="장소">
          <Input
            className={INPUT_CLS}
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="예: 온라인(줌) 또는 서울 강남 세미나실"
          />
        </Field>
        <Field label={'지도 링크 (선택 · 사용자 화면 "위치 확인" 버튼)'}>
          <Input
            className={INPUT_CLS}
            value={form.mapUrl}
            onChange={(e) => set("mapUrl", e.target.value)}
            placeholder="예: https://naver.me/xxxx"
          />
        </Field>
        <Field label="온라인 접속 링크 (신청자에게 노출)">
          <Input
            className={INPUT_CLS}
            value={form.meetingUrl}
            onChange={(e) => set("meetingUrl", e.target.value)}
            placeholder="https://zoom.us/j/..."
          />
        </Field>
        <Field
          label="세션 날짜"
          hint="날짜를 2개 이상 넣으면 신청자가 그중 하루를 선택합니다. 비우면 일정 미정."
        >
          <div className="space-y-2">
            {form.sessionDates.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  className={INPUT_CLS}
                  value={d}
                  onChange={(e) => setSessionDate(i, e.target.value)}
                  aria-label={`세션 날짜 ${i + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="날짜 삭제"
                  onClick={() =>
                    set(
                      "sessionDates",
                      form.sessionDates.filter((_, idx) => idx !== i),
                    )
                  }
                  className="text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <X className="size-4" strokeWidth={2} />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => set("sessionDates", [...form.sessionDates, ""])}
              className="h-auto p-0 text-[12px] font-semibold"
            >
              <Plus className="size-3.5" strokeWidth={2} />
              날짜 추가
            </Button>
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="진행(분)">
            <Input
              type="number"
              min={0}
              className={INPUT_CLS}
              value={form.durationMin}
              onChange={(e) => set("durationMin", e.target.value)}
            />
          </Field>
          <Field label={form.sessionDates.filter(Boolean).length > 1 ? "정원 (일자별)" : "정원"}>
            <Input
              type="number"
              min={0}
              className={INPUT_CLS}
              value={form.capacity}
              onChange={(e) => set("capacity", e.target.value)}
              placeholder="무제한"
            />
          </Field>
          <Field label="마감(N일 전)">
            <Input
              type="number"
              min={0}
              className={INPUT_CLS}
              value={form.registerCloseDays}
              onChange={(e) => set("registerCloseDays", e.target.value)}
              placeholder="당일"
            />
          </Field>
        </div>
        <p className="text-[11px] text-gray-400">
          신청 마감은 각 세션 실행일 기준 며칠 전까지 받을지입니다. 비우면 당일까지, 마감이
          지나면 자동으로 신청이 차단됩니다.
        </p>
        <Field
          label="참가 보증금 (원)"
          hint="금액을 넣으면 신청 시 계좌이체 안내 + 환급계좌 입력을 요구하고, 입금은 금액 + 입금자명으로 자동 확인(무통장입금과 동일)됩니다. 환급은 세미나 당일 관리자가 수동 처리합니다."
        >
          <Input
            type="number"
            min={0}
            step={1000}
            className={INPUT_CLS}
            value={form.depositAmount}
            onChange={(e) => set("depositAmount", e.target.value)}
            placeholder="없음 (0/빈칸)"
          />
        </Field>
      </div>

      {/* 우: 커버 이미지 + 상세 안내(길게) + 상태 */}
      <div className="flex flex-col space-y-3">
        <Field label="커버 이미지 (사용자 화면 상단 노출)">
          {form.coverImageUrl ? (
            <div className="relative overflow-hidden rounded-xl border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.coverImageUrl} alt="세미나 커버" className="h-32 w-full object-cover" />
              <Button
                type="button"
                size="xs"
                onClick={() => set("coverImageUrl", "")}
                className="absolute right-2 top-2 bg-black/50 text-white hover:bg-black/70"
              >
                제거
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="h-32 w-full flex-col gap-1.5 rounded-xl border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:bg-white hover:text-blue-500"
            >
              <ImageIcon className="size-5" strokeWidth={1.8} />
              <span className="text-[12px] font-normal">
                {uploading ? "업로드 중..." : "이미지 업로드 (JPG·PNG, 5MB 이하)"}
              </span>
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadCover(f);
              e.target.value = "";
            }}
          />
        </Field>
        <Field label="상세 안내" className="flex flex-1 flex-col">
          <Textarea
            className={cn(TEXTAREA_CLS, "min-h-[200px] flex-1")}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="커리큘럼·준비물 등 상세 내용"
          />
        </Field>
        <Field label="공개 상태" hint='"모집중(OPEN)" 상태에서만 원장이 신청할 수 있습니다.'>
          <FilterChipGroup
            options={STATUS_OPTIONS}
            value={form.status}
            onChange={(v) => set("status", v)}
            ariaLabel="공개 상태"
          />
        </Field>

        {/* 비회원(랜딩) 공개 신청 토글 */}
        <Field label="비회원 공개 신청">
          <label
            className={cn(
              "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors",
              form.publicEnabled ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50",
            )}
          >
            <span className="text-[13px]">
              <span className="font-semibold text-gray-800">
                {form.publicEnabled ? "공개 중" : "비공개"}
              </span>
              <span className="ml-1 text-gray-400">
                {form.publicEnabled
                  ? "랜딩페이지(/seminar)에서 비회원도 신청 가능"
                  : "로그인한 원장만 신청 가능"}
              </span>
            </span>
            <Switch
              checked={form.publicEnabled}
              onCheckedChange={(next) => set("publicEnabled", next)}
              aria-label="비회원 공개 신청"
            />
          </label>
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] font-semibold text-gray-500">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}
