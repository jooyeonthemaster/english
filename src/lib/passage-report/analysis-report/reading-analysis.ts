import { generateQuestionText } from "@/lib/question-generation-llm";
import type { BuildAnalysisReportPromptInput } from "./prompt";
import type { LlmTextFn, LlmTextResult } from "./resilient-generate";
import { extractJson } from "./generate";
import { readingAnalysisSectionSchema, type ReadingAnalysisDoc } from "./schema";

/**
 * 직독직해 분석본 생성기 — 지문 1개 → 전 문장 슬래시 끊어읽기 + 1:1 직독직해 +
 * 완전해석 + 색상 문법 판서의 멀티페이지 문서(ReadingAnalysisDoc).
 *
 * 스펙 정본: docs/reading-analysis-worksheet-spec.md §1(구조 해부) · §3(스키마) ·
 * §3.1(생성 계약 C1~C7). 패턴 정본은 final-onepage.ts (프롬프트 빌더 + 단일 콜 +
 * 게이트 + 수리 1회 + 데드라인 예산 가드[E29-8]).
 *
 * 파이널과 다른 점 — **장문 2분할 병렬**:
 *  - 이 문서는 교과서 레슨 40~60문장을 수용해야 한다(C6). 문장 카드 하나가
 *    en 2벌(조각+하이라이트)·ko 2벌(직독직해+완전해석)·주석 1~3행을 실으므로
 *    출력 토큰이 문장 수에 정비례한다 — 55문장을 단일 콜에 몰면 출력 한도 절단이
 *    구조적으로 가능하다. 그래서 30문장 초과 시 문장 범위를 반으로 갈라 2콜.
 *  - 2콜은 **병렬**이다. fast 라우트 데드라인(+270s)에서 luna 실측 102~130s 콜을
 *    직렬 2회 돌리면 수리 창이 남지 않는다 — 병렬이면 벽시계 1콜 값으로 끝나고
 *    남은 예산이 세그먼트별 수리(1회)에 돌아간다.
 *  - 각 세그먼트는 자기 범위의 parts 를 스스로 분할한다(소제목이 자기가 실제로
 *    번역한 문장에 근거 — 병합 시 label 만 "본문 N" 으로 재번호). 분할 시 세그먼트당
 *    파트 상한 3 을 게이트로 강제해 병합 문서가 C4-count(≤6)를 절대 넘지 않게 한다.
 */

// ─── env 핀 (generate.ts 관행 — 코드 기본값은 폴백일 뿐, 프로덕션은 env 가 핀) ──
// [26-08-31 모델 확정] 폴백 = gemini-3.7-flash — 사용자 결정 「영어 제미나이 전 경로
// 3.7 통일」(atlas-ai.ts:271 · .env GEMINI_MODEL 주석)에 정합. 레퍼런스 55문장 A/B
// 실측(.tmp-reading-qa/e2e-doc*.json): 3.7-flash 가 벽시계 60s(luna 151s), 게이트 동등
// (blocking 0), 끊어읽기 경계가 레퍼런스와 더 근접, 주석 밀도 우세. ⚠ 기존 학습지
// 계열(WORKSHEET_CORE/INFERENCE·FINAL_ONEPAGE)의 luna 폴백은 별도 축 — 여기서 안 건드림.
// effort 기본 high — xhigh 는 장문 볼륨에서 OpenRouter 비스트리밍 벽(~300s)을 넘길 수
// 있다(코어 엔진과 같은 이유, :62).
const WORKSHEET_READING_MODEL =
  process.env.WORKSHEET_READING_MODEL?.trim() || "google/gemini-3.7-flash";
const WORKSHEET_READING_REASONING_EFFORT =
  process.env.WORKSHEET_READING_REASONING_EFFORT?.trim() || "high";

/** 고정 부제(§3 header.subtitle) — 모델 출력을 믿지 않고 결정론으로 주입한다. */
export const READING_ANALYSIS_SUBTITLE =
  "전 문장 슬래시(/) 구 끊어읽기 & 1:1 직독직해 심층 분석본";

// 2분할 임계 — 30문장까지는 단일 콜(실측: 파이널 원페이지가 ~40문장 지문을 60k
// 예산 단일 콜로 소화하지만, 카드 5층은 문장당 볼륨이 2배 이상이라 상한을 낮춘다).
/** [E2E-2] 세그(콜)당 문장 상한 — 실생성 실측: 28문장 콜 119s / 27문장 콜 200s 타임아웃
 *  (luna 분산). 20문장이면 콜당 200s 상한 안에 안전 여유. (구 SEGMENT_SPLIT_THRESHOLD=30
 *  반분할은 이 실측으로 기각 — planSegments 주석 참조.) */
const SEGMENT_MAX_SENTENCES = 20;
// 콜 1회 상한 — final-onepage 관행(luna 실측 상위 130s + 사고 꼬리 여유).
const BASE_CALL_TIMEOUT_MS = 200_000;
// [E29-8 이식] 완주 불가능한 유료 콜을 쏘지 않는 하한 — luna 실측 하한(102s)+여유.
// 바닥값 Math.max(1_000, …) 을 되살리지 마라 — 이 가드가 걸러낸 「불가능한 콜」을
// 다시 허용하는 구멍으로만 작동한다(final-onepage.ts 원장 참조).
const MIN_CALL_MS = 110_000;
// 출력 예산 — 문장당 실측 산정: 코어 passage 섹션(en+ko 1벌)이 400tok/문장 관행
// (resilient-generate SECTION_MAX_TOKENS.passage 16k/40문장)인데 카드 5층은 en·ko
// 각 2벌 + 주석이라 600tok/문장으로 잡는다. 사고 헤드룸은 luna 실측 12k~17k
// (final-onepage 원장) 위에 여유를 얹은 20k — 사고 토큰이 max_tokens 몫에서 빠진다.
const PER_SENTENCE_OUTPUT_TOKENS = 600;
const REASONING_HEADROOM_TOKENS = 20_000;
const MIN_CONTENT_TOKENS = 8_000;
const MAX_CALL_TOKENS = 80_000;

