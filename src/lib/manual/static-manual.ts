import fs from "node:fs";
import path from "node:path";

export const STATIC_MANUAL_VERSION = "redesign-185";
export const STATIC_MANUAL_PUBLIC_BASE = `/manual/${STATIC_MANUAL_VERSION}`;

export interface ManualSlideEntry {
  file: string;
  title: string;
  fno: string;
  fname: string;
  fslug: string;
}

export interface ManualGroup {
  no: string;
  name: string;
  slug: string;
  start: number;
  count: number;
}

export interface StaticManualManifest {
  entries: ManualSlideEntry[];
  groups: ManualGroup[];
}

let cachedManifest: StaticManualManifest | null | undefined;

function manifestPath() {
  return path.join(process.cwd(), "public", "manual", STATIC_MANUAL_VERSION, "slides.json");
}

function isSlideEntry(value: unknown): value is ManualSlideEntry {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ManualSlideEntry>;
  return (
    typeof item.file === "string" &&
    typeof item.title === "string" &&
    typeof item.fslug === "string" &&
    typeof item.fname === "string" &&
    typeof item.fno === "string"
  );
}

function isGroup(value: unknown): value is ManualGroup {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ManualGroup>;
  return (
    typeof item.no === "string" &&
    typeof item.name === "string" &&
    typeof item.slug === "string" &&
    typeof item.start === "number" &&
    typeof item.count === "number"
  );
}

export function getStaticManualManifest(): StaticManualManifest | null {
  const shouldCache = process.env.NODE_ENV === "production";
  if (shouldCache && cachedManifest !== undefined) return cachedManifest;

  try {
    const raw = fs.readFileSync(manifestPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<StaticManualManifest>;
    if (!Array.isArray(parsed.entries) || !Array.isArray(parsed.groups)) {
      if (shouldCache) cachedManifest = null;
      return null;
    }
    const entries = parsed.entries.filter(isSlideEntry);
    const groups = parsed.groups.filter(isGroup);
    const manifest = entries.length > 0 && groups.length > 0 ? { entries, groups } : null;
    if (shouldCache) cachedManifest = manifest;
    return manifest;
  } catch {
    if (shouldCache) cachedManifest = null;
    return null;
  }
}

export function getManualSlideAssetPath(file: string): string {
  return `${STATIC_MANUAL_PUBLIC_BASE}/${file.replace(/^\/+/, "")}`;
}

export function getManualSectionHref(slug: string): string {
  return `/director/help/manual/${slug}`;
}

export function getManualSectionSlides(
  manifest: StaticManualManifest,
  slug: string,
): { group: ManualGroup; slides: ManualSlideEntry[] } | null {
  const group = manifest.groups.find((item) => item.slug === slug);
  if (!group) return null;
  const slides = manifest.entries.slice(group.start, group.start + group.count);
  return { group, slides };
}
