"use client";

// 유입 분석 › 설정 — 마케팅 픽셀·태그 ID 입력(재배포 없이 켜기). 계약 §8.1~§8.4
// 데이터: GET/PUT /api/admin/analytics/pixels (저장은 SUPER_ADMIN). 서버 액션 금지(I7).
// 표·설치 안내는 pixel-settings-guide.tsx, 상수는 pixel-settings-meta.tsx.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { PixelSettingsResponse } from "@/lib/analytics/pixels";
import {
  PIXEL_FORMAT_HINTS,
  PIXEL_ID_FIELDS,
  emptyPixelConfig,
  pixelFieldError,
  type PixelConfig,
  type PixelIdField,
} from "@/lib/analytics/pixels-common";
import { fmtDateTime } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { ReportError, ReportSkeleton } from "../shared/report-states";
import { Section } from "../shared/section";
import { PixelGuide } from "./pixel-settings-guide";
import { API, ExtLink, GROUPS, QUERY_KEY, type FieldMeta } from "./pixel-settings-meta";

async function fetchSettings(): Promise<PixelSettingsResponse> {
  const res = await fetch(API, { cache: "no-store", credentials: "same-origin" });
  const body = (await res.json().catch(() => null)) as (PixelSettingsResponse & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `요청 실패 (${res.status})`);
  return body;
}

/**
 * 저장된 설정을 못 읽은 상태 — 폼이 전 칸 빈 값으로 초기화되므로 저장하면 기존 ID 10여 개가
 * 한꺼번에 지워진다(서버는 전 키를 덮어쓴다). 이때는 입력·저장을 막는다(U8-3).
 */
function readFailure(data: PixelSettingsResponse): string | null {
  if (data.dbError) return "DB 조회에 실패해 env 값만 적용 중입니다. 저장된 ID 를 읽지 못한 상태라 저장하면 기존 값이 지워질 수 있어 입력을 잠갔습니다.";
  if (data.updatedAt && !data.stored) return "저장된 설정을 읽지 못했습니다(형식 오류). 저장하면 기존 값이 지워질 수 있어 입력을 잠갔습니다.";
  return null;
}

export function PixelSettingsPanel() {
  const { data, error, isLoading } = useQuery<PixelSettingsResponse, Error>({
    queryKey: QUERY_KEY,
    queryFn: fetchSettings,
    staleTime: 30_000,
    retry: 1,
  });

  return (
    <div className="space-y-4">
      <Section
        title="마케팅 픽셀·태그"
        description="ID 만 입력하면 재배포 없이 켜집니다 · 마케팅·로그인/가입·원장·강사 화면에서만 로드(Clarity 는 마케팅·로그인/가입만)"
      >
        {error && <ReportError message={error.message} />}
        {isLoading && !data && <ReportSkeleton rows={6} />}
        {/* 저장 성공 시 updatedAt 이 바뀌어 폼을 새 값으로 다시 초기화한다 */}
        {data && <PixelForm key={data.updatedAt ?? "unsaved"} data={data} />}
      </Section>

      <PixelGuide />
    </div>
  );
}

