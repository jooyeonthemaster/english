// ============================================================================
// KO_TYPE_REGISTRY — 국어 유형 모듈 집계 (KO-DESIGN-SPEC §1)
// ============================================================================
// 38개 유형 모듈(독서 8 + 문학 9 + 문법 8 + 화법·작문·매체 10 + 내신 서답형 3)을
// 한 곳에서 집계한다.
// 각 모듈은 자기완결(src/lib/korean/types/<CODE>.ts)이고, 여기서만 import·검증한다.
// ============================================================================

import type { KoTypeModule } from "./type-module";
import { assertKoTypeModuleInvariants } from "./type-module";

// 독서 (8)
import { KO_RD_FACT } from "../types/KO_RD_FACT";
import { KO_RD_STRUCT } from "../types/KO_RD_STRUCT";
import { KO_RD_INFER } from "../types/KO_RD_INFER";
import { KO_RD_CONCEPT } from "../types/KO_RD_CONCEPT";
import { KO_RD_CRIT } from "../types/KO_RD_CRIT";
import { KO_RD_APPLY } from "../types/KO_RD_APPLY";
import { KO_RD_VOCAB } from "../types/KO_RD_VOCAB";
import { KO_RD_THEORY } from "../types/KO_RD_THEORY";
// 문학 (9)
import { KO_LIT_EXPR } from "../types/KO_LIT_EXPR";
import { KO_LIT_NARR } from "../types/KO_LIT_NARR";
import { KO_LIT_FACT } from "../types/KO_LIT_FACT";
import { KO_LIT_PSYCH } from "../types/KO_LIT_PSYCH";
import { KO_LIT_PHRASE } from "../types/KO_LIT_PHRASE";
import { KO_LIT_BOGI } from "../types/KO_LIT_BOGI";
import { KO_LIT_COMPARE } from "../types/KO_LIT_COMPARE";
import { KO_LIT_MOTIF } from "../types/KO_LIT_MOTIF";
import { KO_LIT_SPEECH } from "../types/KO_LIT_SPEECH";
// 문법 (8)
import { KO_GR_READ } from "../types/KO_GR_READ";
import { KO_GR_PHONO } from "../types/KO_GR_PHONO";
import { KO_GR_MORPH } from "../types/KO_GR_MORPH";
import { KO_GR_SYNTAX } from "../types/KO_GR_SYNTAX";
import { KO_GR_ELEMENT } from "../types/KO_GR_ELEMENT";
import { KO_GR_NORM } from "../types/KO_GR_NORM";
import { KO_GR_APPLY } from "../types/KO_GR_APPLY";
import { KO_GR_HIST } from "../types/KO_GR_HIST";
// 화법·작문·매체 (10)
import { KO_SP_STRAT } from "../types/KO_SP_STRAT";
import { KO_SP_PLAN } from "../types/KO_SP_PLAN";
import { KO_SP_AUD } from "../types/KO_SP_AUD";
import { KO_SP_FUNC } from "../types/KO_SP_FUNC";
import { KO_SP_DEBATE } from "../types/KO_SP_DEBATE";
import { KO_WR_PLAN } from "../types/KO_WR_PLAN";
import { KO_WR_METHOD } from "../types/KO_WR_METHOD";
import { KO_WR_COND } from "../types/KO_WR_COND";
import { KO_WR_REVISE } from "../types/KO_WR_REVISE";
import { KO_MD_LANG } from "../types/KO_MD_LANG";
// 내신 서답형 (3)
import { KO_NS_EXTRACT } from "../types/KO_NS_EXTRACT";
import { KO_NS_COND } from "../types/KO_NS_COND";
import { KO_NS_CLOZE } from "../types/KO_NS_CLOZE";

const MODULES: KoTypeModule[] = [
  KO_RD_FACT, KO_RD_STRUCT, KO_RD_INFER, KO_RD_CONCEPT, KO_RD_CRIT, KO_RD_APPLY, KO_RD_VOCAB, KO_RD_THEORY,
  KO_LIT_EXPR, KO_LIT_NARR, KO_LIT_FACT, KO_LIT_PSYCH, KO_LIT_PHRASE, KO_LIT_BOGI, KO_LIT_COMPARE, KO_LIT_MOTIF, KO_LIT_SPEECH,
  KO_GR_READ, KO_GR_PHONO, KO_GR_MORPH, KO_GR_SYNTAX, KO_GR_ELEMENT, KO_GR_NORM, KO_GR_APPLY, KO_GR_HIST,
  KO_SP_STRAT, KO_SP_PLAN, KO_SP_AUD, KO_SP_FUNC, KO_SP_DEBATE,
  KO_WR_PLAN, KO_WR_METHOD, KO_WR_COND, KO_WR_REVISE, KO_MD_LANG,
  KO_NS_EXTRACT, KO_NS_COND, KO_NS_CLOZE,
];

export const KO_TYPE_REGISTRY: Record<string, KoTypeModule> = {};
for (const mod of MODULES) {
  assertKoTypeModuleInvariants(mod);
  if (KO_TYPE_REGISTRY[mod.meta.typeId]) {
    throw new Error(`KO 유형 중복 등록: ${mod.meta.typeId}`);
  }
  KO_TYPE_REGISTRY[mod.meta.typeId] = mod;
}

export const KO_TYPE_IDS: readonly string[] = MODULES.map((m) => m.meta.typeId);

export function isKoQuestionType(typeId: unknown): typeId is string {
  return typeof typeId === "string" && typeId.startsWith("KO_");
}

export function getKoTypeModule(typeId: string): KoTypeModule | null {
  return KO_TYPE_REGISTRY[typeId] ?? null;
}

/** 라벨 맵 파생 — 공유 파일들(TYPE_LABELS·SUBTYPE_LABELS 4벌)이 병합해 쓴다. */
export function koTypeLabelMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const mod of MODULES) map[mod.meta.typeId] = mod.meta.label;
  return map;
}

/** KO 객관식 유형 ID 집합 (MC_TYPE_IDS 병합용). */
export function koMcTypeIds(): string[] {
  return MODULES.filter((m) => m.meta.answerFormat === "MC5").map((m) => m.meta.typeId);
}

/** 영역(uiGroup)별 유형 ID — 생성 UI 그룹 구성용. */
export function koTypeIdsByGroup(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const mod of MODULES) {
    (map[mod.meta.uiGroup] ??= []).push(mod.meta.typeId);
  }
  return map;
}
