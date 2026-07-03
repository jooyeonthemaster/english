// ============================================================================
// 국어 지문 세트 — 결정론 누수스캔 (순수, AI/DB 0)
// ============================================================================
// 영어 leakage-gate 의 SpanKind 산술 대신 KO 병합-마커 모델의 3계층 검사:
//   1) 마커 패밀리 독점: 같은 패밀리(㉠/ⓐ/[A])를 두 멤버가 쓰면 라벨이 충돌한다
//      (병합 지문에 ㉠가 두 번) → ERROR, 뒤 멤버 재생성.
//   2) 정답 verbatim 노출: 멤버 A 의 학생 노출면(발문·<보기>·선지·해설)이 멤버 B 의
//      정답을 연속 run(기본 6어절, 내용어 기준) 이상 그대로 담으면 → ERROR,
//      노출한 멤버(A) 재생성.
//   3) 마커 스팬 겹침(cross-member): 두 멤버의 해소된 스팬이 겹치면 병합 지문
//      (buildKoMarkedPassage)에서 __ 마크업이 붕괴한다(㉠ 구절 절단·밑줄 이탈)
//      → ERROR, 뒤 멤버 재생성. [KOSET-1]
//   4) 같은 문장 마킹: 두 마킹 멤버의 스팬이 같은 문장 안이면(겹침은 아님) 서로
//      답 위치 힌트 → WARN (차단 아님 — 수능도 한 문장 다중 마킹 실측이 있어 보수적).
// 좌표계: findSpanKo/resolveKoMarkers 는 normalizeKo(passage) 좌표를 돌려주므로
// 문장 스팬도 normalizeKo(passage) 위에서 계산한다(ko-sentence-splitter 는 원문
// 오프셋 보존 계약).
// ============================================================================

import { normalizeKo, spansOverlap } from "../core/ko-text";
import {
  resolveKoMarkers,
  type KoMarker,
  type KoMarkerFamily,
} from "../core/markers";
import { readKoStimulusBlocks, type KoMarkerWithSurface } from "../core/render-model";
import { splitKoSentences } from "../text/ko-sentence-splitter";
import { koLongestSharedRun } from "../text/ko-tokenizer";

export const KO_SET_ANSWER_LEAK_MIN_RUN = 6;

export interface KoSetScanMember {
  /** 세트 내 순번(orderInSet). */
  index: number;
  typeId: string;
  /**
   * 이 멤버의 마커 전체(structuredData.markers). [KO-TYPES-4] targetSurface 를
   * 보존해 전달할 것 — 공유지문 병합·패밀리·겹침·같은문장 검사는 지문 마커
   * (targetSurface !== "stimulus")만 대상으로 한다(자료 마커는 문항별 자산이라
   * 세트 지문과 충돌하지 않는다). scanKoSetForLeakage 가 내부에서 필터한다.
   */
  markers: KoMarkerWithSurface[];
  /** 정답 계열 텍스트 — 객관식 정답 선지 텍스트, 서답형 모범답안/정답. */
  answerTexts: string[];
  /** 학생 노출면 — 발문·<보기> 행·선지 텍스트(+해설: 정답지 노출까지 방어). */
  exposedTexts: string[];
  /** 프리셋 해석이 배정한 허용 패밀리(검사 시 예약 위반 판정). 미전달 = 검사 생략. */
  allowedFamilies?: KoMarkerFamily[];
}

export type KoSetLeakageCode =
  | "ko-set-family-conflict"
  | "ko-set-family-forbidden"
  | "ko-set-answer-leak"
  | "ko-set-marker-overlap"
  | "ko-set-same-sentence";

export interface KoSetLeakageConflict {
  a: number;
  b: number;
  severity: "ERROR" | "WARN";
  code: KoSetLeakageCode;
  reason: string;
  /** 재생성(또는 강등) 대상 멤버 index. */
  regenerateIndex: number;
}

export interface KoSetLeakageReport {
  status: "OK" | "CONFLICT";
  conflicts: KoSetLeakageConflict[];
}

function usedFamilies(markers: KoMarker[]): KoMarkerFamily[] {
  const out: KoMarkerFamily[] = [];
  for (const m of markers) {
    if (!out.includes(m.family)) out.push(m.family);
  }
  return out;
}

