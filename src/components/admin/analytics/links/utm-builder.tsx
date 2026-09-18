"use client";

// UTM 직접 만들기 — 추적 링크 없이 아무 경로에 utm_* 를 붙인 주소를 만들어 복사한다.
// (광고 관리자·외부 폼처럼 짧은 주소 대신 전체 URL 이 필요한 곳용. 클릭 수는 안 잡히고 유입 세션만 잡힌다.)

import { useState } from "react";
import {
  destinationError,
  LINK_DESTINATION_MAX,
  LINK_UTM_MAX,
  absoluteSiteUrl,
  mergeTrackingQuery,
  stripControlChars,
} from "@/lib/analytics/tracked-links";
import { cn } from "@/lib/utils";
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

interface BuilderDraft extends UtmDraft {
  path: string;
}

const EMPTY: BuilderDraft = { path: "/", utmSource: "", utmMedium: "", utmCampaign: "", utmContent: "", utmTerm: "" };

export function UtmBuilder({ shortBase }: { shortBase: string }) {
  const [d, setD] = useState<BuilderDraft>(EMPTY);
  // 붙여넣기로 들어온 줄바꿈·제어문자는 입력 단계에서 지운다(추적 링크 폼·서버 검증과 같은 규칙).
  const set = <K extends keyof BuilderDraft>(key: K, value: BuilderDraft[K]) =>
    setD((prev) => ({ ...prev, [key]: (typeof value === "string" ? stripControlChars(value) : value) as BuilderDraft[K] }));

  const pathError = d.path.trim() ? destinationError(d.path) : "경로를 입력하세요";
  const missing = [!d.utmSource.trim() && "utm_source", !d.utmMedium.trim() && "utm_medium"].filter(Boolean) as string[];
  const ready = !pathError && missing.length === 0;

  const url = ready
    ? absoluteSiteUrl(
        shortBase,
        mergeTrackingQuery(d.path.trim(), {
          utmSource: d.utmSource.trim().toLowerCase(),
          utmMedium: d.utmMedium.trim().toLowerCase(),
          utmCampaign: d.utmCampaign,
          utmContent: d.utmContent,
          utmTerm: d.utmTerm,
        }),
      )
    : null;

  return (
    <div className="space-y-3">
      <PresetChips activeKey={matchPreset(d)} onPick={(p) => setD((prev) => applyPreset(prev, p))} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <FormField label="경로" htmlFor="ub-path" required error={d.path.trim() ? pathError ?? undefined : undefined} className="sm:col-span-2 xl:col-span-3">
          <input id="ub-path" className={cn(INPUT_CLASS, "font-mono")} value={d.path} maxLength={LINK_DESTINATION_MAX}
            placeholder="/resources/2026-09-hakpyeong-english" onChange={(e) => set("path", e.target.value)} />
        </FormField>
        <FormField label="소스 (utm_source)" htmlFor="ub-src" required>
          <input id="ub-src" className={cn(INPUT_CLASS, "font-mono")} value={d.utmSource} maxLength={LINK_UTM_MAX}
            placeholder="instagram" onChange={(e) => set("utmSource", e.target.value)} />
        </FormField>
        <FormField label="매체 (utm_medium)" htmlFor="ub-med" required>
          <input id="ub-med" className={cn(INPUT_CLASS, "font-mono")} value={d.utmMedium} maxLength={LINK_UTM_MAX}
            placeholder="social" onChange={(e) => set("utmMedium", e.target.value)} />
        </FormField>
        <FormField label="캠페인 (utm_campaign)" htmlFor="ub-camp">
          <input id="ub-camp" className={cn(INPUT_CLASS, "font-mono")} value={d.utmCampaign} maxLength={LINK_UTM_MAX}
            placeholder="sept_mock_free" onChange={(e) => set("utmCampaign", e.target.value)} />
        </FormField>
        <FormField label="콘텐츠 (utm_content)" htmlFor="ub-cont">
          <input id="ub-cont" className={cn(INPUT_CLASS, "font-mono")} value={d.utmContent} maxLength={LINK_UTM_MAX}
            placeholder="선택" onChange={(e) => set("utmContent", e.target.value)} />
        </FormField>
        <FormField label="키워드 (utm_term)" htmlFor="ub-term">
          <input id="ub-term" className={cn(INPUT_CLASS, "font-mono")} value={d.utmTerm} maxLength={LINK_UTM_MAX}
            placeholder="선택" onChange={(e) => set("utmTerm", e.target.value)} />
        </FormField>
      </div>

      <div className="space-y-1.5 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
        {url ? (
          <>
            <UrlLine label="완성 URL" url={url} copyMessage="UTM 주소를 복사했습니다" />
            <div className="pl-[72px]">
              <ClassificationHint utm={d} />
            </div>
          </>
        ) : (
          <p className="text-[12.5px] text-gray-500">
            {!d.path.trim() ? "경로를 입력하면" : pathError ? "경로를 고치면" : `${missing.join(" · ")} 를 채우면`} 완성 URL 이 여기에 나옵니다.
          </p>
        )}
        <p className="text-[11.5px] text-gray-400">
          UTM 주소는 클릭 수가 따로 잡히지 않고 유입 경로(방문)로만 집계됩니다. 클릭 수까지 보려면 위에서 추적 링크를 만드세요.
        </p>
      </div>
    </div>
  );
}
