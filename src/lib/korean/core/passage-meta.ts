// ============================================================================
// 국어 지문 메타 — 갈래(KoPassageKind)·과목·복합지문 파트 판정
// ============================================================================
// 갈래는 Passage.tags(JSON 배열)에 "KO_KIND:<value>" 네임스페이스 태그로 저장한다
// (DB 스키마 무변경). 과목은 Passage.subject 컬럼(null=ENGLISH, "KOREAN"=국어).
// ============================================================================

export const KO_SUBJECT = "KOREAN" as const;

export type KoPassageKind =
  | "READING_HUM" //   독서 — 인문
  | "READING_SOC" //   독서 — 사회(법·경제 포함)
  | "READING_SCI" //   독서 — 과학
  | "READING_TECH" //  독서 — 기술
  | "READING_ART" //   독서 — 예술
  | "LIT_MODERN_POEM" //   문학 — 현대시
  | "LIT_CLASSIC_POEM" //  문학 — 고전시가(가사·시조 포함)
  | "LIT_MODERN_NOVEL" //  문학 — 현대소설
  | "LIT_CLASSIC_NOVEL" // 문학 — 고전소설(판소리계 포함)
  | "LIT_ESSAY" //         문학 — 수필
  | "LIT_PLAY" //          문학 — 극(희곡·시나리오)
  | "GRAMMAR_CONCEPT" //   문법 — 개념 설명 지문(지문형 문법·교과서 문법 단원)
  | "MIXED"; //            복합((가)(나) 갈래 복합·주제 통합)

export const KO_PASSAGE_KIND_LABELS: Record<KoPassageKind, string> = {
  READING_HUM: "독서·인문",
  READING_SOC: "독서·사회",
  READING_SCI: "독서·과학",
  READING_TECH: "독서·기술",
  READING_ART: "독서·예술",
  LIT_MODERN_POEM: "현대시",
  LIT_CLASSIC_POEM: "고전시가",
  LIT_MODERN_NOVEL: "현대소설",
  LIT_CLASSIC_NOVEL: "고전소설",
  LIT_ESSAY: "수필",
  LIT_PLAY: "극(희곡·시나리오)",
  GRAMMAR_CONCEPT: "문법 개념",
  MIXED: "복합 지문",
};

export const KO_READING_KINDS: ReadonlySet<KoPassageKind> = new Set([
  "READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART",
]);
export const KO_LITERATURE_KINDS: ReadonlySet<KoPassageKind> = new Set([
  "LIT_MODERN_POEM", "LIT_CLASSIC_POEM", "LIT_MODERN_NOVEL", "LIT_CLASSIC_NOVEL", "LIT_ESSAY", "LIT_PLAY",
]);
/** 운문 계열 — 지문 정규화에서 행 구분을 보존해야 하는 갈래. */
export const KO_VERSE_KINDS: ReadonlySet<KoPassageKind> = new Set([
  "LIT_MODERN_POEM", "LIT_CLASSIC_POEM",
]);

const KO_KIND_TAG_PREFIX = "KO_KIND:";

export function koKindToTag(kind: KoPassageKind): string {
  return `${KO_KIND_TAG_PREFIX}${kind}`;
}

/** Passage.tags(JSON 문자열 또는 배열)에서 갈래 태그를 읽는다. */
export function readKoKindFromTags(tags: unknown): KoPassageKind | null {
  let list: unknown[] = [];
  if (Array.isArray(tags)) list = tags;
  else if (typeof tags === "string" && tags.trim()) {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return null;
    }
  }
  for (const tag of list) {
    if (typeof tag === "string" && tag.startsWith(KO_KIND_TAG_PREFIX)) {
      const value = tag.slice(KO_KIND_TAG_PREFIX.length) as KoPassageKind;
      if (value in KO_PASSAGE_KIND_LABELS) return value;
    }
  }
  return null;
}

/** 기존 tags 배열에 갈래 태그를 병합한다 (기존 KO_KIND 태그는 교체). */
export function mergeKoKindIntoTags(tags: unknown, kind: KoPassageKind): string[] {
  let list: string[] = [];
  if (Array.isArray(tags)) list = tags.filter((t): t is string => typeof t === "string");
  else if (typeof tags === "string" && tags.trim()) {
    try {
      const parsed = JSON.parse(tags);
      if (Array.isArray(parsed)) list = parsed.filter((t): t is string => typeof t === "string");
    } catch {
      list = [];
    }
  }
  const rest = list.filter((t) => !t.startsWith(KO_KIND_TAG_PREFIX));
  return [...rest, koKindToTag(kind)];
}

export function isKoreanSubject(subject: unknown): boolean {
  return subject === KO_SUBJECT;
}

// ---------------------------------------------------------------------------
// 복합지문 파트 분리 — "(가) …\n(나) …" 규약 (KO-DESIGN-SPEC §4)
// ---------------------------------------------------------------------------

export interface KoPassagePart {
  label?: "(가)" | "(나)" | "(다)" | "(라)";
  text: string;
}

const PART_LABEL_RE = /^\((가|나|다|라)\)\s*/;

/**
 * 업로드 지문을 (가)(나)(다) 파트로 분리한다. 파트 라벨이 행 머리에 없으면
 * 단일 파트(label 없음)로 반환한다. 라벨은 행 시작에서만 인식해 본문 내
 * "(가)" 언급 오분리를 피한다.
 */
export function splitKoPassageParts(passage: string): KoPassagePart[] {
  const lines = passage.replace(/\r\n?/g, "\n").split("\n");
  const parts: KoPassagePart[] = [];
  let current: KoPassagePart | null = null;
  for (const line of lines) {
    const m = PART_LABEL_RE.exec(line.trim());
    if (m) {
      if (current) parts.push(current);
      current = {
        label: `(${m[1]})` as KoPassagePart["label"],
        text: line.trim().replace(PART_LABEL_RE, ""),
      };
    } else if (current) {
      current.text += (current.text ? "\n" : "") + line;
    } else {
      current = { text: line };
    }
  }
  if (current) parts.push(current);
  // 라벨 파트가 하나도 없으면 전체를 단일 파트로
  if (!parts.some((p) => p.label)) {
    return [{ text: passage.replace(/\r\n?/g, "\n").trim() }];
  }
  return parts.map((p) => ({ ...p, text: p.text.trim() })).filter((p) => p.text);
}

/** 갈래 미지정 지문의 휴리스틱 판정 (플래닝 프롬프트 힌트용 — 확정 아님). */
export function guessKoPassageKind(passage: string): KoPassageKind | null {
  const parts = splitKoPassageParts(passage);
  if (parts.length > 1) return "MIXED";
  const text = passage.trim();
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 6) {
    const shortLineRatio = lines.filter((l) => l.length <= 25).length / lines.length;
    if (shortLineRatio > 0.7) return null; // 운문 추정이나 현대/고전 구분 불가 — 사용자 선택 유도
  }
  return null;
}
