import {
  ATLAS_CLOUD_PROVIDER,
  ATLAS_FREE_MODEL_ID,
  ATLAS_PREMIUM_MODEL_ID,
  ATLAS_STANDARD_MODEL_ID,
  normalizeAtlasModelId,
} from "@/lib/atlas-ai";

import type { EditModelId } from "./types";

export const EDIT_MODEL_IDS = [
  "google/gemini-3.5-flash",
  "google/gemini-3.1-flash-lite",
  "anthropic/claude-sonnet-5",
] as const;

const DEFAULT_EDIT_MODEL: EditModelId = ATLAS_STANDARD_MODEL_ID as EditModelId;

export function isEditModelId(value: unknown): value is EditModelId {
  if (typeof value !== "string") return false;
  return (EDIT_MODEL_IDS as readonly string[]).includes(normalizeAtlasModelId(value));
}

export function resolveEditModelId(requested?: string): EditModelId {
  const fromRequest = requested?.trim();
  if (isEditModelId(fromRequest)) {
    return normalizeAtlasModelId(fromRequest) as EditModelId;
  }

  const fromEnv = process.env.QUESTION_EDIT_MODEL?.trim();
  if (isEditModelId(fromEnv)) {
    return normalizeAtlasModelId(fromEnv) as EditModelId;
  }

  return normalizeAtlasModelId(DEFAULT_EDIT_MODEL) as EditModelId;
}

export function editModelProvider(_modelId: EditModelId): typeof ATLAS_CLOUD_PROVIDER {
  return ATLAS_CLOUD_PROVIDER;
}

export const EDIT_MODEL_TIMEOUTS_MS: Record<string, number> = {
  [normalizeAtlasModelId(ATLAS_STANDARD_MODEL_ID)]: 60_000,
  [normalizeAtlasModelId(ATLAS_FREE_MODEL_ID)]: 45_000,
  [normalizeAtlasModelId(ATLAS_PREMIUM_MODEL_ID)]: 180_000,
};

export function editModelTimeoutMs(modelId: EditModelId): number {
  return EDIT_MODEL_TIMEOUTS_MS[normalizeAtlasModelId(modelId)] ?? 60_000;
}
