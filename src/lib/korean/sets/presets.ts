// ============================================================================
// 국어 지문 세트 — 프리셋 레지스트리 + 갈래→슬롯 결정론 해석 (KO-TYPE-CATALOG §3)
// ============================================================================
// 영어 장문세트(question-sets/presets.ts)의 앵커-재구성 모델 대신 "KO 병합-마커
// 공유지문" 모델을 쓴다: 세트 = 표준 KO 문항 N개(각자 markers 보유) + 시험지
// 렌더 시 전 멤버 마커를 한 지문에 병합 오버레이(붙박이 지문 사본 0).
//
// 슬롯 규칙(카탈로그 §3): 각 슬롯은 후보 유형의 우선순위 목록이고, 지문 갈래
// (KoPassageKind)와 각 모듈 meta.passageKinds 를 교차해 결정론으로 1개를 채택한다.
// 마커 라벨 충돌은 "패밀리(㉠/ⓐ/[A]) 독점" 규칙으로 해결한다 — 한 패밀리는 세트
// 내 1멤버만 사용. 후보 채택 시 패밀리 충돌이 없는 후보를 우선한다.
//
// 순수 모듈(브라우저 안전) — prisma/AI import 금지.
// ============================================================================

import type { KoMarkerFamily } from "../core/markers";
import type { KoPassageKind } from "../core/passage-meta";
import { charCountKo, eojeolCount } from "../core/ko-text";
import { getKoTypeModule } from "../registry";
import type { KoDifficulty, KoExamMode } from "../registry/type-module";

/** 누수스캔 blocking 시 해당 멤버 재생성 상한 — 소진 시 멤버 축소(DEGRADED). */
export const KO_SET_MEMBER_REGEN_MAX = 2;
/**
 * 크레딧 선차감 배수 — 실제 엔진 호출 상한(멤버당 초기 1회 + 재생성
 * KO_SET_MEMBER_REGEN_MAX 회)과 정합시킨다(KOSET-5: 종전 2는 재생성이 몰리면
 * 최대 멤버수×1회분 LLM 원가가 무계상으로 샜다). 미사용분은 라우트가 실호출 수
 * 기준으로 환불하므로 최종 청구액 = 실제 호출량이다(선차감만 커짐).
 */
export const KO_SET_CHARGE_ATTEMPTS = 1 + KO_SET_MEMBER_REGEN_MAX;

/** 프리셋 슬롯 — candidates 순서 = 우선순위(갈래·패밀리 충돌 회피 후 첫 후보 채택). */
export interface KoSetSlot {
  candidates: string[];
  /** 슬롯 배점 오버라이드([3점] 슬롯). 미지정 = 모듈 meta.defaultPoints. */
  points?: number;
  /** 슬롯 기본 난이도. 미지정 = 세트 호출자의 기본 난이도. */
  difficulty?: KoDifficulty;
}

export interface KoSetPreset {
  id: string;
  label: string;
  description: string;
  examMode: KoExamMode;
  slots: KoSetSlot[];
  /** 적용 가능 최소 분량 — 미달 지문은 메뉴에서 숨기고 라우트에서 거른다. */
  minChars: number; // 공백 제외 한글 글자수(charCountKo)
  minEojeol: number; // 어절 수(eojeolCount)
}

// ── 레지스트리 (3종) ─────────────────────────────────────────────────────────
export const KO_SET_PRESETS: readonly KoSetPreset[] = [
  {
    id: "ko-suneung-reading",
    label: "수능 독서 4문항",
    description:
      "내용 일치 → 추론(또는 ㉠㉡ 개념 비교) → <보기> 사례 적용[3점] → 어휘 ⓐ~ⓔ — 수능 독서 단일지문 세트.",
    examMode: "SUNEUNG",
    slots: [
      { candidates: ["KO_RD_FACT"] },
      { candidates: ["KO_RD_INFER", "KO_RD_CONCEPT"] },
      { candidates: ["KO_RD_APPLY"], points: 3 },
      { candidates: ["KO_RD_VOCAB"] },
    ],
    minChars: 600,
    minEojeol: 150,
  },
  {
    id: "ko-suneung-literature",
    label: "수능 문학 4문항",
    description:
      "표현/서술상 특징(갈래 따라) → 내용 이해·구절 의미 → 소재·말하기·심리 → <보기> 감상[3점] — 수능 문학 세트.",
    examMode: "SUNEUNG",
    slots: [
      { candidates: ["KO_LIT_EXPR", "KO_LIT_NARR"] },
      { candidates: ["KO_LIT_FACT", "KO_LIT_PHRASE"] },
      { candidates: ["KO_LIT_MOTIF", "KO_LIT_SPEECH", "KO_LIT_PSYCH"] },
      { candidates: ["KO_LIT_BOGI"], points: 3 },
    ],
    minChars: 400,
    minEojeol: 100,
  },
  {
    id: "ko-naesin-mixed",
    label: "내신 혼합 4문항",
    description:
      "갈래 호환 객관식 3문항 + 서답형(조건 서술 또는 근거 발췌) 1문항 — 내신 지필 혼합 세트.",
    examMode: "NAESIN",
    slots: [
      { candidates: ["KO_RD_FACT", "KO_LIT_FACT", "KO_LIT_EXPR"] },
      { candidates: ["KO_RD_INFER", "KO_LIT_PHRASE", "KO_LIT_NARR"] },
      { candidates: ["KO_RD_VOCAB", "KO_LIT_PSYCH", "KO_LIT_MOTIF"] },
      { candidates: ["KO_NS_COND", "KO_NS_EXTRACT"] },
    ],
    minChars: 350,
    minEojeol: 90,
  },
] as const;

