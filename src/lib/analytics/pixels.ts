// ============================================================================
// 마케팅 픽셀 설정 읽기/쓰기(서버) — platform_settings key "analytics_pixels"(JSON).
// DB 값 우선, 필드가 비면 env NEXT_PUBLIC_* 폴백, DB 오류 시 env 만(§8.1·§8.2).
// 순수 정의(형식·검증·로드 범위)는 pixels-common.ts — 클라이언트와 공용.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import {
  PIXEL_ENV_KEYS,
  PIXEL_ID_FIELDS,
  emptyPixelConfig,
  isValidPixelId,
  type PixelConfig,
  type PixelIdField,
} from "./pixels-common";

export * from "./pixels-common";

export const PIXEL_SETTING_KEY = "analytics_pixels";

export type PixelSource = "db" | "env" | "none";

export interface PixelConfigState {
  /** 실제 적용 설정(DB → env 폴백 반영, 형식 오류 값은 제외) */
  config: PixelConfig;
  /** 필드별 적용 출처 */
  sources: Record<PixelIdField, PixelSource>;
  /** enabled 출처 — DB 에 저장된 적이 없으면 기본값(켜짐) */
  enabledSource: "db" | "default";
  /** DB 에 저장된 원본(행이 없거나 파싱 불가면 null) — 관리자 폼 초기값 */
  stored: PixelConfig | null;
  /** env 폴백 값(원문, 비어 있으면 "") */
  env: Record<PixelIdField, string>;
  /** 값은 있으나 형식이 틀려 무시된 필드와 그 위치 */
  invalid: Partial<Record<PixelIdField, "db" | "env">>;
  /** DB 행 마지막 수정 시각(ISO) */
  updatedAt: string | null;
  /** DB 조회 실패 — env 만 적용 중 */
  dbError: boolean;
}

/** GET/PUT /api/admin/analytics/pixels 응답 */
export interface PixelSettingsResponse extends PixelConfigState {
  /** 저장 권한(SUPER_ADMIN) */
  canEdit: boolean;
}

function readEnv(): Record<PixelIdField, string> {
  const out = {} as Record<PixelIdField, string>;
  for (const f of PIXEL_ID_FIELDS) out[f] = (process.env[PIXEL_ENV_KEYS[f]] ?? "").trim();
  return out;
}

/** 저장 JSON → PixelConfig + 저장된 enabled(없으면 null). 파싱 불가·객체 아님이면 null. */
function parseStored(value: string): { config: PixelConfig; enabled: boolean | null } | null {
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const enabled = typeof r.enabled === "boolean" ? r.enabled : null;
  const config = emptyPixelConfig(enabled ?? true);
  for (const f of PIXEL_ID_FIELDS) {
    const v = r[f];
    config[f] = typeof v === "string" ? v.trim() : "";
  }
  return { config, enabled };
}

/** 절대 throw 하지 않는다 — 공개 설정 API 가 이걸로 응답한다. */
export async function readPixelConfig(): Promise<PixelConfigState> {
  const env = readEnv();
  let stored: PixelConfig | null = null;
  let storedEnabled: boolean | null = null;
  let updatedAt: string | null = null;
  let dbError = false;

  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: PIXEL_SETTING_KEY } });
    if (row) {
      updatedAt = row.updatedAt.toISOString();
      const parsed = parseStored(row.value);
      stored = parsed?.config ?? null;
      storedEnabled = parsed?.enabled ?? null;
    }
  } catch (err) {
    dbError = true;
    console.error("[analytics] pixel config read failed — env 폴백", err);
  }

  const config = emptyPixelConfig(storedEnabled ?? true);
  const sources = {} as Record<PixelIdField, PixelSource>;
  const invalid: Partial<Record<PixelIdField, "db" | "env">> = {};

  for (const f of PIXEL_ID_FIELDS) {
    const dbValue = stored?.[f] ?? "";
    if (dbValue && isValidPixelId(f, dbValue)) {
      config[f] = dbValue;
      sources[f] = "db";
      continue;
    }
    if (dbValue) invalid[f] = "db";
    if (env[f] && isValidPixelId(f, env[f])) {
      config[f] = env[f];
      sources[f] = "env";
      continue;
    }
    if (env[f] && !invalid[f]) invalid[f] = "env";
    sources[f] = "none";
  }

  return {
    config,
    sources,
    enabledSource: storedEnabled === null ? "default" : "db",
    stored,
    env,
    invalid,
    updatedAt,
    dbError,
  };
}

/** 검증을 통과한 설정만 넘길 것(validatePixelInput). */
export async function writePixelConfig(config: PixelConfig): Promise<void> {
  const payload: Record<string, string | boolean> = { enabled: config.enabled };
  for (const f of PIXEL_ID_FIELDS) payload[f] = config[f];
  const value = JSON.stringify(payload);
  await prisma.platformSetting.upsert({
    where: { key: PIXEL_SETTING_KEY },
    create: { key: PIXEL_SETTING_KEY, value },
    update: { value },
  });
}