function PixelForm({ data }: { data: PixelSettingsResponse }) {
  const queryClient = useQueryClient();
  const initial: PixelConfig = { ...(data.stored ?? emptyPixelConfig()), enabled: data.config.enabled };
  const [form, setForm] = useState<PixelConfig>(initial);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const readError = readFailure(data);
  const locked = !data.canEdit || !!readError;

  const errors: Partial<Record<PixelIdField, string>> = {};
  for (const f of PIXEL_ID_FIELDS) {
    const e = pixelFieldError(f, form[f].trim()) ?? serverErrors[f];
    if (e) errors[f] = e;
  }
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = form.enabled !== initial.enabled || PIXEL_ID_FIELDS.some((f) => form[f].trim() !== initial[f].trim());
  // 라벨은 픽셀이 아니므로 제외하고 센다(현재 사이트 적용 기준 — 저장 전 입력값 아님).
  const activeCount = data.config.enabled ? PIXEL_ID_FIELDS.filter((f) => !f.endsWith("Label") && data.sources[f] !== "none").length : 0;

  const setField = (f: PixelIdField, value: string) => {
    setForm((prev) => ({ ...prev, [f]: value }));
    if (serverErrors[f]) setServerErrors((prev) => ({ ...prev, [f]: "" }));
  };

  async function save() {
    if (locked || hasErrors || saving) return;
    setSaving(true);
    try {
      const body: Record<string, string | boolean> = { enabled: form.enabled };
      for (const f of PIXEL_ID_FIELDS) body[f] = form[f].trim();
      const res = await fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as (PixelSettingsResponse & { error?: string; errors?: Record<string, string> }) | null;
      if (res.status === 400 && json?.errors) {
        setServerErrors(json.errors);
        toast.error("형식이 올바르지 않은 항목이 있습니다.");
        return;
      }
      if (!res.ok || !json) {
        toast.error(json?.error ?? `저장 실패 (${res.status})`);
        return;
      }
      queryClient.setQueryData(QUERY_KEY, json);
      toast.success("픽셀 설정을 저장했습니다 · 최대 5분 내 사이트에 반영됩니다(CDN 캐시)");
    } catch {
      toast.error("저장 중 네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={form.enabled}
            aria-label="픽셀 사용"
            disabled={locked}
            onClick={() => setForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
              form.enabled ? "bg-blue-600" : "bg-gray-300",
            )}
          >
            <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", form.enabled ? "translate-x-5" : "translate-x-0.5")} />
          </button>
          <div>
            <div className="text-[13px] font-semibold text-gray-800">{form.enabled ? "픽셀 사용 중" : "픽셀 꺼짐 — 모든 스크립트를 로드하지 않음"}</div>
            <div className="text-[11.5px] text-gray-400 tabular-nums">
              사이트 적용 중 ID {activeCount}개
              {readError ? " · 저장 상태를 읽지 못함" : data.enabledSource === "default" ? " · 아직 저장한 적 없음(기본 켜짐)" : ""}
              {data.updatedAt ? ` · 마지막 저장 ${fmtDateTime(data.updatedAt)}` : ""}
            </div>
          </div>
        </div>
      </div>

      {readError && (
        <p className="flex gap-1.5 rounded-lg bg-rose-50 px-3 py-2.5 text-[12px] leading-relaxed font-semibold text-rose-700">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {readError} 잠시 뒤 새로고침해 주세요 — 화면의 빈 칸은 「저장된 값이 없음」이 아닙니다.
          </span>
        </p>
      )}

      {GROUPS.map((g) => (
        <fieldset key={g.title} className="space-y-3">
          <legend className="mb-1 text-[12px] font-bold tracking-wide text-gray-400">{g.title}</legend>
          {g.note && <p className="mb-2 text-[11.5px] leading-relaxed text-gray-500">{g.note}</p>}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {g.fields.map((m) => (
              <FieldRow
                key={m.field}
                meta={m}
                value={form[m.field]}
                error={errors[m.field]}
                source={data.sources[m.field]}
                invalid={data.invalid[m.field]}
                envValue={data.env[m.field]}
                disabled={locked}
                onChange={(v) => setField(m.field, v)}
              />
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-col gap-2 border-t border-gray-50 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] text-gray-400">
          {!data.canEdit
            ? "저장은 SUPER_ADMIN 만 할 수 있습니다"
            : readError
              ? "저장 잠김 — 저장된 설정을 읽은 뒤에만 저장할 수 있습니다"
              : "저장 후 최대 5분 내 반영(CDN 캐시) · 비운 칸은 env 값(있으면)으로 대체"}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={locked || !dirty || hasErrors || saving}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          저장
        </button>
      </div>
    </div>
  );
}

function FieldRow({
  meta,
  value,
  error,
  source,
  invalid,
  envValue,
  disabled,
  onChange,
}: {
  meta: FieldMeta;
  value: string;
  error?: string;
  source: "db" | "env" | "none";
  invalid?: "db" | "env";
  envValue: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const id = `pixel-${meta.field}`;
  const trimmed = value.trim();
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={id} className="text-[13px] font-semibold text-gray-800">{meta.label}</label>
        <SourceBadge source={source} />
        {invalid && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-600">{invalid} 값 형식 오류</span>}
        {meta.link && <ExtLink link={meta.link} className="ml-auto" />}
      </div>
      <p className="mt-0.5 text-[11.5px] text-gray-400">{meta.desc}</p>
      <input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PIXEL_FORMAT_HINTS[meta.field]}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={!!error}
        aria-describedby={`${id}-msg`}
        className={cn(
          "mt-2 h-9 w-full rounded-md border bg-white px-3 font-mono text-[13px] text-gray-800 outline-none placeholder:font-sans placeholder:text-gray-300 focus:ring-2 disabled:bg-gray-50",
          error ? "border-rose-300 focus:ring-rose-100" : "border-gray-200 focus:border-blue-400 focus:ring-blue-100",
        )}
      />
      <div id={`${id}-msg`} className="mt-1 min-h-[16px] text-[11.5px]">
        {error ? (
          <span className="text-rose-600">{error}</span>
        ) : trimmed ? (
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="size-3" aria-hidden /> 형식 확인됨
          </span>
        ) : envValue ? (
          <span className="text-gray-400">비워 두면 env 값 사용: <span className="font-mono">{envValue}</span></span>
        ) : null}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: "db" | "env" | "none" }) {
  const map = {
    db: ["DB", "bg-blue-50 text-blue-700"],
    env: ["env", "bg-amber-50 text-amber-700"],
    none: ["미설정", "bg-gray-100 text-gray-400"],
  } as const;
  const [label, cls] = map[source];
  return <span className={cn("rounded px-1.5 py-0.5 text-[10.5px] font-bold", cls)} title="현재 사이트에 적용 중인 값의 출처">{label}</span>;
}
