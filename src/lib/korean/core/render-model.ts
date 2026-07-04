// ============================================================================
// KoRenderModel — 국어 문항 통합 렌더 모델 (KO-DESIGN-SPEC §4)
// ============================================================================
// 26개 유형 전부가 이 모델로 직렬화되고, 렌더 표면 4곳(문항 카드·웹 시험지·
// DOCX·HWPX)은 이 모델 하나만 소비한다. 마커·밑줄·부정발문 밑줄은 여기서
// 1회 처리한다 — 표면별 재구현 금지.
//
// 표기 규약(카탈로그 §4):
//   - 부정발문의 '않은/않는/없는' 에 밑줄(__ __) — 시스템 처리
//   - 3점 이상만 [n점] 표기(수능), 내신 서답형은 전 문항 표기
//   - <보기> 박스: 라벨 "〈 보 기 〉", 지문·보기 박스는 칸 경계 분할 허용
//   - 문학 출처: "- 작가, 「작품」 -" (파트별)
//   - 각주: *어휘 — 지문 박스 하단
// ============================================================================

import { findSpanKo, isNegativeStemKo, underlineNegativeStemKo, normalizeKo } from "./ko-text";
import { buildKoMarkedPassage, type KoMarker } from "./markers";
import { splitKoPassageParts } from "./passage-meta";

export interface KoFootnote {
  term: string;
  gloss: string;
}

// ---------------------------------------------------------------------------
// 자체자료(stimulus) — 화법·작문·매체·국어사 유형의 공통 기반 (수능 35~45 구조)
// ---------------------------------------------------------------------------
// 지문(Passage 테이블)이 아니라 **문항 봉투에 동봉되는 자체 생성 자료**다.
// 행(line) 단위가 관행의 최소 의미 단위: 화자 라벨("학생 1: …")·괄호 지시문
// ("(자료를 가리키며)")·장면 번호("S#1")·중세 자료의 '원문 행 + [현대어 풀이] 행'
// 쌍을 lines 배열의 개별 원소로 보존한다 — 렌더 표면은 행을 병합하지 않는다.

export const KO_STIMULUS_KINDS = [
  "SPEECH_SCRIPT", // 화법 — 발표문 (정형 발표: 도입→자료 제시→마무리, 괄호 지시문 포함)
  "DIALOGUE", //      화법 — 대화·대담·면접 담화
  "DEBATE", //        화법 — 토론 (입론·반대 신문·반론)
  "DRAFT", //         작문 — 학생 초고 (문단 단위 행)
  "PLAN_NOTE", //     작문 — 글쓰기 계획·메모 ('~해야겠다' 종결 항목)
  "MEDIA_SCREEN", //  매체 — 화면 구성 텍스트 목업 (메뉴·댓글·좋아요 등 UI 요소)
  "ARCHAIC_TEXT", //  국어사 — 중세 자료 (원문 행 + '[현대어 풀이] …' 행 쌍 관행)
] as const;
export type KoStimulusKind = (typeof KO_STIMULUS_KINDS)[number];

export interface KoRenderStimulusBlock {
  kind: KoStimulusKind;
  label?: string; // "(가)" | "(나)" | "[자료]" …
  title?: string; // 발표 제목·초고 표제·화면 이름
  /** 마커 병합 완료된 표시용 행 배열 (밑줄은 __ __ 인라인 문법). */
  lines: string[];
  footnotes?: KoFootnote[];
}

export interface KoRenderPassagePart {
  label?: string; // "(가)" | "(나)" | "(다)"
  text: string; // 마커 병합 완료된 표시용 텍스트 (밑줄은 __ __ 인라인 문법)
  sourceLine?: string; // "- 구강, 「북새곡」 -"
  footnotes?: KoFootnote[];
}

