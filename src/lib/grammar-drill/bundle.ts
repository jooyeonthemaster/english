// ============================================================================
// 어법 드릴 — 콘텐츠 번들 로더 (서버 전용)
//
// src/data/grammar-drill/ 의 JSON 파일들을 읽어 메모리에 1회 적재한다.
// 클라이언트로는 절대 통째로 내려보내지 않는다 — 큐 API가 문항 단위
// 화이트리스트 페이로드만 서빙한다.
//
// 파일 배치(저작 워크플로우의 파일 계약):
//   concepts/u01.json ~ u12.json          — 유닛별 개념 카드
//   items/u01-choice.json ~ u12-choice.json   — CHOICE 뱅크
//   items/u01-support.json ~ u12-support.json — OX + WRITE_FORM + WRITE_CORRECT
//   items/u01-reading.json ~ u12-reading.json — MULTI_UNDERLINE + PASSAGE
//   mixed/set1.json, set2.json, final.json    — 누적 복합 세트
//
// 파일이 아직 없으면(저작 진행 중) 조용히 건너뛴다 — 앱은 존재하는 유닛만
// 서빙하고, verify 스크립트가 완전성을 별도 게이트로 검사한다.
// ============================================================================

import "server-only";
import fs from "fs";
import path from "path";
import type {
  GrammarBundleStats,
  GrammarConcept,
  GrammarDifficulty,
  GrammarItem,
  GrammarItemType,
} from "./types";
import { GRAMMAR_UNITS } from "./curriculum";

export interface MixedSet {
  setId: "set1" | "set2" | "final";
  title: string;
  unitScope: string[];
  itemIds: string[];
}

export interface GrammarBundle {
  conceptsById: Map<string, GrammarConcept>;
  itemsById: Map<string, GrammarItem>;
  /** conceptId → itemId[] (드릴 서빙 인덱스) */
  itemIdsByConcept: Map<string, string[]>;
  /** unitId → itemId[] */
  itemIdsByUnit: Map<string, string[]>;
  mixedSets: MixedSet[];
  stats: GrammarBundleStats;
}

const DATA_DIR = path.join(process.cwd(), "src", "data", "grammar-drill");

function readJsonIfExists<T>(relPath: string): T | null {
  const full = path.join(DATA_DIR, relPath);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, "utf-8")) as T;
  } catch (error) {
    console.error(`[grammar-drill] JSON 파싱 실패: ${relPath}`, error);
    return null;
  }
}

function buildBundle(): GrammarBundle {
  const conceptsById = new Map<string, GrammarConcept>();
  const itemsById = new Map<string, GrammarItem>();
  const itemIdsByConcept = new Map<string, string[]>();
  const itemIdsByUnit = new Map<string, string[]>();
  const mixedSets: MixedSet[] = [];

  const byType: Record<GrammarItemType, number> = {
    CHOICE: 0,
    OX: 0,
    MULTI_UNDERLINE: 0,
    PASSAGE: 0,
    WRITE_FORM: 0,
    WRITE_CORRECT: 0,
  };
  const byDifficulty: Record<GrammarDifficulty, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  const registerItem = (item: GrammarItem) => {
    if (itemsById.has(item.id)) {
      console.error(`[grammar-drill] 문항 ID 중복 무시: ${item.id}`);
      return;
    }
    itemsById.set(item.id, item);
    byType[item.type] += 1;
    byDifficulty[item.difficulty] += 1;
    const byC = itemIdsByConcept.get(item.conceptId) ?? [];
    byC.push(item.id);
    itemIdsByConcept.set(item.conceptId, byC);
    const byU = itemIdsByUnit.get(item.unitId) ?? [];
    byU.push(item.id);
    itemIdsByUnit.set(item.unitId, byU);
  };

  for (const unit of GRAMMAR_UNITS) {
    const conceptsFile = readJsonIfExists<{ concepts: GrammarConcept[] }>(
      `concepts/${unit.id}.json`,
    );
    for (const concept of conceptsFile?.concepts ?? []) {
      conceptsById.set(concept.id, concept);
    }
    for (const bank of ["choice", "support", "reading"] as const) {
      const file = readJsonIfExists<{ items: GrammarItem[] }>(
        `items/${unit.id}-${bank}.json`,
      );
      for (const item of file?.items ?? []) registerItem(item);
    }
  }

  for (const setId of ["set1", "set2", "final"] as const) {
    const file = readJsonIfExists<{
      title: string;
      unitScope: string[];
      items: GrammarItem[];
    }>(`mixed/${setId}.json`);
    if (!file) continue;
    for (const item of file.items) registerItem(item);
    mixedSets.push({
      setId,
      title: file.title,
      unitScope: file.unitScope,
      itemIds: file.items.map((i) => i.id),
    });
  }

  return {
    conceptsById,
    itemsById,
    itemIdsByConcept,
    itemIdsByUnit,
    mixedSets,
    stats: {
      units: GRAMMAR_UNITS.length,
      concepts: conceptsById.size,
      items: itemsById.size,
      byType,
      byDifficulty,
    },
  };
}

// dev 핫리로드에서 파일 변경을 반영하도록 globalThis 캐시 + mtime 무효화는
// 두지 않는다 — 콘텐츠는 배포 단위로만 바뀌는 정적 자산이므로 프로세스당
// 1회 적재로 충분하다(dev에서 콘텐츠 갱신 시 서버 재시작).
let cached: GrammarBundle | null = null;

export function getGrammarBundle(): GrammarBundle {
  if (!cached) cached = buildBundle();
  return cached;
}

export function getGrammarItem(id: string): GrammarItem | null {
  return getGrammarBundle().itemsById.get(id) ?? null;
}

export function getGrammarConcept(id: string): GrammarConcept | null {
  return getGrammarBundle().conceptsById.get(id) ?? null;
}