/**
 * 결정론 문장 스파인 — resilient-generate.ts splitPassageSentences(:316-324)에서
 * 출발했지만 **의도적 분기**다: reading 스파인은 인용부호·약어 보강판(기존 코어는
 * 무회귀 잠금 — 기본 학습지 상품의 문장 번호를 바꾸지 않기 위해 원본은 손대지 않는다).
 * 재사용하지 않고 로컬로 두는 이유 2가지:
 *  1) 원본은 `.slice(0, 40)` 으로 40문장에서 자른다 — 코어 보고서(상호참조 축 ≤60)의
 *     계약이지, 「문장 수 상한 없음」(C6, 55문장 교과서 레슨)인 이 문서엔 치명적이다
 *     (41번째 문장부터 스파인에서 조용히 증발 → C1 이 통과한 채 본문이 잘린다).
 *  2) [F2-M3] 경계 보강 — (a) 닫는 인용부호 뒤 분할: `…"whooping cough." For …` 를
 *     원본 규칙은 병합했다(레퍼런스 55문장이 54로 붕괴, .tmp-reading-qa 실측).
 *     (b) 약어(Mr./Dr./e.g. 등) 뒤 대문자에서 과분할 금지 — 후처리 재병합으로 방어.
 * ⚠ 두 분할기의 문장 번호는 어긋날 수 있다 — 직독직해 문서는 자기 스파인만 쓰므로
 * 문서 내부 정합(C1/C4)은 유지되고, 코어 상품은 기존 규칙 그대로라 무회귀다.
 */
// [F2-M3b] 문장 경계로 취급하지 않는 약어 꼬리 — 이 뒤의 대문자 시작은 재병합한다.
const ABBREVIATION_TAIL_RE = /\b(?:Mr|Mrs|Dr|Ms|St|vs|etc|e\.g|i\.e)\.$/;

