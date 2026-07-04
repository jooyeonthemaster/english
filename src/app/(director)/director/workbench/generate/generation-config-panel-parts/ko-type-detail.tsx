"use client";

// ============================================================================
// KO 유형 세부옵션 — 국어(KO_*) 유형 전용 상세 설정 패널 (KO-DESIGN-SPEC §1-G)
// ============================================================================
// 레지스트리(KO_TYPE_REGISTRY)의 meta.settings.knobs(select/toggle)를 일반
// 렌더하고, 전 유형 공통으로 수능/내신(examMode) 토글을 노출한다. 값은
// questionTypeSettings[typeId] 에 knob key 그대로 + examMode 로 저장되어
// B1 의 readKoResolvedSettings 가 소비하는 rawSettings 계약과 일치한다.
// 영어 유형 세부옵션(type-numeric-detail.tsx)과 완전히 분리된 KO 전용 표면 —
// 영어 경로 무접촉.
// ============================================================================

import { ShieldCheck } from "lucide-react";
import { getKoTypeModule } from "@/lib/korean/registry";
import type { KoSettingKnob } from "@/lib/korean/registry/type-module";

interface KoTypeDetailContentProps {
  typeId: string;
  questionTypeSettings: Record<string, Record<string, unknown> | undefined>;
  patchTypeSettings: (typeId: string, patch: Record<string, unknown>) => void;
}

export function KoTypeDetailContent({
  typeId,
  questionTypeSettings,
  patchTypeSettings,
}: KoTypeDetailContentProps) {
  const mod = getKoTypeModule(typeId);
  if (!mod) return null;
  const settings = (questionTypeSettings[typeId] ?? {}) as Record<
    string,
    unknown
  >;
  // 미설정 = SUNEUNG (레지스트리·검증기 기본값과 동일 — dispatch.readKoContext)
  const examMode = settings.examMode === "NAESIN" ? "NAESIN" : "SUNEUNG";
  const knobs = mod.settings.knobs ?? [];

  return (
    <div className="space-y-3">
      {/* 출제 기준(examMode) — 전 KO 유형 공통 토글 */}
      <div>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          출제 기준
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              {
                value: "SUNEUNG",
                label: "수능형",
                hint: "평가원 발문·재진술 위주",
              },
              {
                value: "NAESIN",
                label: "내신형",
                hint: "교과 밀착·지엽 변별 허용",
              },
            ] as const
          ).map((opt) => {
            const active = examMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  patchTypeSettings(typeId, { examMode: opt.value })
                }
                className={`flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                  active
                    ? "border-blue-300 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span className="text-[12px] font-bold">{opt.label}</span>
                <span
                  className={`text-[10px] leading-tight ${active ? "text-blue-600/80" : "text-slate-400"}`}
                >
                  {opt.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 유형별 knob (레지스트리 선언 일반 렌더) */}
      {knobs.map((knob) => (
        <KoKnobField
          key={knob.key}
          knob={knob}
          value={settings[knob.key]}
          onChange={(next) => patchTypeSettings(typeId, { [knob.key]: next })}
        />
      ))}

      {/* 난도5(솔버 게이트) 유형 안내 — 검수 권장 메타 노출 */}
      {mod.meta.needsSolverGate ? (
        <p className="flex items-start gap-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-[10.5px] leading-relaxed text-slate-500">
          <ShieldCheck
            className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400"
            aria-hidden="true"
          />
          3점급 고난도 유형 — 생성 후 독립 솔버 검증을 거치며, 출제 전 교사
          검수를 권장합니다.
        </p>
      ) : null}
    </div>
  );
}

function KoKnobField({
  knob,
  value,
  onChange,
}: {
  knob: KoSettingKnob;
  value: unknown;
  onChange: (next: string | boolean) => void;
}) {
  if (knob.kind === "toggle") {
    const current =
      typeof value === "boolean" ? value : knob.defaultValue === true;
    return (
      <div>
        <button
          type="button"
          role="switch"
          aria-checked={current}
          onClick={() => onChange(!current)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          <span className="text-[12px] font-semibold text-slate-700">
            {knob.label}
          </span>
          <span
            className={`flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${
              current ? "bg-blue-600" : "bg-slate-300"
            }`}
            aria-hidden="true"
          >
            <span
              className={`h-3 w-3 rounded-full bg-white transition-transform ${
                current ? "translate-x-3" : ""
              }`}
            />
          </span>
        </button>
        {knob.description ? (
          <p className="mt-1 px-0.5 text-[10px] leading-relaxed text-slate-400">
            {knob.description}
          </p>
        ) : null}
      </div>
    );
  }

  // select — 버튼 그리드(옵션 3개 이하) 또는 세로 스택
  const options = knob.options ?? [];
  const current =
    typeof value === "string" && options.some((o) => o.value === value)
      ? value
      : String(knob.defaultValue);
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {knob.label}
      </div>
      <div
        className={
          options.length <= 2 ? "grid grid-cols-2 gap-2" : "grid gap-1.5"
        }
      >
        {options.map((opt) => {
          const active = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`rounded-lg border px-2.5 py-1.5 text-left text-[12px] font-semibold transition-colors ${
                active
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {knob.description ? (
        <p className="mt-1 px-0.5 text-[10px] leading-relaxed text-slate-400">
          {knob.description}
        </p>
      ) : null}
    </div>
  );
}
