import fs from "node:fs";
import path from "node:path";

import {
  contentHash,
  countWords,
  normalizeContent,
  sha256,
  stableStringify,
} from "../selector-core";
import { comparisonHash } from "../v2/history-index";

export const V3_DERIVED_PREFIXES = [
  "experiments/question-quality-20260715/corpus/v3/",
  "experiments/question-quality-20260715/reviews/corpus-v3/",
] as const;

const ID_KEYS = new Set([
  "passageid",
  "passage_id",
  "sourcepassageid",
  "source_passage_id",
]);

export interface V3HistoricalText {
  contentHash: string;
  comparisonHash: string;
  sourceFile: string;
  jsonPath: string;
  field: string;
  wordCount: number;
  text: string;
}

export interface V3HistoricalId {
  passageId: string;
  sourceFile: string;
  jsonPath: string;
}

export interface V3HistoryIndex {
  filesScanned: number;
  filesHash: string;
  extractHash: string;
  parseFailures: Array<{ sourceFile: string; error: string }>;
  texts: V3HistoricalText[];
  ids: V3HistoricalId[];
  uniquePassageIds: Set<string>;
  excludedDerivedFiles: string[];
}

function normalizeKey(key: string): string {
  return key.replace(/[^A-Za-z_]/g, "").toLowerCase();
}

function idAliases(id: string): string[] {
  const trimmed = id.trim();
  if (!trimmed) return [];
  return [...new Set([trimmed, trimmed.replace(/^repo:/i, "")])];
}

function looksLikePassage(value: string): boolean {
  const normalized = normalizeContent(value);
  if (countWords(normalized) < 80) return false;
  const latin = normalized.match(/[A-Za-z]/g)?.length ?? 0;
  return latin / Math.max(1, normalized.replace(/\s/g, "").length) >= 0.55;
}

export function isV3DerivedArtifact(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return V3_DERIVED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function collectJsonFiles(roots: string[]): string[] {
  const output: string[] = [];
  const visit = (entry: string) => {
    if (!fs.existsSync(entry)) return;
    const stat = fs.statSync(entry);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(entry).sort()) {
        if (child === ".git" || child === "node_modules") continue;
        visit(path.join(entry, child));
      }
      return;
    }
    if (/\.(?:json|jsonl)$/i.test(entry)) output.push(entry);
  };
  roots.forEach(visit);
  return output.sort((left, right) => left.localeCompare(right));
}

function walkJson(
  value: unknown,
  sourceFile: string,
  jsonPath: string,
  texts: V3HistoricalText[],
  ids: V3HistoricalId[],
): void {
  if (typeof value === "string") {
    if (looksLikePassage(value)) {
      const normalized = normalizeContent(value);
      const field = jsonPath.match(/(?:\.([^.[\]]+)|\[([^\]]+)\])$/)?.slice(1).find(Boolean) ?? "$";
      texts.push({
        contentHash: contentHash(normalized),
        comparisonHash: comparisonHash(normalized),
        sourceFile,
        jsonPath,
        field,
        wordCount: countWords(normalized),
        text: normalized,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      walkJson(child, sourceFile, `${jsonPath}[${index}]`, texts, ids),
    );
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${jsonPath}.${key}`;
    if (typeof child === "string" && ID_KEYS.has(normalizeKey(key))) {
      for (const alias of idAliases(child)) {
        ids.push({ passageId: alias, sourceFile, jsonPath: childPath });
      }
    }
    // V2 used a field-name allowlist. V3 deliberately descends into every
    // string leaf, including bare strings in arrays.
    walkJson(child, sourceFile, childPath, texts, ids);
  }
}

export function scanHistoricalExposureV3(repoRoot: string, roots: string[]): V3HistoryIndex {
  const files = collectJsonFiles(roots);
  const texts: V3HistoricalText[] = [];
  const ids: V3HistoricalId[] = [];
  const parseFailures: Array<{ sourceFile: string; error: string }> = [];
  const includedFiles: Array<{ sourceFile: string; sha256: string }> = [];
  const excludedDerivedFiles: string[] = [];

  for (const filePath of files) {
    const relative = path.relative(repoRoot, filePath).replace(/\\/g, "/");
    if (isV3DerivedArtifact(relative)) {
      excludedDerivedFiles.push(relative);
      continue;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    includedFiles.push({ sourceFile: relative, sha256: sha256(raw) });
    if (/\.jsonl$/i.test(filePath)) {
      raw.split(/\r?\n/).forEach((line, index) => {
        if (!line.trim()) return;
        try {
          walkJson(JSON.parse(line), relative, `$line[${index + 1}]`, texts, ids);
        } catch (error) {
          parseFailures.push({
            sourceFile: `${relative}:${index + 1}`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    } else {
      try {
        walkJson(JSON.parse(raw), relative, "$", texts, ids);
      } catch (error) {
        parseFailures.push({
          sourceFile: relative,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const uniqueTexts = new Map<string, V3HistoricalText>();
  for (const item of texts) {
    const key = `${item.contentHash}|${item.comparisonHash}`;
    if (!uniqueTexts.has(key)) uniqueTexts.set(key, item);
  }
  const uniqueIds = new Map<string, V3HistoricalId>();
  for (const item of ids) if (!uniqueIds.has(item.passageId)) uniqueIds.set(item.passageId, item);
  const sortedTexts = [...uniqueTexts.values()].sort(
    (left, right) =>
      left.contentHash.localeCompare(right.contentHash) ||
      left.sourceFile.localeCompare(right.sourceFile),
  );
  const sortedIds = [...uniqueIds.values()].sort((left, right) =>
    left.passageId.localeCompare(right.passageId),
  );

  return {
    filesScanned: includedFiles.length,
    filesHash: sha256(stableStringify(includedFiles)),
    extractHash: sha256(
      stableStringify({
        texts: sortedTexts.map((item) => [item.contentHash, item.comparisonHash, item.sourceFile]),
        ids: sortedIds,
      }),
    ),
    parseFailures,
    texts: sortedTexts,
    ids: sortedIds,
    uniquePassageIds: new Set(sortedIds.map((item) => item.passageId)),
    excludedDerivedFiles: excludedDerivedFiles.sort(),
  };
}