export function scanKoSetForLeakage(
  members: KoSetScanMember[],
  passage: string,
  opts: { verse?: boolean; minRun?: number } = {},
): KoSetLeakageReport {
  const conflicts: KoSetLeakageConflict[] = [];
  const seen = new Set<string>();
  const push = (c: KoSetLeakageConflict) => {
    const key = `${c.code}:${c.a}:${c.b}:${c.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    conflicts.push(c);
  };
  const minRun = opts.minRun ?? KO_SET_ANSWER_LEAK_MIN_RUN;

  // [KO-TYPES-4] 지문 표면 검사 대상 마커 — 자료(stimulus) 마커 제외.
  // stimulus 마커는 문항 동봉 자료에 찍히는 문항별 자산이라 공유지문의 패밀리
  // 독점·스팬 겹침·같은 문장 힌트와 무관하다(지문 패밀리로 계상하면 화작·매체
  // 유형 합류 시 family-forbidden 오차단으로 결정론 재생성·강등이 난다).
  const passageMarkersOf = (member: KoSetScanMember): KoMarker[] =>
    member.markers.filter((m) => m.targetSurface !== "stimulus");

  // ── 1) 패밀리 독점 + 예약 위반 ────────────────────────────────────────────
  const familyOwner = new Map<KoMarkerFamily, number>();
  for (const member of members) {
    const families = usedFamilies(passageMarkersOf(member));
    for (const family of families) {
      const owner = familyOwner.get(family);
      if (owner === undefined) {
        familyOwner.set(family, member.index);
        continue;
      }
      if (owner !== member.index) {
        push({
          a: owner,
          b: member.index,
          severity: "ERROR",
          code: "ko-set-family-conflict",
          reason: `마커 패밀리 ${family} 를 두 문항이 함께 사용했습니다(패밀리당 1문항).`,
          regenerateIndex: member.index,
        });
      }
    }
    if (member.allowedFamilies) {
      const allowedSet = new Set(member.allowedFamilies);
      for (const family of families) {
        if (!allowedSet.has(family)) {
          push({
            a: member.index,
            b: member.index,
            severity: "ERROR",
            code: "ko-set-family-forbidden",
            reason: `이 문항에 허용되지 않은 마커 패밀리 ${family} 를 사용했습니다(허용: ${
              member.allowedFamilies.length ? member.allowedFamilies.join(", ") : "마킹 금지"
            }).`,
            regenerateIndex: member.index,
          });
        }
      }
    }
  }

  // ── 2) 정답 verbatim 노출 (A 노출면 × B 정답) ────────────────────────────
  for (const exposer of members) {
    for (const owner of members) {
      if (exposer.index === owner.index) continue;
      for (const answer of owner.answerTexts) {
        if (!answer || !answer.trim()) continue;
        for (const exposed of exposer.exposedTexts) {
          if (!exposed || !exposed.trim()) continue;
          const run = koLongestSharedRun(answer, exposed);
          if (run >= minRun) {
            push({
              a: exposer.index,
              b: owner.index,
              severity: "ERROR",
              code: "ko-set-answer-leak",
              reason: `#${exposer.index + 1} 문항의 노출면이 #${owner.index + 1} 문항의 정답을 연속 ${run}어절 그대로 담고 있습니다.`,
              regenerateIndex: exposer.index,
            });
            break; // 이 (answer, exposer) 쌍은 1건이면 충분
          }
        }
      }
    }
  }

  // ── 3) cross-member 마커 스팬 겹침 (차단) ───────────────────────────────
  // [KOSET-1] 두 멤버가 겹치는 스팬을 마킹하면 buildKoMarkedPassage 의 병합이
  // 앞선 삽입으로 밀린 오프셋 위를 잘라 __ 마크업이 붕괴한다(㉠ 구절 절단·
  // 밑줄 이탈·리터럴 언더스코어). 좌표계는 양 멤버 모두 같은 passage 의
  // normalizeKo 폼(findSpanKo 계약)이므로 그대로 비교한다.
  const memberResolutions = members.map((member) => ({
    index: member.index,
    // [KO-TYPES-4] 지문 마커만 해소 — stimulus 마커 스팬이 지문에 우연히
    // 존재해도 겹침/같은문장 검사 대상이 아니다.
    resolved: resolveKoMarkers(passage, passageMarkersOf(member)).resolved,
  }));
  for (let i = 0; i < memberResolutions.length; i += 1) {
    for (let j = i + 1; j < memberResolutions.length; j += 1) {
      const a = memberResolutions[i];
      const b = memberResolutions[j];
      let overlapPair: [string, string] | null = null;
      for (const ra of a.resolved) {
        for (const rb of b.resolved) {
          if (spansOverlap(ra.match, rb.match)) {
            overlapPair = [ra.label, rb.label];
            break;
          }
        }
        if (overlapPair) break;
      }
      if (overlapPair) {
        push({
          a: a.index,
          b: b.index,
          severity: "ERROR",
          code: "ko-set-marker-overlap",
          reason: `두 문항의 지문 마킹 구간이 겹칩니다(${overlapPair[0]} ↔ ${overlapPair[1]}) — 겹치지 않는 다른 구절을 마킹할 것.`,
          // same-sentence WARN 과 동일하게 뒤 멤버 재생성.
          regenerateIndex: Math.max(a.index, b.index),
        });
      }
    }
  }

  // ── 4) 같은 문장 마킹 (경고) ─────────────────────────────────────────────
  const norm = normalizeKo(passage);
  const sentences = splitKoSentences(norm, {
    mode: opts.verse ? "verse" : "prose",
  }).sentences;
  const sentenceIndexOf = (offset: number): number =>
    sentences.findIndex((s) => offset >= s.start && offset < s.end);

  const memberSentences = memberResolutions.map(({ index, resolved }) => {
    const indices = new Set<number>();
    for (const r of resolved) {
      const idx = sentenceIndexOf(r.match.sourceStart);
      if (idx >= 0) indices.add(idx);
    }
    return { index, sentenceIndices: indices };
  });
  for (let i = 0; i < memberSentences.length; i += 1) {
    for (let j = i + 1; j < memberSentences.length; j += 1) {
      const a = memberSentences[i];
      const b = memberSentences[j];
      if (a.sentenceIndices.size === 0 || b.sentenceIndices.size === 0) continue;
      const shared = [...a.sentenceIndices].some((idx) => b.sentenceIndices.has(idx));
      if (shared) {
        push({
          a: a.index,
          b: b.index,
          severity: "WARN",
          code: "ko-set-same-sentence",
          reason: "두 문항이 같은 문장 안에 마킹을 두었습니다(상호 힌트 가능).",
          regenerateIndex: Math.max(a.index, b.index),
        });
      }
    }
  }

  return {
    status: conflicts.some((c) => c.severity === "ERROR") ? "CONFLICT" : "OK",
    conflicts,
  };
}