export interface KoRenderModel {
  stem: {
    text: string; // 부정어 밑줄(__ __) 처리 완료본
    negative: boolean;
    points?: number; // undefined = 무표기(2점 수능 관행)
    boxedTerms?: string[];
  };
  passage?: { parts: KoRenderPassagePart[] };
  /** 자체자료 블록 — 지문 뒤·<보기> 앞에 렌더(카드·시험지·학생응시 공통). */
  stimulus?: KoRenderStimulusBlock[];
  bogi?: { label: string; lines: string[] };
  options?: { label: string; text: string }[];
  conditionBox?: string[];
  answerFormat: "MC5" | "SHORT" | "ESSAY";
  setDirective?: string; // "[n~m] 다음 글을 읽고 물음에 답하시오."
}

// ---------------------------------------------------------------------------
// 공통 봉투 → 렌더모델 기본 변환 (대부분의 유형 모듈이 이걸 그대로 사용)
// ---------------------------------------------------------------------------

interface EnvelopeLike {
  direction?: unknown;
  options?: unknown;
  bogi?: unknown;
  koStimulus?: unknown;
  markers?: unknown;
  footnotes?: unknown;
  essay?: unknown;
  points?: unknown;
  sourceLine?: unknown;
}

/** 마커 + 대상 표면 — 봉투 markers[].targetSurface (생략 = 'passage'). */
export type KoMarkerWithSurface = KoMarker & { targetSurface?: "passage" | "stimulus" };

