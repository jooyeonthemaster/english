// ============================================================================
// 국어 지문 세트 — 시험지 공유지문 1박스 조립 헬퍼 (순수·클라이언트 안전)
// ============================================================================
// 시험지 렌더(paper-item-utils.buildGroups)가 소비한다:
//   - KO 세트 멤버는 groupId `set:<setId>` 로 묶이고(멤버 문항은 지문 미동봉),
//   - 그룹 선두에 지문 1박스: 전 멤버 markers 를 buildKoMarkedPassage 로 병합
//     오버레이한 지문 + 세트 지시문 "[n~m] 다음 글을 읽고 물음에 답하시오."
// prisma/AI import 금지 — 이 파일은 클라이언트 번들에 들어간다.
// ============================================================================

import { normalizeKo, spansOverlap } from "../core/ko-text";
import {
  buildKoMarkedPassage,
  resolveKoMarkers,
  type KoMarker,
  type KoResolvedMarker,
} from "../core/markers";
import type { KoMarkerWithSurface } from "../core/render-model";
import { readKoEnvelopeMarkers } from "./leakage";

export const KO_SET_GROUP_PREFIX = "set:";

export function koSetGroupId(setId: string): string {
  return `${KO_SET_GROUP_PREFIX}${setId}`;
}

export function isKoSetGroupId(groupId: string | null | undefined): boolean {
  return typeof groupId === "string" && groupId.startsWith(KO_SET_GROUP_PREFIX);
}

/**
 * structuredData(객체 또는 JSON 문자열)에서 KO 마커 배열을 읽는다.
 * KO 봉투가 아니거나 파싱 실패면 [] (비파괴 강등).
 * [KO-TYPES-4] targetSurface 보존 — 공유지문 병합은 지문 마커만 써야 한다.
 */
export function readKoMarkersFromStructuredData(structuredData: unknown): KoMarkerWithSurface[] {
  if (!structuredData) return [];
  if (typeof structuredData === "object" && !Array.isArray(structuredData)) {
    return readKoEnvelopeMarkers(structuredData);
  }
  if (typeof structuredData !== "string") return [];
  try {
    return readKoEnvelopeMarkers(JSON.parse(structuredData));
  } catch {
    return [];
  }
}

/**
 * 세트 지시문 — 번호는 그룹 내 문항 번호(orderNum)에서 파생한다.
 * 예: [18~21] 다음 글을 읽고 물음에 답하시오. (단일 문항이면 [18])
 */
export function buildKoSetDirective(orderNums: number[]): string {
  const nums = orderNums
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (nums.length === 0) return "다음 글을 읽고 물음에 답하시오.";
  const label =
    nums.length === 1 || nums[0] === nums[nums.length - 1]
      ? `[${nums[0]}]`
      : `[${nums[0]}~${nums[nums.length - 1]}]`;
  return `${label} 다음 글을 읽고 물음에 답하시오.`;
}

/**
 * 세트 공유지문 1박스 본문 — 전 멤버의 **지문 마커**를 한 지문에 병합 오버레이한다.
 * 마커가 하나도 없으면 normalizeKo 지문 그대로(개행 보존 — 운문 행 구분 유지).
 * 해소 실패 마커는 buildKoMarkedPassage 가 방어적으로 건너뛴다.
 * [KO-TYPES-4] targetSurface="stimulus" 마커는 문항 동봉 자료 전용이라 제외한다 —
 * 자료 구절이 지문에 우연히 존재하면 공유지문에 가짜 ㉠/ⓐ 가 이중으로 찍힌다
 * (단일문항 경로 render-model.ts 의 passage/stimulus 분리와 동일 규약).
 */
export function buildKoSetSharedPassage(
  passage: string,
  memberStructuredData: unknown[],
): string {
  const markers = memberStructuredData
    .flatMap(readKoMarkersFromStructuredData)
    .filter((m) => m.targetSurface !== "stimulus");
  if (markers.length === 0) return normalizeKo(passage);
  return buildKoMarkedPassage(passage, dropOverlappingKoMarkers(passage, markers));
}

// [KOSET-1 방어 렌더] 겹치는 마커는 배열 원순서(=세트 멤버 순서, 앞 멤버 우선)로
// 결정론 드롭한다. buildKoMarkedPassage 는 겹침 마커를 전부 pre-insertion 좌표로
// 삽입해(뒤 텍스트부터 back-to-front) 앞선 삽입으로 밀린 텍스트를 잘라 __ 마크업이
// 붕괴하므로, 삽입 전에 겹침을 제거해 뒤 멤버 마커만 소실시키고 나머지는 온전하게
// 지킨다. 신규 생성분은 scanKoSetForLeakage 의 ko-set-marker-overlap ERROR 가
// 선차단하고, 이 함수는 기저장 세트·게이트 탈주분의 4표면(세트 카드·웹 시험지·
// DOCX·HWPX) 공용 방어선이다. 겹침이 없으면 원배열 그대로(기존 경로 byte 동일).
function dropOverlappingKoMarkers(passage: string, markers: KoMarker[]): KoMarker[] {
  const { resolved } = resolveKoMarkers(passage, markers);
  if (resolved.length < 2) return markers;
  const accepted: KoResolvedMarker[] = [];
  for (const marker of resolved) {
    if (accepted.some((a) => spansOverlap(a.match, marker.match))) continue;
    accepted.push(marker);
  }
  if (accepted.length === resolved.length) return markers;
  // 해소 실패(unresolved) 마커는 buildKoMarkedPassage 가 어차피 건너뛰므로
  // accepted(해소분)만 돌려줘도 동작이 동일하다.
  return accepted;
}