export function splitReadingSentences(passageContent: string): string[] {
  const raw = passageContent.replace(/\s+/g, " ").trim();
  // [F2-M3a] 종결부호 뒤 닫는 인용부호(직선·스마트) 1개까지 경계로 인식하고,
  // 다음 문장 머리의 여는 스마트 인용부호도 허용한다.
  const candidates = raw
    .split(/(?<=[.!?]["”’']?)\s+(?=[A-Z"'(“‘])/)
    .map((s) => s.trim())
    .filter(Boolean);
  // [F2-M3b] 약어 꼬리로 끝난 조각은 과분할 — 다음 조각과 재병합.
  const pieces: string[] = [];
  for (const piece of candidates) {
    const prev = pieces[pieces.length - 1];
    if (prev !== undefined && ABBREVIATION_TAIL_RE.test(prev)) {
      pieces[pieces.length - 1] = `${prev} ${piece}`;
    } else {
      pieces.push(piece);
    }
  }
  return pieces.length ? pieces : [raw];
}

// ─── 검증 게이트 (validateReadingDoc) ────────────────────────────────────────
// `.tmp-reading-qa/gate-schema.mjs` 의 TS 이식판 — **같은 규칙·같은 심각도**.
// 규칙을 고치면 mjs 게이트(G1·G5 음성테스트가 이걸 돌린다)도 같이 고쳐라.
// ok = critical 0 && major 0 (minor 는 계측만).

export interface ReadingGateIssue {
  severity: "critical" | "major" | "minor";
  rule: string;
  where: string;
  detail: string;
}

/** C1 비교용 정규화 — 스마트쿼트/대시 통일 + 공백 접기 + 구두점 앞 공백 제거 + 소문자. */
function normalizeC1(t: string): string {
  return t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    .toLowerCase();
}

const MARK_KINDS = new Set(["grammar", "phrase", "connective", "structure"]);

interface SliceGateOpts {
  /** 이 조각(세그먼트)의 첫 문장 전역 번호 — 전체 문서면 1. */
  startNo: number;
  /** 담당 범위의 스파인 원문(순서대로) — C1 축자 대조의 기준. */
  spineSlice: string[];
  /** 세그먼트 2 이후는 header 를 병합 시 버리므로 검사하지 않는다. */
  checkHeader: boolean;
  /** C4-count 기준: 전체 문서 6, 2분할 세그먼트 3(병합 ≤6 보장). */
  maxParts: number;
}

function validateReadingSlice(doc: ReadingAnalysisDoc, opts: SliceGateOpts): ReadingGateIssue[] {
  const issues: ReadingGateIssue[] = [];
  const push = (severity: ReadingGateIssue["severity"], rule: string, where: string, detail: string) =>
    issues.push({ severity, rule, where, detail });

  // 구조 기본 (zod 통과분에도 돌린다 — DB 역직렬화 등 비-zod 경로 방어)
  if (doc.version !== 1) push("critical", "schema", "version", `version=${doc.version}`);
  if (opts.checkHeader) {
    for (const k of ["curriculumBadge", "title", "subtitle"] as const) {
      if (typeof doc.header?.[k] !== "string" || !doc.header[k].trim())
        push("critical", "schema", `header.${k}`, "누락 또는 빈 문자열");
    }
    if (typeof doc.header?.source !== "string")
      push("critical", "schema", "header.source", "source는 문자열(미상이면 빈 문자열)");
  }
  const sentences = doc.sentences ?? [];
  const parts = doc.parts ?? [];
  if (parts.length < 1) push("critical", "schema", "parts", "parts 최소 1개");
  if (sentences.length < 1) push("critical", "schema", "sentences", "sentences 최소 1개");

  // [F2-M2] C1-count: 문장 경계 병합/분할 무음 통과 차단 — 카드 수가 스파인과 다르면
  // 카드↔스파인 1:1 이 깨진 것이다. 병합/분할은 C1 축자(전체 연결 대조)·C4-no(연속
  // 번호)·C4(파트 커버리지)를 전부 통과한다(실측: 3→2 병합·1→2 분할 모두 ok:true).
  // 길이 자체를 critical 로 못 박는다. 파리티: gate-schema.mjs 의 --original-lines.
  if (sentences.length !== opts.spineSlice.length)
    push(
      "critical",
      "C1-count",
      "sentences",
      `문장 카드 ${sentences.length}개 ≠ 스파인 ${opts.spineSlice.length}문장 — 스파인의 문장 경계를 그대로 따라(병합·재분할 금지) 문장당 카드 1개를 만들어라`,
    );

  // 문장 번호 연속성 — 세그먼트는 전역 번호(startNo부터)를 그대로 쓴다.
  sentences.forEach((s, i) => {
    if (s.no !== opts.startNo + i)
      push("critical", "C4-no", `sentences[${i}]`, `no=${s.no}, 기대=${opts.startNo + i} (연속 번호)`);
  });

  // C4: parts 가 담당 범위를 빈틈·중복 없이 분할
  {
    const lastNo = opts.startNo + sentences.length - 1;
    const seen = new Map<number, number>();
    for (const [pi, p] of parts.entries()) {
      if (!Array.isArray(p.sentences) || p.sentences.length === 0) {
        push("critical", "C4", `parts[${pi}]`, "sentences 빈 배열");
        continue;
      }
      for (const no of p.sentences) {
        if (seen.has(no))
          push("critical", "C4", `parts[${pi}]`, `문장 ${no} 중복 (parts[${seen.get(no)}]에도 존재)`);
        seen.set(no, pi);
      }
      const sorted = [...p.sentences].sort((a, b) => a - b);
      for (let k = 1; k < sorted.length; k += 1)
        if (sorted[k] !== sorted[k - 1] + 1)
          push("major", "C4-contiguous", `parts[${pi}]`, `비연속 구간: ${sorted[k - 1]} → ${sorted[k]}`);
    }
    for (let no = opts.startNo; no <= lastNo; no += 1)
      if (!seen.has(no)) push("critical", "C4", "parts", `문장 ${no}가 어떤 파트에도 없음`);
    for (const no of seen.keys())
      if (no < opts.startNo || no > lastNo)
        push("critical", "C4", "parts", `범위 밖 문장 번호 ${no} 참조`);
    if (parts.length > opts.maxParts && sentences.length > 12)
      push("major", "C4-count", "parts", `파트 ${parts.length}개 (허용 ≤${opts.maxParts})`);
  }

  // 문장 단위 검증
  for (const [si, s] of sentences.entries()) {
    const where = `sentences[${si}] (no=${s.no})`;
    if (![0, 1, 2, 3].includes(s.stars)) push("critical", "schema-stars", where, `stars=${s.stars}`);
    if (!Array.isArray(s.chunks) || s.chunks.length < 1) {
      push("critical", "schema-chunks", where, "chunks 최소 1개");
      continue;
    }
    if (typeof s.fullKo !== "string" || !s.fullKo.trim())
      push("critical", "schema-fullKo", where, "fullKo 누락");

    for (const [ci, c] of s.chunks.entries()) {
      const cw = `${where}.chunks[${ci}]`;
      if (typeof c.en !== "string" || !c.en.trim()) push("critical", "schema-chunk-en", cw, "en 누락");
      // C2 프록시: ko 조각 실존 (직역 품질 자체는 검수 에이전트 몫 — mjs 게이트와 동일 범위)
      if (typeof c.ko !== "string" || !c.ko.trim())
        push("critical", "C2", cw, "ko 누락 — 1:1 직독직해 조각 필수");
      if (typeof c.en === "string" && c.en.includes(" / "))
        push("major", "C1-slash", cw, "en 조각 안에 슬래시 구분자 잔존 — 조각화 실패 의심");
      // C3: marks 부분 문자열 실존 (대소문자 포함 일치)
      for (const [mi, m] of (c.marks ?? []).entries()) {
        if (!MARK_KINDS.has(m.kind))
          push("critical", "C3-kind", `${cw}.marks[${mi}]`, `kind=${m.kind}`);
        if (typeof m.text !== "string" || !m.text.trim())
          push("critical", "C3", `${cw}.marks[${mi}]`, "text 누락");
        else if (typeof c.en === "string" && !c.en.includes(m.text))
          push("critical", "C3", `${cw}.marks[${mi}]`, `"${m.text}" 가 en 조각의 부분 문자열이 아님`);
      }
      if ((c.marks ?? []).length > 4)
        push("minor", "C3-density", cw, `marks ${(c.marks ?? []).length}개 — 조각당 과밀(하이라이트 남발)`);
    }

    // [F2-렌즈3] C1-volume: 카드 초대형 절단 방어(소프트 게이트) — en 합산 90단어
    // 초과 또는 조각 20개 초과면 렌더 카드가 페이지 경계에서 잘릴 위험. 이 detail 은
    // 수리 프롬프트에 그대로 실리므로 「조각을 더 잘게, 주석 축약」 지시를 명기한다.
    // 파리티: gate-schema.mjs 동일 규칙.
    {
      const enWords = s.chunks.reduce(
        (n, c) => n + (typeof c.en === "string" ? c.en.trim().split(/\s+/).filter(Boolean).length : 0),
        0,
      );
      if (enWords > 90 || s.chunks.length > 20)
        push(
          "major",
          "C1-volume",
          where,
          `카드 초대형(en 합산 ${enWords}단어 · 조각 ${s.chunks.length}개, 허용 ≤90단어·≤20조각) — 조각을 더 잘게 끊고 주석을 축약해 카드 볼륨을 줄여라`,
        );
    }

    // 하이라이트 밀도 — 색별 문장당 최대 3 (§1.3)
    const byKind: Record<string, number> = { grammar: 0, phrase: 0, connective: 0, structure: 0 };
    for (const c of s.chunks) for (const m of c.marks ?? []) if (byKind[m.kind] !== undefined) byKind[m.kind] += 1;
    for (const [kind, n] of Object.entries(byKind))
      if (n > 3) push("minor", "highlight-density", where, `${kind} 하이라이트 ${n}개 (권장 ≤3)`);

    // notes — 카드당 1~3행이 계약(0행 = major, mjs 게이트와 동일)
    if (!Array.isArray(s.notes) || s.notes.length < 1)
      push("major", "notes-missing", where, "주석 행 0개 (권장 1~3)");
    else {
      if (s.notes.length > 4) push("minor", "notes-count", where, `주석 ${s.notes.length}행 (권장 1~3)`);
      for (const [ni, n] of s.notes.entries()) {
        if (typeof n.label !== "string" || n.label.length < 2 || n.label.length > 12)
          push("major", "notes-label", `${where}.notes[${ni}]`, `label="${n.label}" (2~12자)`);
        if (!["red", "blue"].includes(n.tone))
          push("critical", "notes-tone", `${where}.notes[${ni}]`, `tone=${n.tone}`);
        if (typeof n.text !== "string" || !n.text.trim())
          push("critical", "notes-text", `${where}.notes[${ni}]`, "text 누락");
      }
    }
  }

  // C1: 재조합 원문 축자 대조 — 대괄호는 구조 표시로 삽입 허용(§1.3), 대조 시 제거.
  {
    const rebuilt = sentences.map((s) => (s.chunks ?? []).map((c) => c.en ?? "").join(" ")).join(" ");
    const rb = normalizeC1(rebuilt.replace(/[\[\]]/g, ""));
    const og = normalizeC1(opts.spineSlice.join(" ").replace(/[\[\]]/g, ""));
    if (rb !== og) {
      let k = 0;
      while (k < Math.min(rb.length, og.length) && rb[k] === og[k]) k += 1;
      push(
        "critical",
        "C1",
        "sentences[*].chunks[*].en",
        `재조합 원문 불일치 @${k}: rebuilt="…${rb.slice(Math.max(0, k - 30), k + 30)}…" vs original="…${og.slice(Math.max(0, k - 30), k + 30)}…"`,
      );
    }
  }

  return issues;
}

/**
 * §3.1 C1~C7 전 문서 게이트 — gate-schema.mjs 와 같은 규칙의 TS 이식판.
 * 스파인은 여기서 재계산한다(결정론이라 생성 시점과 항상 동일). fast 라우트의
 * 서버측 품질 게이트(§5.2-8)도 이 함수를 그대로 쓰면 된다.
 */
export function validateReadingDoc(
  doc: ReadingAnalysisDoc,
  passageContent: string,
): { ok: boolean; issues: ReadingGateIssue[] } {
  const spine = splitReadingSentences(passageContent);
  const issues = validateReadingSlice(doc, {
    startNo: 1,
    spineSlice: spine,
    checkHeader: true,
    maxParts: 6,
  });
  const blocking = issues.some((i) => i.severity === "critical" || i.severity === "major");
  return { ok: !blocking, issues };
}

// ─── 프롬프트 ────────────────────────────────────────────────────────────────

export type ReadingAnalysisPromptInput = BuildAnalysisReportPromptInput & {
  /** 지문 제목/출처명 — 있으면 header.title 에 그대로. 없으면 내용 기반 제목(사실 창작 금지). */
  passageTitle?: string | null;
  /** 기존 PRIME 보고서의 vocabulary/grammar 요약(선택) — 주석 품질 컨텍스트로만 쓴다. */
  primeContext?: string;
};

interface SegmentPlan {
  startNo: number; // 1-base, 포함
  endNo: number; // 포함
  segIndex: number;
  segCount: number;
}

function planSegments(total: number): SegmentPlan[] {
  // [E2E-2] 세그당 상한 = SEGMENT_MAX_SENTENCES 균등 N분할. 구판 「30 초과 시 반분할」은
  // 실생성 실측에서 기각됐다 — 레퍼런스 55문장이 28/27 로 갈렸고 28문장 콜 119s,
  // 27문장 콜은 200s 타임아웃(luna 분산). 20문장 콜은 상한 안에 안전.
  const segCount = Math.max(1, Math.ceil(total / SEGMENT_MAX_SENTENCES));
  if (segCount === 1) return [{ startNo: 1, endNo: total, segIndex: 0, segCount: 1 }];
  const size = Math.ceil(total / segCount);
  const out: SegmentPlan[] = [];
  for (let i = 0; i * size < total; i++) {
    out.push({ startNo: i * size + 1, endNo: Math.min(total, (i + 1) * size), segIndex: i, segCount: 0 });
  }
  return out.map((s) => ({ ...s, segCount: out.length }));
}

/** 세그먼트별 파트 개수 지시 — 병합 후 전체 3~6(짧은 지문 1~2, C6)을 보장하는 배분. */
function partGuidance(seg: SegmentPlan, total: number): { text: string; maxParts: number } {
  // [E2E-2] N분할 일반화 — 세그별 상한 floor(6/segCount)면 병합 합계 ≤6 이 보장돼
  // 전 문서 백스톱(validateReadingDoc maxParts 6)과 정합. 2분할 3씩·3분할 2씩.
  if (seg.segCount >= 2) {
    const maxParts = Math.max(1, Math.floor(6 / seg.segCount));
    return { text: maxParts === 1 ? "1개" : `1~${maxParts}개`, maxParts };
  }
  if (total <= 12) return { text: "1~2개", maxParts: 6 };
  return { text: "3~6개", maxParts: 6 };
}

/**
 * 프롬프트 빌더 — §1 구조 해부 + §3.1 C1~C7 을 지시문으로 옮긴 정본.
 * 섹션 프롬프트 관행(section-prompts.ts)대로 「공통 원칙 + 출력 규칙 + JSON 예시 +
 * 지문」 구조. 단 문체 헌장은 코어의 노베이스 '~해요' 체가 아니라 **판서식 간결체**다
 * — 레퍼런스(§1.2 주석 「**표제**: 설명」)가 그 문체이고, 카드 지면이 좁다.
 */
export function buildReadingAnalysisPrompt(
  input: ReadingAnalysisPromptInput,
  spine: string[],
  segment?: SegmentPlan,
): string {
  const total = spine.length;
  const seg = segment ?? { startNo: 1, endNo: total, segIndex: 0, segCount: 1 };
  const level = input.schoolType === "MIDDLE" ? "중학교" : "고등학교";
  const grade = input.grade ? ` ${input.grade}학년` : "";
  const parts = partGuidance(seg, total);
  const rangeLabel = `문장 [${seg.startNo}]~[${seg.endNo}]`;

  const spineBlock = spine
    .slice(seg.startNo - 1, seg.endNo)
    .map((s, i) => `[${seg.startNo + i}] ${s}`)
    .join("\n");

  const titleLine = input.passageTitle?.trim()
    ? `- 제공된 지문 제목: "${input.passageTitle.trim()}" — header.title 에 그대로 쓴다.`
    : `- 지문 제목이 제공되지 않았다 — header.title 은 지문 내용을 요약한 제목으로 짓되, 실존하지 않는 교재명·레슨 번호를 창작하지 마라.`;

  const segmentBlock =
    seg.segCount > 1
      ? `\n# 담당 범위 (분할 생성 — 이 호출은 문서의 일부만 맡는다)
- 이 호출은 ${rangeLabel} 만 분석한다. sentences 에는 이 범위의 카드만 넣고, no 는 아래 스파인의 전역 번호를 그대로 쓴다(1로 리셋 금지).
- parts 도 이 범위만 ${parts.text} 파트로 분할한다(parts[].sentences 에는 이 범위의 번호만).
- header 는 명세대로 채운다(병합 시 첫 호출 것만 쓰지만 필드 누락은 실패다).

# 전체 지문 (문맥 참고용 — 번역·주석의 일관성에만 활용)
"""
${spine.join(" ")}
"""\n`
      : "";

  const primeBlock = input.primeContext?.trim()
    ? `\n# 기존 심층 분석 요약 (참고 — 주석·하이라이트 선정에만 활용, 원문 축자 계약과 무관)
${input.primeContext.trim()}\n`
    : "";

  const extra = input.customPrompt?.trim() ? `\n[강사 추가 지시]\n${input.customPrompt.trim()}\n` : "";

  return `당신은 대한민국 최상위 영어학원에서 직독직해 판서 교재를 만드는 수석 강사다.
아래 지문으로 「전 문장 슬래시(/) 구 끊어읽기 & 1:1 직독직해 심층 분석본」의 문장 카드를 만든다.
대상: ${level}${grade}. 실제 선생님이 원문에 색펜으로 판서한 자료처럼 — 짧고, 정확하고, 문장 구조가 눈에 보이게.

# 절대 원칙 (위반 = 실패)
- **C1 원문 축자**: 각 문장의 chunks[].en 을 공백 1칸으로 이어붙이면 [문장 스파인]의 그 문장과 축자 일치해야 한다. 단어 하나도 바꾸거나 빼지 마라. 문장 경계·번호는 스파인 그대로(재분할·병합 금지). 슬래시 문자를 en 안에 넣지 마라 — 조각의 경계가 곧 슬래시다.
- **C2 1:1 직독직해**: chunks[].ko 는 그 en 조각만의 직역이다. 뒤 조각 내용을 앞당겨 번역하지 말고, 한국어 어순으로 재배열하지 마라 — 원문 순서 그대로 옮기는 것이 "직독직해"다. 끊는 단위는 의미·호흡 단위(전치사구·절 경계·분사구), 문장당 보통 2~6조각(아주 짧은 문장은 1조각 허용).
- **C3 하이라이트 실존**: marks[].text 는 그 조각 en 안에 부분 문자열로 실존해야 한다(대소문자까지 그대로 복사).
- **C4 파트 분할**: parts[].sentences 는 담당 문장 번호 전체를 빈틈·중복 없이 **연속 구간**으로 분할한다. 파트 수는 ${parts.text}.
- **C5 사실 창작 금지**: 출판사·저자·교재명이 입력에 없으면 header.source 는 반드시 빈 문자열 "". 임의의 숫자·고유명사를 지어내지 마라.
- **C7 문법 사실 일치**: notes 는 그 문장에 실존하는 문법 현상만 다룬다. 라벨·해설이 실제 형태와 어긋나면 실패다(능동을 "수동"이라 쓰기, 시제·품사 오기 금지). 출력 전에 어법 라벨만 한 번 더 검산하라 — 학원 자료의 신뢰가 여기서 갈린다.

# 중요도 별점 (stars 0~3)
- ★0 = 평이한 문장. **전체의 절반가량은 ★0 이어야 한다** — 전부 강조하면 강조가 죽는다.
- ★1~2 = 구문·어법 시험 포인트가 있는 문장. ★3 = 킬러 포인트(강조구문·가정법·도치·복합 관계사 등)에만 — 극소수.

# 인라인 하이라이트 (chunks[].marks — kind 의미론)
- grammar(빨강+밑줄)=문법/어법 핵심(시제·수동태·구문 포인트) · phrase(파랑+밑줄)=핵심 표현/어휘/숙어 · connective(황토)=접속사/연결사(as, but, when, though…) · structure(청록)=구조/관계사/분사 수식.
- 구/단어 단위로, 문장당 합계 2~6개, 같은 kind 는 문장당 최대 3개. 남발 금지 — 진짜 급소만.

# 주석 (notes — 카드당 1~3행, 0행 금지)
- label: "어휘" "문법" "표현" "분사구문" "수일치" "관계사" 같은 2~8자 자유 어휘. tone: 문법 계열=red, 어휘/표현 계열=blue.
- text 는 판서식 **평문** — 「표제: 설명」 형식, / 로 최대 2~3개 병기. 예: "bitterly cold: 몹시 추운 / fiercely: 맹렬하게". ⚠ 마크다운 볼드(**) 등 서식 마커 금지 — 콜론 앞 표제는 지면에서 자동으로 굵게 표시된다.
- 설명은 짧고 정확하게, 이 문장의 그 표현 기준으로(일반론·교과서 정의 나열 금지).

# 완전해석 (fullKo)
- 자연스러운 한국어 어순으로 재구성한 완역 한 문장(직독직해 조각과 달리 완결된 자연문).

# 파트 (parts)
- 담당 범위를 의미 단위 ${parts.text} 파트로 나누고, titleKo 에 그 파트 내용을 요약한 한국어 소제목을 짓는다(창작 허용 — 단 지문 내용에 근거). label 은 "본문 1" 부터 순번.

# 표지 (header)
- curriculumBadge: 교육과정/과목 수준 문자열(예: "고등 영어"). 입력에 명시가 없으면 학교급 기준 추정 문자열만 — 개정연도 등 확인 불가한 수치는 넣지 마라.
${titleLine}
- source: 입력에 출처가 없으면 반드시 "" (창작 = 실패). subtitle: "${READING_ANALYSIS_SUBTITLE}" 그대로.

# 출력 규칙
- 반드시 **JSON 객체 하나만** 출력한다. 마크다운 코드펜스·설명 문장을 절대 붙이지 마라.
- **필드 누락 절대 금지**: 명세의 모든 필드를 빠짐없이 채운다.

# 출력 형식 (JSON — 이 모양 그대로)
{
  "kind": "reading-analysis",
  "version": 1,
  "header": { "curriculumBadge": "고등 영어", "title": "지문 제목", "source": "", "subtitle": "${READING_ANALYSIS_SUBTITLE}" },
  "parts": [ { "label": "본문 1", "titleKo": "파트 내용을 요약한 한국어 소제목", "sentences": [${seg.endNo > seg.startNo ? `${seg.startNo}, ${seg.startNo + 1}` : `${seg.startNo}`}] } ],
  "sentences": [
    { "no": ${seg.startNo}, "stars": 0,
      "chunks": [
        { "en": "One evening in late November,", "ko": "11월 말 어느 날 저녁,", "marks": [ { "text": "in late November", "kind": "phrase" } ] },
        { "en": "a cold wind blows fiercely.", "ko": "차가운 바람이 거세게 분다.", "marks": [ { "text": "fiercely", "kind": "grammar" } ] }
      ],
      "fullKo": "11월 말 어느 날 저녁, 차가운 바람이 거세게 분다.",
      "notes": [ { "label": "어휘", "tone": "blue", "text": "fiercely: 맹렬하게, 거세게" } ] }
  ]
}
${segmentBlock}${primeBlock}${extra}
# 문장 스파인 (축자 계약 기준 — 담당 ${rangeLabel})
${spineBlock}

위 명세대로 담당 범위 전 문장의 카드를 담은 JSON 객체 하나만 출력하라.`;
}

// ─── 생성기 ──────────────────────────────────────────────────────────────────

export interface ReadingAnalysisUsage {
  label: string;
  usage: unknown;
  modelId?: string;
  provider?: string;
  /** [F2-렌즈2] 콜 벽시계 소요(ms) — 기본 경로(makeDefaultLlmText)가 채운다.
   *  F1 의 lastCallMs 진단 재료(주입 llmText 는 안 채울 수 있어 optional). */
  durationMs?: number;
}

export type GenerateReadingAnalysisResult =
  | {
      ok: true;
      /** §3 정본 문서 — U0 schema.ts 의 ReadingAnalysisDoc(=reading-analysis 섹션). */
      doc: ReadingAnalysisDoc;
      raw: string;
      usages: ReadingAnalysisUsage[];
      /** 통과했지만 남은 minor 이슈(밀도 초과 등) — 계측·로그용. */
      issues: ReadingGateIssue[];
    }
  | { ok: false; error: string; raw: string; parsed?: unknown; usages: ReadingAnalysisUsage[] };

/** [E2E-1] 쿼트·대시 변형을 접는 1:1(길이 보존) 정규화 — 인덱스 슬라이스 안전의 전제. */
function foldQuotes(t: string): string {
  return t.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-");
}

/**
 * [E2E-1] marks.text 축자 보정 — 실모델이 따옴표·대시를 변형해 써서 C3(부분 문자열
 * 실존)가 깨지는 실측 사고의 원천 봉합(레퍼런스 문장 8 `"whooping cough"` — 수리 콜로도
 * 재발했다). **게이트를 완화하지 않는 이유**: marks 는 렌더러가 en 조각에서 문자열
 * 매칭으로 하이라이트 span 을 감싸는 재료라, 게이트만 풀면 하이라이트가 무음 소실된다.
 * 대신 en 기준 정규화 평면에서 위치를 찾아 marks 쪽을 en 의 실제 자구로 교정하고,
 * 교정 불가면 그 mark 만 버린다(하이라이트 1개 소실 < 문서 전체 실패).
 */
/**
 * [편집표시] notes.text 의 마크다운 볼드 마커(**) 결정론 제거 — 데이터는 평문
 * 「표제: 설명」이 정본이다(콜론 앞 표제는 렌더가 자동 볼드). 마커가 데이터에 남으면
 * 편집 캔버스(contentEditable 평문 관리)에서 `**` 가 그대로 노출된다(사용자 실사이트
 * 신고 실측). 프롬프트가 금지해도 모델이 넣을 수 있어 후처리로 못 박는다.
 */
function stripNoteBoldMarkers(doc: ReadingAnalysisDoc): void {
  for (const s of doc.sentences) {
    for (const n of s.notes) {
      if (n.text.includes("**")) n.text = n.text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*\*/g, "");
    }
  }
}

function repairChunkMarks(doc: ReadingAnalysisDoc): void {
  for (const s of doc.sentences) {
    for (const c of s.chunks) {
      if (!c.marks?.length) continue;
      c.marks = c.marks.filter((m) => {
        if (c.en.includes(m.text)) return true;
        const enFold = foldQuotes(c.en);
        const probe = foldQuotes(m.text);
        // 흔한 변형 2종: 쿼트 자형 상이 / 모델이 앞뒤에 따옴표를 덧붙임
        for (const cand of [probe, probe.replace(/^["']+|["']+$/g, "").trim()]) {
          if (!cand) continue;
          const idx = enFold.indexOf(cand);
          if (idx >= 0) {
            m.text = c.en.slice(idx, idx + cand.length);
            return true;
          }
        }
        return false;
      });
    }
  }
}

function canRecoverJson(raw: string): boolean {
  try {
    JSON.parse(extractJson(raw));
    return true;
  } catch {
    return false;
  }
}

/** 기본 모델 호출 — env 핀 사용. opts(스모크 하네스)가 필드 단위로 이긴다. */
function makeDefaultLlmText(opts?: { modelId?: string; reasoningEffort?: string }): LlmTextFn {
  const modelId = opts?.modelId ?? WORKSHEET_READING_MODEL;
  const reasoningEffort = opts?.reasoningEffort ?? WORKSHEET_READING_REASONING_EFFORT;
  return async ({ prompt, label, maxTokens, timeoutMs, attempt }) => {
    // [F2-렌즈2] 콜 전후 벽시계 시간차 — usage 이벤트 durationMs 로 노출(F1 lastCallMs 재료).
    const startedAt = Date.now();
    const res = await generateQuestionText({
      prompt,
      generationPlan: "STANDARD",
      modelId,
      logPrefix: attempt === 0 ? `READING:${label}` : `READING_REPAIR:${label}`,
      maxRetries: 0,
      // maxTokens 는 호출측에서 사고 헤드룸까지 합산해 넘어온다(주입 llmText 계약 동일).
      maxTokens,
      omitMaxTokens: false,
      responseFormat: "json_object",
      isRecoverableJsonText: canRecoverJson,
      thinkingBudget: 0,
      timeoutMs,
      temperature: 0.15,
      reasoningEffort,
      applyReasoningEffortToGemini: true,
    });
    // durationMs 는 LlmTextResult 계약(resilient-generate) 밖의 확장 필드 — 계약 파일은
    // 무회귀 잠금이라 단언으로 얹고, 소비처(generateSegment)가 optional 로 읽는다.
    return {
      text: res.text,
      usage: res.usage,
      modelId: res.modelId,
      provider: res.provider,
      durationMs: Date.now() - startedAt,
    } as LlmTextResult & { durationMs: number };
  };
}

interface SegmentOutcome {
  ok: boolean;
  doc?: ReadingAnalysisDoc;
  error?: string;
  raw: string;
  parsed?: unknown;
}

/** 세그먼트 1개 생성 — 시도 2회(기본 → priorError 주입 수리 1회). final-onepage 패턴. */
async function generateSegment(args: {
  input: ReadingAnalysisPromptInput;
  spine: string[];
  seg: SegmentPlan;
  llm: LlmTextFn;
  deadlineAt?: number;
  baseTimeoutMs: number;
  maxTokens: number;
  usages: ReadingAnalysisUsage[];
}): Promise<SegmentOutcome> {
  const { input, spine, seg, llm, deadlineAt, baseTimeoutMs, maxTokens, usages } = args;
  const basePrompt = buildReadingAnalysisPrompt(input, spine, seg);
  const label = `reading-${seg.segIndex + 1}/${seg.segCount}`;
  const parts = partGuidance(seg, spine.length);
  let lastFailure = "";
  let lastRaw = "";
  let lastParsed: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    // [E29-8] 완주 불가능한 콜은 쏘지 않는다. 데드라인이 없으면 무동작.
    if (deadlineAt) {
      const remaining = deadlineAt - Date.now();
      if (remaining < MIN_CALL_MS) {
        if (attempt > 0 && !lastFailure) lastFailure = "수리 예산이 남지 않아 재시도를 건너뛰었습니다.";
        break;
      }
    }
    const prompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\n# 재생성 지시\n직전 출력은 아래 기준을 통과하지 못했습니다.\n${lastFailure}\n\n이번에는 위 실패 항목을 전부 수정해서, 같은 담당 범위의 JSON 객체 하나만 다시 생성하세요.`;

    // [E29-8] attempt 0 은 수리 창(MIN_CALL_MS)을 남기고 쓴다 — 남겨도 attempt 0 몫이
    // MIN_CALL_MS 에 못 미치면 예약을 포기하고 전 예산을 몰아준다(단발 기대값 우선).
    let timeoutMs = baseTimeoutMs;
    if (deadlineAt) {
      const remaining = deadlineAt - Date.now();
      const reserved =
        attempt === 0 && remaining - MIN_CALL_MS >= MIN_CALL_MS ? remaining - MIN_CALL_MS : remaining;
      timeoutMs = Math.min(baseTimeoutMs, reserved);
    }

    let text: string;
    try {
      const r = await llm({ prompt, label, maxTokens, timeoutMs, attempt });
      text = r.text;
      // [F2-렌즈2] durationMs 는 기본 경로가 단언으로 얹는 확장 필드 — optional 로 읽는다.
      const durationMs = (r as { durationMs?: unknown }).durationMs;
      usages.push({
        label: attempt === 0 ? label : `${label}#repair`,
        usage: r.usage,
        modelId: r.modelId,
        provider: r.provider,
        ...(typeof durationMs === "number" ? { durationMs } : {}),
      });
    } catch (e) {
      lastFailure = `모델 호출 실패: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    lastRaw = text;

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(text));
    } catch (e) {
      lastFailure = `JSON 파싱 실패: ${String(e)}`;
      continue;
    }
    // 결정론 주입 — kind/version 강제, 고정 부제는 모델 오타를 믿지 않는다(첫 세그먼트가
    // 병합 header 의 주인이므로 여기서 못 박아야 게이트·렌더가 흔들리지 않는다).
    if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      p.kind = "reading-analysis";
      p.version = 1;
      if (p.header && typeof p.header === "object")
        (p.header as Record<string, unknown>).subtitle = READING_ANALYSIS_SUBTITLE;
    }
    lastParsed = parsed;

    const validation = readingAnalysisSectionSchema.safeParse(parsed);
    if (!validation.success) {
      lastFailure = `스키마 검증 실패: ${validation.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" | ")}`;
      continue;
    }

    const doc = validation.data as ReadingAnalysisDoc;
    // [E2E-1] marks 축자 보정 — C3 게이트 이전. 실모델이 따옴표를 변형해 쓰는 실측
    // 사고(레퍼런스 문장 8 `"whooping cough"` C3 실패 → 수리 콜로도 재발)의 원천 봉합.
    repairChunkMarks(doc);
    stripNoteBoldMarkers(doc);
    const issues = validateReadingSlice(doc, {
      startNo: seg.startNo,
      spineSlice: spine.slice(seg.startNo - 1, seg.endNo),
      checkHeader: seg.segIndex === 0,
      maxParts: parts.maxParts,
    });
    const blocking = issues.filter((i) => i.severity !== "minor");
    if (blocking.length > 0) {
      lastFailure = `품질 게이트 실패: ${blocking
        .slice(0, 8)
        .map((i) => `[${i.rule}] ${i.where}: ${i.detail}`)
        .join(" | ")}`;
      lastParsed = doc;
      continue;
    }
    return { ok: true, doc, raw: text };
  }

  return { ok: false, error: lastFailure || "직독직해 세그먼트 생성 실패", raw: lastRaw, parsed: lastParsed };
}

/**
 * 직독직해 분석본 생성 — 문장 스파인 확정 → (장문이면 2분할 병렬) 생성 →
 * 세그먼트별 게이트+수리 1회 → 병합 → 전 문서 게이트 백스톱.
 *
 * @param opts.deadlineAt 호출부(fast 라우트, +270s)가 관리하는 벽시계 데드라인.
 * @param opts.llmText    테스트/특수 경로 주입(resilient-generate LlmTextFn 계약).
 */
export async function generateReadingAnalysisResilient(
  input: ReadingAnalysisPromptInput,
  opts?: {
    deadlineAt?: number;
    /** 모델 실험용 오버라이드(스모크 하네스 전용) — 미지정 시 env 핀 그대로. */
    modelId?: string;
    reasoningEffort?: string;
    /** 콜당 출력 상한 오버라이드(사고 헤드룸 포함 총량). */
    maxTokens?: number;
    timeoutMs?: number;
    llmText?: LlmTextFn;
  },
): Promise<GenerateReadingAnalysisResult> {
  const spine = splitReadingSentences(input.passageContent);
  const segments = planSegments(spine.length);
  const llm = opts?.llmText ?? makeDefaultLlmText(opts);
  const baseTimeoutMs = opts?.timeoutMs ?? BASE_CALL_TIMEOUT_MS;
  const usages: ReadingAnalysisUsage[] = [];

  // 세그먼트 병렬 발사 — 각자 독립 범위라 순서 의존이 없고, 데드라인 예산을 벽시계
  // 1콜 값으로 아낀다(위 파일 헤더 주석의 설계 근거).
  const outcomes = await Promise.all(
    segments.map((seg) =>
      generateSegment({
        input,
        spine,
        seg,
        llm,
        deadlineAt: opts?.deadlineAt,
        baseTimeoutMs,
        maxTokens:
          opts?.maxTokens ??
          Math.min(
            MAX_CALL_TOKENS,
            REASONING_HEADROOM_TOKENS +
              Math.max(MIN_CONTENT_TOKENS, (seg.endNo - seg.startNo + 1) * PER_SENTENCE_OUTPUT_TOKENS),
          ),
        usages,
      }),
    ),
  );

  const failed = outcomes.find((o) => !o.ok);
  if (failed) {
    return { ok: false, error: failed.error ?? "직독직해 생성 실패", raw: failed.raw, parsed: failed.parsed, usages };
  }

  const docs = outcomes.map((o) => o.doc as ReadingAnalysisDoc);
  // 병합 — header 는 첫 세그먼트 소유, parts 는 이어붙인 뒤 label 만 "본문 N" 재번호
  // (모델 번호를 믿지 않는다), sentences 는 전역 no 순서 그대로 이어붙는다.
  const merged: ReadingAnalysisDoc = {
    ...docs[0],
    parts: docs
      .flatMap((d) => d.parts)
      .map((p, i) => ({ ...p, label: `본문 ${i + 1}` })),
    sentences: docs.flatMap((d) => d.sentences),
  };

  // 전 문서 백스톱 — 세그먼트가 각자 통과했으면 병합 실패는 설계상 불가능에 가깝지만
  // (범위 배타·파트 상한 3×2≤6), 병합 코드 회귀를 무음으로 내보내지 않기 위한 최종 게이트.
  const gate = validateReadingDoc(merged, input.passageContent);
  if (!gate.ok) {
    const blocking = gate.issues.filter((i) => i.severity !== "minor");
    return {
      ok: false,
      error: `병합 문서 게이트 실패: ${blocking
        .slice(0, 8)
        .map((i) => `[${i.rule}] ${i.where}: ${i.detail}`)
        .join(" | ")}`,
      raw: outcomes.map((o) => o.raw).join("\n\n"),
      parsed: merged,
      usages,
    };
  }

  return {
    ok: true,
    doc: merged,
    raw: outcomes.map((o) => o.raw).join("\n\n"),
    usages,
    issues: gate.issues, // minor 만 남아 있다 — 로그·계측용
  };
}