export interface BuildRenderModelInput {
  question: Record<string, unknown>;
  passage?: string;
  suppressPassage?: boolean;
  includesPassage: boolean;
  answerFormat: "MC5" | "SHORT" | "ESSAY";
  defaultPoints: number;
  examMode?: "SUNEUNG" | "NAESIN";
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function readMarkers(v: unknown): KoMarkerWithSurface[] {
  if (!Array.isArray(v)) return [];
  const out: KoMarkerWithSurface[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    if (typeof m.family === "string" && typeof m.label === "string" && typeof m.spanText === "string") {
      out.push({
        family: m.family as KoMarker["family"],
        label: m.label,
        spanText: m.spanText,
        occurrenceIndex: typeof m.occurrenceIndex === "number" ? m.occurrenceIndex : undefined,
        surroundingText: typeof m.surroundingText === "string" ? m.surroundingText : undefined,
        targetSurface: m.targetSurface === "stimulus" ? "stimulus" : undefined,
      });
    }
  }
  return out;
}

/**
 * 봉투 koStimulus 필드의 방어적 리더 — kind 규격 밖·행 결손 블록은 조용히
 * 건너뛴다(zod 게이트가 생성 시 이미 차단, 렌더는 비파괴로만 동작).
 * quality/common·렌더 표면이 공용으로 사용한다.
 */
export function readKoStimulusBlocks(v: unknown): KoRenderStimulusBlock[] {
  if (!Array.isArray(v)) return [];
  const out: KoRenderStimulusBlock[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    if (!(KO_STIMULUS_KINDS as readonly string[]).includes(typeof b.kind === "string" ? b.kind : "")) {
      continue;
    }
    const lines = Array.isArray(b.lines)
      ? b.lines.filter((l): l is string => typeof l === "string")
      : [];
    if (lines.length === 0) continue;
    const footnotes = readFootnotes(b.footnotes);
    out.push({
      kind: b.kind as KoStimulusKind,
      label: typeof b.label === "string" && b.label.trim() ? b.label : undefined,
      title: typeof b.title === "string" && b.title.trim() ? b.title : undefined,
      lines,
      footnotes: footnotes.length ? footnotes : undefined,
    });
  }
  return out;
}

function readFootnotes(v: unknown): KoFootnote[] {
  if (!Array.isArray(v)) return [];
  const out: KoFootnote[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;
    if (typeof f.term === "string" && typeof f.gloss === "string") {
      out.push({ term: f.term, gloss: f.gloss });
    }
  }
  return out;
}

export interface KoStimulusBlockAssignment {
  block: KoRenderStimulusBlock;
  /** 검증·병합 공용 표면 — 블록 lines.join("\n"). title 은 표면이 아니다. */
  text: string;
  /** 이 블록에서 해소되는 마커(원배열 순서 보존). */
  markers: KoMarkerWithSurface[];
}

export interface KoStimulusMarkerAssignment {
  perBlock: KoStimulusBlockAssignment[];
  /** 어느 블록 본문(lines)에서도 해소되지 않은 마커 — 게이트가 unresolved 로 차단. */
  unassigned: KoMarkerWithSurface[];
}

/**
 * [KO-TYPES-1] stimulus 마커의 블록 배정 단일 소스 — 렌더 병합
 * (buildDefaultKoRenderModel)과 품질 게이트(quality/common.ts)가 이 함수 하나를
 * 공유해 "검증 표면 = 렌더 표면" 을 구성적으로 보장한다.
 * 표면은 블록별 lines.join("\n") 이고 title 은 포함하지 않는다 — title 에만
 * 존재하는 스팬은 unassigned 로 남아 게이트에서 차단된다(종전에는 게이트가
 * title 포함 합본을 검사해, 렌더에서 소실되는 마커가 통과했다).
 * 복수 블록((가)(나))에서는 해소되는 첫 블록에 배정하고 잔여 목록에서 제거해
 * 마커가 이중 적용되지 않게 한다 — 렌더의 종전 소거 로직과 동일.
 */
export function resolveKoStimulusMarkers(
  blocks: KoRenderStimulusBlock[],
  markers: KoMarkerWithSurface[],
): KoStimulusMarkerAssignment {
  let remaining = markers;
  const perBlock: KoStimulusBlockAssignment[] = blocks.map((block) => {
    const text = block.lines.join("\n");
    if (remaining.length === 0) return { block, text, markers: [] };
    // findSpanKo 는 occurrenceIndex 초과 시 마지막 등장으로 클램프한다 — 배정
    // 판정도 같은 클램프 의미론을 쓴다(게이트가 위치 모호를 별도 차단).
    const applicable = remaining.filter(
      (m) => findSpanKo(text, m.spanText, m.occurrenceIndex ?? 0) !== null,
    );
    if (applicable.length === 0) return { block, text, markers: [] };
    remaining = remaining.filter((m) => !applicable.includes(m));
    return { block, text, markers: applicable };
  });
  return { perBlock, unassigned: remaining };
}

/**
 * 공통 봉투 필드에서 렌더모델을 조립한다. 유형 특화 표시가 필요한 모듈은
 * 반환값을 후가공한다.
 */
export function buildDefaultKoRenderModel(input: BuildRenderModelInput): KoRenderModel {
  const q = input.question as EnvelopeLike;
  const direction = typeof q.direction === "string" ? q.direction : "";
  const negative = isNegativeStemKo(direction);

  // 배점 표기: 수능 = 3점 이상만, 내신 서답형 = 전 문항
  const rawPoints = typeof q.points === "number" ? q.points : input.defaultPoints;
  const showPoints =
    input.examMode === "NAESIN" && input.answerFormat !== "MC5"
      ? true
      : rawPoints >= 3;

  const model: KoRenderModel = {
    stem: {
      text: negative ? underlineNegativeStemKo(direction) : direction,
      negative,
      points: showPoints ? rawPoints : undefined,
    },
    answerFormat: input.answerFormat,
  };

  // 마커 대상 표면 분리 — targetSurface 생략(기존 봉투 전부) = 지문 마킹 (byte 무회귀)
  const allMarkers = readMarkers(q.markers);
  const passageMarkers = allMarkers.filter((m) => m.targetSurface !== "stimulus");
  const stimulusMarkers = allMarkers.filter((m) => m.targetSurface === "stimulus");

  // 지문 (마커 병합 + (가)(나) 파트)
  if (input.includesPassage && input.passage && !input.suppressPassage) {
    const markers = passageMarkers;
    const marked = markers.length
      ? buildKoMarkedPassage(input.passage, markers)
      : normalizeKo(input.passage);
    const parts = splitKoPassageParts(marked).map((p) => ({
      label: p.label,
      text: p.text,
    })) as KoRenderPassagePart[];
    const footnotes = readFootnotes(q.footnotes);
    if (footnotes.length && parts.length) {
      parts[parts.length - 1].footnotes = footnotes;
    }
    const sourceLine = typeof q.sourceLine === "string" ? q.sourceLine : undefined;
    if (sourceLine && parts.length) parts[parts.length - 1].sourceLine = sourceLine;
    model.passage = { parts };
  }

  // 자체자료(stimulus) — 지문과 달리 문항 동봉 자료라 suppressPassage 와 무관하게
  // 항상 포함한다(세트 공유지문 경로에서도 자료는 문항별 자산).
  const stimulusBlocks = readKoStimulusBlocks(q.koStimulus);
  if (stimulusBlocks.length) {
    // [KO-TYPES-1] 블록 배정은 공유 헬퍼(resolveKoStimulusMarkers) — 품질 게이트와
    // 동일 표면·동일 소거 로직이라 검증된 마커는 반드시 같은 블록에 병합된다.
    const { perBlock } = resolveKoStimulusMarkers(stimulusBlocks, stimulusMarkers);
    model.stimulus = perBlock.map(({ block, text, markers }) =>
      markers.length === 0
        ? block
        : { ...block, lines: buildKoMarkedPassage(text, markers).split("\n") },
    );
  }

  // <보기>
  if (q.bogi && typeof q.bogi === "object") {
    const b = q.bogi as Record<string, unknown>;
    const lines = asStringArray(b.lines);
    if (lines.length) {
      model.bogi = {
        label: typeof b.label === "string" && b.label.trim() ? b.label : "보기",
        lines,
      };
    }
  }

  // 선지
  if (input.answerFormat === "MC5" && Array.isArray(q.options)) {
    const options: { label: string; text: string }[] = [];
    for (const raw of q.options) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      if (typeof o.label === "string" && typeof o.text === "string") {
        options.push({ label: o.label, text: o.text });
      }
    }
    if (options.length) model.options = options;
  }

