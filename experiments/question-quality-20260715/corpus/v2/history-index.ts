import fs from "node:fs";
import path from "node:path";

import { contentHash, countWords, normalizeContent, sha256 } from "../selector-core";

export const HISTORY_SCHEMA_VERSION = 2;

export interface HistoricalTextOccurrence {
  contentHash: string;
  comparisonHash: string;
  sourceFile: string;
  jsonPath: string;
  field: string;
  wordCount: number;
  text: string;
}

export interface HistoricalIdOccurrence {
  passageId: string;
  sourceFile: string;
  jsonPath: string;
}

export interface HistoricalExposureIndex {
  filesScanned: number;
  parseFailures: Array<{ sourceFile: string; error: string }>;
  texts: HistoricalTextOccurrence[];
  ids: HistoricalIdOccurrence[];
  uniqueContentHashes: Set<string>;
  uniqueComparisonHashes: Set<string>;
  uniquePassageIds: Set<string>;
  sourceFileCounts: Record<string, number>;
}

const TEXT_KEYS = new Set([
  "passage",
  "passagetext",
  "passagecontent",
  "sourcepassage",
  "sourcepassagetext",
  "originalpassage",
  "originaltext",
  "content",
  "text",
]);

const ID_KEYS = new Set([
  "passageid",
  "passage_id",
  "sourcepassageid",
  "source_passage_id",
]);

function normalizeKey(key: string): string {
  return key.replace(/[^A-Za-z_]/g, "").toLowerCase();
}

function isPassageTextKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return TEXT_KEYS.has(normalized) || normalized.startsWith("passagewith");
}

function idAliases(id: string): string[] {
  const trimmed = id.trim();
  if (!trimmed) return [];
  return [...new Set([trimmed, trimmed.replace(/^repo:/i, "")])];
}

/**
 * Removes rendering marks and recurrent question/scaffold language before lexical
 * duplicate comparison. It deliberately does not rewrite ordinary prose.
 */
export function comparisonText(text: string): string {
  return normalizeContent(text)
    .normalize("NFKC")
    .replace(/<[^>]+>/g, " ")
    .replace(/__\s*(?:\([A-Ea-e]\)|[A-Ea-e])?\s*/g, " ")
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, " ")
    .replace(/\b(?:question|answer)\s*\d*\s*:/gi, " ")
    .replace(/\b(?:read the following passage|choose the best answer|according to the passage)\b/gi, " ")
    .replace(/\b(?:copyright|all rights reserved)\b[^.]*\.?/gi, " ")
    .replace(/_{3,}/g, " ")
    .toLowerCase()
    .match(/[a-z]+(?:'[a-z]+)?/g)?.join(" ") ?? "";
}

export function comparisonHash(text: string): string {
  return sha256(comparisonText(text));
}

function looksLikePassage(value: string): boolean {
  const normalized = normalizeContent(value);
  if (countWords(normalized) < 80) return false;
  const latin = normalized.match(/[A-Za-z]/g)?.length ?? 0;
  return latin / Math.max(1, normalized.replace(/\s/g, "").length) >= 0.55;
}

function walkJson(
  value: unknown,
  sourceFile: string,
  jsonPath: string,
  texts: HistoricalTextOccurrence[],
  ids: HistoricalIdOccurrence[],
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => walkJson(child, sourceFile, `${jsonPath}[${index}]`, texts, ids));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${jsonPath}.${key}`;
    const normalizedKey = normalizeKey(key);
    if (typeof child === "string" && ID_KEYS.has(normalizedKey)) {
      for (const alias of idAliases(child)) ids.push({ passageId: alias, sourceFile, jsonPath: childPath });
    }
    if (typeof child === "string" && isPassageTextKey(key) && looksLikePassage(child)) {
      const normalized = normalizeContent(child);
      texts.push({
        contentHash: contentHash(normalized),
        comparisonHash: comparisonHash(normalized),
        sourceFile,
        jsonPath: childPath,
        field: key,
        wordCount: countWords(normalized),
        text: normalized,
      });
    }
    walkJson(child, sourceFile, childPath, texts, ids);
  }
}

function collectFiles(roots: string[]): string[] {
  const result: string[] = [];
  const visit = (entryPath: string) => {
    if (!fs.existsSync(entryPath)) return;
    const stat = fs.statSync(entryPath);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(entryPath).sort()) {
        if (child === "node_modules" || child === ".git") continue;
        visit(path.join(entryPath, child));
      }
      return;
    }
    if (/\.(?:json|jsonl)$/i.test(entryPath)) result.push(entryPath);
  };
  roots.forEach(visit);
  return result.sort((a, b) => a.localeCompare(b));
}

export function scanHistoricalExposure(repoRoot: string, roots: string[]): HistoricalExposureIndex {
  const files = collectFiles(roots);
  const texts: HistoricalTextOccurrence[] = [];
  const ids: HistoricalIdOccurrence[] = [];
  const parseFailures: Array<{ sourceFile: string; error: string }> = [];
  let filesScanned = 0;

  for (const filePath of files) {
    const relative = path.relative(repoRoot, filePath).replace(/\\/g, "/");
    // The selector must not ingest its own outputs on a rerun. Existing v1
    // manifests remain visible because they are part of the prior audit state.
    if (relative.startsWith("experiments/question-quality-20260715/corpus/v2/")) continue;
    filesScanned += 1;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
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
        walkJson(JSON.parse(raw), relative, "$", texts, ids);
      }
    } catch (error) {
      parseFailures.push({
        sourceFile: relative,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const uniqueText = new Map<string, HistoricalTextOccurrence>();
  for (const item of texts) {
    const key = `${item.contentHash}|${item.comparisonHash}`;
    if (!uniqueText.has(key)) uniqueText.set(key, item);
  }
  const uniqueIds = new Map<string, HistoricalIdOccurrence>();
  for (const item of ids) {
    if (!uniqueIds.has(item.passageId)) uniqueIds.set(item.passageId, item);
  }
  const sourceFileCounts: Record<string, number> = {};
  for (const item of texts) sourceFileCounts[item.sourceFile] = (sourceFileCounts[item.sourceFile] ?? 0) + 1;

  return {
    filesScanned,
    parseFailures,
    texts: [...uniqueText.values()].sort((a, b) =>
      a.contentHash.localeCompare(b.contentHash) || a.sourceFile.localeCompare(b.sourceFile),
    ),
    ids: [...uniqueIds.values()].sort((a, b) => a.passageId.localeCompare(b.passageId)),
    uniqueContentHashes: new Set(texts.map((item) => item.contentHash)),
    uniqueComparisonHashes: new Set(texts.map((item) => item.comparisonHash)),
    uniquePassageIds: new Set(ids.map((item) => item.passageId)),
    sourceFileCounts: Object.fromEntries(
      Object.entries(sourceFileCounts).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

export function publicHistoricalIndex(index: HistoricalExposureIndex): Record<string, unknown> {
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    policy: {
      roots: "Repository experiments/ and scripts/ JSON/JSONL artifacts.",
      extraction:
        "Passage IDs plus English passage-like strings of at least 80 words from passage/text/content fields and rendered passage variants.",
      warning: "A hash records historical visibility; it is not a quality judgment.",
    },
    filesScanned: index.filesScanned,
    parseFailures: index.parseFailures,
    uniqueTextCount: index.texts.length,
    uniquePassageIdCount: index.ids.length,
    contentHashes: [...index.uniqueContentHashes].sort(),
    comparisonHashes: [...index.uniqueComparisonHashes].sort(),
    passageIds: [...index.uniquePassageIds].sort(),
    sourceFileCounts: index.sourceFileCounts,
  };
}
