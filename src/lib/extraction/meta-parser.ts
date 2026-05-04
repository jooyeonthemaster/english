// ============================================================================
// SourceMaterial metadata parser.
//
// Given a filename and the raw text of the first OCR'd page, guess the
// `SourceMaterial` fields (year, round, examType, subject, grade, semester,
// school, publisher, title). Output is a *suggestion* — the director can edit
// every field before committing.
//
// Design:
//   - Pure functions, no network, no DB.
//   - Regex-first: Korean exam papers follow a stable vocabulary
//     ("2024학년도 9월 대학수학능력시험 모의평가 영어 영역" 등).
//   - Confidence accumulates per field match (capped at 1.0) so the UI can
//     show "autofill needs review" badges for low-confidence parses.
//   - `computeContentHash` uses sha1 over normalised text for cross-job
//     duplicate detection (SourceMaterial.contentHash).
// ============================================================================

/**
 * SERVER-ONLY — Do NOT import this module from a Client Component.
 *
 * 1. Uses Node's `node:crypto` (`createHash`) which is unavailable in the
 *    browser bundle without a polyfill.
 * 2. The regex set in `extractRound` relies on negative look-behind
 *    (`(?<!모의)수능`, `(?<!모의)수능(?!특강)`). Look-behind breaks on
 *    Safari < 16.4 (iOS 15/16.3 and older) with a SyntaxError at parse time,
 *    taking down the whole page.
 *
 * The bulk-extraction pipeline invokes this only from Next.js API routes and
 * Trigger.dev workers — both Node.js server runtimes — so neither constraint
 * is observable in production. If you ever need metadata parsing in a Client
 * Component, duplicate the field-extraction logic using browser-safe regex
 * (no lookbehind) and factor out `computeContentHash`.
 */
import { createHash } from "node:crypto";

export type SourceMaterialType =
  | "EXAM"
  | "TEXTBOOK"
  | "WORKBOOK"
  | "HANDOUT"
  | "MOCK"
  | "SUNEUNG"
  | "OTHER";

export type SourceSubject = "ENGLISH" | "KOREAN" | "MATH" | "OTHER";
export type SourceSemester = "FIRST" | "SECOND";
export type SourceExamType =
  | "MIDTERM"
  | "FINAL"
  | "MOCK"
  | "SUNEUNG"
  | "DIAGNOSTIC"
  | "EBS"
  | "PRIVATE";

export interface ParsedSourceMeta {
  /** 자동 추천 제목 — 사람이 읽기 좋은 완성형 문자열 */
  title: string;
  type?: SourceMaterialType;
  subject?: SourceSubject;
  grade?: number;
  semester?: SourceSemester;
  year?: number;
  round?: string;
  examType?: SourceExamType;
  publisher?: string;
  schoolName?: string;
  /** 0 ~ 1.0 — 필드가 많이 매칭될수록 증가 */
  confidence: number;
  /** 디버그·토스트용 매칭 근거 */
  rawMatches: Array<{
    field: string;
    value: string;
    source: "filename" | "header";
  }>;
}