  // 서술형 <조건>
  if (q.essay && typeof q.essay === "object") {
    const conditions = asStringArray((q.essay as Record<string, unknown>).conditions);
    if (conditions.length) model.conditionBox = conditions;
  }

  return model;
}

// ---------------------------------------------------------------------------
// questionText 직렬화 (DB 저장·카드 fallback·검색용 평문)
// ---------------------------------------------------------------------------
// 선지는 절대 포함하지 않는다 — options 컬럼 전용 (passage-policy 의
// questionTextLooksEmbedded 원문자 휴리스틱 회피, 영어 관행과 동일).

export function serializeKoQuestion(model: KoRenderModel): string {
  const parts: string[] = [];
  parts.push(model.stem.text.replace(/__([^_]+)__/g, "$1"));
  if (model.bogi) {
    parts.push(`【${model.bogi.label}】`);
    parts.push(...model.bogi.lines);
  }
  // 【자료】 — 파서 2벌(카드/DOCX parse-question-sections)의 MARKER_MAP 에 기등록된
  // 리터럴 행 그대로 방출한다. label/title 은 마커 행 다음 행으로, 밑줄 마크업은
  // 평문화(마커 라벨 ㉠·ⓐ 는 유지 — 검색·fallback 표시용).
  for (const block of model.stimulus ?? []) {
    parts.push("【자료】");
    const head = [block.label, block.title].filter(Boolean).join(" ");
    if (head) parts.push(head);
    parts.push(...block.lines.map((l) => l.replace(/__([^_]+)__/g, "$1")));
    for (const f of block.footnotes ?? []) parts.push(`*${f.term}: ${f.gloss}`);
  }
  if (model.conditionBox?.length) {
    parts.push("【조건】");
    parts.push(...model.conditionBox.map((c) => `• ${c}`));
  }
  return parts.join("\n").trim();
}