const PRESET_BY_ID = new Map(KO_SET_PRESETS.map((p) => [p.id, p]));

export function resolveKoSetPreset(id: string | null | undefined): KoSetPreset | null {
  if (!id) return null;
  return PRESET_BY_ID.get(id) ?? null;
}

// ── 갈래→슬롯 결정론 해석 ────────────────────────────────────────────────────

export interface KoResolvedSetMember {
  typeId: string;
  label: string;
  points: number;
  difficulty?: KoDifficulty;
  answerFormat: "MC5" | "SHORT" | "ESSAY";
  /**
   * 이 멤버가 지문 마킹에 쓸 수 있는 패밀리(패밀리 독점 규칙 적용 후).
   * 빈 배열 = 마킹 금지 지시(모든 후보 패밀리가 앞 멤버에 예약됨 또는 무마킹 유형).
   */
  allowedFamilies: KoMarkerFamily[];
  /** 앞 멤버들이 이미 예약한 패밀리 — 프롬프트 금지 목록. */
  forbiddenFamilies: KoMarkerFamily[];
}

export type KoSetResolution =
  | { ok: true; members: KoResolvedSetMember[] }
  | { ok: false; reason: string };

/**
 * 프리셋 슬롯을 지문 갈래로 결정론 해석한다.
 *  1) 갈래 호환: kind 가 주어지면 meta.passageKinds 에 포함되는 후보만.
 *  2) 패밀리 독점: 이미 예약된 패밀리와 겹치지 않는 후보 우선. 전 후보가 겹치면
 *     첫 호환 후보를 채택하되 allowedFamilies=[] (마킹 금지 지시)로 강등.
 *  3) 채택 멤버는 allowedFamilies[0] 한 패밀리만 예약한다(마커 유형이 두 패밀리를
 *     모두 점유해 뒤 슬롯을 굶기는 것을 방지).
 */
export function resolveKoSetSlots(
  preset: KoSetPreset,
  kind: KoPassageKind | null,
): KoSetResolution {
  const claimed = new Set<KoMarkerFamily>();
  const members: KoResolvedSetMember[] = [];

  for (let slotIndex = 0; slotIndex < preset.slots.length; slotIndex += 1) {
    const slot = preset.slots[slotIndex];
    const compatible = slot.candidates.filter((typeId) => {
      const mod = getKoTypeModule(typeId);
      if (!mod) return false;
      if (!kind) return true;
      return mod.meta.passageKinds.includes(kind);
    });
    if (compatible.length === 0) {
      return {
        ok: false,
        reason: `'${preset.label}' ${slotIndex + 1}번 슬롯(${slot.candidates.join("/")})에 이 지문 갈래와 호환되는 유형이 없습니다.`,
      };
    }

    const familiesOf = (typeId: string): KoMarkerFamily[] =>
      getKoTypeModule(typeId)?.meta.markerFamilies ?? [];
    const collisionFree = compatible.find((typeId) => {
      const families = familiesOf(typeId);
      return families.length === 0 || families.some((f) => !claimed.has(f));
    });
    const picked = collisionFree ?? compatible[0];
    const mod = getKoTypeModule(picked);
    if (!mod) {
      return { ok: false, reason: `KO 유형 미등록: ${picked}` };
    }

    const forbiddenFamilies = [...claimed];
    const allowed = mod.meta.markerFamilies.filter((f) => !claimed.has(f));
    // 한 멤버는 한 패밀리만 예약(독점) — 나머지 후보 패밀리는 뒤 슬롯에 남긴다.
    const allowedFamilies = allowed.length > 0 ? [allowed[0]] : [];
    if (allowedFamilies.length > 0) claimed.add(allowedFamilies[0]);

    members.push({
      typeId: picked,
      label: mod.meta.label,
      points: slot.points ?? mod.meta.defaultPoints,
      difficulty: slot.difficulty,
      answerFormat: mod.meta.answerFormat,
      allowedFamilies,
      forbiddenFamilies,
    });
  }

  return { ok: true, members };
}

// ── 분량 게이트 ──────────────────────────────────────────────────────────────

export interface KoSetFeasibility {
  ok: boolean;
  reason?: string;
  chars: number;
  eojeol: number;
}

export function passageMeetsKoSetPreset(
  passage: string,
  preset: KoSetPreset,
): KoSetFeasibility {
  const chars = charCountKo(passage);
  const eojeol = eojeolCount(passage);
  if (chars < preset.minChars || eojeol < preset.minEojeol) {
    return {
      ok: false,
      reason: `'${preset.label}'은(는) 최소 ${preset.minChars}자·${preset.minEojeol}어절 지문이 필요합니다(현재 ${chars}자·${eojeol}어절).`,
      chars,
      eojeol,
    };
  }
  return { ok: true, chars, eojeol };
}

/** 이 지문에 적용 가능한 KO 세트 프리셋만(분량+갈래 해석 성공) — UI 메뉴 필터. */
export function availableKoSetPresetsForPassage(
  passage: string,
  kind: KoPassageKind | null,
): KoSetPreset[] {
  return KO_SET_PRESETS.filter(
    (p) => passageMeetsKoSetPreset(passage, p).ok && resolveKoSetSlots(p, kind).ok,
  );
}