// ── 스캔 입력 구성 헬퍼 (KO 봉투 → KoSetScanMember 필드) ─────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * KO 봉투에서 마커 배열을 방어적으로 읽는다(형태 불량 원소는 버림).
 * [KO-TYPES-4] targetSurface 를 보존한다 — 종전에는 드랍되어 세트 계층 전체
 * (공유지문 병합·패밀리 검사)가 stimulus 마커를 지문 마커로 오분류했다.
 * targetSurface 생략(기존 봉투 전부) = 지문 마킹 — render-model readMarkers 와 동일 규약.
 */
export function readKoEnvelopeMarkers(data: unknown): KoMarkerWithSurface[] {
  if (!isRecord(data) || !Array.isArray(data.markers)) return [];
  const out: KoMarkerWithSurface[] = [];
  for (const raw of data.markers) {
    if (!isRecord(raw)) continue;
    if (
      (raw.family === "KOR_CIRCLED" ||
        raw.family === "LATIN_CIRCLED" ||
        raw.family === "RANGE_BRACKET") &&
      typeof raw.label === "string" &&
      typeof raw.spanText === "string"
    ) {
      out.push({
        family: raw.family,
        label: raw.label,
        spanText: raw.spanText,
        occurrenceIndex:
          typeof raw.occurrenceIndex === "number" ? raw.occurrenceIndex : undefined,
        surroundingText:
          typeof raw.surroundingText === "string" ? raw.surroundingText : undefined,
        targetSurface: raw.targetSurface === "stimulus" ? "stimulus" : undefined,
      });
    }
  }
  return out;
}

/** KO 봉투에서 정답 계열 텍스트를 추출한다(객관식=정답 선지 텍스트, 서답형=모범답안). */
export function readKoEnvelopeAnswerTexts(data: unknown): string[] {
  if (!isRecord(data)) return [];
  const out: string[] = [];
  const correct = typeof data.correctAnswer === "string" ? data.correctAnswer.trim() : "";
  if (Array.isArray(data.options)) {
    for (const raw of data.options) {
      if (!isRecord(raw)) continue;
      if (typeof raw.label === "string" && typeof raw.text === "string" && raw.label === correct) {
        out.push(raw.text);
      }
    }
  } else if (correct) {
    out.push(correct);
  }
  if (isRecord(data.essay) && isRecord(data.essay.answerSheet)) {
    const model = data.essay.answerSheet.model;
    if (typeof model === "string" && model.trim()) out.push(model);
  }
  return out;
}

/** KO 봉투에서 학생 노출면(발문·보기·자료·선지)+해설을 추출한다. */
export function readKoEnvelopeExposedTexts(data: unknown): string[] {
  if (!isRecord(data)) return [];
  const out: string[] = [];
  if (typeof data.direction === "string") out.push(data.direction);
  if (isRecord(data.bogi) && Array.isArray(data.bogi.lines)) {
    for (const line of data.bogi.lines) {
      if (typeof line === "string") out.push(line);
    }
  }
  // [KO-TYPES-4] 자체자료(koStimulus)도 학생 노출면 — 초고·발표문 등 자료 표면에
  // 다른 멤버의 정답이 verbatim 노출되는 세트 간 누수를 스캔에 편입한다.
  for (const block of readKoStimulusBlocks(data.koStimulus)) {
    if (block.title) out.push(block.title);
    out.push(...block.lines);
  }
  if (Array.isArray(data.options)) {
    for (const raw of data.options) {
      if (isRecord(raw) && typeof raw.text === "string") out.push(raw.text);
    }
  }
  if (isRecord(data.essay) && Array.isArray(data.essay.conditions)) {
    for (const cond of data.essay.conditions) {
      if (typeof cond === "string") out.push(cond);
    }
  }
  if (typeof data.explanation === "string") out.push(data.explanation);
  return out;
}
