/**
 * Duplicate-detection helpers used across the workbench (passages/create,
 * passages list, extraction jobs).
 *
 * The normalization is deliberately aggressive: lowercases and strips every
 * non-alphanumeric character (including whitespace and Korean/Latin
 * punctuation, via the Unicode `\p{L}\p{N}` regex classes). This is robust
 * against the common OCR-introduced noise we see in extracted materials
 * (extra spaces, swapped punctuation, smart-quote variants).
 *
 * NOTE: Works in both browser and server (no Node `crypto` dependency).
 */
export function normalizeForDup(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export interface DuplicateGroup<T> {
  /** Normalized key shared by every item in the group. Stable identifier. */
  key: string;
  /** The original items belonging to this group, in input order. */
  items: T[];
}

export interface DuplicateIndex<T> {
  /** Number of items minus one PER GROUP, summed — how many items would be
   *  hidden if we collapsed every duplicate group to its first occurrence. */
  totalDuplicateCount: number;
  /** Number of distinct groups (size ≥ 2). */
  groupCount: number;
  /** Per-item-id, how many *other* items in the dataset share its normalized
   *  text. Zero (or absent) means the item is unique. */
  countById: Map<string, number>;
  /** Per-item-id, the normalized key of its group (only set for items in a
   *  group of size ≥ 2). */
  keyById: Map<string, string>;
  /** All duplicate groups (size ≥ 2), sorted descending by group size. Items
   *  inside each group preserve the order they appeared in the input. */
  groups: DuplicateGroup<T>[];
}

/**
 * Build an index of duplicate clusters for a list of items.
 *
 * `getText` returns the text to compare; falsy/empty results are skipped
 * (never grouped). `getId` returns a stable id per item — used as the map
 * key for `countById` / `keyById`.
 */
export function buildDuplicateIndex<T>(
  items: T[],
  getText: (item: T) => string | null | undefined,
  getId: (item: T) => string,
): DuplicateIndex<T> {
  // 1) Bucket items by normalized key. Preserves insertion order.
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const raw = getText(item);
    if (!raw) continue;
    const key = normalizeForDup(raw);
    if (key.length === 0) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  // 2) Collect duplicate-only buckets (size ≥ 2) into groups + lookup maps.
  const countById = new Map<string, number>();
  const keyById = new Map<string, string>();
  const groups: DuplicateGroup<T>[] = [];
  let totalDuplicateCount = 0;
  for (const [key, bucketItems] of buckets) {
    if (bucketItems.length < 2) continue;
    const dupSiblingCount = bucketItems.length - 1;
    totalDuplicateCount += dupSiblingCount;
    for (const item of bucketItems) {
      const id = getId(item);
      countById.set(id, dupSiblingCount);
      keyById.set(id, key);
    }
    groups.push({ key, items: bucketItems });
  }

  // 3) Sort groups by size descending (biggest clusters first — most useful
  //    when reviewing a long list).
  groups.sort((a, b) => b.items.length - a.items.length);

  return {
    totalDuplicateCount,
    groupCount: groups.length,
    countById,
    keyById,
    groups,
  };
}

/**
 * Given a duplicate index, return a set of item-ids to hide (every item
 * except the first in each duplicate group). Useful as a one-liner filter
 * for "hide duplicates" toggles.
 */
export function buildHiddenIdSet<T>(
  index: DuplicateIndex<T>,
  getId: (item: T) => string,
): Set<string> {
  const hidden = new Set<string>();
  for (const group of index.groups) {
    for (let i = 1; i < group.items.length; i += 1) {
      hidden.add(getId(group.items[i]));
    }
  }
  return hidden;
}
