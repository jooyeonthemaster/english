// ============================================================================
// 클래스 스튜디오 — 학습 모듈 ↔ 스터디 스테이지 매핑 정본 (플레인 모듈)
//
// "모듈"은 디렉터에게 보여주는 배포 단위(어휘·직독직해·어법…)이고, 실체는
// worksheet-study 스테이지 화이트리스트다. 매핑·라벨은 이 파일이 단일 소스 —
// UI·서버 액션·배포 payload 가 전부 여기서 import 한다.
// 규범: docs/class-studio-spec.md §3.4 표 · §7.
// ============================================================================

import type { StudyStageId } from "@/lib/worksheet-study/types";

export type StudioModuleId =
  | "vocab"
  | "reading"
  | "grammar"
  | "cloze"
  | "order"
  | "production"
  | "exam";

export interface StudioModuleDef {
  id: StudioModuleId;
  /** 카드 제목(명사형) */
  label: string;
  /** 카드 부제(스펙 §3.4 문구 — 변형 금지) */
  subtitle: string;
  /** 이 모듈이 포함하는 스테이지들 — 배포 화이트리스트 재료 */
  stages: StudyStageId[];
}

export const STUDIO_MODULES: readonly StudioModuleDef[] = [
  { id: "vocab", label: "어휘", subtitle: "단어 시험", stages: ["vocab-quiz", "vocab-match"] },
  { id: "reading", label: "직독직해", subtitle: "문장 통독과 끊어 읽기", stages: ["reading", "chunk"] },
  { id: "grammar", label: "어법", subtitle: "어법 포인트 OX·택일", stages: ["grammar"] },
  { id: "cloze", label: "빈칸 복원", subtitle: "핵심 표현 빈칸 채우기", stages: ["cloze"] },
  { id: "order", label: "어순 배열", subtitle: "우리말 보고 어순 맞추기", stages: ["order"] },
  {
    id: "production",
    label: "해석·영작",
    subtitle: "해석 쓰기·백지 영작",
    stages: ["translation", "reproduction"],
  },
  { id: "exam", label: "실전 문제", subtitle: "수능형 확인 문제", stages: ["exam"] },
] as const;

export const STUDIO_MODULE_BY_ID: ReadonlyMap<StudioModuleId, StudioModuleDef> = new Map(
  STUDIO_MODULES.map((m) => [m.id, m]),
);

export function isStudioModuleId(v: unknown): v is StudioModuleId {
  return typeof v === "string" && STUDIO_MODULE_BY_ID.has(v as StudioModuleId);
}

/** 모듈 선택 → 스테이지 화이트리스트(중복 제거, 스테이지 카탈로그 순서 무관 — 필터 전용). */
export function stagesForModules(modules: readonly StudioModuleId[]): StudyStageId[] {
  const out: StudyStageId[] = [];
  for (const id of modules) {
    const def = STUDIO_MODULE_BY_ID.get(id);
    if (!def) continue;
    for (const s of def.stages) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** 스테이지 → 소속 모듈 역인덱스 (plan 스테이지를 모듈별 집계로 접을 때). */
export const MODULE_OF_STAGE: ReadonlyMap<StudyStageId, StudioModuleId> = new Map(
  STUDIO_MODULES.flatMap((m) => m.stages.map((s) => [s, m.id] as const)),
);

/** 배포 다이얼로그 강도 라벨(스펙 §3.4) ↔ StudyMode 매핑. */
export const STUDIO_INTENSITY = [
  { mode: "light", label: "가볍게" },
  { mode: "standard", label: "표준" },
  { mode: "intense", label: "집중" },
] as const;
export type StudioIntensityMode = (typeof STUDIO_INTENSITY)[number]["mode"];

/** 예상 학습 시간 톤 판정(스펙 §3.4 C) — 10~15분 목표 구간. */
export function estMinTone(totalMin: number): "good" | "neutral" | "warn" {
  if (totalMin >= 10 && totalMin <= 15) return "good";
  if (totalMin > 20) return "warn";
  return "neutral";
}
