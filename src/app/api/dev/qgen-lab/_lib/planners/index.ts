// qgen-lab 플래너 레지스트리 + 플래너 공용 헬퍼(지문 축자·유일 스팬, 문장 분할).
// 키 = ArmConfig.planner.id. "none" 은 등록하지 않는다(오케스트레이터가 계획 단계를 건너뜀).
// 설계별 구현(planners/<id>.ts)은 보정 결과 확정 후 별도로 추가하고 여기 PLANNERS 에 등록한다.
import { splitPassageSentences } from "@/lib/passage-sentence-utils";
import type {
  LabDifficulty,
  LabPassage,
  PlannerMode,
  PlannerPlan,
} from "@/lib/qgen-lab/types";

export interface PlannerContext {
  passage: LabPassage;
  difficulty: LabDifficulty;
  seed: number;
  params: Record<string, unknown>;
  mode: PlannerMode;
  /** 원장 phase(jev·LLM 호출 기록용). */
  phase: string;
}

export type PlannerFn = (ctx: PlannerContext) => Promise<PlannerPlan>;

// 설계별 플래너는 동적 import 로 등록한다 — candidates.ts 가 이 파일(sentenceSplit)을 import 하므로 정적 import 는 순환이 된다.
export const PLANNERS: Record<string, PlannerFn> = {
  "jev-answer-soft": (ctx) => import("./jev-answer-soft").then((m) => m.jevAnswerSoft(ctx)),
  "jev-full-soft": (ctx) => import("./jev-full-soft").then((m) => m.jevFullSoft(ctx)),
  "jev-hard": (ctx) => import("./jev-hard").then((m) => m.jevHard(ctx)),
};

export function getPlanner(id: string): PlannerFn | undefined {
  return Object.prototype.hasOwnProperty.call(PLANNERS, id) ? PLANNERS[id] : undefined;
}

// ── 공용 헬퍼 ────────────────────────────────────────────────────────────────

/** 지문 안에서 span 이 축자로 정확히 1번(겹침 포함) 나타나면 그 위치, 아니면 null.
 *  프로덕션 교사 포인트 규칙(`passage.includes(text)`)과 같은 부분문자열 의미 — 단어경계는 보지 않는다
 *  ("is" 는 "this" 안에서도 찾히므로 짧은 표현은 앞뒤 문맥을 붙여 유일하게 만들 것). */
export function findUniqueSpan(
  passage: string,
  span: string,
): { start: number; end: number } | null {
  if (!span) return null;
  const first = passage.indexOf(span);
  if (first < 0) return null;
  if (passage.indexOf(span, first + 1) >= 0) return null;
  return { start: first, end: first + span.length };
}

export interface LabSentence {
  idx: number;
  /** 원문(passage) 기준 오프셋 [start, end). */
  start: number;
  end: number;
  /** 원문 그대로의 조각(passage.slice(start, end)). */
  text: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 리포 정본 분할기(splitPassageSentences — 약어·소문자 후행·etc. 규칙)로 문장을 나눈 뒤,
 *  원문 오프셋으로 되짚는다(분할기는 공백을 접어 반환하므로 토큰 사이를 \s+ 로 맞춰 찾는다). */
export function sentenceSplit(passage: string): LabSentence[] {
  const parts = splitPassageSentences(passage);
  const out: LabSentence[] = [];
  let cursor = 0;
  for (const part of parts) {
    const tokens = part.split(" ").filter(Boolean);
    if (tokens.length === 0) continue;
    const re = new RegExp(tokens.map(escapeRe).join("\\s+"), "g");
    re.lastIndex = cursor;
    const m = re.exec(passage);
    let start: number;
    let end: number;
    if (m) {
      start = m.index;
      end = m.index + m[0].length;
    } else {
      // 되짚기 실패(이론상 없음) — 커서부터 길이만큼으로 근사해 인덱스 연속성을 지킨다.
      start = Math.min(cursor, passage.length);
      end = Math.min(passage.length, start + part.length);
    }
    out.push({ idx: out.length, start, end, text: passage.slice(start, end) });
    cursor = end;
  }
  return out;
}

/** 원문 오프셋이 속한 문장 인덱스(문장 사이 공백이면 다음 문장, 범위 밖이면 null). */
export function sentenceIndexAt(sentences: LabSentence[], offset: number): number | null {
  if (offset < 0) return null;
  for (const s of sentences) {
    if (offset < s.end) return s.idx;
  }
  return null;
}
