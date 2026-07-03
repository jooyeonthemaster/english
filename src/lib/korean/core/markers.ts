// ============================================================================
// 국어 시험지 마커 체계 — ㉠~㉭ / ⓐ~ⓔ / [A][B] / ㄱㄴㄷ
// ============================================================================
// 수능·내신 국어의 지문 마킹 관행(KO-TYPE-CATALOG §4.1):
//   ㉠~㉤(㉥) : 구절·문장·발화·공간 — 마커 + 구절 전체 밑줄
//   ⓐ~ⓔ(ⓕ) : 어휘·시어·소재      — 마커 + 단어만 밑줄
//   [A][B]   : 행 범위 블록          — 밑줄 없음, 블록 라벨
//   ㄱ, ㄴ, ㄷ: <보기> 내 항목 나열   — 지문 마킹 아님(보기 전용)
// 밑줄은 기존 인라인 문법 `__텍스트__` 를 재사용해 카드/시험지/DOCX/HWPX 의
// 공유 렌더 경로를 무변경으로 통과한다(KO-DESIGN-SPEC §4 — 무회귀 대원칙).
// ============================================================================

import { findSpanKo, normalizeKo, spansOverlap, type KoSpanMatch } from "./ko-text";

export type KoMarkerFamily = "KOR_CIRCLED" | "LATIN_CIRCLED" | "RANGE_BRACKET";

/** ㉠~㉭ — 한글 원문자 (U+3260~). 수능 실측 최대 ㉥, 여유분까지 보유. */
export const KOR_CIRCLED_LABELS = [
  "㉠", "㉡", "㉢", "㉣", "㉤", "㉥", "㉦", "㉧", "㉨", "㉩", "㉪", "㉫", "㉬", "㉭",
] as const;

/** ⓐ~ⓙ — 라틴 원문자 소문자 (U+24D0~). 수능 실측 최대 ⓕ. */
export const LATIN_CIRCLED_LABELS = [
  "ⓐ", "ⓑ", "ⓒ", "ⓓ", "ⓔ", "ⓕ", "ⓖ", "ⓗ", "ⓘ", "ⓙ",
] as const;

/** [A][B]… — 행 범위 블록 라벨. */
export const RANGE_BRACKET_LABELS = ["[A]", "[B]", "[C]", "[D]"] as const;

/** ㄱ~ㅎ — <보기> 항목 나열 라벨 (지문 마킹이 아니라 보기 내부 전용). */
export const BOGI_ITEM_LABELS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ"] as const;

/** 선지 번호 ①~⑤ (기존 영어 시스템과 동일 문자). */
export const OPTION_LABELS = ["①", "②", "③", "④", "⑤"] as const;

export function labelsForFamily(family: KoMarkerFamily): readonly string[] {
  switch (family) {
    case "KOR_CIRCLED":
      return KOR_CIRCLED_LABELS;
    case "LATIN_CIRCLED":
      return LATIN_CIRCLED_LABELS;
    case "RANGE_BRACKET":
      return RANGE_BRACKET_LABELS;
  }
}

export function isValidMarkerLabel(family: KoMarkerFamily, label: string): boolean {
  return (labelsForFamily(family) as readonly string[]).includes(label);
}

/** AI 응답·저장 데이터의 지문 마커 한 개. */
export interface KoMarker {
  family: KoMarkerFamily;
  /** "㉠" / "ⓐ" / "[A]" — labelsForFamily 집합 원소여야 한다. */
  label: string;
  /** 지문 verbatim 스팬 (공백 유연 매칭, 조사·어미 변형 불허). */
  spanText: string;
  /** 같은 스팬이 여러 번 나올 때 0-기반 n번째 지정. */
  occurrenceIndex?: number;
  /** 위치 확증용 주변 문맥(≥20자 권장) — 검증 게이트가 참조. */
  surroundingText?: string;
}

export interface KoResolvedMarker extends KoMarker {
  match: KoSpanMatch;
}

export interface KoMarkerResolution {
  resolved: KoResolvedMarker[];
  /** 위치 해소 실패 마커 (검증 게이트 KOQ_MARKER_UNRESOLVED 대상). */
  unresolved: KoMarker[];
  /** 서로 구간이 겹치는 마커 라벨 쌍 (KOQ_MARKER_OVERLAP 대상). */
  overlaps: [string, string][];
}

/** 마커 전체의 지문 내 위치를 해소하고 중첩을 검사한다. */
export function resolveKoMarkers(passage: string, markers: KoMarker[]): KoMarkerResolution {
  const resolved: KoResolvedMarker[] = [];
  const unresolved: KoMarker[] = [];
  for (const marker of markers) {
    const match = findSpanKo(passage, marker.spanText, marker.occurrenceIndex ?? 0);
    if (match) resolved.push({ ...marker, match });
    else unresolved.push(marker);
  }
  const overlaps: [string, string][] = [];
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      if (spansOverlap(resolved[i].match, resolved[j].match)) {
        overlaps.push([resolved[i].label, resolved[j].label]);
      }
    }
  }
  return { resolved, unresolved, overlaps };
}

/**
 * 표시용 마킹지문 생성 — 마커를 지문에 병합한다.
 *   KOR_CIRCLED  → "㉠__구절__"
 *   LATIN_CIRCLED→ "ⓐ__단어__"
 *   RANGE_BRACKET→ "[A] 블록…" (블록 앞 라벨, 밑줄 없음)
 * 뒤쪽 마커부터 삽입해 앞쪽 오프셋을 보존한다. 해소 실패 마커는 건너뛴다
 * (검증 게이트가 이미 차단하므로 렌더는 방어적으로만 동작).
 */
export function buildKoMarkedPassage(passage: string, markers: KoMarker[]): string {
  const { resolved } = resolveKoMarkers(passage, markers);
  const sorted = [...resolved].sort((a, b) => b.match.sourceStart - a.match.sourceStart);
  // findSpanKo 는 normalizeKo(passage) 좌표를 돌려주므로 같은 폼에서 삽입한다.
  let text = normalizeForMarkup(passage);
  for (const m of sorted) {
    const before = text.slice(0, m.match.sourceStart);
    const target = text.slice(m.match.sourceStart, m.match.sourceEnd);
    const after = text.slice(m.match.sourceEnd);
    if (m.family === "RANGE_BRACKET") {
      text = `${before}${m.label} ${target}${after}`;
    } else {
      // [KO-RENDER-3] 타깃이 개행을 걸치면(운문 행간걸침 마킹) 행마다 __ 를 여닫아
      // 행 단위 마크업 밸런스를 보장한다 — DOCX/HWPX 는 행 분할 후 행별 포맷 파서
      // (`__([^_]+)__`)를 돌리므로 멀티라인 __ 는 밑줄 대신 리터럴로 새어 나간다.
      // 단일 행 타깃은 종전과 byte 동일 출력.
      const underlined = target
        .split("\n")
        .map((line) => (line ? `__${line}__` : line))
        .join("\n");
      text = `${before}${m.label}${underlined}${after}`;
    }
  }
  return text;
}

// buildKoMarkedPassage 와 findSpanKo 의 좌표계 일치를 위한 정규화 (같은 normalizeKo 폼).
function normalizeForMarkup(passage: string): string {
  return normalizeKo(passage);
}
