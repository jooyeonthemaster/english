// ============================================================================
// KO 유형 세부설정 리더/프롬프트 빌더 — 생성 파이프라인 진입점 (KO-DESIGN-SPEC §1)
// ============================================================================
// 영어 question-type-generation-settings/dispatchers.ts 의 KO_ 게이트가 여기로
// 위임한다. rawSettings(생성 모달이 저장한 Record)에서 examMode 와 유형 knob 값을
// 결정론으로 정규화하고, 레지스트리 모듈의 settings.buildPrompt 를 호출해
// 생성 프롬프트에 붙는 지시 블록을 만든다. 영어 리졸버는 무접촉.
// ============================================================================

import { KO_TYPE_REGISTRY } from "./registry";
import type {
  KoDifficulty,
  KoExamMode,
  KoResolvedTypeSettings,
} from "./registry/type-module";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * 설정 원본에서 키 하나를 읽는다 — 직접 키 우선, 없으면 rawSettings[typeId] 중첩
 * (영어 language.ts 의 direct→nested 관행 미러).
 */
function readKnobRaw(rawSettings: unknown, typeId: string, key: string): unknown {
  if (!isRecord(rawSettings)) return undefined;
  if (rawSettings[key] !== undefined) return rawSettings[key];
  const nested = rawSettings[typeId];
  if (isRecord(nested) && nested[key] !== undefined) return nested[key];
  return undefined;
}

/** examMode 정규화 — 미지정/오염 값은 SUNEUNG (수능 기본). */
export function readKoExamModeSetting(
  rawSettings: unknown,
  typeId?: string,
): KoExamMode {
  const raw = typeId
    ? readKnobRaw(rawSettings, typeId, "examMode")
    : isRecord(rawSettings)
      ? rawSettings.examMode
      : undefined;
  return raw === "NAESIN" ? "NAESIN" : "SUNEUNG";
}

function normalizeKoDifficulty(diffLabel: unknown): KoDifficulty {
  return diffLabel === "BASIC" || diffLabel === "KILLER" ? diffLabel : "INTERMEDIATE";
}

/**
 * rawSettings → KoResolvedTypeSettings. 미등록 유형/빈 설정도 안전하게
 * { examMode: "SUNEUNG" } 기본으로 강등한다 (우아한 강등 — 502 금지 관행).
 * knob 값은 모듈 선언(kind/options/defaultValue)에 대조해 검증한다.
 */
export function readKoResolvedSettings(
  typeId: string,
  rawSettings: unknown,
): KoResolvedTypeSettings {
  const resolved: KoResolvedTypeSettings = {
    examMode: readKoExamModeSetting(rawSettings, typeId),
  };
  const mod = KO_TYPE_REGISTRY[typeId];
  if (!mod) return resolved;

  for (const knob of mod.settings.knobs ?? []) {
    const raw = readKnobRaw(rawSettings, typeId, knob.key);
    if (knob.kind === "toggle") {
      resolved[knob.key] =
        typeof raw === "boolean" ? raw : knob.defaultValue === true;
    } else {
      const allowed = (knob.options ?? []).map((option) => option.value);
      resolved[knob.key] =
        typeof raw === "string" && allowed.includes(raw)
          ? raw
          : String(knob.defaultValue);
    }
  }
  return resolved;
}

/**
 * 유형 세부설정 지시 블록 — 레지스트리 모듈의 settings.buildPrompt + 난이도
 * 가이드를 합성한다. 미등록 유형은 빈 문자열 (프롬프트 무주입, 조용한 통과가
 * 아니라 validateKoQuestion 이 미등록을 차단하므로 안전).
 */
export function buildKoTypeSettingsPrompt(
  typeId: string,
  rawSettings: unknown,
  diffLabel: string | null | undefined,
): string {
  const mod = KO_TYPE_REGISTRY[typeId];
  if (!mod) return "";
  const difficulty = normalizeKoDifficulty(diffLabel);
  const settings = readKoResolvedSettings(typeId, rawSettings);

  const lines: string[] = [];
  const knobBlock = mod.settings.buildPrompt(settings, difficulty).trim();
  if (knobBlock) lines.push(knobBlock);
  const guide = mod.difficultyGuide[difficulty]?.trim();
  if (guide) lines.push(`- 난이도 세부 지침(${difficulty}): ${guide}`);
  if (lines.length === 0) return "";

  return [`## 유형 세부 설정: ${typeId}(${mod.meta.label})`, ...lines].join("\n");
}