export interface ParseSourceMetaInput {
  filename?: string;
  page1Text?: string;
  page1OcrItems?: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

interface MatchAccumulator {
  meta: Partial<ParsedSourceMeta> & { rawMatches: ParsedSourceMeta["rawMatches"] };
  /** 0 ~ 1.0, capped */
  confidence: number;
}

const CONFIDENCE_STRONG = 0.2;
const CONFIDENCE_WEAK = 0.1;

function pushMatch(
  acc: MatchAccumulator,
  field: keyof ParsedSourceMeta,
  value: string | number | undefined,
  source: "filename" | "header",
  weight: number,
) {
  if (value === undefined || value === null || value === "") return;
  acc.meta.rawMatches.push({ field: String(field), value: String(value), source });
  acc.confidence = Math.min(1.0, acc.confidence + weight);
}

function extractYear(text: string): number | undefined {
  const match = text.match(/(20\d{2})\s*(?:학년도|년)?/);
  if (!match) return undefined;
  const year = Number(match[1]);
  if (year < 2000 || year > 2100) return undefined;
  return year;
}

function extractRound(text: string): { round?: string; examType?: SourceExamType } {
  // 수능 / 모평 / 학평 회차
  if (/대학수학능력시험(?!\s*모의평가)/.test(text) || /(?<!모의)수능(?!특강)/.test(text)) {
    return { round: "수능", examType: "SUNEUNG" };
  }
  if (/6\s*월.*(?:모의평가|모평|학력평가|학평)/.test(text) || /6월\s*모의평가/.test(text)) {
    return { round: "6월", examType: "MOCK" };
  }
  if (/9\s*월.*(?:모의평가|모평|학력평가|학평)/.test(text) || /9월\s*모의평가/.test(text)) {
    return { round: "9월", examType: "MOCK" };
  }
  if (/11\s*월.*(?:모의평가|모평)/.test(text)) {
    return { round: "11월", examType: "MOCK" };
  }
  const monthMock = text.match(/(3|4|5|6|7|9|10|11)월\s*(?:전국)?학력평가/);
  if (monthMock) return { round: `${monthMock[1]}월`, examType: "MOCK" };

  // 내신 회차(고등)
  if (/중간고사/.test(text)) return { examType: "MIDTERM", round: "중간" };
  if (/기말고사/.test(text)) return { examType: "FINAL", round: "기말" };

  // 교내 N회고사
  const nthExam = text.match(/(\d+)\s*회\s*고사/);
  if (nthExam) return { round: `${nthExam[1]}회`, examType: "MIDTERM" };

  // 진단평가
  if (/진단평가|진단고사/.test(text)) return { examType: "DIAGNOSTIC", round: "진단" };

  return {};
}

function extractGrade(text: string): number | undefined {
  // "고1", "고2", "중3" 등
  const highShort = text.match(/고\s*([1-3])(?:학년)?/);
  if (highShort) return Number(highShort[1]);
  const midShort = text.match(/중\s*([1-3])(?:학년)?/);
  if (midShort) return Number(midShort[1]);
  const generic = text.match(/([1-6])\s*학년/);
  if (generic) return Number(generic[1]);
  return undefined;
}

function extractSemester(text: string): SourceSemester | undefined {
  if (/1\s*학기/.test(text)) return "FIRST";
  if (/2\s*학기/.test(text)) return "SECOND";
  return undefined;
}

function extractSubject(text: string): SourceSubject | undefined {
  if (/영어(?:\s*영역|\s*Ⅰ|\s*Ⅱ|\s*I|\s*II)?/.test(text) || /\bEnglish\b/i.test(text)) {
    return "ENGLISH";
  }
  if (/국어(?:\s*영역)?/.test(text)) return "KOREAN";
  if (/수학(?:\s*영역|\s*Ⅰ|\s*Ⅱ|\s*I|\s*II)?/.test(text)) return "MATH";
  return undefined;
}

/**
 * Publishers grouped by subject relevance.
 *
 * `common` always applies — public exam authorities and all-subject workbooks.
 * Subject-specific groups are consulted only when the detected subject matches,
 * which prevents "쎈" (math) / "블랙라벨" (math) from leaking into an English
 * passage's metadata when the OCR happens to contain an advert or bundled
 * index page.
 *
 * Ordering inside each group matters: longest / most-specific match first so
 * `.includes()` doesn't short-circuit on a shorter substring (e.g. "수능특강"
 * before "수능").
 */
const PUBLISHERS_COMMON = [
  "한국교육과정평가원",
  "평가원",
  "교육청",
  "EBS",
  "수능특강",
  "수능완성",
  "마더텅",
  "자이스토리",
  "메가스터디",
  "이투스",
  "능률",
  "비상교육",
  "비상",
  "천재교육",
  "천재",
  "동아출판",
  "YBM",
  "지학사",
  "미래엔",
  "좋은책신사고",
  "신사고",
] as const;

const PUBLISHERS_ENGLISH = [
  "리딩파워",
  "리딩튜터",
  "리딩릴레이",
  "해커스",
  "해커스토익",
  "빠바",
  "천일문",
  "그래머존",
  "워드마스터",
] as const;

const PUBLISHERS_MATH = ["블랙라벨", "쎈", "일품", "개념원리", "RPM", "수력충전"] as const;

const PUBLISHERS_KOREAN = ["매3비", "매3문", "매3독", "나비효과", "떠먹는국어문학"] as const;

/**
 * Detect a publisher name in `text`.
 *
 * @param text    header / filename text to search
 * @param subject optional — when provided, only subject-appropriate publishers
 *                plus the common list are considered. Without a subject hint,
 *                only the common list is consulted to avoid cross-subject
 *                false positives ("쎈" matching an English paper because the
 *                school bundled a math sheet).
 */
function extractPublisher(text: string, subject?: SourceSubject): string | undefined {
  const groups: Array<readonly string[]> = [PUBLISHERS_COMMON];
  if (subject === "ENGLISH") {
    groups.push(PUBLISHERS_ENGLISH);
  } else if (subject === "MATH") {
    groups.push(PUBLISHERS_MATH);
  } else if (subject === "KOREAN") {
    groups.push(PUBLISHERS_KOREAN);
  } else {
    // When subject is unknown we still allow the three subject-specific lists —
    // a caller may intentionally parse metadata before the subject is known,
    // and a direct hit on "리딩파워" / "블랙라벨" / "매3비" is itself a strong
    // signal. Subject-aware callers can filter afterwards.
    groups.push(PUBLISHERS_ENGLISH, PUBLISHERS_MATH, PUBLISHERS_KOREAN);
  }

  for (const group of groups) {
    for (const name of group) {
      if (text.includes(name)) return name;
    }
  }
  return undefined;
}

function extractSchool(text: string): string | undefined {
  const match = text.match(/([가-힣A-Za-z0-9]{1,20}?(?:중학교|고등학교|초등학교))/);
  if (match) return match[1];
  return undefined;
}

function inferType(args: {
  examType?: SourceExamType;
  publisher?: string;
  filename?: string;
  text: string;
}): SourceMaterialType | undefined {
  const { examType, publisher, filename, text } = args;
  if (examType === "SUNEUNG") return "SUNEUNG";
  if (examType === "MOCK" || examType === "DIAGNOSTIC") return "MOCK";
  if (examType === "MIDTERM" || examType === "FINAL") return "EXAM";
  if (publisher === "EBS" || publisher === "수능특강" || publisher === "수능완성") {
    return "TEXTBOOK";
  }
  if (/워크북|workbook/i.test(text) || (filename && /workbook/i.test(filename))) {
    return "WORKBOOK";
  }
  if (/프린트|handout|유인물/i.test(text)) return "HANDOUT";
  if (/교재|textbook/i.test(text)) return "TEXTBOOK";
  return undefined;
}

function buildTitle(meta: Partial<ParsedSourceMeta>, rawHeader: string): string {
  // Priority 1: SUNEUNG / 평가원 모평 스타일
  if (meta.year && meta.round && meta.subject === "ENGLISH") {
    const publisher = meta.publisher && meta.publisher !== "EBS" ? meta.publisher : undefined;
    const roundLabel = meta.examType === "SUNEUNG" ? "대학수학능력시험" : `${meta.round} 모의고사`;
    const pub = publisher ? `${publisher} ` : "";
    return `${meta.year}학년도 ${pub}${roundLabel} 영어`.trim();
  }

  // Priority 2: 내신
  if (meta.schoolName && meta.grade && meta.semester) {
    const roundLabel = meta.round ? ` ${meta.round}고사` : "";
    const subject = meta.subject === "ENGLISH" ? "영어" : meta.subject === "KOREAN" ? "국어" : meta.subject === "MATH" ? "수학" : "";
    const sem = meta.semester === "FIRST" ? "1학기" : "2학기";
    const year = meta.year ? `${meta.year}학년도 ` : "";
    return `${year}${meta.schoolName} ${meta.grade}학년 ${sem}${roundLabel} ${subject}`.trim();
  }

  // Priority 3: 교재 (출판사 중심)
  if (meta.publisher) {
    const subject = meta.subject === "ENGLISH" ? "영어" : "";
    return `${meta.publisher} ${subject}`.trim();
  }

  // Priority 4: 첫 줄 fallback
  const firstLine = rawHeader.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length >= 4);
  return firstLine ?? "새 원본 자료";
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export function parseSourceMeta(input: ParseSourceMetaInput): ParsedSourceMeta {
  const filename = input.filename ?? "";
  const page1Text = input.page1Text ?? "";
  const itemsJoined = (input.page1OcrItems ?? []).join("\n");
  const headerText = [page1Text, itemsJoined].filter(Boolean).join("\n");

  const acc: MatchAccumulator = {
    meta: { rawMatches: [] },
    confidence: 0,
  };

  // ── filename pass (weak, high-level hints) ───────────────────────────────
  if (filename) {
    const y = extractYear(filename);
    if (y !== undefined) {
      acc.meta.year = y;
      pushMatch(acc, "year", y, "filename", CONFIDENCE_WEAK);
    }
    const { round, examType } = extractRound(filename);
    if (round) {
      acc.meta.round = round;
      pushMatch(acc, "round", round, "filename", CONFIDENCE_WEAK);
    }
    if (examType) {
      acc.meta.examType = examType;
      pushMatch(acc, "examType", examType, "filename", CONFIDENCE_WEAK);
    }
    const g = extractGrade(filename);
    if (g !== undefined) {
      acc.meta.grade = g;
      pushMatch(acc, "grade", g, "filename", CONFIDENCE_WEAK);
    }
    const sem = extractSemester(filename);
    if (sem) {
      acc.meta.semester = sem;
      pushMatch(acc, "semester", sem, "filename", CONFIDENCE_WEAK);
    }
    const subj = extractSubject(filename);
    if (subj) {
      acc.meta.subject = subj;
      pushMatch(acc, "subject", subj, "filename", CONFIDENCE_WEAK);
    }
    const pub = extractPublisher(filename, acc.meta.subject);
    if (pub) {
      acc.meta.publisher = pub;
      pushMatch(acc, "publisher", pub, "filename", CONFIDENCE_WEAK);
    }
    const school = extractSchool(filename);
    if (school) {
      acc.meta.schoolName = school;
      pushMatch(acc, "schoolName", school, "filename", CONFIDENCE_WEAK);
    }
  }

  // ── header text pass (strong, authoritative) ─────────────────────────────
  if (headerText) {
    const y = extractYear(headerText);
    if (y !== undefined && acc.meta.year === undefined) {
      acc.meta.year = y;
      pushMatch(acc, "year", y, "header", CONFIDENCE_STRONG);
    } else if (y !== undefined) {
      // header confirms filename → extra confidence
      pushMatch(acc, "year", y, "header", CONFIDENCE_WEAK);
    }
    const { round, examType } = extractRound(headerText);
    if (round) {
      acc.meta.round = round;
      pushMatch(acc, "round", round, "header", CONFIDENCE_STRONG);
    }
    if (examType) {
      acc.meta.examType = examType;
      pushMatch(acc, "examType", examType, "header", CONFIDENCE_STRONG);
    }
    const g = extractGrade(headerText);
    if (g !== undefined && acc.meta.grade === undefined) {
      acc.meta.grade = g;
      pushMatch(acc, "grade", g, "header", CONFIDENCE_STRONG);
    }
    const sem = extractSemester(headerText);
    if (sem && acc.meta.semester === undefined) {
      acc.meta.semester = sem;
      pushMatch(acc, "semester", sem, "header", CONFIDENCE_STRONG);
    }
    const subj = extractSubject(headerText);
    if (subj && acc.meta.subject === undefined) {
      acc.meta.subject = subj;
      pushMatch(acc, "subject", subj, "header", CONFIDENCE_STRONG);
    }
    const pub = extractPublisher(headerText, acc.meta.subject);
    if (pub && acc.meta.publisher === undefined) {
      acc.meta.publisher = pub;
      pushMatch(acc, "publisher", pub, "header", CONFIDENCE_STRONG);
    }
    const school = extractSchool(headerText);
    if (school && acc.meta.schoolName === undefined) {
      acc.meta.schoolName = school;
      pushMatch(acc, "schoolName", school, "header", CONFIDENCE_STRONG);
    }
  }

  const type = inferType({
    examType: acc.meta.examType,
    publisher: acc.meta.publisher,
    filename,
    text: headerText,
  });
  if (type) {
    acc.meta.type = type;
    pushMatch(acc, "type", type, "header", CONFIDENCE_WEAK);
  }

  const title = buildTitle(acc.meta, headerText);

  return {
    title,
    type: acc.meta.type,
    subject: acc.meta.subject,
    grade: acc.meta.grade,
    semester: acc.meta.semester,
    year: acc.meta.year,
    round: acc.meta.round,
    examType: acc.meta.examType,
    publisher: acc.meta.publisher,
    schoolName: acc.meta.schoolName,
    confidence: Math.min(1.0, Number(acc.confidence.toFixed(2))),
    rawMatches: acc.meta.rawMatches,
  };
}

/**
 * Content hash for duplicate detection.
 * Takes every page's extracted text, normalises whitespace, joins with a
 * separator, and returns the sha1 hex digest. Same exam uploaded twice (even
 * through slightly different PDFs) tends to produce the same hash because OCR
 * output is stable for identical pixels.
 */
export function computeContentHash(texts: string[]): string {
  const normalised = texts
    .map((t) => (t ?? "").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0)
    .join("\n----\n");
  return createHash("sha1").update(normalised, "utf8").digest("hex");
}
